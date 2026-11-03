/**
 * Export / preview / code-view commands, plus a dev-only window hook used by
 * the end-to-end fidelity test.
 */
import { createElement } from 'react';
import { Code2, Copy, ExternalLink, Eye, Upload } from 'lucide-react';
import { registerCommands } from '@/features/shortcuts/shortcuts';
import { useUI } from '@/core/store/uiStore';
import { useDoc } from '@/core/store/docStore';
import { addSubtree } from '@/core/store/actions';
import { importHtmlAsSubtree } from '@/core/io/htmlImport';
import { compileFragment, compileSite, compileSiteText } from '@/core/export';
import { copySelectionCode, openCurrentPageInBrowser, previewOptions } from './exportService';

const inEditor = () => useUI.getState().route === 'editor';

export function installExport(): () => void {
  const off = registerCommands([
    { id: 'export.open', title: 'Export code…', group: 'File', shortcut: 'Mod+E', icon: createElement(Upload), when: inEditor, run: () => useUI.getState().set({ exportOpen: true }) },
    { id: 'export.copyCode', title: 'Copy code (HTML + CSS)', group: 'Edit', shortcut: 'Mod+Alt+C', icon: createElement(Copy), when: inEditor, run: copySelectionCode, keywords: ['html', 'css', 'snippet'] },
    {
      id: 'preview.open',
      title: 'Preview',
      group: 'View',
      shortcut: 'Mod+Enter',
      altShortcuts: ['Mod+P'],
      icon: createElement(Eye),
      when: inEditor,
      run: () => useUI.getState().set({ previewOpen: true }),
      allowInInput: false,
    },
    { id: 'preview.openInBrowser', title: 'Open page in browser', group: 'View', shortcut: 'Mod+Shift+Enter', icon: createElement(ExternalLink), when: inEditor, run: () => void openCurrentPageInBrowser() },
    {
      id: 'view.code',
      title: 'Toggle code panel',
      group: 'View',
      shortcut: 'Alt+C',
      icon: createElement(Code2),
      when: inEditor,
      run: () => {
        const ui = useUI.getState();
        ui.set({ bottomPanel: ui.bottomPanel === 'code' ? null : 'code' });
      },
    },
  ]);

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).__kinemaExport = {
      useDoc,
      useUI,
      importHtmlAsSubtree,
      addSubtree,
      compileSite,
      compileSiteText,
      compileFragment,
      previewOptions,
    };
  }
  return off;
}
