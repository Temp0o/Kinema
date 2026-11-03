/**
 * Edit scope for the Design panel: which nodes are edited, at which breakpoint and
 * in which interaction state, plus read/write helpers that route through the
 * shared actions (`setStyles`, `setStateStyle`, `resetBreakpointOverrides`).
 *
 * - Reads use `resolveStyles` (and overlay `node.states[state]` in state mode).
 * - Writes at non-base breakpoints drop values equal to the inherited one, so the
 *   override indicators stay meaningful.
 * - Drags (`final: false`) are grouped into one history step via a transaction.
 */
import type { Breakpoint, BreakpointId, InteractionState, KNode, NodeId, StyleMap } from '@/core/model/types';
import { docApi, useDoc } from '@/core/store/docStore';
import { resetBreakpointOverrides, setStateStyle, setStyles } from '@/core/store/actions';
import { breakpointChain, resolveStyles, styleSource } from '@/core/style/style';
import { BG_PROPS } from './lib/background';
import { BORDER_PROPS } from './lib/box';

export type EditState = 'default' | InteractionState;
export type Patch = Record<string, string | null>;

/** Properties that interaction states can override. */
export const STATE_PROPS = new Set<string>([
  ...BG_PROPS,
  ...BORDER_PROPS,
  'border-radius',
  'color',
  'box-shadow',
  'text-shadow',
  'opacity',
  'transform',
  'scale',
  'translate',
  'filter',
  'backdrop-filter',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-color',
  'outline',
  'outline-offset',
]);

export interface Scope {
  ids: NodeId[];
  nodes: KNode[];
  bp: BreakpointId;
  isBase: boolean;
  /** non-null when editing an interaction state */
  state: InteractionState | null;
  breakpoints: Breakpoint[];
  /** resolved style at bp (without state) */
  resolved: StyleMap[];
  /** effective map: resolved + state overlay in state mode */
  maps: StyleMap[];
  parents: (KNode | undefined)[];
  parentMaps: (StyleMap | undefined)[];
}

export function effectiveMap(doc: { breakpoints: Breakpoint[] }, node: KNode, bp: BreakpointId, state: InteractionState | null): StyleMap {
  const r = resolveStyles(doc, node, bp);
  const s = state ? node.states?.[state] : undefined;
  return s ? { ...r, ...s } : r;
}

export function buildScope(nodes: KNode[], parents: (KNode | undefined)[], bp: BreakpointId, state: InteractionState | null, breakpoints: Breakpoint[]): Scope {
  const d = { breakpoints };
  const resolved = nodes.map((n) => resolveStyles(d, n, bp));
  return {
    ids: nodes.map((n) => n.id),
    nodes,
    bp,
    isBase: bp === (breakpoints[0]?.id ?? 'base'),
    state,
    breakpoints,
    resolved,
    maps: state ? nodes.map((n, i) => (n.states?.[state] ? { ...resolved[i], ...n.states[state] } : resolved[i])) : resolved,
    parents,
    parentMaps: parents.map((p) => (p ? resolveStyles(d, p, bp) : undefined)),
  };
}

// ─── Reading ────────────────────────────────────────────────────────────────

export interface PropInfo {
  value: string | undefined;
  mixed: boolean;
  /** set at the current non-base breakpoint */
  overridden: boolean;
  /** set in the edited interaction state */
  inState: boolean;
}

export function readProp(scope: Scope, prop: string): PropInfo {
  const values = scope.maps.map((m) => m[prop]);
  const st = propStatus(scope, [prop]);
  return { value: values[0], mixed: values.some((v) => v !== values[0]), ...st };
}

/** Derive a value per node and report whether they agree. */
export function readDerived<T>(scope: Scope, fn: (map: StyleMap, i: number) => T): { value: T; mixed: boolean } {
  const vals = scope.maps.map(fn);
  const k0 = JSON.stringify(vals[0]);
  return { value: vals[0], mixed: vals.some((v) => JSON.stringify(v) !== k0) };
}

export function propStatus(scope: Scope, props: string[]): { overridden: boolean; inState: boolean } {
  if (scope.state) {
    const st = scope.state;
    return { overridden: false, inState: scope.nodes.some((n) => props.some((p) => n.states?.[st]?.[p] !== undefined)) };
  }
  if (scope.isBase) return { overridden: false, inState: false };
  const d = { breakpoints: scope.breakpoints };
  return { overridden: scope.nodes.some((n) => props.some((p) => styleSource(d, n, scope.bp, p) === scope.bp)), inState: false };
}

/** Value that switches a property off: delete at base, explicit initial at overrides/states. */
export function offValue(scope: Scope, initial: string): string | null {
  return scope.isBase && !scope.state ? null : initial;
}

// ─── Writing ────────────────────────────────────────────────────────────────

export interface EditOpts {
  /** false while dragging/scrubbing; the gesture becomes one history step */
  final?: boolean;
  label?: string;
}

let gesture: { id: number; label: string } | null = null;
let gestureSeq = 0;

