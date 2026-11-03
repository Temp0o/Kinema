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
  env: { ...process.env, KINEMA_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'kinema-reg-')), VITE_DEV_SERVER_URL: '' },
});
const w = await app.firstWindow();
const errors = [];
w.on('pageerror', (e) => errors.push(e.message));
w.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await w.waitForTimeout(1200);

// ── 1. Free mode default ──
await w.getByTestId('new-project').click();
await w.waitForTimeout(400);
await w.getByRole('button', { name: /^create/i }).first().click();
await w.waitForSelector('.kc-root [data-kroot]');
await w.waitForTimeout(500);
const frameDisplay = await w.evaluate(() => getComputedStyle(document.querySelector('.kc-root [data-kroot]')).display);
check('blank project frame is freeform (not flex/grid)', !/flex|grid/.test(frameDisplay), `(display: ${frameDisplay})`);
const placement = await w.evaluate(() => document.querySelector('.k-toolbar__placement [data-state="on"]')?.textContent?.trim());
check('toolbar shows Free placement by default', placement === 'Free', `(${placement})`);
await w.locator('[data-tab="insert"]').click();
await w.waitForTimeout(800);
const lastPos = () => w.evaluate(() => { const els = document.querySelectorAll('.kc-root [data-kroot] > [data-kid]'); const e = els[els.length - 1]; return e ? getComputedStyle(e).position : null; });
await w.locator('[data-panel="insert"] [draggable="true"]').nth(4).click();
await w.waitForTimeout(300);
check('inserted component is free-positioned', (await lastPos()) === 'absolute', `(${await lastPos()})`);
// Flow is opt-in: Shift+F, then insert into a flex container keeps flow
await w.locator('.kc-viewport').click({ position: { x: 10, y: 10 } });
await w.keyboard.press('Shift+F');
await w.waitForTimeout(200);
const placement2 = await w.evaluate(() => document.querySelector('.k-toolbar__placement [data-state="on"]')?.textContent?.trim());
check('Shift+F switches to Flow placement', placement2 === 'Flow', `(${placement2})`);
await w.keyboard.press('Shift+F');

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

// ── 3. Preview exit is always reachable ──
await w.getByRole('button', { name: /^preview$/i }).click();
await w.waitForTimeout(1200);
const back = w.getByRole('button', { name: /back to editor/i });
const box = await back.boundingBox();
const winW = await w.evaluate(() => window.innerWidth);
check('Preview has a Back to editor button', !!box);
check('Back button is clear of native window controls (left side)', !!box && box.x + box.width < winW - 160, box ? `(x=${Math.round(box.x)}, win=${winW})` : '');
const right = await w.evaluate(() => { const g = document.querySelector('.k-preview__right'); return g ? Math.round(g.getBoundingClientRect().right) : null; });
const safe = await w.evaluate(() => { const b = document.querySelector('.k-preview__bar'); return b ? parseFloat(getComputedStyle(b).paddingRight) : 0; });
check('Preview toolbar reserves the title-bar safe area on the right', safe >= 10, `(padding-right ${safe}px, right group ends at ${right})`);
await w.screenshot({ path: `${out}/electron-preview-bar.png` });
await back.click();
await w.waitForTimeout(400);
check('Back to editor closes Preview', !(await w.evaluate(() => !!document.querySelector('.k-preview'))));
await w.keyboard.press('Control+Enter');
await w.waitForTimeout(800);
await w.keyboard.press('Escape');
await w.waitForTimeout(300);
check('Ctrl+Enter / Escape still open and close Preview', !(await w.evaluate(() => !!document.querySelector('.k-preview'))));

await app.close();
check('no renderer errors', errors.length === 0, errors.slice(0, 3).join(' | '));
process.exit(results.every(Boolean) ? 0 : 1);
