/**
 * Easing evaluation and the "iteration easing" remap used by the exporter.
 *
 * Editor playback (Web Animations) applies `anim.easing` to the whole iteration,
 * while a CSS `animation-timing-function` applies to every keyframe interval.
 * For two keyframes both are identical. For three or more keyframes with a
 * non-linear easing, the exporter re-times the keyframes and gives every
 * interval its own timing function so CSS reproduces the WAAPI curve exactly
 * (cubic-bezier sub-curves) or within ~0.1% (sampled `linear()`).
 */
import type { CompiledFrame } from '../anim/compile';

type Fn = (x: number) => number;

export type ParsedEasing =
  | { kind: 'linear'; fn: Fn }
  | { kind: 'cubic'; p: [number, number, number, number]; fn: Fn }
  | { kind: 'steps'; fn: Fn }
  | { kind: 'linear-fn'; fn: Fn };

const NAMED: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

function bez(a: number, b: number, s: number): number {
  // cubic Bézier coordinate with P0=0, P3=1
  const u = 1 - s;
  return 3 * u * u * s * a + 3 * u * s * s * b + s * s * s;
}
function bezD(a: number, b: number, s: number): number {
  const u = 1 - s;
  return 3 * u * u * a + 6 * u * s * (b - a) + 3 * s * s * (1 - b);
}

