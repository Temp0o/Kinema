/**
 * `.kinema` project packages: a zip with `project.json`, `assets/*` and an
 * optional `thumbnail.png`. Importing assigns a new project id.
 */
import JSZip from 'jszip';
import { produce } from 'immer';
import type { KDocument, ProjectFile } from '@/core/model/types';
import { uid } from '@/core/model/factory';
import { repairDocument } from '@/core/model/tree';
import { IMPORT_LIMITS, assertZipWithinLimits, safeJsonParse } from '@/core/model/safeJson';
import type { PlatformAPI } from '@/platform/types';

export const KINEMA_EXT = 'kinema';
const FORMAT_VERSION = 1;

/** User-facing error (message is safe to show in a toast). */
export class KinemaFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KinemaFileError';
  }
}

export async function packProject(
  file: ProjectFile,
  readAsset: (path: string) => Promise<Uint8Array | null>,
  thumbnail?: Uint8Array | null,
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('project.json', JSON.stringify(file));
  zip.file('kinema.json', JSON.stringify({ format: 'kinema-package', formatVersion: FORMAT_VERSION, exportedAt: Date.now() }));
  for (const a of Object.values(file.document.assets)) {
    try {
      const data = await readAsset(a.path);
      if (data) zip.file(a.path, data);
    } catch {
      /* missing asset files are skipped; the project still opens */
    }
  }
  if (thumbnail?.length) zip.file('thumbnail.png', thumbnail);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export interface UnpackedProject {
  file: ProjectFile;
  /** asset path → bytes */
  assets: Map<string, Uint8Array>;
  thumbnail?: Uint8Array;
}

function validateDocument(doc: unknown): doc is KDocument {
  if (!doc || typeof doc !== 'object') return false;
  const d = doc as Partial<KDocument>;
  return Array.isArray(d.pages) && d.pages.length > 0 && !!d.nodes && typeof d.nodes === 'object' && d.pages.every((p) => p && typeof p.rootId === 'string' && !!d.nodes![p.rootId]);
}

export async function unpackProject(data: Uint8Array): Promise<UnpackedProject> {
  let zip: JSZip;
  if (data.length > IMPORT_LIMITS.maxPackageBytes) throw new KinemaFileError('This file is too large to import.');
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new KinemaFileError('This file isn’t a Kinema project — it could not be opened as a .kinema package.');
  }
  try {
    assertZipWithinLimits(zip, ['project.json', 'kinema.json']);
  } catch (err) {
    throw new KinemaFileError(`Can’t import this file: ${(err as Error).message}`);
  }
  const entry = zip.file('project.json');
  if (!entry) throw new KinemaFileError('This package doesn’t contain a Kinema project (project.json is missing).');
  let parsed: Partial<ProjectFile>;
  try {
    parsed = safeJsonParse(await entry.async('string'));
  } catch {
    throw new KinemaFileError('The project data in this file is damaged and can’t be read.');
  }
  if (parsed.format !== 'kinema-project') throw new KinemaFileError('This file isn’t a Kinema project.');
  if (typeof parsed.formatVersion !== 'number' || parsed.formatVersion > FORMAT_VERSION)
    throw new KinemaFileError('This project was created with a newer version of Kinema. Please update the app to open it.');
  if (!validateDocument(parsed.document)) throw new KinemaFileError('The project data is incomplete (no pages were found).');

  const doc = parsed.document;
  doc.components ??= {};
  doc.assets ??= {};
  const assets = new Map<string, Uint8Array>();
  for (const a of Object.values(doc.assets)) {
    if (!a || typeof a.path !== 'string') continue;
    const f = zip.file(a.path);
    if (f) assets.set(a.path, await f.async('uint8array'));
  }
  const thumbFile = zip.file('thumbnail.png');
  const thumbnail = thumbFile ? await thumbFile.async('uint8array') : undefined;
  const now = Date.now();
  const file: ProjectFile = {
    format: 'kinema-project',
    formatVersion: 1,
    id: typeof parsed.id === 'string' ? parsed.id : uid('prj'),
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : 'Imported project',
    createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : now,
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : now,
    document: doc,
  };
  return { file, assets, thumbnail };
}

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return `data:${mime};base64,${btoa(bin)}`;
}

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error('Invalid data URL');
  const mime = m[1] || 'application/octet-stream';
  if (!m[2]) return { bytes: new TextEncoder().encode(decodeURIComponent(m[3])), mime };
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

/** Read a URL (data:, blob:, kasset:) into bytes; null on failure. */
export async function fetchBytes(url: string | undefined | null): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    if (url.startsWith('data:')) return dataUrlToBytes(url).bytes;
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Export a stored project as `.kinema` bytes. */
export async function exportProjectPackage(platform: PlatformAPI, projectId: string, thumbnailUrl?: string): Promise<{ name: string; data: Uint8Array }> {
  const file = await platform.projects.load(projectId);
  const thumb = await fetchBytes(thumbnailUrl);
  const data = await packProject(file, (p) => platform.assets.read(projectId, p), thumb);
  return { name: file.name, data };
}

/** Import `.kinema` bytes as a new project (new id). Returns the new project id + name. */
export async function importProjectPackage(platform: PlatformAPI, data: Uint8Array): Promise<{ id: string; name: string }> {
  const { file, assets, thumbnail } = await unpackProject(data);
  const id = uid('prj');
  const now = Date.now();
  const document = produce(file.document, (d) => {
    repairDocument(d as KDocument);
  });
  const paths = new Map<string, string>();
  for (const [path, bytes] of assets) {
    const asset = Object.values(document.assets).find((a) => a.path === path);
    const fileName = path.replace(/^assets\//, '') || `${uid('f')}.bin`;
    const written = await platform.assets.write(id, fileName, bytes, asset?.mime ?? 'application/octet-stream');
    paths.set(path, written);
  }
  const fixed = produce(document, (d) => {
    for (const a of Object.values(d.assets)) {
      const p = paths.get(a.path);
      if (p) a.path = p;
    }
  });
  const out: ProjectFile = { ...file, id, createdAt: now, updatedAt: now, document: fixed };
  await platform.projects.save(out);
  if (thumbnail?.length) {
    try {
      await platform.projects.saveThumbnail(id, bytesToDataUrl(thumbnail, 'image/png'));
    } catch {
      /* thumbnail is optional */
    }
  }
  return { id, name: out.name };
}
