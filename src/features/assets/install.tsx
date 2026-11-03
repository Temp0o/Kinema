import { Eraser, Upload } from 'lucide-react';
import { useUI } from '@/core/store/uiStore';
import { registerCommands } from '@/features/shortcuts/shortcuts';
import { pickAndImport, useAssetsUI } from './assetActions';

/** Registers asset commands (command palette). */
export function installAssets() {
  const inEditor = () => useUI.getState().route === 'editor';
  return registerCommands([
    { id: 'assets.import', title: 'Import assets…', group: 'Assets', icon: <Upload />, keywords: ['image', 'svg', 'font', 'upload', 'file'], when: inEditor, run: () => void pickAndImport() },
    {
      id: 'assets.cleanup',
      title: 'Clean up unused asset files…',
      group: 'Assets',
      icon: <Eraser />,
      keywords: ['delete', 'unused', 'storage'],
      when: inEditor,
      run: () => {
        useUI.getState().set({ leftTab: 'assets' });
        useAssetsUI.getState().set({ cleanupOpen: true });
      },
    },
  ]);
}
