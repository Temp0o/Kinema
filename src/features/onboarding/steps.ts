/**
 * The first-run tour script: walks a real workflow (create → add → select →
 * animate → lay out → time → preview → ship). Interactive steps advance when the
 * user actually does the thing, by click or by any alternative (keyboard, drag).
 */
import { useUI } from '@/core/store/uiStore';
import { useDoc } from '@/core/store/docStore';
import type { TourStep } from './engine';

const ui = () => useUI.getState();
const nodeCount = () => Object.keys(useDoc.getState().doc.nodes).length;
const animationCount = () => Object.values(useDoc.getState().doc.nodes).reduce((n, k) => n + (k.animations?.length ?? 0), 0);

/** Put the editor in a workspace (no-op when already there). */
function workspace(mode: 'design' | 'animate') {
  const s = ui();
  if (s.route !== 'editor') return;
  if (s.mode !== mode || s.previewOpen) s.set({ mode, previewOpen: false });
}

// Baselines captured when an interactive step starts.
let nodesAtStart = 0;
let animsAtStart = 0;

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Kinema',
    body: 'Kinema is a studio for designing interfaces and bringing them to life with motion. This two-minute tour builds a small page with you, so you learn by doing. You can pause or leave at any time.',
    placement: 'center',
    advance: 'next',
  },
  {
    id: 'new-project',
    route: 'home',
    target: '[data-testid="new-project"]',
    title: 'Start a project',
    body: 'Everything starts with a project. It saves itself to your computer about a second after every change, so there is no Save button to remember.',
    prompt: 'Click New project, then Create',
    placement: 'bottom',
    advance: { until: () => ui().route === 'editor' },
    skip: () => ui().route === 'editor',
    missing: 'Go back to the projects screen, or open any project, to continue.',
  },
  {
    id: 'modes',
    route: 'editor',
    target: 'modes',
    title: 'Three workspaces, one canvas',
    body: 'Design is for layout and content, Animate is for motion and timing, Preview runs your page for real. Each one arranges the tools for that job. Alt+1, Alt+2 and Alt+3 switch between them.',
    placement: 'bottom',
    advance: 'next',
    onEnter: () => workspace('design'),
  },
  {
    id: 'library-search',
    route: 'editor',
    target: 'library-search',
    title: 'The Library',
    body: 'Everything you can add lives here: full sections, components, text, media, icons and your own saved pieces. Search finds across all of them at once. Press A anywhere to jump here.',
    placement: 'right',
    advance: 'next',
    onEnter: () => {
      workspace('design');
      ui().set({ libraryView: 'home' });
    },
  },
  {
    id: 'library-sections',
    route: 'editor',
    target: 'library-sections',
    title: 'Ready-made sections',
    body: 'Sections are complete page blocks such as heroes, features, pricing and footers. They are the fastest way to get a real layout on the page.',
    prompt: 'Click the Sections tile',
    placement: 'right',
    advance: { until: () => ui().libraryView === 'sections' },
    onEnter: () => {
      workspace('design');
      ui().set({ libraryView: 'home' });
    },
    missing: 'Open the Library home (the back arrow at the top of the Library) to see the Sections tile.',
  },
  {
    id: 'library-add',
    route: 'editor',
    target: () => document.querySelector('[data-tour="library-card"]'),
    title: 'Add one to your page',
    body: 'Click a card to drop it onto the page, or drag it exactly where you want it. Every preview is live, so what you see is what you get.',
    prompt: 'Click any section card',
    placement: 'right',
    advance: { until: () => nodeCount() > nodesAtStart },
    onEnter: () => {
      workspace('design');
      if (ui().libraryView === 'home') ui().set({ libraryView: 'sections' });
      nodesAtStart = nodeCount();
    },
  },
  {
    id: 'select',
    route: 'editor',
    target: 'canvas',
    title: 'Select something',
    body: 'Click any element on the canvas to select it. Double-click to go deeper into a group or to edit text. Shift-click adds to the selection.',
    prompt: 'Click an element on the canvas',
    placement: 'left',
    advance: { until: () => ui().selection.length > 0 },
    onEnter: () => {
      workspace('design');
      ui().select([]);
    },
  },
  {
    id: 'animate-button',
    route: 'editor',
    // The button plus the selected element, so hover previews stay visible.
    target: () => {
      const btn = document.querySelector('[data-tour="animate-button"]');
      const id = ui().selection[0];
      const el = id ? document.querySelector(`.kc-root [data-kid="${CSS.escape(id)}"]`) : null;
      return btn ? (el ? [btn, el] : btn) : null;
    },
    title: 'Animate it in one step',
    body: 'The bar above your selection holds the everyday actions. Open Animate and hover a preset to preview it on your element, then click one to apply it.',
    prompt: 'Open Animate and click a preset',
    placement: 'bottom',
    advance: { until: () => animationCount() > animsAtStart },
    onEnter: () => {
      workspace('design');
      animsAtStart = animationCount();
    },
    missing: 'Select an element on the canvas to bring back its action bar.',
  },
  {
    id: 'layers',
    route: 'editor',
    target: 'layers',
    title: 'Layers',
    body: 'Layers show how your page is built, from back to front. Drag to reorder or nest. Double-click a name to rename it, because clear names make big pages easy to navigate.',
    placement: 'right',
    advance: 'next',
    onEnter: () => workspace('design'),
  },
  {
    id: 'inspector',
    route: 'editor',
    target: 'inspector',
    title: 'Inspector',
    body: 'Fine-tune the selection here: position and size, fill, text, corners and shadows. The essentials come first, and each section has an Advanced expander when you need more.',
    placement: 'left',
    advance: 'next',
    onEnter: () => workspace('design'),
  },
  {
    id: 'layout-mode',
    route: 'editor',
    target: 'layout-mode',
    title: 'Free or Flow layout',
    body: 'Free lets you place things anywhere, like a canvas. Flow stacks content automatically and adapts to screen sizes, like a real web page. Switching converts your content in place, so you can change your mind.',
    placement: 'top',
    advance: 'next',
    onEnter: () => workspace('design'),
  },
  {
    id: 'go-animate',
    route: 'editor',
    target: 'mode-animate',
    title: 'Time to animate',
    body: 'The Animate workspace is where motion gets timed and polished.',
    prompt: 'Click Animate',
    placement: 'bottom',
    advance: { until: () => ui().mode === 'animate' && !ui().previewOpen },
    onEnter: () => workspace('design'),
  },
  {
    id: 'motion-library',
    route: 'editor',
    target: 'motion-library',
    title: 'Motion library',
    body: 'Entrances, exits, hover effects, scroll reveals, loops and choreographed sequences. Drop one onto any element, or apply it to your selection. Suggestions for the selected element appear at the top.',
    placement: 'right',
    advance: 'next',
    onEnter: () => workspace('animate'),
  },
  {
    id: 'timeline',
    route: 'editor',
    target: 'timeline',
    title: 'Timeline',
    body: 'Each animation appears here as a track, so you can see and adjust when things start and how long they run. Press Space to play. Keyframes and easing live in the panel on the right.',
    placement: 'top',
    advance: 'next',
    onEnter: () => workspace('animate'),
  },
  {
    id: 'go-preview',
    route: 'editor',
    target: 'mode-preview',
    title: 'See it for real',
    body: 'Preview runs your page with its real animations, hover states and breakpoints, exactly as it will look when exported.',
    prompt: 'Click Preview',
    placement: 'bottom',
    advance: { until: () => ui().previewOpen },
    onEnter: () => workspace('animate'),
  },
  {
    id: 'leave-preview',
    route: 'editor',
    target: 'mode-design',
    title: 'Back to Design',
    body: 'The top bar stays visible in Preview, so you are always one click away from editing again.',
    prompt: 'Click Design to keep editing',
    placement: 'bottom',
    advance: { until: () => !ui().previewOpen && ui().mode === 'design' },
  },
  {
    id: 'ai',
    route: 'editor',
    target: 'ai',
    title: 'Your AI assistant',
    body: 'Describe a section, a change or an animation in plain words and Kinema builds it. It runs locally on your computer with Ollama, and every AI change is a single undo step. Ctrl+I opens it from anywhere.',
    placement: 'bottom',
    advance: 'next',
    onEnter: () => workspace('design'),
  },
  {
    id: 'export',
    route: 'editor',
    target: 'export',
    title: 'Ship it',
    body: 'Export clean HTML and CSS with your animations compiled in, ready to host or hand to a developer. You can also share the project as a .kinema file.',
    placement: 'bottom',
    advance: 'next',
  },
  {
    id: 'finish',
    title: 'You’re all set',
    body: 'A few shortcuts to keep handy:\n• Ctrl+K opens the command palette, so you can find any action by name.\n• Ctrl+/ lists every keyboard shortcut.\n• Help → Take the interactive tour replays this tour.',
    placement: 'center',
    advance: 'next',
  },
];
