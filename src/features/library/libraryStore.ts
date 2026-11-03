/**
 * Global personal library state. Persisted through `platform.library` with
 * debounced saves; shared by every project.
 */
import { create } from 'zustand';
import { toast } from 'sonner';
import { platform } from '@/platform';
import { uid } from '@/core/model/factory';
import type { KComponent, KNode, LibraryData, LibraryItem, LibraryItemKind } from '@/core/model/types';
import { repairNodeSet } from '@/core/model/tree';

export interface LibraryState {
  loaded: boolean;
  loading: boolean;
  items: LibraryItem[];
  folders: string[];
  /** Item to reveal/highlight after saving. */
  highlightId: string | null;
  set: (p: Partial<LibraryState>) => void;
}

export const useLibrary = create<LibraryState>()((set) => ({
  loaded: false,
  loading: false,
  items: [],
  folders: [],
  highlightId: null,
  set: (p) => set(p),
}));

const lib = () => useLibrary.getState();

/** Library files are untrusted input: component items must contain structurally sound trees. */
function sanitizeItemData(item: LibraryItem): boolean {
  if (item.kind !== 'component') return true;
  const d = item.data as { rootId?: unknown; nodes?: Record<string, KNode>; components?: Record<string, KComponent> };
  if (!d || typeof d !== 'object' || typeof d.rootId !== 'string' || !d.nodes || typeof d.nodes !== 'object') return false;
  if (d.components === undefined || d.components === null || typeof d.components !== 'object') d.components = {};
  const roots = [d.rootId, ...Object.values(d.components).map((c) => c?.rootId).filter((r): r is string => typeof r === 'string')];
  const kept = repairNodeSet(d.nodes, roots, d.components);
  return kept.includes(d.rootId);
}

export function normalizeLibrary(data: Partial<LibraryData> | null | undefined): { items: LibraryItem[]; folders: string[] } {
  const items = (Array.isArray(data?.items) ? data!.items : []).filter((i): i is LibraryItem => !!i && typeof i.id === 'string' && typeof i.kind === 'string' && i.data !== undefined && i.data !== null && sanitizeItemData(i));
  const folders = new Set<string>(Array.isArray(data?.folders) ? data!.folders.filter((f) => typeof f === 'string' && f.trim()) : []);
  for (const i of items) {
    i.tags = Array.isArray(i.tags) ? i.tags : [];
    if (i.folder) folders.add(i.folder);
  }
  return { items, folders: [...folders] };
}

let loadPromise: Promise<void> | null = null;
export function ensureLibraryLoaded(): Promise<void> {
  if (lib().loaded) return Promise.resolve();
  if (!loadPromise) {
    useLibrary.setState({ loading: true });
    loadPromise = platform.library
      .load()
      .then((data) => {
        const n = normalizeLibrary(data);
        // keep anything added while loading
        const have = new Set(n.items.map((i) => i.id));
        const extra = lib().items.filter((i) => !have.has(i.id));
        useLibrary.setState({ items: [...extra, ...n.items], folders: [...new Set([...lib().folders, ...n.folders])], loaded: true, loading: false });
      })
      .catch((err) => {
        console.error(err);
        toast.error('Could not load your library', { description: String(err) });
        useLibrary.setState({ loaded: true, loading: false });
      });
  }
  return loadPromise;
}

// ─── Persistence ────────────────────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

export async function flushLibrary(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty || !lib().loaded) return;
  dirty = false;
  const data: LibraryData = { format: 'kinema-library', formatVersion: 1, items: lib().items, folders: lib().folders };
  try {
    await platform.library.save(data);
  } catch (err) {
    dirty = true;
    console.error(err);
    toast.error('Could not save your library', { description: String(err) });
  }
}

function scheduleSave() {
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushLibrary(), 600);
}

