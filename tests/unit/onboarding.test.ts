import { describe, expect, it, vi } from 'vitest';
import { createTour, readStatus, startupAction, STATUS_KEY, STEP_KEY, type KV, type TourStep } from '@/features/onboarding/engine';
import { placeCard, unionBoxes, padBox } from '@/features/onboarding/geometry';
import { TOUR_STEPS } from '@/features/onboarding/steps';

function memoryKV(init: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    get: (k) => (k in data ? data[k] : null),
    set: (k, v) => void (data[k] = v),
    remove: (k) => void delete data[k],
  };
}

const step = (id: string, extra: Partial<TourStep> = {}): TourStep => ({ id, title: id, body: id, advance: 'next', ...extra });

describe('tour navigation', () => {
  it('moves forward/back, runs enter/leave hooks and completes after the last step', () => {
    const log: string[] = [];
    const steps = ['a', 'b', 'c'].map((id) => step(id, { onEnter: () => log.push(`+${id}`), onLeave: () => log.push(`-${id}`) }));
    const kv = memoryKV();
    const t = createTour(steps, kv);
    t.start();
    expect(t.current()?.id).toBe('a');
    t.next();
    t.next();
    expect(t.current()?.id).toBe('c');
    t.back();
    expect(t.current()?.id).toBe('b');
    t.back();
    t.back(); // nothing before the first step: stays
    expect(t.current()?.id).toBe('a');
    t.next();
    t.next();
    t.next();
    expect(t.store.getState().phase).toBe('idle');
    expect(kv.data[STATUS_KEY]).toBe('completed');
    expect(log).toEqual(['+a', '-a', '+b', '-b', '+c', '-c', '+b', '-b', '+a', '-a', '+b', '-b', '+c', '-c']);
  });

  it('skips steps whose skip() is true in both directions, and tolerates throwing hooks', () => {
    const t = createTour([step('a'), step('b', { skip: () => true }), step('c', { onEnter: () => { throw new Error('boom'); } })], memoryKV());
    t.start();
    t.next();
    expect(t.current()?.id).toBe('c');
    t.back();
    expect(t.current()?.id).toBe('a');
  });

  it('advances `until` steps only when the condition holds', () => {
    let done = false;
    const t = createTour([step('a', { advance: { until: () => done } }), step('b')], memoryKV());
    t.start();
    expect(t.checkUntil()).toBe(false);
    done = true;
    expect(t.checkUntil()).toBe(true);
    expect(t.current()?.id).toBe('b');
    expect(t.checkUntil()).toBe(false); // 'next' step
  });

  it('skipCurrent follows the direction of travel (missing optional targets)', () => {
    const t = createTour([step('a'), step('b'), step('c')], memoryKV());
    t.start(2);
    t.back();
    t.skipCurrent();
    expect(t.current()?.id).toBe('a');
    t.next();
    t.skipCurrent();
    expect(t.current()?.id).toBe('c');
  });
});

describe('tour persistence', () => {
  it('stores progress as paused, pause/resume keeps the step, exit records skipped', () => {
    const kv = memoryKV();
    const enter = vi.fn();
    const t = createTour([step('a'), step('b', { onEnter: enter }), step('c')], kv);
    t.start();
    t.next();
    expect(kv.data).toEqual({ [STATUS_KEY]: 'paused', [STEP_KEY]: '1' });
    t.pause();
    expect(t.store.getState().phase).toBe('paused');
    t.next(); // ignored while paused
    t.resume();
    expect(t.current()?.id).toBe('b');
    expect(enter).toHaveBeenCalledTimes(2); // re-entered on resume
    t.askExit(true);
    expect(t.store.getState().confirmingExit).toBe(true);
    t.exit();
    expect(t.store.getState().phase).toBe('idle');
    expect(kv.data).toEqual({ [STATUS_KEY]: 'skipped' });
  });

  it('reads stored status defensively', () => {
    expect(readStatus(memoryKV())).toEqual({ status: null, step: 0 });
    expect(readStatus(memoryKV({ [STATUS_KEY]: 'paused', [STEP_KEY]: '4' }))).toEqual({ status: 'paused', step: 4 });
    expect(readStatus(memoryKV({ [STATUS_KEY]: 'garbage', [STEP_KEY]: '-3' }))).toEqual({ status: null, step: 0 });
  });
});

describe('auto-start decision', () => {
  it('welcomes on first launch only', () => {
    expect(startupAction(null, false)).toBe('welcome');
    expect(startupAction('completed', false)).toBe('none');
    expect(startupAction('skipped', false)).toBe('none');
    expect(startupAction('paused', false)).toBe('paused');
    expect(startupAction(null, true)).toBe('none');
    expect(startupAction('paused', true)).toBe('none');
  });

  it('init applies the decision', () => {
    const fresh = createTour([step('a'), step('b')], memoryKV());
    fresh.init(false);
    expect(fresh.current()?.id).toBe('a');
    const paused = createTour([step('a'), step('b')], memoryKV({ [STATUS_KEY]: 'paused', [STEP_KEY]: '9' }));
    paused.init(false);
    expect(paused.store.getState()).toMatchObject({ phase: 'paused', index: 1 });
    const done = createTour([step('a')], memoryKV({ [STATUS_KEY]: 'completed' }));
    done.init(false);
    expect(done.store.getState().phase).toBe('idle');
  });
});

describe('tour script and geometry', () => {
  it('has a sensible, unique script', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('welcome');
    expect(ids.at(-1)).toBe('finish');
    for (const s of TOUR_STEPS) if (s.advance !== 'next') expect(s.prompt, s.id).toBeTruthy();
  });

  it('places the card beside the target, flipping and clamping to the viewport', () => {
    const r = { x: 100, y: 100, w: 50, h: 30 };
    expect(placeCard(r, 300, 200, 'right', 1600, 1000)).toMatchObject({ x: 164, side: 'right' });
    expect(placeCard({ ...r, x: 1500 }, 300, 200, 'right', 1600, 1000).side).toBe('left');
    expect(placeCard(null, 300, 200, 'bottom', 1600, 1000)).toEqual({ x: 650, y: 400, side: 'center' });
    const huge = placeCard({ x: 0, y: 0, w: 1600, h: 1000 }, 300, 200, 'left', 1600, 1000);
    expect(huge.x + 300).toBeLessThanOrEqual(1600 - 12);
    expect(huge.y + 200).toBeLessThanOrEqual(1000 - 12);
    expect(unionBoxes([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 }])).toEqual({ x: 0, y: 0, w: 30, h: 15 });
    expect(unionBoxes([{ x: 5, y: 5, w: 0, h: 0 }])).toBeNull();
    expect(padBox({ x: 0, y: 0, w: 10, h: 10 }, 6, 100, 100)).toEqual({ x: 2, y: 2, w: 14, h: 14 });
  });
});
