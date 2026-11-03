/**
 * Built-in animation presets. Every `make()` returns a brand-new KAnimation with
 * fresh ids, ready to push onto a node. Timings are tuned by hand: entrances use
 * expo/quart outs or damped springs, exits use quick ease-ins, loops use sine.
 */
import type { AnimTrigger, KAnimation, KeyframeValues } from '../model/types';
import { uid } from '../model/factory';
import { springEasing } from './compile';
import { SVG_SHAPES_SELECTOR } from './svg';

export type PresetCategory = 'entrance' | 'emphasis' | 'loop' | 'hover' | 'exit' | 'stagger' | 'svg' | 'scroll';

/** Which demo shape the preset browser uses for the live thumbnail. */
export type PresetDemo = 'box' | 'text' | 'children' | 'svg' | 'gradient' | 'shimmer' | 'button' | 'bell';

export interface AnimationPreset {
  id: string;
  name: string;
  category: PresetCategory;
  description: string;
  defaultTrigger: AnimTrigger;
  demo: PresetDemo;
  make(): KAnimation;
}

export const PRESET_CATEGORIES: { id: PresetCategory; label: string; hint: string }[] = [
  { id: 'entrance', label: 'Entrance', hint: 'Bring elements in when the page loads' },
  { id: 'scroll', label: 'Scroll', hint: 'Reveal elements as they scroll into view' },
  { id: 'emphasis', label: 'Emphasis', hint: 'Draw attention to an element' },
  { id: 'hover', label: 'Hover', hint: 'Micro-interactions on hover' },
  { id: 'loop', label: 'Loop', hint: 'Ambient motion that runs forever' },
  { id: 'exit', label: 'Exit', hint: 'Take elements out (on click by default)' },
  { id: 'stagger', label: 'Stagger', hint: 'Animate a container’s children in sequence' },
  { id: 'svg', label: 'SVG', hint: 'Draw strokes and recolor vectors' },
];

// ─── Curves ─────────────────────────────────────────────────────────────────

export const EASE = {
  expoOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
  quartOut: 'cubic-bezier(0.25, 1, 0.5, 1)',
  quintOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
  circOut: 'cubic-bezier(0, 0.55, 0.45, 1)',
  backOut: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  quartIn: 'cubic-bezier(0.5, 0, 0.75, 0)',
  expoIn: 'cubic-bezier(0.7, 0, 0.84, 0)',
  quadIn: 'cubic-bezier(0.11, 0, 0.5, 0)',
  quadOut: 'cubic-bezier(0.5, 1, 0.89, 1)',
  sineInOut: 'cubic-bezier(0.37, 0, 0.63, 1)',
  quintInOut: 'cubic-bezier(0.83, 0, 0.17, 1)',
  revealInOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
  shake: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)',
  ping: 'cubic-bezier(0, 0, 0.2, 1)',
  springGentle: springEasing(1, 170, 20),
  springPop: springEasing(1, 200, 13),
  springBouncy: springEasing(1, 180, 9),
  springSnappy: springEasing(1, 320, 24),
} as const;

const BRAND = 'rgba(124, 92, 255,';

// ─── Builder ────────────────────────────────────────────────────────────────

type Frame = [offset: number, values: KeyframeValues, easing?: string];

interface Spec {
  id: string;
  name: string;
  category: PresetCategory;
  description: string;
  trigger?: AnimTrigger;
  demo?: PresetDemo;
  duration: number;
  delay?: number;
  iterations?: number;
  direction?: KAnimation['direction'];
  fill?: KAnimation['fill'];
  easing: string;
  stagger?: number;
  targetSelector?: string;
  frames: Frame[];
}

const DEFAULT_TRIGGER: Record<PresetCategory, AnimTrigger> = {
  entrance: 'load',
  scroll: 'inView',
  emphasis: 'load',
  hover: 'hover',
  loop: 'loop',
  exit: 'click',
  stagger: 'load',
  svg: 'load',
};

const DEFAULT_FILL: Record<PresetCategory, KAnimation['fill']> = {
  entrance: 'both',
  scroll: 'both',
  emphasis: 'none',
  hover: 'forwards',
  loop: 'both',
  exit: 'forwards',
  stagger: 'both',
  svg: 'both',
};

