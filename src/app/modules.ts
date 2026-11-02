/**
 * Feature module registry. Each feature can export an `install()` that registers
 * commands, global listeners etc. and returns a cleanup function. Add new modules
 * to the list below (one line each to keep merges trivial).
 */
type Cleanup = () => void;
type Installer = () => Cleanup | void;

const installers: Installer[] = [
  // feature installers are appended here
];

export function installFeatureModules(): Cleanup[] {
  return installers.map((i) => i() ?? (() => {}));
}
