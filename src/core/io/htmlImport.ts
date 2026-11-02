/**
 * HTML/CSS → Kinema nodes.
 *
 * Used by the AI engine (models write HTML+CSS far more reliably than custom JSON),
 * the component catalog / templates (authored as HTML snippets) and "Import HTML".
 *
 * Strategy: parse the markup with DOMParser, parse the CSS with our own parser,
 * then compute each element's *declared* styles at every breakpoint width by
 * evaluating media queries — so both desktop-first and mobile-first CSS map onto
 * Kinema's base → tablet → mobile cascade. :hover/:focus/:active rules become
 * interaction states, @keyframes + `animation` become KAnimations.
 */
import DOMPurify from 'dompurify';
import type { Breakpoint, BreakpointId, KAnimation, KNode, Keyframe, NodeId, NodeType, StyleMap } from '../model/types';
import { createNode, uid } from '../model/factory';
import { activeStyleRules, parseCss, specificity, type CssRule } from './cssParser';
import { parseDeclarations, styleMapToCss } from '../style/style';

export interface HtmlImportOptions {
  breakpoints: Breakpoint[];
  /** Extra CSS in addition to <style> tags in the markup. */
  css?: string;
  /** Reuse `data-kid` attributes as node ids (AI edits of existing nodes). */
  keepIds?: boolean;
  /** Ids that must not be reused (already in the document and not being replaced). */
  reservedIds?: Set<string>;
  aiGenerated?: boolean;
  /** Map image/video sources (e.g. to asset refs). */
  mapSrc?: (src: string) => string;
}

export interface HtmlImportResult {
  rootIds: NodeId[];
  nodes: Record<NodeId, KNode>;
  /** Declarations targeting html/body/:root, per breakpoint (custom properties, background, fonts…). */
  pageStyles: Record<BreakpointId, StyleMap>;
  fontFaces: StyleMap[];
  title?: string;
  warnings: string[];
}

const INLINE_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'br', 'span', 'code', 'mark', 'small', 'sub', 'sup', 'del', 'ins', 'abbr', 'kbd', 'q', 'time', 'cite', 'a']);
const DROP_TAGS = new Set(['script', 'style', 'link', 'meta', 'title', 'noscript', 'template', 'iframe', 'object', 'embed', 'base', 'head']);
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'blockquote', 'li', 'small', 'strong', 'em', 'b', 'i', 'code', 'pre', 'figcaption', 'dt', 'dd', 'td', 'th', 'caption', 'legend', 'cite', 'q', 'time', 'mark', 'sup', 'sub', 'abbr', 'div']);
const STATE_RE = /:(hover|focus-visible|focus-within|focus|active)\b/g;
const PSEUDO_EL_RE = /::?(before|after|placeholder|selection|marker|first-letter|first-line|-webkit-[\w-]+|-moz-[\w-]+)\b/i;

const TAG_NAMES: Record<string, string> = {
  header: 'Header', nav: 'Navigation', main: 'Main', section: 'Section', footer: 'Footer', article: 'Article', aside: 'Aside',
  h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', h5: 'Heading', h6: 'Heading', p: 'Paragraph', span: 'Text',
  ul: 'List', ol: 'List', li: 'List item', form: 'Form', label: 'Label', blockquote: 'Quote', figure: 'Figure', figcaption: 'Caption',
  img: 'Image', button: 'Button', a: 'Link', input: 'Input', textarea: 'Text area', select: 'Select', video: 'Video', svg: 'Vector',
  hr: 'Divider', table: 'Table', div: 'Box',
};

