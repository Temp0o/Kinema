/**
 * Screen-space overlays above the zoomed world: hover outline, selection boxes
 * and handles, size pill, smart guides, marquee, drawing preview, drop
 * indicators, flex padding/gap hints, layout grid and the root height handle.
 *
 * Geometry is measured in world px after each render (layout effects) and
 * converted with the viewport, so lines stay 1px crisp at any zoom.
 */
import { Fragment, memo, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { useCurrentRootId } from '@/core/store/actions';
import type { NodeId } from '@/core/model/types';
import { usePlayback } from '@/features/animation/playbackStore';
import { useCanvas } from './canvasStore';
import { HANDLES, resizeCursor, rotatedAabb, unionRects, type Rect } from './geometry';
import { elementFor, nodeRotation, worldRectOf } from './measure';
import { startFrameHeight, startResize, startRotate } from './interactions';
import { flowLayoutOf } from './hitTest';

interface Measured {
  id: NodeId;
  rect: Rect;
  rot: number;
  instance: boolean;
}

function sameMeasured(a: Measured[], b: Measured[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.rot !== y.rot || x.instance !== y.instance || x.rect.x !== y.rect.x || x.rect.y !== y.rect.y || x.rect.w !== y.rect.w || x.rect.h !== y.rect.h) return false;
  }
  return true;
}

/** Measure nodes after every render that could move them. */
function useMeasured(ids: readonly NodeId[]): Measured[] {
  const doc = useDoc((s) => s.doc);
  const tick = useCanvas((s) => s.tick);
  const bp = useUI((s) => s.breakpoint);
  const cw = useUI((s) => s.canvasWidth);
  const ch = useUI((s) => s.canvasHeight);
  const editing = useUI((s) => s.editingTextId);
  const [boxes, setBoxes] = useState<Measured[]>([]);
  const key = ids.join(',');
  useLayoutEffect(() => {
    const next: Measured[] = [];
    for (const id of ids) {
      const el = elementFor(id);
      const rect = el ? worldRectOf(el) : null;
      if (!rect) continue;
      next.push({ id, rect, rot: nodeRotation(id), instance: doc.nodes[id]?.type === 'instance' });
    }
    setBoxes((prev) => (sameMeasured(prev, next) ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, tick, bp, cw, ch, key, editing]);
  return boxes;
}

function useToScreen() {
  const v = useUI((s) => s.viewport);
  return (r: Rect): Rect => {
    const x1 = Math.round(r.x * v.zoom + v.panX);
    const y1 = Math.round(r.y * v.zoom + v.panY);
    const x2 = Math.round((r.x + r.w) * v.zoom + v.panX);
    const y2 = Math.round((r.y + r.h) * v.zoom + v.panY);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };
}

const boxStyle = (r: Rect, extra?: CSSProperties): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h, ...extra });

// ─── Root ───────────────────────────────────────────────────────────────────

export function Overlays() {
  const playing = usePlayback((s) => s.playing);
  if (playing) return null;
  return (
    <div className="kc-overlay" aria-hidden>
      <GridOverlay />
      <HoverOverlay />
      <SelectionOverlay />
      <FeedbackOverlay />
      <FrameHeightHandle />
    </div>
  );
}

// ─── Grid ───────────────────────────────────────────────────────────────────

const GridOverlay = memo(function GridOverlay() {
  const show = useUI((s) => s.showGrid);
  const rootId = useCurrentRootId();
  const grid = useDoc((s) => s.doc.settings.gridSize);
  const zoom = useUI((s) => s.viewport.zoom);
  const boxes = useMeasured(show && rootId ? [rootId] : []);
  const toScreen = useToScreen();
  if (!show || !boxes[0] || !grid) return null;
  const r = toScreen(boxes[0].rect);
  let step = grid * zoom;
  while (step < 6) step *= 2;
  return (
    <div
      className="kc-grid"
      style={boxStyle(r, {
        backgroundSize: `${step}px ${step}px`,
      })}
    />
  );
});

// ─── Hover ──────────────────────────────────────────────────────────────────

const HoverOverlay = memo(function HoverOverlay() {
  const hoverId = useUI((s) => s.hoverId);
  const selected = useUI((s) => (s.hoverId ? s.selection.includes(s.hoverId) : false));
  const single = useUI((s) => s.selection.length === 1);
  const gesture = useCanvas((s) => s.gesture);
  const editing = useUI((s) => s.editingTextId);
  const rootId = useCurrentRootId();
  const show = !!hoverId && !gesture && !editing && (!selected || single);
  const boxes = useMeasured(show && hoverId ? [hoverId] : []);
  const toScreen = useToScreen();
  if (!show || !boxes[0]) return null;
  const b = boxes[0];
  const r = toScreen(b.rect);
  return (
    <>
      {selected && single && hoverId !== rootId ? <SpacingHints id={hoverId!} /> : null}
      {!selected && (
        <div
          className="kc-box kc-box--hover"
          data-instance={b.instance ? 'true' : undefined}
          data-root={hoverId === rootId ? 'true' : undefined}
          style={boxStyle(r, b.rot ? { transform: `rotate(${b.rot}deg)` } : undefined)}
        />
      )}
    </>
  );
});

