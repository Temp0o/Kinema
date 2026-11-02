import { beforeEach, describe, expect, it } from 'vitest';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { createDocument, createNode } from '@/core/model/factory';
import { insertNode } from '@/core/model/tree';
import { resolveStyles } from '@/core/style/style';
import type { KDocument, KNode, StyleMap } from '@/core/model/types';
import {
  createComponentFromNode,
  deleteComponent,
  detachInstance,
  setInstanceTextOverride,
  editComponent,
  exitComponentEditing,
} from '@/features/components/componentActions';
import { materializeInstance, mergeInstanceRootStyles, wouldCreateCycle } from '@/features/components/componentModel';

function freshDoc(): { doc: KDocument; root: string } {
  const doc = createDocument('Test');
  useDoc.getState().loadDocument(doc);
  useUI.getState().set({ activePageId: doc.pages[0].id, selection: [], breakpoint: 'base', editingComponentId: null });
  return { doc, root: doc.pages[0].rootId };
}

/** Build a card: box (absolute, placed) > title text + button. */
function buildCard(root: string) {
  const card = createNode('box', {
    name: 'Card',
    replaceStyles: true,
    styles: { position: 'absolute', left: '40px', top: '60px', width: '320px', height: '200px', 'background-color': '#fff', 'border-radius': '16px', padding: '20px' },
  });
  card.styles.mobile = { left: '10px', width: '300px', 'border-radius': '8px' };
  card.states = { hover: { 'box-shadow': '0 4px 10px #0002' } };
  const title = createNode('text', { name: 'Title', props: { text: 'Hello' } });
  const btn = createNode('button', { name: 'CTA', props: { text: 'Go' } });
  useDoc.getState().mutate('setup', (d) => {
    insertNode(d as KDocument, card, root);
    insertNode(d as KDocument, title, card.id);
    insertNode(d as KDocument, btn, card.id);
  });
  return { card, title, btn };
}

const strip = (n: KNode) => ({ type: n.type, name: n.name, props: n.props, states: n.states, children: n.children.length });

