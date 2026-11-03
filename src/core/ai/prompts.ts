/**
 * Prompt library for Kinema's local AI. Written for small local models (3–14B):
 * one clear role, a strict output contract stated first, short imperative rules
 * that match what Kinema's HTML importer supports, and one tiny example showing
 * the exact output shape. Keep these compact — every token costs context.
 */
import type { KDocument, NodeId } from '../model/types';
import { BUNDLED_FONTS } from '../fonts/designFonts';
import { extractStyleContext, getPreset, pageHasContent, renderPreset, renderStyleContext, renderTokens, type StyleSource } from './styleContext';
import type { ChatMessage } from './ollama';

export type HtmlMode = 'page' | 'section' | 'component';

export const FONT_LIST = BUNDLED_FONTS.filter((f) => f.category !== 'mono')
  .map((f) => `'${f.family}'`)
  .join(', ');

// ─── Shared rule blocks ──────────────────────────────────────────────────────

const HTML_RULES = `HTML
- Semantic tags: header, nav, section, article, footer, h1–h3, p, ul/li, a, button, form, label, input.
- Give every element you style a short class (BEM style: .pricing, .pricing__card). No inline style="" attributes, no <script>.
- Realistic, specific copy (product names, numbers, names, prices) — never lorem ipsum or placeholders like "Feature 1".
- No external files: no <img> URLs, no web fonts, no icon libraries. Use CSS gradients and small inline <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"> icons.

CSS
- Class selectors only (.card, .nav a). Do not use ::before / ::after (not supported) — use real elements.
- Layout with flexbox or grid + gap. No floats. position:absolute only for decorative shapes inside a position:relative parent.
- Sizes in px. Center content with max-width (e.g. 1160px) + margin: 0 auto. Body text 16–18px, line-height 1.5–1.7.
- Fonts: only these installed families (exact names): ${FONT_LIST}. Example: font-family: 'Inter Variable', sans-serif.
- Responsive: finish with @media (max-width:1024px) { … } and @media (max-width:640px) { … } that stack grids/rows into one column, reduce font sizes and padding.
- Interaction: links, buttons and cards get a :hover rule on the element itself (.btn:hover, not .card:hover .btn) and transition: transform .2s ease, box-shadow .2s ease, background .2s ease.
- Motion (tasteful, optional): @keyframes fade-up / scale-in applied with animation: fade-up .7s cubic-bezier(.16,1,.3,1) both; stagger siblings with animation-delay steps of .08–.12s.`;

const HTML_EXAMPLE = `<style>
.cta{display:flex;flex-direction:column;align-items:center;gap:20px;padding:96px 24px;background:linear-gradient(135deg,#1e1b4b,#4c1d95);color:#fff;text-align:center}
.cta__title{max-width:720px;font-size:44px;font-weight:800;line-height:1.1;animation:fade-up .7s cubic-bezier(.16,1,.3,1) both}
.cta__btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:999px;background:#a78bfa;color:#1e1b4b;font-weight:700;text-decoration:none;transition:transform .2s ease,box-shadow .2s ease}
.cta__btn:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(167,139,250,.45)}
@keyframes fade-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@media (max-width:640px){.cta{padding:64px 20px}.cta__title{font-size:32px}}
</style>
<section class="cta">
  <h2 class="cta__title">Ship your next launch in days, not months</h2>
  <a class="cta__btn" href="#">Start free trial <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
</section>`;

const UNIT_RULES: Record<HtmlMode, string> = {
  page: `Build a COMPLETE landing page: a header with logo + nav + button, a hero, 3–5 content sections that fit the brief (features grid, how-it-works, social proof / testimonials, pricing or FAQ, final call-to-action) and a footer.
The top-level elements must be siblings: <header>, several <section>s, <footer> — do not wrap them in one container. Put the page background, text color and font on a body { } rule.`,
  section: `Build ONE full-width <section> (a single root element) for the brief, with an inner container (max-width + margin: 0 auto). Make it rich: heading, supporting text and real content (cards, list, stats, form… whatever fits).`,
  component: `Build ONE self-contained component (a single root element: card, pricing table, navbar, form, testimonial, modal…). Give the root an explicit width (e.g. width: 380px) or max-width, its own background, padding and radius so it looks finished on its own.`,
};

