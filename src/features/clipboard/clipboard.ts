/**
 * Copy / cut / paste for canvas nodes.
 *
 * - An internal clipboard keeps the last copied payload.
 * - The system clipboard receives `text/plain` JSON tagged `{"kinema":"nodes"}`
 *   so nodes travel between projects (with referenced component masters and
 *   asset records; asset binaries are copied from the source project when
 *   possible, otherwise refs are kept and the user is warned).
 * - Pasting plain text creates a text node, SVG markup an svg node, HTML markup
 *   goes through the HTML importer, image files through the asset importer.
 */
import { toast } from 'sonner';
import type { KAsset, KComponent, KDocument, KNode, NodeId } from '@/core/model/types';
import { docApi } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { currentRootId, deleteSelection } from '@/core/store/actions';
import { createNode } from '@/core/model/factory';
import { cloneSubtree, collectAssetRefs, collectComponentRefs, extractSubtree, getSubtreeIds, insertSubtree, pruneDescendants, sortByTreeOrder } from '@/core/model/tree';
import { parsePx, resolveStyles } from '@/core/style/style';
import { importHtmlAsSubtree } from '@/core/io/htmlImport';
import { ensureAssetUrl } from '@/core/assets/assetStore';
import { platform, type PickedFile } from '@/platform';
import { importAndInsertFiles } from '@/features/assets/importer';
import { registerCommands } from '@/features/shortcuts/shortcuts';
import { sanitizeSvg, textToRich } from '@/features/canvas/sanitize';
import { elementFor, paddingOrigin, viewportEl, worldRectOf, screenToWorld } from '@/features/canvas/measure';
import { containerInfo, flowDrop } from '@/features/canvas/hitTest';
import { placeAbsolute, stripPosition, writeStyle } from '@/features/canvas/styleWrite';
import { isDropContainer } from '@/features/canvas/hitTest';

export interface ClipboardPayload {
  kinema: 'nodes';
  version: 1;
  /** source project id (asset binaries are read from there) */
  project: string | null;
  roots: NodeId[];
  /** original parent of each root (paste-next-to-original offsets) */
  parents: Record<NodeId, NodeId | null>;
  nodes: Record<NodeId, KNode>;
  components: Record<string, { component: KComponent; nodes: Record<NodeId, KNode> }>;
  assets: Record<string, KAsset>;
}

let internal: ClipboardPayload | null = null;

export function getInternalClipboard() {
  return internal;
}

// ─── Copy ───────────────────────────────────────────────────────────────────

/** Build a self-contained payload for nodes (roots + subtrees + referenced masters & assets). */
export function buildPayload(doc: KDocument, ids: NodeId[], projectId: string | null): ClipboardPayload | null {
  const pageRoots = new Set([...doc.pages.map((p) => p.rootId), ...Object.values(doc.components).map((c) => c.rootId)]);
  // copying the page frame copies its content
  const expanded = ids.flatMap((id) => (pageRoots.has(id) ? doc.nodes[id]?.children ?? [] : [id]));
  const roots = sortByTreeOrder(doc.nodes, pruneDescendants(doc.nodes, expanded)).filter((id) => doc.nodes[id]);
  if (!roots.length) return null;
  const nodes: Record<NodeId, KNode> = {};
  const parents: Record<NodeId, NodeId | null> = {};
  for (const r of roots) {
    Object.assign(nodes, extractSubtree(doc.nodes, r).nodes);
    parents[r] = doc.nodes[r].parent;
  }
  // component masters, recursively
  const components: ClipboardPayload['components'] = {};
  const queue = roots.flatMap((r) => [...collectComponentRefs(doc.nodes, r)]);
  while (queue.length) {
    const cid = queue.shift()!;
    if (components[cid]) continue;
    const comp = doc.components[cid];
    if (!comp) continue;
    components[cid] = { component: structuredClone(comp), nodes: extractSubtree(doc.nodes, comp.rootId).nodes };
    queue.push(...collectComponentRefs(doc.nodes, comp.rootId));
  }
  const assetIds = new Set<string>();
  for (const r of roots) collectAssetRefs(doc.nodes, r).forEach((a) => assetIds.add(a));
  for (const c of Object.values(components)) collectAssetRefs(c.nodes, c.component.rootId).forEach((a) => assetIds.add(a));
  const assets: Record<string, KAsset> = {};
  for (const a of assetIds) if (doc.assets[a]) assets[a] = structuredClone(doc.assets[a]);
  return { kinema: 'nodes', version: 1, project: projectId, roots, parents, nodes, components, assets };
}

