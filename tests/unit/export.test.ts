import { describe, expect, it, vi } from 'vitest';

// Bundled fonts import woff2 files via `?url`; tests only need their metadata.
vi.mock('@/core/fonts/designFonts', () => {
  const v = (fileName: string, style = 'normal') => ({ url: `/fonts-src/${fileName}`, weight: '100 900', style, fileName });
  const BUNDLED_FONTS = [
    { family: 'Inter Variable', category: 'sans', files: [v('inter.woff2'), v('inter-italic.woff2', 'italic')] },
    { family: 'Poppins', category: 'sans', files: [400, 600].map((w) => ({ url: `/p${w}`, weight: String(w), style: 'normal', fileName: `poppins-${w}.woff2` })) },
    { family: 'Playfair Display Variable', category: 'serif', files: [v('playfair.woff2')] },
    { family: 'JetBrains Mono Variable', category: 'mono', files: [v('jetbrains-mono.woff2')] },
  ];
  return {
    BUNDLED_FONTS,
    SYSTEM_FONTS: [],
    findBundledFont: (family: string) => {
      const f = family.replace(/['"]/g, '').split(',')[0].trim().toLowerCase();
      return BUNDLED_FONTS.find((b) => b.family.toLowerCase() === f || b.family.toLowerCase().replace(' variable', '') === f);
    },
    registerBundledFonts: () => {},
  };
});
import { createDocument, createNode, uid } from '@/core/model/factory';
import { insertNode } from '@/core/model/tree';
import type { KAnimation, KAsset, KDocument, KNode } from '@/core/model/types';
import { compileFragment, compileSite, compileSiteText, evalEasing, remapIterationEasing, minifyCss } from '@/core/export';
import { compileFrames } from '@/core/anim/compile';
import { minifyRuntime, runtimeSource } from '@/core/export/runtime';
import { Namer, slugify } from '@/core/export/naming';

function doc(): { d: KDocument; root: string } {
  const d = createDocument('Test site');
  return { d, root: d.pages[0].rootId };
}
function add(d: KDocument, parent: string, n: KNode): KNode {
  insertNode(d, n, parent);
  return n;
}
const text = (files: { path: string; data: Uint8Array | string }[], p: string) => files.find((f) => f.path === p)?.data as string;
const css = (d: KDocument, o = {}) => text(compileSiteText(d, o).files, 'styles.css');
const html = (d: KDocument, o = {}) => text(compileSiteText(d, o).files, 'index.html');
/** Body of the first rule whose selector line equals `sel`. */
function ruleBody(cssText: string, sel: string): string | null {
  const i = cssText.indexOf(`${sel} {`);
  if (i < 0) return null;
  return cssText.slice(i + sel.length + 2, cssText.indexOf('}', i));
}
/** All rule bodies (any nesting) whose selector is exactly `sel`, joined. */
function bodies(cssText: string, sel: string): string {
  const out: string[] = [];
  const re = new RegExp(`(^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(cssText))) out.push(cssText.slice(m.index + m[0].length, cssText.indexOf('}', m.index)));
  return out.join('\n');
}
function classOf(h: string, kid: string): string {
  const m = new RegExp(`class="([^"]+)"[^>]*data-kid="${kid}"`).exec(h);
  return m ? m[1].split(' ')[0] : '';
}

function anim(p: Partial<KAnimation> = {}): KAnimation {
  return {
    id: uid('a'),
    name: 'Fade up',
    trigger: 'load',
    duration: 600,
    delay: 0,
    iterations: 1,
    direction: 'normal',
    fill: 'both',
    easing: 'ease-out',
    keyframes: [
      { id: 'k1', offset: 0, values: { opacity: 0, y: 24 } },
      { id: 'k2', offset: 1, values: { opacity: 1, y: 0 } },
    ],
    ...p,
  };
}

describe('naming', () => {
  it('slugs are css-safe and class names unique & deterministic', () => {
    expect(slugify('Hero Section!')).toBe('hero-section');
    expect(slugify('Café Crème')).toBe('cafe-creme');
    const n = new Namer();
    const a = n.name('id1', 'Card');
    const b = n.name('id2', 'Card');
    expect(a).not.toBe(b);
    expect(a).toMatch(/^card-[a-z0-9]{4}$/);
    expect(n.name('id1', 'Card')).toBe(a);
    expect(new Namer().name('id1', 'Card')).toBe(a);
    expect(new Namer().name('x', '3 columns')).toMatch(/^n-3-columns-/);
    expect(new Namer().name('x', '★★', 'box')).toMatch(/^box-/);
  });

  it('every element gets a unique class even with duplicate layer names', () => {
    const { d, root } = doc();
    const ids = Array.from({ length: 30 }, () => add(d, root, createNode('box', { name: 'Box' })).id);
    const h = html(d, { annotate: true });
    const classes = ids.map((id) => classOf(h, id));
    expect(new Set(classes).size).toBe(30);
    expect(compileSiteText(d).files.map((f) => f.data)).toEqual(compileSiteText(d).files.map((f) => f.data));
  });
});

describe('html & css structure', () => {
  it('emits pages, head, reset, tokens and semantic tags', () => {
    const { d, root } = doc();
    d.settings.title = 'Acme';
    d.pages.push({ id: 'p2', name: 'About us', rootId: 'r2' });
    d.nodes.r2 = { ...createNode('frame', { name: 'About' }), id: 'r2' };
    add(d, root, createNode('text', { name: 'Title', tag: 'h1', props: { text: 'Hello <em>world</em>' } }));
    add(d, root, createNode('link', { props: { text: 'About', href: 'page:p2', target: '_blank' } }));
    const r = compileSiteText(d, { description: 'Desc' });
    expect(r.files.map((f) => f.path)).toEqual(['index.html', 'about-us.html', 'styles.css']);
    const h = text(r.files, 'index.html');
    expect(h).toContain('<title>Acme</title>');
    expect(h).toContain('<meta name="generator" content="Kinema">');
    expect(h).toContain('<meta name="description" content="Desc">');
    expect(h).toMatch(/<h1 class="title-[a-z0-9]+">Hello <em>world<\/em><\/h1>/);
    expect(h).toMatch(/<a class="[^"]+" href="about-us.html" target="_blank" rel="noopener">About<\/a>/);
    expect(text(r.files, 'about-us.html')).toContain('<title>About us — Acme</title>');
    const c = text(r.files, 'styles.css');
    expect(c).toContain('*, *::before, *::after { box-sizing: border-box; }');
    expect(c).toMatch(/:root \{\n  --k-primary: #7c5cff;/);
    expect(r.files.find((f) => f.path === 'script.js')).toBeUndefined();
  });

  it('breakpoint styles become desktop-first media diffs in breakpoint order', () => {
    const { d, root } = doc();
    const n = add(d, root, createNode('box', { name: 'Hero', styles: { width: '600px', height: '100px' } }));
    n.styles.tablet = { width: '400px' };
    n.styles.mobile = { width: '300px', height: '80px' };
    const c = css(d, { annotate: true });
    const cls = classOf(html(d, { annotate: true }), n.id);
    const t = c.indexOf('@media (max-width: 1024px)');
    const m = c.indexOf('@media (max-width: 640px)');
    expect(t).toBeGreaterThan(0);
    expect(m).toBeGreaterThan(t);
    expect(c.slice(t, m)).toContain(`.${cls} {\n    width: 400px;\n  }`);
    expect(c.slice(m)).toMatch(new RegExp(`\\.${cls} \\{\\n    width: 300px;\\n    height: 80px;`));
    expect(ruleBody(c, `.${cls}`)).toContain('width: 600px;');
  });

  it('interaction states map to :hover / :focus-visible / :active after the media blocks', () => {
    const { d, root } = doc();
    const b = add(d, root, createNode('button'));
    b.states = { hover: { 'background-color': 'red' }, focus: { outline: '2px solid blue' }, active: { transform: 'scale(0.98)' } };
    const c = css(d);
    const cls = classOf(html(d, { annotate: true }), b.id);
    const hi = c.indexOf(`.${cls}:hover {`);
    expect(hi).toBeGreaterThan(c.lastIndexOf('@media (max-width'));
    expect(c.indexOf(`.${cls}:focus-visible {`)).toBeGreaterThan(hi);
    expect(c.indexOf(`.${cls}:active {`)).toBeGreaterThan(c.indexOf(`.${cls}:focus-visible {`));
    expect(html(d)).toContain('type="button"');
  });

  it('only separates inline-level siblings without whitespace', () => {
    const { d, root } = doc();
    const p = add(d, root, createNode('box', { name: 'Row', replaceStyles: true, styles: {} }));
    add(d, p.id, createNode('button', { props: { text: 'A' } }));
    add(d, p.id, createNode('button', { props: { text: 'B' } }));
    const f = add(d, root, createNode('box', { name: 'Flex', replaceStyles: true, styles: { display: 'flex' } }));
    add(d, f.id, createNode('button', { props: { text: 'C' } }));
    add(d, f.id, createNode('button', { props: { text: 'D' } }));
    const h = html(d);
    expect(h).toMatch(/>A<\/button><button/);
    expect(h).toMatch(/>C<\/button>\n\s+<button/);
  });

  it('mirrors canvas placeholders, inputs, video flags and lazy images', () => {
    const { d, root } = doc();
    add(d, root, createNode('image', { props: { src: '', alt: 'Hero' } }));
    add(d, root, createNode('image', { props: { src: 'https://x.test/a.png', alt: 'A' } }));
    add(d, root, createNode('image', { props: { src: 'https://x.test/b.png', alt: 'B' } }));
    add(d, root, createNode('input', { props: { inputType: 'email', placeholder: 'you@site.com' } }));
    add(d, root, createNode('select', { props: { options: ['One', 'Two'], value: 'Two' } }));
    add(d, root, createNode('video', { props: { src: 'https://x.test/v.mp4', autoplay: true, loop: true } }));
    add(d, root, createNode('svg'));
    const h = html(d);
    expect(h).toMatch(/<div class="[^"]+" role="img" aria-label="Hero" style="display: flex;/);
    expect(h).toMatch(/src="https:\/\/x.test\/a.png" alt="A" decoding="async">/); // first image eager
    expect(h).toMatch(/src="https:\/\/x.test\/b.png" alt="B" loading="lazy"/);
    expect(h).toMatch(/<input class="[^"]+" type="email" placeholder="you@site.com">/);
    expect(h).toContain('<option value="Two" selected>Two</option>');
    expect(h).toMatch(/<video [^>]*autoplay loop muted controls playsinline>/);
    expect(h).toMatch(/<div class="vector-[a-z0-9]+">\n\s+<svg/);
    expect(css(d)).toMatch(/\.vector-[a-z0-9]+ > svg \{\n  display: block;\n  width: 100%;\n  height: 100%;/);
  });
});

describe('sanitization', () => {
  it('strips scripts, handlers and javascript: urls', () => {
    const { d, root } = doc();
    add(d, root, createNode('text', { props: { text: 'Hi <img src=x onerror="alert(1)"><script>alert(2)</script><b onclick="x()">b</b><a href="javascript:alert(3)">l</a>' } }));
    add(d, root, createNode('box', { tag: 'script', props: { attrs: { onclick: 'evil()', 'data-x': '1', title: 'T', href: 'javascript:bad()', style: 'color:red' } } }));
    add(d, root, createNode('link', { props: { text: 'x', href: 'javascript:alert(1)' } }));
    add(d, root, createNode('svg', { props: { svg: '<svg><script>alert(1)</script><path onload="x()" d="M0 0"/></svg>' } }));
    const h = html(d);
    expect(h).not.toMatch(/<script/i);
    expect(h).not.toMatch(/\son[a-z]+=/i);
    expect(h).not.toMatch(/javascript:/i);
    expect(h).toContain('data-x="1"');
    expect(h).toContain('title="T"');
    expect(h).not.toContain('color:red');
  });

  it('keeps hostile values from breaking out of rules', () => {
    const { d, root } = doc();
    add(d, root, createNode('box', { styles: { color: 'red; } body { display:none', 'bad prop': 'x' } }));
    d.tokens.colors[0].value = '#000}</style><script>alert(1)</script>';
    const c = css(d);
    expect(c).not.toMatch(/body \{ display:none/);
    expect(c).not.toContain('bad prop');
    expect(c).not.toContain('</style>');
    const single = text(compileSiteText(d, { bundle: 'single' }).files, 'index.html');
    expect(single.match(/<\/style>/g)?.length).toBe(1);
  });
});

describe('components', () => {
  it('expands instances with root styles and per-node overrides', () => {
    const { d, root } = doc();
    const master = createNode('box', { name: 'Card', styles: { width: '200px', padding: '16px' } });
    master.styles.mobile = { width: '100%' };
    d.nodes[master.id] = master;
    const title = createNode('text', { name: 'Title', props: { text: 'Default' } });
    insertNode(d, title, master.id);
    d.components.c1 = { id: 'c1', name: 'Card', rootId: master.id, createdAt: 0 };
    const i1 = add(d, root, createNode('instance', { name: 'Pro card', props: { componentId: 'c1' }, styles: { width: '320px' } }));
    i1.overrides = { [title.id]: { text: 'Pro', styles: { color: 'gold' } } };
    const i2 = add(d, root, createNode('instance', { name: 'Free card', props: { componentId: 'c1' } }));
    const h = html(d, { annotate: true });
    const c = css(d);
    expect(h).toContain('>Pro</p>');
    expect(h).toContain('>Default</p>');
    const cardCls = /class="(card-[a-z0-9]+) (pro-card-[a-z0-9]+)" data-kid="/.exec(h)!;
    expect(cardCls).toBeTruthy();
    expect(h).toContain(`data-kid="${i1.id}"`);
    expect(h).toContain(`data-kid="${i2.id}"`);
    // master rule once, instance compound rule overrides at all breakpoints
    expect(c.match(new RegExp(`^\\.${cardCls[1]} \\{`, 'gm'))?.length).toBe(1);
    expect(ruleBody(c, `.${cardCls[1]}.${cardCls[2]}`)).toContain('width: 320px;');
    const ov = /\.(title-[a-z0-9]+)\.(pro-card-title-[a-z0-9]+) \{\n  color: gold;/.exec(c);
    expect(ov).toBeTruthy();
  });
});

describe('assets & fonts', () => {
  const asset = (p: Partial<KAsset>): KAsset => ({ id: 'a_logo', name: 'Logo.png', kind: 'image', mime: 'image/png', size: 4, path: 'assets/ab12-logo.png', createdAt: 0, ...p });

  it('rewrites asset refs in html and css and copies binaries', async () => {
    const { d, root } = doc();
    d.assets.a_logo = asset({});
    add(d, root, createNode('image', { props: { src: 'asset:a_logo', alt: 'Logo' } }));
    add(d, root, createNode('box', { styles: { 'background-image': 'url(asset:a_logo)' } }));
    add(d, root, createNode('image', { props: { src: 'asset:missing' } }));
    const r = await compileSite(d, { readAsset: async () => new Uint8Array([1, 2, 3, 4]), includeFonts: false });
    expect(text(r.files, 'index.html')).toContain('src="assets/ab12-logo.png"');
    expect(text(r.files, 'styles.css')).toContain('background-image: url(assets/ab12-logo.png);');
    expect(r.files.find((f) => f.path === 'assets/ab12-logo.png')?.data).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(r.stats.warnings.join(' ')).toMatch(/Missing asset/);
  });

  it('single-file mode inlines css, js and assets as data URIs', async () => {
    const { d, root } = doc();
    d.assets.a_logo = asset({});
    const n = add(d, root, createNode('image', { props: { src: 'asset:a_logo' } }));
    n.animations = [anim({ trigger: 'inView' })];
    const r = await compileSite(d, { bundle: 'single', readAsset: async () => new Uint8Array([137, 80]), readFont: async () => new Uint8Array([0]) });
    expect(r.files.map((f) => f.path)).toEqual(['index.html']);
    const h = text(r.files, 'index.html');
    expect(h).toContain('src="data:image/png;base64,iVA="');
    expect(h).toMatch(/<style>[\s\S]*@keyframes/);
    expect(h).toMatch(/<script>[\s\S]*IntersectionObserver[\s\S]*<\/script>\n\s*<\/body>/);
    expect(h).toContain('url("data:font/woff2;base64,AA==")');
    expect(h).not.toMatch(/href="styles.css"|src="script.js"|kinema-inline/);
  });

  it('collects bundled, project and token fonts; ignores system fonts', async () => {
    const { d, root } = doc();
    d.tokens.fonts.heading = 'Playfair Display Variable';
    d.assets.f1 = asset({ id: 'f1', kind: 'font', name: 'Brand.woff2', mime: 'font/woff2', path: 'assets/brand.woff2', fontFamily: 'Brand Sans', fontWeight: '400' });
    add(d, root, createNode('text', { tag: 'h2', styles: { 'font-family': "Poppins, 'Brand Sans', Georgia, sans-serif" } }));
    add(d, root, createNode('text', { styles: { 'font-family': 'var(--k-font-mono)' } }));
    const reads: string[] = [];
    const r = await compileSite(d, { readFont: async (f) => (reads.push(f.fileName), new Uint8Array([1])), readAsset: async () => new Uint8Array([2]) });
    const c = text(r.files, 'styles.css');
    expect(r.stats.fonts).toEqual(expect.arrayContaining(['Inter Variable', 'Poppins', 'Playfair Display Variable', 'JetBrains Mono Variable', 'Brand Sans']));
    expect(r.stats.fonts).not.toContain('Georgia');
    expect(c).toContain("font-family: 'Poppins';");
    expect(c).toContain('src: url("fonts/poppins-600.woff2") format("woff2");');
    expect(c).toContain('src: url("fonts/brand.woff2") format("woff2");');
    expect(r.files.some((f) => f.path === 'fonts/inter.woff2')).toBe(true);
    expect(r.files.some((f) => f.path === 'fonts/brand.woff2')).toBe(true);
    expect(reads).toContain('playfair.woff2');
  });
});

describe('animations', () => {
  function animated(a: Partial<KAnimation>, kids = 0) {
    const { d, root } = doc();
    const n = add(d, root, createNode('box', { name: 'Card', styles: kids ? { display: 'flex' } : {} }));
    const children = Array.from({ length: kids }, (_, i) => add(d, n.id, createNode('box', { name: `Item ${i}` })));
    n.animations = [anim(a)];
    const r = compileSiteText(d, { annotate: true });
    const h = text(r.files, 'index.html');
    return { d, n, children, r, h, c: text(r.files, 'styles.css'), js: text(r.files, 'script.js'), cls: classOf(h, n.id) };
  }

  it('load → animation on the element, loop → infinite, no runtime', () => {
    const { c, cls, js, h } = animated({ delay: 200 });
    expect(c).toMatch(/@keyframes fade-up-[a-z0-9]+ \{\n  0% \{ opacity: 0; transform: translate\(0px, 24px\); \}\n  100% \{ opacity: 1; transform: translate\(0px, 0px\); \}\n\}/);
    expect(ruleBody(c, `.${cls}`)).toBeTruthy();
    expect(c).toMatch(new RegExp(`\\.${cls} \\{\\n  animation: fade-up-[a-z0-9]+ 600ms ease-out 200ms both;`));
    expect(js).toBeUndefined();
    expect(h).not.toContain('data-k-');
    expect(animated({ trigger: 'loop', direction: 'alternate' }).c).toMatch(/600ms ease-out infinite alternate both;/);
    expect(c).toContain('@media (prefers-reduced-motion: reduce)');
    expect(text(compileSiteText(animated({}).d, { respectReducedMotion: false }).files, 'styles.css')).not.toContain('prefers-reduced-motion');
  });

  it('inView → paused until is-inview, with runtime + noscript fallback', () => {
    const { c, cls, js, h } = animated({ trigger: 'inView' });
    expect(c).toMatch(new RegExp(`\\.${cls} \\{\\n  animation: fade-up-[a-z0-9]+ 600ms ease-out both paused;`));
    expect(ruleBody(c, `.${cls}.is-inview`)).toContain('animation-play-state: running;');
    expect(h).toContain('data-k-inview');
    expect(h).toContain('<noscript>');
    expect(h).toContain('<script src="script.js" defer></script>');
    expect(js).toContain('IntersectionObserver');
    expect(js).toContain('prefers-reduced-motion');
  });

  it('hover / click → state-class animations, restartable', () => {
    const hv = animated({ trigger: 'hover', fill: 'none' });
    expect(bodies(hv.c, `.${hv.cls}`)).not.toContain('animation');
    expect(ruleBody(hv.c, `.${hv.cls}.is-hovered`)).toMatch(/animation: fade-up-[a-z0-9]+ 600ms ease-out;/);
    expect(hv.h).toMatch(/data-k-hover[ >]/);
    expect(hv.js).toContain("restart(el, 'is-hovered')");
    expect(animated({ trigger: 'hover', iterations: -1 }).h).toContain('data-k-hover="loop"');
    const ck = animated({ trigger: 'click' });
    expect(ruleBody(ck.c, `.${ck.cls}.is-clicked`)).toContain('animation:');
    expect(ck.js).toContain("addEventListener('click'");
    expect(ck.js).not.toContain('IntersectionObserver');
  });

  it('stagger → per-child delays driven by the parent trigger', () => {
    const { c, h, children, cls } = animated({ trigger: 'inView', stagger: 80, delay: 100 }, 3);
    const kids = children.map((k) => classOf(h, k.id));
    kids.forEach((k, i) => {
      expect(bodies(c, `.${k}`)).toMatch(new RegExp(`animation: fade-up-[a-z0-9]+ 600ms ease-out ${100 + i * 80}ms both paused;`));
    });
    expect(c).toContain(`.${cls}.is-inview > .${kids[1]} {\n  animation-play-state: running;`);
    expect(bodies(c, `.${cls}`)).not.toContain('animation');
  });

  it('targetSelector → inner rules with JS-assigned stagger index; disabled animations skipped', () => {
    const { d, root } = doc();
    const n = add(d, root, createNode('svg', { name: 'Logo' }));
    n.animations = [anim({ name: 'Draw', targetSelector: 'path, circle', stagger: 120 }), anim({ name: 'Off', enabled: false })];
    const r = compileSiteText(d);
    const c = text(r.files, 'styles.css');
    expect(c).toMatch(/\.logo-[a-z0-9]+ path,\n\.logo-[a-z0-9]+ circle \{\n  animation: draw-[a-z0-9]+ 600ms ease-out calc\(0ms \+ var\(--k-i, 0\) \* 120ms\) both;/);
    expect(text(r.files, 'index.html')).toContain('data-k-each="path, circle"');
    expect(text(r.files, 'script.js')).toContain("setProperty(name, String(i))");
    expect(c).not.toContain('@keyframes off-');
    expect(r.stats.animations).toBe(1);
  });

  it('multiple triggers on one element use per-trigger custom properties', () => {
    const { d, root } = doc();
    const n = add(d, root, createNode('box', { name: 'Multi' }));
    n.animations = [anim({ name: 'In' }), anim({ name: 'Reveal', trigger: 'inView' }), anim({ name: 'Wiggle', trigger: 'hover', keyframes: [{ id: 'a', offset: 0, values: { rotate: 0 } }, { id: 'b', offset: 1, values: { rotate: 5 } }] })];
    const c = css(d);
    expect(c).toMatch(/--k-inview: in-[a-z0-9]+ 600ms ease-out both paused;\n  --k-hover: none;\n  animation: in-[a-z0-9]+ 600ms ease-out both, var\(--k-inview\), var\(--k-hover\);/);
    expect(c).toMatch(/\.multi-[a-z0-9]+\.is-hovered \{\n  --k-hover: wiggle-/);
  });

  it('identical keyframes are shared between elements', () => {
    const { d, root } = doc();
    for (let i = 0; i < 3; i++) add(d, root, createNode('box')).animations = [anim()];
    expect(css(d).match(/@keyframes/g)?.length).toBe(1);
  });

  it('multi-keyframe animations reproduce WAAPI iteration easing', () => {
    const a = anim({
      easing: 'ease-out',
      keyframes: [
        { id: '1', offset: 0, values: { opacity: 0 } },
        { id: '2', offset: 0.3, values: { opacity: 0.8 } },
        { id: '3', offset: 1, values: { opacity: 1 } },
      ],
    });
    const frames = compileFrames(a);
    const remapped = remapIterationEasing(frames, a.easing)!;
    expect(remapped).toBeTruthy();
    // evaluate both models numerically
    const waapi = (t: number) => {
      const p = evalEasing('ease-out', t);
      const vals = [0, 0.8, 1];
      const offs = [0, 0.3, 1];
      const j = p < 0.3 ? 0 : 1;
      return vals[j] + ((vals[j + 1] - vals[j]) * (p - offs[j])) / (offs[j + 1] - offs[j]);
    };
    const cssModel = (t: number) => {
      let j = 0;
      while (j < remapped.length - 2 && t >= remapped[j + 1].offset) j++;
      const A = remapped[j];
      const B = remapped[j + 1];
      const u = (t - A.offset) / (B.offset - A.offset);
      const g = evalEasing(A.easing, u);
      return Number(A.decls.opacity) + (Number(B.decls.opacity) - Number(A.decls.opacity)) * g;
    };
    for (let t = 0; t <= 1.0001; t += 0.05) expect(Math.abs(cssModel(t) - waapi(t))).toBeLessThan(2e-3);
    expect(remapped[0].easing).toMatch(/^cubic-bezier\(/);
    // shorthand easing becomes linear when keyframes carry the curve
    const { d, root } = doc();
    add(d, root, createNode('box')).animations = [a];
    expect(css(d)).toMatch(/600ms linear both;/);
    // springs (linear()) with overshoot are representable too
    expect(remapIterationEasing(frames, 'cubic-bezier(0.34, 1.56, 0.64, 1)')).toBeTruthy();
    expect(remapIterationEasing(compileFrames(anim()), 'ease')).toBeNull();
  });
});

describe('fragments, minify & runtime', () => {
  it('compileFragment returns just the element', () => {
    const { d, root } = doc();
    const card = add(d, root, createNode('box', { name: 'Card', styles: { position: 'absolute', left: '40px', top: '10px' } }));
    add(d, card.id, createNode('text', { props: { text: 'Inside' } }));
    add(d, root, createNode('text', { props: { text: 'Outside' } }));
    card.animations = [anim({ trigger: 'click' })];
    const f = compileFragment(d, card.id);
    expect(f.html).toMatch(/^<div class="card-[a-z0-9]+" data-k-click>/);
    expect(f.html).toContain('Inside');
    expect(f.html).not.toContain('Outside');
    expect(f.css).not.toContain('box-sizing');
    expect(f.css).toContain('left: 40px;');
    expect(f.js).toContain('is-clicked');
    const iso = compileSiteText(d, { rootNodeId: card.id, isolate: true });
    const ic = text(iso.files, 'styles.css');
    expect(ic).not.toContain('left: 40px');
    expect(ic).toContain('position: relative;');
  });

  it('minified output is compact and equivalent', () => {
    expect(minifyCss('/* c */\n.a > .b {\n  color: red;\n  margin: 0 auto;\n}\n@media (max-width: 640px) {\n  .a { width: calc(100% - 2px); }\n}')).toBe(
      '.a>.b{color:red;margin:0 auto}@media (max-width:640px){.a{width:calc(100% - 2px)}}',
    );
    const { d, root } = doc();
    add(d, root, createNode('text')).animations = [anim({ trigger: 'hover' })];
    const r = compileSiteText(d, { minify: true });
    const h = text(r.files, 'index.html');
    expect(h.split('\n').filter(Boolean).length).toBe(1);
    expect(text(r.files, 'script.js').split('\n').filter(Boolean).length).toBe(1);
  });

  it('runtime is small and valid JavaScript', () => {
    const src = runtimeSource({ inView: true, hover: true, click: true, each: true, respectReducedMotion: true });
    expect(() => new Function(src)).not.toThrow();
    const min = minifyRuntime(src);
    expect(() => new Function(min)).not.toThrow();
    expect(min.length).toBeLessThan(3072);
  });
});
