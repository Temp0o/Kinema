import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { LayoutGrid, Search, Shapes, SearchX, X } from 'lucide-react';
import { CATALOG, CATALOG_CATEGORIES, buildCatalogItem, getCatalogItem, searchCatalog, type CatalogCategoryId, type CatalogItem } from '@/core/catalog';
import { endDrag, startDrag } from '@/core/dnd';
import { docApi } from '@/core/store/docStore';
import { createNode } from '@/core/model/factory';
import { EmptyState, Segmented, TextInput } from '@/ui/primitives';
import { ItemPreview, measureItem } from './ItemPreview';
import { insertSubtrees, type Subtree } from './placement';
import { useInsertStore } from './insertStore';
import { allIcons, iconSvgMarkup, type IconEntry } from './iconSet';
import './insert.css';

type Mode = 'components' | 'icons';

// ─── Drag preview ────────────────────────────────────────────────────────────

export function dragChip(label: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'k-dragchip k-app';
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`;
  const span = document.createElement('span');
  span.textContent = label;
  el.appendChild(span);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 0);
  return el;
}

// ─── Item building ───────────────────────────────────────────────────────────

export function buildItem(item: CatalogItem): Subtree {
  return buildCatalogItem(item, docApi.doc);
}

export function iconSubtree(entry: IconEntry): Subtree {
  const node = createNode('svg', {
    name: (() => {
      const w = entry.label.split(' ')[0].replace(/-/g, ' ');
      return w.charAt(0).toUpperCase() + w.slice(1);
    })(),
    props: { svg: iconSvgMarkup(entry) },
    replaceStyles: true,
    styles: { display: 'block', width: '48px', height: '48px', color: 'var(--k-text)' },
  });
  return { rootId: node.id, nodes: { [node.id]: node } };
}

export function insertCatalogItem(item: CatalogItem) {
  const size = measureItem(item);
  insertSubtrees([{ sub: buildItem(item), size }], { label: `Insert ${item.name}` });
  useInsertStore.getState().push({ kind: 'item', id: item.id });
}

export function insertIcon(entry: IconEntry) {
  insertSubtrees([{ sub: iconSubtree(entry), size: { w: 48, h: 48 } }], { label: `Insert ${entry.name} icon` });
  useInsertStore.getState().push({ kind: 'icon', id: entry.name });
}

// ─── Cards ───────────────────────────────────────────────────────────────────

const ItemCard = memo(function ItemCard({ item, previewHeight = 112 }: { item: CatalogItem; previewHeight?: number }) {
  const onDragStart = (e: DragEvent) => {
    const size = measureItem(item);
    startDrag(e, { type: 'nodes', label: item.name, size: { w: size.w, h: size.h }, build: () => buildItem(item) }, dragChip(item.name));
    useInsertStore.getState().push({ kind: 'item', id: item.id });
  };
  return (
    <button
      type="button"
      className="k-card"
      draggable
      title={`${item.name} — click to insert, or drag onto the canvas`}
      aria-label={`Insert ${item.name}`}
      data-item={item.id}
      data-wide={(item.width ?? 0) >= 600 ? 'true' : undefined}
      onClick={() => insertCatalogItem(item)}
      onDragStart={onDragStart}
      onDragEnd={endDrag}
    >
      <ItemPreview item={item} height={previewHeight} fitAspect={(item.width ?? 0) >= 600 && previewHeight > 64} />
      <span className="k-card__name">{item.name}</span>
    </button>
  );
});

// ─── Icons tab (virtualized) ─────────────────────────────────────────────────

const CELL = 44;

function iconMatches(q: string, list: IconEntry[]): IconEntry[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((i) => words.every((w) => i.label.includes(w)));
}

function IconGrid({ query, scrollRef }: { query: string; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const all = useMemo(() => allIcons(), []);
  const list = useMemo(() => iconMatches(query, all), [query, all]);
  const [view, setView] = useState({ top: 0, h: 600, w: 260 });
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const update = () => {
      const wrap = wrapRef.current;
      const rel = wrap ? sc.getBoundingClientRect().top - wrap.getBoundingClientRect().top : sc.scrollTop;
      setView({ top: Math.max(0, rel), h: sc.clientHeight, w: sc.clientWidth - 24 });
    };
    update();
    sc.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(sc);
    return () => {
      sc.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [scrollRef]);

  useEffect(() => {
    const sc = scrollRef.current;
    if (sc) sc.scrollTop = 0;
  }, [query, scrollRef]);

  const cols = Math.max(3, Math.floor(view.w / CELL));
  const rows = Math.ceil(list.length / cols);
  const first = Math.max(0, Math.floor(view.top / CELL) - 3);
  const last = Math.min(rows, Math.ceil((view.top + view.h) / CELL) + 3);
  const slice = list.slice(first * cols, last * cols);

  if (!list.length)
    return (
      <div className="k-ins__empty">
        <EmptyState icon={<SearchX />} title="No icons found">
          Try a different word, like “arrow” or “user”.
        </EmptyState>
      </div>
    );

  return (
    <div ref={wrapRef} className="k-icons" style={{ height: rows * CELL }} role="list" aria-label="Icons">
      <div style={{ position: 'absolute', left: 0, right: 0, top: first * CELL, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: CELL }}>
        {slice.map((entry) => (
          <button
            key={entry.name}
            type="button"
            role="listitem"
            className="k-icon-cell"
            draggable
            title={`${entry.name} — click to insert, or drag onto the canvas`}
            aria-label={`Insert ${entry.name} icon`}
            onClick={() => insertIcon(entry)}
            onDragStart={(e) => {
              startDrag(e, { type: 'nodes', label: entry.name, size: { w: 48, h: 48 }, build: () => iconSubtree(entry) }, dragChip(entry.name));
              useInsertStore.getState().push({ kind: 'icon', id: entry.name });
            }}
            onDragEnd={endDrag}
          >
            <entry.Comp />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function InsertPanel() {
  const [mode, setMode] = useState<Mode>('components');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CatalogCategoryId | 'all'>('all');
  const deferredQuery = useDeferredValue(query);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recent = useInsertStore((s) => s.recent);

  const sections = useMemo(() => {
    const searching = deferredQuery.trim().length > 0;
    if (searching) {
      const pool = category === 'all' ? CATALOG : CATALOG.filter((i) => i.category === category);
      const hits = searchCatalog(deferredQuery, pool);
      return hits.length ? [{ id: 'results', label: 'Results', items: hits }] : [];
    }
    return CATALOG_CATEGORIES.filter((c) => category === 'all' || c.id === category)
      .map((c) => ({ id: c.id as string, label: c.label, items: CATALOG.filter((i) => i.category === c.id) }))
      .filter((s) => s.items.length);
  }, [deferredQuery, category]);

  const recentItems = useMemo(
    () => recent.filter((r) => r.kind === 'item').map((r) => getCatalogItem(r.id)).filter((i): i is CatalogItem => !!i).slice(0, 8),
    [recent],
  );
  const recentIcons = useMemo(() => {
    const all = allIcons();
    return recent
      .filter((r) => r.kind === 'icon')
      .map((r) => all.find((i) => i.name === r.id))
      .filter((i): i is IconEntry => !!i)
      .slice(0, 8);
  }, [recent]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && query) {
      e.stopPropagation();
      setQuery('');
    }
  }, [query]);

  return (
    <div className="k-ins" onKeyDown={onKeyDown}>
      <div className="k-ins__top">
        <Segmented<Mode>
          className="k-ins__modes"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'components', label: 'Components', icon: <LayoutGrid /> },
            { value: 'icons', label: 'Icons', icon: <Shapes /> },
          ]}
        />
        <TextInput
          value={query}
          onChange={setQuery}
          icon={<Search />}
          placeholder={mode === 'icons' ? 'Search icons…' : 'Search components…'}
          aria-label={mode === 'icons' ? 'Search icons' : 'Search components'}
          suffix={
            query ? (
              <button type="button" className="k-iconbtn k-iconbtn--sm" aria-label="Clear search" onClick={() => setQuery('')}>
                <X />
              </button>
            ) : undefined
          }
        />
        {mode === 'components' && (
          <div className="k-ins__chips" role="group" aria-label="Categories">
            <button type="button" className="k-chip" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
              All
            </button>
            {CATALOG_CATEGORIES.map((c) => (
              <button key={c.id} type="button" className="k-chip" title={c.description} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="k-ins__scroll" ref={scrollRef}>
        {mode === 'components' ? (
          <>
            {!query && category === 'all' && recentItems.length > 0 && (
              <div className="k-ins__section">
                <div className="k-ins__head">
                  <span className="k-ins__title">Recently used</span>
                </div>
                <div className="k-recent">
                  {recentItems.map((item) => (
                    <ItemCard key={item.id} item={item} previewHeight={64} />
                  ))}
                </div>
              </div>
            )}
            {sections.map((s) => (
              <section className="k-ins__section" key={s.id} aria-label={s.label}>
                <div className="k-ins__head">
                  <span className="k-ins__title">{s.label}</span>
                  <span className="k-ins__count">{s.items.length}</span>
                </div>
                <div className="k-ins__grid">
                  {s.items.map((item) => (
                    <ItemCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            ))}
            {!sections.length && (
              <div className="k-ins__empty">
                <EmptyState icon={<SearchX />} title="Nothing matches">
                  No components found for “{query}”. Try “card”, “nav” or “form”.
                </EmptyState>
              </div>
            )}
          </>
        ) : (
          <>
            {!query && recentIcons.length > 0 && (
              <div className="k-ins__section">
                <div className="k-ins__head">
                  <span className="k-ins__title">Recently used</span>
                </div>
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {recentIcons.map((entry) => (
                    <button key={entry.name} type="button" className="k-icon-cell" style={{ width: CELL, height: CELL }} title={entry.name} aria-label={`Insert ${entry.name} icon`} onClick={() => insertIcon(entry)}>
                      <entry.Comp />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="k-ins__section">
              <div className="k-ins__head">
                <span className="k-ins__title">Lucide icons</span>
                <span className="k-ins__count">{iconMatches(deferredQuery, allIcons()).length}</span>
              </div>
              <IconGrid query={deferredQuery} scrollRef={scrollRef} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

