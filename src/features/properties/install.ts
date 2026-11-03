/**
 * Properties module installer: resets the edited interaction state (and the
 * canvas' forced state) whenever the selection changes, and exposes a dev-only
 * store hook for end-to-end tests.
 */
import { useUI } from '@/core/store/uiStore';
import { useDoc } from '@/core/store/docStore';
import * as actions from '@/core/store/actions';
import { createNode } from '@/core/model/factory';
import { usePropsUI } from './propsStore';

export function installProperties() {
  const unsub = useUI.subscribe((s, prev) => {
    if (s.selection === prev.selection) return;
    const same = s.selection.length === prev.selection.length && s.selection.every((id, i) => id === prev.selection[i]);
    if (same) return;
    if (usePropsUI.getState().editState !== 'default') usePropsUI.getState().setEditState('default');
    else if (s.forcedState) useUI.getState().set({ forcedState: null });
  });

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const w = window as unknown as { __kinemaDev?: Record<string, unknown> };
    w.__kinemaDev = { ...(w.__kinemaDev ?? {}), useDoc, useUI, usePropsUI, actions, createNode };
  }
  return unsub;
}
