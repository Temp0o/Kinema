/**
 * Preset browser: searchable, categorised grid of presets with live looping
 * thumbnails. Hovering a card previews it on the selected canvas element(s);
 * clicking applies it; cards can be dragged onto any canvas element.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bell, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useUI } from '@/core/store/uiStore';
import { useDoc } from '@/core/store/docStore';
import { IconButton, TextInput } from '@/ui/primitives';
import { endDrag, startDrag } from '@/core/dnd';
import { PRESET_CATEGORIES, searchPresets, type AnimationPreset, type PresetCategory } from '@/core/anim/presets';
import { animTargets, loopedEffect, previewTemplate, previewVariant, scheduleReplay, stopPreview } from './engine';
import { applyPreset } from './animActions';
import { usePlayback } from './playbackStore';
import { triggerMeta } from './meta';

// ─── Live thumbnail ───────────────────────────────────────────────────────

function DemoShape({ preset }: { preset: AnimationPreset }) {
  switch (preset.demo) {
    case 'text':
      return <div className="k-anim-demo__text" data-demo>Hello world</div>;
    case 'children':
      return (
        <div className="k-anim-demo__row" data-demo>
          <i />
          <i />
          <i />
          <i />
        </div>
      );
    case 'svg':
      return (
        <div className="k-anim-demo__svg" data-demo>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" pathLength={1} fill="currentColor" fillOpacity="0.18" />
            <path d="M7.8 12.4l2.8 2.8 5.6-6" pathLength={1} />
          </svg>
        </div>
      );
    case 'gradient':
      return <div className="k-anim-demo__box k-anim-demo__box--gradient" data-demo />;
    case 'shimmer':
      return <div className="k-anim-demo__shimmer" data-demo />;
    case 'button':
      return <div className="k-anim-demo__button" data-demo>Hover</div>;
    case 'bell':
      return (
        <div className="k-anim-demo__bell" data-demo>
          <Bell />
        </div>
      );
    default:
      return <div className="k-anim-demo__box" data-demo />;
  }
}

/** Shared observer: thumbnails only animate while on screen. */
const visibility = new Map<Element, (v: boolean) => void>();
let io: IntersectionObserver | null = null;
function observe(el: Element, cb: (v: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') {
    cb(true);
    return () => cb(false);
  }
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) visibility.get(e.target)?.(e.isIntersecting);
  });
  visibility.set(el, cb);
  io.observe(el);
  return () => {
    io?.unobserve(el);
    visibility.delete(el);
    cb(false);
  };
}

export const PresetThumb = memo(function PresetThumb({ preset }: { preset: AnimationPreset }) {
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = stage.current;
    if (!host) return;
    let running: Animation[] = [];
    const stop = () => {
      running.forEach((a) => a.cancel());
      running = [];
    };
    const start = () => {
      stop();
      const el = host.querySelector('[data-demo]');
      if (!el) return;
      const anim = preset.make();
      const variant = previewVariant(anim);
      const targets = animTargets(el, anim);
      const stagger = anim.stagger ?? 0;
      const maxLead = stagger * Math.max(0, targets.length - 1);
      targets.forEach((t, i) => {
        try {
          const eff = loopedEffect(variant, { lead: i * stagger, maxLead, el: t, gap: 700 });
          running.push(t.animate(eff.keyframes, eff.timing));
        } catch {
          /* unsupported easing in this browser */
        }
      });
    };
    const un = observe(host, (v) => (v ? start() : stop()));
    return () => {
      un();
      stop();
    };
  }, [preset]);
  return (
    <div className="k-anim-thumb" ref={stage} aria-hidden>
      <DemoShape preset={preset} />
    </div>
  );
});

// ─── Browser ──────────────────────────────────────────────────────────────

