/**
 * Kinema site compiler: KDocument → static HTML/CSS/JS.
 *
 * The output mirrors the canvas renderer (features/canvas/NodeView) exactly:
 * same tags per node type, same instance expansion (instance root styles over
 * master root styles, per-master-node overrides), same rich-text / SVG
 * sanitization, same placeholders, and the same design reset (global instead of
 * scoped). Breakpoint styles become desktop-first `@media (max-width)` blocks
 * that reproduce the editor's base → … → breakpoint cascade.
 *
 * Text generation is synchronous, pure and deterministic; only reading binary
 * assets/fonts is async (`compileSite`), through injected readers.
 */
import type { InstanceOverride, InteractionState, KAnimation, KAsset, KDocument, KNode, NodeId, StyleMap } from '../model/types';
import { DEFAULT_TAGS, TEXT_TYPES } from '../model/factory';
import { resolveStyles, tokenCssVars } from '../style/style';
import { designResetCss } from '../style/reset';
import { compileFrames } from '../anim/compile';
import type { FontFile } from '../fonts/designFonts';
import { FileNamer, Namer, slugify, splitFileName } from './naming';
import { safeAttrs, safeTag, safeUrl, sanitizeRichText, sanitizeSvgMarkup } from './sanitize';
import { cleanValue, formatRule, minifyCss, validProp, type Decls } from './css';
import { FontUsage, fontFormat, quoteFamily, resolveFonts } from './fonts';
import { minifyRuntime, runtimeSource, type RuntimeFeatures } from './runtime';
import { remapIterationEasing } from './easing';

// ─── Public types ────────────────────────────────────────────────────────────

export interface OutFile {
  /** relative path, forward slashes (e.g. `assets/logo.png`) */
  path: string;
  data: Uint8Array | string;
}

export type AssetMode = 'files' | 'inline' | 'external';

export interface ExportOptions {
  /** Pages to export (default: all, in document order). */
  pageIds?: string[];
  /** Export a single element (component) as the page instead of whole pages. */
  rootNodeId?: NodeId;
  /** With `rootNodeId`: drop the element's own offsets so it sits in normal flow. */
  isolate?: boolean;
  /** Compact output (no indentation / comments). */
  minify?: boolean;
  /** Make animations instant for `prefers-reduced-motion: reduce` (default true). */
  respectReducedMotion?: boolean;
  /** `files`: styles.css + script.js + assets; `single`: everything inlined per page. */
  bundle?: 'files' | 'single';
  /** How binary assets are referenced: copied files, data URIs, or external URLs (preview). */
  assets?: AssetMode;
  /** External mode: URL for a project asset (blob:/kasset:). */
  assetUrl?: (asset: KAsset) => string | undefined;
  /** External mode: URL for a bundled font file. */
  fontUrl?: (file: FontFile) => string;
  /** Reads a project asset's bytes (e.g. `platform.assets.read`). */
  readAsset?: (asset: KAsset) => Promise<Uint8Array>;
  /** Reads a bundled font file (default: `fetch(file.url)`). */
  readFont?: (file: FontFile) => Promise<Uint8Array>;
  /** Copy/declare fonts (default true). */
  includeFonts?: boolean;
  title?: string;
  description?: string;
  lang?: string;
  /** Add `data-kid` attributes matching the canvas (fidelity tests). */
  annotate?: boolean;
}

export interface BinaryRef {
  path: string;
  mime: string;
  kind: 'asset' | 'font';
  asset?: KAsset;
  font?: FontFile;
  /** known size in bytes (assets), if any */
  size?: number;
}

export interface ExportStats {
  pages: number;
  elements: number;
  classes: number;
  animations: number;
  keyframes: number;
  fonts: string[];
  htmlBytes: number;
  cssBytes: number;
  jsBytes: number;
  assetBytes: number;
  warnings: string[];
}

export interface PageOut {
  id: string;
  name: string;
  file: string;
}

export interface SiteText {
  /** Text files (HTML/CSS/JS). In `inline` asset mode they contain placeholders until `compileSite` resolves them. */
  files: OutFile[];
  /** Binary files the text refers to (copied in `files` mode, embedded in `inline` mode). */
  binaries: BinaryRef[];
  entry: string;
  pages: PageOut[];
  stats: ExportStats;
}

export interface CompileResult {
  files: OutFile[];
  entry: string;
  pages: PageOut[];
  stats: ExportStats;
}

export interface Fragment {
  html: string;
  css: string;
  js: string;
}

// ─── Internal model ──────────────────────────────────────────────────────────

interface InstCtx {
  instance: KNode;
  overrides: Record<NodeId, InstanceOverride>;
  masterRootId: NodeId;
  depth: number;
}

interface El {
  key: string;
  node: KNode;
  inst: InstCtx | null;
  /** Instance whose rendered root this element is. */
  instNode?: KNode;
  parent: El | null;
  children: El[];
  cls: string;
  extraCls?: string;
  /** Effective instance-specific styles per breakpoint (compound rule). */
  extraPerBp?: StyleMap[];
  dataKid?: string;
  anims: KAnimation[];
  /** Runtime hooks set on this element. */
  hooks: { inview?: boolean; hover?: 'once' | 'loop'; click?: boolean; each?: string[] };
  isolate?: boolean;
}

interface AnimApp {
  anim: KAnimation;
  kf: string;
  easing: string;
  owner: El;
  /** ms number, or a CSS expression (calc) */
  delay: number | string;
  inherited: boolean;
}

const STATE_PSEUDO: Record<InteractionState, string> = { hover: ':hover', focus: ':focus-visible', active: ':active' };
const STATE_ORDER: InteractionState[] = ['hover', 'focus', 'active'];
const STATE_CLASS = { inView: 'is-inview', hover: 'is-hovered', click: 'is-clicked' } as const;
const POSITION_KEYS = ['left', 'top', 'right', 'bottom', 'inset'];

const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'button', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'input', 'kbd', 'label', 'mark',
  'meter', 'output', 'progress', 'q', 's', 'samp', 'select', 'small', 'span', 'strong', 'sub', 'sup', 'textarea', 'time', 'u',
  'var', 'del', 'ins', 'font', 'nobr', 'wbr',
]);
/** Display:block via the design reset. */
const RESET_BLOCK = new Set(['img', 'svg', 'video', 'canvas', 'picture']);

