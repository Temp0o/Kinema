/**
 * Recently used colors (persisted in localStorage, shared by every ColorPicker).
 */
import { useSyncExternalStore } from 'react';

const KEY = 'kinema.recentColors';
const MAX = 16;
let cache: string[] | null = null;
const listeners = new Set<() => void>();

function load(): string[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    cache = [];
  }
  return cache!;
}

export function getRecentColors(): string[] {
  return load();
}

export function pushRecentColor(value: string | null | undefined) {
  const v = value?.trim();
  if (!v || /^(transparent|currentcolor|inherit)$/i.test(v)) return;
  const list = load();
  if (list[0] === v) return;
  cache = [v, ...list.filter((x) => x !== v)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useRecentColors(): string[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    load,
    load,
  );
}
