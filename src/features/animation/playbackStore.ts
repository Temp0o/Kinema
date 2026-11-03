/**
 * Animation playback state shared by the timeline, canvas engine and title bar.
 * The engine (`engine.ts`) is the only writer of `playing` / `paused` / `time`.
 */
import { create } from 'zustand';
import type { NodeId } from '@/core/model/types';

export interface SelectedKeyframe {
  nodeId: NodeId;
  animId: string;
  keyframeId: string;
}

export interface PlaybackState {
  /** Whole-page (or scoped) playback running */
  playing: boolean;
  /** A playback session is held paused on a frame (timeline scrub / pause). */
  paused: boolean;
  /** Playhead (ms) for timeline scrubbing */
  time: number;
  /** When set, only animations of these nodes play */
  scope: NodeId[] | null;
  /** Loop playback in the timeline */
  loop: boolean;
  /** Animation currently selected in the Animate panel / timeline (shared with library & AI). */
  selectedAnimation: { nodeId: NodeId; animId: string } | null;
  /** Keyframe selected in the timeline / keyframe strip (edited in the Animate panel). */
  selectedKeyframe: SelectedKeyframe | null;
  /** The preset browser is open in the Animate panel. */
  presetBrowser: boolean;
  set: (p: Partial<PlaybackState>) => void;
}

export const usePlayback = create<PlaybackState>()((set) => ({
  playing: false,
  paused: false,
  time: 0,
  scope: null,
  loop: false,
  selectedAnimation: null,
  selectedKeyframe: null,
  presetBrowser: false,
  set: (p) => set(p),
}));
