/**
 * Compact HTML + CSS serializer for AI edits. Every element carries
 * `data-kid="<nodeId>"` so the model's reply can be re-imported with
 * `importHtml(…, { keepIds: true })`, preserving node identity (and therefore
 * animations, names, lock state). Styles become one class rule per node plus
 * breakpoint `@media` blocks and `:hover/:focus/:active` state rules.
 *
 * Long payloads (data-URL images, big SVGs, component instances) are replaced
 * with short placeholders and restored after import (see `restoreElided`).
 */
import type { KDocument, KNode, NodeId, StyleMap } from '../model/types';
import { DEFAULT_TAGS } from '../model/factory';
import { getSubtreeIds } from '../model/tree';

export interface SerializeOptions {
  /** Serialize a page/component root frame as `body {}` + its children (edit the whole page). */
  rootAsBody?: boolean;
  /** Inline SVG markup longer than this is elided (default 2400 chars). */
  maxSvgChars?: number;
}

export interface SerializedSubtree {
  /** `<style>…</style>` + markup */
  html: string;
  css: string;
  markup: string;
  /** every node id present in the output */
  ids: NodeId[];
  /** placeholder token → original long value (data URLs) */
  srcMap: Record<string, string>;
}

const VOID = new Set(['img', 'input', 'br', 'hr']);

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');
  return !s ? 'el' : /^\d/.test(s) ? `k-${s}` : s;
}

