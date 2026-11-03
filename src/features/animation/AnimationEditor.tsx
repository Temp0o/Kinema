/**
 * Editor for one animation: timing, trigger, easing (with curve + springs) and
 * staggering. Every edit is one (coalesced) undo step and replays the animation
 * on the canvas after ~150ms.
 */
import { useState } from 'react';
import { RotateCcw, Infinity as InfinityIcon, Timer, Hourglass, Repeat2 } from 'lucide-react';
import type { Draft } from 'immer';
import type { KAnimation, NodeId } from '@/core/model/types';
import { EASINGS, parseCubicBezier, springEasing } from '@/core/anim/compile';
import { SVG_SHAPES_SELECTOR } from '@/core/anim/svg';
import { IconButton, NumberField, Row, Section, Segmented, Select, TextInput } from '@/ui/primitives';
import { CurveEditor } from './CurveEditor';
import { editAnimation } from './animActions';
import { playNode } from './engine';
import { TRIGGERS } from './meta';

const DIRECTIONS: { value: KAnimation['direction']; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'reverse', label: 'Reverse' },
  { value: 'alternate', label: 'Alternate' },
  { value: 'alternate-reverse', label: 'Alt. reverse' },
];
const FILLS: { value: KAnimation['fill']; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'forwards', label: 'Forwards' },
  { value: 'backwards', label: 'Backwards' },
  { value: 'both', label: 'Both' },
];

const SPRINGS: { id: string; label: string; k: number; c: number }[] = [
  { id: 'gentle', label: 'Gentle', k: 170, c: 20 },
  { id: 'snappy', label: 'Snappy', k: 320, c: 24 },
  { id: 'bouncy', label: 'Bouncy', k: 180, c: 9 },
  { id: 'wobbly', label: 'Wobbly', k: 120, c: 5 },
];

type Target = 'self' | 'children' | 'svg';
const targetOf = (a: KAnimation): Target => (a.targetSelector ? 'svg' : a.stagger != null ? 'children' : 'self');

