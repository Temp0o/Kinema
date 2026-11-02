import { describe, expect, it } from 'vitest';
import { splitTopLevel, splitSpaces, lengthToPx, parseTime } from '@/ui/color/cssValue';
import { tokenNameOf, toColord, formatColor, colorKey, collectDocColors, isColorValue, detectMode } from '@/ui/color/colorUtils';
import { parseGradient, serializeGradient, colorAt, distributeStops } from '@/ui/color/gradient';
import { parseShadows, serializeShadows } from '@/ui/color/shadow';
import { parseFill, fillPatch, parseBackgroundShorthand } from '@/features/properties/lib/background';
import { expandBox, collapseBox, readBox, boxPatch, readRadius, radiusPatch, readBorder, summarizeBorder, borderPatch } from '@/features/properties/lib/box';
import { parseFilters, serializeFilters, setFilterValue, parseTransition, serializeTransition, transitionPresetOf, readScaleTranslate, isSimpleTransform } from '@/features/properties/lib/effects';
import { parseSize, sizePatch, countTracks, setTrackCount, flexToGrid, gridToFlex, readPlaceItems, flexGrows } from '@/features/properties/lib/layout';
import { htmlToPlain, plainToHtml, hasRichFormatting, extractSvgColors, replaceSvgColor, svgToCurrentColor, attrNameError } from '@/features/properties/lib/content';
import { createDocument, createNode } from '@/core/model/factory';

const tokens = [
  { name: 'primary', value: '#7c5cff' },
  { name: 'alias', value: 'var(--k-primary)' },
];

describe('css value tokenizing', () => {
  it('splits at top level only', () => {
    expect(splitTopLevel('linear-gradient(red, blue), url("a,b.png")', ',')).toEqual(['linear-gradient(red, blue)', 'url("a,b.png")']);
    expect(splitSpaces('1px solid rgb(0, 0, 0)')).toEqual(['1px', 'solid', 'rgb(0, 0, 0)']);
    expect(splitTopLevel('', ',')).toEqual([]);
  });
  it('converts lengths and times', () => {
    expect(lengthToPx('2rem')).toBe(32);
    expect(lengthToPx('-4px')).toBe(-4);
    expect(lengthToPx('50%')).toBeNull();
    expect(parseTime('0.3s')).toBe(300);
    expect(parseTime('120ms')).toBe(120);
  });
});

describe('color helpers', () => {
  it('detects and resolves token references', () => {
    expect(tokenNameOf('var(--k-primary)')).toBe('primary');
    expect(tokenNameOf('var(--other)')).toBeNull();
    expect(toColord('var(--k-alias)', tokens)?.toHex()).toBe('#7c5cff');
    expect(toColord('var(--k-missing, #fff)', tokens)?.toHex()).toBe('#ffffff');
    expect(toColord('currentColor')).toBeNull();
    expect(toColord('transparent')?.alpha()).toBe(0);
  });
  it('formats in all modes', () => {
    const c = toColord('rgba(255, 0, 0, 0.5)')!;
    expect(formatColor(c, 'hex')).toBe('#ff000080');
    expect(formatColor(c, 'rgb')).toBe('rgba(255, 0, 0, 0.5)');
    expect(formatColor(c, 'hsl')).toBe('hsla(0, 100%, 50%, 0.5)');
    expect(colorKey('RED')).toBe('#ff0000');
    expect(detectMode('hsl(1,2%,3%)')).toBe('hsl');
    expect(isColorValue('var(--k-x)')).toBe(true);
    expect(isColorValue('banana')).toBe(false);
  });
  it('collects document colors by frequency', () => {
    const doc = createDocument();
    const a = createNode('box', { styles: { 'background-color': '#ff0000', color: '#00f' } });
    const b = createNode('box', { styles: { 'background-color': '#FF0000', 'box-shadow': '0 1px 2px rgba(0,0,0,0.5)' } });
    doc.nodes[a.id] = a;
    doc.nodes[b.id] = b;
    const colors = collectDocColors(doc);
    expect(colors[0]).toBe('#ff0000');
    expect(colors).toContain('#0000ff');
    expect(colors).toContain('#00000080');
  });
});

