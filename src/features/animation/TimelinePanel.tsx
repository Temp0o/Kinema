/**
 * Timeline (bottom dock): transport, adaptive ruler, draggable playhead, one
 * row per animated layer and per animation, keyframe diamonds, and expandable
 * per-property tracks. Every drag is one undo step (transaction).
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Clapperboard, Infinity as InfinityIcon, Maximize2, Pause, Play, Repeat, Sparkles, Square } from 'lucide-react';
import { docApi } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { updateAnimation } from '@/core/store/actions';
import type { KAnimation, KNode, NodeId } from '@/core/model/types';
import { Button, EmptyState, IconButton, Slider, Tooltip } from '@/ui/primitives';
import { animIterations, buildTicks, contentDuration, formatMs, formatTime, isInfiniteAnim, snapOffset, snapTime } from '@/core/anim/timeline';
import { usePlayback } from './playbackStore';
import { animTargets, elementsForNode, pause, resume, scrub, stopAll } from './engine';
import { addKeyframeAt, removeKeyframe, selectAnimation } from './animActions';
import { channelDef, NodeIcon, sortChannelKeys, triggerMeta } from './meta';
import { useAnimatedNodes } from './hooks';
import { openPresetBrowser } from './install';
import './animation.css';

const LABEL_W = 208;
const SNAP_PX = 6;
const ZMIN = 0.02;
const ZMAX = 1.2;
const zoomToSlider = (z: number) => (Math.log(z / ZMIN) / Math.log(ZMAX / ZMIN)) * 100;
const sliderToZoom = (v: number) => ZMIN * Math.pow(ZMAX / ZMIN, v / 100);

function loadZoom() {
  try {
    const v = parseFloat(localStorage.getItem('kinema.timelineZoom') ?? '');
    return Number.isFinite(v) ? Math.min(ZMAX, Math.max(ZMIN, v)) : 0.25;
  } catch {
    return 0.25;
  }
}

/** Pointer drag helper: begins a history transaction on first movement, commits on release. */
function gesture(e: React.PointerEvent, label: string, onMove: (dx: number, ev: PointerEvent) => void, onClick?: () => void, onEnd?: () => void) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  let started = false;
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    if (!started) {
      if (Math.abs(dx) < 3) return;
      started = true;
      docApi.begin(label);
      document.body.dataset.kTlDragging = 'true';
    }
    onMove(dx, ev);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    delete document.body.dataset.kTlDragging;
    if (started) docApi.commit();
    else onClick?.();
    onEnd?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function targetCount(nodeId: NodeId, anim: KAnimation): number {
  if (anim.stagger == null && !anim.targetSelector) return 1;
  const el = elementsForNode(nodeId)[0];
  return el ? Math.max(1, animTargets(el, anim).length) : 1;
}

// ─── Transport ─────────────────────────────────────────────────────────────

function TimeReadout({ total }: { total: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const set = (t: number) => ref.current && (ref.current.textContent = formatTime(t));
    set(usePlayback.getState().time);
    return usePlayback.subscribe((s, p) => s.time !== p.time && set(s.time));
  }, []);
  return (
    <span className="k-tl__time">
      <span ref={ref} data-testid="tl-time" />
      <span className="k-tl__time-total">/ {formatTime(total)}</span>
    </span>
  );
}

function Transport({ zoom, setZoom, onFit, total }: { zoom: number; setZoom: (z: number) => void; onFit: () => void; total: number }) {
  const playing = usePlayback((s) => s.playing);
  const paused = usePlayback((s) => s.paused);
  const loop = usePlayback((s) => s.loop);
  return (
    <div className="k-tl__transport">
      <IconButton label={playing ? 'Pause' : 'Play from playhead'} shortcut={playing ? undefined : 'Space'} active={playing} onClick={() => (playing ? pause() : resume())} data-testid="tl-play">
        {playing ? <Pause /> : <Play />}
      </IconButton>
      <IconButton label="Stop (back to start)" shortcut="Escape" disabled={!playing && !paused} onClick={() => stopAll()}>
        <Square />
      </IconButton>
      <IconButton label={loop ? 'Looping' : 'Loop playback'} active={loop} onClick={() => usePlayback.getState().set({ loop: !loop })}>
        <Repeat />
      </IconButton>
      <span className="k-tl__sep" />
      <TimeReadout total={total} />
      <span style={{ flex: 1 }} />
      <span className="k-tl__zoom-label">{formatMs(Math.round(100 / zoom))}/100px</span>
      <div className="k-tl__zoom">
        <Slider value={zoomToSlider(zoom)} min={0} max={100} step={0.5} onChange={(v) => setZoom(sliderToZoom(v))} ariaLabel="Timeline zoom" />
      </div>
      <IconButton label="Zoom to fit" size="sm" onClick={onFit}>
        <Maximize2 />
      </IconButton>
    </div>
  );
}

