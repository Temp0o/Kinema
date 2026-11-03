/**
 * Color picking UI shared across Kinema.
 *
 *  - `<ColorPicker value onChange />`  inline picker panel (SV area, hue/alpha,
 *    hex/rgb/hsl inputs, eyedropper, token / document / recent swatches)
 *  - `<ColorField value onChange label? />`  compact field: swatch + text, opens
 *    the picker in a popover
 *  - `<ColorSwatch value />`  a checkerboard-backed swatch
 *
 * Values are CSS color strings. Choosing a design token writes `var(--k-name)`;
 * `transparent` and `currentColor` are accepted. `onChange` receives
 * `{ final: false }` while dragging and `{ final: true }` when an edit completes.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Diamond, Pipette, X, Unlink } from 'lucide-react';
import clsx from 'clsx';
import { useDoc } from '@/core/store/docStore';
import { NumberField, Popover, Segmented, Tooltip } from '@/ui/primitives';
import {
  colorKey,
  collectDocColors,
  detectMode,
  formatColor,
  hsvaToCss,
  isColorValue,
  toColord,
  tokenNameOf,
  tokenVar,
  type ColorMode,
  type HsvaColor,
  type TokenLike,
} from './colorUtils';
import { pushRecentColor, useRecentColors } from './recent';
import { relPos, startDrag } from './drag';
import { colord } from 'colord';
import './color.css';

export type ColorChange = (value: string, opts: { final: boolean }) => void;

function useTokens(): TokenLike[] {
  return useDoc((s) => s.doc.tokens.colors);
}

/** Replace `var(--k-*)` references with token values so editor chrome can preview them. */
export function resolveTokenVars(css: string, tokens: TokenLike[]): string {
  if (!css || css.indexOf('var(') < 0) return css;
  return css.replace(/var\(\s*--k-([\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (m, name: string, fb?: string) => {
    const t = tokens.find((x) => x.name === name);
    if (t) return resolveTokenVars(t.value, tokens);
    return fb?.trim() || 'transparent';
  });
}

// ─── Swatch ─────────────────────────────────────────────────────────────────

export function ColorSwatch({ value, size = 16, className, mixed }: { value: string | null | undefined; size?: number; className?: string; mixed?: boolean }) {
  const tokens = useTokens();
  const v = (value ?? '').trim();
  const isCurrent = /^currentcolor$/i.test(v);
  let bg = 'transparent';
  if (!mixed && v && !isCurrent) {
    const c = toColord(v, tokens);
    bg = c ? c.toRgbString() : resolveTokenVars(v, tokens);
  }
  return (
    <span
      className={clsx('k-swatch', className)}
      data-empty={!v || mixed ? 'true' : undefined}
      data-current={isCurrent ? 'true' : undefined}
      data-mixed={mixed ? 'true' : undefined}
      style={{ width: size, height: size }}
    >
      <span className="k-swatch__fill" style={{ background: bg }} />
    </span>
  );
}

// ─── Picker ─────────────────────────────────────────────────────────────────

export interface ColorPickerProps {
  value: string | null | undefined;
  onChange: ColorChange;
  /** Show token / document / recent swatches (default true). */
  swatches?: boolean;
  /** Allow editing alpha (default true). */
  alpha?: boolean;
}

const DEFAULT_HSVA: HsvaColor = { h: 250, s: 64, v: 100, a: 1 };

function sameHsva(a: HsvaColor, b: HsvaColor) {
  return colord(a).toHex() === colord(b).toHex();
}

export function ColorPicker({ value, onChange, swatches = true, alpha = true }: ColorPickerProps) {
  const tokens = useTokens();
  const recent = useRecentColors();
  const docColors = useMemo(() => (swatches ? collectDocColors(useDoc.getState().doc, 16) : []), [swatches]);
  const parse = (v: string | null | undefined) => {
    const c = toColord(v, tokens);
    return c ? c.toHsv() : null;
  };
  const [hsva, setHsva] = useState<HsvaColor>(() => parse(value) ?? DEFAULT_HSVA);
  const [mode, setMode] = useState<ColorMode>(() => detectMode(value));
  const cur = useRef(hsva);
  cur.current = hsva;
  const last = useRef(value);

  // follow external value changes (undo, other fields) without losing hue on greys
  useEffect(() => {
    if (value === last.current) return;
    last.current = value;
    const p = parse(value);
    if (!p) return;
    setHsva((c) => (sameHsva(c, p) ? c : p.s === 0 || p.v === 0 ? { ...p, h: c.h } : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, tokens]);

  const emit = (next: HsvaColor, final: boolean) => {
    const n = alpha ? next : { ...next, a: 1 };
    cur.current = n;
    setHsva(n);
    const css = hsvaToCss(n, mode);
    last.current = css;
    onChange(css, { final });
    if (final) pushRecentColor(css);
  };

  const pick = (v: string) => {
    last.current = v;
    const p = parse(v);
    if (p) setHsva(p);
    onChange(v, { final: true });
    pushRecentColor(v);
  };

  const fromColord = (c: ReturnType<typeof colord>) => {
    if (!c.isValid()) return;
    const p = c.toHsv();
    emit(p.s === 0 || p.v === 0 ? { ...p, h: cur.current.h } : p, true);
  };

  const dragArea = (e: React.PointerEvent, fn: (x: number, y: number) => HsvaColor) => {
    const el = e.currentTarget as HTMLElement;
    const apply = (ev: { clientX: number; clientY: number }, final: boolean) => {
      const { x, y } = relPos(el, ev);
      emit(fn(x, y), final);
    };
    startDrag(e, (ev) => apply(ev, false), (ev) => apply(ev, true), { immediate: true });
  };

  const tokenName = tokenNameOf(value);
  const opaque = colord({ ...hsva, a: 1 }).toRgbString();
  const rgb = colord(hsva).toRgb();
  const hsl = colord(hsva).toHsl();
  const alphaPct = Math.round(hsva.a * 100);
  const EyeDropperCtor = typeof window !== 'undefined' ? (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper : undefined;
  const selectedKey = colorKey(value, tokens);

  const alphaField = alpha && (
    <NumberField
      value={alphaPct}
      min={0}
      max={100}
      precision={0}
      suffix="%"
      className="k-cp__alpha-input"
      onChange={(n, o) => emit({ ...cur.current, a: n / 100 }, o.final)}
    />
  );

  return (
    <div className="k-cp" onPointerDown={(e) => e.stopPropagation()}>
      {tokenName && (
        <div className="k-cp__token">
          <Diamond />
          <span>
            Token <b>{tokenName}</b>
          </span>
          <Tooltip content="Detach from token">
            <button type="button" className="k-iconbtn k-iconbtn--sm" aria-label="Detach from token" onClick={() => fromColord(colord(hsva))}>
              <Unlink />
            </button>
          </Tooltip>
        </div>
      )}
      <div
        className="k-cp__sv"
        style={{ backgroundColor: `hsl(${hsva.h} 100% 50%)` }}
        onPointerDown={(e) => dragArea(e, (x, y) => ({ ...cur.current, s: x * 100, v: (1 - y) * 100 }))}
        data-testid="cp-sv"
      >
        <span className="k-cp__sv-thumb" style={{ left: `${hsva.s}%`, top: `${100 - hsva.v}%`, background: opaque }} />
      </div>
      <div className="k-cp__sliders">
        {EyeDropperCtor && (
          <Tooltip content="Pick from screen">
            <button
              type="button"
              className="k-iconbtn"
              aria-label="Eyedropper"
              onClick={async () => {
                try {
                  const r = await new EyeDropperCtor().open();
                  fromColord(colord(r.sRGBHex));
                } catch {
                  /* cancelled */
                }
              }}
            >
              <Pipette />
            </button>
          </Tooltip>
        )}
        <div className="k-cp__bars">
          <div className="k-cp__hue" onPointerDown={(e) => dragArea(e, (x) => ({ ...cur.current, h: x * 360 }))} data-testid="cp-hue">
            <span className="k-cp__bar-thumb" style={{ left: `${(hsva.h / 360) * 100}%`, background: `hsl(${hsva.h} 100% 50%)` }} />
          </div>
          {alpha && (
            <div className="k-cp__alpha" onPointerDown={(e) => dragArea(e, (x) => ({ ...cur.current, a: Math.round(x * 100) / 100 }))} data-testid="cp-alpha">
              <span className="k-cp__alpha-grad" style={{ background: `linear-gradient(90deg, transparent, ${opaque})` }} />
              <span className="k-cp__bar-thumb" style={{ left: `${hsva.a * 100}%`, background: colord(hsva).toRgbString() }} />
            </div>
          )}
        </div>
      </div>
      <Segmented
        className="k-cp__modes"
        value={mode}
        onChange={(m) => setMode(m)}
        options={[
          { value: 'hex', label: 'HEX' },
          { value: 'rgb', label: 'RGB' },
          { value: 'hsl', label: 'HSL' },
        ]}
      />
      <div className="k-cp__inputs" data-mode={mode}>
        {mode === 'hex' && (
          <>
            <HexInput
              value={colord({ ...hsva, a: 1 }).toHex()}
              onCommit={(raw) => {
                const c = colord(raw.startsWith('#') ? raw : `#${raw}`);
                if (c.isValid()) fromColord(alpha && c.alpha() === 1 ? c.alpha(hsva.a) : c);
              }}
            />
            {alphaField}
          </>
        )}
        {mode === 'rgb' && (
          <>
            {(['r', 'g', 'b'] as const).map((k) => (
              <NumberField key={k} label={k.toUpperCase()} value={rgb[k]} min={0} max={255} precision={0} onChange={(n) => fromColord(colord({ ...rgb, [k]: n }))} />
            ))}
            {alphaField}
          </>
        )}
        {mode === 'hsl' && (
          <>
            {(['h', 's', 'l'] as const).map((k) => (
              <NumberField
                key={k}
                label={k.toUpperCase()}
                value={hsl[k]}
                min={0}
                max={k === 'h' ? 360 : 100}
                precision={0}
                onChange={(n) => fromColord(colord({ ...hsl, [k]: n }))}
              />
            ))}
            {alphaField}
          </>
        )}
      </div>
      {swatches && (
        <div className="k-cp__swatches">
          {tokens.length > 0 && (
            <SwatchGroup title="Tokens">
              {tokens.map((t) => (
                <SwatchButton
                  key={t.name}
                  value={tokenVar(t.name)}
                  label={`${t.name} · ${t.value}`}
                  selected={tokenName === t.name}
                  token
                  onPick={pick}
                />
              ))}
            </SwatchGroup>
          )}
          {docColors.length > 0 && (
            <SwatchGroup title="In this document">
              {docColors.map((c) => (
                <SwatchButton key={c} value={c} label={c} selected={!tokenName && selectedKey === c} onPick={pick} />
              ))}
            </SwatchGroup>
          )}
          {recent.length > 0 && (
            <SwatchGroup title="Recent">
              {recent.map((c) => (
                <SwatchButton key={c} value={c} label={c} selected={value === c} onPick={pick} token={!!tokenNameOf(c)} />
              ))}
            </SwatchGroup>
          )}
          <SwatchGroup title="Special">
            <SwatchButton value="transparent" label="transparent" selected={value === 'transparent'} onPick={pick} />
            <SwatchButton value="currentColor" label="currentColor (inherit text color)" selected={/^currentcolor$/i.test(value ?? '')} onPick={pick} />
          </SwatchGroup>
        </div>
      )}
    </div>
  );
}

function HexInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  return (
    <label className="k-input k-cp__hex">
      <span className="k-input__suffix">#</span>
      <input
        value={text.replace(/^#/, '')}
        spellCheck={false}
        aria-label="Hex color"
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(value);
            cancelled.current = true;
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => {
          focused.current = false;
          if (cancelled.current) {
            cancelled.current = false;
            return;
          }
          if (text.replace(/^#/, '').toLowerCase() !== value.replace(/^#/, '').toLowerCase()) onCommit(text.trim());
        }}
      />
    </label>
  );
}

function SwatchGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="k-cp__group">
      <div className="k-cp__group-title">{title}</div>
      <div className="k-cp__grid">{children}</div>
    </div>
  );
}

function SwatchButton({ value, label, selected, onPick, token }: { value: string; label: string; selected?: boolean; onPick: (v: string) => void; token?: boolean }) {
  return (
    <Tooltip content={label}>
      <button type="button" className="k-cp__sw" data-selected={selected ? 'true' : undefined} data-token={token ? 'true' : undefined} aria-label={label} onClick={() => onPick(value)}>
        <ColorSwatch value={value} size={18} />
      </button>
    </Tooltip>
  );
}

// ─── Field ──────────────────────────────────────────────────────────────────

export interface ColorFieldProps {
  value: string | null | undefined;
  onChange: ColorChange;
  /** Optional leading label (e.g. "Fill"). */
  label?: ReactNode;
  placeholder?: string;
  mixed?: boolean;
  disabled?: boolean;
  /** Shows a clear (×) button when set and a value exists. */
  onClear?: () => void;
  className?: string;
  /** Popover side (default 'left', suited to the right-hand panel). */
  side?: 'top' | 'bottom' | 'left' | 'right';
  ariaLabel?: string;
  /** Picker options */
  alpha?: boolean;
  swatches?: boolean;
}

export function ColorField({
  value,
  onChange,
  label,
  placeholder = 'None',
  mixed,
  disabled,
  onClear,
  className,
  side = 'left',
  ariaLabel,
  alpha,
  swatches,
}: ColorFieldProps) {
  const tokens = useTokens();
  const tok = tokenNameOf(value);
  const display = mixed ? '' : tok ?? value ?? '';
  const [text, setText] = useState(display);
  const [open, setOpen] = useState(false);
  const focused = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(display);
  }, [display]);

  const commit = (raw: string) => {
    const t = raw.trim();
    if (t === display) return;
    if (!t) {
      if (onClear) onClear();
      else setText(display);
      return;
    }
    const asTok = tokens.find((x) => x.name === t || `--k-${x.name}` === t || tokenVar(x.name) === t);
    if (asTok) return onChange(tokenVar(asTok.name), { final: true });
    if (isColorValue(t)) {
      const c = /^[0-9a-f]{3,8}$/i.test(t) ? `#${t}` : t;
      onChange(c, { final: true });
      pushRecentColor(c);
      return;
    }
    if (/^[0-9a-f]{3,8}$/i.test(t) && toColord(`#${t}`)) return onChange(`#${t}`, { final: true });
    setText(display);
  };

  const resolved = tok ? toColord(value, tokens) : null;

  return (
    <div className={clsx('k-input k-colorfield', className)} data-mixed={mixed ? 'true' : undefined} data-disabled={disabled ? 'true' : undefined}>
      {label != null && <span className="k-colorfield__label">{label}</span>}
      <Popover
        open={open && !disabled}
        onOpenChange={setOpen}
        side={side}
        align="start"
        width={252}
        className="k-cp-popover"
        trigger={
          <button type="button" className="k-colorfield__swatch" aria-label={ariaLabel ? `${ariaLabel}: pick color` : 'Pick color'} disabled={disabled}>
            <ColorSwatch value={value} mixed={mixed} />
          </button>
        }
      >
        <ColorPicker value={value} onChange={onChange} alpha={alpha} swatches={swatches} />
      </Popover>
      {tok && (
        <Tooltip content={resolved ? `Token · ${formatColor(resolved)}` : 'Token'}>
          <span className="k-colorfield__tok">
            <Diamond />
          </span>
        </Tooltip>
      )}
      <input
        value={text}
        placeholder={mixed ? 'Mixed' : placeholder}
        disabled={disabled}
        spellCheck={false}
        aria-label={ariaLabel ?? 'Color value'}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(display);
            cancelled.current = true;
            (e.target as HTMLInputElement).blur();
          }
        }}
        onBlur={() => {
          focused.current = false;
          if (cancelled.current) {
            cancelled.current = false;
            return;
          }
          commit(text);
        }}
      />
      {onClear && !!value && !mixed && !disabled && (
        <button type="button" className="k-colorfield__clear" aria-label="Clear color" onClick={onClear}>
          <X />
        </button>
      )}
    </div>
  );
}