export function parsePayload(text: string): ClipboardPayload | null {
  const t = text.trim();
  if (!t.startsWith('{') || !t.includes('"kinema"')) return null;
  try {
    const p = JSON.parse(t) as ClipboardPayload;
    if (p?.kinema !== 'nodes' || !Array.isArray(p.roots) || !p.nodes) return null;
    p.components ??= {};
    p.assets ??= {};
    p.parents ??= {};
    return p;
  } catch {
    return null;
  }
}

let pendingCopy: string | null = null;

function writeSystem(json: string) {
  // execCommand('copy') fires a synchronous copy event we fill in; works inside user gestures.
  pendingCopy = json;
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  if (pendingCopy !== null) {
    pendingCopy = null;
    ok = false;
  }
  if (!ok) void navigator.clipboard?.writeText(json).catch(() => {});
}

export function copySelection(): boolean {
  const payload = buildPayload(docApi.doc, uiApi.state.selection, uiApi.state.projectId);
  if (!payload) return false;
  internal = payload;
  writeSystem(JSON.stringify(payload));
  return true;
}

export function cutSelection() {
  if (copySelection()) deleteSelection();
}

// ─── Paste target & placement ───────────────────────────────────────────────

interface PasteTarget {
  parentId: NodeId;
  index?: number;
  /** pasting next to the originals (same parent) → offset copies */
  besideOriginal: boolean;
}

function pasteTarget(payload: ClipboardPayload | null): PasteTarget | null {
  const doc = docApi.doc;
  const root = currentRootId();
  if (!root) return null;
  const sel = uiApi.state.selection.filter((id) => doc.nodes[id]);
  const copied = new Set(payload?.roots ?? []);
  if (sel.length === 1) {
    const n = doc.nodes[sel[0]];
    if (isDropContainer(n) && !copied.has(n.id)) return { parentId: n.id, besideOriginal: false };
    if (n.parent) {
      const p = doc.nodes[n.parent];
      return { parentId: n.parent, index: p.children.indexOf(n.id) + 1, besideOriginal: !!payload?.roots.some((r) => payload.parents[r] === n.parent) };
    }
  }
  if (sel.length > 1) {
    const last = sortByTreeOrder(doc.nodes, sel).pop()!;
    const n = doc.nodes[last];
    if (n.parent) {
      return { parentId: n.parent, index: doc.nodes[n.parent].children.indexOf(last) + 1, besideOriginal: !!payload?.roots.some((r) => payload.parents[r] === n.parent) };
    }
  }
  return { parentId: root, besideOriginal: !!payload?.roots.some((r) => payload.parents[r] === root) };
}

/** Center of the visible part of a container, in the container's padding-box coords. */
function visibleCenter(parentId: NodeId): { x: number; y: number } {
  const el = elementFor(parentId);
  const vp = viewportEl();
  const r = el ? worldRectOf(el) : null;
  const o = el ? paddingOrigin(el) : null;
  if (!r || !o || !vp) return { x: 40, y: 40 };
  const a = screenToWorld(0, 0);
  const b = screenToWorld(vp.clientWidth, vp.clientHeight);
  const x1 = Math.max(r.x, a.x);
  const y1 = Math.max(r.y, a.y);
  const x2 = Math.min(r.x + r.w, b.x);
  const y2 = Math.min(r.y + r.h, b.y);
  const cx = x2 > x1 ? (x1 + x2) / 2 : r.x + r.w / 2;
  const cy = y2 > y1 ? (y1 + y2) / 2 : r.y + Math.min(r.h, 400) / 2;
  return { x: cx - o.x, y: cy - o.y };
}

