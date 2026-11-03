// E2E: home screen, templates, project management, components, personal library.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const url = process.env.KINEMA_URL ?? 'http://localhost:5179/';
const out = process.env.OUT ?? new URL('../../test-results/e2e/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1480, height: 920 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text());
});
let failures = 0;
const check = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log('FAIL:', msg);
  } else console.log('ok  :', msg);
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

async function goHome() {
  await page.locator('.k-titlebar__logo').click();
  await page.getByRole('menuitem', { name: 'All projects' }).click();
  await page.locator('.k-home').waitFor();
  await page.waitForTimeout(400);
}
async function createFromTemplate(templateId, name) {
  await page.getByTestId('new-project').click();
  await page.locator('.k-newproj').waitFor();
  await page.locator('#k-newproj-name').fill(name);
  await page.locator(`.k-newproj__tpl[data-template="${templateId}"]`).click();
  await page.waitForTimeout(500);
  if (templateId === 'landing') await shot('00-new-project-dialog');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.locator('.k-editor').waitFor();
  await page.waitForTimeout(1600);
}

await page.goto(url);
await page.locator('.k-home').waitFor();
await page.waitForTimeout(2500);
await shot('01-home-first-run');
check(await page.locator('.k-intro__card').count() === 3, 'first-run intro shown');
check((await page.locator('.k-tpl').count()) === 6, 'six template cards');

// ── create from each template ──
const templates = ['blank', 'landing', 'portfolio', 'dashboard', 'auth', 'mobile', 'coming-soon'];
for (const t of templates) {
  await createFromTemplate(t, `E2E ${t}`);
  check(await page.locator('.kc-root').count() === 1, `editor opens for ${t}`);
  check((await page.title()).includes(`E2E ${t}`), `window title for ${t}`);
  await shot(`10-template-${t}`);
  await goHome();
}
await page.waitForTimeout(500);
await shot('02-home-with-projects');
check((await page.locator('.k-pcard').count()) === templates.length, 'project cards listed');
check((await page.locator('.k-pcard img').count()) >= 6, 'thumbnails captured on close');

// search & sort
await page.getByLabel('Search projects').fill('dashboard');
check((await page.locator('.k-pcard').count()) === 1, 'search filters projects');
await page.getByLabel('Search projects').fill('');
await page.getByRole('radio', { name: 'Name' }).click();
const names = await page.locator('.k-pcard__name').allTextContents();
check(JSON.stringify(names) === JSON.stringify([...names].sort((a, b) => a.localeCompare(b))), 'sort by name');

// rename
const card = page.locator('.k-pcard', { hasText: 'E2E blank' });
await card.hover();
await card.getByLabel(/Actions for/).click();
await page.getByRole('menuitem', { name: 'Rename' }).click();
await page.locator('.k-pcard__rename').fill('Renamed blank');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check((await page.locator('.k-pcard', { hasText: 'Renamed blank' }).count()) === 1, 'rename project');

// duplicate
const pc = page.locator('.k-pcard', { hasText: 'Renamed blank' });
await pc.hover();
await pc.getByLabel(/Actions for/).click();
await page.getByRole('menuitem', { name: 'Duplicate' }).click();
await page.waitForTimeout(600);
check((await page.locator('.k-pcard', { hasText: 'Renamed blank copy' }).count()) === 1, 'duplicate project');

// export .kinema
const pe = page.locator('.k-pcard', { hasText: 'E2E auth' });
await pe.hover();
await pe.getByLabel(/Actions for/).click();
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Export .kinema' }).click()]);
const dlPath = `${out}/export.kinema`;
await dl.saveAs(dlPath);
check(dl.suggestedFilename().endsWith('.kinema'), 'export downloads a .kinema file');

// import .kinema (button → file chooser)
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import .kinema' }).first().click()]);
await chooser.setFiles(dlPath);
await page.locator('.k-editor').waitFor({ timeout: 8000 });
check((await page.locator('.k-titlebar__name').textContent())?.includes('E2E auth'), 'imported project opens');
await goHome();
check((await page.locator('.k-pcard', { hasText: 'E2E auth' }).count()) === 2, 'import created a second project');

// bad file
const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import .kinema' }).first().click()]);
await chooser2.setFiles({ name: 'bad.kinema', mimeType: 'application/zip', buffer: Buffer.from('not a zip') });
await page.waitForTimeout(600);
check((await page.locator('[data-sonner-toast]', { hasText: /import this file/i }).count()) >= 1, 'friendly error for invalid .kinema');

