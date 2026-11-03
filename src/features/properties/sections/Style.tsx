import { useEffect, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Ban,
  Blend,
  CaseLower,
  CaseSensitive,
  CaseUpper,
  CircleDot,
  Droplet,
  Image,
  Italic,
  Link2,
  Link2Off,
  Minus,
  Plus,
  Strikethrough,
  Underline,
  X,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import type { KNode } from '@/core/model/types';
import { useDoc } from '@/core/store/docStore';
import { EASINGS } from '@/core/anim/compile';
import { Button, IconButton, NumberField, Row, Section, Segmented, Select, Slider, TextArea, TextInput } from '@/ui/primitives';
import { Dropdown } from '@/ui/menu';
import { ColorField } from '@/ui/color/ColorPicker';
import { GradientEditor } from '@/ui/color/GradientEditor';
import { ShadowEditor } from '@/ui/color/ShadowEditor';
import { defaultGradient, type GradientType } from '@/ui/color/gradient';
import { fmtNum } from '@/ui/color/cssValue';
import { FontPicker, supportedWeights, WEIGHT_NAMES } from '../FontPicker';
import { AlignGrid, LengthField, PropRow, SubHead, STATE_LABELS } from '../controls';
import { applyPatch, offValue, readDerived, readProp, setProp, type Scope } from '../scope';
import { fillPatch, parseFill, BG_PROPS, unwrapUrl, type FillModel, type FillType } from '../lib/background';
import { BORDER_PROPS, BORDER_STYLES, borderPatch, radiusPatch, readBorder, readRadius, summarizeBorder, CORNERS, type Quad } from '../lib/box';
import { FILTER_DEFS, filterDef, getFilterValue, isSimpleTransform, parseFilters, parseTransition, readScaleTranslate, serializeFilters, serializeTransition, setFilterValue, TRANSITION_PRESETS, transitionPresetOf, type TransitionModel } from '../lib/effects';
import { AssetPicker, posToCss } from './Content';
import type { AlignPos } from '../lib/layout';

const TEXTUAL = new Set(['text', 'button', 'link', 'input', 'textarea', 'select']);

// ─── Typography ─────────────────────────────────────────────────────────────

export function TypographySection({ scope }: { scope: Scope }) {
  const tokens = useDoc((s) => s.doc.tokens);
  const assets = useDoc((s) => s.doc.assets);
  const textual = scope.nodes.every((n) => TEXTUAL.has(n.type));
  const family = readProp(scope, 'font-family');
  const weight = readProp(scope, 'font-weight');
  const color = readProp(scope, 'color');
  const align = readProp(scope, 'text-align');
  const deco = readDerived(scope, (m) => {
    const d = m['text-decoration-line'] ?? m['text-decoration'] ?? 'none';
    return d.includes('underline') ? 'underline' : d.includes('line-through') ? 'line-through' : 'none';
  });
  const transform = readProp(scope, 'text-transform');
  const italic = readDerived(scope, (m) => m['font-style'] === 'italic');
  const wrap = readDerived(scope, (m) => {
    if (m['text-overflow'] === 'ellipsis') return 'truncate';
    if (m['white-space'] === 'nowrap') return 'nowrap';
    if (m['white-space'] === 'pre-wrap' || m['white-space'] === 'pre') return 'pre';
    if (m['text-wrap'] === 'balance' || m['text-wrap-style'] === 'balance') return 'balance';
    if (m['text-wrap'] === 'pretty') return 'pretty';
    return 'normal';
  });
  const weights = supportedWeights(family.value, tokens, assets);
  const wv = weight.value === 'bold' ? '700' : weight.value === 'normal' ? '400' : weight.value ?? '400';
  const state = scope.state;

  const colorRow = (
    <PropRow scope={scope} props={['color']} label="Color">
      <ColorField value={color.value ?? ''} placeholder="Inherit" mixed={color.mixed} onChange={(v, o) => setProp(scope, 'color', v, { final: o?.final })} onClear={() => setProp(scope, 'color', null)} ariaLabel="Text color" />
    </PropRow>
  );
  const decoRow = (
    <PropRow scope={scope} props={['text-decoration', 'text-decoration-line', 'font-style']} label="Style">
      <div className="k-hstack">
        <Segmented
          value={deco.mixed ? '' : deco.value}
          onChange={(v) => applyPatch(scope, { 'text-decoration': v === 'none' ? offValue(scope, 'none') : v, 'text-decoration-line': null })}
          options={[
            { value: 'none', icon: <Minus />, tooltip: 'No decoration' },
            { value: 'underline', icon: <Underline />, tooltip: 'Underline' },
            { value: 'line-through', icon: <Strikethrough />, tooltip: 'Strikethrough' },
          ]}
        />
        {!state && (
          <IconButton label="Italic" size="sm" active={!italic.mixed && italic.value} onClick={() => setProp(scope, 'font-style', italic.value ? offValue(scope, 'normal') : 'italic')}>
            <Italic />
          </IconButton>
        )}
      </div>
    </PropRow>
  );

  if (state)
    return (
      <Section title="Text" id="dp-typo-state">
        {colorRow}
        {decoRow}
      </Section>
    );

  return (
    <Section title="Typography" id={textual ? 'dp-typo' : 'dp-typo-container'} defaultCollapsed={!textual}>
      <PropRow scope={scope} props={['font-family']} label="Font">
        <FontPicker value={family.value} mixed={family.mixed} onChange={(v) => setProp(scope, 'font-family', v)} />
      </PropRow>
      <PropRow scope={scope} props={['font-weight', 'font-size']} label="Weight / size">
        <div className="k-grid2">
          <Select
            value={weight.mixed ? '' : wv}
            placeholder="Mixed"
            ariaLabel="Font weight"
            onChange={(v) => setProp(scope, 'font-weight', v)}
            options={[...new Set([...weights, ...(weights.includes(Number(wv)) ? [] : [Number(wv)])])].filter(Number.isFinite).sort((a, b) => a - b).map((w) => ({ value: String(w), label: `${w} ${WEIGHT_NAMES[w] ?? ''}`.trim() }))}
          />
          <LengthField scope={scope} prop="font-size" label="Aa" labelTitle="Font size" min={1} placeholder="16" />
        </div>
      </PropRow>
      <PropRow scope={scope} props={['line-height', 'letter-spacing']} label="Line / letter">
        <div className="k-grid2">
          <LengthField scope={scope} prop="line-height" unit="" label="↕" labelTitle="Line height" step={0.05} placeholder="1.5" min={0} />
          <LengthField scope={scope} prop="letter-spacing" label="↔" labelTitle="Letter spacing" step={0.1} placeholder="0" />
        </div>
      </PropRow>
      {colorRow}
      <PropRow scope={scope} props={['text-align']} label="Align">
        <Segmented
          value={align.mixed ? '' : (align.value === 'start' ? 'left' : align.value === 'end' ? 'right' : align.value) ?? 'left'}
          onChange={(v) => setProp(scope, 'text-align', v)}
          options={[
            { value: 'left', icon: <AlignLeft />, tooltip: 'Left' },
            { value: 'center', icon: <AlignCenter />, tooltip: 'Center' },
            { value: 'right', icon: <AlignRight />, tooltip: 'Right' },
            { value: 'justify', icon: <AlignJustify />, tooltip: 'Justify' },
          ]}
        />
      </PropRow>
      {decoRow}
      <PropRow scope={scope} props={['text-transform']} label="Case">
        <Segmented
          value={transform.mixed ? '' : transform.value ?? 'none'}
          onChange={(v) => setProp(scope, 'text-transform', v === 'none' ? offValue(scope, 'none') : v)}
          options={[
            { value: 'none', icon: <Minus />, tooltip: 'As typed' },
            { value: 'uppercase', icon: <CaseUpper />, tooltip: 'UPPERCASE' },
            { value: 'lowercase', icon: <CaseLower />, tooltip: 'lowercase' },
            { value: 'capitalize', icon: <CaseSensitive />, tooltip: 'Capitalize' },
          ]}
        />
      </PropRow>
      <PropRow scope={scope} props={['white-space', 'text-wrap', 'text-overflow']} label="Wrap">
        <Select
          value={wrap.mixed ? '' : wrap.value}
          placeholder="Mixed"
          onChange={(v) => {
            const off = { 'white-space': offValue(scope, 'normal'), 'text-wrap': offValue(scope, 'wrap'), 'text-overflow': null, overflow: null } as Record<string, string | null>;
            if (v === 'nowrap') off['white-space'] = 'nowrap';
            if (v === 'pre') off['white-space'] = 'pre-wrap';
            if (v === 'balance' || v === 'pretty') off['text-wrap'] = v;
            if (v === 'truncate') Object.assign(off, { 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden' });
            applyPatch(scope, off, { label: 'Text wrap' });
          }}
          options={[
            { value: 'normal', label: 'Normal' },
            { value: 'balance', label: 'Balance lines' },
            { value: 'pretty', label: 'Pretty (no orphans)' },
            { value: 'nowrap', label: 'No wrap' },
            { value: 'pre', label: 'Preserve spaces' },
            { value: 'truncate', label: 'Truncate …' },
          ]}
        />
      </PropRow>
      <SubHead>Text shadow</SubHead>
      <ShadowEditorRow scope={scope} prop="text-shadow" text />
    </Section>
  );
}

function ShadowEditorRow({ scope, prop, text }: { scope: Scope; prop: string; text?: boolean }) {
  const info = readProp(scope, prop);
  return <ShadowEditor value={info.value} mixed={info.mixed} text={text} onChange={(v, o) => setProp(scope, prop, v ?? offValue(scope, 'none'), { final: o.final })} />;
}

// ─── Fill ───────────────────────────────────────────────────────────────────

const FILL_TYPES: { value: FillType; icon: React.ReactNode; tooltip: string }[] = [
  { value: 'none', icon: <Ban />, tooltip: 'No fill' },
  { value: 'solid', icon: <Droplet />, tooltip: 'Solid color' },
  { value: 'linear', icon: <Blend />, tooltip: 'Linear gradient' },
  { value: 'radial', icon: <CircleDot />, tooltip: 'Radial gradient' },
  { value: 'image', icon: <Image />, tooltip: 'Image' },
];

function convertFill(f: FillModel, to: FillType, firstAsset: string | null): FillModel {
  const base = f.gradient?.stops[0]?.color ?? f.color ?? '#7c5cff';
  switch (to) {
    case 'none':
      return { ...f, type: 'none', color: null };
    case 'solid':
      return { ...f, type: 'solid', color: f.type === 'solid' ? f.color : base };
    case 'linear':
    case 'radial':
    case 'conic': {
      const g = f.gradient ? { ...f.gradient, type: to as GradientType } : defaultGradient(to as GradientType, f.color && f.type === 'solid' ? f.color : '#7c5cff', '#22d3ee');
      if (to === 'radial' && !g.shape) g.shape = 'circle';
      return { ...f, type: to, gradient: g, color: f.type === 'solid' ? null : f.color };
    }
    case 'image':
      return { ...f, type: 'image', color: f.type === 'solid' ? null : f.color, image: f.image ?? { url: firstAsset ?? '', size: 'cover', position: 'center', repeat: 'no-repeat' } };
    default:
      return f;
  }
}

export function FillEditor({ scope }: { scope: Scope }) {
  const fill = readDerived(scope, parseFill);
  const assets = useDoc((s) => s.doc.assets);
  const [pending, setPending] = useState<FillType | null>(null);
  useEffect(() => setPending(null), [fill.value.type]);
  const explicit = !scope.isBase || !!scope.state;
  const f = fill.value;
  const type = pending ?? (fill.mixed ? null : f.type);

  const update = (fn: (f: FillModel) => FillModel, final = true) => applyPatch(scope, (m) => fillPatch(fn(parseFill(m)), explicit), { final, label: 'Change fill' });
  const firstImage = Object.values(assets).find((a) => a.kind === 'image' || a.kind === 'svg');

  const setType = (t: FillType) => {
    if (t === 'image' && f.type !== 'image' && !firstImage) {
      setPending('image');
      return;
    }
    setPending(null);
    update((x) => convertFill(x, t, firstImage ? `asset:${firstImage.id}` : null));
  };

  const img = f.image ?? { url: '', size: 'cover', position: 'center', repeat: 'no-repeat' };
  const setImg = (patch: Partial<typeof img>) => update((x) => ({ ...x, type: 'image', image: { ...(x.image ?? img), ...patch } }));
  const posA = (() => {
    const t = img.position.toLowerCase();
    const h: AlignPos = /left|^0%/.test(t) ? 'start' : /right|^100%/.test(t) ? 'end' : 'center';
    const v: AlignPos = /top|\s0%$/.test(t) ? 'start' : /bottom|\s100%$/.test(t) ? 'end' : 'center';
    return { h, v };
  })();

  return (
    <div className="k-stack" data-testid="fill-editor">
      <PropRow scope={scope} props={[...BG_PROPS]} label="Type">
        <Segmented value={type ?? ''} onChange={setType} options={FILL_TYPES.map((o) => ({ ...o, value: o.value }))} />
      </PropRow>
      {fill.mixed && !pending && <div className="k-hint">Mixed fills — choose a type to apply one fill to all.</div>}
      {type === 'solid' && (
        <ColorField value={f.color ?? ''} onChange={(v, o) => update((x) => ({ ...x, type: 'solid', color: v }), o?.final ?? true)} ariaLabel="Fill color" />
      )}
      {(type === 'linear' || type === 'radial' || type === 'conic') && f.gradient && (
        <>
          <GradientEditor value={f.gradient} onChange={(g, o) => update((x) => ({ ...x, type: g.type, gradient: g }), o.final)} />
          <Row label="Base">
            <ColorField value={f.color ?? ''} placeholder="None" onChange={(v, o) => update((x) => ({ ...x, color: v }), o?.final ?? true)} onClear={() => update((x) => ({ ...x, color: null }))} ariaLabel="Base color" />
          </Row>
        </>
      )}
      {type === 'image' && (
        <>
          <AssetPicker kinds={['image', 'svg']} value={img.url} onPick={(ref) => setImg({ url: ref })} />
          <Row label="URL">
            <TextInput value={img.url.startsWith('asset:') ? assets[img.url.slice(6)]?.name ?? img.url : img.url} placeholder="https://…" onCommit={(v) => v.trim() && setImg({ url: unwrapUrl(v.trim()) ?? v.trim() })} />
          </Row>
          {f.type === 'image' && (
            <>
              <Row label="Size">
                <Select value={['cover', 'contain', 'auto'].includes(img.size) ? img.size : img.size} onChange={(v) => setImg({ size: v })} options={[...new Set(['cover', 'contain', 'auto', img.size])].map((s) => ({ value: s, label: s }))} />
              </Row>
              <Row label="Position">
                <AlignGrid h={posA.h} v={posA.v} onPick={(h, v) => setImg({ position: posToCss(h, v) })} ariaLabel="Background position" />
              </Row>
              <Row label="Repeat">
                <Select value={img.repeat} onChange={(v) => setImg({ repeat: v })} options={[...new Set(['no-repeat', 'repeat', 'repeat-x', 'repeat-y', 'space', 'round', img.repeat])].map((s) => ({ value: s, label: s }))} />
              </Row>
              <Row label="Base">
                <ColorField value={f.color ?? ''} placeholder="None" onChange={(v, o) => update((x) => ({ ...x, color: v }), o?.final ?? true)} onClear={() => update((x) => ({ ...x, color: null }))} ariaLabel="Base color" />
              </Row>
            </>
          )}
        </>
      )}
      {type === 'raw' && f.raw && (
        <div className="k-stack">
          <span className="k-hint">This background uses CSS the visual editor can’t represent (e.g. several layers). Edit it directly:</span>
          <TextArea
            value={f.raw.value}
            rows={3}
            className="k-mono-input"
            onCommit={(v) => update((x) => (v.trim() ? { ...x, type: 'raw', raw: { prop: f.raw!.prop, value: v.trim() } } : { ...x, type: 'none', raw: null }))}
          />
        </div>
      )}
    </div>
  );
}

export function FillSection({ scope }: { scope: Scope }) {
  return (
    <Section title={scope.state ? `Fill · ${STATE_LABELS[scope.state]}` : 'Fill'} id="dp-fill">
      <FillEditor scope={scope} />
    </Section>
  );
}

// ─── Border & radius ────────────────────────────────────────────────────────

export function BorderSection({ scope }: { scope: Scope }) {
  const border = readDerived(scope, (m) => summarizeBorder(readBorder(m)));
  const raw = readDerived(scope, (m) => readBorder(m).raw);
  const [individual, setIndividual] = useState(() => !!border.value && !border.value.widths.every((w) => w === border.value!.widths[0]));
  const radius = readDerived(scope, readRadius);
  const [corners, setCorners] = useState(() => !radius.value.every((r) => r === radius.value[0]));
  const isFormField = scope.nodes.some((n) => n.type === 'input' || n.type === 'textarea' || n.type === 'select');
  const explicitNone = !scope.isBase || !!scope.state || isFormField;
  const b = border.value;

  const writeBorder = (fn: (cur: NonNullable<typeof b>) => NonNullable<typeof b> | null, final = true) =>
    applyPatch(
      scope,
      (m) => {
        const cur = summarizeBorder(readBorder(m)) ?? { widths: [1, 1, 1, 1] as [number, number, number, number], style: 'solid', color: '#d4d6e4' };
        return borderPatch(fn(cur), explicitNone);
      },
      { final, label: 'Change border' },
    );

  const radiusNum = (v: string) => (v ? parseFloat(v) : 0);
  const writeRadius = (q: Quad, final: boolean) => applyPatch(scope, radiusPatch(q), { final, label: 'Change radius' });

  return (
    <Section
      title={scope.state ? `Border · ${STATE_LABELS[scope.state]}` : 'Border & radius'}
      id="dp-border"
      actions={
        b ? (
          <IconButton label="Remove border" size="sm" onClick={() => writeBorder(() => null)}>
            <Minus />
          </IconButton>
        ) : (
          <IconButton label="Add border" size="sm" onClick={() => writeBorder(() => ({ widths: [1, 1, 1, 1], style: 'solid', color: '#d4d6e4' }))}>
            <Plus />
          </IconButton>
        )
      }
    >
      {raw.value && !b && <div className="k-hint">Unrecognized border CSS: {raw.value}</div>}
      {b && (
        <>
          <PropRow scope={scope} props={BORDER_PROPS} label="Color">
            <ColorField value={border.mixed ? '' : b.color} mixed={border.mixed} onChange={(v, o) => writeBorder((c) => ({ ...c, color: v }), o?.final ?? true)} ariaLabel="Border color" />
          </PropRow>
          <PropRow scope={scope} props={BORDER_PROPS} label="Width">
            <div className="k-dp-gap">
              {individual ? (
                <div className="k-grid4">
                  {(['T', 'R', 'B', 'L'] as const).map((s, i) => (
                    <NumberField key={s} label={s} value={b.widths[i]} min={0} onChange={(n, o) => writeBorder((c) => ({ ...c, widths: c.widths.map((w, j) => (j === i ? n : w)) as typeof c.widths }), o.final)} />
                  ))}
                </div>
              ) : (
                <div className="k-grid2">
                  <NumberField label="W" labelTitle="Border width" value={border.mixed ? null : Math.max(...b.widths)} mixed={border.mixed} min={0} onChange={(n, o) => writeBorder((c) => ({ ...c, widths: [n, n, n, n] }), o.final)} />
                  <Select value={b.style} onChange={(v) => writeBorder((c) => ({ ...c, style: v }))} options={BORDER_STYLES.filter((s) => s !== 'none').map((s) => ({ value: s, label: s }))} ariaLabel="Border style" />
                </div>
              )}
              <IconButton label={individual ? 'Same width on all sides' : 'Individual sides'} size="sm" active={individual} onClick={() => setIndividual((v) => !v)}>
                <Square />
              </IconButton>
            </div>
          </PropRow>
          {individual && (
            <Row label="Style">
              <Select value={b.style} onChange={(v) => writeBorder((c) => ({ ...c, style: v }))} options={BORDER_STYLES.filter((s) => s !== 'none').map((s) => ({ value: s, label: s }))} ariaLabel="Border style" />
            </Row>
          )}
        </>
      )}
      <PropRow scope={scope} props={['border-radius', ...CORNERS.map((c) => `border-${c}-radius`)]} label="Radius">
        <div className="k-dp-gap">
          {corners ? (
            <div className="k-grid4">
              {(['↖', '↗', '↘', '↙'] as const).map((s, i) => (
                <NumberField
                  key={s}
                  label={s}
                  labelTitle={CORNERS[i]}
                  value={radiusNum(radius.value[i])}
                  min={0}
                  onChange={(n, o) => writeRadius(radius.value.map((r, j) => (j === i ? `${fmtNum(n)}px` : r || '0')) as Quad, o.final)}
                />
              ))}
            </div>
          ) : (
            <NumberField
              label="◜"
              labelTitle="Corner radius"
              value={radius.mixed ? null : radius.value[0] && !/px$|^0$/.test(radius.value[0]) ? null : radiusNum(radius.value[0])}
              placeholder={radius.value[0] || '0'}
              mixed={radius.mixed}
              min={0}
              onChange={(n, o) => writeRadius([`${fmtNum(n)}px`, `${fmtNum(n)}px`, `${fmtNum(n)}px`, `${fmtNum(n)}px`], o.final)}
              onRawCommit={(raw) => writeRadius([raw, raw, raw, raw], true)}
            />
          )}
          <IconButton label={corners ? 'Same radius on all corners' : 'Individual corners'} size="sm" active={corners} onClick={() => setCorners((v) => !v)}>
            {corners ? <Link2Off /> : <Link2 />}
          </IconButton>
        </div>
      </PropRow>
    </Section>
  );
}

// ─── Effects ────────────────────────────────────────────────────────────────

const BLEND = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
const CURSORS = ['auto', 'default', 'pointer', 'text', 'move', 'grab', 'not-allowed', 'help', 'crosshair', 'zoom-in', 'none'];

export function EffectsSection({ scope }: { scope: Scope }) {
  const filter = readProp(scope, 'filter');
  const backdrop = readProp(scope, 'backdrop-filter');
  const blend = readProp(scope, 'mix-blend-mode');
  const cursor = readProp(scope, 'cursor');
  const list = filter.mixed ? [] : parseFilters(filter.value);
  const writeFilters = (next: typeof list, final = true) => setProp(scope, 'filter', serializeFilters(next) ?? offValue(scope, 'none'), { final, label: 'Change filter' });
  const blur = getFilterValue(backdrop.value, 'blur');
  return (
    <Section title={scope.state ? `Effects · ${STATE_LABELS[scope.state]}` : 'Effects'} id="dp-effects">
      <SubHead>Shadows</SubHead>
      <ShadowEditorRow scope={scope} prop="box-shadow" />
      <SubHead
        actions={
          <Dropdown
            align="end"
            items={FILTER_DEFS.map((d) => ({ label: d.label, disabled: list.some((f) => f.name === d.name), onSelect: () => writeFilters([...list, { name: d.name, value: d.initial }]) }))}
            trigger={
              <button type="button" className="k-iconbtn k-iconbtn--sm" aria-label="Add filter">
                <Plus />
              </button>
            }
          />
        }
      >
        Filters
      </SubHead>
      {filter.mixed && <div className="k-hint">Mixed filters</div>}
      {list.map((f, i) => {
        const def = filterDef(f.name);
        return (
          <div key={`${f.name}-${i}`} className="k-filter">
            <PropRowFilter scope={scope} label={def?.label ?? f.name}>
              {def && f.value != null ? (
                <div className="k-dp-slider">
                  <Slider value={f.value} min={def.min} max={def.max} step={def.step} onChange={(n, o) => writeFilters(list.map((x, j) => (j === i ? { ...x, value: n } : x)), o.final)} ariaLabel={def.label} />
                  <NumberField value={f.value} suffix={def.unit === 'deg' ? '°' : def.unit} precision={1} onChange={(n, o) => writeFilters(list.map((x, j) => (j === i ? { ...x, value: n } : x)), o.final)} />
                </div>
              ) : (
                <span className="k-mono k-dp-readout">{f.raw}</span>
              )}
            </PropRowFilter>
            <IconButton label="Remove filter" size="sm" noTooltip onClick={() => writeFilters(list.filter((_, j) => j !== i))}>
              <X />
            </IconButton>
          </div>
        );
      })}
      <PropRow scope={scope} props={['backdrop-filter']} label="Backdrop">
        <div className="k-dp-slider">
          <Slider value={blur ?? 0} min={0} max={40} step={0.5} onChange={(n, o) => setProp(scope, 'backdrop-filter', setFilterValue(backdrop.value, 'blur', n || null) ?? offValue(scope, 'none'), { final: o.final, label: 'Backdrop blur' })} ariaLabel="Backdrop blur" />
          <NumberField value={backdrop.mixed ? null : blur ?? 0} mixed={backdrop.mixed} suffix="px" min={0} onChange={(n, o) => setProp(scope, 'backdrop-filter', setFilterValue(backdrop.value, 'blur', n || null) ?? offValue(scope, 'none'), { final: o.final, label: 'Backdrop blur' })} />
        </div>
      </PropRow>
      {!scope.state && (
        <>
          <PropRow scope={scope} props={['mix-blend-mode']} label="Blend">
            <Select value={blend.mixed ? '' : blend.value ?? 'normal'} placeholder="Mixed" onChange={(v) => setProp(scope, 'mix-blend-mode', v === 'normal' ? offValue(scope, 'normal') : v)} options={BLEND.map((b) => ({ value: b, label: b }))} />
          </PropRow>
          <PropRow scope={scope} props={['cursor']} label="Cursor">
            <Select value={cursor.mixed ? '' : cursor.value ?? 'auto'} placeholder="Mixed" onChange={(v) => setProp(scope, 'cursor', v === 'auto' ? offValue(scope, 'auto') : v)} options={CURSORS.map((c) => ({ value: c, label: c }))} />
          </PropRow>
        </>
      )}
    </Section>
  );
}

function PropRowFilter({ scope, label, children }: { scope: Scope; label: string; children: React.ReactNode }) {
  return (
    <PropRow scope={scope} props={['filter']} label={label}>
      {children}
    </PropRow>
  );
}

// ─── State appearance (opacity / scale / translate) ─────────────────────────

export function StateAppearanceSection({ scope }: { scope: Scope }) {
  const st = readDerived(scope, readScaleTranslate);
  const opacity = readDerived(scope, (m) => (m.opacity == null ? 100 : Math.round(parseFloat(m.opacity) * 100)));
  const write = (patch: Partial<{ scale: number; tx: number; ty: number }>, final: boolean) =>
    applyPatch(
      scope,
      (m) => {
        const cur = { ...readScaleTranslate(m), ...patch };
        const out: Record<string, string | null> = {
          scale: cur.scale === 1 ? null : fmtNum(cur.scale, 3),
          translate: cur.tx || cur.ty ? `${fmtNum(cur.tx)}px ${fmtNum(cur.ty)}px` : null,
        };
        if (isSimpleTransform(m.transform)) out.transform = null;
        return out;
      },
      { final, label: 'Change transform' },
    );
  return (
    <Section title={`Appearance · ${STATE_LABELS[scope.state!]}`} id="dp-state-appearance">
      <PropRow scope={scope} props={['opacity']} label="Opacity">
        <div className="k-dp-slider">
          <Slider value={opacity.value} min={0} max={100} onChange={(n, o) => setProp(scope, 'opacity', fmtNum(n / 100, 3), { final: o.final })} ariaLabel="Opacity" />
          <NumberField value={opacity.mixed ? null : opacity.value} mixed={opacity.mixed} min={0} max={100} suffix="%" precision={0} onChange={(n, o) => setProp(scope, 'opacity', fmtNum(n / 100, 3), { final: o.final })} />
        </div>
      </PropRow>
      <PropRow scope={scope} props={['scale', 'transform']} label="Scale">
        <NumberField label="×" labelTitle="Scale" value={st.mixed ? null : st.value.scale} mixed={st.mixed} step={0.01} precision={3} min={0} onChange={(n, o) => write({ scale: n }, o.final)} />
      </PropRow>
      <PropRow scope={scope} props={['translate', 'transform']} label="Move">
        <div className="k-grid2">
          <NumberField label="X" value={st.value.tx} onChange={(n, o) => write({ tx: n }, o.final)} />
          <NumberField label="Y" value={st.value.ty} onChange={(n, o) => write({ ty: n }, o.final)} />
        </div>
      </PropRow>
    </Section>
  );
}

// ─── Transitions ────────────────────────────────────────────────────────────

const DEFAULT_TRANSITION: TransitionModel = { properties: ['all'], duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', delay: 0 };

function suggestedProps(nodes: KNode[]): string[] {
  const out = new Set<string>();
  for (const n of nodes)
    for (const s of Object.values(n.states ?? {}))
      for (const k of Object.keys(s ?? {})) {
        if (k.startsWith('background')) out.add('background-color');
        else if (k.startsWith('border') && k !== 'border-radius') out.add('border-color');
        else if (k === 'text-decoration' || k === 'text-decoration-line') continue;
        else out.add(k);
      }
  return [...out];
}

/** Transitions always live on the default styles (pass a non-state scope). */
export function TransitionsSection({ scope, stateNodes }: { scope: Scope; stateNodes: KNode[] }) {
  const info = readProp(scope, 'transition');
  const parsed = info.mixed ? null : parseTransition(info.value);
  const hasStates = stateNodes.some((n) => Object.values(n.states ?? {}).some((s) => s && Object.keys(s).length));
  const write = (m: TransitionModel | null, final = true) => setProp(scope, 'transition', m ? serializeTransition(m) : offValue(scope, 'none'), { final, label: 'Change transition' });
  const easingOpts = EASINGS.map((e) => ({ value: e.value, label: e.label }));
  return (
    <Section
      title="Transitions"
      id="dp-transitions"
      actions={
        parsed ? (
          <IconButton label="Remove transition" size="sm" onClick={() => write(null)}>
            <Trash2 />
          </IconButton>
        ) : !info.value || info.mixed ? (
          <IconButton label="Add transition" size="sm" onClick={() => write(DEFAULT_TRANSITION)}>
            <Plus />
          </IconButton>
        ) : undefined
      }
    >
      {!info.value && hasStates && (
        <div className="k-dp-callout" data-testid="transition-suggest">
          <Sparkles />
          <span>Interaction states change instantly. Add a transition to animate them smoothly.</span>
          <Button size="sm" variant="primary" onClick={() => write({ ...DEFAULT_TRANSITION, properties: suggestedProps(stateNodes) })}>
            Add
          </Button>
        </div>
      )}
      {!info.value && !hasStates && <div className="k-hint">No transition. Transitions animate hover / pressed / focus changes.</div>}
      {info.mixed && <div className="k-hint">Mixed transitions — editing replaces them on all selected layers.</div>}
      {parsed === 'raw' && (
        <Row label="CSS">
          <TextInput value={info.value ?? ''} onCommit={(v) => setProp(scope, 'transition', v.trim() || null)} wrapClassName="k-mono-input" />
        </Row>
      )}
      {parsed && parsed !== 'raw' && <TransitionRows m={parsed} write={write} easingOpts={easingOpts} scope={scope} />}
    </Section>
  );
}

function TransitionRows({ m, write, easingOpts, scope }: { m: TransitionModel; write: (m: TransitionModel, final?: boolean) => void; easingOpts: { value: string; label: string }[]; scope: Scope }) {
  const preset = transitionPresetOf(m.properties);
  const [custom, setCustom] = useState(preset === 'custom');
  const shownPreset = custom ? 'custom' : preset;
  return (
    <>
      <PropRow scope={scope} props={['transition']} label="Property">
        <Select
          value={shownPreset}
          onChange={(v) => {
            if (v === 'custom') return setCustom(true);
            setCustom(false);
            write({ ...m, properties: TRANSITION_PRESETS.find((p) => p.id === v)!.properties });
          }}
          options={[...TRANSITION_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: 'custom', label: 'Custom…' }]}
        />
      </PropRow>
      {shownPreset === 'custom' && (
        <Row label="Props">
          <TextInput value={m.properties.join(', ')} placeholder="opacity, transform" onCommit={(v) => write({ ...m, properties: v.split(',').map((s) => s.trim()).filter(Boolean) })} wrapClassName="k-mono-input" />
        </Row>
      )}
      <Row label="Timing">
        <div className="k-grid2">
          <NumberField label="⏱" labelTitle="Duration" value={m.duration} min={0} step={10} suffix="ms" precision={0} onChange={(n, o) => write({ ...m, duration: n }, o.final)} />
          <NumberField label="+" labelTitle="Delay" value={m.delay} min={0} step={10} suffix="ms" precision={0} onChange={(n, o) => write({ ...m, delay: n }, o.final)} />
        </div>
      </Row>
      <Row label="Easing">
        <Select value={m.easing} onChange={(v) => write({ ...m, easing: v })} options={easingOpts.some((e) => e.value === m.easing) ? easingOpts : [...easingOpts, { value: m.easing, label: m.easing.length > 28 ? 'Custom' : m.easing }]} />
      </Row>
    </>
  );
}

