/**
 * Keyframe strip + values editor for the selected keyframe of an animation.
 */
import { Plus, Trash2, X, Diamond } from 'lucide-react';
import { colord } from 'colord';
import type { KAnimation, Keyframe, NodeId } from '@/core/model/types';
import { EASINGS } from '@/core/anim/compile';
import { Button, IconButton, NumberField, Section, Select, TextInput } from '@/ui/primitives';
import { Dropdown, type MenuEntry } from '@/ui/menu';
import { usePlayback } from './playbackStore';
import { addKeyframeAt, removeKeyframe, selectAnimation, setKeyframeEasing, setKeyframeOffset, setKeyframeValue } from './animActions';
import { CHANNELS, channelDef, sortChannelKeys, type ChannelDef } from './meta';

function largestGapMid(kfs: Keyframe[]): number {
  const offs = [...kfs.map((k) => k.offset)].sort((a, b) => a - b);
  let best = 0.5;
  let gap = -1;
  for (let i = 1; i < offs.length; i++) {
    if (offs[i] - offs[i - 1] > gap) {
      gap = offs[i] - offs[i - 1];
      best = (offs[i] + offs[i - 1]) / 2;
    }
  }
  return Math.round(best * 100) / 100;
}

const asNum = (v: string | number | undefined): number | null => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^-?\d*\.?\d+$/.test(v.trim())) return parseFloat(v);
  return null;
};

function ColorValue({ value, onChange }: { value: string; onChange: (v: string, final: boolean) => void }) {
  const c = colord(value);
  const hex = c.isValid() ? c.alpha(1).toHex() : '#000000';
  return (
    <div className="k-anim-color">
      <label className="k-anim-swatch" style={{ background: value }} title="Pick color">
        <input type="color" value={hex} onChange={(e) => onChange(e.target.value, false)} onBlur={(e) => onChange(e.target.value, true)} />
      </label>
      <TextInput value={value} onCommit={(v) => v.trim() && onChange(v.trim(), true)} wrapClassName="k-anim-grow" />
    </div>
  );
}

function ValueEditor({ def, value, onChange }: { def: ChannelDef; value: string | number; onChange: (v: string | number) => void }) {
  if (def.kind === 'number') {
    const n = asNum(value);
    if (n != null)
      return (
        <NumberField
          value={n}
          label={def.short}
          labelTitle={`${def.label} — drag to scrub`}
          step={def.step ?? 1}
          min={def.min}
          max={def.max}
          precision={def.precision ?? 2}
          suffix={def.unit}
          onChange={(v) => onChange(Math.round(v * 1000) / 1000)}
          onRawCommit={(raw) => onChange(raw)}
        />
      );
  }
  if (def.kind === 'blur') {
    const m = /^blur\(\s*(-?[\d.]+)px\s*\)$/.exec(String(value).trim());
    if (m)
      return (
        <NumberField
          value={parseFloat(m[1])}
          label="Bl"
          labelTitle="Blur radius — drag to scrub"
          min={0}
          step={0.5}
          precision={1}
          suffix="px"
          onChange={(v) => onChange(`blur(${Math.max(0, Math.round(v * 10) / 10)}px)`)}
        />
      );
  }
  if (def.kind === 'color') return <ColorValue value={String(value)} onChange={(v) => onChange(v)} />;
  return <TextInput value={String(value)} onCommit={(v) => onChange(asNum(v) ?? v)} />;
}

