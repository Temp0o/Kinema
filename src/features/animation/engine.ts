/**
 * Playback engine: runs document animations on the live canvas DOM with the
 * Web Animations API.
 *
 * One "session" is active at a time — either the whole page (`playAll`) or a
 * scoped replay (`playNode` / `playSelection`). A session can run or be held
 * paused on a frame (`scrub`). All WAAPI animations of a session share one time
 * origin, so the timeline playhead maps 1:1 to what is on the canvas.
 *
 * Hover previews (`previewTemplate`) live in a separate layer that is created
 * after (and therefore composites over) the session, and is always cancelled
 * completely on `stopPreview()` so no residue is left on elements.
 *
 * Document edits during a session are reconciled (`notifyDocChanged`): changed
 * animations are rebuilt at the current time, removed/disabled ones cancelled.
 */
import type { KAnimation, NodeId } from '@/core/model/types';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { currentRootId } from '@/core/store/actions';
import { getSubtreeIds } from '@/core/model/tree';
import { compileFrames, toWaapiEffect } from '@/core/anim/compile';
import { kebabToCamel } from '@/core/style/style';
import { mirrorEasing } from '@/core/anim/easing';
import { animIterations, isInfiniteAnim } from '@/core/anim/timeline';
import { usesStrokeDraw } from '@/core/anim/svg';
import { usePlayback } from './playbackStore';

const HOLD_MS = 280;

// ─── DOM lookup ───────────────────────────────────────────────────────────

export function canvasRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('.kc-viewport .kc-root') ?? document.querySelector<HTMLElement>('.kc-root');
}

const esc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));

export function elementsForNode(nodeId: NodeId, root: ParentNode | null = canvasRoot()): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(`[data-kid="${esc(nodeId)}"]`)];
}

/** Elements an animation applies to, in stagger order. */
export function animTargets(el: Element, anim: Pick<KAnimation, 'targetSelector' | 'stagger'>): Element[] {
  if (anim.targetSelector) {
    try {
      return [...el.querySelectorAll(anim.targetSelector)];
    } catch {
      return [];
    }
  }
  if (anim.stagger != null) {
    const kids = [...el.children];
    const nodes = kids.filter((c) => c.hasAttribute('data-kid') || c.hasAttribute('data-kmid'));
    const list = nodes.length ? nodes : kids;
    return list.length ? list : [el];
  }
  return [el];
}

function now(): number {
  const t = document.timeline?.currentTime;
  return typeof t === 'number' ? t : performance.now();
}

function safeAnimate(target: Element, keyframes: Keyframe[], timing: KeyframeAnimationOptions): Animation | null {
  try {
    return target.animate(keyframes, timing);
  } catch {
    // invalid easing / value: degrade to linear rather than failing
    try {
      return target.animate(
        keyframes.map((k) => ({ ...k, easing: 'linear' })),
        { ...timing, easing: 'linear' },
      );
    } catch {
      return null;
    }
  }
}

/** Draw-on animations need normalized path lengths; add them temporarily when the markup lacks them. */
function prepareTarget(t: Element, anim: KAnimation, cleanups: (() => void)[]) {
  if (!usesStrokeDraw(anim)) return;
  if (typeof SVGGeometryElement !== 'undefined' && t instanceof SVGGeometryElement && !t.hasAttribute('pathLength')) {
    t.setAttribute('pathLength', '1');
    cleanups.push(() => t.removeAttribute('pathLength'));
  }
}

// ─── Looping preview effect ─────────────────────────────────────────────────

const camelDecls = (decls: Record<string, string>) => {
  const o: Record<string, string> = {};
  for (const [k, v] of Object.entries(decls)) o[k.startsWith('--') ? k : kebabToCamel(k)] = v;
  return o;
};

/** Hover-triggered animations preview as in → out so both directions read. */
export function previewVariant(anim: KAnimation): KAnimation {
  if (anim.trigger === 'hover' && !isInfiniteAnim(anim) && anim.iterations <= 1 && anim.direction === 'normal') return { ...anim, iterations: 2, direction: 'alternate' };
  return anim;
}

