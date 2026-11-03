/**
 * App-side glue around the pure compiler: platform readers (with caches),
 * preview/code-view option presets, saving, clipboard and "open in browser".
 */
import { toast } from 'sonner';
import { platform } from '@/platform';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { useAssetUrls } from '@/core/assets/assetStore';
import { currentRootId } from '@/core/store/actions';
import type { KAsset, KDocument } from '@/core/model/types';
import type { FontFile } from '@/core/fonts/designFonts';
import { compileFragment, compileSite, compileSiteText, slugify, type CompileResult, type ExportOptions, type OutFile } from '@/core/export';

// ─── readers (cached per session) ────────────────────────────────────────────

const fontCache = new Map<string, Promise<Uint8Array>>();
const assetCache = new Map<string, Promise<Uint8Array>>();

export function readFont(file: FontFile): Promise<Uint8Array> {
  let p = fontCache.get(file.url);
  if (!p) {
    p = fetch(file.url).then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    p.catch(() => fontCache.delete(file.url));
    fontCache.set(file.url, p);
  }
  return p;
}

export function readAsset(asset: KAsset): Promise<Uint8Array> {
  const projectId = useUI.getState().projectId;
  if (!projectId) return Promise.reject(new Error('no project open'));
  const key = `${projectId}/${asset.path}/${asset.size}`;
  let p = assetCache.get(key);
  if (!p) {
    p = platform.assets.read(projectId, asset.path);
    p.catch(() => assetCache.delete(key));
    assetCache.set(key, p);
  }
  return p;
}

export const readers: Pick<ExportOptions, 'readAsset' | 'readFont'> = { readAsset, readFont };

// ─── option presets ──────────────────────────────────────────────────────────

const absolute = (url: string) => {
  try {
    return new URL(url, document.baseURI).href;
  } catch {
    return url;
  }
};

/** Live preview / in-app rendering: one self-contained page, assets by URL. */
export function previewOptions(extra: ExportOptions = {}): ExportOptions {
  return {
    bundle: 'single',
    assets: 'external',
    assetUrl: (a) => useAssetUrls.getState().urls[a.id],
    fontUrl: (f) => absolute(f.url),
    title: siteTitle(),
    ...extra,
  };
}

export function siteTitle(): string {
  const doc = useDoc.getState().doc;
  return doc.settings.title || useUI.getState().projectName || 'Untitled';
}

export function siteSlug(): string {
  return slugify(useUI.getState().projectName || useDoc.getState().doc.settings.title || '') || 'site';
}

export function activePageId(doc: KDocument = useDoc.getState().doc): string | null {
  const id = useUI.getState().activePageId;
  return doc.pages.find((p) => p.id === id)?.id ?? doc.pages[0]?.id ?? null;
}

// ─── actions ─────────────────────────────────────────────────────────────────

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied to clipboard`);
  } catch (err) {
    toast.error(`Could not copy ${what.toLowerCase()}`, { description: String(err) });
  }
}

/** Copy the selection (or the current page) as a self-contained HTML + CSS snippet. */
export function copySelectionCode() {
  const doc = useDoc.getState().doc;
  const sel = useUI.getState().selection[0];
  const id = sel && doc.nodes[sel] ? sel : currentRootId();
  if (!id) return;
  const f = compileFragment(doc, id, { title: siteTitle() });
  const parts = [`<style>\n${f.css.trim()}\n</style>`, f.html.trim()];
  if (f.js) parts.push(`<script>\n${f.js.trim()}\n</script>`);
  void copyText(parts.join('\n\n') + '\n', sel ? 'Element code' : 'Page code');
}

/** Write a compiled site to a temp location and open it in the system browser. */
export async function openInBrowser(opts: ExportOptions) {
  try {
    // The web platform opens a single blob document, so inline everything there.
    const result: CompileResult = await compileSite(
      useDoc.getState().doc,
      platform.kind === 'web' ? { ...opts, ...readers, bundle: 'single', assets: 'inline' } : { ...opts, ...readers },
    );
    await platform.files.openInBrowser(result.files, result.entry);
  } catch (err) {
    console.error(err);
    toast.error('Could not open the page in your browser', { description: String(err) });
  }
}

export function openCurrentPageInBrowser() {
  const pid = activePageId();
  return openInBrowser({ pageIds: pid ? [pid] : undefined, title: siteTitle() });
}

export type ExportFormat = 'folder' | 'single' | 'zip';

export async function zipFiles(files: OutFile[]): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.data);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** Save a compile result in the chosen format. Returns the saved location, or null if cancelled. */
export async function saveResult(result: CompileResult, format: ExportFormat, name: string): Promise<string | null> {
  if (format === 'zip') {
    const data = await zipFiles(result.files);
    return platform.files.saveAs({ suggestedName: `${name}.zip`, data, filters: [{ name: 'ZIP archive', extensions: ['zip'] }] });
  }
  if (format === 'single' && result.files.length === 1) {
    return platform.files.saveAs({
      suggestedName: `${name}.html`,
      data: result.files[0].data,
      filters: [{ name: 'HTML document', extensions: ['html'] }],
    });
  }
  return platform.files.saveFolder({ suggestedName: name, files: result.files });
}

export { compileSite, compileSiteText, compileFragment };
