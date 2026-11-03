/**
 * Color helpers (pure): parsing CSS color values including design-token
 * references (`var(--k-name)`), formatting in hex / rgb / hsl, and collecting the
 * colors used in a document.
 */
import { colord, extend, type Colord, type HsvaColor, type RgbaColor } from 'colord';
import namesPlugin from 'colord/plugins/names';
import type { KDocument, StyleMap } from '@/core/model/types';

extend([namesPlugin]);

export type { Colord, HsvaColor, RgbaColor };
export type ColorMode = 'hex' | 'rgb' | 'hsl';

export interface TokenLike {
  name: string;
  value: string;
}

const TOKEN_RE = /^var\(\s*--k-([\w-]+)\s*(?:,\s*([\s\S]+))?\)$/i;

/** `var(--k-primary)` → "primary" (null for anything else). */
export function tokenNameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = TOKEN_RE.exec(value.trim());
  return m ? m[1] : null;
}

export function tokenVar(name: string): string {
  return `var(--k-${name})`;
}

/** Keyword colors that are valid but have no fixed RGB value. */
export function isKeywordColor(value: string): boolean {
  return /^(currentcolor|inherit|initial|unset|revert)$/i.test(value.trim());
}

/**
 * Resolve a CSS color value to a colord instance. Token references are resolved
 * against `tokens`. Returns null for currentColor / unparseable values.
 */
export function toColord(value: string | null | undefined, tokens?: TokenLike[], depth = 0): Colord | null {
  if (!value || depth > 6) return null;
  const v = value.trim();
  if (!v) return null;
  const m = TOKEN_RE.exec(v);
  if (m) {
    const tok = tokens?.find((t) => t.name === m[1]);
    if (tok) return toColord(tok.value, tokens, depth + 1);
    return m[2] ? toColord(m[2], tokens, depth + 1) : null;
  }
  if (/^transparent$/i.test(v)) return colord({ r: 0, g: 0, b: 0, a: 0 });
  if (isKeywordColor(v)) return null;
  const c = colord(v);
  return c.isValid() ? c : null;
}

/** Does this look like a CSS color (incl. tokens / keywords)? */
export function isColorValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (/^var\(/i.test(v)) return true;
  if (/^transparent$/i.test(v) || isKeywordColor(v)) return true;
  if (/^(color-mix|light-dark|oklch|oklab|lab|lch|hwb|color)\(/i.test(v)) return true;
  return colord(v).isValid();
}

/** Format a color in a given mode. Hex includes alpha (#rrggbbaa) when translucent. */
export function formatColor(c: Colord, mode: ColorMode = 'hex'): string {
  switch (mode) {
    case 'rgb':
      return c.toRgbString();
    case 'hsl':
      return c.toHslString();
    default:
      return c.toHex().toLowerCase();
  }
}

/** Guess the authored mode of a value so edits preserve the user's format. */
export function detectMode(value: string | null | undefined): ColorMode {
  const v = (value ?? '').trim().toLowerCase();
  if (v.startsWith('rgb')) return 'rgb';
  if (v.startsWith('hsl')) return 'hsl';
  return 'hex';
}

export function hsvaToCss(hsva: HsvaColor, mode: ColorMode = 'hex'): string {
  return formatColor(colord(hsva), mode);
}

/** Normalized key for comparing colors (#rrggbb or #rrggbbaa, lowercase). Null if not a fixed color. */
export function colorKey(value: string | null | undefined, tokens?: TokenLike[]): string | null {
  const c = toColord(value, tokens);
  return c ? c.toHex().toLowerCase() : null;
}

/** Text color (black/white) readable on top of a color. */
export function readableOn(c: Colord | null): string {
  if (!c || c.alpha() < 0.5) return '#111';
  return c.isDark() ? '#fff' : '#111';
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Linear RGB interpolation between two colors (0 → a, 1 → b). */
export function mixColors(a: string, b: string, t: number, tokens?: TokenLike[]): string {
  const ca = toColord(a, tokens)?.toRgb() ?? { r: 0, g: 0, b: 0, a: 1 };
  const cb = toColord(b, tokens)?.toRgb() ?? { r: 0, g: 0, b: 0, a: 1 };
  const lerp = (x: number, y: number) => x + (y - x) * t;
  return formatColor(colord({ r: lerp(ca.r, cb.r), g: lerp(ca.g, cb.g), b: lerp(ca.b, cb.b), a: lerp(ca.a, cb.a) }), 'hex');
}

// ─── Document color scanning ────────────────────────────────────────────────

const COLOR_IN_VALUE_RE = /#[0-9a-f]{3,8}\b|rgba?\([^()]*\)|hsla?\([^()]*\)/gi;

/** Fixed colors (hex keys) appearing in a set of style maps, most frequent first. */
export function colorsInStyles(maps: Iterable<StyleMap>, limit = 24): string[] {
  const counts = new Map<string, number>();
  for (const map of maps) {
    for (const k in map) {
      if (k.startsWith('--')) continue;
      const v = map[k];
      if (!v || typeof v !== 'string') continue;
      const found = v.match(COLOR_IN_VALUE_RE);
      if (!found) continue;
      for (const f of found) {
        const key = colorKey(f);
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}

/** Colors used anywhere in the document's node styles (all breakpoints + states). */
export function collectDocColors(doc: Pick<KDocument, 'nodes'>, limit = 24): string[] {
  function* maps() {
    for (const n of Object.values(doc.nodes)) {
      for (const bp in n.styles) yield n.styles[bp];
      if (n.states) for (const s of Object.values(n.states)) if (s) yield s;
    }
  }
  return colorsInStyles(maps(), limit);
}
