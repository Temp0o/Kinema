// Export fidelity for the whole insert catalog (+ a few hand-built edge cases): every catalog item is
// inserted into one flow page, then canvas boxes are compared with the exported page at 1440/768/390.
//
// Usage: KINEMA_URL=http://localhost:5194/ node tests/e2e/catalog-fidelity.mjs   (env: TOLERANCE, OUT)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.env.KINEMA_URL ?? 'http://localhost:5194/';
const out = process.env.OUT ?? new URL('../../test-results/e2e/', import.meta.url).pathname;
const TOL = Number(process.env.TOLERANCE ?? 2);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push('console: ' + m.text()));
await page.goto(url);
await page.getByRole('button', { name: /new project/i }).first().click();
await page.getByRole('button', { name: /create project/i }).click();
await page.waitForSelector('.kc-root [data-kroot]');
await page.waitForFunction(() => !!window.__kinemaExport);

const count = await page.evaluate(async () => {
  const K = window.__kinemaExport;
  const cat = await import('/src/core/catalog/index.ts');
  const { createNode } = await import('/src/core/model/factory.ts');
  const st = K.useDoc.getState();
  const root = st.doc.pages[0].rootId;
  st.mutate('flow', (d) => {
    const s = d.nodes[root].styles.base;
    s.display = 'flex';
    s['flex-direction'] = 'column';
    s['min-height'] = '0px';
  });
  let n = 0;
  for (const item of cat.CATALOG) {
    const sub = cat.buildCatalogItem(item, K.useDoc.getState().doc);
    // flow layout: items stack; drop absolute placement the catalog may carry
    const r = sub.nodes[sub.rootId];
    if (r.styles.base.position === 'absolute') {
      delete r.styles.base.position;
      delete r.styles.base.left;
      delete r.styles.base.top;
    }
    K.addSubtree(sub, root, undefined, { select: false });
    n++;
  }
  // edge cases: plain link without text-decoration, text without sizes, nested inline link
  const link = createNode('link', { name: 'Plain link', props: { text: 'Plain link', href: '#' }, replaceStyles: true, styles: {} });
  const text = createNode('text', { name: 'Bare text', props: { text: 'Bare text with <a href="#x">an inline link</a> inside' }, replaceStyles: true, styles: {} });
  const h = createNode('text', { name: 'Bare heading', tag: 'h2', props: { text: 'Bare heading' }, replaceStyles: true, styles: {} });
  // cascade order: a breakpoint's `padding` must beat the base `padding-top`, exactly like the exported CSS
  const pad = createNode('box', { name: 'Padding cascade', replaceStyles: true, styles: { padding: '10px', 'padding-top': '0px', 'padding-left': '40px', 'background-color': '#eee', 'border-radius': '8px', 'border-top-left-radius': '0px' } });
  pad.styles.tablet = { padding: '30px' };
  pad.styles.mobile = { 'border-radius': '20px', 'padding-left': '4px' };
  const padChild = createNode('text', { name: 'Padding child', props: { text: 'child' }, replaceStyles: true, styles: { width: '50px' } });
  pad.children.push(padChild.id);
  padChild.parent = pad.id;
  K.addSubtree({ rootId: pad.id, nodes: { [pad.id]: pad, [padChild.id]: padChild } }, root, undefined, { select: false });
  for (const node of [link, text, h]) K.addSubtree({ rootId: node.id, nodes: { [node.id]: node } }, root, undefined, { select: false });
  return n;
});
console.log(`inserted ${count} catalog items`);
await page.waitForTimeout(1200);
if (!(await page.$('.kc-root'))) {
  console.log('canvas gone; errors:', errors.join('\n'));
  await page.screenshot({ path: out + '/gone.png' });
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 600)));
  process.exit(2);
}

