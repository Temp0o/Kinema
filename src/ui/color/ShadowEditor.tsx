/**
 * Shadow list editor for box-shadow / text-shadow: add, remove, reorder,
 * x / y / blur / spread / color / inset per shadow.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Button, IconButton, NumberField, Popover, Switch, TextInput } from '@/ui/primitives';
import { ColorField, ColorPicker, ColorSwatch } from './ColorPicker';
import { DEFAULT_SHADOW, DEFAULT_TEXT_SHADOW, parseShadows, serializeShadows, type Shadow } from './shadow';
import { fmtNum } from './cssValue';
import './color.css';

export interface ShadowEditorProps {
  value: string | null | undefined;
  onChange: (value: string | null, opts: { final: boolean }) => void;
  /** text-shadow mode (no spread / inset) */
  text?: boolean;
  mixed?: boolean;
}

export function ShadowEditor({ value, onChange, text, mixed }: ShadowEditorProps) {
  const parsed = mixed ? [] : parseShadows(value);
  const [list, setList] = useState<Shadow[]>(parsed ?? []);
  const [open, setOpen] = useState<number | null>(null);
  const listRef = useRef(list);
  listRef.current = list;
  const last = useRef(value);

  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    const p = parseShadows(value);
    if (p) setList(p);
  }, [value]);

  const emit = (next: Shadow[], final: boolean) => {
    listRef.current = next;
    setList(next);
    const css = serializeShadows(next, { text });
    last.current = css;
    onChange(css, { final });
  };

  const update = (i: number, patch: Partial<Shadow>, final: boolean) => emit(listRef.current.map((s, j) => (j === i ? { ...s, ...patch } : s)), final);
  const move = (i: number, d: number) => {
    const next = [...listRef.current];
    const [s] = next.splice(i, 1);
    next.splice(i + d, 0, s);
    setOpen(open === i ? i + d : open);
    emit(next, true);
  };

  if (!mixed && parsed == null) {
    return (
      <div className="k-stack">
        <TextInput value={value ?? ''} onCommit={(v) => onChange(v.trim() || null, { final: true })} aria-label="Shadow (raw CSS)" />
        <span className="k-hint">This shadow uses syntax the editor can't show. Edit it as CSS or reset it.</span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null, { final: true })}>
          Reset shadow
        </Button>
      </div>
    );
  }

  return (
    <div className="k-shadows">
      {mixed && <div className="k-hint">Mixed — editing replaces shadows on all selected layers.</div>}
      {list.map((s, i) => (
        <div key={i} className="k-shadow" data-open={open === i ? 'true' : undefined}>
          <div className="k-shadow__row">
            <Popover
              side="left"
              width={252}
              className="k-cp-popover"
              trigger={
                <button type="button" className="k-shadow__swatch" aria-label="Shadow color">
                  <ColorSwatch value={s.color} />
                </button>
              }
            >
              <ColorPicker value={s.color} onChange={(c, o) => update(i, { color: c }, o.final)} />
            </Popover>
            <button type="button" className="k-shadow__summary" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              {!text && s.inset && <span className="k-badge">Inset</span>}
              <span className="k-mono">
                {fmtNum(s.x)} {fmtNum(s.y)} {fmtNum(s.blur)}
                {!text ? ` ${fmtNum(s.spread)}` : ''}
              </span>
            </button>
            <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)} noTooltip>
              <ChevronUp />
            </IconButton>
            <IconButton label="Move down" size="sm" disabled={i === list.length - 1} onClick={() => move(i, 1)} noTooltip>
              <ChevronDown />
            </IconButton>
            <IconButton label="Remove shadow" size="sm" onClick={() => emit(listRef.current.filter((_, j) => j !== i), true)}>
              <X />
            </IconButton>
          </div>
          {open === i && (
            <div className="k-shadow__detail">
              <div className={text ? 'k-grid3' : 'k-grid4'}>
                <NumberField label="X" value={s.x} onChange={(n, o) => update(i, { x: n }, o.final)} />
                <NumberField label="Y" value={s.y} onChange={(n, o) => update(i, { y: n }, o.final)} />
                <NumberField label="B" labelTitle="Blur" value={s.blur} min={0} onChange={(n, o) => update(i, { blur: n }, o.final)} />
                {!text && <NumberField label="S" labelTitle="Spread" value={s.spread} onChange={(n, o) => update(i, { spread: n }, o.final)} />}
              </div>
              <ColorField value={s.color} onChange={(c, o) => update(i, { color: c }, o?.final ?? true)} ariaLabel="Shadow color" />
              {!text && (
                <label className="k-hstack k-shadow__inset">
                  <Switch checked={s.inset} onChange={(v) => update(i, { inset: v }, true)} ariaLabel="Inset" />
                  <span className="k-label">Inset (inner shadow)</span>
                </label>
              )}
            </div>
          )}
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        icon={<Plus />}
        className="k-shadows__add"
        onClick={() => {
          const base = text ? DEFAULT_TEXT_SHADOW : DEFAULT_SHADOW;
          const next = [...(mixed ? [] : listRef.current), { ...base }];
          setOpen(next.length - 1);
          emit(next, true);
        }}
      >
        Add {text ? 'text shadow' : 'shadow'}
      </Button>
    </div>
  );
}