const PLACEHOLDER_STYLE =
  'display: flex; align-items: center; justify-content: center; background-color: rgba(124, 92, 255, 0.08); ' +
  'background-image: repeating-linear-gradient(45deg, rgba(124,92,255,0.07) 0 10px, transparent 10px 20px); color: rgba(124, 92, 255, 0.6)';
const IMAGE_GLYPH =
  '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="max-width: 40%; max-height: 40%" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg>';
const VIDEO_GLYPH =
  '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="max-width: 40%; max-height: 40%" aria-hidden="true"><rect x="2" y="5" width="15" height="14" rx="2"></rect><path d="M17 10l5-3v10l-5-3z"></path></svg>';

const INLINE_TOKEN = 'kinema-inline:';
const ASSET_RE = /asset:([a-z0-9_]+)/gi;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hasDecls(m: StyleMap | undefined): boolean {
  if (!m) return false;
  for (const k in m) if (m[k] !== undefined && m[k] !== null && m[k] !== '') return true;
  return false;
}

// ─── Compiler context ────────────────────────────────────────────────────────

class Compiler {
  readonly bps;
  readonly namer = new Namer(['k-placeholder', ...Object.values(STATE_CLASS)]);
  readonly assetFiles = new FileNamer();
  readonly assetPaths = new Map<string, string>();
  readonly usedAssets = new Set<string>();
  readonly warnings = new Set<string>();
  readonly fonts = new FontUsage();
  readonly pageFiles = new Map<string, string>();
  readonly mode: AssetMode;
  readonly min: boolean;
  private resolvedCache = new Map<string, StyleMap[]>();
  private effCache = new Map<El, StyleMap[]>();
  elements = 0;
  firstImageDone = false;
  runtime: RuntimeFeatures;

  constructor(
    readonly doc: KDocument,
    readonly opts: ExportOptions,
  ) {
    this.bps = doc.breakpoints.length ? doc.breakpoints : [{ id: 'base', name: 'Desktop', width: 1440, icon: 'desktop' as const }];
    this.min = !!opts.minify;
    this.mode = opts.bundle === 'single' && opts.assets !== 'external' ? 'inline' : (opts.assets ?? 'files');
    this.runtime = { inView: false, hover: false, click: false, each: false, respectReducedMotion: opts.respectReducedMotion !== false };
    const files = new FileNamer(['styles.css', 'script.js']);
    doc.pages.forEach((p, i) => this.pageFiles.set(p.id, i === 0 ? files.take('index', '.html') : files.take(slugify(p.name) || 'page', '.html')));
  }

  warn(msg: string) {
    this.warnings.add(msg);
  }

  // ── styles ──

  resolved(node: KNode): StyleMap[] {
    let v = this.resolvedCache.get(node.id);
    if (!v) {
      v = this.bps.map((b) => resolveStyles(this.doc, node, b.id));
      this.resolvedCache.set(node.id, v);
    }
    return v;
  }

  /** Effective style per breakpoint, exactly as the canvas computes it. */
  effective(el: El): StyleMap[] {
    let v = this.effCache.get(el);
    if (!v) {
      const base = this.classStyles(el);
      v = base.map((m, i) => (el.extraPerBp ? { ...m, ...el.extraPerBp[i] } : m));
      this.effCache.set(el, v);
    }
    return v;
  }

  classStyles(el: El): StyleMap[] {
    const r = this.resolved(el.node);
    return el.isolate ? r.map(isolateStyles) : r;
  }

  // ── asset / page references ──

  assetPath(a: KAsset): string {
    let p = this.assetPaths.get(a.id);
    if (!p) {
      const { base, ext } = splitFileName(a.path || a.name);
      p = this.assetFiles.take(`${a.kind === 'font' ? 'fonts' : 'assets'}/${base}`, ext);
      this.assetPaths.set(a.id, p);
    }
    return p;
  }

  assetUrl(id: string): string {
    const a = this.doc.assets[id];
    if (!a) {
      this.warn(`Missing asset "${id}" was left out.`);
      return '';
    }
    this.usedAssets.add(id);
    const path = this.assetPath(a);
    if (this.mode === 'inline') return INLINE_TOKEN + path;
    if (this.mode === 'external') return this.opts.assetUrl?.(a) ?? path;
    return path;
  }

  rewriteRefs(value: string): string {
    if (!value || value.indexOf('asset:') < 0) return value;
    return value.replace(ASSET_RE, (_m, id: string) => this.assetUrl(id));
  }

  href(raw: string | undefined): string {
    const v = (raw ?? '').trim();
    if (!v) return '#';
    const m = /^page:(.+)$/.exec(v);
    if (m) return this.pageFiles.get(m[1]) ?? '#';
    return safeUrl(this.rewriteRefs(v));
  }

  // ── expansion (mirrors NodeView) ──

  expand(id: NodeId, inst: InstCtx | null, parent: El | null, prefix: string, isolate = false): El | null {
    const node = this.doc.nodes[id];
    if (!node || node.hidden) return null;
    if (node.type === 'instance') {
      const comp = node.props.componentId ? this.doc.components[node.props.componentId] : undefined;
      const master = comp ? this.doc.nodes[comp.rootId] : undefined;
      if (!comp || !master || (inst && inst.depth > 8)) {
        this.warn(`"${node.name}" refers to a missing component and was skipped.`);
        return null;
      }
      if (master.hidden) return null;
      const ctx: InstCtx = { instance: node, overrides: node.overrides ?? {}, masterRootId: comp.rootId, depth: (inst?.depth ?? 0) + 1 };
      return this.makeEl(master, ctx, parent, `${prefix}${node.id}/`, node, isolate);
    }
    return this.makeEl(node, inst, parent, prefix, undefined, isolate);
  }

