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

/**
 * Make a declaration value safe to drop into a rule: stops at a top-level `;`,
 * drops braces and anything that could close a <style> element.
 */
export function cleanValue(v: string): string {
  let out = '';
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < v.length; i++) {
    const ch = v[i];
    if (quote) {
      if (ch === quote && v[i - 1] !== '\\') quote = null;
      out += ch;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ';' && depth === 0) break;
    else if (ch === '{' || ch === '}') continue;
    out += ch;
  }
  return out.replace(/<\/(style|script)/gi, '<\\/$1').trim();
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
