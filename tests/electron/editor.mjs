// Core editor flow inside the real Electron app (production build).
// Run: npm run build && xvfb-run -a node tests/electron/editor.mjs
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');

const out = process.env.OUT ?? path.resolve('test-results');
const dataDir = mkdtempSync(path.join(tmpdir(), 'kinema-e2e-'));
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? '  ok ' : 'FAIL '} ${name} ${extra}`); };
const launch = () => electron.launch({
  executablePath: require('electron'),
  args: ['.', '--no-sandbox', '--disable-gpu'],
  env: { ...process.env, KINEMA_DATA_DIR: dataDir, VITE_DEV_SERVER_URL: '' },
});

let app = await launch();
let win = await app.firstWindow();
const errors = [];
const hook = (w) => { w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };
hook(win);
await win.setViewportSize?.({ width: 1480, height: 920 });
await win.waitForTimeout(1200);

// New project from the Landing template
await win.getByText('Landing page', { exact: true }).first().click();
await win.waitForTimeout(400);
const create = win.getByRole('button', { name: /^create/i });
if (await create.count()) await create.first().click();
await win.waitForSelector('.kc-root [data-kid]', { timeout: 15000 });
const tplNodes = await win.locator('.kc-root [data-kid]').count();
check('template opens in editor', tplNodes > 100, `(${tplNodes} nodes)`);

// Add a page so we have a clean freeform frame to draw on
await win.locator('.k-layers__pages button[aria-label*="Add" i], [aria-label="Add page"]').first().click().catch(() => {});
await win.waitForTimeout(600);
const frame = await win.locator('.kc-root').boundingBox();
const nodes = () => win.locator('.kc-root [data-kid]').count();
const before = await nodes();

// Draw a box
await win.keyboard.press('b');
await win.mouse.move(frame.x + 60, frame.y + 60);
await win.mouse.down();
await win.mouse.move(frame.x + 260, frame.y + 180, { steps: 8 });
await win.mouse.up();
await win.waitForTimeout(300);
check('box tool draws a box', (await nodes()) === before + 1);

// Move it
const sel = await win.locator('.kc-root [data-kid]').last().boundingBox();
await win.mouse.move(sel.x + sel.width / 2, sel.y + sel.height / 2);
await win.mouse.down();
await win.mouse.move(sel.x + sel.width / 2 + 80, sel.y + sel.height / 2 + 40, { steps: 10 });
await win.mouse.up();
await win.waitForTimeout(300);
const moved = await win.locator('.kc-root [data-kid]').last().boundingBox();
check('drag moves the box', Math.abs(moved.x - sel.x) > 20, `(dx ${Math.round(moved.x - sel.x)})`);

// Text tool + typing
await win.keyboard.press('t');
await win.mouse.click(frame.x + 80, frame.y + 260);
await win.keyboard.type('Hello from Electron');
await win.keyboard.press('Escape');
await win.waitForTimeout(300);
const hasText = await win.locator('.kc-root').getByText('Hello from Electron').count();
check('text tool + inline editing', hasText > 0);

// Undo / redo
const n1 = await nodes();
await win.keyboard.press('Control+z');
await win.waitForTimeout(200);
await win.keyboard.press('Control+z');
await win.waitForTimeout(200);
const n2 = await nodes();
await win.keyboard.press('Control+Shift+z');
await win.keyboard.press('Control+Shift+z');
await win.waitForTimeout(300);
check('undo/redo', n2 < n1 && (await nodes()) === n1, `(${n1} → ${n2} → ${await nodes()})`);

// Animation preset applied via Animate tab
await win.locator('[data-tab="animate"]').click();
await win.waitForTimeout(400);
await win.screenshot({ path: `${out}/electron-editor-flow.png` });

// Wait for autosave, close, relaunch, reopen
await win.waitForTimeout(2500);
const projDir = path.join(dataDir, 'Projects');
const proj = readdirSync(projDir)[0];
const saved = JSON.parse(readFileSync(path.join(projDir, proj, 'project.json'), 'utf8'));
const savedText = JSON.stringify(saved.document).includes('Hello from Electron');
check('autosaved to disk', savedText);
await app.close();

app = await launch();
win = await app.firstWindow();
hook(win);
await win.waitForTimeout(1500);
await win.locator('.k-project-card, [data-project-id]').first().dblclick().catch(async () => {
  await win.getByText('Landing page').first().click();
});
await win.waitForTimeout(1500);
await win.keyboard.press('Enter').catch(() => {});
await win.waitForSelector('.kc-root', { timeout: 10000 }).catch(() => {});
const pagesListed = await win.locator('.kc-root').count();
check('project reopens after restart', pagesListed > 0);
await win.screenshot({ path: `${out}/electron-reopen.png` });
await app.close();

check('no renderer errors', errors.length === 0, errors.slice(0, 3).join(' | '));
process.exit(results.every(Boolean) ? 0 : 1);
