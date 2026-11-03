import { describe, expect, it } from 'vitest';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { createDocument, DEFAULT_BREAKPOINTS } from '@/core/model/factory';
import { importHtml } from '@/core/io/htmlImport';
import { serializeNodes, describeOutline, restoreSrcMap } from '@/core/ai/serialize';
import { extractStyleContext, renderStyleContext, STYLE_PRESETS, renderPreset } from '@/core/ai/styleContext';
import { applyAnimations, applyEdit, editTargets, insertGenerated, reservedIdsFor } from '@/core/ai/apply';
import { validateAnimations } from '@/core/ai/animSpec';
import { readFileSync } from 'node:fs';

const SAMPLE = `<style>
.hero{display:flex;gap:24px;padding:64px;background:#0b1020;color:#e7eaf6}
.hero h1{font-size:56px;font-weight:800}
.btn{background:#6d7cff;color:#fff;border-radius:10px;padding:12px 20px}
.btn:hover{background:#5563e8}
@media (max-width:1024px){.hero{flex-direction:column}}
@media (max-width:640px){.hero{padding:24px}.hero h1{font-size:32px}}
@keyframes rise{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
.hero h1{animation:rise .6s ease both}
</style>
<section class="hero"><h1>Build <em>faster</em></h1><p>Tools for makers</p><a class="btn" href="/go">Start</a></section>`;

function reset() {
  const doc = createDocument('t');
  useDoc.getState().loadDocument(doc);
  useUI.getState().set({ activePageId: doc.pages[0].id, selection: [], breakpoint: 'base', editingComponentId: null });
  return doc;
}

function loadSample() {
  const doc = reset();
  const res = importHtml(SAMPLE, { breakpoints: DEFAULT_BREAKPOINTS });
  const root = doc.pages[0].rootId;
  useDoc.getState().mutate('seed', (d) => {
    for (const n of Object.values(res.nodes)) d.nodes[n.id] = n;
    d.nodes[root].children.push(res.rootIds[0]);
    d.nodes[res.rootIds[0]].parent = root;
  });
  useDoc.getState().clearHistory();
  return { root, hero: res.rootIds[0] };
}

describe('serializer', () => {
  it('round-trips through importHtml keeping ids, styles, breakpoints, states', () => {
    const { hero } = loadSample();
    const doc = useDoc.getState().doc;
    const ser = serializeNodes(doc, [hero]);
    expect(ser.html).toContain(`data-kid="${hero}"`);
    expect(ser.css).toContain('@media (max-width:1024px)');
    expect(ser.css).toContain(':hover');
    const back = importHtml(ser.html, { breakpoints: doc.breakpoints, keepIds: true });
    expect(Object.keys(back.nodes).sort()).toEqual([...ser.ids].sort());
    const h = back.nodes[hero];
    expect(h.styles.base).toMatchObject(doc.nodes[hero].styles.base);
    expect(h.styles.tablet).toEqual(doc.nodes[hero].styles.tablet);
    expect(h.styles.mobile).toEqual(doc.nodes[hero].styles.mobile);
    const link = doc.nodes[hero].children.map((c) => doc.nodes[c]).find((n) => n.type === 'link')!;
    expect(back.nodes[link.id].states?.hover).toEqual(link.states?.hover);
  });
  it('elides long data urls and restores them', () => {
    const doc = reset();
    const src = 'data:image/png;base64,' + 'A'.repeat(400);
    const root = doc.pages[0].rootId;
    useDoc.getState().mutate('x', (d) => {
      d.nodes.img1 = { id: 'img1', type: 'image', name: 'Pic', parent: root, children: [], props: { src, alt: 'x' }, styles: { base: {} } };
      d.nodes[root].children.push('img1');
    });
    const cur = useDoc.getState().doc;
    const ser = serializeNodes(cur, ['img1']);
    expect(ser.html).not.toContain('AAAA');
    const back = importHtml(ser.html, { breakpoints: cur.breakpoints, keepIds: true });
    restoreSrcMap(back.nodes, ser.srcMap);
    expect(back.nodes.img1.props.src).toBe(src);
  });
  it('describes outlines compactly', () => {
    const { hero } = loadSample();
    const o = describeOutline(useDoc.getState().doc, [hero], { withIds: true });
    expect(o.text).toContain(hero);
    expect(o.lines).toBeGreaterThan(2);
  });
});

