// AI e2e against the mock Ollama server.
//   node tests/mock-ollama/server.mjs 11500 &
//   npx vite --port 5180 --strictPort &
//   KINEMA_URL=http://localhost:5180/ MOCK_URL=http://127.0.0.1:11500 node tests/e2e/ai.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const url = process.env.KINEMA_URL ?? 'http://localhost:5180/';
const mock = process.env.MOCK_URL ?? 'http://127.0.0.1:11500';
const out = process.env.OUT ?? '/tmp/claude-0/-home-user-Ui-maker-/243be435-822f-5f8d-abd9-db4f4fae3247/scratchpad/ai';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1480, height: 960 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|ERR_CONNECTION_REFUSED/.test(m.text())) errors.push('console: ' + m.text());
});

let failures = 0;
const check = (cond, msg) => {
  if (cond) console.log('  ok  ', msg);
  else {
    failures++;
    console.log('  FAIL', msg);
  }
};
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const tid = (id) => page.locator(`[data-testid="${id}"]`);

const snap = () =>
  page.evaluate(async () => {
    const { useDoc } = await import('/src/core/store/docStore.ts');
    const { useUI } = await import('/src/core/store/uiStore.ts');
    const d = useDoc.getState();
    const ui = useUI.getState();
    const page0 = d.doc.pages[0];
    const root = d.doc.nodes[page0.rootId];
    return {
      rootId: root.id,
      rootChildren: root.children,
      nodeCount: Object.keys(d.doc.nodes).length,
      past: d.past.length,
      lastLabel: d.past.at(-1)?.label,
      lastAi: d.past.at(-1)?.ai,
      selection: ui.selection,
      nodes: d.doc.nodes,
      rootStyle: root.styles.base,
    };
  });
const select = (ids) =>
  page.evaluate(async (ids) => {
    const { useUI } = await import('/src/core/store/uiStore.ts');
    useUI.getState().select(ids);
  }, ids);

async function runAndWait(selector, timeout = 60000) {
  await tid('ai-generate').click();
  await page.waitForSelector(selector, { timeout });
}

console.log('# open editor');
await page.goto(url);
await wait(800);
await page.getByRole('button', { name: /new project/i }).first().click();
await page.waitForSelector('.kc-root', { timeout: 15000 });
await wait(600);
await page.locator('[data-tab="ai"]').click();
await tid('ai-panel').waitFor();

console.log('# offline guidance (default address, nothing listening)');
await page.waitForSelector('[data-testid="ai-setup"]', { timeout: 8000 });
check((await tid('ai-status').getAttribute('data-status')) === 'offline', 'status is offline');
check((await tid('ai-setup').innerText()).includes('ollama serve'), 'setup shows ollama serve');
await shot('01-offline');

console.log('# point at the mock server');
await tid('ai-settings').click();
const input = tid('ai-base-url').locator('input').first();
const baseInput = page.locator('[data-testid="ai-settings-panel"] input').first();
await baseInput.fill(mock);
await baseInput.press('Enter');
await page.waitForSelector('[data-testid="ai-status"][data-status="connected"]', { timeout: 10000 });
check((await tid('ai-status').innerText()).includes('4 models'), 'status says Connected with 4 models (embedding excluded)');
await shot('02-settings');
await page.keyboard.press('Escape');
void input;

console.log('# model picker + Recommended badge');
check(await tid('ai-recommended').isVisible(), 'recommended badge on selected model');
check((await tid('ai-model-picker').innerText()).includes('qwen2.5-coder:7b'), 'coder model selected by default for Section');
await tid('ai-model-picker').click();
await page.waitForSelector('[data-testid="ai-model-option"]');
check((await tid('ai-model-option').count()) === 4, 'picker lists 4 chat models');
check(!(await page.locator('[data-testid="ai-model-option"]', { hasText: 'nomic-embed' }).count()), 'embedding model hidden');
await shot('03-model-picker');
await page.keyboard.press('Escape');

console.log('# mode gating without a selection');
check(await tid('ai-mode-edit').isDisabled(), 'Edit disabled without selection');
check(await tid('ai-mode-animate').isDisabled(), 'Animate disabled without selection');

console.log('# generate a page (Ctrl+Enter) with live preview');
await tid('ai-mode-page').click();
await tid('ai-prompt').fill('Landing page for an AI meeting notes app called Lumen');
await tid('ai-prompt').press('Control+Enter');
await page.waitForSelector('.k-ai-preview', { timeout: 15000 });
await page.waitForFunction(() => (document.querySelector('.k-ai-preview__host')?.shadowRoot?.querySelector('.pv-root')?.innerHTML.length ?? 0) > 200, null, { timeout: 20000 });
await wait(800);
const live = await page.evaluate(() => {
  const host = document.querySelector('.k-ai-preview__host');
  const sr = host?.shadowRoot;
  return { has: !!sr, len: sr?.querySelector('.pv-root')?.innerHTML.length ?? 0, text: sr?.querySelector('.pv-root')?.textContent?.slice(0, 40) };
});
check(live.has && live.len > 100, `live preview streams into a shadow root (${live.len} chars)`);
await shot('04-streaming');
await page.waitForSelector('[data-testid="ai-applied"]', { timeout: 60000 });
await wait(600);
let s = await snap();
check(s.rootChildren.length === 4, `page inserted as 4 sections (header, hero, features, footer) (got ${s.rootChildren.length})`);
check(s.rootStyle.display === 'flex' && s.rootStyle['flex-direction'] === 'column', 'frame became a flex column');
check(s.rootStyle['background-color'] === '#0b1020' || s.rootStyle.background === '#0b1020', 'body styles applied to the frame');
check(s.lastAi === true && /^✨ AI: Landing page/.test(s.lastLabel), `one undo step labelled "${s.lastLabel}"`);
check(s.past === 1, 'exactly one history entry');
await shot('05-page-applied');