  private makeEl(node: KNode, inst: InstCtx | null, parent: El | null, prefix: string, instNode: KNode | undefined, isolate: boolean): El {
    this.elements++;
    const el: El = {
      key: prefix + node.id,
      node,
      inst,
      instNode,
      parent,
      children: [],
      cls: this.namer.name(node.id, node.name, node.type),
      anims: [...(node.animations ?? []), ...(instNode?.animations ?? [])].filter((a) => a.enabled !== false && a.keyframes?.length),
      hooks: {},
      isolate,
    };
    if (inst) {
      const ov = inst.overrides[node.id];
      if (instNode) {
        const instStyles = this.resolved(instNode);
        el.extraCls = this.namer.name(`inst:${instNode.id}`, instNode.name, 'instance');
        el.extraPerBp = instStyles.map((m) => ({ ...m, ...(ov?.styles ?? {}) }));
        if (isolate) el.extraPerBp = el.extraPerBp.map(isolateStyles);
        el.dataKid = instNode.id;
      } else if (hasDecls(ov?.styles)) {
        el.extraCls = this.namer.name(`ov:${inst.instance.id}:${node.id}`, `${inst.instance.name} ${node.name}`, 'override');
        el.extraPerBp = this.bps.map(() => ({ ...ov!.styles }));
      }
    } else el.dataKid = node.id;

    const childBearing = node.type === 'frame' || node.type === 'box' || TEXT_TYPES.has(node.type);
    if (childBearing) {
      for (const c of node.children) {
        const ce = this.expand(c, inst, el, prefix);
        if (ce) el.children.push(ce);
      }
    }
    return el;
  }
}

function isolateStyles(m: StyleMap): StyleMap {
  if (!POSITION_KEYS.some((k) => k in m) && m.position !== 'absolute' && m.position !== 'fixed') return m;
  const o = { ...m };
  for (const k of POSITION_KEYS) delete o[k];
  if (o.position === 'absolute' || o.position === 'fixed') o.position = 'relative';
  return o;
}

// ─── CSS collection ──────────────────────────────────────────────────────────

interface RuleEntry {
  sel: string;
  decls: Decls;
}

class CssCollector {
  readonly base: RuleEntry[] = [];
  readonly media: RuleEntry[][];
  readonly states: RuleEntry[] = [];
  readonly svgSelectors: string[] = [];
  readonly keyframes = new Map<string, string>();
  readonly animRules: RuleEntry[] = [];
  private seen = new Set<string>();
  animations = 0;
  inView = false;

  constructor(private c: Compiler) {
    this.media = c.bps.map(() => []);
  }

  decls(map: StyleMap): Decls {
    const out: Decls = [];
    for (const [k, raw] of Object.entries(map)) {
      if (raw === undefined || raw === null || raw === '') continue;
      if (!validProp(k)) continue;
      const v = cleanValue(this.c.rewriteRefs(String(raw)));
      if (!v) continue;
      this.c.fonts.addDecl(k, v);
      out.push([k, v]);
    }
    return out;
  }

  /** Base rule + desktop-first media diffs for one selector. */
  addCascade(sel: string, perBp: StyleMap[]) {
    if (this.seen.has(sel)) return;
    this.seen.add(sel);
    this.base.push({ sel, decls: this.decls(perBp[0]) });
    for (let i = 1; i < perBp.length; i++) {
      const prev = perBp[i - 1];
      const cur = perBp[i];
      const diff: StyleMap = {};
      for (const k of Object.keys(cur)) if (cur[k] !== prev[k]) diff[k] = cur[k];
      const d = this.decls(diff);
      if (!d.length) continue;
      if (this.c.bps[i].maxWidth == null) {
        this.c.warn(`Breakpoint "${this.c.bps[i].name}" has no width limit; its styles were not exported.`);
        continue;
      }
      this.media[i].push({ sel, decls: d });
    }
  }

