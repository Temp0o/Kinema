/**
 * AI animation spec: the JSON schema sent to Ollama as `format` (structured
 * output) and the validator that turns whatever the model returned into safe
 * KAnimations (targets checked, units/ranges clamped, keyframes normalised).
 */
import type { AnimTrigger, KAnimation, Keyframe, KeyframeValues } from '../model/types';
import { uid } from '../model/factory';
import { EASINGS } from '../anim/compile';

export const ANIMATION_SCHEMA = {
  type: 'object',
  properties: {
    animations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          target: { type: 'string' },
          name: { type: 'string' },
          trigger: { type: 'string', enum: ['load', 'inView', 'hover', 'click', 'loop'] },
          duration: { type: 'number' },
          delay: { type: 'number' },
          easing: { type: 'string' },
          iterations: { type: 'number' },
          stagger: { type: 'number' },
          targetSelector: { type: 'string' },
          keyframes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                offset: { type: 'number' },
                opacity: { type: 'number' },
                x: { type: 'number' },
                y: { type: 'number' },
                scale: { type: 'number' },
                rotate: { type: 'number' },
                blur: { type: 'number' },
                color: { type: 'string' },
                backgroundColor: { type: 'string' },
              },
              required: ['offset'],
            },
          },
        },
        required: ['target', 'name', 'trigger', 'duration', 'keyframes'],
      },
    },
  },
  required: ['animations'],
} as const;

export interface AnimTargetInfo {
  id: string;
  name: string;
}

export interface ValidatedAnimation {
  target: string;
  anim: KAnimation;
}

export interface AnimValidation {
  items: ValidatedAnimation[];
  warnings: string[];
}

const TRIGGERS: AnimTrigger[] = ['load', 'inView', 'hover', 'click', 'loop'];
const DEFAULT_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
const EASING_RE = /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|cubic-bezier\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\)|steps\(\s*\d+\s*(,\s*(start|end|jump-[a-z]+))?\s*\)|linear\([\d.,\s%-]+\))$/;
const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\([^;{}]*\)|[a-z]{3,20})$/i;
const SELECTOR_RE = /^[a-z0-9\s.#>+~*,:_()-]{1,60}$/i;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    if (Number.isFinite(n)) return /\ds$/.test(v.trim()) && !/ms$/.test(v.trim()) ? n * 1000 : n;
  }
  return null;
}

/** Durations: small values are seconds ("0.6" → 600ms). */
function ms(v: unknown, fallback: number, lo: number, hi: number): number {
  let n = num(v);
  if (n == null) return fallback;
  if (n > 0 && n < 20) n *= 1000;
  return Math.round(clamp(n, lo, hi));
}

const EASING_ALIASES: Record<string, string> = {
  easeout: 'ease-out',
  easein: 'ease-in',
  easeinout: 'ease-in-out',
  smooth: DEFAULT_EASING,
  spring: EASINGS.find((e) => e.id === 'spring-soft')!.value,
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  back: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  backout: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  elastic: EASINGS.find((e) => e.id === 'spring-bouncy')!.value,
  expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
  expoout: 'cubic-bezier(0.16, 1, 0.3, 1)',
  quartout: 'cubic-bezier(0.25, 1, 0.5, 1)',
  cubicout: 'cubic-bezier(0.33, 1, 0.68, 1)',
};

export function normalizeEasing(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) return DEFAULT_EASING;
  const s = v.trim();
  if (EASING_RE.test(s)) return s.replace(/\s+/g, ' ');
  const key = s.toLowerCase().replace(/[^a-z]/g, '');
  if (EASING_ALIASES[key]) return EASING_ALIASES[key];
  const preset = EASINGS.find((e) => e.id === s || e.label.toLowerCase() === s.toLowerCase());
  if (preset) return preset.value;
  if (key.includes('spring')) return EASING_ALIASES.spring;
  if (key.includes('bounce') || key.includes('back')) return EASING_ALIASES.bounce;
  if (key.includes('inout')) return 'ease-in-out';
  if (key.includes('out')) return DEFAULT_EASING;
  if (key.includes('in')) return 'ease-in';
  return DEFAULT_EASING;
}

/** Identity value for each channel (the element's natural state). */
const IDENTITY: KeyframeValues = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0, filter: 'blur(0px)' };

function keyframeValues(raw: Record<string, unknown>): KeyframeValues {
  const v: KeyframeValues = {};
  const o = num(raw.opacity);
  if (o != null) v.opacity = Math.round(clamp(o > 1 && o <= 100 ? o / 100 : o, 0, 1) * 1000) / 1000;
  for (const k of ['x', 'y'] as const) {
    const n = num(raw[k]);
    if (n != null) v[k] = Math.round(clamp(n, -2000, 2000) * 10) / 10;
  }
  const s = num(raw.scale);
  if (s != null) v.scale = Math.round(clamp(s > 10 && s <= 1000 ? s / 100 : s, 0, 10) * 1000) / 1000;
  const r = num(raw.rotate);
  if (r != null) v.rotate = Math.round(clamp(r, -3600, 3600) * 10) / 10;
  const b = num(raw.blur);
  if (b != null) v.filter = `blur(${Math.round(clamp(b, 0, 100) * 10) / 10}px)`;
  if (typeof raw.color === 'string' && COLOR_RE.test(raw.color.trim())) v.color = raw.color.trim();
  const bg = raw.backgroundColor ?? raw['background-color'] ?? raw.background;
  if (typeof bg === 'string' && COLOR_RE.test(bg.trim())) v['background-color'] = bg.trim();
  return v;
}

