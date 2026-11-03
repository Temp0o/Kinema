import { useCallback, type ReactNode } from 'react';
import { Layers, Plus, Image as ImageIcon, BookMarked, SlidersHorizontal, Sparkles, Zap, MousePointer2, Hand, Square, Type, ChevronUp, ChevronDown, Clapperboard, Code2 } from 'lucide-react';
import { useUI, savePref, type LeftTab, type RightTab, type Tool } from '@/core/store/uiStore';
import { TitleBar } from './TitleBar';
import { Canvas } from '@/features/canvas/Canvas';
import { LayersPanel } from '@/features/layers/LayersPanel';
import { InsertPanel } from '@/features/insert/InsertPanel';
import { AssetsPanel } from '@/features/assets/AssetsPanel';
import { LibraryPanel } from '@/features/library/LibraryPanel';
import { DesignPanel } from '@/features/properties/DesignPanel';
import { AnimatePanel } from '@/features/animation/AnimatePanel';
import { TimelinePanel } from '@/features/animation/TimelinePanel';
import { AIPanel } from '@/features/ai/AIPanel';
import { PreviewDialog } from '@/features/preview/PreviewDialog';
import { ExportDialog } from '@/features/export/ExportDialog';
import { CodePanel } from '@/features/export/CodePanel';
import { IconButton, Tooltip } from '@/ui/primitives';
import './shell.css';

const LEFT_TABS: { id: LeftTab; label: string; icon: ReactNode }[] = [
  { id: 'layers', label: 'Layers', icon: <Layers /> },
  { id: 'insert', label: 'Insert', icon: <Plus /> },
  { id: 'assets', label: 'Assets', icon: <ImageIcon /> },
  { id: 'library', label: 'Library', icon: <BookMarked /> },
];

const RIGHT_TABS: { id: RightTab; label: string; icon: ReactNode }[] = [
  { id: 'design', label: 'Design', icon: <SlidersHorizontal /> },
  { id: 'animate', label: 'Animate', icon: <Zap /> },
  { id: 'ai', label: 'AI', icon: <Sparkles /> },
];

function Resizer({ side }: { side: 'left' | 'right' | 'bottom' }) {
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      const ui = useUI.getState();
      const start = side === 'bottom' ? e.clientY : e.clientX;
      const startSize = side === 'left' ? ui.leftWidth : side === 'right' ? ui.rightWidth : ui.bottomHeight;
      const key = side === 'left' ? 'leftWidth' : side === 'right' ? 'rightWidth' : 'bottomHeight';
      const [min, max] = side === 'bottom' ? [140, 560] : [220, 480];
      const move = (ev: PointerEvent) => {
        const cur = side === 'bottom' ? ev.clientY : ev.clientX;
        const delta = side === 'left' ? cur - start : start - cur;
        const size = Math.min(max, Math.max(min, startSize + delta));
        useUI.getState().set({ [key]: size } as never);
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        savePref(key, useUI.getState()[key]);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    },
    [side],
  );
  return <div className={`k-resizer k-resizer--${side}`} onPointerDown={onPointerDown} />;
}

function PanelTabs<T extends string>({ tabs, value, onChange, ariaLabel }: { tabs: { id: T; label: string; icon: ReactNode }[]; value: T; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div className="k-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className="k-tab" onClick={() => onChange(t.id)} data-tab={t.id}>
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

const TOOLS: { id: Tool; label: string; icon: ReactNode; shortcut: string }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 />, shortcut: 'V' },
  { id: 'hand', label: 'Hand', icon: <Hand />, shortcut: 'H' },
  { id: 'box', label: 'Box', icon: <Square />, shortcut: 'B' },
  { id: 'text', label: 'Text', icon: <Type />, shortcut: 'T' },
  { id: 'image', label: 'Image', icon: <ImageIcon />, shortcut: 'I' },
];

