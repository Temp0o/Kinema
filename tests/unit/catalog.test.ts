import { describe, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
import { CATALOG, CATALOG_CATEGORIES, buildCatalogItem, searchCatalog } from '@/core/catalog';
import { importHtml } from '@/core/io/htmlImport';
import { DEFAULT_BREAKPOINTS, createDocument } from '@/core/model/factory';
import {
  computeAssetUsage,
  detectAssetKind,
  hashBytes,
  normalizeSvgRoot,
  parseFontFileName,
  safeFileName,
  svgDimensions,
  tagSvgWithAsset,
} from '@/features/assets/assetKinds';

const doc = { breakpoints: DEFAULT_BREAKPOINTS };

describe('component catalog', () => {
  it('has a broad set of items across every category', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(60);
    for (const c of CATALOG_CATEGORIES) expect(CATALOG.some((i) => i.category === c.id)).toBe(true);
    const ids = CATALOG.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(CATALOG.map((i) => [i.id, i] as const))('%s imports cleanly', (_id, item) => {
    expect(item.name.trim()).not.toBe('');
    expect(item.keywords.length).toBeGreaterThan(0);
    const r = importHtml(item.html, { breakpoints: DEFAULT_BREAKPOINTS, css: item.css });
    expect(r.warnings).toEqual([]);
    expect(r.rootIds).toHaveLength(1);
    const built = buildCatalogItem(item, doc);
    const nodes = Object.values(built.nodes);
    expect(nodes.length).toBeGreaterThanOrEqual(1);
    expect(built.nodes[built.rootId].name).toBe(item.name);
    expect(built.nodes[built.rootId].parent).toBeNull();
    for (const n of nodes) {
      expect(n.name.trim()).not.toBe('');
      for (const c of n.children) expect(built.nodes[c]?.parent).toBe(n.id);
    }
    // no external network references
    expect(JSON.stringify(built.nodes)).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it('builds fresh ids on every call', () => {
    const item = CATALOG.find((i) => i.id === 'card-pricing')!;
    const a = buildCatalogItem(item, doc);
    const b = buildCatalogItem(item, doc);
    const ids = new Set(Object.keys(a.nodes));
    expect(Object.keys(b.nodes).some((id) => ids.has(id))).toBe(false);
  });

  it('maps media queries and hover states to breakpoints and states', () => {
    const hero = buildCatalogItem(CATALOG.find((i) => i.id === 'hero-centered')!, doc);
    const title = Object.values(hero.nodes).find((n) => n.tag === 'h1')!;
    expect(title.styles.tablet?.['font-size']).toBeTruthy();
    expect(title.styles.mobile?.['font-size']).toBeTruthy();
    expect(title.animations?.length).toBe(1);
    const btn = buildCatalogItem(CATALOG.find((i) => i.id === 'button-primary')!, doc);
    expect(btn.nodes[btn.rootId].type).toBe('button');
    expect(btn.nodes[btn.rootId].states?.hover).toBeTruthy();
  });

  it('fuzzy search ranks name matches first', () => {
    expect(searchCatalog('pricing')[0].id).toMatch(/pricing/);
    expect(searchCatalog('navbr').some((i) => i.category === 'navigation')).toBe(true);
    expect(searchCatalog('login form').map((i) => i.id)).toContain('form-login');
    expect(searchCatalog('zzzqqq')).toEqual([]);
  });
});

describe('asset kinds', () => {
  it('detects kinds from extension and mime', () => {
    expect(detectAssetKind('photo.JPG', '')).toBe('image');
    expect(detectAssetKind('logo.svg', 'image/svg+xml')).toBe('svg');
    expect(detectAssetKind('blob', 'image/svg+xml')).toBe('svg');
    expect(detectAssetKind('Satoshi-Bold.woff2', 'application/octet-stream')).toBe('font');
    expect(detectAssetKind('x', 'font/ttf')).toBe('font');
    expect(detectAssetKind('clip.webm', '')).toBe('video');
    expect(detectAssetKind('a', 'video/mp4')).toBe('video');
    expect(detectAssetKind('beep.mp3', '')).toBe('audio');
    expect(detectAssetKind('notes.txt', 'text/plain')).toBe('other');
  });

  it('parses font family, weight and style from file names', () => {
    expect(parseFontFileName('Satoshi-Bold.woff2')).toMatchObject({ family: 'Satoshi', weight: '700', style: 'normal' });
    expect(parseFontFileName('OpenSans-SemiBoldItalic.ttf')).toMatchObject({ family: 'Open Sans', weight: '600', style: 'italic' });
    expect(parseFontFileName('IBMPlexSans-ExtraLight.otf')).toMatchObject({ family: 'IBM Plex Sans', weight: '200' });
    expect(parseFontFileName('Inter[wght].ttf')).toMatchObject({ family: 'Inter', weight: '100 900', variable: true });
    expect(parseFontFileName('GeneralSans-Variable.woff2')).toMatchObject({ family: 'General Sans', weight: '100 900' });
    expect(parseFontFileName('roboto_mono-regular.woff')).toMatchObject({ family: 'Roboto Mono', weight: '400' });
    expect(parseFontFileName('Lora-Italic.ttf')).toMatchObject({ family: 'Lora', weight: '400', style: 'italic' });
    expect(parseFontFileName('Brand-900.woff2')).toMatchObject({ family: 'Brand', weight: '900' });
    expect(parseFontFileName('Bold.ttf').family).toBe('Bold');
  });

  it('builds safe file names', () => {
    expect(safeFileName('My Logo (final).PNG')).toBe('My-Logo-final.png');
    const s = safeFileName('été/../x.svg');
    expect(s).not.toMatch(/[/\\]/);
    expect(s.startsWith('ete')).toBe(true);
    expect(s.endsWith('.svg')).toBe(true);
  });

  it('reads svg dimensions and normalizes the root', () => {
    expect(svgDimensions('<svg viewBox="0 0 120 40"></svg>')).toEqual({ width: 120, height: 40 });
    expect(svgDimensions('<svg width="64px" height="32"></svg>')).toEqual({ width: 64, height: 32 });
    const n = normalizeSvgRoot('<svg width="10" height="20"><path d="M0 0"/></svg>');
    expect(n).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(n).toContain('viewBox="0 0 10 20"');
  });

  it('keeps the asset tag through the canvas svg sanitizer and counts usage', () => {
    const tagged = tagSvgWithAsset('<svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>', 'as_abc123');
    const clean = DOMPurify.sanitize(tagged, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['script', 'foreignObject'] });
    expect(clean).toContain('data-kasset="asset:as_abc123"');
    const d = createDocument();
    const root = d.pages[0].rootId;
    d.nodes.n_img = { id: 'n_img', type: 'image', name: 'Img', parent: root, children: [], props: { src: 'asset:as_one' }, styles: { base: {} } };
    d.nodes.n_bg = { id: 'n_bg', type: 'box', name: 'Bg', parent: root, children: [], props: {}, styles: { base: { 'background-image': 'url(asset:as_one)' } } };
    d.nodes.n_svg = { id: 'n_svg', type: 'svg', name: 'Svg', parent: root, children: [], props: { svg: clean }, styles: { base: {} } };
    const usage = computeAssetUsage(d);
    expect(usage.get('as_one')).toEqual(['n_img', 'n_bg']);
    expect(usage.get('as_abc123')).toEqual(['n_svg']);
  });

  it('hashes identical bytes identically', async () => {
    const a = await hashBytes(new Uint8Array([1, 2, 3]));
    expect(a).toBe(await hashBytes(new Uint8Array([1, 2, 3])));
    expect(a).not.toBe(await hashBytes(new Uint8Array([1, 2, 4])));
  });
});
