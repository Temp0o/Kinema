# Kinema: assessment against user feedback (pre-spec)

The assessment is based on probing the real Electron build (Xvfb + Playwright, fake Ollama), plus
targeted code reading. Each item is marked:

- **Broken**: wrong today.
- **Missing**: not built.
- **Redesign**: works, but the UX or structure is wrong for the goal.
- **Keep**: works and should be preserved.

The detailed spec from the user is still to come. This document is combined with it to produce the
implementation plan.

## 1. Interface feels like Canva/Figma, not a UI and animation studio — Redesign

- **Keep:** the core layout mechanics. The panels are resizable and the canvas is real-DOM, and the
  stores, history, export, engine and importer are all solid and well tested.
- **Redesign:**
  - The information architecture follows the generic design-tool convention: left Layers / Insert /
    Assets / Library, right Design / Animate / AI. Motion is a secondary tab, and the timeline is
    hidden by default behind a pill button.
  - A studio-first layout would make motion and composition first-class. Examples: a persistent
    timeline strip, an "Animate" mode, a unified content browser, and AI as an ambient assistant
    rather than a tab.
- The visual language (tokens, type, controls) is cohesive and can be re-skinned through
  `styles/tokens.css` and `ui/ui.css` without rewriting features.

## 2. Free mode must be the default (Flow optional) — Broken

- New Blank projects create a **flex-column page frame**, so everything inserted becomes flow.
  For example, catalog items stretch to full width (`position: static`, verified).
- Templates and AI page generation also set the frame to Flow.
- The node-level Free/Flow switch exists (Design panel → Layout). Insertion/drop placement supports
  freeform parents (`features/insert/placement.ts`, canvas drop).
- **Fix:**
  - Blank frame becomes freeform.
  - Free is the default placement mode for inserts, drops and AI results, in both freeform and flow
    parents, with an explicit editor-level "Flow" option.
  - Templates and AI keep their internal flex layouts *inside* sections, but sections are placed per
    the active mode.

## 3. Insert / assets / components / presets / animations are hard to find — Redesign

- Insert, Assets and Library are icon-only tabs in a narrow left panel. The labels collapse at the
  default width, and "+" is easy to miss.
- Animation presets only appear in the right Animate tab, after selecting something.
- The library and the catalog are separate places with different interaction models.
- **Fix direction:**
  - A single, prominent content browser (components, sections, icons, assets, animations, library)
    reachable from the toolbar and a shortcut, with search across all of it.
  - Drag anything onto the canvas or onto a layer.

## 4. Built-in libraries are thin for a "studio" — Missing

- **Today:** 76 catalog items, 64 animation presets, 6 templates, and all Lucide icons.
- **Missing:**
  - complete multi-part UI sections and page kits;
  - illustration / shape / pattern / gradient asset packs;
  - animation "recipes" (choreographed multi-element sequences) and component-specific motion
    (e.g. button press, card hover, menu open, modal enter/exit, toast).

## 5. Applying / generating animations for specific components — Redesign

- **Works:** drag preset onto element; hover-preview on the selection; the timeline; AI animate on
  the selection.
- **Gaps:**
  - No component-aware suggestions (for a button, offer press/hover/attention).
  - No one-click "animate this" from the canvas (a floating action on the selection).
  - No multi-element choreography presets.
  - Interaction states (hover/press) and keyframe animations live in different panels.

## 6. AI transparency while continuing to work — Partially works

- **Works:** generation already continues in the background when you switch tabs or keep editing
  (verified: nodes appeared while on the Design tab). The run state lives in a store.
- **Missing:**
  - Progress is invisible outside the AI tab. There is no global activity indicator or queue.
  - The live preview is only in the panel.
  - No step-by-step log of what the model is doing: which prompt/style context was used, raw output,
    parse/repair steps, and what will change.
  - No diff/review before apply in edit mode.
  - No highlight of affected layers.

## 7. Model loading and switching speed — Missing

- Selecting a model only fetches metadata (`/api/show`). The model is loaded lazily on the first
  generation, so the first run after a switch pays the full load time with no feedback.
- **Missing:**
  - Pre-loading the model on selection (empty `/api/generate` with `keep_alive`).
  - Showing loaded state via `/api/ps`.
  - Unloading the previous model when memory is tight.
  - A "loading model…" phase in the progress UI.
  - Caching the model list across panel mounts. Detection re-polls every 30 s while the panel is
    mounted.

## 8. Entering / exiting Preview — Broken (Windows)

- The Preview overlay covers the custom title bar, and its toolbar does **not** reserve space for
  the native Windows title-bar controls (`titleBarOverlay`). The Preview **✕ Close** and
  **Open in browser** buttons sit under the system minimise/maximise/close buttons, so clicking
  "close" can close the app.
- The Preview toolbar is also not a window drag region.
- **Works:** Escape, Ctrl+Enter, and closing after clicking inside the iframe (verified).
- **Fix:**
  - Reuse the title-bar safe-area padding and a drag region.
  - A clear "Back to editor" control.
  - Keep the editor state and zoom across preview.
  - Optionally make Preview an in-place mode instead of a full-screen overlay.

## 9. Keyboard shortcut system — Redesign / Missing

- **Today:** 44 bound shortcuts registered ad hoc per module, plus a shortcuts dialog and the
  command palette.
- **Ctrl+0 is "zoom 100%"; fit is Shift+1.** The user wants Ctrl+0 → fit to workspace.
- **Missing:**
  - A single keymap definition with conflict detection.
  - User-customisable bindings (persisted).
  - Shortcut hints everywhere (menus and tooltips are partly done).
  - Missing common bindings: zoom 100% (Ctrl+1), panel toggles, tool cycling, timeline transport
    (J/K/L, frame step), keyframe add/delete, "animate selection", insert browser, preview toggle.

## Known issues carried over

- In the editor, scroll-into-view animations play like on-load ones.
- Rotating a multi-selection orbits the members around a shared centre; resizing a rotated
  multi-selection is unsupported.
- The canvas renders links without `href`, which differs from export (being addressed in review).
- AI output quality with real local models is unverified (only the fake server was tested).
