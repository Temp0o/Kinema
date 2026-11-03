// Drives the real Electron app (production build) with Playwright.
// Run: npm run build:web && npm run build:electron && xvfb-run -a node tests/electron/smoke.mjs
import { createRequire } from 'node:module';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');

const out = process.env.OUT ?? path.resolve('test-results');
const dataDir = mkdtempSync(path.join(tmpdir(), 'kinema-e2e-'));
const app = await electron.launch({
  executablePath: require('electron'),
  args: ['.', '--no-sandbox', '--disable-gpu'],
  env: { ...process.env, KINEMA_DATA_DIR: dataDir, VITE_DEV_SERVER_URL: '' },
});
const errors = [];
const win = await app.firstWindow();
win.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
win.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await win.waitForLoadState('domcontentloaded');
await win.waitForTimeout(1200);
await win.screenshot({ path: `${out}/electron-home.png` });
const kind = await win.evaluate(() => document.querySelector('.k-app')?.getAttribute('data-platform'));
console.log('platform kind:', kind);
await win.getByRole('button', { name: /new project/i }).first().click();
await win.waitForTimeout(800);
// some home screens show a dialog for new projects — confirm if present
const create = win.getByRole('button', { name: /^create/i });
if (await create.count()) await create.first().click();
await win.waitForSelector('.kc-root', { timeout: 10000 });
await win.waitForTimeout(2500); // allow autosave
await win.screenshot({ path: `${out}/electron-editor.png` });
const projects = existsSync(path.join(dataDir, 'Projects')) ? readdirSync(path.join(dataDir, 'Projects')) : [];
console.log('projects on disk:', projects.length, projects.length ? readdirSync(path.join(dataDir, 'Projects', projects[0])) : []);
await app.close();
console.log(errors.length ? errors.join('\n') : 'no renderer errors');
if (kind !== 'electron' || !projects.length) process.exit(1);