function define(spec: Spec): AnimationPreset {
  const trigger = spec.trigger ?? DEFAULT_TRIGGER[spec.category];
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    description: spec.description,
    defaultTrigger: trigger,
    demo: spec.demo ?? (spec.category === 'stagger' ? 'children' : spec.category === 'svg' ? 'svg' : spec.category === 'hover' ? 'button' : 'box'),
    make() {
      const a: KAnimation = {
        id: uid('a'),
        name: spec.name,
        trigger,
        duration: spec.duration,
        delay: spec.delay ?? 0,
        iterations: spec.iterations ?? (trigger === 'loop' ? -1 : 1),
        direction: spec.direction ?? 'normal',
        fill: spec.fill ?? DEFAULT_FILL[spec.category],
        easing: spec.easing,
        keyframes: spec.frames.map(([offset, values, easing]) => (easing ? { id: uid('k'), offset, values: { ...values }, easing } : { id: uid('k'), offset, values: { ...values } })),
        presetId: spec.id,
        enabled: true,
      };
      if (spec.stagger !== undefined) a.stagger = spec.stagger;
      if (spec.targetSelector) a.targetSelector = spec.targetSelector;
      return a;
    },
  };
}

// ─── Entrance ───────────────────────────────────────────────────────────────

const ENTRANCES: Spec[] = [
  {
    id: 'fade-in',
    name: 'Fade in',
    category: 'entrance',
    description: 'A soft, simple opacity fade.',
    duration: 700,
    easing: EASE.quartOut,
    frames: [
      [0, { opacity: 0 }],
      [1, { opacity: 1 }],
    ],
  },
  {
    id: 'fade-up',
    name: 'Fade up',
    category: 'entrance',
    description: 'Rises 24px while fading in — the go-to entrance.',
    duration: 800,
    easing: EASE.expoOut,
    frames: [
      [0, { opacity: 0, y: 24 }],
      [1, { opacity: 1, y: 0 }],
    ],
  },
  {
    id: 'fade-down',
    name: 'Fade down',
    category: 'entrance',
    description: 'Settles down from above while fading in.',
    duration: 800,
    easing: EASE.expoOut,
    frames: [
      [0, { opacity: 0, y: -24 }],
      [1, { opacity: 1, y: 0 }],
    ],
  },
  {
    id: 'fade-left',
    name: 'Fade from left',
    category: 'entrance',
    description: 'Glides in from the left.',
    duration: 800,
    easing: EASE.expoOut,
    frames: [
      [0, { opacity: 0, x: -32 }],
      [1, { opacity: 1, x: 0 }],
    ],
  },
  {
    id: 'fade-right',
    name: 'Fade from right',
    category: 'entrance',
    description: 'Glides in from the right.',
    duration: 800,
    easing: EASE.expoOut,
    frames: [
      [0, { opacity: 0, x: 32 }],
      [1, { opacity: 1, x: 0 }],
    ],
  },
  {
    id: 'zoom-in',
    name: 'Zoom in',
    category: 'entrance',
    description: 'Scales up from 85% with a fade.',
    duration: 700,
    easing: EASE.expoOut,
    frames: [
      [0, { opacity: 0, scale: 0.85 }],
      [1, { opacity: 1, scale: 1 }],
    ],
  },
  {
    id: 'pop',
    name: 'Pop',
    category: 'entrance',
    description: 'Springs in from half size with a playful overshoot.',
    duration: 800,
    easing: EASE.springPop,
    frames: [
      [0, { opacity: 0, scale: 0.5 }, EASE.springPop],
      [1, { opacity: 1, scale: 1 }],
    ],
  },
  {
    id: 'blur-in',
    name: 'Blur in',
    category: 'entrance',
    description: 'Comes into focus from a soft blur.',
    duration: 900,
    easing: EASE.quartOut,
    frames: [
      [0, { opacity: 0, filter: 'blur(12px)' }],
      [1, { opacity: 1, filter: 'blur(0px)' }],
    ],
  },
  {
    id: 'flip-in-x',
    name: 'Flip in X',
    category: 'entrance',
    description: 'Flips open around the horizontal axis.',
    duration: 900,
    easing: EASE.quartOut,
    frames: [
      [0, { opacity: 0, scaleY: 0.05, skewX: 8 }, EASE.quartOut],
      [0.55, { opacity: 1, scaleY: 1.06, skewX: -2 }, EASE.sineInOut],
      [1, { opacity: 1, scaleY: 1, skewX: 0 }],
    ],
  },
  {
    id: 'flip-in-y',
    name: 'Flip in Y',
    category: 'entrance',
    description: 'Flips open around the vertical axis.',
    duration: 900,
    easing: EASE.quartOut,
    frames: [
      [0, { opacity: 0, scaleX: 0.05, skewY: 8 }, EASE.quartOut],
      [0.55, { opacity: 1, scaleX: 1.06, skewY: -2 }, EASE.sineInOut],
      [1, { opacity: 1, scaleX: 1, skewY: 0 }],
    ],
  },
  {
    id: 'slide-up-bounce',
    name: 'Slide up + bounce',
    category: 'entrance',
    description: 'Slides up 60px and lands with a springy bounce.',
    duration: 1000,
    easing: EASE.springBouncy,
    frames: [
      [0, { opacity: 0, y: 60 }],
      [1, { opacity: 1, y: 0 }],
    ],
  },
  {
    id: 'rise-tilt',
    name: 'Rise & tilt',
    category: 'entrance',
    description: 'Rises while straightening from a slight tilt.',
    duration: 1000,
    easing: EASE.expoOut,
    frames: [
      [0, { opacity: 0, y: 40, rotate: -6 }],
      [1, { opacity: 1, y: 0, rotate: 0 }],
    ],
  },
  {
    id: 'drop-in',
    name: 'Drop in',
    category: 'entrance',
    description: 'Falls from above and bounces to rest.',
    duration: 1100,
    easing: 'linear',
    frames: [
      [0, { opacity: 0, y: -80, scaleY: 1 }, EASE.quadIn],
      [0.45, { opacity: 1, y: 0, scaleY: 0.94 }, EASE.quadOut],
      [0.64, { y: -16, scaleY: 1.02 }, EASE.quadIn],
      [0.8, { y: 0, scaleY: 0.98 }, EASE.quadOut],
      [0.9, { y: -4, scaleY: 1 }, EASE.quadIn],
      [1, { opacity: 1, y: 0, scaleY: 1 }],
    ],
  },
  {
    id: 'swing-in',
    name: 'Swing in',
    category: 'entrance',
    description: 'Swings down from its top edge like a hanging sign.',
    duration: 1100,
    easing: EASE.sineInOut,
    frames: [
      [0, { opacity: 0, rotate: -28, 'transform-origin': '50% 0%' }, EASE.quartOut],
      [0.45, { opacity: 1, rotate: 12, 'transform-origin': '50% 0%' }],
      [0.7, { rotate: -5, 'transform-origin': '50% 0%' }],
      [0.88, { rotate: 2, 'transform-origin': '50% 0%' }],
      [1, { opacity: 1, rotate: 0, 'transform-origin': '50% 0%' }],
    ],
  },
  {
    id: 'roll-in',
    name: 'Roll in',
    category: 'entrance',
    description: 'Rolls in from the left.',
    duration: 1000,
    easing: EASE.expoOut,
    frames: [
      [0, { opacity: 0, x: -120, rotate: -120 }],
      [1, { opacity: 1, x: 0, rotate: 0 }],
    ],
  },
  {
    id: 'reveal-right',
    name: 'Reveal left → right',
    category: 'entrance',
    description: 'Wipes into view from the left edge (clip-path).',
    duration: 1000,
    easing: EASE.revealInOut,
    frames: [
      [0, { 'clip-path': 'inset(0% 100% 0% 0%)' }],
      [1, { 'clip-path': 'inset(0% 0% 0% 0%)' }],
    ],
  },
  {
    id: 'reveal-up',
    name: 'Reveal up',
    category: 'entrance',
    description: 'Unmasks from the bottom while drifting up.',
    duration: 1000,
    easing: EASE.revealInOut,
    frames: [
      [0, { 'clip-path': 'inset(100% 0% 0% 0%)', y: 24 }],
      [1, { 'clip-path': 'inset(0% 0% 0% 0%)', y: 0 }],
    ],
  },
  {
    id: 'typewriter',
    name: 'Typewriter',
    category: 'entrance',
    description: 'Reveals text in discrete steps, like typing. Best on single-line text.',
    demo: 'text',
    duration: 1400,
    easing: 'steps(14, end)',
    frames: [
      [0, { 'clip-path': 'inset(0% 100% 0% 0%)' }],
      [1, { 'clip-path': 'inset(0% 0% 0% 0%)' }],
    ],
  },
  {
    id: 'stretch-in',
    name: 'Stretch in',
    category: 'entrance',
    description: 'Squashes and stretches into shape.',
    duration: 900,
    easing: EASE.sineInOut,
    frames: [
      [0, { opacity: 0, scaleX: 1.4, scaleY: 0.6 }, EASE.quartOut],
      [0.4, { opacity: 1, scaleX: 0.9, scaleY: 1.1 }],
      [0.7, { scaleX: 1.05, scaleY: 0.96 }],
      [1, { opacity: 1, scaleX: 1, scaleY: 1 }],
    ],
  },
  {
    id: 'focus-in',
    name: 'Focus in',
    category: 'entrance',
    description: 'Pulls into focus from a large, blurred state.',
    duration: 1000,
    easing: EASE.expoOut,
    frames: [
      [0, { opacity: 0, scale: 1.12, filter: 'blur(16px)' }],
      [1, { opacity: 1, scale: 1, filter: 'blur(0px)' }],
    ],
  },
  {
    id: 'glitch-in',
    name: 'Glitch in',
    category: 'entrance',
    description: 'Flickers in with jittery, sliced frames.',
    duration: 700,
    easing: 'steps(2, end)',
    frames: [
      [0, { opacity: 0, x: -12, 'clip-path': 'inset(40% 0% 40% 0%)' }],
      [0.18, { opacity: 1, x: 10, 'clip-path': 'inset(8% 0% 62% 0%)' }],
      [0.34, { x: -7, 'clip-path': 'inset(58% 0% 12% 0%)' }],
      [0.5, { x: 5, 'clip-path': 'inset(28% 0% 32% 0%)' }],
      [0.66, { x: -3, 'clip-path': 'inset(0% 0% 70% 0%)' }],
      [0.82, { x: 1, 'clip-path': 'inset(0% 0% 0% 0%)' }],
      [1, { opacity: 1, x: 0, 'clip-path': 'inset(0% 0% 0% 0%)' }],
    ],
  },
];

