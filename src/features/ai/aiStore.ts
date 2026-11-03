/**
 * AI feature state: connection + installed models (auto-detected), persisted
 * settings and per-task model choices, the current run (phase/progress/preview),
 * its outcome, and a session history of prompts.
 */
import { create } from 'zustand';
import { docApi, useDoc } from '@/core/store/docStore';
import { currentRootId } from '@/core/store/actions';
import { useUI } from '@/core/store/uiStore';
import { runCommand } from '@/features/shortcuts/shortcuts';
import {
  DEFAULT_BASE_URL,
  OllamaError,
  getOllamaBaseUrl,
  isAbortError,
  listModels,
  setOllamaBaseUrl,
  showModel,
  version as ollamaVersion,
} from '@/core/ai/ollama';
import { TASKS, bestModel, bestOverall, recommendModels, type AITask, type ModelInfo } from '@/core/ai/recommend';
import { AIError, MODE_TASK, runAIJob, type AIJob, type AIMode, type AIOutcome, type AIPhase, type AIProgress, type AISettings, type SvgVariant } from '@/core/ai/generate';
import { pageHasContent, type StyleSource } from '@/core/ai/styleContext';
import { aiLabel, insertSvgNode, svgNodeName } from '@/core/ai/apply';
import { captureCanvasImage } from './capture';

export type ConnectionStatus = 'unknown' | 'checking' | 'connected' | 'offline' | 'empty' | 'error';

export type UiMode = 'page' | 'section' | 'component' | 'edit' | 'animate' | 'svg';

export interface ModelPrefs {
  /** one model for every task */
  single: boolean;
  singleModel?: string;
  tasks: Partial<Record<AITask, string>>;
}

export interface HistoryItem {
  id: number;
  mode: UiMode;
  prompt: string;
  at: number;
  ok: boolean;
}

export type RunStatus = 'idle' | 'running' | 'preview' | 'applied' | 'error' | 'cancelled';

export interface RunState {
  status: RunStatus;
  mode: UiMode | null;
  phase: AIPhase;
  phaseDetail?: string;
  startedAt: number;
  endedAt: number;
  progress: AIProgress | null;
  variants: SvgVariant[];
  /** SVG variant currently chosen in the preview */
  chosen: number;
  outcome: AIOutcome | null;
  error: string | null;
  usedVision: boolean;
  /** job that produced this run (for regenerate) */
  job: AIJob | null;
  /** history entry id of the applied change (to detect "already undone") */
  appliedHistoryId?: number;
}

const IDLE_RUN: RunState = {
  status: 'idle', mode: null, phase: 'reading', startedAt: 0, endedAt: 0, progress: null, variants: [], chosen: 0, outcome: null, error: null, usedVision: false, job: null,
};