/** Sort, clamp and complete keyframes: ≥2 frames, offsets 0..1, first at 0 and last at 1. */
export function normalizeAiKeyframes(raw: unknown[]): Keyframe[] {
  const frames: { offset: number; values: KeyframeValues }[] = [];
  raw.forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    const rec = r as Record<string, unknown>;
    let off = num(rec.offset);
    if (off == null) off = raw.length > 1 ? i / (raw.length - 1) : 0;
    if (off > 1 && off <= 100) off /= 100;
    off = clamp(off, 0, 1);
    const values = keyframeValues(rec);
    if (!Object.keys(values).length) return;
    const same = frames.find((f) => Math.abs(f.offset - off!) < 1e-4);
    if (same) Object.assign(same.values, values);
    else frames.push({ offset: off, values });
  });
  frames.sort((a, b) => a.offset - b.offset);
  if (!frames.length) return [];
  const channels = [...new Set(frames.flatMap((f) => Object.keys(f.values)))];
  const identity = (): KeyframeValues => Object.fromEntries(channels.filter((c) => c in IDENTITY).map((c) => [c, IDENTITY[c]]));
  if (frames.length === 1) {
    const only = frames[0];
    if (only.offset >= 0.5) frames.unshift({ offset: 0, values: { ...identity(), ...pickInverse(only.values) } });
    else frames.push({ offset: 1, values: identity() });
  }
  if (frames[0].offset > 0) frames.unshift({ offset: 0, values: { ...frames[0].values } });
  if (frames[frames.length - 1].offset < 1) frames.push({ offset: 1, values: { ...frames[frames.length - 1].values } });
  return frames.slice(0, 12).map((f, i, arr) => ({ id: uid('k'), offset: i === arr.length - 1 ? 1 : Math.round(f.offset * 1000) / 1000, values: f.values }));
}

/** For a single "to" frame, derive a plausible "from" (keeps colors as-is). */
function pickInverse(v: KeyframeValues): KeyframeValues {
  const out: KeyframeValues = {};
  for (const [k, val] of Object.entries(v)) if (!(k in IDENTITY)) out[k] = val;
  return out;
}

/**
 * Validate a model's animation JSON. `targets` are the data-kids the model was
 * allowed to use. Invalid targets are re-mapped by name or (single target) to
 * the only target; otherwise dropped with a warning.
 */
export function validateAnimations(json: unknown, targets: AnimTargetInfo[]): AnimValidation {
  const warnings: string[] = [];
  let list: unknown[] = [];
  if (Array.isArray(json)) list = json;
  else if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    if (Array.isArray(o.animations)) list = o.animations;
    else if (o.keyframes) list = [o];
  }
  const byId = new Map(targets.map((t) => [t.id, t]));
  const byName = new Map(targets.map((t) => [t.name.toLowerCase(), t]));
  const items: ValidatedAnimation[] = [];
  for (const entry of list.slice(0, 30)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const rawTarget = String(e.target ?? e.id ?? e['data-kid'] ?? '').trim().replace(/^\[?data-kid=["']?|["']?\]$/g, '');
    let target = byId.get(rawTarget) ?? byName.get(rawTarget.toLowerCase());
    if (!target && targets.length === 1) target = targets[0];
    if (!target) {
      warnings.push(`Skipped an animation for unknown element “${rawTarget.slice(0, 30)}”.`);
      continue;
    }
    const keyframes = normalizeAiKeyframes(Array.isArray(e.keyframes) ? e.keyframes : []);
    if (keyframes.length < 2) {
      warnings.push(`Skipped “${String(e.name ?? 'animation')}” — it had no usable keyframes.`);
      continue;
    }
    let trigger = (TRIGGERS.find((t) => t.toLowerCase() === String(e.trigger ?? '').toLowerCase()) ?? 'load') as AnimTrigger;
    const rawIter = e.iterations;
    let iterations = 1;
    if (rawIter === 'infinite' || rawIter === -1 || rawIter === Infinity || (typeof rawIter === 'number' && rawIter > 100)) iterations = -1;
    else if (num(rawIter) != null) iterations = Math.round(clamp(num(rawIter)!, 1, 100));
    if (trigger === 'loop') iterations = -1;
    if (iterations === -1 && trigger === 'load') trigger = 'loop';
    const stagger = ms(e.stagger, 0, 0, 2000);
    const anim: KAnimation = {
      id: uid('a'),
      name: String(e.name ?? 'AI animation').replace(/\s+/g, ' ').trim().slice(0, 40) || 'AI animation',
      trigger,
      duration: ms(e.duration, 600, 50, 10000),
      delay: ms(e.delay, 0, 0, 10000),
      iterations,
      direction: trigger === 'loop' && /alternate/i.test(String(e.direction ?? '')) ? 'alternate' : 'normal',
      fill: 'both',
      easing: normalizeEasing(e.easing),
      keyframes,
      presetId: 'ai',
      enabled: true,
    };
    if (stagger > 0) anim.stagger = stagger;
    if (typeof e.targetSelector === 'string' && SELECTOR_RE.test(e.targetSelector.trim()) && e.targetSelector.trim() !== '*') anim.targetSelector = e.targetSelector.trim();
    items.push({ target: target.id, anim });
  }
  if (!items.length && !warnings.length) warnings.push('The reply contained no animations.');
  return { items, warnings };
}
