import { describe, expect, it } from 'vitest';
import { PRESETS, PRESET_CATEGORIES, getPreset, searchPresets } from '@/core/anim/presets';
import { compileFrames, toCssKeyframes, toWaapiEffect, toWaapiKeyframes } from '@/core/anim/compile';
import { addPathLength, usesStrokeDraw, SVG_SHAPES_SELECTOR } from '@/core/anim/svg';
import {
  animSpan,
  buildTicks,
  chooseTickStep,
  contentDuration,
  formatTick,
  formatTime,
  interpolateValue,
  snapOffset,
  snapTime,
  timeToOffset,
  valuesAt,
} from '@/core/anim/timeline';
import { cubicBezier, easingFunction, mirrorEasing, parseLinearEasing, sampleEasing } from '@/core/anim/easing';
import type { KAnimation } from '@/core/model/types';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { createDocument, createNode } from '@/core/model/factory';
import { addNode } from '@/core/store/actions';
import * as acts from '@/features/animation/animActions';
import { usePlayback } from '@/features/animation/playbackStore';

const bad = /NaN|undefined|Infinity|\[object/;

describe('presets', () => {
  it('ships a broad library across every category', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(45);
    for (const c of PRESET_CATEGORIES) expect(PRESETS.some((p) => p.category === c.id)).toBe(true);
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))('%s compiles cleanly', (_id, preset) => {
    const a = preset.make();
    expect(a.name).toBe(preset.name);
    expect(a.trigger).toBe(preset.defaultTrigger);
    expect(a.presetId).toBe(preset.id);
    expect(a.duration).toBeGreaterThan(0);
    expect(a.keyframes.length).toBeGreaterThanOrEqual(2);
    expect(a.keyframes[0].offset).toBe(0);
    expect(a.keyframes[a.keyframes.length - 1].offset).toBe(1);
    const frames = compileFrames(a);
    for (const f of frames) {
      expect(Number.isFinite(f.offset)).toBe(true);
      for (const [k, v] of Object.entries(f.decls)) {
        expect(k).not.toMatch(bad);
        expect(v).not.toMatch(bad);
        expect(v).not.toBe('');
      }
    }
    const css = toCssKeyframes(a, 'k');
    expect(css).not.toMatch(bad);
    const waapi = JSON.stringify(toWaapiKeyframes(a));
    expect(waapi).not.toMatch(/NaN|undefined|null/);
    const eff = toWaapiEffect(a);
    expect(eff.timing.easing).toBe('linear');
    for (const k of eff.keyframes) expect(typeof k.easing).toBe('string');
    if (a.trigger === 'loop') expect(eff.timing.iterations).toBe(Infinity);
  });

  it('make() returns fresh ids every call', () => {
    for (const p of PRESETS) {
      const a = p.make();
      const b = p.make();
      expect(a.id).not.toBe(b.id);
      const ka = a.keyframes.map((k) => k.id);
      const kb = b.keyframes.map((k) => k.id);
      expect(new Set([...ka, ...kb]).size).toBe(ka.length + kb.length);
      // deep independence
      a.keyframes[0].values.opacity = 0.123;
      expect(p.make().keyframes[0].values.opacity).not.toBe(0.123);
    }
  });

  it('stagger and svg presets carry their targeting', () => {
    expect(getPreset('stagger-fade-up')!.make().stagger).toBe(80);
    const draw = getPreset('svg-draw')!.make();
    expect(draw.targetSelector).toBe(SVG_SHAPES_SELECTOR);
    expect(usesStrokeDraw(draw)).toBe(true);
    const css = toCssKeyframes(draw, 'draw');
    expect(css).toContain('stroke-dasharray: 1;');
    expect(css).toContain('stroke-dashoffset: 1;');
    expect(css).toContain('stroke-dashoffset: 0;');
    expect(toCssKeyframes(getPreset('svg-fill-in')!.make(), 'f')).toContain('fill-opacity: 0;');
  });

  it('scroll presets mirror entrances with the inView trigger', () => {
    const scroll = PRESETS.filter((p) => p.category === 'scroll');
    expect(scroll.length).toBeGreaterThanOrEqual(6);
    for (const p of scroll) expect(p.make().trigger).toBe('inView');
  });

  it('search filters by name and category', () => {
    expect(searchPresets('fade').length).toBeGreaterThan(4);
    expect(searchPresets('', 'hover').every((p) => p.category === 'hover')).toBe(true);
    expect(searchPresets('zzzz-nothing')).toHaveLength(0);
  });
});

