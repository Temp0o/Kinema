// Regression checks for bugs against the intended design (real Electron app):
//  1. Free placement is the default for new projects (blank frame is freeform;
//     inserted content is absolutely positioned), Flow is opt-in (Shift+F).
//  2. Ctrl+0 fits the ENTIRE frame into the workspace (Photoshop "Fit on Screen").
//  3. Preview's exit control is clear of the native window controls.
// Run: npm run build && xvfb-run -a node tests/electron/regressions.mjs
import { createRequire } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');

const out = process.env.OUT ?? path.resolve('test-results');
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? '  ok ' : 'FAIL '} ${name} ${extra}`); };
const app = await electron.launch({
  executablePath: require('electron'),
  args: ['.', '--no-sandbox', '--disable-gpu'],
  env: { ...process.env, KINEMA_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'kinema-reg-')), VITE_DEV_SERVER_URL: '', KINEMA_NO_TOUR: '1' },
});
const w = await app.firstWindow();
const errors = [];
w.on('pageerror', (e) => errors.push(e.message));
w.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await w.waitForTimeout(1200);

// ── 1. Free mode default ──
const pageMode = () => w.evaluate(() => document.querySelector('.k-toolbar__placement [data-state="on"]')?.textContent?.trim());
const frameDisplay = () => w.evaluate(() => getComputedStyle(document.querySelector('.kc-root [data-kroot]')).display);
const topLevel = () =>
  w.evaluate(() =>
    [...document.querySelectorAll('.kc-root [data-kroot] > [data-kid]')].map((e) => ({ pos: getComputedStyle(e).position, top: Math.round(e.offsetTop), h: e.offsetHeight })),
  );

// 1a. Template project (the reported case): opens in Free, sections keep their places
await w.getByText('Landing page', { exact: true }).first().click();
await w.waitForTimeout(400);
await w.getByRole('button', { name: /^create/i }).first().click();
await w.waitForSelector('.kc-root [data-kroot] > [data-kid]', { timeout: 15000 });
await w.waitForTimeout(1500);
check('template page opens in Free layout', (await pageMode()) === 'Free' && !/flex|grid/.test(await frameDisplay()), `(${await pageMode()}, display ${await frameDisplay()})`);
const secs = await topLevel();
const allAbs = secs.every((x) => x.pos === 'absolute');
let stacked = true;
for (let i = 1; i < secs.length; i++) if (secs[i].top < secs[i - 1].top + secs[i - 1].h - 2) stacked = false;
check('template sections are free-positioned without overlapping', allAbs && stacked && secs.length > 5, `(${secs.length} sections)`);
// responsive positions survive: mobile breakpoint has its own tops
await w.locator('.k-titlebar__center button').nth(2).click();
await w.waitForTimeout(700);
const mob = await topLevel();
let mobStacked = true;
for (let i = 1; i < mob.length; i++) if (mob[i].top < mob[i - 1].top + mob[i - 1].h - 2) mobStacked = false;
check('Free template stays stacked at the mobile breakpoint', mobStacked, `(first tops ${mob.slice(0, 3).map((x) => x.top)})`);
await w.locator('.k-titlebar__center button').nth(0).click();
await w.waitForTimeout(500);
// switch page to Flow and back (toolbar), layout must be preserved
await w.locator('.k-toolbar__placement button', { hasText: 'Flow' }).click();
await w.waitForTimeout(500);
check('page switches to Flow (toolbar)', (await pageMode()) === 'Flow' && /flex/.test(await frameDisplay()));
const flowTops = (await topLevel()).map((x) => x.top);
await w.keyboard.press('Control+z');
await w.waitForTimeout(400);
check('undo restores Free', (await pageMode()) === 'Free');
await w.locator('.kc-viewport').click({ position: { x: 8, y: 8 } });
await w.keyboard.press('Shift+F');
await w.waitForTimeout(500);
check('Shift+F switches the page layout', (await pageMode()) === 'Flow');
await w.keyboard.press('Shift+F');
await w.waitForTimeout(600);
const backTops = (await topLevel()).map((x) => x.top);
const maxDrift = Math.max(...backTops.map((t, i) => Math.abs(t - (flowTops[i] ?? t))));
check('Flow → Free conversion keeps positions', (await pageMode()) === 'Free' && maxDrift <= 2, `(max drift ${maxDrift}px)`);
await w.screenshot({ path: `${out}/electron-template-free.png` });

// 1b. Blank project: freeform, inserts are free
await w.locator('.k-titlebar__logo').click();
await w.getByRole('menuitem', { name: /all projects/i }).click();
await w.waitForTimeout(800);
await w.getByTestId('new-project').click();
await w.waitForTimeout(400);
await w.getByRole('button', { name: /^create/i }).first().click();
await w.waitForSelector('.kc-root [data-kroot]');
await w.waitForTimeout(500);
check('blank project frame is freeform (not flex/grid)', !/flex|grid/.test(await frameDisplay()), `(display: ${await frameDisplay()})`);
check('toolbar shows the page in Free layout', (await pageMode()) === 'Free');
// The Library is the default left panel in the Design workspace.
await w.locator('[data-tour="library-components"]').click();
await w.waitForTimeout(600);
await w.locator('[data-tour="library-card"]').nth(4).click();
await w.waitForTimeout(300);
const lastPos = (await topLevel()).at(-1)?.pos;
check('inserted component is free-positioned', lastPos === 'absolute', `(${lastPos})`);

// ── 2. Ctrl+0 fits the entire frame ──
// make the frame tall so a width-only fit would overflow vertically
await w.evaluate(() => { const r = document.querySelector('.kc-root [data-kroot]'); if (r) r.style.minHeight = '3000px'; });
await w.keyboard.press('Control+0');
await w.waitForTimeout(300);
const fit = await w.evaluate(() => {
  const vp = document.querySelector('.kc-viewport').getBoundingClientRect();
  const f = document.querySelector('.kc-root').getBoundingClientRect();
  return { inside: f.left >= vp.left - 1 && f.right <= vp.right + 1 && f.top >= vp.top - 1 && f.bottom <= vp.bottom + 1, f: [Math.round(f.width), Math.round(f.height)], vp: [Math.round(vp.width), Math.round(vp.height)] };
});
check('Ctrl+0 fits the entire frame inside the workspace', fit.inside, JSON.stringify(fit));
const zoomLabel = await w.evaluate(() => document.querySelector('.k-titlebar__zoom')?.textContent);
await w.keyboard.press('Control+1');
await w.waitForTimeout(200);
check('Ctrl+1 zooms to 100%', (await w.evaluate(() => document.querySelector('.k-titlebar__zoom')?.textContent))?.startsWith('100%'), `(fit was ${zoomLabel})`);
await w.evaluate(() => { const r = document.querySelector('.kc-root [data-kroot]'); if (r) r.style.minHeight = ''; });

// ── 3. Preview exit is always reachable (Preview is an in-place workspace; the top bar stays) ──
await w.locator('[data-tour="mode-preview"]').click();
await w.waitForTimeout(1200);
const back = w.locator('[data-tour="mode-design"]');
const box = await back.boundingBox();
const winW = await w.evaluate(() => window.innerWidth);
check('Preview keeps the Design (exit) control visible', !!box && (await w.evaluate(() => !!document.querySelector('.k-preview'))));
check('Exit control is clear of native window controls', !!box && box.x + box.width < winW - 160, box ? `(x=${Math.round(box.x)}, win=${winW})` : '');
const right = await w.evaluate(() => { const g = document.querySelector('.k-preview__right'); return g ? Math.round(g.getBoundingClientRect().right) : null; });
const safe = await w.evaluate(() => { const b = document.querySelector('.k-preview__bar'); return b ? parseFloat(getComputedStyle(b).paddingRight) : 0; });
check('Preview toolbar reserves the title-bar safe area on the right', safe >= 10, `(padding-right ${safe}px, right group ends at ${right})`);
await w.screenshot({ path: `${out}/electron-preview-bar.png` });
await back.click();
await w.waitForTimeout(400);
check('Design closes Preview', !(await w.evaluate(() => !!document.querySelector('.k-preview'))));
await w.keyboard.press('Control+Enter');
await w.waitForTimeout(800);
await w.keyboard.press('Escape');
await w.waitForTimeout(300);
check('Ctrl+Enter / Escape still open and close Preview', !(await w.evaluate(() => !!document.querySelector('.k-preview'))));

// ── 4. Keyboard: no two commands silently share a shortcut ──
const conflicts = await w.evaluate(() => window.__kinemaKeymap?.findConflicts() ?? null);
check('no conflicting keyboard shortcuts', Array.isArray(conflicts) && conflicts.length === 0, JSON.stringify(conflicts));

await app.close();
check('no renderer errors', errors.length === 0, errors.slice(0, 3).join(' | '));
process.exit(results.every(Boolean) ? 0 : 1);
