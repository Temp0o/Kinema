/**
 * Pure geometry for canvas interactions: rects, rotation, snapping, resize math,
 * flow drop-index computation. No DOM access — everything here is unit tested.
 *
 * All coordinates are "world" px (the unzoomed design space) unless noted.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

// ─── Rect helpers ───────────────────────────────────────────────────────────

export function rectRight(r: Rect) {
  return r.x + r.w;
}
export function rectBottom(r: Rect) {
  return r.y + r.h;
}
export function rectCenter(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectContainsPoint(r: Rect, p: Point, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

/** Normalize a rect spanned by two points. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function offsetRect(r: Rect, dx: number, dy: number): Rect {
  return { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
}

// ─── Rotation ───────────────────────────────────────────────────────────────

const RAD = Math.PI / 180;

export function rotateVec(v: Point, deg: number): Point {
  if (!deg) return { x: v.x, y: v.y };
  const c = Math.cos(deg * RAD);
  const s = Math.sin(deg * RAD);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/** Corners (nw, ne, se, sw) of a rect rotated by `deg` around its center. */
export function rotatedCorners(r: Rect, deg: number): Point[] {
  const c = rectCenter(r);
  const hw = r.w / 2;
  const hh = r.h / 2;
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((v) => {
    const p = rotateVec(v, deg);
    return { x: c.x + p.x, y: c.y + p.y };
  });
}

/** Axis-aligned bounds of a rotated rect. */
export function rotatedAabb(r: Rect, deg: number): Rect {
  if (!deg || Math.abs(deg % 360) < 1e-9) return { ...r };
  const pts = rotatedCorners(r, deg);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Angle (deg) of point p around center c, 0 = +x axis, clockwise positive (screen coords). */
export function angleAround(c: Point, p: Point): number {
  return Math.atan2(p.y - c.y, p.x - c.x) / RAD;
}

/** Normalize to (-180, 180]. */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a <= -180) a += 360;
  if (a > 180) a -= 360;
  return a;
}

/** New rotation for a rotate-drag. Shift snaps to `step` degrees. */
export function rotateDrag(startRotation: number, center: Point, start: Point, current: Point, snapStep: number | null): number {
  const delta = angleAround(center, current) - angleAround(center, start);
  let next = normalizeAngle(startRotation + delta);
  if (snapStep) next = normalizeAngle(Math.round(next / snapStep) * snapStep);
  else next = Math.round(next * 10) / 10;
  return Object.is(next, -0) ? 0 : next;
}

// ─── Snapping ───────────────────────────────────────────────────────────────

export function snapToGrid(v: number, grid: number): number {
  if (!grid || grid <= 0) return v;
  return Math.round(v / grid) * grid;
}

export interface SnapLine {
  /** 'x' → vertical line at `pos`; 'y' → horizontal line at `pos`. */
  axis: 'x' | 'y';
  pos: number;
  /** extent along the other axis */
  from: number;
  to: number;
}

export interface SnapLabel {
  /** distance in px (world) */
  value: number;
  /** segment the label measures (world) */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  lines: SnapLine[];
  labels: SnapLabel[];
}

/** Edge/center values of a rect along an axis: [start, center, end]. */
export function axisStops(r: Rect, axis: 'x' | 'y'): [number, number, number] {
  return axis === 'x' ? [r.x, r.x + r.w / 2, r.x + r.w] : [r.y, r.y + r.h / 2, r.y + r.h];
}

/**
 * Best snap offset on one axis: smallest |candidate - stop| within threshold.
 * Returns null when nothing is close enough.
 */
export function bestAxisSnap(stops: number[], candidates: number[], threshold: number): number | null {
  let best: number | null = null;
  let bestAbs = Infinity;
  for (const s of stops) {
    for (const c of candidates) {
      const d = c - s;
      const a = Math.abs(d);
      if (a <= threshold && a < bestAbs - 1e-9) {
        best = d;
        bestAbs = a;
      }
    }
  }
  return best;
}

