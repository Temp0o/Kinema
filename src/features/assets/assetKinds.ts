/**
 * Pure helpers for the asset pipeline: kind detection, font-name parsing, file
 * names, hashing and usage scanning. No platform or store access here.
 */
import type { AssetKind, KAsset, KDocument, KNode, NodeId } from '@/core/model/types';

export const MAX_ASSET_BYTES = 100 * 1024 * 1024;

const EXT_KIND: Record<string, AssetKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', avif: 'image', bmp: 'image', ico: 'image', apng: 'image',
  svg: 'svg',
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio',
};

const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon', apng: 'image/apng',
  svg: 'image/svg+xml',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v', ogv: 'video/ogg',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
};

export function fileExt(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

export function mimeFor(name: string, mime?: string): string {
  const generic = !mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream';
  if (!generic) return mime!;
  return EXT_MIME[fileExt(name)] ?? 'application/octet-stream';
}

/** Classify a file by extension (preferred) and MIME type. */
export function detectAssetKind(name: string, mime = ''): AssetKind {
  const byExt = EXT_KIND[fileExt(name)];
  if (byExt) return byExt;
  const m = mime.toLowerCase();
  if (m === 'image/svg+xml') return 'svg';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('font/') || /(^|\/)(x-)?font-|application\/(x-)?font/.test(m) || m === 'application/vnd.ms-fontobject') return 'font';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'other';
}

/** `accept` list for platform.files.open by kind. */
export function acceptForKind(kind?: AssetKind): string[] {
  const exts = Object.entries(EXT_KIND)
    .filter(([, k]) => (kind ? k === kind : true))
    .map(([e]) => e);
  return exts;
}

// ─── Font names ──────────────────────────────────────────────────────────────

const WEIGHT_WORDS: Record<string, number> = {
  thin: 100, hairline: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, normal: 400, book: 400, roman: 400,
  medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, black: 900, heavy: 900, extrablack: 950, ultrablack: 950,
};
const PREFIXES = new Set(['extra', 'ultra', 'semi', 'demi']);
const STYLE_WORDS = new Set(['italic', 'oblique', 'variable', 'vf', 'var', 'it']);

/** Split "IBMPlexSans-SemiBoldItalic" → ["IBM","Plex","Sans","Semi","Bold","Italic"]. */
function tokenize(s: string): string[] {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s\-_.,+]+/)
    .filter(Boolean);
}

export interface ParsedFontName {
  family: string;
  weight: string;
  style: 'normal' | 'italic';
  variable: boolean;
}

/**
 * Derive a CSS family/weight/style from a font file name:
 * `Satoshi-Bold.woff2` → Satoshi 700 normal, `OpenSans-SemiBoldItalic.ttf` → Open Sans 600 italic,
 * `Inter[wght].ttf` → Inter variable (100 900).
 */
export function parseFontFileName(fileName: string): ParsedFontName {
  let base = fileName.replace(/\.[a-z0-9]+$/i, '');
  let variable = /\[[^\]]*\]/.test(base) || /(^|[-_\s])(variable|vf)([-_\s]|$)/i.test(base) || /Variable/.test(base);
  base = base.replace(/\[[^\]]*\]/g, ' ').trim();
  const tokens = tokenize(base);
  let weight: number | null = null;
  let italic = false;
  // consume style tokens from the end
  let end = tokens.length;
  while (end > 1) {
    const t = tokens[end - 1].toLowerCase();
    const prev = end > 1 ? tokens[end - 2].toLowerCase() : '';
    if (/^[1-9]00$/.test(t) && weight == null) {
      weight = Number(t);
      end--;
    } else if (WEIGHT_WORDS[t] != null && weight == null) {
      if (PREFIXES.has(prev) && WEIGHT_WORDS[prev + t] != null && end > 2) {
        weight = WEIGHT_WORDS[prev + t];
        end -= 2;
      } else {
        weight = WEIGHT_WORDS[t];
        end--;
      }
    } else if (t === 'italic' || t === 'oblique' || (t === 'it' && end === tokens.length)) {
      italic = true;
      end--;
    } else if (STYLE_WORDS.has(t)) {
      if (t === 'variable' || t === 'vf' || t === 'var') variable = true;
      end--;
    } else if (/^(wght|ital|opsz|wdth)$/.test(t)) {
      variable = true;
      end--;
    } else break;
  }
  const familyTokens = tokens.slice(0, end);
  let family = familyTokens.join(' ').trim();
  if (family && family === family.toLowerCase()) family = family.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  if (!family) family = base.trim() || 'Custom Font';
  return { family, weight: variable && weight == null ? '100 900' : String(weight ?? 400), style: italic ? 'italic' : 'normal', variable };
}

// ─── Names & hashing ─────────────────────────────────────────────────────────

/** File-system safe name that keeps the extension. */
export function safeFileName(name: string): string {
  const ext = fileExt(name);
  const stem = (ext ? name.slice(0, -(ext.length + 1)) : name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 64);
  return `${stem || 'file'}${ext ? '.' + ext : ''}`;
}

