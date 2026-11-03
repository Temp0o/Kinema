// Export fidelity check.
//
// With the dev server running (`npx vite --port 5178 --strictPort`), this:
//  1. creates a project and builds a non-trivial responsive, animated design
//     (imported HTML + a component with two overridden instances),
//  2. compares every canvas element box (`.kc-root [data-kid]`, divided by zoom)
//     with the same element in the exported page rendered at the same width,
//  3. checks that exported animations actually run (load, in-view stagger,
//     hover, loop, svg path draw),
//  4. screenshots the export dialog, code panel and live preview.
//
// Usage: node tests/e2e/export-fidelity.mjs   (env: KINEMA_URL, OUT, TOLERANCE)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.env.KINEMA_URL ?? 'http://localhost:5178/';
const out = process.env.OUT ?? new URL('../../test-results/e2e/', import.meta.url).pathname;
const TOL = Number(process.env.TOLERANCE ?? 1);
mkdirSync(out, { recursive: true });

const MARKUP = `
<style>
.page { display: flex; flex-direction: column; font-size: 16px; background: #fff; }
.nav { display: flex; justify-content: space-between; align-items: center; padding: 20px 48px; background: #0f1020; color: #fff; }
.logo { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.links { display: flex; gap: 28px; font-size: 15px; }
.hero { position: relative; padding: 96px 48px; display: grid; grid-template-columns: 1.2fr 1fr; gap: 48px; align-items: center; background: linear-gradient(135deg, #f6f4ff, #e9fbff); }
.hero h1 { font-size: 64px; line-height: 1.05; color: #0f1020; }
.lead { font-size: 19px; line-height: 1.6; color: #5b5f77; margin-top: 20px; max-width: 520px; }
.ctas { display: flex; gap: 12px; margin-top: 32px; }
.btn { display: inline-flex; padding: 14px 26px; border-radius: 12px; background: #7c5cff; color: #fff; font-size: 16px; font-weight: 600; text-decoration: none; }
.ghost { background: transparent; color: #0f1020; border: 1px solid #d4d6e4; }
.art { height: 360px; border-radius: 24px; background: #7c5cff; position: relative; display: flex; align-items: center; justify-content: center; }
.badge { position: absolute; right: 24px; top: 24px; padding: 6px 12px; border-radius: 99px; background: #fff; color: #0f1020; font-size: 13px; font-weight: 700; }
.mark { width: 160px; height: 160px; color: #fff; }
.features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; padding: 80px 48px; }
.card { padding: 28px; border-radius: 18px; background: #fff; border: 1px solid #ececf2; }
.card h3 { font-size: 20px; margin-bottom: 8px; }
.card p { font-size: 15px; line-height: 1.55; color: #5b5f77; }
.row { padding: 0 48px 40px; font-size: 16px; line-height: 1.5; }
.pill { display: inline-block; padding: 4px 10px; margin-right: 8px; border-radius: 99px; background: #eef0ff; font-size: 13px; }
.team { display: flex; gap: 24px; padding: 0 48px 56px; flex-wrap: wrap; }
footer { padding: 32px 48px; font-size: 14px; color: #5b5f77; border-top: 1px solid #ececf2; }
@media (max-width: 1024px) {
  .hero { grid-template-columns: 1fr; padding: 64px 32px; }
  .hero h1 { font-size: 48px; }
  .features { grid-template-columns: 1fr 1fr; padding: 48px 32px; }
}
@media (max-width: 640px) {
  .nav { padding: 16px 20px; }
  .links { display: none; }
  .hero h1 { font-size: 36px; }
  .features { grid-template-columns: 1fr; padding: 32px 20px; }
  .ctas { flex-direction: column; }
}
</style>
<div class="page">
  <nav class="nav"><div class="logo">Kinema</div><div class="links"><a href="#">Product</a><a href="#">Pricing</a><a href="#">Docs</a></div></nav>
  <section class="hero">
    <div class="copy">
      <h1 class="title">Design that <em>moves</em>, exported as clean code.</h1>
      <p class="lead">Build animated, responsive sites visually — then ship standalone HTML, CSS and a tiny runtime.</p>
      <div class="ctas"><a class="btn" href="#"><div class="label">Get started</div></a><a class="btn ghost" href="#"><div class="label">Watch the demo</div></a></div>
    </div>
    <div class="art"><span class="badge">New</span>
      <svg class="mark" viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="6"><path d="M10 50 L50 10 L90 50"/><path d="M10 70 L50 30 L90 70"/><circle cx="50" cy="80" r="10"/></svg>
    </div>
  </section>
  <section class="features">
    <div class="card"><h3>Timeline</h3><p>Keyframes, easing and stagger with real-time playback on the canvas.</p></div>
    <div class="card"><h3>Responsive</h3><p>Desktop-first breakpoints that cascade exactly like the exported CSS.</p></div>
    <div class="card"><h3>Offline AI</h3><p>Generate sections with a local model, then refine every pixel by hand.</p></div>
  </section>
  <div class="row"><span class="pill">Fast</span><span class="pill">Accessible</span><span class="pill">Offline</span> and no lock-in.</div>
  <div class="team"></div>
  <footer>© 2026 Kinema · Made with care</footer>
</div>`;