export interface SnapOptions {
  threshold: number;
  /** Grid size (world px) or 0/undefined to disable grid snapping. */
  grid?: number;
  /** Origin the grid is measured from (usually the parent's padding box origin). */
  gridOrigin?: Point;
  /** Which axes are allowed to move (axis constraint with Shift). */
  lockX?: boolean;
  lockY?: boolean;
}

/**
 * Snap a moving rect (already offset by the raw drag delta) to target rects
 * (siblings + parent). Smart guides win over the grid when within threshold.
 * Returns the extra correction to apply plus guide lines / distance labels.
 */
export function snapMovingRect(moving: Rect, targets: Rect[], opts: SnapOptions): SnapResult {
  const res: SnapResult = { dx: 0, dy: 0, lines: [], labels: [] };
  const axes: ('x' | 'y')[] = [];
  if (!opts.lockX) axes.push('x');
  if (!opts.lockY) axes.push('y');
  for (const axis of axes) {
    const stops = axisStops(moving, axis);
    const cands: number[] = [];
    for (const t of targets) cands.push(...axisStops(t, axis));
    let d = bestAxisSnap(stops, cands, opts.threshold);
    if (d == null && opts.grid) {
      const o = axis === 'x' ? opts.gridOrigin?.x ?? 0 : opts.gridOrigin?.y ?? 0;
      const start = stops[0] - o;
      d = snapToGrid(start, opts.grid) - start;
    }
    if (d != null) {
      if (axis === 'x') res.dx = d;
      else res.dy = d;
    }
  }
  const snapped = offsetRect(moving, res.dx, res.dy);
  const g = guidesFor(snapped, targets, axes);
  res.lines = g.lines;
  res.labels = g.labels;
  return res;
}

