/**
 * Asset import API (owned by the assets module). Other modules (canvas file drops,
 * paste handling, AI) call these functions.
 */
import { sanitizeSvgMarkup } from '@/core/export/sanitize';
import { toast } from 'sonner';
import type { AssetKind, KAsset, KNode, NodeId } from '@/core/model/types';
import type { PickedFile } from '@/platform';
import { platform } from '@/platform';
import { createNode, uid } from '@/core/model/factory';
import { docApi } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { ensureAssetUrl } from '@/core/assets/assetStore';
import { insertSubtrees } from '@/features/insert/placement';
import {
  MAX_ASSET_BYTES,
  detectAssetKind,
  displayBaseName,
  formatBytes,
  hashBytes,
  mimeFor,
  normalizeSvgRoot,
  parseFontFileName,
  safeFileName,
  svgDimensions,
  tagSvgWithAsset,
} from './assetKinds';
import { registerFiles } from './fileRegistry';

export interface ImportedAsset {
  asset: KAsset;
}

// ─── SVG markup cache (nodeForAsset is synchronous) ──────────────────────────

const svgText = new Map<string, string>();
const svgKey = (a: KAsset) => `${a.id}|${a.path}`;

export function getSvgMarkup(asset: KAsset): string | undefined {
  return svgText.get(svgKey(asset));
}

/** Load (and cache) the sanitized markup of an SVG asset. */
export async function loadSvgMarkup(projectId: string, asset: KAsset): Promise<string | undefined> {
  const hit = svgText.get(svgKey(asset));
  if (hit) return hit;
  try {
    const bytes = await platform.assets.read(projectId, asset.path);
    const text = sanitizeSvg(new TextDecoder().decode(bytes));
    if (text) svgText.set(svgKey(asset), text);
    return text || undefined;
  } catch {
    return undefined;
  }
}

/** Warm the SVG cache for every SVG asset of the current document. */
export async function warmSvgCache(projectId: string, assets: KAsset[]) {
  await Promise.all(assets.filter((a) => a.kind === 'svg').map((a) => loadSvgMarkup(projectId, a)));
}

export function sanitizeSvg(text: string): string {
  const clean = sanitizeSvgMarkup(text);
  const m = /<svg[\s\S]*<\/svg>/i.exec(clean);
  return m ? normalizeSvgRoot(m[0]) : '';
}

// ─── Media probing ───────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

async function imageSize(data: Uint8Array, mime: string): Promise<{ width: number; height: number } | null> {
  if (typeof Blob === 'undefined') return null;
  const blob = new Blob([data as BlobPart], { type: mime });
  if (typeof createImageBitmap === 'function') {
    const viaBitmap = await withTimeout(
      createImageBitmap(blob).then((b) => {
        const r = { width: b.width, height: b.height };
        b.close();
        return r as { width: number; height: number } | null;
      }),
      5000,
      null,
    );
    if (viaBitmap) return viaBitmap;
  }
  if (typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(blob);
  return withTimeout(
    new Promise<{ width: number; height: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    }).finally(() => URL.revokeObjectURL(url)),
    5000,
    null,
  );
}

async function videoSize(data: Uint8Array, mime: string): Promise<{ width: number; height: number } | null> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }));
  return withTimeout(
    new Promise<{ width: number; height: number } | null>((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = () => resolve(v.videoWidth ? { width: v.videoWidth, height: v.videoHeight } : null);
      v.onerror = () => resolve(null);
      v.src = url;
    }).finally(() => URL.revokeObjectURL(url)),
    5000,
    null,
  );
}

// ─── Preparing a file ────────────────────────────────────────────────────────

export interface PreparedFile {
  name: string;
  kind: AssetKind;
  mime: string;
  data: Uint8Array;
  hash: string;
  width?: number;
  height?: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  svg?: string;
}