  addStates(sel: string, node: KNode | undefined) {
    if (!node?.states) return;
    const key = `states:${sel}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    for (const st of STATE_ORDER) {
      const m = node.states[st];
      if (!hasDecls(m)) continue;
      this.states.push({ sel: `${sel}${STATE_PSEUDO[st]}`, decls: this.decls(m!) });
    }
  }

  collect(el: El) {
    const c = this.c;
    this.addCascade(`.${el.cls}`, c.classStyles(el));
    this.addStates(`.${el.cls}`, el.node);
    if (el.extraCls && el.extraPerBp) {
      const sel = `.${el.cls}.${el.extraCls}`;
      this.addCascade(sel, el.extraPerBp);
      this.addStates(sel, el.instNode);
    }
    if (el.node.type === 'svg') {
      const s = `.${el.cls} > svg`;
      if (!this.svgSelectors.includes(s)) this.svgSelectors.push(s);
    }
    if (el.node.type === 'text' || el.node.type === 'button' || el.node.type === 'link') {
      const ov = el.inst?.overrides[el.node.id];
      const text = ov?.text ?? el.node.props.text ?? '';
      if (text.indexOf('font') >= 0) c.fonts.addCssText(text);
    }
    for (const ch of el.children) this.collect(ch);
  }
}

// ─── Animations ──────────────────────────────────────────────────────────────

class AnimCollector {
  readonly targets = new Map<El, AnimApp[]>();
  readonly selTargets = new Map<string, { owner: El; sel: string; apps: AnimApp[] }>();
  readonly order: El[] = [];
  private kfByAnim = new Map<KAnimation, { name: string; easing: string } | null>();

  constructor(
    private c: Compiler,
    private css: CssCollector,
  ) {}

  keyframes(anim: KAnimation): { name: string; easing: string } | null {
    if (this.kfByAnim.has(anim)) return this.kfByAnim.get(anim)!;
    const frames = compileFrames(anim);
    if (!frames.length) {
      this.kfByAnim.set(anim, null);
      return null;
    }
    const easing = anim.easing || 'ease';
    const remapped = remapIterationEasing(frames, easing);
    const list = remapped ?? frames;
    const lines = list.map((f) => {
      const pct = `${Math.round(f.offset * 10000) / 100}%`;
      const decls: string[] = [];
      for (const [k, v] of Object.entries(f.decls)) {
        if (!validProp(k)) continue;
        const val = cleanValue(this.c.rewriteRefs(String(v)));
        if (val) decls.push(`${k}: ${val};`);
      }
      if (f.easing) decls.push(`animation-timing-function: ${cleanValue(f.easing)};`);
      return `  ${pct} { ${decls.join(' ')} }`;
    });
    const body = lines.join('\n');
    const name = this.c.namer.name(`kf:${body}`, anim.name || anim.presetId || 'animation', 'animation');
    if (!this.css.keyframes.has(name)) this.css.keyframes.set(name, `@keyframes ${name} {\n${body}\n}`);
    const out = { name, easing: remapped ? 'linear' : easing };
    this.kfByAnim.set(anim, out);
    return out;
  }

  private push(target: El, app: AnimApp) {
    let list = this.targets.get(target);
    if (!list) {
      list = [];
      this.targets.set(target, list);
      this.order.push(target);
    }
    list.push(app);
  }

  collect(el: El) {
    for (const anim of el.anims) {
      const kf = this.keyframes(anim);
      if (!kf) continue;
      this.css.animations++;
      this.hook(el, anim);
      const stagger = Math.max(0, anim.stagger ?? 0);
      const sel = anim.targetSelector?.trim();
      if (sel) {
        const each = (el.hooks.each ??= []);
        let idx = each.indexOf(sel);
        if (idx < 0) idx = each.push(sel) - 1;
        this.c.runtime.each = true;
        const v = idx ? `--k-i-${idx + 1}` : '--k-i';
        const delay = stagger ? `calc(${anim.delay}ms + var(${v}, 0) * ${stagger}ms)` : anim.delay;
        const key = `${el.key}\u0000${sel}`;
        let entry = this.selTargets.get(key);
        if (!entry) this.selTargets.set(key, (entry = { owner: el, sel, apps: [] }));
        entry.apps.push({ anim, kf: kf.name, easing: kf.easing, owner: el, delay, inherited: false });
      } else if (stagger > 0 && el.children.length) {
        el.children.forEach((child, i) =>
          this.push(child, { anim, kf: kf.name, easing: kf.easing, owner: el, delay: anim.delay + i * stagger, inherited: true }),
        );
      } else {
        this.push(el, { anim, kf: kf.name, easing: kf.easing, owner: el, delay: anim.delay, inherited: false });
      }
    }
    for (const ch of el.children) this.collect(ch);
  }

  private hook(el: El, anim: KAnimation) {
    const rt = this.c.runtime;
    if (anim.trigger === 'inView') {
      el.hooks.inview = true;
      rt.inView = true;
      this.css.inView = true;
    } else if (anim.trigger === 'hover') {
      const infinite = anim.iterations < 0;
      el.hooks.hover = infinite || el.hooks.hover === 'loop' ? 'loop' : 'once';
      rt.hover = true;
    } else if (anim.trigger === 'click') {
      el.hooks.click = true;
      rt.click = true;
    }
  }

  shorthand(app: AnimApp, paused = false): string {
    const a = app.anim;
    const parts = [app.kf, `${Math.max(1, Math.round(a.duration))}ms`, app.easing];
    const delay = typeof app.delay === 'number' ? (app.delay ? `${Math.round(app.delay)}ms` : '') : app.delay;
    if (delay) parts.push(delay);
    const infinite = a.iterations < 0 || a.trigger === 'loop';
    const iters = infinite ? 'infinite' : String(Math.max(1, a.iterations));
    if (iters !== '1') parts.push(iters);
    if (a.direction && a.direction !== 'normal') parts.push(a.direction);
    if (a.fill && a.fill !== 'none') parts.push(a.fill);
    if (paused) parts.push('paused');
    return parts.join(' ');
  }

  /** Emit rules for all collected targets. */
  emit(classKeyCount: Map<string, number>) {
    const classKey = (el: El) => (el.extraCls ? `${el.cls}.${el.extraCls}` : el.cls);
    // Elements sharing a class can only share one rule if their animation lists agree.
    const sigs = new Map<string, Set<string>>();
    const sigOf = (el: El) =>
      (this.targets.get(el) ?? []).map((a) => `${a.kf}|${a.delay}|${a.owner === el ? 'self' : 'parent'}|${a.anim.trigger}|${a.anim.id}`).join(',');
    for (const el of this.order) {
      const k = classKey(el);
      if (!sigs.has(k)) sigs.set(k, new Set());
      sigs.get(k)!.add(sigOf(el));
    }
    const uniqueSel = (el: El): string => {
      const own = `.${classKey(el)}`;
      if ((classKeyCount.get(classKey(el)) ?? 0) <= 1 || !el.parent) return own;
      return `${uniqueSel(el.parent)} > ${own}`;
    };
    const done = new Set<string>();
    for (const el of this.order) {
      const apps = [...this.targets.get(el)!].sort((a, b) => Number(b.inherited) - Number(a.inherited));
      const k = classKey(el);
      const shared = (sigs.get(k)?.size ?? 0) <= 1;
      const sel = shared ? `.${k}` : uniqueSel(el);
      if (done.has(sel)) continue;
      done.add(sel);
      const stateSel = (owner: El, cls: string) => {
        if (owner === el) return `${sel}.${cls}`;
        const cut = sel.lastIndexOf(' > ');
        if (cut >= 0) return `${sel.slice(0, cut)}.${cls} > ${sel.slice(cut + 3)}`;
        return `.${classKey(owner)}.${cls} > ${sel}`;
      };
      this.emitSlots([sel], apps, (owner, cls) => [stateSel(owner, cls)], el);
    }
    for (const { owner, sel, apps } of this.selTargets.values()) {
      const ownerSel = `.${classKey(owner)}`;
      const parts = splitSelectorList(sel);
      this.emitSlots(
        parts.map((p) => `${ownerSel} ${p}`),
        apps,
        (_o, cls) => parts.map((p) => `${ownerSel}.${cls} ${p}`),
        owner,
      );
    }
  }

  private emitSlots(sels: string[], apps: AnimApp[], stateSels: (owner: El, cls: string) => string[], self: El) {
    const rules = this.css.animRules;
    const isStatic = (a: AnimApp) => a.anim.trigger === 'load' || a.anim.trigger === 'loop';
    const statics = apps.filter(isStatic);
    const groups = new Map<string, { owner: El; trigger: 'inView' | 'hover' | 'click'; apps: AnimApp[] }>();
    for (const a of apps) {
      if (isStatic(a)) continue;
      const trig = a.anim.trigger as 'inView' | 'hover' | 'click';
      const k = `${a.owner === self ? 'self' : 'parent'}:${trig}`;
      if (!groups.has(k)) groups.set(k, { owner: a.owner, trigger: trig, apps: [] });
      groups.get(k)!.apps.push(a);
    }
    const list = (xs: string[]) => (xs.length ? xs.join(', ') : 'none');
    const sel = sels.join(', ');
    if (groups.size === 0) {
      rules.push({ sel, decls: [['animation', list(apps.map((a) => this.shorthand(a)))]] });
      return;
    }
    if (groups.size === 1) {
      const g = [...groups.values()][0];
      const state = stateSels(g.owner, STATE_CLASS[g.trigger]).join(', ');
      if (g.trigger === 'inView') {
        rules.push({ sel, decls: [['animation', list(apps.map((a) => this.shorthand(a, !isStatic(a))))]] });
        rules.push({ sel: state, decls: [['animation-play-state', 'running']] });
      } else {
        if (statics.length) rules.push({ sel, decls: [['animation', list(statics.map((a) => this.shorthand(a)))]] });
        rules.push({ sel: state, decls: [['animation', list([...statics, ...g.apps].map((a) => this.shorthand(a)))]] });
      }
      return;
    }
    // Several independent triggers: one custom property per trigger group.
    const baseDecls: Decls = [];
    const slots = statics.map((a) => this.shorthand(a));
    for (const [k, g] of groups) {
      const v = `--k-${k.startsWith('parent') ? 'parent-' : ''}${g.trigger.toLowerCase()}`;
      baseDecls.push([v, g.trigger === 'inView' ? list(g.apps.map((a) => this.shorthand(a, true))) : 'none']);
      slots.push(`var(${v})`);
      rules.push({ sel: stateSels(g.owner, STATE_CLASS[g.trigger]).join(', '), decls: [[v, list(g.apps.map((a) => this.shorthand(a)))]] });
    }
    baseDecls.push(['animation', slots.join(', ')]);
    // base rule must precede its state rules
    rules.splice(rules.length - groups.size, 0, { sel, decls: baseDecls });
  }
}

function splitSelectorList(sel: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => !/[{};<]/.test(s));
}

// ─── HTML emission ───────────────────────────────────────────────────────────

class HtmlWriter {
  constructor(
    private c: Compiler,
    private pageFirstImage: { done: boolean },
  ) {}

  private tagOf(el: El): string {
    const n = el.node;
    const def = DEFAULT_TAGS[n.type];
    if (n.type === 'image' || n.type === 'video' || n.type === 'svg' || n.type === 'input' || n.type === 'textarea' || n.type === 'select')
      return def;
    return safeTag(n.tag, def);
  }

  private displayDefault(el: El, tag: string): 'inline' | 'block' {
    if (el.node.type === 'image' || el.node.type === 'video') {
      const src = this.srcOf(el);
      if (!src) return 'block';
    }
    if (RESET_BLOCK.has(tag)) return 'block';
    if (INLINE_TAGS.has(tag) || tag.includes('-')) return 'inline';
    return 'block';
  }

  private isInlineLevel(el: El): boolean {
    const tag = this.tagOf(el);
    const placeholder = (el.node.type === 'image' || el.node.type === 'video') && !this.srcOf(el);
    return this.c.effective(el).some((m) => {
      if (m.position === 'absolute' || m.position === 'fixed') return false;
      if (m.float === 'left' || m.float === 'right') return false;
      const d = placeholder ? 'flex' : (m.display || this.displayDefault(el, tag)).trim();
      return d.startsWith('inline') || d === 'contents' || d === 'ruby';
    });
  }

  private preIn(el: El | null): boolean {
    for (let e = el; e; e = e.parent) {
      if (this.c.effective(e).some((m) => /^(pre|break-spaces)/.test(m['white-space'] ?? '') || /preserve/.test(m['white-space-collapse'] ?? '')))
        return true;
    }
    return false;
  }

  /** May children be separated by newlines/indentation without changing layout? */
  private prettySafe(el: El): boolean {
    if (this.c.effective(el).every((m) => /flex|grid/.test(m.display ?? ''))) return true;
    if (this.preIn(el)) return false;
    return el.children.every((ch) => !this.isInlineLevel(ch));
  }

  private srcOf(el: El): string {
    const ov = el.inst?.overrides[el.node.id];
    const raw = (ov?.src ?? el.node.props.src ?? '').trim();
    if (!raw) return '';
    return this.c.rewriteRefs(raw);
  }

  /** Serialize attributes; the first occurrence of a name wins (exporter attrs before user attrs). */
  private attrs(list: [string, string | true | undefined | null | false][]): string {
    let s = '';
    const seen = new Set<string>();
    for (const [k, v] of list) {
      if (v === undefined || v === null || v === false) continue;
      const lower = k.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      s += v === true ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`;
    }
    return s;
  }

  render(el: El, depth: number): string {
    const c = this.c;
    const n = el.node;
    const ind = c.min ? '' : '  '.repeat(depth);
    const nl = c.min ? '' : '\n';
    const tag = this.tagOf(el);
    const userAttrs = safeAttrs(n.props.attrs, NO_RESERVED);
    const userClass = userAttrs.find(([k]) => k.toLowerCase() === 'class')?.[1];
    const classes = [el.cls, el.extraCls, userClass].filter(Boolean).join(' ');
    const common: [string, string | true | undefined | false][] = [['class', classes]];
    const tail: [string, string | true | undefined | false][] = [];
    for (const [k, v] of userAttrs) if (k.toLowerCase() !== 'class') tail.push([k, v]);
    if (el.hooks.inview) tail.push(['data-k-inview', true]);
    if (el.hooks.hover) tail.push(['data-k-hover', el.hooks.hover === 'loop' ? 'loop' : true]);
    if (el.hooks.click) tail.push(['data-k-click', true]);
    if (el.hooks.each?.length) tail.push(['data-k-each', el.hooks.each.join('; ')]);
    if (c.opts.annotate && el.dataKid) tail.push(['data-kid', el.dataKid]);
    const open = (t: string, extra: [string, string | true | undefined | false][] = []) => `<${t}${this.attrs([...common, ...extra, ...tail])}>`;

    switch (n.type) {
      case 'image': {
        const src = this.srcOf(el);
        if (!src) return `${ind}<div${this.attrs([...common, ['role', 'img'], ['aria-label', n.props.alt || n.name], ['style', PLACEHOLDER_STYLE], ...tail])}>${IMAGE_GLYPH}</div>`;
        const lazy = this.pageFirstImage.done;
        this.pageFirstImage.done = true;
        return `${ind}${open('img', [['src', safeUrl(src)], ['alt', n.props.alt ?? ''], ['loading', lazy ? 'lazy' : undefined], ['decoding', 'async']])}`;
      }
      case 'video': {
        const src = this.srcOf(el);
        if (!src) return `${ind}<div${this.attrs([...common, ['role', 'img'], ['aria-label', n.name], ['style', PLACEHOLDER_STYLE], ...tail])}>${VIDEO_GLYPH}</div>`;
        const p = n.props;
        return `${ind}${open('video', [
          ['src', safeUrl(src)],
          ['autoplay', !!p.autoplay],
          ['loop', !!p.loop],
          ['muted', !!p.muted || !!p.autoplay],
          ['controls', !!p.controls],
          ['playsinline', true],
          ['preload', p.autoplay ? undefined : 'metadata'],
        ])}</video>`;
      }
      case 'svg': {
        const svg = c.rewriteRefs(sanitizeSvgMarkup(n.props.svg ?? ''));
        if (!svg) return `${ind}${open('div')}</div>`;
        if (c.min || this.preIn(el)) return `${ind}${open('div')}${svg}</div>`;
        return `${ind}${open('div')}\n${ind}  ${svg}\n${ind}</div>`;
      }
      case 'input': {
        const t = (n.props.inputType || 'text').toLowerCase().replace(/[^a-z-]/g, '') || 'text';
        if (t === 'checkbox' || t === 'radio')
          return `${ind}${open('input', [['type', t], ['value', n.props.value || undefined], ['checked', !!n.props.checked]])}`;
        return `${ind}${open('input', [['type', t], ['placeholder', n.props.placeholder || undefined], ['value', n.props.value || undefined]])}`;
      }
      case 'textarea':
        return `${ind}${open('textarea', [['placeholder', n.props.placeholder || undefined]])}${escapeHtml(n.props.value ?? '')}</textarea>`;
      case 'select': {
        const opts = (n.props.options ?? []).map(
          (o) => `<option${this.attrs([['value', o], ['selected', n.props.value != null && n.props.value === o]])}>${escapeHtml(o)}</option>`,
        );
        if (c.min || !opts.length) return `${ind}${open('select')}${opts.join('')}</select>`;
        return `${ind}${open('select')}\n${opts.map((o) => `${ind}  ${o}`).join('\n')}\n${ind}</select>`;
      }
    }

    const extra: [string, string | true | undefined | false][] = [];
    if (n.type === 'button' && tag === 'button') extra.push(['type', 'button']);
    if (n.type === 'link' && tag === 'a') {
      extra.push(['href', this.c.href(n.props.href)]);
      if (n.props.target === '_blank') extra.push(['target', '_blank'], ['rel', 'noopener']);
    }
    const isText = TEXT_TYPES.has(n.type);
    if (isText && !n.children.length) {
      const ov = el.inst?.overrides[n.id];
      const html = c.rewriteRefs(sanitizeRichText(ov?.text ?? n.props.text ?? '')) || '&#8203;';
      return `${ind}${open(tag, extra)}${html}</${tag}>`;
    }
    if (!el.children.length) return `${ind}${open(tag, extra)}</${tag}>`;
    if (c.min || !this.prettySafe(el)) {
      return `${ind}${open(tag, extra)}${el.children.map((ch) => this.render(ch, 0).trim()).join('')}</${tag}>`;
    }
    return `${ind}${open(tag, extra)}${nl}${el.children.map((ch) => this.render(ch, depth + 1)).join(nl)}${nl}${ind}</${tag}>`;
  }
}

