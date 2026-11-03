// E2E for the Design (properties) panel. Run with the dev server on :5175:
//   npx vite --port 5175 --strictPort &  node tests/e2e/properties.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const url = process.env.KINEMA_URL ?? 'http://localhost:5175/';
const out = process.env.OUT ?? new URL('../../test-results/e2e/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1480, height: 1500 } });
const errors = [];
const failures = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!cond) failures.push(name);
};
const panel = () => page.locator('.k-panel--right');
const shot = async (name) => {
  await page.waitForTimeout(150);
  await panel().screenshot({ path: `${out}/${name}.png` });
};
const dev = (fn, arg) => page.evaluate(fn, arg);
const node = (id) => dev((id) => window.__kinemaDev.useDoc.getState().doc.nodes[id], id);
const select = async (ids) => {
  await dev((ids) => window.__kinemaDev.useUI.getState().select(ids), ids);
  await page.waitForTimeout(120);
};
const expand = async (title) => {
  const sec = page.locator('.k-section', { has: page.locator('.k-section__title', { hasText: new RegExp(`^${title}`) }) }).first();
  if ((await sec.getAttribute('data-collapsed')) === 'true') await sec.locator('.k-section__title').click();
  return sec;
};
const row = (sec, label) => sec.locator('.k-row', { has: page.locator('.k-row__label', { hasText: label }) }).first();
const typeInto = async (loc, text) => {
  await loc.click();
  await loc.fill(text);
  await loc.press('Enter');
  await page.waitForTimeout(80);
};

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /new project/i }).first().click();
await page.getByRole('button', { name: /create project/i }).click({ timeout: 4000 }).catch(() => {});
await page.waitForSelector('.kc-root');
await page.waitForTimeout(500);

