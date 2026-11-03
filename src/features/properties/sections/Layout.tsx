import { useState } from 'react';
import { ArrowDown, ArrowRight, ChevronsUpDown, Columns3, Link2, Link2Off, Minus, Plus, Rows3, Square, LayoutGrid, Rows2, WrapText, AlignHorizontalSpaceBetween, RotateCw, EyeOff, Move } from 'lucide-react';
import type { KNode, StyleMap } from '@/core/model/types';
import { docApi, useDoc } from '@/core/store/docStore';
import { setStyles } from '@/core/store/actions';
import { parseRotate } from '@/core/style/style';
import { IconButton, NumberField, Section, Segmented, Select, Slider, Switch, TextInput, Tooltip } from '@/ui/primitives';
import { fmtNum } from '@/ui/color/cssValue';
import { AlignGrid, LengthField, PropRow, ScrubValue, SizeField } from '../controls';
import { applyPatch, historyStep, measureInParent, offValue, readDerived, readProp, setProp, type Scope } from '../scope';
import { countTracks, flexToGrid, gridToFlex, normAlign, readPlaceItems, setTrackCount, alignToCss, type AlignPos } from '../lib/layout';
import { boxPatch, collapseBox, readBox, SIDES, type Quad } from '../lib/box';
import { CONTAINER_TYPES } from '@/core/model/factory';

const isAbs = (m: StyleMap) => m.position === 'absolute' || m.position === 'fixed';

// ─── Layout / position ──────────────────────────────────────────────────────

