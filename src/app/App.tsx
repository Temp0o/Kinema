import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { useUI } from '@/core/store/uiStore';
import { TooltipProvider } from '@/ui/primitives';
import { EditorShell } from './EditorShell';
import { HomeScreen } from '@/features/projects/HomeScreen';
import { CommandPalette } from '@/features/command/CommandPalette';
import { ShortcutsDialog } from '@/features/command/ShortcutsDialog';
import { SettingsDialog } from '@/features/command/SettingsDialog';
import { TourOverlay } from '@/features/onboarding/TourOverlay';
import { installShortcutDispatcher } from '@/features/shortcuts/shortcuts';
import { registerCoreCommands } from '@/features/shortcuts/coreCommands';
import { installSelectionSanitizer } from '@/core/store/actions';
import { closeProject, installAutosave } from '@/features/projects/projectService';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
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
        <ErrorBoundary
          resetKey={route}
          fallback={(error, reset) => (
            <div role="alert" style={{ padding: 32, maxWidth: 560, margin: '12vh auto', fontFamily: 'var(--font-ui)', color: 'var(--text)' }}>
              <h2 style={{ margin: 0 }}>Something went wrong</h2>
              <p style={{ opacity: 0.75 }}>Your project is saved. {error.message.slice(0, 200)}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="k-btn" onClick={reset}>
                  Try again
                </button>
                <button type="button" className="k-btn" onClick={() => void closeProject().finally(reset)}>
                  Back to projects
                </button>
                <button type="button" className="k-btn" onClick={() => location.reload()}>
                  Reload
                </button>
              </div>
            </div>
          )}
        >
          {route === 'home' ? <HomeScreen /> : <EditorShell />}
        </ErrorBoundary>
        <CommandPalette />
        <ShortcutsDialog />
        <SettingsDialog />
        <TourOverlay />
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
