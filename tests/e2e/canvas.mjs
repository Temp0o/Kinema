// Canvas + layers e2e: drives the editor like a user and screenshots each step.
// Run against the dev server: KINEMA_URL=http://localhost:5174/ node tests/e2e/canvas.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const url = process.env.KINEMA_URL ?? 'http://localhost:5174/';
const out = process.env.OUT ?? new URL('../../test-results/e2e/', import.meta.url).pathname;
import { mkdirSync as _mkdir } from 'node:fs';
_mkdir(out, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1480, height: 920 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});

let failures = 0;
function check(cond, msg) {
  if (cond) console.log('  ok  ', msg);
  else {
    failures++;
    console.log('  FAIL', msg);
  }
}
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

/** Read app state through the dev server's module graph (same instances as the app). */
async function state() {
  return page.evaluate(async () => {
    const { useDoc } = await import('/src/core/store/docStore.ts');
    const { useUI } = await import('/src/core/store/uiStore.ts');
    const d = useDoc.getState();
    const ui = useUI.getState();
    return { doc: d.doc, past: d.past.length, selection: ui.selection, editing: ui.editingTextId, tool: ui.tool, viewport: ui.viewport, root: d.doc.pages[0].rootId };
  });
}
const rootChildren = (s) => s.doc.nodes[s.root].children;

