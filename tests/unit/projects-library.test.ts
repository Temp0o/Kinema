import { beforeEach, describe, expect, it } from 'vitest';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { createDocument, createNode } from '@/core/model/factory';
import { insertNode } from '@/core/model/tree';
import { resolveStyles } from '@/core/style/style';
import type { KDocument, KNode, StyleMap } from '@/core/model/types';
import {
  createComponentFromNode,
  deleteComponent,
  detachInstance,
  setInstanceTextOverride,
  editComponent,
  exitComponentEditing,
} from '@/features/components/componentActions';
import { materializeInstance, mergeInstanceRootStyles, wouldCreateCycle } from '@/features/components/componentModel';

function freshDoc(): { doc: KDocument; root: string } {
  const doc = createDocument('Test');
  useDoc.getState().loadDocument(doc);
  useUI.getState().set({ activePageId: doc.pages[0].id, selection: [], breakpoint: 'base', editingComponentId: null });
  return { doc, root: doc.pages[0].rootId };
}

/** Build a card: box (absolute, placed) > title text + button. */
function buildCard(root: string) {
  const card = createNode('box', {
    name: 'Card',
    replaceStyles: true,
    styles: { position: 'absolute', left: '40px', top: '60px', width: '320px', height: '200px', 'background-color': '#fff', 'border-radius': '16px', padding: '20px' },
  });
  card.styles.mobile = { left: '10px', width: '300px', 'border-radius': '8px' };
  card.states = { hover: { 'box-shadow': '0 4px 10px #0002' } };
  const title = createNode('text', { name: 'Title', props: { text: 'Hello' } });
  const btn = createNode('button', { name: 'CTA', props: { text: 'Go' } });
  useDoc.getState().mutate('setup', (d) => {
    insertNode(d as KDocument, card, root);
    insertNode(d as KDocument, title, card.id);
    insertNode(d as KDocument, btn, card.id);
  });
  return { card, title, btn };
}

const strip = (n: KNode) => ({ type: n.type, name: n.name, props: n.props, states: n.states, children: n.children.length });