function update(patch: Partial<Pick<LibraryState, 'items' | 'folders'>>) {
  useLibrary.setState(patch);
  scheduleSave();
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export async function addItem(item: LibraryItem): Promise<void> {
  await ensureLibraryLoaded();
  const folders = item.folder && !lib().folders.includes(item.folder) ? [...lib().folders, item.folder] : lib().folders;
  update({ items: [item, ...lib().items], folders });
  useLibrary.setState({ highlightId: item.id });
}

export function updateItem(id: string, patch: Partial<LibraryItem>) {
  update({ items: lib().items.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i)) });
}

export function removeItems(ids: string[]) {
  const set = new Set(ids);
  update({ items: lib().items.filter((i) => !set.has(i.id)) });
}

export function toggleFavorite(id: string) {
  const it = lib().items.find((i) => i.id === id);
  if (it) updateItem(id, { favorite: !it.favorite });
}

export function setItemTags(id: string, tags: string[]) {
  updateItem(id, { tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))] });
}

export function duplicateItem(id: string): LibraryItem | null {
  const it = lib().items.find((i) => i.id === id);
  if (!it) return null;
  const t = Date.now();
  const copy: LibraryItem = { ...structuredClone(it), id: uid('lib'), name: `${it.name} copy`, createdAt: t, updatedAt: t };
  const i = lib().items.findIndex((x) => x.id === id);
  const items = [...lib().items];
  items.splice(i, 0, copy);
  update({ items });
  return copy;
}

export function moveItems(ids: string[], folder: string | undefined) {
  const set = new Set(ids);
  const folders = folder && !lib().folders.includes(folder) ? [...lib().folders, folder] : lib().folders;
  update({ items: lib().items.map((i) => (set.has(i.id) ? { ...i, folder: folder || undefined, updatedAt: Date.now() } : i)), folders });
}

export function createFolder(name: string): string | null {
  const n = name.trim();
  if (!n) return null;
  const existing = lib().folders.find((f) => f.toLowerCase() === n.toLowerCase());
  if (existing) return existing;
  update({ folders: [...lib().folders, n] });
  return n;
}

export function renameFolder(from: string, to: string): boolean {
  const n = to.trim();
  if (!n || n === from) return false;
  if (lib().folders.some((f) => f !== from && f.toLowerCase() === n.toLowerCase())) {
    toast.error(`A folder named “${n}” already exists`);
    return false;
  }
  update({ folders: lib().folders.map((f) => (f === from ? n : f)), items: lib().items.map((i) => (i.folder === from ? { ...i, folder: n } : i)) });
  return true;
}

/** Deletes the folder; its items move back to the root of the library. */
export function deleteFolder(name: string) {
  update({ folders: lib().folders.filter((f) => f !== name), items: lib().items.map((i) => (i.folder === name ? { ...i, folder: undefined } : i)) });
}

/** Merge items/folders (import). Skips items whose id already exists. */
export function mergeIntoLibrary(items: LibraryItem[], folders: string[]): { added: number; skipped: number } {
  const have = new Set(lib().items.map((i) => i.id));
  const fresh = items.filter((i) => !have.has(i.id));
  update({ items: [...fresh, ...lib().items], folders: [...new Set([...lib().folders, ...folders, ...fresh.map((i) => i.folder).filter((f): f is string => !!f)])] });
  return { added: fresh.length, skipped: items.length - fresh.length };
}

export const KIND_LABEL: Record<LibraryItemKind, string> = {
  component: 'Component',
  animation: 'Animation',
  svg: 'SVG',
  image: 'Image',
  palette: 'Palette',
  style: 'Style',
};

// ─── Save dialog state ──────────────────────────────────────────────────────

export interface SaveRequest {
  title: string;
  defaultName: string;
  /** Alternative kinds the same source can be saved as (e.g. svg node → component or svg). */
  kinds?: { kind: LibraryItemKind; label: string }[];
  kind: LibraryItemKind;
  defaultFolder?: string;
  create: (kind: LibraryItemKind, info: { name: string; folder?: string; tags: string[] }) => Promise<LibraryItem | null>;
}

export const useSaveDialog = create<{ request: SaveRequest | null; open: (r: SaveRequest) => void; close: () => void }>()((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}));