export function LayoutSection({ scope }: { scope: Scope }) {
  const [showMinMax, setShowMinMax] = useState(() => scope.maps.some((m) => m['min-width'] || m['max-width'] || m['min-height'] || m['max-height']));
  const isRoot = scope.nodes.some((n) => !n.parent);
  const pos = readDerived(scope, (m) => (isAbs(m) ? 'free' : 'flow'));
  const rot = readDerived(scope, (m) => parseRotate(m.rotate));
  const opacity = readDerived(scope, (m) => (m.opacity == null ? 100 : Math.round(parseFloat(m.opacity) * 100)));
  const overflow = readProp(scope, 'overflow');
  const hidden = readDerived(scope, (m) => m.display === 'none');

  const toFree = () => {
    const doc = docApi.doc;
    historyStep('Free position', () => {
      // parents become the containing block
      const parents = [...new Set(scope.nodes.map((n) => n.parent).filter((p): p is string => !!p))];
      for (const pid of parents) {
        const pm = scope.parentMaps[scope.nodes.findIndex((n) => n.parent === pid)];
        if (!pm?.position || pm.position === 'static') setStyles([pid], { position: 'relative' }, { bp: scope.bp });
      }
      applyPatch(scope, (m, n) => {
        const r = measureInParent(n.id);
        const patch: Record<string, string | null> = { position: 'absolute', left: `${r?.x ?? 0}px`, top: `${r?.y ?? 0}px` };
        if (r && !/px$/.test(m.width ?? '')) patch.width = `${r.w}px`;
        if (r && m.height && !/px$/.test(m.height)) patch.height = `${r.h}px`;
        if (m.flex) patch.flex = null;
        void doc;
        return patch;
      });
    });
  };
  const toFlow = () =>
    applyPatch(scope, { position: offValue(scope, 'static'), left: offValue(scope, 'auto'), top: offValue(scope, 'auto'), right: null, bottom: null }, { label: 'Flow position' });

  const setHidden = (v: boolean) => {
    if (v) return setProp(scope, 'display', 'none', { label: 'Hide on breakpoint' });
    if (!scope.isBase) return applyPatch(scope, { display: null }, { label: 'Show on breakpoint' });
    applyPatch(scope, (m) => ({ display: m['grid-template-columns'] ? 'grid' : m['flex-direction'] || m.gap || m['justify-content'] ? 'flex' : null }), { label: 'Show' });
  };

  return (
    <Section title="Layout" id="dp-layout">
      {!isRoot && (
        <PropRow scope={scope} props={['position']} label="Position">
          <Segmented
            value={pos.mixed ? '' : pos.value}
            onChange={(v) => (v === 'free' ? toFree() : toFlow())}
            options={[
              { value: 'flow', label: 'Flow', tooltip: 'Laid out by the parent (flex / grid / block flow)' },
              { value: 'free', label: 'Free', icon: <Move />, tooltip: 'Absolutely positioned at X / Y' },
            ]}
          />
        </PropRow>
      )}
      {!isRoot && !pos.mixed && pos.value === 'free' && (
        <PropRow scope={scope} props={['left', 'top']} label="X / Y">
          <div className="k-grid2">
            <LengthField scope={scope} prop="left" label="X" />
            <LengthField scope={scope} prop="top" label="Y" />
          </div>
        </PropRow>
      )}
      <PropRow scope={scope} props={['width', 'height', 'flex']} label="Size">
        <div className="k-grid2">
          <SizeField scope={scope} axis="width" />
          <SizeField scope={scope} axis="height" />
        </div>
      </PropRow>
      <button type="button" className="k-dp-disclosure" onClick={() => setShowMinMax((v) => !v)} aria-expanded={showMinMax}>
        <ChevronsUpDown /> Min / max size
      </button>
      {showMinMax && (
        <>
          <PropRow scope={scope} props={['min-width', 'max-width']} label="Min / max W">
            <div className="k-grid2">
              <LengthField scope={scope} prop="min-width" label="↓" labelTitle="Min width" placeholder="—" min={0} />
              <LengthField scope={scope} prop="max-width" label="↑" labelTitle="Max width" placeholder="—" min={0} />
            </div>
          </PropRow>
          <PropRow scope={scope} props={['min-height', 'max-height']} label="Min / max H">
            <div className="k-grid2">
              <LengthField scope={scope} prop="min-height" label="↓" labelTitle="Min height" placeholder="—" min={0} />
              <LengthField scope={scope} prop="max-height" label="↑" labelTitle="Max height" placeholder="—" min={0} />
            </div>
          </PropRow>
        </>
      )}
      <PropRow scope={scope} props={['rotate']} label="Rotation">
        <NumberField
          label={<RotateCw />}
          labelTitle="Rotation"
          value={rot.mixed ? null : rot.value}
          mixed={rot.mixed}
          suffix="°"
          precision={1}
          onChange={(n, o) => setProp(scope, 'rotate', n ? `${fmtNum(n, 1)}deg` : offValue(scope, '0deg'), { final: o.final })}
        />
      </PropRow>
      <PropRow scope={scope} props={['opacity']} label="Opacity">
        <OpacityControl scope={scope} value={opacity.mixed ? null : opacity.value} />
      </PropRow>
      <PropRow scope={scope} props={['overflow']} label="Overflow">
        <Select
          value={overflow.mixed ? '' : overflow.value ?? 'visible'}
          placeholder="Mixed"
          onChange={(v) => setProp(scope, 'overflow', v === 'visible' ? offValue(scope, 'visible') : v)}
          options={['visible', 'hidden', 'clip', 'auto', 'scroll'].map((o) => ({ value: o, label: o }))}
        />
      </PropRow>
      <PropRow scope={scope} props={['z-index']} label="Z-index">
        <LengthField scope={scope} prop="z-index" unit="" precision={0} placeholder="auto" label="Z" />
      </PropRow>
      {!isRoot && (
        <PropRow scope={scope} props={['display']} label={<EyeOff />} title="display: none">
          <label className="k-hstack k-dp-switchrow">
            <Switch checked={!hidden.mixed && hidden.value} onChange={setHidden} ariaLabel="Hidden on this breakpoint" />
            <span>{scope.isBase ? 'Hidden (display: none)' : 'Hidden on this breakpoint'}</span>
          </label>
        </PropRow>
      )}
    </Section>
  );
}

export function OpacityControl({ scope, value }: { scope: Scope; value: number | null }) {
  const write = (n: number, final: boolean) => setProp(scope, 'opacity', n >= 100 ? offValue(scope, '1') : fmtNum(n / 100, 3), { final, label: 'Change opacity' });
  return (
    <div className="k-dp-slider">
      <Slider value={value ?? 100} min={0} max={100} onChange={(n, o) => write(n, o.final)} ariaLabel="Opacity" />
      <NumberField value={value} mixed={value == null} min={0} max={100} precision={0} suffix="%" onChange={(n, o) => write(n, o.final)} />
    </div>
  );
}

