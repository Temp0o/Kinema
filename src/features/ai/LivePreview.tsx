/**
 * Progressive preview of streaming AI output. Partial HTML+CSS is sanitized and
 * rendered inside a Shadow DOM (design reset + token variables, no leakage into
 * the editor), scaled to fit the panel width. Updates are throttled.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { designResetCss } from '@/core/style/reset';
import { tokenCssVars } from '@/core/style/style';
import { useDoc } from '@/core/store/docStore';
import { extractHtml, extractSvg, splitStyleAndMarkup } from '@/core/ai/text';

const SCOPE = '.pv-root';

/** Make model CSS safe & scoped for the shadow root (body → .pv-root, no remote loads). */
export function prepareCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\(\s*(['"]?)(?!data:image\/|#)[^)]*\1\s*\)/gi, 'none')
    .replace(/expression\([^)]*\)/gi, '')
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/(^|[},;])\s*(html\s+body|html|body|:root)\s*(?=[{,])/gi, `$1 ${SCOPE}`);
}

export function previewHtml(markup: string): string {
  return DOMPurify.sanitize(markup, {
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form'],
    FORBID_ATTR: ['style', 'srcset'],
    ADD_ATTR: ['class'],
    KEEP_CONTENT: true,
  });
}

function previewSvg(svg: string): string {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['script', 'foreignObject', 'image', 'a'] });
}

interface Props {
  /** raw (reasoning-free) streamed reply */
  content: string;
  kind: 'html' | 'svg';
  /** design width the content is laid out at */
  designWidth?: number;
  /** max visible height in px (content is clipped, top aligned) */
  maxHeight?: number;
  /** disable animations (static SVG variants) */
  active?: boolean;
}

export function LivePreview({ content, kind, designWidth = 1100, maxHeight = 260, active = true }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const root = useRef<ShadowRoot | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.25);
  const [contentH, setContentH] = useState(0);
  const [empty, setEmpty] = useState(true);
  const tokens = useDoc((s) => s.doc.tokens);
  const latest = useRef(content);
  latest.current = content;
  const lastRender = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const width = kind === 'svg' ? 320 : designWidth;

  // shadow root once
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || root.current) return;
    const sr = el.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style class="pv-reset"></style><style class="pv-user"></style><div class="pv-root"></div>`;
    root.current = sr;
    inner.current = sr.querySelector('.pv-root');
  }, []);

  // reset + token vars
  useEffect(() => {
    const sr = root.current;
    if (!sr) return;
    const vars = Object.entries(tokenCssVars({ tokens }))
      .map(([k, v]) => `${k}:${v}`)
      .join(';');
    (sr.querySelector('.pv-reset') as HTMLStyleElement).textContent = `
:host{display:block}
${SCOPE}{${vars};position:relative;width:${width}px;font-family:var(--k-font-body);color:var(--k-text,#0f1020);line-height:1.5;text-align:left;overflow:hidden;${kind === 'svg' ? 'display:flex;align-items:center;justify-content:center;aspect-ratio:1/1;background:repeating-conic-gradient(#8881 0 25%,transparent 0 50%) 0 0/16px 16px;' : 'background:#fff;'}}
${designResetCss(SCOPE)}
${SCOPE} .pv-svg svg{width:min(100%,260px);height:auto;max-height:260px}
${active ? '' : `${SCOPE} *{animation:none!important;transition:none!important}`}`;
  }, [tokens, width, kind, active]);

  // throttled content render
  useEffect(() => {
    const render = () => {
      timer.current = null;
      lastRender.current = performance.now();
      const el = inner.current;
      const sr = root.current;
      if (!el || !sr) return;
      const text = latest.current;
      if (kind === 'svg') {
        const svg = extractSvg(text, { partial: true });
        el.innerHTML = svg ? `<div class="pv-svg">${previewSvg(svg)}</div>` : '';
        (sr.querySelector('.pv-user') as HTMLStyleElement).textContent = '';
      } else {
        const html = extractHtml(text);
        const { css, markup } = splitStyleAndMarkup(html);
        (sr.querySelector('.pv-user') as HTMLStyleElement).textContent = prepareCss(css);
        el.innerHTML = previewHtml(markup);
      }
      setContentH(el.scrollHeight);
      setEmpty(!el.firstElementChild);
    };
    const since = performance.now() - lastRender.current;
    if (since > 160) render();
    else if (!timer.current) timer.current = setTimeout(render, 160 - since);
    return () => {
      /* keep the pending timer: it renders the latest content */
    };
  }, [content, kind]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // scale to the available width
  useLayoutEffect(() => {
    const el = host.current?.parentElement;
    if (!el) return;
    const update = () => setScale(Math.max(0.1, Math.min(1, el.clientWidth / width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const visibleH = Math.min(maxHeight, Math.max(kind === 'svg' ? 150 : 90, contentH * scale));
  return (
    <div className="k-ai-preview" style={{ height: kind === 'svg' ? Math.round(width * scale) : visibleH }} data-kind={kind}>
      <div ref={host} className="k-ai-preview__host" style={{ width, transform: `scale(${scale})` }} />
      {empty && <div className="k-ai-preview__wait"><span className="k-spinner" />{kind === 'svg' ? 'Sketching…' : 'Writing styles…'}</div>}
      {kind === 'html' && contentH * scale > maxHeight && <div className="k-ai-preview__fade" />}
    </div>
  );
}
