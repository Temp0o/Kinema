import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Layers, Image as ImageIcon, SlidersHorizontal, Sparkles, Zap, MousePointer2, Hand, Square, Type, ChevronDown, Clapperboard, Code2, X } from 'lucide-react';
import { useUI, savePref, type Tool } from '@/core/store/uiStore';
import { TitleBar, setWorkspaceMode } from './TitleBar';
import { Canvas } from '@/features/canvas/Canvas';
import { LayersPanel } from '@/features/layers/LayersPanel';
import { LibraryBrowser } from '@/features/library-browser/LibraryBrowser';
import { PresetBrowser } from '@/features/animation/PresetBrowser';
import { SelectionBar } from '@/features/selection-bar/SelectionBar';
import { DesignPanel } from '@/features/properties/DesignPanel';
import { AnimatePanel } from '@/features/animation/AnimatePanel';
import { TimelinePanel } from '@/features/animation/TimelinePanel';
import { AIPanel } from '@/features/ai/AIPanel';
import { PreviewDialog } from '@/features/preview/PreviewDialog';
import { ExportDialog } from '@/features/export/ExportDialog';
import { CodePanel } from '@/features/export/CodePanel';
import { IconButton, Tooltip } from '@/ui/primitives';
import { LayoutModeSwitch } from '@/features/layout/layoutUi';
import './shell.css';

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

const TOOLS: { id: Tool; label: string; icon: ReactNode; shortcut: string }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 />, shortcut: 'V' },
  { id: 'hand', label: 'Hand', icon: <Hand />, shortcut: 'H' },
  { id: 'box', label: 'Box', icon: <Square />, shortcut: 'B' },
  { id: 'text', label: 'Text', icon: <Type />, shortcut: 'T' },
  { id: 'image', label: 'Image', icon: <ImageIcon />, shortcut: 'I' },
];

function Toolbar() {
  const tool = useUI((s) => s.tool);
  return (
    <div className="k-toolbar" role="toolbar" aria-label="Tools" data-tour="toolbar">
      {TOOLS.map((t) => (
        <IconButton key={t.id} label={t.label} shortcut={t.shortcut} active={tool === t.id} onClick={() => useUI.getState().set({ tool: t.id })}>
          {t.icon}
        </IconButton>
      ))}
      <span className="k-toolbar__sep" />
      <span className="k-toolbar__label">Page</span>
      <span data-tour="layout-mode" style={{ display: 'contents' }}>
        <LayoutModeSwitch className="k-toolbar__placement" />
      </span>
      <span className="k-toolbar__sep" />
      <IconButton label="Animate workspace (timeline)" shortcut="Alt+2" onClick={() => setWorkspaceMode('animate')}>
        <Clapperboard />
      </IconButton>
      <Tooltip content="Ask Kinema AI" shortcut="Mod+I">
        <button className="k-toolbar__ai" onClick={() => useUI.getState().set({ assistantOpen: true })}>
          <Sparkles />
          <span>Generate</span>
        </button>
      </Tooltip>
    </div>
  );
}

/** Keeps legacy navigation calls (rightTab / leftTab) working with the new workspaces. */
function useLegacyNavigation() {
  const rightTab = useUI((s) => s.rightTab);
  const leftTab = useUI((s) => s.leftTab);
  useEffect(() => {
    if (rightTab === 'design') return;
    const ui = useUI.getState();
    if (rightTab === 'ai') ui.set({ assistantOpen: true, rightTab: 'design' });
    else if (rightTab === 'animate') ui.set({ mode: 'animate', previewOpen: false, rightTab: 'design' });
  }, [rightTab]);
  useEffect(() => {
    if (leftTab === 'layers') return;
    const map = { insert: 'home', assets: 'uploads', library: 'mine' } as const;
    useUI.getState().set({ mode: 'design', previewOpen: false, libraryView: map[leftTab], leftTab: 'layers' });
  }, [leftTab]);
}

function LayersSection() {
  const height = useUI((s) => s.layersHeight);
  const [open, setOpen] = useState(true);
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const start = e.clientY;
    const startH = useUI.getState().layersHeight;
    const move = (ev: PointerEvent) => useUI.getState().set({ layersHeight: Math.min(720, Math.max(140, startH + (start - ev.clientY))) });
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      savePref('layersHeight', useUI.getState().layersHeight);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };
  return (
    <section data-tour="layers" className="k-ws-layers" data-open={open ? 'true' : undefined} style={open ? { height } : undefined} aria-label="Layers">
      {open && <div className="k-ws-split" onPointerDown={onPointerDown} />}
      <button className="k-ws-sectionhead" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Layers />
        <span>Layers</span>
        <ChevronDown className="k-ws-sectionhead__chev" />
      </button>
      {open && (
        <div className="k-ws-layers__body" data-panel="layers">
          <LayersPanel />
        </div>
      )}
    </section>
  );
}

