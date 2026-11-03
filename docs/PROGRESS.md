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
  - `contextIsolation` and a sandboxed preload with channel allow-lists;
  - assets served through a custom `kasset://` protocol with path-traversal guards;
  - Ollama HTTP calls go through the main process (no CORS issues);
  - deleted projects move to `.trash` instead of being hard-deleted.
- **Windows title bar** uses `titleBarOverlay` (native window controls) with a custom
  title bar. The renderer reserves space using `env(titlebar-area-*)`.

## Testing

- `npm test` runs the Vitest unit tests (core model, history, styles, animation
  compile, HTML importer, and each feature's logic).
- `tests/e2e/*.mjs` are Playwright scripts against the web build (`npm run dev:web`).
- `tests/electron/smoke.mjs` drives the real Electron app under Xvfb.

## Open issues / ideas

- *(updated as integration proceeds)*
