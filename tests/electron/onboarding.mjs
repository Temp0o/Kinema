// First-run tour inside the real Electron app (production build).
// Run: npm run build && xvfb-run -a -s "-screen 0 1600x1000x24" node tests/electron/onboarding.mjs
// Screenshots go to $SHOTS (default: test-results).
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');

const shots = process.env.SHOTS ?? process.env.OUT ?? path.resolve('test-results');
mkdirSync(shots, { recursive: true });
const dataDir = mkdtempSync(path.join(tmpdir(), 'kinema-tour-'));
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? '  ok ' : 'FAIL '} ${name} ${extra}`); };
const env = { ...process.env, KINEMA_DATA_DIR: dataDir, VITE_DEV_SERVER_URL: '' };
delete env.KINEMA_NO_TOUR;
const launch = () => electron.launch({ executablePath: require('electron'), args: ['.', '--no-sandbox', '--disable-gpu'], env });

const errors = [];
const hook = (w) => { w.on('pageerror', (e) => errors.push(e.message)); w.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };

let app = await launch();
let win = await app.firstWindow();
hook(win);
await win.setViewportSize?.({ width: 1480, height: 920 });
await win.waitForLoadState('domcontentloaded');
// Electron's localStorage persists across runs on this machine: start from a true first launch.
await win.evaluate(() => { localStorage.removeItem('kinema.tour.status'); localStorage.removeItem('kinema.tour.step'); });
await win.reload();

const cardEl = () => win.locator('.k-tour-card'); // re-resolved: `win` changes after a relaunch
const title = () => win.locator('#k-tour-title').textContent({ timeout: 500 }).catch(() => null);
const status = () => win.evaluate(() => localStorage.getItem('kinema.tour.status'));
async function waitTitle(t, ms = 6000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if ((await title()) === t) return true;
    await win.waitForTimeout(100);
  }
  return false;
}
const cardBtn = (name) => cardEl().getByRole('button', { name, exact: true });
// Playwright's click refuses if anything (e.g. the tour's blockers) covers the element,
// so these clicks prove the highlighted control is really clickable.
const clickReal = (sel) => win.locator(sel).first().click({ timeout: 4000 }).then(() => true, () => false);

// ── First launch offers the tour ──
check('first launch shows the welcome card', await waitTitle('Welcome to Kinema'));
check('welcome offers take / skip / don’t show again', (await cardBtn('Take the tour (2 min)').count()) === 1 && (await cardBtn('Skip').count()) === 1 && (await cardBtn('Don’t show again').count()) === 1);
await win.screenshot({ path: `${shots}/tour-1-welcome.png` });
await cardBtn('Take the tour (2 min)').click();

// ── Create a project by clicking the highlighted button ──
check('step: start a project', await waitTitle('Start a project'));
check('blockers stop clicks outside the spotlight', !(await win.locator('.k-tpl').first().click({ timeout: 800, trial: true }).then(() => true, () => false)));
check('New project is clickable through the spotlight', await clickReal('[data-testid="new-project"]'));
await win.getByRole('button', { name: /^create/i }).first().click();
check('advances when the editor opens', await waitTitle('Three workspaces, one canvas', 15000));

await cardBtn('Next').click();
check('step: library search', await waitTitle('The Library'));
await cardBtn('Next').click();
check('step: sections tile', await waitTitle('Ready-made sections'));
check('Sections tile clickable', await clickReal('[data-tour="library-sections"]'));
check('advances to add-a-section', await waitTitle('Add one to your page'));
await win.waitForTimeout(400);
await win.screenshot({ path: `${shots}/tour-2-library.png` });
const nodesBefore = await win.locator('.kc-root [data-kid]').count();
check('library card clickable', await clickReal('[data-tour="library-card"]'));
check('advances when a section is added', await waitTitle('Select something'), `(${nodesBefore} → ${await win.locator('.kc-root [data-kid]').count()} nodes)`);

// ── Select on the canvas ──
const sec = await win.locator('.kc-root [data-kroot] > [data-kid]').last().boundingBox();
await win.mouse.click(sec.x + Math.min(sec.width / 2, 300), sec.y + Math.min(sec.height / 2, 120));
check('advances when something is selected', await waitTitle('Animate it in one step'));

// ── Animate from the selection bar ──
check('Animate button clickable', await clickReal('[data-tour="animate-button"]'));
await win.locator('.k-sbar__animitem').first().hover();
await win.waitForTimeout(500);
await win.screenshot({ path: `${shots}/tour-3-animate.png` });
await win.locator('.k-sbar__animitem').first().click();
check('advances when an animation is applied', await waitTitle('Layers'));

// ── Pause & resume ──
await cardBtn('Pause').click();
await win.waitForTimeout(300);
check('pause collapses to the pill', (await win.locator('.k-tour-pill').count()) === 1 && (await cardEl().count()) === 0 && (await status()) === 'paused');
await win.locator('.k-tour-pill').getByRole('button', { name: 'Resume' }).click();
check('resume returns to the same step', await waitTitle('Layers'));

await cardBtn('Next').click();
check('step: inspector', await waitTitle('Inspector'));
await cardBtn('Next').click();
check('step: layout mode', await waitTitle('Free or Flow layout'));
await cardBtn('Next').click();
check('step: go to Animate', await waitTitle('Time to animate'));
check('Animate mode tab clickable', await clickReal('[data-tour="mode-animate"]'));
check('advances into the Animate workspace', await waitTitle('Motion library'));
await cardBtn('Next').click();
check('step: timeline', await waitTitle('Timeline'));
await cardBtn('Next').click();
check('step: go to Preview', await waitTitle('See it for real'));
check('Preview tab clickable', await clickReal('[data-tour="mode-preview"]'));
check('advances into Preview', await waitTitle('Back to Design'));
check('Design tab clickable', await clickReal('[data-tour="mode-design"]'));
check('advances back to Design', await waitTitle('Your AI assistant'));
await cardBtn('Next').click();
check('step: export', await waitTitle('Ship it'));
await cardBtn('Next').click();
check('step: finish', await waitTitle('You’re all set'));
await cardBtn('Finish').click();
await win.waitForTimeout(300);
check('finishing closes the tour and records completion', (await cardEl().count()) === 0 && (await status()) === 'completed');

// ── Replay from Help (editor main menu), Escape asks, Skip persists ──
await win.locator('[data-tour="main-menu"]').click();
await win.getByRole('menuitem', { name: 'Help' }).click();
await win.getByRole('menuitem', { name: 'Take the interactive tour' }).click();
check('replay from the main menu Help', await waitTitle('Welcome to Kinema'));
await win.keyboard.press('Escape');
check('Escape asks before leaving', (await cardEl().getByText('Leave the tour?').count()) === 1);
await cardBtn('Keep going').click();
check('“Keep going” returns to the step', (await cardEl().getByText('Leave the tour?').count()) === 0 && (await title()) === 'Welcome to Kinema');
await cardBtn('Skip').click();
await win.waitForTimeout(300);
check('skip persists', (await cardEl().count()) === 0 && (await status()) === 'skipped');
await app.close();

// ── Relaunch: no tour; replay from the home screen Help ──
app = await launch();
win = await app.firstWindow();
hook(win);
await win.waitForTimeout(2500);
check('tour does not reappear after relaunch', (await win.locator('.k-tour-card, .k-tour-pill').count()) === 0 && (await win.evaluate(() => localStorage.getItem('kinema.tour.status'))) === 'skipped');
await win.locator('[data-tour="home-help"]').click();
await win.getByRole('menuitem', { name: 'Take the interactive tour' }).click();
check('replay from the home screen Help', await waitTitle('Welcome to Kinema'));
await cardBtn('Take the tour (2 min)').click();
check('replayed tour continues to the first action', await waitTitle('Start a project'));
await win.screenshot({ path: `${shots}/tour-4-home-step.png` });
await cardBtn('Skip tour').click();
check('skip tour mid-way persists', (await win.evaluate(() => localStorage.getItem('kinema.tour.status'))) === 'skipped');
await app.close();

check('no renderer errors', errors.length === 0, errors.slice(0, 3).join(' | '));
process.exit(results.every(Boolean) ? 0 : 1);