function prettify(s: string): string {
  const t = s
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function nameFor(el: Element): string {
  const id = el.getAttribute('id');
  if (id) return prettify(id);
  const dn = el.getAttribute('data-name');
  if (dn) return dn;
  const cls = (el.getAttribute('class') ?? '').split(/\s+/).find((c) => c && !/^(is|has|js)-/.test(c) && c.length > 1);
  if (cls) return prettify(cls);
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.slice(0, 40);
  const tag = el.tagName.toLowerCase();
  if (tag === 'img') return el.getAttribute('alt')?.slice(0, 40) || 'Image';
  if (/^h[1-6]$/.test(tag)) return `Heading ${tag[1]}`;
  return TAG_NAMES[tag] ?? prettify(tag);
}

/** Split a selector list at top-level commas. */
function splitSelectors(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function isPageSelector(sel: string): boolean {
  return /^(html|body|:root|\*)$/i.test(sel.trim()) || /^(html|:root)\s+body$/i.test(sel.trim());
}

interface Matched {
  spec: number;
  order: number;
  decls: StyleMap;
}

/** Cascade declared styles for every element at one width. */
function cascadeAt(body: HTMLElement, rules: CssRule[], width: number, collectStates: boolean) {
  const perEl = new Map<Element, Matched[]>();
  const states = new Map<Element, Record<string, StyleMap>>();
  const page: Matched[] = [];
  for (const r of activeStyleRules(rules, width)) {
    for (const raw of splitSelectors(r.selector)) {
      if (PSEUDO_EL_RE.test(raw)) continue;
      if (isPageSelector(raw)) {
        page.push({ spec: specificity(raw), order: r.order, decls: r.decls });
        continue;
      }
      const stateMatch = raw.match(STATE_RE);
      const stripped = raw.replace(STATE_RE, '').replace(/\s+$/, '') || '*';
      let els: NodeListOf<Element>;
      try {
        els = body.querySelectorAll(stripped.replace(/^(html|body)\s*>?\s*/i, '') || '*');
      } catch {
        continue;
      }
      if (stateMatch) {
        if (!collectStates) continue;
        const st = stateMatch[stateMatch.length - 1].slice(1);
        const key = st.startsWith('focus') ? 'focus' : st;
        // only apply state to the element the pseudo-class is attached to (last compound)
        els.forEach((el) => {
          const map = states.get(el) ?? {};
          map[key] = { ...(map[key] ?? {}), ...r.decls };
          states.set(el, map);
        });
        continue;
      }
      const spec = specificity(raw);
      els.forEach((el) => {
        const list = perEl.get(el);
        const m = { spec, order: r.order, decls: r.decls };
        if (list) list.push(m);
        else perEl.set(el, [m]);
      });
    }
  }
  const styles = new Map<Element, StyleMap>();
  for (const [el, list] of perEl) {
    list.sort((a, b) => a.spec - b.spec || a.order - b.order);
    const out: StyleMap = {};
    for (const m of list) Object.assign(out, m.decls);
    styles.set(el, out);
  }
  page.sort((a, b) => a.spec - b.spec || a.order - b.order);
  const pageStyle: StyleMap = {};
  for (const m of page) Object.assign(pageStyle, m.decls);
  return { styles, states, pageStyle };
}

function diffStyles(next: StyleMap, prev: StyleMap): StyleMap {
  const out: StyleMap = {};
  for (const k of Object.keys(next)) if (next[k] !== prev[k]) out[k] = next[k];
  for (const k of Object.keys(prev)) if (!(k in next)) out[k] = 'revert';
  return out;
}

// ─── Animation conversion ───────────────────────────────────────────────────

const TIME_RE = /^(-?\d*\.?\d+)(ms|s)$/;
const toMs = (v: string) => {
  const m = TIME_RE.exec(v.trim());
  return m ? parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1) : NaN;
};

/** Parse "translateY(20px) scale(.9) rotate(5deg)" into channels; null if unsupported. */
export function transformToChannels(t: string): Record<string, number> | null {
  const out: Record<string, number> = {};
  const re = /([a-zA-Z0-9]+)\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  let consumed = '';
  while ((m = re.exec(t))) {
    consumed += m[0];
    const fn = m[1].toLowerCase();
    const args = m[2].split(/[\s,]+/).filter(Boolean);
    const px = (s: string | undefined) => (s && /px$|^-?\d*\.?\d+$/.test(s) ? parseFloat(s) : s === undefined ? 0 : NaN);
    const deg = (s: string | undefined) => {
      if (!s) return 0;
      const n = parseFloat(s);
      if (s.endsWith('turn')) return n * 360;
      if (s.endsWith('rad')) return (n * 180) / Math.PI;
      return n;
    };
    switch (fn) {
      case 'translate':
      case 'translate3d':
        out.x = px(args[0]);
        out.y = px(args[1] ?? '0');
        break;
      case 'translatex':
        out.x = px(args[0]);
        break;
      case 'translatey':
        out.y = px(args[0]);
        break;
      case 'scale':
      case 'scale3d':
        if (args[1] && args[1] !== args[0]) {
          out.scaleX = parseFloat(args[0]);
          out.scaleY = parseFloat(args[1]);
        } else out.scale = parseFloat(args[0]);
        break;
      case 'scalex':
        out.scaleX = parseFloat(args[0]);
        break;
      case 'scaley':
        out.scaleY = parseFloat(args[0]);
        break;
      case 'rotate':
      case 'rotatez':
        out.rotate = deg(args[0]);
        break;
      case 'skew':
        out.skewX = deg(args[0]);
        out.skewY = deg(args[1]);
        break;
      case 'skewx':
        out.skewX = deg(args[0]);
        break;
      case 'skewy':
        out.skewY = deg(args[0]);
        break;
      default:
        return null;
    }
  }
  if (t.trim() === 'none') return {};
  if (consumed.replace(/\s/g, '').length !== t.replace(/\s/g, '').length) return null;
  for (const v of Object.values(out)) if (!Number.isFinite(v)) return null;
  return out;
}

function keyframesToModel(frames: { selector: string; decls: StyleMap }[]): Keyframe[] {
  const kfs: Keyframe[] = [];
  for (const f of frames) {
    for (const sel of f.selector.split(',')) {
      const s = sel.trim().toLowerCase();
      const offset = s === 'from' ? 0 : s === 'to' ? 1 : parseFloat(s) / 100;
      if (!Number.isFinite(offset)) continue;
      const values: Record<string, string | number> = {};
      let easing: string | undefined;
      for (const [k, v] of Object.entries(f.decls)) {
        if (k === 'animation-timing-function') easing = v;
        else if (k === 'transform') {
          const ch = transformToChannels(v);
          if (ch) Object.assign(values, ch);
          else values.transform = v;
        } else if (k === 'opacity') values.opacity = parseFloat(v);
        else values[k] = v;
      }
      const existing = kfs.find((k) => Math.abs(k.offset - offset) < 1e-6);
      if (existing) Object.assign(existing.values, values);
      else kfs.push({ id: uid('k'), offset, values, easing });
    }
  }
  return kfs.sort((a, b) => a.offset - b.offset);
}

const EASING_WORDS = /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end|cubic-bezier\(.+\)|steps\(.+\)|linear\(.+\))$/;

