/**
 * Live preview: the compiled site rendered in an iframe inside a device frame.
 * Re-compiles (debounced) as the document changes, swapping between two
 * iframes so updates don't flash and the scroll position is kept. Real hover,
 * click and scroll triggers work because it runs the exported code itself.
 */
import { platform } from '@/platform';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Dialog as RDialog } from 'radix-ui';
import { ExternalLink, Laptop, Monitor, RefreshCw, RotateCw, Smartphone, Tablet, FileText, ArrowLeft } from 'lucide-react';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { useAssetUrls } from '@/core/assets/assetStore';
import { Button, IconButton, NumberField, Segmented, Select } from '@/ui/primitives';
import { compileSiteText } from '@/core/export';
import { activePageId, openInBrowser, previewOptions, siteTitle } from '@/features/export/exportService';
import './preview.css';

type Device = 'desktop' | 'laptop' | 'tablet' | 'mobile' | 'custom';
const DEVICES: Record<Exclude<Device, 'custom'>, { w: number; h: number; label: string }> = {
  desktop: { w: 1440, h: 900, label: 'Desktop' },
  laptop: { w: 1280, h: 800, label: 'Laptop' },
  tablet: { w: 768, h: 1024, label: 'Tablet' },
  mobile: { w: 390, h: 844, label: 'Mobile' },
};
const CHROME_H = 34;
const PAD = 28;

export function PreviewDialog() {
  const open = useUI((s) => s.previewOpen);
  return open ? <Preview /> : null;
}

/**
 * The app's CSP has no `'unsafe-inline'` for scripts (srcdoc frames inherit it), so the
 * exported page's inline runtime is moved into a blob: script for the preview.
 */
const previewBlobs: string[] = [];
export function externalizeInlineScript(html: string): string {
  if (typeof URL.createObjectURL !== 'function') return html;
  return html.replace(/<script>([\s\S]*?)<\/script>(?=\s*<\/body>)/, (_m, js: string) => {
    const url = URL.createObjectURL(new Blob([js.replace(/<\\\/script/gi, '</script')], { type: 'text/javascript' }));
    previewBlobs.push(url);
    while (previewBlobs.length > 6) URL.revokeObjectURL(previewBlobs.shift()!);
    return `<script src="${url}"></script>`;
  });
}

function compilePage(pageId: string | null): { html: string; file: string } {
  const doc = useDoc.getState().doc;
  const r = compileSiteText(doc, previewOptions({ pageIds: pageId ? [pageId] : undefined, title: siteTitle() }));
  return { html: (r.files[0]?.data as string) ?? '', file: r.pages[0]?.file ?? 'index.html' };
}