const NO_RESERVED = new Set<string>();

// ─── Assembly ────────────────────────────────────────────────────────────────

interface Built {
  c: Compiler;
  roots: { page: PageOut | null; el: El }[];
  css: string;
  js: string;
  keyframes: number;
  animations: number;
  noscript: string;
  fontsUsed: string[];
  fontBinaries: BinaryRef[];
  classes: number;
}

function buildCore(doc: KDocument, opts: ExportOptions, roots: { page: PageOut | null; id: NodeId }[], includeBase: boolean): Built {
  const c = new Compiler(doc, opts);
  const els = roots
    .map((r) => ({ page: r.page, el: c.expand(r.id, null, null, '', !!opts.isolate && !!opts.rootNodeId) }))
    .filter((r): r is { page: PageOut | null; el: El } => !!r.el);
  const css = new CssCollector(c);
  for (const r of els) css.collect(r.el);
  const anim = new AnimCollector(c, css);
  for (const r of els) anim.collect(r.el);
  const counts = new Map<string, number>();
  const count = (el: El) => {
    const k = el.extraCls ? `${el.cls}.${el.extraCls}` : el.cls;
    counts.set(k, (counts.get(k) ?? 0) + 1);
    el.children.forEach(count);
  };
  els.forEach((r) => count(r.el));
  anim.emit(counts);

  const min = c.min;
  const blocks: string[] = [];
  const section = (title: string) => {
    if (!min) blocks.push(`/* ${'─'.repeat(2)} ${title} ${'─'.repeat(Math.max(2, 64 - title.length))} */`);
  };
  const rule = (r: RuleEntry, indent = '') => formatRule(r.sel, r.decls, indent);

  // custom CSS participates in font detection
  const custom = (doc.settings.customCss ?? '').trim();
  if (custom) c.fonts.addCssText(custom);

  let fontBinaries: BinaryRef[] = [];
  let fontsUsed: string[] = [];
  if (includeBase) {
    c.fonts.roles.add('body');
    const usesHeadings = (el: El): boolean => /^h[1-6]$/.test(safeTag(el.node.tag, '')) || el.children.some(usesHeadings);
    if (els.some((r) => usesHeadings(r.el))) c.fonts.roles.add('heading');
    const fonts = opts.includeFonts === false ? { bundled: [], assets: [], families: [] } : resolveFonts(doc, c.fonts);
    fontsUsed = [...fonts.bundled.map((f) => f.family), ...fonts.assets.map((a) => a.fontFamily!)];
    const faces: string[] = [];
    for (const f of fonts.bundled) {
      for (const file of f.files) {
        const path = `fonts/${file.fileName}`;
        const url = c.mode === 'inline' ? INLINE_TOKEN + path : c.mode === 'external' ? (opts.fontUrl?.(file) ?? file.url) : path;
        faces.push(fontFace(f.family, file.style, file.weight, url, 'woff2'));
        fontBinaries.push({ path, mime: 'font/woff2', kind: 'font', font: file });
      }
    }
    for (const a of fonts.assets) {
      const url = c.assetUrl(a.id);
      faces.push(fontFace(a.fontFamily!, a.fontStyle ?? 'normal', a.fontWeight ?? '100 900', url, fontFormat(a.path || a.name)));
    }
    if (c.mode === 'external') fontBinaries = [];
    if (!min) blocks.push(`/* Generated by Kinema — ${cleanComment(opts.title ?? doc.settings.title ?? 'Untitled')} */`);
    if (faces.length) {
      section('Fonts');
      blocks.push(...faces);
    }
    section('Reset');
    blocks.push(designResetCss(null));
    section('Design tokens');
    blocks.push(formatRule(':root', css.decls(tokenCssVars(doc))));
  }

  if (css.base.length) {
    section(includeBase ? 'Layout & styles' : 'Styles');
    blocks.push(...css.base.filter((r) => r.decls.length).map((r) => rule(r)));
  }
  if (css.svgSelectors.length) blocks.push(formatRule(css.svgSelectors.join(', '), [['display', 'block'], ['width', '100%'], ['height', '100%']]));
  c.bps.forEach((bp, i) => {
    if (i === 0 || !css.media[i].length || bp.maxWidth == null) return;
    section(`${bp.name} (≤ ${bp.maxWidth}px)`);
    blocks.push(`@media (max-width: ${bp.maxWidth}px) {\n${css.media[i].map((r) => rule(r, '  ')).join('\n\n')}\n}`);
  });
  if (css.states.length) {
    section('Interaction states');
    blocks.push(...css.states.map((r) => rule(r)));
  }
  if (css.keyframes.size || css.animRules.length) {
    section('Animations');
    blocks.push(...css.keyframes.values());
    blocks.push(...css.animRules.map((r) => rule(r)));
    if (c.runtime.respectReducedMotion) {
      blocks.push(
        `@media (prefers-reduced-motion: reduce) {\n${formatRule(
          '*, *::before, *::after',
          [
            ['animation-duration', '1ms !important'],
            ['animation-delay', '0ms !important'],
            ['animation-iteration-count', '1 !important'],
          ],
          '  ',
        )}\n}`,
      );
    }
  }
  if (custom && includeBase) {
    section('Custom CSS');
    blocks.push(c.rewriteRefs(custom).replace(/<\/(style)/gi, '<\\/$1'));
  }
  let cssText = blocks.join('\n\n') + '\n';
  if (min) cssText = minifyCss(cssText) + '\n';

  const rt = c.runtime;
  const needsJs = rt.inView || rt.hover || rt.click || rt.each;
  let js = needsJs ? runtimeSource(rt) : '';
  if (js && min) js = minifyRuntime(js) + '\n';

  const noscript = css.inView ? '<noscript><style>[data-k-inview], [data-k-inview] * { animation-play-state: running !important; }</style></noscript>' : '';
  const classes = new Set<string>();
  for (const k of counts.keys()) k.split('.').forEach((x) => classes.add(x));
  return { c, roots: els, css: cssText, js, keyframes: css.keyframes.size, animations: css.animations, noscript, fontsUsed, fontBinaries, classes: classes.size };
}

