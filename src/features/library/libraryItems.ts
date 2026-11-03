/**
 * Personal-library item builders and appliers.
 *
 * Component payload (`LibraryItem.data` for kind 'component'):
 *   { rootId, nodes, components, assets }
 *  - `nodes` holds the item subtree *and* the masters of nested components it uses
 *    (all with their original ids; masters have `parent: null`);
 *  - `components` maps nested component ids → { id, name, rootId };
 *  - `assets` embeds referenced project assets as data URLs.
 * Inserting imports everything with fresh ids (reusing a project component when
 * `KComponent.libraryItemId` already points at the item).
 */
import { toast } from 'sonner';
import { docApi } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { activeBreakpoint, addNode, insertionTarget } from '@/core/store/actions';
import { createNode, uid } from '@/core/model/factory';
import { cloneSubtree, collectAssetRefs, collectComponentRefs, deepClone, extractSubtree } from '@/core/model/tree';
import type {
  InteractionState,
  KAnimation,
  KAsset,
  KComponent,
  KDocument,
  KNode,
  LibraryItem,
  NodeId,
  StyleMap,
} from '@/core/model/types';
import { ensureAssetUrl } from '@/core/assets/assetStore';
import { platform } from '@/platform';
import { bytesToDataUrl, dataUrlToBytes } from '@/features/projects/kinemaFile';
import { PLACEMENT_PROPS, materializeInstance, stripPlacement } from '@/features/components/componentModel';
import { buildInstanceSubtree, insertInstance } from '@/features/components/componentActions';

type NodeMap = Record<NodeId, KNode>;
export type EmbeddedAsset = Omit<KAsset, 'path'> & { dataUrl: string };

export interface ComponentItemData {
  rootId: NodeId;
  nodes: NodeMap;
  components: Record<string, { id: string; name: string; rootId: NodeId }>;
  assets: Record<string, EmbeddedAsset>;
}

/** Overridable IO (tests). */
export const libraryIO = {
  writeAsset: (projectId: string, fileName: string, data: Uint8Array, mime: string) => platform.assets.write(projectId, fileName, data, mime),
  readAsset: (projectId: string, path: string) => platform.assets.read(projectId, path),
};

const now = () => Date.now();

// ─── Building items ─────────────────────────────────────────────────────────

export interface ItemMeta {
  name: string;
  folder?: string;
  tags?: string[];
  thumbnail?: string;
}

function baseItem(kind: LibraryItem['kind'], meta: ItemMeta, data: unknown): LibraryItem {
  const t = now();
  return {
    id: uid('lib'),
    kind,
    name: meta.name.trim() || 'Untitled',
    tags: [...new Set((meta.tags ?? []).map((x) => x.trim()).filter(Boolean))],
    folder: meta.folder || undefined,
    favorite: false,
    createdAt: t,
    updatedAt: t,
    thumbnail: meta.thumbnail,
    data,
  };
}

/** Collect the subtree of `nodeId` (instances are materialised) plus nested masters. */
export function collectComponentPayload(doc: KDocument, nodeId: NodeId): { rootId: NodeId; nodes: NodeMap; components: ComponentItemData['components'] } | null {
  const node = doc.nodes[nodeId];
  if (!node) return null;
  let sub: { rootId: NodeId; nodes: NodeMap };
  if (node.type === 'instance') {
    const mat = materializeInstance(doc, nodeId);
    if (!mat) return null;
    sub = { rootId: mat.rootId, nodes: mat.nodes };
  } else sub = extractSubtree(doc.nodes as NodeMap, nodeId);
  const root = sub.nodes[sub.rootId];
  root.parent = null;
  root.styles = stripPlacement(root.styles);
  delete root.hidden;
  delete root.locked;

  const nodes: NodeMap = { ...sub.nodes };
  const components: ComponentItemData['components'] = {};
  const queue = [...collectComponentRefs(sub.nodes, sub.rootId)];
  while (queue.length) {
    const cid = queue.pop()!;
    if (components[cid]) continue;
    const comp = doc.components[cid];
    if (!comp || !doc.nodes[comp.rootId]) continue;
    const master = extractSubtree(doc.nodes as NodeMap, comp.rootId);
    Object.assign(nodes, master.nodes);
    components[cid] = { id: cid, name: comp.name, rootId: comp.rootId };
    for (const ref of collectComponentRefs(master.nodes, master.rootId)) queue.push(ref);
  }
  return { rootId: sub.rootId, nodes, components };
}

