/**
 * Pure tree utilities over the flat node map. Mutating helpers are written to
 * work on Immer drafts (or plain objects) — they never replace `doc.nodes`.
 */
import type { KAnimation, KComponent, KDocument, KNode, NodeId, Page } from './types';
import { uid, isContainerType, createPage, DEFAULT_TOKENS, DEFAULT_BREAKPOINTS } from './factory';

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
  const seen = new Set<NodeId>();
  while (stack.length) {
    const cur = stack.pop()!;
    const n = nodes[cur];
    if (!n || seen.has(cur)) continue;
    seen.add(cur);
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

const NODE_TYPES = new Set(['frame', 'box', 'text', 'button', 'link', 'image', 'svg', 'input', 'textarea', 'select', 'video', 'instance']);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Validate & repair structural invariants (also used on imported / pasted / saved data, so it
 * tolerates malformed shapes). Returns the list of problems fixed; an empty list means the
 * document was already sound.
 */
export function repairDocument(doc: KDocument): string[] {
  const issues: string[] = [];
  const d = doc as any;
  if (!Array.isArray(d.pages)) (d.pages = []), issues.push('pages was not a list');
  if (!isObj(d.nodes)) (d.nodes = {}), issues.push('nodes was not a map');
  if (!isObj(d.components)) (d.components = {}), issues.push('components was not a map');
  if (!isObj(d.assets)) (d.assets = {}), issues.push('assets was not a map');
  if (!isObj(d.settings)) (d.settings = { gridSize: 8, title: 'Untitled' }), issues.push('settings missing');
  if (!isObj(d.tokens) || !Array.isArray(d.tokens.colors) || !isObj(d.tokens.fonts)) (d.tokens = structuredClone(DEFAULT_TOKENS)), issues.push('tokens missing');
  if (!Array.isArray(d.breakpoints) || !d.breakpoints.length || d.breakpoints[0]?.id !== 'base') (d.breakpoints = structuredClone(DEFAULT_BREAKPOINTS)), issues.push('breakpoints missing');
  if (typeof d.version !== 'number') d.version = 1;

  // prototype-pollution style keys never belong in a document
  for (const bag of [d.nodes, d.components, d.assets]) {
    for (const k of ['__proto__', 'constructor', 'prototype']) {
      if (Object.prototype.hasOwnProperty.call(bag, k)) {
        delete bag[k];
        issues.push(`removed key ${k}`);
      }
    }
  }

  // entries must be objects keyed by their own id
  for (const [key, n] of Object.entries(doc.nodes)) {
    if (!isObj(n)) {
      delete doc.nodes[key];
      issues.push(`removed invalid node ${key}`);
      continue;
    }
    if (n.id !== key) (n.id = key), issues.push(`fixed id of ${key}`);
    if (!NODE_TYPES.has(n.type)) (n.type = 'box'), issues.push(`fixed type of ${key}`);
    if (typeof n.name !== 'string') n.name = String(n.name ?? n.type);
    if (!Array.isArray(n.children)) (n.children = []), issues.push(`fixed children of ${key}`);
    if (n.parent === undefined) n.parent = null;
    if (!isObj(n.styles)) (n.styles = { base: {} }), issues.push(`fixed styles of ${key}`);
    if (!isObj(n.styles.base)) n.styles.base = {};
    if (!isObj(n.props)) (n.props = {}), issues.push(`fixed props of ${key}`);
    if (n.animations !== undefined && !Array.isArray(n.animations)) (delete n.animations, issues.push(`dropped animations of ${key}`));
  }

  // pages and components need a root node
  const goodPages = doc.pages.filter((p) => isObj(p) && typeof p.rootId === 'string' && !!doc.nodes[p.rootId]);
  if (goodPages.length !== doc.pages.length) {
    issues.push('removed pages without a root');
    doc.pages.splice(0, doc.pages.length, ...goodPages);
  }
  for (const [cid, c] of Object.entries(doc.components)) {
    if (!isObj(c) || typeof c.rootId !== 'string' || !doc.nodes[c.rootId]) {
      delete doc.components[cid];
      issues.push(`removed component ${cid} without a master`);
    } else if (c.id !== cid) {
      c.id = cid;
      issues.push(`fixed id of component ${cid}`);
    }
  }
  const roots = new Set<NodeId>([...doc.pages.map((p) => p.rootId), ...Object.values(doc.components).map((c) => c.rootId)]);
  for (const r of roots) {
    const rn = doc.nodes[r];
    if (rn.parent !== null) (rn.parent = null), issues.push(`detached root ${r}`);
  }

  for (const n of Object.values(doc.nodes)) {
    const seen = new Set<NodeId>();
    n.children = n.children.filter((c) => {
      const ok = typeof c === 'string' && !!doc.nodes[c] && doc.nodes[c].parent === n.id && !seen.has(c) && !roots.has(c);
      if (ok) seen.add(c);
      else issues.push(`removed dangling child ${String(c)} from ${n.id}`);
      return ok;
    });
  }
  // orphans (no parent, not a root) → delete
  for (const n of Object.values(doc.nodes)) {
    if (!doc.nodes[n.id]) continue; // already removed with an earlier subtree
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
  // anything not reachable from a root (parent cycles, detached loops) → delete
  const reachable = new Set<NodeId>();
  for (const r of roots) for (const id of getSubtreeIds(doc.nodes, r)) reachable.add(id);
  for (const id of Object.keys(doc.nodes)) {
    if (!reachable.has(id)) {
      delete doc.nodes[id];
      issues.push(`removed unreachable node ${id}`);
    }
  }
  for (const n of Object.values(doc.nodes)) n.children = n.children.filter((c) => !!doc.nodes[c]);

  if (!doc.pages.length) {
    const { page, root } = createPage('Home');
    doc.nodes[root.id] = root;
    doc.pages.push(page);
    issues.push('added a page (the document had none)');
  }
  return issues;
}

/**
 * Repair a detached set of nodes (clipboard payload, library item) in place so that every
 * `rootIds` entry is the root of a sound tree. Returns the roots that survived.
 */
export function repairNodeSet(nodes: Record<NodeId, KNode>, rootIds: NodeId[], components: Record<string, KComponent> = {}): NodeId[] {
  if (!isObj(nodes)) return [];
  const rootsOk = rootIds.filter((r) => typeof r === 'string' && isObj((nodes as any)[r]));
  if (!rootsOk.length) return [];
  const pseudo = {
    version: 1,
    pages: rootsOk.map((r) => ({ id: `_${r}`, name: r, rootId: r })),
    nodes,
    components: isObj(components) ? components : {},
    assets: {},
    tokens: DEFAULT_TOKENS,
    breakpoints: DEFAULT_BREAKPOINTS,
    settings: { gridSize: 8, title: '' },
  } as unknown as KDocument;
  repairDocument(pseudo);
  return pseudo.pages.map((p) => p.rootId);
}
