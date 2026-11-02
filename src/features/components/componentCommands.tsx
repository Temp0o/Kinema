import { Component, Unlink, PenLine, LogOut, Trash2 } from 'lucide-react';
import { useUI } from '@/core/store/uiStore';
import { useDoc } from '@/core/store/docStore';
import { registerCommands, type Command } from '@/features/shortcuts/shortcuts';
import {
  createComponentFromSelection,
  deleteComponent,
  detachSelection,
  editComponent,
  exitComponentEditing,
  goToMaster,
  selectedInstance,
} from './componentActions';
import { cannotCreateComponentReason } from './componentModel';

const inEditor = () => useUI.getState().route === 'editor';

export function registerComponentCommands() {
  const cmds: Command[] = [
    {
      id: 'component.create',
      title: 'Create component',
      group: 'Components',
      shortcut: 'Mod+Alt+K',
      icon: <Component />,
      keywords: ['master', 'symbol', 'reuse'],
      when: () => {
        const sel = useUI.getState().selection;
        return inEditor() && sel.length === 1 && !cannotCreateComponentReason(useDoc.getState().doc, sel[0]);
      },
      run: () => void createComponentFromSelection(),
    },
    {
      id: 'component.edit',
      title: 'Edit component',
      group: 'Components',
      icon: <PenLine />,
      when: () => inEditor() && !!selectedInstance(),
      run: () => {
        const inst = selectedInstance();
        if (inst?.props.componentId) editComponent(inst.props.componentId, { fromInstanceId: inst.id });
      },
    },
    {
      id: 'component.goToMaster',
      title: 'Go to main component',
      group: 'Components',
      icon: <Component />,
      when: () => inEditor() && !!selectedInstance(),
      run: () => {
        const inst = selectedInstance();
        if (inst) goToMaster(inst.id);
      },
    },
    {
      id: 'component.detach',
      title: 'Detach instance',
      group: 'Components',
      shortcut: 'Mod+Alt+B',
      icon: <Unlink />,
      when: () => {
        const ui = useUI.getState();
        const doc = useDoc.getState().doc;
        return inEditor() && ui.selection.some((id) => doc.nodes[id]?.type === 'instance');
      },
      run: detachSelection,
    },
    {
      id: 'component.exitEdit',
      title: 'Finish editing component',
      group: 'Components',
      shortcut: 'Escape',
      icon: <LogOut />,
      when: () => {
        const ui = useUI.getState();
        return inEditor() && !!ui.editingComponentId && ui.selection.length === 0 && !ui.editingTextId;
      },
      run: exitComponentEditing,
    },
    {
      id: 'component.deleteCurrent',
      title: 'Delete this component',
      group: 'Components',
      icon: <Trash2 />,
      when: () => inEditor() && !!useUI.getState().editingComponentId,
      run: () => {
        const id = useUI.getState().editingComponentId;
        if (id) deleteComponent(id);
      },
    },
  ];
  return registerCommands(cmds);
}
