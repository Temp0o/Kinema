/**
 * Installer for the projects / components / library module: registers commands,
 * keeps the window title in sync, and mounts the always-present overlays
 * (component edit bar, save-to-library dialog) in a separate React root.
 */
import { createRoot } from 'react-dom/client';
import { useUI } from '@/core/store/uiStore';
import { TooltipProvider } from '@/ui/primitives';
import { registerComponentCommands } from '@/features/components/componentCommands';
import { ComponentEditBar } from '@/features/components/ComponentEditBar';
import { registerLibraryCommands } from '@/features/library/libraryCommands';
import { SaveToLibraryDialog } from '@/features/library/SaveToLibraryDialog';
import { flushLibrary } from '@/features/library/libraryStore';
import { windowTitle } from './projectService';

function Overlays() {
  return (
    <TooltipProvider>
      <ComponentEditBar />
      <SaveToLibraryDialog />
    </TooltipProvider>
  );
}

export function installProjectsLibrary() {
  const offComponents = registerComponentCommands();
  const offLibrary = registerLibraryCommands();

  const host = document.createElement('div');
  host.className = 'k-overlay-host';
  document.body.appendChild(host);
  const root = createRoot(host);
  root.render(<Overlays />);

  const syncTitle = () => {
    document.title = windowTitle();
  };
  const offTitle = useUI.subscribe((s, prev) => {
    if (s.route !== prev.route || s.projectName !== prev.projectName) syncTitle();
  });
  syncTitle();

  const onUnload = () => void flushLibrary();
  window.addEventListener('beforeunload', onUnload);

  return () => {
    window.removeEventListener('beforeunload', onUnload);
    offTitle();
    offComponents();
    offLibrary();
    setTimeout(() => {
      root.unmount();
      host.remove();
    }, 0);
  };
}