describe('svg draw-on markup', () => {
  it('adds pathLength to every shape once', () => {
    const svg = '<svg viewBox="0 0 24 24"><path d="M1 1L5 5"/><circle cx="3" cy="3" r="2" /><rect x="1" y="1" width="2" height="2"></rect><g><polyline points="1,2 3,4"/></g><clipPath id="c"><ellipse cx="1" cy="1" rx="1" ry="1"/></clipPath></svg>';
    const out = addPathLength(svg);
    expect(out.match(/pathLength="1"/g)?.length).toBe(5);
    expect(out).toContain('<path d="M1 1L5 5" pathLength="1"/>');
    expect(out).toContain('<circle cx="3" cy="3" r="2" pathLength="1" />');
    expect(out).toContain('<clipPath id="c">');
    expect(addPathLength(out)).toBe(out);
  });
  it('keeps existing pathLength and respects the selector', () => {
    const svg = '<svg><path pathLength="100" d="M0 0"/><line x1="0" y1="0" x2="1" y2="1"/></svg>';
    const out = addPathLength(svg, 'line');
    expect(out).toContain('pathLength="100"');
    expect(out).toContain('<line x1="0" y1="0" x2="1" y2="1" pathLength="1"/>');
    expect(out.match(/pathLength/g)?.length).toBe(2);
  });
});

