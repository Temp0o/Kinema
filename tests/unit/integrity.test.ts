/**
 * Randomised integrity test: apply random sequences of editor actions (core actions plus the
 * component / library / animation / AI / asset features), then undo everything and redo
 * everything, checking structural invariants after every single step and exact document
 * equality for every state we passed through.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/fonts/designFonts', () => ({ BUNDLED_FONTS: [], SYSTEM_FONTS: [], findBundledFont: () => undefined, registerBundledFonts: () => {} }));

import { useDoc, docApi } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { createDocument, createNode } from '@/core/model/factory';
import { getSubtreeIds, repairDocument } from '@/core/model/tree';
import type { KDocument, KNode, NodeId, NodeType } from '@/core/model/types';
import {
  addAnimation,
  addPage,
  deleteNodes,
  deletePage,
  duplicateNodes,
  duplicatePage,
  groupNodes,
  insertNewNode,
  moveNodes,
  removeAnimation,
  renamePage,
  reorderNodes,
  reorderPages,
  setNodeFields,
  setProps,
  setStyle,
  ungroupNodes,
  updateAnimation,
} from '@/core/store/actions';
import {
  createComponentFromNode,
  deleteComponent,
  detachInstance,
  insertInstance,
  resetInstanceOverrides,
  setInstanceTextOverride,
} from '@/features/components/componentActions';
import { buildComponentItem, buildItemNodes, ensureProjectComponent, useLibraryItem } from '@/features/library/libraryItems';
import { applyPreset } from '@/features/animation/animActions';
import { PRESETS } from '@/core/anim/presets';
import { deleteAsset, renameAsset } from '@/features/assets/assetActions';
import { importHtml } from '@/core/io/htmlImport';
import { serializeNodes } from '@/core/ai/serialize';
import { applyEdit, editTargets, insertGenerated, reservedIdsFor } from '@/core/ai/apply';
import { compileSiteText } from '@/core/export';
import { insertSubtrees } from '@/features/insert/placement';
import { buildPayload, parsePayload, pastePayload } from '@/features/clipboard/clipboard';

// ── deterministic PRNG ──
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── invariants ──
export function structuralProblems(doc: KDocument): string[] {
  const out: string[] = [];
  const roots = new Set<NodeId>();
  for (const p of doc.pages) {
    if (!doc.nodes[p.rootId]) out.push(`page ${p.id} has no root`);
    roots.add(p.rootId);
  }
  if (!doc.pages.length) out.push('no pages');
  for (const c of Object.values(doc.components)) {
    if (!doc.nodes[c.rootId]) out.push(`component ${c.id} has no master`);
    if (roots.has(c.rootId)) out.push(`component ${c.id} master is also a page root`);
    roots.add(c.rootId);
  }
  for (const [key, n] of Object.entries(doc.nodes)) {
    if (n.id !== key) out.push(`node key mismatch ${key}`);
    if (roots.has(n.id) && n.parent !== null) out.push(`root ${n.id} has a parent`);
    if (n.parent !== null) {
      const p = doc.nodes[n.parent];
      if (!p) out.push(`${n.id} has missing parent ${n.parent}`);
      else if (!p.children.includes(n.id)) out.push(`${n.id} missing from parent's children`);
    } else if (!roots.has(n.id)) out.push(`orphan ${n.id}`);
    if (new Set(n.children).size !== n.children.length) out.push(`duplicate children in ${n.id}`);
    for (const c of n.children) {
      if (!doc.nodes[c]) out.push(`${n.id} has dangling child ${c}`);
      else if (doc.nodes[c].parent !== n.id) out.push(`child ${c} of ${n.id} has parent ${doc.nodes[c].parent}`);
    }
    if (n.type === 'instance') {
      if (!n.props.componentId || !doc.components[n.props.componentId]) out.push(`instance ${n.id} references missing component ${n.props.componentId}`);
      if (n.children.length) out.push(`instance ${n.id} has children`);
    }
  }
  // reachability + no parent cycles
  const reach = new Set<NodeId>();
  for (const r of roots) for (const id of getSubtreeIds(doc.nodes, r)) reach.add(id);
  for (const id of Object.keys(doc.nodes)) if (!reach.has(id)) out.push(`unreachable ${id}`);
  for (const id of Object.keys(doc.nodes)) {
    let cur: NodeId | null = id;
    let hops = 0;
    while (cur && hops++ < 10000) cur = doc.nodes[cur]?.parent ?? null;
    if (hops >= 10000) out.push(`parent cycle at ${id}`);
  }
  // component graph is acyclic
  const state = new Map<string, number>();
  const visit = (cid: string): boolean => {
    state.set(cid, 1);
    const comp = doc.components[cid];
    for (const id of comp ? getSubtreeIds(doc.nodes, comp.rootId) : []) {
      const ref = doc.nodes[id]?.type === 'instance' ? doc.nodes[id].props.componentId : undefined;
      if (!ref || !doc.components[ref]) continue;
      if (state.get(ref) === 1) return true;
      if (!state.has(ref) && visit(ref)) return true;
    }
    state.set(cid, 2);
    return false;
  };
  for (const cid of Object.keys(doc.components)) if (!state.has(cid) && visit(cid)) out.push(`component cycle via ${cid}`);
  // repairDocument has nothing left to fix
  const issues = repairDocument(structuredClone(doc));
  if (issues.length) out.push(...issues.map((i) => `repair: ${i}`));
  for (const n of Object.values(doc.nodes)) {
    for (const a of n.animations ?? []) {
      if (!Array.isArray(a.keyframes)) out.push(`animation ${a.id} lacks keyframes`);
    }
  }
  return out;
}

// ── harness ──
type Ctx = { r: () => number; label: string[] };
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const doc = () => useDoc.getState().doc;
const ui = () => useUI.getState();

function pageRootIds(): NodeId[] {
  return doc().pages.map((p) => p.rootId);
}
function currentPageRoot(): NodeId {
  const d = doc();
  return (d.pages.find((p) => p.id === ui().activePageId) ?? d.pages[0]).rootId;
}
function nodesOnPage(): KNode[] {
  return getSubtreeIds(doc().nodes, currentPageRoot()).map((id) => doc().nodes[id]);
}
const CONTAINERS = new Set<NodeType>(['frame', 'box']);
function containers(): KNode[] {
  return nodesOnPage().filter((n) => CONTAINERS.has(n.type));
}
function nonRoot(): KNode[] {
  return nodesOnPage().filter((n) => n.parent);
}
function select(ids: NodeId[]) {
  ui().set({ selection: ids });
}

const HTML_SNIPPETS = [
  '<section class="s" style="padding:20px"><h2>Hello</h2><p>World <b>bold</b></p><a href="#x">link</a></section>',
  '<div class="a" style="display:flex;gap:8px"><div class="b" style="width:40px;height:40px;background:#f00"></div><div class="c">c</div></div>',
  '<svg viewBox="0 0 10 10" width="40" height="40"><path d="M0 0L10 10" stroke="#000"/></svg>',
  '<ul><li>one</li><li>two</li></ul><button>Go</button>',
];

type Action = { name: string; run: (c: Ctx) => void | Promise<void> };
const ACTIONS: Action[] = [
  { name: 'insert node', run: ({ r }) => { select([pick(r, containers()).id]); insertNewNode(pick(r, ['box', 'text', 'button', 'link', 'image', 'input', 'svg'] as NodeType[])); } },
  { name: 'insert catalog-like subtrees', run: ({ r }) => {
      const t = pick(r, containers());
      const n1 = createNode('box', { name: 'cat', styles: { width: '120px', height: '80px' } });
      const n2 = createNode('text', { props: { text: 'x' } });
      n2.parent = n1.id;
      n1.children.push(n2.id);
      select([t.id]);
      insertSubtrees([{ sub: { rootId: n1.id, nodes: { [n1.id]: n1, [n2.id]: n2 } }, size: { w: 120, h: 80 } }], { label: 'Insert cat', parentId: t.id });
    } },
  { name: 'delete', run: ({ r }) => { const c = nonRoot(); if (c.length) deleteNodes([pick(r, c).id]); } },
  { name: 'duplicate', run: ({ r }) => { const c = nonRoot(); if (c.length) duplicateNodes([pick(r, c).id], { offset: 8 }); } },
  { name: 'move (reparent)', run: ({ r }) => { const c = nonRoot(); if (c.length) moveNodes([pick(r, c).id], pick(r, containers()).id, r() < 0.5 ? 0 : undefined); } },
  { name: 'reorder', run: ({ r }) => { const c = nonRoot(); if (c.length) reorderNodes([pick(r, c).id], pick(r, ['forward', 'backward', 'front', 'back'] as const)); } },
  { name: 'group', run: ({ r }) => { const p = pick(r, containers()); if (p.children.length) groupNodes(p.children.slice(0, 1 + Math.floor(r() * 2))); } },
  { name: 'ungroup', run: ({ r }) => { const c = nonRoot().filter((n) => n.children.length && n.type === 'box'); if (c.length) ungroupNodes([pick(r, c).id]); } },
  { name: 'style', run: ({ r }) => { const c = nodesOnPage(); setStyle([pick(r, c).id], 'color', `#${Math.floor(r() * 0xffffff).toString(16).padStart(6, '0')}`, { coalesce: false }); } },
  { name: 'props', run: ({ r }) => { const c = nodesOnPage().filter((n) => n.type === 'text'); if (c.length) setProps([pick(r, c).id], { text: `t${Math.floor(r() * 99)}` }, {}); } },
  { name: 'hide/lock', run: ({ r }) => { const c = nonRoot(); if (c.length) setNodeFields([pick(r, c).id], r() < 0.5 ? { hidden: true } : { locked: true }); } },
  { name: 'add animation', run: ({ r }) => { const c = nodesOnPage(); const n = pick(r, c); addAnimation(n.id, { id: `a${Math.floor(r() * 1e9)}`, name: 'fade', trigger: 'load', duration: 400, delay: 0, iterations: 1, direction: 'normal', fill: 'both', easing: 'ease', keyframes: [{ id: 'k1', offset: 0, values: { opacity: 0 } }, { id: 'k2', offset: 1, values: { opacity: 1 } }] }); } },
  { name: 'edit/remove animation', run: ({ r }) => {
      const withAnim = nodesOnPage().filter((n) => n.animations?.length);
      if (!withAnim.length) return;
      const n = pick(r, withAnim);
      const a = n.animations![0];
      if (r() < 0.5) updateAnimation(n.id, a.id, (x) => void (x.duration = 100 + Math.floor(r() * 900)));
      else removeAnimation(n.id, a.id);
    } },
  { name: 'animation preset', run: ({ r }) => { const c = nodesOnPage(); applyPreset([pick(r, c).id], pick(r, PRESETS)); } },
  { name: 'svg draw-on preset', run: ({ r }) => {
      const svgs = nodesOnPage().filter((n) => n.type === 'svg');
      const preset = PRESETS.find((p) => p.category === 'svg');
      if (preset) applyPreset(svgs.length ? [pick(r, svgs).id] : [pick(r, nodesOnPage()).id], preset);
    } },
  { name: 'add page', run: () => void addPage() },
  { name: 'rename page', run: ({ r }) => renamePage(pick(r, doc().pages).id, `Page ${Math.floor(r() * 99)}`) },
  { name: 'delete page', run: ({ r }) => deletePage(pick(r, doc().pages).id) },
  { name: 'duplicate page', run: ({ r }) => duplicatePage(pick(r, doc().pages).id) },
  { name: 'reorder pages', run: ({ r }) => { const n = doc().pages.length; if (n > 1) reorderPages(Math.floor(r() * n), Math.floor(r() * n)); } },
  { name: 'switch page', run: ({ r }) => ui().set({ activePageId: pick(r, doc().pages).id, selection: [] }) },
  { name: 'create component', run: ({ r }) => { const c = nonRoot().filter((n) => n.type !== 'instance'); if (c.length) createComponentFromNode(pick(r, c).id); } },
  { name: 'insert instance', run: ({ r }) => { const comps = Object.values(doc().components); if (comps.length) insertInstance(pick(r, comps).id, { parentId: pick(r, containers()).id }); } },
  { name: 'detach instance', run: ({ r }) => { const i = nodesOnPage().filter((n) => n.type === 'instance'); if (i.length) detachInstance(pick(r, i).id); } },
  { name: 'delete component', run: ({ r }) => { const comps = Object.values(doc().components); if (comps.length) deleteComponent(pick(r, comps).id); } },
  { name: 'instance override', run: ({ r }) => {
      const i = nodesOnPage().filter((n) => n.type === 'instance');
      if (!i.length) return;
      const inst = pick(r, i);
      const comp = doc().components[inst.props.componentId!];
      const texts = getSubtreeIds(doc().nodes, comp.rootId).filter((id) => doc().nodes[id].type === 'text');
      if (texts.length) setInstanceTextOverride(inst.id, pick(r, texts), `o${Math.floor(r() * 99)}`);
      else resetInstanceOverrides(inst.id);
    } },
  { name: 'library: save + first insert (click)', run: async ({ r }) => {
      const c = nonRoot().filter((n) => n.type !== 'instance');
      if (!c.length) return;
      const item = await buildComponentItem(doc(), pick(r, c).id, { name: 'Lib' }, null);
      if (!item) return;
      select([pick(r, containers()).id]);
      useLibraryItem(item);
      useLibraryItem(item); // second insert reuses the project component
    } },
  { name: 'library: drop (build + insert)', run: async ({ r }) => {
      const c = nonRoot().filter((n) => n.type !== 'instance');
      if (!c.length) return;
      const item = await buildComponentItem(doc(), pick(r, c).id, { name: 'LibDrop' }, null);
      if (!item) return;
      const parent = pick(r, containers()).id;
      docApi.begin('Insert drop'); // what canvasDrop does
      try {
        const sub = buildItemNodes(item);
        if (sub) docApi.mutate('Insert drop', (d) => void (sub.nodes[sub.rootId] && (d.nodes[sub.rootId] = sub.nodes[sub.rootId], d.nodes[sub.rootId].parent = parent, d.nodes[parent].children.push(sub.rootId))));
      } finally {
        docApi.commit();
      }
    } },
  { name: 'ensureProjectComponent only', run: async ({ r }) => {
      const c = nonRoot().filter((n) => n.type !== 'instance');
      if (!c.length) return;
      const item = await buildComponentItem(doc(), pick(r, c).id, { name: 'Ens' }, null);
      if (item) ensureProjectComponent(item);
    } },
  { name: 'ai: insert generated', run: async ({ r }) => {
      const res = importHtml(pick(r, HTML_SNIPPETS), { breakpoints: doc().breakpoints, aiGenerated: true });
      select([pick(r, containers()).id]);
      await insertGenerated(res, pick(r, ['page', 'section', 'component'] as const), 'AI gen');
    } },
  { name: 'ai: edit selection', run: async ({ r }) => {
      const c = nonRoot().filter((n) => n.type !== 'instance');
      if (!c.length) return;
      const targets = editTargets(doc(), [pick(r, c).id]);
      if (!targets.ids.length) return;
      const ser = serializeNodes(doc(), targets.ids);
      const res = importHtml(ser.html + pick(r, HTML_SNIPPETS), { breakpoints: doc().breakpoints, keepIds: true, reservedIds: reservedIdsFor(doc(), ser.ids), aiGenerated: true });
      if (res.rootIds.length) applyEdit(targets, res, ser, 'AI edit');
    } },
  { name: 'ai: edit page', run: async ({ r }) => {
      const root = currentPageRoot();
      const targets = editTargets(doc(), [root]);
      const ser = serializeNodes(doc(), [root]);
      const res = importHtml(ser.html + pick(r, HTML_SNIPPETS), { breakpoints: doc().breakpoints, keepIds: true, reservedIds: reservedIdsFor(doc(), ser.ids.filter((i) => i !== root)), aiGenerated: true });
      if (res.rootIds.length) applyEdit(targets, res, ser, 'AI page edit');
    } },
  { name: 'clipboard: copy + paste (incl. component masters)', run: async ({ r }) => {
      const c = nonRoot();
      if (!c.length) return;
      const payload = buildPayload(doc(), [pick(r, c).id], 'p-test');
      if (!payload) return;
      // through the wire format, as a real paste would
      const wire = parsePayload(JSON.stringify(payload));
      if (!wire) return;
      select([pick(r, containers()).id]);
      await pastePayload(wire);
      // pasting into a second project (components / assets that don't exist there)
      if (r() < 0.3) await pastePayload(parsePayload(JSON.stringify({ ...payload, project: 'other' }))!);
    } },
  { name: 'assets: add/rename/delete', run: ({ r }) => {
      const d = doc();
      const ids = Object.keys(d.assets);
      const roll = r();
      if (!ids.length || roll < 0.4) {
        const id = `as_${Math.floor(r() * 1e9)}`;
        docApi.mutate('Import asset', (x) => void (x.assets[id] = { id, name: `a${id}.png`, kind: 'image', mime: 'image/png', size: 1, path: `assets/${id}.png`, createdAt: 0 }));
      } else if (roll < 0.7) renameAsset(pick(r, ids), `n${Math.floor(r() * 99)}`);
      else deleteAsset(pick(r, ids));
    } },
];

const sleepFrame = () => new Promise((res) => setTimeout(res, 0));
/** action name → [times run, times it changed the document, max history entries one run added] */
const STATS = new Map<string, [number, number, number]>();

