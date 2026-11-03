/**
 * Style resolution & conversion helpers shared by the canvas, properties panel,
 * exporter and AI engine.
 */
import type { BreakpointId, KDocument, KNode, StyleMap } from '../model/types';
import type { CSSProperties } from 'react';

/** Breakpoint ids that apply (in cascade order) when previewing `bp`. */
export function breakpointChain(doc: Pick<KDocument, 'breakpoints'>, bp: BreakpointId): BreakpointId[] {
  const idx = doc.breakpoints.findIndex((b) => b.id === bp);
  if (idx < 0) return ['base'];
  return doc.breakpoints.slice(0, idx + 1).map((b) => b.id);
}

/** Pick the breakpoint whose media range contains a given canvas width. */
export function breakpointForWidth(doc: Pick<KDocument, 'breakpoints'>, width: number): BreakpointId {
  let current: BreakpointId = 'base';
  for (const b of doc.breakpoints) {
    if (b.maxWidth == null) continue;
    if (width <= b.maxWidth) current = b.id;
  }
  return current;
}

/** Merged styles for a node at a breakpoint (base → … → bp). */
export function resolveStyles(doc: Pick<KDocument, 'breakpoints'>, node: KNode, bp: BreakpointId): StyleMap {
  const chain = breakpointChain(doc, bp);
  if (chain.length === 1) return node.styles.base ?? {};
  const out: StyleMap = {};
  for (const id of chain) {
    const m = node.styles[id];
    if (!m) continue;
    for (const k in m) {
      // A breakpoint's declaration comes later in the exported cascade than the base one, so a changed
      // property moves to the end: `padding` (md) must beat an earlier `padding-top` (base), as in CSS.
      if (k in out && out[k] !== m[k]) delete out[k];
      out[k] = m[k];
    }
  }
  return out;
}

/** Where does a property's effective value come from at bp? (for the "overridden" dots in the inspector) */
export function styleSource(doc: Pick<KDocument, 'breakpoints'>, node: KNode, bp: BreakpointId, prop: string): BreakpointId | null {
  const chain = breakpointChain(doc, bp);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (node.styles[chain[i]]?.[prop] !== undefined) return chain[i];
  }
  return null;
}

// ─── Case conversion ─────────────────────────────────────────────────────────

const camelCache = new Map<string, string>();
export function kebabToCamel(prop: string): string {
  if (prop.startsWith('--')) return prop;
  let v = camelCache.get(prop);
  if (!v) {
    v = prop.replace(/^-ms-/, 'ms-').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    camelCache.set(prop, v);
  }
  return v;
}

export function camelToKebab(prop: string): string {
  if (prop.startsWith('--')) return prop;
  return prop.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()).replace(/^ms-/, '-ms-');
}

/** Shorthands whose longhands we expand when a map holds both (React updates style props one by one, so a changed shorthand would silently overwrite an unchanged longhand). */
const SHORTHANDS: Record<string, string[]> = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  inset: ['top', 'right', 'bottom', 'left'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  gap: ['row-gap', 'column-gap'],
};

