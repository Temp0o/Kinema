/**
 * Real visual previews of catalog items: the item's HTML + CSS rendered inside a
 * Shadow DOM (style isolation both ways) with the design reset and the project's
 * token variables, scaled to fit the card. Rendered lazily (IntersectionObserver).
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDoc } from '@/core/store/docStore';
import { designResetCss } from '@/core/style/reset';
import { styleMapToCss, tokenCssVars } from '@/core/style/style';
import type { CatalogItem } from '@/core/catalog';

const RESET = designResetCss(null);
const PREVIEW_W = 1280;

/** Shadow-root stylesheet: reset + token vars + item css, with in-preview motion paused-by-default avoided. */
function shadowCss(vars: string, item: CatalogItem): string {
  return `:host { all: initial; display: block; }
.k-prev { ${vars} font-family: var(--k-font-body); color: var(--k-text); line-height: 1.5; -webkit-font-smoothing: antialiased; background-color: transparent; }
${RESET}
.k-prev a, .k-prev button, .k-prev input, .k-prev select, .k-prev textarea { pointer-events: none; }
${item.css}`;
}

/** Shared observer so hundreds of cards don't each create one. */
let sharedObserver: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, (v: boolean) => void>();
function observe(el: Element, cb: (visible: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') {
    cb(true);
    return () => {};
  }
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) callbacks.get(e.target)?.(e.isIntersecting);
      },
      { rootMargin: '240px 0px' },
    );
  }
  callbacks.set(el, cb);
  sharedObserver.observe(el);
  return () => {
    sharedObserver?.unobserve(el);
    callbacks.delete(el);
  };
}

let measureHost: HTMLDivElement | null = null;
const sizeCache = new Map<string, { w: number; h: number }>();

/** Natural rendered size of an item (px), measured once in an offscreen shadow root. */
export function measureItem(item: CatalogItem): { w: number; h: number } {
  const hit = sizeCache.get(item.id);
  if (hit) return hit;
  if (!measureHost) {
    measureHost = document.createElement('div');
    measureHost.setAttribute('aria-hidden', 'true');
    measureHost.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;contain:layout;';
    measureHost.attachShadow({ mode: 'open' });
    document.body.appendChild(measureHost);
  }
  const root = measureHost.shadowRoot!;
  const vars = styleMapToCss(tokenCssVars({ tokens: useDoc.getState().doc.tokens }), ' ').replace(/\n/g, ' ');
  root.innerHTML = `<style>${shadowCss(vars, item)}</style><div class="k-prev" style="width:${item.width ? item.width + 'px' : 'max-content'}">${item.html}</div>`;
  const el = root.querySelector<HTMLElement>('.k-prev')!;
  const size = { w: Math.max(1, Math.round(el.offsetWidth)), h: Math.max(1, Math.round(el.offsetHeight)) };
  root.innerHTML = '';
  sizeCache.set(item.id, size);
  return size;
}

export const ItemPreview = memo(function ItemPreview({ item, height: baseHeight = 112, fitAspect = false }: { item: CatalogItem; height?: number; fitAspect?: boolean }) {
  const tokens = useDoc((s) => s.doc.tokens);
  const vars = useMemo(() => styleMapToCss(tokenCssVars({ tokens }), ' ').replace(/\n/g, ' '), [tokens]);
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [everVisible, setEverVisible] = useState(false);
  const [box, setBox] = useState<{ scale: number; w: number; h: number } | null>(null);
  const [autoH, setAutoH] = useState<number | null>(null);
  const height = autoH ?? baseHeight;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    return observe(el, (v) => {
      setVisible(v);
      if (v) setEverVisible(true);
    });
  }, []);

  // Build the shadow tree once visible; rebuild when tokens change.
  const shadowRef = useRef<ShadowRoot | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !everVisible) return;
    const card = host.parentElement;
    if (fitAspect && autoH == null) {
      const m = measureItem(item);
      setAutoH(Math.round(Math.min(168, Math.max(60, (m.h / m.w) * ((card?.clientWidth ?? 220) - 28) + 28))));
      return;
    }
    const availW = (card?.clientWidth ?? 130) - 2;
    const naturalW = item.width ?? 0;
    const root = shadowRef.current ?? host.attachShadow({ mode: 'open' });
    shadowRef.current = root;
    root.innerHTML = `<style>${shadowCss(vars, item)}</style><div class="k-prev" style="width:${naturalW ? naturalW + 'px' : 'max-content'}; max-width:${PREVIEW_W}px">${item.html}</div>`;
    const content = root.querySelector<HTMLDivElement>('.k-prev')!;
    contentRef.current = content;
    const w = Math.max(1, content.offsetWidth);
    const h = Math.max(1, content.offsetHeight);
    const pad = 14;
    const scale = Math.min(1, (availW - pad * 2) / w, (height - pad * 2) / h);
    setBox({ scale, w, h });
  }, [everVisible, item, vars, height, fitAspect, autoH]);

  // Pause CSS animation loops when scrolled out of view (cheap).
  useEffect(() => {
    const c = contentRef.current;
    if (c) c.style.animationPlayState = visible ? 'running' : 'paused';
  }, [visible]);

  return (
    <div className="k-prev-stage" style={{ height }} data-ready={box ? 'true' : 'false'}>
      <div
        ref={hostRef}
        className="k-prev-host"
        style={box ? { width: box.w, height: box.h, transform: `translate(-50%, -50%) scale(${box.scale})` } : undefined}
      />
    </div>
  );
});
