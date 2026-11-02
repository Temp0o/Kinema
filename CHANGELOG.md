# Changelog

All notable changes to Kinema are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Before 1.0, minor versions may include breaking changes, including to the `.kinema`
project format.

## [Unreleased]

### Added

- Project documentation: README, installation guide, user guide, local AI (Ollama) guide and
  contributing guide.
- GitHub Actions: CI (type-check, unit tests, web build) and a release workflow that builds
  Windows, macOS and Linux packages from `v*` tags.
- Issue templates for bug reports and feature requests, and a pull-request template.

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
