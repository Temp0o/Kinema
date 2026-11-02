/**
 * Shared editor actions. Feature modules may add their own action files, but
 * anything generic (node CRUD, styles, pages, animations) lives here.
 */
import type { Draft } from 'immer';
import { docApi, useDoc } from './docStore';
import { uiApi, useUI } from './uiStore';
import type { BreakpointId, KAnimation, KDocument, KNode, NodeId, NodeProps } from '../model/types';
import { createNode, createPage, uid } from '../model/factory';
import {
  cloneSubtree,
  getAncestors,
  getSubtreeIds,
  indexInParent,
  insertSubtree,
  moveNode,
  pruneDescendants,
  removeNode,
  sortByTreeOrder,
  canContain,
} from '../model/tree';

// ─── Context ────────────────────────────────────────────────────────────────

/** Root node id currently shown on the canvas (page frame or component master). */
export function currentRootId(): NodeId | null {
  const ui = uiApi.state;
  const doc = docApi.doc;
  if (ui.editingComponentId) return doc.components[ui.editingComponentId]?.rootId ?? null;
  const page = doc.pages.find((p) => p.id === ui.activePageId) ?? doc.pages[0];
  return page?.rootId ?? null;
}

export function useCurrentRootId(): NodeId | null {
  return useUI((ui) => {
    const doc = useDoc.getState().doc;
    if (ui.editingComponentId) return doc.components[ui.editingComponentId]?.rootId ?? null;
    const page = doc.pages.find((p) => p.id === ui.activePageId) ?? doc.pages[0];
    return page?.rootId ?? null;
  });
}

export function selectedNodes(): KNode[] {
  const doc = docApi.doc;
  return uiApi.state.selection.map((id) => doc.nodes[id]).filter(Boolean);
}

/** Breakpoint edits currently target. */
export function activeBreakpoint(): BreakpointId {
  return uiApi.state.breakpoint;
}

/** Best parent for inserting new content: selected container, selected node's parent, or root. */
export function insertionTarget(): { parentId: NodeId; index?: number } | null {
  const doc = docApi.doc;
  const root = currentRootId();
  if (!root) return null;
  const sel = uiApi.state.selection;
  if (sel.length === 1) {
    const n = doc.nodes[sel[0]];
    if (n && canContain(doc.nodes, n.id) && n.type !== 'button' && n.type !== 'link') return { parentId: n.id };
    if (n?.parent) return { parentId: n.parent, index: indexInParent(doc.nodes, n.id) + 1 };
  }
  return { parentId: root };
}

// ─── Node CRUD ──────────────────────────────────────────────────────────────

export function addNode(node: KNode, parentId: NodeId, index?: number, opts: { select?: boolean; label?: string } = {}) {
  docApi.mutate(opts.label ?? `Add ${node.name}`, (d) => insertSubtree(d as KDocument, { rootId: node.id, nodes: { [node.id]: node } }, parentId, index));
  if (opts.select !== false) uiApi.state.select([node.id]);
}

export function addSubtree(
  sub: { rootId: NodeId; nodes: Record<NodeId, KNode> },
  parentId: NodeId,
  index?: number,
  opts: { select?: boolean; label?: string; ai?: boolean } = {},
) {
  docApi.mutate(opts.label ?? 'Insert', (d) => insertSubtree(d as KDocument, sub, parentId, index), { ai: opts.ai });
  if (opts.select !== false) uiApi.state.select([sub.rootId]);
}

export function insertNewNode(type: KNode['type'], init?: Parameters<typeof createNode>[1]) {
  const target = insertionTarget();
  if (!target) return null;
  const node = createNode(type, init);
  addNode(node, target.parentId, target.index);
  return node.id;
}

export function deleteNodes(ids: NodeId[]) {
  const doc = docApi.doc;
  const roots = new Set([...doc.pages.map((p) => p.rootId), ...Object.values(doc.components).map((c) => c.rootId)]);
  const targets = pruneDescendants(doc.nodes, ids).filter((id) => !roots.has(id) && !doc.nodes[id]?.locked);
  if (!targets.length) return;
  docApi.mutate(targets.length > 1 ? `Delete ${targets.length} layers` : `Delete ${doc.nodes[targets[0]].name}`, (d) => {
    for (const id of targets) removeNode(d as KDocument, id);
  });
  uiApi.state.select(uiApi.state.selection.filter((id) => !!docApi.doc.nodes[id]));
}

