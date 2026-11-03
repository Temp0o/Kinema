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
import { buildTemplateDocument } from '@/core/templates';
import { uid } from '@/core/model/factory';
import { usePlayback } from '@/features/animation/playbackStore';
import { KinemaFileError, KINEMA_EXT, exportProjectPackage, importProjectPackage } from './kinemaFile';
import { cancelScheduledThumbnail, resetThumbnailClock, saveProjectThumbnailNow, scheduleProjectThumbnail } from './thumbnails';

let current: Omit<ProjectFile, 'document'> | null = null;

export function currentProject() {
  return current;
}

export async function createProject(name: string, document?: KDocument): Promise<string> {
  const file = createProjectFile(name || 'Untitled', document);
  await platform.projects.save(file);
  return file.id;
}

/** Create a project from a template id ('blank' for an empty page). */
export async function createProjectFromTemplate(name: string, templateId: string): Promise<string> {
  const title = name.trim() || 'Untitled';
  const { doc, warnings } = buildTemplateDocument(templateId, title);
  if (warnings.length) console.warn('[kinema] template warnings', warnings);
  return createProject(title, doc);
}

export function windowTitle(): string {
  const ui = useUI.getState();
  return ui.route === 'editor' && ui.projectName ? `${ui.projectName} — Kinema` : 'Kinema';
}

function syncWindowTitle() {
  if (typeof document !== 'undefined') document.title = windowTitle();
}

export async function openProject(id: string) {
  let file: ProjectFile;
  try {
    file = await platform.projects.load(id);
  } catch (err) {
    console.error(err);
    toast.error('Could not open project', { description: 'The project file is missing or unreadable.' });
    return;
  }
  // flush whatever was open before
  if (current && current.id !== id && useDoc.getState().revision !== useDoc.getState().savedRevision) await saveCurrent({ silent: true });
  cancelScheduledThumbnail();
  resetThumbnailClock();
  usePlayback.getState().set({ playing: false, time: 0, scope: null, selectedAnimation: null });
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
  syncWindowTitle();
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
    scheduleProjectThumbnail(file.id);
    return true;
  } catch (err) {
    console.error(err);
    setSaveStatus('error');
    if (!opts.silent) toast.error('Could not save project', { description: String(err) });
    return false;
  }
}

export async function closeProject() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
  if (current) {
    const id = current.id;
    if (useDoc.getState().tx) useDoc.getState().commitTransaction();
    if (useDoc.getState().revision !== useDoc.getState().savedRevision) await saveCurrent({ silent: true });
    // final thumbnail while the canvas is still mounted (never blocks closing for long)
    await Promise.race([saveProjectThumbnailNow(id), new Promise((r) => setTimeout(r, 4000))]);
  }
  cancelScheduledThumbnail();
  current = null;
  usePlayback.getState().set({ playing: false, time: 0, scope: null });
  useUI.getState().set({ route: 'home', projectId: null, projectName: '', selection: [], editingComponentId: null, editingTextId: null });
  syncWindowTitle();
}

export function renameCurrentProject(name: string) {
  const n = name.trim();
  if (!n) return;
  useUI.getState().set({ projectName: n });
  syncWindowTitle();
  void saveCurrent({ silent: true });
}

// ─── Project management (home screen) ───────────────────────────────────────

export async function renameProject(id: string, name: string): Promise<boolean> {
  const n = name.trim();
  if (!n) return false;
  if (current?.id === id) {
    renameCurrentProject(n);
    return true;
  }
  try {
    const file = await platform.projects.load(id);
    await platform.projects.save({ ...file, name: n, updatedAt: Date.now() });
    return true;
  } catch (err) {
    toast.error('Could not rename project', { description: String(err) });
    return false;
  }
}

export async function duplicateProject(id: string): Promise<string | null> {
  try {
    const file = await platform.projects.load(id);
    const metas = await platform.projects.list();
    const meta = metas.find((m) => m.id === id);
    const now = Date.now();
    const copy: ProjectFile = { ...file, id: uid('prj'), name: `${file.name} copy`, createdAt: now, updatedAt: now };
    await platform.projects.save(copy);
    await platform.assets.copyAll(id, copy.id);
    if (meta?.thumbnail?.startsWith('data:')) await platform.projects.saveThumbnail(copy.id, meta.thumbnail).catch(() => {});
    return copy.id;
  } catch (err) {
    toast.error('Could not duplicate project', { description: String(err) });
    return null;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    await platform.projects.remove(id);
    return true;
  } catch (err) {
    toast.error('Could not delete project', { description: String(err) });
    return false;
  }
}

function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim().slice(0, 80) || 'project';
}

export async function exportProject(id: string, thumbnail?: string): Promise<boolean> {
  try {
    if (current?.id === id && useDoc.getState().revision !== useDoc.getState().savedRevision) await saveCurrent({ silent: true });
    const { name, data } = await exportProjectPackage(platform, id, thumbnail);
    const saved = await platform.files.saveAs({
      suggestedName: `${safeFileName(name)}.${KINEMA_EXT}`,
      data,
      filters: [{ name: 'Kinema project', extensions: [KINEMA_EXT] }],
    });
    if (saved) toast.success(`Exported “${name}”`);
    return !!saved;
  } catch (err) {
    toast.error('Could not export project', { description: String(err) });
    return false;
  }
}

/** Import `.kinema` bytes as a new project. Shows friendly errors. */
export async function importKinemaBytes(data: Uint8Array): Promise<string | null> {
  try {
    const { id, name } = await importProjectPackage(platform, data);
    toast.success(`Imported “${name}”`);
    return id;
  } catch (err) {
    if (err instanceof KinemaFileError) toast.error('Can’t import this file', { description: err.message });
    else toast.error('Import failed', { description: String(err) });
    return null;
  }
}

export async function importKinemaFromPicker(): Promise<string[]> {
  const files = await platform.files.open({ accept: [KINEMA_EXT], multiple: true });
  const ids: string[] = [];
  for (const f of files) {
    const id = await importKinemaBytes(f.data);
    if (id) ids.push(id);
  }
  return ids;
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
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

export function installAutosave() {
  const unsub = useDoc.subscribe((s, prev) => {
    if (s.revision === prev.revision || !current) return;
    if (s.tx) return; // wait for transaction (drag) to finish
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
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