export function displayBaseName(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || name;
}

/** SHA-256 hex (falls back to FNV-1a when SubtleCrypto is unavailable). */
export async function hashBytes(data: Uint8Array): Promise<string> {
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (subtle) {
    try {
      const buf = await subtle.digest('SHA-256', data as BufferSource);
      return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      /* fall through */
    }
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < data.length; i++) {
    h1 = Math.imul(h1 ^ data[i], 0x01000193);
    h2 = Math.imul(h2 ^ data[i], 0x5bd1e995);
  }
  return `fnv${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}${data.length.toString(16)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ─── SVG helpers ─────────────────────────────────────────────────────────────

/** Read intrinsic dimensions from SVG markup (viewBox, then width/height). */
export function svgDimensions(svg: string): { width: number; height: number } {
  const open = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  const vb = /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)\s*["']/i.exec(open);
  if (vb) {
    const w = parseFloat(vb[3]);
    const h = parseFloat(vb[4]);
    if (w > 0 && h > 0) return { width: w, height: h };
  }
  const num = (attr: string) => {
    const m = new RegExp(`\\s${attr}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, 'i').exec(open);
    return m ? parseFloat(m[1]) : NaN;
  };
  const w = num('width');
  const h = num('height');
  if (w > 0 && h > 0) return { width: w, height: h };
  return { width: 100, height: 100 };
}

/** Ensure the root <svg> has xmlns and a viewBox (so it scales inside an svg node). */
export function normalizeSvgRoot(svg: string): string {
  return svg.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
    let a = attrs;
    if (!/\sxmlns\s*=/.test(a)) a = ` xmlns="http://www.w3.org/2000/svg"${a}`;
    if (/xlink:/.test(svg) && !/xmlns:xlink/.test(a)) a = ` xmlns:xlink="http://www.w3.org/1999/xlink"${a}`;
    if (!/\sviewBox\s*=/i.test(a)) {
      const { width, height } = svgDimensions(`<svg${attrs}>`);
      a += ` viewBox="0 0 ${width} ${height}"`;
    }
    return `<svg${a}>`;
  });
}

/** Tag inline SVG markup with its source asset so usage scanning and "Replace file" can find it. */
export function tagSvgWithAsset(svg: string, assetId: string): string {
  const cleaned = svg.replace(/\sdata-kasset\s*=\s*"[^"]*"/i, '');
  return cleaned.replace(/<svg\b/i, `<svg data-kasset="asset:${assetId}"`);
}

// ─── Usage ───────────────────────────────────────────────────────────────────

const usageCache = new WeakMap<object, Map<string, NodeId[]>>();

function fontFamilyNames(value: string): string[] {
  return value.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase());
}

/**
 * Map asset id → node ids that reference it (via `asset:<id>` anywhere in props,
 * styles, states or instance overrides; fonts via font-family). Memoized per
 * `doc.nodes`/`doc.assets` identity.
 */
export function computeAssetUsage(doc: Pick<KDocument, 'nodes' | 'assets'>): Map<string, NodeId[]> {
  const cacheKey = doc.nodes as object;
  const cached = usageCache.get(cacheKey);
  if (cached && (cached as Map<string, NodeId[]> & { assets?: unknown }).assets === doc.assets) return cached;
  const out = new Map<string, NodeId[]>() as Map<string, NodeId[]> & { assets?: unknown };
  const fonts = Object.values(doc.assets).filter((a) => a.kind === 'font' && a.fontFamily);
  const re = /asset:([a-z0-9_]+)/gi;
  const add = (id: string, nodeId: NodeId) => {
    const list = out.get(id);
    if (!list) out.set(id, [nodeId]);
    else if (list[list.length - 1] !== nodeId) list.push(nodeId);
  };
  for (const n of Object.values(doc.nodes) as KNode[]) {
    const hay = JSON.stringify([n.props, n.styles, n.states ?? null, n.overrides ?? null]);
    if (hay.indexOf('asset:') >= 0) {
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(hay))) add(m[1], n.id);
    }
    if (fonts.length && hay.indexOf('font-family') >= 0) {
      const families = new Set<string>();
      for (const map of [...Object.values(n.styles), ...Object.values(n.states ?? {})]) {
        const ff = map?.['font-family'];
        if (ff) fontFamilyNames(ff).forEach((f) => families.add(f));
      }
      for (const f of fonts) if (families.has(f.fontFamily!.toLowerCase())) add(f.id, n.id);
    }
  }
  out.assets = doc.assets;
  usageCache.set(cacheKey, out);
  return out;
}

/** Whether a font asset is used by the design tokens (heading/body/mono). */
export function fontUsedByTokens(doc: Pick<KDocument, 'tokens'>, asset: KAsset): boolean {
  if (asset.kind !== 'font' || !asset.fontFamily) return false;
  const fam = asset.fontFamily.toLowerCase();
  return Object.values(doc.tokens.fonts).some((f) => fontFamilyNames(f).includes(fam));
}