const CARD = `<style>
.person { width: 260px; padding: 20px; border-radius: 16px; background: #0f1020; color: #fff; display: flex; flex-direction: column; gap: 6px; }
.name { font-size: 18px; font-weight: 700; }
.role { font-size: 14px; color: #a5a8c4; }
</style><div class="person"><div class="name">Ada Lovelace</div><div class="role">Engineer</div></div>`;

const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('pageerror', (e) => errors.push('editor pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push('editor console: ' + m.text()));
await page.goto(url);
await page.getByRole('button', { name: /new project/i }).first().click();
await page.getByRole('button', { name: /create project/i }).click({ timeout: 4000 }).catch(() => {});
await page.waitForSelector('.kc-root [data-kroot]');
await page.waitForFunction(() => !!window.__kinemaExport);

// ── build the design ──
await page.evaluate(
  ({ MARKUP, CARD }) => {
    const K = window.__kinemaExport;
    const st = K.useDoc.getState();
    const doc = st.doc;
    const rootId = K.useUI.getState().activePageId ? doc.pages.find((p) => p.id === K.useUI.getState().activePageId).rootId : doc.pages[0].rootId;
    const sub = K.importHtmlAsSubtree(MARKUP, { breakpoints: doc.breakpoints });
    K.addSubtree(sub, rootId, undefined, { select: false });
    // root frame: let content define the height
    st.mutate('fit', (d) => {
      d.nodes[rootId].styles.base['min-height'] = '0px';
    });
    const card = K.importHtmlAsSubtree(CARD, { breakpoints: doc.breakpoints });
    const byName = (n) => Object.values(K.useDoc.getState().doc.nodes).find((x) => x.name === n);
    const anim = (p) => ({ id: 'a_' + Math.random().toString(36).slice(2), name: 'Fade up', trigger: 'load', duration: 700, delay: 0, iterations: 1, direction: 'normal', fill: 'both', easing: 'cubic-bezier(0.16, 1, 0.3, 1)', keyframes: [{ id: 'k0', offset: 0, values: { opacity: 0, y: 30 } }, { id: 'k1', offset: 1, values: { opacity: 1, y: 0 } }], ...p });
    K.useDoc.getState().mutate('build', (d) => {
      // component + two instances with overrides
      for (const n of Object.values(card.nodes)) d.nodes[n.id] = n;
      d.nodes[card.rootId].parent = null;
      d.components.c_person = { id: 'c_person', name: 'Person', rootId: card.rootId, createdAt: 0 };
      const nameNode = Object.values(card.nodes).find((n) => n.name === 'Name');
      const roleNode = Object.values(card.nodes).find((n) => n.name === 'Role');
      const team = Object.values(d.nodes).find((n) => n.name === 'Team');
      const mk = (id, name, ov, styles) => {
        d.nodes[id] = { id, type: 'instance', name, parent: team.id, children: [], props: { componentId: 'c_person' }, styles: { base: styles }, overrides: ov };
        team.children.push(id);
      };
      mk('i_grace', 'Grace card', { [nameNode.id]: { text: 'Grace Hopper' }, [roleNode.id]: { text: 'Admiral', styles: { color: '#ffd479' } } }, { width: '300px' });
      mk('i_alan', 'Alan card', { [nameNode.id]: { text: 'Alan Turing' } }, {});
      d.nodes[card.rootId].animations = [anim({ name: 'Rise', trigger: 'inView' })];
      // page animations
      const title = Object.values(d.nodes).find((n) => n.name === 'Title');
      title.animations = [anim({ name: 'Title in', delay: 100 })];
      const features = Object.values(d.nodes).find((n) => n.name === 'Features');
      features.animations = [anim({ name: 'Cards in', trigger: 'inView', stagger: 120 })];
      const btn = Object.values(d.nodes).find((n) => n.type === 'link');
      btn.animations = [anim({ name: 'Pop', trigger: 'hover', duration: 400, fill: 'none', keyframes: [{ id: 'a', offset: 0, values: { scale: 1 } }, { id: 'b', offset: 0.5, values: { scale: 1.08 } }, { id: 'c', offset: 1, values: { scale: 1 } }], easing: 'ease-in-out' })];
      const badge = Object.values(d.nodes).find((n) => n.name === 'Badge');
      badge.animations = [anim({ name: 'Pulse', trigger: 'loop', duration: 1600, direction: 'alternate', fill: 'none', easing: 'ease-in-out', keyframes: [{ id: 'a', offset: 0, values: { scale: 1 } }, { id: 'b', offset: 1, values: { scale: 1.12 } }] })];
      const mark = Object.values(d.nodes).find((n) => n.type === 'svg');
      mark.animations = [anim({ name: 'Draw', targetSelector: 'path, circle', stagger: 200, duration: 1200, keyframes: [{ id: 'a', offset: 0, values: { 'stroke-dasharray': '200', 'stroke-dashoffset': 200 } }, { id: 'b', offset: 1, values: { 'stroke-dasharray': '200', 'stroke-dashoffset': 0 } }] })];
    });
    void byName;
  },
  { MARKUP, CARD },
);
await page.waitForTimeout(600);

const BPS = [
  { id: 'base', width: 1440 },
  { id: 'tablet', width: 768 },
  { id: 'mobile', width: 390 },
];

async function canvasBoxes(bp) {
  await page.evaluate(({ id, width }) => window.__kinemaExport.useUI.getState().set({ breakpoint: id, canvasWidth: width, selection: [] }), bp);
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const root = document.querySelector('.kc-root');
    const zoom = window.__kinemaExport.useUI.getState().viewport.zoom;
    const rr = root.getBoundingClientRect();
    const doc = window.__kinemaExport.useDoc.getState().doc;
    const out = {};
    for (const el of root.querySelectorAll('[data-kid]')) {
      const r = el.getBoundingClientRect();
      const id = el.getAttribute('data-kid');
      out[id] = { x: (r.left - rr.left) / zoom, y: (r.top - rr.top) / zoom, w: r.width / zoom, h: r.height / zoom, name: doc.nodes[id]?.name };
    }
    return out;
  });
}

