/**
 * Content helpers: rich text ↔ plain text, SVG color detection / recoloring and
 * attribute validation.
 */
import { colorKey } from '@/ui/color/colorUtils';

// ─── Text ───────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Rich inline HTML → plain text (br → newline, tags stripped, entities decoded). */
export function htmlToPlain(html: string | undefined): string {
  if (!html) return '';
  return decodeEntities(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''));
}

/** Plain text → safe inline HTML (escaped, newlines → <br>). */
export function plainToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

/** Does the HTML contain formatting beyond line breaks? */
export function hasRichFormatting(html: string | undefined): boolean {
  return !!html && /<(?!br\s*\/?>)[a-z]/i.test(html);
}

// ─── SVG colors ─────────────────────────────────────────────────────────────

const ATTR_RE = /(\s)(fill|stroke|stop-color|flood-color|lighting-color|color)\s*=\s*(["'])([^"']*)\3/gi;
const DECL_RE = /(^|[;{\s"'])(fill|stroke|stop-color|flood-color|lighting-color)\s*:\s*([^;"'}]+)/gi;

function isPaint(v: string): boolean {
  const t = v.trim().toLowerCase();
  return !!t && t !== 'none' && t !== 'currentcolor' && t !== 'transparent' && t !== 'inherit' && !t.startsWith('url(');
}

/** Distinct colors used for fill/stroke/stops in SVG markup (normalized hex keys, document order). */
export function extractSvgColors(svg: string): string[] {
  const seen: string[] = [];
  const add = (v: string) => {
    if (!isPaint(v)) return;
    const k = colorKey(v.trim());
    if (k && !seen.includes(k)) seen.push(k);
  };
  for (const m of svg.matchAll(ATTR_RE)) add(m[4]);
  for (const m of svg.matchAll(DECL_RE)) add(m[3]);
  return seen;
}

/** Replace every paint equal to `from` (any notation) with `to`. */
export function replaceSvgColor(svg: string, from: string, to: string): string {
  const key = colorKey(from);
  const match = (v: string) => (isPaint(v) && colorKey(v.trim()) === key) || (!key && v.trim() === from);
  return svg
    .replace(ATTR_RE, (m, sp: string, attr: string, q: string, v: string) => (match(v) ? `${sp}${attr}=${q}${to}${q}` : m))
    .replace(DECL_RE, (m, pre: string, prop: string, v: string) => (match(v) ? `${pre}${prop}: ${to}` : m));
}

/**
 * Replace all paints with currentColor so the icon follows the CSS `color`.
 * Returns the new markup and the most used original color (to keep the look).
 */
export function svgToCurrentColor(svg: string): { svg: string; color: string | null } {
  const colors = extractSvgColors(svg);
  let out = svg;
  for (const c of colors) out = replaceSvgColor(out, c, 'currentColor');
  // an svg with no paint at all renders black fill: make it explicit
  if (!colors.length && !/<svg\b[^>]*\sfill\s*=/i.test(out)) out = out.replace(/<svg\b/i, '<svg fill="currentColor"');
  return { svg: out, color: colors[0] ?? null };
}

// ─── Attributes ─────────────────────────────────────────────────────────────

const ATTR_NAME_RE = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;
const BLOCKED_ATTRS = new Set(['style', 'class', 'src', 'srcdoc', 'href', 'xlink:href', 'formaction']);

/** Validate a free-form attribute name. Returns an error message or null. */
export function attrNameError(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Name required';
  if (!ATTR_NAME_RE.test(n)) return 'Invalid attribute name';
  if (/^on/i.test(n)) return 'Event handlers (on*) are not allowed';
  if (BLOCKED_ATTRS.has(n.toLowerCase())) return `“${n}” is managed by Kinema`;
  return null;
}
