/**
 * Tiny CSS value tokenizer helpers shared by the color / gradient / shadow
 * parsers and the properties panel. Pure functions, no DOM.
 */

/** Split on a separator character at the top level (ignores separators inside (), quotes). */
export function splitTopLevel(input: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let buf = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      buf += ch;
      if (ch === '\\') {
        buf += input[++i] ?? '';
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === sep) {
      out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (!input.trim()) return [];
  out.push(buf.trim());
  return out;
}

/** Split a value on top-level whitespace ("1px solid rgb(0, 0, 0)" → 3 tokens). */
export function splitSpaces(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let buf = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(ch)) {
      if (buf) out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

const LENGTH_RE = /^(-?\d*\.?\d+(?:e-?\d+)?)(px|rem|em|%|vw|vh|vmin|vmax|ch|ex|pt|cm|mm|in|pc|q|svh|lvh|dvh|svw|lvw|dvw)?$/i;

/** Parse a CSS length into px (rem/em = 16px, pt = 4/3). Returns null for non-lengths. */
export function lengthToPx(token: string): number | null {
  const m = LENGTH_RE.exec(token.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = (m[2] ?? '').toLowerCase();
  if (!unit) return n; // unitless numbers are treated as px (0, or sloppy authored values)
  switch (unit) {
    case 'px':
      return n;
    case 'rem':
    case 'em':
      return n * 16;
    case 'pt':
      return (n * 4) / 3;
    default:
      return null;
  }
}

export function isLength(token: string): boolean {
  return LENGTH_RE.test(token.trim());
}

/** Round to at most `d` decimals and stringify without trailing zeros. */
export function fmtNum(n: number, d = 2): string {
  const f = 10 ** d;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? '0' : String(r);
}

/** "12" → "12px", 0 → "0" */
export function pxStr(n: number, d = 2): string {
  const s = fmtNum(n, d);
  return s === '0' ? '0' : `${s}px`;
}

/** Parse a CSS <time> ("200ms", "0.3s") into ms. */
export function parseTime(token: string): number | null {
  const m = /^(-?\d*\.?\d+)(ms|s)$/i.exec(token.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === 's' ? n * 1000 : n;
}

/** Parse a CSS angle into degrees. */
export function parseAngle(token: string): number | null {
  const m = /^(-?\d*\.?\d+)(deg|turn|rad|grad)?$/i.exec(token.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch ((m[2] ?? 'deg').toLowerCase()) {
    case 'turn':
      return n * 360;
    case 'rad':
      return (n * 180) / Math.PI;
    case 'grad':
      return n * 0.9;
    default:
      return m[2] || n === 0 ? n : null;
  }
}