// ─── Auto layout ────────────────────────────────────────────────────────────

function displayMode(m: StyleMap): 'block' | 'flex' | 'grid' {
  const d = m.display ?? '';
  return d.includes('flex') ? 'flex' : d.includes('grid') ? 'grid' : 'block';
}

export function AutoLayoutSection({ scope }: { scope: Scope }) {
  if (!scope.nodes.every((n) => CONTAINER_TYPES.has(n.type))) return null;
  const mode = readDerived(scope, displayMode);
  const m0 = scope.maps[0];
  const hasKids = scope.nodes.some((n) => n.children.length);

  const setMode = (v: 'block' | 'flex' | 'grid') =>
    applyPatch(
      scope,
      (m) => {
        const inline = (m.display ?? '').startsWith('inline');
        if (v === 'block') return { display: inline ? 'inline-block' : offValue(scope, 'block') };
        const patch: Record<string, string | null> = { display: inline ? `inline-${v}` : v };
        if (v === 'grid' && !m['grid-template-columns']) patch['grid-template-columns'] = 'repeat(2, 1fr)';
        if (!m.gap) patch.gap = '8px';
        return patch;
      },
      { label: `Layout: ${v}` },
    );

  return (
    <Section
      title="Auto layout"
      id="dp-auto"
      actions={
        mode.value === 'block' && hasKids ? (
          <Tooltip content="Stack children with flex and convert free-positioned children to flow">
            <button type="button" className="k-btn k-btn--sm k-btn--ghost" onClick={() => addAutoLayout(scope)} data-testid="add-auto-layout">
              <Plus /> Add
            </button>
          </Tooltip>
        ) : undefined
      }
    >
      <PropRow scope={scope} props={['display']} label="Display">
        <Segmented
          value={mode.mixed ? '' : mode.value}
          onChange={setMode}
          options={[
            { value: 'block', label: 'Block', icon: <Square /> },
            { value: 'flex', label: 'Flex', icon: <Rows3 /> },
            { value: 'grid', label: 'Grid', icon: <LayoutGrid /> },
          ]}
        />
      </PropRow>
      {!mode.mixed && mode.value === 'flex' && <FlexControls scope={scope} m={m0} />}
      {!mode.mixed && mode.value === 'grid' && <GridControls scope={scope} m={m0} />}
    </Section>
  );
}

function GapFields({ scope }: { scope: Scope }) {
  const gap = readDerived(scope, (m) => {
    const [r = '', c = r] = (m.gap ?? '').split(/\s+/);
    return { r: m['row-gap'] ?? r, c: m['column-gap'] ?? c };
  });
  const [linked, setLinked] = useState(gap.value.r === gap.value.c);
  const num = (v: string) => (v ? parseFloat(v) : 0);
  const write = (r: number, c: number, final: boolean) =>
    applyPatch(scope, { gap: r === c ? `${fmtNum(r)}px` : `${fmtNum(r)}px ${fmtNum(c)}px`, 'row-gap': null, 'column-gap': null }, { final, label: 'Change gap' });
  return (
    <PropRow scope={scope} props={['gap', 'row-gap', 'column-gap']} label="Gap">
      <div className="k-dp-gap">
        {linked ? (
          <NumberField label="⇔" labelTitle="Gap" value={gap.mixed ? null : num(gap.value.r)} mixed={gap.mixed} min={0} onChange={(n, o) => write(n, n, o.final)} />
        ) : (
          <div className="k-grid2">
            <NumberField label="R" labelTitle="Row gap" value={num(gap.value.r)} min={0} onChange={(n, o) => write(n, num(gap.value.c), o.final)} />
            <NumberField label="C" labelTitle="Column gap" value={num(gap.value.c)} min={0} onChange={(n, o) => write(num(gap.value.r), n, o.final)} />
          </div>
        )}
        <IconButton label={linked ? 'Separate row / column gap' : 'Link gaps'} size="sm" active={!linked} onClick={() => setLinked((v) => !v)}>
          {linked ? <Link2 /> : <Link2Off />}
        </IconButton>
      </div>
    </PropRow>
  );
}

