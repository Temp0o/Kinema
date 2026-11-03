/**
 * Canvas feature installer: commands (zoom, tools, nudge, grid, layers),
 * clipboard, Space-to-pan, image tool, Enter-to-edit text.
 */
import { Grid3x3, Hand, ImageIcon, Magnet, Maximize, MousePointer2, Square, Type, ZoomIn, ZoomOut, Group, Eye, Lock, CornerLeftUp, Scan } from 'lucide-react';
import { toast } from 'sonner';
import { useUI, uiApi, savePref } from '@/core/store/uiStore';
import { insertionTarget, selectParent } from '@/core/store/actions';
import { registerCommands, type Command } from '@/features/shortcuts/shortcuts';
import { platform } from '@/platform';
import { importAndInsertFiles } from '@/features/assets/importer';
import { installClipboard } from '@/features/clipboard/clipboard';
import { useCanvas } from './canvasStore';
import { zoomStep, zoomTo, zoomToFit, zoomToSelection } from './viewport';
import { groupSelection, nudge, toggleHidden, toggleLocked } from './canvasActions';
import { editSelectedText, endGesture, gestureActive } from './interactions';
import { installTextEditGuards } from './textEditing';
import { elementFor, viewportEl, screenToWorld, worldRectOf } from './measure';

const inEditor = () => uiApi.state.route === 'editor';
const notEditing = () => inEditor() && !uiApi.state.editingTextId;
const hasSel = () => notEditing() && uiApi.state.selection.length > 0;

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

function setTool(tool: 'select' | 'hand' | 'box' | 'text' | 'image') {
  uiApi.set({ tool });
}

async function runImageTool() {
  try {
    const files = await platform.files.open({ accept: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'image/*'], multiple: true });
    if (!files.length) return;
    const target = insertionTarget();
    if (!target) return;
    // center of the visible canvas, relative to the parent's border box
    const vp = viewportEl();
    const el = elementFor(target.parentId);
    const r = el ? worldRectOf(el) : null;
    let point: { x: number; y: number } | undefined;
    if (vp && r) {
      const c = screenToWorld(vp.clientWidth / 2, vp.clientHeight / 2);
      point = { x: Math.max(0, Math.min(r.w, c.x - r.x)), y: Math.max(0, Math.min(r.h, c.y - r.y)) };
    }
    await importAndInsertFiles(files, target.parentId, point);
  } catch (err) {
    toast.error('Could not import image', { description: String(err) });
  } finally {
    if (uiApi.state.tool === 'image') setTool('select');
  }
}

function nudgeCmd(id: string, key: string, dx: number, dy: number): Command[] {
  return [
    { id: `canvas.nudge.${id}`, title: `Nudge ${id}`, group: 'Arrange', shortcut: key, when: hasSel, run: () => nudge(dx, dy) },
    { id: `canvas.nudge10.${id}`, title: `Nudge ${id} ×10`, group: 'Arrange', shortcut: `Shift+${key}`, when: hasSel, run: () => nudge(dx * 10, dy * 10) },
    { id: `canvas.reorder.${id}`, title: `Move ${id} in layout`, group: 'Arrange', shortcut: `Alt+${key}`, when: hasSel, run: () => nudge(dx, dy, { reorderOnly: true }) },
  ];
}