async function canvasBox() {
  return page.locator('.kc-viewport').boundingBox();
}
/** world (frame) px → page client coords */
async function toClient(wx, wy) {
  return page.evaluate(
    async ([x, y]) => {
      const { useUI } = await import('/src/core/store/uiStore.ts');
      const v = useUI.getState().viewport;
      const r = document.querySelector('.kc-viewport').getBoundingClientRect();
      return { x: r.left + v.panX + x * v.zoom, y: r.top + v.panY + y * v.zoom };
    },
    [wx, wy],
  );
}
async function drag(from, to, opts = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: opts.button ?? 'left' });
  const steps = opts.steps ?? 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await wait(16);
  }
  if (opts.hold) await wait(opts.hold);
  await page.mouse.up({ button: opts.button ?? 'left' });
  await wait(80);
}
async function nodeRect(id) {
  return page.evaluate((id) => {
    const el = document.querySelector(`.kc-root [data-kid="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, id);
}
const step = (name) => !only || only.includes(name);

// ─── Start ───────────────────────────────────────────────────────────────────
await page.goto(url);
await wait(600);
await page.getByRole('button', { name: /new project/i }).first().click();
await page.getByRole('button', { name: /create project/i }).click({ timeout: 4000 }).catch(() => {});
await page.waitForSelector('.kc-root [data-kroot]');
await wait(800);
await shot('01-editor');

let s = await state();
check(rootChildren(s).length === 0, 'new project starts empty');

// ─── Draw boxes ─────────────────────────────────────────────────────────────
await page.keyboard.press('b');
s = await state();
check(s.tool === 'box', 'B selects the box tool');
await drag(await toClient(96, 96), await toClient(392, 296));
s = await state();
const boxA = rootChildren(s)[0];
check(!!boxA && s.doc.nodes[boxA].styles.base.width === '296px' && s.doc.nodes[boxA].styles.base.left === '96px', `drawing creates a 300×200 box at 96,96 (${boxA && JSON.stringify(s.doc.nodes[boxA].styles.base)})`);
check(s.tool === 'select', 'tool returns to select after drawing');
check(s.selection[0] === boxA, 'new box is selected');
await shot('02-drawn-box');

// click-insert a default box
await page.keyboard.press('b');
const c2 = await toClient(700, 220);
await page.mouse.click(c2.x, c2.y);
await wait(100);
s = await state();
const boxB = rootChildren(s)[1];
check(!!boxB && s.doc.nodes[boxB].styles.base.width === '240px', 'click with box tool inserts a default box');

// ─── Select / hover / deselect ──────────────────────────────────────────────
const ca = await toClient(200, 150);
await page.mouse.click(ca.x, ca.y);
await wait(60);
s = await state();
check(s.selection.length === 1 && s.selection[0] === boxA, 'click selects box A');
const empty = await toClient(1000, 700);
await page.mouse.click(empty.x, empty.y);
await wait(60);
s = await state();
check(s.selection.length === 0, 'click on empty frame clears selection');
await page.mouse.move(ca.x, ca.y);
await wait(80);
await shot('03-hover');
check((await page.locator('.kc-box--hover').count()) === 1, 'hover outline shown');

// ─── Move with snapping ─────────────────────────────────────────────────────
if (step('move')) {
  // drag A so its left edge lands 3px from B's left edge (B at 580): expect snap to 580
  s = await state();
  const bLeft = parseFloat(s.doc.nodes[boxB].styles.base.left);
  const start = await toClient(200, 150);
  const target = await toClient(200 + (bLeft - 100) + 3, 150 + 264);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await page.mouse.move(start.x + ((target.x - start.x) * i) / 15, start.y + ((target.y - start.y) * i) / 15);
    await wait(16);
  }
  await wait(60);
  await shot('04-move-guides');
  check((await page.locator('.kc-guide').count()) > 0, 'smart guides visible while dragging');
  await page.mouse.up();
  await wait(80);
  s = await state();
  check(parseFloat(s.doc.nodes[boxA].styles.base.left) === bLeft, `move snaps to sibling edge (left=${s.doc.nodes[boxA].styles.base.left})`);
  const pastBefore = s.past;
  await page.keyboard.press('Control+z');
  await wait(60);
  s = await state();
  check(s.doc.nodes[boxA].styles.base.left === '96px' && s.past === pastBefore - 1, 'whole drag undoes in one step');
  await page.keyboard.press('Control+Shift+z');
  await wait(60);

  // Escape cancels a drag
  s = await state();
  const st2 = await toClient(parseFloat(s.doc.nodes[boxA].styles.base.left) + 50, 150);
  await page.mouse.move(st2.x, st2.y);
  await page.mouse.down();
  await page.mouse.move(st2.x + 40, st2.y + 40, { steps: 5 });
  await wait(50);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await wait(60);
  const s3 = await state();
  check(s3.doc.nodes[boxA].styles.base.left === s.doc.nodes[boxA].styles.base.left, 'Escape cancels a drag');
}

// ─── Resize ─────────────────────────────────────────────────────────────────
if (step('resize')) {
  await page.mouse.click(empty.x, empty.y);
  s = await state();
  const r = s.doc.nodes[boxA].styles.base;
  const L = parseFloat(r.left), T = parseFloat(r.top);
  const cc = await toClient(L + 50, T + 50);
  await page.mouse.click(cc.x, cc.y);
  await wait(80);
  const se = await page.locator('.kc-handle[data-handle="se"]').boundingBox();
  check(!!se, 'resize handles visible');
  await shot('05-selected-handles');
  await drag({ x: se.x + 4, y: se.y + 4 }, { x: se.x + 4 + 60 * s.viewport.zoom, y: se.y + 4 + 40 * s.viewport.zoom });
  s = await state();
  const rw0 = parseFloat(s.doc.nodes[boxA].styles.base.width), rh0 = parseFloat(s.doc.nodes[boxA].styles.base.height);
  check(Math.abs(rw0 - 356) <= 8 && Math.abs(rh0 - 240) <= 8, `se resize → ${rw0}×${rh0}`);
  // nw with shift keeps aspect
  const nw = await page.locator('.kc-handle[data-handle="nw"]').boundingBox();
  await page.keyboard.down('Shift');
  await drag({ x: nw.x + 4, y: nw.y + 4 }, { x: nw.x + 4 - 36 * s.viewport.zoom, y: nw.y + 4 });
  await page.keyboard.up('Shift');
  s = await state();
  const w = parseFloat(s.doc.nodes[boxA].styles.base.width), h = parseFloat(s.doc.nodes[boxA].styles.base.height);
  check(Math.abs(w / h - rw0 / rh0) < 0.02, `shift resize keeps aspect (${w}×${h})`);
}

// ─── Rotate ─────────────────────────────────────────────────────────────────
if (step('rotate')) {
  const zone = await page.locator('.kc-rotate-zone[data-rotate="ne"]').boundingBox();
  const sel = await nodeRect(boxA);
  const cx = sel.x + sel.w / 2, cy = sel.y + sel.h / 2;
  const sx = zone.x + zone.width / 2, sy = zone.y + zone.height / 2;
  // rotate ~30° clockwise around the center with shift (snaps to 15° steps)
  const ang = Math.atan2(sy - cy, sx - cx) + (31 * Math.PI) / 180;
  const rad = Math.hypot(sx - cx, sy - cy);
  await page.keyboard.down('Shift');
  await drag({ x: sx, y: sy }, { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad }, { steps: 10 });
  await page.keyboard.up('Shift');
  s = await state();
  check(s.doc.nodes[boxA].styles.base.rotate === '30deg', `rotate with shift snaps to 15° (${s.doc.nodes[boxA].styles.base.rotate})`);
  await shot('06-rotated');
}

// ─── Marquee ────────────────────────────────────────────────────────────────
if (step('marquee')) {
  const a = await toClient(40, 40);
  const b = await toClient(1300, 560);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await wait(60);
  await shot('07-marquee');
  await page.mouse.up();
  await wait(60);
  s = await state();
  check(s.selection.length === 2, `marquee selects both boxes (${s.selection.length})`);
  await shot('08-multi-select');
}

// ─── Text tool + editing ────────────────────────────────────────────────────
if (step('text')) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  const tp = await toClient(120, 620);
  await page.mouse.click(tp.x, tp.y);
  await wait(120);
  s = await state();
  check(!!s.editing, 'text tool starts editing immediately');
  await page.keyboard.type('Hello');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Kinema world');
  await shot('09-text-editing');
  const pastBefore = s.past;
  await page.keyboard.press('Escape');
  await wait(80);
  s = await state();
  const textId = rootChildren(s).find((id) => s.doc.nodes[id].type === 'text');
  check(textId && s.doc.nodes[textId].props.text === 'Hello<br>Kinema world', `text committed: ${textId && s.doc.nodes[textId].props.text}`);
  check(s.past === pastBefore + 1, 'text creation + edit is one history entry');
  // double-click to edit existing text
  const tr = await nodeRect(textId);
  await page.mouse.dblclick(tr.x + 10, tr.y + 8);
  await wait(100);
  s = await state();
  check(s.editing === textId, 'double-click edits text');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('!');
  await page.mouse.click(empty.x, empty.y);
  await wait(80);
  s = await state();
  check(!s.editing && /!$/.test(s.doc.nodes[textId].props.text), 'click outside commits the edit');
  // global shortcuts must not fire while typing
  await page.mouse.dblclick(tr.x + 10, tr.y + 8);
  await wait(80);
  await page.keyboard.type('b');
  s = await state();
  check(s.tool === 'select', 'typing "b" while editing does not switch tools');
  await page.keyboard.press('Escape');
  await wait(60);
}

// ─── Copy / paste ───────────────────────────────────────────────────────────
if (step('clipboard')) {
  const ca2 = await toClient(700, 220);
  await page.mouse.click(ca2.x, ca2.y);
  await wait(60);
  s = await state();
  const n0 = rootChildren(s).length;
  await page.keyboard.press('Control+c');
  await wait(60);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(clip.includes('"kinema":"nodes"'), 'system clipboard holds tagged JSON');
  await page.keyboard.press('Control+v');
  await wait(200);
  s = await state();
  check(rootChildren(s).length === n0 + 1, 'paste adds a copy');
  const pasted = s.selection[0];
  check(pasted && s.doc.nodes[pasted].styles.base.left !== s.doc.nodes[boxB].styles.base.left, 'pasted copy is offset from the original');
  // plain text paste → text node
  await page.evaluate(() => navigator.clipboard.writeText('Pasted words'));
  await page.mouse.click(empty.x, empty.y);
  await page.keyboard.press('Control+v');
  await wait(200);
  s = await state();
  const tn = s.selection[0];
  check(tn && s.doc.nodes[tn].type === 'text' && s.doc.nodes[tn].props.text === 'Pasted words', 'plain text paste creates a text node');
  // svg paste
  await page.evaluate(() => navigator.clipboard.writeText('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" onclick="alert(1)"/></svg>'));
  await page.keyboard.press('Control+v');
  await wait(200);
  s = await state();
  const sv = s.selection[0];
  check(sv && s.doc.nodes[sv].type === 'svg' && !s.doc.nodes[sv].props.svg.includes('onclick'), 'svg paste creates a sanitized svg node');
  await shot('10-pasted');
  // undo a couple
  await page.keyboard.press('Control+z');
  await wait(60);
  s = await state();
  check(!s.doc.nodes[sv], 'undo removes the pasted svg');

  // History: jump back several steps, then forward again
  const pastBefore = s.past;
  const nodesBefore = Object.keys(s.doc.nodes).length;
  await page.locator('[data-testid="history-button"]').click();
  await page.locator('[data-testid="history"]').waitFor();
  const rows = page.locator('[data-testid="history"] [role="option"]');
  check((await rows.count()) === pastBefore + 2, 'history lists every step, the undone one, and “Opened project”');
  check((await rows.nth(pastBefore).getAttribute('data-current')) !== null, 'current step is highlighted');
  await wait(300);
  await shot('10b-history');
  await rows.nth(pastBefore - 3).click();
  await wait(80);
  s = await state();
  check(s.past === pastBefore - 3, 'clicking a step jumps back to it');
  await rows.nth(pastBefore).click();
  await wait(80);
  s = await state();
  check(s.past === pastBefore && Object.keys(s.doc.nodes).length === nodesBefore, 'clicking a later step redoes up to it');
  await page.keyboard.press('Escape');
  await wait(80);
}

// ─── Context menu ───────────────────────────────────────────────────────────
if (step('menu')) {
  const ca3 = await toClient(700, 220);
  await page.mouse.click(ca3.x, ca3.y, { button: 'right' });
  await wait(150);
  await shot('11-context-menu');
  check(await page.getByRole('menuitem', { name: /Duplicate/ }).isVisible(), 'context menu opens with Duplicate');
  await page.keyboard.press('Escape');
  await wait(80);
}

// ─── Zoom commands ──────────────────────────────────────────────────────────
if (step('zoom')) {
  s = await state();
  const z0 = s.viewport.zoom;
  await page.mouse.move(empty.x, empty.y);
  await page.keyboard.press('Control+=');
  await wait(60);
  const z1 = (await state()).viewport.zoom;
  check(z1 > z0, `Mod+= zooms in (${z0} → ${z1})`);
  await page.keyboard.press('Shift+1');
  await wait(60);
  check((await state()).viewport.zoom <= 1, 'Shift+1 fits');
}

// ─── Root frame height ──────────────────────────────────────────────────────
if (step('height')) {
  const hb = await page.locator('.kc-frame-handle').boundingBox();
  check(!!hb, 'frame height handle present');
  if (hb) {
    s = await state();
    const before = s.doc.nodes[s.root].styles.base['min-height'];
    await drag({ x: hb.x + hb.width / 2, y: hb.y + 5 }, { x: hb.x + hb.width / 2, y: hb.y + 5 + 100 * s.viewport.zoom });
    s = await state();
    check(s.doc.nodes[s.root].styles.base['min-height'] === '1000px', `frame min-height ${before} → ${s.doc.nodes[s.root].styles.base['min-height']}`);
  }
}

// ─── Flow layouts: reorder + reparent ───────────────────────────────────────
if (step('flow')) {
  const ids = await page.evaluate(async () => {
    const { createNode } = await import('/src/core/model/factory.ts');
    const { addSubtree, currentRootId } = await import('/src/core/store/actions.ts');
    const row = createNode('box', { name: 'Row', styles: { position: 'absolute', left: '80px', top: '700px', width: '600px', height: '140px', display: 'flex', gap: '16px', padding: '16px', 'background-color': '#f1f1f6' } });
    const kids = ['A', 'B', 'C'].map((n) => createNode('box', { name: n, styles: { width: '120px', height: '100px', 'background-color': '#c7c2ff' } }));
    const nodes = { [row.id]: row };
    for (const k of kids) {
      k.parent = row.id;
      row.children.push(k.id);
      nodes[k.id] = k;
    }
    addSubtree({ rootId: row.id, nodes }, currentRootId());
    return { row: row.id, kids: kids.map((k) => k.id) };
  });
  await page.keyboard.press('Shift+2');
  await wait(150);
  // drag A (click selects Row first; Ctrl-click/deep select the child)
  const ra = await nodeRect(ids.kids[0]);
  const rc = await nodeRect(ids.kids[2]);
  await page.keyboard.down('Control');
  await page.mouse.click(ra.x + 20, ra.y + 20);
  await page.keyboard.up('Control');
  await page.mouse.move(ra.x + 20, ra.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(ra.x + 20 + ((rc.x + rc.w * 0.8 - ra.x - 20) * i) / 12, ra.y + 30);
    await wait(16);
  }
  await wait(50);
  await shot('15-flow-reorder');
  check((await page.locator('.kc-insert').count()) === 1, 'insertion indicator shown in flex row');
  await page.mouse.up();
  await wait(80);
  s = await state();
  check(JSON.stringify(s.doc.nodes[ids.row].children) === JSON.stringify([ids.kids[1], ids.kids[2], ids.kids[0]]), 'drag reorders within a flex row');
  // drag the freeform text into the row → becomes a flow child
  const textId = rootChildren(s).find((id) => s.doc.nodes[id].type === 'text' && s.doc.nodes[id].styles.base.position === 'absolute');
  if (textId) {
    await page.keyboard.press('Shift+1');
    await wait(100);
    const tr = await nodeRect(textId);
    const rr = await nodeRect(ids.row);
    const tcx = tr.x + tr.w / 2, tcy = tr.y + tr.h / 2;
    await page.mouse.click(tcx, tcy);
    await page.mouse.move(tcx, tcy);
    await page.mouse.down();
    for (let i = 1; i <= 14; i++) {
      await page.mouse.move(tcx + ((rr.x + rr.w - 20 - tcx) * i) / 14, tcy + ((rr.y + rr.h / 2 - tcy) * i) / 14);
      await wait(16);
    }
    await wait(50);
    await shot('16-reparent');
    await page.mouse.up();
    await wait(80);
    s = await state();
    if (s.doc.nodes[textId].parent !== ids.row) console.log('    debug', JSON.stringify({ sel: s.selection, textId, parent: s.doc.nodes[textId].parent, st: s.doc.nodes[textId].styles.base, tr, rr }));
    check(s.doc.nodes[textId].parent === ids.row && !s.doc.nodes[textId].styles.base.position, 'dragging into a flex container reparents as a flow child');
  }
}

// ─── Layers perf (1000 nodes) ───────────────────────────────────────────────
if (step('perf')) {
  const ms = await page.evaluate(async () => {
    const { createNode } = await import('/src/core/model/factory.ts');
    const { addSubtree, currentRootId } = await import('/src/core/store/actions.ts');
    const { useLayers } = await import('/src/features/layers/layersStore.ts');
    const wrap = createNode('box', { name: 'Many', styles: { display: 'flex', 'flex-wrap': 'wrap', width: '1200px', position: 'absolute', left: '0px', top: '1400px' } });
    const nodes = { [wrap.id]: wrap };
    for (let i = 0; i < 1000; i++) {
      const n = createNode('box', { name: `Item ${i}`, styles: { width: '20px', height: '20px' } });
      n.parent = wrap.id;
      wrap.children.push(n.id);
      nodes[n.id] = n;
    }
    addSubtree({ rootId: wrap.id, nodes }, currentRootId());
    useLayers.getState().expandMany([wrap.id]);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const { setStyle } = await import('/src/core/store/actions.ts');
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      setStyle([wrap.children[i]], 'width', `${21 + i}px`, { coalesce: false });
      await new Promise((r) => requestAnimationFrame(r));
    }
    return (performance.now() - t0) / 20;
  });
  check(ms < 40, `edits stay fast with 1000 nodes (${ms.toFixed(1)} ms/frame)`);
  check((await page.locator('.kl-row').count()) < 120, 'layers tree is virtualized');
  await page.evaluate(async () => {
    const { useDoc } = await import('/src/core/store/docStore.ts');
    for (let i = 0; i < 21; i++) useDoc.getState().undo();
  });
  await wait(100);
}

// ─── Layers panel ───────────────────────────────────────────────────────────
if (step('layers')) {
  const rows = page.locator('.kl-row');
  const count = await rows.count();
  check(count >= 3, `layers panel lists nodes (${count} rows)`);
  await shot('12-layers');
  s = await state();
  // click a row selects
  const firstId = rootChildren(s)[0];
  await page.locator(`.kl-row[data-id="${firstId}"]`).click();
  await wait(60);
  s = await state();
  check(s.selection[0] === firstId, 'clicking a layer row selects the node');
  // rename inline
  await page.locator(`.kl-row[data-id="${firstId}"] .kl-name`).dblclick();
  await page.keyboard.type('Hero card');
  await page.keyboard.press('Enter');
  await wait(60);
  s = await state();
  check(s.doc.nodes[firstId].name === 'Hero card', 'inline rename');
  // hide toggle
  await page.locator(`.kl-row[data-id="${firstId}"]`).hover();
  await page.locator(`.kl-row[data-id="${firstId}"] [data-action="hide"]`).click();
  await wait(60);
  s = await state();
  check(s.doc.nodes[firstId].hidden === true, 'eye toggle hides');
  await page.keyboard.press('Control+z');
  // drag reorder: move first row below the last
  const last = rootChildren(s)[rootChildren(s).length - 1];
  const fr = await page.locator(`.kl-row[data-id="${firstId}"]`).boundingBox();
  const lr = await page.locator(`.kl-row[data-id="${last}"]`).boundingBox();
  await drag({ x: fr.x + 60, y: fr.y + fr.height / 2 }, { x: lr.x + 60, y: lr.y + 3 }, { steps: 10 });
  s = await state();
  const kids = rootChildren(s);
  check(kids[kids.length - 2] === firstId, 'drag in layers reorders (before last)');
  await shot('13-layers-after');
  // pages
  await page.locator('[data-action="add-page"]').click();
  await wait(200);
  s = await state();
  check(s.doc.pages.length === 2, 'add page');
  await shot('14-pages');
}

// ─── Shortcut customisation ─────────────────────────────────────────────────
{
  const eff = (id) =>
    page.evaluate(async (id) => {
      const k = await import('/src/features/shortcuts/shortcuts.ts');
      return k.effectiveShortcut(id) ?? null;
    }, id);
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const { useUI } = await import('/src/core/store/uiStore.ts');
    useUI.getState().set({ shortcutsOpen: true });
  });
  await page.locator('[data-testid="shortcuts-search"]').waitFor();
  await page.locator('[data-testid="shortcuts-search"]').fill('duplicate');
  await page.locator('[data-testid="shortcut-edit.duplicate"]').click();
  await page.locator('[data-testid="shortcut-recording"]').waitFor();
  await page.keyboard.press('Control+Shift+J');
  await wait(100);
  check((await eff('edit.duplicate')) === 'Mod+Shift+J', 'click a shortcut and press keys to rebind it');
  // conflict: taking Ctrl+Z asks first; Cancel keeps both as they were
  await page.locator('[data-testid="shortcut-edit.duplicate"]').click();
  await page.keyboard.press('Control+z');
  await wait(100);
  check(await page.getByRole('alert').filter({ hasText: 'Undo' }).isVisible(), 'a combo used by another command asks before replacing');
  await shot('15-shortcut-conflict');
  await page.getByRole('button', { name: 'Cancel' }).click();
  check((await eff('edit.duplicate')) === 'Mod+Shift+J' && (await eff('edit.undo')) === 'Mod+Z', 'cancel leaves both shortcuts unchanged');
  // Escape while recording cancels recording, not the dialog
  await page.locator('[data-testid="shortcut-edit.duplicate"]').click();
  await page.keyboard.press('Escape');
  await wait(100);
  check(await page.locator('[data-testid="shortcuts-search"]').isVisible(), 'Escape cancels recording without closing the dialog');
  await page.locator('[data-testid="shortcut-edit.duplicate"]').click();
  await page.locator('[data-testid="shortcuts-search"]').click();
  await page.keyboard.type('und');
  check((await page.locator('[data-testid="shortcut-recording"]').count()) === 0 && (await eff('edit.duplicate')) === 'Mod+Shift+J', 'clicking elsewhere stops recording (typing is not captured)');
  await page.locator('[data-testid="shortcuts-search"]').fill('');
  await page.keyboard.press('Escape'); // close dialog
  await wait(150);
  // the new combo works on the canvas
  const before = (await state()).past;
  const anyNode = await page.evaluate(async () => {
    const { useDoc } = await import('/src/core/store/docStore.ts');
    const { useUI } = await import('/src/core/store/uiStore.ts');
    const d = useDoc.getState().doc;
    const id = d.nodes[d.pages[0].rootId].children[0];
    useUI.getState().select([id]);
    return id;
  });
  await page.locator('.kc-viewport').hover();
  await page.keyboard.press('Control+Shift+J');
  await wait(150);
  check(!!anyNode && (await state()).past === before + 1, 'the rebound shortcut runs the command');
  await page.evaluate(async () => {
    const { useUI } = await import('/src/core/store/uiStore.ts');
    useUI.getState().set({ shortcutsOpen: true });
  });
  await page.locator('[data-testid="shortcuts-reset-all"]').click();
  check((await eff('edit.duplicate')) === 'Mod+D', 'reset all restores the defaults');
  await page.keyboard.press('Escape');
}

console.log(errors.length ? errors.join('\n') : 'no console errors');
console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
await browser.close();
process.exit(failures ? 1 : 0);
