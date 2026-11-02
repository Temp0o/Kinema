/**
 * Kinema document model.
 *
 * A project is a single `KDocument`. Every visual thing on every page (and every
 * component master) is a `KNode` stored flat in `doc.nodes`, linked by `parent`
 * and ordered `children` arrays. The canvas, layers panel, properties panel,
 * animation timeline, exporter and AI engine all read/write this one structure.
 *
 * Styles are stored as canonical kebab-case CSS declarations (`StyleMap`) per
 * breakpoint, so the editor renders exactly what the exporter writes.
 */

export type NodeId = string;
export type BreakpointId = string; // 'base' | 'tablet' | 'mobile' | custom

/** Canonical CSS declarations, kebab-case keys, string values. e.g. { 'background-color': '#fff' } */
export type StyleMap = Record<string, string>;

export type NodeType =
  | 'frame' // page root / component root container
  | 'box' // generic container (div/section/header/nav/footer/main/ul/li/form…)
  | 'text' // p / h1–h6 / span / label / blockquote
  | 'button'
  | 'link'
  | 'image'
  | 'svg' // inline, editable vector (sanitized markup in props.svg)
  | 'input'
  | 'textarea'
  | 'select'
  | 'video'
  | 'instance'; // instance of a component master (props.componentId)

export type InteractionState = 'hover' | 'active' | 'focus';

export interface NodeProps {
  /** Inline rich text (sanitized HTML: b/strong/i/em/u/s/br/span/a/code/mark/small/sub/sup). */
  text?: string;
  /** Image / video source. `asset:<assetId>` references a project asset; otherwise a URL or data URL. */
  src?: string;
  alt?: string;
  href?: string;
  target?: '_self' | '_blank';
  placeholder?: string;
  /** input `type` attribute (text, email, password, checkbox, radio, range, …) */
  inputType?: string;
  value?: string;
  checked?: boolean;
  /** <select> options */
  options?: string[];
  /** Sanitized SVG markup for `svg` nodes. */
  svg?: string;
  /** Video flags */
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  /** Instance → component master id */
  componentId?: string;
  /** Free-form attributes exported verbatim (sanitized on export; no on* handlers). */
  attrs?: Record<string, string>;
}

/** Per-master-node overrides applied by an instance. */
export interface InstanceOverride {
  text?: string;
  src?: string;
  styles?: StyleMap;
}

// ─── Animation ────────────────────────────────────────────────────────────────

export type AnimTrigger = 'load' | 'inView' | 'hover' | 'click' | 'loop';

/**
 * Animatable channels. Transform channels (x, y, scale, scaleX, scaleY, rotate,
 * skewX, skewY) are composed into a single `transform`; everything else is a raw
 * CSS property (kebab-case) such as `opacity`, `filter`, `background-color`,
 * `clip-path`, `box-shadow`, `stroke-dashoffset`.
 */
export type KeyframeValues = Record<string, string | number>;

export interface Keyframe {
  id: string;
  /** 0..1 position within one iteration */
  offset: number;
  values: KeyframeValues;
  /** Easing from this keyframe to the next (CSS timing function). */
  easing?: string;
}

export interface KAnimation {
  id: string;
  name: string;
  trigger: AnimTrigger;
  /** ms */
  duration: number;
  /** ms */
  delay: number;
  /** number of iterations; Infinity is stored as -1 */
  iterations: number;
  direction: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  fill: 'none' | 'forwards' | 'backwards' | 'both';
  /** Default easing between keyframes (CSS timing function) */
  easing: string;
  keyframes: Keyframe[];
  /** If set (ms), the animation is applied to each child with an incremental delay instead of the node itself. */
  stagger?: number;
  /**
   * Optional CSS selector (relative to the node) to target inner parts, e.g. `path`
   * for SVG draw-on effects. Matched elements are staggered by `stagger` if set.
   */
  targetSelector?: string;
  /** Preset this animation came from (for UI labelling). */
  presetId?: string;
  /** Disabled animations are kept but not played/exported. */
  enabled?: boolean;
}

