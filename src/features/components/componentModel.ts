/**
 * Pure (Immer-draft-safe) component operations: master/instance creation,
 * materialising (detaching) instances, deletion. The action layer
 * (`componentActions.ts`) wraps these in single `mutate()` calls.
 *
 * Model recap:
 *  - A component master is a node subtree in `doc.nodes` whose root has
 *    `parent: null` and is registered in `doc.components[id].rootId`.
 *  - An instance is a node `{ type: 'instance', props: { componentId } }`. Its own
 *    styles are merged on top of the master root's styles when rendering
 *    (placement: position / size / margins / flex item props), and
 *    `overrides[masterNodeId]` patch text / src / styles of master nodes.
 */
import type { Breakpoint, InstanceOverride, KComponent, KDocument, KNode, NodeId, StyleMap } from '@/core/model/types';
import { createNode, uid } from '@/core/model/factory';
import { cloneSubtree, deepClone, getSubtreeIds, removeNode } from '@/core/model/tree';

type NodeMap = Record<NodeId, KNode>;
type BpStyles = Record<string, StyleMap>;

/** Placement properties: they belong to where a component is used, not to the component. */
export const PLACEMENT_PROPS: ReadonlySet<string> = new Set([
  'position',
  'left',
  'top',
  'right',
  'bottom',
  'inset',
  'z-index',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-inline',
  'margin-block',
  'flex',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'align-self',
  'justify-self',
  'place-self',
  'order',
  'grid-area',
  'grid-column',
  'grid-row',
  'grid-column-start',
  'grid-column-end',
  'grid-row-start',
  'grid-row-end',
  'rotate',
  'translate',
]);

/** Size properties are copied to both the instance (its own size) and the master (isolation view). */
export const SIZE_PROPS: ReadonlySet<string> = new Set(['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height']);

/** Split a node's per-breakpoint styles into instance placement + master visual styles. */
export function splitPlacementStyles(styles: BpStyles): { instance: BpStyles; master: BpStyles } {
  const instance: BpStyles = {};
  const master: BpStyles = {};
  for (const [bp, map] of Object.entries(styles)) {
    const inst: StyleMap = {};
    const mast: StyleMap = {};
    for (const [k, v] of Object.entries(map ?? {})) {
      if (PLACEMENT_PROPS.has(k)) {
        inst[k] = v;
        // keep a containing block for absolutely positioned children in isolation
        if (k === 'position' && v !== 'static') mast.position = 'relative';
      } else if (SIZE_PROPS.has(k)) {
        inst[k] = v;
        mast[k] = v;
      } else mast[k] = v;
    }
    if (bp === 'base' || Object.keys(inst).length) instance[bp] = inst;
    if (bp === 'base' || Object.keys(mast).length) master[bp] = mast;
  }
  if (!instance.base) instance.base = {};
  if (!master.base) master.base = {};
  return { instance, master };
}

/** Strip placement props from a style set (used for library component roots). */
export function stripPlacement(styles: BpStyles): BpStyles {
  return splitPlacementStyles(styles).master;
}

export function findComponentRoots(doc: Pick<KDocument, 'components'>): Set<NodeId> {
  return new Set(Object.values(doc.components).map((c) => c.rootId));
}

export function listInstances(doc: Pick<KDocument, 'nodes'>, componentId: string): KNode[] {
  return Object.values(doc.nodes).filter((n) => n.type === 'instance' && n.props.componentId === componentId);
}

export function componentOfInstance(doc: Pick<KDocument, 'nodes' | 'components'>, instanceId: NodeId): KComponent | undefined {
  const n = doc.nodes[instanceId];
  if (!n || n.type !== 'instance' || !n.props.componentId) return undefined;
  return doc.components[n.props.componentId];
}

/** Why a node can't become a component (or null when it can). */
export function cannotCreateComponentReason(doc: KDocument, nodeId: NodeId): string | null {
  const n = doc.nodes[nodeId];
  if (!n) return 'Nothing selected';
  if (!n.parent) return 'Pages and component masters can’t be turned into components';
  if (n.type === 'instance') return 'This layer is already a component instance';
  return null;
}

export interface CreateComponentResult {
  componentId: string;
  instanceId: NodeId;
}

/**
 * Turn `nodeId` into a component: its subtree becomes the master (same ids) and it
 * is replaced in place by an instance that keeps the placement styles.
 */