function FlexControls({ scope, m }: { scope: Scope; m: StyleMap }) {
  const dir = m['flex-direction'] ?? 'row';
  const column = dir.startsWith('column');
  const reverse = dir.endsWith('reverse');
  const wrap = (m['flex-wrap'] ?? 'nowrap') !== 'nowrap';
  const j = normAlign(m['justify-content']);
  const distributed = j === 'between' || j === 'around' || j === 'evenly';
  const g = flexToGrid(m);
  const align = normAlign(m['align-items']);
  return (
    <>
      <PropRow scope={scope} props={['flex-direction', 'flex-wrap']} label="Direction">
        <div className="k-hstack">
          <Segmented
            value={column ? 'column' : 'row'}
            onChange={(v) => setProp(scope, 'flex-direction', `${v}${reverse ? '-reverse' : ''}` === 'row' ? offValue(scope, 'row') : `${v}${reverse ? '-reverse' : ''}`)}
            options={[
              { value: 'row', icon: <ArrowRight />, tooltip: 'Horizontal' },
              { value: 'column', icon: <ArrowDown />, tooltip: 'Vertical' },
            ]}
          />
          <IconButton label="Wrap" active={wrap} size="sm" onClick={() => setProp(scope, 'flex-wrap', wrap ? offValue(scope, 'nowrap') : 'wrap')}>
            <WrapText />
          </IconButton>
          <IconButton label="Reverse order" active={reverse} size="sm" onClick={() => setProp(scope, 'flex-direction', `${column ? 'column' : 'row'}${reverse ? '' : '-reverse'}`)}>
            <ChevronsUpDown />
          </IconButton>
        </div>
      </PropRow>
      <PropRow scope={scope} props={['justify-content', 'align-items']} label="Align">
        <div className="k-dp-alignrow">
          <AlignGrid
            h={g.h}
            v={g.v}
            direction={column ? 'column' : 'row'}
            distribute={distributed ? (column ? 'v' : 'h') : null}
            onPick={(h, v) => applyPatch(scope, (mm) => gridToFlex(mm, h, v, distributed), { label: 'Align children' })}
          />
          <div className="k-stack" style={{ flex: 1, minWidth: 0 }}>
            <Tooltip content="Space between">
              <button
                type="button"
                className="k-btn k-btn--sm"
                data-active={distributed ? 'true' : undefined}
                aria-pressed={distributed}
                onClick={() => setProp(scope, 'justify-content', distributed ? 'flex-start' : 'space-between')}
              >
                <AlignHorizontalSpaceBetween style={column ? { transform: 'rotate(90deg)' } : undefined} /> Between
              </button>
            </Tooltip>
            <Select
              value={align === 'stretch' ? 'stretch' : align === 'baseline' ? 'baseline' : 'pos'}
              ariaLabel="Cross-axis alignment"
              onChange={(v) => setProp(scope, 'align-items', v === 'pos' ? alignToCss(column ? g.h ?? 'start' : g.v ?? 'start') : v)}
              options={[
                { value: 'pos', label: 'Align' },
                { value: 'stretch', label: 'Stretch' },
                { value: 'baseline', label: 'Baseline' },
              ]}
            />
          </div>
        </div>
      </PropRow>
      <GapFields scope={scope} />
    </>
  );
}

function TrackStepper({ scope, prop, icon, label }: { scope: Scope; prop: string; icon: React.ReactNode; label: string }) {
  const info = readProp(scope, prop);
  const n = countTracks(info.value);
  return (
    <div className="k-stack" style={{ gap: 4 }}>
      <div className="k-dp-stepper" aria-label={label}>
        <span className="k-dp-stepper__icon">{icon}</span>
        <IconButton label={`Fewer ${label.toLowerCase()}`} size="sm" noTooltip disabled={n <= 0} onClick={() => setProp(scope, prop, setTrackCount(info.value, n - 1))}>
          <Minus />
        </IconButton>
        <span className="k-dp-stepper__n">{info.mixed ? '–' : n}</span>
        <IconButton label={`More ${label.toLowerCase()}`} size="sm" noTooltip onClick={() => setProp(scope, prop, setTrackCount(info.value, n + 1))}>
          <Plus />
        </IconButton>
      </div>
      <TextInput value={info.mixed ? '' : info.value ?? ''} placeholder={info.mixed ? 'Mixed' : 'none'} onCommit={(v) => setProp(scope, prop, v.trim() || null)} aria-label={`${label} template`} wrapClassName="k-mono-input" />
    </div>
  );
}

