/**
 * Sanitizers used by the exporter. Rich text and SVG use the same DOMPurify
 * configuration as the canvas (features/canvas/NodeView) so exports render the
 * same markup; free-form attributes are filtered so no script can sneak in.
 */
import DOMPurify from 'dompurify';
import { cleanValue, neutralizeCssUrls } from './css';

export const RICH_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'span', 'a', 'code', 'mark', 'small', 'sub', 'sup', 'del', 'ins'];

/** Typographic / colour properties allowed in inline `style` of rich text spans. */
const RICH_STYLE_PROPS = new Set([
  'color', 'background-color', 'background', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch', 'font',
  'text-decoration', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style', 'text-underline-offset', 'text-transform',
  'letter-spacing', 'word-spacing', 'line-height', 'vertical-align', 'white-space', 'text-shadow', 'opacity', '-webkit-text-fill-color',
]);

/** Keep only allowed declarations, with urls and legacy expressions neutralized. */
export function filterRichStyle(style: string): string {
  const out: string[] = [];
  for (const part of style.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    const value = cleanValue(part.slice(i + 1));
    if (!RICH_STYLE_PROPS.has(prop) || !value || /url\s*\(/i.test(value)) continue;
    out.push(`${prop}: ${value}`);
  }
  return out.join('; ');
}

const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

function hardenRich(html: string): string {
  if (!html || !hasDom() || html.indexOf('style') < 0) return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  for (const el of Array.from(tpl.content.querySelectorAll('[style]'))) {
    const v = filterRichStyle(el.getAttribute('style') ?? '');
    if (v) el.setAttribute('style', v);
    else el.removeAttribute('style');
  }
  return tpl.innerHTML;
}

const richCache = new Map<string, string>();
export function sanitizeRichText(html: string): string {
  let v = richCache.get(html);
  if (v === undefined) {
    v = hardenRich(DOMPurify.sanitize(html, { ALLOWED_TAGS: RICH_TAGS, ALLOWED_ATTR: ['style', 'href', 'class', 'target', 'rel'] }));
    // links opened in a new tab must not get a handle on the opener
    v = v.replace(/<a\b([^>]*?)target="_blank"([^>]*)>/g, (m, a: string, b: string) =>
      /\brel=/.test(a + b) ? m : `<a${a}target="_blank" rel="noopener"${b}>`,
    );
    if (richCache.size > 2000) richCache.clear();
    richCache.set(html, v);
  }
  return v;
}

// ─── SVG ─────────────────────────────────────────────────────────────────────

const SVG_SHAPES = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textpath', 'defs', 'use', 'symbol', 'stop',
  'lineargradient', 'radialgradient', 'clippath', 'mask', 'image', 'filter', 'pattern', 'marker',
]);
const SVG_PSEUDO = new Set(['hover', 'focus', 'active', 'first-child', 'last-child', 'nth-child', 'first-of-type', 'last-of-type']);

/**
 * `<style>` inside inline SVG applies to the whole page. Keep only rules whose selectors can
 * only match SVG parts (classes that are not editor/canvas classes, ids, svg element names);
 * drop at-rules except keyframes.
 */
export function filterSvgCss(css: string): string {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).trim();
    // find the matching close brace
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    const body = text.slice(open + 1, depth === 0 ? j - 1 : j);
    i = j;
    if (/^@(-webkit-)?keyframes\s+[\w-]+$/i.test(prelude)) {
      out.push(`${prelude}{${neutralizeCssUrls(body).replace(/[<>]/g, '')}}`);
      continue;
    }
    if (!prelude || prelude.startsWith('@') || body.includes('{')) continue;
    const sels = prelude.split(',').map((x) => x.trim());
    if (!sels.every(svgSelectorOk)) continue;
    const decls = body
      .split(';')
      .map((d) => d.trim())
      .filter((d) => /^[-a-z]+\s*:/i.test(d))
      .map((d) => {
        const k = d.indexOf(':');
        return `${d.slice(0, k).trim()}: ${cleanValue(d.slice(k + 1))}`;
      })
      .filter((d) => !/^(position|z-index|inset|top|left|right|bottom)\s*:/i.test(d));
    out.push(`${sels.join(', ')}{${decls.join(';')}}`);
  }
  return out.join('\n');
}

