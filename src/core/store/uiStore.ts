/**
 * Editor UI state — everything that is NOT part of the document/undo history:
 * routing, selection, viewport, active breakpoint, panels, tools.
 */
import { create } from 'zustand';
import type { BreakpointId, InteractionState, NodeId } from '../model/types';

export type Route = 'home' | 'editor';
/** Workspace modes: one application, three task-shaped workspaces. Preview is `previewOpen`. */
export type WorkspaceMode = 'design' | 'animate';
export type LibraryView = 'home' | 'sections' | 'components' | 'icons' | 'uploads' | 'mine' | 'animations';
export type Tool = 'select' | 'hand' | 'box' | 'text' | 'image';
export type LeftTab = 'layers' | 'insert' | 'assets' | 'library';
export type RightTab = 'design' | 'animate' | 'ai';
export type BottomPanel = 'timeline' | 'code' | null;

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface UIState {
  route: Route;
  projectId: string | null;
  projectName: string;

  activePageId: string | null;
  /** When editing a component master in isolation. */
  editingComponentId: string | null;

  selection: NodeId[];
  hoverId: NodeId | null;
  editingTextId: NodeId | null;
  /** Force-show an interaction state on the canvas (properties panel state preview). */
  forcedState: { id: NodeId; state: InteractionState } | null;

  breakpoint: BreakpointId;
  /** canvas frame width (px) – normally the breakpoint width, may be custom */
  canvasWidth: number;
  /** canvas frame min-height override for custom sizes (null = use frame style) */
  canvasHeight: number | null;

  viewport: Viewport;
  tool: Tool;
  snapToGrid: boolean;
  showGrid: boolean;

  leftTab: LeftTab;
  rightTab: RightTab;
  bottomPanel: BottomPanel;
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number;

  previewOpen: boolean;
  /** Design or Animate workspace (Preview overlays either, via previewOpen). */
  mode: WorkspaceMode;
  /** AI assistant drawer open (available in every mode). */
  assistantOpen: boolean;
  libraryView: LibraryView;
  /** Height (px) of the Layers section. */
  layersHeight: number;
  /** Where the Layers panel lives: under the library (left) or above the inspector (right). */
  layersDock: 'left' | 'right';
  exportOpen: boolean;
  commandOpen: boolean;
  settingsOpen: boolean;
  shortcutsOpen: boolean;

  theme: 'dark' | 'light';

  set: (patch: Partial<UIState>) => void;
  select: (ids: NodeId[]) => void;
  toggleSelect: (id: NodeId) => void;
  setHover: (id: NodeId | null) => void;
  setViewport: (v: Partial<Viewport>) => void;
}

function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem('kinema.' + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: unknown) {
  try {
    localStorage.setItem('kinema.' + key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const useUI = create<UIState>()((set) => ({
  route: 'home',
  projectId: null,
  projectName: '',

  activePageId: null,
  editingComponentId: null,

  selection: [],
  hoverId: null,
  editingTextId: null,
  forcedState: null,

  breakpoint: 'base',
  canvasWidth: 1440,
  canvasHeight: null,

  viewport: { zoom: 0.6, panX: 0, panY: 0 },
  tool: 'select',
  snapToGrid: loadPref('snapToGrid', true),
  showGrid: loadPref('showGrid', false),

  leftTab: 'layers',
  rightTab: 'design',
  bottomPanel: null,
  leftWidth: loadPref('leftWidth', 264),
  rightWidth: loadPref('rightWidth', 300),
  bottomHeight: loadPref('bottomHeight', 260),

  previewOpen: false,
  mode: 'design',
  assistantOpen: false,
  libraryView: 'home',
  layersHeight: loadPref('layersHeight', 300),
  layersDock: loadPref<'left' | 'right'>('layersDock', 'left'),
  exportOpen: false,
  commandOpen: false,
  settingsOpen: false,
  shortcutsOpen: false,

  theme: loadPref<'dark' | 'light'>('theme', 'dark'),

  set: (patch) => set(patch),
  select: (ids) => set({ selection: [...new Set(ids)], editingTextId: null }),
  toggleSelect: (id) =>
    set((s) => ({
      selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id],
      editingTextId: null,
    })),
  setHover: (id) => set((s) => (s.hoverId === id ? s : { hoverId: id })),
  setViewport: (v) => set((s) => ({ viewport: { ...s.viewport, ...v } })),
}));

export const uiApi = {
  get state() {
    return useUI.getState();
  },
  set: (patch: Partial<UIState>) => useUI.getState().set(patch),
};