// ─── Emphasis ───────────────────────────────────────────────────────────────

const EMPHASIS: Spec[] = [
  {
    id: 'pulse',
    name: 'Pulse',
    category: 'emphasis',
    description: 'A gentle scale pulse.',
    duration: 900,
    iterations: 2,
    easing: EASE.sineInOut,
    frames: [
      [0, { scale: 1 }],
      [0.5, { scale: 1.06 }],
      [1, { scale: 1 }],
    ],
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    category: 'emphasis',
    description: 'Two quick beats, then rest.',
    duration: 1300,
    easing: 'ease-in-out',
    frames: [
      [0, { scale: 1 }],
      [0.14, { scale: 1.15 }],
      [0.28, { scale: 1 }],
      [0.42, { scale: 1.15 }],
      [0.7, { scale: 1 }],
      [1, { scale: 1 }],
    ],
  },
  {
    id: 'shake',
    name: 'Shake',
    category: 'emphasis',
    description: 'A sharp horizontal shake — great for errors.',
    duration: 700,
    easing: EASE.shake,
    frames: [
      [0, { x: 0 }],
      [0.1, { x: -10 }],
      [0.25, { x: 10 }],
      [0.4, { x: -9 }],
      [0.55, { x: 8 }],
      [0.7, { x: -5 }],
      [0.85, { x: 3 }],
      [1, { x: 0 }],
    ],
  },
  {
    id: 'wobble',
    name: 'Wobble',
    category: 'emphasis',
    description: 'Sways side to side with a slight rotation.',
    duration: 1000,
    easing: 'ease-in-out',
    frames: [
      [0, { x: 0, rotate: 0 }],
      [0.15, { x: -24, rotate: -5 }],
      [0.3, { x: 18, rotate: 3 }],
      [0.45, { x: -14, rotate: -3 }],
      [0.6, { x: 9, rotate: 2 }],
      [0.75, { x: -5, rotate: -1 }],
      [1, { x: 0, rotate: 0 }],
    ],
  },
  {
    id: 'jello',
    name: 'Jello',
    category: 'emphasis',
    description: 'A wobbly skew that settles down.',
    duration: 1000,
    easing: 'ease-in-out',
    frames: [
      [0, { skewX: 0, skewY: 0 }],
      [0.11, { skewX: 0, skewY: 0 }],
      [0.22, { skewX: -12.5, skewY: -12.5 }],
      [0.33, { skewX: 6.25, skewY: 6.25 }],
      [0.44, { skewX: -3.125, skewY: -3.125 }],
      [0.55, { skewX: 1.56, skewY: 1.56 }],
      [0.66, { skewX: -0.78, skewY: -0.78 }],
      [0.77, { skewX: 0.39, skewY: 0.39 }],
      [1, { skewX: 0, skewY: 0 }],
    ],
  },
  {
    id: 'bounce',
    name: 'Bounce',
    category: 'emphasis',
    description: 'Hops up and bounces to a stop.',
    duration: 1000,
    easing: 'linear',
    frames: [
      [0, { y: 0, scaleY: 1 }, EASE.quadOut],
      [0.3, { y: -26, scaleY: 1.04 }, EASE.quadIn],
      [0.5, { y: 0, scaleY: 0.94 }, EASE.quadOut],
      [0.66, { y: -10, scaleY: 1.02 }, EASE.quadIn],
      [0.8, { y: 0, scaleY: 0.98 }, EASE.quadOut],
      [0.9, { y: -3, scaleY: 1 }, EASE.quadIn],
      [1, { y: 0, scaleY: 1 }],
    ],
  },
  {
    id: 'tada',
    name: 'Tada',
    category: 'emphasis',
    description: 'Shrinks, then wiggles big — a celebration.',
    duration: 1000,
    easing: 'ease-in-out',
    frames: [
      [0, { scale: 1, rotate: 0 }],
      [0.1, { scale: 0.92, rotate: -3 }],
      [0.2, { scale: 0.92, rotate: -3 }],
      [0.3, { scale: 1.08, rotate: 3 }],
      [0.4, { scale: 1.08, rotate: -3 }],
      [0.5, { scale: 1.08, rotate: 3 }],
      [0.6, { scale: 1.08, rotate: -3 }],
      [0.7, { scale: 1.08, rotate: 3 }],
      [0.8, { scale: 1.08, rotate: -3 }],
      [0.9, { scale: 1.08, rotate: 3 }],
      [1, { scale: 1, rotate: 0 }],
    ],
  },
  {
    id: 'rubber-band',
    name: 'Rubber band',
    category: 'emphasis',
    description: 'Stretches like elastic and snaps back.',
    duration: 1000,
    easing: 'ease-in-out',
    frames: [
      [0, { scaleX: 1, scaleY: 1 }],
      [0.3, { scaleX: 1.25, scaleY: 0.75 }],
      [0.4, { scaleX: 0.75, scaleY: 1.25 }],
      [0.5, { scaleX: 1.15, scaleY: 0.85 }],
      [0.65, { scaleX: 0.95, scaleY: 1.05 }],
      [0.75, { scaleX: 1.05, scaleY: 0.95 }],
      [1, { scaleX: 1, scaleY: 1 }],
    ],
  },
  {
    id: 'glow',
    name: 'Glow',
    category: 'emphasis',
    description: 'A soft brand-colored glow breathes around the element.',
    duration: 1600,
    iterations: 2,
    easing: EASE.sineInOut,
    frames: [
      [0, { 'box-shadow': `0 0 0 0px ${BRAND} 0), 0 0 0px 0px ${BRAND} 0)` }],
      [0.5, { 'box-shadow': `0 0 0 6px ${BRAND} 0.22), 0 0 32px 4px ${BRAND} 0.45)` }],
      [1, { 'box-shadow': `0 0 0 0px ${BRAND} 0), 0 0 0px 0px ${BRAND} 0)` }],
    ],
  },
  {
    id: 'flash',
    name: 'Flash',
    category: 'emphasis',
    description: 'Blinks twice.',
    duration: 900,
    easing: 'ease-in-out',
    frames: [
      [0, { opacity: 1 }],
      [0.25, { opacity: 0 }],
      [0.5, { opacity: 1 }],
      [0.75, { opacity: 0 }],
      [1, { opacity: 1 }],
    ],
  },
  {
    id: 'ring',
    name: 'Ring wiggle',
    category: 'emphasis',
    description: 'Rings like a notification bell, pivoting from the top.',
    demo: 'bell',
    duration: 1000,
    easing: 'ease-in-out',
    frames: [
      [0, { rotate: 0, 'transform-origin': '50% 0%' }],
      [0.1, { rotate: 14, 'transform-origin': '50% 0%' }],
      [0.2, { rotate: -12, 'transform-origin': '50% 0%' }],
      [0.3, { rotate: 10, 'transform-origin': '50% 0%' }],
      [0.4, { rotate: -8, 'transform-origin': '50% 0%' }],
      [0.5, { rotate: 6, 'transform-origin': '50% 0%' }],
      [0.6, { rotate: -4, 'transform-origin': '50% 0%' }],
      [0.7, { rotate: 2, 'transform-origin': '50% 0%' }],
      [0.8, { rotate: -1, 'transform-origin': '50% 0%' }],
      [1, { rotate: 0, 'transform-origin': '50% 0%' }],
    ],
  },
];