/**
 * A self-contained, endlessly looping effect for previews/thumbnails: finite
 * animations are unrolled (iterations + direction) into one cycle followed by a
 * hold, so entrances replay with a pause instead of snapping. Missing start/end
 * values are filled from `el`'s computed style.
 */
export function loopedEffect(
  anim: KAnimation,
  opts: { lead?: number; maxLead?: number; gap?: number; el?: Element | null; maxIterations?: number } = {},
): { keyframes: Keyframe[]; timing: KeyframeAnimationOptions } {
  const lead = opts.lead ?? 0;
  if (isInfiniteAnim(anim)) {
    const eff = toWaapiEffect(anim);
    return { keyframes: eff.keyframes, timing: { ...eff.timing, delay: lead, fill: 'both', iterations: Infinity } };
  }
  const base = anim.easing || 'ease';
  const fs = compileFrames(anim).map((f) => ({ offset: f.offset, easing: f.easing || base, decls: { ...f.decls } }));
  if (!fs.length) return toWaapiEffect(anim);
  if (fs[0].offset > 0) fs.unshift({ offset: 0, easing: base, decls: {} });
  if (fs[fs.length - 1].offset < 1) fs.push({ offset: 1, easing: 'linear', decls: {} });
  const props = new Set(fs.flatMap((f) => Object.keys(f.decls)));
  const cs = opts.el && typeof getComputedStyle !== 'undefined' ? getComputedStyle(opts.el) : null;
  for (const p of props) {
    for (const f of [fs[0], fs[fs.length - 1]]) {
      if (f.decls[p] !== undefined) continue;
      const v = cs?.getPropertyValue(p);
      if (v) f.decls[p] = v;
    }
  }
  const iters = Math.max(1, Math.min(opts.maxIterations ?? 3, animIterations(anim)));
  const dur = Math.max(1, anim.duration);
  const maxLead = Math.max(lead, opts.maxLead ?? lead);
  const gap = opts.gap ?? 700;
  const cycle = maxLead + iters * dur + gap;
  const out: Keyframe[] = [];
  let lastOffset = 0;
  const push = (t: number, decls: Record<string, string>, easing: string) => {
    const offset = Math.max(lastOffset, Math.min(1, t / cycle));
    lastOffset = offset;
    out.push({ offset, easing, ...camelDecls(decls) } as Keyframe);
  };
  const dir = anim.direction;
  let firstDecls: Record<string, string> | null = null;
  for (let i = 0; i < iters; i++) {
    const rev = dir === 'reverse' || (dir === 'alternate' && i % 2 === 1) || (dir === 'alternate-reverse' && i % 2 === 0);
    const seq = rev
      ? [...fs].reverse().map((f, j, arr) => ({ offset: 1 - f.offset, decls: f.decls, easing: j < arr.length - 1 ? mirrorEasing(arr[j + 1].easing) : 'linear' }))
      : fs;
    if (!firstDecls) firstDecls = seq[0].decls;
    for (const f of seq) push(lead + i * dur + f.offset * dur, f.decls, f.easing);
  }
  if (lead > 0 && firstDecls) out.unshift({ offset: 0, easing: 'linear', ...camelDecls(firstDecls) } as Keyframe);
  const last = out[out.length - 1];
  last.easing = 'linear';
  if ((last.offset ?? 1) < 1) out.push({ ...last, offset: 1 });
  return { keyframes: out, timing: { duration: cycle, iterations: Infinity, easing: 'linear', fill: 'both' } };
}

// ─── Sessions ─────────────────────────────────────────────────────────────

interface Job {
  key: string;
  nodeId: NodeId;
  anim: KAnimation;
  el: HTMLElement;
}

interface Entry {
  job: Job;
  animations: Animation[];
  targets: Element[];
  cleanups: (() => void)[];
  /** session time when this entry finishes (Infinity for infinite) */
  end: number;
}

