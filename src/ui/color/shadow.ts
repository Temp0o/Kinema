/**
 * box-shadow / text-shadow model: parse and serialize shadow lists.
 */
import { splitSpaces, splitTopLevel, lengthToPx, isLength, pxStr } from './cssValue';
import { isColorValue } from './colorUtils';

export interface Shadow {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  inset: boolean;
}

export const DEFAULT_SHADOW: Shadow = { x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(15, 16, 32, 0.12)', inset: false };
export const DEFAULT_TEXT_SHADOW: Shadow = { x: 0, y: 1, blur: 2, spread: 0, color: 'rgba(0, 0, 0, 0.25)', inset: false };

function parseOne(part: string): Shadow | null {
  const toks = splitSpaces(part);
  const lengths: number[] = [];
  let color: string | null = null;
  let inset = false;
  for (const t of toks) {
    if (/^inset$/i.test(t)) {
      inset = true;
      continue;
    }
    if (isLength(t)) {
      const px = lengthToPx(t);
      if (px == null) return null;
      lengths.push(px);
      continue;
    }
    if (color == null && isColorValue(t)) {
      color = t;
      continue;
    }
    return null;
  }
  if (lengths.length < 2 || lengths.length > 4) return null;
  return {
    x: lengths[0],
    y: lengths[1],
    blur: Math.max(0, lengths[2] ?? 0),
    spread: lengths[3] ?? 0,
    color: color ?? 'currentColor',
    inset,
  };
}

/**
 * Parse a shadow list. `none`/empty → []. Returns null when the value can't be
 * represented (the UI then shows the raw value).
 */
export function parseShadows(value: string | null | undefined): Shadow[] | null {
  if (value == null) return [];
  const v = value.trim();
  if (!v || /^none$/i.test(v)) return [];
  const out: Shadow[] = [];
  for (const part of splitTopLevel(v, ',')) {
    const s = parseOne(part);
    if (!s) return null;
    out.push(s);
  }
  return out;
}

/** Serialize shadows. Empty list → null (clear the property). */
export function serializeShadows(list: Shadow[], opts: { text?: boolean } = {}): string | null {
  if (!list.length) return null;
  return list
    .map((s) => {
      const parts = [pxStr(s.x), pxStr(s.y), pxStr(s.blur)];
      if (!opts.text && s.spread) parts.push(pxStr(s.spread));
      const body = `${parts.join(' ')} ${s.color}`;
      return !opts.text && s.inset ? `inset ${body}` : body;
    })
    .join(', ');
}
