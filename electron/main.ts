/**
 * Kinema — Electron main process.
 *
 * Responsibilities: window lifecycle, local project/library storage under
 * Documents/Kinema, the `kasset://` protocol for project assets, file dialogs,
 * and an HTTP bridge so the renderer can talk to local AI servers (Ollama)
 * without CORS restrictions.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, net, protocol, shell } from 'electron';
import { promises as fs, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetRel, checkHttpUrl, isHtmlEntry, isSafeId, isServableProjectPath, sanitizeFileName, safeJoin, validateOutFiles } from './guards';

const isDev = !!process.env.VITE_DEV_SERVER_URL;

protocol.registerSchemesAsPrivileged([
  { scheme: 'kasset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: false } },
]);

// ─── Paths ──────────────────────────────────────────────────────────────────

function dataRoot(): string {
  return process.env.KINEMA_DATA_DIR || path.join(app.getPath('documents'), 'Kinema');
}
const projectsDir = () => path.join(dataRoot(), 'Projects');
const libraryDir = () => path.join(dataRoot(), 'Library');
const previewDir = () => path.join(app.getPath('temp'), 'kinema-preview');

function projectDir(id: string): string {
  if (!isSafeId(id)) throw new Error('Invalid project id');
  return path.join(projectsDir(), id);
}

// Writes to one file are serialised so a slow older write can never land after a newer one.
const writeQueues = new Map<string, Promise<unknown>>();
function writeAtomic(file: string, data: string | Uint8Array, keepBackup = false): Promise<void> {
  const run = async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      const fh = await fs.open(tmp, 'w');
      try {
        await fh.writeFile(data);
        await fh.sync();
      } finally {
        await fh.close();
      }
      // Keep the last good copy so a corrupted write can be recovered from.
      if (keepBackup) await fs.copyFile(file, `${file}.bak`).catch(() => {});
      await fs.rename(tmp, file);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  };
  const prev = writeQueues.get(file) ?? Promise.resolve();
  const next = prev.then(run, run);
  const tail = next.catch(() => {});
  writeQueues.set(file, tail);
  void tail.then(() => writeQueues.get(file) === tail && writeQueues.delete(file));
  return next;
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', json: 'application/json', zip: 'application/zip', html: 'text/html',
  kinema: 'application/zip', kinemalib: 'application/zip',
};
const mimeOf = (name: string) => MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';

// ─── Window ─────────────────────────────────────────────────────────────────

let win: BrowserWindow | null = null;

const THEME_COLORS = {
  dark: { color: '#0d0d12', symbolColor: '#c9c9d6' },
  light: { color: '#f4f4f8', symbolColor: '#2a2a35' },
};

function createWindow() {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0d0d12',
    title: 'Kinema',
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin' ? { titleBarOverlay: { ...THEME_COLORS.dark, height: 40 } } : { trafficLightPosition: { x: 14, y: 13 } }),
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win?.show());
  // No camera/mic/geolocation/notification prompts, ever (the clipboard is all the editor needs); no <webview>.
  const OK_PERMS = new Set(['clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
  win.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => cb(OK_PERMS.has(perm)));
  win.webContents.session.setPermissionCheckHandler((_wc, perm) => OK_PERMS.has(perm));
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
  win.on('closed', () => (win = null));

  // Never navigate the editor window away; open http(s) links externally.
  win.webContents.on('will-navigate', (e, url) => {
    if (isDev && url.startsWith(process.env.VITE_DEV_SERVER_URL!)) return;
    e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}

// ─── IPC: projects ──────────────────────────────────────────────────────────

interface Meta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  pageCount?: number;
}

/** IPC is only honoured from the editor window's top-level frame (never from embedded preview frames). */
function fromEditor(e: { sender: Electron.WebContents; senderFrame?: Electron.WebFrameMain | null }): boolean {
  return !!win && e.sender === win.webContents && (!e.senderFrame || e.senderFrame === win.webContents.mainFrame);
}

