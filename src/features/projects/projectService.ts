/**
 * Project lifecycle: create / open / save / close, plus debounced autosave.
 */
import { toast } from 'sonner';
import { platform } from '@/platform';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { createProjectFile } from '@/core/model/factory';
import { repairDocument } from '@/core/model/tree';
import type { KDocument, ProjectFile } from '@/core/model/types';
import { loadAssetUrls } from '@/core/assets/assetStore';
import { produce } from 'immer';

let current: Omit<ProjectFile, 'document'> | null = null;

export function currentProject() {
  return current;
}

export async function createProject(name: string, document?: KDocument): Promise<string> {
  const file = createProjectFile(name || 'Untitled', document);
  await platform.projects.save(file);
  return file.id;
}

export async function openProject(id: string) {
  const file = await platform.projects.load(id);
  const doc = produce(file.document, (d) => {
    const issues = repairDocument(d as KDocument);
    if (issues.length) console.warn('[kinema] repaired document', issues);
  });
  current = { format: file.format, formatVersion: file.formatVersion, id: file.id, name: file.name, createdAt: file.createdAt, updatedAt: file.updatedAt };
  useDoc.getState().loadDocument(doc);
  const base = doc.breakpoints[0];
  useUI.getState().set({
    route: 'editor',
    projectId: file.id,
    projectName: file.name,
    activePageId: doc.pages[0]?.id ?? null,
    editingComponentId: null,
    selection: [],
    hoverId: null,
    editingTextId: null,
    breakpoint: base?.id ?? 'base',
    canvasWidth: base?.width ?? 1440,
    canvasHeight: null,
  });
  void loadAssetUrls(file.id, doc);
}

export async function saveCurrent(opts: { silent?: boolean } = {}): Promise<boolean> {
  if (!current) return false;
  const { doc, revision } = useDoc.getState();
  const name = useUI.getState().projectName || current.name;
  const file: ProjectFile = { ...current, name, updatedAt: Date.now(), document: doc };
  try {
    setSaveStatus('saving');
    await platform.projects.save(file);
    current = { ...current, name, updatedAt: file.updatedAt };
    useDoc.getState().markSaved(revision);
    setSaveStatus('saved');
    return true;
  } catch (err) {
    console.error(err);
    setSaveStatus('error');
    if (!opts.silent) toast.error('Could not save project', { description: String(err) });
    return false;
  }
}

export async function closeProject() {
  if (current && useDoc.getState().revision !== useDoc.getState().savedRevision) await saveCurrent({ silent: true });
  current = null;
  useUI.getState().set({ route: 'home', projectId: null, selection: [], editingComponentId: null });
}

export function renameCurrentProject(name: string) {
  const n = name.trim();
  if (!n) return;
  useUI.getState().set({ projectName: n });
  void saveCurrent({ silent: true });
}

// ─── Save status (for the title bar indicator) ──────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
let snapshot: { status: SaveStatus; lastSavedAt: number } = { status: 'idle', lastSavedAt: 0 };
const listeners = new Set<() => void>();
function setSaveStatus(s: SaveStatus) {
  snapshot = { status: s, lastSavedAt: s === 'saved' ? Date.now() : snapshot.lastSavedAt };
  listeners.forEach((l) => l());
}
/** Stable snapshot (safe for useSyncExternalStore). */
export function getSaveStatus() {
  return snapshot;
}
export function subscribeSaveStatus(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ─── Autosave ───────────────────────────────────────────────────────────────

const AUTOSAVE_MS = 1200;
let timer: ReturnType<typeof setTimeout> | null = null;

export function installAutosave() {
  const unsub = useDoc.subscribe((s, prev) => {
    if (s.revision === prev.revision || !current) return;
    if (s.tx) return; // wait for transaction (drag) to finish
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const st = useDoc.getState();
      if (st.revision !== st.savedRevision && !st.tx) void saveCurrent({ silent: true });
    }, AUTOSAVE_MS);
  });
  const onUnload = () => {
    const st = useDoc.getState();
    if (current && st.revision !== st.savedRevision) void saveCurrent({ silent: true });
  };
  window.addEventListener('beforeunload', onUnload);
  return () => {
    unsub();
    window.removeEventListener('beforeunload', onUnload);
  };
}