async function canvasBoxes(bp) {
  await page.evaluate(({ id, width }) => window.__kinemaExport.useUI.getState().set({ breakpoint: id, canvasWidth: width, selection: [], canvasHeight: null }), bp);
  await page.waitForTimeout(900);
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const root = document.querySelector('.kc-root');
    const zoom = window.__kinemaExport.useUI.getState().viewport.zoom;
    const rr = root.getBoundingClientRect();
    const doc = window.__kinemaExport.useDoc.getState().doc;
    const res = {};
    for (const el of root.querySelectorAll('[data-kid]')) {
      const r = el.getBoundingClientRect();
      const id = el.getAttribute('data-kid');
      res[id] = { x: (r.left - rr.left) / zoom, y: (r.top - rr.top) / zoom, w: r.width / zoom, h: r.height / zoom, name: doc.nodes[id]?.name, type: doc.nodes[id]?.type };
    }
    return res;
  });
}
const html = await page.evaluate(() => {
  const K = window.__kinemaExport;
  const doc = K.useDoc.getState().doc;
  return K.compileSiteText(doc, K.previewOptions({ annotate: true, pageIds: [doc.pages[0].id] })).files[0].data;
});

let failed = 0;
for (const bp of [
  { id: 'base', width: 1440 },
  { id: 'tablet', width: 768 },
  { id: 'mobile', width: 390 },
]) {
  const cb = await canvasBoxes(bp);
  const p = await browser.newPage({ viewport: { width: bp.width, height: 900 } });
  await p.route('**/__export.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html.replace('</head>', '<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head>') }));
  await p.goto(new URL('/__export.html', url).href, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const eb = await p.evaluate(() => {
    const res = {};
    for (const el of document.querySelectorAll('[data-kid]')) {
      const r = el.getBoundingClientRect();
      res[el.getAttribute('data-kid')] = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    }
    return res;
  });
  await p.close();
  const bad = [];
  let n = 0;
  for (const [id, c] of Object.entries(cb)) {
    const e = eb[id];
    if (!e) {
      bad.push({ id, name: c.name, issue: 'missing in export' });
      continue;
    }
    n++;
    if (!c.w && !c.h && !e.w && !e.h) continue;
    const d = Math.max(Math.abs(c.x - e.x), Math.abs(c.y - e.y), Math.abs(c.w - e.w), Math.abs(c.h - e.h));
    if (d > TOL) bad.push({ id, name: c.name, type: c.type, d: +d.toFixed(1), canvas: [c.x, c.y, c.w, c.h].map((v) => +v.toFixed(1)), export: [e.x, e.y, e.w, e.h].map((v) => +v.toFixed(1)) });
  }
  if (bad.length) failed++;
  console.log(`${bad.length ? 'FAIL' : 'ok  '} @${bp.width}: ${n} compared, ${bad.length} outside ±${TOL}px`);
  // later items shift when an earlier one differs: show the first few only
  for (const b of bad.slice(0, 10)) console.log('    ', JSON.stringify(b));
}
// default link decoration must be the same on canvas and in the export
{
  const canvasDeco = await page.evaluate(() => {
    const id = Object.values(window.__kinemaExport.useDoc.getState().doc.nodes).find((n) => n.name === 'Plain link').id;
    return getComputedStyle(document.querySelector(`.kc-root [data-kid="${id}"]`)).textDecorationLine;
  });
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.route('**/__export.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await p.goto(new URL('/__export.html', url).href, { waitUntil: 'load' });
  const exportDeco = await p.evaluate(() => getComputedStyle(document.querySelector('a[data-kid]:not([class*="btn"])') ?? document.body).textDecorationLine);
  const plain = await p.evaluate(() => {
    const el = [...document.querySelectorAll('a[data-kid]')].find((a) => a.textContent.trim() === 'Plain link');
    return el ? getComputedStyle(el).textDecorationLine : 'not found';
  });
  void exportDeco;
  const same = plain === canvasDeco;
  if (!same) failed++;
  console.log(`${same ? 'ok  ' : 'FAIL'} plain link decoration: canvas=${canvasDeco} export=${plain}`);
  await p.close();
}
console.log(errors.length ? '\nERRORS:\n' + [...new Set(errors)].join('\n') : '\nno page errors');
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
