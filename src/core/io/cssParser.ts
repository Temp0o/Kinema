/**
 * Minimal, dependency-free CSS parser (rules, @media, @keyframes, @font-face,
 * flattened @supports/@layer). Keeps declarations as authored (shorthands intact),
 * works identically in browsers, Electron and Node/jsdom tests.
 */
import { parseDeclarations } from '../style/style';
import type { StyleMap } from '../model/types';

export type CssRule =
  | { type: 'style'; selector: string; decls: StyleMap; order: number }
  | { type: 'media'; query: string; rules: CssRule[] }
  | { type: 'keyframes'; name: string; frames: { selector: string; decls: StyleMap }[] }
  | { type: 'fontface'; decls: StyleMap };

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Find index of the matching close brace for the open brace at `start`. */
function matchBrace(s: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length - 1;
}

let orderSeq = 0;

function parseBlock(css: string): CssRule[] {
  const rules: CssRule[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    // drop statements like `@import x;` / stray declarations that precede this block
    const head = (prelude.split(';').pop() ?? '').trim();
    const close = matchBrace(css, open);
    const body = css.slice(open + 1, close);
    i = close + 1;
    if (!head) continue;

    if (head.startsWith('@media')) {
      rules.push({ type: 'media', query: head.slice(6).trim(), rules: parseBlock(body) });
    } else if (/^@(-webkit-)?keyframes/.test(head)) {
      const name = head.replace(/^@(-webkit-)?keyframes/, '').trim().replace(/['"]/g, '');
      const frames: { selector: string; decls: StyleMap }[] = [];
      for (const r of parseBlock(body)) if (r.type === 'style') frames.push({ selector: r.selector, decls: r.decls });
      rules.push({ type: 'keyframes', name, frames });
    } else if (head.startsWith('@font-face')) {
      rules.push({ type: 'fontface', decls: parseDeclarations(body) });
    } else if (head.startsWith('@supports') || head.startsWith('@layer') || head.startsWith('@container') || head.startsWith('@scope')) {
      rules.push(...parseBlock(body));
    } else if (head.startsWith('@')) {
      // @page, @property, etc. — ignored
    } else {
      rules.push({ type: 'style', selector: head, decls: parseDeclarations(body), order: orderSeq++ });
    }
  }
  return rules;
}

export function parseCss(css: string): CssRule[] {
  return parseBlock(stripComments(css));
}

// ─── Media queries ──────────────────────────────────────────────────────────

function toPx(v: string): number {
  const m = /(-?\d*\.?\d+)\s*(px|em|rem)?/.exec(v);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  return m[2] === 'em' || m[2] === 'rem' ? n * 16 : n;
}

/** Evaluate a media query at a given viewport width (screen, no print). */
export function mediaMatches(query: string, width: number): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  // comma = OR
  return q.split(',').some((part) => {
    const p = part.trim();
    if (/^not\b/.test(p)) return false;
    if (/\bprint\b/.test(p) && !/\bscreen\b/.test(p)) return false;
    if (/^only\s+print/.test(p)) return false;
    const conds = p.match(/\([^)]*\)/g) ?? [];
    return conds.every((c) => {
      const inner = c.slice(1, -1).trim();
      let m: RegExpExecArray | null;
      if ((m = /^max-width\s*:\s*(.+)$/.exec(inner))) return width <= toPx(m[1]);
      if ((m = /^min-width\s*:\s*(.+)$/.exec(inner))) return width >= toPx(m[1]);
      if ((m = /^width\s*([<>]=?)\s*(.+)$/.exec(inner))) {
        const v = toPx(m[2]);
        return m[1] === '<' ? width < v : m[1] === '<=' ? width <= v : m[1] === '>' ? width > v : width >= v;
      }
      if ((m = /^(.+?)\s*([<>]=?)\s*width$/.exec(inner))) {
        const v = toPx(m[1]);
        return m[2] === '<' ? v < width : m[2] === '<=' ? v <= width : m[2] === '>' ? v > width : v >= width;
      }
      if (/^prefers-reduced-motion\s*:\s*no-preference/.test(inner)) return true;
      if (/^prefers-reduced-motion\s*:\s*reduce/.test(inner)) return false;
      if (/^prefers-color-scheme\s*:\s*light/.test(inner)) return true;
      if (/^prefers-color-scheme\s*:\s*dark/.test(inner)) return false;
      if (/^hover\s*:\s*hover/.test(inner) || /^pointer\s*:\s*fine/.test(inner)) return true;
      if (/^orientation\s*:\s*landscape/.test(inner)) return width >= 800;
      if (/^orientation\s*:\s*portrait/.test(inner)) return width < 800;
      return false;
    });
  });
}

/** Flatten rules active at a width (media rules expanded in source order). */
export function activeStyleRules(rules: CssRule[], width: number): Extract<CssRule, { type: 'style' }>[] {
  const out: Extract<CssRule, { type: 'style' }>[] = [];
  for (const r of rules) {
    if (r.type === 'style') out.push(r);
    else if (r.type === 'media' && mediaMatches(r.query, width)) out.push(...activeStyleRules(r.rules, width));
  }
  return out;
}

// ─── Specificity ────────────────────────────────────────────────────────────

/** Approximate selector specificity as a single comparable number. */
export function specificity(selector: string): number {
  let s = selector.replace(/::?[a-z-]+\([^)]*\)/gi, (m) => (m.startsWith('::') ? ' ' : ':x'));
  s = s.replace(/"[^"]*"|'[^']*'/g, '');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (s.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:{1,2}[\w-]+/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return ids * 10000 + classes * 100 + types;
}
