/**
 * Layers panel: pages, search, and a virtualized layer tree with selection /
 * hover sync, inline rename, visibility & lock toggles and drag-and-drop.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ChevronRight,
  Columns3,
  Component,
  Eye,
  EyeOff,
  Film,
  Frame,
  Heading,
  Image as ImageIcon,
  LayoutGrid,
  Link,
  ChevronsUpDown,
  Lock,
  LockOpen,
  PenTool,
  RectangleHorizontal,
  Rows3,
  Search,
  Square,
  TextCursorInput,
  Type,
  X,
  Zap,
  ListFilter,
  ChevronsDownUp,
  Group,
} from 'lucide-react';
import type { KNode, NodeId } from '@/core/model/types';
import { useDoc } from '@/core/store/docStore';
import { useUI, uiApi } from '@/core/store/uiStore';
import { renameNode, useCurrentRootId } from '@/core/store/actions';
import { ContextMenuArea, Dropdown } from '@/ui/menu';
import { IconButton } from '@/ui/primitives';
import { runCommand } from '@/features/shortcuts/shortcuts';
import { nodeMenuItems } from '@/features/canvas/nodeMenu';
import { toggleHidden, toggleLocked } from '@/features/canvas/canvasActions';
import { rangeBetween } from '@/features/canvas/selectionRules';
import { useLayers } from './layersStore';
import { LAYER_KINDS, applyLayerDrop, flattenRows, resolveLayerDrop } from './layerOps';
import { PagesSection } from './PagesSection';
import './layers.css';

const ROW_H = 28;
const INDENT = 14;
const OVERSCAN = 8;

export function LayersPanel() {
  return (
    <div className="kl-panel">
      <PagesSection />
      <LayerToolbar />
      <LayerTree />
    </div>
  );
}

/** Search + kind filter + expand/collapse all + group: the Layers header tools. */
function LayerToolbar() {
  const kind = useLayers((s) => s.kind);
  const hasSel = useUI((s) => s.selection.length > 0);
  const rootId = useCurrentRootId();
  const expandAll = () => {
    if (!rootId) return;
    const doc = useDoc.getState().doc;
    const ids: NodeId[] = [];
    const walk = (id: NodeId) => {
      const n = doc.nodes[id];
      if (!n?.children.length) return;
      ids.push(id);
      n.children.forEach(walk);
    };
    walk(rootId);
    useLayers.getState().expandMany(ids);
  };
  return (
    <div className="kl-toolbar">
      <LayerSearch />
      <Dropdown
        align="end"
        items={LAYER_KINDS.map((k) => ({ label: k.label, checked: kind === k.id, onSelect: () => useLayers.getState().set({ kind: k.id }) }))}
        trigger={
          <button className="k-iconbtn k-iconbtn--sm kl-toolbar__btn" aria-label="Filter layers" title="Filter layers by kind" data-active={kind !== 'all' ? 'true' : undefined}>
            <ListFilter />
          </button>
        }
      />
      <IconButton label="Expand all" size="sm" onClick={expandAll}>
        <ChevronsUpDown />
      </IconButton>
      <IconButton label="Collapse all" size="sm" onClick={() => useLayers.getState().set({ expanded: new Set() })}>
        <ChevronsDownUp />
      </IconButton>
      <IconButton label="Group selection" shortcut="Mod+G" size="sm" disabled={!hasSel} onClick={() => runCommand('arrange.group')}>
        <Group />
      </IconButton>
    </div>
  );
}

function LayerSearch() {
  const query = useLayers((s) => s.query);
  return (
    <div className="kl-search">
      <Search className="kl-search__icon" />
      <input
        className="kl-search__input"
        placeholder="Search layers"
        value={query}
        spellCheck={false}
        onChange={(e) => useLayers.getState().set({ query: e.target.value })}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            useLayers.getState().set({ query: '' });
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {query && (
        <button className="kl-search__clear" aria-label="Clear search" onClick={() => useLayers.getState().set({ query: '' })}>
          <X />
        </button>
      )}
    </div>
  );
}

// ─── Tree ───────────────────────────────────────────────────────────────────

function useRows(rootId: NodeId | null): { id: NodeId; depth: number }[] {
  const expanded = useLayers((s) => s.expanded);
  const query = useLayers((s) => s.query);
  const kind = useLayers((s) => s.kind);
  const keys = useDoc(useShallow((s) => (rootId ? flattenRows(s.doc.nodes, rootId, expanded, query, kind) : [])));
  return useMemo(
    () =>
      keys.map((k) => {
        const i = k.lastIndexOf('|');
        return { id: k.slice(0, i), depth: Number(k.slice(i + 1)) };
      }),
    [keys],
  );
}