// ─── System prompts ──────────────────────────────────────────────────────────

export function htmlSystemPrompt(mode: HtmlMode): string {
  return `You are Kinema's senior product designer and front-end engineer. You turn a brief into a polished, modern, production-quality ${mode === 'page' ? 'landing page' : mode} in semantic HTML with one <style> block.

OUTPUT FORMAT (strict)
- Reply with ONLY code: one <style>…</style> block, then the HTML. No markdown fences, no explanations, no <html>/<head>/<body> tags.
- ${UNIT_RULES[mode]}

${HTML_RULES}

QUALITY BAR: strong visual hierarchy, generous whitespace, consistent spacing scale (8/16/24/32/48/64/96px), one primary color used sparingly for actions, good contrast.

EXAMPLE OF THE FORMAT (content is only an illustration):
${HTML_EXAMPLE}`;
}

export const EDIT_SYSTEM_PROMPT = `You are Kinema's UI editor. You receive the HTML + CSS of part of a page and an instruction. You return the COMPLETE updated HTML + CSS for that part.

OUTPUT FORMAT (strict)
- Reply with ONLY one <style>…</style> block followed by the updated HTML. No markdown fences, no explanations.
- Return every element of the part (changed or not) — the reply replaces the original completely.

KEEP IDENTITY
- Every element has a data-kid attribute. Keep data-kid exactly as it is on every element you keep or change (even if you change its tag, class or text).
- New elements get NO data-kid. Never invent, change or duplicate data-kid values.
- Only remove elements when the instruction requires it. Leave unrelated elements as they were.
- Keep elements that have data-ksvg="keep" or data-kinstance exactly as they are (same tag, attributes, empty content).

CSS
- Class selectors only; you may add or rename classes. Keep and update the @media (max-width:1024px) and (max-width:640px) blocks.
- Flexbox/grid + gap for layout, px units, :hover on the element itself with transition. No ::before/::after.
- Only use these fonts: ${FONT_LIST}, or var(--k-font-heading) / var(--k-font-body).

EXAMPLE
Input:
<style>
.buy{padding:10px 16px;background:#2563eb;color:#fff;border-radius:6px}
</style>
<a data-kid="n_a1" class="buy" href="#">Buy</a>
Instruction: make it a pill with a hover lift
Reply:
<style>
.buy{display:inline-flex;align-items:center;padding:12px 24px;background:#2563eb;color:#fff;border-radius:999px;font-weight:600;transition:transform .2s ease,box-shadow .2s ease}
.buy:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(37,99,235,.35)}
</style>
<a data-kid="n_a1" class="buy" href="#">Buy now</a>`;

export const ANIMATE_SYSTEM_PROMPT = `You are Kinema's motion designer. You choreograph tasteful UI animations for the listed elements and reply with JSON only.

OUTPUT FORMAT (strict JSON, no markdown):
{"animations":[{"target":"<data-kid>","name":"Fade up","trigger":"load","duration":700,"delay":0,"easing":"cubic-bezier(0.16, 1, 0.3, 1)","iterations":1,"stagger":0,"keyframes":[{"offset":0,"opacity":0,"y":24},{"offset":1,"opacity":1,"y":0}]}]}

RULES
- target: a data-kid from ELEMENTS. Never invent targets.
- trigger: "load" (page load), "inView" (scrolled into view — use for sections below the hero), "hover", "click", "loop" (repeats forever).
- duration / delay / stagger in milliseconds. Entrances 400–900, hover 150–300, loops 1500–4000.
- keyframes: 2–5 frames, offset 0 → 1. Channels: opacity (0–1), x and y (px), scale (1 = normal), rotate (deg), blur (px), color, backgroundColor (CSS colors).
- Entrances END at the natural state: opacity 1, x 0, y 0, scale 1, rotate 0, blur 0.
- stagger > 0 animates the element's children one after another — use it on lists, grids, nav bars and card rows (target the parent, not each child).
- Choreograph: the main heading first, then text, then buttons/cards with increasing delays (80–150 ms apart). One animation per element.
- Easing: "cubic-bezier(0.16, 1, 0.3, 1)" for entrances, "cubic-bezier(0.34, 1.56, 0.64, 1)" for playful pops, "ease-in-out" for loops.
- Optional "targetSelector" (e.g. "path, circle") animates matching inner parts of an SVG instead of the whole element (combine with stagger for draw/pop-in effects).`;

