/**
 * Pure helpers for the layers tree (flattening, drop resolution) plus the
 * drop mutation.
 */
import type { KDocument, KNode, NodeId } from '@/core/model/types';
import { canContain, moveNode } from '@/core/model/tree';
import { docApi } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { elementFor, isAbsoluteEl, paddingOrigin, worldRectOf } from '@/features/canvas/measure';
import { flowLayoutOf } from '@/features/canvas/hitTest';
import { placeAbsolute, stripPosition, writeStyle } from '@/features/canvas/styleWrite';
import type { DropPos } from './layersStore';

type NodeMap = Record<NodeId, KNode>;

/** Flatten visible rows as "id|depth" strings (cheap to compare shallowly). */
export type LayerKind = 'all' | 'text' | 'media' | 'containers' | 'components' | 'animated' | 'hidden';

export const LAYER_KINDS: { id: LayerKind; label: string }[] = [
  { id: 'all', label: 'All layers' },
  { id: 'text', label: 'Text' },
  { id: 'media', label: 'Images, video & vectors' },
  { id: 'containers', label: 'Containers & groups' },
  { id: 'components', label: 'Component instances' },
  { id: 'animated', label: 'Animated layers' },
  { id: 'hidden', label: 'Hidden or locked' },
];

export function matchesKind(n: KNode, kind: LayerKind): boolean {
  switch (kind) {
    case 'all':
      return true;
    case 'text':
      return n.type === 'text' || n.type === 'button' || n.type === 'link';
    case 'media':
      return n.type === 'image' || n.type === 'video' || n.type === 'svg';
    case 'containers':
      return n.type === 'box' || n.type === 'frame';
    case 'components':
      return n.type === 'instance';
    case 'animated':
      return !!n.animations?.length;
    case 'hidden':
      return !!n.hidden || !!n.locked;
  }
}

export function flattenRows(nodes: NodeMap, rootId: NodeId, expanded: ReadonlySet<NodeId>, query: string, kind: LayerKind = 'all'): string[] {
  const out: string[] = [];
  const q = query.trim().toLowerCase();
  let keep: Set<NodeId> | null = null;
  if (q || kind !== 'all') {
    keep = new Set();
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      const n = nodes[id];
      if (!n) continue;
      const textOk = !q || n.name.toLowerCase().includes(q) || n.type.includes(q);
      if (id !== rootId && textOk && matchesKind(n, kind)) {
        let cur: NodeId | null = id;
        while (cur && !keep.has(cur)) {
          keep.add(cur);
          cur = nodes[cur]?.parent ?? null;
        }
      }
      for (const c of n.children) stack.push(c);
    }
  }
  const walk = (id: NodeId, depth: number) => {
    const n = nodes[id];
    if (!n || (keep && !keep.has(id))) return;
    out.push(`${id}|${depth}`);
    if (id === rootId || keep || expanded.has(id)) for (const c of n.children) walk(c, depth + 1);
  };
  walk(rootId, 0);
  return out;
}

/** Can the node accept children dropped in the layers panel? */
export function acceptsChildren(n: KNode | undefined): boolean {
  if (!n || n.locked) return false;
  return n.type === 'frame' || n.type === 'box' || ((n.type === 'button' || n.type === 'link') && n.children.length > 0);
}

/**
 * Drop position for a pointer at fraction `f` (0..1) of a row's height.
 * Returns the target parent + gap index, or null when the drop is invalid.
 */
export function resolveLayerDrop(
  nodes: NodeMap,
  rootId: NodeId,
  overId: NodeId,
  f: number,
  dragged: NodeId[],
  expanded: ReadonlySet<NodeId>,
): { pos: DropPos; parentId: NodeId; index: number } | null {
  const over = nodes[overId];
  if (!over) return null;
  let pos: DropPos;
  if (overId === rootId) pos = 'inside';
  else if (acceptsChildren(over)) pos = f < 0.28 ? 'before' : f > 0.72 ? 'after' : 'inside';
  else pos = f < 0.5 ? 'before' : 'after';
  let parentId: NodeId;
  let index: number;
  if (pos === 'inside') {
    parentId = overId;
    index = over.children.length;
  } else if (pos === 'after' && expanded.has(overId) && over.children.length && acceptsChildren(over)) {
    parentId = overId;
    index = 0;
    pos = 'inside';
  } else {
    if (!over.parent) return null;
    parentId = over.parent;
    const i = nodes[parentId].children.indexOf(overId);
    index = pos === 'before' ? i : i + 1;
  }
  if (!dragged.every((d) => d !== parentId && canContain(nodes, parentId, d))) return null;
  return { pos, parentId, index };
}

/** Move nodes to parent/index, adapting positioning to the new parent. One history step. */
export function applyLayerDrop(ids: NodeId[], parentId: NodeId, index: number) {
  const doc = docApi.doc;
  const bp = uiApi.state.breakpoint;
  const pel = elementFor(parentId);
  const flowParent = pel ? flowLayoutOf(pel).flexOrGrid : false;
  const origin = pel ? paddingOrigin(pel) : null;
  const parentStatic = pel ? getComputedStyle(pel).position === 'static' : false;
  const geo = new Map<NodeId, { abs: boolean; x: number; y: number; ml: number; mt: number }>();
  for (const id of ids) {
    const el = elementFor(id);
    const r = el ? worldRectOf(el) : null;
    if (!el || !r) continue;
    const cs = getComputedStyle(el);
    geo.set(id, { abs: isAbsoluteEl(el), x: r.x, y: r.y, ml: parseFloat(cs.marginLeft) || 0, mt: parseFloat(cs.marginTop) || 0 });
  }
  // no-op?
  const kids = doc.nodes[parentId]?.children ?? [];
  const cur = ids.map((id) => kids.indexOf(id));
  if (cur.every((c) => c >= 0)) {
    const sorted = [...cur].sort((a, b) => a - b);
    const contiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
    const inOrder = cur.every((v, i) => i === 0 || v > cur[i - 1]);
    if (contiguous && inOrder && index >= sorted[0] && index <= sorted[sorted.length - 1] + 1) return;
  }
  docApi.mutate(ids.length > 1 ? `Move ${ids.length} layers` : 'Move layer', (d) => {
    let at = index;
    for (const id of ids) {
      const n = d.nodes[id];
      if (!n) continue;
      const from = n.parent;
      if (n.parent === parentId) {
        const ci = d.nodes[parentId].children.indexOf(id);
        if (ci >= 0 && ci < at) at -= 1;
      }
      moveNode(d as KDocument, id, parentId, at);
      at += 1;
      const g = geo.get(id);
      if (!g?.abs) continue;
      if (flowParent) stripPosition(n);
      else if (from !== parentId && origin) {
        placeAbsolute(n, bp, g.x - origin.x - g.ml, g.y - origin.y - g.mt);
        if (parentStatic) writeStyle(d.nodes[parentId], 'base', 'position', 'relative');
      }
    }
  });
}
