import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, Uint8Array>();
vi.mock('@/platform', () => ({
  platform: {
    kind: 'web',
    assets: {
      write: async (pid: string, name: string, data: Uint8Array) => {
        store.set(`${pid}/assets/${name}`, data);
        return `assets/${name}`;
      },
      read: async (pid: string, path: string) => {
        const d = store.get(`${pid}/${path}`);
        if (!d) throw new Error('missing');
        return d;
      },
      remove: async (pid: string, path: string) => void store.delete(`${pid}/${path}`),
      url: async (pid: string, path: string) => `blob:${pid}/${path}`,
    },
    files: { open: async () => [] },
  },
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { createDocument } from '@/core/model/factory';
import { importAndInsertFiles, importFiles, nodeForAsset } from '@/features/assets/importer';
import { deleteAsset } from '@/features/assets/assetActions';
import { findOrphanFiles } from '@/features/assets/assetActions';
import { toast } from 'sonner';

const enc = (s: string) => new TextEncoder().encode(s);
const SVG = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><script>alert(1)</script><rect width="120" height="60" fill="red"/><foreignObject><div>x</div></foreignObject></svg>';

beforeEach(() => {
  store.clear();
  const doc = createDocument('T');
  useDoc.getState().loadDocument(doc);
  useUI.getState().set({ projectId: 'prj_test', activePageId: doc.pages[0].id, selection: [], breakpoint: 'base' });
});

describe('asset import pipeline', () => {
  it('sanitizes svgs, parses fonts, dedupes and records one history step', async () => {
    const before = useDoc.getState().past.length;
    const assets = await importFiles([
      { name: 'logo.svg', mime: 'image/svg+xml', data: enc(SVG) },
      { name: 'Satoshi-BoldItalic.woff2', mime: '', data: new Uint8Array([1, 2, 3, 4]) },
      { name: 'logo copy.svg', mime: 'image/svg+xml', data: enc(SVG) },
    ]);
    expect(assets).toHaveLength(3);
    expect(assets[2].id).toBe(assets[0].id); // duplicate reused
    expect(useDoc.getState().past.length - before).toBe(1);
    const doc = useDoc.getState().doc;
    expect(Object.keys(doc.assets)).toHaveLength(2);
    const svg = doc.assets[assets[0].id];
    expect(svg).toMatchObject({ kind: 'svg', width: 120, height: 60, mime: 'image/svg+xml' });
    expect(svg.path).toMatch(new RegExp(`^assets/${svg.id}-logo\\.svg$`));
    const stored = new TextDecoder().decode(store.get(`prj_test/${svg.path}`)!);
    expect(stored).not.toContain('script');
    expect(stored).not.toContain('foreignObject');
    expect(doc.assets[assets[1].id]).toMatchObject({ kind: 'font', fontFamily: 'Satoshi', fontWeight: '700', fontStyle: 'italic' });
    const node = nodeForAsset(svg)!;
    expect(node.type).toBe('svg');
    expect(node.props.svg).toContain(`asset:${svg.id}`);
    expect(node.styles.base).toMatchObject({ width: '120px', height: '60px' });
    expect(nodeForAsset(doc.assets[assets[1].id])).toBeNull();
  });

  it('rejects oversize and unsupported files', async () => {
    const big = { name: 'huge.png', mime: 'image/png', data: { byteLength: 101 * 1024 * 1024 } as Uint8Array };
    const r = await importFiles([big, { name: 'notes.txt', mime: 'text/plain', data: enc('hi') }]);
    expect(r).toEqual([]);
    expect(toast.error).toHaveBeenCalled();
  });

  it('inserts into freeform parents absolutely and keeps deleted binaries until cleanup', async () => {
    const root = useDoc.getState().doc.pages[0].rootId;
    const ids = await importAndInsertFiles([{ name: 'a.svg', mime: 'image/svg+xml', data: enc(SVG) }], root, { x: 400, y: 300 });
    expect(ids).toHaveLength(1);
    const n = useDoc.getState().doc.nodes[ids[0]];
    expect(n.styles.base).toMatchObject({ position: 'absolute', left: '340px', top: '270px' });
    expect(useUI.getState().selection).toEqual(ids);
    const assetId = Object.keys(useDoc.getState().doc.assets)[0];
    const path = useDoc.getState().doc.assets[assetId].path;
    deleteAsset(assetId);
    expect(useDoc.getState().doc.assets[assetId]).toBeUndefined();
    expect(store.has(`prj_test/${path}`)).toBe(true);
    expect((await findOrphanFiles()).map((f) => f.path)).toContain(path);
    useDoc.getState().undo();
    expect(useDoc.getState().doc.assets[assetId]).toBeTruthy();
    expect(await findOrphanFiles()).toEqual([]);
  });
});