export function deleteSelection() {
  deleteNodes(uiApi.state.selection);
}

/** Duplicate nodes in place (inserted right after each original). Offsets absolutely positioned copies. */
export function duplicateNodes(ids: NodeId[], opts: { offset?: number } = {}): NodeId[] {
  const doc = docApi.doc;
  const roots = new Set(doc.pages.map((p) => p.rootId));
  const targets = sortByTreeOrder(doc.nodes, pruneDescendants(doc.nodes, ids)).filter((id) => !roots.has(id));
  if (!targets.length) return [];
  const created: NodeId[] = [];
  const offset = opts.offset ?? 16;
  docApi.mutate(targets.length > 1 ? `Duplicate ${targets.length} layers` : `Duplicate ${doc.nodes[targets[0]].name}`, (d) => {
    for (const id of [...targets].reverse()) {
      const src = d.nodes[id];
      if (!src.parent) continue;
      const clone = cloneSubtree(d.nodes as Record<NodeId, KNode>, id);
      const root = clone.nodes[clone.rootId];
      root.name = src.name;
      const base = root.styles.base;
      if (base.position === 'absolute' && offset) {
        const l = parseFloat(base.left ?? '0');
        const t = parseFloat(base.top ?? '0');
        if (!Number.isNaN(l)) base.left = `${l + offset}px`;
        if (!Number.isNaN(t)) base.top = `${t + offset}px`;
      }
      const idx = d.nodes[src.parent].children.indexOf(id);
      insertSubtree(d as KDocument, clone, src.parent, idx + 1);
      created.unshift(clone.rootId);
    }
  });
  uiApi.state.select(created);
  return created;
}

export function moveNodes(ids: NodeId[], parentId: NodeId, index?: number, label = 'Move') {
  const doc = docApi.doc;
  const targets = sortByTreeOrder(doc.nodes, pruneDescendants(doc.nodes, ids)).filter((id) => canContain(doc.nodes, parentId, id));
  if (!targets.length) return;
  docApi.mutate(label, (d) => {
    let at = index;
    for (const id of targets) {
      const cur = d.nodes[id];
      // account for removal shifting the index when moving within the same parent
      if (at != null && cur.parent === parentId) {
        const ci = d.nodes[parentId].children.indexOf(id);
        if (ci >= 0 && ci < at) at -= 1;
      }
      moveNode(d as KDocument, id, parentId, at);
      if (at != null) at += 1;
    }
  });
}

/** Reorder within parent: 'forward' | 'backward' | 'front' | 'back'. (Later children render on top.) */
export function reorderNodes(ids: NodeId[], dir: 'forward' | 'backward' | 'front' | 'back') {
  const doc = docApi.doc;
  const targets = pruneDescendants(doc.nodes, ids).filter((id) => doc.nodes[id]?.parent);
  if (!targets.length) return;
  docApi.mutate('Reorder', (d) => {
    const ordered = sortByTreeOrder(d.nodes as Record<NodeId, KNode>, targets);
    const list = dir === 'forward' || dir === 'front' ? [...ordered].reverse() : ordered;
    for (const id of list) {
      const p = d.nodes[d.nodes[id].parent!];
      const i = p.children.indexOf(id);
      p.children.splice(i, 1);
      let ni = i;
      if (dir === 'forward') ni = Math.min(p.children.length, i + 1);
      else if (dir === 'backward') ni = Math.max(0, i - 1);
      else if (dir === 'front') ni = p.children.length;
      else ni = 0;
      p.children.splice(ni, 0, id);
    }
  });
}

// ─── Styles & props ─────────────────────────────────────────────────────────

function writeStyle(n: Draft<KNode>, bp: BreakpointId, prop: string, value: string | null | undefined) {
  if (!n.styles[bp]) n.styles[bp] = {};
  const map = n.styles[bp];
  if (value === undefined || value === null || value === '') delete map[prop];
  else map[prop] = value;
  if (bp !== 'base' && Object.keys(map).length === 0) delete n.styles[bp];
}