function PanelHead({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="k-ws-panelhead">
      {icon}
      <span>{title}</span>
      {children}
    </div>
  );
}

export function EditorShell() {
  useLegacyNavigation();
  const mode = useUI((s) => s.mode);
  const preview = useUI((s) => s.previewOpen);
  const assistant = useUI((s) => s.assistantOpen);
  const leftWidth = useUI((s) => s.leftWidth);
  const rightWidth = useUI((s) => s.rightWidth);
  const bottomPanel = useUI((s) => s.bottomPanel);
  const bottomHeight = useUI((s) => s.bottomHeight);
  const workspace = preview ? 'preview' : mode;
  const showCode = mode === 'design' && bottomPanel === 'code';

  return (
    <div className="k-editor" data-mode={workspace}>
      <TitleBar />
      <div className="k-editor__body">
        {!preview && (
          <aside className="k-panel k-panel--left" style={{ width: leftWidth }} aria-label={mode === 'design' ? 'Library and layers' : 'Motion library and layers'}>
            <div className="k-ws-primary" data-panel={mode === 'design' ? 'insert' : 'motion'} data-tour={mode === 'design' ? 'library' : 'motion-library'}>
              {mode === 'design' ? (
                <LibraryBrowser />
              ) : (
                <>
                  <PanelHead icon={<Zap />} title="Motion library" />
                  <div className="k-ws-motionlib">
                    <PresetBrowser />
                  </div>
                </>
              )}
            </div>
            <LayersSection />
            <Resizer side="left" />
          </aside>
        )}

        <main className="k-editor__center">
          {preview ? (
            <PreviewDialog />
          ) : (
            <>
              <div className="k-editor__canvas" data-tour="canvas">
                <Canvas />
                <SelectionBar />
                <Toolbar />
              </div>
              {(mode === 'animate' || showCode) && (
                <section data-tour={mode === 'animate' ? 'timeline' : 'code'} className="k-bottom" data-kind={mode === 'animate' ? 'timeline' : 'code'} style={{ height: mode === 'animate' ? Math.max(bottomHeight, 260) : bottomHeight }} aria-label={mode === 'animate' ? 'Timeline' : 'Code'}>
                  <Resizer side="bottom" />
                  <div className="k-bottom__head">
                    <span className="k-bottom__title">
                      {mode === 'animate' ? <Clapperboard /> : <Code2 />}
                      {mode === 'animate' ? 'Timeline' : 'Code'}
                    </span>
                    {showCode && (
                      <IconButton label="Close code" size="sm" onClick={() => useUI.getState().set({ bottomPanel: null })}>
                        <ChevronDown />
                      </IconButton>
                    )}
                  </div>
                  <div className="k-bottom__content">{mode === 'animate' ? <TimelinePanel /> : <CodePanel />}</div>
                </section>
              )}
            </>
          )}
        </main>

        {!preview && (
          <aside data-tour={mode === 'design' ? 'inspector' : 'animation-inspector'} className="k-panel k-panel--right" style={{ width: rightWidth }} aria-label={mode === 'design' ? 'Inspector' : 'Animation inspector'}>
            <PanelHead icon={mode === 'design' ? <SlidersHorizontal /> : <Zap />} title={mode === 'design' ? 'Inspector' : 'Animation'} />
            <div className="k-panel__content" data-panel={mode === 'design' ? 'design' : 'animate'}>
              {mode === 'design' ? <DesignPanel /> : <AnimatePanel />}
            </div>
            <Resizer side="right" />
          </aside>
        )}

        {assistant && (
          <aside className="k-assistant" aria-label="AI assistant">
            <PanelHead icon={<Sparkles />} title="AI assistant">
              <IconButton label="Close assistant" size="sm" onClick={() => useUI.getState().set({ assistantOpen: false })} style={{ marginLeft: 'auto' }}>
                <X />
              </IconButton>
            </PanelHead>
            <div className="k-panel__content" data-panel="ai">
              <AIPanel />
            </div>
          </aside>
        )}
      </div>
      <ExportDialog />
    </div>
  );
}
