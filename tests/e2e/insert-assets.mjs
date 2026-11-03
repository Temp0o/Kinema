// E2E: Insert panel (previews, click + drag insert, icons) and Assets panel (import svg/png, panel UI).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.env.KINEMA_URL ?? 'http://localhost:5176/';
const out = process.env.OUT ?? new URL('../../test-results/e2e/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect width="120" height="80" rx="14" fill="url(#g)"/><circle cx="60" cy="40" r="20" fill="#fff" fill-opacity=".85"/><script>alert(1)</script></svg>`;
// 2x1 red/blue PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEElEQVR4nGP4z8Dwn+E/AwAPDAL+Aw+rDAAAAABJRU5ErkJggg==', 'base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1480, height: 920 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
});
const check = (cond, msg) => {
  if (!cond) {
    errors.push('CHECK FAILED: ' + msg);
    console.log('FAIL', msg);
  } else console.log('ok  ', msg);
};

await page.goto(url);
await page.waitForTimeout(600);
await page.getByRole('button', { name: /new project/i }).first().click();
await page.getByRole('button', { name: /create project/i }).click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(1200);

// ── Insert panel ──────────────────────────────────────────────
await page.locator('[data-tab="insert"]').click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/01-insert.png` });
const cards = await page.locator('.k-card').count();
check(cards >= 60, `insert panel lists ${cards} cards`);

for (const cat of ['Navigation', 'Hero', 'Cards', 'Feedback']) {
  await page.getByRole('button', { name: cat, exact: true }).click();
  await page.waitForTimeout(700);
  await page.locator('.k-ins__scroll').screenshot({ path: `${out}/02-cat-${cat.toLowerCase()}.png` });
}
await page.getByRole('button', { name: 'All', exact: true }).click();

await page.getByLabel('Search components').fill('pricng');
await page.waitForTimeout(400);
check((await page.locator('.k-card').first().getAttribute('data-item'))?.includes('pricing'), 'fuzzy search finds pricing');
await page.getByLabel('Search components').fill('');

const nodeCount = () => page.locator('.kc-root [data-kid]').count();
const before = await nodeCount();
await page.locator('[data-item="hero-centered"]').click();
await page.waitForTimeout(500);
await page.locator('[data-item="button-primary"]').click();
await page.waitForTimeout(300);
await page.locator('[data-item="card-pricing"]').click();
await page.waitForTimeout(500);
check((await nodeCount()) > before + 10, 'click insert adds nodes to the canvas');
await page.screenshot({ path: `${out}/03-after-click-insert.png` });

// drag onto canvas via synthetic DataTransfer
const target = await page.locator('.kc-viewport').boundingBox();
await page.evaluate(
  ([x, y]) => {
    const src = document.querySelector('[data-item="card-testimonial"]');
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const vp = document.querySelector('.kc-viewport');
    for (const type of ['dragenter', 'dragover', 'drop']) vp.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  },
  [target.x + target.width / 2, target.y + target.height / 2],
);
await page.waitForTimeout(500);
console.log('drag drop nodes now:', await nodeCount());

// Icons tab
await page.getByRole('radio', { name: /icons/i }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/04-icons.png` });
await page.getByLabel('Search icons').fill('arrow');
await page.waitForTimeout(400);
const iconCells = await page.locator('.k-icon-cell').count();
check(iconCells > 5 && iconCells < 200, `icons virtualized (${iconCells} cells in DOM)`);
const nBefore = await nodeCount();
await page.locator('.k-icon-cell').first().click();
await page.waitForTimeout(400);
check((await nodeCount()) === nBefore + 1, 'icon click inserts one svg node');

// ── Assets panel ──────────────────────────────────────────────
await page.locator('[data-tab="assets"]').click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/05-assets-empty.png` });
check((await page.getByText('Bring in your assets').count()) === 1, 'empty state shown');

// The web platform creates a hidden <input type=file> on demand.
const importWith = async (files) => {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).first().click();
  await (await chooser).setFiles(files);
  await page.waitForTimeout(1200);
};
await importWith([
  { name: 'badge.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SVG) },
  { name: 'pixel.png', mimeType: 'image/png', buffer: PNG },
]);
check((await page.locator('.k-asset').count()) === 2, 'two assets imported');
await page.screenshot({ path: `${out}/06-assets-grid.png` });

// font + duplicate
writeFileSync(`${out}/fake-Satoshi-Bold.woff2`, Buffer.from([0, 1, 2, 3]));
await importWith([
  { name: 'badge-copy.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SVG) },
  { name: 'Satoshi-Bold.woff2', mimeType: 'font/woff2', buffer: Buffer.from([0, 1, 2, 3, 4]) },
]);
check((await page.locator('.k-asset').count()) === 3, 'duplicate svg deduped, font added');

// insert svg by click, then the usage count shows
const n0 = await nodeCount();
await page.locator('.k-asset[data-kind="svg"]').click();
await page.waitForTimeout(500);
check((await nodeCount()) > n0, 'asset click inserts onto canvas');
const svgHtml = await page.locator('.kc-root .kc-svg').last().innerHTML();
check(/<svg/.test(svgHtml) && !/script/.test(svgHtml), 'svg inlined and sanitized');
await page.locator('.k-asset[data-kind="image"]').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/07-assets-used.png` });
check((await page.locator('.k-asset__uses').count()) >= 2, 'usage badges visible');

// list view + filter + context menu
await page.getByRole('radio', { name: 'List view' }).click().catch(() => page.getByLabel('List view').click());
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^Fonts/ }).click();
check((await page.locator('.k-asset').count()) === 1, 'kind filter works');
await page.screenshot({ path: `${out}/08-assets-list-fonts.png` });
await page.getByRole('button', { name: /^All/ }).click();
await page.locator('.k-asset[data-kind="image"]').click({ button: 'right' });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/09-context-menu.png` });
await page.getByRole('menuitem', { name: 'Details' }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/10-details.png` });
check((await page.getByText('2 × 1 px').count()) >= 1, 'details show PNG dimensions');
await page.keyboard.press('Escape');

// delete (used → confirm) and undo
await page.locator('.k-asset[data-kind="image"]').click({ button: 'right' });
await page.getByRole('menuitem', { name: 'Delete' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/11-delete-confirm.png` });
await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
await page.waitForTimeout(400);
check((await page.locator('.k-asset').count()) === 2, 'asset deleted');
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
check((await page.locator('.k-asset').count()) === 3, 'delete undone');

// OS drop onto the panel
await page.evaluate(async (b64) => {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bin], 'dropped.png', { type: 'image/png' }));
  const el = document.querySelector('.k-assets');
  for (const t of ['dragenter', 'dragover']) el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
}, PNG.toString('base64'));
await page.waitForTimeout(200);
check((await page.locator('.k-assets__drop').count()) === 1, 'drop zone highlights');
await page.screenshot({ path: `${out}/12-drop-zone.png` });

console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
process.exit(errors.length ? 1 : 0);
