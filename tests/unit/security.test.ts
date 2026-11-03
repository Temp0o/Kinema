import { describe, expect, it, vi } from 'vitest';

vi.mock('@/core/fonts/designFonts', () => {
  const v = (fileName: string, style = 'normal') => ({ url: `/fonts-src/${fileName}`, weight: '100 900', style, fileName });
  const BUNDLED_FONTS = [{ family: 'Inter Variable', category: 'sans', files: [v('inter.woff2')] }];
  return {
    BUNDLED_FONTS,
    SYSTEM_FONTS: [],
    findBundledFont: (family: string) => BUNDLED_FONTS.find((b) => b.family.toLowerCase() === family.replace(/['"]/g, '').split(',')[0].trim().toLowerCase()),
    registerBundledFonts: () => {},
  };
});

import JSZip from 'jszip';
import { createDocument, createNode } from '@/core/model/factory';
import { insertNode, repairDocument, repairNodeSet } from '@/core/model/tree';
import type { KDocument, KNode } from '@/core/model/types';
import { compileSiteText } from '@/core/export';
import { cleanValue, neutralizeCssUrls, sanitizeStylesheet } from '@/core/export/css';
import { filterRichStyle, filterSvgCss, safeAttrs, safeTag, safeUrl, sanitizeRichText, sanitizeSvgMarkup } from '@/core/export/sanitize';
import { scopeCss } from '@/core/style/scopeCss';
import { safeJsonParse } from '@/core/model/safeJson';
import { unpackProject, KinemaFileError } from '@/features/projects/kinemaFile';
import { parsePayload } from '@/features/clipboard/clipboard';
import { normalizeLibrary } from '@/features/library/libraryStore';

const URL_ATTRS = ['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'data', 'srcset'];

/** Everything that could execute script or leak out of its context in a rendered document. */
function audit(html: string): string[] {
  const problems: string[] = [];
  const dom = new DOMParser().parseFromString(html, 'text/html');
  for (const el of Array.from(dom.querySelectorAll('*'))) {
    const tag = el.localName.toLowerCase();
    if (['iframe', 'object', 'embed', 'base', 'frame', 'applet', 'meta'].includes(tag) && !(tag === 'meta' && /^(charset|viewport|description|generator)$/.test(el.getAttribute('name') ?? 'charset'))) problems.push(`<${tag}>`);
    for (const a of Array.from(el.attributes)) {
      const n = a.name.toLowerCase();
      if (n.startsWith('on')) problems.push(`${tag}[${n}]`);
      if (URL_ATTRS.includes(n)) {
        // eslint-disable-next-line no-control-regex
        const v = a.value.replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
        if (/^(javascript|vbscript):/.test(v) || /^data:text\/html/.test(v)) problems.push(`${tag}[${n}=${a.value.slice(0, 30)}]`);
      }
      if (n === 'srcdoc') problems.push(`${tag}[srcdoc]`);
    }
  }
  return problems;
}

function build(mutate: (d: KDocument, add: (n: KNode, parent?: string) => KNode) => void): { d: KDocument; out: { html: string; css: string; js: string; files: { path: string; data: unknown }[] } } {
  const d = createDocument('Hostile');
  const root = d.pages[0].rootId;
  const add = (n: KNode, parent = root) => {
    insertNode(d, n, parent);
    return n;
  };
  mutate(d, add);
  const r = compileSiteText(d, { bundle: 'files' });
  const f = (p: string) => (r.files.find((x) => x.path === p)?.data as string) ?? '';
  return { d, out: { html: f('index.html'), css: f('styles.css'), js: f('script.js'), files: r.files } };
}

const JS_URLS = [
  'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', '\u0001javascript:alert(1)',
  'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>', 'DATA:text/html;base64,PHNjcmlwdD4=',
];

describe('exported html: hostile node content', () => {
  it('never emits script-capable urls, handlers or frames', () => {
    const { out } = build((d, add) => {
      let i = 0;
      for (const u of JS_URLS) {
        add(createNode('link', { name: `l${i++}`, props: { text: 'x', href: u } }));
        add(createNode('image', { name: `i${i++}`, props: { src: u, alt: `"><script>alert(${i})</script>` } }));
        add(createNode('video', { name: `v${i++}`, props: { src: u } }));
        add(createNode('box', { name: `b${i++}`, props: { attrs: { href: u, src: u, action: u, formaction: u, poster: u, 'xlink:href': u, onclick: 'alert(1)', ONMOUSEOVER: 'alert(1)', style: 'x:y', srcdoc: '<script>', '"><script>': 'x', 'a b': 'c', is: 'x-evil' } } }));
      }
      add(createNode('text', { name: 'rich', props: { text: '<img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">a</a><svg onload=alert(1)><iframe src=javascript:1>' } }));
      add(createNode('box', { name: 'tags', tag: 'script' }));
      add(createNode('box', { name: 'tags2', tag: 'iframe' }));
      add(createNode('box', { name: 'tags3', tag: 'img onerror=alert(1)' }));
      add(createNode('input', { props: { placeholder: '"><script>alert(1)</script>', value: '" onfocus="alert(1)', inputType: 'text" onfocus="alert(1)' } }));
      add(createNode('select', { props: { options: ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>'] } }));
      add(createNode('textarea', { props: { value: '</textarea><script>alert(1)</script>', placeholder: '</textarea><script>' } }));
    });
    expect(audit(out.html)).toEqual([]);
    expect(out.html).not.toMatch(/<script\b/i);
  });

  it('keeps hostile style values, names and custom css inside their rules', () => {
    const { d, out } = build((doc, add) => {
      doc.settings.title = '</title><script>alert(1)</script>';
      doc.settings.customCss = 'a{color:red}</style><script>alert(1)</script><style>b{}\n@import url(javascript:alert(1));.x{background:url("JaVa\\73 cript:alert(1)")}';
      doc.tokens.colors[0].value = 'red;} </style><script>alert(1)</script>';
      doc.tokens.colors[1].name = 'x;}</style><script>';
      const n = add(createNode('box', { name: '"><script>alert(1)</script>', styles: {
        color: 'red;} body{display:none} /*',
        'background-image': 'url(javascript:alert(1))',
        width: 'expression(alert(1))',
        content: '"a\n} body{display:none} "',
        'margin;color': 'red',
        'x}</style><script>alert(1)</script>': 'y',
        height: '1px */ .evil{display:none} /*',
        'font-family': "x'}</style><script>alert(1)</script>",
      } }));
      n.states = { hover: { 'background-image': 'url(javascript:alert(1))', color: 'red}</style><script>alert(1)</script>' } };
      n.styles.tablet = { color: 'blue}</style><script>alert(1)</script>' };
      n.animations = [{ id: 'a1', name: '</style><script>alert(1)</script>', trigger: 'load', duration: 500, delay: 0, iterations: 1, direction: 'normal', fill: 'both', easing: 'ease', keyframes: [
        { id: 'k1', offset: 0, values: { opacity: '0}</style><script>alert(1)</script>', 'bad prop': 1, 'x;y': 'z' } },
        { id: 'k2', offset: 1, values: { opacity: 1 } },
      ] }, { id: 'a2', name: 'inview', trigger: 'inView', duration: 500, delay: 0, iterations: 1, direction: 'normal', fill: 'both', easing: 'cubic-bezier(0,0,0,0)}</style><script>', stagger: 50, targetSelector: '"]);alert(1);//</script><script>alert(2)', keyframes: [
        { id: 'k3', offset: 0, values: { opacity: 0 } }, { id: 'k4', offset: 1, values: { opacity: 1 } } ] }];
    });
    void d;
    expect(audit(out.html)).toEqual([]);
    expect(new DOMParser().parseFromString(out.html, 'text/html').querySelectorAll('script:not([src])').length).toBe(0);
    // the stylesheet never contains a markup breakout, javascript urls or expression()
    expect(out.css.match(/.{0,30}<\/style.{0,30}/i)?.[0]).toBeUndefined();
    expect(out.css).not.toMatch(/javascript:/i);
    expect(out.css).not.toMatch(/expression\s*\(/i);
    // no declaration value may smuggle a second rule through a comment/brace/newline
    expect(out.css).not.toMatch(/\.evil\s*\{/);
    expect(out.css).not.toMatch(/body\s*\{\s*display:\s*none/);
    // script.js must be valid, non-breaking JS even with a hostile selector
    expect(() => new Function(out.js)).not.toThrow();
    expect(out.js).not.toMatch(/<\/script/i);
    // single-file bundle: one style element, one script element
    const r = compileSiteText(d, { bundle: 'single' });
    const page = r.files[0].data as string;
    const dom = new DOMParser().parseFromString(page, 'text/html');
    expect([...dom.querySelectorAll('style')].filter((s) => !s.closest('noscript')).length).toBe(1);
    expect(dom.querySelectorAll('script').length).toBeLessThanOrEqual(1);
    expect(dom.title).toContain('<script>');
  });

  it('survives hostile svg / font assets / page names', () => {
    const { out, d } = build((doc, add) => {
      add(createNode('svg', { props: { svg: '<svg viewBox="0 0 10 10"><script>alert(1)</script><use href="https://evil/x.svg#a"/><use xlink:href="data:image/svg+xml,<svg onload=alert(1)>"/><a xlink:href="javascript:alert(1)"><text>x</text></a><a href="javascript:alert(1)"><rect/></a><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="href" to="javascript:alert(1)"/><g onload="alert(1)" style="fill:url(javascript:alert(1))"><path d="M0 0"/></g><foreignObject><iframe src="javascript:1"></iframe></foreignObject><style>body{display:none}.k-panel{display:none}* {x:y}.cls-1{fill:red}</style></svg>' } }));
      doc.assets['f1'] = { id: 'f1', name: "evil'); } body{display:none} @font-face{src:url(x", kind: 'font', mime: 'font/woff2', size: 1, path: 'assets/f.woff2', fontFamily: "Evil'); } body{display:none} /*", createdAt: 0 };
      add(createNode('text', { name: 'f', props: { text: 'x' }, styles: { 'font-family': "Evil'); } body{display:none} /*" } }));
      doc.pages[0].name = '../../etc/passwd<script>';
    });
    expect(audit(out.html)).toEqual([]);
    expect(out.html).not.toMatch(/javascript:|<script|onload|evil\/x\.svg|<foreignObject/i);
    expect([...out.html.matchAll(/<style>([^<]*)<\/style>/g)].map((m) => m[1])).toEqual(['.cls-1{fill: red}']);
    expect(out.css).not.toMatch(/body\s*\{\s*display:\s*none/);
    for (const f of out.files) {
      expect(f.path).not.toMatch(/\.\.|<|>|^\//);
    }
    void d;
  });
});

describe('sanitizers', () => {
  it('safeUrl / safeTag / safeAttrs', () => {
    for (const u of JS_URLS) expect(safeUrl(u)).toBe('#');
    expect(safeUrl('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeUrl('data:image/png;base64,AAAA')).toContain('data:image/png');
    expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    for (const t of ['script', 'IFRAME', 'img onerror=1', '', undefined, 'a>b', 'style', 'object']) expect(safeTag(t, 'div')).toBe('div');
    expect(safeTag('Section', 'div')).toBe('section');
    const attrs = safeAttrs({ onclick: 'x', ONERROR: 'x', style: 'x', href: 'javascript:1', 'data-ok': '1', 'x y': '1', '"><x': '1', srcdoc: 'x', 'data-kid': 'evil' }, new Set());
    expect(attrs).toEqual([['href', '#'], ['data-ok', '1']]);
  });

  it('cleanValue keeps a value inside its declaration', () => {
    const cases = ['red;} body{display:none}', 'a /* b', 'a */ b', '"unterminated\n} .x{y:z}', "'}", 'url(javascript:alert(1))', 'URL( "jav&#x61;script:1" )', 'url(\\6a avascript:alert(1))', 'expression(alert(1))', 'e\\xpression(alert(1))', '</style><script>', '</STYLE >', 'calc(1px', '@import url(x)', 'x\u2028} .y{z:1}'];
    for (const c of cases) {
      const v = cleanValue(c);
      expect(v, c).not.toMatch(/[{}]/);
      expect(v, c).not.toMatch(/<\/(style|script)/i);
      expect(v, c).not.toMatch(/[\r\n\u2028\u2029]/);
      expect(v.replace(/"[^"\\]*(\\.[^"\\]*)*"|'[^'\\]*(\\.[^'\\]*)*'/g, ''), c).not.toMatch(/["'*;]|\/\*/);
      expect(v, c).not.toMatch(/javascript\s*:/i);
      expect(v, c).not.toMatch(/expression\s*\(/i);
      const opens = (v.match(/\(/g) ?? []).length;
      expect(v.match(/\)/g)?.length ?? 0, c).toBeGreaterThanOrEqual(opens);
    }
    expect(cleanValue('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(cleanValue('url("data:image/png;base64,AA==") center / cover')).toBe('url("data:image/png;base64,AA==") center / cover');
    expect(cleanValue('1px solid red !important')).toBe('1px solid red !important');
    expect(cleanValue("'Inter Variable', sans-serif")).toBe("'Inter Variable', sans-serif");
    expect(neutralizeCssUrls('url(https://a.b/c.png)')).toBe('url(https://a.b/c.png)');
    expect(sanitizeStylesheet('a{b:url(javascript:1)}</style><b>')).toBe('a{b:url(about:blank)}<\\/style><b>');
  });

  it('rich text: tags, links and inline styles are restricted', () => {
    const out = sanitizeRichText('<b onclick="x()">a</b><script>x</script><a href="javascript:alert(1)" target="_blank">l</a><span style="color:red;position:fixed;inset:0;background:url(https://t.example/p.gif);font-weight:700;width:9999px">s</span><img src=x onerror=1><svg><a xlink:href="javascript:1">q</a></svg>');
    expect(out).not.toMatch(/script|onclick|onerror|javascript|<img|<svg|position|url\(|inset|width/i);
    expect(out).toContain('color: red');
    expect(out).toContain('font-weight: 700');
    expect(out).toContain('rel="noopener"');
    expect(filterRichStyle('color:red;background-image:url(x)')).toBe('color: red');
  });

  it('svg: no scripts, no external <use>, no javascript hrefs, no page-wide styles', () => {
    const out = sanitizeSvgMarkup('<svg viewBox="0 0 10 10" onload="x()"><script>x</script><defs><path id="p" d="M0 0"/></defs><use href="#p"/><use href="https://evil/x.svg#a"/><use xlink:href="data:image/svg+xml;base64,AAAA"/><a xlink:href="javascript:alert(1)"><text>x</text></a><animate attributeName="href" values="javascript:alert(1)"/><set attributeName="xlink:href" to="javascript:1"/><g style="fill:url(javascript:alert(1))"><rect/></g><foreignObject><iframe></iframe></foreignObject><style>.cls-1{fill:red}body{display:none}.k-panel{x:y}*{x:y}svg path{stroke:blue}@import url(//evil/x.css);.a,.k-b{x:y}</style></svg>');
    expect(out).not.toMatch(/script|onload|javascript|evil|iframe|foreignobject|body\{|k-panel|\*\{|@import|k-b/i);
    expect(out).toContain('href="#p"');
    expect(out).toContain('.cls-1');
    expect(out).toContain('svg path');
  });

  it('filterSvgCss rejects selectors that could reach the page', () => {
    for (const bad of ['body{x:y}', 'html{x:y}', ':root{x:y}', '*{x:y}', '[data-kid]{x:y}', '.k-panel{x:y}', '.kc-root{x:y}', 'div{x:y}', 'svg>g{x:y}', ':not(body){x:y}', '.a,body{x:y}', '@media screen{.a{x:y}}', '@font-face{src:url(x)}'])
      expect(filterSvgCss(bad), bad).toBe('');
    expect(filterSvgCss('.a{fill:red;position:fixed}')).toBe('.a{fill: red}');
    expect(filterSvgCss('@keyframes spin{from{opacity:0}to{opacity:1}}')).toContain('@keyframes spin');
  });
});

describe('scopeCss (canvas custom css)', () => {
  it('prefixes every rule, including those inside at-rules, and drops @import', () => {
    const out = scopeCss('@import url(//evil/x.css);\n/* c */ body{margin:0} h1, .a > b{color:red}\n@media (max-width:600px){ .k-panel{display:none} .x{y:z} }\n@keyframes k{from{opacity:0}to{opacity:1}}\n@font-face{font-family:x;src:url(a)}\n@supports (display:grid){ @media print { p{q:r} } }');
    expect(out).not.toMatch(/import/);
    expect(out).toContain('.kc-root {margin:0}');
    expect(out).toContain('.kc-root h1, .kc-root .a > b');
    expect(out).toContain('.kc-root .k-panel');
    expect(out).toContain('.kc-root .x');
    expect(out).toContain('.kc-root p');
    expect(out).toContain('@keyframes k {from{opacity:0}to{opacity:1}}');
    expect(out).not.toMatch(/(^|[{}]\s*)\.k-panel/);
    // selectors that merely contain braces/commas inside strings or attributes stay intact
    expect(scopeCss('a[title="x,y{"]{c:d}')).toContain('.kc-root a[title="x,y{"]');
    // unbalanced input does not hang or throw
    expect(() => scopeCss('a{b:c')).not.toThrow();
    expect(() => scopeCss('}}}{{{ @media')).not.toThrow();
  });
});

describe('document integrity on hostile input', () => {
  it('repairDocument fixes malformed shapes instead of crashing', () => {
    const bad = JSON.parse('{"pages":[{"id":"p","name":"x","rootId":"r"},{"id":"q","name":"gone","rootId":"nope"}],"nodes":{"r":{"id":"r","type":"frame","name":"r","parent":null,"children":["a","a","zz","r"],"props":null,"styles":null},"a":{"id":"a","type":"weird","name":"a","parent":"r","children":"nope","props":{},"styles":{"base":{}}},"loop1":{"id":"loop1","type":"box","name":"l","parent":"loop2","children":["loop2"],"props":{},"styles":{"base":{}}},"loop2":{"id":"loop2","type":"box","name":"l","parent":"loop1","children":["loop1"],"props":{},"styles":{"base":{}}},"bad":5,"__proto__":{"polluted":true}},"components":{"c":{"id":"c","name":"c","rootId":"missing"}},"assets":null,"tokens":null,"breakpoints":[],"settings":null}');
    const issues = repairDocument(bad as KDocument);
    expect(issues.length).toBeGreaterThan(0);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(bad.pages.map((p: { id: string }) => p.id)).toEqual(['p']);
    expect(bad.nodes.r.children).toEqual(['a']);
    expect(bad.nodes.a.type).toBe('box');
    expect(bad.nodes.loop1).toBeUndefined();
    expect(bad.nodes.bad).toBeUndefined();
    expect(Object.keys(bad.components)).toEqual([]);
    expect(bad.breakpoints[0].id).toBe('base');
    expect(bad.tokens.colors.length).toBeGreaterThan(0);
    expect(repairDocument(bad as KDocument)).toEqual([]);
    // and the repaired document compiles
    expect(() => compileSiteText(bad as KDocument, {})).not.toThrow();
    // empty document gets a page
    const empty = { pages: [], nodes: {}, components: {}, assets: {}, tokens: bad.tokens, breakpoints: bad.breakpoints, settings: { gridSize: 8, title: '' }, version: 1 } as KDocument;
    repairDocument(empty);
    expect(empty.pages.length).toBe(1);
  });

  it('repairNodeSet only keeps sound trees', () => {
    const nodes = {
      r: { id: 'r', type: 'box', name: 'r', parent: null, children: ['c'], props: {}, styles: { base: {} } },
      c: { id: 'c', type: 'text', name: 'c', parent: 'r', children: [], props: {}, styles: { base: {} } },
      x: { id: 'x', type: 'text', name: 'x', parent: 'nope', children: [], props: {}, styles: { base: {} } },
    } as unknown as Record<string, KNode>;
    expect(repairNodeSet(nodes, ['r', 'missing'])).toEqual(['r']);
    expect(nodes.x).toBeUndefined();
    expect(repairNodeSet(null as never, ['r'])).toEqual([]);
  });

  it('safeJsonParse drops __proto__ keys', () => {
    const o = safeJsonParse<Record<string, any>>('{"a":{"__proto__":{"polluted":1},"b":2},"__proto__":{"x":1}}');
    expect(Object.keys(o)).toEqual(['a']);
    expect(Object.keys(o.a)).toEqual(['b']);
    expect(Object.assign({}, o.a)).not.toHaveProperty('polluted');
  });
});

describe('import hardening', () => {
  const goodDoc = () => createDocument('x');
  const pkg = async (files: Record<string, string | Uint8Array>) => {
    const zip = new JSZip();
    for (const [k, v] of Object.entries(files)) zip.file(k, v);
    return zip.generateAsync({ type: 'uint8array' });
  };
  const project = (doc: unknown) => JSON.stringify({ format: 'kinema-project', formatVersion: 1, id: '../../evil', name: 'n', createdAt: 1, updatedAt: 1, document: doc });

  it('rejects non-packages, wrong formats, missing pages and newer versions with friendly errors', async () => {
    await expect(unpackProject(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(KinemaFileError);
    await expect(unpackProject(await pkg({ 'other.txt': 'x' }))).rejects.toBeInstanceOf(KinemaFileError);
    await expect(unpackProject(await pkg({ 'project.json': '{not json' }))).rejects.toBeInstanceOf(KinemaFileError);
    await expect(unpackProject(await pkg({ 'project.json': JSON.stringify({ format: 'nope' }) }))).rejects.toBeInstanceOf(KinemaFileError);
    await expect(unpackProject(await pkg({ 'project.json': project({ pages: [], nodes: {} }) }))).rejects.toBeInstanceOf(KinemaFileError);
  });

  it('strips __proto__ and tolerates asset entries that point outside the package', async () => {
    const doc = goodDoc();
    const text = project(doc).replace('"document":{', '"document":{"__proto__":{"polluted":true},');
    const withAsset = text.replace('"assets":{}', '"assets":{"a":{"id":"a","name":"x","kind":"image","mime":"image/png","size":1,"path":"../../outside.png","createdAt":0},"b":null,"c":{"path":5}}');
    const { file, assets } = await unpackProject(await pkg({ 'project.json': withAsset, '../../outside.png': new Uint8Array([1]) }));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(file.document, '__proto__')).toBe(false);
    expect([...assets.keys()].every((k) => !k.startsWith('/'))).toBe(true);
  });

  it('clipboard payloads are repaired or refused', () => {
    const bad = JSON.stringify({ kinema: 'nodes', version: 1, roots: ['r', 5, 'nope'], parents: {}, nodes: { __proto__: 1, r: { id: 'r', type: 'x', name: 1, parent: 'zzz', children: 7 } }, components: { c: { component: { rootId: 'q' }, nodes: {} }, d: 5 }, assets: { a: 1 } });
    const p = parsePayload(bad);
    expect(p).not.toBeNull();
    expect(p!.roots).toEqual(['r']);
    expect(p!.nodes.r.type).toBe('box');
    expect(p!.nodes.r.parent).toBeNull();
    expect(Array.isArray(p!.nodes.r.children)).toBe(true);
    expect(Object.keys(p!.components)).toEqual([]);
    expect(Object.keys(p!.assets)).toEqual([]);
    expect(parsePayload('{"kinema":"nodes","roots":[],"nodes":{}}')).toBeNull();
    expect(parsePayload('{"kinema":"nodes","roots":["r"],"nodes":{"r":5}}')).toBeNull();
  });

  it('library packs drop broken component items', () => {
    const good = { id: 'g', kind: 'component', name: 'g', tags: [], createdAt: 0, updatedAt: 0, data: { rootId: 'r', nodes: { r: { id: 'r', type: 'box', name: 'r', parent: null, children: [], props: {}, styles: { base: {} } } } } };
    const broken = { id: 'b', kind: 'component', name: 'b', tags: [], createdAt: 0, updatedAt: 0, data: { rootId: 'missing', nodes: {} } };
    const junk = { id: 'j', kind: 'component', name: 'j', tags: [], createdAt: 0, updatedAt: 0, data: 'str' };
    const out = normalizeLibrary({ items: [good, broken, junk, null, { id: 5 }] as never, folders: [] });
    expect(out.items.map((i) => i.id)).toEqual(['g']);
  });
});

describe('html importer + exporter end to end', () => {
  it('hostile pasted html cannot reach the exported page as script', async () => {
    const { importHtmlAsSubtree } = await import('@/core/io/htmlImport');
    const markup = `<div onclick="alert(1)" style="background:url(javascript:alert(1));color:red}</style><script>alert(1)</script>">
      <a href="javascript:alert(1)" onmouseover="alert(1)">x</a><img src="javascript:alert(1)" onerror="alert(1)">
      <script>alert(1)</script><iframe src="javascript:alert(1)"></iframe><object data="x"></object><base href="//evil/">
      <p>t<img src=x onerror=alert(1)><svg><script>alert(1)</script><use href="//evil/x.svg#a"/></svg></p>
      <button formaction="javascript:alert(1)" onclick="x()">b</button><form action="javascript:alert(1)"><input name="a" value="&quot; onfocus=alert(1) x=&quot;"></form>
      <style>@import url(//evil/x.css); body{display:none} .k-panel{display:none}</style>
      <custom-thing id="x&quot;><script>alert(1)</script>">hi</custom-thing></div>`;
    const res = importHtmlAsSubtree(markup, { breakpoints: createDocument().breakpoints });
    expect(res).not.toBeNull();
    const d = createDocument('Imported');
    const root = d.pages[0].rootId;
    for (const n of Object.values(res!.nodes)) d.nodes[n.id] = n;
    d.nodes[res!.rootId].parent = root;
    d.nodes[root].children.push(res!.rootId);
    expect(repairDocument(d)).toEqual([]);
    const r = compileSiteText(d, { bundle: 'single' });
    const page = r.files[0].data as string;
    expect(audit(page)).toEqual([]);
    const dom = new DOMParser().parseFromString(page, 'text/html');
    expect(dom.querySelectorAll('script:not([src])').length).toBe(0);
    expect(page.match(/.{0,60}(evil|javascript:|onerror|onclick).{0,40}/is)?.[0]).toBeUndefined();
  });
});

import { filterRichStyle as _filterRichStyle } from '@/core/export/sanitize';
describe('rich text gradient spans', () => {
  it('keeps background-clip:text so gradient text renders', () => {
    const out = _filterRichStyle('background: linear-gradient(90deg, red, blue); -webkit-background-clip: text; background-clip: text; color: transparent; position: fixed');
    expect(out).toContain('background-clip: text');
    expect(out).toContain('-webkit-background-clip: text');
    expect(out).not.toContain('position');
  });
});
