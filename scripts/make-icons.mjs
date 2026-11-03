// Renders the Kinema logo mark to PNGs with headless Chromium and packs a
// multi-resolution Windows .ico (PNG-compressed entries).
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none">
  <defs><linearGradient id="kg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
    <stop stop-color="#B49BFF"/><stop offset="0.45" stop-color="#7C5CFF"/><stop offset="1" stop-color="#22D3EE"/></linearGradient></defs>
  <rect width="32" height="32" rx="9" fill="url(#kg)"/>
  <rect x="8" y="7" width="4.2" height="18" rx="2.1" fill="#fff"/>
  <path d="M13.5 16.2 L21.6 8.1" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M15.4 15.4 L22.6 24.2" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/>
  <path d="M24.5 12.2 L26 10.7" stroke="#fff" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>
  <path d="M25.6 20.6 L26.8 22.1" stroke="#fff" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>
</svg>`;

mkdirSync('build', { recursive: true });
writeFileSync('build/icon.svg', svg(512));
const browser = await chromium.launch();
const page = await browser.newPage();
const pngs = {};
for (const size of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`);
  pngs[size] = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
writeFileSync('build/icon.png', pngs[512]);
writeFileSync('build/icon@2x.png', pngs[1024]);

// ICO: header (6) + entries (16 each) + PNG data
const sizes = [16, 24, 32, 48, 64, 128, 256];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
const entries = [];
let offset = 6 + 16 * sizes.length;
for (const s of sizes) {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0);
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[s].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[s].length;
  entries.push(e);
}
writeFileSync('build/icon.ico', Buffer.concat([header, ...entries, ...sizes.map((s) => pngs[s])]));
console.log('icons written');
