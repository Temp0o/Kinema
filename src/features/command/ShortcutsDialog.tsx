import { useMemo, useSyncExternalStore } from 'react';
import { Keyboard } from 'lucide-react';
import { useUI } from '@/core/store/uiStore';
import { Dialog, Kbd } from '@/ui/primitives';
import { effectiveShortcut, getCommands, subscribeCommands } from '@/features/shortcuts/shortcuts';

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

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const ver = useSyncExternalStore(sub, snap);
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; keys: string }[]>();
    for (const c of getCommands()) {
      const keys = effectiveShortcut(c);
      if (!keys) continue;
      const g = c.group ?? 'Other';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push({ title: c.title, keys });
    }
    for (const g of GESTURES) {
      if (!map.has(g.group)) map.set(g.group, []);
      map.get(g.group)!.push({ title: g.title, keys: g.keys });
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ver, open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => useUI.getState().set({ shortcutsOpen: o })}
      title="Keyboard shortcuts"
      description="Everything is also available from the command palette."
      width={760}
      icon={<Keyboard style={{ width: 20, height: 20, color: 'var(--accent-text)', marginTop: 2 }} />}
    >
      <div className="k-shortcuts">
        {groups.map(([group, items]) => (
          <div key={group} className="k-shortcuts__group">
            <h4>{group}</h4>
            {items.map((it) => (
              <div key={it.title + it.keys} className="k-shortcuts__row">
                <span>{it.title}</span>
                <Kbd keys={it.keys} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
