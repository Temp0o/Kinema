// E2E: animation system — preset browser hover previews, apply, timing edits,
// timeline scrub / bar drag, play all. Run against `npx vite --port 5177`.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const url = process.env.KINEMA_URL ?? 'http://localhost:5177/';
const out = process.env.OUT ?? new URL('../../test-results/e2e/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1480, height: 920 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  // the optional local AI check is refused here (no Ollama in this suite)
  if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text())) errors.push('console: ' + m.text());
});
const results = [];
const check = (name, ok, extra = '') => {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  console.log(results[results.length - 1]);
};
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });

await page.goto(url);
await page.waitForTimeout(600);
await page.getByRole('button', { name: /new project/i }).first().click();
await page.getByRole('button', { name: /create project/i }).click({ timeout: 4000 }).catch(() => {});
await page.waitForFunction(() => !!window.__kinemaAnimDev && document.querySelector('.kc-root'));

// Build a small scene through the dev hook (the Insert UI is owned by another module).
const ids = await page.evaluate(() => {
  const { actions, useUI, useDoc } = window.__kinemaAnimDev;
  const root = actions.currentRootId();
  useUI.getState().select([]);
  const mk = (type, styles, props, parent) => {
    useUI.getState().select(parent ? [parent] : []);
    const id = actions.insertNewNode(type, { styles, props });
    return id;
  };
  const hero = mk('box', { position: 'absolute', left: '120px', top: '120px', width: '280px', height: '180px', 'background-color': '#7c5cff', 'border-radius': '20px' });
  const row = mk('box', { position: 'absolute', left: '480px', top: '120px', width: '420px', height: '120px', display: 'flex', gap: '16px', 'align-items': 'center', 'justify-content': 'center', 'background-color': '#eef0ff' });
  for (let i = 0; i < 4; i++) mk('box', { width: '64px', height: '64px', 'background-color': '#22d3ee', 'border-radius': '14px' }, undefined, row);
  const icon = mk('svg', { position: 'absolute', left: '980px', top: '120px', width: '140px', height: '140px', color: '#7c5cff' });
  useUI.getState().select([hero]);
  useUI.getState().set({ rightTab: 'animate' });
  return { hero, row, icon, root, n: Object.keys(useDoc.getState().doc.nodes).length };
});
await page.waitForTimeout(300);
await shot('01-empty-node');

// Open preset browser
await page.getByTestId('anim-add').click();
await page.waitForSelector('[data-testid="preset-browser"]');
await page.waitForTimeout(900);
await shot('02-browser');

const animCount = (id) => page.evaluate((id) => document.querySelector(`.kc-root [data-kid="${id}"]`)?.getAnimations().length ?? -1, id);

// Hover preview on canvas
await page.hover('[data-preset="pop"]');
await page.waitForTimeout(250);
const hoverCount = await animCount(ids.hero);
check('hover preview animates canvas element', hoverCount > 0, `animations=${hoverCount}`);
await shot('03-hover-preview');
await page.hover('[data-preset="fade-up"]');
await page.waitForTimeout(150);
const swapCount = await animCount(ids.hero);
check('hovering another card swaps the preview', swapCount === 1, `animations=${swapCount}`);
await page.mouse.move(700, 800);
await page.waitForTimeout(150);
const after = await animCount(ids.hero);
const residue = await page.evaluate((id) => document.querySelector(`.kc-root [data-kid="${id}"]`).getAttribute('style'), ids.hero);
check('preview leaves no residue', after === 0 && !/transform|opacity/.test(residue), `animations=${after}`);

// Apply
await page.click('[data-preset="pop"]');
await page.waitForTimeout(150);
const applied = await page.evaluate((id) => window.__kinemaAnimDev.useDoc.getState().doc.nodes[id].animations?.map((a) => a.name), ids.hero);
check('click applies preset', applied?.[0] === 'Pop', JSON.stringify(applied));
const replay = await animCount(ids.hero);
check('applied animation replays', replay > 0, `animations=${replay}`);
await page.waitForTimeout(1200);
await shot('04-applied-editor');

