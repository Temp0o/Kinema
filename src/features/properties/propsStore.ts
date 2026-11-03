/**
 * Design panel UI state (not part of the document): which interaction state is
 * being edited. Keeps `ui.forcedState` in sync so the canvas shows that state.
 */
import { create } from 'zustand';
import { useUI } from '@/core/store/uiStore';
import type { EditState } from './scope';

interface PropsUIState {
  editState: EditState;
  setEditState: (s: EditState) => void;
}

export const usePropsUI = create<PropsUIState>()((set) => ({
  editState: 'default',
  setEditState: (s) => {
    set({ editState: s });
    const ui = useUI.getState();
    const id = ui.selection[0];
    const forced = s !== 'default' && id ? { id, state: s } : null;
    const cur = ui.forcedState;
    if (cur?.id !== forced?.id || cur?.state !== forced?.state) ui.set({ forcedState: forced });
  },
}));