/** Guide lines + distance labels for every target edge/center that coincides with the rect. */
export function guidesFor(r: Rect, targets: Rect[], axes: ('x' | 'y')[] = ['x', 'y'], eps = 0.5): { lines: SnapLine[]; labels: SnapLabel[] } {
  const lines: SnapLine[] = [];
  const labels: SnapLabel[] = [];
  const seen = new Set<string>();
  for (const axis of axes) {
    const stops = axisStops(r, axis);
    for (const t of targets) {
      const ts = axisStops(t, axis);
      let matched = false;
      for (const s of stops) {
        for (const c of ts) {
          if (Math.abs(s - c) > eps) continue;
          matched = true;
          // extent along the other axis covers both rects
          const [a0, , a1] = axisStops(r, axis === 'x' ? 'y' : 'x');
          const [b0, , b1] = axisStops(t, axis === 'x' ? 'y' : 'x');
          const from = Math.min(a0, b0);
          const to = Math.max(a1, b1);
          const key = `${axis}:${Math.round(c * 2)}`;
          const existing = lines.find((l) => `${l.axis}:${Math.round(l.pos * 2)}` === key);
          if (existing) {
            existing.from = Math.min(existing.from, from);
            existing.to = Math.max(existing.to, to);
          } else lines.push({ axis, pos: c, from, to });
        }
      }
      if (!matched) continue;
      // distance between the two rects along the other axis
      const other = axis === 'x' ? 'y' : 'x';
      const [a0, , a1] = axisStops(r, other);
      const [b0, , b1] = axisStops(t, other);
      let gapFrom: number | null = null;
      let gapTo: number | null = null;
      if (b0 >= a1) {
        gapFrom = a1;
        gapTo = b0;
      } else if (a0 >= b1) {
        gapFrom = b1;
        gapTo = a0;
      }
      if (gapFrom == null || gapTo == null || gapTo - gapFrom < 1) continue;
      // label sits on the overlapping band center along `axis`
      const [p0, , p1] = axisStops(r, axis);
      const [q0, , q1] = axisStops(t, axis);
      const lo = Math.max(p0, q0);
      const hi = Math.min(p1, q1);
      const mid = lo <= hi ? (lo + hi) / 2 : (p0 + p1) / 2;
      const key = `${other}:${Math.round(gapFrom)}:${Math.round(gapTo)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(
        axis === 'x'
          ? { value: Math.round(gapTo - gapFrom), x1: mid, y1: gapFrom, x2: mid, y2: gapTo }
          : { value: Math.round(gapTo - gapFrom), x1: gapFrom, y1: mid, x2: gapTo, y2: mid },
      );
    }
  }
  return { lines, labels };
}

/** Snap a single value (a moving edge) to candidates or the grid. Returns the snapped value. */
export function snapValue(v: number, candidates: number[], threshold: number, grid?: number, gridOrigin = 0): { value: number; snapped: number | null } {
  const d = bestAxisSnap([v], candidates, threshold);
  if (d != null) return { value: v + d, snapped: v + d };
  if (grid) return { value: snapToGrid(v - gridOrigin, grid) + gridOrigin, snapped: null };
  return { value: v, snapped: null };
}

// ─── Resize ─────────────────────────────────────────────────────────────────

/** Handle direction: -1 (left/top), 0 (middle), 1 (right/bottom). */
export interface HandleDir {
  hx: -1 | 0 | 1;
  hy: -1 | 0 | 1;
}

export const HANDLES: Record<string, HandleDir> = {
  nw: { hx: -1, hy: -1 },
  n: { hx: 0, hy: -1 },
  ne: { hx: 1, hy: -1 },
  e: { hx: 1, hy: 0 },
  se: { hx: 1, hy: 1 },
  s: { hx: 0, hy: 1 },
  sw: { hx: -1, hy: 1 },
  w: { hx: -1, hy: 0 },
};

export interface ResizeOptions {
  /** Keep aspect ratio (Shift). */
  aspect?: boolean;
  /** Resize from center (Alt). */
  fromCenter?: boolean;
  /** Minimum size (px). */
  min?: number;
  /**
   * Optional edge snapping (unrotated only): returns a corrected value for a
   * moving edge coordinate on an axis.
   */
  snapEdge?: (axis: 'x' | 'y', value: number) => number;
}

/**
 * Resize a (possibly rotated) rect by dragging a handle. `delta` is the pointer
 * movement in world px. Returns the new unrotated layout rect (x/y are the
 * top-left before rotation, as CSS left/top would be).
 */
export function resizeRect(start: Rect, rotation: number, dir: HandleDir, delta: Point, opts: ResizeOptions = {}): Rect {
  const min = opts.min ?? 1;
  const local = rotateVec(delta, -rotation);
  const k = opts.fromCenter ? 2 : 1;
  let w = start.w;
  let h = start.h;
  if (dir.hx) w = start.w + dir.hx * local.x * k;
  if (dir.hy) h = start.h + dir.hy * local.y * k;

  // edge snapping (only meaningful without rotation)
  if (opts.snapEdge && !rotation) {
    const snapAxis = (axis: 'x' | 'y', hd: number, s0: number, size0: number, size: number): number => {
      if (opts.fromCenter) {
        const c = s0 + size0 / 2;
        const edge = c + (hd * size) / 2;
        return 2 * hd * (opts.snapEdge!(axis, edge) - c);
      }
      const anchor = hd > 0 ? s0 : s0 + size0;
      const edge = anchor + hd * size;
      return hd * (opts.snapEdge!(axis, edge) - anchor);
    };
    if (dir.hx) w = snapAxis('x', dir.hx, start.x, start.w, w);
    if (dir.hy) h = snapAxis('y', dir.hy, start.y, start.h, h);
  }

  if (opts.aspect && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    if (dir.hx && dir.hy) {
      // corner: follow the dominant axis
      const sx = w / start.w;
      const sy = h / start.h;
      if (Math.abs(sx - 1) >= Math.abs(sy - 1)) h = w / ratio;
      else w = h * ratio;
    } else if (dir.hx) h = w / ratio;
    else if (dir.hy) w = h * ratio;
  }
  w = Math.max(min, w);
  h = Math.max(min, h);

  // Keep the anchor (opposite handle, or center) fixed in world space.
  const anchorLocal = (dHx: number, dHy: number, ww: number, hh: number): Point => ({
    x: opts.fromCenter ? 0 : -dHx * (ww / 2),
    y: opts.fromCenter ? 0 : -dHy * (hh / 2),
  });
  // For edge handles with aspect lock the perpendicular axis grows from center.
  const ahx = dir.hx;
  const ahy = dir.hy;
  const c0 = rectCenter(start);
  const a0 = rotateVec(anchorLocal(ahx, ahy, start.w, start.h), rotation);
  const anchorWorld = { x: c0.x + a0.x, y: c0.y + a0.y };
  const a1 = rotateVec(anchorLocal(ahx, ahy, w, h), rotation);
  const c1 = { x: anchorWorld.x - a1.x, y: anchorWorld.y - a1.y };
  return { x: c1.x - w / 2, y: c1.y - h / 2, w, h };
}

/** Map a rect from one bounding box to another (multi-selection scaling). */
export function mapRectBetween(r: Rect, from: Rect, to: Rect): Rect {
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  return { x: to.x + (r.x - from.x) * sx, y: to.y + (r.y - from.y) * sy, w: r.w * sx, h: r.h * sy };
}

// ─── Flow drop index ────────────────────────────────────────────────────────

export type FlowDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse';

export interface FlowLayout {
  direction: FlowDirection;
  /** wrapping rows (flex-wrap or grid) */
  wrap: boolean;
}

export interface DropIndexResult {
  /** insertion index among the given children (0..n) */
  index: number;
  /** insertion indicator segment (world) */
  line: { x1: number; y1: number; x2: number; y2: number };
}

/** Group child rects into visual lines (rows for row-wrap layouts). */
function groupLines(rects: Rect[], axis: 'x' | 'y'): number[][] {
  // axis: main axis. Lines are separated along the cross axis.
  const lines: { lo: number; hi: number; items: number[] }[] = [];
  rects.forEach((r, i) => {
    const lo = axis === 'x' ? r.y : r.x;
    const hi = axis === 'x' ? r.y + r.h : r.x + r.w;
    const line = lines.find((l) => lo < l.hi - 1 && hi > l.lo + 1);
    if (line) {
      line.items.push(i);
      line.lo = Math.min(line.lo, lo);
      line.hi = Math.max(line.hi, hi);
    } else lines.push({ lo, hi, items: [i] });
  });
  return lines.sort((a, b) => a.lo - b.lo).map((l) => l.items);
}

/**
 * Where would a dragged item land among `children` (rects in world px, DOM order)?
 * Works for flex rows/columns (incl. reverse), wrapping rows and grids, and plain
 * block flow (column).
 */
export function computeDropIndex(children: Rect[], p: Point, layout: FlowLayout, container: Rect): DropIndexResult {
  const n = children.length;
  const pad = 2;
  if (!n) {
    const horizontal = layout.direction.startsWith('row');
    return horizontal
      ? { index: 0, line: { x1: container.x + pad, y1: container.y + pad, x2: container.x + pad, y2: container.y + container.h - pad } }
      : { index: 0, line: { x1: container.x + pad, y1: container.y + pad, x2: container.x + container.w - pad, y2: container.y + pad } };
  }
  const isRow = layout.direction.startsWith('row');
  const reverse = layout.direction.endsWith('reverse');
  const main: 'x' | 'y' = isRow ? 'x' : 'y';

  // Candidate indices restricted to the visual line under the pointer when wrapping.
  let candidates = children.map((_, i) => i);
  if (layout.wrap) {
    const lines = groupLines(children, main);
    if (lines.length > 1) {
      let best = lines[0];
      let bestDist = Infinity;
      for (const l of lines) {
        const lo = Math.min(...l.map((i) => (isRow ? children[i].y : children[i].x)));
        const hi = Math.max(...l.map((i) => (isRow ? children[i].y + children[i].h : children[i].x + children[i].w)));
        const v = isRow ? p.y : p.x;
        const d = v < lo ? lo - v : v > hi ? v - hi : 0;
        if (d < bestDist) {
          bestDist = d;
          best = l;
        }
      }
      candidates = [...best].sort((a, b) => a - b);
    }
  }

  const before = (i: number) => {
    const c = rectCenter(children[i]);
    const v = main === 'x' ? p.x : p.y;
    const cv = main === 'x' ? c.x : c.y;
    return reverse ? v > cv : v < cv;
  };
  let index = candidates[candidates.length - 1] + 1;
  for (const i of candidates) {
    if (before(i)) {
      index = i;
      break;
    }
  }

  // Indicator: between the visual neighbours along the main axis.
  const prevI = candidates.includes(index - 1) ? index - 1 : -1;
  const nextI = candidates.includes(index) ? index : -1;
  const prev = prevI >= 0 ? children[prevI] : null;
  const next = nextI >= 0 ? children[nextI] : null;
  let line: DropIndexResult['line'];
  if (isRow) {
    const ref = next ?? prev!;
    let x: number;
    if (prev && next) {
      const a = reverse ? prev.x : prev.x + prev.w;
      const b = reverse ? next.x + next.w : next.x;
      x = (a + b) / 2;
    } else if (next) x = reverse ? next.x + next.w + pad : next.x - pad;
    else x = reverse ? prev!.x - pad : prev!.x + prev!.w + pad;
    const y1 = Math.min(prev?.y ?? ref.y, next?.y ?? ref.y);
    const y2 = Math.max(prev ? prev.y + prev.h : ref.y + ref.h, next ? next.y + next.h : ref.y + ref.h);
    line = { x1: x, y1, x2: x, y2 };
  } else {
    const ref = next ?? prev!;
    let y: number;
    if (prev && next) {
      const a = reverse ? prev.y : prev.y + prev.h;
      const b = reverse ? next.y + next.h : next.y;
      y = (a + b) / 2;
    } else if (next) y = reverse ? next.y + next.h + pad : next.y - pad;
    else y = reverse ? prev!.y - pad : prev!.y + prev!.h + pad;
    const x1 = Math.min(prev?.x ?? ref.x, next?.x ?? ref.x);
    const x2 = Math.max(prev ? prev.x + prev.w : ref.x + ref.w, next ? next.x + next.w : ref.x + ref.w);
    line = { x1, y1: y, x2, y2: y };
  }
  return { index, line };
}

/**
 * Convert an insertion index computed among the non-dragged children into a
 * gap index of the full children list (what `moveNodes` expects).
 */
export function toFullIndex(allChildren: string[], dragged: ReadonlySet<string>, indexAmongRest: number): number {
  let k = 0;
  for (let i = 0; i < allChildren.length; i++) {
    if (dragged.has(allChildren[i])) continue;
    if (k === indexAmongRest) return i;
    k++;
  }
  return allChildren.length;
}

// ─── Zoom ───────────────────────────────────────────────────────────────────

export const ZOOM_STEPS = [0.05, 0.1, 0.125, 0.25, 0.333, 0.5, 0.667, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];

export function nextZoomStep(zoom: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > zoom * 1.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i] < zoom / 1.001) return ZOOM_STEPS[i];
  return ZOOM_STEPS[0];
}

/** Viewport (zoom + pan) that fits `r` into a `vw × vh` screen area with padding. */
export function fitRect(r: Rect, vw: number, vh: number, pad: number, maxZoom: number, minZoom: number): { zoom: number; panX: number; panY: number } {
  const zw = r.w > 0 ? (vw - pad * 2) / r.w : maxZoom;
  const zh = r.h > 0 ? (vh - pad * 2) / r.h : maxZoom;
  const zoom = Math.max(minZoom, Math.min(maxZoom, zw, zh));
  return { zoom, panX: vw / 2 - (r.x + r.w / 2) * zoom, panY: vh / 2 - (r.y + r.h / 2) * zoom };
}

/** Resize cursor name for a handle direction on a node rotated by `deg`. */
export function resizeCursor(dir: HandleDir, deg: number): string {
  const base = Math.atan2(dir.hy, dir.hx) / RAD; // e=0, s=90, w=180, n=-90
  const a = (((base + deg) % 180) + 180) % 180; // 0..180
  const q = Math.round(a / 45) % 4;
  return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][q];
}
