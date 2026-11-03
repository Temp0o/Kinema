/**
 * Component (master / instance) actions. Every document change is one undo step.
 *
 * Public API for other modules:
 *  - createComponentFromNode / createComponentFromSelection
 *  - editComponent / exitComponentEditing / goToMaster
 *  - detachInstance / detachSelection
 *  - renameComponent / deleteComponent
 *  - insertInstance / buildInstanceSubtree (for drag payloads)
 *  - setInstanceTextOverride(instanceId, masterNodeId, html)
 *  - resetInstanceOverrides(instanceId)
 */
import { toast } from 'sonner';
import { docApi, useDoc } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { insertionTarget } from '@/core/store/actions';
import type { KDocument, KNode, NodeId } from '@/core/model/types';
import { getPageForNode, insertSubtree } from '@/core/model/tree';
import {
  cannotCreateComponentReason,
  componentOfInstance,
  createComponentInDraft,
  deleteComponentInDraft,
  detachInstanceInDraft,
  listInstances,
  makeInstanceNode,
  renameComponentInDraft,
  setInstanceTextOverrideInDraft,
  wouldCreateCycle,
} from './componentModel';

/** Where to return after leaving component isolation. */
let returnTo: { pageId: string | null; instanceId: NodeId | null } | null = null;

export function createComponentFromNode(nodeId: NodeId, name?: string): string | null {
  const doc = docApi.doc;
  const reason = cannotCreateComponentReason(doc, nodeId);
  if (reason) {
    toast.error('Can’t create component', { description: reason });
    return null;
  }
  const box: { r: ReturnType<typeof createComponentInDraft> } = { r: null };
  const label = `Create component “${name ?? doc.nodes[nodeId].name}”`;
  docApi.mutate(label, (d) => {
    box.r = createComponentInDraft(d as KDocument, nodeId, { name });
  });
  if (!box.r) return null;
  uiApi.state.select([box.r.instanceId]);
  return box.r.componentId;
}

export function createComponentFromSelection(): string | null {
  const sel = uiApi.state.selection;
  if (sel.length !== 1) {
    toast.error('Select a single layer to create a component');
    return null;
  }
  const id = createComponentFromNode(sel[0]);
  if (id) {
    const name = docApi.doc.components[id]?.name;
    toast.success(`Created component “${name}”`, {
      action: { label: 'Edit', onClick: () => editComponent(id) },
    });
  }
  return id;
}

/** Enter isolation mode for a component master. */
export function editComponent(componentId: string, opts: { fromInstanceId?: NodeId; selectRoot?: boolean } = {}) {
  const comp = docApi.doc.components[componentId];
  if (!comp) return;
  const ui = uiApi.state;
  const selectedOwn = ui.selection.find((id) => {
    const n = docApi.doc.nodes[id];
    return n?.type === 'instance' && n.props.componentId === componentId;
  });
  const from = opts.fromInstanceId ?? selectedOwn ?? null;
  if (!ui.editingComponentId) returnTo = { pageId: ui.activePageId, instanceId: from };
  else if (opts.fromInstanceId && returnTo) returnTo.instanceId ??= opts.fromInstanceId;
  uiApi.set({
    editingComponentId: componentId,
    selection: opts.selectRoot ? [comp.rootId] : [],
    hoverId: null,
    editingTextId: null,
    leftTab: ui.leftTab,
  });
}

export function exitComponentEditing() {
  const ui = uiApi.state;
  if (!ui.editingComponentId) return;
  const doc = docApi.doc;
  const back = returnTo;
  returnTo = null;
  const pageId = back?.pageId && doc.pages.some((p) => p.id === back.pageId) ? back.pageId : doc.pages[0]?.id ?? null;
  const editing = ui.editingComponentId;
  const inst =
    back?.instanceId && doc.nodes[back.instanceId]
      ? back.instanceId
      : (listInstances(doc, editing).find((n) => !!n.parent && !!getPageForNode(doc, n.id))?.id ?? null);
  const instPage = inst ? getPageForNode(doc, inst)?.id : null;
  uiApi.set({
    editingComponentId: null,
    activePageId: instPage ?? pageId,
    selection: inst ? [inst] : [],
    hoverId: null,
    editingTextId: null,
  });
}

