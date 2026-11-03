import { describe, expect, it, vi } from 'vitest';

vi.mock('@/core/fonts/designFonts', () => ({ BUNDLED_FONTS: [], SYSTEM_FONTS: [], findBundledFont: () => undefined, registerBundledFonts: () => {} }));

import { createDocument, createNode } from '@/core/model/factory';
import { insertNode } from '@/core/model/tree';
import { expandConflictingShorthands, resolveStyles, toReactStyle } from '@/core/style/style';
import { compileSiteText } from '@/core/export';

describe('canvas/export style fidelity helpers', () => {
  it('a changed breakpoint property moves behind earlier longhands, like the exported cascade', () => {
    const doc = createDocument();
    const n = createNode('box', { replaceStyles: true, styles: { padding: '10px', 'padding-top': '0px', color: 'red' } });
    n.styles.tablet = { padding: '30px', color: 'red' }; // color unchanged → keeps its place
    expect(Object.keys(resolveStyles(doc, n, 'tablet'))).toEqual(['padding-top', 'color', 'padding']);
    expect(Object.keys(resolveStyles(doc, n, 'base'))).toEqual(['padding', 'padding-top', 'color']);
    // the exported media rule really does put the shorthand after the base longhand
    insertNode(doc, n, doc.pages[0].rootId);
    const css = compileSiteText(doc, { bundle: 'files' }).files.find((f) => f.path === 'styles.css')!.data as string;
    const baseRule = /\.box-[a-z0-9]+ \{([^}]*)\}/.exec(css)![1];
    expect(baseRule.indexOf('padding:')).toBeLessThan(baseRule.indexOf('padding-top'));
    expect(css).toMatch(/@media \(max-width: 1024px\) \{[^@]*padding: 30px/);
  });

  it('shorthands that coexist with their longhands are expanded in declaration order', () => {
    expect(expandConflictingShorthands({ padding: '10px 20px', 'padding-top': '0px' })).toEqual({
      'padding-right': '20px',
      'padding-bottom': '10px',
      'padding-left': '20px',
      'padding-top': '0px',
    });
    // longhand first, shorthand later: the shorthand wins
    expect(expandConflictingShorthands({ 'padding-top': '0px', padding: '8px' })).toEqual({
      'padding-top': '8px',
      'padding-right': '8px',
      'padding-bottom': '8px',
      'padding-left': '8px',
    });
    expect(expandConflictingShorthands({ gap: '4px 8px', 'row-gap': '1px' })).toEqual({ 'column-gap': '8px', 'row-gap': '1px' });
    // untouched when there is no conflict, or the value cannot be split safely
    const plain = { padding: '10px', color: 'red' };
    expect(expandConflictingShorthands(plain)).toBe(plain);
    const odd = { 'border-radius': '10px / 20px', 'border-top-left-radius': '1px' };
    expect(expandConflictingShorthands(odd)).toEqual(odd);
    expect(toReactStyle({ padding: '10px', 'padding-top': '0px' })).toEqual({ paddingRight: '10px', paddingBottom: '10px', paddingLeft: '10px', paddingTop: '0px' });
  });

  it('a <p> that holds child layers is exported as a <div> (the parser would split it)', () => {
    const doc = createDocument();
    const p = createNode('text', { tag: 'p', props: { text: '' }, name: 'Note' });
    const icon = createNode('box', { name: 'Icon' });
    insertNode(doc, p, doc.pages[0].rootId);
    insertNode(doc, icon, p.id);
    const html = compileSiteText(doc, { bundle: 'files' }).files.find((f) => f.path === 'index.html')!.data as string;
    expect(html).not.toMatch(/<p[ >]/);
    expect(html).toMatch(/<div class="note-[a-z0-9]+"[^>]*>\s*<div class="icon-/);
  });
});