const PLACE: AlignPos[] = ['start', 'center', 'end'];
function placeToPos(v: string): AlignPos | null {
  const n = normAlign(v);
  return n && (PLACE as string[]).includes(n) ? (n as AlignPos) : null;
}

function GridControls({ scope, m }: { scope: Scope; m: StyleMap }) {
  const p = readPlaceItems(m);
  const stretch = p.align === 'stretch' && p.justify === 'stretch';
  return (
    <>
      <PropRow scope={scope} props={['grid-template-columns', 'grid-template-rows']} label="Tracks">
        <div className="k-grid2">
          <TrackStepper scope={scope} prop="grid-template-columns" icon={<Columns3 />} label="Columns" />
          <TrackStepper scope={scope} prop="grid-template-rows" icon={<Rows2 />} label="Rows" />
        </div>
      </PropRow>
      <PropRow scope={scope} props={['place-items', 'align-items', 'justify-items']} label="Items">
        <div className="k-dp-alignrow">
          <AlignGrid
            h={placeToPos(p.justify)}
            v={placeToPos(p.align)}
            onPick={(h, v) => applyPatch(scope, { 'place-items': h === v ? h : `${v} ${h}`, 'align-items': null, 'justify-items': null }, { label: 'Place items' })}
            ariaLabel="Place items"
          />
          <button
            type="button"
            className="k-btn k-btn--sm"
            data-active={stretch ? 'true' : undefined}
            aria-pressed={stretch}
            onClick={() => applyPatch(scope, { 'place-items': stretch ? 'start' : offValue(scope, 'stretch'), 'align-items': null, 'justify-items': null }, { label: 'Place items' })}
          >
            Stretch
          </button>
        </div>
      </PropRow>
      <GapFields scope={scope} />
    </>
  );
}

/** Convert containers to flex, ordering children visually and turning free children into flow. */
export function addAutoLayout(scope: Scope) {
  const doc = useDoc.getState().doc;
  historyStep('Add auto layout', () => {
    for (const node of scope.nodes) {
      const kids = node.children.map((id) => doc.nodes[id]).filter(Boolean) as KNode[];
      const rects = new Map(kids.map((k) => [k.id, measureInParent(k.id)]));
      const xs = kids.map((k) => rects.get(k.id)?.x ?? 0);
      const ys = kids.map((k) => rects.get(k.id)?.y ?? 0);
      const row = Math.max(...xs, 0) - Math.min(...xs, 0) > Math.max(...ys, 0) - Math.min(...ys, 0);
      const sorted = [...kids].sort((a, b) => {
        const ra = rects.get(a.id);
        const rb = rects.get(b.id);
        return row ? (ra?.x ?? 0) - (rb?.x ?? 0) : (ra?.y ?? 0) - (rb?.y ?? 0);
      });
      // average spacing between consecutive children
      let gap = 8;
      const spaces: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        const a = rects.get(sorted[i - 1].id);
        const b = rects.get(sorted[i].id);
        if (a && b) spaces.push(row ? b.x - (a.x + a.w) : b.y - (a.y + a.h));
      }
      if (spaces.length) gap = Math.max(0, Math.round(spaces.reduce((s, v) => s + v, 0) / spaces.length));
      docApi.mutate('Add auto layout', (d) => {
        const n = d.nodes[node.id];
        const map = (n.styles[scope.bp] ??= {});
        map.display = 'flex';
        map['flex-direction'] = row ? 'row' : 'column';
        map.gap = `${gap}px`;
        n.children = sorted.map((k) => k.id);
        for (const k of sorted) {
          const kn = d.nodes[k.id];
          for (const bp of Object.keys(kn.styles)) {
            const s = kn.styles[bp];
            if (s.position === 'absolute' || s.position === 'fixed') delete s.position;
            delete s.left;
            delete s.top;
            delete s.right;
            delete s.bottom;
            if (bp !== 'base' && !Object.keys(s).length) delete kn.styles[bp];
          }
        }
      });
    }
  });
}