/** Parameter s where x(s) = x for a cubic-bezier with x control points a, b. */
export function solveBezierParam(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let s = x;
  for (let i = 0; i < 8; i++) {
    const err = bez(a, b, s) - x;
    if (Math.abs(err) < 1e-9) return s;
    const d = bezD(a, b, s);
    if (Math.abs(d) < 1e-7) break;
    s -= err / d;
  }
  let lo = 0;
  let hi = 1;
  s = x;
  for (let i = 0; i < 60; i++) {
    const v = bez(a, b, s);
    if (Math.abs(v - x) < 1e-10) break;
    if (v < x) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return s;
}

function cubic(p: [number, number, number, number]): ParsedEasing {
  const [x1, y1, x2, y2] = p;
  return { kind: 'cubic', p, fn: (x) => bez(y1, y2, solveBezierParam(x1, x2, x)) };
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function parseLinearFn(body: string): ParsedEasing | null {
  const pts: { y: number; x: number | null }[] = [];
  for (const part of splitTop(body)) {
    const toks = part.split(/\s+/).filter(Boolean);
    const y = parseFloat(toks[0]);
    if (!Number.isFinite(y)) return null;
    const xs = toks.slice(1).map((t) => parseFloat(t) / 100);
    if (xs.some((v) => !Number.isFinite(v))) return null;
    if (xs.length === 0) pts.push({ y, x: null });
    else for (const x of xs) pts.push({ y, x });
  }
  if (pts.length < 2) return null;
  if (pts[0].x == null) pts[0].x = 0;
  if (pts[pts.length - 1].x == null) pts[pts.length - 1].x = 1;
  let max = -Infinity;
  for (const p of pts) if (p.x != null) p.x = max = Math.max(max, p.x);
  for (let i = 0; i < pts.length; i++) {
    if (pts[i].x != null) continue;
    let j = i;
    while (pts[j].x == null) j++;
    const a = pts[i - 1].x!;
    const b = pts[j].x!;
    const n = j - i + 1;
    for (let k = i; k < j; k++) pts[k].x = a + ((b - a) * (k - i + 1)) / n;
  }
  const P = pts as { x: number; y: number }[];
  const fn: Fn = (x) => {
    if (x <= P[0].x) return P[0].y;
    for (let i = 1; i < P.length; i++) {
      if (x <= P[i].x) {
        const a = P[i - 1];
        const b = P[i];
        return b.x === a.x ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
      }
    }
    return P[P.length - 1].y;
  };
  return { kind: 'linear-fn', fn };
}

function steps(n: number, pos: string): ParsedEasing {
  const jumps = pos === 'jump-both' ? n + 1 : pos === 'jump-none' ? n - 1 : n;
  const start = pos === 'start' || pos === 'jump-start' || pos === 'jump-both';
  return {
    kind: 'steps',
    fn: (x) => {
      let step = Math.floor(x * n);
      if (start) step++;
      if (x >= 0 && step < 0) step = 0;
      if (x <= 1 && step > jumps) step = jumps;
      return jumps > 0 ? step / jumps : x;
    },
  };
}

/** Parse a CSS easing function. Returns null when unsupported. */
export function parseEasing(input: string | undefined): ParsedEasing | null {
  const s = (input ?? 'ease').trim().toLowerCase();
  if (!s || s === 'linear') return { kind: 'linear', fn: (x) => x };
  if (NAMED[s]) return cubic(NAMED[s]);
  if (s === 'step-start') return steps(1, 'start');
  if (s === 'step-end') return steps(1, 'end');
  let m = /^cubic-bezier\(\s*([^,]+),([^,]+),([^,]+),([^)]+)\)$/.exec(s);
  if (m) {
    const p = m.slice(1, 5).map((v) => parseFloat(v)) as [number, number, number, number];
    if (p.some((v) => !Number.isFinite(v))) return null;
    if (p[0] === 0 && p[1] === 0 && p[2] === 1 && p[3] === 1) return { kind: 'linear', fn: (x) => x };
    return cubic(p);
  }
  m = /^steps\(\s*(\d+)\s*(?:,\s*([a-z-]+))?\s*\)$/.exec(s);
  if (m) return steps(Math.max(1, parseInt(m[1], 10)), m[2] ?? 'end');
  m = /^linear\((.*)\)$/.exec(s);
  if (m) return parseLinearFn(m[1]);
  return null;
}

/** Evaluate an easing at x ∈ [0,1] (unknown easings behave like `ease`). */
export function evalEasing(easing: string | undefined, x: number): number {
  return (parseEasing(easing) ?? parseEasing('ease')!).fn(x);
}

const r4 = (n: number) => {
  const v = Math.round(n * 10000) / 10000;
  return Object.is(v, -0) ? 0 : v;
};

export interface RemappedFrame {
  offset: number;
  decls: Record<string, string>;
  /** Timing function for the interval starting at this keyframe. */
  easing?: string;
}

/**
 * Re-time `frames` so that a CSS animation with per-interval timing functions
 * reproduces a WAAPI animation whose iteration easing is `easing`.
 * Returns null when no remap is needed (plain two-keyframe curves, linear
 * iteration easing) or when the curve cannot be represented (implicit 0%/100% frames, steps,
 * oscillation across an inner keyframe) — callers then fall back to the plain
 * output.
 */
export function remapIterationEasing(frames: CompiledFrame[], easing: string): RemappedFrame[] | null {
  if (frames.length < 2) return null;
  const E = parseEasing(easing);
  if (!E || E.kind === 'linear' || E.kind === 'steps') return null;
  // Two keyframes without their own easing: CSS and WAAPI already agree.
  if (frames.length === 2 && (parseEasing(frames[0].easing ?? 'linear')?.kind ?? 'linear') === 'linear') return null;
  const offs = frames.map((f) => f.offset);
  const m = frames.length - 1;
  if (offs[0] !== 0 || offs[m] !== 1) return null;
  for (let i = 1; i <= m; i++) if (!(offs[i] > offs[i - 1])) return null;
  const segE: ParsedEasing[] = [];
  for (let j = 0; j < m; j++) {
    const p = parseEasing(frames[j].easing ?? 'linear');
    if (!p || p.kind === 'steps') return null;
    segE.push(p);
  }

  const seg = (p: number): number => {
    if (p < offs[1]) return 0;
    if (p >= offs[m - 1]) return m - 1;
    let lo = 1;
    let hi = m - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offs[mid] <= p) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const N = 480;
  const events: { t: number; kf: number }[] = [{ t: 0, kf: 0 }];
  let cur = seg(E.fn(0));
  let prevT = 0;
  for (let k = 1; k <= N; k++) {
    const t = k / N;
    const s = seg(E.fn(t));
    while (s !== cur) {
      const up = s > cur;
      const b = up ? cur + 1 : cur;
      const target = offs[b];
      // bisection for the crossing time
      let lo = prevT;
      let hi = t;
      const sign = (x: number) => (up ? E.fn(x) >= target : E.fn(x) < target);
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (sign(mid)) hi = mid;
        else lo = mid;
      }
      events.push({ t: hi, kf: b });
      cur += up ? 1 : -1;
    }
    prevT = t;
  }
  events.push({ t: 1, kf: m });
  for (let i = 1; i < events.length; i++) {
    if (Math.abs(events[i].kf - events[i - 1].kf) !== 1) return null;
    if (events[i].t - events[i - 1].t < 1e-6) return null;
  }

  const out: RemappedFrame[] = [];
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const f: RemappedFrame = { offset: ev.t, decls: frames[ev.kf].decls };
    if (i < events.length - 1) f.easing = segmentEasing(E, segE, offs, ev, events[i + 1]);
    out.push(f);
  }
  return out;
}