/** Set (or clear with null/'') a style property on nodes at a breakpoint (default: active). */
export function setStyle(
  ids: NodeId[],
  prop: string,
  value: string | null,
  opts: { bp?: BreakpointId; coalesce?: boolean; label?: string } = {},
) {
  const bp = opts.bp ?? activeBreakpoint();
  docApi.mutate(
    opts.label ?? `Change ${prop}`,
    (d) => {
      for (const id of ids) {
        const n = d.nodes[id];
        if (n) writeStyle(n, bp, prop, value);
      }
    },
    { coalesceKey: opts.coalesce === false ? undefined : `style:${ids.join(',')}:${prop}:${bp}` },
  );
}

/** Set many style properties at once (null/'' clears). */
export function setStyles(
  ids: NodeId[],
  map: Record<string, string | null>,
  opts: { bp?: BreakpointId; coalesceKey?: string; label?: string } = {},
) {
  const bp = opts.bp ?? activeBreakpoint();
  docApi.mutate(
    opts.label ?? 'Change styles',
    (d) => {
      for (const id of ids) {
        const n = d.nodes[id];
        if (!n) continue;
        for (const [k, v] of Object.entries(map)) writeStyle(n, bp, k, v);
      }
    },
    { coalesceKey: opts.coalesceKey },
  );
}

/** Replace an interaction state style map entry. */
export function setStateStyle(ids: NodeId[], state: 'hover' | 'active' | 'focus', prop: string, value: string | null) {
  docApi.mutate(
    `Change ${state} ${prop}`,
    (d) => {
      for (const id of ids) {
        const n = d.nodes[id];
        if (!n) continue;
        if (!n.states) n.states = {};
        const map = (n.states[state] ??= {});
        if (value == null || value === '') delete map[prop];
        else map[prop] = value;
        if (Object.keys(map).length === 0) delete n.states[state];
      }
    },
    { coalesceKey: `state:${ids.join(',')}:${state}:${prop}` },
  );
}

/** Clear all overrides for a breakpoint (or one prop) on nodes. */
export function resetBreakpointOverrides(ids: NodeId[], bp: BreakpointId, prop?: string) {
  if (bp === 'base') return;
  docApi.mutate('Reset overrides', (d) => {
    for (const id of ids) {
      const n = d.nodes[id];
      if (!n?.styles[bp]) continue;
      if (prop) {
        delete n.styles[bp][prop];
        if (!Object.keys(n.styles[bp]).length) delete n.styles[bp];
      } else delete n.styles[bp];
    }
  });
}

export function setProps(ids: NodeId[], patch: Partial<NodeProps>, opts: { label?: string; coalesceKey?: string } = {}) {
  docApi.mutate(
    opts.label ?? 'Edit content',
    (d) => {
      for (const id of ids) {
        const n = d.nodes[id];
        if (!n) continue;
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) delete (n.props as Record<string, unknown>)[k];
          else (n.props as Record<string, unknown>)[k] = v as never;
        }
      }
    },
    { coalesceKey: opts.coalesceKey },
  );
}

export function setNodeFields(ids: NodeId[], patch: Partial<Pick<KNode, 'name' | 'tag' | 'hidden' | 'locked'>>, label = 'Edit layer') {
  docApi.mutate(label, (d) => {
    for (const id of ids) {
      const n = d.nodes[id];
      if (!n) continue;
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) delete (n as unknown as Record<string, unknown>)[k];
        else (n as unknown as Record<string, unknown>)[k] = v;
      }
    }
  });
}

export function renameNode(id: NodeId, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  setNodeFields([id], { name: trimmed }, 'Rename layer');
}

// ─── Grouping (structure only; canvas supplies geometry for absolute layouts) ─

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Wrap nodes (sharing a parent) in a new box. If `rects` (positions relative to the
 * shared parent, in px) are given and the children are absolutely positioned, the
 * group is sized to their bounds and children are re-offset into it.
 */
