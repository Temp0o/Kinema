import { describe, expect, it } from 'vitest';
import {
  bestAxisSnap,
  computeDropIndex,
  fitRect,
  guidesFor,
  mapRectBetween,
  nextZoomStep,
  resizeCursor,
  resizeRect,
  rotateDrag,
  rotatedAabb,
  snapMovingRect,
  snapToGrid,
  snapValue,
  toFullIndex,
  unionRects,
  HANDLES,
} from '@/features/canvas/geometry';
import { drillTarget, isEditableText, openSet, pathFor, pickTarget, rangeBetween, stripLocked } from '@/features/canvas/selectionRules';
import { createNode } from '@/core/model/factory';
import type { KNode } from '@/core/model/types';

// ─── geometry ───────────────────────────────────────────────────────────────

describe('rects & rotation', () => {
  it('unions rects', () => {
    expect(unionRects([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: -5, w: 5, h: 5 }])).toEqual({ x: 0, y: -5, w: 25, h: 15 });
    expect(unionRects([])).toBeNull();
  });
  it('computes AABB of a rotated rect', () => {
    const r = rotatedAabb({ x: 0, y: 0, w: 100, h: 100 }, 45);
    expect(r.w).toBeCloseTo(141.42, 1);
    expect(r.x + r.w / 2).toBeCloseTo(50);
  });
  it('rotate drag measures angle around center and snaps with step', () => {
    const c = { x: 0, y: 0 };
    expect(rotateDrag(0, c, { x: 10, y: 0 }, { x: 0, y: 10 }, null)).toBeCloseTo(90);
    expect(rotateDrag(0, c, { x: 10, y: 0 }, { x: 10, y: 3 }, 15)).toBe(15);
    expect(rotateDrag(170, c, { x: 10, y: 0 }, { x: 0, y: 10 }, null)).toBeCloseTo(-100);
  });
});

describe('snapping', () => {
  it('snaps to grid', () => {
    expect(snapToGrid(13, 8)).toBe(16);
    expect(snapToGrid(11, 8)).toBe(8);
    expect(snapToGrid(11, 0)).toBe(11);
  });
  it('finds the closest snap within threshold', () => {
    expect(bestAxisSnap([10, 20, 30], [33, 100], 5)).toBe(3);
    expect(bestAxisSnap([10], [16], 5)).toBeNull();
    expect(bestAxisSnap([10, 50], [12, 49], 5)).toBe(-1);
  });
  it('snaps a moving rect to sibling edges and centers, with guides + distances', () => {
    const sibling = { x: 100, y: 0, w: 50, h: 50 };
    const moving = { x: 102, y: 80, w: 50, h: 20 };
    const r = snapMovingRect(moving, [sibling], { threshold: 5 });
    expect(r.dx).toBe(-2);
    expect(r.lines.some((l) => l.axis === 'x' && l.pos === 100)).toBe(true);
    // vertical distance between sibling bottom (50) and moving top (80)
    expect(r.labels.some((l) => l.value === 30)).toBe(true);
  });
  it('falls back to the grid when no guide is close', () => {
    const r = snapMovingRect({ x: 13, y: 21, w: 10, h: 10 }, [], { threshold: 2, grid: 8 });
    expect(r.dx).toBe(3);
    expect(r.dy).toBe(3);
  });
  it('respects axis locks', () => {
    const r = snapMovingRect({ x: 13, y: 21, w: 10, h: 10 }, [], { threshold: 2, grid: 8, lockY: true });
    expect(r.dx).toBe(3);
    expect(r.dy).toBe(0);
  });
  it('snaps a single value', () => {
    expect(snapValue(98, [100], 5).value).toBe(100);
    expect(snapValue(98, [], 5, 10).value).toBe(100);
    expect(snapValue(91, [100], 5).value).toBe(91);
  });
  it('emits center guides', () => {
    const g = guidesFor({ x: 25, y: 200, w: 50, h: 10 }, [{ x: 0, y: 0, w: 100, h: 100 }], ['x']);
    expect(g.lines.find((l) => l.pos === 50)).toBeTruthy();
  });
});