export async function buildComponentItem(doc: KDocument, nodeId: NodeId, meta: ItemMeta, projectId: string | null): Promise<LibraryItem | null> {
  const payload = collectComponentPayload(doc, nodeId);
  if (!payload) return null;
  const refs = new Set<string>();
  for (const rootId of [payload.rootId, ...Object.values(payload.components).map((c) => c.rootId)]) for (const r of collectAssetRefs(payload.nodes, rootId)) refs.add(r);
  const assets: Record<string, EmbeddedAsset> = {};
  for (const id of refs) {
    const a = doc.assets[id];
    if (!a || !projectId) continue;
    try {
      const bytes = await libraryIO.readAsset(projectId, a.path);
      const { path: _p, ...rest } = a;
      void _p;
      assets[id] = { ...rest, dataUrl: bytesToDataUrl(bytes, a.mime) };
    } catch {
      /* missing asset file: the component still saves */
    }
  }
  const data: ComponentItemData = { ...payload, assets };
  return baseItem('component', meta, data);
}

export function buildSvgItem(svg: string, meta: ItemMeta): LibraryItem {
  return baseItem('svg', meta, { svg });
}

export function buildAnimationItem(anim: KAnimation, meta: ItemMeta): LibraryItem {
  return baseItem('animation', meta, { animation: deepClone(anim) });
}

export function buildPaletteItem(colors: { name: string; value: string }[], meta: ItemMeta): LibraryItem {
  return baseItem('palette', meta, { colors: colors.map((c) => ({ name: c.name, value: c.value })) });
}

export function buildStyleItem(node: KNode, meta: ItemMeta, bp = 'base'): LibraryItem {
  const styles: StyleMap = {};
  for (const [k, v] of Object.entries(node.styles[bp] ?? node.styles.base ?? {})) if (!PLACEMENT_PROPS.has(k)) styles[k] = v;
  const data: { styles: StyleMap; states?: KNode['states'] } = { styles };
  if (node.states && Object.keys(node.states).length) data.states = deepClone(node.states);
  return baseItem('style', meta, data);
}

export function buildImageItem(dataUrl: string, mime: string, meta: ItemMeta, size?: { width?: number; height?: number }): LibraryItem {
  return baseItem('image', { ...meta, thumbnail: meta.thumbnail ?? dataUrl }, { dataUrl, mime, ...size });
}

// ─── Importing components into the project ──────────────────────────────────

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'asset';

export function findProjectComponentForItem(doc: Pick<KDocument, 'components'>, key: string): KComponent | undefined {
  return Object.values(doc.components).find((c) => c.libraryItemId === key);
}

export interface StagedAsset {
  asset: KAsset;
  bytes: Uint8Array;
}

/** Create KAssets (fresh ids, predictable paths) for embedded assets. */
export function stageEmbeddedAssets(assets: Record<string, EmbeddedAsset> | undefined): { map: Map<string, KAsset>; staged: StagedAsset[] } {
  const map = new Map<string, KAsset>();
  const staged: StagedAsset[] = [];
  for (const [oldId, a] of Object.entries(assets ?? {})) {
    try {
      const { bytes } = dataUrlToBytes(a.dataUrl);
      const id = uid('as');
      const fileName = `${id}-${safeName(a.name)}`;
      const { dataUrl: _d, ...rest } = a;
      void _d;
      const asset: KAsset = { ...rest, id, path: `assets/${fileName}`, size: bytes.length, createdAt: now() };
      map.set(oldId, asset);
      staged.push({ asset, bytes });
    } catch {
      /* skip undecodable asset */
    }
  }
  return { map, staged };
}

