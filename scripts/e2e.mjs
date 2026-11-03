// Runs the Playwright scripts in tests/e2e against the web build served by Vite.
//
//   npm run e2e                      every script
//   npm run e2e -- smoke canvas      only scripts whose name contains one of the words
//   KINEMA_URL=http://localhost:5173/ npm run e2e    reuse an already running dev server
//
// Playwright is not a dependency of the project (it downloads browsers), so it must be
// installed separately: `npm i -g playwright && npx playwright install chromium` (the scripts
// resolve it from the global module path), or `npm i -D playwright` locally.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

try {
  require.resolve('playwright');
} catch {
  console.error('Playwright is not installed. Install it with `npm i -g playwright && npx playwright install chromium` (or `npm i -D playwright`) and run again.');
  process.exit(2);
}

const wanted = process.argv.slice(2);
const dir = path.join(root, 'tests/e2e');
const scripts = readdirSync(dir)
  .filter((f) => f.endsWith('.mjs'))
  .filter((f) => !wanted.length || wanted.some((w) => f.includes(w)))
  .sort();
if (!scripts.length) {
  console.error('No matching e2e scripts.');
  process.exit(2);
}

// Scripts written against an earlier layout that no longer pass on a clean checkout (they are still
// run, and reported, but do not fail the whole run until they are updated).
const KNOWN_STALE = new Set([]);

const run = (cmd, args, env) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
  });

let server = null;
let url = process.env.KINEMA_URL;
if (!url) {
  server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5199, strictPort: false }, logLevel: 'warn' });
  await server.listen();
  url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5199/';
  console.log(`[e2e] dev server at ${url}`);
}

// the AI script talks to a local mock Ollama server
let mock = null;
const mockPort = process.env.MOCK_PORT ?? '11500';
if (scripts.includes('ai.mjs') && !process.env.MOCK_URL) {
  mock = spawn(process.execPath, [path.join(root, 'tests/mock-ollama/server.mjs'), mockPort], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
}

const results = [];
for (const file of scripts) {
  const name = file.replace(/\.mjs$/, '');
  const out = path.join(root, 'test-results/e2e', name);
  mkdirSync(out, { recursive: true });
  console.log(`\n▶ ${name}`);
  const code = await run(process.execPath, [path.join(dir, file)], { KINEMA_URL: url, OUT: out, MOCK_URL: process.env.MOCK_URL ?? `http://127.0.0.1:${mockPort}` });
  results.push({ name, code });
}

mock?.kill();
await server?.close();

console.log('\n── e2e summary ──');
for (const r of results) console.log(`${r.code === 0 ? 'PASS' : KNOWN_STALE.has(r.name) ? 'STALE' : 'FAIL'}  ${r.name}`);
const failed = results.filter((r) => r.code !== 0 && !KNOWN_STALE.has(r.name));
process.exit(failed.length ? 1 : 0);
