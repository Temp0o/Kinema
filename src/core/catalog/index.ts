/**
 * The component catalog: ready-made, token-aware HTML/CSS snippets that the
 * Insert panel turns into document nodes.
 */
import type { KDocument, KNode, NodeId } from '../model/types';
import { importHtmlAsSubtree } from '../io/htmlImport';
import type { CatalogCategory, CatalogCategoryId, CatalogItem } from './types';
import { BASICS } from './items/basics';
import { LAYOUT } from './items/layout';
import { NAVIGATION } from './items/navigation';
import { HERO } from './items/hero';
import { CARDS } from './items/cards';
import { FORMS } from './items/forms';
import { CONTENT } from './items/content';
import { FEEDBACK } from './items/feedback';
import { DATA } from './items/data';

export type { CatalogCategory, CatalogCategoryId, CatalogItem } from './types';

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  { id: 'basics', label: 'Basics', description: 'Text, buttons, media and form controls' },
  { id: 'layout', label: 'Layout', description: 'Stacks, grids and section containers' },
  { id: 'navigation', label: 'Navigation', description: 'Navbars, sidebars, tabs and footers' },
  { id: 'hero', label: 'Hero', description: 'Above-the-fold landing sections' },
  { id: 'cards', label: 'Cards', description: 'Feature, pricing, profile and product cards' },
  { id: 'forms', label: 'Forms', description: 'Login, sign-up, newsletter and contact forms' },
  { id: 'content', label: 'Content', description: 'Marketing sections: features, FAQ, stats, team' },
  { id: 'feedback', label: 'Feedback', description: 'Alerts, toasts, dialogs and loading states' },
  { id: 'data', label: 'Data', description: 'Tables, lists and description lists' },
];

export const CATALOG: CatalogItem[] = [...BASICS, ...LAYOUT, ...NAVIGATION, ...HERO, ...CARDS, ...FORMS, ...CONTENT, ...FEEDBACK, ...DATA];

const byId = new Map(CATALOG.map((i) => [i.id, i]));

export function getCatalogItem(id: string): CatalogItem | undefined {
  return byId.get(id);
}

export function catalogByCategory(cat: CatalogCategoryId): CatalogItem[] {
  return CATALOG.filter((i) => i.category === cat);
}

/** Convert a catalog item into a detached subtree with fresh ids (call once per insertion). */
export function buildCatalogItem(item: CatalogItem, doc: Pick<KDocument, 'breakpoints'>): { rootId: NodeId; nodes: Record<NodeId, KNode> } {
  const res = importHtmlAsSubtree(item.html, { breakpoints: doc.breakpoints, css: item.css, wrapperName: item.name });
  if (!res) throw new Error(`Catalog item "${item.id}" produced no nodes`);
  const root = res.nodes[res.rootId];
  root.name = item.name;
  return { rootId: res.rootId, nodes: res.nodes };
}

// ─── Search ──────────────────────────────────────────────────────────────────

/** Subsequence match score (0 = no match). Rewards consecutive and word-start hits. */
export function fuzzyScore(needle: string, hay: string): number {
  if (!needle) return 1;
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  const idx = h.indexOf(n);
  if (idx >= 0) return 100 - Math.min(idx, 40) + (idx === 0 || /\W/.test(h[idx - 1]) ? 30 : 0) + (h.length === n.length ? 40 : 0);
  let score = 0;
  let hi = 0;
  let streak = 0;
  for (const ch of n) {
    const found = h.indexOf(ch, hi);
    if (found < 0) return 0;
    streak = found === hi ? streak + 1 : 0;
    score += 1 + streak * 2 + (found === 0 || /\W/.test(h[found - 1]) ? 3 : 0);
    hi = found + 1;
  }
  // penalise very scattered matches
  return score > n.length * 1.5 ? Math.min(60, score) : score / 3;
}

/** Fuzzy search over name, keywords and category. Every query word must match. */
export function searchCatalog(query: string, items: CatalogItem[] = CATALOG): CatalogItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  const scored: { item: CatalogItem; score: number }[] = [];
  for (const item of items) {
    const cat = CATALOG_CATEGORIES.find((c) => c.id === item.category)?.label ?? item.category;
    let total = 0;
    let ok = true;
    for (const w of words) {
      const s = Math.max(fuzzyScore(w, item.name) * 1.5, ...item.keywords.map((k) => fuzzyScore(w, k)), fuzzyScore(w, cat) * 0.8);
      if (s < 4) {
        ok = false;
        break;
      }
      total += s;
    }
    if (ok) scored.push({ item, score: total });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}