function PresetCard({ preset, targets }: { preset: AnimationPreset; targets: string[] }) {
  const hovering = useRef(false);
  useEffect(
    () => () => {
      if (hovering.current) stopPreview();
    },
    [],
  );
  const apply = () => {
    stopPreview();
    hovering.current = false;
    if (!targets.length) {
      toast('Select a layer first', { description: 'Or drag the preset onto any element on the canvas.' });
      return;
    }
    const created = applyPreset(targets, preset);
    usePlayback.getState().set({ presetBrowser: false });
    if (created[0]) scheduleReplay(created[0].nodeId, created[0].animId, 60);
  };
  const t = triggerMeta(preset.defaultTrigger);
  return (
    <button
      type="button"
      className="k-anim-preset"
      data-preset={preset.id}
      title={preset.description}
      draggable
      onMouseEnter={() => {
        if (!targets.length) return;
        hovering.current = true;
        previewTemplate(targets, preset.make());
      }}
      onMouseLeave={() => {
        if (!hovering.current) return;
        hovering.current = false;
        stopPreview();
      }}
      onClick={apply}
      onDragStart={(e) => {
        stopPreview();
        hovering.current = false;
        startDrag(e, { type: 'animation', label: preset.name, animation: preset.make() });
      }}
      onDragEnd={() => endDrag()}
    >
      <PresetThumb preset={preset} />
      <span className="k-anim-preset__name">
        <span className="k-anim-preset__dot" style={{ background: t.color }} />
        {preset.name}
      </span>
    </button>
  );
}

export function PresetBrowser() {
  const selection = useUI((s) => s.selection);
  const targetName = useDoc((s) => (selection.length === 1 ? s.doc.nodes[selection[0]]?.name : null));
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<PresetCategory | 'all'>(() => {
    try {
      return (localStorage.getItem('kinema.presetCategory') as PresetCategory | 'all') || 'all';
    } catch {
      return 'all';
    }
  });
  const list = useMemo(() => searchPresets(query, cat), [query, cat]);
  const grouped = useMemo(() => {
    if (cat !== 'all') return [{ id: cat, label: '', items: list }];
    return PRESET_CATEGORIES.map((c) => ({ id: c.id, label: c.label, items: list.filter((p) => p.category === c.id) })).filter((g) => g.items.length);
  }, [list, cat]);

  useEffect(() => () => stopPreview(), []);

  const close = () => {
    stopPreview();
    usePlayback.getState().set({ presetBrowser: false });
  };
  const pick = (c: PresetCategory | 'all') => {
    setCat(c);
    try {
      localStorage.setItem('kinema.presetCategory', c);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="k-anim-browser" data-testid="preset-browser">
      <div className="k-anim-browser__head">
        <IconButton label="Back" size="sm" onClick={close}>
          <ArrowLeft />
        </IconButton>
        <div className="k-anim-browser__title">
          <span>Add animation</span>
          <small>
            {selection.length === 0
              ? 'Drag onto the canvas, or select a layer'
              : selection.length === 1
                ? `to ${targetName ?? 'layer'} · hover to preview`
                : `to ${selection.length} layers · hover to preview`}
          </small>
        </div>
      </div>
      <div className="k-anim-browser__search">
        <TextInput
          value={query}
          onChange={setQuery}
          placeholder="Search presets…"
          icon={<Search />}
          autoFocus
          suffix={
            query ? (
              <button className="k-anim-clear" aria-label="Clear search" onClick={() => setQuery('')}>
                <X />
              </button>
            ) : undefined
          }
        />
      </div>
      <div className="k-anim-chips" role="tablist" aria-label="Preset categories">
        {[{ id: 'all' as const, label: 'All' }, ...PRESET_CATEGORIES].map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className="k-anim-chip" onClick={() => pick(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="k-anim-browser__list">
        {grouped.map((g) => (
          <div key={g.id} className="k-anim-browser__group">
            {g.label && <div className="k-anim-browser__group-title">{g.label}</div>}
            {cat !== 'all' && <div className="k-anim-browser__hint">{PRESET_CATEGORIES.find((c) => c.id === g.id)?.hint}</div>}
            <div className="k-anim-grid">
              {g.items.map((p) => (
                <PresetCard key={p.id} preset={p} targets={selection} />
              ))}
            </div>
          </div>
        ))}
        {!list.length && <div className="k-anim-browser__none">No presets match “{query}”.</div>}
      </div>
    </div>
  );
}
