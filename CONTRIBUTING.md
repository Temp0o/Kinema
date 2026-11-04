# Contributing to Kinema

Thanks for helping make Kinema better! This guide covers the development setup, the
conventions we follow, and what a pull request needs before it can be merged.

By contributing you agree that your contributions are licensed under the project's
[MIT License](LICENSE).

## Ways to contribute

- **Report a bug** or **suggest a feature** with the
  [issue templates](https://github.com/Temp0o/Kinema/issues/new/choose). Search existing
  issues first.
- **Improve the docs.** Typos, unclear steps and missing troubleshooting tips are all welcome.
- **Write code.** For anything bigger than a small fix, open an issue first so we can agree on
  the approach before you spend time on it.

## Development setup

You need **Node.js ≥ 22.12** (or ^20.19; see [`.nvmrc`](.nvmrc)), npm and Git.
[docs/INSTALL.md](docs/INSTALL.md#building-from-source) has a step-by-step guide for Windows.

```bash
git clone https://github.com/Temp0o/Kinema.git
cd Kinema
npm install
npm run dev        # Electron app with hot reload (F12 opens DevTools)
npm run dev:web    # or: the editor in a browser at http://localhost:5173 (IndexedDB storage)
```

`npm run dev` stores projects in your real `Documents/Kinema` folder. To keep test data
separate, point it somewhere else:

```bash
KINEMA_DATA_DIR=/tmp/kinema-dev npm run dev           # macOS / Linux
$env:KINEMA_DATA_DIR = "$env:TEMP\kinema-dev"; npm run dev   # Windows PowerShell
```

For AI features, install Ollama and pull a model ([docs/OLLAMA.md](docs/OLLAMA.md)).

## Architecture rules

Read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** before changing the editor. The
essentials:

1. **The document is the only source of truth.** Everything visual is a `KNode` in
   `doc.nodes`, linked by `parent` and ordered `children`.
2. **Every document change goes through `useDoc.getState().mutate(label, recipe)`.** Each
   call is one undo step. Use the helpers in `core/store/actions.ts` where they exist, a
   `coalesceKey` for slider and typing edits, and `beginTransaction` / `commitTransaction` around
   pointer drags. AI changes pass `{ ai: true }` and must land as a single step.
3. **Styles are kebab-case CSS strings per breakpoint** (`base`, `tablet`, `mobile`). Edits
   target the active breakpoint, and you read effective styles with `resolveStyles`.
4. **Positioning.** Children of flex and grid containers flow. Other children use
   `position: absolute` with `left`/`top`. Rotation uses the standalone `rotate` property,
   so animations can use `transform` freely.
5. **Assets are referenced as `asset:<id>`** and resolved with `resolveAssetRefs` /
   `useAssetUrls`.
6. **Canvas DOM contract.** Rendered nodes carry `data-kid`. Everything renders inside
   `.kc-root`.
7. **Editor CSS uses `k-`-prefixed classes only.** Never style bare elements, or you will
   change users' designs on the canvas.
8. **Animations live on the node** and compile once, to the Web Animations API for the editor
   and to CSS `@keyframes` for export.
9. **Commands and shortcuts** register through `registerCommands`, so they appear in the
   command palette automatically.
10. **Feature installers** are added to `src/app/modules.ts`, one line each.

Also keep these in mind:

- **Platform code stays behind `PlatformAPI`** (`src/platform/`). Features must work in both
  the Electron and the web implementation.
- **Electron security.** Keep `contextIsolation` and the sandboxed preload with its channel
  allow-lists, guard every file path against traversal, and never enable `nodeIntegration`.
- **Offline-first.** No network calls except to the user's local Ollama server, and no
  remote fonts, scripts or telemetry.

## Branches and commits

- Branch from the default branch with a short descriptive name: `feat/timeline-snapping`,
  `fix/export-font-paths`, `docs/ollama-troubleshooting`.
- Write commit subjects in the imperative mood, in sentence case, without a trailing period, and
  keep them under about 72 characters: *"Add spring easing editor to timeline"*. Explain the
  *why* in the body when it isn't obvious.
- Keep each commit focused on one thing. Don't mix refactors with behaviour changes.
- Rebase on the latest default branch before opening a pull request, and resolve conflicts on your
  branch.

## Tests

Run these before you push. CI runs the same checks:

```bash
npm run typecheck
npm test
npm run build:web
```

- **Unit tests** live next to the code (`src/**/*.test.ts(x)`) or in `tests/unit/`. They use
  Vitest with jsdom. Logic changes, such as model, store, styles, animation compile, import
  and export, need tests.
- **Smoke tests** (`tests/e2e/`, `tests/electron/`) drive the real UI with Playwright. See
  [running the tests](docs/INSTALL.md#running-the-tests). Run them when you change the app
  shell, startup, persistence or Electron code.
  The first-run tour would cover the UI, so Electron tests launch with `KINEMA_NO_TOUR=1`
  (web e2e runs are suppressed via `navigator.webdriver` or `?notour`). Only
  `tests/electron/onboarding.mjs` runs with the tour enabled.
- For packaging changes, check that `npm run dist:dir` (or `npm run dist` on Windows)
  still produces a working app.

## Pull request checklist

- [ ] The PR has a clear title and description, and links the issue it closes (`Closes #123`).
- [ ] `npm run typecheck`, `npm test` and `npm run build:web` pass.
- [ ] New logic has unit tests, and bug fixes have a regression test where practical.
- [ ] It follows the [architecture rules](#architecture-rules): document changes go through
      `mutate`, and the change is one undo step per user action.
- [ ] It works in both the Electron app (`npm run dev`) and browser mode (`npm run dev:web`).
- [ ] UI changes include before/after screenshots or a short screen recording, and look
      right in the dark and light themes.
- [ ] New commands have a title and group so they show up in the command palette.
- [ ] User-facing changes are noted under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md),
      and the docs are updated if needed.
- [ ] No new runtime network calls, telemetry or remote assets.

## Releases

Maintainers release by bumping `version` in `package.json`, moving the `[Unreleased]`
changelog entries under the new version, and pushing a `vX.Y.Z` tag. The
[release workflow](.github/workflows/release.yml) builds the Windows installer and portable
`.exe`, a macOS `.dmg` and a Linux AppImage, and attaches them to a GitHub Release.
