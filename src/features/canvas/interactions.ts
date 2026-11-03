/**
 * Canvas pointer gestures: click selection, move (freeform + flow reorder +
 * reparent), resize, rotate, marquee, box/text drawing, panning and the root
 * frame height handle. Each drag is one history step (transaction); Escape
 * cancels.
 */
import type { NodeId, KDocument, KNode } from '@/core/model/types';
import { docApi } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { currentRootId, duplicateNodes } from '@/core/store/actions';
import { createNode } from '@/core/model/factory';
import { insertSubtree, moveNode, pruneDescendants, sortByTreeOrder } from '@/core/model/tree';
import { parsePx, parseRotate, resolveStyles } from '@/core/style/style';
import { useCanvas } from './canvasStore';
import {
  HANDLES,
  guidesFor,
  mapRectBetween,
  offsetRect,
  rectCenter,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  rotateDrag,
  rotateVec,
  rotatedAabb,
  snapMovingRect,
  snapToGrid,
  snapValue,
  unionRects,
  type HandleDir,
  type Point,
  type Rect,
} from './geometry';
import { drillTarget, isEditableText, openSet, pickTarget } from './selectionRules';
import { containerAt, containerInfo, flowDrop, isInWorld, pathFromElement, type ContainerInfo } from './hitTest';
import { clientToScreen, clientToWorld, elementFor, isAbsoluteEl, nodeRotation, paddingOrigin, viewportEl, worldRectFor, worldRectOf } from './measure';
import { editingElement, commitTextEditing, startTextEditing } from './textEditing';
import { placeAbsolute, stripPosition, writeStyle } from './styleWrite';

const DRAG_THRESHOLD = 3;
const SNAP_PX = 5;
const DWELL_MS = 450;

const isMod = (e: { ctrlKey: boolean; metaKey: boolean }) => e.ctrlKey || e.metaKey;

function zoom() {
  return uiApi.state.viewport.zoom;
}

function bp() {
  return uiApi.state.breakpoint;
}

function gridSize(): number {
  return uiApi.state.snapToGrid ? docApi.doc.settings.gridSize || 0 : 0;
}

function rootIds(): Set<NodeId> {
  const doc = docApi.doc;
  return new Set([...doc.pages.map((p) => p.rootId), ...Object.values(doc.components).map((c) => c.rootId)]);
}

/** Selection ids that can be manipulated on canvas (not roots, not locked). */
function editableSelection(): NodeId[] {
  const doc = docApi.doc;
  const roots = rootIds();
  const ids = pruneDescendants(doc.nodes, uiApi.state.selection).filter((id) => doc.nodes[id] && !roots.has(id) && !doc.nodes[id].locked);
  return sortByTreeOrder(doc.nodes, ids);
}

// ─── Gesture plumbing ───────────────────────────────────────────────────────

interface Mods {
  shift: boolean;
  alt: boolean;
  mod: boolean;
}

interface GestureHandlers {
  move: (client: Point, mods: Mods) => void;
  up: (client: Point, mods: Mods) => void;
  cancel: () => void;
}

let active: { h: GestureHandlers; last: Point; mods: Mods; raf: number; cleanup: () => void } | null = null;

export function gestureActive() {
  return !!active;
}

function modsOf(e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): Mods {
  return { shift: e.shiftKey, alt: e.altKey, mod: e.ctrlKey || e.metaKey };
}

/** Run a gesture: pointer moves are coalesced per animation frame. */
function runGesture(pointerId: number, captureEl: Element | null, start: Point, mods: Mods, h: GestureHandlers) {
  endGesture(false);
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId || !active) return;
    active.last = { x: e.clientX, y: e.clientY };
    active.mods = modsOf(e);
    if (!active.raf) {
      active.raf = requestAnimationFrame(() => {
        if (!active) return;
        active.raf = 0;
        active.h.move(active.last, active.mods);
      });
    }
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId || !active) return;
    const a = active;
    if (a.raf) cancelAnimationFrame(a.raf);
    a.raf = 0;
    a.last = { x: e.clientX, y: e.clientY };
    a.mods = modsOf(e);
    a.h.move(a.last, a.mods);
    active = null;
    a.cleanup();
    a.h.up(a.last, a.mods);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!active) return;
    if (e.type === 'keydown' && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      endGesture(true);
      return;
    }
    if (e.key === 'Shift' || e.key === 'Alt' || e.key === 'Control' || e.key === 'Meta') {
      if (e.key === 'Alt') e.preventDefault();
      active.mods = modsOf(e);
      active.h.move(active.last, active.mods);
    }
  };
  const onBlur = () => endGesture(true);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('blur', onBlur);
  try {
    if (captureEl && 'setPointerCapture' in captureEl) (captureEl as HTMLElement).setPointerCapture(pointerId);
  } catch {
    /* pointer already released */
  }
  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    window.removeEventListener('blur', onBlur);
    try {
      if (captureEl && (captureEl as HTMLElement).hasPointerCapture?.(pointerId)) (captureEl as HTMLElement).releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  };
  active = { h, last: start, mods, raf: 0, cleanup };
}

