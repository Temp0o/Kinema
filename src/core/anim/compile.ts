/**
 * Animation compilation: one KAnimation model → Web Animations API keyframes
 * (editor playback / scrubbing) and CSS @keyframes (export). Both are produced
 * from the same normalized keyframe list, so editor previews match exports.
 */
import type { KAnimation, Keyframe, KeyframeValues } from '../model/types';
import { kebabToCamel } from '../style/style';

/** Transform channels and their identity values. */
export const TRANSFORM_CHANNELS = {
  x: 0,
  y: 0,
  rotate: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
} as const;
export type TransformChannel = keyof typeof TRANSFORM_CHANNELS;

export function isTransformChannel(k: string): k is TransformChannel {
  return k in TRANSFORM_CHANNELS;
}

/** Human labels for channels shown in the timeline. */
export const CHANNEL_LABELS: Record<string, string> = {
  x: 'Move X',
  y: 'Move Y',
  rotate: 'Rotate',
  scale: 'Scale',
  scaleX: 'Scale X',
  scaleY: 'Scale Y',
  skewX: 'Skew X',
  skewY: 'Skew Y',
  opacity: 'Opacity',
  filter: 'Filter',
  'background-color': 'Background',
  color: 'Text color',
  'box-shadow': 'Shadow',
  'clip-path': 'Clip path',
  'border-radius': 'Radius',
  'stroke-dashoffset': 'Stroke offset',
  'letter-spacing': 'Letter spacing',
  width: 'Width',
  height: 'Height',
};

function unitize(v: string | number, unit: string): string {
  if (typeof v === 'number') return `${v}${unit}`;
  const s = v.trim();
  return /^-?\d*\.?\d+$/.test(s) ? `${s}${unit}` : s;
}

function num(v: string | number | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v === 'number') return v;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Sorted copy with offsets clamped to [0,1]. Ensures at least 0 and 1 keyframes exist. */
export function normalizeKeyframes(kfs: Keyframe[]): Keyframe[] {
  const sorted = [...kfs]
    .map((k) => ({ ...k, offset: Math.min(1, Math.max(0, k.offset)) }))
    .sort((a, b) => a.offset - b.offset);
  return sorted;
}

/**
 * For each keyframe, compute a full set of transform channel values, linearly
 * interpolating channels a keyframe doesn't specify from its neighbours.
 */
function fillTransformChannels(kfs: Keyframe[]): Array<Partial<Record<TransformChannel, string | number>>> {
  const used = new Set<TransformChannel>();
  for (const k of kfs) for (const key of Object.keys(k.values)) if (isTransformChannel(key)) used.add(key);
  const out: Array<Partial<Record<TransformChannel, string | number>>> = kfs.map(() => ({}));
  for (const ch of used) {
    const defined = kfs.map((k, i) => ({ i, off: k.offset, v: k.values[ch] })).filter((e) => e.v !== undefined);
    for (let i = 0; i < kfs.length; i++) {
      const own = kfs[i].values[ch];
      if (own !== undefined) {
        out[i][ch] = own;
        continue;
      }
      const prev = [...defined].reverse().find((e) => e.off <= kfs[i].offset);
      const next = defined.find((e) => e.off >= kfs[i].offset);
      if (prev && next && prev !== next && typeof prev.v !== 'string' && typeof next.v !== 'string') {
        const t = (kfs[i].offset - prev.off) / (next.off - prev.off || 1);
        out[i][ch] = num(prev.v, 0) + (num(next.v, 0) - num(prev.v, 0)) * t;
      } else if (prev) out[i][ch] = prev.v;
      else if (next) out[i][ch] = next.v;
      else out[i][ch] = TRANSFORM_CHANNELS[ch];
    }
  }
  return out;
}

/** Compose transform channels into a CSS transform string ('' when no channels). */
export function composeTransform(ch: Partial<Record<TransformChannel, string | number>>): string {
  const parts: string[] = [];
  if (ch.x !== undefined || ch.y !== undefined) parts.push(`translate(${unitize(ch.x ?? 0, 'px')}, ${unitize(ch.y ?? 0, 'px')})`);
  if (ch.rotate !== undefined) parts.push(`rotate(${unitize(ch.rotate, 'deg')})`);
  if (ch.scale !== undefined) parts.push(`scale(${ch.scale})`);
  if (ch.scaleX !== undefined || ch.scaleY !== undefined) parts.push(`scale(${ch.scaleX ?? 1}, ${ch.scaleY ?? 1})`);
  if (ch.skewX !== undefined || ch.skewY !== undefined) parts.push(`skew(${unitize(ch.skewX ?? 0, 'deg')}, ${unitize(ch.skewY ?? 0, 'deg')})`);
  return parts.join(' ');
}

/** Non-transform keyframe values as CSS declarations (kebab-case). */
function cssValues(values: KeyframeValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (isTransformChannel(k)) continue;
    out[k] = typeof v === 'number' ? (k === 'opacity' || k === 'z-index' ? String(v) : unitlessOrPx(k, v)) : v;
  }
  return out;
}

const UNITLESS = new Set(['opacity', 'z-index', 'flex-grow', 'flex-shrink', 'order', 'line-height', 'font-weight', 'stroke-dashoffset', 'scale']);
function unitlessOrPx(k: string, v: number): string {
  return UNITLESS.has(k) ? String(v) : `${v}px`;
}

export interface CompiledFrame {
  offset: number;
  easing?: string;
  /** kebab-case CSS declarations including composed `transform` */
  decls: Record<string, string>;
}

