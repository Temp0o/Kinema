/**
 * Transient canvas interaction state (never part of the document or history):
 * guides, marquee, drop indicators, active gesture, cursor overrides.
 */
import { create } from 'zustand';
import type { NodeId } from '@/core/model/types';
import type { Rect, SnapLabel, SnapLine } from './geometry';

export type Gesture = 'move' | 'resize' | 'rotate' | 'marquee' | 'draw' | 'pan' | 'height' | null;

export interface DropIndicator {
  /** container that will receive the drop */
  containerId: NodeId;
  /** insertion line in world px (flow containers) */
  line?: { x1: number; y1: number; x2: number; y2: number } | null;
  /** node targeted by an animation/style drop (highlighted instead of the container) */
  targetId?: NodeId | null;
}

export interface CanvasState {
  gesture: Gesture;
  /** smart guide lines (world px) */
  guides: SnapLine[];
  labels: SnapLabel[];
  /** marquee rect in world px */
  marquee: Rect | null;
  /** box/text tool preview in world px */
  draw: Rect | null;
  /** flow-drag ghost (world px) */
  ghost: Rect | null;
  drop: DropIndicator | null;
  /** temporary hand tool (Space held) */
  spaceHeld: boolean;
  /** forced cursor while a gesture runs */
  cursor: string | null;
  /** bumps whenever layout may have changed without a doc change (images, fonts, resize) */
  tick: number;
  /** live root frame height while dragging the height handle */
  frameHeight: number | null;
  /** small label near the pointer (screen px), e.g. rotation angle */
  hint: { text: string; x: number; y: number } | null;
  set: (p: Partial<CanvasState>) => void;
  bump: () => void;
  clearFeedback: () => void;
}

export const useCanvas = create<CanvasState>()((set) => ({
  gesture: null,
  guides: [],
  labels: [],
  marquee: null,
  draw: null,
  ghost: null,
  drop: null,
  spaceHeld: false,
  cursor: null,
  tick: 0,
  frameHeight: null,
  hint: null,
  set: (p) => set(p),
  bump: () => set((s) => ({ tick: s.tick + 1 })),
  clearFeedback: () =>
    set({ gesture: null, guides: [], labels: [], marquee: null, draw: null, ghost: null, drop: null, cursor: null, frameHeight: null, hint: null }),
}));