function decls(map: StyleMap): string {
  return Object.entries(map)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

export function serializeNodes(doc: KDocument, rootIds: NodeId[], opts: SerializeOptions = {}): SerializedSubtree {
  const maxSvg = opts.maxSvgChars ?? 2400;
  const srcMap: Record<string, string> = {};
  let tok = 0;
  const shorten = (v: string): string =>
    v.replace(/data:[a-z0-9+./-]+;base64,[a-z0-9+/=]{120,}/gi, (m) => {
      const key = `kimg-${++tok}`;
      srcMap[key] = m;
      return key;
    });

  const used = new Map<string, number>();
  const classOf = new Map<NodeId, string>();
  const ids: NodeId[] = [];
  const cssBase: string[] = [];
  const cssStates: string[] = [];
  const cssBp = new Map<string, string[]>();

  const hasStyles = (n: KNode) => Object.values(n.styles).some((m) => m && Object.keys(m).length) || (n.states && Object.keys(n.states).length);

  const assignClass = (n: KNode): string | null => {
    if (!hasStyles(n)) return null;
    const base = slugify(n.name || n.type);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    const cls = count === 1 ? base : `${base}-${count}`;
    classOf.set(n.id, cls);
    return cls;
  };

  const emitCss = (sel: string, n: KNode) => {
    const base = n.styles.base ?? {};
    if (Object.keys(base).length) cssBase.push(`${sel}{${shorten(decls(base))}}`);
    for (const st of ['hover', 'focus', 'active'] as const) {
      const m = n.states?.[st];
      if (m && Object.keys(m).length) cssStates.push(`${sel}:${st}{${shorten(decls(m))}}`);
    }
    for (const bp of doc.breakpoints) {
      if (bp.id === 'base' || bp.maxWidth == null) continue;
      const m = n.styles[bp.id];
      if (m && Object.keys(m).length) {
        const list = cssBp.get(bp.id) ?? [];
        list.push(`${sel}{${shorten(decls(m))}}`);
        cssBp.set(bp.id, list);
      }
    }
  };

  const render = (id: NodeId, depth: number): string => {
    const n = doc.nodes[id];
    if (!n) return '';
    ids.push(id);
    const pad = '  '.repeat(depth);
    const cls = assignClass(n);
    if (cls) emitCss(`.${cls}`, n);
    const attrs: string[] = [`data-kid="${n.id}"`];
    if (cls) attrs.push(`class="${cls}"`);
    for (const [k, v] of Object.entries(n.props.attrs ?? {})) if (!/^on/i.test(k) && k !== 'class' && k !== 'style') attrs.push(`${k}="${esc(v)}"`);

    if (n.type === 'instance') {
      attrs.push(`data-kinstance="${esc(doc.components[n.props.componentId ?? '']?.name ?? 'component')}"`);
      return `${pad}<div ${attrs.join(' ')}></div>`;
    }
    if (n.type === 'svg') {
      const svg = (n.props.svg ?? '').trim();
      const head = attrs.join(' ');
      if (!svg || svg.length > maxSvg) {
        const vb = /viewBox="([^"]+)"/.exec(svg)?.[1] ?? '0 0 24 24';
        return `${pad}<svg ${head} data-ksvg="keep" viewBox="${vb}"></svg>`;
      }
      return pad + svg.replace(/^<svg\b/i, `<svg ${head}`);
    }

    const tag = n.tag || DEFAULT_TAGS[n.type];
    switch (n.type) {
      case 'link':
        attrs.push(`href="${esc(n.props.href ?? '#')}"`);
        if (n.props.target === '_blank') attrs.push('target="_blank"');
        break;
      case 'image':
        attrs.push(`src="${esc(shorten(n.props.src ?? ''))}"`, `alt="${esc(n.props.alt ?? '')}"`);
        break;
      case 'video':
        attrs.push(`src="${esc(shorten(n.props.src ?? ''))}"`);
        for (const f of ['autoplay', 'loop', 'muted', 'controls'] as const) if (n.props[f]) attrs.push(f);
        break;
      case 'input':
        attrs.push(`type="${esc(n.props.inputType ?? 'text')}"`);
        if (n.props.placeholder) attrs.push(`placeholder="${esc(n.props.placeholder)}"`);
        if (n.props.value) attrs.push(`value="${esc(n.props.value)}"`);
        if (n.props.checked) attrs.push('checked');
        break;
      case 'textarea':
        if (n.props.placeholder) attrs.push(`placeholder="${esc(n.props.placeholder)}"`);
        break;
      case 'button':
        attrs.push('type="button"');
        break;
    }
    const open = `<${tag} ${attrs.join(' ')}>`;
    if (VOID.has(tag)) return pad + open;
    if (n.type === 'textarea') return `${pad}${open}${escText(n.props.value ?? '')}</${tag}>`;
    if (n.type === 'select') {
      const opts = (n.props.options ?? []).map((o) => `<option>${escText(o)}</option>`).join('');
      return `${pad}${open}${opts}</${tag}>`;
    }
    if (!n.children.length) {
      const text = n.type === 'text' || n.type === 'button' || n.type === 'link' ? (n.props.text ?? '') : '';
      return `${pad}${open}${text}</${tag}>`;
    }
    const kids = n.children.map((c) => render(c, depth + 1)).filter(Boolean);
    return `${pad}${open}\n${kids.join('\n')}\n${pad}</${tag}>`;
  };

  let markup: string;
  if (opts.rootAsBody && rootIds.length === 1) {
    const root = doc.nodes[rootIds[0]];
    ids.push(root.id);
    emitCss('body', root);
    markup = root.children.map((c) => render(c, 0)).join('\n');
  } else {
    markup = rootIds.map((id) => render(id, 0)).join('\n');
  }

  const cssParts = [...cssBase, ...cssStates];
  for (const bp of doc.breakpoints) {
    const list = cssBp.get(bp.id);
    if (list?.length && bp.maxWidth != null) cssParts.push(`@media (max-width:${bp.maxWidth}px){\n${list.join('\n')}\n}`);
  }
  const css = cssParts.join('\n');
  return { html: `<style>\n${css}\n</style>\n${markup}`, css, markup, ids, srcMap };
}

