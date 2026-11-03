import type { CatalogItem } from '../types';
import { icon } from '../icons';
import { EASE, HAIRLINE, MESH_COOL, MESH_MINT, MESH_WARM, R_LG, R_SM, R_XL, SHADOW_LG, SHADOW_SM, tint } from '../snippets';

const SLOT = (sel: string, h: number) =>
  `${sel} { min-height: ${h}px; border-radius: ${R_SM}; background-color: ${tint(7)}; border: 1px dashed ${tint(28)}; }`;

function grid(cols: number): CatalogItem {
  const cells = Array.from({ length: cols * 2 }, () => '<div class="grid-cell"></div>').join('');
  return {
    id: `grid-${cols}`,
    name: `Grid · ${cols} columns`,
    category: 'layout',
    keywords: ['grid', 'columns', `${cols} columns`, 'layout', 'responsive'],
    width: 960,
    html: `<div class="grid" data-name="Grid ${cols} columns">${cells}</div>`,
    css: `.grid { display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: 24px; width: 100%; max-width: 1120px; }
${SLOT('.grid-cell', cols === 4 ? 120 : 160)}
@media (max-width: 1024px) { .grid { grid-template-columns: repeat(${Math.min(cols, 2)}, minmax(0, 1fr)); gap: 20px; } }
@media (max-width: 640px) { .grid { grid-template-columns: minmax(0, 1fr); gap: 16px; } }`,
  };
}

