// Desktop integration in the real Electron app:
//  1. closing the window right after an edit still saves it (close-flush handshake)
//  2. launching with a .kinema file path opens that project
//  3. window size/position are restored on the next launch
// Run: npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" node tests/electron/desktop.mjs
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');
const JSZip = require('jszip');

const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? '  ok ' : 'FAIL '} ${name} ${extra}`); };
const dataDir = mkdtempSync(path.join(tmpdir(), 'kinema-desk-'));
const userData = mkdtempSync(path.join(tmpdir(), 'kinema-ud-'));
const launch = (extra = []) =>
  electron.launch({
    executablePath: require('electron'),
    args: ['.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${userData}`, ...extra],
    env: { ...process.env, KINEMA_DATA_DIR: dataDir, VITE_DEV_SERVER_URL: '', KINEMA_NO_TOUR: '1' },
  });
const errors = [];
const hook = (w) => { w.on('pageerror', (e) => errors.push(e.message)); };

// ── 1. close right after an edit ──
let app = await launch();
let w = await app.firstWindow();
hook(w);
await w.evaluate(() => { try { localStorage.setItem('kinema.tour.status', '"skipped"'); localStorage.setItem('kinema.tour.status', 'skipped'); } catch {} });
await w.waitForTimeout(1000);
await w.getByTestId('new-project').click();
await w.waitForTimeout(300);
await w.getByRole('button', { name: /^create/i }).first().click();
await w.waitForSelector('.kc-root [data-kroot]');
await w.waitForTimeout(1600); // initial save done
const frame = await w.locator('.kc-root').boundingBox();
await w.keyboard.press('t');
await w.mouse.click(frame.x + 60, frame.y + 60);
await w.keyboard.type('Saved on close');
await w.keyboard.press('Escape');
// set a distinctive window size for check 3, then close immediately (well before autosave)
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 40, y: 30, width: 1234, height: 777 }));
await w.waitForTimeout(150);
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
await app.waitForEvent('close').catch(() => {});
const proj = readdirSync(path.join(dataDir, 'Projects')).filter((d) => !d.startsWith('.'))[0];
const saved = readFileSync(path.join(dataDir, 'Projects', proj, 'project.json'), 'utf8');
check('edit made just before closing is saved', saved.includes('Saved on close'));

// ── 2 + 3. relaunch with a .kinema file; window bounds restored ──
const pkg = JSON.parse(saved);
pkg.name = 'Opened from Explorer';
pkg.document.settings.title = 'Opened from Explorer';
const zip = new JSZip();
zip.file('project.json', JSON.stringify(pkg));
const kfile = path.join(dataDir, 'Shared design.kinema');
writeFileSync(kfile, await zip.generateAsync({ type: 'nodebuffer' }));
app = await launch([kfile]);
w = await app.firstWindow();
hook(w);
await w.waitForSelector('.kc-root [data-kroot]', { timeout: 15000 }).catch(() => {});
await w.waitForTimeout(800);
const name = await w.evaluate(() => document.querySelector('.k-titlebar__name')?.textContent ?? '');
check('.kinema passed on the command line opens in the editor', /Opened from Explorer/.test(name), `(${name})`);
const b = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
check('window size is restored', Math.abs(b.width - 1234) <= 2 && Math.abs(b.height - 777) <= 2, JSON.stringify(b));
await app.close();
check('no renderer errors', errors.length === 0, errors.slice(0, 3).join(' | '));
process.exit(results.every(Boolean) ? 0 : 1);