export function createComponentInDraft(
  d: KDocument,
  nodeId: NodeId,
  opts: { name?: string; componentId?: string; instanceId?: NodeId; now?: number } = {},
): CreateComponentResult | null {
  if (cannotCreateComponentReason(d, nodeId)) return null;
  const node = d.nodes[nodeId];
  const parent = d.nodes[node.parent!];
  const index = parent.children.indexOf(nodeId);
  const name = (opts.name ?? node.name).trim() || 'Component';
  const componentId = opts.componentId ?? uid('c');

  const { instance: instStyles, master: masterStyles } = splitPlacementStyles(deepClone(node.styles));
  const inst = createNode('instance', { id: opts.instanceId, name, replaceStyles: true, styles: {}, props: { componentId } });
  inst.styles = instStyles;
  inst.parent = parent.id;
  if (node.hidden) inst.hidden = true;
  if (node.locked) inst.locked = true;

  // master root: detach from page
  node.styles = masterStyles;
  node.parent = null;
  node.name = name;
  delete node.hidden;
  delete node.locked;

  d.nodes[inst.id] = inst;
  parent.children.splice(index, 1, inst.id);
  d.components[componentId] = { id: componentId, name, rootId: node.id, createdAt: opts.now ?? Date.now() };
  return { componentId, instanceId: inst.id };
}

/** Breakpoint ids in cascade order (base first), including stray ids present in styles. */
function bpOrder(breakpoints: Pick<Breakpoint, 'id'>[], ...maps: BpStyles[]): string[] {
  const order = breakpoints.map((b) => b.id);
  if (!order.includes('base')) order.unshift('base');
  for (const m of maps) for (const k of Object.keys(m)) if (!order.includes(k)) order.push(k);
  return order;
}

/**
 * Merge an instance's root styles on top of the master root styles so that the
 * merged node renders exactly like the instance at every breakpoint.
 */
export function mergeInstanceRootStyles(master: BpStyles, inst: BpStyles, breakpoints: Pick<Breakpoint, 'id'>[]): BpStyles {
  const out: BpStyles = {};
  const instDefined = new Set<string>();
  for (const bp of bpOrder(breakpoints, master, inst)) {
    for (const k of Object.keys(inst[bp] ?? {})) instDefined.add(k);
    const m: StyleMap = { ...(master[bp] ?? {}) };
    for (const k of instDefined) delete m[k];
    Object.assign(m, inst[bp] ?? {});
    if (bp === 'base' || Object.keys(m).length) out[bp] = m;
  }
  return out;
}

function applyOverride(n: KNode, ov: InstanceOverride) {
  if (ov.text !== undefined) n.props.text = ov.text;
  if (ov.src !== undefined) n.props.src = ov.src;
  if (ov.styles && Object.keys(ov.styles).length) {
    // overrides apply at every breakpoint, on top of everything
    n.styles.base = { ...(n.styles.base ?? {}), ...ov.styles };
    for (const bp of Object.keys(n.styles)) {
      if (bp === 'base') continue;
      for (const k of Object.keys(ov.styles)) delete n.styles[bp][k];
      if (!Object.keys(n.styles[bp]).length) delete n.styles[bp];
    }
  }
}

/**
 * Build a detached, fresh-id copy of what an instance renders (master clone +
 * instance root styles + overrides). Root has `parent: null`.
 */
export function materializeInstance(
  doc: Pick<KDocument, 'nodes' | 'components' | 'breakpoints'>,
  instanceId: NodeId,
): { rootId: NodeId; nodes: NodeMap; idMap: Map<NodeId, NodeId> } | null {
  const inst = doc.nodes[instanceId];
  if (!inst || inst.type !== 'instance') return null;
  const comp = inst.props.componentId ? doc.components[inst.props.componentId] : undefined;
  if (!comp || !doc.nodes[comp.rootId]) return null;
  const clone = cloneSubtree(doc.nodes as NodeMap, comp.rootId);
  const root = clone.nodes[clone.rootId];
  root.parent = null;
  root.styles = mergeInstanceRootStyles(deepClone(root.styles), deepClone(inst.styles), doc.breakpoints);
  root.name = inst.name;
  if (inst.hidden) root.hidden = true;
  else delete root.hidden;
  if (inst.locked) root.locked = true;
  if (inst.animations?.length) {
    const own = cloneSubtree({ [inst.id]: inst } as NodeMap, inst.id).nodes;
    const instAnims = Object.values(own)[0].animations ?? [];
    root.animations = [...(root.animations ?? []), ...instAnims];
  }
  for (const [masterId, ov] of Object.entries(inst.overrides ?? {})) {
    const newId = clone.idMap.get(masterId);
    if (newId && clone.nodes[newId]) applyOverride(clone.nodes[newId], ov);
  }
  delete root.meta?.libraryItemId;
  return clone;
}

