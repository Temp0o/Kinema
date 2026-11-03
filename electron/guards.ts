/**
 * Pure (Electron-free) validation helpers for the main process, kept separate so
 * they can be unit-tested. Everything that takes a path, id or URL from the
 * renderer goes through one of these.
 */
import path from 'node:path';

export const SAFE_ID = /^[a-z0-9_-]{1,64}$/i;

export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID.test(id);
}

/** Resolve `rel` inside `base`, refusing path traversal (and `base` itself). */
export function safeJoin(base: string, rel: string): string {
  if (typeof rel !== 'string' || rel.includes('\0')) throw new Error('Invalid path');
  const target = path.resolve(base, rel);
  const root = path.resolve(base) + path.sep;
  if (!target.startsWith(root)) throw new Error('Path escapes base directory');
  return target;
}

/**
 * Project-relative path of an asset: must live under `assets/` (so the renderer
 * can never read, overwrite or delete `project.json`, `meta.json`, …).
 */
export function assetRel(rel: unknown): string {
  if (typeof rel !== 'string') throw new Error('Invalid asset path');
  const norm = rel.replace(/\\/g, '/');
  if (!norm.startsWith('assets/') || norm.length <= 'assets/'.length) throw new Error('Not an asset path');
  return norm;
}

/** Files the `kasset://` protocol is willing to serve for a project. */
export function isServableProjectPath(rel: string): boolean {
  const norm = rel.replace(/\\/g, '/');
  return norm === 'thumbnail.png' || (norm.startsWith('assets/') && norm.length > 'assets/'.length);
}

export function sanitizeFileName(name: string): string {
  const cleaned = String(name ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '_') // no ".", ".." or hidden/dot-only names
    .replace(/[. ]+$/, '') // Windows strips trailing dots/spaces
    .slice(0, 120);
  return cleaned || 'file';
}

/** Validate a list of output files up-front, so a bad entry never leaves a half-written export. */
export function validateOutFiles(base: string, files: unknown): { path: string; data: Uint8Array | string; target: string }[] {
  if (!Array.isArray(files) || files.length > 20000) throw new Error('Invalid file list');
  const seen = new Set<string>();
  return files.map((f) => {
    if (!f || typeof f.path !== 'string' || !(typeof f.data === 'string' || f.data instanceof Uint8Array)) throw new Error('Invalid file entry');
    const target = safeJoin(base, f.path);
    if (seen.has(target)) throw new Error(`Duplicate file path: ${f.path}`);
    seen.add(target);
    return { path: f.path, data: f.data, target };
  });
}

/** Only html documents may be handed to the OS "open" handler. */
export function isHtmlEntry(entry: string): boolean {
  return /\.html?$/i.test(entry);
}

// ─── HTTP bridge host policy ────────────────────────────────────────────────

function ipv4Private(h: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

/** Is `host` (URL hostname) loopback / private-network / link-local / a local-only name? */
export function isLocalNetworkHost(host: string): boolean {
  let h = host.toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.includes(':')) {
    // IPv6
    if (h === '::1' || h === '::') return true;
    const mapped = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/.exec(h);
    if (mapped) {
      if (mapped[1]) return ipv4Private(mapped[1]);
      const hi = parseInt(mapped[2], 16);
      const lo = parseInt(mapped[3], 16);
      return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
  }
  if (/^[\d.]+$/.test(h)) return ipv4Private(h);
  // names that only resolve on a local network
  if (!h.includes('.')) return true; // single-label (e.g. "gpu-box")
  return /\.(local|lan|home|internal|home\.arpa|localdomain)$/.test(h);
}

/**
 * The HTTP bridge exists for local AI servers (Ollama). Allow http(s) to the
 * loopback interface and the local network only; anything else must be listed
 * explicitly (env `KINEMA_HTTP_ALLOW=host1,host2`). Returns an error message, or
 * null when the request is allowed.
 */
export function checkHttpUrl(raw: unknown, extraHosts: string[] = []): string | null {
  if (typeof raw !== 'string') return 'Invalid URL';
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'Invalid URL';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Only http(s) URLs are allowed';
  if (u.username || u.password) return 'Credentials in URLs are not allowed';
  const host = u.hostname.toLowerCase();
  if (isLocalNetworkHost(host) || extraHosts.map((x) => x.trim().toLowerCase()).includes(host)) return null;
  return `Host "${u.hostname}" is not on this machine or your local network. The AI server must be reachable locally (localhost, a private IP, or a .local name).`;
}
