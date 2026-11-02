/**
 * The design canvas: an infinite, zoomable viewport containing the current page
 * frame rendered with real DOM (NodeView). Screen-space overlays (selection,
 * guides, handles) are rendered above the world layer.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useDoc } from '@/core/store/docStore';
import { useUI, uiApi } from '@/core/store/uiStore';
import { useCurrentRootId } from '@/core/store/actions';
import { tokenCssVars, toReactStyle } from '@/core/style/style';
import { designResetCss } from '@/core/style/reset';
import { NodeView } from './NodeView';
import './canvas.css';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

/** Zoom keeping the screen point (sx, sy) fixed. */
export function zoomAt(nextZoom: number, sx: number, sy: number) {
  const { viewport } = uiApi.state;
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
  const wx = (sx - viewport.panX) / viewport.zoom;
  const wy = (sy - viewport.panY) / viewport.zoom;
  uiApi.state.setViewport({ zoom: z, panX: sx - wx * z, panY: sy - wy * z });
}

/** Fit the current frame into the viewport. */
export function zoomToFit(viewportEl?: HTMLElement | null) {
  const vp = viewportEl ?? document.querySelector<HTMLElement>('.kc-viewport');
  const frame = document.querySelector<HTMLElement>('.kc-root');
  if (!vp || !frame) return;
  const { canvasWidth } = uiApi.state;
  const fh = frame.offsetHeight || 900;
  const pad = 64;
  const z = Math.min(1, (vp.clientWidth - pad * 2) / canvasWidth, (vp.clientHeight - pad * 2) / Math.min(fh, 4000));
  const zoom = Math.max(MIN_ZOOM, z);
  const panX = (vp.clientWidth - canvasWidth * zoom) / 2;
  const panY = Math.max(pad, (vp.clientHeight - fh * zoom) / 2);
  uiApi.state.setViewport({ zoom, panX, panY: Math.min(panY, pad + 8) });
}

export function Canvas() {
  const rootId = useCurrentRootId();
  const viewport = useUI((s) => s.viewport);
  const canvasWidth = useUI((s) => s.canvasWidth);
  const canvasHeight = useUI((s) => s.canvasHeight);
  const showGrid = useUI((s) => s.showGrid);
  const tokens = useDoc((s) => s.doc.tokens);
  const customCss = useDoc((s) => s.doc.settings.customCss);
  const pageName = useDoc((s) => {
    const ui = useUI.getState();
    if (ui.editingComponentId) return `◆ ${s.doc.components[ui.editingComponentId]?.name ?? 'Component'}`;
    return (s.doc.pages.find((p) => p.id === ui.activePageId) ?? s.doc.pages[0])?.name ?? '';
  });
  const vpRef = useRef<HTMLDivElement>(null);

  const vars = useMemo(() => toReactStyle(tokenCssVars({ tokens })), [tokens]);
  const reset = useMemo(() => designResetCss('.kc-root'), []);

  // Wheel: pan, ctrl/meta+wheel or pinch: zoom
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const rect = vpRef.current!.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
      zoomAt(uiApi.state.viewport.zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
    } else {
      const { viewport: v } = uiApi.state;
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      uiApi.state.setViewport({ panX: v.panX - dx, panY: v.panY - dy });
    }
  }, []);

  useEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // Fit when page / breakpoint changes
  useLayoutEffect(() => {
    const t = requestAnimationFrame(() => zoomToFit(vpRef.current));
    return () => cancelAnimationFrame(t);
  }, [rootId, canvasWidth]);

  const worldStyle = {
    transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
  };

  return (
    <div ref={vpRef} className="kc-viewport" data-grid={showGrid ? 'true' : undefined}>
      <style>{reset}</style>
      {customCss ? <style>{scopeCustomCss(customCss)}</style> : null}
      <div className="kc-world" style={worldStyle}>
        <div className="kc-frame-label" style={{ transform: `scale(${1 / viewport.zoom})` }}>
          <span>{pageName}</span>
          <span className="kc-frame-label__size">{canvasWidth}px</span>
        </div>
        {rootId && (
          <div className="kc-root" style={{ ...vars, width: canvasWidth, minHeight: canvasHeight ?? undefined }}>
            <NodeView id={rootId} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Prefix user custom CSS selectors with .kc-root so it can't leak into the editor UI. */
function scopeCustomCss(css: string): string {
  return css.replace(/(^|})\s*([^{}@]+)\{/g, (_m, brace: string, sel: string) => {
    const scoped = sel
      .split(',')
      .map((s) => {
        const t = s.trim();
        if (!t) return t;
        if (t === 'body' || t === 'html' || t === ':root') return '.kc-root';
        return `.kc-root ${t}`;
      })
      .join(', ');
    return `${brace} ${scoped} {`;
  });
}
