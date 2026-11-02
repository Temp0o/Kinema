/**
 * Global keyboard shortcut registry. Features register commands with key combos;
 * the command palette lists the same commands.
 *
 * Combo syntax: "Mod+Shift+Z", "Del", "Alt+ArrowUp", "?" — Mod = Ctrl (Win/Linux) or ⌘ (macOS).
 */
import type { ReactNode } from 'react';

export interface Command {
  id: string;
  title: string;
  /** Group label in the command palette */
  group?: string;
  shortcut?: string;
  /** Additional combos that trigger the same command (not displayed). */
  altShortcuts?: string[];
  icon?: ReactNode;
  /** Return false to hide/disable */
  when?: () => boolean;
  run: () => void;
  /** Allow while typing in an input (default false). */
  allowInInput?: boolean;
  /** Extra search keywords */
  keywords?: string[];
}

const commands = new Map<string, Command>();
const listeners = new Set<() => void>();

export function registerCommands(list: Command[]): () => void {
  for (const c of list) commands.set(c.id, c);
  listeners.forEach((l) => l());
  return () => {
    for (const c of list) if (commands.get(c.id) === c) commands.delete(c.id);
    listeners.forEach((l) => l());
  };
}

export function getCommands(): Command[] {
  return [...commands.values()];
}

export function runCommand(id: string) {
  const c = commands.get(id);
  if (c && (!c.when || c.when())) c.run();
}

export function subscribeCommands(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function normalizeKey(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'Delete' || key === 'Backspace') return 'Del';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function eventCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  // Use code for letters/digits so Shift/Alt layouts still match
  let key = e.key;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  parts.push(normalizeKey(key));
  return parts.join('+');
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Install the global keydown dispatcher (call once). */
export function installShortcutDispatcher(): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const combo = eventCombo(e);
    const typing = isTypingTarget(e.target);
    for (const c of commands.values()) {
      const combos = [c.shortcut, ...(c.altShortcuts ?? [])].filter(Boolean) as string[];
      if (!combos.includes(combo)) continue;
      if (typing && !c.allowInInput) continue;
      if (c.when && !c.when()) continue;
      e.preventDefault();
      c.run();
      return;
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
