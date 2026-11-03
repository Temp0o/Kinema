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
import { ContextMenuArea } from '@/ui/menu';
import { NodeView } from './NodeView';
import { Overlays } from './Overlays';
import { useCanvas } from './canvasStore';
import { canvasDoubleClick, canvasHover, canvasPointerDown } from './interactions';
import { canvasDragLeave, canvasDragOver, canvasDrop } from './dropTarget';
import { nodeMenuItems } from './nodeMenu';
import { invalidateViewportRect } from './measure';
import { zoomAt, zoomToFit } from './viewport';
import './canvas.css';

export { MIN_ZOOM, MAX_ZOOM, zoomAt, zoomToFit, zoomToSelection, zoomStep } from './viewport';

export function Canvas() {
  const rootId = useCurrentRootId();
  const viewport = useUI((s) => s.viewport);
  const canvasWidth = useUI((s) => s.canvasWidth);
  const canvasHeight = useUI((s) => s.canvasHeight);
  const tool = useUI((s) => s.tool);
  const rootSelected = useUI((s) => !!rootId && s.selection.includes(rootId));
  const rootHovered = useUI((s) => !!rootId && s.hoverId === rootId);
  const tokens = useDoc((s) => s.doc.tokens);
  const customCss = useDoc((s) => s.doc.settings.customCss);
  const pageName = useDoc((s) => {
    const ui = useUI.getState();
    if (ui.editingComponentId) return `◆ ${s.doc.components[ui.editingComponentId]?.name ?? 'Component'}`;
    return (s.doc.pages.find((p) => p.id === ui.activePageId) ?? s.doc.pages[0])?.name ?? '';
  });
  const spaceHeld = useCanvas((s) => s.spaceHeld);
  const cursor = useCanvas((s) => s.cursor);
  const gesture = useCanvas((s) => s.gesture);
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

  // Re-measure overlays when layout changes without a document change.
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const bump = () => useCanvas.getState().bump();
    const ro = new ResizeObserver(() => {
      invalidateViewportRect();
      bump();
    });
    ro.observe(vp);
    const world = vp.querySelector('.kc-root');
    if (world) ro.observe(world);
    const onLoad = (e: Event) => {
      if (e.target instanceof HTMLImageElement || e.target instanceof HTMLVideoElement) bump();
    };
    vp.addEventListener('load', onLoad, true);
    vp.addEventListener('loadedmetadata', onLoad, true);
    const fonts = document.fonts;
    fonts?.addEventListener?.('loadingdone', bump);
    window.addEventListener('resize', invalidateViewportRect);
    return () => {
      ro.disconnect();
      vp.removeEventListener('load', onLoad, true);
      vp.removeEventListener('loadedmetadata', onLoad, true);
      fonts?.removeEventListener?.('loadingdone', bump);
      window.removeEventListener('resize', invalidateViewportRect);
    };
  }, [rootId]);

  // Fit when page / breakpoint changes
  useLayoutEffect(() => {
    const t = requestAnimationFrame(() => zoomToFit(vpRef.current));
    return () => cancelAnimationFrame(t);
  }, [rootId, canvasWidth]);

  const worldStyle = {
    transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
  };

  const toolMode = spaceHeld ? 'hand' : tool;

  return (
    <ContextMenuArea items={nodeMenuItems}>
      <div
        ref={vpRef}
        className="kc-viewport"
        data-tool={toolMode}
        data-gesture={gesture ?? undefined}
        data-force-cursor={cursor ? 'true' : undefined}
        style={cursor ? { cursor } : undefined}
        onPointerDown={canvasPointerDown}
        onPointerMove={canvasHover}
        onPointerLeave={() => uiApi.state.setHover(null)}
        onDoubleClick={canvasDoubleClick}
        onDragOver={canvasDragOver}
        onDragLeave={canvasDragLeave}
        onDrop={canvasDrop}
        onContextMenu={(e) => {
          // Radix opens the menu; block it while a gesture or text edit runs
          if (useCanvas.getState().gesture || useUI.getState().editingTextId) e.preventDefault();
        }}
      >
        <style>{reset}</style>
        {customCss ? <style>{scopeCustomCss(customCss)}</style> : null}
        <div className="kc-world" style={worldStyle}>
          <div
            className="kc-frame-label"
            data-kframe-label="true"
            data-active={rootSelected ? 'true' : rootHovered ? 'hover' : undefined}
            style={{ transform: `scale(${1 / viewport.zoom})` }}
          >
            <span>{pageName}</span>
            <span className="kc-frame-label__size">{canvasWidth}px</span>
          </div>
          {rootId && (
            <div className="kc-root" style={{ ...vars, width: canvasWidth, minHeight: canvasHeight ?? undefined }}>
              <NodeView id={rootId} />
            </div>
          )}
        </div>
        <Overlays />
      </div>
    </ContextMenuArea>
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
