/**
 * Project templates. Authored as HTML + CSS (see the individual files) and
 * converted into Kinema nodes with the HTML importer when a project is created.
 */
import type { KDocument, StyleMap } from '../model/types';
import { createDocument } from '../model/factory';
import { importHtml } from '../io/htmlImport';
import type { TemplateDef } from './types';
import { landingTemplate } from './landing';
import { portfolioTemplate } from './portfolio';
import { dashboardTemplate } from './dashboard';
import { authTemplate } from './auth';
import { mobileTemplate } from './mobile';
import { comingSoonTemplate } from './comingSoon';

export type { TemplateDef } from './types';

export const BLANK_TEMPLATE: TemplateDef = {
  id: 'blank',
  name: 'Blank',
  description: 'An empty canvas',
  html: '',
  css: '',
  swatch: '#8b6cff',
};

export const TEMPLATES: TemplateDef[] = [
  BLANK_TEMPLATE,
  landingTemplate,
  portfolioTemplate,
  dashboardTemplate,
  authTemplate,
  mobileTemplate,
  comingSoonTemplate,
];

export function getTemplate(id: string | null | undefined): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function applyTemplateTokens(doc: KDocument, def: TemplateDef) {
  const t = def.tokens;
  if (!t) return;
  if (t.colors?.length) doc.tokens.colors = t.colors.map((c) => ({ id: `c_${c.name.replace(/[^a-z0-9]+/gi, '_')}`, name: c.name, value: c.value }));
  if (t.fonts) doc.tokens.fonts = { ...doc.tokens.fonts, ...t.fonts };
  if (t.radius != null) doc.tokens.radius = t.radius;
}

/** Properties from `body` rules that make no sense on the page frame. */
const SKIP_PAGE_PROPS = new Set(['margin', 'padding', 'height', 'min-height', 'overflow-x', 'overflow-y', '-webkit-font-smoothing', '-moz-osx-font-smoothing']);

/** Create a document from a template. Returns import warnings (empty for built-in templates). */
export function buildTemplateDocument(templateId: string, title: string): { doc: KDocument; warnings: string[] } {
  const def = getTemplate(templateId) ?? BLANK_TEMPLATE;
  const doc = createDocument(title);
  applyTemplateTokens(doc, def);
  const page = doc.pages[0];
  if (def.pageName) page.name = def.pageName;
  const frame = doc.nodes[page.rootId];
  frame.name = page.name;
  frame.styles.base = { ...frame.styles.base, display: 'flex', 'flex-direction': 'column' };
  if (!def.html.trim()) return { doc, warnings: [] };

  const res = importHtml(def.html, { breakpoints: doc.breakpoints, css: def.css });
  for (const [bp, map] of Object.entries(res.pageStyles)) {
    const clean: StyleMap = {};
    for (const [k, v] of Object.entries(map)) if (!SKIP_PAGE_PROPS.has(k) && !k.startsWith('--')) clean[k] = v;
    if (!Object.keys(clean).length) continue;
    const target = (frame.styles[bp] ??= {});
    if (clean.background || clean['background-image']) delete target['background-color'];
    Object.assign(target, clean);
  }
  for (const id of res.rootIds) {
    res.nodes[id].parent = frame.id;
    frame.children.push(id);
  }
  Object.assign(doc.nodes, res.nodes);
  return { doc, warnings: res.warnings };
}
