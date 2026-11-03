/**
 * AI module installer: commands (`ai.open`, `ai.editSelection`, `ai.animateSelection`)
 * and a dev/test hook.
 */
import { Sparkles, Pencil, Clapperboard } from 'lucide-react';
import { useUI } from '@/core/store/uiStore';
import { registerCommands } from '@/features/shortcuts/shortcuts';
import { openAI, useAI } from './aiStore';

const inEditor = () => useUI.getState().route === 'editor';
const hasSel = () => inEditor() && useUI.getState().selection.length > 0;

export function installAI() {
  // A running generation belongs to the page/project it was started on: switching away cancels it
  // instead of dropping the result into whatever is open when it finishes.
  const offSwitch = useUI.subscribe((s, p) => {
    if (s.projectId === p.projectId && s.activePageId === p.activePageId && s.editingComponentId === p.editingComponentId && s.route === p.route) return;
    if (useAI.getState().run.status === 'running') useAI.getState().cancel();
  });
  const offCommands = registerCommands([
    { id: 'ai.open', title: 'Ask AI…', group: 'AI', shortcut: 'Mod+I', icon: <Sparkles />, allowInInput: true, when: inEditor, run: () => openAI(), keywords: ['generate', 'ollama', 'assistant'] },
    { id: 'ai.editSelection', title: 'AI: edit selection', group: 'AI', icon: <Pencil />, when: hasSel, run: () => openAI('edit'), keywords: ['rewrite', 'change', 'restyle'] },
    { id: 'ai.animateSelection', title: 'AI: animate selection', group: 'AI', icon: <Clapperboard />, when: hasSel, run: () => openAI('animate'), keywords: ['motion'] },
  ]);
  return () => {
    offSwitch();
    offCommands();
  };
}
