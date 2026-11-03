/**
 * AI module installer: commands (`ai.open`, `ai.editSelection`, `ai.animateSelection`)
 * and a dev/test hook.
 */
import { Sparkles, Pencil, Clapperboard } from 'lucide-react';
import { useUI } from '@/core/store/uiStore';
import { registerCommands } from '@/features/shortcuts/shortcuts';
import { openAI } from './aiStore';

const inEditor = () => useUI.getState().route === 'editor';
const hasSel = () => inEditor() && useUI.getState().selection.length > 0;

export function installAI() {
  return registerCommands([
    { id: 'ai.open', title: 'Ask AI…', group: 'AI', shortcut: 'Mod+I', icon: <Sparkles />, allowInInput: true, when: inEditor, run: () => openAI(), keywords: ['generate', 'ollama', 'assistant'] },
    { id: 'ai.editSelection', title: 'AI: edit selection', group: 'AI', icon: <Pencil />, when: hasSel, run: () => openAI('edit'), keywords: ['rewrite', 'change', 'restyle'] },
    { id: 'ai.animateSelection', title: 'AI: animate selection', group: 'AI', icon: <Clapperboard />, when: hasSel, run: () => openAI('animate'), keywords: ['motion'] },
  ]);
}