export const SVG_SYSTEM_PROMPT = `You are Kinema's brand and icon designer. You draw crisp, modern, flat vector artwork as ONE SVG.

OUTPUT FORMAT (strict)
- Reply with ONLY the <svg>…</svg> markup. No markdown fences, no explanations.
- Root tag: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"> (wide wordmarks: viewBox="0 0 640 200"). Well-formed XML: close every tag.

DRAWING RULES
- Flat vector style: bold geometric silhouette, balanced negative space, centered, at least 16 units of padding, readable at 32px.
- At most ~40 elements: <path>, <circle>, <rect>, <ellipse>, <polygon>, <line>, <g>. Prefer a few strong shapes over many tiny ones.
- Colors: use the palette given. <linearGradient>/<radialGradient> inside <defs> are welcome (unique ids, referenced with fill="url(#id)").
- No text or letters unless the brief asks for a wordmark/monogram; then use <text> with font-family="'Inter Variable', sans-serif" font-weight="700".
- Forbidden: <image>, <script>, <foreignObject>, <style>, animation, external links.

EXAMPLE
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect x="24" y="24" width="208" height="208" rx="56" fill="url(#bg)"/><path d="M80 172V84l48 56 48-56v88" fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ─── Style sections ──────────────────────────────────────────────────────────

const FRESH_SECTION = `DESIGN DIRECTION — free choice: pick a cohesive, modern palette that suits the brief (one primary, one accent, warm or cool neutrals) with strong contrast, and at most two of the installed fonts.`;

export interface StyleSectionOpts {
  source: StyleSource;
  /** current page/component root */
  rootId: NodeId | null;
  selection: NodeId[];
  presetId?: string;
}

/** Prompt section describing the style to follow for the chosen source. */
export function buildStyleSection(doc: KDocument, o: StyleSectionOpts): string {
  switch (o.source) {
    case 'match':
      if (o.rootId && pageHasContent(doc, o.rootId)) return renderStyleContext(extractStyleContext(doc, [o.rootId]), doc, { label: 'from the canvas' });
      return FRESH_SECTION;
    case 'selection':
      if (o.selection.length) return renderStyleContext(extractStyleContext(doc, o.selection), doc, { label: 'from the selected elements', withOutline: false });
      return FRESH_SECTION;
    case 'tokens':
      return renderTokens(doc);
    case 'preset':
      return renderPreset(getPreset(o.presetId));
    default:
      return FRESH_SECTION;
  }
}

// ─── Message builders ────────────────────────────────────────────────────────

export function htmlMessages(mode: HtmlMode, prompt: string, styleSection: string, images?: string[]): ChatMessage[] {
  const label = mode === 'page' ? 'landing page' : mode;
  const user = `${styleSection}${images?.length ? '\n(The attached image is a screenshot of the current canvas — match its look.)' : ''}

BRIEF (${label}): ${prompt.trim()}

Reply with the <style> block and the HTML only.`;
  return [
    { role: 'system', content: htmlSystemPrompt(mode) },
    { role: 'user', content: user, ...(images?.length ? { images } : {}) },
  ];
}

export function editMessages(html: string, prompt: string, opts: { regenerate?: boolean; styleSection?: string; count: number; images?: string[] }): ChatMessage[] {
  const instruction = opts.regenerate
    ? `Redesign this as a fresh ALTERNATIVE: keep the same content, purpose and data-kids, but change the layout, composition and visual treatment (different arrangement, background, emphasis, card style).${prompt.trim() ? ` Direction: ${prompt.trim()}` : ''}`
    : prompt.trim();
  const user = `${opts.styleSection ? opts.styleSection + '\n\n' : ''}CURRENT HTML (${opts.count} elements):
${html}

