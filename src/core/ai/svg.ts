/**
 * SVG post-processing for AI artwork: sanitize (DOMPurify SVG profiles, no
 * scripts / foreignObject / external references), validate with DOMParser and
 * normalise (xmlns, viewBox, unique ids so several logos can share a page).
 */
import DOMPurify from 'dompurify';
import { extractSvg } from './text';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface SvgValidation {
  ok: boolean;
  /** Sanitized, normalised markup (only meaningful when ok). */
  svg: string;
  error?: string;
  width: number;
  height: number;
  /** Number of drawable shapes. */
  shapes: number;
}

const SHAPES = 'path,circle,rect,ellipse,polygon,polyline,line,text,use';

/** Sanitize SVG markup (scripts, handlers, foreignObject, images and external refs removed). */
export function sanitizeSvgMarkup(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject', 'image', 'iframe', 'a', 'animate', 'set', 'animateTransform', 'animateMotion'],
    FORBID_ATTR: ['onload', 'onclick', 'onerror'],
  });
}

function parseViewBox(v: string | null): [number, number, number, number] | null {
  if (!v) return null;
  const p = v
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n)) || p[2] <= 0 || p[3] <= 0) return null;
  return p as [number, number, number, number];
}

function lengthAttr(v: string | null): number | null {
  if (!v) return null;
  const m = /^\s*(\d*\.?\d+)\s*(px)?\s*$/.exec(v);
  return m ? parseFloat(m[1]) : null;
}

/** Remove references to anything outside the SVG (href/url() not pointing at a local #id, @import). */
function stripExternalRefs(root: Element) {
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of all) {
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase();
      const val = a.value.trim();
      if ((name === 'href' || name === 'xlink:href') && !val.startsWith('#')) el.removeAttribute(a.name);
      else if (/url\(\s*['"]?(?!#)/i.test(val)) el.removeAttribute(a.name);
    }
    if (el.tagName.toLowerCase() === 'style') {
      el.textContent = (el.textContent ?? '').replace(/@import[^;]*;?/gi, '').replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none');
    }
  }
}

/**
 * Give every id inside the SVG a unique prefix and rewrite `url(#id)` / `href="#id"`
 * references, so multiple SVGs with `id="g1"` gradients don't collide in one DOM.
 */
export function uniquifySvgIds(svg: string, prefix: string): string {
  const ids = new Set<string>();
  svg.replace(/\sid="([^"]+)"/g, (_m, id: string) => {
    ids.add(id);
    return '';
  });
  if (!ids.size) return svg;
  let out = svg;
  for (const id of ids) {
    const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(new RegExp(`(\\sid=")${esc}(")`, 'g'), `$1${prefix}${id}$2`)
      .replace(new RegExp(`url\\(\\s*(['"]?)#${esc}\\1\\s*\\)`, 'g'), `url(#${prefix}${id})`)
      .replace(new RegExp(`((?:xlink:)?href=")#${esc}(")`, 'g'), `$1#${prefix}${id}$2`);
  }
  return out;
}

/**
 * Sanitize + validate SVG markup: must parse as XML without errors, have an
 * `<svg>` root with a viewBox or width/height, and contain at least one shape.
 * The returned markup always has xmlns and a viewBox and no fixed width/height
 * (it scales to its node box).
 */
export function validateSvg(input: string): SvgValidation {
  const fail = (error: string): SvgValidation => ({ ok: false, svg: '', error, width: 0, height: 0, shapes: 0 });
  const raw = input.trim();
  if (!/^<svg\b/i.test(raw)) return fail('The reply does not contain an <svg> element.');
  let clean = sanitizeSvgMarkup(raw);
  if (!/^<svg\b/i.test(clean.trim())) return fail('The SVG was empty after removing unsafe content.');
  if (!/\sxmlns=/.test(clean.slice(0, clean.indexOf('>')))) clean = clean.replace(/^<svg\b/i, `<svg xmlns="${SVG_NS}"`);
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const perr = doc.getElementsByTagName('parsererror')[0];
  if (perr) return fail(`The SVG is not well-formed XML (${(perr.textContent ?? '').trim().slice(0, 120)}).`);
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') return fail('The root element is not <svg>.');
  stripExternalRefs(root);
  let vb = parseViewBox(root.getAttribute('viewBox'));
  const w = lengthAttr(root.getAttribute('width'));
  const h = lengthAttr(root.getAttribute('height'));
  if (!vb) {
    if (w && h) {
      vb = [0, 0, w, h];
      root.setAttribute('viewBox', `0 0 ${w} ${h}`);
    } else return fail('The SVG needs a viewBox (e.g. viewBox="0 0 256 256").');
  }
  root.removeAttribute('width');
  root.removeAttribute('height');
  for (const a of ['data-kid', 'class', 'style']) root.removeAttribute(a);
  const shapes = root.querySelectorAll(SHAPES).length;
  if (!shapes) return fail('The SVG contains no shapes.');
  const svg = new XMLSerializer().serializeToString(root).replace(/\s+xmlns:xlink="[^"]*"(?=[\s\S]*xmlns:xlink)/, '');
  return { ok: true, svg, width: vb[2], height: vb[3], shapes };
}

/** Extract + validate in one go (used by the SVG pipeline). */
export function svgFromReply(reply: string): SvgValidation {
  const svg = extractSvg(reply);
  if (!svg) return { ok: false, svg: '', error: 'The reply does not contain an <svg> element.', width: 0, height: 0, shapes: 0 };
  return validateSvg(svg);
}

/** Display size (px) for an inserted SVG node, keeping the viewBox aspect ratio. */
export function svgDisplaySize(width: number, height: number, target = 200): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: target, height: target };
  const ratio = width / height;
  if (ratio >= 1) return { width: Math.round(Math.min(target * 1.6, target * ratio)), height: Math.round(Math.min(target * 1.6, target * ratio) / ratio) };
  return { width: Math.round(target * ratio), height: target };
}
