import { describe, expect, it, vi } from 'vitest';

vi.mock('@/core/fonts/designFonts', () => ({ BUNDLED_FONTS: [], SYSTEM_FONTS: [], findBundledFont: () => undefined, registerBundledFonts: () => {} }));

import { useUI } from '@/core/store/uiStore';
import { useDoc } from '@/core/store/docStore';
import { useAI } from '@/features/ai/aiStore';
import { installAI } from '@/features/ai/install';
import { createDocument, createNode } from '@/core/model/factory';
import { insertNode, repairDocument } from '@/core/model/tree';
import { compileSiteText } from '@/core/export';

describe('robustness', () => {
  it('a running AI generation is cancelled when the page or project changes', () => {
    const off = installAI();
    const cancel = vi.fn();
    const orig = useAI.getState().cancel;
    useAI.setState({ cancel, run: { ...useAI.getState().run, status: 'running' } });
    useUI.getState().set({ selection: ['x'] }); // unrelated change: keeps running
    expect(cancel).not.toHaveBeenCalled();
    useUI.getState().set({ activePageId: 'other-page' });
    expect(cancel).toHaveBeenCalledTimes(1);
    useUI.getState().set({ projectId: 'other-project' });
    expect(cancel).toHaveBeenCalledTimes(2);
    useAI.setState({ cancel: orig, run: { ...useAI.getState().run, status: 'idle' } });
    off();
  });

  it('3000-node documents repair, compile and undo quickly', () => {
    const d = createDocument('big');
    const root = d.pages[0].rootId;
    let parent = root;
    for (let i = 0; i < 3000; i++) {
      const n = createNode(i % 10 === 0 ? 'box' : 'text', { name: `n${i}`, props: i % 10 === 0 ? {} : { text: `t${i}` } });
      insertNode(d, n, parent);
      if (i % 10 === 0) parent = n.id;
      if (i % 100 === 99) parent = root;
    }
    let t = performance.now();
    expect(repairDocument(structuredClone(d))).toEqual([]);
    const tRepair = performance.now() - t;
    t = performance.now();
    compileSiteText(d, { bundle: 'single' });
    const tCompile = performance.now() - t;
    useDoc.getState().loadDocument(d);
    t = performance.now();
    for (let i = 0; i < 50; i++) useDoc.getState().mutate('edit', (x) => void (x.nodes[root].styles.base.color = `#00000${i % 10}`));
    for (let i = 0; i < 50; i++) useDoc.getState().undo();
    for (let i = 0; i < 50; i++) useDoc.getState().redo();
    const tHistory = performance.now() - t;
    expect(tRepair).toBeLessThan(1500);
    expect(tCompile).toBeLessThan(5000);
    expect(tHistory).toBeLessThan(3000);
  });
});
