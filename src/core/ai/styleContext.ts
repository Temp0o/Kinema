/**
 * Style context: extract the design language of the current page / selection
 * (ranked colors, fonts, type scale, radii, shadows, spacing, button/card looks,
 * structure outline) and render it as a concise prompt section. Also provides
 * the built-in theme presets and the doc-token description.
 */
import { colord } from 'colord';
import type { KDocument, KNode, NodeId, StyleMap } from '../model/types';
import { getSubtreeIds } from '../model/tree';
import { resolveStyles } from '../style/style';
import { describeOutline } from './serialize';

export type StyleSource = 'match' | 'selection' | 'tokens' | 'preset' | 'fresh';

export const STYLE_SOURCE_LABELS: Record<StyleSource, string> = {
  match: 'Match canvas',
  selection: 'Match selection',
  tokens: 'Design tokens',
  preset: 'Preset theme',
  fresh: 'Fresh style',
};

// ─── Presets ─────────────────────────────────────────────────────────────────

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  colors: { background: string; surface: string; text: string; muted: string; primary: string; accent: string; border: string };
  /** exact names from BUNDLED_FONTS */
  fonts: { heading: string; body: string };
  radius: number;
  /** extra stylistic direction */
  notes: string;
}

export const STYLE_PRESETS: ThemePreset[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep navy dark UI, electric indigo, soft glows',
    colors: { background: '#0b1020', surface: '#131a2e', text: '#e7eaf6', muted: '#8b93b0', primary: '#6d7cff', accent: '#22d3ee', border: '#232c47' },
    fonts: { heading: 'Sora Variable', body: 'Inter Variable' },
    radius: 14,
    notes: 'Dark surfaces layered by lightness, subtle 1px borders, glowing primary buttons (box-shadow with the primary color at 40% alpha), radial gradient glows behind the hero.',
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Warm editorial, serif headlines, airy',
    colors: { background: '#faf7f2', surface: '#ffffff', text: '#1f1b16', muted: '#6b6258', primary: '#c2410c', accent: '#0f766e', border: '#e7e0d6' },
    fonts: { heading: 'Playfair Display Variable', body: 'DM Sans Variable' },
    radius: 6,
    notes: 'Editorial magazine feel: large serif headlines, generous whitespace, hairline borders instead of shadows, understated buttons.',
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Cyberpunk black, hot magenta & cyan glow',
    colors: { background: '#07070d', surface: '#10101c', text: '#f5f5ff', muted: '#9a9ab8', primary: '#ff2bd6', accent: '#00f0ff', border: '#26264a' },
    fonts: { heading: 'Space Grotesk Variable', body: 'Outfit Variable' },
    radius: 10,
    notes: 'High contrast, neon gradients (magenta → cyan) on headlines and buttons, glowing text-shadows and box-shadows, grid-line backgrounds.',
  },
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Clean trustworthy SaaS blue',
    colors: { background: '#f5f7fb', surface: '#ffffff', text: '#0f172a', muted: '#475569', primary: '#2563eb', accent: '#0ea5e9', border: '#e2e8f0' },
    fonts: { heading: 'Inter Variable', body: 'Inter Variable' },
    radius: 8,
    notes: 'Professional and calm: white cards with soft shadows (0 1px 3px rgba(15,23,42,.08)), clear hierarchy, blue primary buttons, logos/stats rows.',
  },
  {
    id: 'pastel',
    name: 'Pastel',
    description: 'Soft playful pastels, round shapes',
    colors: { background: '#fdf6ff', surface: '#ffffff', text: '#2e2a3a', muted: '#7a7290', primary: '#a78bfa', accent: '#f9a8d4', border: '#efe3f7' },
    fonts: { heading: 'Outfit Variable', body: 'Manrope Variable' },
    radius: 20,
    notes: 'Friendly and light: pastel gradient blobs, very rounded cards and pill buttons, gentle colored shadows, emoji-free.',
  },
  {
    id: 'brutalist',
    name: 'Brutalist',
    description: 'Raw black borders, hard shadows, bold type',
    colors: { background: '#fffef0', surface: '#ffffff', text: '#000000', muted: '#333333', primary: '#ff4d00', accent: '#2b2bff', border: '#000000' },
    fonts: { heading: 'Space Grotesk Variable', body: 'Space Grotesk Variable' },
    radius: 0,
    notes: 'Neo-brutalism: 3px solid black borders, hard offset shadows (6px 6px 0 #000), oversized uppercase headlines, flat saturated color blocks; hover moves elements by (-2px,-2px).',
  },
];

