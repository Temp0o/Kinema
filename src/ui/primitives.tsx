/**
 * Kinema UI primitives. Styled wrappers around Radix where accessibility matters
 * (menus, selects, dialogs, tooltips), lightweight custom components elsewhere.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Tooltip as RTooltip, Select as RSelect, ToggleGroup, Switch as RSwitch, Slider as RSlider, Dialog as RDialog, Popover as RPopover } from 'radix-ui';
import clsx from 'clsx';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';

// ─── Kbd ────────────────────────────────────────────────────────────────────

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Render a shortcut like "Mod+Shift+Z" → ⌘⇧Z / Ctrl Shift Z */
export function formatShortcut(s: string): string[] {
  return s.split('+').map((k) => {
    const key = k.trim();
    if (key === 'Mod') return isMac ? '⌘' : 'Ctrl';
    if (key === 'Shift') return isMac ? '⇧' : 'Shift';
    if (key === 'Alt') return isMac ? '⌥' : 'Alt';
    if (key === 'Del') return isMac ? '⌫' : 'Del';
    return key.length === 1 ? key.toUpperCase() : key;
  });
}

export function Kbd({ keys }: { keys: string }) {
  return (
    <span className="k-kbd">
      {formatShortcut(keys).map((k, i) => (
        <span key={i}>{k}</span>
      ))}
    </span>
  );
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={450} skipDelayDuration={250}>
      {children}
    </RTooltip.Provider>
  );
}

export function Tooltip({
  content,
  shortcut,
  side = 'top',
  children,
  disabled,
}: {
  content: ReactNode;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
  disabled?: boolean;
}) {
  if (disabled || !content) return <>{children}</>;
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content className="k-tooltip" side={side} sideOffset={6} collisionPadding={8}>
          <span>{content}</span>
          {shortcut && <Kbd keys={shortcut} />}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

// ─── Buttons ────────────────────────────────────────────────────────────────

type BtnVariant = 'default' | 'primary' | 'ghost' | 'outline' | 'danger' | 'ai';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', block, icon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={clsx('k-btn', variant !== 'default' && `k-btn--${variant}`, size !== 'md' && `k-btn--${size}`, block && 'k-btn--block', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="k-spinner" /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  shortcut?: string;
  active?: boolean;
  size?: 'sm' | 'md';
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  noTooltip?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, active, size = 'md', className, children, tooltipSide, noTooltip, ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      data-active={active ? 'true' : undefined}
      className={clsx('k-iconbtn', size === 'sm' && 'k-iconbtn--sm', className)}
      {...rest}
    >
      {children}
    </button>
  );
  return noTooltip ? (
    btn
  ) : (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      {btn}
    </Tooltip>
  );
});

// ─── Text input ─────────────────────────────────────────────────────────────

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange?: (v: string) => void;
  /** Called on Enter / blur with the final value. */
  onCommit?: (v: string) => void;
  icon?: ReactNode;
  suffix?: ReactNode;
  wrapClassName?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { value, onChange, onCommit, icon, suffix, wrapClassName, onKeyDown, onBlur, ...rest },
  ref,
) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);
  return (
    <label className={clsx('k-input', wrapClassName)}>
      {icon && <span className="k-input__icon">{icon}</span>}
      <input
        ref={ref}
        value={onCommit ? local : value}
        spellCheck={false}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setLocal(e.target.value);
          onChange?.(e.target.value);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && onCommit) {
            onCommit(local);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Escape') {
            setLocal(value);
            (e.target as HTMLInputElement).blur();
          }
          onKeyDown?.(e);
        }}
        onBlur={(e) => {
          focused.current = false;
          if (onCommit && local !== value) onCommit(local);
          onBlur?.(e);
        }}
        {...rest}
      />
      {suffix && <span className="k-input__suffix">{suffix}</span>}
    </label>
  );
});