describe('resize', () => {
  const start = { x: 10, y: 10, w: 100, h: 50 };
  it('resizes from the se corner keeping nw fixed', () => {
    expect(resizeRect(start, 0, HANDLES.se, { x: 20, y: 10 })).toEqual({ x: 10, y: 10, w: 120, h: 60 });
  });
  it('resizes from the nw corner moving the origin', () => {
    expect(resizeRect(start, 0, HANDLES.nw, { x: 20, y: 10 })).toEqual({ x: 30, y: 20, w: 80, h: 40 });
  });
  it('keeps aspect ratio with shift', () => {
    const r = resizeRect(start, 0, HANDLES.se, { x: 100, y: 0 }, { aspect: true });
    expect(r.w).toBe(200);
    expect(r.h).toBe(100);
  });
  it('resizes from center with alt', () => {
    const r = resizeRect(start, 0, HANDLES.e, { x: 10, y: 0 }, { fromCenter: true });
    expect(r).toEqual({ x: 0, y: 10, w: 120, h: 50 });
  });
  it('clamps to a minimum size', () => {
    const r = resizeRect(start, 0, HANDLES.e, { x: -500, y: 0 });
    expect(r.w).toBe(1);
    expect(r.x).toBe(10);
  });
  it('keeps the opposite corner fixed for rotated rects', () => {
    const rot = 90;
    const r = resizeRect({ x: 0, y: 0, w: 100, h: 100 }, rot, HANDLES.e, { x: 0, y: 20 });
    // local +x points down when rotated 90°, so moving down grows width
    expect(r.w).toBeCloseTo(120);
    // anchor (west edge center, rotated → top center at (50, 0)) stays fixed
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    expect(cx).toBeCloseTo(50);
    expect(cy - 60).toBeCloseTo(0);
  });
  it('snaps the moving edge', () => {
    const r = resizeRect(start, 0, HANDLES.e, { x: 18, y: 0 }, { snapEdge: (_a, v) => (Math.abs(v - 130) < 5 ? 130 : v) });
    expect(r.w).toBe(120);
  });
  it('maps rects between bounding boxes', () => {
    expect(mapRectBetween({ x: 10, y: 10, w: 10, h: 10 }, { x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 0, w: 200, h: 50 })).toEqual({ x: 20, y: 5, w: 20, h: 5 });
  });
  it('rotates resize cursors with the node', () => {
    expect(resizeCursor(HANDLES.e, 0)).toBe('ew-resize');
    expect(resizeCursor(HANDLES.e, 90)).toBe('ns-resize');
    expect(resizeCursor(HANDLES.se, 0)).toBe('nwse-resize');
    expect(resizeCursor(HANDLES.ne, 0)).toBe('nesw-resize');
  });
});

describe('drop index', () => {
  const col = [
    { x: 0, y: 0, w: 100, h: 40 },
    { x: 0, y: 50, w: 100, h: 40 },
    { x: 0, y: 100, w: 100, h: 40 },
  ];
  const box = { x: 0, y: 0, w: 100, h: 140 };
  it('column layouts use the vertical center', () => {
    expect(computeDropIndex(col, { x: 50, y: 5 }, { direction: 'column', wrap: false }, box).index).toBe(0);
    expect(computeDropIndex(col, { x: 50, y: 30 }, { direction: 'column', wrap: false }, box).index).toBe(1);
    expect(computeDropIndex(col, { x: 50, y: 200 }, { direction: 'column', wrap: false }, box).index).toBe(3);
    const r = computeDropIndex(col, { x: 50, y: 30 }, { direction: 'column', wrap: false }, box);
    expect(r.line.y1).toBe(45);
  });
  it('row-reverse flips the comparison', () => {
    const row = [
      { x: 200, y: 0, w: 100, h: 40 },
      { x: 100, y: 0, w: 100, h: 40 },
      { x: 0, y: 0, w: 100, h: 40 },
    ];
    expect(computeDropIndex(row, { x: 280, y: 10 }, { direction: 'row-reverse', wrap: false }, box).index).toBe(0);
    expect(computeDropIndex(row, { x: 60, y: 10 }, { direction: 'row-reverse', wrap: false }, box).index).toBe(2);
    expect(computeDropIndex(row, { x: 10, y: 10 }, { direction: 'row-reverse', wrap: false }, box).index).toBe(3);
  });
  it('wrapping rows pick the line under the pointer', () => {
    const grid = [
      { x: 0, y: 0, w: 50, h: 50 },
      { x: 60, y: 0, w: 50, h: 50 },
      { x: 0, y: 60, w: 50, h: 50 },
      { x: 60, y: 60, w: 50, h: 50 },
    ];
    expect(computeDropIndex(grid, { x: 100, y: 80 }, { direction: 'row', wrap: true }, box).index).toBe(4);
    expect(computeDropIndex(grid, { x: 70, y: 80 }, { direction: 'row', wrap: true }, box).index).toBe(3);
    expect(computeDropIndex(grid, { x: 5, y: 10 }, { direction: 'row', wrap: true }, box).index).toBe(0);
  });
  it('empty containers insert at 0', () => {
    expect(computeDropIndex([], { x: 5, y: 5 }, { direction: 'column', wrap: false }, box).index).toBe(0);
  });
  it('converts indices among the remaining children to full gap indices', () => {
    const all = ['a', 'b', 'c'];
    expect(toFullIndex(all, new Set(['a']), 1)).toBe(2);
    expect(toFullIndex(all, new Set(['a']), 2)).toBe(3);
    expect(toFullIndex(all, new Set(['c']), 0)).toBe(0);
  });
});