export function groupNodes(ids: NodeId[], rects?: Record<NodeId, Rect>, name = 'Group'): NodeId | null {
  const doc = docApi.doc;
  const targets = sortByTreeOrder(doc.nodes, pruneDescendants(doc.nodes, ids));
  if (!targets.length) return null;
  const parentId = doc.nodes[targets[0]].parent;
  if (!parentId || targets.some((id) => doc.nodes[id].parent !== parentId)) return null;
  const group = createNode('box', { name, replaceStyles: true, styles: {} });
  const allAbs = targets.every((id) => doc.nodes[id].styles.base.position === 'absolute');
  docApi.mutate(`Group ${targets.length} layers`, (d) => {
    const parent = d.nodes[parentId];
    const firstIdx = Math.min(...targets.map((id) => parent.children.indexOf(id)));
    const lastIdx = Math.max(...targets.map((id) => parent.children.indexOf(id)));
    void firstIdx;
    insertSubtree(d as KDocument, { rootId: group.id, nodes: { [group.id]: group } }, parentId, lastIdx + 1);
    const g = d.nodes[group.id];
    if (allAbs && rects && targets.every((id) => rects[id])) {
      const minX = Math.min(...targets.map((id) => rects[id].x));
      const minY = Math.min(...targets.map((id) => rects[id].y));
      const maxX = Math.max(...targets.map((id) => rects[id].x + rects[id].w));
      const maxY = Math.max(...targets.map((id) => rects[id].y + rects[id].h));
      g.styles.base = { position: 'absolute', left: `${Math.round(minX)}px`, top: `${Math.round(minY)}px`, width: `${Math.round(maxX - minX)}px`, height: `${Math.round(maxY - minY)}px` };
      for (const id of targets) {
        const n = d.nodes[id];
        n.styles.base.left = `${Math.round(rects[id].x - minX)}px`;
        n.styles.base.top = `${Math.round(rects[id].y - minY)}px`;
        // responsive overrides of left/top are relative to the old parent; drop them
        for (const bp of Object.keys(n.styles)) if (bp !== 'base') { delete n.styles[bp].left; delete n.styles[bp].top; }
      }
    } else {
      g.styles.base = { display: 'flex', 'flex-direction': 'column', gap: '8px' };
    }
    for (const id of targets) moveNode(d as KDocument, id, group.id);
  });
  uiApi.state.select([group.id]);
  return group.id;
}

/** Replace a group with its children (re-offsetting absolutely positioned children). */
export function ungroupNodes(ids: NodeId[]) {
  const doc = docApi.doc;
  const groups = ids.filter((id) => doc.nodes[id]?.children.length && doc.nodes[id]?.parent);
  if (!groups.length) return;
  const newSel: NodeId[] = [];
  docApi.mutate('Ungroup', (d) => {
    for (const gid of groups) {
      const g = d.nodes[gid];
      const parentId = g.parent!;
      const idx = d.nodes[parentId].children.indexOf(gid);
      const gl = parseFloat(g.styles.base.left ?? '0') || 0;
      const gt = parseFloat(g.styles.base.top ?? '0') || 0;
      const gAbs = g.styles.base.position === 'absolute';
      const kids = [...g.children];
      kids.forEach((cid, i) => {
        const c = d.nodes[cid];
        if (gAbs && c.styles.base.position === 'absolute') {
          c.styles.base.left = `${(parseFloat(c.styles.base.left ?? '0') || 0) + gl}px`;
          c.styles.base.top = `${(parseFloat(c.styles.base.top ?? '0') || 0) + gt}px`;
        }
        moveNode(d as KDocument, cid, parentId, idx + i);
        newSel.push(cid);
      });
      removeNode(d as KDocument, gid);
    }
  });
  uiApi.state.select(newSel);
}

// ─── Animations ─────────────────────────────────────────────────────────────

export function addAnimation(nodeId: NodeId, anim: KAnimation, label?: string, opts: { ai?: boolean } = {}) {
  docApi.mutate(
    label ?? `Add animation “${anim.name}”`,
    (d) => {
      const n = d.nodes[nodeId];
      if (!n) return;
      (n.animations ??= []).push(anim);
    },
    { ai: opts.ai },
  );
}

export function updateAnimation(
  nodeId: NodeId,
  animId: string,
  recipe: (a: Draft<KAnimation>) => void,
  opts: { label?: string; coalesceKey?: string } = {},
) {
  docApi.mutate(
    opts.label ?? 'Edit animation',
    (d) => {
      const a = d.nodes[nodeId]?.animations?.find((x) => x.id === animId);
      if (a) recipe(a);
    },
    { coalesceKey: opts.coalesceKey },
  );
}

export function removeAnimation(nodeId: NodeId, animId: string) {
  docApi.mutate('Remove animation', (d) => {
    const n = d.nodes[nodeId];
    if (!n?.animations) return;
    n.animations = n.animations.filter((a) => a.id !== animId);
    if (!n.animations.length) delete n.animations;
  });
}