/** Validate, sanitize and probe a picked file. Returns an error message when rejected. */
export async function prepareFile(file: PickedFile): Promise<PreparedFile | string> {
  if (file.data.byteLength > MAX_ASSET_BYTES) return `${file.name} is too large (${formatBytes(file.data.byteLength)}, max 100 MB)`;
  const kind = detectAssetKind(file.name, file.mime);
  if (kind === 'other') return `${file.name}: unsupported file type`;
  const mime = mimeFor(file.name, file.mime);
  const out: PreparedFile = { name: file.name, kind, mime, data: file.data, hash: '' };
  if (kind === 'svg') {
    const svg = sanitizeSvg(new TextDecoder().decode(file.data));
    if (!svg) return `${file.name}: couldn’t read this SVG`;
    out.svg = svg;
    out.data = new TextEncoder().encode(svg);
    out.mime = 'image/svg+xml';
    const d = svgDimensions(svg);
    out.width = Math.round(d.width);
    out.height = Math.round(d.height);
  } else if (kind === 'image') {
    const d = await imageSize(file.data, mime);
    if (d) Object.assign(out, d);
  } else if (kind === 'video') {
    const d = await videoSize(file.data, mime);
    if (d) Object.assign(out, d);
  } else if (kind === 'font') {
    const f = parseFontFileName(file.name);
    out.fontFamily = f.family;
    out.fontWeight = f.weight;
    out.fontStyle = f.style;
  }
  out.hash = await hashBytes(out.data);
  return out;
}

// ─── Dedup ───────────────────────────────────────────────────────────────────

const pathHashes = new Map<string, string>();

async function storedHash(projectId: string, a: KAsset): Promise<string | null> {
  const key = `${projectId}/${a.path}`;
  const hit = pathHashes.get(key);
  if (hit) return hit;
  try {
    const h = await hashBytes(await platform.assets.read(projectId, a.path));
    pathHashes.set(key, h);
    return h;
  } catch {
    return null;
  }
}

async function findDuplicate(projectId: string, p: PreparedFile, assets: KAsset[]): Promise<KAsset | null> {
  for (const a of assets) {
    if (a.size !== p.data.byteLength || a.kind !== p.kind) continue;
    if ((await storedHash(projectId, a)) === p.hash) return a;
  }
  return null;
}

