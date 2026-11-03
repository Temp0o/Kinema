/**
 * Feature module registry. Each feature can export an `install()` that registers
 * commands, global listeners etc. and returns a cleanup function. Add new modules
 * to the list below (one line each to keep merges trivial).
 */
import { installProperties } from '@/features/properties/install';
import { installCommandPalette } from '@/features/command/CommandPalette';
import { installAnimation } from '@/features/animation/install';
import { installExport } from '@/features/export/install';
import { installAssets } from '@/features/assets/install';

type Cleanup = () => void;
type Installer = () => Cleanup | void;

const installers: Installer[] = [
  installCommandPalette,
  // feature installers are appended here
  installProperties,
  installAnimation,
  installExport,
  installAssets,
];

export function installFeatureModules(): Cleanup[] {
  return installers.map((i) => i() ?? (() => {}));
}