describe('components', () => {
  beforeEach(freshDoc);

  it('creates a component: master keeps visuals, instance keeps placement', () => {
    const { root } = freshDoc();
    const { card, title } = buildCard(root);
    const before = useDoc.getState().past.length;
    const compId = createComponentFromNode(card.id)!;
    expect(compId).toBeTruthy();
    expect(useDoc.getState().past.length).toBe(before + 1);
    const doc = useDoc.getState().doc;
    const comp = doc.components[compId];
    expect(comp.rootId).toBe(card.id);
    const master = doc.nodes[card.id];
    expect(master.parent).toBeNull();
    expect(master.styles.base).toMatchObject({ position: 'relative', width: '320px', 'background-color': '#fff' });
    expect(master.styles.base.left).toBeUndefined();
    const instId = doc.nodes[root].children[0];
    const inst = doc.nodes[instId];
    expect(inst.type).toBe('instance');
    expect(inst.props.componentId).toBe(compId);
    expect(inst.styles.base).toEqual({ position: 'absolute', left: '40px', top: '60px', width: '320px', height: '200px' });
    expect(inst.styles.mobile).toEqual({ left: '10px', width: '300px' });
    expect(master.styles.mobile).toEqual({ width: '300px', 'border-radius': '8px' });
    expect(doc.nodes[title.id].parent).toBe(card.id);
    expect(useUI.getState().selection).toEqual([instId]);
    // undo restores the original tree
    useDoc.getState().undo();
    const d2 = useDoc.getState().doc;
    expect(d2.components[compId]).toBeUndefined();
    expect(d2.nodes[root].children).toEqual([card.id]);
    expect(d2.nodes[card.id].styles.base.left).toBe('40px');
  });

  it('detach round trip renders like the original (fresh ids, overrides applied)', () => {
    const { root } = freshDoc();
    const { card, title, btn } = buildCard(root);
    const original = structuredClone(useDoc.getState().doc.nodes[card.id]);
    const compId = createComponentFromNode(card.id)!;
    const instId = useDoc.getState().doc.nodes[root].children[0];
    setInstanceTextOverride(instId, title.id, 'Overridden');
    // equal to master → override cleared
    setInstanceTextOverride(instId, btn.id, 'Go');
    expect(useDoc.getState().doc.nodes[instId].overrides).toEqual({ [title.id]: { text: 'Overridden' } });

    const newId = detachInstance(instId)!;
    const doc = useDoc.getState().doc;
    expect(newId).not.toBe(card.id);
    expect(doc.nodes[instId]).toBeUndefined();
    expect(doc.nodes[root].children).toEqual([newId]);
    const det = doc.nodes[newId];
    expect(det.parent).toBe(root);
    for (const bp of ['base', 'tablet', 'mobile']) {
      expect(resolveStyles(doc, det, bp)).toEqual(resolveStyles(doc, { ...original, styles: { ...original.styles, base: { ...original.styles.base } } } as KNode, bp));
    }
    expect(strip(det)).toMatchObject({ type: 'box', name: 'Card', states: original.states, children: 2 });
    const [t2, b2] = det.children.map((id) => doc.nodes[id]);
    expect(t2.id).not.toBe(title.id);
    expect(t2.props.text).toBe('Overridden');
    expect(b2.props.text).toBe('Go');
    // master untouched
    expect(doc.nodes[title.id].props.text).toBe('Hello');
    expect(doc.components[compId]).toBeTruthy();
  });

  it('merges instance root styles with exact cascade semantics', () => {
    const bps = [{ id: 'base' }, { id: 'tablet' }, { id: 'mobile' }];
    const master: Record<string, StyleMap> = { base: { width: '200px', color: 'red' }, tablet: { width: '150px' } };
    const inst: Record<string, StyleMap> = { base: { width: '300px' }, mobile: { color: 'blue' } };
    const m = mergeInstanceRootStyles(master, inst, bps);
    const doc = { breakpoints: createDocument().breakpoints };
    const node = (styles: Record<string, StyleMap>) => ({ styles }) as unknown as KNode;
    expect(resolveStyles(doc, node(m), 'tablet')).toEqual({ width: '300px', color: 'red' });
    expect(resolveStyles(doc, node(m), 'mobile')).toEqual({ width: '300px', color: 'blue' });
  });

  it('delete component detaches all instances in one undo step', () => {
    const { root } = freshDoc();
    const { card } = buildCard(root);
    const compId = createComponentFromNode(card.id)!;
    const doc0 = useDoc.getState().doc;
    const instId = doc0.nodes[root].children[0];
    // second instance via materialize check + manual insert
    expect(materializeInstance(doc0, instId)).toBeTruthy();
    const before = useDoc.getState().past.length;
    deleteComponent(compId);
    const doc = useDoc.getState().doc;
    expect(useDoc.getState().past.length).toBe(before + 1);
    expect(doc.components[compId]).toBeUndefined();
    expect(doc.nodes[card.id]).toBeUndefined();
    const replaced = doc.nodes[doc.nodes[root].children[0]];
    expect(replaced.type).toBe('box');
    expect(replaced.styles.base.left).toBe('40px');
    useDoc.getState().undo();
    expect(useDoc.getState().doc.components[compId]).toBeTruthy();
    expect(useDoc.getState().doc.nodes[instId].type).toBe('instance');
  });

  it('edit isolation and cycle protection', () => {
    const { root } = freshDoc();
    const { card, title } = buildCard(root);
    const compId = createComponentFromNode(card.id)!;
    const instId = useDoc.getState().doc.nodes[root].children[0];
    editComponent(compId, { fromInstanceId: instId });
    expect(useUI.getState().editingComponentId).toBe(compId);
    expect(wouldCreateCycle(useDoc.getState().doc, compId, title.id)).toBe(true);
    expect(wouldCreateCycle(useDoc.getState().doc, compId, root)).toBe(false);
    exitComponentEditing();
    expect(useUI.getState().editingComponentId).toBeNull();
    expect(useUI.getState().selection).toEqual([instId]);
  });
});

describe('templates', () => {
  it('blank projects are freeform; templates import without warnings into a flex-column page frame', async () => {
    const { TEMPLATES, buildTemplateDocument } = await import('@/core/templates');
    expect(TEMPLATES.map((t) => t.id)).toEqual(['blank', 'landing', 'portfolio', 'dashboard', 'auth', 'mobile', 'coming-soon']);
    for (const t of TEMPLATES) {
      const { doc, warnings } = buildTemplateDocument(t.id, `My ${t.name}`);
      expect(warnings, t.id).toEqual([]);
      const frame = doc.nodes[doc.pages[0].rootId];
      expect(doc.settings.title).toBe(`My ${t.name}`);
      if (t.id === 'blank') {
        // Free mode is the default: the blank page frame is not a flex/grid container.
        expect(frame.styles.base.display ?? '').not.toMatch(/flex|grid/);
        expect(frame.children).toHaveLength(0);
        continue;
      }
      expect(frame.styles.base).toMatchObject({ display: 'flex', 'flex-direction': 'column' });
      expect(Object.keys(doc.nodes).length, t.id).toBeGreaterThan(40);
      for (const n of Object.values(doc.nodes)) {
        if (n.parent) expect(doc.nodes[n.parent].children, `${t.id}:${n.id}`).toContain(n.id);
        for (const c of n.children) expect(doc.nodes[c].parent).toBe(n.id);
      }
      expect(frame.styles.base.background ?? frame.styles.base['background-color']).toBeTruthy();
      const all = Object.values(doc.nodes);
      expect(all.some((n) => n.animations?.length), `${t.id} animations`).toBe(true);
      expect(all.some((n) => n.states?.hover), `${t.id} hover`).toBe(true);
      expect(all.some((n) => n.styles.mobile), `${t.id} mobile`).toBe(true);
      expect(doc.tokens.colors.find((c) => c.name === 'primary')?.value).toBe(t.tokens!.colors!.find((c) => c.name === 'primary')!.value);
    }
  });
});

