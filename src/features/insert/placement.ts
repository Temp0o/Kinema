/**
 * Placement of newly inserted subtrees: freeform parents get absolutely
 * positioned content centered in the visible part of the frame; flex/grid
 * parents simply receive the content in flow.
 */
import type { KDocument, KNode, NodeId } from '@/core/model/types';
import { docApi } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { insertionTarget } from '@/core/store/actions';
import { insertSubtree } from '@/core/model/tree';
import { isFlexOrGrid, parsePx, resolveStyles } from '@/core/style/style';

export interface Size {
  w: number;
  h: number;
}

export interface Subtree {
  rootId: NodeId;
  nodes: Record<NodeId, KNode>;
}

export function isFreeformParent(parentId: NodeId): boolean {
  const doc = docApi.doc;
  const p = doc.nodes[parentId];
  if (!p) return true;
  return !isFlexOrGrid(resolveStyles(doc, p, uiApi.state.breakpoint));
}

/** True when the parent has no positioning context (position static/unset at every breakpoint). */
export function isStaticParent(parentId: NodeId): boolean {
  const doc = docApi.doc;
  const p = doc.nodes[parentId];
  if (!p) return false;
  const pos = resolveStyles(doc, p, uiApi.state.breakpoint).position;
  return !pos || pos === 'static';
}

function cssEscape(s: string) {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
}

/** Rect of a node in frame coordinates (unscaled px), measured from the canvas DOM. */
function nodeRectInFrame(id: NodeId): { x: number; y: number; w: number; h: number } | null {
  const frame = document.querySelector<HTMLElement>('.kc-root [data-kroot]') ?? document.querySelector<HTMLElement>('.kc-root');
  const el = document.querySelector<HTMLElement>(`.kc-root [data-kid="${cssEscape(id)}"]`);
  if (!frame || !el) return null;
  const z = uiApi.state.viewport.zoom || 1;
  const fr = frame.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: (r.left - fr.left) / z + el.clientLeft, y: (r.top - fr.top) / z + el.clientTop, w: el.clientWidth, h: el.clientHeight };
}

/** Center of the visible part of the current frame, in frame coordinates. */
export function visibleFrameCenter(): { x: number; y: number } {
  const ui = uiApi.state;
  const { zoom, panX, panY } = ui.viewport;
  const vp = document.querySelector<HTMLElement>('.kc-viewport');
  const frameEl = document.querySelector<HTMLElement>('.kc-root');
  const vpW = vp?.clientWidth ?? 1000;
  const vpH = vp?.clientHeight ?? 700;
  const fw = ui.canvasWidth;
  const fh = frameEl?.offsetHeight || 900;
  const x0 = Math.max(0, -panX / zoom);
  const y0 = Math.max(0, -panY / zoom);
  const x1 = Math.min(fw, (vpW - panX) / zoom);
  const y1 = Math.min(fh, (vpH - panY) / zoom);
  if (x1 > x0 && y1 > y0) return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  return { x: fw / 2, y: Math.min(fh, 700) / 2 };
}

/**
 * Top-left position (parent coordinates) for content of `size` centered in the
 * visible part of the frame, clamped into the parent.
 */
export function centeredPosition(parentId: NodeId, size: Size, fullWidth = false): { left: number; top: number } {
  const c = visibleFrameCenter();
  const doc = docApi.doc;
  const isRoot = !doc.nodes[parentId]?.parent;
  const pr = isRoot ? null : nodeRectInFrame(parentId);
  const ox = pr?.x ?? 0;
  const oy = pr?.y ?? 0;
  const pw = pr?.w ?? uiApi.state.canvasWidth;
  const ph = pr?.h ?? Infinity;
  let left = fullWidth ? 0 : c.x - ox - size.w / 2;
  let top = c.y - oy - size.h / 2;
  left = Math.min(Math.max(0, left), Math.max(0, pw - size.w));
  top = Math.max(0, isRoot ? top : Math.min(top, Math.max(0, ph - size.h)));
  return { left: Math.round(left), top: Math.round(top) };
}

const CASCADE_STEP = 24;
const CASCADE_MAX = 10;

/**
 * Click-inserting several items would stack them all at the same centered spot. Shift the
 * position diagonally (24px per step) while a sibling already sits there, wrapping back to the
 * start after a few steps so items never drift off screen.
 */