// ─── Loop / ambient ─────────────────────────────────────────────────────────

const ORBIT_R = 10;
const orbitFrames: Frame[] = Array.from({ length: 13 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return [Math.round((i / 12) * 10000) / 10000, { x: Math.round(Math.cos(a) * ORBIT_R * 100) / 100, y: Math.round(Math.sin(a) * ORBIT_R * 100) / 100 }];
});

const LOOPS: Spec[] = [
  {
    id: 'float',
    name: 'Float',
    category: 'loop',
    description: 'Drifts gently up and down.',
    duration: 3200,
    easing: EASE.sineInOut,
    frames: [
      [0, { y: 0 }],
      [0.5, { y: -10 }],
      [1, { y: 0 }],
    ],
  },
  {
    id: 'spin',
    name: 'Spin',
    category: 'loop',
    description: 'Rotates continuously — loaders and badges.',
    duration: 1400,
    easing: 'linear',
    frames: [
      [0, { rotate: 0 }],
      [1, { rotate: 360 }],
    ],
  },
  {
    id: 'ping',
    name: 'Ping',
    category: 'loop',
    description: 'Radiates outward and fades, like a radar ping. Layer it behind a dot.',
    duration: 1200,
    easing: EASE.ping,
    frames: [
      [0, { scale: 1, opacity: 1 }],
      [0.75, { scale: 1.8, opacity: 0 }],
      [1, { scale: 1.8, opacity: 0 }],
    ],
  },
  {
    id: 'breathe',
    name: 'Breathe',
    category: 'loop',
    description: 'A slow, calm swell.',
    duration: 4000,
    easing: EASE.sineInOut,
    frames: [
      [0, { scale: 1, opacity: 0.88 }],
      [0.5, { scale: 1.04, opacity: 1 }],
      [1, { scale: 1, opacity: 0.88 }],
    ],
  },
  {
    id: 'gradient-shift',
    name: 'Gradient shift',
    category: 'loop',
    description: 'Pans a gradient background. Needs a gradient with a large background-size (e.g. 300% 300%).',
    demo: 'gradient',
    duration: 6000,
    easing: EASE.sineInOut,
    frames: [
      [0, { 'background-position': '0% 50%' }],
      [0.5, { 'background-position': '100% 50%' }],
      [1, { 'background-position': '0% 50%' }],
    ],
  },
  {
    id: 'orbit',
    name: 'Orbit',
    category: 'loop',
    description: 'Circles a small orbit around its position.',
    duration: 4000,
    easing: 'linear',
    frames: orbitFrames,
  },
  {
    id: 'sway',
    name: 'Sway',
    category: 'loop',
    description: 'Rocks softly from its base, like a plant in the wind.',
    duration: 3000,
    easing: EASE.sineInOut,
    frames: [
      [0, { rotate: -3, 'transform-origin': '50% 100%' }],
      [0.5, { rotate: 3, 'transform-origin': '50% 100%' }],
      [1, { rotate: -3, 'transform-origin': '50% 100%' }],
    ],
  },
  {
    id: 'shimmer',
    name: 'Shimmer',
    category: 'loop',
    description: 'A sheen sweeps across. Needs a gradient background with background-size around 200%.',
    demo: 'shimmer',
    duration: 2000,
    easing: 'linear',
    frames: [
      [0, { 'background-position': '200% 0%' }],
      [1, { 'background-position': '-200% 0%' }],
    ],
  },
];

