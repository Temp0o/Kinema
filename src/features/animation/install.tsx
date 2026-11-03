/**
 * Animation module installer: commands + shortcuts, engine ↔ document/UI
 * synchronisation, and a dev-only test hook.
 */
import { Clapperboard, Play, Square, Sparkles, PlayCircle } from 'lucide-react';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { registerCommands } from '@/features/shortcuts/shortcuts';
import { usePlayback } from './playbackStore';
import * as engine from './engine';

const inEditor = () => useUI.getState().route === 'editor';

export function openPresetBrowser() {
  useUI.getState().set({ rightTab: 'animate' });
  usePlayback.getState().set({ presetBrowser: true });
}

export function toggleTimeline() {
  const ui = useUI.getState();
  ui.set({ bottomPanel: ui.bottomPanel === 'timeline' ? null : 'timeline' });
}

function isTyping(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

/** Keep the selected animation / keyframe pointing at something that exists and is selected. */
function reconcileSelection() {
  const pb = usePlayback.getState();
  const doc = useDoc.getState().doc;
  const sel = useUI.getState().selection;
  let selected = pb.selectedAnimation;
  if (selected && !doc.nodes[selected.nodeId]?.animations?.some((a) => a.id === selected!.animId)) selected = null;
  if (sel.length === 1 && selected?.nodeId !== sel[0]) {
    const first = doc.nodes[sel[0]]?.animations?.[0];
    selected = first ? { nodeId: sel[0], animId: first.id } : null;
  }
  let kf = pb.selectedKeyframe;
  if (kf) {
    const a = doc.nodes[kf.nodeId]?.animations?.find((x) => x.id === kf!.animId);
    if (!a || !a.keyframes.some((k) => k.id === kf!.keyframeId) || !selected || selected.animId !== kf.animId) kf = null;
  }
  if (selected !== pb.selectedAnimation || kf !== pb.selectedKeyframe) pb.set({ selectedAnimation: selected, selectedKeyframe: kf });
}

export function installAnimation() {
  const unregister = registerCommands([
    {
      id: 'anim.playAll',
      title: 'Play / stop page animations',
      group: 'Animation',
      shortcut: 'Shift+Space',
      icon: <Play />,
      when: inEditor,
      run: () => engine.togglePlayAll(),
      keywords: ['preview', 'run', 'motion'],
    },
    {
      id: 'anim.playSelection',
      title: 'Play selected layers’ animations',
      group: 'Animation',
      icon: <PlayCircle />,
      when: () => inEditor() && useUI.getState().selection.length > 0,
      run: () => engine.playSelection(),
    },
    {
      id: 'anim.stop',
      title: 'Stop animations',
      group: 'Animation',
      shortcut: 'Escape',
      icon: <Square />,
      when: () => inEditor() && (engine.hasSession() || engine.isPreviewing()),
      run: () => {
        engine.stopPreview();
        engine.stopAll();
      },
    },
    {
      id: 'anim.openPresets',
      title: 'Add animation…',
      group: 'Animation',
      icon: <Sparkles />,
      when: inEditor,
      run: openPresetBrowser,
      keywords: ['preset', 'animate', 'motion', 'effect'],
    },
    {
      id: 'timeline.toggle',
      title: 'Toggle timeline',
      group: 'View',
      shortcut: 'Alt+T',
      icon: <Clapperboard />,
      when: inEditor,
      run: toggleTimeline,
    },
  ]);

  // Escape stops playback before the generic "deselect" handler sees it.
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !inEditor() || isTyping(e.target)) return;
    if (!engine.hasSession() && !engine.isPreviewing()) return;
    if (document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"]')) return;
    e.preventDefault();
    engine.stopPreview();
    engine.stopAll();
  };
  window.addEventListener('keydown', onKey, true);

  const unDoc = useDoc.subscribe((s, prev) => {
    if (s.doc === prev.doc) return;
    engine.notifyDocChanged();
    reconcileSelection();
  });

  const unUI = useUI.subscribe((s, prev) => {
    if (s.activePageId !== prev.activePageId || s.editingComponentId !== prev.editingComponentId || s.route !== prev.route) {
      engine.stopPreview();
      engine.stopAll();
      if (s.route !== prev.route) usePlayback.getState().set({ presetBrowser: false, selectedAnimation: null, selectedKeyframe: null });
    }
    if (prev.bottomPanel === 'timeline' && s.bottomPanel !== 'timeline' && usePlayback.getState().paused) engine.stopAll();
    if (s.selection !== prev.selection) reconcileSelection();
  });

  let devCleanup = () => {};
  if (import.meta.env.DEV) {
    const w = window as unknown as Record<string, unknown>;
    void import('@/core/store/actions').then((actions) => {
      w.__kinemaAnimDev = { engine, usePlayback, useDoc, useUI, actions };
    });
    devCleanup = () => {
      delete w.__kinemaAnimDev;
    };
  }

  return () => {
    unregister();
    window.removeEventListener('keydown', onKey, true);
    unDoc();
    unUI();
    devCleanup();
    engine.stopPreview();
    engine.stopAll();
  };
}