/** Padding + gap hints for a hovered, selected flex/grid container. */
function SpacingHints({ id }: { id: NodeId }) {
  const doc = useDoc((s) => s.doc);
  const viewport = useUI((s) => s.viewport);
  const [areas, setAreas] = useState<Rect[]>([]);
  useLayoutEffect(() => {
    const el = elementFor(id);
    const rect = el ? worldRectOf(el) : null;
    if (!el || !rect || nodeRotation(id)) return setAreas([]);
    const { flexOrGrid, layout } = flowLayoutOf(el);
    if (!flexOrGrid) return setAreas([]);
    const cs = getComputedStyle(el);
    const bl = el.clientLeft;
    const bt = el.clientTop;
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const inner = { x: rect.x + bl, y: rect.y + bt, w: el.clientWidth, h: el.clientHeight };
    const out: Rect[] = [];
    if (pt) out.push({ x: inner.x, y: inner.y, w: inner.w, h: pt });
    if (pb) out.push({ x: inner.x, y: inner.y + inner.h - pb, w: inner.w, h: pb });
    if (pl) out.push({ x: inner.x, y: inner.y + pt, w: pl, h: inner.h - pt - pb });
    if (pr) out.push({ x: inner.x + inner.w - pr, y: inner.y + pt, w: pr, h: inner.h - pt - pb });
    // gaps between consecutive in-flow children on the same line
    const kids = (doc.nodes[id]?.children ?? [])
      .map((c) => elementFor(c))
      .filter((c): c is HTMLElement => !!c && getComputedStyle(c).position !== 'absolute')
      .map((c) => worldRectOf(c))
      .filter((r): r is Rect => !!r);
    const row = layout.direction.startsWith('row');
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1];
      const b = kids[i];
      if (row) {
        const [l, r] = a.x <= b.x ? [a, b] : [b, a];
        const gap = r.x - (l.x + l.w);
        const top = Math.max(l.y, r.y);
        const bottom = Math.min(l.y + l.h, r.y + r.h);
        if (gap > 0.5 && bottom > top) out.push({ x: l.x + l.w, y: inner.y + pt, w: gap, h: inner.h - pt - pb });
      } else {
        const [t, u] = a.y <= b.y ? [a, b] : [b, a];
        const gap = u.y - (t.y + t.h);
        const left = Math.max(t.x, u.x);
        const right = Math.min(t.x + t.w, u.x + u.w);
        if (gap > 0.5 && right > left) out.push({ x: inner.x + pl, y: t.y + t.h, w: inner.w - pl - pr, h: gap });
      }
    }
    setAreas(out);
  }, [id, doc]);
  const toScreen = (r: Rect): Rect => {
    const x1 = Math.round(r.x * viewport.zoom + viewport.panX);
    const y1 = Math.round(r.y * viewport.zoom + viewport.panY);
    return { x: x1, y: y1, w: Math.round((r.x + r.w) * viewport.zoom + viewport.panX) - x1, h: Math.round((r.y + r.h) * viewport.zoom + viewport.panY) - y1 };
  };
  return (
    <>
      {areas.map((a, i) => (
        <div key={i} className="kc-spacing" style={boxStyle(toScreen(a))} />
      ))}
    </>
  );
}

// ─── Selection ──────────────────────────────────────────────────────────────

