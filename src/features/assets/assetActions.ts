/**
 * Asset management actions used by the Assets panel and commands: rename,
 * replace file, delete (undoable, binaries kept) and explicit cleanup of
 * unreferenced binaries.
 */
import { toast } from 'sonner';
import { create } from 'zustand';
import type { KAsset, NodeId } from '@/core/model/types';
import { platform } from '@/platform';
import { docApi, useDoc } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { useAssetUrls } from '@/core/assets/assetStore';
import { getPageForNode } from '@/core/model/tree';
import { acceptForKind, computeAssetUsage, detectAssetKind, tagSvgWithAsset } from './assetKinds';
import { importFiles, prepareFile, writePrepared } from './importer';
import { listRegisteredFiles, unregisterFiles, type RegistryEntry } from './fileRegistry';

/** Panel-level UI state that commands can drive. */
interface AssetsUIState {
  cleanupOpen: boolean;
  set: (p: Partial<Omit<AssetsUIState, 'set'>>) => void;
}
export const useAssetsUI = create<AssetsUIState>()((set) => ({ cleanupOpen: false, set: (p) => set(p) }));

export function assetUsageCount(id: string): number {
  return computeAssetUsage(docApi.doc).get(id)?.length ?? 0;
}

export async function pickAndImport(): Promise<KAsset[]> {
  if (!uiApi.state.projectId) return [];
  const files = await platform.files.open({ accept: [...acceptForKind(), 'image/*', 'video/*', 'audio/*'], multiple: true });
  if (!files.length) return [];
  const assets = await importFiles(files);
  const fonts = assets.filter((a) => a.kind === 'font').length;
  if (assets.length) toast.success(assets.length === 1 ? `Imported ${assets[0].name}` : `Imported ${assets.length} assets`, fonts ? { description: 'Fonts are available in Typography' } : undefined);
  return assets;
}

export function renameAsset(id: string, name: string) {
  const n = name.trim();
  const a = docApi.doc.assets[id];
  if (!n || !a || a.name === n) return;
  docApi.mutate('Rename asset', (d) => {
    if (d.assets[id]) d.assets[id].name = n;
  });
}

/** Remove an asset from the document (one undo step). The binary stays on disk. */
export function deleteAsset(id: string) {
  const a = docApi.doc.assets[id];
  if (!a) return;
  docApi.mutate(`Delete asset “${a.name}”`, (d) => {
    delete d.assets[id];
  });
  toast(`Deleted ${a.name}`, { action: { label: 'Undo', onClick: () => docApi.doc.assets[id] || undoIfTop(`Delete asset “${a.name}”`) } });
}

function undoIfTop(label: string) {
  const s = useDoc.getState();
  if (s.past[s.past.length - 1]?.label === label) s.undo();
}

/** Replace an asset's file, keeping its id so every usage updates. */
export async function replaceAssetFile(id: string): Promise<boolean> {
  const projectId = uiApi.state.projectId;
  const asset = docApi.doc.assets[id];
  if (!projectId || !asset) return false;
  const [file] = await platform.files.open({ accept: acceptForKind(asset.kind), multiple: false });
  if (!file) return false;
  const kind = detectAssetKind(file.name, file.mime);
  if (kind !== asset.kind) {
    toast.error(`Choose a${/^[aeiou]/.test(asset.kind) ? 'n' : ''} ${asset.kind === 'svg' ? 'SVG' : asset.kind} file to replace “${asset.name}”`);
    return false;
  }
  const p = await prepareFile(file);
  if (typeof p === 'string') {
    toast.error(p);
    return false;
  }
  const path = await writePrepared(projectId, id, p, Date.now().toString(36));
  const svgNodes: NodeId[] = [];
  if (asset.kind === 'svg' && p.svg) {
    const marker = `data-kasset="asset:${id}"`;
    for (const n of Object.values(docApi.doc.nodes)) if (n.type === 'svg' && n.props.svg?.includes(marker)) svgNodes.push(n.id);
  }
  docApi.mutate(`Replace “${asset.name}”`, (d) => {
    const a = d.assets[id];
    if (!a) return;
    a.path = path;
    a.mime = p.mime;
    a.size = p.data.byteLength;
    if (p.width) a.width = p.width;
    else delete a.width;
    if (p.height) a.height = p.height;
    else delete a.height;
    if (a.kind === 'font') {
      a.fontWeight = p.fontWeight;
      a.fontStyle = p.fontStyle;
    }
    for (const nid of svgNodes) d.nodes[nid].props.svg = tagSvgWithAsset(p.svg!, id);
  });
  await refreshAssetUrl(projectId, docApi.doc.assets[id]);
  toast.success(`Replaced ${asset.name}`, { description: svgNodes.length ? `Updated ${svgNodes.length} vector layer${svgNodes.length > 1 ? 's' : ''}` : undefined });
  return true;
}