/** Abort the running gesture (cancel = revert its document changes). */
export function endGesture(cancel: boolean) {
  const a = active;
  if (!a) return;
  active = null;
  if (a.raf) cancelAnimationFrame(a.raf);
  a.cleanup();
  if (cancel) a.h.cancel();
}

function setCursor(cursor: string | null) {
  useCanvas.getState().set({ cursor });
}

// ─── Pointer down ───────────────────────────────────────────────────────────

/** Entry point from the viewport's onPointerDown. */
export function canvasPointerDown(e: React.PointerEvent<HTMLElement>) {
  const target = e.target as Element;
  const editEl = editingElement();
  if (editEl) {
    if (editEl.contains(target)) return; // caret placement inside the editor
    commitTextEditing();
  }
  if (target.closest('.kc-overlay [data-handle], .kc-overlay [data-rotate], .kc-overlay [data-frame-handle]')) return;
  const ui = uiApi.state;
  const space = useCanvas.getState().spaceHeld;
  if (e.button === 1 || (e.button === 0 && (ui.tool === 'hand' || space))) {
    e.preventDefault();
    startPan(e);
    return;
  }
  if (e.button === 2) {
    selectForContextMenu(e.clientX, e.clientY, target);
    return;
  }
  if (e.button !== 0) return;
  if (ui.tool === 'box' || ui.tool === 'text') {
    e.preventDefault();
    startDraw(e, ui.tool);
    return;
  }
  if (target.closest('[data-kframe-label]')) {
    const root = currentRootId();
    if (root) uiApi.state.select([root]);
    return;
  }
  e.preventDefault();
  selectPointerDown(e, target);
}

/** Node a click at this target would select. */
export function clickTarget(target: EventTarget | null, deep: boolean): NodeId | null {
  const rootId = currentRootId();
  if (!rootId || !isInWorld(target)) return null;
  const doc = docApi.doc;
  const path = pathFromElement(target);
  if (!path.length) return null;
  return pickTarget(doc.nodes, rootId, path, openSet(doc.nodes, rootId, uiApi.state.selection), { deep });
}

function selectForContextMenu(cx: number, cy: number, target: Element) {
  const id = clickTarget(target, false);
  const ui = uiApi.state;
  if (id) {
    if (!ui.selection.includes(id)) ui.select([id]);
  } else if (isInWorld(target) || target.closest('.kc-viewport')) {
    if (!pointInSelectionBounds(cx, cy)) ui.select([]);
  }
}

function selectionBounds(ids: NodeId[]): Rect | null {
  return unionRects(ids.map((id) => {
    const r = worldRectFor(id);
    return r ? rotatedAabb(r, nodeRotation(id)) : null;
  }).filter((r): r is Rect => !!r));
}

function pointInSelectionBounds(cx: number, cy: number): boolean {
  const ids = editableSelection();
  if (ids.length < 2) return false;
  const b = selectionBounds(ids);
  if (!b) return false;
  const p = clientToWorld(cx, cy);
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

function selectPointerDown(e: React.PointerEvent<HTMLElement>, target: Element) {
  const ui = uiApi.state;
  const deep = isMod(e);
  const id = clickTarget(target, deep);
  const start = { x: e.clientX, y: e.clientY };
  const pointerId = e.pointerId;
  const mods = modsOf(e);

  if (!id) {
    if (pointInSelectionBounds(e.clientX, e.clientY) && !e.shiftKey) {
      pendingDrag(pointerId, start, mods, () => beginMove(pointerId, start, mods, null), null);
      return;
    }
    startMarquee(pointerId, start, e.shiftKey);
    return;
  }

  let clickSelect: NodeId[] | null = null;
  if (e.shiftKey) {
    if (ui.selection.includes(id)) {
      ui.select(ui.selection.filter((x) => x !== id));
      return;
    }
    ui.select([...ui.selection, id]);
  } else if (ui.selection.includes(id)) {
    // keep a multi-selection for dragging; collapse to the clicked node on click
    if (ui.selection.length > 1) clickSelect = [id];
  } else ui.select([id]);

  pendingDrag(pointerId, start, mods, () => beginMove(pointerId, start, mods, id), clickSelect);
}

/** Wait until the pointer moves past the threshold before starting a drag. */
function pendingDrag(pointerId: number, start: Point, mods: Mods, begin: () => void, clickSelect: NodeId[] | null) {
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_THRESHOLD) {
      cleanup();
      void mods;
      begin();
      // feed the current position immediately
      if (active) {
        active.last = { x: e.clientX, y: e.clientY };
        active.mods = modsOf(e);
        active.h.move(active.last, active.mods);
      }
    }
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    cleanup();
    if (clickSelect) uiApi.state.select(clickSelect);
  };
  const cleanup = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

