/**
 * The Library: one obvious, browsable home for everything you can add — complete
 * sections, components, icons, animations, your uploads and your personal library.
 * Large live previews, categories, search across everything, click or drag to add.
 */
import { memo, useDeferredValue, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { ArrowLeft, Search, X, LayoutTemplate, Component, Shapes, Zap, Upload, BookMarked, ChevronRight } from 'lucide-react';
import { CATALOG, CATALOG_CATEGORIES, searchCatalog, type CatalogCategoryId, type CatalogItem } from '@/core/catalog';
import { startDrag, endDrag } from '@/core/dnd';
import { useUI, type LibraryView } from '@/core/store/uiStore';
import { useDoc } from '@/core/store/docStore';
import { useLibrary } from '@/features/library/libraryStore';
import { PRESETS, searchPresets } from '@/core/anim/presets';
import { ItemPreview, measureItem } from '@/features/insert/ItemPreview';
import { buildItem, dragChip, insertCatalogItem, iconSubtree, insertIcon } from '@/features/insert/InsertPanel';
import { allIcons, type IconEntry } from '@/features/insert/iconSet';
import { AssetsPanel } from '@/features/assets/AssetsPanel';
import { LibraryPanel } from '@/features/library/LibraryPanel';
import { PresetBrowser, PresetThumb } from '@/features/animation/PresetBrowser';
import { EmptyState } from '@/ui/primitives';
import './library-browser.css';

const SECTION_CATS: CatalogCategoryId[] = ['hero', 'navigation', 'content', 'cards', 'forms', 'feedback', 'data'];
const COMPONENT_CATS: CatalogCategoryId[] = ['basics', 'layout'];

const VIEWS: { id: Exclude<LibraryView, 'home'>; label: string; hint: string; icon: ReactNode }[] = [
  { id: 'sections', label: 'Sections', hint: 'Complete, responsive page sections', icon: <LayoutTemplate /> },
  { id: 'components', label: 'Components', hint: 'Buttons, inputs, cards, layout blocks', icon: <Component /> },
  { id: 'icons', label: 'Icons', hint: '1,500+ crisp line icons', icon: <Shapes /> },
  { id: 'animations', label: 'Animations', hint: 'Drop motion onto anything', icon: <Zap /> },
  { id: 'uploads', label: 'Uploads', hint: 'Your images, SVGs, fonts, video', icon: <Upload /> },
  { id: 'mine', label: 'My library', hint: 'Saved across all projects', icon: <BookMarked /> },
];

function setView(v: LibraryView) {
  useUI.getState().set({ libraryView: v });
}

// ─── Catalog cards ──────────────────────────────────────────────────────────

const CatalogCard = memo(function CatalogCard({ item, large }: { item: CatalogItem; large?: boolean }) {
  const onDragStart = (e: DragEvent) => startDrag(e, { type: 'nodes', label: item.name, build: () => buildItem(item), size: measureItem(item) }, dragChip(item.name));
  return (
    <button
      type="button"
      className="k-lib__card"
      data-large={large ? 'true' : undefined}
      draggable
      onDragStart={onDragStart}
      onDragEnd={endDrag}
      onClick={() => insertCatalogItem(item)}
      title={`${item.name} — click to add, or drag onto the canvas`}
    >
      <div className="k-lib__preview">
        <ItemPreview item={item} height={large ? 168 : 112} fitAspect={large} />
      </div>
      <div className="k-lib__cardname">{item.name}</div>
    </button>
  );
});

function CatalogGrid({ cats, large }: { cats: CatalogCategoryId[]; large?: boolean }) {
  const [cat, setCat] = useState<CatalogCategoryId | 'all'>('all');
  const items = useMemo(() => CATALOG.filter((i) => (cat === 'all' ? cats.includes(i.category) : i.category === cat)), [cat, cats]);
  return (
    <>
      <div className="k-lib__chips">
        <button className="k-lib__chip" data-on={cat === 'all' ? 'true' : undefined} onClick={() => setCat('all')}>
          All
        </button>
        {CATALOG_CATEGORIES.filter((c) => cats.includes(c.id)).map((c) => (
          <button key={c.id} className="k-lib__chip" data-on={cat === c.id ? 'true' : undefined} onClick={() => setCat(c.id)} title={c.description}>
            {c.label}
          </button>
        ))}
      </div>
      {cats.filter((c) => cat === 'all' || c === cat).map((c) => {
        const list = items.filter((i) => i.category === c);
        if (!list.length) return null;
        const meta = CATALOG_CATEGORIES.find((x) => x.id === c)!;
        return (
          <section key={c} className="k-lib__group">
            <h4 className="k-lib__grouphead">
              {meta.label}
              <span>{list.length}</span>
            </h4>
            <div className="k-lib__grid" data-cols={large ? 1 : 2}>
              {list.map((i) => (
                <CatalogCard key={i.id} item={i} large={large} />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────────

const IconCell = memo(function IconCell({ entry }: { entry: IconEntry }) {
  const C = entry.Comp;
  return (
    <button
      type="button"
      className="k-lib__icon"
      title={entry.label}
      draggable
      onDragStart={(e) => startDrag(e, { type: 'nodes', label: entry.label, build: () => iconSubtree(entry), size: { w: 48, h: 48 } }, dragChip(entry.label))}
      onDragEnd={endDrag}
      onClick={() => insertIcon(entry)}
    >
      <C size={20} strokeWidth={1.75} />
    </button>
  );
});

function IconsView({ query }: { query: string }) {
  const [limit, setLimit] = useState(240);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = allIcons();
    return q ? all.filter((i) => i.label.includes(q)) : all;
  }, [query]);
  if (!list.length) return <EmptyState title="No icons found">Try a different word.</EmptyState>;
  return (
    <>
      <div className="k-lib__icons">
        {list.slice(0, limit).map((e) => (
          <IconCell key={e.name} entry={e} />
        ))}
      </div>
      {list.length > limit && (
        <button className="k-btn k-btn--ghost k-btn--block" onClick={() => setLimit((l) => l + 480)}>
          Show more icons ({list.length - limit})
        </button>
      )}
    </>
  );
}

// ─── Home ───────────────────────────────────────────────────────────────────

function HomeTile({ id, label, hint, icon, count, preview }: { id: Exclude<LibraryView, 'home'>; label: string; hint: string; icon: ReactNode; count?: number; preview?: ReactNode }) {
  return (
    <button type="button" className="k-lib__tile" data-view={id} onClick={() => setView(id)}>
      <div className="k-lib__tilepreview">{preview}</div>
      <div className="k-lib__tilebody">
        <span className="k-lib__tileicon">{icon}</span>
        <span className="k-lib__tiletext">
          <b>{label}</b>
          <small>{hint}</small>
        </span>
        {count != null && <span className="k-lib__count">{count}</span>}
        <ChevronRight className="k-lib__tilechev" />
      </div>
    </button>
  );
}

function Home() {
  const assets = useDoc((s) => Object.keys(s.doc.assets).length);
  const mine = useLibrary((s) => s.items.length);
  const hero = CATALOG.find((i) => i.category === 'hero');
  const button = CATALOG.find((i) => i.id.includes('button')) ?? CATALOG[0];
  const counts: Partial<Record<string, number>> = {
    sections: CATALOG.filter((i) => SECTION_CATS.includes(i.category)).length,
    components: CATALOG.filter((i) => COMPONENT_CATS.includes(i.category)).length,
    icons: allIcons().length,
    animations: PRESETS.length,
    uploads: assets,
    mine,
  };
  const previews: Partial<Record<string, ReactNode>> = {
    sections: hero ? (
      <div className="k-lib__tilecatalog">
        <ItemPreview item={hero} height={82} />
      </div>
    ) : null,
    components: button ? (
      <div className="k-lib__tilecatalog">
        <ItemPreview item={button} height={82} />
      </div>
    ) : null,
    icons: (
      <div className="k-lib__iconpeek">
        {allIcons()
          .filter((i) => ['sparkles', 'heart', 'zap', 'camera', 'music', 'rocket', 'star', 'globe', 'bell', 'leaf'].includes(i.label))
          .map((i) => (
            <i.Comp key={i.name} size={22} strokeWidth={1.6} />
          ))}
      </div>
    ),
    animations: (
      <div className="k-lib__animpeek">
        {PRESETS.filter((p) => ['fade-up', 'pop', 'float', 'pulse'].includes(p.id)).map((p) => (
          <PresetThumb key={p.id} preset={p} />
        ))}
      </div>
    ),
  };
  return (
    <div className="k-lib__home">
      {VIEWS.map((v) => (
        <HomeTile key={v.id} {...v} count={counts[v.id]} preview={previews[v.id]} />
      ))}
    </div>
  );
}

// ─── Search across everything ───────────────────────────────────────────────

function SearchResults({ query }: { query: string }) {
  const items = useMemo(() => searchCatalog(query).slice(0, 24), [query]);
  const icons = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allIcons().filter((i) => i.label.includes(q)).slice(0, 30);
  }, [query]);
  const anims = useMemo(() => searchPresets(query).slice(0, 8), [query]);
  if (!items.length && !icons.length && !anims.length) return <EmptyState title="Nothing found">Try “hero”, “pricing”, “button”, “fade” or an icon name.</EmptyState>;
  return (
    <>
      {items.length > 0 && (
        <section className="k-lib__group">
          <h4 className="k-lib__grouphead">
            Sections & components<span>{items.length}</span>
          </h4>
          <div className="k-lib__grid" data-cols={2}>
            {items.map((i) => (
              <CatalogCard key={i.id} item={i} />
            ))}
          </div>
        </section>
      )}
      {anims.length > 0 && (
        <section className="k-lib__group">
          <h4 className="k-lib__grouphead">
            Animations<span>{anims.length}</span>
            <button className="k-lib__more" onClick={() => setView('animations')}>
              Browse all
            </button>
          </h4>
          <div className="k-lib__animrow">
            {anims.map((p) => (
              <div key={p.id} className="k-lib__animitem" title={`${p.name} — open Animations to apply`}>
                <PresetThumb preset={p} />
                <span>{p.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {icons.length > 0 && (
        <section className="k-lib__group">
          <h4 className="k-lib__grouphead">
            Icons<span>{icons.length}</span>
          </h4>
          <div className="k-lib__icons">
            {icons.map((e) => (
              <IconCell key={e.name} entry={e} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ─── Browser ────────────────────────────────────────────────────────────────

export function LibraryBrowser() {
  const view = useUI((s) => s.libraryView);
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query);
  const current = VIEWS.find((v) => v.id === view);
  const searching = q.trim().length > 0 && view !== 'uploads' && view !== 'mine' && view !== 'animations';

  return (
    <div className="k-lib" data-view={view}>
      <div className="k-lib__head">
        {view !== 'home' ? (
          <button className="k-lib__back" onClick={() => setView('home')} aria-label="Back to library home">
            <ArrowLeft />
            <span>{current?.label}</span>
          </button>
        ) : (
          <span className="k-lib__title">Library</span>
        )}
      </div>
      {(view === 'home' || view === 'sections' || view === 'components' || view === 'icons') && (
        <label className="k-lib__search">
          <Search />
          <input
            value={query}
            placeholder={view === 'icons' ? 'Search 1,500+ icons…' : 'Search sections, components, icons, animations…'}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') setQuery('');
            }}
            spellCheck={false}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search">
              <X />
            </button>
          )}
        </label>
      )}
      <div className="k-lib__body" data-embedded={view === 'uploads' || view === 'mine' || view === 'animations' ? 'true' : undefined}>
        {view === 'icons' ? (
          <IconsView query={q} />
        ) : searching ? (
          <SearchResults query={q} />
        ) : view === 'home' ? (
          <Home />
        ) : view === 'sections' ? (
          <CatalogGrid cats={SECTION_CATS} large />
        ) : view === 'components' ? (
          <CatalogGrid cats={COMPONENT_CATS} />
        ) : view === 'animations' ? (
          <PresetBrowser />
        ) : view === 'uploads' ? (
          <AssetsPanel />
        ) : (
          <LibraryPanel />
        )}
      </div>
    </div>
  );
}