export function getPreset(id: string | undefined): ThemePreset {
  return STYLE_PRESETS.find((p) => p.id === id) ?? STYLE_PRESETS[0];
}

export function renderPreset(p: ThemePreset): string {
  const c = p.colors;
  return [
    `DESIGN DIRECTION — “${p.name}” theme: ${p.description}.`,
    `- Colors: page background ${c.background}, surfaces/cards ${c.surface}, text ${c.text}, muted text ${c.muted}, primary ${c.primary}, accent ${c.accent}, borders ${c.border}.`,
    `- Fonts: headings font-family: '${p.fonts.heading}', sans-serif; body font-family: '${p.fonts.body}', sans-serif.`,
    `- Corner radius: ${p.radius}px (buttons may be pills if it fits).`,
    `- Style notes: ${p.notes}`,
  ].join('\n');
}

export function renderTokens(doc: Pick<KDocument, 'tokens'>): string {
  const t = doc.tokens;
  const vars = t.colors.map((c) => `var(--k-${c.name}) = ${c.value}`).join(', ');
  return [
    'DESIGN TOKENS — use these CSS variables instead of hard-coded values:',
    `- Colors: ${vars}.`,
    `- Fonts: headings font-family: var(--k-font-heading) (${t.fonts.heading}); text font-family: var(--k-font-body) (${t.fonts.body}).`,
    `- Radius: var(--k-radius) (${t.radius}px). Spacing unit: var(--k-space) (${t.spacing}px) — use multiples via calc(var(--k-space) * 3).`,
  ].join('\n');
}

// ─── Extraction ──────────────────────────────────────────────────────────────

export interface StyleContext {
  nodeCount: number;
  theme: 'dark' | 'light' | null;
  pageBackground: string | null;
  backgrounds: string[];
  texts: string[];
  borders: string[];
  accents: string[];
  gradients: string[];
  headingFont: string | null;
  bodyFont: string | null;
  fontSizes: number[];
  weights: string[];
  radii: string[];
  shadows: string[];
  spacing: number[];
  buttons: string[];
  cards: string[];
  usesTokens: boolean;
  outline: string;
}

class Counter<T> {
  private m = new Map<T, number>();
  add(k: T, w = 1) {
    this.m.set(k, (this.m.get(k) ?? 0) + w);
  }
  top(n: number): T[] {
    return [...this.m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k]) => k);
  }
  get size() {
    return this.m.size;
  }
}

const COLOR_TOKEN_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|var\(--k-[\w-]+\)/gi;

function tokenMap(doc: Pick<KDocument, 'tokens'>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const c of doc.tokens.colors) m[`--k-${c.name}`] = c.value;
  m['--k-font-heading'] = doc.tokens.fonts.heading;
  m['--k-font-body'] = doc.tokens.fonts.body;
  m['--k-radius'] = `${doc.tokens.radius}px`;
  return m;
}

function normColor(raw: string, tokens: Record<string, string>): string | null {
  let v = raw.trim();
  const vm = /^var\((--k-[\w-]+)\)$/.exec(v);
  if (vm) v = tokens[vm[1]] ?? '';
  if (!v) return null;
  const c = colord(v);
  if (!c.isValid()) return null;
  if (c.alpha() < 0.08) return null;
  return c.toHex().toLowerCase();
}

function colorsIn(value: string, tokens: Record<string, string>): string[] {
  return (value.match(COLOR_TOKEN_RE) ?? []).map((t) => normColor(t, tokens)).filter((c): c is string => !!c);
}

function toPx(v: string): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(v.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n;
}

