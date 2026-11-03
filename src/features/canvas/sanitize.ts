/**
 * Memoized sanitizers for canvas content (rich text and inline SVG).
 */
import DOMPurify from 'dompurify';

export const RICH_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'span', 'a', 'code', 'mark', 'small', 'sub', 'sup', 'del', 'ins'];

const richCache = new Map<string, string>();
export function sanitizeRich(html: string): string {
  let v = richCache.get(html);
  if (v === undefined) {
    v = DOMPurify.sanitize(html, { ALLOWED_TAGS: RICH_TAGS, ALLOWED_ATTR: ['style', 'href', 'class', 'target', 'rel'] });
    if (richCache.size > 2000) richCache.clear();
    richCache.set(html, v);
  }
  return v;
}

const svgCache = new Map<string, string>();
export function sanitizeSvg(svg: string): string {
  let v = svgCache.get(svg);
  if (v === undefined) {
    v = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['use'], FORBID_TAGS: ['script', 'foreignObject'] });
    if (svgCache.size > 500) svgCache.clear();
    svgCache.set(svg, v);
  }
  return v;
}

/** Escape plain text for use as rich text (newlines → <br>). */
export function textToRich(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>');
}
