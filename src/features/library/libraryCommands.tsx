import { toast } from 'sonner';
import { BookMarked, Clapperboard, Palette, Paintbrush, Component as ComponentIcon, FileUp } from 'lucide-react';
import { useDoc, docApi } from '@/core/store/docStore';
import { uiApi, useUI } from '@/core/store/uiStore';
import { registerCommands, type Command } from '@/features/shortcuts/shortcuts';
import { usePlayback } from '@/features/animation/playbackStore';
import type { LibraryItem } from '@/core/model/types';
import { captureNodeSnapshot } from '@/features/projects/thumbnails';
import {
  buildAnimationItem,
  buildComponentItem,
  buildPaletteItem,
  buildStyleItem,
  buildSvgItem,
} from './libraryItems';
import { addItem, ensureLibraryLoaded, useLibrary, useSaveDialog } from './libraryStore';
import { importPackFromPicker } from './libraryPack';

const inEditor = () => useUI.getState().route === 'editor';
const singleSel = () => {
  const sel = uiApi.state.selection;
  return sel.length === 1 ? docApi.doc.nodes[sel[0]] : undefined;
};

export function showInLibrary(id?: string) {
  uiApi.set({ leftTab: 'library' });
  if (id) useLibrary.setState({ highlightId: id });
}

async function finish(item: LibraryItem | null) {
  if (!item) {
    toast.error('Could not save to your library');
    return null;
  }
  await addItem(item);
  toast.success(`Saved “${item.name}” to your library`, { action: { label: 'View', onClick: () => showInLibrary(item.id) } });
  return item;
}

export function saveSelectionToLibrary(nodeId?: string) {
  const id = nodeId ?? singleSel()?.id;
  const node = id ? docApi.doc.nodes[id] : undefined;
  if (!node) {
    toast.info('Select a single layer to save');
    return;
  }
  void ensureLibraryLoaded();
  const isSvg = node.type === 'svg' && !!node.props.svg;
  useSaveDialog.getState().open({
    title: 'Save to library',
    defaultName: node.name,
    kind: 'component',
    kinds: isSvg
      ? [
          { kind: 'component', label: 'Component' },
          { kind: 'svg', label: 'SVG' },
        ]
      : undefined,
    create: async (kind, info) => {
      if (kind === 'svg') return finish(buildSvgItem(node.props.svg ?? '', info));
      const thumbnail = (await captureNodeSnapshot(node.id)) ?? undefined;
      return finish(await buildComponentItem(docApi.doc, node.id, { ...info, thumbnail }, uiApi.state.projectId));
    },
  });
}

export function saveComponentToLibrary(componentId: string) {
  const doc = docApi.doc;
  const comp = doc.components[componentId];
  if (!comp) return;
  void ensureLibraryLoaded();
  useSaveDialog.getState().open({
    title: 'Save component to library',
    defaultName: comp.name,
    kind: 'component',
    create: async (_k, info) => {
      const inst = Object.values(docApi.doc.nodes).find((n) => n.type === 'instance' && n.props.componentId === componentId);
      const thumbnail = inst ? ((await captureNodeSnapshot(inst.id)) ?? undefined) : undefined;
      return finish(await buildComponentItem(docApi.doc, comp.rootId, { ...info, thumbnail }, uiApi.state.projectId));
    },
  });
}

export function saveAnimationToLibrary() {
  const sel = usePlayback.getState().selectedAnimation;
  const anim = sel ? docApi.doc.nodes[sel.nodeId]?.animations?.find((a) => a.id === sel.animId) : undefined;
  if (!anim) {
    toast.info('Select an animation first', { description: 'Pick one in the Animate panel or timeline.' });
    return;
  }
  void ensureLibraryLoaded();
  useSaveDialog.getState().open({
    title: 'Save animation to library',
    defaultName: anim.name,
    kind: 'animation',
    create: (_k, info) => finish(buildAnimationItem(anim, info)),
  });
}

export function savePaletteToLibrary() {
  const colors = useDoc.getState().doc.tokens.colors;
  if (!colors.length) {
    toast.info('This project has no color tokens yet');
    return;
  }
  void ensureLibraryLoaded();
  useSaveDialog.getState().open({
    title: 'Save color palette',
    defaultName: `${uiApi.state.projectName || 'Project'} palette`,
    kind: 'palette',
    create: (_k, info) => finish(buildPaletteItem(colors, info)),
  });
}

export function saveStyleToLibrary() {
  const node = singleSel();
  if (!node) {
    toast.info('Select a single layer to save its style');
    return;
  }
  void ensureLibraryLoaded();
  useSaveDialog.getState().open({
    title: 'Save style preset',
    defaultName: `${node.name} style`,
    kind: 'style',
    create: (_k, info) => finish(buildStyleItem(node, info, 'base')),
  });
}

export function registerLibraryCommands() {
  const cmds: Command[] = [
    {
      id: 'library.saveSelection',
      title: 'Save selection to library',
      group: 'Library',
      shortcut: 'Mod+Alt+L',
      icon: <BookMarked />,
      keywords: ['component', 'snippet', 'reuse'],
      when: () => inEditor() && !!singleSel(),
      run: () => saveSelectionToLibrary(),
    },
    {
      id: 'library.saveAnimation',
      title: 'Save animation to library',
      group: 'Library',
      icon: <Clapperboard />,
      when: () => inEditor() && !!usePlayback.getState().selectedAnimation,
      run: saveAnimationToLibrary,
    },
    { id: 'library.savePalette', title: 'Save color palette to library', group: 'Library', icon: <Palette />, when: inEditor, run: savePaletteToLibrary },
    {
      id: 'library.saveStyle',
      title: 'Save style to library',
      group: 'Library',
      icon: <Paintbrush />,
      when: () => inEditor() && !!singleSel(),
      run: saveStyleToLibrary,
    },
    { id: 'library.open', title: 'Open library', group: 'Library', icon: <ComponentIcon />, when: inEditor, run: () => showInLibrary() },
    { id: 'library.import', title: 'Import library pack…', group: 'Library', icon: <FileUp />, run: () => void importPackFromPicker() },
  ];
  return registerCommands(cmds);
}