function registerIpc() {
  const handle = (ch: string, fn: (e: Electron.IpcMainInvokeEvent, ...a: any[]) => unknown) =>
    ipcMain.handle(ch, (e, ...a) => {
      if (!fromEditor(e)) throw new Error('Blocked IPC sender');
      return fn(e, ...a);
    });
  const on = (ch: string, fn: (e: Electron.IpcMainEvent, ...a: any[]) => void) =>
    ipcMain.on(ch, (e, ...a) => {
      if (fromEditor(e)) fn(e, ...a);
    });
  const ipc = { handle, on };

  ipc.handle('app:dataLocation', () => dataRoot());

  ipc.handle('projects:list', async () => {
    await fs.mkdir(projectsDir(), { recursive: true });
    const entries = await fs.readdir(projectsDir(), { withFileTypes: true });
    const metas: Meta[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || !isSafeId(e.name)) continue;
      const meta = await readJson<Meta>(path.join(projectsDir(), e.name, 'meta.json'));
      if (!meta) continue;
      const thumb = path.join(projectsDir(), e.name, 'thumbnail.png');
      if (existsSync(thumb)) meta.thumbnail = `kasset://${e.name}/thumbnail.png?v=${meta.updatedAt}`;
      metas.push(meta);
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  });

  ipc.handle('projects:load', async (_e, id: string) => {
    const main = path.join(projectDir(id), 'project.json');
    // Fall back to the previous good copy if the latest write was corrupted.
    const file = (await readJson(main)) ?? (await readJson(`${main}.bak`));
    if (!file) throw new Error('Project not found or unreadable');
    return file;
  });

  ipc.handle('projects:save', async (_e, file: { id: string; name: string; createdAt: number; updatedAt: number; document: { pages: unknown[] } }) => {
    if (!file || typeof file !== 'object' || !file.document || !Array.isArray(file.document.pages)) throw new Error('Invalid project file');
    const dir = projectDir(file.id);
    await writeAtomic(path.join(dir, 'project.json'), JSON.stringify(file), true);
    const meta: Meta = { id: file.id, name: String(file.name ?? ''), createdAt: Number(file.createdAt) || Date.now(), updatedAt: Number(file.updatedAt) || Date.now(), pageCount: file.document.pages.length };
    await writeAtomic(path.join(dir, 'meta.json'), JSON.stringify(meta));
  });

  ipc.handle('projects:remove', async (_e, id: string) => {
    const dir = projectDir(id);
    // Move to a trash folder instead of hard delete, so mistakes are recoverable.
    const trash = path.join(dataRoot(), '.trash');
    await fs.mkdir(trash, { recursive: true });
    if (existsSync(dir)) await fs.rename(dir, path.join(trash, `${id}-${Date.now()}`));
  });

  ipc.handle('projects:thumbnail', async (_e, id: string, dataUrl: string) => {
    const m = typeof dataUrl === 'string' && dataUrl.length < 8_000_000 ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl) : null;
    if (!m) return;
    // A late thumbnail for a project that was just deleted must not resurrect its folder.
    if (!existsSync(path.join(projectDir(id), 'project.json'))) return;
    await writeAtomic(path.join(projectDir(id), 'thumbnail.png'), Buffer.from(m[1], 'base64'));
  });

  // ─── assets ───────────────────────────────────────────────────────────────
  ipc.handle('assets:write', async (_e, projectId: string, fileName: string, data: Uint8Array) => {
    const rel = `assets/${sanitizeFileName(fileName)}`;
    if (!(data instanceof Uint8Array)) throw new Error('Invalid asset data');
    await writeAtomic(safeJoin(projectDir(projectId), rel), data);
    return rel;
  });
  ipc.handle('assets:read', async (_e, projectId: string, rel: string) => {
    return new Uint8Array(await fs.readFile(safeJoin(projectDir(projectId), assetRel(rel))));
  });
  ipc.handle('assets:remove', async (_e, projectId: string, rel: string) => {
    await fs.rm(safeJoin(projectDir(projectId), assetRel(rel)), { force: true });
  });
  ipc.handle('assets:copyAll', async (_e, from: string, to: string) => {
    const src = path.join(projectDir(from), 'assets');
    if (!existsSync(src)) return;
    await fs.cp(src, path.join(projectDir(to), 'assets'), { recursive: true });
    const thumb = path.join(projectDir(from), 'thumbnail.png');
    if (existsSync(thumb)) await fs.copyFile(thumb, path.join(projectDir(to), 'thumbnail.png'));
  });

  // ─── library ──────────────────────────────────────────────────────────────
  ipc.handle('library:load', async () => {
    const file = path.join(libraryDir(), 'library.json');
    const lib = (await readJson(file)) ?? (await readJson(`${file}.bak`));
    return lib ?? { format: 'kinema-library', formatVersion: 1, items: [], folders: [] };
  });
  ipc.handle('library:save', async (_e, data: unknown) => {
    await writeAtomic(path.join(libraryDir(), 'library.json'), JSON.stringify(data), true);
  });

  // ─── HTTP bridge (local AI) ───────────────────────────────────────────────
  const inflight = new Map<string, AbortController>();
  ipc.on('http:abort', (_e, id: string) => inflight.get(id)?.abort());
  ipc.handle(
    'http:request',
    async (e, id: string, req: { url: string; method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }, stream: boolean) => {
      if (!req || typeof id !== 'string') throw new Error('Invalid request');
      // Local AI servers only (loopback / LAN); see electron/guards.ts for the policy.
      const denied = checkHttpUrl(req.url, (process.env.KINEMA_HTTP_ALLOW ?? '').split(','));
      if (denied) throw new Error(denied);
      const ctrl = new AbortController();
      inflight.set(id, ctrl);
      const timer = req.timeoutMs ? setTimeout(() => ctrl.abort(), req.timeoutMs) : null;
      try {
        const res = await fetch(req.url, {
          method: ['GET', 'POST', 'DELETE'].includes(req.method ?? '') ? req.method : 'GET',
          headers: req.headers,
          body: req.body,
          signal: ctrl.signal,
          redirect: 'error', // a redirect could leave the local network
        });
        if (timer) clearTimeout(timer);
        if (stream && res.body) {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!e.sender.isDestroyed()) e.sender.send(`http:chunk:${id}`, dec.decode(value, { stream: true }));
          }
          return { ok: res.ok, status: res.status, text: '' };
        }
        return { ok: res.ok, status: res.status, text: await res.text() };
      } catch (err) {
        if (ctrl.signal.aborted) throw new Error('aborted');
        throw new Error(err instanceof Error ? err.message : String(err));
      } finally {
        if (timer) clearTimeout(timer);
        inflight.delete(id);
      }
    },
  );

  // ─── files ────────────────────────────────────────────────────────────────
  ipc.handle('files:saveAs', async (_e, opts: { suggestedName: string; data: Uint8Array | string; filters?: { name: string; extensions: string[] }[] }) => {
    const res = await dialog.showSaveDialog(win!, { defaultPath: path.join(app.getPath('documents'), sanitizeFileName(opts.suggestedName)), filters: opts.filters });
    if (res.canceled || !res.filePath) return null;
    await fs.writeFile(res.filePath, typeof opts.data === 'string' ? opts.data : Buffer.from(opts.data));
    return res.filePath;
  });

  ipc.handle('files:saveFolder', async (_e, opts: { suggestedName: string; files: { path: string; data: Uint8Array | string }[] }) => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choose export location',
      buttonLabel: 'Export here',
      defaultPath: app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    let dir = path.join(res.filePaths[0], sanitizeFileName(opts.suggestedName));
    let n = 2;
    while (existsSync(dir)) dir = path.join(res.filePaths[0], `${sanitizeFileName(opts.suggestedName)}-${n++}`);
    const files = validateOutFiles(dir, opts.files); // validate everything before writing anything
    for (const f of files) {
      await fs.mkdir(path.dirname(f.target), { recursive: true });
      await fs.writeFile(f.target, f.data);
    }
    shell.showItemInFolder(files[0]?.target ?? dir);
    return dir;
  });

  ipc.handle('files:open', async (_e, opts: { accept?: string[]; multiple?: boolean }) => {
    const exts = (opts.accept ?? []).filter((a) => !a.includes('/'));
    const res = await dialog.showOpenDialog(win!, {
      properties: opts.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: exts.length ? [{ name: 'Supported files', extensions: exts }] : undefined,
    });
    if (res.canceled) return [];
    return Promise.all(
      res.filePaths.map(async (p) => ({ name: path.basename(p), mime: mimeOf(p), data: new Uint8Array(await fs.readFile(p)) })),
    );
  });

  ipc.handle('files:openInBrowser', async (_e, files: { path: string; data: Uint8Array | string }[], entry: string) => {
    const dir = path.join(previewDir(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const out = validateOutFiles(dir, files);
    // Only html documents may be handed to the OS opener (never an executable the export happens to contain).
    if (typeof entry !== 'string' || !isHtmlEntry(entry)) throw new Error('Preview entry must be an html file');
    const entryTarget = safeJoin(dir, entry);
    for (const f of out) {
      await fs.mkdir(path.dirname(f.target), { recursive: true });
      await fs.writeFile(f.target, f.data);
    }
    await shell.openExternal(pathToFileURL(entryTarget).href);
  });

  ipc.handle('files:openExternal', async (_e, url: string) => {
    if (typeof url === 'string' && url.length < 4096 && /^(https?:|mailto:)/i.test(url)) await shell.openExternal(url);
  });

  // ─── window ───────────────────────────────────────────────────────────────
  ipc.on('window:minimize', () => win?.minimize());
  ipc.on('window:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipc.on('window:close', () => win?.close());
  ipc.on('window:setTheme', (_e, theme: 'dark' | 'light') => {
    nativeTheme.themeSource = theme;
    if (process.platform !== 'darwin') win?.setTitleBarOverlay?.({ ...THEME_COLORS[theme], height: 40 });
    win?.setBackgroundColor(theme === 'dark' ? '#0d0d12' : '#f4f4f8');
  });
}

// ─── App lifecycle ──────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    protocol.handle('kasset', async (request) => {
      try {
        const url = new URL(request.url);
        const projectId = decodeURIComponent(url.hostname);
        const rel = decodeURIComponent(url.pathname.replace(/^\//, ''));
        // Only assets and the thumbnail are served, never project.json / meta.json.
        if (!isServableProjectPath(rel)) return new Response('Not found', { status: 404 });
        const file = safeJoin(projectDir(projectId), rel);
        const res = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(res.headers);
        headers.set('content-type', mimeOf(file));
        headers.set('cache-control', 'no-cache');
        headers.set('x-content-type-options', 'nosniff');
        // An uploaded SVG opened as a document must not be able to run anything.
        headers.set('content-security-policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox");
        headers.set('access-control-allow-origin', '*');
        return new Response(res.body, { status: res.status, headers });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });

    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
    } else {
      Menu.setApplicationMenu(null);
    }

    registerIpc();
    await fs.mkdir(projectsDir(), { recursive: true });
    await fs.mkdir(libraryDir(), { recursive: true });
    fs.rm(previewDir(), { recursive: true, force: true }).catch(() => {});
    createWindow();

    if (isDev || process.env.KINEMA_DEVTOOLS) {
      win?.webContents.on('before-input-event', (_e, input) => {
        if (input.type === 'keyDown' && input.key === 'F12') win?.webContents.toggleDevTools();
      });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}