function beginGesture(label: string) {
  if (gesture || useDoc.getState().tx) return;
  docApi.begin(label);
  const id = ++gestureSeq;
  gesture = { id, label };
  const end = () => setTimeout(() => gesture?.id === id && endGesture(), 0);
  window.addEventListener('pointerup', end, { once: true });
  window.addEventListener('keyup', end, { once: true });
}

export function endGesture() {
  if (!gesture) return;
  const g = gesture;
  gesture = null;
  docApi.commit(g.label);
}

/** Run several mutations as one undo step (joins an open transaction). */
export function historyStep(label: string, fn: () => void) {
  const own = !useDoc.getState().tx;
  if (own) docApi.begin(label);
  try {
    fn();
  } finally {
    if (own) docApi.commit(label);
  }
}

function labelFor(keys: string[]): string {
  const k = keys.find((x) => !x.startsWith('background-') || x === 'background-color') ?? keys[0] ?? 'style';
  return `Change ${k}`;
}

function samePatch(a: Patch, b: Patch) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/**
 * Write a style patch to every node in scope. `patch` may be a function computing a
 * per-node patch from the node's current effective map.
 */
export function applyPatch(scope: Scope, patch: Patch | ((map: StyleMap, node: KNode, i: number) => Patch | null), opts: EditOpts = {}) {
  const final = opts.final !== false;
  const doc = useDoc.getState().doc;
  const nodes = scope.ids.map((id) => doc.nodes[id]).filter(Boolean);
  if (!nodes.length) return;
  const maps = nodes.map((n) => effectiveMap(doc, n, scope.bp, scope.state));
  const perNode = nodes.map((n, i) => (typeof patch === 'function' ? patch(maps[i], n, i) : patch) ?? {});
  const keys = [...new Set(perNode.flatMap((p) => Object.keys(p)))];
  if (!keys.length) return;
  const label = opts.label ?? labelFor(keys);
  if (!final) beginGesture(label);

  if (scope.state) {
    const st = scope.state;
    historyStep(label, () => {
      nodes.forEach((n, i) => {
        const base = resolveStyles(doc, n, scope.bp);
        for (const [k, v] of Object.entries(perNode[i])) {
          const cur = n.states?.[st]?.[k];
          const next = v != null && v === base[k] ? null : v;
          if ((cur ?? null) !== (next ?? null)) setStateStyle([n.id], st, k, next);
        }
      });
    });
  } else {
    const chain = breakpointChain(doc, scope.bp);
    const prevBp = chain.length > 1 ? chain[chain.length - 2] : null;
    const finalPatches = perNode.map((p, i) => {
      if (scope.isBase || !prevBp) return p;
      const inherited = resolveStyles(doc, nodes[i], prevBp);
      const out: Patch = {};
      for (const [k, v] of Object.entries(p)) out[k] = v != null && inherited[k] === v ? null : v;
      return out;
    });
    const ids = nodes.map((n) => n.id);
    if (finalPatches.every((p) => samePatch(p, finalPatches[0]))) {
      setStyles(ids, finalPatches[0], { bp: scope.bp, label, coalesceKey: `dp:${ids.join(',')}:${keys.join(',')}:${scope.bp}` });
    } else {
      historyStep(label, () => finalPatches.forEach((p, i) => setStyles([ids[i]], p, { bp: scope.bp, label })));
    }
  }
  if (final) endGesture();
}

export function setProp(scope: Scope, prop: string, value: string | null, opts?: EditOpts) {
  applyPatch(scope, { [prop]: value }, opts);
}

/** Remove the current breakpoint override / state value of props. At base: clear them. */
export function resetProps(scope: Scope, props: string[]) {
  if (scope.state) {
    const st = scope.state;
    historyStep(`Clear ${st} style`, () => {
      for (const p of props) setStateStyle(scope.ids, st, p, null);
    });
  } else if (!scope.isBase) {
    historyStep('Reset override', () => {
      for (const p of props) resetBreakpointOverrides(scope.ids, scope.bp, p);
    });
  } else {
    applyPatch(scope, Object.fromEntries(props.map((p) => [p, null])), { label: 'Clear style' });
  }
}

// ─── DOM measuring ──────────────────────────────────────────────────────────

export function nodeEl(id: NodeId): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.kc-root [data-kid="${CSS.escape(id)}"]`);
}

/** Layout box of a node relative to its parent element's padding box (unscaled px). */
export function measureInParent(id: NodeId): { x: number; y: number; w: number; h: number; pw: number; ph: number } | null {
  const el = nodeEl(id);
  if (!el) return null;
  const parent = el.parentElement;
  const cs = getComputedStyle(el);
  const ml = parseFloat(cs.marginLeft) || 0;
  const mt = parseFloat(cs.marginTop) || 0;
  let x = el.offsetLeft;
  let y = el.offsetTop;
  if (parent && el.offsetParent !== parent) {
    const scale = el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1;
    const er = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    x = (er.left - pr.left) / scale - parent.clientLeft;
    y = (er.top - pr.top) / scale - parent.clientTop;
  }
  return {
    x: Math.round(x - ml),
    y: Math.round(y - mt),
    w: el.offsetWidth,
    h: el.offsetHeight,
    pw: parent?.clientWidth ?? 0,
    ph: parent?.clientHeight ?? 0,
  };
}