// ─── Library ────────────────────────────────────────────────────────────────

import { buildComponentItem, buildPaletteItem, buildAnimationItem, buildStyleItem, ensureProjectComponent, libraryIO, useLibraryItem, applyAnimationToNodes } from '@/features/library/libraryItems';
import { packLibrary, unpackLibrary } from '@/features/library/libraryPack';
import { packProject, unpackProject, importProjectPackage, exportProjectPackage, KinemaFileError, dataUrlToBytes } from '@/features/projects/kinemaFile';
import type { PlatformAPI } from '@/platform/types';
import type { KAsset, ProjectFile, ProjectMeta } from '@/core/model/types';
import { createProjectFile } from '@/core/model/factory';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);

function mockPlatform() {
  const projects = new Map<string, ProjectFile>();
  const assets = new Map<string, Uint8Array>();
  const thumbs = new Map<string, string>();
  const p = {
    kind: 'web',
    projects: {
      list: async () => [...projects.values()].map<ProjectMeta>((f) => ({ id: f.id, name: f.name, createdAt: f.createdAt, updatedAt: f.updatedAt })),
      load: async (id: string) => structuredClone(projects.get(id)!),
      save: async (f: ProjectFile) => void projects.set(f.id, structuredClone(f)),
      remove: async (id: string) => void projects.delete(id),
      saveThumbnail: async (id: string, url: string) => void thumbs.set(id, url),
    },
    assets: {
      write: async (pid: string, name: string, data: Uint8Array) => {
        assets.set(`${pid}/assets/${name}`, data);
        return `assets/${name}`;
      },
      read: async (pid: string, path: string) => assets.get(`${pid}/${path}`)!,
    },
  };
  return { p: p as unknown as PlatformAPI, projects, assets, thumbs };
}

function docWithImageCard() {
  const { root } = freshDoc();
  const asset: KAsset = { id: 'as_logo1', name: 'logo.png', kind: 'image', mime: 'image/png', size: PNG.length, path: 'assets/as_logo1-logo.png', createdAt: 1 };
  useDoc.getState().mutate('assets', (d) => void (d.assets[asset.id] = asset));
  const card = createNode('box', { name: 'Card', replaceStyles: true, styles: { position: 'absolute', left: '10px', top: '20px', width: '300px', height: '180px', 'background-color': '#fff' } });
  const img = createNode('image', { name: 'Logo', props: { src: `asset:${asset.id}` }, styles: { 'background-image': `url(asset:${asset.id})` } });
  img.animations = [{ id: 'a_1', name: 'Fade', trigger: 'load', duration: 300, delay: 0, iterations: 1, direction: 'normal', fill: 'both', easing: 'ease', keyframes: [{ id: 'k_1', offset: 0, values: { opacity: 0 } }, { id: 'k_2', offset: 1, values: { opacity: 1 } }] }];
  useDoc.getState().mutate('setup', (d) => {
    insertNode(d as KDocument, card, root);
    insertNode(d as KDocument, img, card.id);
  });
  return { root, card, img, asset };
}

