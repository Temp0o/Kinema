/**
 * Choreography: animate a whole section in one go. Walks the section in reading
 * order, gives each meaningful element a role (heading, text, button, media,
 * card, …) and a role-appropriate entrance preset, and spaces them out in time so
 * the section builds up as a sequence instead of everything moving at once.
 *
 * Pure planning lives here (testable); applying is in features/animation.
 */
import type { KDocument, KNode, NodeId } from '@/core/model/types';
import { CONTAINER_TYPES } from '@/core/model/factory';

export type ChoreoRole = 'nav' | 'heading' | 'text' | 'button' | 'media' | 'icon' | 'card' | 'field';

export interface Choreography {
  id: string;
  name: string;
  description: string;
  /** preset id per role */
  roles: Record<ChoreoRole, string>;
  /** ms between consecutive beats */
  step: number;
  /** cap for the last beat's delay so long sections don't drag */
  maxDelay: number;
}

export const CHOREOGRAPHIES: Choreography[] = [
  {
    id: 'cascade',
    name: 'Cascade',
    description: 'Headings reveal, copy fades up, buttons pop — a clean top-to-bottom build.',
    roles: { nav: 'fade-down', heading: 'reveal-up', text: 'fade-up', button: 'pop', media: 'zoom-in', icon: 'pop', card: 'fade-up', field: 'fade-up' },
    step: 90,
    maxDelay: 1100,
  },
  {
    id: 'soft-focus',
    name: 'Soft focus',
    description: 'Everything drifts into focus from a blur — calm and premium.',
    roles: { nav: 'fade-in', heading: 'focus-in', text: 'blur-in', button: 'fade-in', media: 'blur-in', icon: 'fade-in', card: 'blur-in', field: 'fade-in' },
    step: 120,
    maxDelay: 1300,
  },
  {
    id: 'bold',
    name: 'Bold',
    description: 'Punchy, springy entrances with a quick rhythm.',
    roles: { nav: 'drop-in', heading: 'stretch-in', text: 'fade-up', button: 'slide-up-bounce', media: 'rise-tilt', icon: 'pop', card: 'rise-tilt', field: 'fade-up' },
    step: 70,
    maxDelay: 900,
  },
  {
    id: 'sweep',
    name: 'Sweep',
    description: 'Content sweeps in from the left like a reading line.',
    roles: { nav: 'fade-down', heading: 'reveal-right', text: 'fade-left', button: 'fade-left', media: 'reveal-right', icon: 'fade-left', card: 'fade-left', field: 'fade-left' },
    step: 85,
    maxDelay: 1000,
  },
];

export function getChoreography(id: string) {
  return CHOREOGRAPHIES.find((c) => c.id === id);
}

export interface ChoreoBeat {
  nodeId: NodeId;
  role: ChoreoRole;
  presetId: string;
  delay: number;
}

/** per timeline (section) */
const MAX_BEATS = 40;

function isHeading(n: KNode) {
  return n.type === 'text' && /^h[1-4]$/.test(n.tag ?? '');
}

function hasVisibleChildren(doc: KDocument, n: KNode) {
  return n.children.some((c) => doc.nodes[c] && !doc.nodes[c].hidden);
}

const CARD_MAX_NODES = 14;

function subtreeSize(doc: KDocument, id: NodeId, cap: number): number {
  let count = 0;
  const stack = [id];
  while (stack.length && count <= cap) {
    const n = doc.nodes[stack.pop()!];
    if (!n) continue;
    count++;
    stack.push(...n.children);
  }
  return count;
}

/** A repeated container (one of several sibling containers) holding text — a card / list item. */
function isCard(doc: KDocument, n: KNode) {
  if (n.type !== 'box' || !n.parent || !hasVisibleChildren(doc, n)) return false;
  const parent = doc.nodes[n.parent];
  if (!parent || parent.type === 'frame') return false; // page sections are walked, not animated as blocks
  if (['section', 'main', 'footer', 'header', 'nav'].includes(n.tag ?? '')) return false;
  // big layout regions (sidebar, main column, a whole form) are walked into, not moved as one block
  if (subtreeSize(doc, n.id, CARD_MAX_NODES + 1) > CARD_MAX_NODES) return false;
  const siblings = parent.children.map((c) => doc.nodes[c]).filter((s) => s && !s.hidden && (s.type === 'box' || s.type === 'instance'));
  if (siblings.length < 2) return false;
  // the section's own direct layout rows are not cards; cards sit side by side or in a list
  const textish = (id: NodeId): boolean => {
    const c = doc.nodes[id];
    return !!c && (c.type === 'text' || c.type === 'button' || c.type === 'link' || c.children.some(textish));
  };
  return n.children.some(textish);
}

