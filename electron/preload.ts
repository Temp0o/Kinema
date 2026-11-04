import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const INVOKE_PREFIXES = ['projects:', 'assets:', 'library:', 'http:', 'files:', 'app:'];
const SEND_CHANNELS = new Set(['http:abort', 'window:minimize', 'window:toggleMaximize', 'window:close', 'window:setTheme', 'app:ready-to-close', 'app:renderer-ready']);
const ON_PREFIXES = ['http:chunk:', 'window:', 'app:'];

const allowed = (ch: string, prefixes: string[]) => prefixes.some((p) => ch.startsWith(p));

contextBridge.exposeInMainWorld('kinemaNative', {
  platform: process.platform,
  invoke(channel: string, ...args: unknown[]) {
    if (!allowed(channel, INVOKE_PREFIXES)) return Promise.reject(new Error(`Blocked channel ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
  send(channel: string, ...args: unknown[]) {
    if (SEND_CHANNELS.has(channel)) ipcRenderer.send(channel, ...args);
  },
  on(channel: string, cb: (...args: unknown[]) => void) {
    if (!allowed(channel, ON_PREFIXES)) return () => {};
    const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