// ─── Ruler & playhead ─────────────────────────────────────────────────────

function usePlayheadX(ref: React.RefObject<HTMLElement | null>, zoom: number) {
  useLayoutEffect(() => {
    const apply = (t: number) => {
      if (ref.current) ref.current.style.transform = `translateX(${t * zoom}px)`;
    };
    apply(usePlayback.getState().time);
    return usePlayback.subscribe((s, p) => s.time !== p.time && apply(s.time));
  }, [ref, zoom]);
}

const Ruler = memo(function Ruler({ width, zoom, snapTimes }: { width: number; zoom: number; snapTimes: number[] }) {
  const ticks = useMemo(() => buildTicks(width / zoom, zoom), [width, zoom]);
  const head = useRef<HTMLDivElement>(null);
  usePlayheadX(head, zoom);
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const at = (ev: { clientX: number; shiftKey: boolean }) => {
      const t = (ev.clientX - rect.left) / zoom;
      return snapTime(t, { grid: 1, targets: snapTimes, threshold: SNAP_PX / zoom, free: ev.shiftKey });
    };
    scrub(at(e));
    const move = (ev: PointerEvent) => scrub(at(ev));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="k-tl__ruler" style={{ width }} onPointerDown={onDown} data-testid="tl-ruler">
      {ticks.map((t) => (
        <div key={t.t} className="k-tl__tick" data-major={t.major ? 'true' : undefined} style={{ left: t.t * zoom }}>
          {t.label && <span>{t.label}</span>}
        </div>
      ))}
      <div className="k-tl__head" ref={head} data-testid="tl-playhead">
        <span />
      </div>
    </div>
  );
});