/** Insert built subtrees at the paste target in ONE history step. */
function insertSubtrees(
  subs: { rootId: NodeId; nodes: Record<NodeId, KNode>; size?: { w: number; h: number } }[],
  label: string,
  target: PasteTarget,
  extra?: (d: KDocument) => void,
) {
  const doc = docApi.doc;
  const bp = uiApi.state.breakpoint;
  const info = containerInfo(target.parentId, { staticContent: subs.some((s) => s.nodes[s.rootId].styles.base.position !== 'absolute') });
  const flow = info?.mode === 'flow';
  const center = visibleCenter(target.parentId);
  const siblings = doc.nodes[target.parentId]?.children ?? [];
  const occupied = new Set(
    siblings.map((c) => {
      const st = resolveStyles(doc, doc.nodes[c], bp);
      return `${parsePx(st.left)}:${parsePx(st.top)}`;
    }),
  );
  const containerStatic = info ? getComputedStyle(info.el).position === 'static' : false;
  let index = target.index;
  if (flow && index == null && info) index = flowDrop(info, { x: Infinity, y: Infinity }, new Set()).index;

  for (const s of subs) {
    const root = s.nodes[s.rootId];
    const st = root.styles.base;
    if (flow) {
      if (st.position === 'absolute' || st.position === 'fixed') stripPosition(root);
      continue;
    }
    if (st.position === 'absolute' || st.position === 'fixed') {
      let l = parsePx(resolveStyles(doc, root, bp).left) ?? 0;
      let t = parsePx(resolveStyles(doc, root, bp).top) ?? 0;
      if (target.besideOriginal) {
        let guard = 0;
        while (occupied.has(`${l}:${t}`) && guard++ < 50) {
          l += 16;
          t += 16;
        }
      }
      occupied.add(`${l}:${t}`);
      placeAbsolute(root, bp, l, t);
    } else {
      const w = s.size?.w ?? parsePx(st.width) ?? 200;
      const h = s.size?.h ?? parsePx(st.height) ?? 60;
      placeAbsolute(root, bp, center.x - w / 2, center.y - h / 2);
    }
  }
  docApi.mutate(label, (d) => {
    extra?.(d as KDocument);
    let at = index;
    for (const s of subs) {
      insertSubtree(d as KDocument, s, target.parentId, at);
      if (at != null) at += 1;
    }
    if (!flow && containerStatic) writeStyle(d.nodes[target.parentId], 'base', 'position', 'relative');
  });
  uiApi.state.select(subs.map((s) => s.rootId));
}

// ─── Paste payloads ─────────────────────────────────────────────────────────

/** Copy missing asset binaries from the source project; returns records to register + missing count. */
async function resolveAssets(payload: ClipboardPayload): Promise<{ add: KAsset[]; missing: number }> {
  const doc = docApi.doc;
  const projectId = uiApi.state.projectId;
  const add: KAsset[] = [];
  let missing = 0;
  for (const a of Object.values(payload.assets)) {
    if (doc.assets[a.id]) continue;
    if (!projectId || !payload.project || payload.project === projectId) {
      missing++;
      continue;
    }
    try {
      const data = await platform.assets.read(payload.project, a.path);
      const fileName = a.path.split('/').pop() || a.name;
      const path = await platform.assets.write(projectId, fileName, data, a.mime);
      add.push({ ...a, path });
    } catch {
      missing++;
    }
  }
  return { add, missing };
}