function roleOf(doc: KDocument, n: KNode): ChoreoRole | 'descend' | null {
  if (n.hidden) return null;
  const tag = n.tag ?? '';
  if (tag === 'nav' || tag === 'header') return 'nav';
  switch (n.type) {
    case 'text':
      return isHeading(n) ? 'heading' : 'text';
    case 'button':
      return 'button';
    case 'link':
      return 'button';
    case 'image':
    case 'video':
      return 'media';
    case 'svg':
      return 'icon';
    case 'input':
    case 'textarea':
    case 'select':
      return 'field';
    case 'instance':
      return 'card';
    default:
      if (CONTAINER_TYPES.has(n.type)) {
        if (isCard(doc, n)) return 'card';
        // an empty box is a visual shape (badge, divider, decoration): animate it like a card
        return hasVisibleChildren(doc, n) ? 'descend' : n.type === 'box' ? 'card' : null;
      }
      return null;
  }
}

function isSameCardGroup(doc: KDocument, a: { id: NodeId; role: ChoreoRole }, b: { id: NodeId; role: ChoreoRole }) {
  return a.role === 'card' && b.role === 'card' && doc.nodes[a.id]?.parent === doc.nodes[b.id]?.parent;
}

/**
 * Plan the beats for a section (or several selected layers). Roots that are leaf
 * elements are animated themselves; containers are walked. A page frame is split
 * into its sections, each with its own timeline (they play as they scroll in).
 */
export function planChoreography(doc: KDocument, rootIds: NodeId[], choreo: Choreography): ChoreoBeat[] {
  const collect = (id: NodeId, isRoot: boolean, out: { id: NodeId; role: ChoreoRole }[]) => {
    if (out.length >= MAX_BEATS) return;
    const n = doc.nodes[id];
    if (!n) return;
    let role = roleOf(doc, n);
    // a selected card / nav is walked into rather than animated as one block
    if (isRoot && (role === 'card' || role === 'nav') && n.type !== 'instance' && hasVisibleChildren(doc, n)) role = 'descend';
    if (role === null) return;
    if (role === 'descend') {
      for (const c of n.children) collect(c, false, out);
      return;
    }
    out.push({ id, role });
  };

  // segments = independent timelines
  const segments: { id: NodeId; role: ChoreoRole }[][] = [];
  let loose: { id: NodeId; role: ChoreoRole }[] = [];
  for (const rid of rootIds) {
    const n = doc.nodes[rid];
    if (n?.type === 'frame') {
      for (const c of n.children) {
        const cn = doc.nodes[c];
        if (cn && roleOf(doc, cn) === 'descend') {
          const seg: { id: NodeId; role: ChoreoRole }[] = [];
          collect(c, true, seg);
          if (seg.length) segments.push(seg);
        } else collect(c, false, loose);
      }
    } else collect(rid, true, loose);
  }
  if (loose.length) segments.unshift(loose);

  const beats: ChoreoBeat[] = [];
  for (const units of segments) {
    // Long sequences tighten their rhythm so the last beat still lands within maxDelay.
    const gaps = units.reduce((g, u, i) => g + (i && isSameCardGroup(doc, u, units[i - 1]) ? 0.8 : i ? 1 : 0), 0);
    const step = gaps ? Math.min(choreo.step, choreo.maxDelay / gaps) : choreo.step;
    let t = 0;
    units.forEach((u, i) => {
      // consecutive cards in the same parent share a quicker stagger, so a grid feels like one gesture
      if (i > 0) t += isSameCardGroup(doc, u, units[i - 1]) ? step * 0.8 : step;
      beats.push({ nodeId: u.id, role: u.role, presetId: choreo.roles[u.role], delay: Math.round(Math.min(t, choreo.maxDelay)) });
    });
  }
  return beats;
}
