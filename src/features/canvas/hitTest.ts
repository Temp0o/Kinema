/**
 * DOM hit-testing: map pointer targets to document node paths and find drop
 * containers under the pointer.
 */
import type { KNode, NodeId } from '@/core/model/types';
import { docApi } from '@/core/store/docStore';
import { currentRootId } from '@/core/store/actions';
import { canContain } from '@/core/model/tree';
import { pathFor } from './selectionRules';
import { computeDropIndex, type DropIndexResult, type FlowLayout, type Point, type Rect } from './geometry';
import { elementFor, worldRectOf } from './measure';

/** Path (deepest first → root) for the node rendered at/around a DOM element, within the current root. */
export function pathFromElement(target: EventTarget | null): NodeId[] {
  const rootId = currentRootId();
  if (!rootId || !(target instanceof Element)) return [];
  const nodes = docApi.doc.nodes;
  let el: Element | null = target.closest('[data-kid]');
  while (el) {
    const id = el.getAttribute('data-kid')!;
    if (nodes[id]) {
      const path = pathFor(nodes, id);
      if (path[path.length - 1] === rootId) return path;
    }
    el = el.parentElement?.closest('[data-kid]') ?? null;
  }
  return [];
}

/** Is the element part of the rendered design (vs. editor chrome / overlays)? */
export function isInWorld(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('.kc-root');
}

/** May new content be dropped into this node? */
export function isDropContainer(n: KNode | undefined): boolean {
  if (!n || n.locked) return false;
  if (n.type === 'frame' || n.type === 'box') return true;
  // buttons/links are containers by type, but only act as drop targets once they hold children
  return (n.type === 'button' || n.type === 'link') && n.children.length > 0;
}

export interface ContainerQuery {
  /** nodes being dragged (they and their subtrees are ignored) */
  dragged?: ReadonlySet<NodeId>;
  /**
   * Siblings of the dragged nodes are only entered when this returns true
   * (spring-loading after a dwell).
   */
  allowEnter?: (siblingId: NodeId) => boolean;
  /** original parent of the dragged nodes */
  originParent?: NodeId | null;
  /** extra nodes to look through (e.g. the originals of an Alt-duplicate drag) */
  ignore?: ReadonlySet<NodeId>;
}

/**
 * Deepest valid drop container under a client point. `hoverSibling` reports the
 * sibling subtree of the dragged nodes under the pointer (entered or not), so
 * callers can implement spring-loading.
 */
export function containerAt(clientX: number, clientY: number, q: ContainerQuery = {}): { id: NodeId; hoverSibling: NodeId | null } | null {
  const rootId = currentRootId();
  if (!rootId) return null;
  const nodes = docApi.doc.nodes;
  const dragged = q.dragged ?? new Set<NodeId>();
  const ignore = q.ignore ?? dragged;
  const els = document.elementsFromPoint(clientX, clientY);
  for (const el of els) {
    if (!(el instanceof HTMLElement) || !el.closest('.kc-root')) continue;
    let path = pathFromElement(el);
    if (!path.length) continue;
    // skip anything inside the dragged subtrees
    if (path.some((id) => ignore.has(id) || dragged.has(id))) continue;
    // sibling subtrees need spring-loading
    let hoverSibling: NodeId | null = null;
    if (q.originParent) {
      const pi = path.indexOf(q.originParent);
      if (pi > 0) {
        hoverSibling = path[pi - 1];
        if (!q.allowEnter?.(hoverSibling)) path = path.slice(pi);
      }
    }
    for (const id of path) {
      const n = nodes[id];
      if (!isDropContainer(n)) continue;
      if ([...dragged].some((d) => !canContain(nodes, id, d))) continue;
      return { id, hoverSibling };
    }
    return { id: rootId, hoverSibling };
  }
  return null;
}

// ─── Container layout ───────────────────────────────────────────────────────

export interface ContainerInfo {
  id: NodeId;
  el: HTMLElement;
  mode: 'flow' | 'free';
  layout: FlowLayout;
  rect: Rect;
}

export function flowLayoutOf(el: HTMLElement): { flexOrGrid: boolean; layout: FlowLayout } {
  const cs = getComputedStyle(el);
  const d = cs.display;
  if (d.includes('flex')) {
    return { flexOrGrid: true, layout: { direction: (cs.flexDirection as FlowLayout['direction']) || 'row', wrap: cs.flexWrap !== 'nowrap' } };
  }
  if (d.includes('grid')) {
    const col = cs.gridAutoFlow.startsWith('column');
    return { flexOrGrid: true, layout: { direction: col ? 'column' : 'row', wrap: true } };
  }
  return { flexOrGrid: false, layout: { direction: 'column', wrap: false } };
}

function isStaticChildEl(el: HTMLElement | null): boolean {
  if (!el) return false;
  const p = getComputedStyle(el).position;
  return p !== 'absolute' && p !== 'fixed';
}

/**
 * How content dropped into `containerId` is placed:
 *  - flex/grid → flow (insert at index)
 *  - static content into a block container that already has static children → flow
 *  - otherwise freeform (absolute at the drop point)
 */
export function containerInfo(containerId: NodeId, opts: { staticContent: boolean; exclude?: ReadonlySet<NodeId>; forceFree?: boolean }): ContainerInfo | null {
  const el = elementFor(containerId);
  const rect = el ? worldRectOf(el) : null;
  if (!el || !rect) return null;
  const { flexOrGrid, layout } = flowLayoutOf(el);
  let mode: 'flow' | 'free' = 'free';
  if (flexOrGrid) mode = 'flow';
  else if (opts.staticContent && !opts.forceFree) {
    const n = docApi.doc.nodes[containerId];
    const hasStatic = n?.children.some((c) => !opts.exclude?.has(c) && isStaticChildEl(elementFor(c)));
    if (hasStatic) mode = 'flow';
  }
  return { id: containerId, el, mode, layout, rect };
}

/** Child rects (world) of a container, excluding some ids and non-rendered children. */
export function childRects(containerId: NodeId, exclude?: ReadonlySet<NodeId>): { ids: NodeId[]; rects: Rect[] } {
  const n = docApi.doc.nodes[containerId];
  const ids: NodeId[] = [];
  const rects: Rect[] = [];
  for (const c of n?.children ?? []) {
    if (exclude?.has(c)) continue;
    const el = elementFor(c);
    if (!el || !isStaticChildEl(el)) continue;
    const r = worldRectOf(el);
    if (!r) continue;
    ids.push(c);
    rects.push(r);
  }
  return { ids, rects };
}

/**
 * Insertion index (among non-excluded flow children) + indicator for a flow
 * container. The returned index is relative to the container's full children list.
 */
export function flowDrop(info: ContainerInfo, p: Point, exclude: ReadonlySet<NodeId>): { index: number; line: DropIndexResult['line'] } {
  const { ids, rects } = childRects(info.id, exclude);
  const r = computeDropIndex(rects, p, info.layout, info.rect);
  const all = docApi.doc.nodes[info.id]?.children ?? [];
  // map index among measured flow children → gap index in the full list
  let index: number;
  if (r.index < ids.length) index = all.indexOf(ids[r.index]);
  else if (ids.length) index = all.indexOf(ids[ids.length - 1]) + 1;
  else index = all.length;
  return { index, line: r.line };
}
