/**
 * History: every undoable step of this session, oldest first — click one to jump
 * straight back (or forward) to it. Undone steps stay listed (dimmed) until a new
 * change replaces them, exactly like Undo/Redo.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { History, Sparkles, FolderOpen } from 'lucide-react';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { IconButton, Popover } from '@/ui/primitives';
import { registerCommands } from '@/features/shortcuts/shortcuts';
import './history.css';

const useHistoryMenu = create<{ open: boolean }>(() => ({ open: false }));

export function openHistory() {
  useHistoryMenu.setState({ open: true });
}

function ago(t: number, now: number) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function HistoryList() {
  const past = useDoc((s) => s.past);
  const future = useDoc((s) => s.future);
  const listRef = useRef<HTMLOListElement>(null);
  const [now] = useState(() => Date.now());
  const rows = [...past, ...future];
  const current = past.length; // number of applied steps

  useLayoutEffect(() => {
    listRef.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'nearest' });
  }, []);

  return (
    <div className="k-history" data-testid="history">
      <div className="k-history__head">
        History <span className="k-muted">· {past.length} step{past.length === 1 ? '' : 's'}{future.length ? `, ${future.length} undone` : ''}</span>
      </div>
      <ol ref={listRef} className="k-history__list" role="listbox" aria-label="Undo history">
        <li>
          <button role="option" aria-selected={current === 0} data-current={current === 0 || undefined} onClick={() => useDoc.getState().goToHistory(0)}>
            <FolderOpen />
            <span className="k-history__label">Opened project</span>
          </button>
        </li>
        {rows.map((e, i) => {
          const n = i + 1;
          const undone = n > current;
          return (
            <li key={e.id}>
              <button role="option" aria-selected={n === current} data-current={n === current || undefined} data-undone={undone || undefined} onClick={() => useDoc.getState().goToHistory(n)} title={undone ? 'Redo up to here' : 'Go back to here'}>
                {e.ai ? <Sparkles className="k-history__ai" /> : <span className="k-history__dot" />}
                <span className="k-history__label">{e.label}</span>
                <span className="k-history__time">{ago(e.time, now)}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="k-history__foot">Click a step to jump to it · Ctrl+Z / Ctrl+Shift+Z step one at a time</div>
    </div>
  );
}

export function HistoryButton() {
  const open = useHistoryMenu((s) => s.open);
  const hasAny = useDoc((s) => s.past.length + s.future.length > 0);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => useHistoryMenu.setState({ open: o })}
      side="bottom"
      align="end"
      width={300}
      trigger={
        <IconButton label="History" disabled={!hasAny} tooltipSide="bottom" data-testid="history-button">
          <History />
        </IconButton>
      }
    >
      <HistoryList />
    </Popover>
  );
}

export function installHistory() {
  const off = registerCommands([
    {
      id: 'edit.history',
      title: 'Show history',
      group: 'Edit',
      icon: <History />,
      keywords: ['undo', 'steps', 'revert'],
      when: () => useUI.getState().route === 'editor',
      run: openHistory,
    },
  ]);
  return off;
}
