/**
 * Memoized sanitizers for canvas content (rich text and inline SVG).
 */
import { RICH_TAGS, sanitizeRichText, sanitizeSvgMarkup } from '@/core/export/sanitize';

// The canvas and the exporter share one implementation so both render the same markup.
export { RICH_TAGS };
export const sanitizeRich = sanitizeRichText;
export const sanitizeSvg = sanitizeSvgMarkup;

/** Escape plain text for use as rich text (newlines → <br>). */
export function textToRich(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br>');
}
