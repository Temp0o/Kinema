/**
 * Draft-safe style writers used inside canvas mutations.
 */
import type { Draft } from 'immer';
import type { BreakpointId, KNode } from '@/core/model/types';

export function writeStyle(n: Draft<KNode>, bp: BreakpointId, prop: string, value: string | null | undefined) {
  if (!n.styles[bp]) n.styles[bp] = {};
  const map = n.styles[bp];
  if (value === undefined || value === null || value === '') delete map[prop];
  else map[prop] = value;
  if (bp !== 'base' && Object.keys(map).length === 0) delete n.styles[bp];
}

const POSITION_PROPS = ['position', 'left', 'top', 'right', 'bottom', 'inset'];

/** Remove positioning on every breakpoint (node becomes a flow child). */
export function stripPosition(n: Draft<KNode>) {
  for (const bp of Object.keys(n.styles)) {
    for (const p of POSITION_PROPS) delete n.styles[bp][p];
    if (bp !== 'base' && Object.keys(n.styles[bp]).length === 0) delete n.styles[bp];
  }
}

/** Make a node absolutely positioned at (left, top) — responsive left/top overrides are dropped. */
export function placeAbsolute(n: Draft<KNode>, bp: BreakpointId, left: number, top: number) {
  for (const b of Object.keys(n.styles)) {
    if (b === bp) continue;
    delete n.styles[b].left;
    delete n.styles[b].top;
    delete n.styles[b].right;
    delete n.styles[b].bottom;
    if (b !== 'base' && Object.keys(n.styles[b]).length === 0) delete n.styles[b];
  }
  writeStyle(n, 'base', 'position', 'absolute');
  if (bp !== 'base') writeStyle(n, bp, 'position', 'absolute');
  writeStyle(n, bp, 'left', `${Math.round(left)}px`);
  writeStyle(n, bp, 'top', `${Math.round(top)}px`);
  writeStyle(n, bp, 'right', null);
  writeStyle(n, bp, 'bottom', null);
  writeStyle(n, bp, 'inset', null);
}

export function roundPx(v: number): string {
  return `${Math.round(v * 100) / 100}px`;
}