/** Parse `animation` shorthand(s) for an element into KAnimations (only for known keyframes). */
function animationsFromStyle(style: StyleMap, keyframes: Map<string, Keyframe[]>): KAnimation[] {
  const out: KAnimation[] = [];
  const shorthand = style.animation;
  const entries: string[] = shorthand ? splitSelectors(shorthand) : [];
  if (!shorthand && style['animation-name']) {
    entries.push(
      [style['animation-name'], style['animation-duration'] ?? '1s', style['animation-timing-function'] ?? '', style['animation-delay'] ?? '', style['animation-iteration-count'] ?? '', style['animation-direction'] ?? '', style['animation-fill-mode'] ?? '']
        .filter(Boolean)
        .join(' '),
    );
  }
  for (const entry of entries) {
    // tokenise respecting parentheses
    const tokens: string[] = [];
    let depth = 0;
    let buf = '';
    for (const ch of entry) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (/\s/.test(ch) && depth === 0) {
        if (buf) tokens.push(buf);
        buf = '';
      } else buf += ch;
    }
    if (buf) tokens.push(buf);
    let name = '';
    const times: number[] = [];
    let easing = 'ease';
    let iterations = 1;
    let direction: KAnimation['direction'] = 'normal';
    let fill: KAnimation['fill'] = 'both';
    for (const t of tokens) {
      if (TIME_RE.test(t)) times.push(toMs(t));
      else if (EASING_WORDS.test(t)) easing = t;
      else if (t === 'infinite') iterations = -1;
      else if (/^\d*\.?\d+$/.test(t)) iterations = Math.max(1, Math.round(parseFloat(t)));
      else if (/^(normal|reverse|alternate|alternate-reverse)$/.test(t)) direction = t as KAnimation['direction'];
      else if (/^(none|forwards|backwards|both)$/.test(t)) fill = t as KAnimation['fill'];
      else if (/^(running|paused)$/.test(t)) continue;
      else name = t.replace(/['"]/g, '');
    }
    const kfs = keyframes.get(name);
    if (!kfs || !kfs.length) continue;
    out.push({
      id: uid('a'),
      name: prettify(name) || 'Animation',
      trigger: iterations < 0 ? 'loop' : 'load',
      duration: Math.round(times[0] ?? 1000),
      delay: Math.round(times[1] ?? 0),
      iterations,
      direction,
      fill,
      easing,
      keyframes: kfs.map((k) => ({ ...k, id: uid('k'), values: { ...k.values } })),
      enabled: true,
    });
  }
  return out;
}

const ANIM_PROPS = ['animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state'];

// ─── Main ───────────────────────────────────────────────────────────────────

function collapseWs(html: string): string {
  return html.replace(/\s+/g, ' ').trim();
}

function isInlineOnly(el: Element): boolean {
  for (const c of Array.from(el.childNodes)) {
    if (c.nodeType === 3) continue;
    if (c.nodeType !== 1) continue;
    const ce = c as Element;
    const tag = ce.tagName.toLowerCase();
    if (!INLINE_TAGS.has(tag)) return false;
    if (tag === 'a' && Array.from(ce.children).some((x) => !INLINE_TAGS.has(x.tagName.toLowerCase()))) return false;
    if (!isInlineOnly(ce)) return false;
  }
  return true;
}

const RICH_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'span', 'a', 'code', 'mark', 'small', 'sub', 'sup', 'del', 'ins'];

