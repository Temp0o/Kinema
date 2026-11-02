import type { PlatformAPI } from './types';
import { createWebPlatform } from './web';
import { createElectronPlatform } from './electron';

/** The active platform implementation (Electron when running in the desktop app). */
export const platform: PlatformAPI =
  typeof window !== 'undefined' && window.kinemaNative ? createElectronPlatform(window.kinemaNative) : createWebPlatform();

export const isElectron = platform.kind === 'electron';

export type { PlatformAPI, OutFile, PickedFile, HttpRequest, HttpResponse } from './types';
