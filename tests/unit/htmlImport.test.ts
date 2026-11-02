import { describe, expect, it } from 'vitest';
import { importHtml, transformToChannels } from '@/core/io/htmlImport';
import { mediaMatches, parseCss, specificity } from '@/core/io/cssParser';
import { DEFAULT_BREAKPOINTS } from '@/core/model/factory';

const bps = DEFAULT_BREAKPOINTS;

describe('css parser', () => {
  it('parses rules, media, keyframes', () => {
    const rules = parseCss(`/* c */ @import url(x.css); .a, .b > p { color: red; padding: 4px 8px }
      @media (max-width: 640px) { .a { color: blue } }
      @keyframes fade { from { opacity: 0 } to { opacity: 1 } }`);
    expect(rules[0]).toMatchObject({ type: 'style', selector: '.a, .b > p', decls: { color: 'red', padding: '4px 8px' } });
    expect(rules[1]).toMatchObject({ type: 'media', query: '(max-width: 640px)' });
    expect(rules[2]).toMatchObject({ type: 'keyframes', name: 'fade' });
  });
  it('evaluates media queries', () => {
    expect(mediaMatches('(max-width: 640px)', 390)).toBe(true);
    expect(mediaMatches('(max-width: 640px)', 768)).toBe(false);
    expect(mediaMatches('screen and (min-width: 48rem)', 768)).toBe(true);
    expect(mediaMatches('print', 1440)).toBe(false);
    expect(mediaMatches('(width >= 1024px)', 1440)).toBe(true);
  });
  it('specificity ordering', () => {
    expect(specificity('#a')).toBeGreaterThan(specificity('.a.b.c'));
    expect(specificity('.a')).toBeGreaterThan(specificity('div p'));
  });
});

describe('html import', () => {
  it('maps elements, classes, media and states', () => {
    const html = `
      <style>
        .hero { display: flex; gap: 24px; padding: 64px }
        .hero h1 { font-size: 56px; color: #111 }
        .btn { background: #7c5cff; color: #fff; border-radius: 10px }
        .btn:hover { background: #6a4cf0 }
        @media (max-width: 1024px) { .hero { flex-direction: column } }
        @media (max-width: 640px) { .hero h1 { font-size: 36px } .hero { padding: 24px } }
        @keyframes rise { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: none } }
        .hero h1 { animation: rise .6s cubic-bezier(.2,.8,.2,1) .1s both }
      </style>
      <section class="hero" data-kid="keep_me">
        <h1>Build <em>faster</em></h1>
        <p>Some text</p>
        <a class="btn" href="/go">Get started</a>
        <img src="https://x/y.png" alt="Shot">
        <ul><li>One</li><li>Two</li></ul>
      </section>`;
    const r = importHtml(html, { breakpoints: bps, keepIds: true });
    expect(r.rootIds).toHaveLength(1);
    const hero = r.nodes[r.rootIds[0]];
    expect(hero.id).toBe('keep_me');
    expect(hero.type).toBe('box');
    expect(hero.tag).toBe('section');
    expect(hero.name).toBe('Hero');
    expect(hero.styles.base).toMatchObject({ display: 'flex', gap: '24px', padding: '64px' });
    expect(hero.styles.tablet).toEqual({ 'flex-direction': 'column' });
    expect(hero.styles.mobile).toEqual({ padding: '24px' });
    const [h1, p, a, img, ul] = hero.children.map((id) => r.nodes[id]);
    expect(h1.type).toBe('text');
    expect(h1.tag).toBe('h1');
    expect(h1.props.text).toBe('Build <em>faster</em>');
    expect(h1.styles.mobile).toEqual({ 'font-size': '36px' });
    expect(h1.animations?.[0]).toMatchObject({ duration: 600, delay: 100, fill: 'both', trigger: 'load' });
    expect(h1.animations?.[0].keyframes[0].values).toMatchObject({ opacity: 0, y: 20 });
    expect(h1.styles.base.animation).toBeUndefined();
    expect(p.type).toBe('text');
    expect(a.type).toBe('link');
    expect(a.props.text).toBe('Get started');
    expect(a.states?.hover).toEqual({ background: '#6a4cf0' });
    expect(img.type).toBe('image');
    expect(img.props.src).toBe('https://x/y.png');
    expect(ul.children).toHaveLength(2);
    expect(r.nodes[ul.children[0]].tag).toBe('li');
  });
  it('handles mixed content, mobile-first css, page styles and strips scripts', () => {
    const html = `<style>:root{--brand:#f00} body{background:#fafafa} .g{display:block} @media (min-width: 1025px){ .g{display:grid; grid-template-columns:1fr 1fr} }</style>
      <div class="g">Hello <b>world</b><div>Block</div><script>alert(1)</script><button onclick="x()">Go</button></div>`;
    const r = importHtml(html, { breakpoints: bps });
    const g = r.nodes[r.rootIds[0]];
    expect(g.styles.base).toMatchObject({ display: 'grid', 'grid-template-columns': '1fr 1fr' });
    expect(g.styles.tablet).toEqual({ display: 'block', 'grid-template-columns': 'revert' });
    expect(r.pageStyles.base).toMatchObject({ '--brand': '#f00', background: '#fafafa' });
    const kids = g.children.map((id) => r.nodes[id]);
    expect(kids[0].type).toBe('text');
    expect(kids[0].props.text).toBe('Hello <b>world</b>');
    expect(kids[1].type).toBe('text');
    expect(kids[2].type).toBe('button');
    expect(kids[2].props.attrs?.onclick).toBeUndefined();
    expect(JSON.stringify(r.nodes)).not.toContain('alert');
  });
  it('transform parsing', () => {
    expect(transformToChannels('translateY(20px) scale(.9) rotate(0.5turn)')).toEqual({ y: 20, scale: 0.9, rotate: 180 });
    expect(transformToChannels('matrix(1,0,0,1,0,0)')).toBeNull();
    expect(transformToChannels('none')).toEqual({});
  });
});