// ─── Pages ──────────────────────────────────────────────────────────────────

export function addPage(name?: string) {
  const doc = docApi.doc;
  const { page, root } = createPage(name ?? `Page ${doc.pages.length + 1}`);
  docApi.mutate('Add page', (d) => {
    d.nodes[root.id] = root;
    d.pages.push(page);
  });
  uiApi.set({ activePageId: page.id, selection: [], editingComponentId: null });
  return page.id;
}

export function renamePage(pageId: string, name: string) {
  if (!name.trim()) return;
  docApi.mutate('Rename page', (d) => {
    const p = d.pages.find((x) => x.id === pageId);
    if (p) p.name = name.trim();
  });
}

export function deletePage(pageId: string) {
  const doc = docApi.doc;
  if (doc.pages.length <= 1) return;
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return;
  docApi.mutate('Delete page', (d) => {
    for (const id of getSubtreeIds(d.nodes as Record<NodeId, KNode>, page.rootId)) delete d.nodes[id];
    d.pages = d.pages.filter((p) => p.id !== pageId);
  });
  if (uiApi.state.activePageId === pageId) uiApi.set({ activePageId: docApi.doc.pages[0].id, selection: [] });
}

export function duplicatePage(pageId: string) {
  const doc = docApi.doc;
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return;
  const clone = cloneSubtree(doc.nodes, page.rootId);
  const newPage = { id: uid('p'), name: `${page.name} copy`, rootId: clone.rootId };
  docApi.mutate('Duplicate page', (d) => {
    Object.assign(d.nodes, clone.nodes);
    const i = d.pages.findIndex((p) => p.id === pageId);
    d.pages.splice(i + 1, 0, newPage);
  });
  uiApi.set({ activePageId: newPage.id, selection: [] });
}

export function reorderPages(fromIndex: number, toIndex: number) {
  docApi.mutate('Reorder pages', (d) => {
    const [p] = d.pages.splice(fromIndex, 1);
    d.pages.splice(toIndex, 0, p);
  });
}

// ─── Selection helpers ──────────────────────────────────────────────────────

export function selectParent() {
  const doc = docApi.doc;
  const sel = uiApi.state.selection;
  if (!sel.length) return;
  const roots = new Set([...doc.pages.map((p) => p.rootId), ...Object.values(doc.components).map((c) => c.rootId)]);
  const parents = [...new Set(sel.map((id) => doc.nodes[id]?.parent).filter((p): p is string => !!p && !roots.has(p)))];
  uiApi.state.select(parents);
}

export function selectChildren() {
  const doc = docApi.doc;
  const sel = uiApi.state.selection;
  const kids = sel.flatMap((id) => doc.nodes[id]?.children ?? []);
  if (kids.length) uiApi.state.select(kids);
}

export function selectAll() {
  const root = currentRootId();
  if (!root) return;
  const doc = docApi.doc;
  const sel = uiApi.state.selection;
  // select siblings of current selection, or top-level children
  const parent = sel.length ? doc.nodes[sel[0]]?.parent ?? root : root;
  uiApi.state.select((doc.nodes[parent]?.children ?? []).filter((id) => !doc.nodes[id]?.locked));
}

/** Keep selection valid after undo/redo/deletes. Installed once at startup. */
export function installSelectionSanitizer() {
  return useDoc.subscribe((s, prev) => {
    if (s.doc === prev.doc) return;
    const ui = useUI.getState();
    const valid = ui.selection.filter((id) => !!s.doc.nodes[id]);
    const patch: Partial<typeof ui> = {};
    if (valid.length !== ui.selection.length) patch.selection = valid;
    if (ui.hoverId && !s.doc.nodes[ui.hoverId]) patch.hoverId = null;
    if (ui.editingTextId && !s.doc.nodes[ui.editingTextId]) patch.editingTextId = null;
    if (ui.activePageId && !s.doc.pages.some((p) => p.id === ui.activePageId)) patch.activePageId = s.doc.pages[0]?.id ?? null;
    if (ui.editingComponentId && !s.doc.components[ui.editingComponentId]) patch.editingComponentId = null;
    if (Object.keys(patch).length) ui.set(patch);
  });
}

export { getAncestors };
