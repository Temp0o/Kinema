/**
 * Fill model for the Design panel: parse `background` (shorthand, as AI and
 * imported HTML often write it) plus the background-* longhands into one editable
 * fill, and serialize it back as longhands.
 */
import type { StyleMap } from '@/core/model/types';
import { splitSpaces, splitTopLevel } from '@/ui/color/cssValue';
import { isColorValue } from '@/ui/color/colorUtils';
import { parseGradient, serializeGradient, type Gradient } from '@/ui/color/gradient';

export type FillType = 'none' | 'solid' | 'linear' | 'radial' | 'conic' | 'image' | 'raw';

export interface ImageLayer {
  /** url without the url() wrapper, e.g. `asset:abc` or `https://…` */
  url: string;
  size: string;
  position: string;
  repeat: string;
}

export interface FillModel {
  type: FillType;
  /** background-color (also the base color under gradients / images) */
  color: string | null;
  gradient: Gradient | null;
  image: ImageLayer | null;
  /** When type === 'raw': the property and value we could not model. */
  raw: { prop: 'background' | 'background-image'; value: string } | null;
}

export const BG_PROPS = [
  'background',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
] as const;

const REPEAT_KW = /^(repeat|no-repeat|repeat-x|repeat-y|space|round)$/i;
const ATTACH_KW = /^(scroll|fixed|local)$/i;
const BOX_KW = /^(border-box|padding-box|content-box|text)$/i;
const POS_KW = /^(left|right|top|bottom|center)$/i;
const SIZE_KW = /^(cover|contain|auto)$/i;
const LEN = /^-?\d*\.?\d+([a-z%]*)$/i;