export function KeyframeEditor({ nodeId, anim }: { nodeId: NodeId; anim: KAnimation }) {
  const selKf = usePlayback((s) => (s.selectedKeyframe?.animId === anim.id ? s.selectedKeyframe.keyframeId : null));
  const kfs = [...anim.keyframes].sort((a, b) => a.offset - b.offset);
  const kf = kfs.find((k) => k.id === selKf) ?? null;

  const keys = sortChannelKeys(new Set(kfs.flatMap((k) => Object.keys(k.values))));
  const present = kf ? new Set(Object.keys(kf.values)) : new Set<string>();
  const groups = [...new Set(CHANNELS.map((c) => c.group))];
  const addMenu: MenuEntry[] = groups.flatMap((g, i) => {
    const items = CHANNELS.filter((c) => c.group === g && !present.has(c.key));
    if (!items.length) return [];
    return [
      ...(i ? [{ type: 'separator' as const }] : []),
      { type: 'label' as const, label: g },
      ...items.map((c) => ({ label: c.label, onSelect: () => kf && setKeyframeValue(nodeId, anim.id, kf.id, c.key, c.def, { coalesce: false }) })),
    ];
  });

  return (
    <Section
      title={
        <span className="k-hstack" style={{ gap: 6 }}>
          Keyframes <span className="k-badge">{kfs.length}</span>
        </span>
      }
      id="anim-keyframes"
      actions={
        <IconButton label="Add keyframe" size="sm" onClick={() => addKeyframeAt(nodeId, anim.id, largestGapMid(kfs))} data-testid="kf-add">
          <Plus />
        </IconButton>
      }
    >
      <div
        className="k-anim-strip"
        onDoubleClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          addKeyframeAt(nodeId, anim.id, Math.round(((e.clientX - r.left - 8) / (r.width - 16)) * 100) / 100);
        }}
        title="Double-click to add a keyframe"
      >
        <div className="k-anim-strip__line" />
        {kfs.map((k) => (
          <button
            key={k.id}
            className="k-anim-strip__kf"
            data-selected={k.id === selKf ? 'true' : undefined}
            style={{ left: `calc(8px + (100% - 16px) * ${k.offset})` }}
            title={`${Math.round(k.offset * 100)}%`}
            onClick={(e) => {
              e.stopPropagation();
              selectAnimation(nodeId, anim.id, k.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label={`Keyframe at ${Math.round(k.offset * 100)}%`}
          />
        ))}
      </div>

      {!kf && (
        <div className="k-anim-hint">
          <Diamond /> Select a keyframe to edit its values. Properties: {keys.map((k) => channelDef(k).label).join(', ') || 'none'}.
        </div>
      )}

      {kf && (
        <div className="k-anim-kf" data-testid="kf-editor">
          <div className="k-grid2">
            <NumberField
              label="At"
              labelTitle="Keyframe position within one iteration"
              value={Math.round(kf.offset * 1000) / 10}
              min={0}
              max={100}
              step={1}
              precision={1}
              suffix="%"
              onChange={(v) => setKeyframeOffset(nodeId, anim.id, kf.id, v / 100)}
            />
            <Select
              ariaLabel="Keyframe easing"
              value={kf.easing ?? '__inherit'}
              onChange={(v) => setKeyframeEasing(nodeId, anim.id, kf.id, v === '__inherit' ? null : v)}
              options={[
                { value: '__inherit', label: 'Ease: default' },
                ...EASINGS.map((e) => ({ value: e.value, label: e.label })),
                ...(kf.easing && !EASINGS.some((e) => e.value === kf.easing) ? [{ value: kf.easing, label: 'Custom' }] : []),
              ]}
            />
          </div>
          <div className="k-anim-props">
            {sortChannelKeys(Object.keys(kf.values)).map((key) => {
              const def = channelDef(key);
              return (
                <div key={key} className="k-anim-prop" data-prop={key}>
                  <span className="k-anim-prop__label" title={key}>
                    {def.label}
                  </span>
                  <ValueEditor def={def} value={kf.values[key]} onChange={(v) => setKeyframeValue(nodeId, anim.id, kf.id, key, v)} />
                  <IconButton label={`Remove ${def.label} from this keyframe`} size="sm" onClick={() => setKeyframeValue(nodeId, anim.id, kf.id, key, undefined, { coalesce: false })}>
                    <X />
                  </IconButton>
                </div>
              );
            })}
            {!Object.keys(kf.values).length && <div className="k-anim-hint">This keyframe has no properties yet.</div>}
          </div>
          <div className="k-hstack" style={{ marginTop: 8 }}>
            <Dropdown
              items={addMenu}
              trigger={
                <Button size="sm" variant="outline" icon={<Plus />} data-testid="kf-add-prop">
                  Add property
                </Button>
              }
            />
            <span style={{ flex: 1 }} />
            <IconButton label={kfs.length <= 2 ? 'An animation needs at least two keyframes' : 'Delete keyframe'} size="sm" disabled={kfs.length <= 2} onClick={() => removeKeyframe(nodeId, anim.id, kf.id)}>
              <Trash2 />
            </IconButton>
          </div>
        </div>
      )}
    </Section>
  );
}
