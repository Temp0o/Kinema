# Kinema user guide

A quick but complete tour of Kinema. Keyboard shortcuts use <kbd>Ctrl</kbd>. On macOS, use
<kbd>⌘</kbd> instead (and <kbd>⌥ Option</kbd> for <kbd>Alt</kbd>). Press
<kbd>Ctrl</kbd>+<kbd>K</kbd> at any time to search every command, and
<kbd>Ctrl</kbd>+<kbd>/</kbd> to see every shortcut.

- [The interface](#the-interface)
- [Projects and templates](#projects-and-templates)
- [Canvas basics](#canvas-basics)
- [Responsive design](#responsive-design)
- [Styling and states](#styling-and-states)
- [Components and your personal library](#components-and-your-personal-library)
- [Animations](#animations)
- [AI assistant](#ai-assistant)
- [Preview and export](#preview-and-export)
- [Saving, files and backups](#saving-files-and-backups)

---

## The interface

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Title bar: menu · project name · save status · page │ breakpoints │ ▶ AI Export│
├─────────────┬───────────────────────────────────────────────┬────────────────┤
│ Layers      │                                               │ Design         │
│ Insert      │                  Canvas                       │ Animate        │
│ Assets      │                                               │ AI             │
│ Library     │       [ floating toolbar: V H B T I ⏱ ✦ ]      │                │
│             ├───────────────────────────────────────────────┤                │
│             │  Timeline (Alt+T)                              │                │
└─────────────┴───────────────────────────────────────────────┴────────────────┘
```

- **Title bar.** The logo menu holds *All projects*, *Save*, *Export*, theme, shortcuts and
  settings. Next to it are the project name (double-click to rename), the save status and the
  **page switcher**, where you can add pages. The center has the **breakpoint switcher**
  (desktop, tablet, mobile) with the exact canvas width. On the right: undo/redo, zoom,
  **▶ Play** (all page animations), **Ask AI**, **Preview** and **Export**.
- **Left panel**
  - **Layers:** the element tree. Select, rename, reorder by dragging, group, lock and hide.
  - **Insert:** the searchable component catalog. Drag items onto the canvas or click to add.
  - **Assets:** images, SVGs, fonts and videos in this project.
  - **Library:** your personal library, shared by all projects.
- **Canvas** with a **floating toolbar**: Select <kbd>V</kbd>, Hand <kbd>H</kbd>, Box
  <kbd>B</kbd>, Text <kbd>T</kbd>, Image <kbd>I</kbd>, the timeline toggle and **Generate**
  (AI).
- **Right panel**
  - **Design:** every style property of the selection.
  - **Animate:** animation presets and the selection's animations.
  - **AI:** the local AI assistant.
- **Timeline dock** at the bottom (<kbd>Alt</kbd>+<kbd>T</kbd>) for keyframe editing.

You can resize the panels by dragging their edges. **Settings → Reset panel sizes** restores
them. Kinema has dark and light themes (logo menu or Settings).

## Projects and templates

The **project browser** opens on launch and lists your projects with thumbnails.

- **New project:** start blank, or pick a **template** to start from a finished layout.
- **Open, rename, duplicate or delete** projects from the browser. Deleted projects go to a
  `.trash` folder inside your data folder, so they can be recovered.
- **Import / export `.kinema` files** to move a project to another computer or share it. A
  `.kinema` file contains the whole project, including its assets. On Windows, double-click
  a `.kinema` file to open it in Kinema (installer build).
- A project can have several **pages**. Use the page switcher in the title bar.

## Canvas basics

| Do this | How |
|---|---|
| Add an element | Drag from **Insert**, or pick a tool (<kbd>B</kbd> box, <kbd>T</kbd> text, <kbd>I</kbd> image) and click or drag on the canvas |
| Select / add to selection | Click / <kbd>Shift</kbd>+click, or drag a selection box |
| Select an element deep inside a group | <kbd>Ctrl</kbd>+click, or double-click to step inside |
| Move, resize, rotate | Drag the element, its handles, or the rotation handle outside a corner |
| Keep proportions / constrain | Hold <kbd>Shift</kbd> while dragging |
| Duplicate | <kbd>Ctrl</kbd>+<kbd>D</kbd>, or <kbd>Alt</kbd>+drag |
| Group / ungroup | <kbd>Ctrl</kbd>+<kbd>G</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> |
| Change stacking order | <kbd>Ctrl</kbd>+<kbd>]</kbd> / <kbd>Ctrl</kbd>+<kbd>[</kbd> (add <kbd>Shift</kbd> for front/back) |
| Edit text | Double-click a text element |
| Pan / zoom | <kbd>Space</kbd>+drag or the Hand tool / <kbd>Ctrl</kbd>+scroll, <kbd>Shift</kbd>+<kbd>1</kbd> to fit |
| Undo / redo | <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> |

**Snapping and smart guides** align elements to each other and to the grid while you drag.
You can turn them off in **Settings → Canvas**.

**Two kinds of positioning.** Inside a container with *flex* or *grid* layout, children flow
automatically, and dragging one **reorders** it. Anywhere else, elements are placed freely
at exact pixel positions. Switch a container's layout in the **Design** tab.

## Responsive design

Every page has three breakpoints: **Desktop** (1440 px), **Tablet** (768 px, applies at
≤ 1024 px) and **Mobile** (390 px, applies at ≤ 640 px). Type a width into the title bar to
check any size in between.

- **Edits apply to the active breakpoint.** Styles cascade from desktop to tablet to mobile.
  A style set on desktop also applies to tablet and mobile unless you override it there.
- Typical workflow: design on desktop first, switch to tablet and fix what doesn't fit,
  then do the same on mobile.
- The Design tab marks properties that are overridden on the current breakpoint, and you can
  reset an override to inherit again.

## Styling and states

The **Design** tab shows everything about the selection:

- **Layout:** display, flex and grid (direction, gap, alignment, wrapping, columns), size,
  min/max, overflow, position.
- **Spacing:** padding and margin.
- **Typography:** font, size, weight, line height, letter spacing, alignment, color. A
  dozen design fonts are bundled for offline use, and you can add your own in **Assets**.
- **Fill:** solid colors and linear/radial gradients, background images.
- **Borders and radius**, **shadows**, opacity, blend and filters.
- **States:** style **hover**, **pressed** and focus separately. Pick a state to preview it
  on the canvas, then edit.
- **Transitions:** how smoothly state changes animate (duration, easing).
- **Design tokens:** project colors and fonts you can reuse everywhere. Changing a token
  updates every element that uses it.

## Components and your personal library

- **Components:** select elements and choose *Create component*. The original becomes the
  **master**. Every copy is an **instance** that updates when you edit the master. Instances
  can override text, images and styles.
- **Personal library:** save components, animations, SVGs, images, color palettes and styles
  to the **Library** tab. The library is shared across **all your projects**, so reusable
  pieces are always one drag away. Organize items with folders, tags and favorites.

## Animations

Animations are first-class in Kinema. Every element can have several, and they export as
plain CSS.

1. **Browse presets** in the **Animate** tab: entrances, emphasis, exits, loops, text and
   SVG effects.
2. **Hover a preset** to preview it **live on your selected element**.
3. **Apply** by clicking a preset, or **drag it onto any element** on the canvas.
4. **Choose a trigger:**
   - **Load:** when the page opens.
   - **In view:** when scrolled into view.
   - **Hover**, **click**, or **loop**.
5. **Fine-tune** duration, delay, repeat count, direction and easing, including **spring**
   curves.

**Timeline** (<kbd>Alt</kbd>+<kbd>T</kbd>): every animation on the page as tracks. Drag bars
to change delay and duration, add and move **keyframes**, and set easing per keyframe.
<kbd>Shift</kbd>+<kbd>Space</kbd> plays or stops all page animations.

**Stagger** applies one animation to each child in turn, with an increasing delay, which is
great for lists, grids and text. **SVG draw-on** animates an SVG's strokes so the drawing
appears to be traced. Combine it with stagger to draw path after path.

## AI assistant

Kinema's AI runs locally through Ollama. If you haven't set it up yet, follow
[the Ollama guide](OLLAMA.md). Open the **AI** tab (<kbd>Ctrl</kbd>+<kbd>I</kbd>) or click
**Generate** in the toolbar.

1. **Pick a mode:**
   - **Generate** a page, section or component.
   - **Edit** the selection ("make this card more compact and add a hover lift").
   - **Animate** the selection.
   - Create an **SVG logo or icon**.
2. **Pick a style source:**
   - **Match my project** (colors, fonts, spacing and components already in use).
   - A **preset style**.
   - **Fresh**.
   - With a vision model, a **screenshot** to match.
3. **Check the model.** Each task shows the **Recommended** installed model, and you can switch.
4. **Describe what you want** and send. The result **streams onto the canvas** as it's
   generated, and you can stop at any time.
5. **Keep it or undo it.** The whole AI change is a single undo step. Generated elements are
   normal elements, so you can edit, restyle and animate them like anything else.

Tips: be concrete about content and layout, generate a page section by section with
smaller models, and select only the part you want changed before an edit.

## Preview and export

- **Preview** (title bar) runs your design with animations and interactions at desktop,
  tablet, mobile or any custom width. You can also open it in your default browser.
- **Export** (<kbd>Ctrl</kbd>+<kbd>E</kbd>) writes clean, standalone **HTML, CSS and a small
  JS file** (only when animations need it, for scroll and click triggers):
  - **Single file:** one `.html` with everything inlined.
  - **Folder:** `index.html`, a stylesheet, scripts and an `assets/` folder.
  - **Zip:** the same folder, zipped.
- **Export a single component** or element, or **copy its code** to paste into another
  project.
- Exported pages need no framework and no Kinema runtime. Responsive breakpoints become
  `@media` queries, states become `:hover` / `:active` rules, and animations become CSS
  `@keyframes`.

## Saving, files and backups

- **Autosave:** projects save automatically about a second after each change. The title bar
  shows the save status. <kbd>Ctrl</kbd>+<kbd>S</kbd> saves immediately.
- **Where:** `Documents/Kinema/Projects` and `Documents/Kinema/Library`. See
  [Where your files live](INSTALL.md#where-your-files-live) for the full paths and how to
  change them.
- **Backups:** copy the `Documents/Kinema` folder, or export important projects as `.kinema`
  files.