function cleanComment(s: string): string {
  return s.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ');
}

function fontFace(family: string, style: string, weight: string, url: string, format: string): string {
  return formatRule('@font-face', [
    ['font-family', quoteFamily(family)],
    ['font-style', cleanValue(style)],
    ['font-weight', cleanValue(weight)],
    ['font-display', 'swap'],
    ['src', `url("${url}") format("${format}")`],
  ]);
}

function pageTitle(doc: KDocument, opts: ExportOptions, page: PageOut | null, index: number): string {
  const site = (opts.title ?? doc.settings.title ?? '').trim();
  if (!page) return site || 'Component';
  if (index === 0 || !site) return site || page.name;
  return page.name === site ? site : `${page.name} — ${site}`;
}

function htmlDocument(
  b: Built,
  body: string,
  o: { title: string; description?: string; lang: string; single: boolean; cssHref: string; jsHref: string | null },
): string {
  const min = b.c.min;
  const nl = min ? '' : '\n';
  const i1 = min ? '' : '  ';
  const i2 = min ? '' : '    ';
  const head: string[] = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(o.title)}</title>`,
  ];
  if (o.description) head.push(`<meta name="description" content="${escapeAttr(o.description)}">`);
  head.push(`<meta name="generator" content="Kinema">`);
  if (o.single) {
    const css = b.css.trim().replace(/<\/style/gi, '<\\/style');
    head.push(min ? `<style>${css}</style>` : `<style>\n${css.replace(/^/gm, i2 + '  ').replace(/^\s+$/gm, '')}\n${i2}</style>`);
  } else {
    head.push(`<link rel="stylesheet" href="${o.cssHref}">`);
    if (o.jsHref) head.push(`<script src="${o.jsHref}" defer></script>`);
  }
  if (b.noscript) head.push(b.noscript);
  const bodyParts = [body];
  if (o.single && b.js) {
    const js = b.js.trim().replace(/<\/script/gi, '<\\/script');
    bodyParts.push(min ? `<script>${js}</script>` : `${i2}<script>\n${js.replace(/^/gm, i2 + '  ').replace(/^\s+$/gm, '')}\n${i2}</script>`);
  }
  return (
    `<!doctype html>${nl}<html lang="${escapeAttr(o.lang)}">${nl}${i1}<head>${nl}` +
    head.map((h) => i2 + h).join(nl) +
    `${nl}${i1}</head>${nl}${i1}<body>${nl}` +
    bodyParts.join(nl) +
    `${nl}${i1}</body>${nl}</html>${nl}`
  );
}

const enc = new TextEncoder();
const byteLen = (s: string) => enc.encode(s).length;

/**
 * Synchronous text compile. Returns the HTML/CSS/JS files plus the list of
 * binary files they reference (not loaded). In `inline` asset mode the text
 * still contains placeholders — use `compileSite` for final output.
 */
export function compileSiteText(doc: KDocument, opts: ExportOptions = {}): SiteText {
  const pages: PageOut[] = [];
  const roots: { page: PageOut | null; id: NodeId }[] = [];
  const pageFilesProbe = new Compiler(doc, opts).pageFiles;
  if (opts.rootNodeId) {
    const n = doc.nodes[opts.rootNodeId];
    const page: PageOut = { id: n ? `node:${n.id}` : 'node', name: n?.name ?? 'Component', file: 'index.html' };
    pages.push(page);
    roots.push({ page, id: opts.rootNodeId });
  } else {
    const wanted = opts.pageIds?.length ? new Set(opts.pageIds) : null;
    for (const p of doc.pages) {
      if (wanted && !wanted.has(p.id)) continue;
      const page: PageOut = { id: p.id, name: p.name, file: pageFilesProbe.get(p.id)! };
      pages.push(page);
      roots.push({ page, id: p.rootId });
    }
  }
  const b = buildCore(doc, opts, roots, true);
  const c = b.c;
  const single = opts.bundle === 'single';
  const files: OutFile[] = [];
  const min = c.min;
  b.roots.forEach((r, i) => {
    const page = r.page!;
    const writer = new HtmlWriter(c, { done: false });
    const body = writer.render(r.el, min ? 0 : 2);
    const html = htmlDocument(b, body, {
      title: pageTitle(doc, opts, opts.rootNodeId ? null : page, i),
      description: opts.description,
      lang: opts.lang ?? 'en',
      single,
      cssHref: 'styles.css',
      jsHref: b.js ? 'script.js' : null,
    });
    files.push({ path: page.file, data: html });
  });
  if (!single) {
    files.push({ path: 'styles.css', data: b.css });
    if (b.js) files.push({ path: 'script.js', data: b.js });
  }

  const binaries: BinaryRef[] = [...b.fontBinaries];
  if (c.mode !== 'external') {
    for (const id of [...c.usedAssets].sort((x, y) => c.assetPath(c.doc.assets[x]).localeCompare(c.assetPath(c.doc.assets[y])))) {
      const a = doc.assets[id];
      binaries.push({ path: c.assetPath(a), mime: a.mime || 'application/octet-stream', kind: 'asset', asset: a, size: a.size });
    }
  }
  const textBytes = (ext: string) => files.filter((f) => f.path.endsWith(ext)).reduce((s, f) => s + byteLen(f.data as string), 0);
  const stats: ExportStats = {
    pages: b.roots.length,
    elements: c.elements,
    classes: b.classes,
    animations: b.animations,
    keyframes: b.keyframes,
    fonts: b.fontsUsed,
    htmlBytes: textBytes('.html'),
    cssBytes: single ? byteLen(b.css) : textBytes('.css'),
    jsBytes: single ? byteLen(b.js) : textBytes('.js'),
    assetBytes: binaries.reduce((s, x) => s + (x.size ?? 0), 0),
    warnings: [...c.warnings],
  };
  return { files, binaries, entry: files[0]?.path ?? 'index.html', pages, stats };
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

async function defaultReadFont(file: FontFile): Promise<Uint8Array> {
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Full compile including binary assets and fonts (read through the injected readers). */
export async function compileSite(doc: KDocument, opts: ExportOptions = {}): Promise<CompileResult> {
  const text = compileSiteText(doc, opts);
  const inline = (opts.bundle === 'single' && opts.assets !== 'external') || opts.assets === 'inline';
  const loaded = new Map<string, { ref: BinaryRef; data: Uint8Array }>();
  const warnings = [...text.stats.warnings];
  await Promise.all(
    text.binaries.map(async (ref) => {
      try {
        let data: Uint8Array;
        if (ref.kind === 'font' && ref.font) data = await (opts.readFont ?? defaultReadFont)(ref.font);
        else if (ref.asset) {
          if (!opts.readAsset) throw new Error('no asset reader');
          data = await opts.readAsset(ref.asset);
        } else return;
        loaded.set(ref.path, { ref, data });
      } catch (err) {
        warnings.push(`Could not read ${ref.path} (${err instanceof Error ? err.message : String(err)}).`);
      }
    }),
  );
  let files = text.files;
  if (inline) {
    const uris = new Map<string, string>();
    for (const [path, { ref, data }] of loaded) uris.set(path, `data:${ref.mime};base64,${toBase64(data)}`);
    files = files.map((f) =>
      typeof f.data === 'string' && f.data.includes(INLINE_TOKEN)
        ? { path: f.path, data: f.data.replace(/kinema-inline:([a-z0-9._/-]+)/gi, (_m, p: string) => uris.get(p) ?? '') }
        : f,
    );
  } else {
    for (const ref of text.binaries) {
      const got = loaded.get(ref.path);
      if (got) files = [...files, { path: ref.path, data: got.data }];
    }
  }
  const assetBytes = [...loaded.values()].reduce((s, x) => s + x.data.length, 0);
  const textBytes = (ext: string) => files.filter((f) => f.path.endsWith(ext) && typeof f.data === 'string').reduce((s, f) => s + byteLen(f.data as string), 0);
  return {
    files,
    entry: text.entry,
    pages: text.pages,
    stats: {
      ...text.stats,
      htmlBytes: textBytes('.html'),
      cssBytes: opts.bundle === 'single' ? text.stats.cssBytes : textBytes('.css'),
      assetBytes,
      warnings,
    },
  };
}

/**
 * Compile one element (and its subtree) to an HTML snippet plus the CSS and JS
 * it needs. `includeBase` adds the reset, tokens and font faces.
 */
export function compileFragment(
  doc: KDocument,
  nodeId: NodeId,
  opts: ExportOptions & { includeBase?: boolean } = {},
): Fragment {
  const b = buildCore(doc, opts, [{ page: null, id: nodeId }], !!opts.includeBase);
  const root = b.roots[0];
  if (!root) return { html: '', css: '', js: '' };
  const html = new HtmlWriter(b.c, { done: false }).render(root.el, 0) + (b.c.min ? '' : '\n');
  return { html, css: b.css, js: b.js };
}
