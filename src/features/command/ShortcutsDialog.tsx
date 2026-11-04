import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Keyboard, RotateCcw, Search, X } from 'lucide-react';
import { useUI } from '@/core/store/uiStore';
import { Button, Dialog, Kbd } from '@/ui/primitives';
import {
  commandForCombo,
  effectiveShortcut,
  eventCombo,
  getCommands,
  isCustomized,
  isSharedCombo,
  normalizeCombo,
  resetAllShortcuts,
  resetShortcut,
  setShortcut,
  subscribeCommands,
  type Command,
} from '@/features/shortcuts/shortcuts';

let v = 0;
const sub = (cb: () => void) =>
  subscribeCommands(() => {
    v++;
    cb();
  });
const snap = () => v;

/** Extra, non-command interactions worth documenting. */
const GESTURES: { group: string; title: string; keys: string }[] = [
  { group: 'Canvas', title: 'Pan', keys: 'Space+Drag' },
  { group: 'Canvas', title: 'Zoom', keys: 'Mod+Scroll' },
  { group: 'Canvas', title: 'Select deep layer', keys: 'Mod+Click' },
  { group: 'Canvas', title: 'Add to selection', keys: 'Shift+Click' },
  { group: 'Canvas', title: 'Duplicate while dragging', keys: 'Alt+Drag' },
  { group: 'Canvas', title: 'Constrain / keep ratio', keys: 'Shift+Drag' },
  { group: 'Canvas', title: 'Edit text / enter group', keys: 'Double-click' },
];

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS']);

type Row = { id?: string; title: string; keys?: string; custom?: boolean };

/** Click a shortcut, press the new keys. Conflicts ask before taking a combo from another command. */
function ShortcutCell({ cmd, recording, onRecord, onDone }: { cmd: Command; recording: boolean; onRecord: () => void; onDone: () => void }) {
  const [pending, setPending] = useState<{ combo: string; other: Command } | null>(null);
  const keys = effectiveShortcut(cmd);
  const cellRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!recording) return setPending(null);
    // capture on window: runs before the dialog's own Escape handling and the global dispatcher
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (MODIFIER_KEYS.has(e.key)) return;
      if (e.key === 'Escape') return onDone();
      const combo = normalizeCombo(eventCombo(e));
      const other = isSharedCombo(combo) ? undefined : commandForCombo(combo, cmd.id);
      if (other) return setPending({ combo, other });
      setShortcut(cmd.id, combo);
      onDone();
    };
    // clicking anywhere else stops recording (so typing in the search box is never captured)
    const onDown = (e: PointerEvent) => {
      if (!cellRef.current?.contains(e.target as Node)) onDone();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [recording, cmd.id, onDone]);

  if (recording && pending)
    return (
      <span className="k-shortcuts__conflict" role="alert" ref={cellRef}>
        <Kbd keys={pending.combo} /> is used by <b>{pending.other.title}</b>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            setShortcut(pending.other.id, null);
            setShortcut(cmd.id, pending.combo);
            onDone();
          }}
        >
          Replace
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </span>
    );
  if (recording)
    return (
      <span className="k-shortcuts__recording" ref={cellRef}>
        <span className="k-shortcuts__listen" data-testid="shortcut-recording">
          Press keys…
        </span>
        {keys && (
          <button
            className="k-shortcuts__mini"
            title="Remove shortcut"
            onClick={() => {
              setShortcut(cmd.id, null);
              onDone();
            }}
          >
            <X />
          </button>
        )}
      </span>
    );
  return (
    <span className="k-shortcuts__keys">
      {isCustomized(cmd.id) && (
        <button className="k-shortcuts__mini" title="Reset to default" onClick={() => resetShortcut(cmd.id)} data-testid="shortcut-reset">
          <RotateCcw />
        </button>
      )}
      <button className="k-shortcuts__edit" onClick={onRecord} title="Click to change" data-testid={`shortcut-${cmd.id}`}>
        {keys ? <Kbd keys={keys} /> : <span className="k-shortcuts__none">Add shortcut</span>}
      </button>
    </span>
  );
}

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const ver = useSyncExternalStore(sub, snap);
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState<string | null>(null);
  const stopRecording = useCallback(() => setRecording(null), []);

  useEffect(() => {
    if (!open) {
      setRecording(null);
      setQuery('');
    }
  }, [open]);

  const { groups, anyCustom } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (title: string, keys?: string) => !q || title.toLowerCase().includes(q) || (keys ?? '').toLowerCase().includes(q);
    const map = new Map<string, Row[]>();
    let anyCustom = false;
    for (const c of getCommands()) {
      const keys = effectiveShortcut(c);
      const custom = isCustomized(c.id);
      anyCustom ||= custom;
      // without a search, list what has keys (or was customised); searching finds every command
      if (!q && !keys && !custom) continue;
      if (!match(c.title, keys)) continue;
      const g = c.group ?? 'Other';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push({ id: c.id, title: c.title, keys, custom });
    }
    for (const g of GESTURES) {
      if (!match(g.title, g.keys)) continue;
      if (!map.has(g.group)) map.set(g.group, []);
      map.get(g.group)!.push({ title: g.title, keys: g.keys });
    }
    for (const rows of map.values()) rows.sort((a, b) => a.title.localeCompare(b.title));
    return { groups: [...map.entries()].sort((a, b) => b[1].length - a[1].length), anyCustom };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver, open, query]);

  const byId = new Map(getCommands().map((c) => [c.id, c]));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => useUI.getState().set({ shortcutsOpen: o })}
      title="Keyboard shortcuts"
      description="Click a shortcut to change it. Everything is also in the command palette (Ctrl+K)."
      width={780}
      icon={<Keyboard style={{ width: 20, height: 20, color: 'var(--accent-text)', marginTop: 2 }} />}
      footer={
        anyCustom ? (
          <Button variant="ghost" icon={<RotateCcw />} onClick={() => resetAllShortcuts()} data-testid="shortcuts-reset-all">
            Reset all to defaults
          </Button>
        ) : undefined
      }
    >
      <label className="k-shortcuts__search">
        <Search />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search commands or keys…" aria-label="Search shortcuts" data-testid="shortcuts-search" />
      </label>
      <div className="k-shortcuts">
        {groups.map(([group, items]) => (
          <div key={group} className="k-shortcuts__group">
            <h4>{group}</h4>
            {items.map((it) => {
              const cmd = it.id ? byId.get(it.id) : undefined;
              return (
                <div key={it.id ?? it.title + it.keys} className="k-shortcuts__row" data-custom={it.custom || undefined}>
                  <span>{it.title}</span>
                  {cmd ? (
                    <ShortcutCell cmd={cmd} recording={recording === cmd.id} onRecord={() => setRecording(cmd.id)} onDone={stopRecording} />
                  ) : (
                    <Kbd keys={it.keys!} />
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {!groups.length && <div className="k-muted">No commands match “{query}”.</div>}
      </div>
    </Dialog>
  );
}
