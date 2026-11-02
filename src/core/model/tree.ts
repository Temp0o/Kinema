/**
 * Pure tree utilities over the flat node map. Mutating helpers are written to
 * work on Immer drafts (or plain objects) — they never replace `doc.nodes`.
 */
import type { KAnimation, KDocument, KNode, NodeId, Page } from './types';
import { uid, isContainerType } from './factory';

type NodeMap = Record<NodeId, KNode>;

/** JSON deep clone — works on Immer drafts too (structuredClone does not). */
export function deepClone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

export function getNode(doc: KDocument, id: NodeId | null | undefined): KNode | undefined {
  return id ? doc.nodes[id] : undefined;
}

/** Ancestor ids, nearest first (parent, grandparent, …, root). */
export function getAncestors(nodes: NodeMap, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  let cur = nodes[id]?.parent ?? null;
  const guard = new Set<NodeId>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    out.push(cur);
    cur = nodes[cur]?.parent ?? null;
  }
  return out;
}

export function isAncestor(nodes: NodeMap, ancestorId: NodeId, id: NodeId): boolean {
  return getAncestors(nodes, id).includes(ancestorId);
}

/** Root id (page frame or component master root) for a node. */
export function getRootId(nodes: NodeMap, id: NodeId): NodeId {
  const anc = getAncestors(nodes, id);
  return anc.length ? anc[anc.length - 1] : id;
}

/** id + all descendants in pre-order. */
export function getSubtreeIds(nodes: NodeMap, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    const n = nodes[cur];
    if (!n) continue;
    out.push(cur);
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
  return out;
}

export function getPageForNode(doc: KDocument, id: NodeId): Page | undefined {
  const root = getRootId(doc.nodes, id);
  return doc.pages.find((p) => p.rootId === root);
}

export function getComponentForNode(doc: KDocument, id: NodeId) {
  const root = getRootId(doc.nodes, id);
  return Object.values(doc.components).find((c) => c.rootId === root);
}

export function indexInParent(nodes: NodeMap, id: NodeId): number {
  const n = nodes[id];
  if (!n?.parent) return -1;
  return nodes[n.parent]?.children.indexOf(id) ?? -1;
}

/** Depth-first order index of every node under `rootId` — used to sort selections. */
export function treeOrder(nodes: NodeMap, rootId: NodeId): Map<NodeId, number> {
  const order = new Map<NodeId, number>();
  getSubtreeIds(nodes, rootId).forEach((id, i) => order.set(id, i));
  return order;
}