export async function pastePayload(payload: ClipboardPayload) {
  const target = pasteTarget(payload);
  if (!target) return;
  const doc = docApi.doc;
  const { add, missing } = await resolveAssets(payload);

  // components the target doc doesn't have yet (keep ids so instances resolve)
  const compAdds: { comp: KComponent; nodes: Record<NodeId, KNode> }[] = [];
  for (const [cid, c] of Object.entries(payload.components)) {
    if (doc.components[cid]) continue;
    const collide = Object.keys(c.nodes).some((id) => doc.nodes[id]);
    if (collide) {
      const clone = cloneSubtree(c.nodes, c.component.rootId);
      compAdds.push({ comp: { ...c.component, rootId: clone.rootId }, nodes: clone.nodes });
    } else compAdds.push({ comp: c.component, nodes: c.nodes });
  }

  const subs = payload.roots.filter((r) => payload.nodes[r]).map((r) => cloneSubtree(payload.nodes, r));
  insertSubtrees(subs, subs.length > 1 ? `Paste ${subs.length} layers` : 'Paste', target, (d) => {
    for (const a of add) d.assets[a.id] = a;
    for (const c of compAdds) {
      for (const n of Object.values(c.nodes)) d.nodes[n.id] = n;
      d.nodes[c.comp.rootId].parent = null;
      d.components[c.comp.id] = c.comp;
    }
  });
  const projectId = uiApi.state.projectId;
  if (projectId) for (const a of add) void ensureAssetUrl(projectId, a).catch(() => {});
  if (missing) toast.warning(`${missing} asset${missing > 1 ? 's are' : ' is'} missing in this project`, { description: 'References were kept; re-import the files to display them.' });
}

function looksLikeSvg(t: string) {
  return /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(t) && /<\/svg>\s*$/i.test(t);
}

function looksLikeHtml(t: string) {
  const s = t.trim();
  return s.startsWith('<') && /<\/?[a-z][\w-]*[\s>/]/i.test(s) && /<\/[a-z][\w-]*>\s*$|\/>\s*$/i.test(s);
}

function svgSize(svg: string): { w: number; h: number } {
  try {
    const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    let w = parseFloat(el.getAttribute('width') ?? '');
    let h = parseFloat(el.getAttribute('height') ?? '');
    const vb = (el.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    if ((!w || !h) && vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      if (!w && !h) {
        w = vb[2];
        h = vb[3];
      } else if (!w) w = (h * vb[2]) / vb[3];
      else h = (w * vb[3]) / vb[2];
    }
    if (!w || !h) return { w: 96, h: 96 };
    const k = Math.min(1, 480 / Math.max(w, h));
    return { w: Math.round(w * k), h: Math.round(h * k) };
  } catch {
    return { w: 96, h: 96 };
  }
}

export function pasteText(text: string) {
  const target = pasteTarget(null);
  if (!target) return;
  const node = createNode('text', { props: { text: textToRich(text) } });
  node.name = text.replace(/\s+/g, ' ').trim().slice(0, 32) || 'Text';
  if (text.length > 60) node.styles.base.width = '480px';
  insertSubtrees([{ rootId: node.id, nodes: { [node.id]: node }, size: { w: text.length > 60 ? 480 : Math.min(480, text.length * 9), h: 27 } }], 'Paste text', target);
}

export function pasteSvg(markup: string) {
  const target = pasteTarget(null);
  if (!target) return;
  const svg = sanitizeSvg(markup.trim());
  if (!svg) return;
  const size = svgSize(svg);
  const node = createNode('svg', { props: { svg }, styles: { width: `${size.w}px`, height: `${size.h}px` } });
  insertSubtrees([{ rootId: node.id, nodes: { [node.id]: node }, size }], 'Paste SVG', target);
}

export function pasteHtml(markup: string): boolean {
  const target = pasteTarget(null);
  if (!target) return false;
  const res = importHtmlAsSubtree(markup, { breakpoints: docApi.doc.breakpoints, wrapperName: 'Pasted HTML' });
  if (!res) return false;
  insertSubtrees([{ rootId: res.rootId, nodes: res.nodes }], 'Paste HTML', target);
  return true;
}

export async function pasteFiles(files: PickedFile[]) {
  const target = pasteTarget(null);
  if (!target || !files.length) return;
  const c = visibleCenter(target.parentId);
  const el = elementFor(target.parentId);
  // importer expects border-box coords
  const point = el ? { x: c.x + el.clientLeft, y: c.y + el.clientTop } : c;
  await importAndInsertFiles(files, target.parentId, point);
}

/** Dispatch clipboard contents to the right paste handler. */
export async function handlePaste(data: { text?: string; html?: string; files?: PickedFile[] }) {
  if (uiApi.state.route !== 'editor') return;
  const files = (data.files ?? []).filter((f) => /^(image|video)\//.test(f.mime) || /\.(svg|png|jpe?g|gif|webp|avif|mp4|webm)$/i.test(f.name));
  if (files.length) return pasteFiles(files);
  const text = data.text ?? '';
  const payload = text ? parsePayload(text) : null;
  if (payload) return pastePayload(payload);
  if (text.trim()) {
    if (looksLikeSvg(text)) return pasteSvg(text);
    if (looksLikeHtml(text) && pasteHtml(text)) return;
    return pasteText(text);
  }
  if (data.html && pasteHtml(data.html)) return;
  if (internal) return pastePayload(internal);
}

async function fileFromBlob(blob: Blob, name: string): Promise<PickedFile> {
  return { name, mime: blob.type, data: new Uint8Array(await blob.arrayBuffer()) };
}

/** Paste triggered from a menu / palette (no native paste event available). */
export async function pasteFromSystem() {
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      const files: PickedFile[] = [];
      let text = '';
      let html = '';
      for (const it of items) {
        for (const type of it.types) {
          if (type.startsWith('image/')) files.push(await fileFromBlob(await it.getType(type), `pasted.${type.split('/')[1].replace('svg+xml', 'svg')}`));
          else if (type === 'text/plain' && !text) text = await (await it.getType(type)).text();
          else if (type === 'text/html' && !html) html = await (await it.getType(type)).text();
        }
      }
      return handlePaste({ text, html, files });
    }
    const text = await navigator.clipboard.readText();
    return handlePaste({ text });
  } catch {
    if (internal) return pastePayload(internal);
    toast.error('Clipboard access was denied', { description: 'Use Ctrl/⌘+V to paste from the system clipboard.' });
  }
}

