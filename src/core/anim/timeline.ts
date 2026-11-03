/**
 * Pure timeline math: spans, ruler ticks, snapping, time formatting and value
 * interpolation for inserting keyframes. Shared by the timeline UI, the Animate
 * panel and unit tests.
 */
import { colord } from 'colord';
import type { KAnimation, Keyframe, KeyframeValues } from '../model/types';
import { TRANSFORM_CHANNELS, isTransformChannel, normalizeKeyframes } from './compile';
import { easingFunction } from './easing';

export function isInfiniteAnim(anim: Pick<KAnimation, 'iterations' | 'trigger'>): boolean {
  return anim.iterations < 0 || anim.trigger === 'loop';
}

export function animIterations(anim: Pick<KAnimation, 'iterations' | 'trigger'>): number {
  return isInfiniteAnim(anim) ? Infinity : Math.max(1, anim.iterations || 1);
}

export interface AnimSpan {
  /** delay (ms) */
  start: number;
  /** end of the first target's iterations (Infinity when infinite) */
  end: number;
  /** extra ms added by staggering the last target */
  staggerExtra: number;
  iterations: number;
}

export function animSpan(anim: KAnimation, targets = 1): AnimSpan {
  const iterations = animIterations(anim);
  const staggerExtra = (anim.stagger ?? 0) * Math.max(0, targets - 1);
  return { start: anim.delay, end: anim.delay + anim.duration * iterations, staggerExtra, iterations };
}

/** Length (ms) the timeline should show for a set of animations (infinite ones show two cycles). */
export function contentDuration(anims: KAnimation[], min = 2000): number {
  let end = 0;
  for (const a of anims) {
    const s = animSpan(a, 3);
    const e = Number.isFinite(s.end) ? s.end + s.staggerExtra : a.delay + a.duration * 2 + s.staggerExtra;
    end = Math.max(end, e);
  }
  return Math.max(min, end);
}

// ─── Ruler ─────────────────────────────────────────────────────────────────

const STEPS = [10, 20, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000];

/** Major/minor tick spacing (ms) so major ticks are at least `minPx` apart. */
export function chooseTickStep(pxPerMs: number, minPx = 80): { major: number; minor: number } {
  const major = STEPS.find((s) => s * pxPerMs >= minPx) ?? STEPS[STEPS.length - 1];
  const sub = major === 250 || major === 2000 || major === 20000 ? 4 : major === 200 || major === 20 ? 4 : 5;
  return { major, minor: major / sub };
}

export interface Tick {
  t: number;
  major: boolean;
  label?: string;
}

export function buildTicks(endMs: number, pxPerMs: number, minPx = 80): Tick[] {
  const { major, minor } = chooseTickStep(pxPerMs, minPx);
  const out: Tick[] = [];
  const n = Math.ceil(endMs / minor);
  for (let i = 0; i <= n; i++) {
    const t = Math.round(i * minor * 1000) / 1000;
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    out.push({ t, major: isMajor, label: isMajor ? formatTick(t, major) : undefined });
  }
  return out;
}

/** Ruler label: whole seconds as "1s", sub-second steps as "0.25s" / "250ms". */
export function formatTick(ms: number, step: number): string {
  if (ms === 0) return '0';
  if (step >= 1000) return `${Math.round(ms / 100) / 10}s`;
  if (step < 100) return ms % 1000 === 0 ? `${ms / 1000}s` : `${Math.round(ms)}ms`;
  const s = ms / 1000;
  const dec = step % 100 === 0 ? 1 : 2;
  return `${Number.isInteger(s) ? s : s.toFixed(dec)}s`;
}

/** Playhead readout: "00:01.250". */
export function formatTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const r = t % 1000;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

/** Short duration label: 600ms, 1.2s */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '∞';
  return ms >= 1000 ? `${Math.round(ms / 100) / 10}s` : `${Math.round(ms)}ms`;
}

// ─── Snapping ────────────────────────────────────────────────────────────────

/**
 * Snap a keyframe offset (0..1) to `step` increments, or to `targets` (e.g. the
 * playhead's offset) when within `threshold`. Targets win over the grid.
 */
export function snapOffset(offset: number, opts: { step?: number; targets?: number[]; threshold?: number; free?: boolean } = {}): number {
  const o = Math.min(1, Math.max(0, offset));
  if (opts.free) return Math.round(o * 1000) / 1000;
  const threshold = opts.threshold ?? 0.02;
  for (const t of opts.targets ?? []) if (t >= 0 && t <= 1 && Math.abs(t - o) <= threshold) return Math.round(t * 1000) / 1000;
  const step = opts.step ?? 0.05;
  return Math.min(1, Math.max(0, Math.round(Math.round(o / step) * step * 1000) / 1000));
}

