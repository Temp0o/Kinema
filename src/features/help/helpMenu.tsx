/**
 * Help menu entries (shared by the editor's main menu and the home screen).
 * Feature modules can add entries (e.g. the onboarding tour) via registerHelpItem.
 */
import type { ReactNode } from 'react';
import { BookOpen, Bug, Cpu, Info, Keyboard } from 'lucide-react';
import { useUI } from '@/core/store/uiStore';
import { platform } from '@/platform';
import type { MenuEntry } from '@/ui/menu';
import pkg from '../../../package.json';

const REPO = 'https://github.com/Temp0o/Kinema';

const extra: { label: ReactNode; icon?: ReactNode; onSelect: () => void; order: number }[] = [];

/** Add an item at the top of the Help menu (e.g. "Take the tour"). Returns a remover. */
export function registerHelpItem(item: { label: ReactNode; icon?: ReactNode; onSelect: () => void; order?: number }) {
  const entry = { ...item, order: item.order ?? 0 };
  extra.push(entry);
  extra.sort((a, b) => a.order - b.order);
  return () => {
    const i = extra.indexOf(entry);
    if (i >= 0) extra.splice(i, 1);
  };
}

export function helpMenuItems(): MenuEntry[] {
  const open = (path: string) => () => void platform.files.openExternal(`${REPO}${path}`);
  return [
    ...extra.map((e) => ({ label: e.label, icon: e.icon, onSelect: e.onSelect })),
    ...(extra.length ? [{ type: 'separator' as const }] : []),
    { label: 'Keyboard shortcuts', icon: <Keyboard />, shortcut: 'Mod+/', onSelect: () => useUI.getState().set({ shortcutsOpen: true }) },
    { label: 'User guide', icon: <BookOpen />, onSelect: open('/blob/kinema/docs/USER_GUIDE.md') },
    { label: 'Local AI setup (Ollama)', icon: <Cpu />, onSelect: open('/blob/kinema/docs/OLLAMA.md') },
    { label: 'Report a problem', icon: <Bug />, onSelect: open('/issues/new/choose') },
    { type: 'separator' },
    { label: `About Kinema ${pkg.version}`, icon: <Info />, onSelect: () => useUI.getState().set({ settingsOpen: true }) },
  ];
}
