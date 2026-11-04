/**
 * Layers panel UI-local state (not part of the document or history).
 */
import { create } from 'zustand';
import type { NodeId } from '@/core/model/types';
import type { LayerKind } from './layerOps';

export type DropPos = 'before' | 'after' | 'inside';

export interface LayersState {
  expanded: Set<NodeId>;
  query: string;
  kind: LayerKind;
  /** last plainly clicked row (Shift-range anchor) */
  anchor: NodeId | null;
  /** drag-and-drop indicator */
  drop: { id: NodeId; pos: DropPos } | null;
  dragging: boolean;
  renaming: NodeId | null;
  setExpanded: (id: NodeId, open: boolean) => void;
  expandMany: (ids: NodeId[]) => void;
  set: (p: Partial<LayersState>) => void;
}

export const useLayers = create<LayersState>()((set) => ({
  expanded: new Set(),
  query: '',
  kind: 'all',
  anchor: null,
  drop: null,
  dragging: false,
  renaming: null,
  setExpanded: (id, open) =>
    set((s) => {
      if (s.expanded.has(id) === open) return s;
      const next = new Set(s.expanded);
      if (open) next.add(id);
      else next.delete(id);
      return { expanded: next };
    }),
  expandMany: (ids) =>
    set((s) => {
      if (ids.every((id) => s.expanded.has(id))) return s;
      const next = new Set(s.expanded);
      ids.forEach((id) => next.add(id));
      return { expanded: next };
    }),
  set: (p) => set(p),
}));
