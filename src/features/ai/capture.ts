/**
 * Canvas screenshot for vision models: downscaled PNG of `.kc-root`
 * (base64 without the data: prefix). Best effort — returns null on any failure.
 */
export async function captureCanvasImage(maxSide = 896, timeoutMs = 6000): Promise<string | null> {
  const el = document.querySelector<HTMLElement>('.kc-root');
  if (!el || !el.offsetWidth) return null;
  try {
    const { toPng } = await import('html-to-image');
    const w = el.offsetWidth;
    const h = Math.min(el.offsetHeight, w * 2.2);
    const ratio = Math.min(1, maxSide / Math.max(w, h));
    const task = toPng(el, {
      pixelRatio: ratio,
      width: w,
      height: h,
      cacheBust: false,
      skipFonts: true,
      style: { transform: 'none', boxShadow: 'none' },
      filter: (node) => !(node instanceof HTMLElement && node.dataset.kplaceholder),
    });
    const url = await Promise.race([task, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
    if (!url) return null;
    const i = url.indexOf('base64,');
    return i >= 0 ? url.slice(i + 7) : null;
  } catch {
    return null;
  }
}