// ─── Double click ───────────────────────────────────────────────────────────

export function canvasDoubleClick(e: React.MouseEvent<HTMLElement>) {
  if (uiApi.state.tool !== 'select' || useCanvas.getState().spaceHeld) return;
  const editEl = editingElement();
  if (editEl) return;
  const target = document.elementFromPoint(e.clientX, e.clientY);
  if (!target || !isInWorld(target)) return;
  const doc = docApi.doc;
  const rootId = currentRootId();
  if (!rootId) return;
  const path = pathFromElement(target);
  if (!path.length) return;
  const sel = uiApi.state.selection;
  const current = sel.length === 1 && path.includes(sel[0]) ? sel[0] : pickTarget(doc.nodes, rootId, path, openSet(doc.nodes, rootId, sel));
  if (!current) return;
  const n = doc.nodes[current];
  if (isEditableText(n) && !n.locked) {
    startTextEditing(current, { caret: { x: e.clientX, y: e.clientY } });
    return;
  }
  const next = drillTarget(doc.nodes, path, current);
  if (next) uiApi.state.select([next]);
}

/** Enter on a selected text leaf starts editing (selecting the whole text). */
export function editSelectedText(): boolean {
  const sel = uiApi.state.selection;
  if (sel.length !== 1) return false;
  const n = docApi.doc.nodes[sel[0]];
  if (!isEditableText(n) || n.locked) return false;
  startTextEditing(n.id, { selectAll: true });
  return true;
}

// ─── Hover ──────────────────────────────────────────────────────────────────

export function canvasHover(e: React.PointerEvent<HTMLElement>) {
  if (active || e.buttons) return;
  const ui = uiApi.state;
  if (ui.tool === 'hand' || useCanvas.getState().spaceHeld) {
    if (ui.hoverId) ui.setHover(null);
    return;
  }
  const target = e.target as Element;
  if (target.closest('.kc-overlay')) return;
  if (target.closest('[data-kframe-label]')) {
    ui.setHover(currentRootId());
    return;
  }
  const id = ui.tool === 'select' ? clickTarget(target, isMod(e)) : null;
  ui.setHover(id);
}

// ─── Pan ────────────────────────────────────────────────────────────────────

function startPan(e: React.PointerEvent<HTMLElement>) {
  const start = { x: e.clientX, y: e.clientY };
  const v0 = { ...uiApi.state.viewport };
  useCanvas.getState().set({ gesture: 'pan' });
  setCursor('grabbing');
  runGesture(e.pointerId, viewportEl(), start, modsOf(e), {
    move: (p) => uiApi.state.setViewport({ panX: v0.panX + (p.x - start.x), panY: v0.panY + (p.y - start.y) }),
    up: () => useCanvas.getState().clearFeedback(),
    cancel: () => {
      uiApi.state.setViewport({ panX: v0.panX, panY: v0.panY });
      useCanvas.getState().clearFeedback();
    },
  });
}

// ─── Marquee ────────────────────────────────────────────────────────────────

function startMarquee(pointerId: number, start: Point, additive: boolean) {
  const doc = docApi.doc;
  const rootId = currentRootId();
  if (!rootId) return;
  const ui = uiApi.state;
  const initial = [...ui.selection];
  const ctx = additive && initial.length ? doc.nodes[initial[0]]?.parent ?? rootId : rootId;
  if (!additive) ui.select([]);
  const w0 = clientToWorld(start.x, start.y);
  let candidates: { id: NodeId; r: Rect }[] | null = null;
  let started = false;
  runGesture(pointerId, viewportEl(), start, { shift: additive, alt: false, mod: false }, {
    move: (p) => {
      if (!started) {
        if (Math.hypot(p.x - start.x, p.y - start.y) <= DRAG_THRESHOLD) return;
        started = true;
        useCanvas.getState().set({ gesture: 'marquee' });
        candidates = (doc.nodes[ctx]?.children ?? [])
          .filter((id) => !doc.nodes[id]?.locked && !doc.nodes[id]?.hidden)
          .map((id) => {
            const r = worldRectFor(id);
            return r ? { id, r: rotatedAabb(r, nodeRotation(id)) } : null;
          })
          .filter((x): x is { id: NodeId; r: Rect } => !!x);
      }
      const w = clientToWorld(p.x, p.y);
      const rect = rectFromPoints(w0, w);
      useCanvas.getState().set({ marquee: rect });
      const hits = candidates!.filter((c) => rectsIntersect(c.r, rect)).map((c) => c.id);
      const next = additive ? [...new Set([...initial, ...hits])] : hits;
      const cur = uiApi.state.selection;
      if (next.length !== cur.length || next.some((id, i) => cur[i] !== id)) uiApi.state.select(next);
    },
    up: () => useCanvas.getState().clearFeedback(),
    cancel: () => {
      uiApi.state.select(initial);
      useCanvas.getState().clearFeedback();
    },
  });
}

