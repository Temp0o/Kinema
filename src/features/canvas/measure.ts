/**
 * DOM measurement in world coordinates. The world origin is the top-left of
 * `.kc-root`. Layout offsets are used (not getBoundingClientRect) so the zoom
 * transform and the nodes' own `rotate` don't distort the layout boxes.
 */
import type { NodeId } from '@/core/model/types';
import { uiApi } from '@/core/store/uiStore';
import { docApi } from '@/core/store/docStore';
import { parseRotate, resolveStyles } from '@/core/style/style';
import type { Point, Rect } from './geometry';

export function viewportEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.kc-viewport');
}

export function worldEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.kc-root');
}

/** Canvas element for a document node (instance roots carry the instance id). */
export function elementFor(id: NodeId | null | undefined): HTMLElement | null {
  if (!id) return null;
  const root = worldEl();
  if (!root) return null;
  return root.querySelector<HTMLElement>(`[data-kid="${CSS.escape(id)}"]`);
}

/** Unrotated border box of an element in world px. */
export function worldRectOf(el: HTMLElement): Rect | null {
  const root = worldEl();
  if (!root || !el.isConnected) return null;
  if (el.offsetParent === null) {
    // display:none, or position:fixed — fall back to client rects
    const style = getComputedStyle(el);
    if (style.display === 'none') return null;
    const r = el.getBoundingClientRect();
    const p = clientToWorld(r.left, r.top);
    const z = uiApi.state.viewport.zoom;
    return { x: p.x, y: p.y, w: r.width / z, h: r.height / z };
  }
  let x = el.offsetLeft;
  let y = el.offsetTop;
  let p = el.offsetParent as HTMLElement | null;
  while (p && p !== root) {
    x += p.offsetLeft + p.clientLeft;
    y += p.offsetTop + p.clientTop;
    p = p.offsetParent as HTMLElement | null;
  }
  if (!p) return null; // not inside the world
  // scrolled ancestors shift their content
  for (let a = el.parentElement; a && a !== root; a = a.parentElement) {
    if (a.scrollLeft || a.scrollTop) {
      x -= a.scrollLeft;
      y -= a.scrollTop;
    }
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

export function worldRectFor(id: NodeId): Rect | null {
  const el = elementFor(id);
  return el ? worldRectOf(el) : null;
}

/** Padding-box origin (what absolute children's left/top are relative to). */
export function paddingOrigin(el: HTMLElement): Point | null {
  const r = worldRectOf(el);
  return r ? { x: r.x + el.clientLeft, y: r.y + el.clientTop } : null;
}

/** Rotation (deg) from the node's standalone `rotate` style at the active breakpoint. */
export function nodeRotation(id: NodeId): number {
  const doc = docApi.doc;
  const n = doc.nodes[id];
  if (!n) return 0;
  return parseRotate(resolveStyles(doc, n, uiApi.state.breakpoint).rotate);
}

// ─── Coordinate conversion ──────────────────────────────────────────────────

let vpRectCache: DOMRect | null = null;

/** Called by the canvas when the viewport element resizes / panels move. */
export function invalidateViewportRect() {
  vpRectCache = null;
}

/** Viewport client rect (cached until the viewport resizes). */
export function viewportRect(): DOMRect | null {
  const vp = viewportEl();
  if (!vp) return null;
  if (!vpRectCache || !vp.isConnected) vpRectCache = vp.getBoundingClientRect();
  return vpRectCache;
}

/** Client (page) coordinates → screen coordinates relative to the viewport. */
export function clientToScreen(cx: number, cy: number): Point {
  const r = viewportRect();
  return r ? { x: cx - r.left, y: cy - r.top } : { x: cx, y: cy };
}

export function screenToWorld(sx: number, sy: number): Point {
  const v = uiApi.state.viewport;
  return { x: (sx - v.panX) / v.zoom, y: (sy - v.panY) / v.zoom };
}

export function worldToScreen(wx: number, wy: number): Point {
  const v = uiApi.state.viewport;
  return { x: wx * v.zoom + v.panX, y: wy * v.zoom + v.panY };
}

export function clientToWorld(cx: number, cy: number): Point {
  const s = clientToScreen(cx, cy);
  return screenToWorld(s.x, s.y);
}

/** Computed style helpers (call sparingly — only at gesture start). */
export function isAbsoluteEl(el: HTMLElement): boolean {
  const p = getComputedStyle(el).position;
  return p === 'absolute' || p === 'fixed';
}
