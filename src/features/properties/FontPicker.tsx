import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useDoc } from '@/core/store/docStore';
import { BUNDLED_FONTS, SYSTEM_FONTS, findBundledFont } from '@/core/fonts/designFonts';
import { fontStack } from '@/core/style/style';
import type { DesignTokens, KAsset } from '@/core/model/types';
import { Popover } from '@/ui/primitives';

export interface FontOption {
  /** CSS value written to font-family */
  value: string;
  /** family name for preview */
  family: string;
  label: string;
  group: 'Tokens' | 'Project fonts' | 'Bundled' | 'System';
}

/** First family name of a font-family value (quotes stripped). */
export function primaryFamily(value: string | undefined): string {
  return (value ?? '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
}

export function tokenFontKey(value: string | undefined): 'heading' | 'body' | 'mono' | null {
  const m = /^var\(\s*--k-font-(heading|body|mono)\s*\)/.exec((value ?? '').trim());
  return m ? (m[1] as 'heading' | 'body' | 'mono') : null;
}

export function fontOptions(tokens: DesignTokens, assets: Record<string, KAsset>, withTokens: boolean): FontOption[] {
  const out: FontOption[] = [];
  if (withTokens)
    for (const k of ['heading', 'body', 'mono'] as const)
      out.push({ value: `var(--k-font-${k})`, family: tokens.fonts[k], label: `${k[0].toUpperCase()}${k.slice(1)} · ${tokens.fonts[k].replace(/ Variable$/, '')}`, group: 'Tokens' });
  const seen = new Set<string>();
  for (const a of Object.values(assets))
    if (a.kind === 'font' && a.fontFamily && !seen.has(a.fontFamily)) {
      seen.add(a.fontFamily);
      out.push({ value: fontStack(a.fontFamily), family: a.fontFamily, label: a.fontFamily, group: 'Project fonts' });
    }
  for (const f of BUNDLED_FONTS) out.push({ value: fontStack(f.family), family: f.family, label: f.family.replace(/ Variable$/, ''), group: 'Bundled' });
  for (const f of SYSTEM_FONTS) out.push({ value: /\s/.test(f.family) ? `'${f.family}', sans-serif` : `${f.family}, sans-serif`, family: f.family, label: f.family, group: 'System' });
  return out;
}

const ALL_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
export const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' };

function weightsOf(spec: string): number[] {
  const [a, b] = spec.trim().split(/\s+/).map((x) => parseInt(x, 10));
  if (!Number.isFinite(a)) return [];
  if (!Number.isFinite(b)) return [a];
  return ALL_WEIGHTS.filter((w) => w >= a && w <= b);
}

/** Weights a font family supports (all standard weights when unknown). */
export function supportedWeights(value: string | undefined, tokens: DesignTokens, assets: Record<string, KAsset>): number[] {
  const tk = tokenFontKey(value);
  const family = tk ? tokens.fonts[tk] : primaryFamily(value);
  const bundled = findBundledFont(family);
  if (bundled) return [...new Set(bundled.files.filter((f) => f.style === 'normal').flatMap((f) => weightsOf(f.weight)))].sort((a, b) => a - b);
  const files = Object.values(assets).filter((a) => a.kind === 'font' && a.fontFamily === family);
  if (files.length) {
    const ws = [...new Set(files.flatMap((f) => weightsOf(f.fontWeight ?? '100 900')))].sort((a, b) => a - b);
    if (ws.length) return ws;
  }
  return ALL_WEIGHTS;
}

export function FontPicker({
  value,
  onChange,
  mixed,
  withTokens = true,
  ariaLabel = 'Font family',
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  mixed?: boolean;
  withTokens?: boolean;
  ariaLabel?: string;
}) {
  const tokens = useDoc((s) => s.doc.tokens);
  const assets = useDoc((s) => s.doc.assets);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const options = useMemo(() => fontOptions(tokens, assets, withTokens), [tokens, assets, withTokens]);
  const tk = tokenFontKey(value);
  const fam = primaryFamily(value);
  const current = tk ? options.find((o) => o.value === `var(--k-font-${tk})`) : options.find((o) => o.family.toLowerCase() === fam.toLowerCase());
  const label = mixed ? 'Mixed' : current ? current.label : fam || 'Inherit';
  const filtered = options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));
  const groups = ['Tokens', 'Project fonts', 'Bundled', 'System'] as const;
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQ('');
      }}
      side="left"
      align="start"
      width={240}
      className="k-fontpop"
      trigger={
        <button type="button" className="k-select-trigger" aria-label={ariaLabel} data-testid="font-picker">
          <span style={{ fontFamily: current ? fontStack(current.family) : undefined }}>{label}</span>
          <ChevronDown />
        </button>
      }
    >
      <label className="k-input k-fontpop__search">
        <span className="k-input__icon">
          <Search />
        </span>
        <input autoFocus value={q} placeholder="Search fonts" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      <div className="k-fontpop__list" role="listbox" aria-label="Fonts">
        {groups.map((g) => {
          const items = filtered.filter((o) => o.group === g);
          if (!items.length) return null;
          return (
            <div key={g}>
              <div className="k-menu__label">{g}</div>
              {items.map((o) => {
                const sel = !mixed && current?.value === o.value;
                return (
                  <button
                    key={o.value + o.label}
                    type="button"
                    role="option"
                    aria-selected={sel}
                    className="k-fontpop__item"
                    style={{ fontFamily: fontStack(o.family) }}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                  >
                    <span>{o.label}</span>
                    {sel && <Check />}
                  </button>
                );
              })}
            </div>
          );
        })}
        {!filtered.length && <div className="k-hint" style={{ padding: 8 }}>No fonts match.</div>}
      </div>
    </Popover>
  );
}