// ─── Move ───────────────────────────────────────────────────────────────────

interface MoveItem {
  id: NodeId;
  abs: boolean;
  startLeft: number;
  startTop: number;
  rect: Rect;
  rot: number;
  parent: NodeId;
}

function measureItem(id: NodeId): MoveItem | null {
  const doc = docApi.doc;
  const n = doc.nodes[id];
  const el = elementFor(id);
  if (!n?.parent || !el) return null;
  const rect = worldRectOf(el);
  if (!rect) return null;
  const abs = isAbsoluteEl(el);
  const st = resolveStyles(doc, n, bp());
  let left = parsePx(st.left);
  let top = parsePx(st.top);
  if (abs && (left == null || top == null)) {
    const cs = getComputedStyle(el);
    if (left == null) left = el.offsetLeft - (parseFloat(cs.marginLeft) || 0);
    if (top == null) top = el.offsetTop - (parseFloat(cs.marginTop) || 0);
  }
  return { id, abs, startLeft: left ?? 0, startTop: top ?? 0, rect, rot: parseRotate(st.rotate), parent: n.parent };
}

/** Rects used as smart-guide targets: siblings (rendered, not dragged) + the parent. */
function snapTargets(parentId: NodeId, exclude: ReadonlySet<NodeId>): Rect[] {
  const doc = docApi.doc;
  const out: Rect[] = [];
  const pr = worldRectFor(parentId);
  if (pr) out.push(pr);
  for (const c of doc.nodes[parentId]?.children ?? []) {
    if (exclude.has(c) || doc.nodes[c]?.hidden) continue;
    const r = worldRectFor(c);
    if (r) out.push(rotatedAabb(r, nodeRotation(c)));
  }
  return out;
}

function markDragging(ids: NodeId[], on: boolean) {
  for (const id of ids) {
    const el = elementFor(id);
    if (!el) continue;
    if (on) el.setAttribute('data-kdragging', 'true');
    else el.removeAttribute('data-kdragging');
  }
}

