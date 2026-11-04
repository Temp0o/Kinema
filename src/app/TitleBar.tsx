import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ChevronDown,
  Eye,
  Monitor,
  Play,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
  Upload,
  Sparkles,
  FolderOpen,
  Save,
  Moon,
  Sun,
  Settings,
  Plus,
  FileText,
  Check,
  Square,
  HelpCircle,
} from 'lucide-react';
import { helpMenuItems } from '@/features/help/helpMenu';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { Button, IconButton, NumberField, Segmented, Tooltip } from '@/ui/primitives';
import { Dropdown, type MenuEntry } from '@/ui/menu';
import { LogoMark } from './Logo';
import { closeProject, getSaveStatus, renameCurrentProject, saveCurrent, subscribeSaveStatus } from '@/features/projects/projectService';
import { addPage } from '@/core/store/actions';
import { breakpointForWidth } from '@/core/style/style';
import { zoomAt, zoomToFit } from '@/features/canvas/Canvas';
import { toggleTheme } from '@/features/shortcuts/coreCommands';
import { runCommand } from '@/features/shortcuts/shortcuts';
import { platform } from '@/platform';
import { usePlayback } from '@/features/animation/playbackStore';

function SaveIndicator() {
  const s = useSyncExternalStore(subscribeSaveStatus, getSaveStatus);
  const dirty = useDoc((st) => st.revision !== st.savedRevision);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  let label = 'Saved';
  if (s.status === 'saving') label = 'Saving…';
  else if (s.status === 'error') label = 'Save failed';
  else if (dirty) label = 'Unsaved changes';
  else if (s.lastSavedAt) {
    const sec = Math.round((Date.now() - s.lastSavedAt) / 1000);
    label = sec < 45 ? 'Saved just now' : `Saved ${Math.round(sec / 60)}m ago`;
  }
  return (
    <span className="k-titlebar__status" data-state={s.status === 'error' ? 'error' : dirty ? 'dirty' : 'ok'}>
      {s.status === 'saving' ? <span className="k-spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> : <span className="k-dot" />}
      {label}
    </span>
  );
}

function ProjectName() {
  const name = useUI((s) => s.projectName);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  useEffect(() => setVal(name), [name]);
  if (editing)
    return (
      <input
        className="k-titlebar__name-input k-no-drag"
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setVal(name);
            setEditing(false);
          }
        }}
        onBlur={() => {
          setEditing(false);
          if (val.trim() && val !== name) renameCurrentProject(val);
        }}
      />
    );
  return (
    <button className="k-titlebar__name k-no-drag" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
      {name || 'Untitled'}
    </button>
  );
}

function PageSwitcher() {
  const pages = useDoc((s) => s.doc.pages);
  const activePageId = useUI((s) => s.activePageId);
  const editingComponentId = useUI((s) => s.editingComponentId);
  const compName = useDoc((s) => (editingComponentId ? s.doc.components[editingComponentId]?.name : null));
  const active = pages.find((p) => p.id === activePageId) ?? pages[0];
  const items: MenuEntry[] = [
    { type: 'label', label: 'Pages' },
    ...pages.map((p) => ({
      label: p.name,
      icon: <FileText />,
      checked: !editingComponentId && p.id === active?.id,
      onSelect: () => useUI.getState().set({ activePageId: p.id, editingComponentId: null, selection: [] }),
    })),
    { type: 'separator' },
    { label: 'New page', icon: <Plus />, onSelect: () => addPage() },
  ];
  return (
    <Dropdown
      items={items}
      trigger={
        <button className="k-titlebar__page k-no-drag">
          {editingComponentId ? <span style={{ color: 'var(--component)' }}>◆ {compName}</span> : active?.name}
          <ChevronDown />
        </button>
      }
    />
  );
}

function BreakpointSwitcher() {
  const breakpoints = useDoc((s) => s.doc.breakpoints);
  const bp = useUI((s) => s.breakpoint);
  const width = useUI((s) => s.canvasWidth);
  const icons = { desktop: <Monitor />, tablet: <Tablet />, mobile: <Smartphone />, custom: <Square /> };
  const isPreset = breakpoints.some((b) => b.id === bp && b.width === width);
  return (
    <div className="k-hstack k-no-drag">
      <Segmented
        value={isPreset ? bp : ''}
        onChange={(id) => {
          const b = breakpoints.find((x) => x.id === id)!;
          useUI.getState().set({ breakpoint: b.id, canvasWidth: b.width });
        }}
        options={breakpoints.map((b) => ({
          value: b.id,
          icon: icons[b.icon],
          tooltip: `${b.name} · ${b.width}px${b.maxWidth ? ` (≤ ${b.maxWidth}px)` : ''}`,
        }))}
      />
      <NumberField
        className="k-titlebar__width"
        value={width}
        min={240}
        max={3840}
        suffix="px"
        precision={0}
        label="W"
        labelTitle="Canvas width — edits apply to the breakpoint for this width"
        onChange={(v, { final }) => {
          const w = Math.round(v);
          const doc = useDoc.getState().doc;
          useUI.getState().set({ canvasWidth: w, breakpoint: breakpointForWidth(doc, w) });
          if (final) requestAnimationFrame(() => zoomToFit());
        }}
      />
    </div>
  );
}