// ─── Installer ──────────────────────────────────────────────────────────────

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

const inEditor = () => uiApi.state.route === 'editor' && !uiApi.state.editingTextId;
let nativePaste = false;

export function installClipboard(): () => void {
  const onCopy = (e: ClipboardEvent) => {
    if (pendingCopy === null) return;
    e.clipboardData?.setData('text/plain', pendingCopy);
    pendingCopy = null;
    e.preventDefault();
  };
  const onPaste = (e: ClipboardEvent) => {
    if (!inEditor() || isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
    // ignore pastes while a dialog/popover has focus
    if ((document.activeElement as HTMLElement | null)?.closest?.('[role="dialog"]')) return;
    e.preventDefault();
    const dt = e.clipboardData;
    if (!dt) return;
    const files: Promise<PickedFile>[] = [];
    for (const f of Array.from(dt.files)) files.push(fileFromBlob(f, f.name || 'pasted'));
    const text = dt.getData('text/plain');
    const html = dt.getData('text/html');
    void Promise.all(files).then((fs) => handlePaste({ text, html, files: fs }));
  };
  // Let Mod+V reach the browser so the native paste event (with files/html) fires.
  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.code === 'KeyV' && inEditor() && !isTypingTarget(e.target)) {
      nativePaste = true;
      setTimeout(() => (nativePaste = false), 0);
    }
  };
  document.addEventListener('copy', onCopy);
  document.addEventListener('paste', onPaste);
  window.addEventListener('keydown', onKey, true);
  const unregister = registerCommands([
    { id: 'edit.copy', title: 'Copy', group: 'Edit', shortcut: 'Mod+C', when: () => inEditor() && uiApi.state.selection.length > 0, run: () => void copySelection() },
    { id: 'edit.cut', title: 'Cut', group: 'Edit', shortcut: 'Mod+X', when: () => inEditor() && uiApi.state.selection.length > 0, run: cutSelection },
    { id: 'edit.paste', title: 'Paste', group: 'Edit', shortcut: 'Mod+V', when: () => inEditor() && !nativePaste, run: () => void pasteFromSystem() },
  ]);
  return () => {
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('paste', onPaste);
    window.removeEventListener('keydown', onKey, true);
    unregister();
  };
}

export { getSubtreeIds };
