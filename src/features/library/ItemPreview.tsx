import { memo, useEffect, useMemo, useRef } from 'react';
import { Box, Clapperboard, Component as ComponentIcon, Image as ImageIcon, Palette, Paintbrush } from 'lucide-react';
import type { KAnimation, LibraryItem, StyleMap } from '@/core/model/types';
import { toWaapiKeyframes, toWaapiTiming } from '@/core/anim/compile';
import { toReactStyle } from '@/core/style/style';
import { sanitizeSvg } from '@/features/canvas/NodeView';

export const KIND_ICON = {
  component: <ComponentIcon />,
  animation: <Clapperboard />,
  svg: <Box />,
  image: <ImageIcon />,
  palette: <Palette />,
  style: <Paintbrush />,
};

/** Live looping WAAPI demo, only running while the card is visible. */
function AnimDemo({ anim }: { anim: KAnimation }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    let running: Animation | null = null;
    const start = () => {
      if (running) return;
      try {
        const timing = toWaapiTiming({ ...anim, trigger: 'loop', iterations: -1, delay: 0 });
        // pause between loops so entrance effects are readable
        running = el.animate(toWaapiKeyframes(anim), { ...timing, iterations: Infinity, endDelay: 500, fill: 'both' });
      } catch {
        /* unsupported keyframes: leave static */
      }
    };
    const stop = () => {
      running?.cancel();
      running = null;
    };
    const io = new IntersectionObserver((entries) => (entries.some((e) => e.isIntersecting) ? start() : stop()), { threshold: 0.2 });
    io.observe(el);
    return () => {
      io.disconnect();
      stop();
    };
  }, [anim]);
  return (
    <div className="k-lprev__anim">
      <div ref={ref} className="k-lprev__shape" />
    </div>
  );
}

const STYLE_SAFE = /^(background|color|border|outline|box-shadow|text-shadow|font|letter-spacing|text-transform|text-decoration|opacity|filter|backdrop-filter|border-radius|line-height)/;

export function stylePreview(styles: StyleMap): StyleMap {
  const out: StyleMap = {};
  for (const [k, v] of Object.entries(styles)) if (STYLE_SAFE.test(k) && !/asset:|url\(/.test(v)) out[k] = v;
  return out;
}

export const ItemPreview = memo(function ItemPreview({ item }: { item: LibraryItem }) {
  const data = item.data as Record<string, any>;
  const svg = useMemo(() => (item.kind === 'svg' ? sanitizeSvg(String(data.svg ?? '')) : ''), [item.kind, data.svg]);
  switch (item.kind) {
    case 'component':
      return item.thumbnail ? (
        <div className="k-lprev k-lprev--checker">
          <img src={item.thumbnail} alt="" draggable={false} />
        </div>
      ) : (
        <div className="k-lprev k-lprev--icon">{KIND_ICON.component}</div>
      );
    case 'animation':
      return (
        <div className="k-lprev">
          <AnimDemo anim={data.animation as KAnimation} />
        </div>
      );
    case 'svg':
      return <div className="k-lprev k-lprev--svg" dangerouslySetInnerHTML={{ __html: svg }} />;
    case 'image':
      return (
        <div className="k-lprev k-lprev--checker">
          <img src={String(data.dataUrl)} alt="" draggable={false} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
        </div>
      );
    case 'palette': {
      const colors = (data.colors ?? []) as { name: string; value: string }[];
      return (
        <div className="k-lprev k-lprev--palette">
          {colors.slice(0, 8).map((c) => (
            <span key={c.name} style={{ background: c.value }} title={`${c.name} ${c.value}`} />
          ))}
        </div>
      );
    }
    case 'style': {
      const s = stylePreview(data.styles ?? {});
      return (
        <div className="k-lprev">
          <div className="k-lprev__chip" style={{ ...toReactStyle(s), width: 76, height: 44 }}>
            Aa
          </div>
        </div>
      );
    }
  }
});