async function exportHtml() {
  return page.evaluate(() => {
    const K = window.__kinemaExport;
    const doc = K.useDoc.getState().doc;
    const r = K.compileSiteText(doc, K.previewOptions({ annotate: true, pageIds: [doc.pages[0].id] }));
    return r.files[0].data;
  });
}

async function exportBoxes(html, width) {
  const p = await browser.newPage({ viewport: { width, height: 900 } });
  p.on('pageerror', (e) => errors.push('export pageerror: ' + e.message));
  const still = html.replace('</head>', '<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head>');
  await p.setContent(still, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const clientWidth = await p.evaluate(() => document.documentElement.clientWidth);
  const boxes = await p.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('[data-kid]')) {
      const r = el.getBoundingClientRect();
      out[el.getAttribute('data-kid')] = { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height };
    }
    return out;
  });
  await p.screenshot({ path: `${out}/export-${width}.png`, fullPage: true });
  await p.close();
  return { boxes, clientWidth };
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
    if (c.w === 0 && c.h === 0 && e.w === 0 && e.h === 0) continue; // display: none in both
    const d = Math.max(Math.abs(c.x - e.x), Math.abs(c.y - e.y), Math.abs(c.w - e.w), Math.abs(c.h - e.h));
    if (d > TOL) bad.push({ id, name: c.name, d: +d.toFixed(2), canvas: [c.x, c.y, c.w, c.h].map((v) => +v.toFixed(1)), export: [e.x, e.y, e.w, e.h].map((v) => +v.toFixed(1)) });
  }
  for (const id of Object.keys(exported)) if (!canvas[id]) bad.push({ id, issue: 'missing on canvas' });
  return { compared: n, bad };
}

const results = [];
// The canvas inherits `font-feature-settings: 'cv11','ss01'` from the editor UI
// body; compare raw first, then with the canvas normalized to browser defaults.
const html = await exportHtml();
{
  const cb = await canvasBoxes(BPS[0]);
  const { boxes } = await exportBoxes(html, 1440);
  const r = compare(cb, boxes);
  results.push({ pass: 'raw canvas @1440', ...r });
}
await page.addStyleTag({ content: '.kc-root { font-feature-settings: normal; }' });
for (const bp of BPS) {
  const cb = await canvasBoxes(bp);
  await page.screenshot({ path: `${out}/canvas-${bp.width}.png` });
  const { boxes, clientWidth } = await exportBoxes(html, bp.width);
  const r = compare(cb, boxes);
  results.push({ pass: `normalized @${bp.width}`, clientWidth, ...r });
}