export function unwrapUrl(v: string): string | null {
  const m = /^url\(\s*(['"]?)([\s\S]*?)\1\s*\)$/i.exec(v.trim());
  return m ? m[2] : null;
}

export function wrapUrl(url: string): string {
  return /[\s()'"]/.test(url) ? `url("${url.replace(/"/g, '\\"')}")` : `url(${url})`;
}

interface ShorthandParts {
  color: string | null;
  image: string | null;
  size: string | null;
  position: string | null;
  repeat: string | null;
}

/** Parse a single-layer `background` shorthand. Null when it isn't single-layer or has unknown tokens. */
export function parseBackgroundShorthand(value: string): ShorthandParts | null {
  const layers = splitTopLevel(value, ',');
  if (layers.length !== 1) return null;
  const layer = layers[0];
  const slash = splitTopLevel(layer, '/');
  if (slash.length > 2) return null;
  const before = splitSpaces(slash[0]);
  const after = slash.length === 2 ? splitSpaces(slash[1]) : [];
  const out: ShorthandParts = { color: null, image: null, size: null, position: null, repeat: null };
  const pos: string[] = [];
  const size: string[] = [];
  // tokens directly after the slash are the size (1–2 tokens)
  while (after.length && size.length < 2 && (SIZE_KW.test(after[0]) || LEN.test(after[0]))) size.push(after.shift()!);
  if (slash.length === 2 && !size.length) return null;
  const rest = [...before, ...after];
  const repeat: string[] = [];
  for (const t of rest) {
    if (/^none$/i.test(t)) out.image = 'none';
    else if (/^(repeating-)?(linear|radial|conic)-gradient\(/i.test(t) || /^url\(/i.test(t) || /^image-set\(/i.test(t)) {
      if (out.image) return null;
      out.image = t;
    } else if (REPEAT_KW.test(t)) repeat.push(t);
    else if (ATTACH_KW.test(t) || BOX_KW.test(t)) {
      /* dropped: not editable */
    } else if (POS_KW.test(t) || LEN.test(t)) pos.push(t);
    else if (isColorValue(t)) {
      if (out.color) return null;
      out.color = t;
    } else return null;
  }
  if (pos.length) out.position = pos.join(' ');
  if (size.length) out.size = size.join(' ');
  if (repeat.length) out.repeat = repeat.join(' ');
  return out;
}

/** Read the effective fill from a (resolved) style map. Respects declaration order. */
export function parseFill(map: StyleMap): FillModel {
  let color: string | null = null;
  let image: string | null = null;
  let size: string | null = null;
  let position: string | null = null;
  let repeat: string | null = null;
  let raw: FillModel['raw'] = null;

  for (const k of Object.keys(map)) {
    const v = map[k];
    if (v == null || v === '') continue;
    switch (k) {
      case 'background': {
        const sh = parseBackgroundShorthand(v);
        if (!sh) {
          raw = { prop: 'background', value: v };
          color = image = size = position = repeat = null;
        } else {
          raw = null;
          color = sh.color;
          image = sh.image;
          size = sh.size;
          position = sh.position;
          repeat = sh.repeat;
        }
        break;
      }
      case 'background-color':
        color = v;
        break;
      case 'background-image':
        image = v;
        if (raw?.prop === 'background-image') raw = null;
        break;
      case 'background-size':
        size = v;
        break;
      case 'background-position':
        position = v;
        break;
      case 'background-repeat':
        repeat = v;
        break;
    }
  }

  const model: FillModel = { type: 'none', color, gradient: null, image: null, raw: null };
  if (raw) {
    // a later longhand can't make an unparseable shorthand editable; keep raw
    return { ...model, type: 'raw', raw };
  }
  if (image && !/^none$/i.test(image.trim())) {
    const layers = splitTopLevel(image, ',');
    if (layers.length === 1) {
      const g = parseGradient(layers[0]);
      const url = g ? null : unwrapUrl(layers[0]);
      if (g) return { ...model, type: g.type, gradient: g };
      if (url != null)
        return {
          ...model,
          type: 'image',
          image: { url, size: size ?? 'auto', position: position ?? '0% 0%', repeat: repeat ?? 'repeat' },
        };
    }
    return { ...model, type: 'raw', raw: { prop: 'background-image', value: image } };
  }
  if (color && !/^transparent$/i.test(color.trim())) model.type = 'solid';
  return model;
}

/**
 * Longhand patch for a fill. `explicit` writes 'none'/'transparent' instead of
 * deleting (needed at non-base breakpoints and in interaction states, where
 * deleting would just inherit the underlying value).
 */
export function fillPatch(model: FillModel, explicit: boolean): Record<string, string | null> {
  const off = (v: string) => (explicit ? v : null);
  const patch: Record<string, string | null> = {
    background: null,
    'background-color': null,
    'background-image': null,
    'background-size': null,
    'background-position': null,
    'background-repeat': null,
  };
  switch (model.type) {
    case 'none':
      patch['background-color'] = off('transparent');
      patch['background-image'] = off('none');
      break;
    case 'solid':
      patch['background-color'] = model.color ?? off('transparent');
      patch['background-image'] = off('none');
      break;
    case 'linear':
    case 'radial':
    case 'conic':
      if (model.gradient) patch['background-image'] = serializeGradient(model.gradient);
      patch['background-color'] = model.color ?? off('transparent');
      break;
    case 'image':
      if (model.image) {
        patch['background-image'] = wrapUrl(model.image.url);
        patch['background-size'] = model.image.size || null;
        patch['background-position'] = model.image.position || null;
        patch['background-repeat'] = model.image.repeat || null;
      }
      patch['background-color'] = model.color ?? off('transparent');
      break;
    case 'raw':
      if (model.raw) patch[model.raw.prop] = model.raw.value;
      break;
  }
  return patch;
}

/** CSS for a small preview swatch of a fill. */
export function fillPreviewCss(model: FillModel): string {
  switch (model.type) {
    case 'solid':
      return model.color ?? 'transparent';
    case 'linear':
    case 'radial':
    case 'conic':
      return model.gradient ? serializeGradient(model.gradient) : 'transparent';
    case 'raw':
      return model.raw?.value ?? 'transparent';
    default:
      return 'transparent';
  }
}