/** Restore placeholders (data URLs) in imported nodes. Mutates the nodes. */
export function restoreSrcMap(nodes: Record<NodeId, KNode>, srcMap: Record<string, string>): void {
  const keys = Object.keys(srcMap);
  if (!keys.length) return;
  const re = new RegExp(keys.map((k) => k.replace(/[-]/g, '\\-')).join('|'), 'g');
  const fix = (v: string) => v.replace(re, (m) => srcMap[m] ?? m);
  for (const n of Object.values(nodes)) {
    if (n.props.src) n.props.src = fix(n.props.src);
    for (const map of [...Object.values(n.styles), ...Object.values(n.states ?? {})]) {
      if (!map) continue;
      for (const k of Object.keys(map)) if (map[k].includes('kimg-')) map[k] = fix(map[k]);
    }
  }
}

/** Remove editor bookkeeping attributes from an imported svg's root tag. */
export function cleanSvgRoot(svg: string): string {
  return svg.replace(/^<svg\b[^>]*>/i, (tag) => tag.replace(/\s(data-kid|data-ksvg|class)="[^"]*"/g, ''));
}

// ─── Outline (animation targets / structure summaries) ───────────────────────

export interface OutlineOptions {
  maxLines?: number;
  maxDepth?: number;
  /** include data-kid ids at the start of each line */
  withIds?: boolean;
}

function textSnippet(n: KNode, max = 36): string {
  const t = (n.props.text ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return ` "${t.length > max ? t.slice(0, max - 1) + '…' : t}"`;
}

function layoutHint(n: KNode): string {
  const s = n.styles.base ?? {};
  const d = s.display ?? '';
  if (d.includes('grid')) {
    const cols = (s['grid-template-columns'] ?? '').match(/repeat\((\d+)/)?.[1] ?? (s['grid-template-columns'] ? s['grid-template-columns'].split(/\s+/).length : '');
    return cols ? `grid ${cols} cols` : 'grid';
  }
  if (d.includes('flex')) return (s['flex-direction'] ?? 'row').startsWith('column') ? 'flex column' : 'flex row';
  if (s.position === 'absolute') return 'absolute';
  return '';
}

/** Compact indented outline of subtrees, e.g. `n_ab12 section "Hero" [flex column] (3)`. */
export function describeOutline(doc: KDocument, rootIds: NodeId[], opts: OutlineOptions = {}): { text: string; lines: number; truncated: boolean } {
  const maxLines = opts.maxLines ?? 60;
  const maxDepth = opts.maxDepth ?? 6;
  const lines: string[] = [];
  let truncated = false;
  const walk = (id: NodeId, depth: number) => {
    const n = doc.nodes[id];
    if (!n || n.hidden) return;
    if (lines.length >= maxLines) {
      truncated = true;
      return;
    }
    const tag = n.type === 'svg' ? 'svg' : n.type === 'instance' ? 'component' : n.tag || DEFAULT_TAGS[n.type];
    const hint = layoutHint(n);
    const kids = n.children.length;
    const parts = [
      '  '.repeat(depth),
      opts.withIds ? `${n.id} ` : '',
      tag,
      n.name && n.name.toLowerCase() !== tag ? ` “${n.name}”` : '',
      textSnippet(n),
      hint ? ` [${hint}]` : '',
      kids ? ` (${kids} ${kids === 1 ? 'child' : 'children'})` : '',
    ];
    lines.push(parts.join(''));
    if (depth + 1 >= maxDepth) {
      if (kids) truncated = true;
      return;
    }
    for (const c of n.children) walk(c, depth + 1);
  };
  for (const r of rootIds) walk(r, 0);
  return { text: lines.join('\n'), lines: lines.length, truncated };
}

/** All visible ids (pre-order) under the given roots, capped. */
export function outlineIds(doc: KDocument, rootIds: NodeId[], cap = 80): NodeId[] {
  const out: NodeId[] = [];
  for (const r of rootIds) for (const id of getSubtreeIds(doc.nodes, r)) if (out.length < cap && !doc.nodes[id]?.hidden) out.push(id);
  return out;
}
