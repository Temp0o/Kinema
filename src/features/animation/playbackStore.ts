/**
 * Animation playback state shared by the timeline, canvas engine and title bar.
 */
import { create } from 'zustand';
import type { NodeId } from '@/core/model/types';

export interface PlaybackState {
  /** Whole-page (or scoped) playback running */
  playing: boolean;
  /** Playhead (ms) for timeline scrubbing */
  time: number;
  /** When set, only animations of these nodes play */
  scope: NodeId[] | null;
  /** Loop playback in the timeline */
  loop: boolean;
  /** Animation currently selected in the Animate panel / timeline (shared with library & AI). */
  selectedAnimation: { nodeId: NodeId; animId: string } | null;
  set: (p: Partial<PlaybackState>) => void;
}

export const usePlayback = create<PlaybackState>()((set) => ({
  playing: false,
  time: 0,
  scope: null,
  loop: false,
  selectedAnimation: null,
  set: (p) => set(p),
}));