function ZoomMenu() {
  const zoom = useUI((s) => s.viewport.zoom);
  const center = () => {
    const vp = document.querySelector<HTMLElement>('.kc-viewport');
    return vp ? [vp.clientWidth / 2, vp.clientHeight / 2] : [600, 400];
  };
  const items: MenuEntry[] = [
    { label: 'Zoom in', shortcut: 'Mod+=', onSelect: () => runCommand('view.zoomIn') },
    { label: 'Zoom out', shortcut: 'Mod+-', onSelect: () => runCommand('view.zoomOut') },
    { label: 'Fit canvas to screen', shortcut: 'Mod+0', onSelect: () => zoomToFit() },
    { type: 'separator' },
    ...[0.25, 0.5, 1, 2].map((z) => ({
      label: `${z * 100}%`,
      checked: Math.abs(zoom - z) < 0.001,
      onSelect: () => {
        const [x, y] = center();
        zoomAt(z, x, y);
      },
    })),
  ];
  return (
    <Dropdown
      align="end"
      items={items}
      trigger={
        <button className="k-titlebar__zoom k-no-drag">
          {Math.round(zoom * 100)}%<ChevronDown />
        </button>
      }
    />
  );
}

export function TitleBar() {
  const canUndo = useDoc((s) => s.past.length > 0);
  const canRedo = useDoc((s) => s.future.length > 0);
  const theme = useUI((s) => s.theme);
  const playing = usePlayback((s) => s.playing);
  const mac = platform.window?.platform === 'darwin';

  const appMenu: MenuEntry[] = [
    { label: 'All projects', icon: <FolderOpen />, onSelect: () => void closeProject() },
    { label: 'Save', icon: <Save />, shortcut: 'Mod+S', onSelect: () => void saveCurrent() },
    { type: 'separator' },
    { label: 'Export…', icon: <Upload />, shortcut: 'Mod+E', onSelect: () => useUI.getState().set({ exportOpen: true }) },
    { type: 'separator' },
    { label: theme === 'dark' ? 'Light theme' : 'Dark theme', icon: theme === 'dark' ? <Sun /> : <Moon />, onSelect: toggleTheme },
    { label: 'Settings', icon: <Settings />, shortcut: 'Mod+,', onSelect: () => useUI.getState().set({ settingsOpen: true }) },
    { type: 'submenu', label: 'Help', icon: <HelpCircle />, items: helpMenuItems() },
  ];

  return (
    <header className="k-titlebar k-drag-region" data-mac={mac ? 'true' : undefined}>
      <div className="k-titlebar__left">
        <Dropdown
          items={appMenu}
          trigger={
            <button className="k-titlebar__logo k-no-drag" aria-label="Main menu">
              <LogoMark size={22} />
              <ChevronDown />
            </button>
          }
        />
        <div className="k-titlebar__project">
          <ProjectName />
          <SaveIndicator />
        </div>
        <span className="k-titlebar__sep" />
        <PageSwitcher />
      </div>

      <div className="k-titlebar__center">
        <BreakpointSwitcher />
      </div>

      <div className="k-titlebar__right k-no-drag">
        <IconButton label="Undo" shortcut="Mod+Z" disabled={!canUndo} onClick={() => useDoc.getState().undo()} tooltipSide="bottom">
          <Undo2 />
        </IconButton>
        <IconButton label="Redo" shortcut="Mod+Shift+Z" disabled={!canRedo} onClick={() => useDoc.getState().redo()} tooltipSide="bottom">
          <Redo2 />
        </IconButton>
        <ZoomMenu />
        <span className="k-titlebar__sep" />
        <Tooltip content={playing ? 'Stop animations' : 'Play page animations'} shortcut="Shift+Space" side="bottom">
          <button className="k-titlebar__play" data-playing={playing ? 'true' : undefined} onClick={() => runCommand('anim.playAll')}>
            {playing ? <Square /> : <Play />}
          </button>
        </Tooltip>
        <IconButton label="Ask AI" shortcut="Mod+I" onClick={() => useUI.getState().set({ rightTab: 'ai' })} tooltipSide="bottom">
          <Sparkles />
        </IconButton>
        <Button variant="ghost" icon={<Eye />} onClick={() => useUI.getState().set({ previewOpen: true })}>
          Preview
        </Button>
        <Button variant="primary" icon={<Upload />} onClick={() => useUI.getState().set({ exportOpen: true })}>
          Export
        </Button>
      </div>
    </header>
  );
}

export { Check };