export function TextArea({
  value,
  onCommit,
  onChange,
  rows = 3,
  placeholder,
  className,
  autoFocus,
  onKeyDown,
}: {
  value: string;
  onCommit?: (v: string) => void;
  onChange?: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);
  return (
    <label className={clsx('k-input k-input--area', className)}>
      <textarea
        rows={rows}
        value={local}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setLocal(e.target.value);
          onChange?.(e.target.value);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          onKeyDown?.(e);
        }}
        onBlur={() => {
          focused.current = false;
          if (onCommit && local !== value) onCommit(local);
        }}
      />
    </label>
  );
}

// ─── Number field with scrubbable label ─────────────────────────────────────

export interface NumberFieldProps {
  value: number | null;
  /** Shown when value is null (e.g. "Mixed", "Auto") */
  placeholder?: string;
  onChange: (v: number, opts: { final: boolean }) => void;
  label?: ReactNode;
  labelTitle?: string;
  min?: number;
  max?: number;
  step?: number;
  /** decimals to display */
  precision?: number;
  suffix?: string;
  className?: string;
  disabled?: boolean;
  mixed?: boolean;
  /** Called when the user types a non-numeric value (e.g. "auto", "50%"). */
  onRawCommit?: (raw: string) => void;
}

function clamp(v: number, min?: number, max?: number) {
  if (min != null && v < min) return min;
  if (max != null && v > max) return max;
  return v;
}

/**
 * Evaluate simple arithmetic typed into number fields ("12*2", "100/3+4").
 * Hand-written recursive-descent parser: no eval/Function (blocked by our CSP).
 */
export function evalMath(s: string): number | null {
  const src = s.replace(/\s+/g, '').replace(/px$/i, '');
  if (!src || !/^[-+*/().\d]+$/.test(src)) return null;
  let i = 0;
  const peek = () => src[i];
  const num = (): number => {
    const m = /^\d*\.?\d+(?:e[-+]?\d+)?|^\d+\./i.exec(src.slice(i));
    if (!m) throw new Error('num');
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const factor = (): number => {
    const c = peek();
    if (c === '-') { i++; return -factor(); }
    if (c === '+') { i++; return factor(); }
    if (c === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') throw new Error('paren');
      i++;
      return v;
    }
    return num();
  };
  const term = (): number => {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = src[i++];
      const r = factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = src[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  try {
    const v = expr();
    if (i !== src.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

export function NumberField({
  value,
  placeholder,
  onChange,
  label,
  labelTitle,
  min,
  max,
  step = 1,
  precision = 2,
  suffix,
  className,
  disabled,
  mixed,
  onRawCommit,
}: NumberFieldProps) {
  const fmt = useCallback(
    (v: number | null) => (v == null ? '' : String(Math.round(v * 10 ** precision) / 10 ** precision)),
    [precision],
  );
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
  }, [value, fmt]);

  const commit = (raw: string) => {
    const n = evalMath(raw);
    if (n != null) onChange(clamp(n, min, max), { final: true });
    else if (raw.trim() && onRawCommit) onRawCommit(raw.trim());
    else setText(fmt(value));
  };

  const onScrubStart = (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const start = value ?? 0;
    let last = start;
    let moved = false;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 2) return;
      moved = true;
      const mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      const next = clamp(Math.round((start + dx * step * mult) / (step * (ev.altKey ? 0.1 : 1))) * (step * (ev.altKey ? 0.1 : 1)), min, max);
      if (next !== last) {
        last = next;
        onChange(next, { final: false });
      }
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (moved) onChange(last, { final: true });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <label className={clsx('k-input k-num', className)} data-mixed={mixed ? 'true' : undefined} style={label ? undefined : { paddingLeft: 8 }}>
      {label != null && (
        <span className="k-num__label" title={labelTitle} onPointerDown={onScrubStart}>
          {label}
        </span>
      )}
      <input
        value={mixed ? '' : text}
        placeholder={mixed ? 'Mixed' : placeholder}
        disabled={disabled}
        inputMode="decimal"
        spellCheck={false}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            commit(text);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setText(fmt(value));
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const next = clamp((value ?? 0) + delta, min, max);
            setText(fmt(next));
            onChange(next, { final: true });
          }
        }}
        onBlur={() => {
          focused.current = false;
          if (text !== fmt(value)) commit(text);
        }}
      />
      {suffix && <span className="k-input__suffix">{suffix}</span>}
    </label>
  );
}