// ─── Spacing (box model) ────────────────────────────────────────────────────

export function SpacingSection({ scope }: { scope: Scope }) {
  const pad = readDerived(scope, (m) => readBox(m, 'padding'));
  const mar = readDerived(scope, (m) => readBox(m, 'margin'));
  const [linked, setLinked] = useState(false);

  const writeSide = (prop: 'padding' | 'margin', i: number, value: string, final: boolean) =>
    applyPatch(
      scope,
      (m) => {
        const q = [...readBox(m, prop)] as Quad;
        if (prop === 'padding' && linked) for (let k = 0; k < 4; k++) q[k] = value;
        else q[i] = value;
        return boxPatch(prop, q.map((v) => v || (prop === 'padding' || q.some(Boolean) ? '0' : '')) as Quad);
      },
      { final, label: `Change ${prop}` },
    );

  const side = (prop: 'padding' | 'margin', i: number, data: { value: Quad; mixed: boolean }) => (
    <ScrubValue
      key={`${prop}-${i}`}
      value={data.value[i]}
      mixed={data.mixed}
      highlight={!!data.value[i] && parseFloat(data.value[i]) !== 0}
      min={prop === 'padding' ? 0 : undefined}
      ariaLabel={`${prop} ${SIDES[i]}`}
      onChange={(n, final) => writeSide(prop, i, n === 0 ? '0' : `${fmtNum(n)}px`, final)}
      onRaw={(raw) => writeSide(prop, i, raw === 'auto' || /^-?\d/.test(raw) ? (/^-?\d*\.?\d+$/.test(raw) ? `${raw}px` : raw) : raw, true)}
    />
  );

  return (
    <Section
      title="Spacing"
      id="dp-spacing"
      actions={
        <IconButton label={linked ? 'Edit padding sides separately' : 'Link padding sides'} size="sm" active={linked} onClick={() => setLinked((v) => !v)}>
          {linked ? <Link2 /> : <Link2Off />}
        </IconButton>
      }
    >
      <div className="k-boxmodel" data-testid="box-model">
        <span className="k-boxmodel__tag">Margin</span>
        <div className="k-boxmodel__t">{side('margin', 0, mar)}</div>
        <div className="k-boxmodel__r">{side('margin', 1, mar)}</div>
        <div className="k-boxmodel__b">{side('margin', 2, mar)}</div>
        <div className="k-boxmodel__l">{side('margin', 3, mar)}</div>
        <div className="k-boxmodel__pad" data-linked={linked ? 'true' : undefined}>
          <span className="k-boxmodel__tag">Padding</span>
          <div className="k-boxmodel__t">{side('padding', 0, pad)}</div>
          <div className="k-boxmodel__r">{side('padding', 1, pad)}</div>
          <div className="k-boxmodel__b">{side('padding', 2, pad)}</div>
          <div className="k-boxmodel__l">{side('padding', 3, pad)}</div>
          <div className="k-boxmodel__core" />
        </div>
      </div>
      <div className="k-dp-boxsum">
        <PropRowInline scope={scope} props={['padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left']} label="Padding" value={pad.mixed ? 'Mixed' : collapseLabel(pad.value)} />
        <PropRowInline scope={scope} props={['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left']} label="Margin" value={mar.mixed ? 'Mixed' : collapseLabel(mar.value)} />
      </div>
    </Section>
  );
}

function collapseLabel(q: Quad): string {
  if (q.every((v) => !v)) return '—';
  return collapseBox(q.map((v) => v || '0') as Quad);
}

function PropRowInline({ scope, props, label, value }: { scope: Scope; props: string[]; label: string; value: string }) {
  return (
    <PropRow scope={scope} props={props} label={label}>
      <span className="k-dp-readout k-mono">{value}</span>
    </PropRow>
  );
}