export function importHtml(markup: string, opts: HtmlImportOptions): HtmlImportResult {
  const warnings: string[] = [];
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  const title = parsed.querySelector('title')?.textContent?.trim() || undefined;
  let css = opts.css ?? '';
  parsed.querySelectorAll('style').forEach((s) => (css += '\n' + (s.textContent ?? '')));
  parsed.querySelectorAll([...DROP_TAGS].join(',')).forEach((el) => el.remove());
  // strip event handler attributes everywhere
  parsed.querySelectorAll('*').forEach((el) => {
    for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  });

  const rules = parseCss(css);
  const keyframes = new Map<string, Keyframe[]>();
  const fontFaces: StyleMap[] = [];
  const walk = (rs: CssRule[]) => {
    for (const r of rs) {
      if (r.type === 'keyframes') keyframes.set(r.name, keyframesToModel(r.frames));
      else if (r.type === 'fontface') fontFaces.push(r.decls);
      else if (r.type === 'media') walk(r.rules);
    }
  };
  walk(rules);

  const body = parsed.body;
  const bps = opts.breakpoints.length ? opts.breakpoints : [{ id: 'base', name: 'Desktop', width: 1440, icon: 'desktop' as const }];
  const perBp = bps.map((bp, i) => ({ bp, ...cascadeAt(body, rules, bp.width, i === 0) }));
  const baseCascade = perBp[0];

  const pageStyles: Record<BreakpointId, StyleMap> = { [bps[0].id]: baseCascade.pageStyle };
  for (let i = 1; i < perBp.length; i++) {
    const d = diffStyles(perBp[i].pageStyle, perBp[i - 1].pageStyle);
    if (Object.keys(d).length) pageStyles[perBp[i].bp.id] = d;
  }

  const nodes: Record<NodeId, KNode> = {};
  const usedIds = new Set<string>();

  const stylesFor = (el: Element): { styles: Record<BreakpointId, StyleMap>; anims: KAnimation[] } => {
    const inline = parseDeclarations(el.getAttribute('style') ?? '');
    const byBp = perBp.map((c) => ({ ...(c.styles.get(el) ?? {}), ...inline }));
    const anims = animationsFromStyle(byBp[0], keyframes);
    const clean = (m: StyleMap) => {
      const o = { ...m };
      for (const p of ANIM_PROPS) delete o[p];
      return o;
    };
    const styles: Record<BreakpointId, StyleMap> = { [bps[0].id]: clean(byBp[0]) };
    for (let i = 1; i < byBp.length; i++) {
      const d = diffStyles(clean(byBp[i]), clean(byBp[i - 1]));
      if (Object.keys(d).length) styles[bps[i].id] = d;
    }
    return { styles, anims };
  };

  /** Inline cascaded styles onto inline descendants so classes survive inside rich text. */
  const inlineRichStyles = (el: Element, includeSelf = false) => {
    const targets = [...(includeSelf ? [el] : []), ...Array.from(el.querySelectorAll('*'))];
    targets.forEach((c) => {
      const st = baseCascade.styles.get(c);
      if (st && Object.keys(st).length) {
        const existing = parseDeclarations(c.getAttribute('style') ?? '');
        c.setAttribute('style', styleMapToCss({ ...st, ...existing }, '').replace(/\n/g, ' '));
      }
      c.removeAttribute('class');
    });
  };

  const makeId = (el: Element): string | undefined => {
    if (!opts.keepIds) return undefined;
    const k = el.getAttribute('data-kid');
    if (k && /^[a-z0-9_]+$/i.test(k) && !usedIds.has(k) && !opts.reservedIds?.has(k)) return k;
    return undefined;
  };

  const register = (n: KNode, parent: NodeId | null) => {
    n.parent = parent;
    usedIds.add(n.id);
    if (opts.aiGenerated) n.meta = { ...(n.meta ?? {}), aiGenerated: true };
    nodes[n.id] = n;
    if (parent) nodes[parent].children.push(n.id);
    return n;
  };

  const textNode = (html: string, parent: NodeId, tag = 'span') => {
    const n = createNode('text', { replaceStyles: true, styles: {}, tag, props: { text: html } });
    n.name = collapseWs(html.replace(/<[^>]+>/g, '')).slice(0, 32) || 'Text';
    register(n, parent);
  };

  const convert = (el: Element, parent: NodeId | null): NodeId | null => {
    const tag = el.tagName.toLowerCase();
    if (DROP_TAGS.has(tag)) return null;
    const { styles, anims } = stylesFor(el);
    const states = baseCascade.states.get(el);
    let type: NodeType = 'box';
    const props: KNode['props'] = {};
    let childrenMode: 'none' | 'children' | 'text' = 'children';
    let explicitTag: string | undefined = tag === 'div' ? undefined : tag;

    const attrs: Record<string, string> = {};
    for (const a of ['role', 'aria-label', 'title', 'id', 'name', 'for', 'type', 'required', 'min', 'max', 'step', 'datetime']) {
      const v = el.getAttribute(a);
      if (v != null && !(a === 'type' && (tag === 'input' || tag === 'button'))) attrs[a] = v;
    }

    switch (tag) {
      case 'img': {
        type = 'image';
        const src = el.getAttribute('src') ?? '';
        props.src = opts.mapSrc ? opts.mapSrc(src) : src;
        props.alt = el.getAttribute('alt') ?? '';
        childrenMode = 'none';
        explicitTag = undefined;
        break;
      }
      case 'svg': {
        type = 'svg';
        props.svg = DOMPurify.sanitize(el.outerHTML, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['script', 'foreignObject'] });
        childrenMode = 'none';
        explicitTag = undefined;
        break;
      }
      case 'video': {
        type = 'video';
        const src = el.getAttribute('src') ?? el.querySelector('source')?.getAttribute('src') ?? '';
        props.src = opts.mapSrc ? opts.mapSrc(src) : src;
        props.autoplay = el.hasAttribute('autoplay');
        props.loop = el.hasAttribute('loop');
        props.muted = el.hasAttribute('muted');
        props.controls = el.hasAttribute('controls');
        childrenMode = 'none';
        explicitTag = undefined;
        break;
      }
      case 'input': {
        const t = (el.getAttribute('type') ?? 'text').toLowerCase();
        if (t === 'submit' || t === 'button' || t === 'reset') {
          type = 'button';
          props.text = el.getAttribute('value') ?? 'Submit';
          explicitTag = undefined;
        } else {
          type = 'input';
          props.inputType = t;
          props.placeholder = el.getAttribute('placeholder') ?? undefined;
          props.value = el.getAttribute('value') ?? undefined;
          props.checked = el.hasAttribute('checked') || undefined;
          explicitTag = undefined;
        }
        childrenMode = 'none';
        break;
      }
      case 'textarea':
        type = 'textarea';
        props.placeholder = el.getAttribute('placeholder') ?? undefined;
        props.value = el.textContent ?? undefined;
        childrenMode = 'none';
        explicitTag = undefined;
        break;
      case 'select':
        type = 'select';
        props.options = Array.from(el.querySelectorAll('option')).map((o) => o.textContent?.trim() ?? '');
        childrenMode = 'none';
        explicitTag = undefined;
        break;
      case 'button':
        type = 'button';
        explicitTag = undefined;
        childrenMode = isInlineOnly(el) ? 'text' : 'children';
        break;
      case 'a':
        type = 'link';
        props.href = el.getAttribute('href') ?? '#';
        if (el.getAttribute('target') === '_blank') props.target = '_blank';
        explicitTag = undefined;
        childrenMode = isInlineOnly(el) ? 'text' : 'children';
        break;
      default: {
        const hasElementChildren = el.children.length > 0;
        const text = (el.textContent ?? '').trim();
        if (TEXT_TAGS.has(tag) && isInlineOnly(el) && (text || el.querySelector('br'))) {
          // div with only text: still a text node, but keep tag div
          type = 'text';
          childrenMode = 'text';
          explicitTag = tag === 'p' ? undefined : tag;
        } else if (!hasElementChildren && !text) {
          type = 'box';
          childrenMode = 'none';
        }
      }
    }

    if (childrenMode === 'text') {
      inlineRichStyles(el);
      const html = DOMPurify.sanitize(collapseWs(el.innerHTML), { ALLOWED_TAGS: RICH_TAGS, ALLOWED_ATTR: ['style', 'href', 'target', 'rel'] });
      props.text = html;
    }

    const node = createNode(type, { id: makeId(el), name: nameFor(el), tag: explicitTag, props, replaceStyles: true, styles: {} });
    node.styles = styles;
    if (states && Object.keys(states).length) node.states = states as KNode['states'];
    if (anims.length) node.animations = anims;
    if (Object.keys(attrs).length) node.props.attrs = attrs;
    if (type === 'svg' && !styles[bps[0].id].width && !styles[bps[0].id].height) {
      const w = el.getAttribute('width');
      const h = el.getAttribute('height');
      if (w) node.styles[bps[0].id].width = /^\d+$/.test(w) ? `${w}px` : w;
      if (h) node.styles[bps[0].id].height = /^\d+$/.test(h) ? `${h}px` : h;
    }
    register(node, parent);

    if (childrenMode === 'children') {
      // group runs of inline content into text nodes
      let run: string[] = [];
      const flush = () => {
        const html = collapseWs(run.join(''));
        run = [];
        if (html && html !== ' ') textNode(DOMPurify.sanitize(html, { ALLOWED_TAGS: RICH_TAGS, ALLOWED_ATTR: ['style', 'href', 'target', 'rel'] }), node.id);
      };
      for (const c of Array.from(el.childNodes)) {
        if (c.nodeType === 3) {
          const t = c.textContent ?? '';
          if (t.trim()) run.push(t.replace(/</g, '&lt;'));
          continue;
        }
        if (c.nodeType !== 1) continue;
        const ce = c as Element;
        const ctag = ce.tagName.toLowerCase();
        if (INLINE_TAGS.has(ctag) && ctag !== 'a' && ctag !== 'span' && isInlineOnly(ce)) {
          inlineRichStyles(ce, true);
          run.push(ce.outerHTML);
          continue;
        }
        flush();
        convert(ce, node.id);
      }
      flush();
    }
    return node.id;
  };

  const rootIds: NodeId[] = [];
  const topLevel = Array.from(body.childNodes);
  for (const c of topLevel) {
    if (c.nodeType === 3) {
      const t = (c.textContent ?? '').trim();
      if (t) {
        const n = createNode('text', { replaceStyles: true, styles: {}, props: { text: t.replace(/</g, '&lt;') } });
        register(n, null);
        rootIds.push(n.id);
      }
      continue;
    }
    if (c.nodeType !== 1) continue;
    const id = convert(c as Element, null);
    if (id) rootIds.push(id);
  }
  if (!rootIds.length) warnings.push('No elements found in the markup.');
  return { rootIds, nodes, pageStyles, fontFaces, title, warnings };
}

/**
 * Convenience: import markup and wrap multiple roots in a single box so it can be
 * inserted as one subtree. Returns null when nothing was imported.
 */
export function importHtmlAsSubtree(
  markup: string,
  opts: HtmlImportOptions & { wrapperName?: string },
): { rootId: NodeId; nodes: Record<NodeId, KNode>; result: HtmlImportResult } | null {
  const result = importHtml(markup, opts);
  if (!result.rootIds.length) return null;
  if (result.rootIds.length === 1) return { rootId: result.rootIds[0], nodes: result.nodes, result };
  const wrap = createNode('box', { name: opts.wrapperName ?? 'Group', replaceStyles: true, styles: { display: 'flex', 'flex-direction': 'column' } });
  for (const id of result.rootIds) {
    result.nodes[id].parent = wrap.id;
    wrap.children.push(id);
  }
  result.nodes[wrap.id] = wrap;
  return { rootId: wrap.id, nodes: result.nodes, result };
}
