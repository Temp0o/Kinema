/**
 * CSS gradient model: parse / serialize linear-, radial- and conic-gradient()
 * (including repeating- variants) into an editable stop list.
 */
import { splitSpaces, splitTopLevel, parseAngle, fmtNum } from './cssValue';
import { isColorValue, mixColors, type TokenLike } from './colorUtils';

export type GradientType = 'linear' | 'radial' | 'conic';

export interface GradientStop {
  color: string;
  /** 0..100 (%) */
  pos: number;
}

export interface Gradient {
  type: GradientType;
  repeating: boolean;
  /** linear: direction in degrees (180 = to bottom). conic: `from` angle. */
  angle: number;
  /** radial only: shape/size part, e.g. "circle", "ellipse farthest-corner" ('' = default) */
  shape: string;
  /** radial/conic: position after `at` ('' = center) */
  at: string;
  stops: GradientStop[];
}

const SIDE_ANGLES: Record<string, number> = {
  top: 0,
  'top right': 45,
  'right top': 45,
  right: 90,
  'bottom right': 135,
  'right bottom': 135,
  bottom: 180,
  'bottom left': 225,
  'left bottom': 225,
  left: 270,
  'top left': 315,
  'left top': 315,
};

const GRADIENT_RE = /^(repeating-)?(linear|radial|conic)-gradient\(([\s\S]*)\)$/i;

export function isGradient(value: string | null | undefined): boolean {
  return !!value && GRADIENT_RE.test(value.trim());
}

function parsePos(token: string): number | null {
  const m = /^(-?\d*\.?\d+)%$/.exec(token.trim());
  if (m) return parseFloat(m[1]);
  if (/^0(px)?$/.test(token.trim())) return 0;
  return null;
}

/** Parse one gradient function. Returns null for anything it can't represent. */
export function parseGradient(value: string | null | undefined): Gradient | null {
  if (!value) return null;
  const m = GRADIENT_RE.exec(value.trim());
  if (!m) return null;
  const type = m[2].toLowerCase() as GradientType;
  const args = splitTopLevel(m[3], ',');
  if (!args.length) return null;
  const g: Gradient = { type, repeating: !!m[1], angle: type === 'linear' ? 180 : 0, shape: '', at: '', stops: [] };

  let first = args[0];
  const firstTokens = splitSpaces(first);
  const firstIsStop = firstTokens.length > 0 && isColorValue(firstTokens[0]);
  if (!firstIsStop) {
    if (type === 'linear') {
      const a = parseAngle(first);
      if (a != null) g.angle = a;
      else if (/^to\s+/i.test(first)) {
        const side = first.replace(/^to\s+/i, '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (SIDE_ANGLES[side] == null) return null;
        g.angle = SIDE_ANGLES[side];
      } else return null;
    } else if (type === 'radial') {
      const [shape, at] = first.split(/\bat\b/i).map((s) => s.trim());
      g.shape = shape ?? '';
      g.at = at ?? '';
    } else {
      const fm = /^(?:from\s+(\S+))?\s*(?:at\s+(.+))?$/i.exec(first.trim());
      if (!fm) return null;
      if (fm[1]) {
        const a = parseAngle(fm[1]);
        if (a == null) return null;
        g.angle = a;
      }
      g.at = fm[2]?.trim() ?? '';
    }
    first = '';
  }

  const stopArgs = first ? args : args.slice(1);
  const raw: { color: string; pos: number | null }[] = [];
  for (const a of stopArgs) {
    const toks = splitSpaces(a);
    if (!toks.length) continue;
    if (toks.length === 1 && parsePos(toks[0]) != null && !isColorValue(toks[0])) continue; // interpolation hint
    const color = toks[0];
    if (!isColorValue(color)) return null;
    const positions = toks.slice(1).map(parsePos);
    if (positions.some((p) => p == null) && toks.length > 1) {
      // non-% positions (px) can't be mapped onto the bar → distribute
      raw.push({ color, pos: null });
      continue;
    }
    if (!positions.length) raw.push({ color, pos: null });
    else for (const p of positions) raw.push({ color, pos: p });
  }
  if (!raw.length) return null;
  if (raw.length === 1) raw.push({ ...raw[0], pos: null });
  g.stops = distributeStops(raw);
  return g;
}

/** Fill in missing stop positions per the CSS spec (first 0, last 100, even spacing between). */
export function distributeStops(raw: { color: string; pos: number | null }[]): GradientStop[] {
  const pos = raw.map((r) => r.pos);
  if (pos[0] == null) pos[0] = 0;
  if (pos[pos.length - 1] == null) pos[pos.length - 1] = 100;
  // monotonic
  let max = -Infinity;
  for (let i = 0; i < pos.length; i++) {
    if (pos[i] != null) {
      pos[i] = Math.max(pos[i]!, max);
      max = pos[i]!;
    }
  }
  for (let i = 0; i < pos.length; i++) {
    if (pos[i] != null) continue;
    let j = i;
    while (pos[j] == null) j++;
    const a = pos[i - 1]!;
    const b = pos[j]!;
    const n = j - i + 1;
    for (let k = i; k < j; k++) pos[k] = a + ((b - a) * (k - i + 1)) / n;
    i = j;
  }
  return raw.map((r, i) => ({ color: r.color, pos: Math.round(pos[i]! * 100) / 100 }));
}

export function serializeGradient(g: Gradient): string {
  const stops = [...g.stops].sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${fmtNum(s.pos)}%`);
  const fn = `${g.repeating ? 'repeating-' : ''}${g.type}-gradient`;
  let head = '';
  if (g.type === 'linear') head = `${fmtNum(g.angle)}deg`;
  else if (g.type === 'radial') head = [g.shape, g.at && `at ${g.at}`].filter(Boolean).join(' ');
  else head = [g.angle ? `from ${fmtNum(g.angle)}deg` : '', g.at && `at ${g.at}`].filter(Boolean).join(' ');
  return `${fn}(${[head, ...stops].filter(Boolean).join(', ')})`;
}

/** Horizontal preview of the stops (for the gradient bar). */
export function gradientBarCss(g: Pick<Gradient, 'stops'>): string {
  const stops = [...g.stops].sort((a, b) => a.pos - b.pos).map((s) => `${s.color} ${fmtNum(s.pos)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

/** Color of the gradient at a position (for inserting stops). */
export function colorAt(g: Pick<Gradient, 'stops'>, pos: number, tokens?: TokenLike[]): string {
  const stops = [...g.stops].sort((a, b) => a.pos - b.pos);
  if (!stops.length) return '#000000';
  if (pos <= stops[0].pos) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (pos <= b.pos) {
      const t = b.pos === a.pos ? 0 : (pos - a.pos) / (b.pos - a.pos);
      return mixColors(a.color, b.color, t, tokens);
    }
  }
  return stops[stops.length - 1].color;
}

export function defaultGradient(type: GradientType, from = '#7c5cff', to = '#22d3ee'): Gradient {
  return {
    type,
    repeating: false,
    angle: type === 'linear' ? 135 : 0,
    shape: type === 'radial' ? 'circle' : '',
    at: '',
    stops: [
      { color: from, pos: 0 },
      { color: to, pos: 100 },
    ],
  };
}
