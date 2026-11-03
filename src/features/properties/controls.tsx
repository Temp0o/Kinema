/**
 * Design panel building blocks: property rows with override indicators, size /
 * length fields, the 3×3 alignment grid and scrubbable inline values.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RotateCcw, X } from 'lucide-react';
import clsx from 'clsx';
import { NumberField, Row, Tooltip } from '@/ui/primitives';
import { ContextMenuArea, Dropdown, type MenuEntry } from '@/ui/menu';
import { useUI } from '@/core/store/uiStore';
import { splitUnit } from '@/core/style/style';
import { fmtNum } from '@/ui/color/cssValue';
import { applyPatch, measureInParent, offValue, propStatus, readProp, resetProps, setProp, type Scope } from './scope';
import { flexGrows, isFlexMain, parseSize, sizePatch, type AlignPos, type Axis, type SizeMode } from './lib/layout';

export const STATE_LABELS: Record<string, string> = { default: 'Default', hover: 'Hover', active: 'Pressed', focus: 'Focus' };

export function bpName(scope: Scope): string {
  return scope.breakpoints.find((b) => b.id === scope.bp)?.name ?? scope.bp;
}

// ─── Property row with override / state indicator ───────────────────────────

export function PropLabel({ scope, props, children }: { scope: Scope; props: string[]; children: ReactNode }) {
  const st = propStatus(scope, props);
  const active = st.overridden || st.inState;
  const resetLabel = st.inState ? `Clear ${STATE_LABELS[scope.state!]} value` : `Reset ${bpName(scope)} override`;
  const hasBaseValue = scope.isBase && !scope.state && scope.nodes.some((n) => props.some((p) => n.styles.base?.[p] !== undefined));
  const items = (): MenuEntry[] => {
    if (active) return [{ label: resetLabel, icon: <RotateCcw />, onSelect: () => resetProps(scope, props) }];
    if (hasBaseValue) return [{ label: 'Clear value', icon: <X />, onSelect: () => resetProps(scope, props) }];
    return [{ label: scope.state ? `Not set in ${STATE_LABELS[scope.state]}` : scope.isBase ? 'No value set' : `Not overridden on ${bpName(scope)}`, disabled: true }];
  };
  return (
    <ContextMenuArea items={items}>
      <span className="k-dp-label" data-active={active ? 'true' : undefined} data-prop={props[0]}>
        <span className="k-dp-label__text">{children}</span>
        {active && (
          <Tooltip content={resetLabel}>
            <button
              type="button"
              className="k-dp-dot"
              aria-label={resetLabel}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                resetProps(scope, props);
              }}
            />
          </Tooltip>
        )}
      </span>
    </ContextMenuArea>
  );
}

export function PropRow({ scope, props, label, children, title }: { scope: Scope; props: string[]; label: ReactNode; children: ReactNode; title?: string }) {
  const st = propStatus(scope, props);
  return (
    <Row
      overridden={st.overridden || st.inState}
      title={title}
      label={
        <PropLabel scope={scope} props={props}>
          {label}
        </PropLabel>
      }
    >
      {children}
    </Row>
  );
}

// ─── Length field (any CSS length; numbers scrub) ───────────────────────────

export function LengthField({
  scope,
  prop,
  label,
  labelTitle,
  unit = 'px',
  min,
  max,
  step,
  precision = 2,
  placeholder,
  className,
}: {
  scope: Scope;
  prop: string;
  label?: ReactNode;
  labelTitle?: string;
  /** unit appended to typed numbers ('' = unitless) */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  placeholder?: string;
  className?: string;
}) {
  const info = readProp(scope, prop);
  const su = splitUnit(info.value);
  const isNum = su.n != null;
  const curUnit = isNum ? su.unit || (unit === '' ? '' : su.n === 0 ? unit : '') : unit;
  return (
    <NumberField
      label={label}
      labelTitle={labelTitle ?? prop}
      value={isNum && !info.mixed ? su.n : null}
      mixed={info.mixed}
      placeholder={info.value ?? placeholder}
      suffix={isNum && curUnit && curUnit !== 'px' ? curUnit : undefined}
      min={min}
      max={max}
      step={step}
      precision={precision}
      className={className}
      onChange={(n, o) => setProp(scope, prop, `${fmtNum(n, precision)}${n === 0 && curUnit === 'px' ? '' : curUnit}`, { final: o.final })}
      onRawCommit={(raw) => setProp(scope, prop, raw)}
    />
  );
}

