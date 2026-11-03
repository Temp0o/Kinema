import { describe, expect, it, beforeEach } from 'vitest';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { createDocument, createNode } from '@/core/model/factory';
import { cloneSubtree, getSubtreeIds, repairDocument, sortByTreeOrder } from '@/core/model/tree';
import { addNode, deleteNodes, duplicateNodes, groupNodes, moveNodes, setStyle, ungroupNodes, reorderNodes } from '@/core/store/actions';
import { resolveStyles, parseDeclarations, breakpointForWidth } from '@/core/style/style';
import { compileFrames, toCssKeyframes, toWaapiKeyframes } from '@/core/anim/compile';

function reset() {
  const doc = createDocument('Test');
  useDoc.getState().loadDocument(doc);
  useUI.getState().set({ activePageId: doc.pages[0].id, selection: [], breakpoint: 'base', editingComponentId: null });
  return doc.pages[0].rootId;
}

describe('history', () => {
  beforeEach(reset);
  it('undo/redo node insertion', () => {
    const root = reset();
    const n = createNode('box');
    addNode(n, root);
    expect(useDoc.getState().doc.nodes[n.id]).toBeTruthy();
    useDoc.getState().undo();
    expect(useDoc.getState().doc.nodes[n.id]).toBeUndefined();
    expect(useDoc.getState().doc.nodes[root].children).not.toContain(n.id);
    useDoc.getState().redo();
    expect(useDoc.getState().doc.nodes[root].children).toContain(n.id);
  });
  it('coalesces repeated style edits', () => {
    const root = reset();
    const n = createNode('box');
    addNode(n, root);
    const before = useDoc.getState().past.length;
    setStyle([n.id], 'width', '100px');
    setStyle([n.id], 'width', '120px');
    setStyle([n.id], 'width', '140px');
    expect(useDoc.getState().past.length).toBe(before + 1);
    useDoc.getState().undo();
    expect(useDoc.getState().doc.nodes[n.id].styles.base.width).toBe('240px');
  });
  it('transactions produce a single entry', () => {
    const root = reset();
    const n = createNode('box');
    addNode(n, root);
    const before = useDoc.getState().past.length;
    const s = useDoc.getState();
    s.beginTransaction('Drag');
    for (let i = 0; i < 10; i++) setStyle([n.id], 'left', `${i}px`, { coalesce: false });
    useDoc.getState().commitTransaction();
    expect(useDoc.getState().past.length).toBe(before + 1);
    useDoc.getState().undo();
    expect(useDoc.getState().doc.nodes[n.id].styles.base.left).toBeUndefined();
  });
});

describe('tree actions', () => {
  it('duplicate, move, delete, group, ungroup', () => {
    const root = reset();
    const a = createNode('box', { name: 'A', styles: { position: 'absolute', left: '10px', top: '10px' } });
    const b = createNode('box', { name: 'B', styles: { position: 'absolute', left: '100px', top: '50px' } });
    addNode(a, root);
    addNode(b, root);
    const [copy] = duplicateNodes([a.id]);
    let doc = useDoc.getState().doc;
    expect(doc.nodes[copy].styles.base.left).toBe('26px');
    expect(doc.nodes[root].children.indexOf(copy)).toBe(doc.nodes[root].children.indexOf(a.id) + 1);

    const g = groupNodes([a.id, b.id], {
      [a.id]: { x: 10, y: 10, w: 240, h: 160 },
      [b.id]: { x: 100, y: 50, w: 240, h: 160 },
    })!;
    doc = useDoc.getState().doc;
    expect(doc.nodes[g].children).toEqual([a.id, b.id]);
    expect(doc.nodes[g].styles.base.left).toBe('10px');
    expect(doc.nodes[b.id].styles.base.left).toBe('90px');
    ungroupNodes([g]);
    doc = useDoc.getState().doc;
    expect(doc.nodes[g]).toBeUndefined();
    expect(doc.nodes[b.id].styles.base.left).toBe('100px');

    reorderNodes([a.id], 'front');
    doc = useDoc.getState().doc;
    expect(doc.nodes[root].children.at(-1)).toBe(a.id);

    const box = createNode('box', { name: 'Container' });
    addNode(box, root);
    moveNodes([a.id, b.id], box.id);
    doc = useDoc.getState().doc;
    expect(doc.nodes[box.id].children).toEqual(sortByTreeOrder(doc.nodes, [a.id, b.id]));
    deleteNodes([box.id]);
    doc = useDoc.getState().doc;
    expect(doc.nodes[a.id]).toBeUndefined();
    expect(repairDocument(structuredClone(doc))).toEqual([]);
  });
  it('cloneSubtree remaps ids', () => {
    const root = reset();
    const a = createNode('box');
    addNode(a, root);
    const t = createNode('text');
    addNode(t, a.id);
    const doc = useDoc.getState().doc;
    const c = cloneSubtree(doc.nodes, a.id);
    expect(Object.keys(c.nodes)).toHaveLength(2);
    expect(c.nodes[c.rootId].children[0]).not.toBe(t.id);
    expect(c.nodes[c.nodes[c.rootId].children[0]].parent).toBe(c.rootId);
    expect(getSubtreeIds(c.nodes, c.rootId)).toHaveLength(2);
  });
});