export const DEFAULT_SETTINGS: AISettings = { temperature: 0.5, numCtx: 8192, keepAlive: '10m', think: false };

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem('kinema.ai.' + key);
    return raw == null ? fallback : { ...(typeof fallback === 'object' && fallback ? fallback : {}), ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem('kinema.ai.' + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

interface AIState {
  baseUrl: string;
  status: ConnectionStatus;
  serverVersion: string | null;
  connectionError: string | null;
  models: ModelInfo[];
  lastChecked: number;

  settings: AISettings;
  prefs: ModelPrefs;

  mode: UiMode;
  styleSource: StyleSource;
  presetId: string;
  prompt: string;
  variants: number;
  focusTick: number;

  run: RunState;
  history: HistoryItem[];

  refresh: (opts?: { quiet?: boolean }) => Promise<void>;
  setBaseUrl: (url: string) => Promise<void>;
  setSettings: (p: Partial<AISettings>) => void;
  setPrefs: (p: Partial<ModelPrefs>) => void;
  setTaskModel: (task: AITask, model: string) => void;
  set: (p: Partial<Pick<AIState, 'mode' | 'styleSource' | 'presetId' | 'prompt' | 'variants'>>) => void;
  focusPrompt: () => void;

  start: (opts?: { regenerate?: boolean; fromHistory?: HistoryItem }) => Promise<void>;
  cancel: () => void;
  applyVariant: (index?: number) => void;
  discard: () => void;
  undoApplied: () => void;
}

let controller: AbortController | null = null;
let refreshing: Promise<void> | null = null;
let histSeq = 1;

export const useAI = create<AIState>()((set, get) => ({
  baseUrl: getOllamaBaseUrl(),
  status: 'unknown',
  serverVersion: null,
  connectionError: null,
  models: [],
  lastChecked: 0,

  settings: load('settings', DEFAULT_SETTINGS),
  prefs: load<ModelPrefs>('prefs', { single: false, tasks: {} }),

  mode: 'section',
  styleSource: 'match',
  presetId: 'midnight',
  prompt: '',
  variants: 1,
  focusTick: 0,

  run: IDLE_RUN,
  history: [],

  async refresh(opts = {}) {
    if (refreshing) return refreshing;
    const baseUrl = getOllamaBaseUrl();
    if (!opts.quiet || get().status === 'unknown') set({ status: 'checking', baseUrl });
    refreshing = (async () => {
      try {
        const ver = await ollamaVersion({ baseUrl }).catch(async (e) => {
          // older servers: fall back to the tags call as the liveness probe
          if (e instanceof OllamaError && e.kind === 'bad-response') return 'unknown';
          throw e;
        });
        const tags = await listModels({ baseUrl });
        const withCaps = await Promise.all(
          tags.map(async (m) => {
            try {
              const d = await showModel(m.name, { baseUrl, digest: m.digest });
              return { ...m, capabilities: d.capabilities, contextLength: d.contextLength, family: m.family ?? d.family, parameterSize: m.parameterSize ?? d.parameterSize, quantization: m.quantization ?? d.quantization };
            } catch {
              return m;
            }
          }),
        );
        set({ baseUrl, status: withCaps.length ? 'connected' : 'empty', serverVersion: ver, connectionError: null, models: withCaps, lastChecked: Date.now() });
      } catch (e) {
        const offline = e instanceof OllamaError && (e.kind === 'not-running' || e.kind === 'timeout');
        set({ baseUrl, status: offline ? 'offline' : 'error', connectionError: e instanceof Error ? e.message : String(e), models: [], serverVersion: null, lastChecked: Date.now() });
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  },

  async setBaseUrl(url) {
    setOllamaBaseUrl(url);
    set({ baseUrl: getOllamaBaseUrl() });
    await get().refresh();
  },

  setSettings(p) {
    const settings = { ...get().settings, ...p };
    save('settings', settings);
    set({ settings });
  },

  setPrefs(p) {
    const prefs = { ...get().prefs, ...p };
    save('prefs', prefs);
    set({ prefs });
  },

  setTaskModel(task, model) {
    const prefs = get().prefs;
    get().setPrefs(prefs.single ? { singleModel: model } : { tasks: { ...prefs.tasks, [task]: model } });
  },

  set: (p) => set(p),
  focusPrompt: () => set((s) => ({ focusTick: s.focusTick + 1 })),

  async start(opts = {}) {
    const s = get();
    if (s.run.status === 'running') return;
    const hist = opts.fromHistory;
    const uiMode = hist?.mode ?? s.mode;
    const prompt = (hist?.prompt ?? s.prompt).trim();
    const regenerate = !!opts.regenerate;
    const mode: AIMode = uiMode === 'edit' && regenerate ? 'regenerate' : uiMode;
    if (!prompt && mode !== 'animate' && mode !== 'regenerate') {
      set({ run: { ...IDLE_RUN, status: 'error', error: 'Describe what you want first.' } });
      return;
    }
    const sel = useUI.getState().selection;
    if ((mode === 'edit' || mode === 'regenerate' || mode === 'animate') && !sel.length) {
      set({ run: { ...IDLE_RUN, status: 'error', error: 'Select a layer on the canvas first.' } });
      return;
    }
    if (hist) set({ mode: hist.mode, prompt: hist.prompt });

    const task = MODE_TASK[mode];
    const model = resolveModel(task);
    if (!model) {
      set({ run: { ...IDLE_RUN, status: 'error', error: s.status === 'connected' ? 'No suitable model installed. Pull one (see the suggestions below).' : 'Ollama is not connected.' } });
      return;
    }
    const info = get().models.find((m) => m.name === model);
    const doc = docApi.doc;
    const wantsVision = !!info?.capabilities?.includes('vision') && s.styleSource === 'match' && pageHasContent(doc, currentRootId()) && mode !== 'animate' && mode !== 'svg';
    const job: AIJob = {
      mode,
      prompt,
      model,
      capabilities: info?.capabilities,
      contextLength: info?.contextLength,
      styleSource: s.styleSource,
      presetId: s.presetId,
      settings: s.settings,
      variants: s.variants,
      selection: [...sel],
      captureImage: wantsVision ? captureCanvasImage : undefined,
    };

    controller = new AbortController();
    const ctl = controller;
    set({ run: { ...IDLE_RUN, status: 'running', mode: uiMode, startedAt: Date.now(), phase: 'reading', job } });
    const patch = (p: Partial<RunState>) => set((st) => (st.run.startedAt === get().run.startedAt ? { run: { ...st.run, ...p } } : st));
    const histId = histSeq++;
    const item: HistoryItem = { id: histId, mode: uiMode, prompt: prompt || (uiMode === 'edit' ? (regenerate ? 'Regenerate selection' : 'Edit selection') : uiMode === 'animate' ? 'Animate selection' : ''), at: Date.now(), ok: false };

    try {
      const outcome = await runAIJob(
        job,
        {
          onPhase: (phase, detail) => patch({ phase, phaseDetail: detail }),
          onProgress: (progress) => patch({ progress }),
          onVariant: (v) => set((st) => ({ run: { ...st.run, variants: [...st.run.variants, v], chosen: st.run.variants.length === 0 ? v.index : st.run.chosen } })),
          onImageAttached: () => patch({ usedVision: true }),
        },
        ctl.signal,
      );
      item.ok = true;
      if (outcome.kind === 'svg') {
        patch({ status: 'preview', outcome, variants: outcome.variants, endedAt: Date.now(), phase: 'done' });
      } else {
        patch({ status: 'applied', outcome, endedAt: Date.now(), phase: 'done', appliedHistoryId: 'historyId' in outcome ? outcome.historyId : undefined });
        if (outcome.kind === 'animated') {
          // immediate live preview of the new motion
          try {
            useUI.getState().select(outcome.targets);
            requestAnimationFrame(() => runCommand('anim.playSelection'));
          } catch {
            /* optional */
          }
        }
      }
    } catch (e) {
      if (isAbortError(e) || ctl.signal.aborted) {
        // keep finished SVG variants if any
        const keep = get().run.variants;
        patch({ status: keep.length ? 'preview' : 'cancelled', endedAt: Date.now(), error: null });
      } else {
        const msg = e instanceof AIError || e instanceof OllamaError ? e.message : e instanceof Error ? e.message : String(e);
        patch({ status: 'error', error: msg, endedAt: Date.now() });
        if (e instanceof OllamaError && (e.kind === 'not-running' || e.kind === 'model-missing')) void get().refresh({ quiet: true });
      }
    } finally {
      if (controller === ctl) controller = null;
      set((st) => ({ history: [item, ...st.history.filter((h) => !(h.mode === item.mode && h.prompt === item.prompt))].slice(0, 20) }));
    }
  },

  cancel() {
    controller?.abort();
  },

  applyVariant(index) {
    const { run, prompt } = get();
    const v = run.variants[index ?? run.chosen];
    if (!v) return;
    const label = aiLabel(run.job?.prompt || prompt, 'Logo');
    const id = insertSvgNode(v.svg, { width: v.width, height: v.height }, svgNodeName(run.job?.prompt || prompt), label);
    if (!id) return;
    const past = useDoc.getState().past;
    set({ run: { ...run, status: 'applied', appliedHistoryId: past[past.length - 1]?.id, outcome: { kind: 'inserted', label, rootIds: [id], warnings: [], stats: run.outcome?.stats ?? { tokens: 0, tokensPerSecond: 0, attempts: 1 }, historyId: past[past.length - 1]?.id }, chosen: index ?? run.chosen } });
  },

  discard() {
    controller?.abort();
    set({ run: IDLE_RUN });
  },

  undoApplied() {
    const { run } = get();
    const past = useDoc.getState().past;
    if (run.appliedHistoryId != null && past[past.length - 1]?.id === run.appliedHistoryId) useDoc.getState().undo();
    // svg: go back to the variant picker, everything else back to idle
    if (run.job?.mode === 'svg' && run.variants.length) set({ run: { ...run, status: 'preview', appliedHistoryId: undefined } });
    else set({ run: IDLE_RUN });
  },
}));

// ─── Model resolution ────────────────────────────────────────────────────────

/** The model to use for a task: explicit choice if still installed, else the best recommendation. */
export function resolveModel(task: AITask): string | null {
  const { models, prefs } = useAI.getState();
  if (!models.length) return null;
  const has = (n?: string) => !!n && models.some((m) => m.name === n);
  if (prefs.single) {
    if (has(prefs.singleModel)) return prefs.singleModel!;
    return bestOverall(models)?.name ?? null;
  }
  const chosen = prefs.tasks[task];
  if (has(chosen)) return chosen!;
  return bestModel(models, task)?.name ?? null;
}

export function useResolvedModel(task: AITask): string | null {
  return useAI((s) => {
    void s.models;
    void s.prefs;
    return resolveModel(task);
  });
}

export function rankedFor(task: AITask, wantVision = false) {
  return recommendModels(useAI.getState().models, task, { wantVision });
}

export { DEFAULT_BASE_URL, TASKS };
export const aiApi = {
  get state() {
    return useAI.getState();
  },
};

/** Open the AI tab, optionally switching mode, and focus the prompt. */
export function openAI(mode?: UiMode) {
  useUI.getState().set({ rightTab: 'ai' });
  if (mode) useAI.getState().set({ mode });
  useAI.getState().focusPrompt();
}
