# Changelog

All notable changes to Kinema are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Before 1.0, minor versions may include breaking changes, including to the `.kinema`
project format.

## [Unreleased]

### Added

- **AI works transparently in the background.** The AI button in the top bar shows what the
  model is doing (preparing, loading the model, generating, building) from any workspace.
  Each run keeps a step-by-step activity log (model used, screenshot attached, retries,
  tokens, warnings, result), and a notification appears when a run finishes or fails while
  the assistant is closed.
- **Describe a motion.** Type a motion ("playful bouncy entrance") or pick an idea in the
  selection bar's Animate menu, or in the Animate workspace, and the local model animates the
  selected layers without opening the assistant.
- **History.** A History button next to Undo/Redo (also *Show history* in the command palette)
  lists every step of the session; click a step to jump back or forward to it.

## [0.2.0-preview.1] - 2026-11-04

Preview of the redesigned workspace. Released alongside 0.1.0-alpha.5 so you can compare them.

### Added

- **Design, Animate and Preview modes** (Alt+1/2/3) replace the tabbed side panels.
- **Library browser:** sections, components, icons, animations, uploads and your own items
  with large live previews and one search across everything.
- **Selection bar:** the everyday actions next to the selection — animate (with suggestions
  for that kind of element and hover previews), Free/Flow, AI, duplicate, delete.
- **Animate workspace:** motion library on the left, animation inspector on the right, and
  the timeline always docked.
- **Layers:** a resizable section that can dock left or right, with a kind filter,
  expand/collapse all, and keyboard navigation (arrows, Shift to extend, F2 to rename).
- **Interactive tour:** an optional walkthrough of the real interface that you can pause, skip
  or turn off. It is offered once; replay it from Help or Settings.
- Preview opens in place; Escape or the mode switcher returns to the editor.

## [0.1.0-alpha.5] - 2026-11-04

### Added

- Align and distribute layers (Alt+A/H/D/W/V/S, Alt+Shift+H/V), and copy/paste style
  (Ctrl+Alt+C / Ctrl+Alt+V).
- A central keymap with conflict detection; shortcuts can be overridden.
- Help menu (editor main menu and home screen): shortcuts, guides, report a problem, about.
- Models load in the background when you pick one, and their loaded state is shown, so the
  first generation starts faster.

### Fixed

- Projects are saved before the window closes.
- `.kinema` files open from Explorer, and the window remembers its size and position.
- A clearer message when Ollama is not running.

## [0.1.0-alpha.4] - 2026-11-03

### Fixed

- Free / Flow is now a real page and container layout mode. New projects, including
  templates, open in Free, and an existing page or container converts in place without
  visual jumps (Shift+F).
- Gradient text in rich text was being stripped.

### Changed

- Release builds target Windows only for now.

## [0.1.0-alpha.3] - 2026-11-03

### Fixed

- Ctrl+0 fits the whole page to the window.
- The Preview exit button no longer sits under the window controls.
- New content defaults to free placement.

## [0.1.0-alpha.2] - 2026-11-03

### Fixed

- Hardened the Electron main process, content security policy, project save paths and
  content sanitization.
- Undo integrity for library drops, click-insert and nested components.
- Export fidelity: element nesting, cascade order and link styles.
- AI runs are cancelled when you switch page or project.

## [0.1.0] - 2026-11-02

The first public preview of Kinema.

### Added

- **Canvas:** real-DOM canvas with desktop, tablet, mobile and custom-size frames. Move,
  resize and rotate with snapping and smart guides, multi-select, undo/redo with
  patch-based history, and pan and zoom.
- **Layers:** layer tree with reordering, grouping, renaming, locking and hiding.
- **Insert catalog:** searchable catalog of ready-made elements and sections, with drag
  and drop onto the canvas.
- **Components:** reusable components with masters, instances and per-instance overrides.
- **Personal library:** a cross-project library of components, animations, SVGs, images,
  palettes and styles, with folders, tags and favorites.
- **Properties panel:** colors, gradients, typography, spacing, borders, shadows, flex and
  grid layout, responsive per-breakpoint overrides, hover/pressed/focus states,
  transitions and design tokens.
- **Animation system:**
  - preset library with live hover previews on your design;
  - drag-and-drop application onto elements;
  - keyframe timeline with easing and spring curves;
  - load, in-view (scroll), hover, click and loop triggers;
  - stagger and SVG draw-on effects.
- **Local AI through Ollama:**
  - automatic model detection with a recommended model per task;
  - style matching from your project, a preset or a screenshot (with vision models);
  - generation of pages, sections, components, animations and SVG logos;
  - natural-language edits of a selection;
  - live streaming preview, with each AI change landing as a single undo step.
- **Preview and export:** live device preview, and export to clean standalone HTML/CSS/JS
  as a single file, a folder or a zip. You can also export a single component or copy its code.
- **Projects:**
  - project browser with templates;
  - autosave to `Documents/Kinema` (configurable with `KINEMA_DATA_DIR`);
  - `.kinema` project files with a Windows file association;
  - asset manager for images, SVG, fonts and video;
  - deleted projects are kept in a recoverable trash.
- **App shell:**
  - command palette (Ctrl/⌘+K);
  - keyboard shortcuts dialog and settings dialog;
  - dark and light themes;
  - bundled offline fonts;
  - custom title bar with native window controls.
- **Browser mode** (`npm run dev:web`) with IndexedDB storage.
- **Packaging:** Windows NSIS installer and portable `.exe`, macOS `.dmg` and Linux
  AppImage through electron-builder.

[Unreleased]: https://github.com/Temp0o/Kinema/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Temp0o/Kinema/releases/tag/v0.1.0