INSTRUCTION: ${instruction}

Reply with the complete updated <style> block and HTML. Keep every data-kid you keep.`;
  return [
    { role: 'system', content: EDIT_SYSTEM_PROMPT },
    { role: 'user', content: user, ...(opts.images?.length ? { images: opts.images } : {}) },
  ];
}

export function animateMessages(outline: string, prompt: string): ChatMessage[] {
  const user = `ELEMENTS (data-kid, tag, “name”, text, [layout], (children)):
${outline}

REQUEST: ${prompt.trim() || 'A polished, staggered entrance animation for these elements.'}

Reply with the JSON object only.`;
  return [
    { role: 'system', content: ANIMATE_SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

export function svgMessages(prompt: string, palette: string[], variant: { index: number; total: number; previous: string[] }): ChatMessage[] {
  const pal = palette.length ? `PALETTE: ${palette.join(', ')} (plus white/near-black if needed)` : 'PALETTE: your choice — 2–3 harmonious colors.';
  const vary =
    variant.total > 1 && variant.index > 0
      ? `\nThis is variant ${variant.index + 1} of ${variant.total}: use a clearly DIFFERENT concept and composition than the previous variant(s)${variant.previous.length ? ` (${variant.previous.join('; ')})` : ''}.`
      : '';
  return [
    { role: 'system', content: SVG_SYSTEM_PROMPT },
    { role: 'user', content: `${pal}\n\nBRIEF: ${prompt.trim()}${vary}\n\nReply with the <svg> only.` },
  ];
}

/** Second-attempt message appended after an unusable reply. */
export function retryMessages(kind: 'html' | 'edit' | 'svg' | 'json', previous: string, error: string): ChatMessage[] {
  const how = {
    html: 'Reply again with ONLY one <style> block followed by the HTML — no markdown, no explanations.',
    edit: 'Reply again with ONLY the <style> block and the complete updated HTML, keeping the data-kid attributes.',
    svg: 'Reply again with ONLY one valid <svg xmlns="http://www.w3.org/2000/svg" viewBox="…"> … </svg>, well-formed XML with every tag closed.',
    json: 'Reply again with ONLY the JSON object {"animations":[…]} using targets from ELEMENTS.',
  }[kind];
  const prev = previous.length > 1600 ? previous.slice(0, 1600) + '…' : previous;
  return [
    { role: 'assistant', content: prev || '(empty reply)' },
    { role: 'user', content: `Your reply could not be used: ${error}\n${how}` },
  ];
}

// ─── Example prompts (UI chips) ─────────────────────────────────────────────

export const EXAMPLE_PROMPTS: Record<'page' | 'section' | 'component' | 'edit' | 'animate' | 'svg', string[]> = {
  page: [
    'Landing page for a cozy specialty coffee subscription called “Ember & Bean”',
    'SaaS landing page for an AI meeting-notes app with pricing and FAQ',
    'Portfolio for a product designer with case studies and contact form',
    'Event page for a 2-day indie game developer conference in Lisbon',
  ],
  section: [
    'Pricing section with 3 tiers, monthly/yearly note and a highlighted plan',
    'Testimonials grid with 6 customer quotes, names and roles',
    'Features section with 6 icon cards',
    'FAQ section with 5 questions in expandable-looking rows',
  ],
  component: [
    'Glassy login card with email, password and social buttons',
    'Pricing card for a “Pro” plan with a feature checklist',
    'Navbar with logo, 4 links and a “Get started” button',
    'Product card for wireless headphones with rating and price',
  ],
  edit: ['Make it feel more premium: more whitespace, softer shadows', 'Switch to a dark theme', 'Make the buttons pill-shaped with a hover glow', 'Tighten the copy and make the heading punchier'],
  animate: ['Staggered fade-up entrance for everything', 'Playful pop-in for the cards when scrolled into view', 'Subtle floating loop on the hero visual', 'Buttons lift and glow on hover'],
  svg: ['Logo for “Northwind”, a sailing analytics startup', 'Minimal rocket icon', 'Abstract hero illustration with soft gradient blobs', 'Monogram logo “KD” in a rounded square'],
};