function beginMove(pointerId: number, start: Point, mods: Mods, primaryId: NodeId | null) {
  const before = [...uiApi.state.selection];
  let ids = editableSelection();
  if (!ids.length) return;
  let items = ids.map(measureItem).filter((x): x is MoveItem => !!x);
  if (!items.length) return;
  const primary = items.find((i) => i.id === primaryId) ?? items[0];

  docApi.begin('Move');
  const ignoreIds = new Set<NodeId>(items.map((i) => i.id));
  if (mods.alt) {
    // duplicate in place and drag the copies (rects are identical)
    const clones = duplicateNodes(items.map((i) => i.id), { offset: 0 });
    const order = sortByTreeOrder(docApi.doc.nodes, pruneDescendants(docApi.doc.nodes, items.map((i) => i.id)));
    const map = new Map(order.map((id, i) => [id, clones[i]]));
    items = items.map((i) => ({ ...i, id: map.get(i.id) ?? i.id }));
    ids = items.map((i) => i.id);
  }
  const free = primary.abs;
  const moving = free ? items.filter((i) => i.abs) : items;
  const movingIds = new Set(moving.map((i) => i.id));
  const originParent = primary.parent;
  const startBounds = unionRects(moving.map((i) => rotatedAabb(i.rect, i.rot)))!;
  const targets = free ? snapTargets(originParent, movingIds) : [];
  const parentEl = elementFor(originParent);
  const gridOrigin = parentEl ? paddingOrigin(parentEl) ?? { x: 0, y: 0 } : { x: 0, y: 0 };
  const w0 = clientToWorld(start.x, start.y);
  const dwell = { sibling: null as NodeId | null, since: 0, timer: 0 as unknown as ReturnType<typeof setTimeout> | 0 };
  let drop: { info: ContainerInfo; index: number | null } | null = null;
  let lastDelta: Point = { x: 0, y: 0 };

  useCanvas.getState().set({ gesture: 'move' });
  if (!free) markDragging(moving.map((i) => i.id), true);

  const resolveDrop = (client: Point, world: Point) => {
    const now = performance.now();
    const allowEnter = (sib: NodeId) => dwell.sibling === sib && now - dwell.since >= DWELL_MS;
    const hit = containerAt(client.x, client.y, { dragged: movingIds, originParent, allowEnter, ignore: ignoreIds });
    const hovered = hit?.hoverSibling ?? null;
    if (hovered !== dwell.sibling) {
      dwell.sibling = hovered;
      dwell.since = now;
      if (dwell.timer) clearTimeout(dwell.timer);
      dwell.timer = hovered ? setTimeout(() => active?.h.move(active.last, active.mods), DWELL_MS + 20) : 0;
    }
    if (!hit) return null;
    const staticContent = !free;
    let info = containerInfo(hit.id, { staticContent, exclude: movingIds });
    if (!info) return null;
    if (!free && hit.id === originParent && info.mode === 'free') info = { ...info, mode: 'flow' };
    if (info.mode !== 'flow') return { info, index: null, line: null };
    const fd = flowDrop(info, world, movingIds);
    return { info, index: fd.index, line: fd.line };
  };

  runGesture(pointerId, viewportEl(), start, mods, {
    move: (client, m) => {
      const w = clientToWorld(client.x, client.y);
      let dx = w.x - w0.x;
      let dy = w.y - w0.y;
      let lockX = false;
      let lockY = false;
      if (m.shift) {
        if (Math.abs(dx) > Math.abs(dy)) {
          dy = 0;
          lockY = true;
        } else {
          dx = 0;
          lockX = true;
        }
      }
      const r = resolveDrop(client, w);
      drop = r ? { info: r.info, index: r.index } : null;
      const reparent = !!r && r.info.id !== originParent;
      if (free) {
        let sx = 0;
        let sy = 0;
        let guides: ReturnType<typeof snapMovingRect> | null = null;
        if (!m.mod && !reparent) {
          guides = snapMovingRect(offsetRect(startBounds, dx, dy), targets, {
            threshold: SNAP_PX / zoom(),
            grid: gridSize(),
            gridOrigin,
            lockX,
            lockY,
          });
          sx = guides.dx;
          sy = guides.dy;
        }
        lastDelta = { x: dx + sx, y: dy + sy };
        const b = bp();
        docApi.mutate('Move', (d) => {
          for (const it of moving) {
            const n = d.nodes[it.id];
            if (!n) continue;
            writeStyle(n, b, 'left', `${Math.round(it.startLeft + lastDelta.x)}px`);
            writeStyle(n, b, 'top', `${Math.round(it.startTop + lastDelta.y)}px`);
          }
        });
        useCanvas.getState().set({
          guides: guides?.lines ?? [],
          labels: guides?.labels ?? [],
          drop: reparent && r ? { containerId: r.info.id, line: r.line } : null,
        });
      } else {
        lastDelta = { x: dx, y: dy };
        useCanvas.getState().set({
          ghost: offsetRect(startBounds, dx, dy),
          drop: r ? { containerId: r.info.id, line: r.line } : null,
          guides: [],
          labels: [],
        });
      }
    },
    up: () => {
      if (dwell.timer) clearTimeout(dwell.timer);
      if (!free) markDragging(moving.map((i) => i.id), false);
      useCanvas.getState().clearFeedback();
      const target = drop;
      if (target && (target.info.id !== originParent || !free)) {
        applyDrop(moving, target.info, target.index, lastDelta);
      }
      docApi.commit(mods.alt ? 'Duplicate' : 'Move');
      // keep the dragged nodes selected
      uiApi.state.select(ids.filter((id) => !!docApi.doc.nodes[id]));
    },
    cancel: () => {
      if (dwell.timer) clearTimeout(dwell.timer);
      if (!free) markDragging(moving.map((i) => i.id), false);
      docApi.cancel();
      useCanvas.getState().clearFeedback();
      uiApi.state.select(before.filter((id) => !!docApi.doc.nodes[id]));
    },
  });
}

