/**
 * In-app drag & drop contract between panels (insert catalog, library, assets,
 * animation presets) and the canvas / layers panel.
 *
 * HTML5 DnD carries only the marker MIME type; the actual payload is kept here
 * in memory (functions can't travel through dataTransfer).
 */
import type { KAnimation, KNode, NodeId, StyleMap, InteractionState } from './model/types';

export const KINEMA_DND_MIME = 'application/x-kinema';

export type DragPayload =
  /** Insert new nodes. `build()` must return fresh ids every call. */
  | {
      type: 'nodes';
      label: string;
      build: () => { rootId: NodeId; nodes: Record<NodeId, KNode> };
      /** Preferred size hint (px) for freeform placement. */
      size?: { w: number; h: number };
    }
  /** Apply an animation to the node under the pointer. */
  | { type: 'animation'; label: string; animation: KAnimation }
  /** Apply styles/states to the node under the pointer. */
  | { type: 'style'; label: string; styles: StyleMap; states?: Partial<Record<InteractionState, StyleMap>> };

let current: DragPayload | null = null;
const listeners = new Set<(p: DragPayload | null) => void>();

export function startDrag(e: React.DragEvent | DragEvent, payload: DragPayload, preview?: HTMLElement | null) {
  current = payload;
  const dt = e.dataTransfer;
  if (dt) {
    dt.effectAllowed = 'copy';
    dt.setData(KINEMA_DND_MIME, payload.type);
    dt.setData('text/plain', payload.label);
    if (preview) dt.setDragImage(preview, 12, 12);
  }
  listeners.forEach((l) => l(current));
}

export function endDrag() {
  current = null;
  listeners.forEach((l) => l(null));
}

export function getDragPayload(): DragPayload | null {
  return current;
}

export function isKinemaDrag(e: React.DragEvent | DragEvent): boolean {
  return !!e.dataTransfer?.types.includes(KINEMA_DND_MIME);
}

export function subscribeDrag(cb: (p: DragPayload | null) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
