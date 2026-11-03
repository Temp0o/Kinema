/**
 * PNG snapshots of canvas DOM (project thumbnails, library component previews)
 * via html-to-image. Bundled fonts are embedded so snapshots use the real type.
 * All failures are silent (resolve to null).
 */
import { toPng } from 'html-to-image';
import { BUNDLED_FONTS, findBundledFont } from '@/core/fonts/designFonts';
import type { KDocument } from '@/core/model/types';
import { useDoc } from '@/core/store/docStore';
import { platform } from '@/platform';
import { usePlayback } from '@/features/animation/playbackStore';
import { bytesToDataUrl } from './kinemaFile';

const fontCssCache = new Map<string, Promise<string>>();

async function fontFaceFor(family: string): Promise<string> {
  let p = fontCssCache.get(family);
  if (!p) {
    p = (async () => {
      const f = BUNDLED_FONTS.find((b) => b.family === family);
      if (!f) return '';
      const parts = await Promise.all(
        f.files.map(async (file) => {
          try {
            const res = await fetch(file.url);
            const bytes = new Uint8Array(await res.arrayBuffer());
            return `@font-face{font-family:'${f.family}';src:url(${bytesToDataUrl(bytes, 'font/woff2')}) format('woff2');font-weight:${file.weight};font-style:${file.style};}`;
          } catch {
            return '';
          }
        }),
      );
      return parts.join('\n');
    })();
    fontCssCache.set(family, p);
  }
  return p;
}

/** Bundled font families referenced by a document (tokens + explicit font-family styles). */
export function usedFontFamilies(doc: KDocument): string[] {
  const out = new Set<string>();
  const add = (v: string | undefined) => {
    if (!v) return;
    for (const part of v.split(',')) {
      const f = findBundledFont(part);
      if (f) out.add(f.family);
    }
  };
  add(doc.tokens.fonts.heading);
  add(doc.tokens.fonts.body);
  for (const n of Object.values(doc.nodes)) for (const map of Object.values(n.styles)) add(map?.['font-family']);
  return [...out];
}

async function fontEmbedCss(doc: KDocument): Promise<string> {
  const css = await Promise.all(usedFontFamilies(doc).map(fontFaceFor));
  return css.join('\n');
}

export interface CaptureOptions {
  /** Output box (px). The element is scaled to fit. */
  maxWidth: number;
  maxHeight: number;
  /** Crop height to width / aspect (e.g. 16/10) instead of capturing the whole element. */
  aspect?: number;
  background?: string;
  /** Neutralise the root's placement so it renders at the snapshot origin. */
  resetPlacement?: boolean;
}

export async function captureElement(el: HTMLElement, opts: CaptureOptions): Promise<string | null> {
  try {
    const w = el.offsetWidth;
    const fullH = el.offsetHeight;
    if (!w || !fullH) return null;
    const h = opts.aspect ? Math.min(fullH, Math.round(w / opts.aspect)) || Math.round(w / opts.aspect) : fullH;
    const scale = Math.min(1, opts.maxWidth / w, opts.maxHeight / h);
    const fontCss = await fontEmbedCss(useDoc.getState().doc);
    const style: Partial<CSSStyleDeclaration> = opts.resetPlacement
      ? { position: 'relative', left: '0px', top: '0px', right: 'auto', bottom: 'auto', margin: '0px', rotate: 'none', transform: 'none' }
      : { transform: 'none' };
    return await toPng(el, {
      width: w,
      height: opts.aspect ? Math.round(w / opts.aspect) : h,
      canvasWidth: Math.max(1, Math.round(w * scale)),
      canvasHeight: Math.max(1, Math.round((opts.aspect ? w / opts.aspect : h) * scale)),
      pixelRatio: 1,
      backgroundColor: opts.background,
      fontEmbedCSS: fontCss,
      cacheBust: false,
      skipAutoScale: true,
      style,
    });
  } catch (err) {
    console.warn('[kinema] snapshot failed', err);
    return null;
  }
}

/** Snapshot the canvas page (`.kc-root`) as a 16:10 thumbnail data URL. */
export async function captureCanvasThumbnail(): Promise<string | null> {
  if (usePlayback.getState().playing) return null;
  const el = document.querySelector<HTMLElement>('.kc-root');
  if (!el) return null;
  return captureElement(el, { maxWidth: 640, maxHeight: 400, aspect: 16 / 10, background: '#ffffff' });
}

/** First opaque-ish background colour behind an element (so translucent cards snapshot like they look). */
function backdropColor(el: HTMLElement): string {
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    const c = getComputedStyle(cur).backgroundColor;
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) {
      const parts = m[1].split(',').map((x) => parseFloat(x));
      if (parts.length < 4 || parts[3] > 0.6) return c;
    }
    cur = cur.parentElement;
  }
  return '#ffffff';
}

/** Snapshot a canvas node (by data-kid) for library previews. */
export async function captureNodeSnapshot(nodeId: string): Promise<string | null> {
  const el = document.querySelector<HTMLElement>(`.kc-root [data-kid="${CSS.escape(nodeId)}"]`);
  if (!el) return null;
  return captureElement(el, { maxWidth: 480, maxHeight: 360, resetPlacement: true, background: backdropColor(el) });
}

// ─── Project thumbnail scheduling ───────────────────────────────────────────

const MIN_INTERVAL = 30_000;
let lastCapture = 0;
let pending: ReturnType<typeof setTimeout> | null = null;

export async function saveProjectThumbnailNow(projectId: string): Promise<void> {
  if (pending) {
    clearTimeout(pending);
    pending = null;
  }
  const url = await captureCanvasThumbnail();
  if (!url) return;
  lastCapture = Date.now();
  try {
    await platform.projects.saveThumbnail(projectId, url);
  } catch {
    /* silent */
  }
}

/** Called after successful saves: capture at most every ~30s, when idle. */
export function scheduleProjectThumbnail(projectId: string) {
  if (pending) return;
  const wait = Math.max(1500, MIN_INTERVAL - (Date.now() - lastCapture));
  pending = setTimeout(() => {
    pending = null;
    const run = () => void saveProjectThumbnailNow(projectId);
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (ric) ric(run, { timeout: 4000 });
    else run();
  }, wait);
}

export function cancelScheduledThumbnail() {
  if (pending) clearTimeout(pending);
  pending = null;
}

export function resetThumbnailClock() {
  lastCapture = 0;
}