describe('easing math', () => {
  it('evaluates cubic-bezier, linear() and steps()', () => {
    const lin = cubicBezier(0, 0, 1, 1);
    expect(lin(0.3)).toBeCloseTo(0.3, 3);
    const out = easingFunction('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(out(0.5)).toBeGreaterThan(0.85);
    expect(easingFunction('steps(4, end)')(0.3)).toBe(0.25);
    expect(easingFunction('steps(4, start)')(0.3)).toBe(0.5);
    const pts = parseLinearEasing('linear(0, 0.25 75%, 1)')!;
    expect(pts.map((p) => p.x)).toEqual([0, 0.75, 1]);
    expect(easingFunction('linear(0, 0.25 75%, 1)')(0.375)).toBeCloseTo(0.125, 5);
    expect(sampleEasing('ease', 10)).toHaveLength(11);
  });
  it('mirrors easings for reversed playback', () => {
    expect(mirrorEasing('ease-out')).toBe('cubic-bezier(0.42, 0, 1, 1)');
    expect(mirrorEasing('steps(3, end)')).toBe('steps(3, start)');
    const m = mirrorEasing('linear(0, 0.5, 1)');
    expect(easingFunction(m)(0.5)).toBeCloseTo(0.5, 4);
  });
});

describe('timeline math', () => {
  const anim = (p: Partial<KAnimation> = {}): KAnimation => ({
    id: 'a',
    name: 'A',
    trigger: 'load',
    duration: 1000,
    delay: 200,
    iterations: 2,
    direction: 'normal',
    fill: 'both',
    easing: 'linear',
    keyframes: [
      { id: 'k0', offset: 0, values: { opacity: 0, x: -20, filter: 'blur(10px)', 'background-color': '#000000' } },
      { id: 'k1', offset: 1, values: { opacity: 1, x: 20, filter: 'blur(0px)', 'background-color': '#ffffff' } },
    ],
    ...p,
  });

  it('computes spans incl. stagger and infinite loops', () => {
    expect(animSpan(anim())).toMatchObject({ start: 200, end: 2200, iterations: 2 });
    expect(animSpan(anim({ stagger: 50 }), 4).staggerExtra).toBe(150);
    expect(animSpan(anim({ trigger: 'loop' })).end).toBe(Infinity);
    expect(contentDuration([anim()])).toBeGreaterThanOrEqual(2200);
    expect(contentDuration([anim({ iterations: -1 })])).toBe(2200);
    expect(contentDuration([])).toBe(2000);
  });

  it('adapts ruler ticks to zoom', () => {
    expect(chooseTickStep(0.2).major).toBe(500);
    expect(chooseTickStep(1).major).toBe(100);
    expect(chooseTickStep(0.02).major).toBe(5000);
    const ticks = buildTicks(1000, 0.2);
    expect(ticks[0]).toMatchObject({ t: 0, major: true, label: '0' });
    expect(ticks.filter((t) => t.major).map((t) => t.label)).toEqual(['0', '0.5s', '1s']);
    expect(formatTick(250, 50)).toBe('250ms');
    expect(formatTick(2000, 1000)).toBe('2s');
    expect(formatTime(61250)).toBe('01:01.250');
  });

  it('snaps offsets and times', () => {
    expect(snapOffset(0.53)).toBe(0.55);
    expect(snapOffset(0.53, { free: true })).toBe(0.53);
    expect(snapOffset(0.53, { targets: [0.537] })).toBe(0.537);
    expect(snapOffset(1.4)).toBe(1);
    expect(snapTime(127)).toBe(130);
    expect(snapTime(127, { targets: [140], threshold: 20 })).toBe(140);
    expect(snapTime(-50)).toBe(0);
    expect(timeToOffset(anim(), 700)).toBe(0.5);
    expect(timeToOffset(anim(), 50)).toBe(0);
  });

  it('interpolates values for inserted keyframes', () => {
    expect(interpolateValue(0, 10, 0.25)).toBe(2.5);
    expect(interpolateValue('blur(10px)', 'blur(0px)', 0.5)).toBe('blur(5px)');
    expect(interpolateValue('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(interpolateValue('inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)', 0.25)).toBe('inset(0% 75% 0% 0%)');
    expect(interpolateValue('auto', '10px', 0.7)).toBe('10px');
    const v = valuesAt(anim(), 0.5);
    expect(v).toEqual({ opacity: 0.5, x: 0, filter: 'blur(5px)', 'background-color': '#808080' });
    const eased = valuesAt(anim({ easing: 'ease-in' }), 0.5);
    expect(eased.opacity as number).toBeLessThan(0.5);
  });
});

describe('animation actions', () => {
  const setup = (type: 'box' | 'svg' = 'box') => {
    const doc = createDocument('T');
    useDoc.getState().loadDocument(doc);
    useUI.getState().set({ activePageId: doc.pages[0].id, selection: [] });
    const n = createNode(type);
    addNode(n, doc.pages[0].rootId);
    return n.id;
  };
  const nodeOf = (id: string) => useDoc.getState().doc.nodes[id];

  it('applying svg draw-on patches markup in the same history step', () => {
    const id = setup('svg');
    const before = useDoc.getState().past.length;
    acts.applyPreset([id], getPreset('svg-draw')!);
    expect(useDoc.getState().past.length).toBe(before + 1);
    expect(nodeOf(id).props.svg).toContain('pathLength="1"');
    expect(nodeOf(id).animations).toHaveLength(1);
    expect(usePlayback.getState().selectedAnimation?.animId).toBe(nodeOf(id).animations![0].id);
    useDoc.getState().undo();
    expect(nodeOf(id).props.svg).not.toContain('pathLength');
    expect(nodeOf(id).animations).toBeUndefined();
  });

  it('applies presets with fresh ids per node', () => {
    const a = setup();
    const b = createNode('box');
    addNode(b, useDoc.getState().doc.pages[0].rootId);
    const created = acts.applyPreset([a, b.id], getPreset('fade-up')!);
    expect(created).toHaveLength(2);
    expect(created[0].animId).not.toBe(created[1].animId);
  });

  it('adds keyframes with interpolated values and keeps at least two', () => {
    const id = setup();
    const [{ animId }] = acts.applyPreset([id], getPreset('fade-up')!);
    const kid = acts.addKeyframeAt(id, animId, 0.5)!;
    const anim = acts.findAnimation(useDoc.getState().doc, id, animId)!;
    expect(anim.keyframes.map((k) => k.offset)).toEqual([0, 0.5, 1]);
    const mid = anim.keyframes.find((k) => k.id === kid)!;
    expect(mid.values.opacity as number).toBeGreaterThan(0.5); // expo-out front-loads progress
    expect(usePlayback.getState().selectedKeyframe?.keyframeId).toBe(kid);
    expect(acts.removeKeyframe(id, animId, kid)).toBe(true);
    const ks = acts.findAnimation(useDoc.getState().doc, id, animId)!.keyframes;
    expect(acts.removeKeyframe(id, animId, ks[0].id)).toBe(false);
    useDoc.getState().undo();
    expect(acts.findAnimation(useDoc.getState().doc, id, animId)!.keyframes).toHaveLength(3);
  });

  it('duplicates, reorders, toggles and deletes as single undo steps', () => {
    const id = setup();
    const [{ animId }] = acts.applyPreset([id], getPreset('pulse')!);
    acts.duplicateAnimation(id, animId);
    expect(nodeOf(id).animations).toHaveLength(2);
    const copyId = nodeOf(id).animations![1].id;
    acts.moveAnimation(id, 1, 0);
    expect(nodeOf(id).animations![0].id).toBe(copyId);
    acts.setAnimationEnabled(id, copyId, false);
    expect(nodeOf(id).animations![0].enabled).toBe(false);
    acts.deleteAnimation(id, copyId);
    expect(nodeOf(id).animations).toHaveLength(1);
    const n = useDoc.getState().past.length;
    useDoc.getState().undo();
    useDoc.getState().undo();
    useDoc.getState().undo();
    expect(useDoc.getState().past.length).toBe(n - 3);
    expect(nodeOf(id).animations).toHaveLength(2);
    expect(nodeOf(id).animations![1].id).toBe(copyId);
  });

  it('coalesces scrubbed keyframe edits into one step', () => {
    const id = setup();
    const [{ animId }] = acts.applyPreset([id], getPreset('fade-up')!);
    const kf = acts.findAnimation(useDoc.getState().doc, id, animId)!.keyframes[0];
    const before = useDoc.getState().past.length;
    acts.setKeyframeValue(id, animId, kf.id, 'y', 30);
    acts.setKeyframeValue(id, animId, kf.id, 'y', 40);
    acts.setKeyframeValue(id, animId, kf.id, 'y', 50);
    expect(useDoc.getState().past.length).toBe(before + 1);
    expect(acts.findAnimation(useDoc.getState().doc, id, animId)!.keyframes[0].values.y).toBe(50);
  });
});