function splitTopLevel(v: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of v.trim()) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function expandShorthand(name: string, value: string): string[] | null {
  const p = splitTopLevel(value.replace(/\s*!important\s*$/i, ''));
  if (!p.length || /\//.test(value)) return null;
  if (name === 'gap') return p.length === 1 ? [p[0], p[0]] : p.length === 2 ? [p[0], p[1]] : null;
  if (p.length === 1) return [p[0], p[0], p[0], p[0]];
  if (p.length === 2) return [p[0], p[1], p[0], p[1]];
  if (p.length === 3) return [p[0], p[1], p[2], p[1]];
  return p.length === 4 ? p : null;
}

/** Resolve shorthand/longhand coexistence in declaration order (later wins), leaving only longhands for the conflicting groups. */
export function expandConflictingShorthands(map: StyleMap): StyleMap {
  let conflicts: string[] | null = null;
  for (const sh in SHORTHANDS) if (sh in map && SHORTHANDS[sh].some((l) => l in map)) (conflicts ??= []).push(sh);
  if (!conflicts) return map;
  const keys = Object.keys(map);
  const out: StyleMap = {};
  for (const k of keys) {
    if (!conflicts.includes(k)) {
      out[k] = map[k];
      continue;
    }
    const longs = SHORTHANDS[k];
    const vals = expandShorthand(k, map[k]);
    if (!vals) {
      out[k] = map[k];
      continue;
    }
    const at = keys.indexOf(k);
    longs.forEach((l, i) => {
      // a longhand declared after the shorthand overrides it; one declared before is replaced by it
      if (keys.indexOf(l) > at) return;
      delete out[l];
      out[l] = vals[i];
    });
  }
  return out;
}

/** Shorthands whose longhands are `<shorthand>-…` (background-color, border-top-width, font-size, …). */
const PREFIX_SHORTHANDS = ['background', 'border', 'font', 'flex', 'outline', 'transition', 'text-decoration', 'grid-template', 'overflow', 'list-style', 'columns', 'mask'];

/**
 * React updates inline style properties one at a time and skips unchanged ones, so removing
 * `background-color` while `background` stays (or changing a shorthand while an unchanged
 * longhand follows it) leaves the element with the wrong value. When a shorthand and its
 * longhands coexist, every member of the group gets the same harmless comment suffix derived
 * from the whole group: any change in the group re-applies all members, in declaration order.
 */
function tagConflictGroups(src: StyleMap): StyleMap {
  let out: StyleMap | null = null;
  for (const sh of PREFIX_SHORTHANDS) {
    if (!(sh in src)) continue;
    const members = Object.keys(src).filter((k) => k === sh || k.startsWith(sh + '-'));
    if (members.length < 2) continue;
    let h = 0x811c9dc5;
    for (const k of members) for (const ch of `${k}:${src[k]};`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
    const sig = ` /*k${(h >>> 0).toString(36)}*/`;
    out ??= { ...src };
    for (const k of members) if (!/!important\s*$/i.test(src[k])) out[k] = `${src[k]}${sig}`;
  }
  return out ?? src;
}

const reactStyleCache = new WeakMap<StyleMap, CSSProperties>();
/** Convert a StyleMap into a React style object (memoized per map identity). */
export function toReactStyle(map: StyleMap): CSSProperties {
  let cached = reactStyleCache.get(map);
  if (cached) return cached;
  const out: Record<string, string> = {};
  const src = tagConflictGroups(expandConflictingShorthands(map));
  for (const k in src) {
    const v = src[k];
    if (v === undefined || v === null || v === '') continue;
    out[kebabToCamel(k)] = v;
  }
  cached = out as CSSProperties;
  reactStyleCache.set(map, cached);
  return cached;
}

/** Serialize a StyleMap to a CSS declaration block body. */
export function styleMapToCss(map: StyleMap, indent = '  '): string {
  return Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${indent}${k}: ${v};`)
    .join('\n');
}

/** Parse a CSS declaration list ("a: b; c: d") into a StyleMap. Robust to url(data:...;...) values. */
export function parseDeclarations(css: string): StyleMap {
  const out: StyleMap = {};
  let depth = 0;
  let quote: string | null = null;
  let buf = '';
  const parts: string[] = [];
  for (const ch of css) {
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) {
      parts.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  for (const p of parts) {
    const i = p.indexOf(':');
    if (i < 0) continue;
    const k = p.slice(0, i).trim().toLowerCase();
    const v = p.slice(i + 1).trim().replace(/\s*!important$/i, '');
    if (k && v) out[k.startsWith('--') ? p.slice(0, i).trim() : k] = v;
  }
  return out;
}

// ─── Numeric helpers ─────────────────────────────────────────────────────────

/** Parse "12px" / "12" → 12. Returns null for non-px units (%, auto, rem, …). */
export function parsePx(v: string | undefined | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  const m = /^(-?\d*\.?\d+)(px)?$/i.exec(s);
  return m ? parseFloat(m[1]) : null;
}

export function px(n: number): string {
  return `${Math.round(n * 100) / 100}px`;
}

/** Split a CSS value into number + unit. "1.5rem" → { n: 1.5, unit: 'rem' } */
export function splitUnit(v: string | undefined): { n: number | null; unit: string } {
  if (!v) return { n: null, unit: '' };
  const m = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(v.trim());
  if (!m) return { n: null, unit: '' };
  return { n: parseFloat(m[1]), unit: m[2] };
}

/** Parse a "rotate" value (deg/turn/rad) into degrees. */
export function parseRotate(v: string | undefined): number {
  if (!v) return 0;
  const m = /^(-?\d*\.?\d+)(deg|turn|rad|grad)?$/.exec(v.trim());
  if (!m) return 0;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case 'turn':
      return n * 360;
    case 'rad':
      return (n * 180) / Math.PI;
    case 'grad':
      return n * 0.9;
    default:
      return n;
  }
}

/** CSS custom properties for design tokens (applied on canvas root and :root in export). */
export function tokenCssVars(doc: Pick<KDocument, 'tokens'>): StyleMap {
  const vars: StyleMap = {};
  for (const c of doc.tokens.colors) vars[`--k-${c.name}`] = c.value;
  vars['--k-font-heading'] = fontStack(doc.tokens.fonts.heading);
  vars['--k-font-body'] = fontStack(doc.tokens.fonts.body);
  vars['--k-font-mono'] = fontStack(doc.tokens.fonts.mono);
  vars['--k-radius'] = `${doc.tokens.radius}px`;
  vars['--k-space'] = `${doc.tokens.spacing}px`;
  return vars;
}

export function fontStack(family: string): string {
  const quoted = /\s/.test(family) && !/^['"]/.test(family) ? `'${family}'` : family;
  return `${quoted}, system-ui, -apple-system, 'Segoe UI', sans-serif`;
}

/** Is a node laid out by its parent's flex/grid flow (vs. absolutely positioned)? */
export function isFlowChild(parentStyle: StyleMap | undefined, childStyle: StyleMap): boolean {
  const pos = childStyle.position;
  if (pos === 'absolute' || pos === 'fixed') return false;
  return true;
}

export function isFlexOrGrid(style: StyleMap | undefined): boolean {
  const d = style?.display ?? '';
  return d.includes('flex') || d.includes('grid');
}