describe('library items', () => {
  const written: Record<string, Uint8Array> = {};
  beforeEach(() => {
    libraryIO.readAsset = async () => PNG;
    libraryIO.writeAsset = async (_p, name, data) => {
      written[name] = data;
      return `assets/${name}`;
    };
    for (const k of Object.keys(written)) delete written[k];
    useUI.getState().set({ projectId: 'prj_test' });
  });

  it('builds a component item embedding assets and nested masters, then inserts with fresh ids', async () => {
    const { card, img } = docWithImageCard();
    const inner = createNode('box', { name: 'Badge', replaceStyles: true, styles: { width: '40px', height: '40px' } });
    useDoc.getState().mutate('inner', (d) => insertNode(d as KDocument, inner, card.id));
    const innerCompId = createComponentFromNode(inner.id)!;
    const doc = useDoc.getState().doc;
    const item = (await buildComponentItem(doc, card.id, { name: 'Logo card', tags: ['cards', 'cards', ' hero '], folder: 'Cards' }, 'prj_test'))!;
    expect(item.kind).toBe('component');
    expect(item.tags).toEqual(['cards', 'hero']);
    const data = item.data as import('@/features/library/libraryItems').ComponentItemData;
    expect(data.rootId).toBe(card.id);
    expect(data.nodes[card.id].styles.base.left).toBeUndefined();
    expect(data.nodes[card.id].styles.base.width).toBe('300px');
    expect(Object.keys(data.assets)).toEqual(['as_logo1']);
    expect(dataUrlToBytes(data.assets.as_logo1.dataUrl).bytes).toEqual(PNG);
    expect(data.components[innerCompId].rootId).toBe(inner.id);
    expect(data.nodes[inner.id]).toBeTruthy();
    expect(JSON.parse(JSON.stringify(item)).data.rootId).toBe(card.id);

    // insert into a brand-new project document
    freshDoc();
    const target = useDoc.getState().doc.pages[0].rootId;
    useUI.getState().set({ projectId: 'prj_other', selection: [] });
    const before = useDoc.getState().past.length;
    expect(useLibraryItem(item)).toBe(true);
    expect(useDoc.getState().past.length).toBe(before + 1);
    await new Promise((r) => setTimeout(r, 10));
    const d2 = useDoc.getState().doc;
    const instId = d2.nodes[target].children[0];
    const inst = d2.nodes[instId];
    expect(inst.type).toBe('instance');
    const comp = d2.components[inst.props.componentId!];
    expect(comp.libraryItemId).toBe(item.id);
    expect(comp.rootId).not.toBe(card.id);
    const master = d2.nodes[comp.rootId];
    expect(master.parent).toBeNull();
    const [newImg, newInner] = master.children.map((c) => d2.nodes[c]);
    expect(newImg.id).not.toBe(img.id);
    expect(newImg.animations![0].id).not.toBe('a_1');
    const newAssetId = Object.keys(d2.assets)[0];
    expect(newAssetId).toBeTruthy();
    expect(newAssetId).not.toBe('as_logo1');
    expect(newImg.props.src).toBe(`asset:${newAssetId}`);
    expect(newImg.styles.base['background-image']).toBe(`url(asset:${newAssetId})`);
    expect(Object.values(written)).toHaveLength(1);
    expect(written[Object.keys(written)[0]]).toEqual(PNG);
    expect(newInner.type).toBe('instance');
    const nested = d2.components[newInner.props.componentId!];
    expect(nested.libraryItemId).toBe(`${item.id}#${innerCompId}`);
    expect(nested.rootId).not.toBe(inner.id);

    // reuse: inserting again does not create another component or write assets
    expect(useLibraryItem(item)).toBe(true);
    const d3 = useDoc.getState().doc;
    expect(Object.values(d3.components).filter((c) => c.libraryItemId === item.id)).toHaveLength(1);
    expect(Object.keys(d3.assets)).toHaveLength(1);
    expect(d3.nodes[target].children).toHaveLength(2);
    expect(ensureProjectComponent(item)).toBe(comp.id);

    useDoc.getState().undo();
    useDoc.getState().undo();
    expect(Object.keys(useDoc.getState().doc.components)).toHaveLength(0);
  });

  it('applies palettes, animations and styles undoably', () => {
    const { root } = freshDoc();
    const box = createNode('box', { name: 'B', replaceStyles: true, styles: { width: '10px' } });
    useDoc.getState().mutate('x', (d) => insertNode(d as KDocument, box, root));
    const palette = buildPaletteItem([{ name: 'primary', value: '#ff0000' }, { name: 'brand-pink', value: '#ff66aa' }], { name: 'Pal' });
    useLibraryItem(palette);
    const tokens = useDoc.getState().doc.tokens.colors;
    expect(tokens.find((c) => c.name === 'primary')!.value).toBe('#ff0000');
    expect(tokens.find((c) => c.name === 'brand-pink')!.value).toBe('#ff66aa');
    useDoc.getState().undo();
    expect(useDoc.getState().doc.tokens.colors.find((c) => c.name === 'brand-pink')).toBeUndefined();

    const anim = docWithImageCard().img.animations![0];
    const root2 = freshDoc().root;
    const b2 = createNode('box', { name: 'B2', replaceStyles: true, styles: {} });
    useDoc.getState().mutate('x', (d) => insertNode(d as KDocument, b2, root2));
    const animItem = buildAnimationItem(anim, { name: 'Fade in' });
    useUI.getState().set({ selection: [b2.id] });
    expect(useLibraryItem(animItem)).toBe(true);
    expect(useDoc.getState().doc.nodes[b2.id].animations![0].id).not.toBe(anim.id);
    expect(applyAnimationToNodes(anim, [])).toBe(false);

    const styled = createNode('button', { name: 'S', replaceStyles: true, styles: { position: 'absolute', left: '5px', 'background-color': '#123456', 'border-radius': '99px' } });
    styled.states = { hover: { 'background-color': '#654321' } };
    const styleItem = buildStyleItem(styled, { name: 'Pill' });
    expect((styleItem.data as { styles: Record<string, string> }).styles).toEqual({ 'background-color': '#123456', 'border-radius': '99px' });
    expect(useLibraryItem(styleItem)).toBe(true);
    const n = useDoc.getState().doc.nodes[b2.id];
    expect(n.styles.base['border-radius']).toBe('99px');
    expect(n.states?.hover?.['background-color']).toBe('#654321');
  });

  it('library packs round trip', async () => {
    const a = buildPaletteItem([{ name: 'primary', value: '#111111' }], { name: 'A', folder: 'Brand' });
    const b = buildAnimationItem(docWithImageCard().img.animations![0], { name: 'B' });
    const bytes = await packLibrary([a, b], ['Brand', 'Unused']);
    const out = await unpackLibrary(bytes);
    expect(out.items.map((i) => i.id)).toEqual([a.id, b.id]);
    expect(out.folders).toEqual(['Brand']);
    await expect(unpackLibrary(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(KinemaFileError);
  });
});

describe('.kinema packages', () => {
  it('pack / unpack round trip with assets, assigning a new id on import', async () => {
    const m = mockPlatform();
    const file = createProjectFile('My site');
    file.document.assets.as_a = { id: 'as_a', name: 'a.png', kind: 'image', mime: 'image/png', size: PNG.length, path: 'assets/as_a-a.png', createdAt: 1 };
    await m.p.projects.save(file);
    await m.p.assets.write(file.id, 'as_a-a.png', PNG, 'image/png');

    const { name, data } = await exportProjectPackage(m.p, file.id);
    expect(name).toBe('My site');
    const un = await unpackProject(data);
    expect(un.file.id).toBe(file.id);
    expect(un.assets.get('assets/as_a-a.png')).toEqual(PNG);

    const imported = await importProjectPackage(m.p, data);
    expect(imported.id).not.toBe(file.id);
    expect(imported.name).toBe('My site');
    const loaded = await m.p.projects.load(imported.id);
    expect(loaded.id).toBe(imported.id);
    expect(loaded.document.assets.as_a.path).toBe('assets/as_a-a.png');
    expect(await m.p.assets.read(imported.id, 'assets/as_a-a.png')).toEqual(PNG);
    expect((await m.p.projects.list()).length).toBe(2);
  });

  it('rejects invalid files with friendly errors', async () => {
    await expect(unpackProject(new Uint8Array([0, 1, 2]))).rejects.toThrow(/isn’t a Kinema project/);
    const JSZip = (await import('jszip')).default;
    const z1 = new JSZip();
    z1.file('hello.txt', 'x');
    await expect(unpackProject(await z1.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/project\.json is missing/);
    const z2 = new JSZip();
    z2.file('project.json', JSON.stringify({ format: 'kinema-project', formatVersion: 9, document: {} }));
    await expect(unpackProject(await z2.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/newer version/);
    const z3 = new JSZip();
    z3.file('project.json', '{ not json');
    await expect(unpackProject(await z3.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/damaged/);
    const z4 = new JSZip();
    z4.file('project.json', JSON.stringify({ format: 'kinema-project', formatVersion: 1, document: { pages: [], nodes: {} } }));
    await expect(unpackProject(await z4.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/incomplete/);
  });

  it('packProject skips missing asset files', async () => {
    const file = createProjectFile('X');
    file.document.assets.as_a = { id: 'as_a', name: 'a.png', kind: 'image', mime: 'image/png', size: 1, path: 'assets/a.png', createdAt: 1 };
    const bytes = await packProject(file, async () => {
      throw new Error('missing');
    });
    expect((await unpackProject(bytes)).assets.size).toBe(0);
  });
});