/** Write a prepared file to the project store. Returns the stored relative path. */
export async function writePrepared(projectId: string, id: string, p: PreparedFile, variant?: string): Promise<string> {
  const name = safeFileName(p.name);
  const path = await platform.assets.write(projectId, `${id}-${variant ? variant + '-' : ''}${name}`, p.data, p.mime);
  pathHashes.set(`${projectId}/${path}`, p.hash);
  await registerFiles(projectId, [{ path, size: p.data.byteLength }]);
  return path;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Import files into the current project (writes binaries + registers KAssets in the doc). */
export async function importFiles(files: PickedFile[]): Promise<KAsset[]> {
  const projectId = uiApi.state.projectId;
  if (!projectId) {
    toast.error('Open a project before importing files');
    return [];
  }
  const result: KAsset[] = [];
  const added: KAsset[] = [];
  const errors: string[] = [];
  let dupes = 0;
  for (const file of files) {
    try {
      const p = await prepareFile(file);
      if (typeof p === 'string') {
        errors.push(p);
        continue;
      }
      const existing = await findDuplicate(projectId, p, [...Object.values(docApi.doc.assets), ...added]);
      if (existing) {
        dupes++;
        result.push(existing);
        continue;
      }
      const id = uid('as');
      const path = await writePrepared(projectId, id, p);
      const asset: KAsset = {
        id,
        name: file.name,
        kind: p.kind,
        mime: p.mime,
        size: p.data.byteLength,
        path,
        createdAt: Date.now(),
      };
      if (p.width) asset.width = p.width;
      if (p.height) asset.height = p.height;
      if (p.kind === 'font') {
        asset.fontFamily = p.fontFamily;
        asset.fontWeight = p.fontWeight;
        asset.fontStyle = p.fontStyle;
      }
      if (p.svg) svgText.set(svgKey(asset), p.svg);
      added.push(asset);
      result.push(asset);
    } catch (err) {
      errors.push(`${file.name}: ${String((err as Error)?.message ?? err)}`);
    }
  }
  if (errors.length) toast.error(errors.length === 1 ? errors[0] : `${errors.length} files couldn’t be imported`, errors.length > 1 ? { description: errors.slice(0, 4).join('\n') } : undefined);
  if (uiApi.state.projectId !== projectId) return [];
  if (added.length) {
    docApi.mutate(added.length === 1 ? `Import “${added[0].name}”` : `Import ${added.length} assets`, (d) => {
      for (const a of added) d.assets[a.id] = a;
    });
    await Promise.all(added.map((a) => ensureAssetUrl(projectId, a).catch(() => '')));
  }
  if (dupes && !added.length) toast(dupes === 1 ? 'Already in your assets' : `${dupes} files are already in your assets`);
  return result;
}

const MAX_IMAGE_W = 640;
const MAX_SVG = 320;

function fit(w: number | undefined, h: number | undefined, max: number, byWidthOnly: boolean): { w: number; h: number } {
  const W = w && w > 0 ? w : 320;
  const H = h && h > 0 ? h : 200;
  const s = Math.min(1, byWidthOnly ? max / W : max / Math.max(W, H));
  return { w: Math.max(1, Math.round(W * s)), h: Math.max(1, Math.round(H * s)) };
}

/** Build a node for an asset (image node, editable svg node, video node). Fonts return null. */
export function nodeForAsset(asset: KAsset): KNode | null {
  const name = displayBaseName(asset.name);
  const ref = `asset:${asset.id}`;
  switch (asset.kind) {
    case 'image': {
      const { w, h } = fit(asset.width, asset.height, MAX_IMAGE_W, true);
      return createNode('image', {
        name,
        props: { src: ref, alt: name },
        replaceStyles: true,
        styles: { display: 'block', width: `${w}px`, height: `${h}px`, 'object-fit': 'cover' },
      });
    }
    case 'svg': {
      const markup = getSvgMarkup(asset);
      let { w, h } = fit(asset.width, asset.height, MAX_SVG, false);
      if (Math.max(w, h) < 48) {
        const s = 96 / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      if (!markup) {
        return createNode('image', { name, props: { src: ref, alt: name }, replaceStyles: true, styles: { display: 'block', width: `${w}px`, height: `${h}px` } });
      }
      return createNode('svg', {
        name,
        props: { svg: tagSvgWithAsset(markup, asset.id) },
        replaceStyles: true,
        styles: { display: 'block', width: `${w}px`, height: `${h}px` },
      });
    }
    case 'video': {
      const { w, h } = fit(asset.width ?? 1280, asset.height ?? 720, MAX_IMAGE_W, true);
      return createNode('video', {
        name,
        props: { src: ref, muted: true, loop: true, autoplay: true, controls: false },
        replaceStyles: true,
        styles: { display: 'block', width: `${w}px`, height: `${h}px`, 'object-fit': 'cover', 'background-color': '#000000' },
      });
    }
    default:
      return null;
  }
}

/** Size hint (px) of the node an asset would create. */
export function assetNodeSize(node: KNode): { w: number; h: number } {
  return { w: parseFloat(node.styles.base.width) || 240, h: parseFloat(node.styles.base.height) || 160 };
}

/** Insert nodes for already-imported assets at the insertion target (or given parent/point). */
export function insertAssets(assets: KAsset[], parentId?: NodeId, point?: { x: number; y: number }): NodeId[] {
  const subs = assets
    .map((a) => nodeForAsset(a))
    .filter((n): n is KNode => !!n)
    .map((n) => ({ sub: { rootId: n.id, nodes: { [n.id]: n } }, size: assetNodeSize(n) }));
  if (!subs.length) return [];
  const label = subs.length === 1 ? `Insert ${subs[0].sub.nodes[subs[0].sub.rootId].name}` : `Insert ${subs.length} assets`;
  return insertSubtrees(subs, { label, parentId, point });
}

/**
 * Import OS files and insert them into `parentId`. `point` (px, relative to the
 * parent's border box) positions them when the parent is freeform.
 */
export async function importAndInsertFiles(files: PickedFile[], parentId: NodeId, point?: { x: number; y: number }): Promise<NodeId[]> {
  const assets = await importFiles(files);
  if (!assets.length) return [];
  if (assets.some((a) => a.kind === 'font')) toast.success('Font added — find it in Typography');
  if (assets.some((a) => a.kind === 'audio')) toast('Audio added to Assets');
  if (!docApi.doc.nodes[parentId]) return [];
  return insertAssets(assets, parentId, point);
}

/** Convert browser File objects (drag & drop, paste) to PickedFiles, rejecting oversize files early. */
export async function pickedFromFiles(files: File[]): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  for (const f of files) {
    if (f.size > MAX_ASSET_BYTES) {
      toast.error(`${f.name} is too large (${formatBytes(f.size)}, max 100 MB)`);
      continue;
    }
    out.push({ name: f.name, mime: mimeFor(f.name, f.type), data: new Uint8Array(await f.arrayBuffer()) });
  }
  return out;
}
