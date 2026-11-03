/**
 * Effects helpers: CSS filter lists, transitions and the scale/translate used by
 * interaction states.
 */
import type { StyleMap } from '@/core/model/types';
import { splitSpaces, splitTopLevel, parseTime, fmtNum, lengthToPx } from '@/ui/color/cssValue';

// ─── Filters ────────────────────────────────────────────────────────────────

export interface FilterDef {
  name: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** identity value (no effect) */
  identity: number;
  /** value used when the filter is added */
  initial: number;
}

export const FILTER_DEFS: FilterDef[] = [
  { name: 'blur', label: 'Blur', unit: 'px', min: 0, max: 60, step: 0.5, identity: 0, initial: 4 },
  { name: 'brightness', label: 'Brightness', unit: '%', min: 0, max: 300, step: 1, identity: 100, initial: 110 },
  { name: 'contrast', label: 'Contrast', unit: '%', min: 0, max: 300, step: 1, identity: 100, initial: 120 },
  { name: 'saturate', label: 'Saturate', unit: '%', min: 0, max: 300, step: 1, identity: 100, initial: 140 },
  { name: 'grayscale', label: 'Grayscale', unit: '%', min: 0, max: 100, step: 1, identity: 0, initial: 100 },
  { name: 'hue-rotate', label: 'Hue rotate', unit: 'deg', min: -180, max: 180, step: 1, identity: 0, initial: 90 },
  { name: 'invert', label: 'Invert', unit: '%', min: 0, max: 100, step: 1, identity: 0, initial: 100 },
  { name: 'sepia', label: 'Sepia', unit: '%', min: 0, max: 100, step: 1, identity: 0, initial: 60 },
];

export const filterDef = (name: string) => FILTER_DEFS.find((d) => d.name === name);

export interface FilterFn {
  name: string;
  /** numeric value in the def's unit (null for raw functions) */
  value: number | null;
  /** original text for functions we don't model (drop-shadow, url(), …) */
  raw?: string;
}

function parseFilterArg(def: FilterDef, arg: string): number | null {
  const a = arg.trim();
  if (!a) return def.name === 'blur' || def.name === 'hue-rotate' ? 0 : 100;
  if (def.unit === 'px') return lengthToPx(a);
  if (def.unit === 'deg') {
    const m = /^(-?\d*\.?\d+)(deg|turn|rad)?$/.exec(a);
    if (!m) return null;
    const n = parseFloat(m[1]);
    return m[2] === 'turn' ? n * 360 : m[2] === 'rad' ? (n * 180) / Math.PI : n;
  }
  const m = /^(-?\d*\.?\d+)(%)?$/.exec(a);
  if (!m) return null;
  return m[2] ? parseFloat(m[1]) : parseFloat(m[1]) * 100;
}

export function parseFilters(value: string | null | undefined): FilterFn[] {
  if (!value || /^none$/i.test(value.trim())) return [];
  const out: FilterFn[] = [];
  for (const tok of splitSpaces(value.trim())) {
    const m = /^([a-z-]+)\(([\s\S]*)\)$/i.exec(tok);
    const def = m ? filterDef(m[1].toLowerCase()) : undefined;
    const n = def && m ? parseFilterArg(def, m[2]) : null;
    if (def && n != null) out.push({ name: def.name, value: n });
    else out.push({ name: m?.[1] ?? 'raw', value: null, raw: tok });
  }
  return out;
}

export function serializeFilters(list: FilterFn[]): string | null {
  if (!list.length) return null;
  return list
    .map((f) => {
      if (f.raw != null || f.value == null) return f.raw ?? '';
      const def = filterDef(f.name);
      return `${f.name}(${fmtNum(f.value)}${def?.unit ?? ''})`;
    })
    .filter(Boolean)
    .join(' ');
}

/** Get/set a single filter function inside a filter value (used for backdrop blur). */
export function getFilterValue(value: string | null | undefined, name: string): number | null {
  return parseFilters(value).find((f) => f.name === name)?.value ?? null;
}

export function setFilterValue(value: string | null | undefined, name: string, n: number | null): string | null {
  const list = parseFilters(value);
  const i = list.findIndex((f) => f.name === name);
  if (n == null) {
    if (i >= 0) list.splice(i, 1);
  } else if (i >= 0) list[i] = { name, value: n };
  else list.unshift({ name, value: n });
  return serializeFilters(list);
}

// ─── Transitions ────────────────────────────────────────────────────────────

export interface TransitionModel {
  properties: string[];
  duration: number;
  easing: string;
  delay: number;
}

