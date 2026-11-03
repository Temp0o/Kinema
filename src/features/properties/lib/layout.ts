/**
 * Layout helpers: width/height sizing modes (px, %, vw/vh, Auto, Fill, Hug),
 * flex alignment mapping and grid track counting.
 */
import type { StyleMap } from '@/core/model/types';
import { splitSpaces, fmtNum } from '@/ui/color/cssValue';

export type SizeMode = 'px' | '%' | 'vw' | 'vh' | 'auto' | 'fill' | 'hug' | 'raw';
export type Axis = 'width' | 'height';

export interface SizeValue {
  mode: SizeMode;
  n: number | null;
  raw?: string;
}

/** Is `axis` the main axis of a flex parent? */
export function isFlexMain(parent: StyleMap | undefined, axis: Axis): boolean {
  if (!parent) return false;
  const d = parent.display ?? '';
  if (!d.includes('flex')) return false;
  const dir = parent['flex-direction'] ?? 'row';
  return axis === 'width' ? dir.startsWith('row') : dir.startsWith('column');
}

export function flexGrows(map: StyleMap): boolean {
  if (map['flex-grow'] != null) return parseFloat(map['flex-grow']) > 0;
  const f = map.flex?.trim();
  if (!f || f === 'none' || f === 'initial') return false;
  if (f === 'auto') return true;
  const first = parseFloat(splitSpaces(f)[0]);
  return Number.isFinite(first) && first > 0;
}

export function parseSize(map: StyleMap, axis: Axis, flexMain: boolean): SizeValue {
  if (flexMain && flexGrows(map)) return { mode: 'fill', n: null };
  const v = map[axis]?.trim();
  if (!v || v === 'auto') return { mode: 'auto', n: null };
  if (v === '100%') return { mode: 'fill', n: 100 };
  if (/^(fit-content|max-content|min-content)$/.test(v)) return { mode: 'hug', n: null };
  const m = /^(-?\d*\.?\d+)(px|%|vw|vh)?$/.exec(v);
  if (m) return { mode: ((m[2] ?? 'px') as SizeMode), n: parseFloat(m[1]) };
  return { mode: 'raw', n: null, raw: v };
}

/**
 * Patch to apply a sizing mode. `off` gives the value used to switch a property off
 * (null at the base breakpoint, an explicit initial value at overrides).
 */
export function sizePatch(
  axis: Axis,
  mode: SizeMode,
  n: number | null,
  opts: { flexMain: boolean; growing: boolean; off: (initial: string) => string | null },
): Record<string, string | null> {
  const patch: Record<string, string | null> = {};
  const stopGrow = () => {
    if (opts.growing) {
      patch.flex = opts.off('0 1 auto');
      patch['flex-grow'] = null;
    }
  };
  switch (mode) {
    case 'fill':
      if (opts.flexMain) {
        patch.flex = '1 1 0';
        patch['flex-grow'] = null;
        patch[axis] = opts.off('auto');
        patch[axis === 'width' ? 'min-width' : 'min-height'] = '0';
      } else {
        patch[axis] = '100%';
        stopGrow();
      }
      break;
    case 'hug':
      patch[axis] = 'fit-content';
      stopGrow();
      break;
    case 'auto':
      patch[axis] = opts.off('auto');
      stopGrow();
      break;
    case 'raw':
      break;
    default:
      patch[axis] = `${fmtNum(n ?? 0)}${mode}`;
      stopGrow();
  }
  return patch;
}

// ─── Flex alignment ─────────────────────────────────────────────────────────

export type AlignPos = 'start' | 'center' | 'end';

export function normAlign(v: string | undefined): AlignPos | 'stretch' | 'between' | 'around' | 'evenly' | 'baseline' | null {
  if (!v) return null;
  const t = v.trim().replace(/^(safe|unsafe)\s+/, '');
  if (/^(flex-start|start|left|top|self-start)$/.test(t)) return 'start';
  if (/^(flex-end|end|right|bottom|self-end)$/.test(t)) return 'end';
  if (t === 'center') return 'center';
  if (t === 'stretch' || t === 'normal') return 'stretch';
  if (t === 'space-between') return 'between';
  if (t === 'space-around') return 'around';
  if (t === 'space-evenly') return 'evenly';
  if (t.includes('baseline')) return 'baseline';
  return null;
}

export function alignToCss(p: AlignPos): string {
  return p === 'start' ? 'flex-start' : p === 'end' ? 'flex-end' : 'center';
}

/**
 * Map a flex container's justify/align to visual (horizontal, vertical) positions
 * of the 3×3 grid, respecting direction.
 */
export function flexToGrid(map: StyleMap): { h: AlignPos | null; v: AlignPos | null } {
  const column = (map['flex-direction'] ?? 'row').startsWith('column');
  const j = normAlign(map['justify-content']) ?? 'start';
  const a = normAlign(map['align-items']) ?? 'stretch';
  const main = j === 'start' || j === 'center' || j === 'end' ? j : null;
  const cross = a === 'start' || a === 'center' || a === 'end' ? a : a === 'stretch' ? 'start' : null;
  return column ? { h: cross, v: main } : { h: main, v: cross };
}

export function gridToFlex(map: StyleMap, h: AlignPos, v: AlignPos, keepDistribution: boolean): Record<string, string | null> {
  const column = (map['flex-direction'] ?? 'row').startsWith('column');
  const main = column ? v : h;
  const cross = column ? h : v;
  const patch: Record<string, string | null> = { 'align-items': alignToCss(cross) };
  if (!keepDistribution) patch['justify-content'] = alignToCss(main);
  return patch;
}

// ─── Grid tracks ────────────────────────────────────────────────────────────

export function countTracks(template: string | undefined): number {
  const t = template?.trim();
  if (!t || t === 'none') return 0;
  let n = 0;
  for (const tok of splitSpaces(t)) {
    const m = /^repeat\(\s*(\d+)\s*,([\s\S]*)\)$/i.exec(tok);
    if (m) n += parseInt(m[1], 10) * Math.max(1, splitSpaces(m[2].trim()).length);
    else if (/^repeat\(/i.test(tok)) n += 1;
    else if (!/^\[.*\]$/.test(tok)) n += 1;
  }
  return n;
}

export function setTrackCount(template: string | undefined, n: number): string | null {
  if (n <= 0) return null;
  const t = template?.trim() ?? '';
  const rep = /^repeat\(\s*(\d+)\s*,\s*([\s\S]+)\)$/i.exec(t);
  if (rep) return `repeat(${n}, ${rep[2].trim()})`;
  const toks = t && t !== 'none' ? splitSpaces(t) : [];
  if (!toks.length || toks.some((x) => /^repeat\(|^\[/.test(x))) return `repeat(${n}, 1fr)`;
  if (toks.every((x) => x === toks[0])) return n === 1 ? toks[0] : `repeat(${n}, ${toks[0]})`;
  const out = toks.slice(0, n);
  while (out.length < n) out.push('1fr');
  return out.join(' ');
}

/** `place-items` → { align, justify } with longhands overriding in order. */
export function readPlaceItems(map: StyleMap): { align: string; justify: string } {
  let align = 'stretch';
  let justify = 'stretch';
  for (const k of Object.keys(map)) {
    const v = map[k];
    if (!v) continue;
    if (k === 'place-items') {
      const [a, j = a] = splitSpaces(v);
      align = a;
      justify = j;
    } else if (k === 'align-items') align = v;
    else if (k === 'justify-items') justify = v;
  }
  return { align, justify };
}
