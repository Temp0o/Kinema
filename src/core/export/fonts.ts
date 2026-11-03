/**
 * Font detection for exports: which families does the output actually use, and
 * which of them ship with Kinema (bundled) or with the project (font assets)?
 * System fonts need no files.
 */
import type { KAsset, KDocument } from '../model/types';
import { BUNDLED_FONTS, findBundledFont, type DesignFont } from '../fonts/designFonts';

const GENERIC = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace',
  'ui-rounded', 'emoji', 'math', 'fangsong', '-apple-system', 'blinkmacsystemfont', 'inherit', 'initial', 'unset', 'revert',
]);

function splitFamilies(list: string): string[] {
  const out: string[] = [];
  let buf = '';
  let quote: string | null = null;
  for (const ch of list) {
    if (quote) {
      if (ch === quote) quote = null;
      else buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ',') {
      out.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.map((s) => s.replace(/\s+/g, ' ')).filter(Boolean);
}

export type FontRole = 'heading' | 'body' | 'mono';

/** Collects families referenced by declarations, rich text and custom CSS. */
export class FontUsage {
  readonly families = new Set<string>();
  readonly roles = new Set<FontRole>();

  addFamilyList(list: string) {
    for (const f of splitFamilies(list)) {
      if (f.startsWith('var(')) this.addValue(f);
      else if (!GENERIC.has(f.toLowerCase())) this.families.add(f);
    }
  }

  /** Inspect one declaration (any property) for font usage. */
  addDecl(prop: string, value: string) {
    this.addValue(value);
    if (prop === 'font-family') this.addFamilyList(value.replace(/var\([^)]*\)/g, ''));
    else if (prop === 'font') {
      const m = /(?:^|\s)[\d.]+[a-z%]*(?:\s*\/\s*[\d.]+[a-z%]*)?\s+(.+)$/i.exec(value.replace(/var\([^)]*\)/g, ''));
      if (m) this.addFamilyList(m[1]);
    }
  }

  addValue(value: string) {
    if (value.indexOf('--k-font-') < 0) return;
    if (/var\(\s*--k-font-heading/.test(value)) this.roles.add('heading');
    if (/var\(\s*--k-font-body/.test(value)) this.roles.add('body');
    if (/var\(\s*--k-font-mono/.test(value)) this.roles.add('mono');
  }

  /** Scan free-form CSS / inline style text. */
  addCssText(css: string) {
    const re = /(font-family|font)\s*:\s*([^;{}]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) this.addDecl(m[1].toLowerCase(), m[2].trim());
    this.addValue(css);
  }
}

export interface ResolvedFonts {
  bundled: DesignFont[];
  assets: KAsset[];
  /** every non-generic family name that was referenced */
  families: string[];
}

export function resolveFonts(doc: KDocument, usage: FontUsage): ResolvedFonts {
  const names = new Set(usage.families);
  for (const role of usage.roles) names.add(doc.tokens.fonts[role]);
  const bundled = new Map<string, DesignFont>();
  const assets = new Map<string, KAsset>();
  const fontAssets = Object.values(doc.assets).filter((a) => a.kind === 'font' && a.fontFamily);
  for (const name of names) {
    const lower = name.replace(/['"]/g, '').trim().toLowerCase();
    let matched = false;
    for (const a of fontAssets) {
      if (a.fontFamily!.toLowerCase() === lower) {
        assets.set(a.id, a);
        matched = true;
      }
    }
    if (matched) continue;
    const b = findBundledFont(name);
    if (b) bundled.set(b.family, b);
  }
  const order = (f: DesignFont) => BUNDLED_FONTS.indexOf(f);
  return {
    bundled: [...bundled.values()].sort((a, b) => order(a) - order(b)),
    assets: [...assets.values()].sort((a, b) => (a.fontFamily! + a.id).localeCompare(b.fontFamily! + b.id)),
    families: [...names].sort(),
  };
}

export function fontFormat(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'woff2') return 'woff2';
  if (ext === 'woff') return 'woff';
  if (ext === 'otf') return 'opentype';
  return 'truetype';
}

export function quoteFamily(f: string): string {
  return `'${f.replace(/'/g, "\\'")}'`;
}