const EASING_KW = /^(ease|linear|ease-in|ease-out|ease-in-out|step-start|step-end)$/i;
const EASING_FN = /^(cubic-bezier|steps|linear)\(/i;

export const TRANSITION_PRESETS: { id: string; label: string; properties: string[] }[] = [
  { id: 'all', label: 'All properties', properties: ['all'] },
  { id: 'transform', label: 'Transform', properties: ['transform', 'scale', 'translate', 'rotate'] },
  { id: 'opacity', label: 'Opacity', properties: ['opacity'] },
  { id: 'colors', label: 'Colors', properties: ['color', 'background-color', 'border-color', 'fill', 'stroke'] },
];

export function transitionPresetOf(props: string[]): string {
  const key = [...props].sort().join(',');
  return TRANSITION_PRESETS.find((p) => [...p.properties].sort().join(',') === key)?.id ?? 'custom';
}

/**
 * Parse a `transition` value. Returns null when unset/none, 'raw' when entries use
 * different timings (not representable as one row).
 */
export function parseTransition(value: string | null | undefined): TransitionModel | null | 'raw' {
  if (!value || /^(none|all 0s ease 0s)$/i.test(value.trim())) return null;
  const entries = splitTopLevel(value, ',');
  const parsed: { prop: string; duration: number; delay: number; easing: string }[] = [];
  for (const e of entries) {
    let prop = 'all';
    let duration: number | null = null;
    let delay: number | null = null;
    let easing = 'ease';
    for (const t of splitSpaces(e)) {
      const time = parseTime(t);
      if (time != null) {
        if (duration == null) duration = time;
        else delay = time;
      } else if (EASING_KW.test(t) || EASING_FN.test(t)) easing = t;
      else if (/^[a-z-]+$/i.test(t)) prop = t;
      else return 'raw';
    }
    parsed.push({ prop, duration: duration ?? 0, delay: delay ?? 0, easing });
  }
  const f = parsed[0];
  if (parsed.some((p) => p.duration !== f.duration || p.delay !== f.delay || p.easing !== f.easing)) return 'raw';
  return { properties: parsed.map((p) => p.prop), duration: f.duration, delay: f.delay, easing: f.easing };
}

export function serializeTransition(m: TransitionModel): string {
  const props = m.properties.length ? m.properties : ['all'];
  return props.map((p) => `${p} ${fmtNum(m.duration, 0)}ms ${m.easing}${m.delay ? ` ${fmtNum(m.delay, 0)}ms` : ''}`).join(', ');
}

// ─── Scale / translate (interaction states) ────────────────────────────────

export interface ScaleTranslate {
  scale: number;
  tx: number;
  ty: number;
}

/** Read scale/translate from standalone `scale`/`translate` props or a simple `transform`. */
export function readScaleTranslate(map: StyleMap): ScaleTranslate {
  const out: ScaleTranslate = { scale: 1, tx: 0, ty: 0 };
  const t = map.transform;
  if (t && t !== 'none') {
    for (const fn of splitSpaces(t)) {
      const m = /^([a-zA-Z]+)\(([^)]*)\)$/.exec(fn);
      if (!m) continue;
      const args = m[2].split(',').map((s) => s.trim());
      const name = m[1].toLowerCase();
      if (name === 'scale') out.scale = parseFloat(args[0]) || 1;
      else if (name === 'translate') {
        out.tx = lengthToPx(args[0]) ?? 0;
        out.ty = lengthToPx(args[1] ?? '0') ?? 0;
      } else if (name === 'translatex') out.tx = lengthToPx(args[0]) ?? 0;
      else if (name === 'translatey') out.ty = lengthToPx(args[0]) ?? 0;
    }
  }
  if (map.scale && map.scale !== 'none') {
    const s = parseFloat(splitSpaces(map.scale)[0]);
    if (Number.isFinite(s)) out.scale = map.scale.trim().endsWith('%') ? s / 100 : s;
  }
  if (map.translate && map.translate !== 'none') {
    const [x, y] = splitSpaces(map.translate);
    out.tx = lengthToPx(x) ?? 0;
    out.ty = lengthToPx(y ?? '0') ?? 0;
  }
  return out;
}

/** True when `transform` only contains scale/translate functions (safe to migrate). */
export function isSimpleTransform(t: string | undefined): boolean {
  if (!t || t === 'none') return false;
  return splitSpaces(t).every((fn) => /^(scale|translate|translateX|translateY)\(/i.test(fn));
}