interface Session {
  kind: 'all' | 'node';
  scope: NodeId[] | null;
  animId: string | null;
  entries: Map<string, Entry>;
  origin: number;
  paused: boolean;
  pausedAt: number;
  /** Stop infinite replays after this many ms (edit replays). */
  cap: number | null;
}

let session: Session | null = null;
let raf = 0;
let syncQueued = false;

function collectJobs(scope: NodeId[] | null, animId: string | null): Job[] {
  const root = canvasRoot();
  const rootId = currentRootId();
  if (!root || !rootId) return [];
  const doc = useDoc.getState().doc;
  const ids = scope ?? getSubtreeIds(doc.nodes, rootId);
  const jobs: Job[] = [];
  for (const nodeId of ids) {
    const n = doc.nodes[nodeId];
    if (!n || n.hidden) continue;
    for (const a of n.animations ?? []) {
      if (a.enabled === false || (animId && a.id !== animId)) continue;
      elementsForNode(nodeId, root).forEach((el, i) => jobs.push({ key: `${nodeId}|${a.id}|${i}`, nodeId, anim: a, el }));
    }
    // animations defined inside a component master play on its instances
    if (!animId && n.type === 'instance' && n.props.componentId) {
      const comp = doc.components[n.props.componentId];
      if (!comp) continue;
      for (const mid of getSubtreeIds(doc.nodes, comp.rootId)) {
        for (const a of doc.nodes[mid]?.animations ?? []) {
          if (a.enabled === false) continue;
          root
            .querySelectorAll<HTMLElement>(`[data-kmid="${esc(mid)}"][data-kinst="${esc(nodeId)}"]`)
            .forEach((el, i) => jobs.push({ key: `${nodeId}>${mid}|${a.id}|${i}`, nodeId: mid, anim: a, el }));
        }
      }
    }
  }
  return jobs;
}

function createEntry(job: Job): Entry {
  const targets = animTargets(job.el, job.anim);
  const stagger = Math.max(0, job.anim.stagger ?? 0);
  const animations: Animation[] = [];
  const cleanups: (() => void)[] = [];
  targets.forEach((t, i) => {
    prepareTarget(t, job.anim, cleanups);
    const { keyframes, timing } = toWaapiEffect(job.anim, i * stagger);
    const a = safeAnimate(t, keyframes, { ...timing, id: `kinema:${job.nodeId}:${job.anim.id}` });
    if (a) animations.push(a);
  });
  const end = isInfiniteAnim(job.anim)
    ? Infinity
    : job.anim.delay + stagger * Math.max(0, targets.length - 1) + job.anim.duration * animIterations(job.anim);
  return { job, animations, targets, cleanups, end };
}

function cancelEntry(e: Entry) {
  for (const a of e.animations) {
    try {
      a.cancel();
    } catch {
      /* detached */
    }
  }
  e.cleanups.forEach((c) => c());
  e.animations = [];
  e.cleanups = [];
}

function clockEntry(s: Session, e: Entry) {
  for (const a of e.animations) {
    if (s.paused) {
      a.pause();
      a.currentTime = s.pausedAt;
    } else {
      if (a.playState === 'paused') a.play();
      a.startTime = s.origin;
    }
  }
}

function sessionEnd(s: Session): number {
  let end = 0;
  for (const e of s.entries.values()) end = Math.max(end, e.end);
  return end;
}

function publish(time?: number) {
  const s = session;
  usePlayback.setState({
    playing: !!s && !s.paused,
    paused: !!s && s.paused,
    scope: s?.scope ?? null,
    ...(time !== undefined ? { time } : {}),
  });
}

function tick() {
  raf = 0;
  const s = session;
  if (!s || s.paused) return;
  const t = now() - s.origin;
  const end = sessionEnd(s);
  const limit = s.cap != null ? Math.min(end, s.cap) : end;
  if (t >= limit + HOLD_MS) {
    if (s.kind === 'all' && usePlayback.getState().loop && Number.isFinite(limit)) {
      s.origin = now();
      for (const e of s.entries.values()) clockEntry(s, e);
    } else {
      stopAll();
      return;
    }
  }
  usePlayback.setState({ time: Math.max(0, now() - s.origin) });
  raf = requestAnimationFrame(tick);
}

