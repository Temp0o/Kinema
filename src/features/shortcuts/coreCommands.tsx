/**
 * Core editor commands (history, selection, structure). Feature modules register
 * their own commands alongside these.
 */
import { Redo2, Undo2, Trash2, Copy, Group, Ungroup, Save, Moon } from 'lucide-react';
import { useDoc } from '@/core/store/docStore';
import { useUI, savePref } from '@/core/store/uiStore';
import {
  deleteSelection,
  duplicateNodes,
  groupNodes,
  reorderNodes,
  selectAll,
  selectChildren,
  selectParent,
  ungroupNodes,
} from '@/core/store/actions';
import { registerCommands, type Command } from './shortcuts';
import { saveCurrent } from '@/features/projects/projectService';
import { platform } from '@/platform';
import { toggleLayoutModeForContext } from '@/features/layout/layoutUi';

const inEditor = () => useUI.getState().route === 'editor';
const hasSel = () => inEditor() && useUI.getState().selection.length > 0;

export function toggleTheme() {
  const next = useUI.getState().theme === 'dark' ? 'light' : 'dark';
  useUI.getState().set({ theme: next });
  savePref('theme', next);
  platform.window?.setTheme(next);
}

export function registerCoreCommands() {
  const cmds: Command[] = [
    { id: 'edit.undo', title: 'Undo', group: 'Edit', shortcut: 'Mod+Z', icon: <Undo2 />, when: inEditor, run: () => useDoc.getState().undo() },
    {
      id: 'edit.redo',
      title: 'Redo',
      group: 'Edit',
      shortcut: 'Mod+Shift+Z',
      altShortcuts: ['Mod+Y'],
      icon: <Redo2 />,
      when: inEditor,
      run: () => useDoc.getState().redo(),
    },
    { id: 'edit.delete', title: 'Delete', group: 'Edit', shortcut: 'Del', icon: <Trash2 />, when: hasSel, run: deleteSelection },
    {
      id: 'edit.duplicate',
      title: 'Duplicate',
      group: 'Edit',
      shortcut: 'Mod+D',
      icon: <Copy />,
      when: hasSel,
      run: () => duplicateNodes(useUI.getState().selection),
    },
    { id: 'select.all', title: 'Select all', group: 'Selection', shortcut: 'Mod+A', when: inEditor, run: selectAll },
    { id: 'select.none', title: 'Deselect', group: 'Selection', shortcut: 'Escape', when: hasSel, run: () => {
      const ui = useUI.getState();
      if (ui.editingTextId) ui.set({ editingTextId: null });
      else if (ui.selection.length) selectParent();
    } },
    { id: 'select.children', title: 'Select children', group: 'Selection', shortcut: 'Enter', when: hasSel, run: selectChildren },
    {
      id: 'arrange.group',
      title: 'Group selection',
      group: 'Arrange',
      shortcut: 'Mod+G',
      icon: <Group />,
      when: hasSel,
      run: () => groupNodes(useUI.getState().selection),
    },
    {
      id: 'arrange.ungroup',
      title: 'Ungroup',
      group: 'Arrange',
      shortcut: 'Mod+Shift+G',
      icon: <Ungroup />,
      when: hasSel,
      run: () => ungroupNodes(useUI.getState().selection),
    },
    { id: 'arrange.forward', title: 'Bring forward', group: 'Arrange', shortcut: 'Mod+]', when: hasSel, run: () => reorderNodes(useUI.getState().selection, 'forward') },
    { id: 'arrange.backward', title: 'Send backward', group: 'Arrange', shortcut: 'Mod+[', when: hasSel, run: () => reorderNodes(useUI.getState().selection, 'backward') },
    { id: 'arrange.front', title: 'Bring to front', group: 'Arrange', shortcut: 'Mod+Shift+]', when: hasSel, run: () => reorderNodes(useUI.getState().selection, 'front') },
    { id: 'arrange.back', title: 'Send to back', group: 'Arrange', shortcut: 'Mod+Shift+[', when: hasSel, run: () => reorderNodes(useUI.getState().selection, 'back') },
    { id: 'file.save', title: 'Save project', group: 'File', shortcut: 'Mod+S', icon: <Save />, when: inEditor, allowInInput: true, run: () => void saveCurrent() },
    {
      id: 'layout.toggleMode',
      title: 'Switch layout: Free ⇄ Flow (selected container or page)',
      group: 'Layout',
      shortcut: 'Shift+F',
      keywords: ['free', 'flow', 'absolute', 'layout', 'auto layout', 'stack'],
      when: inEditor,
      run: () => toggleLayoutModeForContext(),
    },
    { id: 'view.theme', title: 'Toggle light / dark theme', group: 'View', icon: <Moon />, run: toggleTheme },
  ];
  return registerCommands(cmds);
}