// ─── Hover ──────────────────────────────────────────────────────────────────

const HOVERS: Spec[] = [
  {
    id: 'hover-lift',
    name: 'Lift',
    category: 'hover',
    description: 'Rises with a deeper shadow.',
    duration: 350,
    easing: EASE.expoOut,
    frames: [
      [0, { y: 0 }],
      [1, { y: -6, 'box-shadow': '0 16px 32px -12px rgba(15, 16, 32, 0.35)' }],
    ],
  },
  {
    id: 'hover-grow',
    name: 'Grow',
    category: 'hover',
    description: 'Springs up to 105%.',
    duration: 450,
    easing: EASE.springSnappy,
    frames: [
      [0, { scale: 1 }],
      [1, { scale: 1.05 }],
    ],
  },
  {
    id: 'hover-tilt',
    name: 'Tilt',
    category: 'hover',
    description: 'Tips slightly with a small zoom.',
    duration: 350,
    easing: EASE.expoOut,
    frames: [
      [0, { rotate: 0, scale: 1 }],
      [1, { rotate: -3, scale: 1.02 }],
    ],
  },
  {
    id: 'hover-glow-ring',
    name: 'Glow ring',
    category: 'hover',
    description: 'A brand-colored focus ring fades in.',
    duration: 260,
    easing: EASE.quartOut,
    frames: [
      [0, { 'box-shadow': `0 0 0 0px ${BRAND} 0)` }],
      [1, { 'box-shadow': `0 0 0 4px ${BRAND} 0.35)` }],
    ],
  },
  {
    id: 'hover-push',
    name: 'Push down',
    category: 'hover',
    description: 'Presses in slightly, like a physical button.',
    duration: 160,
    easing: EASE.quartOut,
    frames: [
      [0, { y: 0, scale: 1 }],
      [1, { y: 2, scale: 0.98 }],
    ],
  },
  {
    id: 'hover-nudge',
    name: 'Nudge right',
    category: 'hover',
    description: 'Slides a few pixels to the right — arrows and links.',
    duration: 300,
    easing: EASE.expoOut,
    frames: [
      [0, { x: 0 }],
      [1, { x: 6 }],
    ],
  },
];