function startLoop() {
  if (!raf) raf = requestAnimationFrame(tick);
}

function startSession(opts: { kind: Session['kind']; scope: NodeId[] | null; animId?: string | null; from?: number; paused?: boolean; cap?: number | null }): boolean {
  endSession();
  const s: Session = {
    kind: opts.kind,
    scope: opts.scope,
    animId: opts.animId ?? null,
    entries: new Map(),
    origin: 0,
    paused: !!opts.paused,
    pausedAt: Math.max(0, opts.from ?? 0),
    cap: opts.cap ?? null,
  };
  for (const job of collectJobs(s.scope, s.animId)) s.entries.set(job.key, createEntry(job));
  if (!s.entries.size) {
    publish(opts.paused ? s.pausedAt : 0);
    return false;
  }
  session = s;
  s.origin = now() - s.pausedAt;
  for (const e of s.entries.values()) clockEntry(s, e);
  publish(s.pausedAt);
  if (!s.paused) startLoop();
  return true;
}

function endSession() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (session) for (const e of session.entries.values()) cancelEntry(e);
  session = null;
}

// ─── Public API ───────────────────────────────────────────────────────────

/** Play every animation on the current page (or only `scope` nodes) from `from` ms. */
export function playAll(scope?: NodeId[] | null, opts: { from?: number } = {}): boolean {
  cancelReplay();
  const sc = scope && scope.length ? scope : null;
  return startSession({ kind: sc ? 'node' : 'all', scope: sc, from: opts.from ?? 0 });
}

/** Play one node's animations (or a single animation) once. */
export function playNode(nodeId: NodeId, animId?: string, opts: { cap?: number | null } = {}): boolean {
  cancelReplay();
  return startSession({ kind: 'node', scope: [nodeId], animId: animId ?? null, cap: opts.cap ?? null });
}

export function playSelection(): boolean {
  const sel = useUI.getState().selection;
  return playAll(sel.length ? sel : null);
}

/** Cancel everything — elements return to their static styles. */
export function stopAll() {
  cancelReplay();
  endSession();
  publish(0);
}

export function togglePlayAll() {
  if (isPlaying()) stopAll();
  else playAll();
}

/** Hold the current session on its current frame. */
export function pause() {
  const s = session;
  if (!s || s.paused) return;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  s.pausedAt = Math.max(0, now() - s.origin);
  s.paused = true;
  for (const e of s.entries.values()) clockEntry(s, e);
  publish(s.pausedAt);
}

/** Continue a paused session (from its held time), or play the page from the playhead. */
export function resume() {
  const s = session;
  if (!s) {
    const t = usePlayback.getState().time;
    playAll(null, { from: t > 0 ? t : 0 });
    return;
  }
  if (!s.paused) return;
  const end = sessionEnd(s);
  if (Number.isFinite(end) && s.pausedAt >= end) s.pausedAt = 0;
  s.paused = false;
  s.origin = now() - s.pausedAt;
  for (const e of s.entries.values()) clockEntry(s, e);
  publish(s.pausedAt);
  startLoop();
}

/** Show the whole page frozen at `timeMs` (drives the timeline playhead). */
export function scrub(timeMs: number) {
  cancelReplay();
  const t = Math.max(0, timeMs);
  const s = session;
  if (!s || s.kind !== 'all') {
    startSession({ kind: 'all', scope: null, paused: true, from: t });
    usePlayback.setState({ time: t });
    return;
  }
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  s.paused = true;
  s.pausedAt = t;
  for (const e of s.entries.values()) clockEntry(s, e);
  publish(t);
}

export function isPlaying(): boolean {
  return !!session && !session.paused;
}

export function hasSession(): boolean {
  return !!session;
}

/** Debug/test info about the running session. */
export function sessionInfo() {
  const s = session;
  if (!s) return null;
  let animations = 0;
  for (const e of s.entries.values()) animations += e.animations.length;
  return { kind: s.kind, paused: s.paused, entries: s.entries.size, animations, end: sessionEnd(s) };
}

