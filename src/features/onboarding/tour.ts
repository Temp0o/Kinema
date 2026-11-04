/**
 * The app's tour instance, replay entry points (Help menu, command) and the
 * auto-start opt-out.
 *
 * Auto-start opt-out (for automated tests): set the env var KINEMA_NO_TOUR=1 for
 * the Electron app (exposed by the preload as `kinemaNative.noTour`), or open the
 * web build with `?notour`. Browser automation (navigator.webdriver) also
 * suppresses it in the web build. Replay from Help still works in all cases.
 */
import { createElement } from 'react';
import { GraduationCap } from 'lucide-react';
import { registerHelpItem } from '@/features/help/helpMenu';
import { registerCommands } from '@/features/shortcuts/shortcuts';
import { platform } from '@/platform';
import { createTour } from './engine';
import { TOUR_STEPS } from './steps';

export const tour = createTour(TOUR_STEPS);

export function startTour() {
  tour.start(0);
}

export function tourSuppressed(): boolean {
  try {
    const native = window.kinemaNative as { noTour?: boolean } | undefined;
    if (native?.noTour) return true;
    if (new URLSearchParams(location.search).has('notour')) return true;
    return platform.kind === 'web' && navigator.webdriver === true;
  } catch {
    return false;
  }
}

export function installOnboarding() {
  // Let the first screen paint before the welcome card appears.
  const t = window.setTimeout(() => tour.init(tourSuppressed()), 700);
  const offHelp = registerHelpItem({ label: 'Take the interactive tour', icon: createElement(GraduationCap), onSelect: startTour, order: -1 });
  const offCmd = registerCommands([{ id: 'help.tour', title: 'Take the interactive tour', group: 'Help', keywords: ['onboarding', 'tutorial', 'guide', 'welcome'], run: startTour }]);
  return () => {
    window.clearTimeout(t);
    offHelp();
    offCmd();
  };
}