// ─── Width / height with sizing modes ───────────────────────────────────────

const MODE_LABEL: Record<SizeMode, string> = { px: 'px', '%': '%', vw: 'vw', vh: 'vh', auto: 'Auto', fill: 'Fill', hug: 'Hug', raw: 'CSS' };

function measuredValue(id: string, axis: Axis, mode: SizeMode): number | null {
  const m = measureInParent(id);
  if (!m) return null;
  const size = axis === 'width' ? m.w : m.h;
  const parent = axis === 'width' ? m.pw : m.ph;
  const ui = useUI.getState();
  const r1 = (n: number) => Math.round(n * 10) / 10;
  switch (mode) {
    case 'px':
      return Math.round(size);
    case '%':
      return parent ? r1((size / parent) * 100) : 100;
    case 'vw':
      return r1((size / (ui.canvasWidth || 1440)) * 100);
    case 'vh':
      return r1((size / (ui.canvasHeight ?? 900)) * 100);
    default:
      return null;
  }
}

export function SizeField({ scope, axis }: { scope: Scope; axis: Axis }) {
  const vals = scope.maps.map((m, i) => parseSize(m, axis, isFlexMain(scope.parentMaps[i], axis)));
  const mixed = vals.some((v) => JSON.stringify(v) !== JSON.stringify(vals[0]));
  const v = vals[0];
  const numeric = v.mode === 'px' || v.mode === '%' || v.mode === 'vw' || v.mode === 'vh';
  const hasParent = scope.parents.every(Boolean);

  const write = (mode: SizeMode, n: number | null, final = true) =>
    applyPatch(
      scope,
      (map, node, i) => {
        const flexMain = isFlexMain(scope.parentMaps[i], axis);
        const num = n ?? (mode === 'px' || mode === '%' || mode === 'vw' || mode === 'vh' ? measuredValue(node.id, axis, mode) ?? 100 : null);
        return sizePatch(axis, mode, num, { flexMain, growing: flexMain && flexGrows(map), off: (x) => offValue(scope, x) });
      },
      { final, label: `Change ${axis}` },
    );

  const items: MenuEntry[] = [
    { label: 'Fixed (px)', checked: !mixed && v.mode === 'px', onSelect: () => write('px', null) },
    { label: 'Percent of parent (%)', checked: !mixed && v.mode === '%', onSelect: () => write('%', null), disabled: !hasParent },
    axis === 'width'
      ? { label: 'Viewport width (vw)', checked: !mixed && v.mode === 'vw', onSelect: () => write('vw', null) }
      : { label: 'Viewport height (vh)', checked: !mixed && v.mode === 'vh', onSelect: () => write('vh', null) },
    { type: 'separator' },
    { label: 'Fill container', checked: !mixed && v.mode === 'fill', onSelect: () => write('fill', null), disabled: !hasParent },
    { label: 'Hug contents', checked: !mixed && v.mode === 'hug', onSelect: () => write('hug', null) },
    { label: 'Auto', checked: !mixed && v.mode === 'auto', onSelect: () => write('auto', null) },
  ];

  return (
    <div className="k-dim">
      <NumberField
        label={axis === 'width' ? 'W' : 'H'}
        labelTitle={axis === 'width' ? 'Width' : 'Height'}
        value={numeric && !mixed ? v.n : null}
        mixed={mixed}
        placeholder={v.mode === 'raw' ? v.raw : MODE_LABEL[v.mode]}
        min={v.mode === 'px' || !numeric ? 0 : undefined}
        onChange={(n, o) => write(numeric ? v.mode : 'px', n, o.final)}
        onRawCommit={(raw) => {
          const t = raw.trim().toLowerCase();
          if (t === 'auto') return write('auto', null);
          if (t === 'fill') return write('fill', null);
          if (t === 'hug' || t === 'fit-content') return write('hug', null);
          const m = /^(-?\d*\.?\d+)(px|%|vw|vh)$/.exec(t);
          if (m) return write(m[2] as SizeMode, parseFloat(m[1]));
          setProp(scope, axis, raw.trim());
        }}
      />
      <Dropdown
        align="end"
        items={items}
        trigger={
          <button type="button" className="k-unit" aria-label={`${axis} sizing mode`} data-testid={`${axis}-mode`}>
            {mixed ? '–' : MODE_LABEL[v.mode]}
          </button>
        }
      />
    </div>
  );
}

