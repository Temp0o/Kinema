/**
 * Per-project registry of every binary the importer has written
 * (`assets/.kinema-files.json`). The platform API can't list a project's asset
 * folder, so this is how "Clean up unused files" knows which binaries exist
 * after assets were deleted or replaced (binaries are never deleted implicitly,
 * so undo keeps working).
 */
import { platform } from '@/platform';

const REGISTRY_FILE = '.kinema-files.json';
const REGISTRY_PATH = `assets/${REGISTRY_FILE}`;

export interface RegistryEntry {
  path: string;
  size: number;
}

const cache = new Map<string, Map<string, RegistryEntry>>();
let chain: Promise<unknown> = Promise.resolve();

async function load(projectId: string): Promise<Map<string, RegistryEntry>> {
  const hit = cache.get(projectId);
  if (hit) return hit;
  const map = new Map<string, RegistryEntry>();
  try {
    const raw = JSON.parse(new TextDecoder().decode(await platform.assets.read(projectId, REGISTRY_PATH)));
    for (const e of raw?.files ?? []) if (e?.path) map.set(e.path, { path: e.path, size: Number(e.size) || 0 });
  } catch {
    /* no registry yet */
  }
  cache.set(projectId, map);
  return map;
}

async function save(projectId: string, map: Map<string, RegistryEntry>) {
  const data = new TextEncoder().encode(JSON.stringify({ format: 'kinema-asset-files', files: [...map.values()] }));
  await platform.assets.write(projectId, REGISTRY_FILE, data, 'application/json');
}

/** Serialize registry updates so concurrent imports don't lose entries. */
function queue<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export function registerFiles(projectId: string, entries: RegistryEntry[]): Promise<void> {
  return queue(async () => {
    const map = await load(projectId);
    for (const e of entries) map.set(e.path, e);
    await save(projectId, map).catch((err) => console.warn('[kinema] asset registry save failed', err));
  });
}

export function listRegisteredFiles(projectId: string): Promise<RegistryEntry[]> {
  return queue(async () => [...(await load(projectId)).values()]);
}

export function unregisterFiles(projectId: string, paths: string[]): Promise<void> {
  return queue(async () => {
    const map = await load(projectId);
    for (const p of paths) map.delete(p);
    await save(projectId, map).catch(() => undefined);
  });
}
