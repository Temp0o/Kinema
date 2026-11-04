/**
 * Renderer-side Electron platform: thin wrapper over the preload bridge
 * (`window.kinemaNative`, see electron/preload.ts).
 */
import type { HttpRequest, HttpResponse, PlatformAPI } from './types';

export interface NativeBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  send(channel: string, ...args: unknown[]): void;
  on(channel: string, cb: (...args: unknown[]) => void): () => void;
  platform: string;
}

declare global {
  interface Window {
    kinemaNative?: NativeBridge;
  }
}

let reqSeq = 0;

export function createElectronPlatform(native: NativeBridge): PlatformAPI {
  const inv = <T>(ch: string, ...args: unknown[]) => native.invoke(ch, ...args) as Promise<T>;
  return {
    kind: 'electron',
    projects: {
      list: () => inv('projects:list'),
      load: (id) => inv('projects:load', id),
      save: (file) => inv('projects:save', file),
      remove: (id) => inv('projects:remove', id),
      saveThumbnail: (id, dataUrl) => inv('projects:thumbnail', id, dataUrl),
    },
    assets: {
      write: (projectId, fileName, data, mime) => inv('assets:write', projectId, fileName, data, mime),
      read: (projectId, path) => inv('assets:read', projectId, path),
      remove: (projectId, path) => inv('assets:remove', projectId, path),
      url: async (projectId, path) => `kasset://${encodeURIComponent(projectId)}/${path.split('/').map(encodeURIComponent).join('/')}`,
      copyAll: (from, to) => inv('assets:copyAll', from, to),
    },
    library: {
      load: () => inv('library:load'),
      save: (data) => inv('library:save', data),
    },
    http: {
      async request(req: HttpRequest, onChunk?: (t: string) => void, signal?: AbortSignal): Promise<HttpResponse> {
        const id = `r${++reqSeq}_${Date.now()}`;
        let off: (() => void) | null = null;
        if (onChunk) off = native.on(`http:chunk:${id}`, (t) => onChunk(t as string));
        const onAbort = () => native.send('http:abort', id);
        signal?.addEventListener('abort', onAbort);
        try {
          return (await native.invoke('http:request', id, req, !!onChunk)) as HttpResponse;
        } finally {
          off?.();
          signal?.removeEventListener('abort', onAbort);
        }
      },
    },
    files: {
      saveAs: (opts) => inv('files:saveAs', opts),
      saveFolder: (opts) => inv('files:saveFolder', opts),
      open: (opts) => inv('files:open', opts),
      openInBrowser: (files, entry) => inv('files:openInBrowser', files, entry),
      openExternal: (url) => inv('files:openExternal', url),
    },
    window: {
      minimize: () => native.send('window:minimize'),
      toggleMaximize: () => native.send('window:toggleMaximize'),
      close: () => native.send('window:close'),
      setTheme: (theme) => native.send('window:setTheme', theme),
      platform: native.platform,
      rendererReady: () => native.send('app:renderer-ready'),
      onBeforeClose: (cb) =>
        native.on('app:before-close', () => {
          void cb()
            .catch(() => {})
            .finally(() => native.send('app:ready-to-close'));
        }),
      onOpenFile: (cb) => native.on('app:open-file', (f) => cb(f as { name: string; data: Uint8Array })),
    },
    dataLocation: () => inv('app:dataLocation'),
  };
}
