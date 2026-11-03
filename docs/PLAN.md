# Kinema development plan: user-experience redesign

This plan combines the user's feedback (Nov 2026) with `docs/ASSESSMENT.md`. The goal is a
dedicated UI and motion design studio that is easy to start with and powerful for serious work. It
should not be a Canva/Figma clone, and it should not be dumbed down. Windows 11 is the only
release and test target.

## Guiding principles

1. **Task-shaped workspaces, not one panel soup.**
   - Kinema is organized around what you are doing: Design, Animate, Preview.
   - Each mode arranges the same canvas with the tools that task needs.
   - This is Kinema's identity, closer to a motion studio than to a whiteboard or slide editor.
2. **Everything you can add is one obvious step away.**
   - Components, sections, icons, assets, your library and animations live in large,
     browsable, searchable libraries with live previews.
   - Click or drag to add.
3. **Act on the thing you selected.**
   - A contextual action bar appears next to the selection: animate it, change Free/Flow,
     edit, ask AI, duplicate, and more.
   - Most everyday edits never need the full inspector.
4. **Progressive disclosure, never removal.**
   - The inspector shows the essentials first; every advanced control is one click away.
   - Power features stay (keyboard, command palette, raw CSS, timeline, states, breakpoints).
5. **Free by default, Flow on purpose.**
   - Pages and containers have a visible, switchable layout mode.
   - Switching converts existing content in place, without visual jumps.
6. **Keep what works.**
   - Do not rebuild the parts that are solid and tested: the document model and history, canvas
     rendering and interactions, the export compiler, the animation engine and compile, the HTML
     importer, projects and storage, and the AI pipelines.
   - The redesign re-houses and re-presents them.

## What's genuinely broken (fix first)

| # | Problem | Root cause | Fix |
|---|---|---|---|
| B1 | "Flow is still the default, I can't switch out of it" | The toolbar toggle only affects *new* content. Every template (and projects made before alpha.3) has a flex-column page frame, and the page frame can't be selected or switched. Page settings have no layout control. | A page/container **Layout: Free / Flow** switch that converts existing children in place, in both directions: measured positions per breakpoint, or reading order. New projects from *any* template open in Free at page level. The toggle moves to the top bar and selection bar with clear wording. |
| B2 | The Preview overlay hid the title bar (exit under Windows controls) | — | Fixed in alpha.3. Preview becomes an in-place mode in Stage 1. |
| B3 | Ctrl+0 zoomed to 100% | — | Fixed in alpha.3 (fit on screen). |

## What needs redesigning

| Area | Today | Redesign |
|---|---|---|
| Workspace | Figma-style: left tabs (Layers/Insert/Assets/Library), right tabs (Design/Animate/AI), hidden timeline | Mode switcher **Design · Animate · Preview** in the top bar. Each mode has its own purpose-built arrangement, plus a new visual identity (see the layout sketch below). |
| Finding components | Small icon-only "+" tab | **Library** is the default left panel in Design mode: search across everything, categories (Sections, Components, Text, Media, Shapes, Icons, Uploads, My Library), large live previews, click/drag to add. Also opens with **A** or the "+ Add" top-bar button. |
| Animation library | Only in the right Animate tab, and only after selecting something | **Animate mode**: the motion library is the left panel (Entrances, Exits, Emphasis, Hover & Press, Scroll, Loops, Text, SVG, Sequences). The timeline is always docked. "Suggested for this element" appears at the top, by element type. |
| Applying animation to a component | Several steps | Selection action bar → **Animate ▸** quick picker with hover-preview. Drop a preset onto any element. Per-element suggestions. |
| Inspector | Long scroll of every control | **Essentials** first (layout mode, position/size, fill, text, corners, shadow). An "Advanced" expander per section. States and breakpoints as clear switches. |
| AI | A right-panel tab; progress invisible elsewhere | An **Assistant** drawer reachable from anywhere (Ctrl+I, top bar, selection bar). A background job centre in the top bar with a live step log. You can keep working while it runs. |
| Preview | Full-screen overlay | In-place mode. The top bar stays, so you exit by clicking **Design** or pressing Esc/Ctrl+Enter. |

## What's missing

