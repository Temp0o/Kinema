/**
 * Command palette (Mod+K): fuzzy search over every registered command plus
 * quick navigation (layers on the current page, pages).
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Command as Cmdk } from 'cmdk';
import { FileText, Layers, Search, CornerDownLeft } from 'lucide-react';
import { useUI } from '@/core/store/uiStore';
import { useDoc } from '@/core/store/docStore';
import { effectiveShortcut, getCommands, registerCommands, subscribeCommands, type Command } from '@/features/shortcuts/shortcuts';
import { Kbd } from '@/ui/primitives';
import { getSubtreeIds } from '@/core/model/tree';
import './command.css';

let snapshot: Command[] = [];
let version = 0;
let snapVersion = -1;
function getSnapshot() {
  if (snapVersion !== version) {
    snapshot = getCommands();
    snapVersion = version;
  }
  return snapshot;
}
function subscribe(cb: () => void) {
  return subscribeCommands(() => {
    version++;
    cb();
  });
}

export function installCommandPalette() {
  return registerCommands([
    {
      id: 'app.commandPalette',
      title: 'Command palette',
      group: 'General',
      shortcut: 'Mod+K',
      allowInInput: true,
      run: () => useUI.getState().set({ commandOpen: !useUI.getState().commandOpen }),
    },
    {
      id: 'app.shortcuts',
      title: 'Keyboard shortcuts',
      group: 'General',
      shortcut: 'Mod+/',
      run: () => useUI.getState().set({ shortcutsOpen: true }),
    },
    {
      id: 'app.settings',
      title: 'Settings',
      group: 'General',
      shortcut: 'Mod+,',
      run: () => useUI.getState().set({ settingsOpen: true }),
    },
  ]);
}

export function CommandPalette() {
  const open = useUI((s) => s.commandOpen);
  const route = useUI((s) => s.route);
  const commands = useSyncExternalStore(subscribe, getSnapshot);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const close = () => useUI.getState().set({ commandOpen: false });

  const groups = useMemo(() => {
    const visible = commands.filter((c) => c.id !== 'app.commandPalette' && (!c.when || safeWhen(c)));
    const map = new Map<string, Command[]>();
    for (const c of visible) {
      const g = c.group ?? 'Other';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(c);
    }
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, open]);

  const layers = useMemo(() => {
    if (!open || route !== 'editor' || query.trim().length < 1) return [];
    const doc = useDoc.getState().doc;
    const ui = useUI.getState();
    const page = doc.pages.find((p) => p.id === ui.activePageId) ?? doc.pages[0];
    if (!page) return [];
    return getSubtreeIds(doc.nodes, page.rootId)
      .slice(1)
      .map((id) => doc.nodes[id])
      .filter((n) => n && n.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 12);
  }, [open, query, route]);

  const pages = useDoc((s) => s.doc.pages);

  if (!open) return null;
  return (
    <div className="k-cmdk-overlay" onMouseDown={close}>
      <div className="k-cmdk" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Cmdk label="Command palette" loop>
          <div className="k-cmdk__search">
            <Search />
            <Cmdk.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Type a command or search layers…"
              onKeyDown={(e) => {
                if (e.key === 'Escape') close();
              }}
            />
            <Kbd keys="Esc" />
          </div>
          <Cmdk.List className="k-cmdk__list">
            <Cmdk.Empty className="k-cmdk__empty">No results for “{query}”</Cmdk.Empty>
            {groups.map(([group, cmds]) => (
              <Cmdk.Group key={group} heading={group} className="k-cmdk__group">
                {cmds.map((c) => (
                  <Cmdk.Item
                    key={c.id}
                    value={`${c.title} ${c.group ?? ''} ${(c.keywords ?? []).join(' ')}`}
                    onSelect={() => {
                      close();
                      // let the palette unmount before running (focus-sensitive commands)
                      requestAnimationFrame(() => c.run());
                    }}
                    className="k-cmdk__item"
                  >
                    <span className="k-cmdk__icon">{c.icon}</span>
                    <span className="k-cmdk__title">{c.title}</span>
                    {effectiveShortcut(c) && <Kbd keys={effectiveShortcut(c)!} />}
                  </Cmdk.Item>
                ))}
              </Cmdk.Group>
            ))}
            {route === 'editor' && pages.length > 1 && (
              <Cmdk.Group heading="Pages" className="k-cmdk__group">
                {pages.map((p) => (
                  <Cmdk.Item
                    key={p.id}
                    value={`page ${p.name}`}
                    className="k-cmdk__item"
                    onSelect={() => {
                      close();
                      useUI.getState().set({ activePageId: p.id, editingComponentId: null, selection: [] });
                    }}
                  >
                    <span className="k-cmdk__icon">
                      <FileText />
                    </span>
                    <span className="k-cmdk__title">Go to page “{p.name}”</span>
                  </Cmdk.Item>
                ))}
              </Cmdk.Group>
            )}
            {layers.length > 0 && (
              <Cmdk.Group heading="Layers" className="k-cmdk__group">
                {layers.map((n) => (
                  <Cmdk.Item
                    key={n.id}
                    value={`layer ${n.name} ${n.id}`}
                    className="k-cmdk__item"
                    onSelect={() => {
                      close();
                      useUI.getState().select([n.id]);
                    }}
                  >
                    <span className="k-cmdk__icon">
                      <Layers />
                    </span>
                    <span className="k-cmdk__title">{n.name}</span>
                    <span className="k-cmdk__hint">{n.type}</span>
                  </Cmdk.Item>
                ))}
              </Cmdk.Group>
            )}
          </Cmdk.List>
          <div className="k-cmdk__foot">
            <span>
              <CornerDownLeft /> to run
            </span>
            <span>↑↓ to navigate</span>
          </div>
        </Cmdk>
      </div>
    </div>
  );
}

function safeWhen(c: Command): boolean {
  try {
    return c.when ? c.when() : true;
  } catch {
    return false;
  }
}