// ─── Select ─────────────────────────────────────────────────────────────────

export interface SelectOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Optional text shown next to label */
  hint?: ReactNode;
}

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
  ariaLabel,
  groups,
}: {
  value: T | '' | undefined;
  onChange: (v: T) => void;
  options?: SelectOption<T>[];
  groups?: { label: string; options: SelectOption<T>[] }[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const all = options ?? groups?.flatMap((g) => g.options) ?? [];
  const current = all.find((o) => o.value === value);
  const renderItem = (o: SelectOption<T>) => (
    <RSelect.Item key={o.value} value={o.value} disabled={o.disabled} className="k-menu__item">
      {o.icon && <span className="k-menu__icon">{o.icon}</span>}
      <RSelect.ItemText>{o.label}</RSelect.ItemText>
      {o.hint && <span className="k-kbd" style={{ marginLeft: 'auto', paddingLeft: 12 }}>{o.hint}</span>}
      <RSelect.ItemIndicator className="k-menu__check" style={o.hint ? { marginLeft: 6 } : undefined}>
        <Check />
      </RSelect.ItemIndicator>
    </RSelect.Item>
  );
  return (
    <RSelect.Root value={value || undefined} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
      <RSelect.Trigger className={clsx('k-select-trigger', className)} aria-label={ariaLabel}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {current?.icon}
          <RSelect.Value placeholder={<span className="k-muted">{placeholder ?? 'Select…'}</span>}>{current?.label}</RSelect.Value>
        </span>
        <RSelect.Icon>
          <ChevronDown />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content className="k-select-content" position="popper" sideOffset={4} collisionPadding={8}>
          <RSelect.Viewport style={{ padding: 0 }}>
            {groups
              ? groups.map((g, i) => (
                  <RSelect.Group key={g.label}>
                    {i > 0 && <RSelect.Separator className="k-menu__sep" />}
                    <RSelect.Label className="k-menu__label">{g.label}</RSelect.Label>
                    {g.options.map(renderItem)}
                  </RSelect.Group>
                ))
              : all.map(renderItem)}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}

// ─── Segmented control ──────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  allowEmpty,
}: {
  value: T | '';
  onChange: (v: T) => void;
  options: { value: T; label?: ReactNode; icon?: ReactNode; tooltip?: string }[];
  className?: string;
  allowEmpty?: boolean;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      className={clsx('k-seg', className)}
      value={value}
      onValueChange={(v) => {
        if (v || allowEmpty) onChange(v as T);
      }}
    >
      {options.map((o) => {
        const item = (
          <ToggleGroup.Item key={o.value} value={o.value} className="k-seg__item" aria-label={o.tooltip ?? String(o.value)}>
            {o.icon}
            {o.label}
          </ToggleGroup.Item>
        );
        // Wrap in a span so the tooltip trigger doesn't overwrite the item's data-state.
        return o.tooltip ? (
          <Tooltip key={o.value} content={o.tooltip}>
            <span className="k-seg__wrap">{item}</span>
          </Tooltip>
        ) : (
          item
        );
      })}
    </ToggleGroup.Root>
  );
}

// ─── Switch ─────────────────────────────────────────────────────────────────

export function Switch({ checked, onChange, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; ariaLabel?: string }) {
  return (
    <RSwitch.Root className="k-switch" checked={checked} onCheckedChange={onChange} aria-label={ariaLabel}>
      <RSwitch.Thumb className="k-switch__thumb" />
    </RSwitch.Root>
  );
}

