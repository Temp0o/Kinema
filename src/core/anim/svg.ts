/**
 * SVG helpers for stroke draw-on animations. Draw-on keyframes animate
 * `stroke-dashoffset` 1 → 0 with `stroke-dasharray: 1`, which only works when
 * every targeted shape carries `pathLength="1"`.
 */
import type { KAnimation } from '../model/types';

export const SVG_SHAPES_SELECTOR = 'path, line, polyline, polygon, circle, rect, ellipse';

const SHAPE_TAGS = new Set(['path', 'line', 'polyline', 'polygon', 'circle', 'rect', 'ellipse']);

/** Does this animation rely on normalized path lengths (stroke dash animation)? */
export function usesStrokeDraw(anim: Pick<KAnimation, 'keyframes'>): boolean {
  return anim.keyframes.some((k) => 'stroke-dashoffset' in k.values || 'stroke-dasharray' in k.values);
}

/** Shape tag names referenced by a selector (only simple tag selectors are recognised). */
export function shapeTagsInSelector(selector: string | undefined): string[] {
  if (!selector) return [];
  return selector
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => SHAPE_TAGS.has(s));
}

/**
 * Add `pathLength="1"` to every shape element (of the given tags) in SVG markup
 * that doesn't already declare a pathLength. Idempotent.
 */
export function addPathLength(svg: string, selector: string = SVG_SHAPES_SELECTOR): string {
  const tags = shapeTagsInSelector(selector);
  if (!tags.length || !svg) return svg;
  const re = new RegExp(`<(${tags.join('|')})\\b([^>]*?)(\\s*/?)>`, 'gi');
  return svg.replace(re, (m, tag: string, attrs: string, close: string) => {
    if (/\spathlength\s*=/i.test(attrs)) return m;
    return `<${tag}${attrs} pathLength="1"${close}>`;
  });
}
