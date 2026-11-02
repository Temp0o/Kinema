// Smoke test: starts at home, creates a project, opens editor, screenshots.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.env.KINEMA_URL ?? 'http://localhost:5173/';
const out = process.env.OUT ?? '/tmp/claude-0/-home-user-Ui-maker-/243be435-822f-5f8d-abd9-db4f4fae3247/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1480, height: 920 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/home.png` });
await page.getByRole('button', { name: /new project/i }).first().click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/editor.png` });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