// ─── Nodes ────────────────────────────────────────────────────────────────────

export interface KNode {
  id: NodeId;
  type: NodeType;
  name: string;
  parent: NodeId | null;
  children: NodeId[];
  /** HTML tag override (section, header, nav, h1, p, …). Defaults per type. */
  tag?: string;
  props: NodeProps;
  /** Styles keyed by breakpoint id. `base` always applies; smaller breakpoints cascade. */
  styles: Record<BreakpointId, StyleMap>;
  /** Interaction state styles (all breakpoints). */
  states?: Partial<Record<InteractionState, StyleMap>>;
  animations?: KAnimation[];
  /** Instance overrides keyed by master node id. */
  overrides?: Record<NodeId, InstanceOverride>;
  locked?: boolean;
  hidden?: boolean;
  /** Free-form note / AI provenance. */
  meta?: { aiGenerated?: boolean; libraryItemId?: string; collapsed?: boolean };
}

export interface Page {
  id: string;
  name: string;
  rootId: NodeId;
}

export interface KComponent {
  id: string;
  name: string;
  /** master root node id (lives in doc.nodes, parent = null, not attached to a page) */
  rootId: NodeId;
  /** Personal-library item this came from, if any. */
  libraryItemId?: string;
  createdAt: number;
}

export type AssetKind = 'image' | 'svg' | 'font' | 'video' | 'audio' | 'other';

export interface KAsset {
  id: string;
  name: string;
  kind: AssetKind;
  mime: string;
  size: number;
  /** Path relative to the project's asset store (e.g. `assets/ab12-logo.png`). */
  path: string;
  width?: number;
  height?: number;
  /** For fonts: the CSS font-family name registered for this asset. */
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  createdAt: number;
}

export interface Breakpoint {
  id: BreakpointId;
  name: string;
  /** Media query upper bound (max-width) in px; base has none. */
  maxWidth?: number;
  /** Default canvas width when previewing this breakpoint. */
  width: number;
  icon: 'desktop' | 'tablet' | 'mobile' | 'custom';
}

export interface ColorToken {
  id: string;
  name: string; // e.g. "primary"  → CSS var --k-primary
  value: string;
}

export interface DesignTokens {
  colors: ColorToken[];
  fonts: { heading: string; body: string; mono: string };
  radius: number;
  spacing: number; // base spacing unit px
}

export interface KDocument {
  version: number;
  pages: Page[];
  nodes: Record<NodeId, KNode>;
  components: Record<string, KComponent>;
  assets: Record<string, KAsset>;
  tokens: DesignTokens;
  breakpoints: Breakpoint[];
  settings: {
    /** Snap grid size in px */
    gridSize: number;
    /** Page title used in exports */
    title: string;
    /** Free-form custom CSS appended to exports and the canvas. */
    customCss?: string;
  };
}

// ─── Projects & library ──────────────────────────────────────────────────────

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** data URL or platform URL */
  thumbnail?: string;
  pageCount?: number;
}

export interface ProjectFile {
  format: 'kinema-project';
  formatVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  document: KDocument;
}

export type LibraryItemKind = 'component' | 'animation' | 'svg' | 'image' | 'palette' | 'style';

export interface LibraryItem {
  id: string;
  kind: LibraryItemKind;
  name: string;
  tags: string[];
  folder?: string;
  favorite?: boolean;
  createdAt: number;
  updatedAt: number;
  /** data URL thumbnail */
  thumbnail?: string;
  /**
   * Payload by kind:
   *  component → { rootId, nodes: Record<NodeId,KNode>, assets: Record<id, KAsset & { dataUrl: string }> }
   *  animation → { animation: KAnimation }
   *  svg       → { svg: string }
   *  image     → { dataUrl: string, mime: string, width?: number, height?: number }
   *  palette   → { colors: { name: string; value: string }[] }
   *  style     → { styles: StyleMap, states?: KNode['states'] }
   */
  data: any;
}

export interface LibraryData {
  format: 'kinema-library';
  formatVersion: 1;
  items: LibraryItem[];
  folders: string[];
}
