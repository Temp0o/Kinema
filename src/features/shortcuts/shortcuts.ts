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

// ─── Keymap: one place that decides which keys run which command ────────────

const KEYMAP_KEY = 'kinema.keymap';
/** User overrides: command id → combos (null/[] = unbound). Missing = default. */
let overrides: Record<string, string[] | null> = loadOverrides();

function loadOverrides(): Record<string, string[] | null> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEYMAP_KEY) : null;
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function saveOverrides() {
  try {
    localStorage.setItem(KEYMAP_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

const MOD_ORDER = ['Mod', 'Shift', 'Alt'];
/** Canonical modifier order so "Alt+Shift+H" and "Shift+Alt+H" are the same combo. */
export function normalizeCombo(combo: string): string {
  const parts = combo.split('+');
  // a literal "+" key (e.g. "Mod++") leaves an empty trailing part
  const key = combo.endsWith('++') ? '+' : parts[parts.length - 1];
  const mods = parts.slice(0, combo.endsWith('++') ? -2 : -1).filter((m) => MOD_ORDER.includes(m));
  mods.sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
  return [...new Set(mods), key].join('+');
}

/** All key combos that trigger a command (user override or defaults), normalised. */
export function combosFor(c: Command): string[] {
  if (Object.prototype.hasOwnProperty.call(overrides, c.id)) return (overrides[c.id] ?? []).map(normalizeCombo);
  return ([c.shortcut, ...(c.altShortcuts ?? [])].filter(Boolean) as string[]).map(normalizeCombo);
}

/** The combo shown for a command in menus, tooltips and the palette. */
export function effectiveShortcut(c: Command | string): string | undefined {
  const cmd = typeof c === 'string' ? commands.get(c) : c;
  return cmd ? combosFor(cmd)[0] : undefined;
}

export function isCustomized(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, id);
}

/** Rebind a command (null = remove its shortcut). */
export function setShortcut(id: string, combo: string | null) {
  overrides = { ...overrides, [id]: combo ? [combo] : null };
  saveOverrides();
}
export function resetShortcut(id: string) {
  const { [id]: _drop, ...rest } = overrides;
  void _drop;
  overrides = rest;
  saveOverrides();
}
export function resetAllShortcuts() {
  overrides = {};
  saveOverrides();
}

/**
 * Keys intentionally shared by context-dependent commands (each guarded by `when`,
 * e.g. Escape stops playback, exits component editing, or deselects).
 */
const SHARED_OK = new Set(['Escape', 'Enter', 'Del']);

/** Combos claimed by more than one command (customisation UI and tests use this). */
export function findConflicts(list: Command[] = getCommands()): { combo: string; ids: string[] }[] {
  const by = new Map<string, string[]>();
  for (const c of list) for (const k of combosFor(c)) by.set(k, [...(by.get(k) ?? []), c.id]);
  return [...by.entries()].filter(([k, ids]) => ids.length > 1 && !SHARED_OK.has(k)).map(([combo, ids]) => ({ combo, ids }));
}

/** Combos that several context-dependent commands may share (never reported as conflicts). */
export function isSharedCombo(combo: string): boolean {
  return SHARED_OK.has(normalizeCombo(combo));
}

/** Which command (if any) already uses a combo — for the rebinding UI. */
export function commandForCombo(combo: string, exceptId?: string): Command | undefined {
  const k = normalizeCombo(combo);
  return getCommands().find((c) => c.id !== exceptId && combosFor(c).includes(k));
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
      if (!combosFor(c).includes(combo)) continue;
      if (typing && !c.allowInInput) continue;
      if (c.when && !c.when()) continue;
      e.preventDefault();
      c.run();
      return;
    }
  };
  window.addEventListener('keydown', onKey);
  // diagnostics: expose the keymap check (used by the Electron tests) and warn in dev
  (window as unknown as { __kinemaKeymap?: unknown }).__kinemaKeymap = { findConflicts: () => findConflicts() };
  const t = setTimeout(() => {
    const conflicts = findConflicts();
    if (conflicts.length && import.meta.env.DEV) console.warn('[kinema] shortcut conflicts:', conflicts);
  }, 1500);
  return () => {
    clearTimeout(t);
    window.removeEventListener('keydown', onKey);
  };
}