describe('style context', () => {
  it('reads the theme from the dominant section backgrounds, not only the page frame', async () => {
    const { createDocument, createNode } = await import('@/core/model/factory');
    const { insertNode } = await import('@/core/model/tree');
    const d = createDocument();
    const root = d.pages[0].rootId;
    d.nodes[root].styles.base['background-color'] = '#ffffff'; // white frame …
    for (let i = 0; i < 3; i++) {
      const sec = createNode('box', { name: `S${i}`, styles: { 'background-color': '#0b1020', width: '100%' } }); // … full of dark sections
      insertNode(d, sec, root);
      insertNode(d, createNode('button', { styles: { 'background-color': '#ffffff' } }), sec.id);
    }
    const ctx = extractStyleContext(d, [root]);
    expect(ctx.theme).toBe('dark');
    expect(ctx.pageBackground).toBe('#0b1020');
    d.nodes[d.nodes[root].children[0]].styles.base['background-color'] = '#f6f6fb';
    d.nodes[d.nodes[root].children[1]].styles.base['background-color'] = '#ffffff';
    expect(extractStyleContext(d, [root]).theme).toBe('light');
  });
  it('extracts palette, fonts, buttons and renders a section', () => {
    const { root } = loadSample();
    useDoc.getState().mutate('bg', (d) => {
      d.nodes[root].styles.base['background-color'] = '#0b1020';
    });
    const doc = useDoc.getState().doc;
    const ctx = extractStyleContext(doc, [root]);
    expect(ctx.theme).toBe('dark');
    expect(ctx.backgrounds[0]).toBe('#0b1020');
    expect(ctx.accents).toContain('#6d7cff');
    expect(ctx.fontSizes).toContain(56);
    expect(ctx.buttons[0]).toContain('border-radius: 10px');
    const text = renderStyleContext(ctx, doc);
    expect(text).toContain('#0b1020');
    expect(text.length).toBeLessThan(2500);
  });
  it('has 6 presets using bundled fonts', () => {
    expect(STYLE_PRESETS.map((p) => p.name)).toEqual(['Midnight', 'Paper', 'Neon', 'Corporate', 'Pastel', 'Brutalist']);
    // designFonts.ts uses ?url asset imports, so read the family names from its source
    const src = readFileSync('src/core/fonts/designFonts.ts', 'utf8');
    const fams = new Set([...src.matchAll(/family: '([^']+)'/g)].map((m) => m[1]));
    for (const p of STYLE_PRESETS) {
      expect(fams.has(p.fonts.heading)).toBe(true);
      expect(fams.has(p.fonts.body)).toBe(true);
      expect(renderPreset(p)).toContain(p.colors.primary);
    }
  });
});

describe('apply', () => {
  it('replaces a subtree in one undo step keeping ids and animations', () => {
    const { hero } = loadSample();
    const doc = useDoc.getState().doc;
    const h1 = doc.nodes[hero].children.find((c) => doc.nodes[c].tag === 'h1')!;
    expect(doc.nodes[h1].animations?.length).toBe(1);
    const targets = editTargets(doc, [hero]);
    const ser = serializeNodes(doc, targets.ids);
    const edited = ser.html.replace('Tools for makers', 'Tools for great makers');
    const res = importHtml(edited, { breakpoints: doc.breakpoints, keepIds: true, reservedIds: reservedIdsFor(doc, ser.ids) });
    const before = useDoc.getState().past.length;
    const out = applyEdit(targets, res, ser, '✨ AI: edit');
    expect(useDoc.getState().past.length).toBe(before + 1);
    expect(useDoc.getState().past.at(-1)?.ai).toBe(true);
    expect(out.kept).toBe(out.total);
    const after = useDoc.getState().doc;
    expect(after.nodes[hero]).toBeTruthy();
    expect(after.nodes[h1].animations?.length).toBe(1);
    expect(JSON.stringify(after.nodes)).toContain('great makers');
    useDoc.getState().undo();
    expect(JSON.stringify(useDoc.getState().doc.nodes)).not.toContain('great makers');
  });

  it('inserts a generated page into an empty page as one step and applies animations', async () => {
    const doc = reset();
    const res = importHtml('<style>body{background:#111;color:#fff;font-family:Inter}.a{padding:40px}</style><header class="a">Top</header><section class="a">Mid</section>', { breakpoints: DEFAULT_BREAKPOINTS });
    const out = await insertGenerated(res, 'page', '✨ AI: page');
    const d = useDoc.getState().doc;
    const frame = d.nodes[doc.pages[0].rootId];
    expect(frame.children).toHaveLength(2);
    expect(frame.styles.base.display).toBe('flex');
    expect(frame.styles.base['background']).toBe('#111');
    expect(useDoc.getState().past).toHaveLength(1);
    expect(useDoc.getState().past[0].ai).toBe(true);
    expect(useUI.getState().selection).toEqual(out.rootIds);
    const target = frame.children[0];
    const v = validateAnimations({ animations: [{ target, name: 'Fade', trigger: 'load', duration: 500, keyframes: [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 1 }] }] }, [{ id: target, name: 'x' }]);
    const r = applyAnimations(v.items, '✨ AI: anim');
    expect(r.count).toBe(1);
    expect(useDoc.getState().doc.nodes[target].animations).toHaveLength(1);
    expect(useDoc.getState().past).toHaveLength(2);
  });
});
