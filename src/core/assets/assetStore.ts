/**
 * Runtime asset URL resolution. Documents reference assets as `asset:<id>` (in
 * props.src and inside style values like `url(asset:<id>)`). This store maps asset
 * ids to loadable URLs for the current project and registers imported fonts.
 */
import { create } from 'zustand';
import type { KAsset, KDocument } from '../model/types';
import { platform } from '@/platform';

interface AssetUrlState {
  projectId: string | null;
  urls: Record<string, string>;
  setUrl: (id: string, url: string) => void;
  reset: (projectId: string | null) => void;
}

export const useAssetUrls = create<AssetUrlState>()((set) => ({
  projectId: null,
  urls: {},
  setUrl: (id, url) => set((s) => ({ urls: { ...s.urls, [id]: url } })),
  reset: (projectId) => set({ projectId, urls: {} }),
}));

export const ASSET_REF_RE = /asset:([a-z0-9_]+)/gi;

/** Replace every `asset:<id>` in a string with its loaded URL (or leaves it if unknown). */
export function resolveAssetRefs(value: string, urls: Record<string, string> = useAssetUrls.getState().urls): string {
  if (!value || value.indexOf('asset:') < 0) return value;
  return value.replace(ASSET_REF_RE, (m, id: string) => urls[id] ?? m);
}

export function assetRef(id: string): string {
  return `asset:${id}`;
}

const registeredFonts = new Map<string, FontFace>();

async function registerFont(asset: KAsset, url: string) {
  if (!asset.fontFamily || typeof FontFace === 'undefined') return;
  const key = `${asset.id}`;
  if (registeredFonts.has(key)) return;
  try {
    const face = new FontFace(asset.fontFamily, `url(${url})`, {
      weight: asset.fontWeight ?? '100 900',
      style: asset.fontStyle ?? 'normal',
    });
    await face.load();
    document.fonts.add(face);
    registeredFonts.set(key, face);
  } catch (err) {
    console.warn('[kinema] failed to load font', asset.name, err);
  }
}

/** Resolve URLs for all assets of the doc (call on project load and after imports). */
export async function loadAssetUrls(projectId: string, doc: KDocument) {
  const st = useAssetUrls.getState();
  if (st.projectId !== projectId) st.reset(projectId);
  await Promise.all(
    Object.values(doc.assets).map(async (a) => {
      if (useAssetUrls.getState().urls[a.id]) return;
      try {
        const url = await platform.assets.url(projectId, a.path, a.mime);
        if (url) {
          useAssetUrls.getState().setUrl(a.id, url);
          if (a.kind === 'font') await registerFont(a, url);
        }
      } catch (err) {
        console.warn('[kinema] asset url failed', a.path, err);
      }
    }),
  );
}

/** Ensure a single asset is resolved (after import). */
export async function ensureAssetUrl(projectId: string, asset: KAsset): Promise<string> {
  const existing = useAssetUrls.getState().urls[asset.id];
  if (existing) return existing;
  const url = await platform.assets.url(projectId, asset.path, asset.mime);
  useAssetUrls.getState().setUrl(asset.id, url);
  if (asset.kind === 'font') await registerFont(asset, url);
  return url;
}
