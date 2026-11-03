/**
 * Figma-like selection rules (pure). A "path" is the document ancestor chain of
 * the deepest node under the pointer: [deepest, parent, …, root].
 */
import type { KNode, NodeId } from '@/core/model/types';

type NodeMap = Record<NodeId, KNode>;

/** Doc ancestor chain of `id`, deepest first, ending at the top-most ancestor. */
export function pathFor(nodes: NodeMap, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const seen = new Set<NodeId>();
  let cur: NodeId | null = id;
  while (cur && nodes[cur] && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = nodes[cur].parent;
  }
  return out;
}

/**
 * Nodes whose children are directly clickable: the root, every ancestor of a
 * selected node (which includes their parents).
 */
export function openSet(nodes: NodeMap, rootId: NodeId, selection: readonly NodeId[]): Set<NodeId> {
  const open = new Set<NodeId>([rootId]);
  for (const id of selection) {
    let cur = nodes[id]?.parent ?? null;
    while (cur && !open.has(cur)) {
      open.add(cur);
      cur = nodes[cur]?.parent ?? null;
    }
  }
  return open;
}

/**
 * Remove locked nodes (and everything inside them) from a hit path: the click
 * falls through to the nearest unlocked ancestor of the top-most locked node.
 */
export function stripLocked(nodes: NodeMap, path: NodeId[]): NodeId[] {
  let cut = -1;
  for (let i = 0; i < path.length; i++) if (nodes[path[i]]?.locked) cut = i;
  return cut >= 0 ? path.slice(cut + 1) : path;
}

export interface PickOptions {
  /** Ctrl/Cmd: pick the deepest node. */
  deep?: boolean;
}

/** The node a click on `path` selects, or null for "empty" (root background). */
export function pickTarget(nodes: NodeMap, rootId: NodeId, path: NodeId[], open: Set<NodeId>, opts: PickOptions = {}): NodeId | null {
  const p = stripLocked(nodes, path);
  if (!p.length || p[0] === rootId) return null;
  if (opts.deep) return p[0];
  for (let i = 0; i < p.length; i++) {
    const id = p[i];
    if (id === rootId) return null;
    const parent = p[i + 1];
    if (parent && open.has(parent)) return id;
  }
  return null;
}

/** Double-click drill: the child of `current` on the path (one level deeper). */
export function drillTarget(nodes: NodeMap, path: NodeId[], current: NodeId): NodeId | null {
  const p = stripLocked(nodes, path);
  const i = p.indexOf(current);
  if (i <= 0) return null;
  return p[i - 1];
}

/** Text-like leaves that can be edited inline. */
export function isEditableText(n: KNode | undefined): boolean {
  return !!n && (n.type === 'text' || n.type === 'button' || n.type === 'link') && n.children.length === 0;
}

/** Inclusive range of ids between `a` and `b` within an ordered list (Shift-click in layers). */
export function rangeBetween(order: readonly NodeId[], a: NodeId, b: NodeId): NodeId[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return [b];
  return order.slice(Math.min(i, j), Math.max(i, j) + 1);
}