function Preview() {
  const pages = useDoc((s) => s.doc.pages);
  const [pageId, setPageId] = useState<string | null>(() => activePageId());
  const [device, setDevice] = useState<Device>(() => {
    const w = useUI.getState().canvasWidth;
    return w <= 480 ? 'mobile' : w <= 900 ? 'tablet' : 'desktop';
  });
  const [customW, setCustomW] = useState(1024);
  const [landscape, setLandscape] = useState(false);
  const [stage, setStage] = useState({ w: 1200, h: 800 });
  const [active, setActive] = useState(0);
  const [file, setFile] = useState('index.html');
  const stageRef = useRef<HTMLDivElement>(null);
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)];
  const activeRef = useRef(0);
  const lastHtml = useRef('');
  const pending = useRef<{ resetScroll: boolean } | null>(null);
  const close = useCallback(() => useUI.getState().set({ previewOpen: false }), []);
  useEffect(() => () => void previewBlobs.splice(0).forEach((u) => URL.revokeObjectURL(u)), []);

  // ── geometry ──
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStage({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const isDevice = device === 'tablet' || device === 'mobile';
  const preset = device === 'custom' ? null : DEVICES[device];
  const w = preset ? (isDevice && landscape ? preset.h : preset.w) : customW;
  const availW = Math.max(100, stage.w - PAD * 2);
  const availH = Math.max(100, stage.h - PAD * 2);
  let scale: number;
  let h: number;
  if (isDevice) {
    h = landscape ? preset!.w : preset!.h;
    scale = Math.min(1, availW / w, availH / h);
  } else {
    scale = Math.min(1, availW / w);
    h = Math.round((availH - CHROME_H) / scale);
  }

  // ── loading (double-buffered) ──
  const wire = useCallback(
    (frame: HTMLIFrameElement) => {
      const doc = frame.contentDocument;
      if (!doc) return;
      doc.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });
      doc.addEventListener('click', (e) => {
        const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
        if (!a) return;
        const href = a.getAttribute('href') ?? '';
        if (href.startsWith('#')) return;
        e.preventDefault();
        const target = compileSiteText(useDoc.getState().doc, { title: siteTitle() }).pages.find((p) => p.file === href);
        if (target) {
          pending.current = { resetScroll: true };
          setPageId(target.id);
        } else if (/^(https?:|mailto:)/i.test(href)) window.open(href, '_blank', 'noopener');
      });
    },
    [close],
  );

  const load = useCallback(
    (html: string, resetScroll: boolean, attempt = 0): void => {
      const front = frames[activeRef.current].current;
      const backIdx = 1 - activeRef.current;
      const back = frames[backIdx].current;
      if (!back) {
        // the dialog portal mounts its content a frame after us
        if (attempt < 20) requestAnimationFrame(() => html === lastHtml.current && load(html, resetScroll, attempt + 1));
        return;
      }
      const sx = resetScroll ? 0 : (front?.contentWindow?.scrollX ?? 0);
      const sy = resetScroll ? 0 : (front?.contentWindow?.scrollY ?? 0);
      back.onload = () => {
        back.onload = null;
        wire(back);
        back.contentWindow?.scrollTo(sx, sy);
        activeRef.current = backIdx;
        setActive(backIdx);
      };
      back.srcdoc = externalizeInlineScript(html);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wire],
  );

  const refresh = useCallback(
    (force = false) => {
      const { html, file: f } = compilePage(pageId);
      setFile(f);
      const reset = pending.current?.resetScroll ?? false;
      pending.current = null;
      if (!force && html === lastHtml.current) return;
      lastHtml.current = html;
      load(html, reset);
    },
    [pageId, load],
  );

  // page change → immediate; document/asset changes → debounced
  useEffect(() => {
    refresh(true);
  }, [refresh]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => refresh(), 400);
    };
    const u1 = useDoc.subscribe((s, p) => s.doc !== p.doc && schedule());
    const u2 = useAssetUrls.subscribe((s, p) => s.urls !== p.urls && schedule());
    return () => {
      if (t) clearTimeout(t);
      u1();
      u2();
    };
  }, [refresh]);

  const pageExists = pages.some((p) => p.id === pageId);
  useEffect(() => {
    if (!pageExists) setPageId(pages[0]?.id ?? null);
  }, [pageExists, pages]);

  const frameStyle = { width: w, height: h, transform: `scale(${scale})` };
  return (
    <RDialog.Root open onOpenChange={(v) => !v && close()}>
      <RDialog.Portal>
        <RDialog.Content className="k-preview k-app" aria-describedby={undefined} onKeyDown={(e) => e.stopPropagation()}>
          <RDialog.Title className="k-sr-only">Preview</RDialog.Title>
          <div className="k-preview__bar k-drag-region" data-mac={platform.window?.platform === 'darwin' ? 'true' : undefined}>
            <div className="k-preview__group k-no-drag">
              <Button variant="outline" icon={<ArrowLeft />} onClick={close} className="k-preview__back" title="Back to editor (Esc)">
                Back to editor
              </Button>
              <Select
                value={pageId ?? ''}
                onChange={(v) => {
                  pending.current = { resetScroll: true };
                  setPageId(v);
                }}
                options={pages.map((p) => ({ value: p.id, label: p.name, icon: <FileText /> }))}
                ariaLabel="Page"
                className="k-preview__page"
              />
            </div>
            <div className="k-preview__group k-preview__center k-no-drag">
              <Segmented
                value={device === 'custom' ? '' : device}
                onChange={(v) => setDevice(v as Device)}
                options={[
                  { value: 'desktop', icon: <Monitor />, tooltip: 'Desktop · 1440' },
                  { value: 'laptop', icon: <Laptop />, tooltip: 'Laptop · 1280' },
                  { value: 'tablet', icon: <Tablet />, tooltip: 'Tablet · 768' },
                  { value: 'mobile', icon: <Smartphone />, tooltip: 'Mobile · 390' },
                ]}
              />
              <NumberField
                className="k-preview__width"
                value={w}
                min={240}
                max={3840}
                precision={0}
                suffix="px"
                label="W"
                labelTitle="Viewport width"
                onChange={(v) => {
                  setCustomW(Math.round(v));
                  setDevice('custom');
                  setLandscape(false);
                }}
              />
              <IconButton label={landscape ? 'Portrait' : 'Landscape'} disabled={!isDevice} active={landscape && isDevice} onClick={() => setLandscape((l) => !l)}>
                <RotateCw />
              </IconButton>
              <span className="k-preview__meta">
                {w} × {h} · {Math.round(scale * 100)}%
              </span>
            </div>
            <div className="k-preview__group k-preview__right k-no-drag">
              <Button variant="ghost" icon={<RefreshCw />} onClick={() => refresh(true)}>
                Replay
              </Button>
              <Button variant="ghost" icon={<ExternalLink />} onClick={() => void openInBrowser({ pageIds: pageId ? [pageId] : undefined, title: siteTitle() })}>
                Open in browser
              </Button>
            </div>
          </div>
          <div className="k-preview__stage" ref={stageRef}>
            <div
              className="k-preview__device"
              data-kind={isDevice ? 'device' : 'browser'}
              style={{ width: w * scale, height: h * scale + (isDevice ? 0 : CHROME_H) }}
            >
              {!isDevice && (
                <div className="k-preview__chrome">
                  <span className="k-preview__dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="k-preview__url">{file}</span>
                </div>
              )}
              <div className="k-preview__viewport" style={{ width: w * scale, height: h * scale }}>
                {[0, 1].map((i) => (
                  <iframe
                    key={i}
                    ref={frames[i]}
                    title={i === active ? 'Page preview' : 'Page preview (loading)'}
                    className="k-preview__frame"
                    data-active={i === active ? 'true' : undefined}
                    aria-hidden={i !== active}
                    tabIndex={i === active ? 0 : -1}
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    style={frameStyle}
                  />
                ))}
              </div>
            </div>
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
