/**
 * Applying AI results to the document. Every function produces exactly one
 * undo step flagged `{ ai: true }` and labelled `✨ AI: <prompt summary>`.
 */
import type { KDocument, KNode, NodeId, StyleMap } from '../model/types';
import { createNode, uid } from '../model/factory';
import { deepClone, getSubtreeIds, insertSubtree, pruneDescendants, removeNode, sortByTreeOrder } from '../model/tree';
import { docApi, useDoc } from '../store/docStore';
import { uiApi } from '../store/uiStore';
import { currentRootId, insertionTarget } from '../store/actions';
import { isFlexOrGrid, resolveStyles } from '../style/style';
import type { HtmlImportResult } from '../io/htmlImport';
import type { ValidatedAnimation } from './animSpec';
import { cleanSvgRoot, restoreSrcMap, type SerializedSubtree } from './serialize';
import { svgDisplaySize, uniquifySvgIds } from './svg';
import { summarizePrompt } from './text';

export function aiLabel(prompt: string, fallback = 'Generate'): string {
  return `✨ AI: ${summarizePrompt(prompt) || fallback}`;
}

function lastHistoryId(): number | undefined {
  const p = useDoc.getState().past;
  return p[p.length - 1]?.id;
}

const nextFrame = () =>
  new Promise<void>((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));

/** View center + size of a parent element, in the parent's local CSS px. */
function viewGeometry(parentId: NodeId): { cx: number; cy: number; w: number; h: number } | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLElement>(`[data-kid="${parentId}"]`);
  const vp = document.querySelector<HTMLElement>('.kc-viewport');
  if (!el || !vp) return null;
  const pr = el.getBoundingClientRect();
  const vr = vp.getBoundingClientRect();
  const z = uiApi.state.viewport.zoom || 1;
  if (!pr.width || !vr.width) return null;
  return { cx: (vr.left + vr.width / 2 - pr.left) / z, cy: (vr.top + vr.height / 2 - pr.top) / z, w: pr.width / z, h: pr.height / z };
}

function measure(id: NodeId): { w: number; h: number } | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLElement>(`[data-kid="${id}"]`);
  return el && el.offsetWidth ? { w: el.offsetWidth, h: el.offsetHeight } : null;
}

const clampPos = (v: number, size: number, max: number) => Math.round(Math.max(0, Math.min(v, Math.max(0, max - size))));

/**
 * Never keep `background` next to `background-*` longhands in one declaration set
 * (React warns when they mix, and the result depends on declaration order).
 * A plain-colour shorthand folds into `background-color`; a gradient/url into `background-image`.
 */