// ─── 3×3 alignment grid ─────────────────────────────────────────────────────

const POS: AlignPos[] = ['start', 'center', 'end'];

export function AlignGrid({
  h,
  v,
  onPick,
  distribute,
  direction = 'row',
  ariaLabel = 'Alignment',
}: {
  h: AlignPos | null;
  v: AlignPos | null;
  onPick: (h: AlignPos, v: AlignPos) => void;
  /** main axis distributed (space-between…): whole line on the cross position is active */
  distribute?: 'h' | 'v' | null;
  direction?: 'row' | 'column';
  ariaLabel?: string;
}) {
  return (
    <div className="k-align" role="group" aria-label={ariaLabel} data-dir={direction}>
      {POS.map((row) =>
        POS.map((col) => {
          const active = distribute === 'h' ? row === v : distribute === 'v' ? col === h : row === v && col === h;
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              className="k-align__cell"
              data-active={active ? 'true' : undefined}
              aria-label={`Align ${row === 'start' ? 'top' : row === 'end' ? 'bottom' : 'middle'} ${col === 'start' ? 'left' : col === 'end' ? 'right' : 'center'}`}
              aria-pressed={active}
              onClick={() => onPick(col, row)}
            >
              <span className="k-align__mark" data-h={col} data-v={row} />
            </button>
          );
        }),
      )}
    </div>
  );
}

// ─── Scrubbable inline value (box model widget) ─────────────────────────────

export function ScrubValue({
  value,
  onChange,
  onRaw,
  ariaLabel,
  mixed,
  highlight,
  min,
}: {
  value: string;
  onChange: (n: number, final: boolean) => void;
  onRaw: (raw: string) => void;
  ariaLabel: string;
  mixed?: boolean;
  highlight?: boolean;
  min?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const su = splitUnit(value);
  const display = mixed ? '–' : value === '' ? '0' : su.n != null && (su.unit === 'px' || !su.unit) ? fmtNum(su.n) : value;
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing)
    return (
      <input
        ref={inputRef}
        className="k-scrub k-scrub--edit"
        aria-label={ariaLabel}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(display);
            setEditing(false);
          }
        }}
        onBlur={() => {
          setEditing(false);
          const t = text.trim();
          if (!t || t === display) return;
          const n = Number(t);
          if (Number.isFinite(n)) onChange(min != null ? Math.max(min, n) : n, true);
          else onRaw(t);
        }}
      />
    );

  return (
    <span
      className={clsx('k-scrub', highlight && 'k-scrub--hl')}
      role="spinbutton"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuetext={value || '0'}
      title="Drag to change · click to type"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          setText(display);
          setEditing(true);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          const n = (su.n ?? 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
          onChange(min != null ? Math.max(min, n) : n, true);
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const sx = e.clientX;
        const sy = e.clientY;
        const start = su.n ?? 0;
        let moved = false;
        let last = start;
        const move = (ev: PointerEvent) => {
          const d = ev.clientX - sx - (ev.clientY - sy);
          if (!moved && Math.abs(d) < 3) return;
          moved = true;
          const mult = ev.shiftKey ? 10 : 1;
          let n = Math.round(start + (d / 2) * mult);
          if (min != null) n = Math.max(min, n);
          if (n !== last) {
            last = n;
            onChange(n, false);
          }
        };
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          el.removeEventListener('pointercancel', up);
          if (moved) onChange(last, true);
          else {
            setText(display === '–' ? '' : display);
            setEditing(true);
          }
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
      }}
    >
      {display}
    </span>
  );
}

/** Small labelled sub-heading inside a section. */
export function SubHead({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="k-dp-sub">
      <span>{children}</span>
      {actions}
    </div>
  );
}
