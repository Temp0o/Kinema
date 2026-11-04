import type { LibraryData, ProjectFile, ProjectMeta } from '@/core/model/types';

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  /** ms before giving up (connection/first byte). Default 10s for GET, none for streaming. */
  timeoutMs?: number;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  /** Full body text (empty when streamed via onChunk). */
  text: string;
}

export interface OutFile {
  /** relative path, forward slashes (e.g. `assets/logo.png`) */
  path: string;
  data: Uint8Array | string;
}

export interface PickedFile {
  name: string;
  mime: string;
  data: Uint8Array;
}

export interface PlatformAPI {
  kind: 'electron' | 'web';

  projects: {
    list(): Promise<ProjectMeta[]>;
    load(id: string): Promise<ProjectFile>;
    /** Create or overwrite. Updates the meta index. */
    save(file: ProjectFile): Promise<void>;
    remove(id: string): Promise<void>;
    saveThumbnail(id: string, dataUrl: string): Promise<void>;
  };

  assets: {
    /** Store a binary asset for a project; returns its relative path (e.g. `assets/x.png`). */
    write(projectId: string, fileName: string, data: Uint8Array, mime: string): Promise<string>;
    read(projectId: string, path: string): Promise<Uint8Array>;
    remove(projectId: string, path: string): Promise<void>;
    /** URL usable in <img src>/CSS for an asset (kasset:// in Electron, blob: in web). */
    url(projectId: string, path: string, mime?: string): Promise<string>;
    /** Copy all assets of one project to another (project duplicate). */
    copyAll(fromProjectId: string, toProjectId: string): Promise<void>;
  };

  library: {
    load(): Promise<LibraryData>;
    save(data: LibraryData): Promise<void>;
  };

  /** HTTP for local AI servers (routed through the main process in Electron to avoid CORS). */
  http: {
    request(req: HttpRequest, onChunk?: (text: string) => void, signal?: AbortSignal): Promise<HttpResponse>;
  };

  files: {
    /** Save a single file. Returns saved path/name or null if cancelled. */
    saveAs(opts: { suggestedName: string; data: Uint8Array | string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>;
    /** Save many files into a user-chosen folder (web: downloads a zip). */
    saveFolder(opts: { suggestedName: string; files: OutFile[] }): Promise<string | null>;
    /** Pick files from disk. `accept` = extensions without dots, or mime patterns. */
    open(opts: { accept?: string[]; multiple?: boolean }): Promise<PickedFile[]>;
    /** Write a site to a temp folder and open `entry` in the system browser. */
    openInBrowser(files: OutFile[], entry: string): Promise<void>;
    openExternal(url: string): Promise<void>;
  };

  /** Native window controls (Electron only). */
  window: null | {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    setTheme(theme: 'dark' | 'light'): void;
    platform: string;
    /** Tell the main process the renderer is ready (receives queued .kinema files). */
    rendererReady(): void;
    /** Called before the window closes; resolve when it is safe to close. */
    onBeforeClose(cb: () => Promise<void>): () => void;
    /** A .kinema file was opened from the OS (double-click / Open with). */
    onOpenFile(cb: (file: { name: string; data: Uint8Array }) => void): () => void;
  };

  /** Human-readable data location (for settings/about). */
  dataLocation(): Promise<string>;
}
