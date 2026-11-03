/** `.kinemalib` packs: a zip with `library.json` ({ items, folders }). */
import JSZip from 'jszip';
import { toast } from 'sonner';
import { platform } from '@/platform';
import type { LibraryData, LibraryItem } from '@/core/model/types';
import { KinemaFileError } from '@/features/projects/kinemaFile';
import { IMPORT_LIMITS, assertZipWithinLimits, safeJsonParse } from '@/core/model/safeJson';
import { addItem, ensureLibraryLoaded, mergeIntoLibrary, normalizeLibrary, useLibrary } from './libraryStore';

export const PACK_EXT = 'kinemalib';

export async function packLibrary(items: LibraryItem[], folders: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const used = new Set(items.map((i) => i.folder).filter((f): f is string => !!f));
  zip.file('library.json', JSON.stringify({ format: 'kinema-library', formatVersion: 1, items, folders: folders.filter((f) => used.has(f)) }));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function unpackLibrary(data: Uint8Array): Promise<{ items: LibraryItem[]; folders: string[] }> {
  let zip: JSZip;
  if (data.length > IMPORT_LIMITS.maxPackageBytes) throw new KinemaFileError('This file is too large to import.');
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new KinemaFileError('This file isn’t a Kinema library pack.');
  }
  try {
    assertZipWithinLimits(zip, ['library.json']);
  } catch (err) {
    throw new KinemaFileError(`Can’t import this pack: ${(err as Error).message}`);
  }
  const f = zip.file('library.json');
  if (!f) throw new KinemaFileError('This package doesn’t contain a Kinema library (library.json is missing).');
  let parsed: Partial<LibraryData>;
  try {
    parsed = safeJsonParse(await f.async('string'));
  } catch {
    throw new KinemaFileError('The library data in this file is damaged.');
  }
  if (parsed.format !== 'kinema-library') throw new KinemaFileError('This file isn’t a Kinema library pack.');
  if (((parsed.formatVersion as number | undefined) ?? 1) > 1) throw new KinemaFileError('This pack was created with a newer version of Kinema.');
  return normalizeLibrary(parsed);
}

export async function exportItems(ids: string[], suggestedName = 'Kinema library'): Promise<boolean> {
  await ensureLibraryLoaded();
  const set = new Set(ids);
  const items = useLibrary.getState().items.filter((i) => set.has(i.id));
  if (!items.length) {
    toast.info('Nothing to export');
    return false;
  }
  try {
    const data = await packLibrary(items, useLibrary.getState().folders);
    const saved = await platform.files.saveAs({
      suggestedName: `${suggestedName.replace(/[<>:"/\\|?*]/g, '_')}.${PACK_EXT}`,
      data,
      filters: [{ name: 'Kinema library pack', extensions: [PACK_EXT] }],
    });
    if (saved) toast.success(`Exported ${items.length} item${items.length === 1 ? '' : 's'}`);
    return !!saved;
  } catch (err) {
    toast.error('Could not export', { description: String(err) });
    return false;
  }
}

export async function importPackBytes(data: Uint8Array): Promise<{ added: number; skipped: number } | null> {
  try {
    await ensureLibraryLoaded();
    const { items, folders } = await unpackLibrary(data);
    const res = mergeIntoLibrary(items, folders);
    toast.success(res.added ? `Imported ${res.added} item${res.added === 1 ? '' : 's'}` : 'Nothing new to import', {
      description: res.skipped ? `${res.skipped} already in your library were skipped.` : undefined,
    });
    return res;
  } catch (err) {
    if (err instanceof KinemaFileError) toast.error('Can’t import this pack', { description: err.message });
    else toast.error('Import failed', { description: String(err) });
    return null;
  }
}

export async function importPackFromPicker(): Promise<void> {
  const files = await platform.files.open({ accept: [PACK_EXT], multiple: true });
  for (const f of files) await importPackBytes(f.data);
}

export { addItem };