- **Content:**
  - complete UI sections (heroes, features, pricing, testimonials, FAQ, footers, dashboards, auth);
  - page kits;
  - shapes, patterns and gradients;
  - more icons/illustration placeholders;
  - choreographed animation **sequences** (staggered entrances, hero reveal, card hover sets, menu open/close, modal in/out);
  - component-specific motion.
- **Model speed:**
  - pre-load on select;
  - loaded-state indicator (`/api/ps`);
  - a "loading model…" phase;
  - a cached model list.
- **Keyboard:**
  - a central keymap;
  - customisable bindings with conflict detection;
  - shortcut hints everywhere;
  - mode switching (1/2/3);
  - Library (A), timeline transport (Space, J/K/L), add keyframe, animate selection.
- **First-run guidance:** a short, skippable tour of the modes, the library and the selection bar.

## Layout sketch (Design mode)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ Kinema ▾  Project ▾ · Page ▾     [ Design | Animate | Preview ]     ⌂ ▭ ▯  100%  ✦AI●  Export │
├───────────────┬───────────────────────────────────────────────────────┬──────────────┤
│ 🔍 Search all  │                                                       │ ▸ Selection  │
│ Sections      │                   canvas                              │ Layout Free|Flow│
│ Components    │        ┌──────────────┐                               │ Position/Size │
│ Text · Media  │        │  selected    │ ⟵ selection bar:              │ Fill · Text   │
│ Shapes · Icons│        └──────────────┘   Animate ▸ Free/Flow AI ▸ ⋯  │ Corners·Shadow│
│ Uploads · Mine│                                                       │ ⌄ Advanced    │
│ [big previews]│                                                       │               │
├── Layers ─────┤                                                       │ Motion (2) ▸  │
│ tree…         │                                                       │               │
└───────────────┴───────────────────────────────────────────────────────┴──────────────┘
```

Animate mode keeps the canvas. The left panel becomes the **Motion library**, the right panel the
**Animation inspector** (timing, easing curve, keyframes, triggers), and a large **timeline** is
always docked at the bottom.

## Stages

Each stage ends with:
- `tsc` and the unit tests passing;
- all e2e suites passing;
- the Electron editor, regression and smoke tests passing;
- review of screenshots of the real Electron app;
- a Windows alpha release.

**Stage 0. Free/Flow fix (bug B1).**
- Page and container layout switch with in-place conversion (per-breakpoint positions).
- Templates open in Free.
- Clear indicators.
- Electron tests.
- Release alpha.4.

**Stage 1. New workspace and identity.**
- Mode switcher and a new top bar.
- Design-mode layout (Library + Layers left, Essentials inspector right).
- Selection action bar.
- In-place Preview mode.
- A new visual language: tokens, typography, density, iconography, subtle UI motion.
- All existing panels are re-housed, nothing removed.
- Screenshots go to the user for direction feedback before deeper stages build on it.

**Stage 2. Library.**
- Unified content browser with search across everything, categories and large previews.
- Expanded content: complete sections, page kits, shapes/patterns.
- My Library and uploads integrated.

**Stage 3. Motion.**
- Animate mode: motion library with intent categories and live previews.
- Per-element suggestions.
- "Animate ▸" quick picker on the selection bar.
- Sequences/choreography presets.
- Timeline always visible in Animate mode.
- Animation inspector redesign.

**Stage 4. Inspector and editing ease.**
- Essentials/Advanced disclosure across all sections.
- States and breakpoints as clear switches.
- Smarter defaults.
- First-run tour.

**Stage 5. AI and models.**
- Assistant drawer and background job centre with a transparent step log.
- Model pre-load and switching speed.
- Keep working during generation.

**Stage 6. Keyboard, performance, polish.**
- Central keymap with customisation and conflict detection, plus the new bindings.
- Windows performance pass.
- Docs and screenshots refresh.

## Team and process

- **Stage 0:** the lead does it directly.
- **Stage 1:** lead-driven, because the shell sets the identity and every later stage plugs into it.
- **Stages 2–3:** one sub-agent each at most, run in parallel only when they own disjoint folders.
  The lead reviews and merges every change.
- After every merge: the full test suite plus the real Electron tests before any release.
