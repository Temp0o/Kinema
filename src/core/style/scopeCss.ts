/**
 * Scope user "custom CSS" to the canvas root so it can never restyle the editor UI.
 * Handles comments, strings, nested conditional at-rules (@media, @supports, @layer,
 * @container) and leaves @keyframes / @font-face alone. `@import` is dropped.
 */
export const CANVAS_SCOPE = '.kc-root';

const NESTED = /^@(media|supports|layer|container|document|scope)\b/i;

function skipString(css: string, i: number): number {
  const q = css[i];
  let j = i + 1;
  while (j < css.length && css[j] !== q) j += css[j] === '\\' ? 2 : 1;
  return j + 1;
}

/** Index just past the `}` matching the `{` at `open` (or end of input). */
function matchBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const ch = css[i];
    if (ch === '"' || ch === "'") i = skipString(css, i) - 1;
    else if (ch === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2);
      i = e < 0 ? css.length : e + 1;
    } else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i + 1;
  }
  return css.length;
}

function splitTopLevel(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === '"' || ch === "'") {
      const e = skipString(sel, i);
      buf += sel.slice(i, e);
      i = e - 1;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
    } else buf += ch;
  }
  out.push(buf);
  return out;
}

function scopeSelector(raw: string, scope: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^(html|body|:root)$/i.test(t)) return scope;
  // `body .x`, `html > body p` → drop the document-level prefix
  const stripped = t.replace(/^(?:html|body|:root)(?=[\s>+~])\s*/i, '');
  return `${scope} ${stripped}`;
}

export function scopeCss(css: string, scope = CANVAS_SCOPE): string {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    // skip whitespace and comments
    if (/\s/.test(css[i])) {
      i++;
      continue;
    }
    if (css[i] === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    // prelude up to `{` or `;`
    let j = i;
    while (j < n && css[j] !== '{' && css[j] !== ';') {
      if (css[j] === '"' || css[j] === "'") j = skipString(css, j);
      else if (css[j] === '/' && css[j + 1] === '*') {
        const e = css.indexOf('*/', j + 2);
        j = e < 0 ? n : e + 2;
      } else j++;
    }
    const prelude = css.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (j >= n || css[j] === ';') {
      // statement at-rule (@charset, @import, @namespace…): only harmless ones survive
      if (/^@(charset|namespace)\b/i.test(prelude)) out += `${prelude};\n`;
      i = j + 1;
      continue;
    }
    const end = matchBrace(css, j);
    const body = css.slice(j + 1, Math.max(j + 1, end - (css[end - 1] === '}' ? 1 : 0)));
    i = end;
    if (prelude.startsWith('@')) {
      if (NESTED.test(prelude)) out += `${prelude} {\n${scopeCss(body, scope)}}\n`;
      else if (/^@(-webkit-)?keyframes\b|^@font-face\b|^@property\b|^@counter-style\b|^@page\b/i.test(prelude)) out += `${prelude} {${body}}\n`;
      continue;
    }
    if (!prelude) continue;
    out += `${splitTopLevel(prelude).map((s) => scopeSelector(s, scope)).filter(Boolean).join(', ')} {${body}}\n`;
  }
  return out;
}