// Edit timing: duration field → replays
const durInput = page.locator('[data-testid="anim-editor"] .k-num').first().locator('input');
void durInput;
// Scrub the duration label 40px right (step 10ms/px). (Typed values can't commit
// under the app CSP: NumberField's evalMath uses Function(), see report.)
const durLabel = page.locator('[data-testid="anim-editor"] .k-num__label').first();
const lb = await durLabel.boundingBox();
await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
await page.mouse.down();
await page.mouse.move(lb.x + lb.width / 2 + 20, lb.y + lb.height / 2, { steps: 4 });
await page.mouse.move(lb.x + lb.width / 2 + 40, lb.y + lb.height / 2, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(400);
const dur = await page.evaluate((id) => window.__kinemaAnimDev.useDoc.getState().doc.nodes[id].animations[0].duration, ids.hero);
check('duration edit applies', dur === 1200, `duration=${dur}`);
const replayAfterEdit = await animCount(ids.hero);
check('edit replays on canvas', replayAfterEdit > 0, `animations=${replayAfterEdit}`);
// undo the edit
await page.evaluate(() => window.__kinemaAnimDev.useDoc.getState().undo());
const durUndo = await page.evaluate((id) => window.__kinemaAnimDev.useDoc.getState().doc.nodes[id].animations[0].duration, ids.hero);
check('undo reverts duration', durUndo === 800, `duration=${durUndo}`);

// Stagger on the row + draw-on on the svg
await page.evaluate(({ row, icon }) => {
  const { useUI } = window.__kinemaAnimDev;
  useUI.getState().select([row]);
}, ids);
await page.getByTestId('anim-add').click();
await page.click('[role="tab"]:has-text("Stagger")');
await page.click('[data-preset="stagger-fade-up"]');
await page.evaluate(({ icon }) => window.__kinemaAnimDev.useUI.getState().select([icon]), ids);
await page.getByTestId('anim-add').click();
await page.click('[role="tab"]:has-text("SVG")');
await page.waitForTimeout(500);
await shot('05-svg-presets');
await page.click('[data-preset="svg-draw"]');
await page.waitForTimeout(300);
const svgMarkup = await page.evaluate((id) => window.__kinemaAnimDev.useDoc.getState().doc.nodes[id].props.svg, ids.icon);
check('svg draw-on adds pathLength', /pathLength="1"/.test(svgMarkup));
await page.waitForTimeout(700);
await shot('06-svg-drawing');

// Keyframe editing: select the first keyframe in the strip, add a property
await page.locator('.k-anim-strip__kf').first().click();
await page.waitForSelector('[data-testid="kf-editor"]');
await shot('07-keyframe-editor');

// Timeline
await page.evaluate(({ hero }) => window.__kinemaAnimDev.useUI.getState().select([hero]), ids);
await page.locator('.kc-viewport').click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
await page.keyboard.press('Alt+t');
await page.waitForSelector('[data-testid="timeline"]');
await page.waitForTimeout(300);
await shot('08-timeline');

const ruler = await page.getByTestId('tl-ruler').boundingBox();
await page.mouse.move(ruler.x + 60, ruler.y + 10);
await page.mouse.down();
await page.mouse.move(ruler.x + 120, ruler.y + 10, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(100);
const scrubState = await page.evaluate(() => {
  const { usePlayback, engine } = window.__kinemaAnimDev;
  return { time: usePlayback.getState().time, paused: usePlayback.getState().paused, info: engine.sessionInfo() };
});
check('scrubbing holds a paused session', scrubState.paused && scrubState.time > 0 && scrubState.info?.animations > 0, JSON.stringify(scrubState));
const midOpacity = await page.evaluate((id) => getComputedStyle(document.querySelector(`.kc-root [data-kid="${id}"]`)).opacity, ids.hero);
await shot('09-scrubbed');

// Drag the hero bar right by 100px
const bar = page.locator(`[data-testid="tl-bar"][data-anim]`).first();
const bb = await bar.boundingBox();
const before = await page.evaluate(() => window.__kinemaAnimDev.useDoc.getState().past.length);
await page.mouse.move(bb.x + bb.width / 2 + 8, bb.y + bb.height / 2 - 6);
await page.mouse.down();
await page.mouse.move(bb.x + bb.width / 2 + 60, bb.y + bb.height / 2 - 6, { steps: 6 });
await page.mouse.move(bb.x + bb.width / 2 + 108, bb.y + bb.height / 2 - 6, { steps: 6 });
await page.mouse.up();
const dragRes = await page.evaluate(({ hero }) => {
  const s = window.__kinemaAnimDev.useDoc.getState();
  const animsAll = Object.values(s.doc.nodes).flatMap((n) => n.animations ?? []);
  return { past: s.past.length, label: s.past[s.past.length - 1]?.label, delays: animsAll.map((a) => a.delay), heroDelay: s.doc.nodes[hero].animations[0].delay };
}, ids);
check('bar drag changes delay in one history step', dragRes.past === before + 1 && dragRes.delays.some((d) => d > 0), JSON.stringify(dragRes));
await shot('10-bar-dragged');

// Keyframe diamond: click selects, then drag
const kf = page.locator('.k-tl__bar .k-tl__kf').nth(1);
const kb = await kf.boundingBox();
await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2);
await page.mouse.down();
await page.mouse.move(kb.x - 30, kb.y + kb.height / 2, { steps: 6 });
await shot('11-kf-drag');
await page.mouse.up();
const kfSel = await page.evaluate(() => window.__kinemaAnimDev.usePlayback.getState().selectedKeyframe);
check('keyframe click/drag selects it', !!kfSel, JSON.stringify(kfSel));

// Expand property tracks
await page.locator('.k-tl__chev').first().click();
await page.waitForTimeout(150);
await shot('12-expanded');

// Play all
await page.keyboard.press('Escape');
await page.locator('.k-titlebar__play').click();
await page.waitForTimeout(350);
const playing = await page.evaluate(() => ({ playing: window.__kinemaAnimDev.usePlayback.getState().playing, info: window.__kinemaAnimDev.engine.sessionInfo() }));
check('play all runs every animation', playing.playing && playing.info?.entries >= 3, JSON.stringify(playing));
await shot('13-playing');
await page.waitForTimeout(3200);
const ended = await page.evaluate(() => window.__kinemaAnimDev.usePlayback.getState().playing);
check('playback ends and stops by itself', !ended);
const anyLeft = await page.evaluate(() => [...document.querySelectorAll('.kc-root *')].some((e) => e.getAnimations().length));
check('no animations left on canvas after stop', !anyLeft);

// No selection → page overview
await page.evaluate(() => window.__kinemaAnimDev.useUI.getState().select([]));
await page.waitForTimeout(150);
await shot('14-page-overview');

// Light theme pass
await page.evaluate(() => window.__kinemaAnimDev.useUI.getState().set({ theme: 'light' }));
await page.evaluate(({ hero }) => window.__kinemaAnimDev.useUI.getState().select([hero]), ids);
await page.waitForTimeout(200);
await shot('15-light');

// One-click choreography for the whole page (Animate workspace, nothing selected)
await page.evaluate(() => {
  const { useUI } = window.__kinemaAnimDev;
  useUI.getState().select([]);
  useUI.getState().set({ mode: 'animate' });
});
await page.waitForTimeout(300);
const choreo = page.locator('[data-testid="choreo"]').first();
check('page choreography offered in the Animate inspector', (await choreo.count()) === 1);
const pastBeforeChoreo = await page.evaluate(() => window.__kinemaAnimDev.useDoc.getState().past.length);
await choreo.locator('[data-choreo="cascade"]').click();
await page.waitForTimeout(250);
const choreoState = await page.evaluate((ids) => {
  const d = window.__kinemaAnimDev.useDoc.getState();
  const kids = d.doc.nodes[ids.row].children;
  return {
    past: d.past.length,
    rowKids: kids.map((k) => (d.doc.nodes[k].animations ?? []).filter((a) => a.trigger === 'inView').map((a) => a.delay)),
  };
}, ids);
check('choreography is one undo step', choreoState.past === pastBeforeChoreo + 1, `past ${pastBeforeChoreo}→${choreoState.past}`);
check('every item in the row gets a cascading entrance', choreoState.rowKids.every((d) => d.length === 1) && choreoState.rowKids.map((d) => d[0]).every((v, i, a) => i === 0 || v > a[i - 1]), JSON.stringify(choreoState.rowKids));
check('choreography plays right away', (await animCount(await page.evaluate((ids) => window.__kinemaAnimDev.useDoc.getState().doc.nodes[ids.row].children[1], ids))) > 0);
await shot('16-choreography');
await page.keyboard.press('Control+z');
await page.waitForTimeout(150);
check('undo removes the choreography', await page.evaluate((ids) => window.__kinemaAnimDev.useDoc.getState().doc.nodes[ids.row].children.every((k) => !(window.__kinemaAnimDev.useDoc.getState().doc.nodes[k].animations ?? []).length), ids));

console.log(`${results.filter((r) => r.startsWith('PASS')).length}/${results.length} checks passed`);
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