function PlayheadLine({ zoom }: { zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  usePlayheadX(ref, zoom);
  const active = usePlayback((s) => s.playing || s.paused);
  return <div className="k-tl__line" ref={ref} data-active={active ? 'true' : undefined} style={{ left: LABEL_W }} />;
}

// ─── Rows ─────────────────────────────────────────────────────────────────

interface RowCtx {
  zoom: number;
  trackW: number;
  snapTimes: number[];
  selectedAnim: string | null;
  selectedKf: string | null;
}

function selectKeyframe(nodeId: NodeId, animId: string, kfId: string) {
  useUI.getState().select([nodeId]);
  selectAnimation(nodeId, animId, kfId);
  useUI.getState().set({ rightTab: 'animate' });
  usePlayback.getState().set({ presetBrowser: false });
}

function Diamond({ nodeId, anim, kfId, offset, ctx, barW }: { nodeId: NodeId; anim: KAnimation; kfId: string; offset: number; ctx: RowCtx; barW: number }) {
  const [drag, setDrag] = useState<number | null>(null);
  const onDown = (e: React.PointerEvent) => {
    const start = offset;
    const playOff = (usePlayback.getState().time - anim.delay) / Math.max(1, anim.duration);
    gesture(
      e,
      'Move keyframe',
      (dx, ev) => {
        const o = snapOffset(start + dx / barW, { step: 0.05, targets: [playOff], threshold: SNAP_PX / barW, free: ev.shiftKey });
        setDrag(o);
        updateAnimation(nodeId, anim.id, (a) => {
          const k = a.keyframes.find((x) => x.id === kfId);
          if (!k) return;
          k.offset = o;
          a.keyframes.sort((x, y) => x.offset - y.offset);
        });
      },
      () => selectKeyframe(nodeId, anim.id, kfId),
      () => setDrag(null),
    );
    if (e.button === 0) selectKeyframe(nodeId, anim.id, kfId);
  };
  return (
    <button
      className="k-tl__kf"
      data-selected={ctx.selectedKf === kfId ? 'true' : undefined}
      style={{ left: offset * barW }}
      onPointerDown={onDown}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label={`Keyframe ${Math.round(offset * 100)}%`}
      data-kf={kfId}
    >
      {drag != null && (
        <span className="k-tl__kf-tip">
          {Math.round(drag * 100)}% · {Math.round(anim.delay + drag * anim.duration)}ms
        </span>
      )}
    </button>
  );
}

function AnimBar({ nodeId, anim, ctx }: { nodeId: NodeId; anim: KAnimation; ctx: RowCtx }) {
  const z = ctx.zoom;
  const infinite = isInfiniteAnim(anim);
  const iters = animIterations(anim);
  const left = anim.delay * z;
  const firstW = Math.max(2, anim.duration * z);
  const width = infinite ? Math.max(firstW, ctx.trackW - left) : firstW * iters;
  const count = targetCount(nodeId, anim);
  const staggerW = (anim.stagger ?? 0) * Math.max(0, count - 1) * z;
  const color = triggerMeta(anim.trigger).color;
  const disabled = anim.enabled === false;
  const others = ctx.snapTimes;

  const onBarDown = (e: React.PointerEvent) => {
    const startDelay = anim.delay;
    gesture(
      e,
      'Move animation',
      (dx, ev) => {
        const d = snapTime(startDelay + dx / z, { grid: 10, targets: others, threshold: SNAP_PX / z, free: ev.shiftKey });
        updateAnimation(nodeId, anim.id, (a) => void (a.delay = d));
      },
      () => {
        useUI.getState().select([nodeId]);
        selectAnimation(nodeId, anim.id);
      },
    );
  };
  const onEdgeDown = (e: React.PointerEvent) => {
    const n = infinite ? 1 : iters;
    const startEnd = anim.delay + anim.duration * n;
    gesture(e, 'Change duration', (dx, ev) => {
      const end = snapTime(startEnd + dx / z, { grid: 10, targets: others, threshold: SNAP_PX / z, free: ev.shiftKey });
      const dur = Math.max(20, Math.round((end - anim.delay) / n));
      updateAnimation(nodeId, anim.id, (a) => void (a.duration = dur));
    });
  };
  const onDouble = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const local = (e.clientX - r.left) / firstW;
    const off = local - Math.floor(local);
    addKeyframeAt(nodeId, anim.id, snapOffset(off, { free: e.shiftKey, step: 0.01 }), { replay: false });
    useUI.getState().select([nodeId]);
  };

  return (
    <>
      {staggerW > 0 && <div className="k-tl__stagger" style={{ left, width: (infinite ? firstW : width) + staggerW, ['--c' as string]: color }} title={`Stagger: ${count} targets × ${anim.stagger}ms`} />}
      <div
        className="k-tl__bar"
        data-infinite={infinite ? 'true' : undefined}
        data-disabled={disabled ? 'true' : undefined}
        data-selected={ctx.selectedAnim === anim.id ? 'true' : undefined}
        style={{ left, width, ['--c' as string]: color }}
        onPointerDown={onBarDown}
        onDoubleClick={onDouble}
        data-testid="tl-bar"
        data-anim={anim.id}
        title={`${anim.name} · ${formatMs(anim.delay)} → ${infinite ? '∞' : formatMs(anim.delay + anim.duration * iters)} · double-click to add a keyframe`}
      >
        {Array.from({ length: Math.min(infinite ? Math.ceil(width / firstW) : iters, 60) - 1 }, (_, i) => (
          <i key={i} className="k-tl__iter" style={{ left: (i + 1) * firstW }} />
        ))}
        {firstW > 70 && <span className="k-tl__bar-name">{anim.name}</span>}
        {infinite && (
          <span className="k-tl__inf" style={{ left: Math.min(width - 22, firstW + 6) }}>
            <InfinityIcon />
          </span>
        )}
        <div className="k-tl__kfs">
          {anim.keyframes.map((k) => (
            <Diamond key={k.id} nodeId={nodeId} anim={anim} kfId={k.id} offset={k.offset} ctx={ctx} barW={firstW} />
          ))}
        </div>
        <span className="k-tl__edge" style={{ left: (infinite ? firstW : width) - 1 }} onPointerDown={onEdgeDown} data-testid="tl-edge" title="Drag to change duration" />
      </div>
    </>
  );
}

