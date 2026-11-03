/**
 * Left-panel "Library" tab: this project's components + the global personal
 * library (components, animations, SVGs, images, palettes, styles).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  BookMarked,
  ChevronDown,
  Copy,
  Download,
  FileUp,
  Folder,
  FolderPlus,
  FolderInput,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Star,
  Tag,
  Trash2,
  Component as ComponentIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { startDrag, endDrag } from '@/core/dnd';
import type { KAnimation, KNode, LibraryItem, LibraryItemKind, StyleMap } from '@/core/model/types';
import { Button, Dialog, IconButton, TextInput } from '@/ui/primitives';
import { ContextMenuArea, Dropdown, type MenuEntry } from '@/ui/menu';
import { buildInstanceSubtree, deleteComponent, editComponent, insertInstance, renameComponent } from '@/features/components/componentActions';
import { listInstances } from '@/features/components/componentModel';
import { buildItemNodes, freshAnimation, itemSizeHint, useLibraryItem } from './libraryItems';
import {
  KIND_LABEL,
  createFolder,
  deleteFolder,
  duplicateItem,
  ensureLibraryLoaded,
  moveItems,
  removeItems,
  renameFolder,
  setItemTags,
  toggleFavorite,
  updateItem,
  useLibrary,
} from './libraryStore';
import { exportItems, importPackFromPicker } from './libraryPack';
import { saveAnimationToLibrary, saveComponentToLibrary, savePaletteToLibrary, saveSelectionToLibrary, saveStyleToLibrary } from './libraryCommands';
import { ItemPreview, KIND_ICON } from './ItemPreview';
import { TagsEditor } from './SaveToLibraryDialog';
import './library.css';

type KindFilter = 'all' | LibraryItemKind;
const KIND_FILTERS: { id: KindFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'component', label: 'Components' },
  { id: 'animation', label: 'Animations' },
  { id: 'svg', label: 'SVG' },
  { id: 'image', label: 'Images' },
  { id: 'palette', label: 'Palettes' },
  { id: 'style', label: 'Styles' },
];

type DialogState =
  | { type: 'rename'; item: LibraryItem }
  | { type: 'tags'; item: LibraryItem }
  | { type: 'folder-new'; moveIds?: string[] }
  | { type: 'folder-rename'; name: string }
  | { type: 'delete-items'; ids: string[] }
  | { type: 'delete-folder'; name: string }
  | { type: 'delete-component'; id: string }
  | { type: 'rename-component'; id: string }
  | null;

function PromptDialog({
  open,
  title,
  label,
  initial,
  confirm,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  initial: string;
  confirm: string;
  onClose: () => void;
  onSubmit: (v: string) => void;
}) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    if (open) setV(initial);
  }, [open, initial]);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      width={380}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!v.trim()} onClick={() => onSubmit(v.trim())}>
            {confirm}
          </Button>
        </>
      }
    >
      <div className="k-stack">
        <span className="k-label">{label}</span>
        <TextInput autoFocus value={v} onChange={setV} aria-label={label} onKeyDown={(e) => e.key === 'Enter' && v.trim() && onSubmit(v.trim())} />
      </div>
    </Dialog>
  );
}

function ConfirmDialog({ open, title, text, confirm, onClose, onConfirm }: { open: boolean; title: string; text: string; confirm: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      width={400}
      title={title}
      description={text}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirm}
          </Button>
        </>
      }
    />
  );
}

function TagsDialog({ item, onClose }: { item: LibraryItem | null; onClose: () => void }) {
  const [tags, setTags] = useState<string[]>([]);
  const all = useLibrary((s) => s.items);
  useEffect(() => setTags(item?.tags ?? []), [item]);
  return (
    <Dialog
      open={!!item}
      onOpenChange={(o) => !o && onClose()}
      width={400}
      title="Edit tags"
      description={item?.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (item) setItemTags(item.id, tags);
              onClose();
            }}
          >
            Save tags
          </Button>
        </>
      }
    >
      <TagsEditor tags={tags} onChange={setTags} suggestions={[...new Set(all.flatMap((i) => i.tags))]} />
    </Dialog>
  );
}

// ─── Cards ──────────────────────────────────────────────────────────────────

function dragFor(item: LibraryItem, e: React.DragEvent, preview: HTMLElement | null) {
  if (item.kind === 'animation') {
    const anim = freshAnimation((item.data as { animation: KAnimation }).animation);
    startDrag(e, { type: 'animation', label: item.name, animation: anim }, preview);
  } else if (item.kind === 'style') {
    const d = item.data as { styles: StyleMap; states?: KNode['states'] };
    startDrag(e, { type: 'style', label: item.name, styles: d.styles, states: d.states }, preview);
  } else if (item.kind === 'component' || item.kind === 'svg' || item.kind === 'image') {
    startDrag(
      e,
      {
        type: 'nodes',
        label: item.name,
        size: itemSizeHint(item),
        build: () => buildItemNodes(item) ?? { rootId: '', nodes: {} },
      },
      preview,
    );
  } else e.preventDefault();
}

function LibraryCard({
  item,
  selected,
  highlighted,
  menu,
  onActivate,
  onToggleSelect,
}: {
  item: LibraryItem;
  selected: boolean;
  highlighted: boolean;
  menu: MenuEntry[];
  onActivate: () => void;
  onToggleSelect: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlighted]);
  const verb = item.kind === 'component' || item.kind === 'svg' || item.kind === 'image' ? 'Insert' : 'Apply';
  return (
    <ContextMenuArea items={menu}>
      <div
        ref={ref}
        className="k-lcard"
        tabIndex={0}
        role="button"
        aria-label={`${verb} ${item.name}`}
        data-kind={item.kind}
        data-selected={selected ? 'true' : undefined}
        data-flash={highlighted ? 'true' : undefined}
        draggable={item.kind !== 'palette'}
        title={`${verb} “${item.name}” — click to ${verb.toLowerCase()}${item.kind === 'palette' ? '' : ', or drag onto the canvas'}`}
        onDragStart={(e) => dragFor(item, e, thumbRef.current)}
        onDragEnd={endDrag}
        onClick={(e) => (e.metaKey || e.ctrlKey ? onToggleSelect() : onActivate())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onActivate();
          if (e.key === ' ') {
            e.preventDefault();
            onToggleSelect();
          }
        }}
      >
        <div ref={thumbRef} className="k-lcard__thumb">
          <ItemPreview item={item} />
          <span className="k-lcard__kind" aria-hidden>
            {KIND_ICON[item.kind]}
          </span>
          <button
            className="k-lcard__fav"
            data-on={item.favorite ? 'true' : undefined}
            aria-label={item.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(item.id);
            }}
          >
            <Star />
          </button>
        </div>
        <div className="k-lcard__label">
          <span className="k-lcard__name">{item.name}</span>
          {item.tags.length > 0 && <span className="k-lcard__tags">{item.tags.slice(0, 2).join(' · ')}</span>}
        </div>
      </div>
    </ContextMenuArea>
  );
}

function Group({ title, count, icon, children, actions, collapsed, onToggle }: { title: ReactNode; count?: number; icon?: ReactNode; children: ReactNode; actions?: ReactNode; collapsed: boolean; onToggle: () => void }) {
  return (
    <section className="k-lgroup" data-collapsed={collapsed ? 'true' : undefined}>
      <div className="k-lgroup__head">
        <button className="k-lgroup__toggle" onClick={onToggle} aria-expanded={!collapsed}>
          <ChevronDown className="k-lgroup__chev" />
          {icon}
          <span className="k-lgroup__title">{title}</span>
          {count != null && <span className="k-lgroup__count">{count}</span>}
        </button>
        {actions}
      </div>
      {!collapsed && children}
    </section>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────

export function LibraryPanel() {
  const items = useLibrary((s) => s.items);
  const folders = useLibrary((s) => s.folders);
  const loaded = useLibrary((s) => s.loaded);
  const highlightId = useLibrary((s) => s.highlightId);
  const components = useDoc((s) => s.doc.components);
  const nodes = useDoc((s) => s.doc);
  const selection = useUI((s) => s.selection);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [favOnly, setFavOnly] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [renamingComp, setRenamingComp] = useState<string | null>(null);

  useEffect(() => {
    void ensureLibraryLoaded();
  }, []);
  useEffect(() => {
    if (!highlightId) return;
    setQuery('');
    setKind('all');
    setFavOnly(false);
    const t = setTimeout(() => useLibrary.setState({ highlightId: null }), 2200);
    return () => clearTimeout(t);
  }, [highlightId]);

  const toggleCollapsed = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (!n.delete(key)) n.add(key);
      return n;
    });

  const filtering = !!query.trim() || kind !== 'all' || favOnly;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (kind !== 'all' && i.kind !== kind) return false;
      if (favOnly && !i.favorite) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)) || KIND_LABEL[i.kind].toLowerCase().includes(q) || (i.folder ?? '').toLowerCase().includes(q);
    });
  }, [items, query, kind, favOnly]);

  const compList = useMemo(
    () =>
      Object.values(components)
        .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [components, query],
  );
  const showProject = (kind === 'all' || kind === 'component') && !favOnly;

  const activate = (item: LibraryItem) => {
    useLibraryItem(item);
  };

  const menuFor = (item: LibraryItem): MenuEntry[] => {
    const verb = item.kind === 'component' || item.kind === 'svg' || item.kind === 'image' ? 'Insert' : item.kind === 'palette' ? 'Apply to project' : 'Apply to selection';
    const ids = picked.has(item.id) && picked.size > 1 ? [...picked] : [item.id];
    return [
      { label: verb, icon: <Plus />, onSelect: () => activate(item) },
      { type: 'separator' },
      { label: 'Rename…', icon: <PenLine />, onSelect: () => setDialog({ type: 'rename', item }) },
      { label: 'Edit tags…', icon: <Tag />, onSelect: () => setDialog({ type: 'tags', item }) },
      {
        type: 'submenu',
        label: ids.length > 1 ? `Move ${ids.length} items to folder` : 'Move to folder',
        icon: <FolderInput />,
        items: [
          { label: 'No folder', checked: ids.length === 1 && !item.folder, onSelect: () => moveItems(ids, undefined) },
          ...folders.map<MenuEntry>((f) => ({ label: f, checked: ids.length === 1 && item.folder === f, onSelect: () => moveItems(ids, f) })),
          { type: 'separator' },
          { label: 'New folder…', icon: <FolderPlus />, onSelect: () => setDialog({ type: 'folder-new', moveIds: ids }) },
        ],
      },
      { label: item.favorite ? 'Remove favorite' : 'Add to favorites', icon: <Star />, onSelect: () => toggleFavorite(item.id) },
      { label: 'Duplicate', icon: <Copy />, onSelect: () => void duplicateItem(item.id) },
      { label: ids.length > 1 ? `Export ${ids.length} items…` : 'Export…', icon: <Download />, onSelect: () => void exportItems(ids, ids.length > 1 ? 'Kinema library' : item.name) },
      { type: 'separator' },
      { label: ids.length > 1 ? `Delete ${ids.length} items…` : 'Delete…', icon: <Trash2 />, danger: true, onSelect: () => setDialog({ type: 'delete-items', ids }) },
    ];
  };

  const renderCards = (list: LibraryItem[]) => (
    <div className="k-lgrid">
      {list.map((it) => (
        <LibraryCard
          key={it.id}
          item={it}
          selected={picked.has(it.id)}
          highlighted={highlightId === it.id}
          menu={menuFor(it)}
          onActivate={() => activate(it)}
          onToggleSelect={() =>
            setPicked((s) => {
              const n = new Set(s);
              if (!n.delete(it.id)) n.add(it.id);
              return n;
            })
          }
        />
      ))}
    </div>
  );

  const unfiled = filtered.filter((i) => !i.folder || !folders.includes(i.folder));
  const saveMenu: MenuEntry[] = [
    { label: 'Selection', icon: <ComponentIcon />, shortcut: 'Mod+Alt+L', disabled: selection.length !== 1, onSelect: () => saveSelectionToLibrary() },
    { label: 'Selected animation', onSelect: saveAnimationToLibrary },
    { label: 'Color palette', onSelect: savePaletteToLibrary },
    { label: 'Style of selection', disabled: selection.length !== 1, onSelect: saveStyleToLibrary },
  ];
  const moreMenu: MenuEntry[] = [
    { label: 'New folder…', icon: <FolderPlus />, onSelect: () => setDialog({ type: 'folder-new' }) },
    { type: 'separator' },
    { label: 'Import pack…', icon: <FileUp />, onSelect: () => void importPackFromPicker() },
    { label: 'Export all…', icon: <Download />, disabled: !items.length, onSelect: () => void exportItems(items.map((i) => i.id)) },
  ];

  const empty = loaded && items.length === 0;

  return (
    <div className="k-lib">
      <div className="k-lib__top">
        <TextInput wrapClassName="k-grow" icon={<Search />} value={query} placeholder="Search library" onChange={setQuery} aria-label="Search library" />
        <Dropdown
          align="end"
          items={saveMenu}
          trigger={
            <Button variant="primary" size="sm" icon={<Plus />} aria-label="Save to library" data-testid="library-save-menu">
              Save
            </Button>
          }
        />
        <Dropdown align="end" items={moreMenu} trigger={<IconButton label="More library actions" noTooltip><MoreHorizontal /></IconButton>} />
      </div>

      <div className="k-lib__chips" role="tablist" aria-label="Filter by kind">
        {KIND_FILTERS.map((k) => (
          <button key={k.id} role="tab" aria-selected={kind === k.id} className="k-chip" data-on={kind === k.id ? 'true' : undefined} onClick={() => setKind(k.id)}>
            {k.label}
          </button>
        ))}
        <button className="k-chip k-chip--fav" aria-pressed={favOnly} data-on={favOnly ? 'true' : undefined} onClick={() => setFavOnly((v) => !v)} title="Favorites only">
          <Star />
        </button>
      </div>

      {picked.size > 0 && (
        <div className="k-lib__bar">
          <span>{picked.size} selected</span>
          <span style={{ flex: 1 }} />
          <Button size="sm" variant="ghost" icon={<Download />} onClick={() => void exportItems([...picked], 'Kinema library')}>
            Export
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setDialog({ type: 'delete-items', ids: [...picked] })}>
            Delete
          </Button>
          <IconButton label="Clear selection" size="sm" onClick={() => setPicked(new Set())}>
            <X />
          </IconButton>
        </div>
      )}

      {showProject && (compList.length > 0 || !filtering) && (
        <Group
          title="This project"
          icon={<ComponentIcon className="k-lgroup__icon" />}
          count={compList.length}
          collapsed={collapsed.has('__project')}
          onToggle={() => toggleCollapsed('__project')}
        >
          {compList.length === 0 ? (
            <p className="k-lib__hint">
              Components you create with <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>K</kbd> appear here. Drag them onto the canvas to add instances.
            </p>
          ) : (
            <ul className="k-lcomps" data-testid="project-components">
              {compList.map((c) => {
                const n = listInstances(nodes, c.id).length;
                const cMenu: MenuEntry[] = [
                  { label: 'Insert instance', icon: <Plus />, onSelect: () => void insertInstance(c.id) },
                  { label: 'Edit component', icon: <PenLine />, onSelect: () => editComponent(c.id, { selectRoot: true }) },
                  { label: 'Rename…', onSelect: () => setRenamingComp(c.id) },
                  { label: 'Save to library…', icon: <BookMarked />, onSelect: () => saveComponentToLibrary(c.id) },
                  { type: 'separator' },
                  { label: 'Delete…', icon: <Trash2 />, danger: true, onSelect: () => setDialog({ type: 'delete-component', id: c.id }) },
                ];
                return (
                  <ContextMenuArea key={c.id} items={cMenu}>
                    <li
                      className="k-lcomp"
                      draggable
                      tabIndex={0}
                      data-component-id={c.id}
                      onDragStart={(e) => startDrag(e, { type: 'nodes', label: c.name, build: () => buildInstanceSubtree(c.id) })}
                      onDragEnd={endDrag}
                      onClick={() => insertInstance(c.id)}
                      onKeyDown={(e) => e.key === 'Enter' && insertInstance(c.id)}
                      title="Click to insert an instance, or drag onto the canvas"
                    >
                      <span className="k-lcomp__diamond">◆</span>
                      {renamingComp === c.id ? (
                        <input
                          className="k-lcomp__input"
                          autoFocus
                          defaultValue={c.name}
                          aria-label="Component name"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setRenamingComp(null);
                          }}
                          onBlur={(e) => {
                            renameComponent(c.id, e.target.value);
                            setRenamingComp(null);
                          }}
                        />
                      ) : (
                        <span className="k-lcomp__name">{c.name}</span>
                      )}
                      <span className="k-lcomp__meta">{n}×</span>
                      <span className="k-lcomp__actions" onClick={(e) => e.stopPropagation()}>
                        <IconButton label="Edit component" size="sm" onClick={() => editComponent(c.id, { selectRoot: true })}>
                          <PenLine />
                        </IconButton>
                        <IconButton label="Delete component" size="sm" onClick={() => setDialog({ type: 'delete-component', id: c.id })}>
                          <Trash2 />
                        </IconButton>
                      </span>
                    </li>
                  </ContextMenuArea>
                );
              })}
            </ul>
          )}
        </Group>
      )}

      <div className="k-lib__title">
        <BookMarked />
        <span>My library</span>
        <span className="k-lgroup__count">{items.length}</span>
      </div>

      {!loaded && <div className="k-lib__loading">Loading…</div>}

      {empty && (
        <div className="k-lib__empty">
          <div className="k-lib__empty-icon">
            <BookMarked />
          </div>
          <h3>Your personal library</h3>
          <p>Save components, animations, SVGs, palettes and styles once — reuse them in every project.</p>
          <Button size="sm" variant="primary" icon={<Plus />} disabled={selection.length !== 1} onClick={() => saveSelectionToLibrary()}>
            Save selection
          </Button>
          <Button size="sm" variant="ghost" icon={<FileUp />} onClick={() => void importPackFromPicker()}>
            Import a pack
          </Button>
        </div>
      )}

      {loaded && !empty && filtered.length === 0 && <p className="k-lib__hint">Nothing matches your filters.</p>}

      {folders.map((f) => {
        const list = filtered.filter((i) => i.folder === f);
        if (filtering && !list.length) return null;
        const fMenu: MenuEntry[] = [
          { label: 'Rename folder…', icon: <PenLine />, onSelect: () => setDialog({ type: 'folder-rename', name: f }) },
          { label: 'Export folder…', icon: <Download />, disabled: !list.length, onSelect: () => void exportItems(items.filter((i) => i.folder === f).map((i) => i.id), f) },
          { type: 'separator' },
          { label: 'Delete folder…', icon: <Trash2 />, danger: true, onSelect: () => setDialog({ type: 'delete-folder', name: f }) },
        ];
        return (
          <ContextMenuArea key={f} items={fMenu}>
            <div>
              <Group
                title={f}
                icon={<Folder className="k-lgroup__icon" />}
                count={list.length}
                collapsed={collapsed.has(`f:${f}`)}
                onToggle={() => toggleCollapsed(`f:${f}`)}
                actions={
                  <Dropdown align="end" items={fMenu} trigger={<IconButton label={`Folder ${f} actions`} size="sm" noTooltip><MoreHorizontal /></IconButton>} />
                }
              >
                {list.length ? renderCards(list) : <p className="k-lib__hint">Empty folder. Use “Move to folder” on an item.</p>}
              </Group>
            </div>
          </ContextMenuArea>
        );
      })}

      {unfiled.length > 0 && (folders.length > 0 ? (
        <Group title="Unfiled" count={unfiled.length} collapsed={collapsed.has('__unfiled')} onToggle={() => toggleCollapsed('__unfiled')}>
          {renderCards(unfiled)}
        </Group>
      ) : (
        <div className="k-lib__flat">{renderCards(unfiled)}</div>
      ))}

      {/* dialogs */}
      <PromptDialog
        open={dialog?.type === 'rename'}
        title="Rename item"
        label="Name"
        initial={dialog?.type === 'rename' ? dialog.item.name : ''}
        confirm="Rename"
        onClose={() => setDialog(null)}
        onSubmit={(v) => {
          if (dialog?.type === 'rename') updateItem(dialog.item.id, { name: v });
          setDialog(null);
        }}
      />
      <TagsDialog item={dialog?.type === 'tags' ? dialog.item : null} onClose={() => setDialog(null)} />
      <PromptDialog
        open={dialog?.type === 'folder-new'}
        title="New folder"
        label="Folder name"
        initial=""
        confirm="Create"
        onClose={() => setDialog(null)}
        onSubmit={(v) => {
          const f = createFolder(v);
          if (f && dialog?.type === 'folder-new' && dialog.moveIds) moveItems(dialog.moveIds, f);
          setDialog(null);
        }}
      />
      <PromptDialog
        open={dialog?.type === 'folder-rename'}
        title="Rename folder"
        label="Folder name"
        initial={dialog?.type === 'folder-rename' ? dialog.name : ''}
        confirm="Rename"
        onClose={() => setDialog(null)}
        onSubmit={(v) => {
          if (dialog?.type === 'folder-rename') renameFolder(dialog.name, v);
          setDialog(null);
        }}
      />
      <ConfirmDialog
        open={dialog?.type === 'delete-items'}
        title={dialog?.type === 'delete-items' && dialog.ids.length > 1 ? `Delete ${dialog.ids.length} items?` : 'Delete item?'}
        text="They will be removed from your personal library in all projects. Items already used in projects are not affected."
        confirm="Delete"
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.type === 'delete-items') {
            removeItems(dialog.ids);
            setPicked(new Set());
            toast(`Deleted ${dialog.ids.length} item${dialog.ids.length === 1 ? '' : 's'} from your library`);
          }
          setDialog(null);
        }}
      />
      <ConfirmDialog
        open={dialog?.type === 'delete-folder'}
        title="Delete folder?"
        text="Items in this folder are kept and move back to the top level of your library."
        confirm="Delete folder"
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.type === 'delete-folder') deleteFolder(dialog.name);
          setDialog(null);
        }}
      />
      <ConfirmDialog
        open={dialog?.type === 'delete-component'}
        title="Delete component?"
        text={
          dialog?.type === 'delete-component'
            ? `“${components[dialog.id]?.name ?? 'Component'}” will be removed. Its ${listInstances(nodes, dialog.id).length} instance(s) are detached and keep their appearance.`
            : ''
        }
        confirm="Delete component"
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.type === 'delete-component') deleteComponent(dialog.id);
          setDialog(null);
        }}
      />
    </div>
  );
}