/** Reconcile the session with the document after an edit / undo (next frame, after React commits). */
export function notifyDocChanged() {
  if (!session || syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    syncSession();
  });
}

function syncSession() {
  const s = session;
  if (!s) return;
  const jobs = collectJobs(s.scope, s.animId);
  const seen = new Set<string>();
  for (const job of jobs) {
    seen.add(job.key);
    const e = s.entries.get(job.key);
    if (e && e.job.anim === job.anim && e.job.el === job.el && e.job.el.isConnected && e.targets.every((t) => t.isConnected)) continue;
    if (e) cancelEntry(e);
    const ne = createEntry(job);
    s.entries.set(job.key, ne);
    clockEntry(s, ne);
  }
  for (const [k, e] of s.entries) {
    if (seen.has(k)) continue;
    cancelEntry(e);
    s.entries.delete(k);
  }
  if (!s.entries.size && !s.paused) stopAll();
}

// ─── Edit replays ─────────────────────────────────────────────────────────

let replayTimer: ReturnType<typeof setTimeout> | null = null;

function cancelReplay() {
  if (replayTimer) clearTimeout(replayTimer);
  replayTimer = null;
}

/**
 * Replay one animation shortly after an edit (debounced). While the timeline is
 * holding a frame, the held frame is refreshed instead (the doc sync does it).
 */
export function scheduleReplay(nodeId: NodeId, animId: string, delay = 150) {
  if (replayTimer) clearTimeout(replayTimer);
  replayTimer = setTimeout(() => {
    replayTimer = null;
    if (session?.paused && session.kind === 'all') return;
    const anim = useDoc.getState().doc.nodes[nodeId]?.animations?.find((a) => a.id === animId);
    if (!anim || anim.enabled === false) return;
    const cap = isInfiniteAnim(anim) ? anim.delay + Math.max(anim.duration * 2, 3000) : null;
    // playNode cancels pending replays; keep the timer cleared before calling it
    startSession({ kind: 'node', scope: [nodeId], animId, cap });
  }, delay);
}

// ─── Hover previews ───────────────────────────────────────────────────────

let preview: { animations: Animation[]; cleanups: (() => void)[] } | null = null;

/** Loop a (not yet applied) animation on nodes until `stopPreview()`. */
export function previewTemplate(nodeIds: NodeId[], anim: KAnimation) {
  stopPreview();
  const root = canvasRoot();
  if (!root) return;
  const variant = previewVariant(anim);
  const animations: Animation[] = [];
  const cleanups: (() => void)[] = [];
  const stagger = Math.max(0, anim.stagger ?? 0);
  for (const id of nodeIds) {
    for (const el of elementsForNode(id, root)) {
      const targets = animTargets(el, anim);
      const maxLead = stagger * Math.max(0, targets.length - 1);
      targets.forEach((t, i) => {
        prepareTarget(t, anim, cleanups);
        const eff = loopedEffect(variant, { lead: i * stagger, maxLead, el: t, gap: 650 });
        const a = safeAnimate(t, eff.keyframes, { ...eff.timing, id: 'kinema:preview' });
        if (a) animations.push(a);
      });
    }
  }
  preview = { animations, cleanups };
}

export function stopPreview() {
  if (!preview) return;
  for (const a of preview.animations) {
    try {
      a.cancel();
    } catch {
      /* ignore */
    }
  }
  preview.cleanups.forEach((c) => c());
  preview = null;
}

export function isPreviewing(): boolean {
  return !!preview;
}

export const engine = {
  playAll,
  playNode,
  playSelection,
  stopAll,
  togglePlayAll,
  pause,
  resume,
  scrub,
  previewTemplate,
  stopPreview,
  scheduleReplay,
  notifyDocChanged,
  get isPlaying() {
    return isPlaying();
  },
  get hasSession() {
    return hasSession();
  },
  sessionInfo,
};
