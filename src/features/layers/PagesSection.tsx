/**
 * Pages list at the top of the layers panel: switch, add, rename inline,
 * duplicate, delete (with confirm), drag to reorder, collapsible.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, FileText, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDoc } from '@/core/store/docStore';
import { useUI, uiApi } from '@/core/store/uiStore';
import { addPage, deletePage, duplicatePage, renamePage, reorderPages } from '@/core/store/actions';
import { Button, Dialog, IconButton } from '@/ui/primitives';
import { ContextMenuArea, Dropdown, type MenuEntry } from '@/ui/menu';

const PAGE_H = 28;

function loadCollapsed() {
  try {
    // collapsed by default (one line: "Pages · N  +") so the layer tree gets the space
    const v = localStorage.getItem('kinema.layers.pagesCollapsed');
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function PagesSection() {
  const pages = useDoc((s) => s.doc.pages);
  const activePageId = useUI((s) => s.activePageId);
  const editingComponent = useUI((s) => s.editingComponentId);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const active = editingComponent ? null : (pages.find((p) => p.id === activePageId) ?? pages[0])?.id;

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('kinema.layers.pagesCollapsed', c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const open = (id: string) => uiApi.set({ activePageId: id, editingComponentId: null, selection: [], hoverId: null, editingTextId: null });

  const menu = (id: string): MenuEntry[] => [
    { label: 'Rename', icon: <Pencil />, onSelect: () => setRenaming(id) },
    { label: 'Duplicate', icon: <Copy />, onSelect: () => duplicatePage(id) },
    { type: 'separator' },
    { label: 'Delete', icon: <Trash2 />, danger: true, disabled: pages.length <= 1, onSelect: () => setConfirm(id) },
  ];

  const onPointerDown = (e: React.PointerEvent, index: number, id: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return;
    const startY = e.clientY;
    let moved = false;
    let cur: { from: number; to: number } | null = null;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientY - startY) < 4) return;
      moved = true;
      const rect = listRef.current!.getBoundingClientRect();
      const to = Math.max(0, Math.min(pages.length, Math.round((ev.clientY - rect.top) / PAGE_H)));
      cur = { from: index, to };
      setDrag(cur);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (moved && cur) {
        const to = cur.to > cur.from ? cur.to - 1 : cur.to;
        if (to !== cur.from) reorderPages(cur.from, to);
      } else if (!moved) open(id);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const confirmPage = pages.find((p) => p.id === confirm);

  return (
    <section className="kl-pages" data-collapsed={collapsed ? 'true' : undefined}>
      <div className="kl-pages__head">
        <button className="kl-pages__toggle" onClick={toggle} aria-expanded={!collapsed}>
          <ChevronDown className="kl-pages__chev" />
          Pages
          <span className="kl-pages__count">{pages.length}</span>
        </button>
        <IconButton label="Add page" size="sm" data-action="add-page" onClick={() => addPage()}>
          <Plus />
        </IconButton>
      </div>
      {!collapsed && (
        <div className="kl-pages__list" ref={listRef} role="listbox" aria-label="Pages">
          {pages.map((p, i) => (
            <ContextMenuArea key={p.id} items={() => menu(p.id)}>
              <div
                className="kl-page"
                role="option"
                aria-selected={p.id === active}
                data-active={p.id === active ? 'true' : undefined}
                data-dragging={drag?.from === i ? 'true' : undefined}
                data-drop-before={drag && drag.to === i && drag.from !== i && drag.from !== i - 1 ? 'true' : undefined}
                data-drop-after={drag && i === pages.length - 1 && drag.to === pages.length && drag.from !== i ? 'true' : undefined}
                onPointerDown={(e) => onPointerDown(e, i, p.id)}
                onDoubleClick={() => setRenaming(p.id)}
              >
                <FileText className="kl-page__icon" />
                {renaming === p.id ? (
                  <PageRename
                    initial={p.name}
                    onDone={(v) => {
                      setRenaming(null);
                      if (v != null && v.trim() && v !== p.name) renamePage(p.id, v);
                    }}
                  />
                ) : (
                  <span className="kl-page__name">{p.name}</span>
                )}
                <span className="kl-page__more">
                  <Dropdown
                    items={menu(p.id)}
                    align="end"
                    trigger={
                      <button className="kl-action" aria-label={`Page options for ${p.name}`} onPointerDown={(e) => e.stopPropagation()}>
                        <MoreHorizontal />
                      </button>
                    }
                  />
                </span>
              </div>
            </ContextMenuArea>
          ))}
        </div>
      )}
      <Dialog
        open={!!confirmPage}
        onOpenChange={(v) => !v && setConfirm(null)}
        title={`Delete “${confirmPage?.name ?? ''}”?`}
        description="The page and all of its layers will be removed. You can undo this."
        width={400}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 />}
              onClick={() => {
                if (confirm) deletePage(confirm);
                setConfirm(null);
              }}
            >
              Delete page
            </Button>
          </>
        }
      />
    </section>
  );
}

function PageRename({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const [val, setVal] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <input
      ref={ref}
      className="kl-rename"
      value={val}
      spellCheck={false}
      onChange={(e) => setVal(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(val);
        if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(val)}
    />
  );
}
