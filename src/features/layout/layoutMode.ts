/**
 * Free / Flow layout mode for pages and containers.
 *
 *  - Free: children are absolutely positioned (move them anywhere).
 *  - Flow: children are laid out by the container (flex/grid, or normal block flow).
 *
 * Switching converts the EXISTING children in place without visual jumps:
 *  Flow → Free measures every child at every breakpoint width on the live canvas and
 *  writes per-breakpoint left/top (so responsive layouts stay intact), and gives the
 *  container enough min-height to keep its size.
 *  Free → Flow orders children by their position (reading order) and stacks them in a
 *  flex column with the typical vertical spacing.
 */
import { flushSync } from 'react-dom';
import type { Draft } from 'immer';
import type { BreakpointId, KDocument, KNode, NodeId, StyleMap } from '@/core/model/types';
import { docApi } from '@/core/store/docStore';
import { uiApi, useUI } from '@/core/store/uiStore';
import { isFlexOrGrid, parsePx, resolveStyles } from '@/core/style/style';
import { elementFor, paddingOrigin, worldRectOf } from '@/features/canvas/measure';

export type LayoutMode = 'free' | 'flow';

const CONTAINER_LAYOUT_PROPS = [
  'flex-direction', 'flex-wrap', 'flex-flow', 'gap', 'row-gap', 'column-gap', 'justify-content', 'align-items', 'align-content',
  'place-items', 'place-content', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas', 'grid-template', 'grid-auto-flow',
  'grid-auto-rows', 'grid-auto-columns', 'grid',
];
const CHILD_FLOW_PROPS = [
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-inline', 'margin-block',
  'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'justify-self', 'place-self', 'order',
  'grid-column', 'grid-row', 'grid-area', 'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end',
];
const POSITION_PROPS = ['position', 'left', 'top', 'right', 'bottom', 'inset'];

function isAbsolute(st: StyleMap) {
  return st.position === 'absolute' || st.position === 'fixed';
}

/** Current layout mode of a container at a breakpoint. */
export function layoutModeOf(doc: KDocument, id: NodeId, bp: BreakpointId = uiApi.state.breakpoint): LayoutMode {
  const n = doc.nodes[id];
  if (!n) return 'free';
  if (isFlexOrGrid(resolveStyles(doc, n, bp))) return 'flow';
  const hasStatic = n.children.some((c) => {
    const ch = doc.nodes[c];
    return ch && !ch.hidden && !isAbsolute(resolveStyles(doc, ch, bp));
  });
  return hasStatic ? 'flow' : 'free';
}

function del(n: Draft<KNode>, props: string[]) {
  for (const bp of Object.keys(n.styles)) {
    for (const p of props) delete n.styles[bp][p];
    if (bp !== 'base' && !Object.keys(n.styles[bp]).length) delete n.styles[bp];
  }
}

function set(n: Draft<KNode>, bp: BreakpointId, prop: string, value: string) {
  (n.styles[bp] ??= {})[prop] = value;
}

interface Measure {
  inner: { w: number; h: number };
  paddingBottom: number;
  children: Record<NodeId, { x: number; y: number; w: number; h: number }>;
}

/**
 * Measure the container's static children relative to its padding box at every
 * breakpoint by rendering the canvas at each breakpoint width synchronously, then
 * restoring the view. Returns null when the canvas isn't showing the container.
 */
function measureAllBreakpoints(containerId: NodeId, childIds: NodeId[]): Record<BreakpointId, Measure> | null {
  const doc = docApi.doc;
  const ui = uiApi.state;
  const saved = { breakpoint: ui.breakpoint, canvasWidth: ui.canvasWidth };
  const out: Record<BreakpointId, Measure> = {};
  try {
    for (const bp of doc.breakpoints) {
      flushSync(() => useUI.setState({ breakpoint: bp.id, canvasWidth: bp.width }));
      const el = elementFor(containerId);
      if (!el) return null;
      const origin = paddingOrigin(el);
      if (!origin) return null;
      const cs = getComputedStyle(el);
      const m: Measure = { inner: { w: el.clientWidth, h: el.clientHeight }, paddingBottom: parseFloat(cs.paddingBottom) || 0, children: {} };
      for (const id of childIds) {
        const cel = elementFor(id);
        const r = cel ? worldRectOf(cel) : null;
        if (r) m.children[id] = { x: r.x - origin.x, y: r.y - origin.y, w: r.w, h: r.h };
      }
      out[bp.id] = m;
    }
  } finally {
    flushSync(() => useUI.setState(saved));
  }
  return out;
}

