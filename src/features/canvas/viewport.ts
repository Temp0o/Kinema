/**
 * Viewport (zoom / pan) helpers.
 */
import { uiApi } from '@/core/store/uiStore';
import { fitRect, nextZoomStep, rotatedAabb, unionRects, type Rect } from './geometry';
import { nodeRotation, viewportEl, worldRectFor } from './measure';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

/** Zoom keeping the screen point (sx, sy) fixed. */
export function zoomAt(nextZoom: number, sx: number, sy: number) {
  const { viewport } = uiApi.state;
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const wx = (sx - viewport.panX) / viewport.zoom;
  const wy = (sy - viewport.panY) / viewport.zoom;
  uiApi.state.setViewport({ zoom: z, panX: sx - wx * z, panY: sy - wy * z });
}

function viewportCenter(): [number, number] {
  const vp = viewportEl();
  return vp ? [vp.clientWidth / 2, vp.clientHeight / 2] : [600, 400];
}

/** Step to the next/previous preset zoom level around the viewport center. */
export function zoomStep(dir: 1 | -1) {
  const [x, y] = viewportCenter();
  zoomAt(nextZoomStep(uiApi.state.viewport.zoom, dir), x, y);
}

export function zoomTo(z: number) {
  const [x, y] = viewportCenter();
  zoomAt(z, x, y);
}

/** Fit the current frame into the viewport. */
export function zoomToFit(viewportElement?: HTMLElement | null) {
  const vp = viewportElement ?? viewportEl();
  const frame = document.querySelector<HTMLElement>('.kc-root');
  if (!vp || !frame) return;
  const { canvasWidth } = uiApi.state;
  const fh = frame.offsetHeight || 900;
  const pad = 64;
  const widthZ = Math.min(1, (vp.clientWidth - pad * 2) / canvasWidth);
  const heightZ = (vp.clientHeight - pad * 2) / fh;
  let z = widthZ;
  // Tall pages: shrink to show more of the page, but never below a readable 50%
  // (or the width-fit zoom, whichever is smaller). The rest scrolls.
  if (fh * widthZ > vp.clientHeight - pad * 2) z = Math.max(Math.min(widthZ, heightZ), Math.min(widthZ, 0.5));
  const zoom = Math.max(MIN_ZOOM, z);
  const panX = (vp.clientWidth - canvasWidth * zoom) / 2;
  const panY = Math.max(pad, (vp.clientHeight - fh * zoom) / 2);
  uiApi.state.setViewport({ zoom, panX, panY: Math.min(panY, pad + 8) });
}

/** Fit the selection (or the frame when nothing is selected). */
export function zoomToSelection() {
  const vp = viewportEl();
  const ids = uiApi.state.selection;
  if (!vp) return;
  const rects = ids
    .map((id) => {
      const r = worldRectFor(id);
      return r ? rotatedAabb(r, nodeRotation(id)) : null;
    })
    .filter((r): r is Rect => !!r);
  const b = unionRects(rects);
  if (!b) return zoomToFit(vp);
  uiApi.state.setViewport(fitRect(b, vp.clientWidth, vp.clientHeight, 80, 4, MIN_ZOOM));
}
