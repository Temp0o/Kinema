/**
 * Gradient editor: draggable stops on a gradient bar (click the bar to add a
 * stop, drag a stop away to remove it), per-stop color via ColorField, and an
 * angle dial (linear/conic) or shape/position (radial).
 */
import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Trash2 } from 'lucide-react';
import { useDoc } from '@/core/store/docStore';
import { IconButton, NumberField, Select, Tooltip } from '@/ui/primitives';
import { ColorField, resolveTokenVars } from './ColorPicker';
import { colorAt, gradientBarCss, serializeGradient, type Gradient } from './gradient';
import { relPos, startDrag } from './drag';
import './color.css';

export interface GradientEditorProps {
  value: Gradient;
  onChange: (g: Gradient, opts: { final: boolean }) => void;
}

const POSITIONS = ['center', 'top', 'bottom', 'left', 'right', 'top left', 'top right', 'bottom left', 'bottom right'];

export function GradientEditor({ value, onChange }: GradientEditorProps) {
  const tokens = useDoc((s) => s.doc.tokens.colors);
  const [g, setG] = useState(value);
  const [sel, setSel] = useState(0);
  const [removing, setRemoving] = useState<number | null>(null);
  const gRef = useRef(g);
  gRef.current = g;
  const lastSer = useRef(serializeGradient(value));

  useEffect(() => {
    const s = serializeGradient(value);
    if (s === lastSer.current) return;
    lastSer.current = s;
    setG(value);
    setSel((i) => Math.min(i, value.stops.length - 1));
  }, [value]);

  const emit = (next: Gradient, final: boolean) => {
    gRef.current = next;
    setG(next);
    lastSer.current = serializeGradient(next);
    onChange(next, { final });
  };

  const barRef = useRef<HTMLDivElement>(null);

  const addAt = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.k-ge__stop')) return;
    const { x } = relPos(e.currentTarget as HTMLElement, e);
    const pos = Math.round(x * 1000) / 10;
    const color = colorAt(gRef.current, pos, tokens);
    const stops = [...gRef.current.stops, { color, pos }];
    setSel(stops.length - 1);
    emit({ ...gRef.current, stops }, true);
  };

  const dragStop = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    setSel(i);
    const bar = barRef.current!;
    const rect = bar.getBoundingClientRect();
    let remove = false;
    startDrag(
      e,
      (ev) => {
        remove = gRef.current.stops.length > 2 && Math.abs(ev.clientY - (rect.top + rect.height / 2)) > 36;
        setRemoving(remove ? i : null);
        const { x } = relPos(bar, ev);
        const stops = gRef.current.stops.map((s, j) => (j === i ? { ...s, pos: Math.round(x * 1000) / 10 } : s));
        emit({ ...gRef.current, stops }, false);
      },
      (_ev, moved) => {
        setRemoving(null);
        if (!moved) return;
        if (remove) {
          const stops = gRef.current.stops.filter((_, j) => j !== i);
          setSel(0);
          emit({ ...gRef.current, stops }, true);
        } else emit(gRef.current, true);
      },
    );
  };

  const stop = g.stops[sel] ?? g.stops[0];
  const updateStop = (patch: Partial<{ color: string; pos: number }>, final: boolean) => {
    const stops = gRef.current.stops.map((s, j) => (j === sel ? { ...s, ...patch } : s));
    emit({ ...gRef.current, stops }, final);
  };

  const dialDrag = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const at = (ev: PointerEvent, final: boolean) => {
      const dx = ev.clientX - (r.left + r.width / 2);
      const dy = ev.clientY - (r.top + r.height / 2);
      let a = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (a < 0) a += 360;
      a = ev.shiftKey ? Math.round(a / 15) * 15 : Math.round(a);
      emit({ ...gRef.current, angle: a % 360 }, final);
    };
    startDrag(e, (ev) => at(ev, false), (ev) => at(ev, true), { immediate: true });
  };

  const posOptions = [...new Set([g.at || 'center', ...POSITIONS])].map((p) => ({ value: p, label: p }));

  return (
    <div className="k-ge">
      <div className="k-ge__barwrap">
        <div ref={barRef} className="k-ge__bar" onPointerDown={addAt} title="Click to add a stop" data-testid="gradient-bar">
          <span className="k-ge__bar-fill" style={{ background: resolveTokenVars(gradientBarCss(g), tokens) }} />
          {g.stops.map((s, i) => (
            <span
              key={i}
              className="k-ge__stop"
              data-selected={i === sel ? 'true' : undefined}
              data-removing={removing === i ? 'true' : undefined}
              style={{ left: `${Math.min(100, Math.max(0, s.pos))}%` }}
              onPointerDown={(e) => dragStop(e, i)}
              data-testid="gradient-stop"
            >
              <span style={{ background: resolveTokenVars(s.color, tokens) }} />
            </span>
          ))}
        </div>
      </div>
      <div className="k-ge__row">
        {g.type === 'radial' ? (
          <>
            <Select
              value={/ellipse/.test(g.shape) ? 'ellipse' : 'circle'}
              onChange={(v) => emit({ ...gRef.current, shape: v }, true)}
              options={[
                { value: 'circle', label: 'Circle' },
                { value: 'ellipse', label: 'Ellipse' },
              ]}
              ariaLabel="Radial shape"
            />
            <Select value={g.at || 'center'} onChange={(v) => emit({ ...gRef.current, at: v === 'center' ? '' : v }, true)} options={posOptions} ariaLabel="Gradient center" />
          </>
        ) : (
          <>
            <Tooltip content="Drag to rotate (Shift snaps)">
              <span className="k-ge__dial" onPointerDown={dialDrag} role="slider" aria-label="Angle" aria-valuenow={g.angle} data-testid="gradient-dial">
                <span style={{ transform: `rotate(${g.angle}deg)` }} />
              </span>
            </Tooltip>
            <NumberField label="∠" labelTitle="Angle" value={g.angle} suffix="°" precision={1} onChange={(n, o) => emit({ ...gRef.current, angle: ((n % 360) + 360) % 360 }, o.final)} />
          </>
        )}
        <IconButton
          label="Reverse stops"
          size="sm"
          onClick={() => emit({ ...gRef.current, stops: gRef.current.stops.map((s) => ({ ...s, pos: Math.round((100 - s.pos) * 100) / 100 })) }, true)}
        >
          <ArrowLeftRight />
        </IconButton>
      </div>
      {stop && (
        <div className="k-ge__stoprow">
          <ColorField value={stop.color} onChange={(c, o) => updateStop({ color: c }, o?.final ?? true)} ariaLabel="Stop color" />
          <NumberField value={stop.pos} min={0} max={100} suffix="%" precision={1} onChange={(n, o) => updateStop({ pos: n }, o.final)} className="k-ge__pos" />
          <IconButton
            label="Remove stop"
            size="sm"
            disabled={g.stops.length <= 2}
            onClick={() => {
              const stops = gRef.current.stops.filter((_, j) => j !== sel);
              setSel(0);
              emit({ ...gRef.current, stops }, true);
            }}
          >
            <Trash2 />
          </IconButton>
        </div>
      )}
    </div>
  );
}