export function normalizeBackground(map: StyleMap | undefined): void {
  if (!map || map.background === undefined) return;
  const hasLonghand = Object.keys(map).some((k) => k.startsWith('background-'));
  if (!hasLonghand) return;
  const sh = map.background;
  delete map.background;
  if (/gradient\(|url\(/i.test(sh)) {
    if (map['background-image'] === undefined) map['background-image'] = sh;
  } else if (map['background-color'] === undefined) map['background-color'] = sh;
}

/** Strip editor attributes from imported svg nodes and tag provenance. */
function finishImported(nodes: Record<NodeId, KNode>) {
  for (const n of Object.values(nodes)) {
    for (const m of [...Object.values(n.styles), ...Object.values(n.states ?? {})]) normalizeBackground(m);
    if (n.type === 'svg' && n.props.svg) n.props.svg = cleanSvgRoot(n.props.svg);
    n.meta = { ...(n.meta ?? {}), aiGenerated: true };
  }
}

/** body/html declarations that make sense on a page frame */
const PAGE_KEYS = /^(--|background|color$|font-|line-height|letter-spacing|text-rendering|-webkit-font-smoothing)/;
function pageStyleSubset(m: StyleMap | undefined): StyleMap {
  const out: StyleMap = {};
  for (const [k, v] of Object.entries(m ?? {})) if (PAGE_KEYS.test(k) && v !== 'revert') out[k] = v;
  return out;
}

export type HtmlMode = 'page' | 'section' | 'component';

export interface InsertOutcome {
  rootIds: NodeId[];
  historyId?: number;
}

/**
 * Insert generated HTML. Page mode (and section mode) on an empty page turns the
 * frame into a flex column and (page mode) applies the body styles to it;
 * otherwise content goes to `insertionTarget()`, absolutely placed and centered
 * in view when the parent is a freeform container. One undo step.
 */
export async function insertGenerated(res: HtmlImportResult, mode: HtmlMode, label: string): Promise<InsertOutcome> {
  const doc = docApi.doc;
  const pageRoot = currentRootId();
  if (!pageRoot || !res.rootIds.length) return { rootIds: [] };
  finishImported(res.nodes);
  const nodes = res.nodes;
  const emptyPage = doc.nodes[pageRoot].children.length === 0;
  const takeOverPage = emptyPage && (mode === 'page' || mode === 'section');

  let parentId: NodeId;
  let index: number | undefined;
  if (takeOverPage) parentId = pageRoot;
  else {
    const t = insertionTarget();
    if (!t) return { rootIds: [] };
    parentId = t.parentId;
    index = t.index;
  }

  // Several roots → keep as page sections when they go straight into a page frame, else wrap.
  let roots = [...res.rootIds];
  const straightIntoPage = parentId === pageRoot && (takeOverPage || mode === 'page') && isFlexOrGrid(resolveStyles(doc, doc.nodes[pageRoot], 'base'));
  if (roots.length > 1 && !(takeOverPage || straightIntoPage)) {
    const wrap = createNode('box', {
      name: mode === 'page' ? 'AI page' : mode === 'section' ? 'AI section' : 'AI component',
      replaceStyles: true,
      styles: { display: 'flex', 'flex-direction': 'column', ...(mode === 'component' ? {} : { width: '100%' }) },
    });
    wrap.meta = { aiGenerated: true };
    for (const r of roots) {
      nodes[r].parent = wrap.id;
      wrap.children.push(r);
    }
    nodes[wrap.id] = wrap;
    roots = [wrap.id];
  }

  // Body styles: on a taken-over page they go to the frame; otherwise carry
  // custom properties (and font/color/background for whole pages) onto the roots.
  const body = res.pageStyles;
  if (!takeOverPage) {
    const base = pageStyleSubset(body.base);
    for (const r of roots) {
      const s = nodes[r].styles.base;
      for (const [k, v] of Object.entries(base)) {
        const isVar = k.startsWith('--');
        const inherit = k === 'color' || k.startsWith('font-');
        const bg = k.startsWith('background') && mode === 'page';
        if ((isVar || inherit || bg) && s[k] === undefined) s[k] = v;
      }
    }
  }

  const parentStyle = resolveStyles(doc, doc.nodes[parentId], 'base');
  const freeform = !takeOverPage && !isFlexOrGrid(parentStyle);
  const geo = freeform ? viewGeometry(parentId) : null;

  docApi.begin(label, { ai: true });
  try {
    docApi.mutate(label, (d) => {
      if (takeOverPage) {
        const f = d.nodes[pageRoot];
        f.styles.base.display = 'flex';
        f.styles.base['flex-direction'] = 'column';
        if (mode === 'page') {
          for (const [bp, m] of Object.entries(body)) {
            const sub = pageStyleSubset(m);
            if (!Object.keys(sub).length) continue;
            const target = (f.styles[bp] = { ...(f.styles[bp] ?? {}) });
            for (const k of Object.keys(sub)) {
              if (k === 'background') for (const t of Object.keys(target)) if (t.startsWith('background')) delete target[t];
              if (k.startsWith('background-')) delete target.background;
            }
            Object.assign(target, sub);
            normalizeBackground(target);
          }
        }
      }
      for (const n of Object.values(nodes)) if (!roots.includes(n.id)) d.nodes[n.id] = n;
      let at = index;
      for (const r of roots) {
        const node = nodes[r];
        if (freeform) {
          const s = node.styles.base;
          s.position = 'absolute';
          if (mode === 'section' && !s.width) {
            s.left = '0px';
            s.width = '100%';
          } else s.left = `${Math.round(geo?.cx ?? 80)}px`;
          s.top = `${Math.round(geo?.cy ?? 80)}px`;
        }
        insertSubtree(d as KDocument, { rootId: r, nodes: { [r]: node } }, parentId, at);
        if (at != null) at++;
      }
    }, { ai: true });

    if (freeform) {
      // center using the rendered size (still part of the same undo step)
      await nextFrame();
      await nextFrame();
      docApi.mutate(label, (d) => {
        for (const r of roots) {
          const n = d.nodes[r];
          if (!n) continue;
          const size = measure(r) ?? { w: 360, h: 240 };
          const g = geo ?? { cx: 400, cy: 300, w: 1440, h: 900 };
          if (n.styles.base.width !== '100%') n.styles.base.left = `${clampPos(g.cx - size.w / 2, size.w, g.w)}px`;
          n.styles.base.top = `${clampPos(g.cy - size.h / 2, size.h, g.h)}px`;
        }
      }, { ai: true });
    }
  } finally {
    docApi.commit(label);
  }
  uiApi.state.select(roots);
  return { rootIds: roots, historyId: lastHistoryId() };
}

// ─── Edit / regenerate ───────────────────────────────────────────────────────

/** Normalise an edit target set: top-most nodes sharing the first node's parent, in tree order. */
export function editTargets(doc: KDocument, selection: NodeId[]): { ids: NodeId[]; rootAsBody: boolean } {
  const roots = new Set([...doc.pages.map((p) => p.rootId), ...Object.values(doc.components).map((c) => c.rootId)]);
  const valid = selection.filter((id) => doc.nodes[id]);
  if (!valid.length) return { ids: [], rootAsBody: false };
  const rootSel = valid.find((id) => roots.has(id));
  if (rootSel) return { ids: [rootSel], rootAsBody: true };
  const pruned = sortByTreeOrder(doc.nodes, pruneDescendants(doc.nodes, valid));
  const parent = doc.nodes[pruned[0]].parent;
  return { ids: pruned.filter((id) => doc.nodes[id].parent === parent), rootAsBody: false };
}

export interface EditOutcome {
  rootIds: NodeId[];
  kept: number;
  total: number;
  historyId?: number;
}

/**
 * Replace the edited subtree(s) with the re-imported HTML in one step. Nodes whose
 * data-kid survived keep their id, animations, name and lock/hidden flags; elided
 * SVGs, component instances and data-URL images are restored.
 */
export function applyEdit(targets: { ids: NodeId[]; rootAsBody: boolean }, res: HtmlImportResult, ser: SerializedSubtree, label: string): EditOutcome {
  const doc = docApi.doc;
  const oldIds = new Set(ser.ids);
  finishImported(res.nodes);
  restoreSrcMap(res.nodes, ser.srcMap);
  let kept = 0;
  for (const n of Object.values(res.nodes)) {
    const old = doc.nodes[n.id];
    if (!old || !oldIds.has(n.id)) continue;
    kept++;
    if (old.type === 'instance') {
      const copy = deepClone(old) as KNode;
      Object.assign(n, { ...copy, parent: n.parent, children: [] });
      continue;
    }
    if (!n.animations?.length && old.animations?.length) n.animations = deepClone(old.animations);
    n.name = old.name;
    if (old.locked) n.locked = true;
    if (old.hidden) n.hidden = true;
    if (old.type === 'svg' && n.type === 'svg' && (!n.props.svg || /data-ksvg="keep"|<svg[^>]*>\s*<\/svg>/.test(n.props.svg))) n.props.svg = old.props.svg;
  }

  let newRoots = [...res.rootIds];
  docApi.mutate(label, (d) => {
    if (targets.rootAsBody) {
      const frameId = targets.ids[0];
      const frame = d.nodes[frameId];
      for (const c of [...frame.children]) removeNode(d as KDocument, c);
      for (const [bp, m] of Object.entries(res.pageStyles)) {
        const sub: StyleMap = {};
        for (const [k, v] of Object.entries(m ?? {})) if (v !== 'revert') sub[k] = v;
        if (!Object.keys(sub).length) continue;
        const target = (frame.styles[bp] = { ...(frame.styles[bp] ?? {}) });
        for (const k of Object.keys(sub)) {
          if (k === 'background') for (const t of Object.keys(target)) if (t.startsWith('background')) delete target[t];
          if (k.startsWith('background-')) delete target.background;
        }
        Object.assign(target, sub);
        normalizeBackground(target);
      }
      for (const n of Object.values(res.nodes)) if (!newRoots.includes(n.id)) d.nodes[n.id] = n;
      for (const r of newRoots) insertSubtree(d as KDocument, { rootId: r, nodes: { [r]: res.nodes[r] } }, frameId);
      return;
    }
    const first = d.nodes[targets.ids[0]];
    const parentId = first.parent!;
    const index = d.nodes[parentId].children.indexOf(first.id);
    for (const id of targets.ids) removeNode(d as KDocument, id);
    for (const n of Object.values(res.nodes)) if (!newRoots.includes(n.id)) d.nodes[n.id] = n;
    let at = index;
    for (const r of newRoots) insertSubtree(d as KDocument, { rootId: r, nodes: { [r]: res.nodes[r] } }, parentId, at++);
  }, { ai: true });
  if (targets.rootAsBody) newRoots = [targets.ids[0]];
  uiApi.state.select(newRoots.filter((id) => docApi.doc.nodes[id]));
  return { rootIds: newRoots, kept, total: oldIds.size, historyId: lastHistoryId() };
}

/** Ids that must not be reused by an edit import (everything outside the edited subtrees). */
export function reservedIdsFor(doc: KDocument, editedIds: Iterable<NodeId>): Set<NodeId> {
  const edited = new Set(editedIds);
  return new Set(Object.keys(doc.nodes).filter((id) => !edited.has(id)));
}

// ─── Animations ──────────────────────────────────────────────────────────────

/** Add validated animations (replacing earlier AI animations on the same targets). */
export function applyAnimations(items: ValidatedAnimation[], label: string): { count: number; targets: NodeId[]; historyId?: number } {
  const targets = [...new Set(items.map((i) => i.target))].filter((id) => docApi.doc.nodes[id]);
  if (!targets.length) return { count: 0, targets: [] };
  docApi.mutate(label, (d) => {
    const cleared = new Set<NodeId>();
    for (const { target, anim } of items) {
      const n = d.nodes[target];
      if (!n) continue;
      if (!cleared.has(target)) {
        cleared.add(target);
        n.animations = (n.animations ?? []).filter((a) => a.presetId !== 'ai');
      }
      (n.animations ??= []).push(anim);
    }
  }, { ai: true });
  return { count: items.filter((i) => targets.includes(i.target)).length, targets, historyId: lastHistoryId() };
}

// ─── SVG ─────────────────────────────────────────────────────────────────────

export function svgNodeName(prompt: string): string {
  const p = prompt.toLowerCase();
  const kind = /\bicon\b/.test(p) ? 'Icon' : /illustration|hero|blob|scene|background/.test(p) ? 'Illustration' : 'Logo';
  const quoted = /[“"']([^”"']{2,24})[”"']/.exec(prompt)?.[1];
  return quoted ? `${quoted} ${kind.toLowerCase()}` : kind;
}

/** Insert a validated SVG as an `svg` node (centered in view for freeform parents). */
export function insertSvgNode(svg: string, viewBox: { width: number; height: number }, name: string, label: string): NodeId | null {
  const t = insertionTarget();
  if (!t) return null;
  const doc = docApi.doc;
  const size = svgDisplaySize(viewBox.width, viewBox.height, 200);
  const node = createNode('svg', {
    name,
    props: { svg: uniquifySvgIds(svg, `${uid('s').slice(2, 8)}-`) },
    styles: { width: `${size.width}px`, height: `${size.height}px`, display: 'block', 'flex-shrink': '0' },
  });
  node.meta = { aiGenerated: true };
  const freeform = !isFlexOrGrid(resolveStyles(doc, doc.nodes[t.parentId], 'base'));
  if (freeform) {
    const g = viewGeometry(t.parentId) ?? { cx: 320, cy: 240, w: 1440, h: 900 };
    node.styles.base.position = 'absolute';
    node.styles.base.left = `${clampPos(g.cx - size.width / 2, size.width, g.w)}px`;
    node.styles.base.top = `${clampPos(g.cy - size.height / 2, size.height, g.h)}px`;
  }
  docApi.mutate(label, (d) => insertSubtree(d as KDocument, { rootId: node.id, nodes: { [node.id]: node } }, t.parentId, t.index), { ai: true });
  uiApi.state.select([node.id]);
  return node.id;
}

/** All ids in the given subtrees (for animation target lists). */
export function subtreeIds(doc: KDocument, roots: NodeId[]): NodeId[] {
  return roots.flatMap((r) => getSubtreeIds(doc.nodes, r));
}