/** Normalize an animation's keyframes into fully composed frames. */
export function compileFrames(anim: Pick<KAnimation, 'keyframes'>): CompiledFrame[] {
  const kfs = normalizeKeyframes(anim.keyframes);
  const transforms = fillTransformChannels(kfs);
  return kfs.map((k, i) => {
    const decls = cssValues(k.values);
    const t = composeTransform(transforms[i]);
    if (t) decls.transform = t;
    return { offset: k.offset, easing: k.easing, decls };
  });
}

/** WAAPI keyframes for element.animate(). */
export function toWaapiKeyframes(anim: Pick<KAnimation, 'keyframes' | 'easing'>): globalThis.Keyframe[] {
  return compileFrames(anim).map((f) => {
    const k: Record<string, string | number> = { offset: f.offset };
    if (f.easing) k.easing = f.easing;
    for (const [p, v] of Object.entries(f.decls)) k[p.startsWith('--') ? p : kebabToCamel(p)] = v;
    return k as globalThis.Keyframe;
  });
}

export function toWaapiTiming(anim: KAnimation, delayOffset = 0): KeyframeAnimationOptions {
  return {
    duration: Math.max(1, anim.duration),
    delay: anim.delay + delayOffset,
    iterations: anim.iterations < 0 || anim.trigger === 'loop' ? Infinity : Math.max(1, anim.iterations),
    direction: anim.direction,
    fill: anim.fill,
    easing: anim.easing || 'ease',
  };
}

/** CSS @keyframes block text. */
export function toCssKeyframes(anim: Pick<KAnimation, 'keyframes'>, name: string, indent = ''): string {
  const frames = compileFrames(anim);
  const lines: string[] = [`${indent}@keyframes ${name} {`];
  for (const f of frames) {
    const pct = `${Math.round(f.offset * 10000) / 100}%`;
    const decls = Object.entries(f.decls).map(([k, v]) => `${k}: ${v};`);
    if (f.easing) decls.push(`animation-timing-function: ${f.easing};`);
    lines.push(`${indent}  ${pct} { ${decls.join(' ')} }`);
  }
  lines.push(`${indent}}`);
  return lines.join('\n');
}

/** CSS `animation` shorthand for a compiled keyframes name. */
export function toCssAnimationShorthand(anim: KAnimation, name: string, delayOffset = 0): string {
  const iters = anim.iterations < 0 || anim.trigger === 'loop' ? 'infinite' : String(Math.max(1, anim.iterations));
  return `${name} ${Math.max(1, anim.duration)}ms ${anim.easing || 'ease'} ${anim.delay + delayOffset}ms ${iters} ${anim.direction} ${anim.fill}`;
}

/** Total time (ms) of one full run incl. delay & finite iterations (Infinity for infinite). */
export function animTotalDuration(anim: KAnimation, staggerCount = 0): number {
  const iters = anim.iterations < 0 || anim.trigger === 'loop' ? Infinity : Math.max(1, anim.iterations);
  return anim.delay + (anim.stagger ?? 0) * Math.max(0, staggerCount - 1) + anim.duration * iters;
}

// ─── Easing helpers ─────────────────────────────────────────────────────────

export const EASINGS: { id: string; label: string; value: string }[] = [
  { id: 'linear', label: 'Linear', value: 'linear' },
  { id: 'ease', label: 'Ease', value: 'ease' },
  { id: 'ease-in', label: 'Ease in', value: 'ease-in' },
  { id: 'ease-out', label: 'Ease out', value: 'ease-out' },
  { id: 'ease-in-out', label: 'Ease in-out', value: 'ease-in-out' },
  { id: 'out-quart', label: 'Smooth out', value: 'cubic-bezier(0.25, 1, 0.5, 1)' },
  { id: 'out-expo', label: 'Expo out', value: 'cubic-bezier(0.16, 1, 0.3, 1)' },
  { id: 'in-out-quint', label: 'Quint in-out', value: 'cubic-bezier(0.83, 0, 0.17, 1)' },
  { id: 'out-back', label: 'Back out', value: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  { id: 'in-back', label: 'Back in', value: 'cubic-bezier(0.36, 0, 0.66, -0.56)' },
  { id: 'anticipate', label: 'Anticipate', value: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)' },
  { id: 'spring-soft', label: 'Spring (soft)', value: springEasing(1, 120, 14) },
  { id: 'spring-bouncy', label: 'Spring (bouncy)', value: springEasing(1, 180, 9) },
  { id: 'spring-snappy', label: 'Spring (snappy)', value: springEasing(1, 300, 20) },
  { id: 'steps', label: 'Steps (5)', value: 'steps(5, end)' },
];

/**
 * Damped-spring easing as a CSS `linear()` function (supported by Chromium/Electron
 * and modern browsers). The curve is normalized to the spring's settle time, so
 * the animation's duration controls the overall speed.
 */
export function springEasing(mass = 1, stiffness = 170, damping = 12, samples = 40): string {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const pos = (t: number) => {
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };
  // settle time: when envelope < 0.1%
  const settle = Math.min(10, Math.max(0.3, Math.log(1000) / (zeta * w0 || 1)));
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * settle;
    const v = i === samples ? 1 : pos(t);
    pts.push((Math.round(v * 10000) / 10000).toString());
  }
  return `linear(${pts.join(', ')})`;
}

/** Parse a cubic-bezier() string into control points; named easings mapped too. */
export function parseCubicBezier(easing: string): [number, number, number, number] | null {
  const named: Record<string, [number, number, number, number]> = {
    linear: [0, 0, 1, 1],
    ease: [0.25, 0.1, 0.25, 1],
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    'ease-in-out': [0.42, 0, 0.58, 1],
  };
  if (named[easing]) return named[easing];
  const m = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(easing);
  return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])] : null;
}
