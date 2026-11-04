/**
 * Feature module registry. Each feature can export an `install()` that registers
 * commands, global listeners etc. and returns a cleanup function. Add new modules
 * to the list below (one line each to keep merges trivial).
 */
import { installCanvas } from '@/features/canvas/install';
import { installProperties } from '@/features/properties/install';
import { installCommandPalette } from '@/features/command/CommandPalette';
import { installAnimation } from '@/features/animation/install';
import { installExport } from '@/features/export/install';
import { installProjectsLibrary } from '@/features/projects/install';
import { installAI } from '@/features/ai/install';
import { installAssets } from '@/features/assets/install';

import { installLayout } from '@/features/layout/layoutUi';

import { installDesktopIntegration } from '@/features/projects/desktopIntegration';

import { installArrange } from '@/features/arrange/arrange';

type Cleanup = () => void;
type Installer = () => Cleanup | void;

const installers: Installer[] = [
  installCommandPalette,
  // feature installers are appended here
  installArrange,
  installDesktopIntegration,
  installLayout,
  installCanvas,
  installProperties,
  installAnimation,
  installExport,
  installProjectsLibrary,
  installAI,
  installAssets,
];

export function installFeatureModules(): Cleanup[] {
  return installers.map((i) => i() ?? (() => {}));
}
