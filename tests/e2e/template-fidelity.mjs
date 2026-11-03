// Export fidelity across every built-in template.
//
// With the dev server running (`npx vite --port 5194 --strictPort`), creates a project from each
// template, then for each page and width (1440 / 768 / 390) compares every canvas element box
// against the same element in the exported page, and checks that exported animations run.
//
// Usage: KINEMA_URL=http://localhost:5194/ node tests/e2e/template-fidelity.mjs [templateId ...]
// Env: TOLERANCE (px, default 2), OUT (screenshots dir), WIDTHS (comma list)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.env.KINEMA_URL ?? 'http://localhost:5194/';
const out = process.env.OUT ?? new URL('../../test-results/e2e/', import.meta.url).pathname;
const TOL = Number(process.env.TOLERANCE ?? 2);
mkdirSync(out, { recursive: true });

const BPS = [
  { id: 'base', width: 1440 },
  { id: 'tablet', width: 768 },
  { id: 'mobile', width: 390 },
].filter((b) => !process.env.WIDTHS || process.env.WIDTHS.split(',').includes(String(b.width)));

const browser = await chromium.launch();
const errors = [];
let failures = 0;
const only = process.argv.slice(2);

async function openTemplate(label) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(`[${label}] console: ${m.text()}`));
  await page.goto(url);
  await page.getByRole('button', { name: /new project/i }).first().click();
  await page.getByRole('radio', { name: label }).click();
  await page.getByRole('button', { name: /create project/i }).click();
  await page.waitForSelector('.kc-root [data-kroot]', { timeout: 20000 });
  await page.waitForFunction(() => !!window.__kinemaExport);
  await page.waitForTimeout(800);
  return page;
}

async function canvasBoxes(page, bp) {
  await page.evaluate(({ id, width }) => window.__kinemaExport.useUI.getState().set({ breakpoint: id, canvasWidth: width, selection: [], canvasHeight: null }), bp);
  await page.waitForTimeout(500);
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

async function exportHtml(page, pageId) {
  return page.evaluate((pid) => {
    const K = window.__kinemaExport;
    const doc = K.useDoc.getState().doc;
    const r = K.compileSiteText(doc, K.previewOptions({ annotate: true, pageIds: [pid] }));
    return r.files[0].data;
  }, pageId);
}

/** Serve the exported page from the dev server's origin so its @font-face urls load (a null-origin page is blocked by CORS). */
async function loadHtml(p, html) {
  await p.route('**/__export.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await p.goto(new URL('/__export.html', url).href, { waitUntil: 'load' });
}

async function exportBoxes(html, width, shot) {
  const p = await browser.newPage({ viewport: { width, height: 900 } });
  p.on('pageerror', (e) => errors.push('export pageerror: ' + e.message));
  const still = html.replace('</head>', '<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head>');
  await loadHtml(p, still);
  await p.evaluate(() => document.fonts.ready);
  const boxes = await p.evaluate(() => {
    const res = {};
    for (const el of document.querySelectorAll('[data-kid]')) {
      const r = el.getBoundingClientRect();
      res[el.getAttribute('data-kid')] = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    }
    return res;
  });
  if (shot) await p.screenshot({ path: shot, fullPage: true });
  await p.close();
  return boxes;
}

function compare(canvas, exported) {
  const bad = [];
  let n = 0;
  for (const [id, c] of Object.entries(canvas)) {
    const e = exported[id];
    if (!e) {
      bad.push({ id, name: c.name, issue: 'missing in export' });
      continue;
    }
    n++;
    if (c.w === 0 && c.h === 0 && e.w === 0 && e.h === 0) continue;
    const d = Math.max(Math.abs(c.x - e.x), Math.abs(c.y - e.y), Math.abs(c.w - e.w), Math.abs(c.h - e.h));
    if (d > TOL) bad.push({ id, name: c.name, type: c.type, d: +d.toFixed(1), canvas: [c.x, c.y, c.w, c.h].map((v) => +v.toFixed(1)), export: [e.x, e.y, e.w, e.h].map((v) => +v.toFixed(1)) });
  }
  for (const id of Object.keys(exported)) if (!canvas[id]) bad.push({ id, issue: 'missing on canvas' });
  return { compared: n, bad };
}

async function animationsRun(html) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', (e) => errors.push('export anim pageerror: ' + e.message));
  await loadHtml(p, html);
  await p.waitForTimeout(400);
  const res = await p.evaluate(async () => {
    const total = document.getAnimations().length;
    const running = document.getAnimations().filter((a) => a.playState === 'running').length;
    const inview = document.querySelectorAll('[data-k-inview]').length;
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 700));
    return { total, running, inview, shown: document.querySelectorAll('[data-k-inview].is-inview').length };
  });
  await p.close();
  return res;
}

const templateLabels = await (async () => {
  const p = await browser.newPage();
  await p.goto(url);
  await p.getByRole('button', { name: /new project/i }).first().click();
  const names = await p.locator('.k-newproj__name').allInnerTexts();
  await p.close();
  return names;
})();

for (const label of templateLabels) {
  if (only.length && !only.some((o) => label.toLowerCase().includes(o.toLowerCase()))) continue;
  const page = await openTemplate(label);
  const meta = await page.evaluate(() => {
    const K = window.__kinemaExport;
    const d = K.useDoc.getState().doc;
    return { nodes: Object.keys(d.nodes).length, pages: d.pages.map((p) => ({ id: p.id, name: p.name })) };
  });
  console.log(`\n=== ${label}: ${meta.nodes} nodes, ${meta.pages.length} page(s)`);
  for (const pg of meta.pages) {
    await page.evaluate((id) => window.__kinemaExport.useUI.getState().set({ activePageId: id, selection: [] }), pg.id);
    await page.waitForTimeout(500);
    const html = await exportHtml(page, pg.id);
    for (const bp of BPS) {
      const cb = await canvasBoxes(page, bp);
      const slug = `${label.replace(/\W+/g, '-')}-${pg.name.replace(/\W+/g, '-')}-${bp.width}`;
      await page.screenshot({ path: `${out}/canvas-${slug}.png` });
      const eb = await exportBoxes(html, bp.width, `${out}/export-${slug}.png`);
      const r = compare(cb, eb);
      const flag = r.bad.length ? 'FAIL' : 'ok  ';
      if (r.bad.length) failures++;
      console.log(`  ${flag} ${pg.name} @${bp.width}: ${r.compared} compared, ${r.bad.length} outside ±${TOL}px`);
      for (const b of r.bad.slice(0, 8)) console.log('       ', JSON.stringify(b));
    }
    const a = await animationsRun(html);
    console.log(`  anim ${pg.name}: ${JSON.stringify(a)}`);
  }
  await page.close();
}

console.log(errors.length ? '\nERRORS:\n' + [...new Set(errors)].join('\n') : '\nno page errors');
console.log(failures ? `\n${failures} page/width combinations differ` : '\nall templates match');
await browser.close();
process.exit(failures || errors.length ? 1 : 0);