describe('zoom helpers', () => {
  it('steps through presets', () => {
    expect(nextZoomStep(1, 1)).toBe(1.25);
    expect(nextZoomStep(1, -1)).toBe(0.75);
    expect(nextZoomStep(0.6, 1)).toBe(0.667);
    expect(nextZoomStep(8, 1)).toBe(8);
  });
  it('fits a rect', () => {
    const v = fitRect({ x: 0, y: 0, w: 100, h: 100 }, 300, 300, 50, 8, 0.05);
    expect(v.zoom).toBe(2);
    expect(v.panX).toBe(50);
  });
});

// ─── selection rules ────────────────────────────────────────────────────────

function tree() {
  const nodes: Record<string, KNode> = {};
  const mk = (id: string, type: KNode['type'], parent: string | null) => {
    const n = createNode(type, { id });
    n.parent = parent;
    nodes[id] = n;
    if (parent) nodes[parent].children.push(id);
    return n;
  };
  mk('root', 'frame', null);
  mk('card', 'box', 'root');
  mk('title', 'text', 'card');
  mk('inner', 'box', 'card');
  mk('deep', 'text', 'inner');
  mk('other', 'box', 'root');
  return nodes;
}

describe('selection rules', () => {
  it('builds paths deepest-first', () => {
    expect(pathFor(tree(), 'deep')).toEqual(['deep', 'inner', 'card', 'root']);
  });
  it('selects top-level children when nothing is selected', () => {
    const nodes = tree();
    const open = openSet(nodes, 'root', []);
    expect(pickTarget(nodes, 'root', pathFor(nodes, 'deep'), open)).toBe('card');
    expect(pickTarget(nodes, 'root', ['root'], open)).toBeNull();
  });
  it('opens ancestors of the selection', () => {
    const nodes = tree();
    const open = openSet(nodes, 'root', ['title']);
    // inner's parent (card) is open → clicking deep selects inner
    expect(pickTarget(nodes, 'root', pathFor(nodes, 'deep'), open)).toBe('inner');
    // clicking a sibling of title selects it directly
    expect(pickTarget(nodes, 'root', pathFor(nodes, 'title'), open)).toBe('title');
  });
  it('keeps a selected container selected when clicking its children', () => {
    const nodes = tree();
    const open = openSet(nodes, 'root', ['card']);
    expect(pickTarget(nodes, 'root', pathFor(nodes, 'deep'), open)).toBe('card');
  });
  it('ctrl/cmd picks the deepest node', () => {
    const nodes = tree();
    expect(pickTarget(nodes, 'root', pathFor(nodes, 'deep'), openSet(nodes, 'root', []), { deep: true })).toBe('deep');
  });
  it('locked nodes are click-through to their unlocked ancestor', () => {
    const nodes = tree();
    nodes.inner.locked = true;
    expect(stripLocked(nodes, pathFor(nodes, 'deep'))).toEqual(['card', 'root']);
    const open = openSet(nodes, 'root', ['title']);
    expect(pickTarget(nodes, 'root', pathFor(nodes, 'deep'), open)).toBe('card');
    nodes.card.locked = true;
    expect(pickTarget(nodes, 'root', pathFor(nodes, 'deep'), open)).toBeNull();
  });
  it('double-click drills one level', () => {
    const nodes = tree();
    expect(drillTarget(nodes, pathFor(nodes, 'deep'), 'card')).toBe('inner');
    expect(drillTarget(nodes, pathFor(nodes, 'deep'), 'deep')).toBeNull();
  });
  it('identifies editable text leaves', () => {
    const nodes = tree();
    expect(isEditableText(nodes.title)).toBe(true);
    expect(isEditableText(nodes.card)).toBe(false);
  });
  it('computes shift ranges', () => {
    expect(rangeBetween(['a', 'b', 'c', 'd'], 'c', 'a')).toEqual(['a', 'b', 'c']);
    expect(rangeBetween(['a', 'b'], 'x', 'b')).toEqual(['b']);
  });
});
