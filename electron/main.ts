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

const SAFE_ID = /^[a-z0-9_-]{1,64}$/i;
function projectDir(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error('Invalid project id');
  return path.join(projectsDir(), id);
}

/** Resolve `rel` inside `base`, refusing path traversal. */
function safeJoin(base: string, rel: string): string {
  const target = path.resolve(base, rel);
  const root = path.resolve(base) + path.sep;
  if (!target.startsWith(root)) throw new Error('Path escapes base directory');
  return target;
}

async function writeAtomic(file: string, data: string | Uint8Array) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';
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

function registerIpc() {
  ipcMain.handle('app:dataLocation', () => dataRoot());

  ipcMain.handle('projects:list', async () => {
    await fs.mkdir(projectsDir(), { recursive: true });
    const entries = await fs.readdir(projectsDir(), { withFileTypes: true });
    const metas: Meta[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || !SAFE_ID.test(e.name)) continue;
      const meta = await readJson<Meta>(path.join(projectsDir(), e.name, 'meta.json'));
      if (!meta) continue;
      const thumb = path.join(projectsDir(), e.name, 'thumbnail.png');
      if (existsSync(thumb)) meta.thumbnail = `kasset://${e.name}/thumbnail.png?v=${meta.updatedAt}`;
      metas.push(meta);
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  });

  ipcMain.handle('projects:load', async (_e, id: string) => {
    const file = await readJson(path.join(projectDir(id), 'project.json'));
    if (!file) throw new Error('Project not found or unreadable');
    return file;
  });

  ipcMain.handle('projects:save', async (_e, file: { id: string; name: string; createdAt: number; updatedAt: number; document: { pages: unknown[] } }) => {
    const dir = projectDir(file.id);
    await writeAtomic(path.join(dir, 'project.json'), JSON.stringify(file));
    const meta: Meta = { id: file.id, name: file.name, createdAt: file.createdAt, updatedAt: file.updatedAt, pageCount: file.document.pages.length };
    await writeAtomic(path.join(dir, 'meta.json'), JSON.stringify(meta));
  });

  ipcMain.handle('projects:remove', async (_e, id: string) => {
    const dir = projectDir(id);
    // Move to a trash folder instead of hard delete, so mistakes are recoverable.
    const trash = path.join(dataRoot(), '.trash');
    await fs.mkdir(trash, { recursive: true });
    if (existsSync(dir)) await fs.rename(dir, path.join(trash, `${id}-${Date.now()}`));
  });

  ipcMain.handle('projects:thumbnail', async (_e, id: string, dataUrl: string) => {
    const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
    if (!m) return;
    await writeAtomic(path.join(projectDir(id), 'thumbnail.png'), Buffer.from(m[1], 'base64'));
  });

  // ─── assets ───────────────────────────────────────────────────────────────
  ipcMain.handle('assets:write', async (_e, projectId: string, fileName: string, data: Uint8Array) => {
    const rel = `assets/${sanitizeFileName(fileName)}`;
    await writeAtomic(safeJoin(projectDir(projectId), rel), Buffer.from(data));
    return rel;
  });
  ipcMain.handle('assets:read', async (_e, projectId: string, rel: string) => {
    return new Uint8Array(await fs.readFile(safeJoin(projectDir(projectId), rel)));
  });
  ipcMain.handle('assets:remove', async (_e, projectId: string, rel: string) => {
    await fs.rm(safeJoin(projectDir(projectId), rel), { force: true });
  });
  ipcMain.handle('assets:copyAll', async (_e, from: string, to: string) => {
    const src = path.join(projectDir(from), 'assets');
    if (!existsSync(src)) return;
    await fs.cp(src, path.join(projectDir(to), 'assets'), { recursive: true });
    const thumb = path.join(projectDir(from), 'thumbnail.png');
    if (existsSync(thumb)) await fs.copyFile(thumb, path.join(projectDir(to), 'thumbnail.png'));
  });

  // ─── library ──────────────────────────────────────────────────────────────
  ipcMain.handle('library:load', async () => {
    const lib = await readJson(path.join(libraryDir(), 'library.json'));
    return lib ?? { format: 'kinema-library', formatVersion: 1, items: [], folders: [] };
  });
  ipcMain.handle('library:save', async (_e, data: unknown) => {
    await writeAtomic(path.join(libraryDir(), 'library.json'), JSON.stringify(data));
  });

  // ─── HTTP bridge (local AI) ───────────────────────────────────────────────
  const inflight = new Map<string, AbortController>();
  ipcMain.on('http:abort', (_e, id: string) => inflight.get(id)?.abort());
  ipcMain.handle(
    'http:request',
    async (e, id: string, req: { url: string; method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number }, stream: boolean) => {
      if (!/^https?:\/\//i.test(req.url)) throw new Error('Only http(s) URLs are allowed');
      const ctrl = new AbortController();
      inflight.set(id, ctrl);
      const timer = req.timeoutMs ? setTimeout(() => ctrl.abort(), req.timeoutMs) : null;
      try {
        const res = await fetch(req.url, { method: req.method ?? 'GET', headers: req.headers, body: req.body, signal: ctrl.signal });
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
  ipcMain.handle('files:saveAs', async (_e, opts: { suggestedName: string; data: Uint8Array | string; filters?: { name: string; extensions: string[] }[] }) => {
    const res = await dialog.showSaveDialog(win!, { defaultPath: path.join(app.getPath('documents'), sanitizeFileName(opts.suggestedName)), filters: opts.filters });
    if (res.canceled || !res.filePath) return null;
    await fs.writeFile(res.filePath, typeof opts.data === 'string' ? opts.data : Buffer.from(opts.data));
    return res.filePath;
  });

  ipcMain.handle('files:saveFolder', async (_e, opts: { suggestedName: string; files: { path: string; data: Uint8Array | string }[] }) => {
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
    for (const f of opts.files) {
      const target = safeJoin(dir, f.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, typeof f.data === 'string' ? f.data : Buffer.from(f.data));
    }
    shell.showItemInFolder(path.join(dir, opts.files[0]?.path ?? ''));
    return dir;
  });

  ipcMain.handle('files:open', async (_e, opts: { accept?: string[]; multiple?: boolean }) => {
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

  ipcMain.handle('files:openInBrowser', async (_e, files: { path: string; data: Uint8Array | string }[], entry: string) => {
    const dir = path.join(previewDir(), String(Date.now()));
    for (const f of files) {
      const target = safeJoin(dir, f.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, typeof f.data === 'string' ? f.data : Buffer.from(f.data));
    }
    await shell.openExternal(pathToFileURL(safeJoin(dir, entry)).href);
  });

  ipcMain.handle('files:openExternal', async (_e, url: string) => {
    if (/^(https?:|mailto:)/i.test(url)) await shell.openExternal(url);
  });

  // ─── window ───────────────────────────────────────────────────────────────
  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on('window:close', () => win?.close());
  ipcMain.on('window:setTheme', (_e, theme: 'dark' | 'light') => {
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
        const file = safeJoin(projectDir(projectId), rel);
        const res = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(res.headers);
        headers.set('content-type', mimeOf(file));
        headers.set('cache-control', 'no-cache');
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
