/**
 * Document store: the current project's KDocument plus undo/redo history.
 *
 * All document mutations MUST go through `mutate()` (or a transaction) so they are
 * recorded as Immer patches. One history entry == one user-visible undo step.
 */
import { create } from 'zustand';
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import type { KDocument } from '../model/types';
import { createDocument } from '../model/factory';

enablePatches();

export interface HistoryEntry {
  id: number;
  label: string;
  patches: Patch[];
  inverse: Patch[];
  time: number;
  /** AI-originated change (shown with a sparkle in the history panel). */
  ai?: boolean;
  /** Entries with the same key within COALESCE_MS merge (slider drags, typing). */
  coalesceKey?: string;
}

export interface MutateOptions {
  coalesceKey?: string;
  ai?: boolean;
  /** Don't record in history (e.g. ephemeral sync). Use sparingly. */
  skipHistory?: boolean;
}

interface Transaction {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  ai?: boolean;
  /** document snapshot at begin, for cancel() */
  base: KDocument;
}

export interface DocState {
  doc: KDocument;
  /** increments on every document change (autosave watches this) */
  revision: number;
  /** revision at last successful save */
  savedRevision: number;
  past: HistoryEntry[];
  future: HistoryEntry[];
  tx: Transaction | null;

  /** Apply a recipe to the document as one history step (or as part of an open transaction). */
  mutate: (label: string, recipe: (draft: Draft<KDocument>) => void, opts?: MutateOptions) => void;
  /** Group many mutate() calls (e.g. a drag) into one history step. */
  beginTransaction: (label: string, opts?: { ai?: boolean }) => void;
  commitTransaction: (label?: string) => void;
  cancelTransaction: () => void;
  undo: () => void;
  redo: () => void;
  /** Jump to the state after `n` history steps (0 = as opened) — undoes/redoes in one go. */
  goToHistory: (n: number) => void;
  /** Replace the document (project load). Clears history. */
  loadDocument: (doc: KDocument) => void;
  markSaved: (revision: number) => void;
  clearHistory: () => void;
}

const MAX_HISTORY = 300;
const COALESCE_MS = 800;
let entrySeq = 1;

export const useDoc = create<DocState>()((set, get) => ({
  doc: createDocument(),
  revision: 0,
  savedRevision: 0,
  past: [],
  future: [],
  tx: null,

  mutate(label, recipe, opts = {}) {
    const state = get();
    const [next, patches, inverse] = produceWithPatches(state.doc, recipe);
    if (patches.length === 0) return;

    if (state.tx) {
      set({
        doc: next,
        revision: state.revision + 1,
        tx: { ...state.tx, patches: [...state.tx.patches, ...patches], inverse: [...inverse, ...state.tx.inverse] },
      });
      return;
    }

    if (opts.skipHistory) {
      set({ doc: next, revision: state.revision + 1 });
      return;
    }

    const now = Date.now();
    const last = state.past[state.past.length - 1];
    if (opts.coalesceKey && last && last.coalesceKey === opts.coalesceKey && now - last.time < COALESCE_MS) {
      const merged: HistoryEntry = {
        ...last,
        patches: [...last.patches, ...patches],
        inverse: [...inverse, ...last.inverse],
        time: now,
      };
      set({ doc: next, revision: state.revision + 1, past: [...state.past.slice(0, -1), merged], future: [] });
      return;
    }

    const entry: HistoryEntry = { id: entrySeq++, label, patches, inverse, time: now, ai: opts.ai, coalesceKey: opts.coalesceKey };
    const past = [...state.past, entry];
    if (past.length > MAX_HISTORY) past.splice(0, past.length - MAX_HISTORY);
    set({ doc: next, revision: state.revision + 1, past, future: [] });
  },

  beginTransaction(label, opts = {}) {
    const state = get();
    if (state.tx) return; // nested begin → join existing
    set({ tx: { label, patches: [], inverse: [], ai: opts.ai, base: state.doc } });
  },

  commitTransaction(label) {
    const state = get();
    const tx = state.tx;
    if (!tx) return;
    if (tx.patches.length === 0) {
      set({ tx: null });
      return;
    }
    const entry: HistoryEntry = {
      id: entrySeq++,
      label: label ?? tx.label,
      patches: tx.patches,
      inverse: tx.inverse,
      time: Date.now(),
      ai: tx.ai,
    };
    const past = [...state.past, entry];
    if (past.length > MAX_HISTORY) past.splice(0, past.length - MAX_HISTORY);
    set({ tx: null, past, future: [] });
  },

  cancelTransaction() {
    const tx = get().tx;
    if (!tx) return;
    set((s) => ({ tx: null, doc: tx.base, revision: s.revision + 1 }));
  },

  undo() {
    const state = get();
    if (state.tx) get().commitTransaction();
    const s = get();
    const entry = s.past[s.past.length - 1];
    if (!entry) return;
    const doc = applyPatches(s.doc, entry.inverse);
    set({ doc, revision: s.revision + 1, past: s.past.slice(0, -1), future: [entry, ...s.future] });
  },

  redo() {
    const s = get();
    const entry = s.future[0];
    if (!entry) return;
    const doc = applyPatches(s.doc, entry.patches);
    set({ doc, revision: s.revision + 1, past: [...s.past, entry], future: s.future.slice(1) });
  },

  goToHistory(n) {
    if (get().tx) get().commitTransaction();
    const s = get();
    const target = Math.max(0, Math.min(n, s.past.length + s.future.length));
    if (target === s.past.length) return;
    let doc = s.doc;
    if (target < s.past.length) {
      const undone = s.past.slice(target);
      for (let i = undone.length - 1; i >= 0; i--) doc = applyPatches(doc, undone[i].inverse);
      set({ doc, revision: s.revision + 1, past: s.past.slice(0, target), future: [...undone, ...s.future] });
    } else {
      const redone = s.future.slice(0, target - s.past.length);
      for (const e of redone) doc = applyPatches(doc, e.patches);
      set({ doc, revision: s.revision + 1, past: [...s.past, ...redone], future: s.future.slice(redone.length) });
    }
  },

  loadDocument(doc) {
    set((s) => ({ doc, past: [], future: [], tx: null, revision: s.revision + 1, savedRevision: s.revision + 1 }));
  },

  markSaved(revision) {
    set({ savedRevision: revision });
  },

  clearHistory() {
    set({ past: [], future: [], tx: null });
  },
}));

/** Non-hook accessors for use in event handlers / actions. */
export const docApi = {
  get doc() {
    return useDoc.getState().doc;
  },
  mutate: (...a: Parameters<DocState['mutate']>) => useDoc.getState().mutate(...a),
  begin: (label: string, opts?: { ai?: boolean }) => useDoc.getState().beginTransaction(label, opts),
  commit: (label?: string) => useDoc.getState().commitTransaction(label),
  cancel: () => useDoc.getState().cancelTransaction(),
};
