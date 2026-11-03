# Kinema: progress log

Running log of milestones, key decisions and open issues.

## Milestones

| # | Milestone | Status |
|---|---|---|
| 1 | Scaffold, design system, core model, store, history, platform layer | ✅ Done |
| 2 | Canvas and editor interactions, layers panel | 🔨 In progress |
| 3 | Insert catalog, assets import | 🔨 In progress |
| 4 | Properties and styling panel | 🔨 In progress |
| 5 | Animation system (presets, live previews, timeline) | 🔨 In progress |
| 6 | Preview and export | 🔨 In progress |
| 7 | Projects, autosave, personal library, components | 🔨 In progress |
| 8 | Local AI engine (Ollama) | 🔨 In progress |
| 9 | Polish, integration, packaging, docs | 🔨 Partly done (command palette, shortcuts, settings, icons, packaging config, Electron e2e) |

## Key decisions

- **Real DOM canvas, not `<canvas>`.** Nodes render as real HTML elements styled with
  the same CSS the exporter writes, so the preview matches the export exactly. The
  design reset (`core/style/reset.ts`) is shared between the canvas (scoped under
  `.kc-root`) and exported sites.
- **Styles are canonical kebab-case CSS per breakpoint** (`base`, `tablet`, `mobile`),
  applied desktop-first. This is easy to export, easy for the AI to read and write,
  and maps cleanly to `@media (max-width)`.
- **History uses Immer patches.** One `mutate()` is one undo step. Transactions group
  drags, `coalesceKey` merges slider and typing edits, and AI edits are flagged and
  always land as a single step.
- **The AI generates HTML + CSS, not custom JSON.** Small local models are far better
  at HTML/CSS. `core/io/htmlImport.ts` turns their output into nodes:
  - media queries are evaluated per breakpoint width, so both desktop-first and
    mobile-first CSS work;
  - `:hover`, `:focus` and `:active` become interaction states;
  - `@keyframes` become editable animations.

  The same importer powers the component catalog and the templates. Animations use a
  JSON schema through Ollama structured outputs.
- **Animations are stored on nodes** and compiled once (`core/anim/compile.ts`). The
  result drives both Web Animations API previews in the editor and CSS `@keyframes`
  in exports. Rotation uses the standalone `rotate` property so it never fights
  animation `transform`s.
- **Offline-first.** Fonts (Inter plus 12 design fonts) are bundled, there are no
  network calls except to the local Ollama, and projects live in
  `Documents/Kinema/Projects`.
- **Electron security:**
  - `contextIsolation` and a sandboxed preload with channel allow-lists; IPC is only accepted
    from the editor window's top frame; permission prompts are denied (clipboard excepted);
  - assets served through a custom `kasset://` protocol with path-traversal guards; it serves
    only `assets/*` and `thumbnail.png` (never `project.json`), and asset read/remove IPC is
    limited to `assets/`. All path/URL checks live in `electron/guards.ts` (unit-tested);
  - Ollama HTTP calls go through the main process (no CORS issues). The bridge only talks to
    loopback / private-network / link-local hosts and local names (`localhost`, single-label
    names, `*.local`, `*.lan`, …), so Ollama on another LAN machine works; anything else must be
    allowed explicitly with `KINEMA_HTTP_ALLOW=host1,host2`. Redirects are refused;
  - CSP has no `'unsafe-inline'` for scripts (the dev server relaxes it for React refresh); the
    live preview loads the page runtime from a blob: script;
  - writes are atomic (temp file + fsync + rename), serialised per file, and `project.json` /
    `library.json` keep a `.bak` used when the main file is unreadable;
  - deleted projects move to `.trash` instead of being hard-deleted.
- **Untrusted content** (AI output, pasted HTML/JSON, `.kinema` / `.kinemalib` packages) goes
  through one set of sanitizers (`core/export/sanitize.ts`, `core/export/css.ts`) shared by the
  canvas and the exporter, and through `repairDocument` / `repairNodeSet`, which also fix
  malformed shapes, cycles and prototype keys.
- **Windows title bar** uses `titleBarOverlay` (native window controls) with a custom
  title bar. The renderer reserves space using `env(titlebar-area-*)`.

## Testing

- `npm test` runs the Vitest unit tests (core model, history, styles, animation
  compile, HTML importer, and each feature's logic).
- `tests/e2e/*.mjs` are Playwright scripts against the web build. `npm run e2e` starts Vite (and
  the mock Ollama server) and runs them all (`npm run e2e -- template catalog` for a subset).
  Playwright is not a project dependency; install it separately (see `scripts/e2e.mjs`).
  `template-fidelity.mjs` / `catalog-fidelity.mjs` compare every canvas box with the export at
  1440/768/390 (±2px). All suites are required to pass.
- `tests/unit/integrity.test.ts` applies random action sequences and checks undo/redo integrity.
- `tests/electron/smoke.mjs` drives the real Electron app under Xvfb.

## Open issues / ideas

- (resolved) canvas/properties e2e suites pass again now that blank projects are freeform.
- React applies inline styles property by property; shorthand/longhand groups are tagged so they
  are re-applied together (`core/style/style.ts`), and padding/margin/inset/radius/gap conflicts
  are expanded. Exotic combinations (e.g. `!important` values) are not covered.
- In-editor "scroll into view" animations play like "on load" (the Animate panel says so).
