/**
 * CSS text helpers for the exporter: safe declarations, rule formatting and a
 * conservative minifier.
 */

export type Decls = [string, string][];

const PROP_RE = /^(--[a-zA-Z0-9_-]+|-?[a-zA-Z][a-zA-Z0-9-]*)$/;

/** Is this a property name we are willing to emit? */
export function validProp(p: string): boolean {
  return PROP_RE.test(p);
}

/** Decode CSS escapes (`\6a avascript`) so scheme checks cannot be dodged. */
function decodeCssEscapes(s: string): string {
  return s.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([\s\S])/g, (_m, hex?: string, ch?: string) => {
    if (hex) {
      const cp = parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return ch ?? '';
  });
}

const DANGEROUS_URL = /^(?:javascript|vbscript|livescript|data:text\/html|data:application\/(?:xhtml|x-))/;

/** Replace `url(javascript:…)`-style references and legacy `expression()` with harmless values. */
export function neutralizeCssUrls(css: string): string {
  let out = css.replace(/url\(\s*((?:[^()]|\([^()]*\))*)\)/gi, (m, inner: string) => {
    // eslint-disable-next-line no-control-regex
    const compact = decodeCssEscapes(inner).replace(/[\u0000- \u007f-\u009f'"]/g, '').toLowerCase();
    return DANGEROUS_URL.test(compact) ? 'url(about:blank)' : m;
  });
  if (/expression\s*\(/i.test(decodeCssEscapes(out))) out = out.replace(/\\?e\\?x\\?p\\?r\\?e\\?s\\?s\\?i\\?o\\?n\s*\(/gi, 'none(');
  return out;
}

/**
 * Make a declaration value safe to drop into a rule: stops at a top-level `;`, drops
 * braces, comments and line breaks, closes dangling strings, neutralizes script-capable
 * urls and anything that could close a <style> element.
 */
export function cleanValue(v: string): string {
  let out = '';
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < v.length; i++) {
    let ch = v[i];
    if (ch === '\r' || ch === '\n' || ch === '\f' || ch === ' ' || ch === ' ') ch = ' ';
    if (quote) {
      // braces inside strings are legal CSS but could still be misread by sloppy tooling: use escapes
      if (ch === '{' || ch === '}') {
        out += ch === '{' ? '\\7b ' : '\\7d ';
        continue;
      }
      if (ch === '\\' && i + 1 < v.length) {
        out += ch + v[i + 1].replace(/[\r\n\f]/g, ' ');
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      out += ch;
      continue;
    }
    if (ch === '*' && v[i + 1] === '/') {
      i++; // stray comment terminator
      continue;
    }
    if (ch === '/' && v[i + 1] === '*') {
      // comments can swallow the following declarations; drop them
      const end = v.indexOf('*/', i + 2);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) break;
    else if (ch === '{' || ch === '}') continue;
    else if (ch === '@' && depth === 0 && /^@import/i.test(v.slice(i, i + 7))) continue;
    out += ch;
  }
  if (quote) out += quote;
  if (depth > 0) out += ')'.repeat(depth);
  return neutralizeCssUrls(out).replace(/<\/(style|script)/gi, '<\\/$1').trim();
}

/** Free-form stylesheet text (custom CSS): keep it a stylesheet, never markup. */
export function sanitizeStylesheet(css: string): string {
  return neutralizeCssUrls(css).replace(/<\/(style|script)/gi, '<\\/$1');
}

const EASING_RE = /^(?:linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|(?:cubic-bezier|steps|linear)\([-\d.,\s%a-z]*\))$/i;
/** A CSS timing function, or `ease` when the value is not one. */
export function safeEasing(e: unknown): string {
  const v = typeof e === 'string' ? cleanValue(e) : '';
  return EASING_RE.test(v) ? v : 'ease';
}

export function formatRule(selector: string, decls: Decls, indent = ''): string {
  const sel = selector
    .split(/,(?![^(]*\))/)
    .map((s) => s.trim())
    .join(`,\n${indent}`);
  if (!decls.length) return `${indent}${sel} {}`;
  return `${indent}${sel} {\n${decls.map(([k, v]) => `${indent}  ${k}: ${v};`).join('\n')}\n${indent}}`;
}

/** Whitespace/comment minifier that keeps strings and significant spaces intact. */
export function minifyCss(css: string): string {
  let out = '';
  let i = 0;
  const n = css.length;
  const noSpaceAfter = '{};,>(:';
  const noSpaceBefore = '{};,>)!';
  while (i < n) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && css[j] !== ch) j += css[j] === '\\' ? 2 : 1;
      out += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (/\s/.test(ch)) {
      let j = i;
      while (j < n && /\s/.test(css[j])) j++;
      // a comment right after whitespace: let the next loop iteration drop it
      const prev = out[out.length - 1];
      const next = css[j];
      if (prev !== undefined && next !== undefined && !noSpaceAfter.includes(prev) && !noSpaceBefore.includes(next) && !(next === '/' && css[j + 1] === '*'))
        out += ' ';
      i = j;
      continue;
    }
    if (ch === '}' && out.endsWith(';')) out = out.slice(0, -1);
    if (noSpaceBefore.includes(ch) && out.endsWith(' ')) out = out.slice(0, -1);
    out += ch;
    i++;
  }
  return out.trim();
}