export function goToMaster(instanceId: NodeId) {
  const comp = componentOfInstance(docApi.doc, instanceId);
  if (!comp) {
    toast.error('This instance’s component is missing');
    return;
  }
  editComponent(comp.id, { fromInstanceId: instanceId, selectRoot: true });
}

export function detachInstance(instanceId: NodeId): NodeId | null {
  const doc = docApi.doc;
  const inst = doc.nodes[instanceId];
  if (!inst || inst.type !== 'instance') return null;
  let newId: NodeId | null = null;
  docApi.mutate(`Detach “${inst.name}”`, (d) => {
    newId = detachInstanceInDraft(d as KDocument, instanceId);
  });
  if (newId) uiApi.state.select([newId]);
  return newId;
}

export function detachSelection() {
  const doc = docApi.doc;
  const ids = uiApi.state.selection.filter((id) => doc.nodes[id]?.type === 'instance');
  if (!ids.length) return;
  const created: NodeId[] = [];
  docApi.mutate(ids.length > 1 ? `Detach ${ids.length} instances` : `Detach “${doc.nodes[ids[0]].name}”`, (d) => {
    for (const id of ids) {
      const n = detachInstanceInDraft(d as KDocument, id);
      if (n) created.push(n);
    }
  });
  uiApi.state.select(created);
}

export function renameComponent(componentId: string, name: string) {
  const comp = docApi.doc.components[componentId];
  if (!comp || !name.trim() || name.trim() === comp.name) return;
  docApi.mutate('Rename component', (d) => renameComponentInDraft(d as KDocument, componentId, name));
}

export function deleteComponent(componentId: string) {
  const comp = docApi.doc.components[componentId];
  if (!comp) return;
  if (uiApi.state.editingComponentId === componentId) exitComponentEditing();
  let detached = 0;
  docApi.mutate(`Delete component “${comp.name}”`, (d) => {
    detached = deleteComponentInDraft(d as KDocument, componentId);
  });
  toast(`Deleted component “${comp.name}”`, {
    description: detached ? `${detached} instance${detached === 1 ? ' was' : 's were'} detached.` : undefined,
    action: { label: 'Undo', onClick: () => useDoc.getState().undo() },
  });
}

/** For the canvas team: edit text of a master node inside one instance only. */
export function setInstanceTextOverride(instanceId: NodeId, masterNodeId: NodeId, html: string) {
  docApi.mutate('Edit instance text', (d) => setInstanceTextOverrideInDraft(d as KDocument, instanceId, masterNodeId, html), {
    coalesceKey: `inst-text:${instanceId}:${masterNodeId}`,
  });
}

export function resetInstanceOverrides(instanceId: NodeId) {
  const n = docApi.doc.nodes[instanceId];
  if (!n?.overrides) return;
  docApi.mutate('Reset overrides', (d) => {
    delete d.nodes[instanceId].overrides;
  });
}

export function instanceCount(doc: KDocument, componentId: string): number {
  return listInstances(doc, componentId).length;
}

/** Fresh-id subtree containing one instance (for drag payloads). */
export function buildInstanceSubtree(componentId: string): { rootId: NodeId; nodes: Record<NodeId, KNode> } {
  const comp = docApi.doc.components[componentId];
  const n = makeInstanceNode(componentId, comp?.name ?? 'Instance');
  return { rootId: n.id, nodes: { [n.id]: n } };
}

/** Insert an instance at the current insertion point (or the given parent). */
export function insertInstance(componentId: string, target?: { parentId: NodeId; index?: number }, label?: string): NodeId | null {
  const doc = docApi.doc;
  const comp = doc.components[componentId];
  if (!comp) return null;
  const t = target ?? insertionTarget();
  if (!t) return null;
  if (wouldCreateCycle(doc, componentId, t.parentId)) {
    toast.error('A component can’t contain an instance of itself');
    return null;
  }
  const sub = buildInstanceSubtree(componentId);
  docApi.mutate(label ?? `Insert “${comp.name}”`, (d) => insertSubtree(d as KDocument, sub, t.parentId, t.index));
  uiApi.state.select([sub.rootId]);
  return sub.rootId;
}

/** The selected instance (single selection), if any. */
export function selectedInstance(): KNode | null {
  const sel = uiApi.state.selection;
  if (sel.length !== 1) return null;
  const n = docApi.doc.nodes[sel[0]];
  return n?.type === 'instance' ? n : null;
}
