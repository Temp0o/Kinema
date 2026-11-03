/**
 * Live, scaled preview of a template: a script-less same-origin iframe rendering
 * the template HTML at 1440px wide, mounted lazily when scrolled into view.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { TemplateDef } from '@/core/templates';
import { templatePreviewHtml } from '@/core/templates/preview';

const DESIGN_W = 1440;
const DESIGN_H = 900;

export const TemplatePreview = memo(function TemplatePreview({ template }: { template: TemplateDef }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);
  const [visible, setVisible] = useState(false);
  const srcDoc = useMemo(() => (template.html ? templatePreviewHtml(template) : ''), [template]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / DESIGN_W));
    ro.observe(el);
    setScale(el.clientWidth / DESIGN_W);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className="k-tplprev" style={{ ['--tpl' as string]: template.swatch }} aria-hidden>
      {template.html ? (
        visible && (
          <iframe
            className="k-tplprev__frame"
            title={`${template.name} preview`}
            sandbox="allow-same-origin"
            srcDoc={srcDoc}
            tabIndex={-1}
            loading="lazy"
            style={{ width: DESIGN_W, height: DESIGN_H, transform: `scale(${scale})` }}
          />
        )
      ) : (
        <div className="k-tplprev__blank">
          <span />
        </div>
      )}
    </div>
  );
});