export const LAYOUT: CatalogItem[] = [
  {
    id: 'stack-vertical',
    name: 'Vertical stack',
    category: 'layout',
    keywords: ['stack', 'column', 'flex', 'vertical', 'vstack', 'auto layout'],
    width: 360,
    html: `<div class="stack" data-name="Vertical stack"><div class="stack-item"></div><div class="stack-item"></div><div class="stack-item"></div></div>`,
    css: `.stack { display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 360px; }
${SLOT('.stack-item', 64)}`,
  },
  {
    id: 'stack-horizontal',
    name: 'Horizontal row',
    category: 'layout',
    keywords: ['row', 'flex', 'horizontal', 'hstack', 'inline', 'auto layout'],
    width: 560,
    html: `<div class="row" data-name="Horizontal row"><div class="row-item"></div><div class="row-item"></div><div class="row-item"></div></div>`,
    css: `.row { display: flex; flex-direction: row; align-items: stretch; gap: 16px; width: 100%; max-width: 560px; }
${SLOT('.row-item', 96)}
.row-item { flex: 1; }
@media (max-width: 640px) { .row { flex-direction: column; } }`,
  },
  grid(2),
  grid(3),
  grid(4),
  {
    id: 'section',
    name: 'Section container',
    category: 'layout',
    keywords: ['section', 'container', 'wrapper', 'full width', 'max width', 'centered'],
    width: 1280,
    html: `<section class="section" data-name="Section"><div class="section-inner"><span class="section-eyebrow">Section</span><h2 class="section-title">A focused section headline</h2><p class="section-text">Sections span the full width of the page while the inner container keeps content centered at a comfortable reading width.</p></div></section>`,
    css: `.section { width: 100%; padding: 96px 24px; background-color: var(--k-background); }
.section-inner { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; max-width: 1120px; margin: 0 auto; }
.section-eyebrow { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--k-primary); }
.section-title { max-width: 640px; font-size: 40px; line-height: 1.1; letter-spacing: -0.03em; }
.section-text { max-width: 560px; font-size: 18px; line-height: 1.6; color: var(--k-muted); }
@media (max-width: 1024px) { .section { padding: 72px 24px; } .section-title { font-size: 34px; } }
@media (max-width: 640px) { .section { padding: 56px 20px; } .section-title { font-size: 28px; } .section-text { font-size: 16px; } }`,
  },
  {
    id: 'split',
    name: 'Two-column split',
    category: 'layout',
    keywords: ['split', 'two column', 'image text', 'media', 'side by side', 'feature'],
    width: 1280,
    html: `<section class="split" data-name="Two-column split"><div class="split-inner">
<div class="split-copy"><span class="split-eyebrow">Workflow</span><h2 class="split-title">Design and motion, finally in one place</h2><p class="split-text">Lay out pages visually, then choreograph every transition on a timeline. No more stitching prototypes together across tools.</p>
<ul class="split-list"><li class="split-item">${icon('check', 'split-check', 2.5)}<span class="split-item-text">Timeline-based animation</span></li><li class="split-item">${icon('check', 'split-check', 2.5)}<span class="split-item-text">Responsive breakpoints</span></li><li class="split-item">${icon('check', 'split-check', 2.5)}<span class="split-item-text">Clean, semantic exports</span></li></ul>
<a class="split-link" href="#">Explore features ${icon('arrow-right', 'split-link-icon')}</a></div>
<div class="split-visual"><div class="split-card"><div class="split-card-bar split-card-bar--a"></div><div class="split-card-bar split-card-bar--b"></div><div class="split-card-bar split-card-bar--c"></div></div></div>
</div></section>`,
    css: `.split { width: 100%; padding: 96px 24px; background-color: var(--k-surface); }
.split-inner { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 64px; max-width: 1120px; margin: 0 auto; }
.split-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 18px; }
.split-eyebrow { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--k-primary); }
.split-title { font-size: 40px; line-height: 1.1; letter-spacing: -0.03em; }
.split-text { font-size: 17px; line-height: 1.65; color: var(--k-muted); }
.split-list { display: flex; flex-direction: column; gap: 10px; padding: 0; list-style: none; }
.split-item { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500; }
.split-check { width: 20px; height: 20px; padding: 4px; flex: none; border-radius: 50%; background-color: ${tint(12)}; color: var(--k-primary); }
.split-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; color: var(--k-primary); font-size: 15px; font-weight: 600; text-decoration: none; transition: gap 0.2s ${EASE}; }
.split-link:hover { gap: 10px; }
.split-link-icon { width: 16px; height: 16px; }
.split-visual { display: flex; align-items: center; justify-content: center; aspect-ratio: 5 / 4; padding: 48px; border-radius: ${R_XL}; background-image: ${MESH_COOL}; }
.split-card { display: flex; flex-direction: column; gap: 12px; width: 78%; padding: 24px; border-radius: ${R_LG}; background-color: rgba(255, 255, 255, 0.82); box-shadow: ${SHADOW_LG}; backdrop-filter: blur(8px); }
.split-card-bar { height: 12px; border-radius: 999px; background-color: color-mix(in srgb, var(--k-text) 9%, transparent); }
.split-card-bar--a { width: 45%; background-color: var(--k-primary); }
.split-card-bar--b { width: 90%; }
.split-card-bar--c { width: 70%; }
@media (max-width: 1024px) { .split-inner { grid-template-columns: 1fr; gap: 40px; } .split { padding: 72px 24px; } }
@media (max-width: 640px) { .split { padding: 56px 20px; } .split-title { font-size: 30px; } .split-visual { padding: 24px; } }`,
  },
  {
    id: 'card-grid',
    name: 'Card grid',
    category: 'layout',
    keywords: ['cards', 'grid', 'gallery', 'collection', 'tiles', 'posts'],
    width: 1280,
    html: `<section class="cards" data-name="Card grid"><div class="cards-inner">
<div class="cards-head"><h2 class="cards-title">Latest work</h2><a class="cards-link" href="#">View all ${icon('arrow-right', 'cards-link-icon')}</a></div>
<div class="cards-grid">
<div class="cards-item"><div class="cards-cover cards-cover--a"></div><div class="cards-body"><h3 class="cards-item-title">Aurora banking app</h3><p class="cards-item-text">Product design · 2026</p></div></div>
<div class="cards-item"><div class="cards-cover cards-cover--b"></div><div class="cards-body"><h3 class="cards-item-title">Helio brand system</h3><p class="cards-item-text">Identity · 2026</p></div></div>
<div class="cards-item"><div class="cards-cover cards-cover--c"></div><div class="cards-body"><h3 class="cards-item-title">Tidal music launch</h3><p class="cards-item-text">Motion · 2025</p></div></div>
</div></div></section>`,
    css: `.cards { width: 100%; padding: 80px 24px; background-color: var(--k-background); }
.cards-inner { display: flex; flex-direction: column; gap: 32px; max-width: 1120px; margin: 0 auto; }
.cards-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; }
.cards-title { font-size: 32px; letter-spacing: -0.025em; }
.cards-link { display: inline-flex; align-items: center; gap: 6px; color: var(--k-text); font-size: 14.5px; font-weight: 600; text-decoration: none; }
.cards-link-icon { width: 16px; height: 16px; }
.cards-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.cards-item { overflow: hidden; border-radius: ${R_LG}; background-color: var(--k-surface); border: ${HAIRLINE}; box-shadow: ${SHADOW_SM}; transition: transform 0.25s ${EASE}, box-shadow 0.25s ${EASE}; }
.cards-item:hover { transform: translateY(-4px); box-shadow: ${SHADOW_LG}; }
.cards-cover { aspect-ratio: 16 / 10; }
.cards-cover--a { background-image: ${MESH_COOL}; }
.cards-cover--b { background-image: ${MESH_WARM}; }
.cards-cover--c { background-image: ${MESH_MINT}; }
.cards-body { display: flex; flex-direction: column; gap: 4px; padding: 18px 20px 20px; }
.cards-item-title { font-size: 17px; letter-spacing: -0.01em; }
.cards-item-text { font-size: 14px; color: var(--k-muted); }
@media (max-width: 1024px) { .cards-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .cards { padding: 56px 20px; } .cards-grid { grid-template-columns: minmax(0, 1fr); } .cards-title { font-size: 26px; } }`,
  },
];
