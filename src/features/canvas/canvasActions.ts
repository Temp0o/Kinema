/**
 * Canvas-level actions that need geometry (grouping with measured rects,
 * nudging, visibility/lock toggles, flow reordering with the keyboard).
 */
import type { NodeId } from '@/core/model/types';
import { docApi } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { currentRootId, groupNodes, setNodeFields, ungroupNodes, type Rect } from '@/core/store/actions';
import { pruneDescendants, sortByTreeOrder } from '@/core/model/tree';
import { parsePx, resolveStyles } from '@/core/style/style';
import { toast } from 'sonner';
import { elementFor, isAbsoluteEl, paddingOrigin, worldRectOf } from './measure';
import { flowLayoutOf } from './hitTest';
import { writeStyle } from './styleWrite';

function rootSet(): Set<NodeId> {
  const doc = docApi.doc;
  return new Set([...doc.pages.map((p) => p.rootId), ...Object.values(doc.components).map((c) => c.rootId)]);
}

function selectionTargets(): NodeId[] {
  const doc = docApi.doc;
  const roots = rootSet();
  return sortByTreeOrder(doc.nodes, pruneDescendants(doc.nodes, uiApi.state.selection)).filter((id) => doc.nodes[id] && !roots.has(id));
}

/** Rect of a child relative to its parent's padding box (CSS left/top space). */
function rectInParent(id: NodeId): Rect | null {
  const doc = docApi.doc;
  const n = doc.nodes[id];
  const el = elementFor(id);
  const pel = elementFor(n?.parent);
  if (!n || !el || !pel) return null;
  const r = worldRectOf(el);
  const o = paddingOrigin(pel);
  if (!r || !o) return null;
  const cs = getComputedStyle(el);
  const st = resolveStyles(doc, n, uiApi.state.breakpoint);
  const left = parsePx(st.left);
  const top = parsePx(st.top);
  return {
    x: left ?? r.x - o.x - (parseFloat(cs.marginLeft) || 0),
    y: top ?? r.y - o.y - (parseFloat(cs.marginTop) || 0),
    w: r.w,
    h: r.h,
  };
}

/** Group with measured geometry so absolutely positioned children don't jump. */
export function groupSelection(): NodeId | null {
  const ids = selectionTargets();
  if (!ids.length) return null;
  const doc = docApi.doc;
  const parent = doc.nodes[ids[0]].parent;
  if (ids.some((id) => doc.nodes[id].parent !== parent)) {
    toast.error('Group needs layers that share a parent');
    return null;
  }
  const rects: Record<NodeId, Rect> = {};
  for (const id of ids) {
    const r = rectInParent(id);
    if (r) rects[id] = r;
  }
  return groupNodes(ids, rects);
}

export function ungroupSelection() {
  ungroupNodes(selectionTargets());
}

export function toggleHidden(ids = selectionTargets()) {
  if (!ids.length) return;
  const doc = docApi.doc;
  const anyVisible = ids.some((id) => !doc.nodes[id]?.hidden);
  setNodeFields(ids, { hidden: anyVisible ? true : undefined }, anyVisible ? 'Hide layer' : 'Show layer');
}

export function toggleLocked(ids = selectionTargets()) {
  if (!ids.length) return;
  const doc = docApi.doc;
  const anyUnlocked = ids.some((id) => !doc.nodes[id]?.locked);
  setNodeFields(ids, { locked: anyUnlocked ? true : undefined }, anyUnlocked ? 'Lock layer' : 'Unlock layer');
}

/**
 * Arrow-key nudge: absolute nodes move by `step` px (one coalesced history entry
 * per burst); flow children reorder along their parent's main axis.
 */
export function nudge(dx: number, dy: number, opts: { reorderOnly?: boolean } = {}) {
  const ids = selectionTargets().filter((id) => !docApi.doc.nodes[id]?.locked);
  if (!ids.length) return;
  const doc = docApi.doc;
  const bp = uiApi.state.breakpoint;
  const abs: NodeId[] = [];
  const flow: NodeId[] = [];
  for (const id of ids) {
    const el = elementFor(id);
    if (el && isAbsoluteEl(el)) abs.push(id);
    else flow.push(id);
  }
  if (abs.length && !opts.reorderOnly) {
    const starts = abs.map((id) => {
      const st = resolveStyles(doc, doc.nodes[id], bp);
      let left = parsePx(st.left);
      let top = parsePx(st.top);
      if (left == null || top == null) {
        const r = rectInParent(id);
        left ??= r?.x ?? 0;
        top ??= r?.y ?? 0;
      }
      return { id, left, top };
    });
    docApi.mutate(
      'Nudge',
      (d) => {
        for (const s of starts) {
          const n = d.nodes[s.id];
          if (dx) writeStyle(n, bp, 'left', `${Math.round(s.left + dx)}px`);
          if (dy) writeStyle(n, bp, 'top', `${Math.round(s.top + dy)}px`);
        }
      },
      { coalesceKey: `nudge:${abs.join(',')}` },
    );
  }
  if (flow.length) {
    const parentId = doc.nodes[flow[0]].parent;
    const pel = elementFor(parentId);
    if (!parentId || !pel || flow.some((id) => doc.nodes[id].parent !== parentId)) return;
    const { layout } = flowLayoutOf(pel);
    const row = layout.direction.startsWith('row');
    const reverse = layout.direction.endsWith('reverse');
    let dir = row ? Math.sign(dx) : Math.sign(dy);
    if (!dir) return;
    if (reverse) dir = -dir;
    docApi.mutate(
      'Reorder',
      (d) => {
        const p = d.nodes[parentId];
        const order = dir > 0 ? [...flow].sort((a, b) => p.children.indexOf(b) - p.children.indexOf(a)) : [...flow].sort((a, b) => p.children.indexOf(a) - p.children.indexOf(b));
        for (const id of order) {
          const i = p.children.indexOf(id);
          const j = i + dir;
          if (j < 0 || j >= p.children.length || flow.includes(p.children[j])) continue;
          p.children.splice(i, 1);
          p.children.splice(j, 0, id);
        }
      },
      { coalesceKey: `reorder:${flow.join(',')}` },
    );
  }
}

export function canGroup(): boolean {
  const ids = selectionTargets();
  if (!ids.length) return false;
  const p = docApi.doc.nodes[ids[0]].parent;
  return ids.every((id) => docApi.doc.nodes[id].parent === p);
}

export function canUngroup(): boolean {
  return selectionTargets().some((id) => (docApi.doc.nodes[id]?.children.length ?? 0) > 0);
}

export function isRootSelected(): boolean {
  const r = currentRootId();
  return !!r && uiApi.state.selection.includes(r);
}