function segmentEasing(
  E: ParsedEasing,
  segE: ParsedEasing[],
  offs: number[],
  a: { t: number; kf: number },
  b: { t: number; kf: number },
): string {
  const up = b.kf > a.kf;
  const j = Math.min(a.kf, b.kf);
  const o0 = offs[j];
  const o1 = offs[j + 1];
  const local = (p: number) => segE[j].fn((p - o0) / (o1 - o0));
  const g = (u: number) => {
    const v = local(E.fn(a.t + u * (b.t - a.t)));
    return up ? v : 1 - v;
  };

  // Exact cubic sub-curve when both the iteration easing is a cubic-bezier and
  // the keyframe interval is linear.
  if (E.kind === 'cubic' && segE[j].kind === 'linear') {
    const [x1, y1, x2, y2] = E.p;
    const sa = solveBezierParam(x1, x2, a.t);
    const sb = solveBezierParam(x1, x2, b.t);
    const ds = (sb - sa) / 3;
    const q0x = bez(x1, x2, sa);
    const q3x = bez(x1, x2, sb);
    const q0y = bez(y1, y2, sa);
    const q1x = q0x + ds * bezD(x1, x2, sa);
    const q1y = q0y + ds * bezD(y1, y2, sa);
    const q2x = q3x - ds * bezD(x1, x2, sb);
    const q2y = bez(y1, y2, sb) - ds * bezD(y1, y2, sb);
    const yFrom = up ? o0 : o1;
    const yTo = up ? o1 : o0;
    const nx = (x: number) => (x - q0x) / (q3x - q0x);
    const ny = (y: number) => (y - yFrom) / (yTo - yFrom);
    const c = [r4(nx(q1x)), r4(ny(q1y)), r4(nx(q2x)), r4(ny(q2y))];
    if (c[0] >= 0 && c[0] <= 1 && c[2] >= 0 && c[2] <= 1 && c.every(Number.isFinite)) {
      if (Math.abs(c[0] - c[1]) < 1e-3 && Math.abs(c[2] - c[3]) < 1e-3) return 'linear';
      return `cubic-bezier(${c.join(', ')})`;
    }
  }

  // Sampled linear() — near-linear curves collapse to `linear`.
  const n = 24;
  const ys: number[] = [];
  let maxDev = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const y = i === 0 ? 0 : i === n ? 1 : g(u);
    ys.push(r4(y));
    maxDev = Math.max(maxDev, Math.abs(y - u));
  }
  if (maxDev < 1e-3) return 'linear';
  return `linear(${ys.join(', ')})`;
}