const ROTATE_ORIENT: Record<string, number> = { se: 0, sw: 90, nw: 180, ne: 270 };
const cursorCache = new Map<number, string>();
function rotateCursor(angle: number): string {
  const a = ((Math.round(angle / 15) * 15) % 360 + 360) % 360;
  let c = cursorCache.get(a);
  if (!c) {
    const arc = 'M16 6 A10 10 0 0 1 6 16';
    const heads = 'M13.5 8.5 L16 6 L18.5 8.5 M8.5 13.5 L6 16 L8.5 18.5';
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g transform='rotate(${a} 12 12)' fill='none' stroke-linecap='round' stroke-linejoin='round'><path d='${arc} ${heads}' stroke='white' stroke-width='4'/><path d='${arc} ${heads}' stroke='black' stroke-width='1.6'/></g></svg>`;
    c = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
    cursorCache.set(a, c);
  }
  return c;
}

const CORNERS = ['nw', 'ne', 'se', 'sw'] as const;
const EDGES = ['n', 'e', 's', 'w'] as const;

function Handles({ w, h, rot, resizable }: { w: number; h: number; rot: number; resizable: boolean }) {
  if (!resizable) return null;
  const small = w < 18 || h < 18;
  const out: ReactNode[] = [];
  // rotation zones sit just outside the corners, under the corner squares
  for (const c of CORNERS) {
    const d = HANDLES[c];
    const size = 18;
    const off = 3;
    out.push(
      <div
        key={`r-${c}`}
        className="kc-rotate-zone"
        data-rotate={c}
        style={{
          left: d.hx < 0 ? -size - off + 4 : w + off - 4,
          top: d.hy < 0 ? -size - off + 4 : h + off - 4,
          width: size,
          height: size,
          cursor: rotateCursor(ROTATE_ORIENT[c] + rot),
        }}
        onPointerDown={(e) => startRotate(e)}
      />,
    );
  }
  for (const e of EDGES) {
    const d = HANDLES[e];
    const t = Math.max(4, Math.min(8, Math.min(w, h) / 3));
    const style: CSSProperties =
      e === 'n' || e === 's'
        ? { left: 4, width: Math.max(0, w - 8), top: d.hy < 0 ? -t / 2 : h - t / 2, height: t }
        : { top: 4, height: Math.max(0, h - 8), left: d.hx < 0 ? -t / 2 : w - t / 2, width: t };
    out.push(<div key={e} className="kc-edge" data-handle={e} style={{ ...style, cursor: resizeCursor(d, rot) }} onPointerDown={(ev) => startResize(ev, e)} />);
  }
  for (const c of CORNERS) {
    const d = HANDLES[c];
    if (small && (c === 'nw' || c === 'ne' || c === 'sw')) continue;
    out.push(
      <div
        key={c}
        className="kc-handle"
        data-handle={c}
        style={{ left: (d.hx < 0 ? 0 : w) - 4, top: (d.hy < 0 ? 0 : h) - 4, cursor: resizeCursor(d, rot) }}
        onPointerDown={(ev) => startResize(ev, c)}
      />,
    );
  }
  return <>{out}</>;
}

const SelectionOverlay = memo(function SelectionOverlay() {
  const selection = useUI((s) => s.selection);
  const editing = useUI((s) => s.editingTextId);
  const rootId = useCurrentRootId();
  const gesture = useCanvas((s) => s.gesture);
  const lockedAll = useDoc((s) => selection.every((id) => s.doc.nodes[id]?.locked));
  const boxes = useMeasured(selection);
  const toScreen = useToScreen();
  if (!boxes.length) return null;
  const hideHandles = gesture === 'move' || gesture === 'marquee' || gesture === 'draw' || !!editing || lockedAll;
  const onlyRoot = boxes.length === 1 && boxes[0].id === rootId;

  if (boxes.length === 1) {
    const b = boxes[0];
    const r = toScreen(b.rect);
    const aabb = rotatedAabb(r, b.rot);
    return (
      <>
        <div
          className="kc-box kc-box--selected"
          data-instance={b.instance ? 'true' : undefined}
          data-root={onlyRoot ? 'true' : undefined}
          data-editing={editing ? 'true' : undefined}
          style={boxStyle(r, b.rot ? { transform: `rotate(${b.rot}deg)` } : undefined)}
        >
          {!onlyRoot && <Handles w={r.w} h={r.h} rot={b.rot} resizable={!hideHandles} />}
        </div>
        {!onlyRoot && !editing && gesture !== 'rotate' && (
          <SizePill x={aabb.x + aabb.w / 2} y={aabb.y + aabb.h + 8} w={b.rect.w} h={b.rect.h} instance={b.instance} />
        )}
      </>
    );
  }

  const bounds = unionRects(boxes.map((b) => rotatedAabb(b.rect, b.rot)))!;
  const br = toScreen(bounds);
  return (
    <>
      {boxes.map((b) => {
        const r = toScreen(b.rect);
        return (
          <div
            key={b.id}
            className="kc-box kc-box--member"
            data-instance={b.instance ? 'true' : undefined}
            style={boxStyle(r, b.rot ? { transform: `rotate(${b.rot}deg)` } : undefined)}
          />
        );
      })}
      <div className="kc-box kc-box--bounds" style={boxStyle(br)}>
        <Handles w={br.w} h={br.h} rot={0} resizable={!hideHandles} />
      </div>
      {gesture !== 'rotate' && <SizePill x={br.x + br.w / 2} y={br.y + br.h + 8} w={bounds.w} h={bounds.h} />}
    </>
  );
});

function fmt(n: number) {
  return String(Math.round(n * 10) / 10);
}

function SizePill({ x, y, w, h, instance }: { x: number; y: number; w: number; h: number; instance?: boolean }) {
  return (
    <div className="kc-pill" data-instance={instance ? 'true' : undefined} style={{ left: x, top: y }}>
      {fmt(w)} × {fmt(h)}
    </div>
  );
}

// ─── Gesture feedback ───────────────────────────────────────────────────────

const FeedbackOverlay = memo(function FeedbackOverlay() {
  const guides = useCanvas((s) => s.guides);
  const labels = useCanvas((s) => s.labels);
  const marquee = useCanvas((s) => s.marquee);
  const draw = useCanvas((s) => s.draw);
  const ghost = useCanvas((s) => s.ghost);
  const drop = useCanvas((s) => s.drop);
  const hint = useCanvas((s) => s.hint);
  const v = useUI((s) => s.viewport);
  const dropIds = drop ? [drop.targetId ?? drop.containerId] : [];
  const dropBoxes = useMeasured(dropIds);
  const toScreen = useToScreen();
  const sx = (x: number) => Math.round(x * v.zoom + v.panX);
  const sy = (y: number) => Math.round(y * v.zoom + v.panY);

  return (
    <>
      {dropBoxes[0] && (
        <div
          className={drop?.targetId ? 'kc-box kc-box--target' : 'kc-box kc-box--drop'}
          style={boxStyle(toScreen(dropBoxes[0].rect), dropBoxes[0].rot ? { transform: `rotate(${dropBoxes[0].rot}deg)` } : undefined)}
        />
      )}
      {drop?.line && (
        <div
          className="kc-insert"
          data-axis={drop.line.x1 === drop.line.x2 ? 'v' : 'h'}
          style={
            drop.line.x1 === drop.line.x2
              ? { left: sx(drop.line.x1) - 1, top: sy(drop.line.y1), height: Math.max(2, sy(drop.line.y2) - sy(drop.line.y1)) }
              : { left: sx(drop.line.x1), top: sy(drop.line.y1) - 1, width: Math.max(2, sx(drop.line.x2) - sx(drop.line.x1)) }
          }
        />
      )}
      {ghost && <div className="kc-ghost" style={boxStyle(toScreen(ghost))} />}
      {guides.map((g, i) =>
        g.axis === 'x' ? (
          <div key={i} className="kc-guide kc-guide--v" style={{ left: sx(g.pos), top: sy(g.from), height: Math.max(1, sy(g.to) - sy(g.from)) }} />
        ) : (
          <div key={i} className="kc-guide kc-guide--h" style={{ top: sy(g.pos), left: sx(g.from), width: Math.max(1, sx(g.to) - sx(g.from)) }} />
        ),
      )}
      {labels.map((l, i) => {
        const vertical = l.x1 === l.x2;
        return (
          <Fragment key={`l${i}`}>
            {vertical ? (
              <div className="kc-measure kc-measure--v" style={{ left: sx(l.x1), top: sy(l.y1), height: Math.max(1, sy(l.y2) - sy(l.y1)) }} />
            ) : (
              <div className="kc-measure kc-measure--h" style={{ top: sy(l.y1), left: sx(l.x1), width: Math.max(1, sx(l.x2) - sx(l.x1)) }} />
            )}
            <div className="kc-measure-label" style={{ left: (sx(l.x1) + sx(l.x2)) / 2, top: (sy(l.y1) + sy(l.y2)) / 2 }}>
              {l.value}
            </div>
          </Fragment>
        );
      })}
      {marquee && <div className="kc-marquee" style={boxStyle(toScreen(marquee))} />}
      {draw && (
        <>
          <div className="kc-draw" style={boxStyle(toScreen(draw))} />
          <SizePill x={sx(draw.x + draw.w / 2)} y={sy(draw.y + draw.h) + 8} w={draw.w} h={draw.h} />
        </>
      )}
      {hint && (
        <div className="kc-hint" style={{ left: hint.x, top: hint.y }}>
          {hint.text}
        </div>
      )}
    </>
  );
});

// ─── Root frame height handle ───────────────────────────────────────────────

const FrameHeightHandle = memo(function FrameHeightHandle() {
  const rootId = useCurrentRootId();
  const gesture = useCanvas((s) => s.gesture);
  const live = useCanvas((s) => s.frameHeight);
  const editingComponent = useUI((s) => !!s.editingComponentId);
  const boxes = useMeasured(rootId ? [rootId] : []);
  const toScreen = useToScreen();
  if (!rootId || !boxes[0] || editingComponent) return null;
  if (gesture && gesture !== 'height') return null;
  const r = toScreen(boxes[0].rect);
  const h = live ?? Math.round(boxes[0].rect.h);
  return (
    <div className="kc-frame-handle" data-frame-handle="true" data-active={gesture === 'height' ? 'true' : undefined} style={{ left: r.x, top: r.y + r.h - 5, width: r.w }} onPointerDown={startFrameHeight}>
      <span className="kc-frame-handle__grip" />
      <span className="kc-frame-handle__label">{fmt(h)} px</span>
    </div>
  );
});

