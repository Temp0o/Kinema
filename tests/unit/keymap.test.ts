import { describe, expect, it, beforeEach } from 'vitest';
import { registerCommands, findConflicts, combosFor, setShortcut, resetShortcut, resetAllShortcuts, effectiveShortcut, commandForCombo, type Command } from '@/features/shortcuts/shortcuts';

const noop = () => {};
describe('keymap', () => {
  beforeEach(() => resetAllShortcuts());
  it('detects combos claimed by two commands, ignoring context-shared keys', () => {
    const a: Command = { id: 't.a', title: 'A', shortcut: 'Mod+Q', run: noop };
    const b: Command = { id: 't.b', title: 'B', shortcut: 'Mod+Q', run: noop };
    const c: Command = { id: 't.c', title: 'C', shortcut: 'Escape', run: noop };
    const d: Command = { id: 't.d', title: 'D', shortcut: 'Escape', run: noop };
    expect(findConflicts([a, b, c, d])).toEqual([{ combo: 'Mod+Q', ids: ['t.a', 't.b'] }]);
  });
  it('user overrides replace, remove and reset bindings', () => {
    const off = registerCommands([{ id: 't.x', title: 'X', shortcut: 'Mod+J', altShortcuts: ['Mod+Shift+J'], run: noop }]);
    expect(combosFor({ id: 't.x', title: 'X', shortcut: 'Mod+J', altShortcuts: ['Mod+Shift+J'], run: noop })).toEqual(['Mod+J', 'Mod+Shift+J']);
    setShortcut('t.x', 'Alt+J');
    expect(effectiveShortcut('t.x')).toBe('Alt+J');
    expect(commandForCombo('Alt+J')?.id).toBe('t.x');
    setShortcut('t.x', null);
    expect(effectiveShortcut('t.x')).toBeUndefined();
    resetShortcut('t.x');
    expect(effectiveShortcut('t.x')).toBe('Mod+J');
    off();
  });
});

import { normalizeCombo } from '@/features/shortcuts/shortcuts';
describe('normalizeCombo', () => {
  it('orders modifiers canonically', () => {
    expect(normalizeCombo('Alt+Shift+H')).toBe('Shift+Alt+H');
    expect(normalizeCombo('Shift+Mod+Z')).toBe('Mod+Shift+Z');
    expect(normalizeCombo('Mod++')).toBe('Mod++');
    expect(normalizeCombo('Escape')).toBe('Escape');
  });
});