/** Commit a move into a container (reparent and/or reorder). Runs inside the open transaction. */
function applyDrop(items: MoveItem[], info: ContainerInfo, index: number | null, delta: Point) {
  const b = bp();
  const doc = docApi.doc;
  const origin = paddingOrigin(info.el) ?? { x: info.rect.x, y: info.rect.y };
  const containerStatic = getComputedStyle(info.el).position === 'static';
  const ids = items.map((i) => i.id);
  if (info.mode === 'flow') {
    // no-op reorder?
    const sameParent = items.every((i) => i.parent === info.id);
    if (sameParent && index != null) {
      const kids = doc.nodes[info.id].children;
      const cur = ids.map((id) => kids.indexOf(id)).sort((a, c) => a - c);
      const contiguous = cur.every((v, i) => i === 0 || v === cur[i - 1] + 1);
      if (contiguous && index >= cur[0] && index <= cur[cur.length - 1] + 1) return;
    }
  }
  docApi.mutate('Move', (d) => {
    let at = index ?? undefined;
    for (const it of items) {
      const n = d.nodes[it.id];
      if (!n) continue;
      if (info.mode === 'flow') {
        if (at != null && n.parent === info.id) {
          const ci = d.nodes[info.id].children.indexOf(it.id);
          if (ci >= 0 && ci < at) at -= 1;
        }
        moveNode(d as KDocument, it.id, info.id, at);
        if (at != null) at += 1;
        if (it.abs) stripPosition(n);
      } else {
        // freeform: keep the node where it was dropped
        const world = offsetRect(it.rect, delta.x, delta.y);
        moveNode(d as KDocument, it.id, info.id);
        const el = elementFor(it.id);
        const ml = el ? parseFloat(getComputedStyle(el).marginLeft) || 0 : 0;
        const mt = el ? parseFloat(getComputedStyle(el).marginTop) || 0 : 0;
        placeAbsolute(n, b, world.x - origin.x - ml, world.y - origin.y - mt);
      }
    }
    if (info.mode === 'free' && containerStatic) {
      const c = d.nodes[info.id];
      if (c) writeStyle(c, 'base', 'position', 'relative');
    }
  });
}

// ─── Resize ─────────────────────────────────────────────────────────────────

export function startResize(e: React.PointerEvent<HTMLElement>, handle: string) {
  e.preventDefault();
  e.stopPropagation();
  const dir = HANDLES[handle];
  if (!dir) return;
  const ids = editableSelection();
  const items = ids.map(measureItem).filter((x): x is MoveItem => !!x);
  if (!items.length) return;
  const doc = docApi.doc;
  const single = items.length === 1 ? items[0] : null;
  const bounds = single ? single.rect : unionRects(items.map((i) => rotatedAabb(i.rect, i.rot)))!;
  const rot = single ? single.rot : 0;
  const parentId = items[0].parent;
  const exclude = new Set(ids);
  const targets = snapTargets(parentId, exclude);
  const parentEl = elementFor(parentId);
  const gridOrigin = parentEl ? paddingOrigin(parentEl) ?? { x: 0, y: 0 } : { x: 0, y: 0 };
  const xs = targets.flatMap((t) => [t.x, t.x + t.w / 2, t.x + t.w]);
  const ys = targets.flatMap((t) => [t.y, t.y + t.h / 2, t.y + t.h]);
  const w0 = clientToWorld(e.clientX, e.clientY);
  const textIds = new Set(items.filter((i) => doc.nodes[i.id]?.type === 'text').map((i) => i.id));

  docApi.begin('Resize');
  useCanvas.getState().set({ gesture: 'resize', cursor: (e.currentTarget as HTMLElement).style.cursor || null });

  runGesture(e.pointerId, e.currentTarget, { x: e.clientX, y: e.clientY }, modsOf(e), {
    move: (client, m) => {
      const w = clientToWorld(client.x, client.y);
      const delta = { x: w.x - w0.x, y: w.y - w0.y };
      const g = gridSize();
      const thr = SNAP_PX / zoom();
      const snapEdge = m.mod
        ? undefined
        : (axis: 'x' | 'y', v: number) => snapValue(v, axis === 'x' ? xs : ys, thr, g || undefined, axis === 'x' ? gridOrigin.x : gridOrigin.y).value;
      const next = resizeRect(bounds, rot, dir, delta, { aspect: m.shift, fromCenter: m.alt, min: 1, snapEdge });
      const b = bp();
      docApi.mutate('Resize', (d) => {
        for (const it of items) {
          const n = d.nodes[it.id];
          if (!n) continue;
          const r = single ? next : mapRectBetween(it.rect, bounds, next);
          const isText = textIds.has(it.id);
          if (dir.hx || !isText) writeStyle(n, b, 'width', `${Math.max(1, Math.round(r.w))}px`);
          if (dir.hy || !isText) writeStyle(n, b, 'height', `${Math.max(1, Math.round(r.h))}px`);
          if (it.abs) {
            writeStyle(n, b, 'left', `${Math.round(it.startLeft + (r.x - it.rect.x))}px`);
            writeStyle(n, b, 'top', `${Math.round(it.startTop + (r.y - it.rect.y))}px`);
          }
        }
      });
      const shown = rot ? null : guidesFor(next, targets, ['x', 'y']);
      useCanvas.getState().set({ guides: m.mod || !shown ? [] : shown.lines, labels: [] });
    },
    up: () => {
      useCanvas.getState().clearFeedback();
      docApi.commit('Resize');
    },
    cancel: () => {
      docApi.cancel();
      useCanvas.getState().clearFeedback();
    },
  });
}

// ─── Rotate ─────────────────────────────────────────────────────────────────