describe('gradients', () => {
  it('parses linear gradients with angles and sides', () => {
    const g = parseGradient('linear-gradient(45deg, #fff 0%, rgba(0, 0, 0, 0.5) 100%)')!;
    expect(g.type).toBe('linear');
    expect(g.angle).toBe(45);
    expect(g.stops).toEqual([
      { color: '#fff', pos: 0 },
      { color: 'rgba(0, 0, 0, 0.5)', pos: 100 },
    ]);
    expect(parseGradient('linear-gradient(to right, red, blue)')!.angle).toBe(90);
    expect(parseGradient('linear-gradient(to top left, red, blue)')!.angle).toBe(315);
    expect(parseGradient('linear-gradient(red, blue)')!.angle).toBe(180);
    expect(parseGradient('linear-gradient(0.25turn, red, blue)')!.angle).toBe(90);
  });
  it('distributes missing stop positions', () => {
    const g = parseGradient('linear-gradient(90deg, red, var(--k-primary), blue 80%, green)')!;
    expect(g.stops.map((s) => s.pos)).toEqual([0, 40, 80, 100]);
    expect(g.stops[1].color).toBe('var(--k-primary)');
    expect(distributeStops([{ color: 'a', pos: 50 }, { color: 'b', pos: 10 }]).map((s) => s.pos)).toEqual([50, 50]);
  });
  it('parses radial and conic gradients and round-trips', () => {
    const r = parseGradient('radial-gradient(circle at 30% 20%, #fff, #000 70%)')!;
    expect(r.type).toBe('radial');
    expect(r.shape).toBe('circle');
    expect(r.at).toBe('30% 20%');
    expect(serializeGradient(r)).toBe('radial-gradient(circle at 30% 20%, #fff 0%, #000 70%)');
    const c = parseGradient('conic-gradient(from 90deg, red, blue)')!;
    expect(c.angle).toBe(90);
    expect(serializeGradient(c)).toBe('conic-gradient(from 90deg, red 0%, blue 100%)');
    expect(parseGradient('repeating-linear-gradient(45deg, red 0 10px, blue 10px 20px)')?.repeating).toBe(true);
    expect(parseGradient('url(x.png)')).toBeNull();
  });
  it('interpolates color at a position', () => {
    const g = parseGradient('linear-gradient(90deg, #000000 0%, #ffffff 100%)')!;
    expect(colorAt(g, 50)).toBe('#808080');
  });
});

describe('shadows', () => {
  it('parses multiple shadows with inset and colors', () => {
    const s = parseShadows('0 4px 12px rgba(0, 0, 0, 0.2), inset 0 0 0 1px #fff')!;
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0, 0, 0, 0.2)', inset: false });
    expect(s[1].inset).toBe(true);
    expect(s[1].spread).toBe(1);
    expect(parseShadows('#000 2px 2px')![0].color).toBe('#000');
    expect(parseShadows('none')).toEqual([]);
    expect(parseShadows('garbage here')).toBeNull();
  });
  it('serializes shadows (text shadows omit spread/inset)', () => {
    const list = parseShadows('inset 0 4px 12px 2px red')!;
    expect(serializeShadows(list)).toBe('inset 0 4px 12px 2px red');
    expect(serializeShadows(list, { text: true })).toBe('0 4px 12px red');
    expect(serializeShadows([])).toBeNull();
  });
});