// ─── Exit ───────────────────────────────────────────────────────────────────

const EXITS: Spec[] = [
  {
    id: 'fade-out',
    name: 'Fade out',
    category: 'exit',
    description: 'Fades away.',
    duration: 400,
    easing: 'ease-in',
    frames: [
      [0, { opacity: 1 }],
      [1, { opacity: 0 }],
    ],
  },
  {
    id: 'zoom-out',
    name: 'Zoom out',
    category: 'exit',
    description: 'Shrinks to 85% while fading.',
    duration: 420,
    easing: EASE.quartIn,
    frames: [
      [0, { opacity: 1, scale: 1 }],
      [1, { opacity: 0, scale: 0.85 }],
    ],
  },
  {
    id: 'slide-out-down',
    name: 'Slide out down',
    category: 'exit',
    description: 'Drops 40px and fades out.',
    duration: 480,
    easing: EASE.quartIn,
    frames: [
      [0, { opacity: 1, y: 0 }],
      [1, { opacity: 0, y: 40 }],
    ],
  },
  {
    id: 'blur-out',
    name: 'Blur out',
    category: 'exit',
    description: 'Dissolves into a blur.',
    duration: 500,
    easing: EASE.quartIn,
    frames: [
      [0, { opacity: 1, scale: 1, filter: 'blur(0px)' }],
      [1, { opacity: 0, scale: 1.04, filter: 'blur(12px)' }],
    ],
  },
];

