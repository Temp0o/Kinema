# Kinema architecture

Kinema is an Electron + React 19 + TypeScript + Vite app. The renderer also runs in a
plain browser (`npm run dev:web`), using IndexedDB instead of the file system. That
is how the automated tests drive it.

## Layout of `src/`

| Path | What lives there |
|---|---|
| `core/model/` | Document types (`types.ts`), factories (`factory.ts`), pure tree helpers (`tree.ts`) |
| `core/store/` | `docStore.ts` (document + undo history), `uiStore.ts` (selection, viewport, panels, …), `actions.ts` (shared mutations) |
| `core/style/` | Style resolution per breakpoint, CSS helpers, the design reset shared by canvas + export |
| `core/anim/` | Animation compilation (model → WAAPI keyframes / CSS @keyframes), easing helpers |
| `core/assets/` | `asset:<id>` → URL resolution, font registration |
| `core/fonts/` | Bundled (offline) design fonts |
| `platform/` | `PlatformAPI` with Electron and web implementations |
| `ui/` | Design-system primitives (Button, IconButton, NumberField, Select, Segmented, Switch, Slider, Popover, Dialog, Section, Row, menus) |
| `features/<name>/` | Feature modules (canvas, layers, properties, animation, export, preview, projects, library, ai, …) |
| `app/` | App shell: title bar, panels, routing, module registry |
| `electron/` | Main process + preload (bundled to `dist-electron/*.cjs` by esbuild) |

## Core rules

1. **The document is the only source of truth.** Every visual thing is a `KNode` in
   `doc.nodes`. Nodes are linked by `parent` and ordered `children`. Later children
   paint on top.
2. **All document changes go through `useDoc.getState().mutate(label, recipe)`.**
   Use the helpers in `core/store/actions.ts` where one exists. Each `mutate` call is
   one undo step.
   - Use `coalesceKey` for slider and typing edits.
   - Wrap pointer drags in `beginTransaction` / `commitTransaction` so a whole drag is
     one undo step.
   - AI changes pass `{ ai: true }` and must be a single entry.
3. **Styles are kebab-case CSS strings per breakpoint:** `node.styles.base`,
   `node.styles.tablet`, `node.styles.mobile`. Edits target `useUI.getState().breakpoint`.
   Use `resolveStyles(doc, node, bp)` to read the effective style.
4. **Positioning:**
   - Children of a flex or grid container flow, and dragging them reorders.
   - Other children use `position: absolute; left; top` in px.
   - Rotation uses the standalone CSS `rotate` property, so animations are free to use
     `transform`.
5. **Assets are referenced as `asset:<id>`** in `props.src` or inside CSS values like
   `url(asset:<id>)`. Resolve them with `resolveAssetRefs` or the `useAssetUrls` store.
6. **Canvas DOM contract:**
   - Every rendered node has `data-kid="<id>"`.
   - The page root frame also has `data-kroot`.
   - Nodes inside a component instance have `data-kmid` and `data-kinst`. The instance
     root element carries `data-kid=<instanceId>`.
   - Everything renders inside `.kc-root`. That element holds the design reset and the
     token CSS variables (`--k-primary`, …).
7. **Editor UI CSS uses `k-` prefixed classes only.** Never style bare elements, so
   designs on the canvas are unaffected.
8. **Animations live on the node (`node.animations: KAnimation[]`).**
   - Editor playback uses the Web Animations API via `toWaapiKeyframes`/`toWaapiTiming`.
   - Export uses `toCssKeyframes`/`toCssAnimationShorthand`. Both come from the same
     compiled frames.
9. **Commands and shortcuts** register via `registerCommands` (`features/shortcuts/shortcuts.ts`).
   The command palette lists the same commands.
10. **Feature installers** (global listeners, command registration) are added to
    `app/modules.ts`.

## Persistence

- **Electron:** `Documents/Kinema/Projects/<id>/` holds:
  - `project.json`
  - `meta.json`
  - `thumbnail.png`
  - `assets/*`

  The library lives at `Documents/Kinema/Library/library.json`. Assets are served
  through the `kasset://<projectId>/<path>` protocol.
- **Web:** IndexedDB database `kinema`, with stores `projects`, `meta`, `assets` and `kv`.
- **Autosave:** debounced about 1.2 s after any change. It skips while a transaction
  (for example a drag) is open.
