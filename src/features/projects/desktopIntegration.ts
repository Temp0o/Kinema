/**
 * Desktop integration (Electron): flush unsaved work before the window closes, and
 * open .kinema files launched from the OS (Explorer double-click / "Open with").
 */
import { toast } from 'sonner';
import { platform } from '@/platform';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { flushLibrary } from '@/features/library/libraryStore';
import { closeProject, currentProject, importKinemaBytes, openProject, saveCurrent } from './projectService';

async function flushBeforeClose() {
  // commit an in-progress inline text edit (it commits on blur)
  (document.activeElement as HTMLElement | null)?.blur?.();
  const doc = useDoc.getState();
  if (doc.tx) doc.commitTransaction();
  const st = useDoc.getState();
  const tasks: Promise<unknown>[] = [flushLibrary().catch(() => {})];
  if (currentProject() && st.revision !== st.savedRevision) tasks.push(saveCurrent({ silent: true }));
  await Promise.all(tasks);
}

async function openKinemaFile(file: { name: string; data: Uint8Array }) {
  const id = await importKinemaBytes(file.data);
  if (!id) return; // importKinemaBytes reports its own errors
  if (useUI.getState().route === 'editor') await closeProject();
  await openProject(id);
  toast.success(`Opened “${file.name.replace(/\.kinema$/i, '')}”`);
}

export function installDesktopIntegration() {
  const w = platform.window;
  if (!w) return;
  const offClose = w.onBeforeClose(flushBeforeClose);
  const offOpen = w.onOpenFile((f) => void openKinemaFile(f));
  w.rendererReady();
  return () => {
    offClose();
    offOpen();
  };
}