// ─── Stagger ────────────────────────────────────────────────────────────────

const STAGGERS: Spec[] = [
  {
    id: 'stagger-fade-up',
    name: 'Stagger fade up',
    category: 'stagger',
    description: 'Children fade up one after another. Apply to a container.',
    duration: 700,
    stagger: 80,
    easing: EASE.expoOut,
    frames: [
      [0, { opacity: 0, y: 20 }],
      [1, { opacity: 1, y: 0 }],
    ],
  },
  {
    id: 'stagger-pop',
    name: 'Stagger pop',
    category: 'stagger',
    description: 'Children spring in, in sequence. Apply to a container.',
    duration: 750,
    stagger: 60,
    easing: EASE.springPop,
    frames: [
      [0, { opacity: 0, scale: 0.6 }],
      [1, { opacity: 1, scale: 1 }],
    ],
  },
  {
    id: 'cascade-left',
    name: 'Cascade from left',
    category: 'stagger',
    description: 'Children slide in from the left in a cascade. Apply to a container.',
    duration: 800,
    stagger: 70,
    easing: EASE.expoOut,
    frames: [
      [0, { opacity: 0, x: -24 }],
      [1, { opacity: 1, x: 0 }],
    ],
  },
];

// ─── SVG ────────────────────────────────────────────────────────────────────

