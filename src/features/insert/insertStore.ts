/** Insert panel preferences: recently used items (persisted per browser/app). */
import { create } from 'zustand';
import { savePref } from '@/core/store/uiStore';

export interface RecentEntry {
  kind: 'item' | 'icon';
  id: string;
}

function load(): RecentEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem('kinema.insertRecent') ?? '[]');
    return Array.isArray(raw) ? raw.filter((e) => e && (e.kind === 'item' || e.kind === 'icon') && typeof e.id === 'string').slice(0, 12) : [];
  } catch {
    return [];
  }
}

interface InsertState {
  recent: RecentEntry[];
  push: (e: RecentEntry) => void;
}

export const useInsertStore = create<InsertState>()((set) => ({
  recent: load(),
  push: (e) =>
    set((s) => {
      const recent = [e, ...s.recent.filter((r) => !(r.kind === e.kind && r.id === e.id))].slice(0, 12);
      savePref('insertRecent', recent);
      return { recent };
    }),
}));
