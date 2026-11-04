/** Pure geometry for the spotlight cutout and coach-mark placement. */
import type { TourPlacement } from './engine';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function unionBoxes(boxes: Box[]): Box | null {
  const b = boxes.filter((r) => r.w > 0 || r.h > 0);
  if (!b.length) return null;
  const x = Math.min(...b.map((r) => r.x));
  const y = Math.min(...b.map((r) => r.y));
  const x2 = Math.max(...b.map((r) => r.x + r.w));
  const y2 = Math.max(...b.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Grow by padding and clip to the viewport. */
export function padBox(r: Box, pad: number, vw: number, vh: number): Box {
  const x = Math.max(2, r.x - pad);
  const y = Math.max(2, r.y - pad);
  const x2 = Math.min(vw - 2, r.x + r.w + pad);
  const y2 = Math.min(vh - 2, r.y + r.h + pad);
  return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
}

const OPPOSITE: Record<Exclude<TourPlacement, 'center'>, Exclude<TourPlacement, 'center'>> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Position a card of size cw×ch next to `r`, preferring `placement`, then its
 * opposite, then the other sides. If nothing fits (huge targets) the card sits
 * inside the target's bottom-right corner. Always clamped to the viewport.
 */
export function placeCard(r: Box | null, cw: number, ch: number, placement: TourPlacement, vw: number, vh: number, gap = 14, margin = 12): { x: number; y: number; side: TourPlacement } {
  const fit = (x: number, y: number, side: TourPlacement) => ({ x: clamp(x, margin, Math.max(margin, vw - cw - margin)), y: clamp(y, margin, Math.max(margin, vh - ch - margin)), side });
  if (!r || placement === 'center') return fit((vw - cw) / 2, (vh - ch) / 2, 'center');
  const order = [placement, OPPOSITE[placement], ...(['bottom', 'right', 'top', 'left'] as const).filter((s) => s !== placement && s !== OPPOSITE[placement])];
  const cx = r.x + r.w / 2 - cw / 2;
  const cy = r.y + r.h / 2 - ch / 2;
  for (const side of order) {
    if (side === 'right' && r.x + r.w + gap + cw <= vw - margin) return fit(r.x + r.w + gap, cy, side);
    if (side === 'left' && r.x - gap - cw >= margin) return fit(r.x - gap - cw, cy, side);
    if (side === 'bottom' && r.y + r.h + gap + ch <= vh - margin) return fit(cx, r.y + r.h + gap, side);
    if (side === 'top' && r.y - gap - ch >= margin) return fit(cx, r.y - gap - ch, side);
  }
  return fit(r.x + r.w - cw - 20, r.y + r.h - ch - 20, 'center');
}