function firstFamily(v: string, tokens: Record<string, string>): string | null {
  let s = v.trim();
  const vm = /var\((--k-[\w-]+)\)/.exec(s);
  if (vm) s = tokens[vm[1]] ?? s;
  const f = s.split(',')[0].replace(/['"]/g, '').trim();
  return f && !/^var\(/.test(f) ? f : null;
}

const BUTTON_KEYS = ['background', 'background-color', 'background-image', 'color', 'padding', 'border', 'border-radius', 'font-weight', 'font-size', 'box-shadow', 'text-transform', 'letter-spacing'];
const CARD_KEYS = ['background', 'background-color', 'border', 'border-radius', 'box-shadow', 'padding', 'backdrop-filter'];

function pickDecls(s: StyleMap, keys: string[]): string {
  return keys
    .filter((k) => s[k])
    .map((k) => `${k}: ${s[k]}`)
    .join('; ');
}

const isGradient = (v: string) => /gradient\(/i.test(v);

/** Analyse the given subtrees (resolved at the base breakpoint). */
export function extractStyleContext(doc: KDocument, rootIds: NodeId[], opts: { outlineLines?: number } = {}): StyleContext {
  const tokens = tokenMap(doc);
  const bg = new Counter<string>();
  const text = new Counter<string>();
  const border = new Counter<string>();
  const accent = new Counter<string>();
  const grads = new Counter<string>();
  const headFonts = new Counter<string>();
  const bodyFonts = new Counter<string>();
  const sizes = new Set<number>();
  const weights = new Counter<string>();
  const radii = new Counter<string>();
  const shadows = new Counter<string>();
  const spacing = new Counter<number>();
  const buttons = new Counter<string>();
  const cards = new Counter<string>();
  let usesTokens = false;
  let count = 0;
  let pageBackground: string | null = null;

  const ids = rootIds.flatMap((r) => getSubtreeIds(doc.nodes, r));
  for (const id of ids) {
    const n: KNode | undefined = doc.nodes[id];
    if (!n || n.hidden) continue;
    count++;
    const s = resolveStyles(doc, n, 'base');
    const all = [s, ...Object.values(n.states ?? {})];
    for (const m of all) for (const v of Object.values(m ?? {})) if (/var\(--k-/.test(v)) usesTokens = true;
    const isHeading = /^h[1-3]$/.test(n.tag ?? '');

    const bgv = s.background ?? s['background-color'] ?? '';
    if (bgv) {
      if (isGradient(bgv) || isGradient(s['background-image'] ?? '')) grads.add((isGradient(bgv) ? bgv : s['background-image']).replace(/\s+/g, ' '));
      const w = n.parent === null ? 6 : n.children.length ? 2 : 1;
      for (const c of colorsIn(bgv, tokens)) {
        bg.add(c, w);
        if (n.type === 'button' || n.type === 'link') accent.add(c, 3);
      }
      if (n.parent === null && !pageBackground) pageBackground = colorsIn(bgv, tokens)[0] ?? null;
    }
    if (s['background-image'] && isGradient(s['background-image'])) grads.add(s['background-image'].replace(/\s+/g, ' '));
    if (s.color) for (const c of colorsIn(s.color, tokens)) {
      text.add(c, isHeading ? 2 : 1);
      if (n.type === 'link') accent.add(c, 1);
    }
    for (const k of ['border', 'border-color', 'border-top', 'border-bottom', 'outline']) if (s[k]) for (const c of colorsIn(s[k], tokens)) border.add(c);

    if (s['font-family']) {
      const f = firstFamily(s['font-family'], tokens);
      if (f) (isHeading ? headFonts : bodyFonts).add(f);
    }
    if (s['font-size']) {
      const px = toPx(s['font-size']);
      if (px) sizes.add(Math.round(px));
    }
    if (s['font-weight']) weights.add(s['font-weight']);
    if (s['border-radius'] && s['border-radius'] !== '0' && s['border-radius'] !== '0px') radii.add(s['border-radius']);
    if (s['box-shadow'] && s['box-shadow'] !== 'none') shadows.add(s['box-shadow'].replace(/\s+/g, ' '));
    for (const k of ['padding', 'gap', 'row-gap', 'column-gap', 'margin', 'padding-top', 'padding-bottom', 'margin-top', 'margin-bottom']) {
      for (const part of (s[k] ?? '').split(/\s+/)) {
        const px = toPx(part);
        if (px && px > 0 && px <= 200) spacing.add(Math.round(px));
      }
    }
    if ((n.type === 'button' || (n.type === 'link' && (s.padding || s.background || s['background-color']))) && (bgv || s.border)) {
      const d = pickDecls(s, BUTTON_KEYS);
      if (d) buttons.add(d);
    }
    if (n.type === 'box' && n.parent !== null && n.children.length >= 2 && bgv && (s['border-radius'] || s['box-shadow'] || s.border)) {
      const d = pickDecls(s, CARD_KEYS);
      if (d) cards.add(d);
    }
  }

  const bgList = bg.top(5);
  const pageBg = pageBackground ?? bgList[0] ?? null;
  let theme: StyleContext['theme'] = null;
  if (pageBg) theme = colord(pageBg).isDark() ? 'dark' : 'light';
  const accentList = [...accent.top(4), ...[...bgList, ...text.top(6)].filter((c) => colord(c).toHsl().s > 40 && colord(c).toHsl().l > 20 && colord(c).toHsl().l < 80)];

  return {
    nodeCount: count,
    theme,
    pageBackground: pageBg,
    backgrounds: bgList,
    texts: text.top(4),
    borders: border.top(3),
    accents: [...new Set(accentList)].slice(0, 4),
    gradients: grads.top(3),
    headingFont: headFonts.top(1)[0] ?? null,
    bodyFont: bodyFonts.top(1)[0] ?? null,
    fontSizes: [...sizes].sort((a, b) => a - b).slice(0, 10),
    weights: weights.top(4).sort(),
    radii: radii.top(4),
    shadows: shadows.top(3),
    spacing: spacing.top(8).sort((a, b) => a - b),
    buttons: buttons.top(2),
    cards: cards.top(2),
    usesTokens,
    outline: describeOutline(doc, rootIds, { maxLines: opts.outlineLines ?? 24, maxDepth: 4 }).text,
  };
}

/** Render an extracted context as a compact prompt section. */
export function renderStyleContext(ctx: StyleContext, doc: Pick<KDocument, 'tokens'>, opts: { label?: string; withOutline?: boolean } = {}): string {
  const L: string[] = [`EXISTING DESIGN LANGUAGE${opts.label ? ` (${opts.label})` : ''} — match it so the new content looks like part of the same site:`];
  if (ctx.theme) L.push(`- Theme: ${ctx.theme}${ctx.pageBackground ? ` (page background ${ctx.pageBackground})` : ''}`);
  if (ctx.backgrounds.length) L.push(`- Background colors: ${ctx.backgrounds.join(', ')}`);
  if (ctx.texts.length) L.push(`- Text colors: ${ctx.texts.join(', ')}`);
  if (ctx.accents.length) L.push(`- Brand / accent colors: ${ctx.accents.join(', ')}`);
  if (ctx.borders.length) L.push(`- Border colors: ${ctx.borders.join(', ')}`);
  if (ctx.gradients.length) L.push(`- Gradients: ${ctx.gradients.join(' | ')}`);
  const head = ctx.headingFont ?? doc.tokens.fonts.heading;
  const body = ctx.bodyFont ?? doc.tokens.fonts.body;
  L.push(`- Fonts: headings '${head}', body '${body}'`);
  if (ctx.fontSizes.length) L.push(`- Font sizes (px): ${ctx.fontSizes.join(', ')}`);
  if (ctx.weights.length) L.push(`- Font weights: ${ctx.weights.join(', ')}`);
  if (ctx.radii.length) L.push(`- Corner radii: ${ctx.radii.join(', ')}`);
  if (ctx.shadows.length) L.push(`- Shadows: ${ctx.shadows.join(' | ')}`);
  if (ctx.spacing.length) L.push(`- Spacing scale (px): ${ctx.spacing.join(', ')}`);
  for (const b of ctx.buttons) L.push(`- Buttons look like: ${b}`);
  for (const c of ctx.cards) L.push(`- Cards look like: ${c}`);
  if (ctx.usesTokens) L.push(`- The page uses CSS variables: ${doc.tokens.colors.map((c) => `var(--k-${c.name})`).join(', ')}, var(--k-font-heading), var(--k-font-body), var(--k-radius) — reuse them.`);
  if (opts.withOutline !== false && ctx.outline) L.push(`- Current page structure (do not repeat these sections):\n${ctx.outline.split('\n').map((l) => '    ' + l).join('\n')}`);
  return L.join('\n');
}

/** Is there anything on the page worth matching? */
export function pageHasContent(doc: KDocument, rootId: NodeId | null): boolean {
  if (!rootId) return false;
  return (doc.nodes[rootId]?.children.length ?? 0) > 0;
}

/** Palette (hex list) for SVG prompts from any style source. */
export function paletteFor(doc: KDocument, source: StyleSource, opts: { rootIds?: NodeId[]; presetId?: string }): string[] {
  if (source === 'preset') {
    const p = getPreset(opts.presetId);
    return [p.colors.primary, p.colors.accent, p.colors.text, p.colors.surface, p.colors.background];
  }
  if (source === 'tokens') return doc.tokens.colors.map((c) => c.value);
  if ((source === 'match' || source === 'selection') && opts.rootIds?.length) {
    const ctx = extractStyleContext(doc, opts.rootIds, { outlineLines: 0 });
    const list = [...ctx.accents, ...ctx.texts.slice(0, 2), ...ctx.backgrounds.slice(0, 2)];
    if (list.length) return [...new Set(list)].slice(0, 6);
  }
  return [];
}
