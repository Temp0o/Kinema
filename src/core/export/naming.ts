/**
 * Deterministic, readable identifiers for exported code: class names derived
 * from layer names plus a short stable hash (`hero-section-k3f9`), page file
 * names and asset file names.
 */

/** FNV-1a 32-bit hash → unsigned int. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Short base36 hash of a string (default 4 chars). */
export function shortHash(s: string, len = 4): string {
  let out = '';
  let seed = s;
  while (out.length < len) {
    out += hash32(seed).toString(36);
    seed += '#';
  }
  return out.slice(0, len);
}

/** Lower-case, dash-separated slug safe for CSS identifiers and file names. */
export function slugify(input: string, maxLen = 32): string {
  let s = (input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (s.length > maxLen) {
    const cut = s.slice(0, maxLen);
    const i = cut.lastIndexOf('-');
    s = i > maxLen / 2 ? cut.slice(0, i) : cut;
  }
  return s.replace(/-+$/g, '');
}

/** Valid CSS class base: slug that does not start with a digit or dash. */
export function classBase(name: string, fallback: string): string {
  let s = slugify(name);
  if (!s) s = slugify(fallback) || 'el';
  if (/^[0-9]/.test(s)) s = `n-${s}`;
  return s;
}

/**
 * Allocates unique class names. The same key always gets the same name within
 * one Namer; collisions extend the hash so names stay unique and stable.
 */
export class Namer {
  private byKey = new Map<string, string>();
  private used = new Set<string>();

  constructor(reserved: Iterable<string> = []) {
    for (const r of reserved) this.used.add(r);
  }

  name(key: string, label: string, fallback = 'el'): string {
    const existing = this.byKey.get(key);
    if (existing) return existing;
    const base = classBase(label, fallback);
    let len = 4;
    let candidate = `${base}-${shortHash(key, len)}`;
    while (this.used.has(candidate)) {
      len++;
      candidate = `${base}-${shortHash(key, len)}`;
      if (len > 12) candidate = `${base}-${shortHash(key + this.used.size, 6)}`;
    }
    this.used.add(candidate);
    this.byKey.set(key, candidate);
    return candidate;
  }

  get(key: string): string | undefined {
    return this.byKey.get(key);
  }
}

/** Unique file names: `about.html`, `about-2.html`, … */
export class FileNamer {
  private used = new Set<string>();
  constructor(reserved: Iterable<string> = []) {
    for (const r of reserved) this.used.add(r.toLowerCase());
  }
  take(base: string, ext: string): string {
    const b = base || 'file';
    let name = `${b}${ext}`;
    let n = 2;
    while (this.used.has(name.toLowerCase())) name = `${b}-${n++}${ext}`;
    this.used.add(name.toLowerCase());
    return name;
  }
}

/** Split `name.ext` → slugged base + lower-case extension (with dot). */
export function splitFileName(fileName: string): { base: string; ext: string } {
  const just = fileName.split('/').pop() ?? fileName;
  const m = /^(.*?)(\.[a-z0-9]{1,8})?$/i.exec(just)!;
  return { base: slugify(m[1], 48) || 'file', ext: (m[2] ?? '').toLowerCase() };
}