/** Re-resolve an asset URL after its file changed (bypasses the URL cache). */
export async function refreshAssetUrl(projectId: string, asset: KAsset | undefined) {
  if (!asset) return;
  let url = await platform.assets.url(projectId, asset.path, asset.mime);
  if (url.startsWith('kasset:')) url += `${url.includes('?') ? '&' : '?'}v=${Date.now().toString(36)}`;
  useAssetUrls.getState().setUrl(asset.id, url);
  if (asset.kind === 'font' && asset.fontFamily && typeof FontFace !== 'undefined') {
    try {
      const fam = asset.fontFamily;
      for (const f of [...document.fonts]) {
        if (f.family.replace(/['"]/g, '') === fam && f.style === (asset.fontStyle ?? 'normal')) document.fonts.delete(f);
      }
      const face = new FontFace(fam, `url(${url})`, { weight: asset.fontWeight ?? '100 900', style: asset.fontStyle ?? 'normal' });
      await face.load();
      document.fonts.add(face);
    } catch (err) {
      console.warn('[kinema] font reload failed', err);
    }
  }
}

export async function copyAssetReference(id: string) {
  const ref = `asset:${id}`;
  try {
    await navigator.clipboard.writeText(ref);
    toast.success('Reference copied', { description: ref });
  } catch {
    toast(ref, { description: 'Copy this reference manually' });
  }
}

/** Select the layers that use an asset (switching to their page when needed). */
export function selectAssetUsers(id: string) {
  const doc = docApi.doc;
  const users = computeAssetUsage(doc).get(id) ?? [];
  if (!users.length) return;
  const page = getPageForNode(doc, users[0]);
  if (page && page.id !== uiApi.state.activePageId) uiApi.set({ activePageId: page.id, editingComponentId: null });
  const onPage = page ? users.filter((u) => getPageForNode(doc, u)?.id === page.id) : users;
  uiApi.state.select(onPage);
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/** Registered binaries that no asset in the current document points to. */
export async function findOrphanFiles(): Promise<RegistryEntry[]> {
  const projectId = uiApi.state.projectId;
  if (!projectId) return [];
  const used = new Set(Object.values(docApi.doc.assets).map((a) => a.path));
  return (await listRegisteredFiles(projectId)).filter((e) => !used.has(e.path));
}

export async function deleteOrphanFiles(files: RegistryEntry[]): Promise<number> {
  const projectId = uiApi.state.projectId;
  if (!projectId) return 0;
  const used = new Set(Object.values(docApi.doc.assets).map((a) => a.path));
  const targets = files.filter((f) => !used.has(f.path));
  let n = 0;
  for (const f of targets) {
    try {
      await platform.assets.remove(projectId, f.path);
      n++;
    } catch (err) {
      console.warn('[kinema] could not delete', f.path, err);
    }
  }
  await unregisterFiles(projectId, targets.map((f) => f.path));
  return n;
}
