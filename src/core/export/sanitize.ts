/**
 * Sanitizers used by the exporter. Rich text and SVG use the same DOMPurify
 * configuration as the canvas (features/canvas/NodeView) so exports render the
 * same markup; free-form attributes are filtered so no script can sneak in.
 */
import DOMPurify from 'dompurify';

const RICH_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'span', 'a', 'code', 'mark', 'small', 'sub', 'sup', 'del', 'ins'];

const richCache = new Map<string, string>();
export function sanitizeRichText(html: string): string {
  let v = richCache.get(html);
  if (v === undefined) {
    v = DOMPurify.sanitize(html, { ALLOWED_TAGS: RICH_TAGS, ALLOWED_ATTR: ['style', 'href', 'class', 'target', 'rel'] });
    // links opened in a new tab must not get a handle on the opener
    v = v.replace(/<a\b([^>]*?)target="_blank"([^>]*)>/g, (m, a: string, b: string) =>
      /\brel=/.test(a + b) ? m : `<a${a}target="_blank" rel="noopener"${b}>`,
    );
    if (richCache.size > 2000) richCache.clear();
    richCache.set(html, v);
  }
  return v;
}

const svgCache = new Map<string, string>();
export function sanitizeSvgMarkup(svg: string): string {
  let v = svgCache.get(svg);
  if (v === undefined) {
    v = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['use'], FORBID_TAGS: ['script', 'foreignObject'] });
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