function LayerTree() {
  const rootId = useCurrentRootId();
  const rows = useRows(rootId);
  const selection = useUI((s) => s.selection);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  const order = useMemo(() => rows.map((r) => r.id), [rows]);
  const orderRef = useRef(order);
  orderRef.current = order;

  // reveal the selection: expand ancestors
  useEffect(() => {
    const doc = useDoc.getState().doc;
    const anc: NodeId[] = [];
    for (const id of selection) {
      let p = doc.nodes[id]?.parent ?? null;
      while (p) {
        anc.push(p);
        p = doc.nodes[p]?.parent ?? null;
      }
    }
    if (anc.length) useLayers.getState().expandMany(anc);
  }, [selection]);

  // scroll the selection into view when it changes
  const lastScrolled = useRef('');
  useLayoutEffect(() => {
    const key = selection.join(',');
    if (!selection.length || key === lastScrolled.current) return;
    const i = order.indexOf(selection[0]);
    const el = scrollRef.current;
    if (i < 0 || !el) return;
    lastScrolled.current = key;
    const y = i * ROW_H;
    if (y < el.scrollTop) el.scrollTop = y - ROW_H;
    else if (y + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = y - el.clientHeight + ROW_H * 2;
  }, [selection, order]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setView({ top: el.scrollTop, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, []);

  const start = Math.max(0, Math.floor(view.top / ROW_H) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((view.top + view.height) / ROW_H) + OVERSCAN);
  const selSet = useMemo(() => new Set(selection), [selection]);
  const doc = useDoc.getState().doc;

  // ── drag & drop ──
  const onRowPointerDown = useCallback((e: React.PointerEvent, id: NodeId) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input')) return;
    const ui = uiApi.state;
    const ls = useLayers.getState();
    const mod = e.ctrlKey || e.metaKey;
    let deferred: NodeId[] | null = null;
    if (mod) ui.select(ui.selection.includes(id) ? ui.selection.filter((x) => x !== id) : [...ui.selection, id]);
    else if (e.shiftKey && ls.anchor) ui.select(rangeBetween(orderRef.current, ls.anchor, id));
    else if (ui.selection.includes(id) && ui.selection.length > 1) deferred = [id];
    else ui.select([id]);
    if (!e.shiftKey) ls.set({ anchor: id });

    const startY = e.clientY;
    const scroller = scrollRef.current!;
    const pointerId = e.pointerId;
    const rootNode = useDoc.getState().doc.pages.find((p) => p.rootId === id);
    let dragging = false;
    let lastY = startY;
    let scrollTimer = 0;
    const dragged = () => {
      const s = uiApi.state.selection;
      const d = useDoc.getState().doc;
      const ids = s.includes(id) ? s : [id];
      return ids.filter((x) => d.nodes[x]?.parent && !d.nodes[x].locked);
    };
    let ids: NodeId[] = [];
    const compute = () => {
      const rect = scroller.getBoundingClientRect();
      const y = lastY - rect.top + scroller.scrollTop;
      const i = Math.max(0, Math.min(orderRef.current.length - 1, Math.floor(y / ROW_H)));
      const overId = orderRef.current[i];
      const f = (y - i * ROW_H) / ROW_H;
      const d = useDoc.getState().doc;
      const rid = useLayers.getState();
      const root = orderRef.current[0];
      const res = overId ? resolveLayerDrop(d.nodes, root, overId, f, ids, rid.expanded) : null;
      useLayers.getState().set({ drop: res ? { id: res.pos === 'inside' ? res.parentId : overId, pos: res.pos } : null });
      return res;
    };
    const autoScroll = () => {
      const rect = scroller.getBoundingClientRect();
      const edge = 28;
      let dy = 0;
      if (lastY < rect.top + edge) dy = -Math.ceil((rect.top + edge - lastY) / 3);
      else if (lastY > rect.bottom - edge) dy = Math.ceil((lastY - rect.bottom + edge) / 3);
      if (dy) {
        scroller.scrollTop += dy;
        compute();
      }
      scrollTimer = requestAnimationFrame(autoScroll);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      lastY = ev.clientY;
      if (!dragging) {
        if (Math.abs(ev.clientY - startY) < 4 || rootNode) return;
        ids = dragged();
        if (!ids.length) return;
        dragging = true;
        deferred = null;
        useLayers.getState().set({ dragging: true });
        scrollTimer = requestAnimationFrame(autoScroll);
      }
      compute();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', key, true);
      cancelAnimationFrame(scrollTimer);
      if (dragging) {
        const res = ev.type === 'pointerup' ? compute() : null;
        useLayers.getState().set({ drop: null, dragging: false });
        if (res) {
          const d = useDoc.getState().doc;
          const sorted = orderRef.current.filter((x) => ids.includes(x));
          const top = sorted.filter((x) => !sorted.some((a) => a !== x && isAncestorOf(d.nodes, a, x)));
          applyLayerDrop(top, res.parentId, res.index);
          uiApi.state.select(top);
        }
      } else if (deferred) uiApi.state.select(deferred);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && dragging) {
        ev.preventDefault();
        ev.stopPropagation();
        dragging = false;
        useLayers.getState().set({ drop: null, dragging: false });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', key, true);
  }, []);

  if (!rootId) return null;
  const visible = rows.slice(start, end);
  return (
    <ContextMenuArea items={nodeMenuItems}>
      <div
        ref={scrollRef}
        className="kl-tree"
        role="tree"
        tabIndex={0}
        onKeyDown={(e) => onTreeKey(e, orderRef.current, rootId)}
        aria-label="Layers"
        onPointerLeave={() => !useLayers.getState().dragging && uiApi.state.setHover(null)}
      >
        <div className="kl-tree__inner" style={{ height: rows.length * ROW_H }}>
          {visible.map((r, k) => {
            const i = start + k;
            let childOfSelected = false;
            if (!selSet.has(r.id) && selSet.size) {
              let p = doc.nodes[r.id]?.parent ?? null;
              while (p) {
                if (selSet.has(p)) {
                  childOfSelected = p !== rootId;
                  break;
                }
                p = doc.nodes[p]?.parent ?? null;
              }
            }
            return <LayerRow key={r.id} id={r.id} depth={r.depth} top={i * ROW_H} isRoot={r.id === rootId} childOfSelected={childOfSelected} onPointerDown={onRowPointerDown} />;
          })}
        </div>
      </div>
    </ContextMenuArea>
  );
}

/**
 * Keyboard navigation (Figma/Photoshop-style): ↑/↓ move the selection through the
 * visible rows (Shift extends), ← collapses or goes to the parent, → expands or goes
 * to the first child, F2 / Enter renames. Other keys fall through to global shortcuts.
 */
function onTreeKey(e: React.KeyboardEvent, order: NodeId[], rootId: NodeId | null) {
  if (useLayers.getState().renaming) return;
  const ui = uiApi.state;
  const doc = useDoc.getState().doc;
  const cur = ui.selection[ui.selection.length - 1] ?? null;
  const visible = order.filter((id) => id !== rootId);
  const select = (id: NodeId | undefined, extend = false) => {
    if (!id || id === rootId) return;
    e.preventDefault();
    e.stopPropagation();
    if (extend) ui.select([...ui.selection.filter((x) => x !== id), id]);
    else ui.select([id]);
    useLayers.getState().set({ anchor: id });
  };
  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      const i = cur ? visible.indexOf(cur) : -1;
      const next = e.key === 'ArrowDown' ? visible[Math.min(visible.length - 1, i + 1)] : visible[Math.max(0, i < 0 ? 0 : i - 1)];
      select(next, e.shiftKey);
      return;
    }
    case 'ArrowLeft': {
      if (!cur) return;
      const n = doc.nodes[cur];
      if (n?.children.length && useLayers.getState().expanded.has(cur)) {
        e.preventDefault();
        e.stopPropagation();
        useLayers.getState().setExpanded(cur, false);
      } else select(n?.parent ?? undefined);
      return;
    }
    case 'ArrowRight': {
      if (!cur) return;
      const n = doc.nodes[cur];
      if (!n?.children.length) return;
      if (!useLayers.getState().expanded.has(cur)) {
        e.preventDefault();
        e.stopPropagation();
        useLayers.getState().setExpanded(cur, true);
      } else select(n.children[0]);
      return;
    }
    case 'F2':
    case 'Enter':
      if (cur && ui.selection.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        useLayers.getState().set({ renaming: cur });
      }
      return;
  }
}

function isAncestorOf(nodes: Record<NodeId, KNode>, a: NodeId, b: NodeId) {
  let p = nodes[b]?.parent ?? null;
  while (p) {
    if (p === a) return true;
    p = nodes[p]?.parent ?? null;
  }
  return false;
}

// ─── Row ────────────────────────────────────────────────────────────────────

function typeIcon(n: KNode) {
  const st = n.styles.base;
  switch (n.type) {
    case 'frame':
      return <Frame />;
    case 'box': {
      const d = st.display ?? '';
      if (d.includes('grid')) return <LayoutGrid />;
      if (d.includes('flex')) return (st['flex-direction'] ?? 'row').startsWith('column') ? <Rows3 /> : <Columns3 />;
      return <Square />;
    }
    case 'text':
      return /^h[1-6]$/.test(n.tag ?? '') ? <Heading /> : <Type />;
    case 'button':
      return <RectangleHorizontal />;
    case 'link':
      return <Link />;
    case 'image':
      return <ImageIcon />;
    case 'svg':
      return <PenTool />;
    case 'input':
    case 'textarea':
      return <TextCursorInput />;
    case 'select':
      return <ChevronsUpDown />;
    case 'video':
      return <Film />;
    case 'instance':
      return <Component />;
  }
}

interface RowProps {
  id: NodeId;
  depth: number;
  top: number;
  isRoot: boolean;
  childOfSelected: boolean;
  onPointerDown: (e: React.PointerEvent, id: NodeId) => void;
}

const LayerRow = memo(function LayerRow({ id, depth, top, isRoot, childOfSelected, onPointerDown }: RowProps) {
  const node = useDoc((s) => s.doc.nodes[id]);
  const selected = useUI((s) => s.selection.includes(id));
  const hovered = useUI((s) => s.hoverId === id);
  const expanded = useLayers((s) => isRoot || !!s.query || s.expanded.has(id));
  const drop = useLayers((s) => (s.drop?.id === id ? s.drop.pos : null));
  const renaming = useLayers((s) => s.renaming === id);
  if (!node) return null;
  const hasKids = node.children.length > 0;
  const animated = !!node.animations?.some((a) => a.enabled !== false);

  return (
    <div
      className="kl-row"
      role="treeitem"
      aria-selected={selected}
      aria-expanded={hasKids ? expanded : undefined}
      data-id={id}
      data-selected={selected ? 'true' : undefined}
      data-child-selected={childOfSelected ? 'true' : undefined}
      data-hover={hovered && !selected ? 'true' : undefined}
      data-hidden={node.hidden ? 'true' : undefined}
      data-locked={node.locked ? 'true' : undefined}
      data-instance={node.type === 'instance' ? 'true' : undefined}
      data-root={isRoot ? 'true' : undefined}
      data-drop={drop ?? undefined}
      style={{ top, height: ROW_H, ['--depth' as string]: depth, ['--indent' as string]: `${depth * INDENT}px` }}
      onPointerDown={(e) => onPointerDown(e, id)}
      onPointerEnter={() => !useLayers.getState().dragging && uiApi.state.setHover(id)}
      onContextMenu={() => {
        if (!uiApi.state.selection.includes(id)) uiApi.state.select([id]);
      }}
    >
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="kl-guide" style={{ left: 14 + i * INDENT }} />
      ))}
      <span className="kl-indent" />
      <button
        className="kl-chevron"
        data-open={expanded ? 'true' : undefined}
        tabIndex={-1}
        aria-label={expanded ? 'Collapse' : 'Expand'}
        style={{ visibility: hasKids && !isRoot ? 'visible' : 'hidden' }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          const open = !expanded;
          const ls = useLayers.getState();
          if (e.altKey) {
            const doc = useDoc.getState().doc;
            const all: NodeId[] = [];
            const stack = [id];
            while (stack.length) {
              const x = stack.pop()!;
              all.push(x);
              stack.push(...(doc.nodes[x]?.children ?? []));
            }
            const next = new Set(ls.expanded);
            all.forEach((x) => (open ? next.add(x) : next.delete(x)));
            ls.set({ expanded: next });
          } else ls.setExpanded(id, open);
        }}
      >
        <ChevronRight />
      </button>
      <span className="kl-icon">{typeIcon(node)}</span>
      {renaming ? (
        <RenameInput id={id} initial={node.name} />
      ) : (
        <span
          className="kl-name"
          onDoubleClick={(e) => {
            e.stopPropagation();
            useLayers.getState().set({ renaming: id });
          }}
        >
          {node.name}
        </span>
      )}
      {animated && (
        <span className="kl-anim" title="Has animations">
          <Zap />
        </span>
      )}
      {!isRoot && (
        <span className="kl-actions">
          <button
            className="kl-action"
            data-action="lock"
            data-on={node.locked ? 'true' : undefined}
            tabIndex={-1}
            aria-label={node.locked ? 'Unlock' : 'Lock'}
            title={node.locked ? 'Unlock' : 'Lock'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggleLocked([id]);
            }}
          >
            {node.locked ? <Lock /> : <LockOpen />}
          </button>
          <button
            className="kl-action"
            data-action="hide"
            data-on={node.hidden ? 'true' : undefined}
            tabIndex={-1}
            aria-label={node.hidden ? 'Show' : 'Hide'}
            title={node.hidden ? 'Show' : 'Hide'}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggleHidden([id]);
            }}
          >
            {node.hidden ? <EyeOff /> : <Eye />}
          </button>
        </span>
      )}
    </div>
  );
});

function RenameInput({ id, initial }: { id: NodeId; initial: string }) {
  const [val, setVal] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit && val.trim() && val !== initial) renameNode(id, val);
    useLayers.getState().set({ renaming: null });
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
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      }}
      onBlur={() => finish(true)}
    />
  );
}