// ── Build a small document ─────────────────────────────────────────────────
const ids = await dev(() => {
  const { useDoc, useUI, actions, createNode } = window.__kinemaDev;
  const doc = useDoc.getState().doc;
  const root = doc.pages[0].rootId;
  const card = createNode('box', { name: 'Card', styles: { position: 'absolute', left: '80px', top: '80px', width: '360px', height: '220px', background: 'linear-gradient(135deg, #7c5cff 0%, #22d3ee 100%)', padding: '10px 20px', 'box-shadow': '0 8px 24px rgba(15, 16, 32, 0.18)' } });
  const card2 = createNode('box', { name: 'Card 2', styles: { position: 'absolute', left: '480px', top: '80px', width: '200px', height: '220px' } });
  const title = createNode('text', { name: 'Title', tag: 'h2', props: { text: 'Hello <b>world</b>' } });
  const img = createNode('image', { name: 'Photo', styles: { position: 'absolute', left: '80px', top: '360px' } });
  const svg = createNode('svg', { name: 'Icon', props: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#ff5c6f"/><path d="M7 12h10" stroke="#0f1020" stroke-width="2"/></svg>' }, styles: { position: 'absolute', left: '480px', top: '360px' } });
  const btn = createNode('button', { name: 'CTA', styles: { position: 'absolute', left: '700px', top: '360px' } });
  for (const n of [card, card2, img, svg, btn]) actions.addNode(n, root, undefined, { select: false });
  actions.addNode(title, card.id, undefined, { select: false });
  useUI.getState().select([card.id]);
  return { root, card: card.id, card2: card2.id, title: title.id, img: img.id, svg: svg.id, btn: btn.id };
});
await page.waitForTimeout(300);
await shot('01-box-default');
check('design panel renders for selection', await page.locator('[data-testid="design-panel"]').isVisible());
check('gradient shorthand parsed as linear', await page.locator('[data-testid="gradient-bar"]').isVisible());

// ── Layout: width typing + unit menu ───────────────────────────────────────
const layout = await expand('Layout');
const wInput = layout.locator('.k-dim').first().locator('input');
await typeInto(wInput, '400');
check('width typed → 400px', (await node(ids.card)).styles.base.width === '400px');
await layout.locator('[data-testid="width-mode"]').click();
await page.getByRole('menuitem', { name: /Percent of parent/ }).click();
await page.waitForTimeout(100);
const wPct = (await node(ids.card)).styles.base.width;
check('width converted to %', /%$/.test(wPct), wPct);
await layout.locator('[data-testid="width-mode"]').click();
await page.getByRole('menuitem', { name: /Fixed/ }).click();
await page.waitForTimeout(100);
check('width back to px (measured)', /^\d+px$/.test((await node(ids.card)).styles.base.width), (await node(ids.card)).styles.base.width);

// position Free → Flow → Free
await row(layout, 'Position').getByRole('radio', { name: /Laid out/ }).click();
await page.waitForTimeout(100);
check('flow removes absolute', (await node(ids.card)).styles.base.position === undefined);
await row(layout, 'Position').getByRole('radio', { name: /Absolutely/ }).click();
await page.waitForTimeout(100);
const posNode = await node(ids.card);
check('free sets absolute with measured left/top', posNode.styles.base.position === 'absolute' && /px$/.test(posNode.styles.base.left), JSON.stringify([posNode.styles.base.left, posNode.styles.base.top]));

// opacity scrub via number + undo is one step
const histBefore = await dev(() => window.__kinemaDev.useDoc.getState().past.length);
const opLabel = row(layout, 'Opacity').locator('.k-slider__thumb');
const box = await opLabel.boundingBox();
await page.mouse.move(box.x + 6, box.y + 6);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 6 - i * 8, box.y + 6);
await page.mouse.up();
await page.waitForTimeout(100);
const histAfter = await dev(() => window.__kinemaDev.useDoc.getState().past.length);
const op = (await node(ids.card)).styles.base.opacity;
check('opacity slider drag writes opacity', op != null && parseFloat(op) < 1, op);
check('slider drag = one undo step', histAfter - histBefore === 1, `${histAfter - histBefore} steps`);

// ── Spacing: box model shorthand expand ────────────────────────────────────
const spacing = await expand('Spacing');
await spacing.getByRole('spinbutton', { name: 'padding top' }).click();
const padEdit = spacing.locator('input.k-scrub--edit');
await padEdit.fill('16');
await padEdit.press('Enter');
await page.waitForTimeout(100);
let s = (await node(ids.card)).styles.base;
check('padding shorthand expanded to longhands', s.padding === undefined && s['padding-top'] === '16px' && s['padding-right'] === '20px' && s['padding-bottom'] === '10px', JSON.stringify(s));
// scrub left padding
const pl = spacing.getByRole('spinbutton', { name: 'padding left' });
const plb = await pl.boundingBox();
await page.mouse.move(plb.x + plb.width / 2, plb.y + plb.height / 2);
await page.mouse.down();
for (let i = 1; i <= 6; i++) await page.mouse.move(plb.x + plb.width / 2 + i * 4, plb.y + plb.height / 2);
await page.mouse.up();
await page.waitForTimeout(100);
s = (await node(ids.card)).styles.base;
check('padding scrub changes value', s['padding-left'] !== '20px', s['padding-left']);
await shot('02-box-layout-spacing');

// ── Fill: gradient editor + color picker ───────────────────────────────────
const fill = await expand('Fill');
await fill.scrollIntoViewIfNeeded();
const bar = fill.locator('[data-testid="gradient-bar"]');
const bb = await bar.boundingBox();
await page.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height / 2);
await page.waitForTimeout(100);
let bgi = (await node(ids.card)).styles.base['background-image'];
check('click on gradient bar adds a stop', (bgi.match(/%/g) || []).length === 3, bgi);
check('gradient written as longhand, shorthand removed', (await node(ids.card)).styles.base.background === undefined);
// drag angle dial
const dial = fill.locator('[data-testid="gradient-dial"]');
const db = await dial.boundingBox();
await page.mouse.move(db.x + db.width / 2, db.y + 2);
await page.mouse.down();
await page.mouse.move(db.x + db.width, db.y + db.height / 2);
await page.mouse.up();
bgi = (await node(ids.card)).styles.base['background-image'];
check('angle dial rotates gradient', /linear-gradient\(90deg/.test(bgi), bgi);
await shot('03-fill-gradient');
// switch to solid & open color picker
await fill.getByRole('radio', { name: 'Solid color' }).click();
await page.waitForTimeout(100);
s = (await node(ids.card)).styles.base;
check('solid fill sets background-color, clears image', !!s['background-color'] && !s['background-image'], JSON.stringify([s['background-color'], s['background-image']]));
await fill.getByRole('button', { name: /Fill color: pick color/ }).click();
await page.waitForSelector('.k-cp');
const sv = page.locator('[data-testid="cp-sv"]');
const svb = await sv.boundingBox();
await page.mouse.move(svb.x + svb.width * 0.8, svb.y + svb.height * 0.2);
await page.mouse.down();
await page.mouse.move(svb.x + svb.width * 0.9, svb.y + svb.height * 0.1);
await page.mouse.up();
const c1 = (await node(ids.card)).styles.base['background-color'];
check('SV drag changes color', /^#[0-9a-f]{6}/.test(c1), c1);
await page.locator('.k-cp').getByRole('radio', { name: 'RGB' }).click();
await page.screenshot({ path: `${out}/04-color-picker.png`, clip: await page.locator('.k-popover').boundingBox() });
// choose a token swatch
await page.locator('.k-cp__sw[data-token="true"]').first().click();
await page.waitForTimeout(100);
const c2 = (await node(ids.card)).styles.base['background-color'];
check('token swatch writes var(--k-…)', /^var\(--k-primary\)$/.test(c2), c2);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('color field shows token name', (await fill.locator('.k-colorfield input').first().inputValue()) === 'primary');
// type a color
await typeInto(fill.locator('.k-colorfield input').first(), 'rgba(255, 0, 0, 0.5)');
check('typed color applied', (await node(ids.card)).styles.base['background-color'] === 'rgba(255, 0, 0, 0.5)');

// ── Border & effects ───────────────────────────────────────────────────────
const border = await expand('Border');
await border.getByRole('button', { name: 'Add border' }).click();
await page.waitForTimeout(100);
check('add border', /^1px solid/.test((await node(ids.card)).styles.base.border ?? ''));
const effects = await expand('Effects');
await effects.getByRole('button', { name: 'Add shadow' }).click();
await page.waitForTimeout(100);
check('add shadow appends', ((await node(ids.card)).styles.base['box-shadow'] ?? '').split(',').length >= 2);
await effects.getByRole('button', { name: 'Add filter' }).click();
await page.getByRole('menuitem', { name: 'Blur' }).click();
await page.waitForTimeout(100);
check('add blur filter', /blur\(4px\)/.test((await node(ids.card)).styles.base.filter ?? ''));
await effects.scrollIntoViewIfNeeded();
await shot('05-border-effects');

// ── Interaction states ─────────────────────────────────────────────────────
await page.locator('.k-dp-states__tab[data-state-id="hover"]').click();
await page.waitForTimeout(150);
check('forcedState set for hover', (await dev(() => window.__kinemaDev.useUI.getState().forcedState?.state)) === 'hover');
const fillH = await expand('Fill');
await fillH.getByRole('radio', { name: 'Solid color' }).click();
await typeInto(fillH.locator('.k-colorfield input').first(), '#00ff88');
let hov = (await node(ids.card)).states?.hover ?? {};
check('hover fill written to states.hover', hov['background-color'] === '#00ff88', JSON.stringify(hov));
check('base untouched by hover edit', (await node(ids.card)).styles.base['background-color'] === 'rgba(255, 0, 0, 0.5)');
const app = await expand('Appearance');
await typeInto(row(app, 'Scale').locator('input'), '1.05');
hov = (await node(ids.card)).states?.hover ?? {};
check('hover scale uses standalone scale', hov.scale === '1.05', JSON.stringify(hov));
check('canvas shows forced hover', await page.evaluate((id) => getComputedStyle(document.querySelector(`[data-kid="${id}"]`)).backgroundColor, ids.card) === 'rgb(0, 255, 136)');
const trans = await expand('Transitions');
check('transition suggestion shown', await trans.locator('[data-testid="transition-suggest"]').isVisible());
await trans.locator('[data-testid="transition-suggest"]').getByRole('button', { name: 'Add' }).click();
await page.waitForTimeout(100);
const tr = (await node(ids.card)).styles.base.transition ?? '';
check('suggested transition added to default styles', /background-color/.test(tr) && /scale/.test(tr), tr);
await shot('06-hover-state');
await page.locator('.k-dp-states__tab[data-state-id="default"]').click();
check('forcedState cleared', (await dev(() => window.__kinemaDev.useUI.getState().forcedState)) === null);

// ── Breakpoint overrides ───────────────────────────────────────────────────
await dev(() => window.__kinemaDev.useUI.getState().set({ breakpoint: 'tablet', canvasWidth: 768 }));
await page.waitForTimeout(150);
check('breakpoint banner visible', await page.locator('[data-testid="bp-banner"]').isVisible());
const layoutT = await expand('Layout');
await typeInto(layoutT.locator('.k-dim').first().locator('input'), '300');
let cn = await node(ids.card);
check('tablet width written to styles.tablet', cn.styles.tablet?.width === '300px' && cn.styles.base.width !== '300px', JSON.stringify(cn.styles.tablet));
check('overridden label accent', (await row(layoutT, 'Size').locator('.k-row__label').getAttribute('data-overridden')) === 'true');
await shot('07-tablet-override');
await row(layoutT, 'Size').locator('.k-dp-dot').click();
await page.waitForTimeout(100);
cn = await node(ids.card);
check('dot resets tablet override', !cn.styles.tablet?.width, JSON.stringify(cn.styles.tablet));
await typeInto(layoutT.locator('.k-dim').first().locator('input'), '310');
await page.locator('[data-testid="bp-banner"]').getByRole('button', { name: /Reset all/ }).click();
check('reset all clears tablet', !(await node(ids.card)).styles.tablet);
await dev(() => window.__kinemaDev.useUI.getState().set({ breakpoint: 'base', canvasWidth: 1440 }));

// ── Multi-select ───────────────────────────────────────────────────────────
await select([ids.card, ids.card2]);
const layoutM = await expand('Layout');
const wm = layoutM.locator('.k-dim').first().locator('input');
check('mixed width shows Mixed', (await wm.getAttribute('placeholder')) === 'Mixed');
await shot('08-multi');
await typeInto(wm, '250');
check('multi edit applies to all', (await node(ids.card)).styles.base.width === '250px' && (await node(ids.card2)).styles.base.width === '250px');

// ── Auto layout ────────────────────────────────────────────────────────────
await select([ids.root]);
await dev((root) => {
  const { useDoc } = window.__kinemaDev;
  void useDoc;
  return root;
}, ids.root);
const auto = await expand('Auto layout');
await auto.locator('[data-testid="add-auto-layout"]').click();
await page.waitForTimeout(150);
const rootN = await node(ids.root);
check('add auto layout → flex', rootN.styles.base.display === 'flex');
check('children converted to flow', (await node(ids.card)).styles.base.position === undefined && (await node(ids.card)).styles.base.left === undefined);
await auto.locator('.k-align__cell').nth(4).click();
await page.waitForTimeout(80);
const r2 = (await node(ids.root)).styles.base;
check('alignment grid sets justify/align', r2['justify-content'] === 'center' && r2['align-items'] === 'center', JSON.stringify([r2['justify-content'], r2['align-items']]));
await shot('09-auto-layout');
await page.keyboard.press('Control+z');

// ── Content: text, svg recolor, image ──────────────────────────────────────
await select([ids.title]);
const content = await expand('Content');
const ta = content.locator('textarea');
check('rich text shown as plain', (await ta.inputValue()) === 'Hello world');
await ta.click();
await ta.fill('Hi <there>\nline 2');
await page.locator('.k-dp-head').click();
await page.waitForTimeout(100);
check('text escaped + br', (await node(ids.title)).props.text === 'Hi &lt;there&gt;<br>line 2', (await node(ids.title)).props.text);
const typo = await expand('Typography');
await typo.locator('[data-testid="font-picker"]').click();
await page.locator('.k-fontpop__item', { hasText: 'Playfair Display' }).click();
await page.waitForTimeout(100);
check('font family set', /Playfair Display Variable/.test((await node(ids.title)).styles.base['font-family'] ?? ''));
await shot('10-text-typography');

await select([ids.svg]);
const contentS = await expand('Content');
const swatches = contentS.locator('.k-colorfield');
check('svg colors detected', (await swatches.count()) === 2);
await typeInto(swatches.first().locator('input'), '#22d3ee');
check('svg recolored', /#22d3ee/.test((await node(ids.svg)).props.svg));
await contentS.getByRole('button', { name: 'Use currentColor' }).click();
await page.waitForTimeout(100);
check('svg uses currentColor', !/#22d3ee|#0f1020/.test((await node(ids.svg)).props.svg) && /currentColor/.test((await node(ids.svg)).props.svg));
await contentS.getByRole('button', { name: 'Edit SVG code' }).click();
await page.waitForSelector('.k-svgedit');
await page.screenshot({ path: `${out}/11-svg-dialog.png` });
await page.keyboard.press('Escape');

await select([ids.btn]);
await shot('12-button');

// ── Advanced CSS ───────────────────────────────────────────────────────────
await select([ids.card2]);
const adv = await expand('Advanced');
await adv.locator('.cm-content').click();
await page.keyboard.press('Control+End');
await page.keyboard.type('\nletter-spacing: 2px;');
await adv.locator('[data-testid="apply-css"]').click();
await page.waitForTimeout(100);
check('advanced CSS applied', (await node(ids.card2)).styles.base['letter-spacing'] === '2px');
await adv.scrollIntoViewIfNeeded();
await shot('13-advanced');

// ── Nothing selected: page settings ────────────────────────────────────────
await select([]);
check('page settings shown', await page.locator('[data-testid="page-settings"]').isVisible());
const tokensCount = await dev(() => window.__kinemaDev.useDoc.getState().doc.tokens.colors.length);
await page.getByRole('button', { name: 'Add color token' }).click();
await page.waitForTimeout(100);
check('token added', (await dev(() => window.__kinemaDev.useDoc.getState().doc.tokens.colors.length)) === tokensCount + 1);
await shot('14-page-settings');

check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL PASSED');
await browser.close();
process.exit(failures.length ? 1 : 0);