async function runSequence(seed: number, steps: number): Promise<{ log: string[] }> {
  const r = rng(seed);
  const log: string[] = [];
  const d0 = createDocument('Integrity');
  useDoc.getState().loadDocument(d0);
  useUI.setState({ route: 'editor', projectId: 'p-test', activePageId: d0.pages[0].id, selection: [], editingComponentId: null, breakpoint: 'base', canvasWidth: 1440 });
  expect(structuralProblems(doc())).toEqual([]);

  // states[n] = document after the last action that left the history at length n
  const states = new Map<number, KDocument>();
  states.set(useDoc.getState().past.length, doc());
  for (let i = 0; i < steps; i++) {
    const a = pick(r, ACTIONS);
    log.push(a.name);
    const lenBefore = useDoc.getState().past.length;
    // keep coalescing out of the picture: every action is its own step
    await a.run({ r, label: log });
    const effect = useDoc.getState().past.length - lenBefore;
    STATS.set(a.name, [(STATS.get(a.name)?.[0] ?? 0) + 1, (STATS.get(a.name)?.[1] ?? 0) + (effect > 0 ? 1 : 0), Math.max(STATS.get(a.name)?.[2] ?? 0, effect)]);
    await sleepFrame();
    const problems = structuralProblems(doc());
    if (problems.length) throw new Error(`seed ${seed} step ${i} after "${a.name}" (log: ${log.join(' > ')}):\n${problems.slice(0, 8).join('\n')}`);
    states.set(useDoc.getState().past.length, doc());
    if (useDoc.getState().tx) throw new Error(`seed ${seed}: transaction left open after "${a.name}"`);
  }
  const finalDoc = doc();
  const top = useDoc.getState().past.length;

  // undo everything
  for (let len = top; len > 0; len--) {
    useDoc.getState().undo();
    expect(useDoc.getState().past.length).toBe(len - 1);
    const problems = structuralProblems(doc());
    if (problems.length) throw new Error(`seed ${seed} after UNDO to ${len - 1} (log: ${log.join(' > ')}):\n${problems.slice(0, 8).join('\n')}`);
    const expected = states.get(len - 1);
    if (expected) expect(doc(), `seed ${seed}: undo to ${len - 1}`).toEqual(expected);
  }
  expect(doc(), `seed ${seed}: full undo`).toEqual(d0);

  // redo everything
  for (let len = 1; len <= top; len++) {
    useDoc.getState().redo();
    const problems = structuralProblems(doc());
    if (problems.length) throw new Error(`seed ${seed} after REDO to ${len} (log: ${log.join(' > ')}):\n${problems.slice(0, 8).join('\n')}`);
    const expected = states.get(len);
    if (expected) expect(doc(), `seed ${seed}: redo to ${len}`).toEqual(expected);
  }
  expect(doc(), `seed ${seed}: full redo`).toEqual(finalDoc);
  // and the result still exports
  expect(() => compileSiteText(doc(), { bundle: 'single' })).not.toThrow();
  return { log };
}

