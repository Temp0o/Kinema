/**
 * Box-model helpers: padding / margin / border-radius shorthands ↔ longhands,
 * and the border model (width/style/color per side).
 */
import type { StyleMap } from '@/core/model/types';
import { splitSpaces, lengthToPx, isLength } from '@/ui/color/cssValue';
import { isColorValue } from '@/ui/color/colorUtils';

export const SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type Side = (typeof SIDES)[number];
export const CORNERS = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;
export type Corner = (typeof CORNERS)[number];

export type Quad = [string, string, string, string];

/** "10px 20px" → ["10px","20px","10px","20px"] (CSS 1–4 value expansion). */
export function expandBox(value: string | undefined | null): Quad {
  const t = splitSpaces((value ?? '').trim());
  if (!t.length) return ['', '', '', ''];
  const [a, b = a, c = a, d = b] = t;
  return [a, b, c, d];
}

/** Shortest equivalent 1–4 value form. */
export function collapseBox(q: Quad): string {
  const [t, r, b, l] = q;
  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

/** Effective 4 sides of `padding` / `margin` honoring declaration order. '' = unset. */
export function readBox(map: StyleMap, prop: 'padding' | 'margin'): Quad {
  let q: Quad = ['', '', '', ''];
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (!v) continue;
    if (k === prop) q = expandBox(v);
    else if (k.startsWith(prop + '-')) {
      const side = k.slice(prop.length + 1) as Side;
      const i = SIDES.indexOf(side);
      if (i >= 0) {
        q = [...q] as Quad;
        q[i] = v;
      }
    }
  }
  return q;
}

/** Patch writing 4 sides: shorthand when all equal, otherwise longhands. */
export function boxPatch(prop: 'padding' | 'margin', q: Quad): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  const allSet = q.every((v) => v !== '');
  if (allSet && q.every((v) => v === q[0])) {
    patch[prop] = q[0];
    for (const s of SIDES) patch[`${prop}-${s}`] = null;
  } else {
    patch[prop] = null;
    SIDES.forEach((s, i) => (patch[`${prop}-${s}`] = q[i] === '' ? null : q[i]));
  }
  return patch;
}

// ─── Radius ─────────────────────────────────────────────────────────────────

/** Effective corner radii (TL, TR, BR, BL). Elliptical parts after '/' are ignored. */
export function readRadius(map: StyleMap): Quad {
  let q: Quad = ['', '', '', ''];
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (!v) continue;
    if (k === 'border-radius') q = expandBox(v.split('/')[0]);
    else {
      const m = /^border-(top-left|top-right|bottom-right|bottom-left)-radius$/.exec(k);
      if (m) {
        q = [...q] as Quad;
        q[CORNERS.indexOf(m[1] as Corner)] = splitSpaces(v)[0] ?? v;
      }
    }
  }
  return q;
}

export function radiusPatch(q: Quad): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  if (q.every((v) => v === '')) {
    patch['border-radius'] = null;
    for (const c of CORNERS) patch[`border-${c}-radius`] = null;
    return patch;
  }
  const filled = q.map((v) => v || '0') as Quad;
  patch['border-radius'] = collapseBox(filled);
  for (const c of CORNERS) patch[`border-${c}-radius`] = null;
  return patch;
}

// ─── Border ─────────────────────────────────────────────────────────────────

export interface SideBorder {
  width: string;
  style: string;
  color: string;
}

export const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset', 'none'];
const STYLE_RE = /^(none|hidden|solid|dashed|dotted|double|groove|ridge|inset|outset)$/i;
const WIDTH_KW: Record<string, string> = { thin: '1px', medium: '3px', thick: '5px' };

export function parseBorderShorthand(v: string): Partial<SideBorder> | null {
  const out: Partial<SideBorder> = {};
  for (const t of splitSpaces(v)) {
    if (STYLE_RE.test(t)) out.style = t.toLowerCase();
    else if (WIDTH_KW[t.toLowerCase()]) out.width = WIDTH_KW[t.toLowerCase()];
    else if (isLength(t)) out.width = t;
    else if (isColorValue(t)) out.color = t;
    else return null;
  }
  return out;
}

