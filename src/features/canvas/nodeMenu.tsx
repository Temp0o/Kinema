/**
 * Context menu shared by the canvas and the layers panel.
 */
import {
  ArrowDownToLine,
  ArrowUpToLine,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Component,
  Copy,
  CopyPlus,
  CornerLeftUp,
  Eye,
  EyeOff,
  Grid3x3,
  Group,
  Lock,
  LockOpen,
  Maximize,
  Scissors,
  Sparkles,
  Trash2,
  Ungroup,
  Zap,
  Layers,
} from 'lucide-react';
import type { MenuEntry } from '@/ui/menu';
import { docApi } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { currentRootId, deleteSelection, duplicateNodes, reorderNodes, selectAll, selectParent } from '@/core/store/actions';
import { getCommands, runCommand } from '@/features/shortcuts/shortcuts';
import { copySelection, cutSelection, pasteFromSystem } from '@/features/clipboard/clipboard';
import { canGroup, canUngroup, groupSelection, toggleHidden, toggleLocked, ungroupSelection } from './canvasActions';
import { zoomToFit, zoomToSelection } from './viewport';

function external(id: string, label: string, icon: React.ReactNode, shortcut?: string): MenuEntry {
  const available = getCommands().some((c) => c.id === id);
  return { label, icon, shortcut, disabled: !available, onSelect: () => runCommand(id) };
}

export function nodeMenuItems(): MenuEntry[] {
  const doc = docApi.doc;
  const ui = uiApi.state;
  const root = currentRootId();
  const sel = ui.selection.filter((id) => doc.nodes[id]);
  const onlyRoot = sel.length === 1 && sel[0] === root;
  if (!sel.length) {
    return [
      { label: 'Paste', icon: <ClipboardPaste />, shortcut: 'Mod+V', onSelect: () => void pasteFromSystem() },
      { label: 'Select all', icon: <Layers />, shortcut: 'Mod+A', onSelect: selectAll },
      { type: 'separator' },
      { label: 'Zoom to fit', icon: <Maximize />, shortcut: 'Shift+1', onSelect: () => zoomToFit() },
      { label: ui.showGrid ? 'Hide grid' : 'Show grid', icon: <Grid3x3 />, shortcut: "Mod+'", onSelect: () => runCommand('view.toggleGrid') },
    ];
  }
  const nodes = sel.map((id) => doc.nodes[id]);
  const anyVisible = nodes.some((n) => !n.hidden);
  const anyUnlocked = nodes.some((n) => !n.locked);
  const hasParent = nodes.some((n) => n.parent && n.parent !== root);
  return [
    { label: 'Cut', icon: <Scissors />, shortcut: 'Mod+X', disabled: onlyRoot, onSelect: cutSelection },
    { label: 'Copy', icon: <Copy />, shortcut: 'Mod+C', onSelect: () => void copySelection() },
    { label: 'Paste', icon: <ClipboardPaste />, shortcut: 'Mod+V', onSelect: () => void pasteFromSystem() },
    { label: 'Duplicate', icon: <CopyPlus />, shortcut: 'Mod+D', disabled: onlyRoot, onSelect: () => duplicateNodes(uiApi.state.selection) },
    { label: 'Delete', icon: <Trash2 />, shortcut: 'Del', danger: true, disabled: onlyRoot, onSelect: deleteSelection },
    { type: 'separator' },
    {
      type: 'submenu',
      label: 'Arrange',
      icon: <Layers />,
      disabled: onlyRoot,
      items: [
        { label: 'Bring to front', icon: <ArrowUpToLine />, shortcut: 'Mod+Shift+]', onSelect: () => reorderNodes(uiApi.state.selection, 'front') },
        { label: 'Bring forward', icon: <ChevronUp />, shortcut: 'Mod+]', onSelect: () => reorderNodes(uiApi.state.selection, 'forward') },
        { label: 'Send backward', icon: <ChevronDown />, shortcut: 'Mod+[', onSelect: () => reorderNodes(uiApi.state.selection, 'backward') },
        { label: 'Send to back', icon: <ArrowDownToLine />, shortcut: 'Mod+Shift+[', onSelect: () => reorderNodes(uiApi.state.selection, 'back') },
      ],
    },
    { label: 'Group selection', icon: <Group />, shortcut: 'Mod+G', disabled: onlyRoot || !canGroup(), onSelect: () => void groupSelection() },
    { label: 'Ungroup', icon: <Ungroup />, shortcut: 'Mod+Shift+G', disabled: onlyRoot || !canUngroup(), onSelect: ungroupSelection },
    { type: 'separator' },
    { label: anyVisible ? 'Hide' : 'Show', icon: anyVisible ? <EyeOff /> : <Eye />, shortcut: 'Mod+Shift+H', disabled: onlyRoot, onSelect: () => toggleHidden() },
    { label: anyUnlocked ? 'Lock' : 'Unlock', icon: anyUnlocked ? <Lock /> : <LockOpen />, shortcut: 'Mod+Shift+L', disabled: onlyRoot, onSelect: () => toggleLocked() },
    { label: 'Select parent', icon: <CornerLeftUp />, shortcut: 'Shift+Enter', disabled: !hasParent, onSelect: selectParent },
    { label: 'Zoom to selection', icon: <Maximize />, shortcut: 'Shift+2', onSelect: zoomToSelection },
    { type: 'separator' },
    external('component.create', 'Create component', <Component />, 'Mod+Alt+K'),
    external('library.saveSelection', 'Save to library', <BookmarkPlus />),
    external('anim.openPresets', 'Add animation…', <Zap />),
    external('ai.editSelection', 'Edit with AI…', <Sparkles />),
  ];
}
