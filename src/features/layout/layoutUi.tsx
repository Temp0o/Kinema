/**
 * Free / Flow layout UI: the switch control (used in the toolbar, page settings and
 * the Design panel), the Shift+F context toggle, and first-open conversion of
 * template pages to Free (the default for new projects).
 */
import { Move, Rows3 } from 'lucide-react';
import { toast } from 'sonner';
import { useDoc } from '@/core/store/docStore';
import { useUI, uiApi } from '@/core/store/uiStore';
import { currentRootId, useCurrentRootId } from '@/core/store/actions';
import { isContainerType } from '@/core/model/factory';
import type { NodeId } from '@/core/model/types';
import { Segmented } from '@/ui/primitives';
import { docApi } from '@/core/store/docStore';
import { convertToFree, layoutModeOf, setLayoutMode, type LayoutMode } from './layoutMode';

const TIPS: Record<LayoutMode, string> = {
  free: 'Free — place and move items anywhere (absolute positioning)',
  flow: 'Flow — items stack and align automatically (auto layout)',
};

export function useLayoutMode(id: NodeId | null): LayoutMode | null {
  return useDoc((s) => {
    const bp = useUI.getState().breakpoint;
    return id && s.doc.nodes[id] ? layoutModeOf(s.doc, id, bp) : null;
  });
}

function announce(id: NodeId, mode: LayoutMode) {
  const isPage = id === currentRootId();
  const name = isPage ? 'Page' : docApi.doc.nodes[id]?.name ?? 'Container';
  toast(`${name} layout: ${mode === 'free' ? 'Free' : 'Flow'}`, {
    description: mode === 'free' ? 'Items keep their place and can be moved anywhere.' : 'Items now stack automatically in reading order.',
    action: { label: 'Undo', onClick: () => useDoc.getState().undo() },
  });
}

export function switchLayout(id: NodeId, mode: LayoutMode) {
  if (setLayoutMode(id, mode)) announce(id, mode);
}

/** Free / Flow switch for a container (defaults to the current page). */
export function LayoutModeSwitch({ id, compact, className }: { id?: NodeId | null; compact?: boolean; className?: string }) {
  const rootId = useCurrentRootId();
  const target = id ?? rootId;
  const mode = useLayoutMode(target);
  if (!target || !mode) return null;
  return (
    <Segmented
      className={className}
      value={mode}
      onChange={(v) => switchLayout(target, v)}
      options={[
        { value: 'free', icon: <Move />, label: compact ? undefined : 'Free', tooltip: TIPS.free },
        { value: 'flow', icon: <Rows3 />, label: compact ? undefined : 'Flow', tooltip: TIPS.flow },
      ]}
    />
  );
}

/** Shift+F: switch the selected container (or the page) between Free and Flow. */
export function toggleLayoutModeForContext() {
  const doc = docApi.doc;
  const sel = uiApi.state.selection;
  const one = sel.length === 1 ? doc.nodes[sel[0]] : undefined;
  const target = one && isContainerType(one.type) && one.type !== 'button' && one.type !== 'link' ? one.id : currentRootId();
  if (!target) return;
  const next: LayoutMode = layoutModeOf(doc, target) === 'free' ? 'flow' : 'free';
  switchLayout(target, next);
}

// ─── First-open conversion of template pages to Free ─────────────────────────

let converting = false;

async function convertPendingPages() {
  const doc = docApi.doc;
  if (converting || !doc.settings.freeLayoutOnOpen) return;
  converting = true;
  try {
    // let fonts/images settle so measured heights are final
    await (document.fonts?.ready ?? Promise.resolve());
    await new Promise((r) => setTimeout(r, 250));
    if (useUI.getState().route !== 'editor') return;
    const ui = uiApi.state;
    const savedPage = ui.activePageId;
    for (const page of docApi.doc.pages) {
      if (uiApi.state.activePageId !== page.id) {
        useUI.getState().set({ activePageId: page.id, editingComponentId: null });
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
      convertToFree(page.rootId, { skipHistory: true });
    }
    useUI.getState().set({ activePageId: savedPage });
    docApi.mutate('Free layout', (d) => void delete d.settings.freeLayoutOnOpen, { skipHistory: true });
  } finally {
    converting = false;
  }
}

export function installLayout() {
  const check = () => {
    if (useUI.getState().route === 'editor' && docApi.doc.settings.freeLayoutOnOpen) void convertPendingPages();
  };
  const unDoc = useDoc.subscribe((s, p) => s.doc !== p.doc && check());
  const unUi = useUI.subscribe((s, p) => s.route !== p.route && check());
  check();
  return () => {
    unDoc();
    unUi();
  };
}