describe('background / fill', () => {
  it('parses solid colors from shorthand and longhand', () => {
    expect(parseFill({ background: '#fff' })).toMatchObject({ type: 'solid', color: '#fff' });
    expect(parseFill({ background: 'var(--k-primary)' })).toMatchObject({ type: 'solid', color: 'var(--k-primary)' });
    expect(parseFill({ 'background-color': 'red' }).type).toBe('solid');
    expect(parseFill({ 'background-color': 'transparent' }).type).toBe('none');
    expect(parseFill({}).type).toBe('none');
  });
  it('parses gradient and image shorthands (AI style)', () => {
    const f = parseFill({ background: 'linear-gradient(135deg, #7c5cff 0%, #22d3ee 100%)' });
    expect(f.type).toBe('linear');
    expect(f.gradient?.angle).toBe(135);
    const img = parseFill({ background: 'url(asset:abc) center / cover no-repeat #111' });
    expect(img.type).toBe('image');
    expect(img.image).toEqual({ url: 'asset:abc', size: 'cover', position: 'center', repeat: 'no-repeat' });
    expect(img.color).toBe('#111');
    expect(parseBackgroundShorthand('url("a b.png") 10px 20px / 50% auto repeat-x')).toMatchObject({ position: '10px 20px', size: '50% auto', repeat: 'repeat-x' });
  });
  it('later longhands override the shorthand', () => {
    const f = parseFill({ background: 'linear-gradient(red, blue)', 'background-image': 'none', 'background-color': '#000' });
    expect(f.type).toBe('solid');
    expect(f.color).toBe('#000');
  });
  it('falls back to raw for multi-layer values', () => {
    const f = parseFill({ background: 'radial-gradient(red, blue), linear-gradient(green, white), #000' });
    expect(f.type).toBe('raw');
    expect(f.raw?.prop).toBe('background');
    const g = parseFill({ 'background-image': 'url(a.png), url(b.png)' });
    expect(g.raw).toEqual({ prop: 'background-image', value: 'url(a.png), url(b.png)' });
  });
  it('serializes to longhands and clears the shorthand', () => {
    const f = parseFill({ background: 'linear-gradient(90deg, red, blue)' });
    const p = fillPatch(f, false);
    expect(p.background).toBeNull();
    expect(p['background-image']).toBe('linear-gradient(90deg, red 0%, blue 100%)');
    expect(p['background-color']).toBeNull();
    expect(fillPatch({ ...f, type: 'solid', color: '#fff' }, true)).toMatchObject({ 'background-color': '#fff', 'background-image': 'none' });
    expect(fillPatch({ type: 'none', color: null, gradient: null, image: null, raw: null }, true)['background-color']).toBe('transparent');
    expect(
      fillPatch({ type: 'image', color: null, gradient: null, raw: null, image: { url: 'asset:x', size: 'cover', position: 'center', repeat: 'no-repeat' } }, false),
    ).toMatchObject({ 'background-image': 'url(asset:x)', 'background-size': 'cover' });
  });
});

describe('box model', () => {
  it('expands and collapses shorthands', () => {
    expect(expandBox('10px 20px')).toEqual(['10px', '20px', '10px', '20px']);
    expect(expandBox('1px 2px 3px')).toEqual(['1px', '2px', '3px', '2px']);
    expect(collapseBox(['4px', '4px', '4px', '4px'])).toBe('4px');
    expect(collapseBox(['1px', '2px', '1px', '2px'])).toBe('1px 2px');
    expect(collapseBox(['1px', '2px', '3px', '2px'])).toBe('1px 2px 3px');
  });
  it('reads shorthand + longhands in declaration order', () => {
    expect(readBox({ padding: '10px 20px', 'padding-top': '0' }, 'padding')).toEqual(['0', '20px', '10px', '20px']);
    expect(readBox({ 'padding-top': '0', padding: '10px 20px' }, 'padding')).toEqual(['10px', '20px', '10px', '20px']);
    expect(readBox({ 'margin-left': 'auto' }, 'margin')).toEqual(['', '', '', 'auto']);
  });
  it('expands to longhands when sides differ and collapses when equal', () => {
    expect(boxPatch('padding', ['12px', '20px', '10px', '20px'])).toEqual({
      padding: null,
      'padding-top': '12px',
      'padding-right': '20px',
      'padding-bottom': '10px',
      'padding-left': '20px',
    });
    expect(boxPatch('padding', ['8px', '8px', '8px', '8px'])).toEqual({
      padding: '8px',
      'padding-top': null,
      'padding-right': null,
      'padding-bottom': null,
      'padding-left': null,
    });
    expect(boxPatch('margin', ['', '', '', 'auto'])['margin-left']).toBe('auto');
  });
  it('handles radius corners', () => {
    expect(readRadius({ 'border-radius': '8px 4px' })).toEqual(['8px', '4px', '8px', '4px']);
    expect(readRadius({ 'border-radius': '8px', 'border-top-left-radius': '0' })).toEqual(['0', '8px', '8px', '8px']);
    expect(radiusPatch(['4px', '4px', '4px', '4px'])['border-radius']).toBe('4px');
    expect(radiusPatch(['', '', '', ''])['border-radius']).toBeNull();
  });
  it('reads and writes borders', () => {
    const b = summarizeBorder(readBorder({ border: '1px solid #ccc' }))!;
    expect(b).toEqual({ widths: [1, 1, 1, 1], style: 'solid', color: '#ccc' });
    const only = summarizeBorder(readBorder({ 'border-bottom': '2px dashed rgba(0, 0, 0, 0.1)' }))!;
    expect(only.widths).toEqual([0, 0, 2, 0]);
    expect(only.style).toBe('dashed');
    expect(summarizeBorder(readBorder({ border: 'none' }))).toBeNull();
    expect(borderPatch({ widths: [1, 1, 1, 1], style: 'solid', color: 'red' }, false).border).toBe('1px solid red');
    const ind = borderPatch({ widths: [0, 0, 2, 0], style: 'solid', color: 'red' }, false);
    expect(ind['border-width']).toBe('0 0 2px');
    expect(ind.border).toBeNull();
    expect(borderPatch(null, true).border).toBe('none');
    expect(borderPatch(null, false).border).toBeNull();
  });
});

