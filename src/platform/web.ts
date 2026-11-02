/**
 * Browser implementation of the platform API (used by `npm run dev:web`, tests and
 * as a fallback). Projects, assets and the library live in IndexedDB.
 */
import type { LibraryData, ProjectFile, ProjectMeta } from '@/core/model/types';
import type { HttpRequest, HttpResponse, OutFile, PickedFile, PlatformAPI } from './types';

const DB_NAME = 'kinema';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects');
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets');
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const d = await db();
  return new Promise<T>((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    let result: T;
    if (r) r.onsuccess = () => (result = r.result);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

async function allEntries<T>(store: string): Promise<{ key: string; value: T }[]> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const out: { key: string; value: T }[] = [];
    const t = d.transaction(store, 'readonly');
    const req = t.objectStore(store).openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        out.push({ key: String(c.key), value: c.value as T });
        c.continue();
      }
    };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}

const blobUrlCache = new Map<string, string>();

function download(name: string, data: Uint8Array | string | Blob, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
    svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp',
    ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    json: 'application/json', zip: 'application/zip', html: 'text/html', css: 'text/css', js: 'text/javascript',
    kinema: 'application/zip', kinemalib: 'application/zip',
  };
  return map[ext] ?? 'application/octet-stream';
}

export function createWebPlatform(): PlatformAPI {
  return {
    kind: 'web',

    projects: {
      async list() {
        const entries = await allEntries<ProjectMeta>('meta');
        return entries.map((e) => e.value).sort((a, b) => b.updatedAt - a.updatedAt);
      },
      async load(id) {
        const p = await tx<ProjectFile>('projects', 'readonly', (s) => s.get(id));
        if (!p) throw new Error(`Project ${id} not found`);
        return p;
      },
      async save(file) {
        const prev = await tx<ProjectMeta | undefined>('meta', 'readonly', (s) => s.get(file.id));
        const meta: ProjectMeta = {
          id: file.id,
          name: file.name,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
          thumbnail: prev?.thumbnail,
          pageCount: file.document.pages.length,
        };
        await tx('projects', 'readwrite', (s) => s.put(file, file.id));
        await tx('meta', 'readwrite', (s) => s.put(meta, file.id));
      },
      async remove(id) {
        await tx('projects', 'readwrite', (s) => s.delete(id));
        await tx('meta', 'readwrite', (s) => s.delete(id));
        const assets = await allEntries<unknown>('assets');
        for (const a of assets) if (a.key.startsWith(id + '/')) await tx('assets', 'readwrite', (s) => s.delete(a.key));
      },
      async saveThumbnail(id, dataUrl) {
        const meta = await tx<ProjectMeta | undefined>('meta', 'readonly', (s) => s.get(id));
        if (!meta) return;
        await tx('meta', 'readwrite', (s) => s.put({ ...meta, thumbnail: dataUrl }, id));
      },
    },

    assets: {
      async write(projectId, fileName, data, mime) {
        const path = `assets/${fileName}`;
        await tx('assets', 'readwrite', (s) => s.put(new Blob([data as BlobPart], { type: mime }), `${projectId}/${path}`));
        const key = `${projectId}/${path}`;
        const old = blobUrlCache.get(key);
        if (old) {
          URL.revokeObjectURL(old);
          blobUrlCache.delete(key);
        }
        return path;
      },
      async read(projectId, path) {
        const blob = await tx<Blob | undefined>('assets', 'readonly', (s) => s.get(`${projectId}/${path}`));
        if (!blob) throw new Error(`Asset not found: ${path}`);
        return new Uint8Array(await blob.arrayBuffer());
      },
      async remove(projectId, path) {
        const key = `${projectId}/${path}`;
        await tx('assets', 'readwrite', (s) => s.delete(key));
        const old = blobUrlCache.get(key);
        if (old) URL.revokeObjectURL(old);
        blobUrlCache.delete(key);
      },
      async url(projectId, path) {
        const key = `${projectId}/${path}`;
        const cached = blobUrlCache.get(key);
        if (cached) return cached;
        const blob = await tx<Blob | undefined>('assets', 'readonly', (s) => s.get(key));
        if (!blob) return '';
        const url = URL.createObjectURL(blob);
        blobUrlCache.set(key, url);
        return url;
      },
      async copyAll(from, to) {
        const entries = await allEntries<Blob>('assets');
        for (const e of entries) {
          if (!e.key.startsWith(from + '/')) continue;
          const nk = to + e.key.slice(from.length);
          await tx('assets', 'readwrite', (s) => s.put(e.value, nk));
        }
      },
    },

    library: {
      async load() {
        const lib = await tx<LibraryData | undefined>('kv', 'readonly', (s) => s.get('library'));
        return lib ?? { format: 'kinema-library', formatVersion: 1, items: [], folders: [] };
      },
      async save(data) {
        await tx('kv', 'readwrite', (s) => s.put(data, 'library'));
      },
    },

    http: {
      async request(req: HttpRequest, onChunk?: (t: string) => void, signal?: AbortSignal): Promise<HttpResponse> {
        const ctrl = new AbortController();
        const onAbort = () => ctrl.abort();
        signal?.addEventListener('abort', onAbort);
        const timer = req.timeoutMs ? setTimeout(() => ctrl.abort(), req.timeoutMs) : null;
        try {
          const res = await fetch(req.url, { method: req.method ?? 'GET', headers: req.headers, body: req.body, signal: ctrl.signal });
          if (timer) clearTimeout(timer);
          if (onChunk && res.body) {
            const reader = res.body.getReader();
            const dec = new TextDecoder();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              onChunk(dec.decode(value, { stream: true }));
            }
            return { ok: res.ok, status: res.status, text: '' };
          }
          return { ok: res.ok, status: res.status, text: await res.text() };
        } finally {
          if (timer) clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
        }
      },
    },

    files: {
      async saveAs({ suggestedName, data }) {
        download(suggestedName, data, guessMime(suggestedName));
        return suggestedName;
      },
      async saveFolder({ suggestedName, files }) {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        for (const f of files) zip.file(f.path, f.data);
        const blob = await zip.generateAsync({ type: 'blob' });
        download(`${suggestedName}.zip`, blob);
        return `${suggestedName}.zip`;
      },
      open({ accept, multiple }) {
        return new Promise<PickedFile[]>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = !!multiple;
          if (accept?.length) input.accept = accept.map((a) => (a.includes('/') ? a : '.' + a)).join(',');
          input.style.display = 'none';
          document.body.appendChild(input);
          let settled = false;
          input.onchange = async () => {
            settled = true;
            const files = Array.from(input.files ?? []);
            const out = await Promise.all(
              files.map(async (f) => ({ name: f.name, mime: f.type || guessMime(f.name), data: new Uint8Array(await f.arrayBuffer()) })),
            );
            input.remove();
            resolve(out);
          };
          // resolve empty on cancel
          window.addEventListener(
            'focus',
            () =>
              setTimeout(() => {
                if (!settled) {
                  input.remove();
                  resolve([]);
                }
              }, 600),
            { once: true },
          );
          input.click();
        });
      },
      async openInBrowser(files: OutFile[], entry: string) {
        // Inline everything into one HTML document and open it via a blob URL.
        const byPath = new Map(files.map((f) => [f.path, f]));
        const entryFile = byPath.get(entry);
        if (!entryFile) return;
        let html = typeof entryFile.data === 'string' ? entryFile.data : new TextDecoder().decode(entryFile.data);
        const urls = new Map<string, string>();
        for (const f of files) {
          if (f.path === entry) continue;
          const blob = new Blob([f.data as BlobPart], { type: guessMime(f.path) });
          urls.set(f.path, URL.createObjectURL(blob));
        }
        // rewrite references (longest first)
        const paths = [...urls.keys()].sort((a, b) => b.length - a.length);
        for (const p of paths) html = html.split(`"${p}"`).join(`"${urls.get(p)}"`).split(`(${p})`).join(`(${urls.get(p)})`);
        const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
        window.open(url, '_blank');
      },
      async openExternal(url) {
        window.open(url, '_blank', 'noopener');
      },
    },

    window: null,

    async dataLocation() {
      return 'Browser storage (IndexedDB)';
    },
  };
}

export { guessMime };