// ─── Slider ─────────────────────────────────────────────────────────────────

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number, opts: { final: boolean }) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
}) {
  return (
    <RSlider.Root
      className="k-slider"
      value={[value]}
      min={min}
      max={max}
      step={step}
      onValueChange={(v) => onChange(v[0], { final: false })}
      onValueCommit={(v) => onChange(v[0], { final: true })}
      aria-label={ariaLabel}
    >
      <RSlider.Track className="k-slider__track">
        <RSlider.Range className="k-slider__range" />
      </RSlider.Track>
      <RSlider.Thumb className="k-slider__thumb" />
    </RSlider.Root>
  );
}

// ─── Popover ────────────────────────────────────────────────────────────────

export function Popover({
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  open,
  onOpenChange,
  className,
  width,
}: {
  trigger: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  className?: string;
  width?: number;
}) {
  return (
    <RPopover.Root open={open} onOpenChange={onOpenChange}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          className={clsx('k-popover', className)}
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={10}
          style={width ? { width } : undefined}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

// ─── Dialog ─────────────────────────────────────────────────────────────────

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width,
  icon,
  className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="k-dialog-overlay" />
        <RDialog.Content
          className={clsx('k-dialog k-app', className)}
          style={width ? { width: `min(${width}px, calc(100vw - 48px))` } : undefined}
          onKeyDown={(e) => e.stopPropagation()}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="k-dialog__head">
            {icon}
            <div style={{ flex: 1, minWidth: 0 }}>
              <RDialog.Title className="k-dialog__title">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="k-dialog__desc">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="k-sr-only">{typeof title === 'string' ? title : 'Dialog'}</RDialog.Description>
              )}
            </div>
            <RDialog.Close asChild>
              <IconButton label="Close" size="sm" noTooltip>
                <X />
              </IconButton>
            </RDialog.Close>
          </div>
          {children && <div className="k-dialog__body">{children}</div>}
          {footer && <div className="k-dialog__foot">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

// ─── Section (collapsible property group) ───────────────────────────────────

export function Section({
  title,
  actions,
  children,
  defaultCollapsed,
  collapsible = true,
  id,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  defaultCollapsed?: boolean;
  collapsible?: boolean;
  /** persist collapsed state by id */
  id?: string;
}) {
  const key = id ? `kinema.section.${id}` : null;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (key) {
      try {
        const v = localStorage.getItem(key);
        if (v != null) return v === '1';
      } catch {
        /* ignore */
      }
    }
    return !!defaultCollapsed;
  });
  const toggle = () => {
    if (!collapsible) return;
    setCollapsed((c) => {
      if (key) {
        try {
          localStorage.setItem(key, c ? '0' : '1');
        } catch {
          /* ignore */
        }
      }
      return !c;
    });
  };
  return (
    <section className="k-section" data-collapsed={collapsed ? 'true' : 'false'}>
      <div className="k-section__head">
        {collapsible && (
          <button type="button" className="k-iconbtn k-iconbtn--sm" onClick={toggle} aria-label={collapsed ? 'Expand' : 'Collapse'} style={{ marginLeft: -4 }}>
            <ChevronDown className="k-section__chev" />
          </button>
        )}
        <span className="k-section__title" onClick={toggle}>
          {title}
        </span>
        {actions}
      </div>
      {!collapsed && children}
    </section>
  );
}

export function Row({ label, children, overridden, title }: { label: ReactNode; children: ReactNode; overridden?: boolean; title?: string }) {
  return (
    <div className="k-row">
      <span className="k-row__label" data-overridden={overridden ? 'true' : undefined} title={title}>
        {label}
      </span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="k-empty">
      {icon && <div className="k-empty__icon">{icon}</div>}
      <div className="k-empty__title">{title}</div>
      {children && <div style={{ maxWidth: 260 }}>{children}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export { ChevronRight };
