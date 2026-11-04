/**
 * Onboarding tour engine: data-driven steps, navigation, persistence and the
 * auto-start decision. DOM-free so it can be unit tested; the spotlight/card UI
 * lives in TourOverlay.tsx and drives this store.
 *
 * Persistence (localStorage, all access guarded):
 *   kinema.tour.status = 'completed' | 'skipped' | 'paused'
 *   kinema.tour.step   = index of the step to resume at
 * While a tour runs, progress is stored as 'paused' so closing the app mid-tour
 * brings back the "Tour paused" pill instead of the welcome card.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';
export type TourAdvance = 'next' | 'click-target' | { until: () => boolean };
export type TourStatus = 'completed' | 'skipped' | 'paused';

export interface TourStep {
  id: string;
  /** A `data-tour` value, a CSS selector, or a function returning the element. Omit for a centred card. */
  target?: string | (() => Element | Element[] | null);
  title: string;
  body: string;
  placement?: TourPlacement;
  advance: TourAdvance;
  /** Call-to-action shown instead of "Next" for interactive steps ("Click the highlighted …"). */
  prompt?: string;
  /** Shown (centred card) when the target cannot be found after waiting. */
  missing?: string;
  onEnter?: () => void;
  onLeave?: () => void;
  /** Which screen the step belongs to (documentation + missing-target copy). */
  route?: 'home' | 'editor';
  /** Skip this step automatically when its target is missing. */
  optional?: boolean;
  /** Return true to skip this step entirely (checked when navigating). */
  skip?: () => boolean;
}

export type TourPhase = 'idle' | 'running' | 'paused';

export interface TourState {
  phase: TourPhase;
  index: number;
  /** Direction of the last move, so missing optional steps are skipped the same way. */
  dir: 1 | -1;
  confirmingExit: boolean;
  /** Bumped on every step entry (lets the UI restart waits/animations). */
  epoch: number;
}

export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const STATUS_KEY = 'kinema.tour.status';
export const STEP_KEY = 'kinema.tour.step';

export const localKV: KV = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore (private mode, quota) */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

export function readStatus(kv: KV): { status: TourStatus | null; step: number } {
  const raw = kv.get(STATUS_KEY);
  const status = raw === 'completed' || raw === 'skipped' || raw === 'paused' ? raw : null;
  const n = Number(kv.get(STEP_KEY));
  return { status, step: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0 };
}

/**
 * What to do when the app starts:
 * - no stored status → show the welcome step (first launch);
 * - 'paused' → show the "Tour paused" pill at the stored step;
 * - completed/skipped, or suppressed (tests, KINEMA_NO_TOUR) → nothing.
 */
export function startupAction(status: TourStatus | null, suppressed: boolean): 'welcome' | 'paused' | 'none' {
  if (suppressed) return 'none';
  if (status === null) return 'welcome';
  if (status === 'paused') return 'paused';
  return 'none';
}

const safe = (fn?: () => void) => {
  try {
    fn?.();
  } catch (e) {
    console.warn('[tour] step hook failed', e);
  }
};

export interface TourController {
  store: StoreApi<TourState>;
  steps: TourStep[];
  current(): TourStep | null;
  /** Start (or restart) at a step, running its onEnter. */
  start(index?: number): void;
  next(): void;
  back(): void;
  /** Move past the current step in the current direction (missing optional target). */
  skipCurrent(): void;
  pause(): void;
  resume(): void;
  /** Leave the tour; records 'skipped' unless it was completed. */
  exit(status?: Exclude<TourStatus, 'paused'>): void;
  complete(): void;
  askExit(ask: boolean): void;
  /** Apply the startup decision (call once on app launch). */
  init(suppressed: boolean): void;
  /** Advance if the current step's `until` condition holds. Returns true if it advanced. */
  checkUntil(): boolean;
}

export function createTour(steps: TourStep[], kv: KV = localKV): TourController {
  const store = createStore<TourState>(() => ({ phase: 'idle', index: 0, dir: 1, confirmingExit: false, epoch: 0 }));
  const get = store.getState;
  const clamp = (i: number) => Math.max(0, Math.min(steps.length - 1, i));

  const persist = (status: TourStatus, step?: number) => {
    kv.set(STATUS_KEY, status);
    if (step != null) kv.set(STEP_KEY, String(step));
  };

  /** First index from `from` (inclusive) in `dir` whose step isn't skipped; -1/length when none. */
  const seek = (from: number, dir: 1 | -1) => {
    let i = from;
    while (i >= 0 && i < steps.length) {
      let skip = false;
      try {
        skip = !!steps[i].skip?.();
      } catch {
        skip = false;
      }
      if (!skip) return i;
      i += dir;
    }
    return i;
  };

  const enter = (i: number, dir: 1 | -1) => {
    const s = get();
    if (s.phase === 'running' && s.index !== i) safe(steps[s.index]?.onLeave);
    store.setState({ phase: 'running', index: i, dir, confirmingExit: false, epoch: s.epoch + 1 });
    persist('paused', i);
    safe(steps[i].onEnter);
  };

  const move = (dir: 1 | -1) => {
    const s = get();
    if (s.phase !== 'running') return;
    const i = seek(s.index + dir, dir);
    if (i >= steps.length) return ctl.complete();
    if (i < 0) return; // nothing before: stay
    enter(i, dir);
  };

  const ctl: TourController = {
    store,
    steps,
    current() {
      const s = get();
      return s.phase === 'idle' ? null : (steps[s.index] ?? null);
    },
    start(index = 0) {
      if (!steps.length) return;
      const i = seek(clamp(index), 1);
      if (i >= steps.length) return;
      if (get().phase === 'running') safe(steps[get().index]?.onLeave);
      store.setState({ phase: 'idle' });
      enter(i, 1);
    },
    next: () => move(1),
    back: () => move(-1),
    skipCurrent() {
      const s = get();
      if (s.dir === -1) {
        const i = seek(s.index - 1, -1);
        if (i >= 0) return enter(i, -1);
      }
      move(1);
    },
    pause() {
      const s = get();
      if (s.phase !== 'running') return;
      safe(steps[s.index]?.onLeave);
      store.setState({ phase: 'paused', confirmingExit: false });
      persist('paused', s.index);
    },
    resume() {
      const s = get();
      if (s.phase !== 'paused') return;
      const i = seek(clamp(s.index), 1);
      if (i >= steps.length) return ctl.complete();
      enter(i, 1);
    },
    exit(status = 'skipped') {
      const s = get();
      if (s.phase === 'running') safe(steps[s.index]?.onLeave);
      store.setState({ phase: 'idle', confirmingExit: false });
      persist(status);
      kv.remove(STEP_KEY);
    },
    complete() {
      ctl.exit('completed');
    },
    askExit(ask) {
      if (get().phase === 'running') store.setState({ confirmingExit: ask });
    },
    init(suppressed) {
      const { status, step } = readStatus(kv);
      const action = startupAction(status, suppressed);
      if (action === 'welcome') ctl.start(0);
      else if (action === 'paused') store.setState({ phase: 'paused', index: clamp(step), confirmingExit: false });
    },
    checkUntil() {
      const s = get();
      const step = steps[s.index];
      if (s.phase !== 'running' || !step || typeof step.advance !== 'object') return false;
      let done = false;
      try {
        done = step.advance.until();
      } catch {
        done = false;
      }
      if (done) ctl.next();
      return done;
    },
  };
  return ctl;
}