function svgSelectorOk(sel: string): boolean {
  if (!sel || /[\[\]*>~+|\\]/.test(sel)) return false;
  const re = /([.#:]?)([A-Za-z_][\w-]*)(\([^)]*\))?/g;
  const cleaned = sel.replace(/\s+/g, ' ');
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    const [all, kind, name] = m;
    consumed += all.length;
    const lower = name.toLowerCase();
    if (kind === '.') {
      if (/^(k-|kc-)/i.test(name)) return false;
    } else if (kind === ':') {
      if (!SVG_PSEUDO.has(lower)) return false;
    } else if (kind !== '#') {
      if (!SVG_SHAPES.has(lower)) return false;
    }
  }
  return consumed + (cleaned.match(/ /g)?.length ?? 0) === cleaned.length;
}

const SMIL = new Set(['animate', 'set', 'animatetransform', 'animatemotion']);

function hardenSvg(html: string): string {
  if (!html || !hasDom()) return html;
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  for (const el of Array.from(tpl.content.querySelectorAll('*'))) {
    const tag = el.localName.toLowerCase();
    if (SMIL.has(tag) && /href/i.test(el.getAttribute('attributeName') ?? '')) {
      el.remove();
      continue;
    }
    if (tag === 'style') {
      el.textContent = filterSvgCss(el.textContent ?? '');
      continue;
    }
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      if (n === 'href' || n === 'xlink:href') {
        const v = a.value.trim();
        // <use> may only reference the document's own symbols; everything else gets the usual url filter
        if (tag === 'use' ? !v.startsWith('#') : safeUrl(v) !== v) el.removeAttribute(a.name);
      } else if (n === 'style') {
        const v = neutralizeCssUrls(a.value);
        if (v !== a.value) el.setAttribute(a.name, v);
      } else if (n.startsWith('on')) el.removeAttribute(a.name);
    }
  }
  return tpl.innerHTML;
}

const svgCache = new Map<string, string>();
export function sanitizeSvgMarkup(svg: string): string {
  let v = svgCache.get(svg);
  if (v === undefined) {
    v = hardenSvg(DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['use'], FORBID_TAGS: ['script', 'foreignObject'] }));
    if (svgCache.size > 500) svgCache.clear();
    svgCache.set(svg, v);
  }
  return v;
}

const BLOCKED_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'template', 'noscript',
  'frame', 'frameset', 'html', 'head', 'body', 'title', 'applet', 'param', 'slot', 'portal',
]);

/** A safe element name for a node tag (falls back when invalid or dangerous). */
export function safeTag(tag: string | undefined, fallback: string): string {
  const t = (tag ?? '').trim().toLowerCase();
  if (!t || !/^[a-z][a-z0-9-]*$/.test(t) || BLOCKED_TAGS.has(t)) return fallback;
  return t;
}

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster', 'background', 'cite', 'data', 'srcset', 'ping']);

/** Neutralize script-capable URLs (javascript:, vbscript:, data:text/html). */
export function safeUrl(url: string): string {
  // eslint-disable-next-line no-control-regex
  const compact = url.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
  if (/^(javascript|vbscript):/.test(compact)) return '#';
  if (/^data:/.test(compact) && !/^data:(image\/(png|jpe?g|gif|webp|avif|svg\+xml)|video\/|audio\/|font\/)/.test(compact)) return '#';
  return url;
}

/**
 * Filter user attributes: valid names only, never `on*` handlers, no `style`
 * (styles come from the design), no attributes reserved by the exporter.
 */
export function safeAttrs(attrs: Record<string, string> | undefined, reserved: Set<string>): [string, string][] {
  if (!attrs) return [];
  const out: [string, string][] = [];
  for (const [rawName, rawValue] of Object.entries(attrs)) {
    const name = rawName.trim();
    const lower = name.toLowerCase();
    if (!/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(name)) continue;
    if (lower.startsWith('on') || lower === 'style' || lower === 'srcdoc' || lower === 'is') continue;
    if (lower === 'data-kid' || lower.startsWith('data-k-') || lower.startsWith('data-km')) continue;
    if (reserved.has(lower)) continue;
    let value = String(rawValue ?? '');
    if (URL_ATTRS.has(lower)) value = safeUrl(value);
    out.push([name, value]);
  }
  return out;
}