/** Replace an instance (in its parent) with a materialised copy. Returns the new root id. */
export function detachInstanceInDraft(d: KDocument, instanceId: NodeId): NodeId | null {
  const inst = d.nodes[instanceId];
  if (!inst?.parent) return null;
  const mat = materializeInstance(d, instanceId);
  if (!mat) return null;
  const parent = d.nodes[inst.parent];
  const index = parent.children.indexOf(instanceId);
  for (const n of Object.values(mat.nodes)) d.nodes[n.id] = n;
  mat.nodes[mat.rootId].parent = parent.id;
  d.nodes[mat.rootId].parent = parent.id;
  parent.children.splice(index, 1, mat.rootId);
  delete d.nodes[instanceId];
  return mat.rootId;
}

/** Delete a component: detach all its instances first, then remove the master. */
export function deleteComponentInDraft(d: KDocument, componentId: string): number {
  const comp = d.components[componentId];
  if (!comp) return 0;
  const masterIds = new Set(getSubtreeIds(d.nodes, comp.rootId));
  const instances = listInstances(d, componentId).filter((n) => !masterIds.has(n.id));
  let detached = 0;
  for (const inst of instances) if (detachInstanceInDraft(d, inst.id)) detached++;
  // instances of the component inside its own master can't exist (cycle), but be safe
  for (const id of masterIds) {
    const n = d.nodes[id];
    if (n?.type === 'instance' && n.props.componentId === componentId) removeNode(d, id);
  }
  removeNode(d, comp.rootId);
  delete d.components[componentId];
  return detached;
}

export function renameComponentInDraft(d: KDocument, componentId: string, name: string) {
  const comp = d.components[componentId];
  const n = name.trim();
  if (!comp || !n) return;
  comp.name = n;
  const root = d.nodes[comp.rootId];
  if (root) root.name = n;
}

/** Set (or clear when equal to the master's text) an instance text override. */
export function setInstanceTextOverrideInDraft(d: KDocument, instanceId: NodeId, masterNodeId: NodeId, html: string) {
  const inst = d.nodes[instanceId];
  if (!inst || inst.type !== 'instance') return;
  const master = d.nodes[masterNodeId];
  inst.overrides ??= {};
  const ov = (inst.overrides[masterNodeId] ??= {});
  if (master && (master.props.text ?? '') === html) delete ov.text;
  else ov.text = html;
  if (!Object.keys(ov).length) delete inst.overrides[masterNodeId];
  if (!Object.keys(inst.overrides).length) delete inst.overrides;
}

/** A fresh instance node for a component (empty placement → renders at the master's size). */
export function makeInstanceNode(componentId: string, name: string, styles: StyleMap = {}): KNode {
  const n = createNode('instance', { name, replaceStyles: true, styles, props: { componentId } });
  return n;
}

/** Would inserting an instance of `componentId` under `parentId` create a cycle? */
export function wouldCreateCycle(doc: Pick<KDocument, 'nodes' | 'components'>, componentId: string, parentId: NodeId): boolean {
  // root of the parent
  let cur: NodeId | null = parentId;
  let root = parentId;
  const guard = new Set<NodeId>();
  while (cur && !guard.has(cur)) {
    guard.add(cur);
    root = cur;
    cur = doc.nodes[cur]?.parent ?? null;
  }
  const hostComp = Object.values(doc.components).find((c) => c.rootId === root);
  if (!hostComp) return false;
  if (hostComp.id === componentId) return true;
  // does componentId's master (transitively) contain an instance of hostComp?
  const seen = new Set<string>();
  const visit = (cid: string): boolean => {
    if (seen.has(cid)) return false;
    seen.add(cid);
    const c = doc.components[cid];
    if (!c) return false;
    for (const id of getSubtreeIds(doc.nodes as NodeMap, c.rootId)) {
      const n = doc.nodes[id];
      if (n.type === 'instance' && n.props.componentId) {
        if (n.props.componentId === hostComp.id) return true;
        if (visit(n.props.componentId)) return true;
      }
    }
    return false;
  };
  return visit(componentId);
}