const SVGS: Spec[] = [
  {
    id: 'svg-draw',
    name: 'Draw-on strokes',
    category: 'svg',
    description: 'Draws each stroke of a vector in sequence. Adds pathLength="1" to its shapes.',
    duration: 1600,
    stagger: 120,
    targetSelector: SVG_SHAPES_SELECTOR,
    easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
    frames: [
      [0, { 'stroke-dasharray': '1', 'stroke-dashoffset': 1 }],
      [1, { 'stroke-dasharray': '1', 'stroke-dashoffset': 0 }],
    ],
  },
  {
    id: 'svg-fill-in',
    name: 'Fill fade-in',
    category: 'svg',
    description: 'Fades shape fills in after a draw-on (starts at 1.2s).',
    duration: 800,
    delay: 1200,
    targetSelector: SVG_SHAPES_SELECTOR,
    easing: EASE.quartOut,
    frames: [
      [0, { 'fill-opacity': '0' }],
      [1, { 'fill-opacity': '1' }],
    ],
  },
  {
    id: 'svg-color-cycle',
    name: 'Color cycle',
    category: 'svg',
    description: 'Morphs through brand colors. Works on vectors that use currentColor.',
    trigger: 'loop',
    duration: 6000,
    easing: EASE.sineInOut,
    frames: [
      [0, { color: '#7c5cff' }],
      [0.33, { color: '#22d3ee' }],
      [0.66, { color: '#f472b6' }],
      [1, { color: '#7c5cff' }],
    ],
  },
];

// ─── Scroll reveals (inView versions of the main entrances) ─────────────────

const SCROLL_SOURCES = ['fade-in', 'fade-up', 'fade-left', 'fade-right', 'zoom-in', 'blur-in', 'reveal-up', 'pop'];
const SCROLLS: Spec[] = SCROLL_SOURCES.map((id) => {
  const src = ENTRANCES.find((s) => s.id === id)!;
  return {
    ...src,
    id: `scroll-${id}`,
    name: `Scroll ${src.name.charAt(0).toLowerCase()}${src.name.slice(1)}`,
    category: 'scroll' as const,
    trigger: 'inView' as const,
    description: `${src.description} Plays when scrolled into view.`,
  };
});

export const PRESETS: AnimationPreset[] = [...ENTRANCES, ...SCROLLS, ...EMPHASIS, ...HOVERS, ...LOOPS, ...EXITS, ...STAGGERS, ...SVGS].map(define);

const byId = new Map(PRESETS.map((p) => [p.id, p]));

export function getPreset(id: string): AnimationPreset | undefined {
  return byId.get(id);
}

export function presetsIn(category: PresetCategory | 'all'): AnimationPreset[] {
  return category === 'all' ? PRESETS : PRESETS.filter((p) => p.category === category);
}

export function searchPresets(query: string, category: PresetCategory | 'all' = 'all'): AnimationPreset[] {
  const q = query.trim().toLowerCase();
  const list = presetsIn(category);
  if (!q) return list;
  return list.filter((p) => `${p.name} ${p.description} ${p.category} ${p.id}`.toLowerCase().includes(q));
}
