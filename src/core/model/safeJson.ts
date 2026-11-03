/**
 * Parsing and size guards for untrusted input (`.kinema` / `.kinemalib` packages, clipboard
 * payloads). Documents are plain data, so the main hazards are prototype-pollution style
 * keys and inputs that are simply too big.
 */

/** JSON.parse that drops `__proto__` keys everywhere (they only ever appear in hostile input). */
export function safeJsonParse<T = unknown>(text: string): T {
  return JSON.parse(text, (k, v) => (k === '__proto__' ? undefined : v)) as T;
}

/** Limits for imported packages. */
export const IMPORT_LIMITS = {
  /** compressed bytes we are willing to load at all */
  maxPackageBytes: 1024 * 1024 * 1024,
  /** entries inside a zip */
  maxEntries: 20000,
  /** declared uncompressed size of project.json / library.json */
  maxJsonBytes: 96 * 1024 * 1024,
  /** declared uncompressed size of one asset */
  maxAssetBytes: 256 * 1024 * 1024,
  /** declared uncompressed size of everything */
  maxTotalBytes: 1536 * 1024 * 1024,
  /** nodes accepted from a pasted / imported snippet */
  maxNodes: 50000,
} as const;

interface ZipLike {
  files: Record<string, { dir?: boolean; _data?: { uncompressedSize?: number } }>;
}

/**
 * Check declared sizes of a loaded zip before extracting anything. Throws `Error(message)`
 * (callers wrap it in their own user-facing error type).
 */
export function assertZipWithinLimits(zip: ZipLike, jsonEntries: string[] = []): void {
  const names = Object.keys(zip.files);
  if (names.length > IMPORT_LIMITS.maxEntries) throw new Error('The file contains too many entries.');
  let total = 0;
  for (const name of names) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    const size = entry._data?.uncompressedSize ?? 0;
    const limit = jsonEntries.includes(name) ? IMPORT_LIMITS.maxJsonBytes : IMPORT_LIMITS.maxAssetBytes;
    if (size > limit) throw new Error('The file contains an entry that is too large.');
    total += size;
    if (total > IMPORT_LIMITS.maxTotalBytes) throw new Error('The file would expand to more than the allowed size.');
  }
}