describe('styles', () => {
  it('cascades breakpoints', () => {
    const doc = createDocument();
    const n = createNode('text', { styles: { 'font-size': '48px', color: 'red' } });
    n.styles.tablet = { 'font-size': '32px' };
    n.styles.mobile = { 'font-size': '24px' };
    expect(resolveStyles(doc, n, 'base')['font-size']).toBe('48px');
    expect(resolveStyles(doc, n, 'tablet')['font-size']).toBe('32px');
    expect(resolveStyles(doc, n, 'mobile')['font-size']).toBe('24px');
    expect(resolveStyles(doc, n, 'mobile').color).toBe('red');
    expect(breakpointForWidth(doc, 1200)).toBe('base');
    expect(breakpointForWidth(doc, 800)).toBe('tablet');
    expect(breakpointForWidth(doc, 390)).toBe('mobile');
  });
  it('parses declarations with urls', () => {
    const m = parseDeclarations('color: red; background: url(data:image/png;base64,abc) no-repeat; --x: 1');
    expect(m.color).toBe('red');
    expect(m.background).toContain('base64,abc');
    expect(m['--x']).toBe('1');
  });
});

describe('animation compile', () => {
  it('composes transform channels and interpolates missing ones', () => {
    const frames = compileFrames({
      keyframes: [
        { id: '1', offset: 0, values: { opacity: 0, y: 40, scale: 0.9 } },
        { id: '2', offset: 0.5, values: { opacity: 0.8 } },
        { id: '3', offset: 1, values: { opacity: 1, y: 0, scale: 1 } },
      ],
    });
    expect(frames[0].decls.transform).toBe('translate(0px, 40px) scale(0.9)');
    expect(frames[1].decls.transform).toBe('translate(0px, 20px) scale(0.95)');
    expect(frames[2].decls.opacity).toBe('1');
    const css = toCssKeyframes({ keyframes: [{ id: 'a', offset: 0, values: { rotate: 0 } }, { id: 'b', offset: 1, values: { rotate: 360 }, easing: 'linear' }] }, 'spin');
    expect(css).toContain('@keyframes spin');
    expect(css).toContain('rotate(360deg)');
    const w = toWaapiKeyframes({ easing: 'ease', keyframes: [{ id: 'a', offset: 0, values: { 'background-color': '#fff' } }, { id: 'b', offset: 1, values: { 'background-color': '#000' } }] });
    expect(w[0]).toMatchObject({ offset: 0, backgroundColor: '#fff' });
  });
});

import { evalMath } from '@/ui/primitives';
describe('evalMath', () => {
  it('evaluates arithmetic without eval', () => {
    expect(evalMath('12')).toBe(12);
    expect(evalMath('10+5*2')).toBe(20);
    expect(evalMath('(10+5)*2')).toBe(30);
    expect(evalMath('-4 / 2')).toBe(-2);
    expect(evalMath('24px')).toBe(24);
    expect(evalMath('.5')).toBe(0.5);
    expect(evalMath('auto')).toBeNull();
    expect(evalMath('2+')).toBeNull();
  });
});
