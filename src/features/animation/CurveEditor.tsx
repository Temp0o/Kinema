/**
 * Easing curve editor: plots any CSS timing function, with draggable
 * cubic-bezier handles and a dot that continuously travels the curve so the
 * feel of the easing is visible at a glance.
 */
import { useEffect, useRef, useState } from 'react';
import { parseCubicBezier } from '@/core/anim/compile';
import { easingFunction, formatCubicBezier, sampleEasing } from '@/core/anim/easing';

const H = 148;
const PAD_X = 14;

export function CurveEditor({ easing, onChange }: { easing: string; onChange: (v: string, final: boolean) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(260);
  const bz = parseCubicBezier(easing.trim());
  const [drag, setDrag] = useState<{ range: [number, number] } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setW(Math.max(160, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(160, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // vertical range adapts to overshooting handles (frozen while dragging)
  const pts = sampleEasing(easing, 72);
  const ys = [...pts.map((p) => p[1]), ...(bz ? [bz[1], bz[3]] : [])];
  const autoRange: [number, number] = [Math.min(-0.15, Math.min(...ys) - 0.08), Math.max(1.15, Math.max(...ys) + 0.08)];
  const [yMin, yMax] = drag?.range ?? autoRange;
  const sx = (x: number) => PAD_X + x * (w - PAD_X * 2);
  const sy = (y: number) => H - ((y - yMin) / (yMax - yMin)) * H;

  // moving preview dot
  const dot = useRef<SVGCircleElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const fnRef = useRef(easingFunction(easing));
  fnRef.current = easingFunction(easing);
  const geo = useRef({ sx, sy });
  geo.current = { sx, sy };
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const CYCLE = 1600;
    const loop = (now: number) => {
      const t = ((now - start) % (CYCLE + 500)) / CYCLE;
      const x = Math.min(1, t);
      const y = fnRef.current(x);
      const { sx: X, sy: Y } = geo.current;
      dot.current?.setAttribute('cx', String(X(x)));
      dot.current?.setAttribute('cy', String(Y(y)));
      if (bar.current) bar.current.style.transform = `translateX(${Math.max(-0.2, Math.min(1.2, y)) * 100}%)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onHandleDown = (which: 0 | 1) => (e: React.PointerEvent) => {
    if (!bz) return;
    e.preventDefault();
    e.stopPropagation();
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    const range: [number, number] = [yMin, yMax];
    setDrag({ range });
    const cur: [number, number, number, number] = [...bz];
    const move = (ev: PointerEvent) => {
      const x = Math.min(1, Math.max(0, (ev.clientX - rect.left - PAD_X) / (rect.width - PAD_X * 2)));
      const y = range[0] + (1 - (ev.clientY - rect.top) / rect.height) * (range[1] - range[0]);
      const yy = Math.min(range[1], Math.max(range[0], y));
      if (which === 0) {
        cur[0] = x;
        cur[1] = yy;
      } else {
        cur[2] = x;
        cur[3] = yy;
      }
      onChange(formatCubicBezier(cur), false);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      onChange(formatCubicBezier(cur), true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const path = bz
    ? `M ${sx(0)} ${sy(0)} C ${sx(bz[0])} ${sy(bz[1])} ${sx(bz[2])} ${sy(bz[3])} ${sx(1)} ${sy(1)}`
    : `M ${pts.map((p) => `${sx(p[0])} ${sy(p[1])}`).join(' L ')}`;

  return (
    <div className="k-anim-curve" ref={wrap}>
      <svg width={w} height={H} className="k-anim-curve__svg" data-dragging={drag ? 'true' : undefined}>
        <rect x={sx(0)} y={sy(1)} width={sx(1) - sx(0)} height={sy(0) - sy(1)} className="k-anim-curve__box" />
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={sx(g)} x2={sx(g)} y1={sy(1)} y2={sy(0)} className="k-anim-curve__grid" />
        ))}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} className="k-anim-curve__diag" />
        {bz && (
          <>
            <line x1={sx(0)} y1={sy(0)} x2={sx(bz[0])} y2={sy(bz[1])} className="k-anim-curve__arm" />
            <line x1={sx(1)} y1={sy(1)} x2={sx(bz[2])} y2={sy(bz[3])} className="k-anim-curve__arm" />
          </>
        )}
        <path d={path} className="k-anim-curve__path" />
        <circle ref={dot} r={4.5} className="k-anim-curve__dot" cx={sx(0)} cy={sy(0)} />
        {bz && (
          <>
            <circle cx={sx(bz[0])} cy={sy(bz[1])} r={6} className="k-anim-curve__handle" onPointerDown={onHandleDown(0)} data-handle="1" />
            <circle cx={sx(bz[2])} cy={sy(bz[3])} r={6} className="k-anim-curve__handle" onPointerDown={onHandleDown(1)} data-handle="2" />
          </>
        )}
      </svg>
      <div className="k-anim-curve__track">
        <div className="k-anim-curve__bar" ref={bar} />
      </div>
      {!bz && <div className="k-anim-curve__note">Drag handles are available for cubic-bezier curves. Pick “Custom curve” to edit.</div>}
    </div>
  );
}