export function installCanvas(): () => void {
  const cmds: Command[] = [
    { id: 'view.zoomIn', title: 'Zoom in', group: 'View', shortcut: 'Mod+=', altShortcuts: ['Mod+Shift+=', 'Mod+Shift++', 'Mod++'], icon: <ZoomIn />, when: inEditor, allowInInput: false, run: () => zoomStep(1) },
    { id: 'view.zoomOut', title: 'Zoom out', group: 'View', shortcut: 'Mod+-', altShortcuts: ['Mod+Shift+-', 'Mod+Shift+_', 'Mod+_'], icon: <ZoomOut />, when: inEditor, run: () => zoomStep(-1) },
    { id: 'view.zoomFit', title: 'Zoom to fit', group: 'View', shortcut: 'Shift+1', altShortcuts: ['Shift+!'], icon: <Maximize />, when: notEditing, run: () => zoomToFit() },
    { id: 'view.zoomSelection', title: 'Zoom to selection', group: 'View', shortcut: 'Shift+2', altShortcuts: ['Shift+@'], icon: <Scan />, when: notEditing, run: zoomToSelection },
    { id: 'view.zoom100', title: 'Zoom to 100%', group: 'View', shortcut: 'Mod+0', when: inEditor, run: () => zoomTo(1) },
    {
      id: 'view.toggleGrid',
      title: 'Show / hide grid',
      group: 'View',
      shortcut: "Mod+'",
      icon: <Grid3x3 />,
      when: inEditor,
      run: () => {
        const v = !uiApi.state.showGrid;
        uiApi.set({ showGrid: v });
        savePref('showGrid', v);
      },
    },
    {
      id: 'view.toggleSnap',
      title: 'Toggle snap to grid',
      group: 'View',
      shortcut: "Mod+Shift+'",
      altShortcuts: ['Mod+Shift+"'],
      icon: <Magnet />,
      when: inEditor,
      run: () => {
        const v = !uiApi.state.snapToGrid;
        uiApi.set({ snapToGrid: v });
        savePref('snapToGrid', v);
        toast(v ? 'Snap to grid on' : 'Snap to grid off');
      },
    },
    { id: 'tool.select', title: 'Select tool', group: 'Tools', shortcut: 'V', icon: <MousePointer2 />, when: notEditing, run: () => setTool('select') },
    { id: 'tool.hand', title: 'Hand tool', group: 'Tools', shortcut: 'H', icon: <Hand />, when: notEditing, run: () => setTool('hand') },
    { id: 'tool.box', title: 'Box tool', group: 'Tools', shortcut: 'B', altShortcuts: ['R', 'F'], icon: <Square />, when: notEditing, run: () => setTool('box') },
    { id: 'tool.text', title: 'Text tool', group: 'Tools', shortcut: 'T', icon: <Type />, when: notEditing, run: () => setTool('text') },
    { id: 'tool.image', title: 'Insert image…', group: 'Tools', shortcut: 'I', icon: <ImageIcon />, when: notEditing, run: () => setTool('image') },
    // geometry-aware grouping replaces the structural core command
    { id: 'arrange.group', title: 'Group selection', group: 'Arrange', shortcut: 'Mod+G', icon: <Group />, when: hasSel, run: () => void groupSelection() },
    { id: 'layer.toggleHidden', title: 'Hide / show selection', group: 'Layers', shortcut: 'Mod+Shift+H', icon: <Eye />, when: hasSel, run: () => toggleHidden() },
    { id: 'layer.toggleLock', title: 'Lock / unlock selection', group: 'Layers', shortcut: 'Mod+Shift+L', icon: <Lock />, when: hasSel, run: () => toggleLocked() },
    { id: 'select.parent', title: 'Select parent', group: 'Selection', shortcut: 'Shift+Enter', icon: <CornerLeftUp />, when: hasSel, run: selectParent },
    ...nudgeCmd('left', 'ArrowLeft', -1, 0),
    ...nudgeCmd('right', 'ArrowRight', 1, 0),
    ...nudgeCmd('up', 'ArrowUp', 0, -1),
    ...nudgeCmd('down', 'ArrowDown', 0, 1),
  ];
  const unregister = registerCommands(cmds);

  // Space-hold → temporary hand tool; Enter on a text leaf → edit; Escape ends gestures.
  const onKeyDown = (e: KeyboardEvent) => {
    if (!inEditor() || isTypingTarget(e.target)) return;
    if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"], [role="menu"]')) return;
    if (e.code === 'Space' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (!e.repeat && !useCanvas.getState().spaceHeld) {
        useCanvas.getState().set({ spaceHeld: true });
        uiApi.state.setHover(null);
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !uiApi.state.editingTextId) {
      if (editSelectedText()) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' && useCanvas.getState().spaceHeld) {
      e.preventDefault();
      useCanvas.getState().set({ spaceHeld: false });
    }
  };
  const onBlur = () => {
    if (useCanvas.getState().spaceHeld) useCanvas.getState().set({ spaceHeld: false });
    if (gestureActive()) endGesture(true);
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', onBlur);

  // Image tool opens the file picker as soon as it's chosen.
  const unsubTool = useUI.subscribe((s, prev) => {
    if (s.tool === 'image' && prev.tool !== 'image') void runImageTool();
    if (s.route !== 'editor' && prev.route === 'editor') useCanvas.getState().clearFeedback();
  });

  const cleanups = [installClipboard(), installTextEditGuards()];
  return () => {
    unregister();
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur);
    unsubTool();
    cleanups.forEach((c) => c());
  };
}