export function cascadeFrom(parentId: NodeId, pos: { left: number; top: number }, opts: { horizontal?: boolean } = {}): { left: number; top: number } {
  const doc = docApi.doc;
  const parent = doc.nodes[parentId];
  if (!parent) return pos;
  const bp = uiApi.state.breakpoint;
  const taken = new Set<string>();
  for (const c of parent.children) {
    const n = doc.nodes[c];
    if (!n) continue;
    const st = resolveStyles(doc, n, bp);
    if (st.position !== 'absolute') continue;
    taken.add(`${parsePx(st.left) ?? 0}:${parsePx(st.top) ?? 0}`);
  }
  const at = (k: number) => ({ left: pos.left + (opts.horizontal === false ? 0 : k * CASCADE_STEP), top: pos.top + k * CASCADE_STEP });
  let k = 0;
  while (k < CASCADE_MAX && taken.has(`${at(k).left}:${at(k).top}`)) k++;
  return k >= CASCADE_MAX ? pos : at(k);
}

/** Make a subtree root absolutely positioned at (left, top). */
export function positionAbsolute(sub: Subtree, left: number, top: number) {
  const root = sub.nodes[sub.rootId];
  const base = root.styles.base;
  base.position = 'absolute';
  base.left = `${Math.round(left)}px`;
  base.top = `${Math.round(top)}px`;
  for (const bp of Object.keys(root.styles)) {
    if (bp === 'base') continue;
    delete root.styles[bp].position;
    delete root.styles[bp].left;
    delete root.styles[bp].top;
  }
}

/**
 * Insert one or more built subtrees at the insertion target as ONE history step
 * and select them. In freeform parents roots are absolutely positioned: centered
 * at `point` (parent coords) when given, otherwise centered in the visible frame.
 */
export function insertSubtrees(
  subs: { sub: Subtree; size?: Size }[],
  opts: { label: string; parentId?: NodeId; index?: number; point?: { x: number; y: number }; stagger?: number } = { label: 'Insert' },
): NodeId[] {
  if (!subs.length) return [];
  const target = opts.parentId ? { parentId: opts.parentId, index: opts.index } : insertionTarget();
  if (!target) return [];
  const freeform = isFreeformParent(target.parentId);
  const stagger = opts.stagger ?? 24;
  if (freeform) {
    subs.forEach(({ sub, size }, i) => {
      const s = size ?? { w: 240, h: 160 };
      const fullWidth = sub.nodes[sub.rootId].styles.base.width === '100%' && !sub.nodes[sub.rootId].styles.base['max-width'];
      let pos: { left: number; top: number };
      if (opts.point) pos = { left: fullWidth ? 0 : opts.point.x - s.w / 2, top: opts.point.y - s.h / 2 };
      else pos = cascadeFrom(target.parentId, centeredPosition(target.parentId, s, fullWidth), { horizontal: !fullWidth });
      positionAbsolute(sub, pos.left + i * stagger, pos.top + i * stagger);
    });
  }
  // Absolutely positioned content needs a positioned parent (e.g. free placement into a flex section).
  const parentStatic = freeform && isStaticParent(target.parentId);
  docApi.mutate(opts.label, (d) => {
    if (parentStatic) d.nodes[target.parentId].styles.base.position = 'relative';
    let at = target.index;
    for (const { sub } of subs) {
      insertSubtree(d as KDocument, sub, target.parentId, at);
      if (at != null) at++;
    }
  });
  const ids = subs.map((s) => s.sub.rootId);
  uiApi.state.select(ids);
  revealNode(ids[0]);
  return ids;
}

/** Pan the canvas so a freshly inserted node is visible (no-op when already in view). */
export function revealNode(id: NodeId) {
  requestAnimationFrame(() => {
    const vp = document.querySelector<HTMLElement>('.kc-viewport');
    const el = document.querySelector<HTMLElement>(`.kc-root [data-kid="${cssEscape(id)}"]`);
    if (!vp || !el) return;
    const v = vp.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const visible = r.bottom > v.top + 40 && r.top < v.bottom - 40 && r.right > v.left + 40 && r.left < v.right - 40;
    if (visible) return;
    const { panX, panY } = uiApi.state.viewport;
    const dy = r.top + Math.min(r.height, v.height * 0.6) / 2 - (v.top + v.height / 2);
    const dx = r.width > v.width ? 0 : r.left + r.width / 2 - (v.left + v.width / 2);
    uiApi.state.setViewport({ panX: panX - dx, panY: panY - dy });
  });
}