for (const r of results) {
  console.log(`\n[${r.pass}] compared ${r.compared} elements, ${r.bad.length} outside ±${TOL}px${r.clientWidth ? ` (export clientWidth ${r.clientWidth})` : ''}`);
  for (const b of r.bad.slice(0, 12)) console.log('   ', JSON.stringify(b));
}

// ── animations run in the export ──
{
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', (e) => errors.push('export pageerror: ' + e.message));
  await p.setContent(html, { waitUntil: 'load' });
  const q = (sel) => p.locator(sel).first();
  const title = await p.evaluate(() => {
    const el = [...document.querySelectorAll('h1')][0];
    return { opacity: getComputedStyle(el).opacity, anims: el.getAnimations().length };
  });
  await p.waitForTimeout(1500);
  const titleAfter = await p.evaluate(() => getComputedStyle(document.querySelector('h1')).opacity);
  const loop = await p.evaluate(() => {
    const a = document.querySelector('[class*="badge-"]').getAnimations()[0];
    return a ? { state: a.playState, iterations: a.effect.getTiming().iterations } : null;
  });
  const paths = await p.evaluate(() => [...document.querySelectorAll('svg path, svg circle')].map((x) => x.style.getPropertyValue('--k-i')));
  const before = await p.evaluate(() => document.querySelectorAll('[data-k-inview].is-inview').length);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(900);
  const after = await p.evaluate(() => ({ total: document.querySelectorAll('[data-k-inview]').length, shown: document.querySelectorAll('[data-k-inview].is-inview').length }));
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(200);
  await q('[data-k-hover]').hover();
  await p.waitForTimeout(120);
  const hover = await p.evaluate(() => {
    const el = document.querySelector('[data-k-hover]');
    return { cls: el.classList.contains('is-hovered'), running: el.getAnimations().some((a) => a.playState === 'running'), transform: getComputedStyle(el).transform };
  });
  await p.screenshot({ path: `${out}/export-anim-hover.png` });
  console.log('\n[animations]', JSON.stringify({ title, titleAfter, loop, paths, inViewBefore: before, inViewAfter: after, hover }));
  await p.close();
}

// ── UI screenshots ──
await page.evaluate(() => window.__kinemaExport.useUI.getState().set({ breakpoint: 'base', canvasWidth: 1440 }));
await page.keyboard.press('Control+e');
await page.waitForSelector('.k-export .k-tree__row');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/dialog-files.png` });
await page.locator('.k-tree__row', { hasText: 'styles.css' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/dialog-code.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

await page.evaluate(() => {
  const K = window.__kinemaExport;
  const doc = K.useDoc.getState().doc;
  const t = Object.values(doc.nodes).find((n) => n.name === 'Title');
  K.useUI.getState().set({ bottomPanel: 'code', selection: [t.id] });
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/code-panel.png` });
await page.locator('.k-codepanel button', { hasText: 'Page' }).click();
await page.locator('.k-codepanel button', { hasText: 'CSS' }).first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/code-panel-page-css.png` });

await page.keyboard.press('Control+Enter');
await page.waitForSelector('.k-preview__frame[data-active="true"]');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/preview-desktop.png` });
await page.locator('.k-preview [aria-label^="Mobile"]').click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/preview-mobile.png` });
// live update while open
await page.evaluate(() => {
  const K = window.__kinemaExport;
  K.useDoc.getState().mutate('t', (d) => {
    const t = Object.values(d.nodes).find((n) => n.name === 'Title');
    t.props.text = 'Live <em>updated</em> title';
  });
});
await page.waitForTimeout(1200);
const live = await page.evaluate(() => document.querySelector('.k-preview__frame[data-active="true"]').contentDocument.querySelector('h1')?.textContent);
console.log('\n[preview] live update h1:', live);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const closed = await page.evaluate(() => !document.querySelector('.k-preview'));
console.log('[preview] closed with Escape:', closed);

console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\nno page errors');
await browser.close();
const failed = results.filter((r) => r.pass.startsWith('normalized') && r.bad.length);
process.exit(failed.length ? 1 : 0);