export function AnimationEditor({ nodeId, anim }: { nodeId: NodeId; anim: KAnimation }) {
  const edit = (recipe: (a: Draft<KAnimation>) => void, key?: string, label?: string) =>
    editAnimation(nodeId, anim.id, recipe, { coalesceKey: key ? `anim:${anim.id}:${key}` : undefined, label });
  const infinite = anim.iterations < 0 || anim.trigger === 'loop';
  const [spring, setSpring] = useState({ k: 180, c: 12 });

  const known = EASINGS.find((e) => e.value === anim.easing);
  const isBezier = !!parseCubicBezier(anim.easing);
  const easingOptions = [
    ...EASINGS.map((e) => ({ value: e.value, label: e.label })),
    ...(known ? [] : [{ value: anim.easing, label: anim.easing.startsWith('linear(') ? 'Custom spring' : isBezier ? 'Custom curve' : anim.easing }]),
  ];
  if (known || !isBezier) easingOptions.push({ value: '__custom', label: 'Custom curve…' });

  const target = targetOf(anim);

  return (
    <div className="k-anim-editor" data-testid="anim-editor">
      <Section
        title="Timing"
        id="anim-timing"
        actions={
          <IconButton label="Replay" size="sm" onClick={() => playNode(nodeId, anim.id)} data-testid="anim-replay">
            <RotateCcw />
          </IconButton>
        }
      >
        <Row label="Name">
          <TextInput value={anim.name} onCommit={(v) => v.trim() && edit((a) => void (a.name = v.trim()), undefined, 'Rename animation')} />
        </Row>
        <Row label="Trigger">
          <Select
            ariaLabel="Trigger"
            value={anim.trigger}
            onChange={(v) =>
              edit((a) => {
                const wasLoop = a.trigger === 'loop';
                a.trigger = v;
                if (v === 'loop') a.iterations = -1;
                else if (wasLoop && a.iterations < 0) a.iterations = 1;
              }, undefined, 'Change trigger')
            }
            options={TRIGGERS.map((t) => ({ value: t.id, label: t.label, icon: <span className="k-anim-trigger-ico" style={{ color: t.color }}>{t.icon}</span> }))}
          />
        </Row>
        <Row label="Timing">
          <div className="k-grid2">
            <NumberField
              label={<Timer />}
              labelTitle="Duration (drag to scrub)"
              value={anim.duration}
              min={1}
              step={10}
              precision={0}
              suffix="ms"
              onChange={(v) => edit((a) => void (a.duration = Math.max(1, Math.round(v))), 'duration', 'Change duration')}
            />
            <NumberField
              label={<Hourglass />}
              labelTitle="Delay (drag to scrub)"
              value={anim.delay}
              min={0}
              step={10}
              precision={0}
              suffix="ms"
              onChange={(v) => edit((a) => void (a.delay = Math.max(0, Math.round(v))), 'delay', 'Change delay')}
            />
          </div>
        </Row>
        <Row label="Repeat">
          <div className="k-hstack">
            <NumberField
              label={<Repeat2 />}
              labelTitle="Iterations"
              value={infinite ? null : anim.iterations}
              placeholder="∞"
              disabled={infinite}
              min={1}
              max={999}
              step={1}
              precision={0}
              suffix={infinite ? undefined : '×'}
              onChange={(v) => edit((a) => void (a.iterations = Math.max(1, Math.round(v))), 'iterations', 'Change iterations')}
              className="k-anim-grow"
            />
            <IconButton
              label={anim.trigger === 'loop' ? 'Loop trigger always repeats' : infinite ? 'Repeat a fixed number of times' : 'Repeat forever'}
              active={infinite}
              disabled={anim.trigger === 'loop'}
              onClick={() => edit((a) => void (a.iterations = a.iterations < 0 ? 1 : -1), undefined, 'Toggle infinite')}
              data-testid="anim-infinite"
            >
              <InfinityIcon />
            </IconButton>
          </div>
        </Row>
        <Row label="Play">
          <div className="k-grid2">
            <Select ariaLabel="Direction" value={anim.direction} onChange={(v) => edit((a) => void (a.direction = v), undefined, 'Change direction')} options={DIRECTIONS} />
            <Select ariaLabel="Fill mode" value={anim.fill} onChange={(v) => edit((a) => void (a.fill = v), undefined, 'Change fill mode')} options={FILLS.map((f) => ({ ...f, label: `Fill: ${f.label}` }))} />
          </div>
        </Row>
      </Section>

      <Section title="Easing" id="anim-easing">
        <Select
          ariaLabel="Easing"
          value={anim.easing}
          onChange={(v) =>
            edit((a) => {
              if (v !== '__custom') a.easing = v;
              else {
                const p = parseCubicBezier(a.easing) ?? [0.25, 0.1, 0.25, 1];
                a.easing = `cubic-bezier(${p.join(', ')})`;
              }
            }, undefined, 'Change easing')
          }
          options={easingOptions}
        />
        <CurveEditor easing={anim.easing} onChange={(v) => edit((a) => void (a.easing = v), 'easing-curve', 'Edit easing curve')} />
        <div className="k-anim-springs">
          <span className="k-label">Spring</span>
          {SPRINGS.map((s) => {
            const value = springEasing(1, s.k, s.c);
            return (
              <button
                key={s.id}
                className="k-anim-chip"
                aria-selected={anim.easing === value}
                onClick={() => {
                  setSpring({ k: s.k, c: s.c });
                  edit((a) => void (a.easing = value), undefined, `Spring: ${s.label}`);
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="k-grid2" style={{ marginTop: 6 }}>
          <NumberField
            label="K"
            labelTitle="Spring stiffness"
            value={spring.k}
            min={20}
            max={1000}
            step={5}
            precision={0}
            onChange={(v) => {
              const k = Math.round(v);
              setSpring((s) => ({ ...s, k }));
              edit((a) => void (a.easing = springEasing(1, k, spring.c)), 'spring', 'Edit spring');
            }}
          />
          <NumberField
            label="D"
            labelTitle="Spring damping"
            value={spring.c}
            min={1}
            max={100}
            step={0.5}
            precision={1}
            onChange={(v) => {
              setSpring((s) => ({ ...s, c: v }));
              edit((a) => void (a.easing = springEasing(1, spring.k, v)), 'spring', 'Edit spring');
            }}
          />
        </div>
      </Section>

      <Section title="Targets" id="anim-targets">
        <Segmented<Target>
          value={target}
          onChange={(v) =>
            edit((a) => {
              if (v === 'self') {
                delete a.stagger;
                delete a.targetSelector;
              } else if (v === 'children') {
                delete a.targetSelector;
                a.stagger = a.stagger ?? 80;
              } else {
                a.targetSelector = SVG_SHAPES_SELECTOR;
                a.stagger = a.stagger ?? 120;
              }
            }, undefined, 'Change animation target')
          }
          options={[
            { value: 'self', label: 'Self', tooltip: 'Animate this layer' },
            { value: 'children', label: 'Children', tooltip: 'Animate each child in sequence' },
            { value: 'svg', label: 'SVG shapes', tooltip: 'Animate each vector shape (paths, circles, …)' },
          ]}
        />
        {target !== 'self' && (
          <Row label="Stagger">
            <NumberField
              value={anim.stagger ?? 0}
              min={0}
              max={5000}
              step={5}
              precision={0}
              suffix="ms"
              label="⇢"
              labelTitle="Delay between each target"
              onChange={(v) => edit((a) => void (a.stagger = Math.max(0, Math.round(v))), 'stagger', 'Change stagger')}
            />
          </Row>
        )}
      </Section>
    </div>
  );
}
