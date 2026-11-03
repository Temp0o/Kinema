// @vitest-environment node
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { assetRel, checkHttpUrl, isHtmlEntry, isLocalNetworkHost, isSafeId, isServableProjectPath, safeJoin, sanitizeFileName, validateOutFiles } from '../../electron/guards';

describe('ids and paths', () => {
  it('accepts normal ids and rejects traversal-ish ones', () => {
    expect(isSafeId('p_abc123xyz0')).toBe(true);
    for (const bad of ['', '..', '../x', 'a/b', 'a\\b', 'a b', 'x'.repeat(65), 'a\0b', 42, null]) expect(isSafeId(bad)).toBe(false);
  });
  it('safeJoin refuses escapes, absolute paths and the base itself', () => {
    const base = path.resolve('/data/Projects/p1');
    expect(safeJoin(base, 'assets/a.png')).toBe(path.join(base, 'assets', 'a.png'));
    for (const bad of ['../p2/project.json', 'assets/../../x', '/etc/passwd', '', '.', '..', 'a\0b']) expect(() => safeJoin(base, bad)).toThrow();
  });
  it('assetRel restricts renderer access to assets/', () => {
    expect(assetRel('assets/x.png')).toBe('assets/x.png');
    for (const bad of ['project.json', 'meta.json', 'assets', 'assets/', '', 'thumbnail.png', 5]) expect(() => assetRel(bad as string)).toThrow();
    // traversal is still caught by safeJoin afterwards
    expect(() => safeJoin('/d/p', assetRel('assets/../../x'))).toThrow();
  });
  it('kasset only serves assets and the thumbnail', () => {
    expect(isServableProjectPath('assets/a.png')).toBe(true);
    expect(isServableProjectPath('thumbnail.png')).toBe(true);
    expect(isServableProjectPath('project.json')).toBe(false);
    expect(isServableProjectPath('meta.json')).toBe(false);
    expect(isServableProjectPath('assets/')).toBe(false);
  });
  it('sanitizeFileName strips separators, dot-only names and trailing dots', () => {
    expect(sanitizeFileName('a/b\\c.png')).toBe('a_b_c.png');
    expect(sanitizeFileName('..')).toBe('_');
    expect(sanitizeFileName('.hidden')).toBe('_hidden');
    expect(sanitizeFileName('x. ')).toBe('x');
    expect(sanitizeFileName('')).toBe('file');
    expect(sanitizeFileName('a'.repeat(300)).length).toBeLessThanOrEqual(120);
    expect(sanitizeFileName('../../evil.png')).not.toMatch(/[\\/]/);
  });
});

describe('validateOutFiles', () => {
  const base = path.resolve('/tmp/x/out');
  it('maps valid files and rejects the whole batch if any is bad', () => {
    expect(validateOutFiles(base, [{ path: 'index.html', data: '<p>' }, { path: 'a/b.css', data: new Uint8Array(2) }]).map((f) => f.target)).toEqual([
      path.join(base, 'index.html'),
      path.join(base, 'a', 'b.css'),
    ]);
    expect(() => validateOutFiles(base, [{ path: 'ok.html', data: 'x' }, { path: '../escape.html', data: 'x' }])).toThrow();
    expect(() => validateOutFiles(base, [{ path: 'a.html', data: 'x' }, { path: './a.html', data: 'y' }])).toThrow(/Duplicate/);
    expect(() => validateOutFiles(base, [{ path: 'a.html', data: 5 }])).toThrow();
    expect(() => validateOutFiles(base, 'nope')).toThrow();
  });
  it('only html entries can be opened', () => {
    expect(isHtmlEntry('index.html')).toBe(true);
    expect(isHtmlEntry('x/y.HTM')).toBe(true);
    expect(isHtmlEntry('run.exe')).toBe(false);
    expect(isHtmlEntry('a.html.exe')).toBe(false);
  });
});

describe('http bridge host policy', () => {
  it('allows loopback and private networks', () => {
    for (const u of [
      'http://127.0.0.1:11434', 'http://localhost:11434/api/tags', 'http://[::1]:11434', 'http://192.168.1.20:11434', 'http://10.0.0.5',
      'http://172.16.4.4', 'http://172.31.255.1', 'http://169.254.1.1', 'http://gpu-box:11434', 'http://ollama.local', 'https://box.lan',
      'http://[fd12:3456::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:c0a8:0101]/', 'http://100.64.0.1',
    ]) expect(checkHttpUrl(u), u).toBeNull();
  });
  it('rejects public hosts, other schemes, credentials, garbage', () => {
    for (const u of [
      'http://example.com', 'https://api.openai.com/v1', 'http://8.8.8.8', 'http://172.32.0.1', 'http://172.15.0.1', 'http://192.169.0.1',
      'http://[2001:db8::1]/', 'http://[::ffff:8.8.8.8]/', 'file:///etc/passwd', 'ftp://127.0.0.1', 'javascript:alert(1)',
      'http://user:pw@127.0.0.1', 'http://127.0.0.1.evil.com', 'http://localhost.evil.com', '', 'not a url', 5,
    ]) expect(checkHttpUrl(u as string), String(u)).not.toBeNull();
  });
  it('honours the explicit allow-list', () => {
    expect(checkHttpUrl('https://ai.example.com/x', [])).not.toBeNull();
    expect(checkHttpUrl('https://ai.example.com/x', ['AI.example.com'])).toBeNull();
  });
  it('isLocalNetworkHost basics', () => {
    expect(isLocalNetworkHost('999.1.1.1')).toBe(false);
    expect(isLocalNetworkHost('foo.localhost')).toBe(true);
  });
});