/** Snap a time (ms) to a grid, or to targets within `threshold` ms. */
export function snapTime(ms: number, opts: { grid?: number; targets?: number[]; threshold?: number; free?: boolean } = {}): number {
  const v = Math.max(0, ms);
  if (opts.free) return Math.round(v);
  const threshold = opts.threshold ?? 0;
  let best: number | null = null;
  for (const t of opts.targets ?? []) if (Math.abs(t - v) <= threshold && (best == null || Math.abs(t - v) < Math.abs(best - v))) best = t;
  if (best != null) return Math.max(0, Math.round(best));
  const grid = opts.grid ?? 10;
  return Math.max(0, Math.round(v / grid) * grid);
}

/** Offset (0..1) within one iteration for a time on the timeline (time measured from animation start incl. delay). */
export function timeToOffset(anim: Pick<KAnimation, 'delay' | 'duration'>, timeMs: number): number {
  const local = (timeMs - anim.delay) / Math.max(1, anim.duration);
  return Math.min(1, Math.max(0, local));
}

// ─── Interpolation ──────────────────────────────────────────────────────────

const NUM_RE = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

function asNumber(v: string | number): number | null {
  if (typeof v === 'number') return v;
  const s = v.trim();
  return /^-?\d*\.?\d+$/.test(s) ? parseFloat(s) : null;
}

/** Interpolate two keyframe values (numbers, colors, or strings sharing a numeric skeleton). */
export function interpolateValue(a: string | number, b: string | number, t: number): string | number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na != null && nb != null) {
    const v = round(na + (nb - na) * t);
    return typeof a === 'number' || typeof b === 'number' ? v : String(v);
  }
  const sa = String(a).trim();
  const sb = String(b).trim();
  const ca = colord(sa);
  const cb = colord(sb);
  if (ca.isValid() && cb.isValid() && !/\d\s*(px|%|deg|em|rem)/i.test(sa + sb)) {
    const x = ca.toRgb();
    const y = cb.toRgb();
    const c = colord({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t, a: x.a + (y.a - x.a) * t });
    return c.alpha() < 1 ? c.toRgbString() : c.toHex();
  }
  const skA = sa.replace(NUM_RE, '#');
  const skB = sb.replace(NUM_RE, '#');
  if (skA === skB) {
    const nbs = sb.match(NUM_RE) ?? [];
    let i = 0;
    return sa.replace(NUM_RE, (m) => {
      const x = parseFloat(m);
      const y = parseFloat(nbs[i++] ?? m);
      return String(round(x + (y - x) * t, 2));
    });
  }
  return t < 0.5 ? a : b;
}

/**
 * Values at `offset` (0..1) for the properties set by the neighbouring
 * keyframes, eased with the segment's timing function. Used when inserting a
 * keyframe so the motion doesn't change.
 */
export function valuesAt(anim: Pick<KAnimation, 'keyframes' | 'easing'>, offset: number): KeyframeValues {
  const kfs = normalizeKeyframes(anim.keyframes);
  if (!kfs.length) return {};
  let prev: Keyframe | undefined;
  let next: Keyframe | undefined;
  for (const k of kfs) {
    if (k.offset <= offset) prev = k;
    if (k.offset >= offset && !next) next = k;
  }
  if (!prev) return { ...(next ?? kfs[0]).values };
  if (!next) return { ...prev.values };
  const keys = new Set([...Object.keys(prev.values), ...Object.keys(next.values)]);
  const ease = easingFunction(prev.easing || anim.easing);
  const out: KeyframeValues = {};
  for (const key of keys) {
    // find the nearest keyframes that actually define this property
    const before = [...kfs].reverse().find((k) => k.offset <= offset && k.values[key] !== undefined);
    const after = kfs.find((k) => k.offset >= offset && k.values[key] !== undefined);
    const identity = isTransformChannel(key) ? TRANSFORM_CHANNELS[key] : undefined;
    const a = before?.values[key] ?? identity ?? after?.values[key];
    const b = after?.values[key] ?? identity ?? before?.values[key];
    if (a === undefined || b === undefined) continue;
    const from = before?.offset ?? 0;
    const to = after?.offset ?? 1;
    const local = to > from ? (offset - from) / (to - from) : 0;
    out[key] = interpolateValue(a, b, ease(local));
  }
  return out;
}