// delete (confirm)
const pd = page.locator('.k-pcard', { hasText: 'Renamed blank copy' });
await pd.hover();
await pd.getByLabel(/Actions for/).click();
await page.getByRole('menuitem', { name: /Delete/ }).click();
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.waitForTimeout(500);
check((await page.locator('.k-pcard', { hasText: 'Renamed blank copy' }).count()) === 0, 'delete project');

// keyboard open
await page.locator('.k-pcard', { hasText: 'Renamed blank' }).first().focus();
await page.keyboard.press('Enter');
await page.locator('.k-editor').waitFor();
check(true, 'Enter opens the focused card');
await goHome();

// footer
check((await page.locator('.k-home__foot').textContent())?.includes('stored in'), 'footer shows data location');

// ── components + library ──
await page.locator('.k-pcard', { hasText: 'E2E landing' }).click();
await page.locator('.k-editor').waitFor();
await page.waitForTimeout(1500);
await page.locator('.k-tab[data-tab="library"]').click();
await shot('20-library-empty');

// select the feature card box that contains the heading (store access through the dev server module graph)
await page.evaluate(async () => {
  const { useUI } = await import('/src/core/store/uiStore.ts');
  const h = [...document.querySelectorAll('.kc-root [data-kid]')].find((e) => e.textContent === 'Lightning fast' && e.children.length === 0);
  const card = h.parentElement.closest('[data-kid]');
  useUI.getState().select([card.getAttribute('data-kid')]);
});
await page.waitForTimeout(300);
await page.keyboard.press('Control+Alt+k');
await page.waitForTimeout(500);
check((await page.locator('[data-testid="project-components"] .k-lcomp').count()) === 1, 'component created and listed under "This project"');
await shot('21-component-created');

// edit master (double click row action)
await page.locator('.k-lcomp').first().hover();
await page.getByLabel('Edit component').first().click();
await page.waitForTimeout(500);
check((await page.locator('.k-compbar').count()) === 1, 'edit bar shown in isolation');
await shot('22-component-editing');
await page.locator('.k-compbar__done').click();
await page.waitForTimeout(300);
check((await page.locator('.k-compbar').count()) === 0, 'Done exits isolation');

// detach
await page.keyboard.press('Control+Alt+b');
await page.waitForTimeout(400);
check((await page.locator('.k-lcomp .k-lcomp__meta').first().textContent())?.startsWith('0'), 'detach leaves the component with 0 instances');
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
check((await page.locator('.k-lcomp .k-lcomp__meta').first().textContent())?.startsWith('1'), 'undo restores the instance');

// save to library (re-select the instance first: undo cleared the selection)
await page.evaluate(async () => {
  const { useUI } = await import('/src/core/store/uiStore.ts');
  useUI.getState().select([document.querySelector('.kc-root [data-kinstance-root]').getAttribute('data-kid')]);
});
await page.keyboard.press('Control+Alt+l');
await page.locator('.k-dialog').waitFor();
await page.locator('.k-dialog').getByLabel('Name', { exact: true }).fill('Feature card');
await page.getByPlaceholder('Add tags — press Enter').fill('cards');
await page.keyboard.press('Enter');
await shot('23-save-dialog');
await page.getByTestId('save-library-confirm').click();
await page.waitForTimeout(1200);
check((await page.locator('.k-lcard', { hasText: 'Feature card' }).count()) === 1, 'item saved to library');
await shot('24-library-with-item');

// palette
await page.getByTestId('library-save-menu').click();
await page.getByRole('menuitem', { name: 'Color palette' }).click();
await page.locator('.k-dialog').waitFor();
await page.getByTestId('save-library-confirm').click();
await page.waitForTimeout(600);
check((await page.locator('.k-lcard[data-kind="palette"]').count()) === 1, 'palette saved');

// persists across reload (library is global)
await goHome();
await page.waitForTimeout(1200);
await page.reload();
await page.locator('.k-home').waitFor();
await page.locator('.k-pcard', { hasText: 'E2E dashboard' }).click();
await page.locator('.k-editor').waitFor();
await page.waitForTimeout(1200);
await page.locator('.k-tab[data-tab="library"]').click();
await page.waitForTimeout(500);
check((await page.locator('.k-lcard', { hasText: 'Feature card' }).count()) === 1, 'library persists and is global');
await page.locator('.k-lcard', { hasText: 'Feature card' }).click();
await page.waitForTimeout(800);
check((await page.locator('[data-testid="project-components"] .k-lcomp').count()) === 1, 'library component inserted into another project');
await shot('25-inserted-from-library');

// filter chips + favorite
await page.getByRole('tab', { name: 'Palettes' }).click();
check((await page.locator('.k-lcard').count()) === 1, 'kind filter works');
await page.getByRole('tab', { name: 'All' }).click();

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