export function sortByTreeOrder(nodes: NodeMap, ids: NodeId[]): NodeId[] {
  if (ids.length < 2) return [...ids];
  const roots = new Set(ids.map((id) => getRootId(nodes, id)));
  const order = new Map<NodeId, number>();
  let offset = 0;
  for (const r of roots) {
    for (const [k, v] of treeOrder(nodes, r)) order.set(k, v + offset);
    offset += 1_000_000;
  }
  return [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** Drop ids whose ancestor is also in the list (keeps top-most). */
export function pruneDescendants(nodes: NodeMap, ids: NodeId[]): NodeId[] {
  const set = new Set(ids);
  return ids.filter((id) => !getAncestors(nodes, id).some((a) => set.has(a)));
}

export function canContain(nodes: NodeMap, parentId: NodeId, childId?: NodeId): boolean {
  const p = nodes[parentId];
  if (!p || !isContainerType(p.type)) return false;
  if (childId && (childId === parentId || isAncestor(nodes, childId, parentId))) return false;
  return true;
}

// ─── Mutations (draft-safe) ──────────────────────────────────────────────────

/** Insert an already-built subtree (`nodes` contains root + descendants) under parent at index. */
export function insertSubtree(
  doc: KDocument,
  sub: { rootId: NodeId; nodes: NodeMap },
  parentId: NodeId | null,
  index?: number,
): void {
  for (const n of Object.values(sub.nodes)) doc.nodes[n.id] = n;
  const root = doc.nodes[sub.rootId];
  root.parent = parentId;
  if (parentId) {
    const parent = doc.nodes[parentId];
    const i = index == null || index < 0 || index > parent.children.length ? parent.children.length : index;
    parent.children.splice(i, 0, sub.rootId);
  }
}

export function insertNode(doc: KDocument, node: KNode, parentId: NodeId | null, index?: number): void {
  insertSubtree(doc, { rootId: node.id, nodes: { [node.id]: node } }, parentId, index);
}

/** Remove node and its whole subtree. */
export function removeNode(doc: KDocument, id: NodeId): void {
  const n = doc.nodes[id];
  if (!n) return;
  if (n.parent) {
    const p = doc.nodes[n.parent];
    if (p) {
      const i = p.children.indexOf(id);
      if (i >= 0) p.children.splice(i, 1);
    }
  }
  for (const sid of getSubtreeIds(doc.nodes, id)) delete doc.nodes[sid];
}

/** Move node to new parent/index. Index refers to the final position in the new parent's children. */
export function moveNode(doc: KDocument, id: NodeId, newParentId: NodeId, index?: number): void {
  const n = doc.nodes[id];
  const np = doc.nodes[newParentId];
  if (!n || !np) return;
  if (id === newParentId || isAncestor(doc.nodes, id, newParentId)) return;
  if (n.parent) {
    const op = doc.nodes[n.parent];
    const i = op.children.indexOf(id);
    if (i >= 0) op.children.splice(i, 1);
  }
  const at = index == null || index < 0 || index > np.children.length ? np.children.length : index;
  np.children.splice(at, 0, id);
  n.parent = newParentId;
}

function cloneAnimations(anims: KAnimation[] | undefined): KAnimation[] | undefined {
  if (!anims) return undefined;
  return anims.map((a) => ({
    ...deepClone(a),
    id: uid('a'),
    keyframes: a.keyframes.map((k) => ({ ...deepClone(k), id: uid('k') })),
  }));
}

/**
 * Deep-clone a subtree from `source` with fresh ids. Instance overrides are keyed by
 * master ids, which are not part of the subtree, so they are preserved as-is.
 */
export function cloneSubtree(source: NodeMap, rootId: NodeId): { rootId: NodeId; nodes: NodeMap; idMap: Map<NodeId, NodeId> } {
  const ids = getSubtreeIds(source, rootId);
  const idMap = new Map<NodeId, NodeId>();
  for (const id of ids) idMap.set(id, uid());
  const nodes: NodeMap = {};
  for (const id of ids) {
    const src = source[id];
    const copy: KNode = deepClone(src) as KNode;
    copy.id = idMap.get(id)!;
    copy.parent = src.parent && idMap.has(src.parent) ? idMap.get(src.parent)! : null;
    copy.children = src.children.map((c) => idMap.get(c)!).filter(Boolean);
    copy.animations = cloneAnimations(src.animations);
    if (!copy.animations) delete copy.animations;
    nodes[copy.id] = copy;
  }
  return { rootId: idMap.get(rootId)!, nodes, idMap };
}

/** Extract a detached deep copy (same ids) of a subtree — for clipboard / library. */
export function extractSubtree(source: NodeMap, rootId: NodeId): { rootId: NodeId; nodes: NodeMap } {
  const nodes: NodeMap = {};
  for (const id of getSubtreeIds(source, rootId)) nodes[id] = deepClone(source[id]) as KNode;
  nodes[rootId].parent = null;
  return { rootId, nodes };
}

/** Collect all asset ids referenced by a subtree (src: asset:<id>, svg/background urls). */
export function collectAssetRefs(nodes: NodeMap, rootId: NodeId): Set<string> {
  const out = new Set<string>();
  const re = /asset:([a-z0-9_]+)/gi;
  for (const id of getSubtreeIds(nodes, rootId)) {
    const n = nodes[id];
    const hay = JSON.stringify([n.props, n.styles, n.states ?? null]);
    let m: RegExpExecArray | null;
    while ((m = re.exec(hay))) out.add(m[1]);
  }
  return out;
}

/** All ids referenced by instances under root (component ids). */
export function collectComponentRefs(nodes: NodeMap, rootId: NodeId): Set<string> {
  const out = new Set<string>();
  for (const id of getSubtreeIds(nodes, rootId)) {
    const n = nodes[id];
    if (n.type === 'instance' && n.props.componentId) out.add(n.props.componentId);
  }
  return out;
}

/** Validate & repair structural invariants. Returns list of problems fixed. */
export function repairDocument(doc: KDocument): string[] {
  const issues: string[] = [];
  const roots = new Set<NodeId>([...doc.pages.map((p) => p.rootId), ...Object.values(doc.components).map((c) => c.rootId)]);
  for (const n of Object.values(doc.nodes)) {
    n.children = n.children.filter((c) => {
      const ok = !!doc.nodes[c] && doc.nodes[c].parent === n.id;
      if (!ok) issues.push(`removed dangling child ${c} from ${n.id}`);
      return ok;
    });
    if (!n.styles) n.styles = { base: {} };
    if (!n.styles.base) n.styles.base = {};
    if (!n.props) n.props = {};
  }
  // orphans (no parent, not a root) → delete
  for (const n of Object.values(doc.nodes)) {
    if (n.parent === null && !roots.has(n.id)) {
      issues.push(`removed orphan ${n.id}`);
      for (const sid of getSubtreeIds(doc.nodes, n.id)) delete doc.nodes[sid];
    } else if (n.parent && !doc.nodes[n.parent]) {
      issues.push(`removed node with missing parent ${n.id}`);
      for (const sid of getSubtreeIds(doc.nodes, n.id)) delete doc.nodes[sid];
    } else if (n.parent && !doc.nodes[n.parent].children.includes(n.id)) {
      doc.nodes[n.parent].children.push(n.id);
      issues.push(`re-linked ${n.id} into parent`);
    }
  }
  return issues;
}
