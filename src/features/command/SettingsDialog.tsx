import { useEffect, useState } from 'react';
import { Settings, Sparkles } from 'lucide-react';
import { useUI, savePref } from '@/core/store/uiStore';
import { Button, Dialog, Segmented, Switch } from '@/ui/primitives';
import { platform } from '@/platform';
import { toggleTheme } from '@/features/shortcuts/coreCommands';
import { startTour } from '@/features/onboarding/tour';
import pkg from '../../../package.json';

export function SettingsDialog() {
  const open = useUI((s) => s.settingsOpen);
  const theme = useUI((s) => s.theme);
  const snap = useUI((s) => s.snapToGrid);
  const grid = useUI((s) => s.showGrid);
  const route = useUI((s) => s.route);
  const [location, setLocation] = useState('');

  useEffect(() => {
    if (open) platform.dataLocation().then(setLocation, () => setLocation('Unknown'));
  }, [open]);

  const close = () => useUI.getState().set({ settingsOpen: false });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => useUI.getState().set({ settingsOpen: o })}
      title="Settings"
      width={520}
      icon={<Settings style={{ width: 20, height: 20, color: 'var(--accent-text)', marginTop: 2 }} />}
      footer={
        <Button variant="primary" onClick={close}>
          Done
        </Button>
      }
    >
      <div className="k-settings">
        <div className="k-settings__group">
          <h4>Appearance</h4>
          <div className="k-settings__row">
            <span>Theme</span>
            <Segmented
              value={theme}
              onChange={(v) => {
                if (v !== theme) toggleTheme();
              }}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </div>
        </div>

        <div className="k-settings__group">
          <h4>Canvas</h4>
          <div className="k-settings__row">
            <span>Snap to grid & smart guides</span>
            <Switch
              checked={snap}
              onChange={(v) => {
                useUI.getState().set({ snapToGrid: v });
                savePref('snapToGrid', v);
              }}
              ariaLabel="Snap to grid"
            />
          </div>
          <div className="k-settings__row">
            <span>Show dot grid</span>
            <Switch
              checked={grid}
              onChange={(v) => {
                useUI.getState().set({ showGrid: v });
                savePref('showGrid', v);
              }}
              ariaLabel="Show grid"
            />
          </div>
          <div className="k-settings__row">
            <span>Reset panel sizes</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                useUI.getState().set({ leftWidth: 264, rightWidth: 300, bottomHeight: 260 });
                savePref('leftWidth', 264);
                savePref('rightWidth', 300);
                savePref('bottomHeight', 260);
              }}
            >
              Reset
            </Button>
          </div>
        </div>

        <div className="k-settings__group">
          <h4>Local AI</h4>
          <div className="k-settings__row">
            <span>
              Ollama connection, models and generation options
              <small>Kinema runs AI entirely on your machine</small>
            </span>
            <Button
              size="sm"
              variant="outline"
              icon={<Sparkles />}
              disabled={route !== 'editor'}
              onClick={() => {
                close();
                useUI.getState().set({ rightTab: 'ai' });
              }}
            >
              Open AI panel
            </Button>
          </div>
        </div>

        <div className="k-settings__group">
          <h4>Storage</h4>
          <div className="k-settings__row" style={{ alignItems: 'flex-start' }}>
            <span>
              Projects & library location
              <small>Projects autosave about a second after every change.</small>
            </span>
          </div>
          <div className="k-settings__path">{location}</div>
        </div>

        <div className="k-settings__group">
          <h4>About</h4>
          <div className="k-settings__row">
            <span>Interactive tour</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                close();
                startTour();
              }}
            >
              Replay tutorial
            </Button>
          </div>
          <div className="k-settings__row">
            <span>Kinema</span>
            <span className="k-muted">Version {pkg.version}</span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