/** Write staged assets to disk and resolve their URLs (fire-and-forget, errors toast once). */
export function writeStagedAssets(projectId: string, staged: StagedAsset[]): Promise<void> {
  return Promise.all(
    staged.map(async ({ asset, bytes }) => {
      const path = await libraryIO.writeAsset(projectId, asset.path.replace(/^assets\//, ''), bytes, asset.mime);
      if (path !== asset.path) docApi.mutate('Fix asset path', (d) => void (d.assets[asset.id] && (d.assets[asset.id].path = path)), { skipHistory: true });
      await ensureAssetUrl(projectId, { ...asset, path });
    }),
  ).then(
    () => undefined,
    (err) => {
      console.error(err);
      toast.error('Some assets could not be imported', { description: String(err) });
    },
  );
}

function remapAssetRefs(node: KNode, assetMap: Map<string, KAsset>) {
  if (!assetMap.size) return;
  const re = /asset:([a-z0-9_]+)/gi;
  const swap = (v: unknown) => JSON.parse(JSON.stringify(v).replace(re, (m, id: string) => (assetMap.has(id) ? `asset:${assetMap.get(id)!.id}` : m)));
  node.props = swap(node.props);
  node.styles = swap(node.styles);
  if (node.states) node.states = swap(node.states);
}

/**
 * Import a component item into a draft document (fresh ids). Returns the project
 * component id for the item (an existing one when already imported).
 */
export function applyComponentImport(d: KDocument, item: LibraryItem, assetMap: Map<string, KAsset>, t = now()): string {
  const existing = findProjectComponentForItem(d, item.id);
  if (existing && d.nodes[existing.rootId]) return existing.id;
  const data = item.data as ComponentItemData;
  const compIdMap = new Map<string, string>();
  const nodeIdMap = new Map<NodeId, NodeId>();
  const added: NodeMap = {};

  for (const [oldCid, c] of Object.entries(data.components ?? {})) {
    const key = `${item.id}#${oldCid}`;
    const reuse = findProjectComponentForItem(d, key);
    if (reuse && d.nodes[reuse.rootId]) {
      compIdMap.set(oldCid, reuse.id);
      continue;
    }
    if (!data.nodes[c.rootId]) continue;
    const clone = cloneSubtree(data.nodes, c.rootId);
    const newCid = uid('c');
    compIdMap.set(oldCid, newCid);
    for (const [o, n] of clone.idMap) nodeIdMap.set(o, n);
    Object.assign(added, clone.nodes);
    d.components[newCid] = { id: newCid, name: c.name, rootId: clone.rootId, libraryItemId: key, createdAt: t };
  }

  const main = cloneSubtree(data.nodes, data.rootId);
  for (const [o, n] of main.idMap) nodeIdMap.set(o, n);
  Object.assign(added, main.nodes);

  for (const n of Object.values(added)) {
    remapAssetRefs(n, assetMap);
    if (n.type === 'instance' && n.props.componentId) n.props.componentId = compIdMap.get(n.props.componentId) ?? n.props.componentId;
    if (n.overrides) {
      const next: NonNullable<KNode['overrides']> = {};
      for (const [k, ov] of Object.entries(n.overrides)) {
        const nk = nodeIdMap.get(k);
        if (nk) next[nk] = ov;
      }
      if (Object.keys(next).length) n.overrides = next;
      else delete n.overrides;
    }
    if (n.meta?.libraryItemId) delete n.meta.libraryItemId;
  }
  for (const n of Object.values(added)) d.nodes[n.id] = n;
  for (const a of assetMap.values()) d.assets[a.id] = a;

  const cid = uid('c');
  d.components[cid] = { id: cid, name: item.name, rootId: main.rootId, libraryItemId: item.id, createdAt: t };
  d.nodes[main.rootId].name = item.name;
  return cid;
}

/** Make sure the item exists as a component of the open project (one undo step). */
export function ensureProjectComponent(item: LibraryItem): string | null {
  const projectId = uiApi.state.projectId;
  const doc = docApi.doc;
  const existing = findProjectComponentForItem(doc, item.id);
  if (existing && doc.nodes[existing.rootId]) return existing.id;
  const data = item.data as ComponentItemData | undefined;
  if (!data?.nodes?.[data.rootId]) {
    toast.error('This library item is damaged and can’t be inserted');
    return null;
  }
  const { map, staged } = stageEmbeddedAssets(data.assets);
  let cid: string | null = null;
  docApi.mutate(`Add component “${item.name}”`, (d) => {
    cid = applyComponentImport(d as KDocument, item, map);
  });
  if (projectId && staged.length) void writeStagedAssets(projectId, staged);
  return cid;
}

// ─── Using items ────────────────────────────────────────────────────────────

/** Preferred drag/insert size (px) of a component item. */
export function itemSizeHint(item: LibraryItem): { w: number; h: number } | undefined {
  if (item.kind === 'svg') return { w: 96, h: 96 };
  if (item.kind === 'image') {
    const { width, height } = item.data as { width?: number; height?: number };
    if (width && height) {
      const k = Math.min(1, 320 / width);
      return { w: Math.round(width * k), h: Math.round(height * k) };
    }
    return { w: 320, h: 200 };
  }
  if (item.kind !== 'component') return undefined;
  const data = item.data as ComponentItemData;
  const base = data.nodes?.[data.rootId]?.styles.base;
  const w = parseFloat(base?.width ?? '');
  const h = parseFloat(base?.height ?? '');
  return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : undefined;
}

function stageImage(item: LibraryItem): { node: KNode } | null {
  const projectId = uiApi.state.projectId;
  const d = item.data as { dataUrl: string; mime: string; width?: number; height?: number };
  if (!projectId || !d?.dataUrl) return null;
  const ext = (d.mime.split('/')[1] ?? 'png').replace('svg+xml', 'svg').replace('jpeg', 'jpg');
  const { map, staged } = stageEmbeddedAssets({
    img: { id: 'img', name: `${item.name}.${ext}`, kind: d.mime === 'image/svg+xml' ? 'svg' : 'image', mime: d.mime, size: 0, width: d.width, height: d.height, createdAt: now(), dataUrl: d.dataUrl },
  });
  const asset = map.get('img');
  if (!asset) return null;
  docApi.mutate(`Add image “${item.name}”`, (doc) => void (doc.assets[asset.id] = asset));
  void writeStagedAssets(projectId, staged);
  const hint = itemSizeHint(item)!;
  const node = createNode('image', { name: item.name, props: { src: `asset:${asset.id}`, alt: item.name }, styles: { width: `${hint.w}px`, height: `${hint.h}px` } });
  return { node };
}

/** Build a fresh-id subtree for drag & drop / insertion; null when the item can't be inserted as nodes. */
export function buildItemNodes(item: LibraryItem): { rootId: NodeId; nodes: NodeMap } | null {
  if (item.kind === 'component') {
    const cid = ensureProjectComponent(item);
    return cid ? buildInstanceSubtree(cid) : null;
  }
  if (item.kind === 'svg') {
    const n = createNode('svg', { name: item.name, props: { svg: (item.data as { svg: string }).svg } });
    return { rootId: n.id, nodes: { [n.id]: n } };
  }
  if (item.kind === 'image') {
    const staged = stageImage(item);
    return staged ? { rootId: staged.node.id, nodes: { [staged.node.id]: staged.node } } : null;
  }
  return null;
}

export function freshAnimation(anim: KAnimation): KAnimation {
  const c = deepClone(anim);
  return { ...c, id: uid('a'), keyframes: c.keyframes.map((k) => ({ ...k, id: uid('k') })) };
}

export function applyAnimationToNodes(anim: KAnimation, ids: NodeId[]): boolean {
  const doc = docApi.doc;
  const targets = ids.filter((id) => doc.nodes[id]);
  if (!targets.length) return false;
  docApi.mutate(`Apply animation “${anim.name}”`, (d) => {
    for (const id of targets) (d.nodes[id].animations ??= []).push(freshAnimation(anim));
  });
  return true;
}

export function applyStyleToNodes(styles: StyleMap, states: Partial<Record<InteractionState, StyleMap>> | undefined, ids: NodeId[], label = 'Apply style'): boolean {
  const doc = docApi.doc;
  const targets = ids.filter((id) => doc.nodes[id]);
  if (!targets.length) return false;
  const bp = activeBreakpoint();
  docApi.mutate(label, (d) => {
    for (const id of targets) {
      const n = d.nodes[id];
      n.styles[bp] = { ...(n.styles[bp] ?? {}), ...styles };
      for (const [st, map] of Object.entries(states ?? {})) {
        n.states ??= {};
        n.states[st as InteractionState] = { ...(n.states[st as InteractionState] ?? {}), ...map };
      }
    }
  });
  return true;
}

export function applyPaletteToTokens(colors: { name: string; value: string }[]): void {
  docApi.mutate('Apply color palette', (d) => {
    for (const c of colors) {
      const existing = d.tokens.colors.find((t) => t.name === c.name);
      if (existing) existing.value = c.value;
      else d.tokens.colors.push({ id: `c_${c.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`, name: c.name, value: c.value });
    }
  });
}

/** Insert / apply an item with a sensible default target. Returns true on success. */
export function useLibraryItem(item: LibraryItem): boolean {
  const sel = uiApi.state.selection;
  switch (item.kind) {
    case 'component': {
      docApi.begin(`Insert “${item.name}”`);
      try {
        const cid = ensureProjectComponent(item);
        return !!cid && !!insertInstance(cid, undefined, `Insert “${item.name}”`);
      } finally {
        docApi.commit();
      }
    }
    case 'svg':
    case 'image': {
      const target = insertionTarget();
      if (!target) return false;
      docApi.begin(`Insert “${item.name}”`);
      try {
        const sub = buildItemNodes(item);
        if (!sub) return false;
        addNode(sub.nodes[sub.rootId], target.parentId, target.index, { label: `Insert “${item.name}”` });
        return true;
      } finally {
        docApi.commit();
      }
    }
    case 'animation': {
      if (!sel.length) {
        toast.info('Select a layer first', { description: 'Animations are applied to the selected layers.' });
        return false;
      }
      return applyAnimationToNodes((item.data as { animation: KAnimation }).animation, sel);
    }
    case 'style': {
      if (!sel.length) {
        toast.info('Select a layer first', { description: 'Styles are applied to the selected layers.' });
        return false;
      }
      const d = item.data as { styles: StyleMap; states?: KNode['states'] };
      return applyStyleToNodes(d.styles, d.states, sel, `Apply style “${item.name}”`);
    }
    case 'palette':
      applyPaletteToTokens((item.data as { colors: { name: string; value: string }[] }).colors);
      return true;
  }
}