/** Convert a container's flow children to free (absolute) positioning, in place. */
export function convertToFree(containerId: NodeId, opts: { skipHistory?: boolean; label?: string } = {}): boolean {
  const doc = docApi.doc;
  const c = doc.nodes[containerId];
  if (!c) return false;
  const base = doc.breakpoints[0]?.id ?? 'base';
  const flowKids = c.children.filter((id) => {
    const n = doc.nodes[id];
    return n && !n.hidden && !isAbsolute(resolveStyles(doc, n, base));
  });
  const wasFlexOrGrid = doc.breakpoints.some((bp) => isFlexOrGrid(resolveStyles(doc, c, bp.id)));
  if (!flowKids.length && !wasFlexOrGrid) return false;
  const measured = measureAllBreakpoints(containerId, flowKids);
  if (!measured) return false;
  const bps = doc.breakpoints.map((b) => b.id);

  docApi.mutate(
    opts.label ?? 'Switch layout to Free',
    (d) => {
      const cn = d.nodes[containerId];
      // Container: drop flex/grid layout, keep a positioning context and its size.
      del(cn, [...CONTAINER_LAYOUT_PROPS, 'display']);
      const pos = resolveStyles(d as KDocument, cn as KNode, base).position;
      if (!pos || pos === 'static') set(cn, 'base', 'position', 'relative');
      for (const bp of bps) {
        const m = measured[bp];
        if (!m) continue;
        const own = resolveStyles(d as KDocument, cn as KNode, bp);
        if (own.height && parsePx(own.height) != null) continue; // explicit height: keep
        let bottom = 0;
        for (const r of Object.values(m.children)) bottom = Math.max(bottom, r.y + r.h);
        const needed = Math.ceil(bottom + m.paddingBottom);
        const current = parsePx(own['min-height']) ?? 0;
        if (needed > current) set(cn, bp, 'min-height', `${needed}px`);
      }
      // Children: absolute at their measured spot at every breakpoint.
      for (const id of flowKids) {
        const n = d.nodes[id];
        del(n, [...CHILD_FLOW_PROPS, ...POSITION_PROPS]);
        for (const bp of Object.keys(n.styles)) if (bp !== base) delete n.styles[bp].width;
        set(n, 'base', 'position', 'absolute');
        let prevW: string | undefined;
        for (const bp of bps) {
          const r = measured[bp]?.children[id];
          if (!r) continue;
          set(n, bp, 'left', `${Math.round(r.x)}px`);
          set(n, bp, 'top', `${Math.round(r.y)}px`);
          const full = Math.abs(r.x) <= 1 && Math.abs(r.w - measured[bp].inner.w) <= 1;
          const w = full ? '100%' : `${Math.round(r.w)}px`;
          if (bp === base || w !== prevW) set(n, bp, 'width', w);
          prevW = w;
        }
      }
    },
    { skipHistory: opts.skipHistory },
  );
  return true;
}

/** Convert a container's free (absolute) children to a flow column, in reading order. */
export function convertToFlow(containerId: NodeId, opts: { label?: string } = {}): boolean {
  const doc = docApi.doc;
  const c = doc.nodes[containerId];
  if (!c) return false;
  const base = doc.breakpoints[0]?.id ?? 'base';
  const abs = c.children.filter((id) => {
    const n = doc.nodes[id];
    return n && isAbsolute(resolveStyles(doc, n, base));
  });
  const pos = (id: NodeId) => {
    const st = resolveStyles(doc, doc.nodes[id], base);
    return { x: parsePx(st.left) ?? 0, y: parsePx(st.top) ?? 0, h: elementFor(id)?.offsetHeight ?? parsePx(st.height) ?? 0 };
  };
  const ordered = [...abs].sort((a, b) => {
    const pa = pos(a);
    const pb = pos(b);
    return Math.abs(pa.y - pb.y) > 8 ? pa.y - pb.y : pa.x - pb.x;
  });
  // typical vertical spacing between consecutive items
  const gaps: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const a = pos(ordered[i - 1]);
    const b = pos(ordered[i]);
    const g = b.y - (a.y + a.h);
    if (g > 0) gaps.push(g);
  }
  gaps.sort((a, b) => a - b);
  const gap = gaps.length ? Math.min(64, Math.round(gaps[Math.floor(gaps.length / 2)])) : 0;

  docApi.mutate(opts.label ?? 'Switch layout to Flow', (d) => {
    const cn = d.nodes[containerId];
    // order: free children by reading order, keep any remaining (static) children after them
    const rest = cn.children.filter((id) => !abs.includes(id));
    cn.children = [...ordered, ...rest];
    del(cn, CONTAINER_LAYOUT_PROPS);
    set(cn, 'base', 'display', 'flex');
    set(cn, 'base', 'flex-direction', 'column');
    set(cn, 'base', 'align-items', 'flex-start');
    if (gap) set(cn, 'base', 'gap', `${gap}px`);
    for (const id of abs) del(d.nodes[id], POSITION_PROPS);
  });
  return true;
}

export function setLayoutMode(containerId: NodeId, mode: LayoutMode): boolean {
  if (layoutModeOf(docApi.doc, containerId) === mode) return false;
  return mode === 'free' ? convertToFree(containerId) : convertToFlow(containerId);
}