const BORDER_PROP_RE = /^border(-(top|right|bottom|left))?(-(width|style|color))?$/;

/** Every border property name (excluding radius) — cleared when writing a border. */
export const BORDER_PROPS: string[] = (() => {
  const out = ['border', 'border-width', 'border-style', 'border-color'];
  for (const s of SIDES) {
    out.push(`border-${s}`);
    for (const p of ['width', 'style', 'color']) out.push(`border-${s}-${p}`);
  }
  return out;
})();

export interface BorderModel {
  sides: [SideBorder, SideBorder, SideBorder, SideBorder];
  /** a value we could not interpret */
  raw: string | null;
}

/** Read the effective border of each side. Unset style = none. */
export function readBorder(map: StyleMap): BorderModel {
  const blank = (): SideBorder => ({ width: '', style: '', color: '' });
  let sides = [blank(), blank(), blank(), blank()] as BorderModel['sides'];
  let raw: string | null = null;
  const setAll = (fn: (s: SideBorder, i: number) => void) => {
    sides = sides.map((s, i) => {
      const c = { ...s };
      fn(c, i);
      return c;
    }) as BorderModel['sides'];
  };
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (!v) continue;
    const m = BORDER_PROP_RE.exec(k);
    if (!m) continue;
    const side = m[2] as Side | undefined;
    const part = m[4] as 'width' | 'style' | 'color' | undefined;
    const idx = side ? SIDES.indexOf(side) : -1;
    if (!part) {
      const sh = /^(0|none)$/i.test(v.trim()) ? { width: '0', style: 'none', color: '' } : parseBorderShorthand(v);
      if (!sh) {
        raw = `${k}: ${v}`;
        continue;
      }
      // shorthand resets omitted parts
      setAll((s, i) => {
        if (idx >= 0 && i !== idx) return;
        s.width = sh.width ?? '3px';
        s.style = sh.style ?? 'none';
        s.color = sh.color ?? '';
      });
    } else if (idx >= 0) {
      sides = sides.map((s, i) => (i === idx ? { ...s, [part]: part === 'width' ? WIDTH_KW[v] ?? v : v } : s)) as BorderModel['sides'];
    } else {
      const q = expandBox(v);
      setAll((s, i) => {
        s[part] = part === 'width' ? WIDTH_KW[q[i]] ?? q[i] : q[i];
      });
    }
  }
  return { sides, raw };
}

/** Width in px of a side (0 when style is none/unset). */
export function sideWidthPx(s: SideBorder): number {
  if (!s.style || s.style === 'none' || s.style === 'hidden') return 0;
  return lengthToPx(s.width || '3px') ?? 0;
}

export interface BorderEdit {
  widths: [number, number, number, number];
  style: string;
  color: string;
}

/** Summarize a border model into one style/color + per-side widths. */
export function summarizeBorder(b: BorderModel): BorderEdit | null {
  const visible = b.sides.filter((s) => sideWidthPx(s) > 0);
  if (!visible.length) return null;
  return {
    widths: b.sides.map(sideWidthPx) as BorderEdit['widths'],
    style: visible[0].style || 'solid',
    color: visible.find((s) => s.color)?.color || 'currentColor',
  };
}

/** Patch writing a border edit. null → remove border. */
export function borderPatch(edit: BorderEdit | null, explicitNone: boolean): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  for (const p of BORDER_PROPS) patch[p] = null;
  if (!edit || edit.style === 'none' || edit.widths.every((w) => w <= 0)) {
    if (explicitNone) patch.border = 'none';
    return patch;
  }
  const w = edit.widths.map((n) => (n ? `${Math.round(n * 100) / 100}px` : '0')) as Quad;
  if (w.every((x) => x === w[0])) patch.border = `${w[0]} ${edit.style} ${edit.color}`;
  else {
    patch['border-width'] = collapseBox(w);
    patch['border-style'] = edit.style;
    patch['border-color'] = edit.color;
  }
  return patch;
}