console.log('# undo / redo');
await tid('ai-undo').click();
s = await snap();
check(s.rootChildren.length === 0, 'Undo removes the whole page');
await page.evaluate(async () => (await import('/src/core/store/docStore.ts')).useDoc.getState().redo());
s = await snap();
check(s.rootChildren.length === 4, 'Redo restores it');

console.log('# edit selection keeps ids');
const heroId = s.rootChildren[1];
const heroKids = s.nodes[heroId].children.slice();
await select([heroId]);
await tid('ai-mode-edit').click();
await tid('ai-prompt').fill('Make the buttons pill shaped');
const before = s.past;
await runAndWait('[data-testid="ai-applied"]');
await wait(500);
s = await snap();
check(s.past === before + 1, 'edit is one undo step');
check(!!s.nodes[heroId], 'hero node id preserved');
check(heroKids.every((k) => s.nodes[k]), 'child node ids preserved');
check(/border-radius:\s*999px/.test(JSON.stringify(s.nodes[heroKids.find((k) => s.nodes[k].type === 'box' || s.nodes[k].type === 'link') ?? heroKids[0]])) || JSON.stringify(s.nodes).includes('999px'), 'edit visibly changed styles (pill radius)');
await shot('06-edit');

console.log('# animate selection');
await select([heroId]);
await tid('ai-mode-animate').click();
await tid('ai-prompt').fill('Staggered fade-up entrance');
await runAndWait('[data-testid="ai-applied"]');
await wait(900);
s = await snap();
const animated = Object.values(s.nodes).filter((n) => (n.animations ?? []).some((a) => a.presetId === 'ai'));
check(animated.length >= 1, `AI animations attached to ${animated.length} nodes`);
const a0 = animated[0]?.animations.find((a) => a.presetId === 'ai');
check(a0 && a0.keyframes.length >= 2 && a0.duration >= 50 && a0.duration <= 10000, 'animation validated (keyframes, duration range)');
check(a0 && a0.keyframes[0].values.filter === 'blur(6px)', 'blur mapped to filter');
await shot('07-animate');

console.log('# logo / svg with 2 variants');
await select([]);
await tid('ai-mode-svg').click();
await tid('ai-prompt').fill('Logo for Northwind, a sailing analytics startup');
await page.locator('.k-ai-variantsel .k-seg__item', { hasText: '2' }).click();
const pastBeforeSvg = (await snap()).past;
await runAndWait('[data-testid="ai-variants"]');
await wait(500);
check((await tid('ai-variant').count()) === 2, 'two SVG variants offered');
check((await snap()).past === pastBeforeSvg, 'nothing applied before choosing');
await shot('08-variants');
await tid('ai-variant').nth(1).click();
await tid('ai-apply').click();
await wait(700);
s = await snap();
const svgNode = Object.values(s.nodes).find((n) => n.type === 'svg' && /logo/i.test(n.name));
check(!!svgNode && /<svg/.test(svgNode.props.svg) && !/<script/i.test(svgNode.props.svg), 'svg node inserted with sanitized markup');
check(s.lastAi === true && s.past === pastBeforeSvg + 1, 'svg insert is one AI undo step');
await shot('09-logo-applied');

console.log('# animate this logo');
await tid('ai-animate-logo').click();
await page.waitForSelector('[data-testid="ai-applied"]', { timeout: 60000 });
await wait(600);
s = await snap();
check((s.nodes[svgNode.id].animations ?? []).some((a) => a.presetId === 'ai'), 'logo animation attached');

console.log('# cancel mid-stream');
await select([]);
await tid('ai-mode-page').click();
await tid('ai-prompt').fill('Another landing page for testing cancel');
const pastBeforeCancel = (await snap()).past;
const nodesBeforeCancel = (await snap()).nodeCount;
await tid('ai-generate').click();
await page.waitForSelector('[data-testid="ai-cancel"]');
await wait(1200);
await shot('10-before-cancel');
await tid('ai-cancel').click();
await page.waitForSelector('[data-testid="ai-cancelled"]', { timeout: 8000 });
s = await snap();
check(s.past === pastBeforeCancel && s.nodeCount === nodesBeforeCancel, 'cancel leaves the document untouched');
check(await tid('ai-generate').isEnabled(), 'generate usable again after cancel');

console.log('# history re-run list');
check((await page.locator('.k-ai-hist').count()) >= 3, 'session history lists prompts');
await shot('11-final');

console.log('# command: ai.open / Mod+I');
await page.locator('[data-tab="design"]').click();
await page.keyboard.press('Control+i');
await wait(300);
check((await page.locator('[data-tab="ai"]').getAttribute('aria-selected')) === 'true', 'Ctrl+I opens the AI tab');
check(await page.evaluate(() => document.activeElement?.hasAttribute('data-ai-prompt')), 'prompt is focused');

console.log(errors.length ? 'errors:\n' + errors.join('\n') : 'no page errors');
await browser.close();
if (failures || errors.length) {
  console.log(`\n${failures} check(s) failed, ${errors.length} error(s)`);
  process.exit(1);
}
console.log('\nall AI e2e checks passed');
