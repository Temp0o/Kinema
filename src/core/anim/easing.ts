/**
 * CSS timing-function evaluation (cubic-bezier, linear(), steps(), keywords).
 * Used by the curve editor, the timeline (interpolating new keyframes) and the
 * preview engine (mirroring easings for reversed iterations).
 */
import { parseCubicBezier } from './compile';

export type EasingFn = (t: number) => number;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Cubic-bezier easing (x clamped to [0,1]); Newton-Raphson with bisection fallback. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  x1 = clamp01(x1);
  x2 = clamp01(x2);
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) return t;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sy(solve(x));
  };
}

/** Points of a CSS `linear()` easing ({x: input progress, y: output}). */
export function parseLinearEasing(s: string): { x: number; y: number }[] | null {
  const m = /^\s*linear\((.*)\)\s*$/i.exec(s);
  if (!m) return null;
  const raw: { y: number; xs: number[] }[] = [];
  for (const part of m[1].split(',')) {
    const toks = part.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    const y = parseFloat(toks[0]);
    if (!Number.isFinite(y)) return null;
    const xs = toks.slice(1).map((t) => parseFloat(t) / 100).filter((v) => Number.isFinite(v));
    raw.push({ y, xs });
  }
  if (raw.length < 2) return null;
  const pts: { x: number | null; y: number }[] = [];
  for (const r of raw) {
    if (r.xs.length === 0) pts.push({ x: null, y: r.y });
    else for (const x of r.xs.slice(0, 2)) pts.push({ x, y: r.y });
  }
  if (pts[0].x == null) pts[0].x = 0;
  if (pts[pts.length - 1].x == null) pts[pts.length - 1].x = Math.max(1, ...pts.map((p) => p.x ?? 0));
  // monotonic fix-up + even distribution of unspecified inputs
  let lastX = pts[0].x!;
  for (const p of pts) if (p.x != null) lastX = p.x = Math.max(p.x, lastX);
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x != null) continue;
    let j = i;
    while (pts[j].x == null) j++;
    const a = pts[i - 1].x!;
    const b = pts[j].x!;
    const n = j - i + 1;
    for (let k = i; k < j; k++) pts[k].x = a + ((b - a) * (k - i + 1)) / n;
    i = j;
  }
  return pts.map((p) => ({ x: p.x!, y: p.y }));
}

function linearFn(pts: { x: number; y: number }[]): EasingFn {
  return (x: number) => {
    if (x <= pts[0].x) return pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (x <= b.x) return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    }
    return pts[pts.length - 1].y;
  };
}

export function parseSteps(s: string): { n: number; pos: 'start' | 'end' | 'jump-none' | 'jump-both' } | null {
  const t = s.trim().toLowerCase();
  if (t === 'step-start') return { n: 1, pos: 'start' };
  if (t === 'step-end') return { n: 1, pos: 'end' };
  const m = /^steps\(\s*(\d+)\s*(?:,\s*([a-z-]+)\s*)?\)$/.exec(t);
  if (!m) return null;
  const n = Math.max(1, parseInt(m[1], 10));
  const p = m[2] ?? 'end';
  const pos = p === 'start' || p === 'jump-start' ? 'start' : p === 'jump-none' ? 'jump-none' : p === 'jump-both' ? 'jump-both' : 'end';
  return { n, pos };
}

function stepsFn(n: number, pos: 'start' | 'end' | 'jump-none' | 'jump-both'): EasingFn {
  return (x: number) => {
    if (x >= 1) return 1;
    if (x < 0) return 0;
    const f = Math.floor(x * n);
    if (pos === 'start') return Math.min(1, (f + 1) / n);
    if (pos === 'jump-none') return n <= 1 ? 0 : Math.min(1, f / (n - 1));
    if (pos === 'jump-both') return (f + 1) / (n + 1);
    return f / n;
  };
}

const fnCache = new Map<string, EasingFn>();

/** Evaluate any supported CSS timing function. Unknown values fall back to linear. */
export function easingFunction(easing: string | undefined): EasingFn {
  const key = (easing ?? 'ease').trim();
  let fn = fnCache.get(key);
  if (fn) return fn;
  const bz = parseCubicBezier(key);
  if (bz) fn = cubicBezier(...bz);
  else {
    const lin = parseLinearEasing(key);
    if (lin) fn = linearFn(lin);
    else {
      const st = parseSteps(key);
      fn = st ? stepsFn(st.n, st.pos) : (x: number) => clamp01(x);
    }
  }
  if (fnCache.size > 300) fnCache.clear();
  fnCache.set(key, fn);
  return fn;
}

/** Sample an easing into [x, y] points (for plotting). */
export function sampleEasing(easing: string, samples = 64): [number, number][] {
  const st = parseSteps(easing);
  const fn = easingFunction(easing);
  if (st) {
    // draw crisp steps
    const out: [number, number][] = [];
    const n = st.n * 2 + 2;
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      out.push([x, fn(Math.min(0.99999, x))]);
    }
    out.push([1, 1]);
    return out;
  }
  const lin = parseLinearEasing(easing);
  if (lin) return lin.map((p) => [p.x, p.y]);
  const out: [number, number][] = [];
  for (let i = 0; i <= samples; i++) out.push([i / samples, fn(i / samples)]);
  return out;
}

/**
 * The timing function to use when a segment is played backwards (reverse /
 * alternate directions), so a reversed "ease-out" becomes an "ease-in".
 */
export function mirrorEasing(easing: string): string {
  const bz = parseCubicBezier(easing.trim());
  if (bz) {
    const [x1, y1, x2, y2] = bz;
    const r = (v: number) => Math.round(v * 1000) / 1000;
    return `cubic-bezier(${r(1 - x2)}, ${r(1 - y2)}, ${r(1 - x1)}, ${r(1 - y1)})`;
  }
  const lin = parseLinearEasing(easing);
  if (lin) {
    const pts = [...lin].reverse().map((p) => `${Math.round((1 - p.y) * 10000) / 10000} ${Math.round((1 - p.x) * 10000) / 100}%`);
    return `linear(${pts.join(', ')})`;
  }
  const st = parseSteps(easing);
  if (st) return `steps(${st.n}, ${st.pos === 'start' ? 'end' : st.pos === 'end' ? 'start' : st.pos})`;
  return easing;
}

/** Format a cubic-bezier with 2-decimal precision. */
export function formatCubicBezier(p: [number, number, number, number]): string {
  const r = (v: number) => String(Math.round(v * 100) / 100);
  return `cubic-bezier(${r(p[0])}, ${r(p[1])}, ${r(p[2])}, ${r(p[3])})`;
}