describe('document integrity under random action sequences', () => {
  beforeEach(() => {
    useDoc.getState().loadDocument(createDocument('x'));
    pageRootIds();
  });

  for (let seed = 1; seed <= 30; seed++) {
    it(`seed ${seed}`, async () => {
      await runSequence(seed, 45);
    }, 60000);
  }
});

describe('coverage of the random sequences', () => {
  it('every action type actually changed the document at least once and added at most one step', () => {
    const rows = [...STATS.entries()].map(([k, v]) => `${k}: ran ${v[0]}, effective ${v[1]}, max steps ${v[2]}`);
    if (process.env.KINEMA_STATS) console.warn(rows.join('\n'));
    for (const a of ACTIONS) {
      const s = STATS.get(a.name);
      expect(s, `${a.name} never ran`).toBeTruthy();
      if (a.name !== 'switch page') expect(s![1], `${a.name} never had an effect`).toBeGreaterThan(0);
      // library first-insert used to take two steps; asset import + insert are separate by design
      expect(s![2], `${a.name} adds more than one history step`).toBeLessThanOrEqual(/^(library: save|clipboard)/.test(a.name) ? 2 : 1);
    }
  });
});

describe('specific flows are one coherent undo step', () => {
  async function setup() {
    const d = createDocument('Flows');
    useDoc.getState().loadDocument(d);
    useUI.setState({ route: 'editor', projectId: 'p-test', activePageId: d.pages[0].id, selection: [], editingComponentId: null, breakpoint: 'base' });
    const a = createNode('box', { name: 'Card' });
    const t = createNode('text', { props: { text: 'hi' } });
    docApi.mutate('seed', (x) => {
      x.nodes[a.id] = { ...a, parent: d.pages[0].rootId, children: [t.id] };
      x.nodes[t.id] = { ...t, parent: a.id };
      x.nodes[d.pages[0].rootId].children.push(a.id);
    });
    return { d, a, t };
  }

  it('first-time library insert (click) = one step; undo removes both the component and the instance', async () => {
    const { a } = await setup();
    const item = (await buildComponentItem(doc(), a.id, { name: 'Card' }, null))!;
    const before = useDoc.getState().past.length;
    const docBefore = doc();
    select([doc().pages[0].rootId]);
    expect(useLibraryItem(item)).toBe(true);
    expect(useDoc.getState().past.length).toBe(before + 1);
    expect(Object.keys(doc().components).length).toBe(1);
    useDoc.getState().undo();
    expect(doc()).toEqual(docBefore);
    useDoc.getState().redo();
    expect(structuralProblems(doc())).toEqual([]);
  });

  it('library drop (build + insert) = one step', async () => {
    const { a } = await setup();
    const item = (await buildComponentItem(doc(), a.id, { name: 'Card' }, null))!;
    const before = useDoc.getState().past.length;
    docApi.begin('Insert Card');
    const sub = buildItemNodes(item)!;
    docApi.mutate('Insert Card', (d) => {
      d.nodes[sub.rootId] = sub.nodes[sub.rootId];
      d.nodes[sub.rootId].parent = d.pages[0].rootId;
      d.nodes[d.pages[0].rootId].children.push(sub.rootId);
    });
    docApi.commit();
    expect(useDoc.getState().past.length).toBe(before + 1);
  });

  it('undo of an AI edit keeps the animations the edit preserved', async () => {
    const { a } = await setup();
    addAnimation(a.id, { id: 'an1', name: 'fade', trigger: 'load', duration: 300, delay: 0, iterations: 1, direction: 'normal', fill: 'both', easing: 'ease', keyframes: [{ id: 'k1', offset: 0, values: { opacity: 0 } }, { id: 'k2', offset: 1, values: { opacity: 1 } }] });
    const snapshot = doc();
    const targets = editTargets(doc(), [a.id]);
    const ser = serializeNodes(doc(), targets.ids);
    const res = importHtml(ser.html, { breakpoints: doc().breakpoints, keepIds: true, reservedIds: reservedIdsFor(doc(), ser.ids), aiGenerated: true });
    const steps = useDoc.getState().past.length;
    applyEdit(targets, res, ser, 'AI edit');
    expect(useDoc.getState().past.length).toBe(steps + 1);
    expect(doc().nodes[a.id]?.animations?.length).toBe(1); // carried over by the edit
    useDoc.getState().undo();
    expect(doc()).toEqual(snapshot);
    expect(doc().nodes[a.id].animations?.[0].id).toBe('an1');
  });

  it('click-inserting the same item repeatedly cascades instead of stacking', async () => {
    await setup();
    const root = doc().pages[0].rootId;
    const lefts: string[] = [];
    for (let i = 0; i < 4; i++) {
      const n = createNode('box', { name: 'Box', styles: { width: '100px', height: '60px' } });
      insertSubtrees([{ sub: { rootId: n.id, nodes: { [n.id]: n } }, size: { w: 100, h: 60 } }], { label: 'Insert box', parentId: root });
      lefts.push(`${doc().nodes[n.id].styles.base.left}/${doc().nodes[n.id].styles.base.top}`);
    }
    expect(new Set(lefts).size).toBe(4);
    const [l0, t0] = lefts[0].split('/').map((v) => parseInt(v));
    const [l1, t1] = lefts[1].split('/').map((v) => parseInt(v));
    expect([l1 - l0, t1 - t0]).toEqual([24, 24]);
    // many inserts wrap around instead of walking off the page
    for (let i = 0; i < 30; i++) {
      const n = createNode('box', { name: 'Box', styles: { width: '100px', height: '60px' } });
      insertSubtrees([{ sub: { rootId: n.id, nodes: { [n.id]: n } }, size: { w: 100, h: 60 } }], { label: 'Insert box', parentId: root });
    }
    const maxLeft = Math.max(...doc().nodes[root].children.map((c) => parseInt(doc().nodes[c].styles.base.left ?? '0')));
    expect(maxLeft - l0).toBeLessThan(24 * 11);
  });
});