function Toolbar() {
  const tool = useUI((s) => s.tool);
  const bottom = useUI((s) => s.bottomPanel);
  return (
    <div className="k-toolbar" role="toolbar" aria-label="Tools">
      {TOOLS.map((t) => (
        <IconButton key={t.id} label={t.label} shortcut={t.shortcut} active={tool === t.id} onClick={() => useUI.getState().set({ tool: t.id })}>
          {t.icon}
        </IconButton>
      ))}
      <span className="k-toolbar__sep" />
      <IconButton
        label="Timeline"
        shortcut="Alt+T"
        active={bottom === 'timeline'}
        onClick={() => useUI.getState().set({ bottomPanel: bottom === 'timeline' ? null : 'timeline' })}
      >
        <Clapperboard />
      </IconButton>
      <Tooltip content="Ask Kinema AI" shortcut="Mod+I">
        <button className="k-toolbar__ai" onClick={() => useUI.getState().set({ rightTab: 'ai' })}>
          <Sparkles />
          <span>Generate</span>
        </button>
      </Tooltip>
    </div>
  );
}

export function EditorShell() {
  const leftTab = useUI((s) => s.leftTab);
  const rightTab = useUI((s) => s.rightTab);
  const leftWidth = useUI((s) => s.leftWidth);
  const rightWidth = useUI((s) => s.rightWidth);
  const bottomPanel = useUI((s) => s.bottomPanel);
  const bottomHeight = useUI((s) => s.bottomHeight);

  return (
    <div className="k-editor">
      <TitleBar />
      <div className="k-editor__body">
        <aside className="k-panel k-panel--left" style={{ width: leftWidth }} aria-label="Left panel">
          <PanelTabs tabs={LEFT_TABS} value={leftTab} onChange={(v) => useUI.getState().set({ leftTab: v })} ariaLabel="Left panel tabs" />
          <div className="k-panel__content" data-panel={leftTab}>
            {leftTab === 'layers' && <LayersPanel />}
            {leftTab === 'insert' && <InsertPanel />}
            {leftTab === 'assets' && <AssetsPanel />}
            {leftTab === 'library' && <LibraryPanel />}
          </div>
          <Resizer side="left" />
        </aside>

        <main className="k-editor__center">
          <div className="k-editor__canvas">
            <Canvas />
            <Toolbar />
          </div>
          {bottomPanel && (
            <section className="k-bottom" style={{ height: bottomHeight }} aria-label="Bottom panel">
              <Resizer side="bottom" />
              <div className="k-bottom__head">
                <div className="k-bottom__tabs" role="tablist" aria-label="Bottom panel tabs">
                  {(['timeline', 'code'] as const).map((id) => (
                    <button key={id} role="tab" className="k-tab" aria-selected={bottomPanel === id} onClick={() => useUI.getState().set({ bottomPanel: id })}>
                      {id === 'timeline' ? <Clapperboard /> : <Code2 />}
                      {id === 'timeline' ? 'Timeline' : 'Code'}
                    </button>
                  ))}
                </div>
                <IconButton label="Close panel" size="sm" onClick={() => useUI.getState().set({ bottomPanel: null })}>
                  <ChevronDown />
                </IconButton>
              </div>
              <div className="k-bottom__content">{bottomPanel === 'code' ? <CodePanel /> : <TimelinePanel />}</div>
            </section>
          )}
          {!bottomPanel && (
            <button className="k-bottom-reveal" onClick={() => useUI.getState().set({ bottomPanel: 'timeline' })}>
              <ChevronUp /> Timeline
            </button>
          )}
        </main>

        <aside className="k-panel k-panel--right" style={{ width: rightWidth }} aria-label="Right panel">
          <PanelTabs tabs={RIGHT_TABS} value={rightTab} onChange={(v) => useUI.getState().set({ rightTab: v })} ariaLabel="Right panel tabs" />
          <div className="k-panel__content" data-panel={rightTab}>
            {rightTab === 'design' && <DesignPanel />}
            {rightTab === 'animate' && <AnimatePanel />}
            {rightTab === 'ai' && <AIPanel />}
          </div>
          <Resizer side="right" />
        </aside>
      </div>
      <PreviewDialog />
      <ExportDialog />
    </div>
  );
}