describe('effects', () => {
  it('parses and serializes filters, keeping unknown functions', () => {
    const f = parseFilters('blur(4px) brightness(1.2) drop-shadow(0 1px 2px red) hue-rotate(0.5turn)');
    expect(f[0]).toEqual({ name: 'blur', value: 4 });
    expect(f[1]).toEqual({ name: 'brightness', value: 120 });
    expect(f[2].raw).toBe('drop-shadow(0 1px 2px red)');
    expect(f[3].value).toBe(180);
    expect(serializeFilters(f)).toBe('blur(4px) brightness(120%) drop-shadow(0 1px 2px red) hue-rotate(180deg)');
    expect(setFilterValue('saturate(150%)', 'blur', 10)).toBe('blur(10px) saturate(150%)');
    expect(setFilterValue('blur(10px)', 'blur', null)).toBeNull();
  });
  it('parses transitions', () => {
    expect(parseTransition('all 0.3s ease-out')).toEqual({ properties: ['all'], duration: 300, easing: 'ease-out', delay: 0 });
    const m = parseTransition('opacity 200ms cubic-bezier(0.2, 0, 0, 1) 50ms, transform 200ms cubic-bezier(0.2, 0, 0, 1) 50ms');
    expect(m).toEqual({ properties: ['opacity', 'transform'], duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)', delay: 50 });
    expect(parseTransition('opacity 1s, transform 2s')).toBe('raw');
    expect(parseTransition('none')).toBeNull();
    expect(serializeTransition({ properties: ['opacity'], duration: 150, easing: 'ease', delay: 0 })).toBe('opacity 150ms ease');
    expect(transitionPresetOf(['background-color', 'color', 'border-color', 'fill', 'stroke'])).toBe('colors');
    expect(transitionPresetOf(['width'])).toBe('custom');
  });
  it('reads scale/translate', () => {
    expect(readScaleTranslate({ scale: '1.05', translate: '0 -2px' })).toEqual({ scale: 1.05, tx: 0, ty: -2 });
    expect(readScaleTranslate({ transform: 'translateY(-4px) scale(0.98)' })).toEqual({ scale: 0.98, tx: 0, ty: -4 });
    expect(isSimpleTransform('scale(1.1) translate(1px, 2px)')).toBe(true);
    expect(isSimpleTransform('rotate(4deg)')).toBe(false);
  });
});

describe('layout', () => {
  const off = (v: string) => v;
  it('parses size modes', () => {
    expect(parseSize({ width: '240px' }, 'width', false)).toEqual({ mode: 'px', n: 240 });
    expect(parseSize({ width: '100%' }, 'width', false).mode).toBe('fill');
    expect(parseSize({ width: '50vw' }, 'width', false)).toEqual({ mode: 'vw', n: 50 });
    expect(parseSize({ width: 'fit-content' }, 'width', false).mode).toBe('hug');
    expect(parseSize({}, 'height', false).mode).toBe('auto');
    expect(parseSize({ flex: '1' }, 'width', true).mode).toBe('fill');
    expect(parseSize({ width: 'calc(100% - 20px)' }, 'width', false)).toMatchObject({ mode: 'raw', raw: 'calc(100% - 20px)' });
    expect(flexGrows({ flex: '0 0 auto' })).toBe(false);
  });
  it('writes size patches', () => {
    expect(sizePatch('width', 'fill', null, { flexMain: true, growing: false, off })).toMatchObject({ flex: '1 1 0', width: 'auto' });
    expect(sizePatch('width', 'fill', null, { flexMain: false, growing: false, off })).toEqual({ width: '100%' });
    expect(sizePatch('width', 'px', 120, { flexMain: true, growing: true, off: () => null })).toEqual({ width: '120px', flex: null, 'flex-grow': null });
    expect(sizePatch('height', 'hug', null, { flexMain: false, growing: false, off })).toEqual({ height: 'fit-content' });
  });
  it('maps the alignment grid respecting direction', () => {
    expect(flexToGrid({ display: 'flex', 'justify-content': 'center', 'align-items': 'flex-end' })).toEqual({ h: 'center', v: 'end' });
    expect(flexToGrid({ display: 'flex', 'flex-direction': 'column', 'justify-content': 'center', 'align-items': 'flex-end' })).toEqual({ h: 'end', v: 'center' });
    expect(gridToFlex({ 'flex-direction': 'column' }, 'end', 'start', false)).toEqual({ 'align-items': 'flex-end', 'justify-content': 'flex-start' });
  });
  it('counts and edits grid tracks', () => {
    expect(countTracks('repeat(3, 1fr)')).toBe(3);
    expect(countTracks('200px 1fr auto')).toBe(3);
    expect(countTracks('repeat(auto-fill, minmax(200px, 1fr))')).toBe(1);
    expect(setTrackCount('repeat(3, 1fr)', 4)).toBe('repeat(4, 1fr)');
    expect(setTrackCount('200px 1fr', 3)).toBe('200px 1fr 1fr');
    expect(setTrackCount(undefined, 2)).toBe('repeat(2, 1fr)');
    expect(setTrackCount('1fr', 0)).toBeNull();
    expect(readPlaceItems({ 'place-items': 'center start', 'justify-items': 'end' })).toEqual({ align: 'center', justify: 'end' });
  });
});

describe('content', () => {
  it('converts rich text to plain text and back', () => {
    expect(htmlToPlain('Hello <b>world</b><br>a &amp; b')).toBe('Hello world\na & b');
    expect(plainToHtml('a < b\n"c"')).toBe('a &lt; b<br>&quot;c&quot;');
    expect(hasRichFormatting('a<br>b')).toBe(false);
    expect(hasRichFormatting('a <em>b</em>')).toBe(true);
  });
  it('detects and replaces svg colors', () => {
    const svg = '<svg fill="none"><path fill="#FF0000" stroke="red"/><circle style="fill: #00f; stroke:none"/></svg>';
    expect(extractSvgColors(svg)).toEqual(['#ff0000', '#0000ff']);
    const out = replaceSvgColor(svg, '#ff0000', '#00ff00');
    expect(out).toContain('fill="#00ff00"');
    expect(out).toContain('stroke="#00ff00"');
    expect(out).toContain('fill="none"');
    const cc = svgToCurrentColor(svg);
    expect(extractSvgColors(cc.svg)).toEqual([]);
    expect(cc.svg).toContain('fill: currentColor');
    expect(cc.color).toBe('#ff0000');
    expect(svgToCurrentColor('<svg><path d="M0"/></svg>').svg).toContain('<svg fill="currentColor"');
  });
  it('validates attribute names', () => {
    expect(attrNameError('data-test')).toBeNull();
    expect(attrNameError('aria-label')).toBeNull();
    expect(attrNameError('onclick')).toMatch(/not allowed/);
    expect(attrNameError('bad name')).toMatch(/Invalid/);
    expect(attrNameError('style')).toMatch(/managed/);
  });
});