export function startRotate(e: React.PointerEvent<HTMLElement>) {
  e.preventDefault();
  e.stopPropagation();
  const ids = editableSelection();
  const items = ids.map(measureItem).filter((x): x is MoveItem => !!x);
  if (!items.length) return;
  const single = items.length === 1;
  const bounds = single ? items[0].rect : unionRects(items.map((i) => rotatedAabb(i.rect, i.rot)))!;
  const center = rectCenter(bounds);
  const start = clientToWorld(e.clientX, e.clientY);
  const startRot = single ? items[0].rot : 0;
  docApi.begin('Rotate');
  useCanvas.getState().set({ gesture: 'rotate', cursor: (e.currentTarget as HTMLElement).style.cursor || null });
  runGesture(e.pointerId, e.currentTarget, { x: e.clientX, y: e.clientY }, modsOf(e), {
    move: (client, m) => {
      const w = clientToWorld(client.x, client.y);
      const angle = rotateDrag(startRot, center, start, w, m.shift ? 15 : null);
      const b = bp();
      const s = clientToScreen(client.x, client.y);
      useCanvas.getState().set({ hint: { text: `${Math.round(angle * 10) / 10}°`, x: s.x + 16, y: s.y + 16 } });
      docApi.mutate('Rotate', (d) => {
        for (const it of items) {
          const n = d.nodes[it.id];
          if (!n) continue;
          const delta = single ? angle - startRot : angle;
          const r = Math.round((it.rot + delta) * 10) / 10;
          const norm = ((((r + 180) % 360) + 360) % 360) - 180;
          writeStyle(n, b, 'rotate', Math.abs(norm) < 0.05 ? null : `${Math.round(norm * 10) / 10}deg`);
          if (!single && it.abs) {
            const c = rectCenter(it.rect);
            const v = rotateVec({ x: c.x - center.x, y: c.y - center.y }, delta);
            writeStyle(n, b, 'left', `${Math.round(it.startLeft + (center.x + v.x - c.x))}px`);
            writeStyle(n, b, 'top', `${Math.round(it.startTop + (center.y + v.y - c.y))}px`);
          }
        }
      });
    },
    up: () => {
      useCanvas.getState().clearFeedback();
      docApi.commit('Rotate');
    },
    cancel: () => {
      docApi.cancel();
      useCanvas.getState().clearFeedback();
    },
  });
}

// ─── Draw (box / text tools) ────────────────────────────────────────────────

function startDraw(e: React.PointerEvent<HTMLElement>, tool: 'box' | 'text') {
  const rootId = currentRootId();
  if (!rootId) return;
  const hit = containerAt(e.clientX, e.clientY) ?? { id: rootId, hoverSibling: null };
  const info = containerInfo(hit.id, { staticContent: false });
  if (!info) return;
  const origin = paddingOrigin(info.el) ?? { x: info.rect.x, y: info.rect.y };
  const start = { x: e.clientX, y: e.clientY };
  const w0raw = clientToWorld(e.clientX, e.clientY);
  const g = gridSize();
  const snapPt = (p: Point): Point => (g ? { x: snapToGrid(p.x - origin.x, g) + origin.x, y: snapToGrid(p.y - origin.y, g) + origin.y } : { x: Math.round(p.x), y: Math.round(p.y) });
  const w0 = snapPt(w0raw);
  let rect: Rect | null = null;
  let dragged = false;
  useCanvas.getState().set({ gesture: 'draw' });
  runGesture(e.pointerId, viewportEl(), start, modsOf(e), {
    move: (client, m) => {
      if (!dragged && Math.hypot(client.x - start.x, client.y - start.y) <= DRAG_THRESHOLD) return;
      dragged = true;
      const w = snapPt(clientToWorld(client.x, client.y));
      let dx = w.x - w0.x;
      let dy = w.y - w0.y;
      if (m.shift) {
        const s = Math.max(Math.abs(dx), Math.abs(dy));
        dx = Math.sign(dx || 1) * s;
        dy = Math.sign(dy || 1) * s;
      }
      rect = m.alt ? { x: w0.x - Math.abs(dx), y: w0.y - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 } : rectFromPoints(w0, { x: w0.x + dx, y: w0.y + dy });
      useCanvas.getState().set({ draw: rect });
    },
    up: (client) => {
      useCanvas.getState().clearFeedback();
      uiApi.set({ tool: 'select' });
      if (tool === 'box') createBox(info, origin, dragged && rect ? rect : null, w0raw);
      else createText(info, origin, dragged && rect ? rect : null, w0raw, client);
    },
    cancel: () => useCanvas.getState().clearFeedback(),
  });
}