function PropertyRows({ nodeId, anim, ctx }: { nodeId: NodeId; anim: KAnimation; ctx: RowCtx }) {
  const keys = sortChannelKeys(new Set(anim.keyframes.flatMap((k) => Object.keys(k.values))));
  const z = ctx.zoom;
  const left = anim.delay * z;
  const w = Math.max(2, anim.duration * z);
  return (
    <>
      {keys.map((key) => {
        const ks = [...anim.keyframes].filter((k) => k.values[key] !== undefined).sort((a, b) => a.offset - b.offset);
        return (
          <div className="k-tl__row k-tl__row--prop" key={key}>
            <div className="k-tl__label" style={{ paddingLeft: 46 }}>
              <span className="k-tl__prop-name">{channelDef(key).label}</span>
            </div>
            <div className="k-tl__track" style={{ width: ctx.trackW }}>
              {ks.length > 1 && <div className="k-tl__prop-span" style={{ left: left + ks[0].offset * w, width: (ks[ks.length - 1].offset - ks[0].offset) * w, ['--c' as string]: triggerMeta(anim.trigger).color }} />}
              {ks.map((k) => (
                <button
                  key={k.id}
                  className="k-tl__kf k-tl__kf--small"
                  data-selected={ctx.selectedKf === k.id ? 'true' : undefined}
                  style={{ left: left + k.offset * w }}
                  onClick={() => selectKeyframe(nodeId, anim.id, k.id)}
                  title={`${channelDef(key).label}: ${k.values[key]}`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function NodeRows({ node, depth, ctx, expanded, toggle }: { node: KNode; depth: number; ctx: RowCtx; expanded: Set<string>; toggle: (id: string) => void }) {
  const selected = useUI((s) => s.selection.includes(node.id));
  const indent = 10 + Math.max(0, depth - 1) * 12;
  return (
    <>
      <div className="k-tl__row k-tl__row--node" data-selected={selected ? 'true' : undefined}>
        <div className="k-tl__label" style={{ paddingLeft: indent }} onClick={() => useUI.getState().select([node.id])}>
          <span className="k-tl__node-icon">
            <NodeIcon type={node.type} />
          </span>
          <span className="k-tl__name">{node.name}</span>
        </div>
        <div className="k-tl__track" style={{ width: ctx.trackW }} />
      </div>
      {(node.animations ?? []).map((a) => {
        const open = expanded.has(a.id);
        return (
          <div key={a.id} className="k-tl__group">
            <div className="k-tl__row k-tl__row--anim" data-selected={ctx.selectedAnim === a.id ? 'true' : undefined}>
              <div
                className="k-tl__label"
                style={{ paddingLeft: indent + 4 }}
                onClick={() => {
                  useUI.getState().select([node.id]);
                  selectAnimation(node.id, a.id);
                }}
              >
                <button
                  className="k-tl__chev"
                  data-open={open ? 'true' : undefined}
                  aria-label={open ? 'Collapse properties' : 'Expand properties'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(a.id);
                  }}
                >
                  <ChevronRight />
                </button>
                <span className="k-tl__swatch" style={{ background: triggerMeta(a.trigger).color }} />
                <span className="k-tl__name k-tl__name--anim" data-disabled={a.enabled === false ? 'true' : undefined}>
                  {a.name}
                </span>
              </div>
              <div className="k-tl__track" style={{ width: ctx.trackW }}>
                <AnimBar nodeId={node.id} anim={a} ctx={ctx} />
              </div>
            </div>
            {open && <PropertyRows nodeId={node.id} anim={a} ctx={ctx} />}
          </div>
        );
      })}
    </>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────

export function TimelinePanel() {
  const rows = useAnimatedNodes();
  const [zoom, setZoomState] = useState(loadZoom);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [viewW, setViewW] = useState(800);
  const scroller = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const selectedAnim = usePlayback((s) => s.selectedAnimation?.animId ?? null);
  const selectedKf = usePlayback((s) => s.selectedKeyframe?.keyframeId ?? null);

  const setZoom = (z: number) => {
    const v = Math.min(ZMAX, Math.max(ZMIN, z));
    setZoomState(v);
    try {
      localStorage.setItem('kinema.timelineZoom', String(v));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ctrl/⌘ + wheel zooms around the pointer
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - LABEL_W + el.scrollLeft;
      setZoomState((z) => {
        const nz = Math.min(ZMAX, Math.max(ZMIN, z * Math.exp(-e.deltaY * 0.002)));
        requestAnimationFrame(() => (el.scrollLeft = Math.max(0, (x / z) * nz - (e.clientX - rect.left - LABEL_W))));
        return nz;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [rows.length > 0]);

  const anims = rows.flatMap((r) => r.node.animations ?? []);
  const total = contentDuration(anims);
  const trackW = Math.max(viewW - LABEL_W - 2, (total + 500) * zoom);
  const snapTimes = useMemo(() => {
    const out = new Set<number>([0]);
    for (const a of anims) {
      out.add(a.delay);
      if (!isInfiniteAnim(a)) out.add(a.delay + a.duration * animIterations(a));
    }
    return [...out];
  }, [anims]);
  const ctx: RowCtx = { zoom, trackW, snapTimes, selectedAnim, selectedKf };

  const fit = () => setZoom((viewW - LABEL_W - 40) / Math.max(500, total));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea')) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const k = usePlayback.getState().selectedKeyframe;
      if (!k) return;
      e.preventDefault();
      e.stopPropagation();
      removeKeyframe(k.nodeId, k.animId, k.keyframeId);
    } else if (e.key === ' ' && !e.shiftKey) {
      e.preventDefault();
      if (usePlayback.getState().playing) pause();
      else resume();
    }
  };

  return (
    <div
      className="k-tl"
      ref={root}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onPointerDownCapture={(e) => !(e.target as HTMLElement).closest('input, [role="slider"]') && root.current?.focus({ preventScroll: true })}
      data-testid="timeline"
    >
      <Transport zoom={zoom} setZoom={setZoom} onFit={fit} total={total} />
      {rows.length === 0 ? (
        <div className="k-tl__empty">
          <EmptyState icon={<Clapperboard />} title="No animations on this page yet">
            Select a layer and add an animation in the Animate panel. Each one appears here as a bar you can drag to retime, with keyframes you can move.
          </EmptyState>
          <Button variant="primary" size="sm" icon={<Sparkles />} onClick={openPresetBrowser}>
            Browse presets
          </Button>
        </div>
      ) : (
        <div className="k-tl__scroll" ref={scroller}>
          <div className="k-tl__grid" style={{ width: LABEL_W + trackW }}>
            <div className="k-tl__row k-tl__row--ruler">
              <div className="k-tl__label k-tl__corner">
                <Tooltip content="Drag the ruler to scrub · Shift for free snapping · Ctrl+wheel to zoom">
                  <span>Layers</span>
                </Tooltip>
              </div>
              <Ruler width={trackW} zoom={zoom} snapTimes={snapTimes} />
            </div>
            {rows.map((r) => (
              <NodeRows
                key={r.node.id}
                node={r.node}
                depth={r.depth}
                ctx={ctx}
                expanded={expanded}
                toggle={(id) =>
                  setExpanded((s) => {
                    const n = new Set(s);
                    if (n.has(id)) n.delete(id);
                    else n.add(id);
                    return n;
                  })
                }
              />
            ))}
            <PlayheadLine zoom={zoom} />
          </div>
        </div>
      )}
    </div>
  );
}
