/**
 * Arrange: align & distribute layers (to each other, or to the parent for a single
 * layer) and copy / paste style. Works on free-positioned layers; flow layers are
 * laid out by their container, so they are skipped with a hint.
 */
import { AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Paintbrush, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';
import type { ReactNode } from 'react';
import type { InteractionState, NodeId, StyleMap } from '@/core/model/types';
import { docApi } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { resolveStyles } from '@/core/style/style';
import { elementFor, paddingOrigin, worldRectOf } from '@/features/canvas/measure';
import { writeStyle } from '@/features/canvas/styleWrite';
import { registerCommands, type Command } from '@/features/shortcuts/shortcuts';

export type AlignHow = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

interface Box {
  id: NodeId;
  parent: NodeId;
  x: number;
  y: number;
  w: number;
  h: number;
}

function isFree(id: NodeId): boolean {
  const doc = docApi.doc;
  const n = doc.nodes[id];
  if (!n) return false;
  const pos = resolveStyles(doc, n, uiApi.state.breakpoint).position;
  return pos === 'absolute' || pos === 'fixed';
}

/** Boxes of the free-positioned selected layers, in their parent's padding-box coordinates. */
function freeBoxes(ids: NodeId[]): { boxes: Box[]; skipped: number } {
  const doc = docApi.doc;
  const boxes: Box[] = [];
  let skipped = 0;
  for (const id of ids) {
    const n = doc.nodes[id];
    if (!n?.parent || n.locked || !isFree(id)) {
      skipped++;
      continue;
    }
    const el = elementFor(id);
    const pel = elementFor(n.parent);
    const r = el ? worldRectOf(el) : null;
    const o = pel ? paddingOrigin(pel) : null;
    if (!r || !o) {
      skipped++;
      continue;
    }
    boxes.push({ id, parent: n.parent, x: r.x - o.x, y: r.y - o.y, w: r.w, h: r.h });
  }
  return { boxes, skipped };
}

function commit(label: string, moves: { id: NodeId; left?: number; top?: number }[]) {
  if (!moves.length) return;
  const bp = uiApi.state.breakpoint;
  docApi.mutate(label, (d) => {
    for (const m of moves) {
      const n = d.nodes[m.id];
      if (!n) continue;
      if (m.left != null) writeStyle(n, bp, 'left', `${Math.round(m.left)}px`);
      if (m.top != null) writeStyle(n, bp, 'top', `${Math.round(m.top)}px`);
    }
  });
}

function hintSkipped(skipped: number) {
  if (skipped) toast(`${skipped} layer${skipped > 1 ? 's' : ''} skipped`, { description: 'Flow layers are positioned by their container — switch the container to Free to align them.' });
}

/** Align selected layers to each other (2+) or to their parent (1). */
export function alignSelection(how: AlignHow) {
  const ids = uiApi.state.selection;
  const { boxes, skipped } = freeBoxes(ids);
  if (!boxes.length) return hintSkipped(skipped || ids.length);
  let ref: { x: number; y: number; w: number; h: number };
  if (boxes.length === 1) {
    const pel = elementFor(boxes[0].parent);
    if (!pel) return;
    ref = { x: 0, y: 0, w: pel.clientWidth, h: pel.clientHeight };
  } else {
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    ref = { x: minX, y: minY, w: Math.max(...boxes.map((b) => b.x + b.w)) - minX, h: Math.max(...boxes.map((b) => b.y + b.h)) - minY };
  }
  const moves = boxes.map((b) => {
    switch (how) {
      case 'left':
        return { id: b.id, left: ref.x };
      case 'hcenter':
        return { id: b.id, left: ref.x + (ref.w - b.w) / 2 };
      case 'right':
        return { id: b.id, left: ref.x + ref.w - b.w };
      case 'top':
        return { id: b.id, top: ref.y };
      case 'vcenter':
        return { id: b.id, top: ref.y + (ref.h - b.h) / 2 };
      case 'bottom':
        return { id: b.id, top: ref.y + ref.h - b.h };
    }
  });
  commit(`Align ${how}`, moves);
  hintSkipped(skipped);
}

/** Distribute 3+ layers so the gaps between them are equal. */
export function distributeSelection(axis: 'h' | 'v') {
  const { boxes, skipped } = freeBoxes(uiApi.state.selection);
  if (boxes.length < 3) {
    toast('Select at least three free layers to distribute');
    return;
  }
  const key = axis === 'h' ? 'x' : 'y';
  const size = axis === 'h' ? 'w' : 'h';
  const sorted = [...boxes].sort((a, b) => a[key] - b[key]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const total = sorted.reduce((s, b) => s + b[size], 0);
  const gap = (last[key] + last[size] - first[key] - total) / (sorted.length - 1);
  let cur = first[key] + first[size] + gap;
  const moves = sorted.slice(1, -1).map((b) => {
    const m = axis === 'h' ? { id: b.id, left: cur } : { id: b.id, top: cur };
    cur += b[size] + gap;
    return m;
  });
  commit(`Distribute ${axis === 'h' ? 'horizontally' : 'vertically'}`, moves);
  hintSkipped(skipped);
}

// ─── Copy / paste style ──────────────────────────────────────────────────────

const PLACEMENT = new Set(['position', 'left', 'top', 'right', 'bottom', 'inset', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'rotate', 'z-index', 'grid-column', 'grid-row', 'grid-area', 'order', 'flex', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-self', 'justify-self']);

let copied: { styles: StyleMap; states?: Partial<Record<InteractionState, StyleMap>>; from: string } | null = null;

export function copyStyle() {
  const doc = docApi.doc;
  const id = uiApi.state.selection[0];
  const n = id ? doc.nodes[id] : undefined;
  if (!n) return;
  const styles: StyleMap = {};
  for (const [k, v] of Object.entries(resolveStyles(doc, n, uiApi.state.breakpoint))) if (!PLACEMENT.has(k)) styles[k] = v;
  copied = { styles, states: n.states ? JSON.parse(JSON.stringify(n.states)) : undefined, from: n.name };
  toast(`Copied style of “${n.name}”`, { description: 'Paste it onto other layers with Ctrl+Alt+V.' });
}

export function pasteStyle() {
  const ids = uiApi.state.selection;
  if (!copied || !ids.length) return;
  const bp = uiApi.state.breakpoint;
  const src = copied;
  docApi.mutate(`Paste style from ${src.from}`, (d) => {
    for (const id of ids) {
      const n = d.nodes[id];
      if (!n) continue;
      for (const [k, v] of Object.entries(src.styles)) writeStyle(n, bp, k, v);
      if (src.states) n.states = JSON.parse(JSON.stringify(src.states));
    }
  });
}

export function hasCopiedStyle() {
  return !!copied;
}

// ─── Commands ────────────────────────────────────────────────────────────────

export const ALIGN_ACTIONS: { how: AlignHow; label: string; icon: ReactNode; shortcut: string }[] = [
  { how: 'left', label: 'Align left', icon: <AlignStartVertical />, shortcut: 'Alt+A' },
  { how: 'hcenter', label: 'Align horizontal centers', icon: <AlignCenterVertical />, shortcut: 'Alt+H' },
  { how: 'right', label: 'Align right', icon: <AlignEndVertical />, shortcut: 'Alt+D' },
  { how: 'top', label: 'Align top', icon: <AlignStartHorizontal />, shortcut: 'Alt+W' },
  { how: 'vcenter', label: 'Align vertical centers', icon: <AlignCenterHorizontal />, shortcut: 'Alt+V' },
  { how: 'bottom', label: 'Align bottom', icon: <AlignEndHorizontal />, shortcut: 'Alt+S' },
];

export const DISTRIBUTE_ACTIONS = [
  { axis: 'h' as const, label: 'Distribute horizontal spacing', icon: <AlignHorizontalSpaceAround />, shortcut: 'Alt+Shift+H' },
  { axis: 'v' as const, label: 'Distribute vertical spacing', icon: <AlignVerticalSpaceAround />, shortcut: 'Alt+Shift+V' },
];

export function installArrange() {
  const hasSel = () => uiApi.state.route === 'editor' && uiApi.state.selection.length > 0 && !uiApi.state.editingTextId;
  const cmds: Command[] = [
    ...ALIGN_ACTIONS.map((a) => ({ id: `arrange.align.${a.how}`, title: a.label, group: 'Arrange', shortcut: a.shortcut, icon: a.icon, when: hasSel, run: () => alignSelection(a.how) })),
    ...DISTRIBUTE_ACTIONS.map((a) => ({ id: `arrange.distribute.${a.axis}`, title: a.label, group: 'Arrange', shortcut: a.shortcut, icon: a.icon, when: hasSel, run: () => distributeSelection(a.axis) })),
    { id: 'edit.copyStyle', title: 'Copy style', group: 'Edit', shortcut: 'Mod+Alt+C', icon: <Paintbrush />, when: hasSel, run: copyStyle },
    { id: 'edit.pasteStyle', title: 'Paste style', group: 'Edit', shortcut: 'Mod+Alt+V', icon: <ClipboardPaste />, when: () => hasSel() && hasCopiedStyle(), run: pasteStyle },
  ];
  return registerCommands(cmds);
}