function insertInto(info: ContainerInfo, origin: Point, node: KNode, rect: Rect | null, point: Point, label: string) {
  const b = bp();
  const containerStatic = getComputedStyle(info.el).position === 'static';
  if (info.mode === 'flow') {
    const { index } = flowDrop(info, point, new Set());
    if (rect) {
      writeStyle(node, b, 'width', `${Math.max(1, Math.round(rect.w))}px`);
      if (node.type !== 'text') writeStyle(node, b, 'height', `${Math.max(1, Math.round(rect.h))}px`);
    }
    docApi.mutate(label, (d) => insertSubtree(d as KDocument, { rootId: node.id, nodes: { [node.id]: node } }, info.id, index));
  } else {
    const x = rect ? rect.x : point.x;
    const y = rect ? rect.y : point.y;
    placeAbsolute(node, b, x - origin.x, y - origin.y);
    if (rect) {
      writeStyle(node, b, 'width', `${Math.max(1, Math.round(rect.w))}px`);
      if (node.type !== 'text') writeStyle(node, b, 'height', `${Math.max(1, Math.round(rect.h))}px`);
    }
    docApi.mutate(label, (d) => {
      insertSubtree(d as KDocument, { rootId: node.id, nodes: { [node.id]: node } }, info.id);
      if (containerStatic) writeStyle(d.nodes[info.id], 'base', 'position', 'relative');
    });
  }
  uiApi.state.select([node.id]);
}

function createBox(info: ContainerInfo, origin: Point, rect: Rect | null, point: Point) {
  const node = createNode('box');
  if (!rect && info.mode === 'free') {
    // click: default-size box centered on the pointer
    const w = parsePx(node.styles.base.width) ?? 240;
    const h = parsePx(node.styles.base.height) ?? 160;
    const g = gridSize();
    let x = point.x - w / 2;
    let y = point.y - h / 2;
    if (g) {
      x = snapToGrid(x - origin.x, g) + origin.x;
      y = snapToGrid(y - origin.y, g) + origin.y;
    }
    rect = { x, y, w, h };
  }
  insertInto(info, origin, node, rect, point, 'Add box');
}

function createText(info: ContainerInfo, origin: Point, rect: Rect | null, point: Point, client: Point) {
  const node = createNode('text', { props: { text: '' } });
  const fontSize = parsePx(node.styles.base['font-size']) ?? 18;
  const lh = (parseFloat(node.styles.base['line-height'] ?? '1.5') || 1.5) * fontSize;
  const at = rect ? null : { x: point.x - 1, y: point.y - lh / 2 };
  docApi.begin('Add text');
  if (rect) insertInto(info, origin, node, { ...rect, h: lh }, point, 'Add text');
  else if (info.mode === 'free') {
    const b = bp();
    placeAbsolute(node, b, at!.x - origin.x, at!.y - origin.y);
    const containerStatic = getComputedStyle(info.el).position === 'static';
    docApi.mutate('Add text', (d) => {
      insertSubtree(d as KDocument, { rootId: node.id, nodes: { [node.id]: node } }, info.id);
      if (containerStatic) writeStyle(d.nodes[info.id], 'base', 'position', 'relative');
    });
  } else insertInto(info, origin, node, null, point, 'Add text');
  startTextEditing(node.id, { caret: client, ownsTx: true });
}

// ─── Root frame height ──────────────────────────────────────────────────────

export function startFrameHeight(e: React.PointerEvent<HTMLElement>) {
  e.preventDefault();
  e.stopPropagation();
  const rootId = currentRootId();
  const rootEl = elementFor(rootId);
  if (!rootId || !rootEl) return;
  const startH = rootEl.offsetHeight;
  const y0 = e.clientY;
  const doc = docApi.doc;
  const hasHeight = parsePx(resolveStyles(doc, doc.nodes[rootId], bp()).height) != null;
  docApi.begin('Resize frame');
  useCanvas.getState().set({ gesture: 'height', cursor: 'ns-resize', frameHeight: startH });
  runGesture(e.pointerId, e.currentTarget, { x: e.clientX, y: e.clientY }, modsOf(e), {
    move: (client, m) => {
      let h = startH + (client.y - y0) / zoom();
      const g = gridSize();
      if (m.shift) h = snapToGrid(h, 100);
      else if (g) h = snapToGrid(h, g);
      h = Math.max(100, Math.round(h));
      const b = bp();
      docApi.mutate('Resize frame', (d) => {
        const n = d.nodes[rootId];
        writeStyle(n, b, 'min-height', `${h}px`);
        if (hasHeight) writeStyle(n, b, 'height', `${h}px`);
      });
      useCanvas.getState().set({ frameHeight: h });
    },
    up: () => {
      useCanvas.getState().clearFeedback();
      docApi.commit('Resize frame');
    },
    cancel: () => {
      docApi.cancel();
      useCanvas.getState().clearFeedback();
    },
  });
}

export type { HandleDir };