describe('components', () => {
  beforeEach(freshDoc);

  it('creates a component: master keeps visuals, instance keeps placement', () => {
    const { root } = freshDoc();
    const { card, title } = buildCard(root);
    const before = useDoc.getState().past.length;
    const compId = createComponentFromNode(card.id)!;
    expect(compId).toBeTruthy();
    expect(useDoc.getState().past.length).toBe(before + 1);
    const doc = useDoc.getState().doc;
    const comp = doc.components[compId];
    expect(comp.rootId).toBe(card.id);
    const master = doc.nodes[card.id];
    expect(master.parent).toBeNull();
    expect(master.styles.base).toMatchObject({ position: 'relative', width: '320px', 'background-color': '#fff' });
    expect(master.styles.base.left).toBeUndefined();
    const instId = doc.nodes[root].children[0];
    const inst = doc.nodes[instId];
    expect(inst.type).toBe('instance');
    expect(inst.props.componentId).toBe(compId);
    expect(inst.styles.base).toEqual({ position: 'absolute', left: '40px', top: '60px', width: '320px', height: '200px' });
    expect(inst.styles.mobile).toEqual({ left: '10px', width: '300px' });
    expect(master.styles.mobile).toEqual({ width: '300px', 'border-radius': '8px' });
    expect(doc.nodes[title.id].parent).toBe(card.id);
    expect(useUI.getState().selection).toEqual([instId]);
    // undo restores the original tree
    useDoc.getState().undo();
    const d2 = useDoc.getState().doc;
    expect(d2.components[compId]).toBeUndefined();
    expect(d2.nodes[root].children).toEqual([card.id]);
    expect(d2.nodes[card.id].styles.base.left).toBe('40px');
  });

  it('detach round trip renders like the original (fresh ids, overrides applied)', () => {
    const { root } = freshDoc();
    const { card, title, btn } = buildCard(root);
    const original = structuredClone(useDoc.getState().doc.nodes[card.id]);
    const compId = createComponentFromNode(card.id)!;
    const instId = useDoc.getState().doc.nodes[root].children[0];
    setInstanceTextOverride(instId, title.id, 'Overridden');
    // equal to master → override cleared
    setInstanceTextOverride(instId, btn.id, 'Go');
    expect(useDoc.getState().doc.nodes[instId].overrides).toEqual({ [title.id]: { text: 'Overridden' } });

    const newId = detachInstance(instId)!;
    const doc = useDoc.getState().doc;
    expect(newId).not.toBe(card.id);
    expect(doc.nodes[instId]).toBeUndefined();
    expect(doc.nodes[root].children).toEqual([newId]);
    const det = doc.nodes[newId];
    expect(det.parent).toBe(root);
    for (const bp of ['base', 'tablet', 'mobile']) {
      expect(resolveStyles(doc, det, bp)).toEqual(resolveStyles(doc, { ...original, styles: { ...original.styles, base: { ...original.styles.base } } } as KNode, bp));
    }
    expect(strip(det)).toMatchObject({ type: 'box', name: 'Card', states: original.states, children: 2 });
    const [t2, b2] = det.children.map((id) => doc.nodes[id]);
    expect(t2.id).not.toBe(title.id);
    expect(t2.props.text).toBe('Overridden');
    expect(b2.props.text).toBe('Go');
    // master untouched
    expect(doc.nodes[title.id].props.text).toBe('Hello');
    expect(doc.components[compId]).toBeTruthy();
  });

  it('merges instance root styles with exact cascade semantics', () => {
    const bps = [{ id: 'base' }, { id: 'tablet' }, { id: 'mobile' }];
    const master: Record<string, StyleMap> = { base: { width: '200px', color: 'red' }, tablet: { width: '150px' } };
    const inst: Record<string, StyleMap> = { base: { width: '300px' }, mobile: { color: 'blue' } };
    const m = mergeInstanceRootStyles(master, inst, bps);
    const doc = { breakpoints: createDocument().breakpoints };
    const node = (styles: Record<string, StyleMap>) => ({ styles }) as unknown as KNode;
    expect(resolveStyles(doc, node(m), 'tablet')).toEqual({ width: '300px', color: 'red' });
    expect(resolveStyles(doc, node(m), 'mobile')).toEqual({ width: '300px', color: 'blue' });
  });

  it('delete component detaches all instances in one undo step', () => {
    const { root } = freshDoc();
    const { card } = buildCard(root);
    const compId = createComponentFromNode(card.id)!;
    const doc0 = useDoc.getState().doc;
    const instId = doc0.nodes[root].children[0];
    // second instance via materialize check + manual insert
    expect(materializeInstance(doc0, instId)).toBeTruthy();
    const before = useDoc.getState().past.length;
    deleteComponent(compId);
    const doc = useDoc.getState().doc;
    expect(useDoc.getState().past.length).toBe(before + 1);
    expect(doc.components[compId]).toBeUndefined();
    expect(doc.nodes[card.id]).toBeUndefined();
    const replaced = doc.nodes[doc.nodes[root].children[0]];
    expect(replaced.type).toBe('box');
    expect(replaced.styles.base.left).toBe('40px');
    useDoc.getState().undo();
    expect(useDoc.getState().doc.components[compId]).toBeTruthy();
    expect(useDoc.getState().doc.nodes[instId].type).toBe('instance');
  });

  it('edit isolation and cycle protection', () => {
    const { root } = freshDoc();
    const { card, title } = buildCard(root);
    const compId = createComponentFromNode(card.id)!;
    const instId = useDoc.getState().doc.nodes[root].children[0];
    editComponent(compId, { fromInstanceId: instId });
    expect(useUI.getState().editingComponentId).toBe(compId);
    expect(wouldCreateCycle(useDoc.getState().doc, compId, title.id)).toBe(true);
    expect(wouldCreateCycle(useDoc.getState().doc, compId, root)).toBe(false);
    exitComponentEditing();
    expect(useUI.getState().editingComponentId).toBeNull();
    expect(useUI.getState().selection).toEqual([instId]);
  });
});
