import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { useUI } from '@/core/store/uiStore';
import { TooltipProvider } from '@/ui/primitives';
import { EditorShell } from './EditorShell';
import { HomeScreen } from '@/features/projects/HomeScreen';
import { CommandPalette } from '@/features/command/CommandPalette';
import { ShortcutsDialog } from '@/features/command/ShortcutsDialog';
import { SettingsDialog } from '@/features/command/SettingsDialog';
import { installShortcutDispatcher } from '@/features/shortcuts/shortcuts';
import { registerCoreCommands } from '@/features/shortcuts/coreCommands';
import { installSelectionSanitizer } from '@/core/store/actions';
import { installAutosave } from '@/features/projects/projectService';
import { installFeatureModules } from './modules';
import { platform } from '@/platform';

export function App() {
  const route = useUI((s) => s.route);
  const theme = useUI((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    platform.window?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    const cleanups = [installShortcutDispatcher(), registerCoreCommands(), installSelectionSanitizer(), installAutosave(), ...installFeatureModules()];
    return () => cleanups.forEach((c) => c());
  }, []);

  // Block the browser's default file-drop navigation everywhere.
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  return (
    <TooltipProvider>
      <div className="k-app" data-platform={platform.kind}>
        {route === 'home' ? <HomeScreen /> : <EditorShell />}
        <CommandPalette />
        <ShortcutsDialog />
        <SettingsDialog />
      </div>
      <Toaster
        theme={theme}
        position="bottom-right"
        toastOptions={{ className: 'k-toast', style: { fontFamily: 'var(--font-ui)', fontSize: 12.5 } }}
        offset={56}
      />
    </TooltipProvider>
  );
}
