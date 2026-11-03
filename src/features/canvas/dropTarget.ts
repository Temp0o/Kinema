/**
 * Canvas as a drop target for the in-app DnD contract (`core/dnd.ts`) and OS
 * file drops.
 */
import type { NodeId, KDocument, KAnimation } from '@/core/model/types';
import { docApi } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { addAnimation, currentRootId } from '@/core/store/actions';
import { uid } from '@/core/model/factory';
import { deepClone, insertSubtree } from '@/core/model/tree';
import { getDragPayload, isKinemaDrag, endDrag, type DragPayload } from '@/core/dnd';
import { usePlayback } from '@/features/animation/playbackStore';
import { importAndInsertFiles } from '@/features/assets/importer';
import type { PickedFile } from '@/platform';
import { useCanvas } from './canvasStore';
import { containerAt, containerInfo, flowDrop, pathFromElement, type ContainerInfo } from './hitTest';
import { clientToWorld, paddingOrigin } from './measure';
import { placeAbsolute, stripPosition, writeStyle } from './styleWrite';
import { stripLocked } from './selectionRules';
import { parsePx } from '@/core/style/style';

/** Deepest unlocked node under the pointer (instance roots count as one node). */
function nodeAt(clientX: number, clientY: number): NodeId | null {
  const el = document.elementFromPoint(clientX, clientY);
  const path = stripLocked(docApi.doc.nodes, pathFromElement(el));
  return path[0] ?? null;
}

function isFileDrag(e: React.DragEvent) {
  return !!e.dataTransfer?.types.includes('Files');
}

interface Resolved {
  kind: 'nodes' | 'target' | 'files';
  info?: ContainerInfo;
  index?: number | null;
  targetId?: NodeId | null;
}

function resolve(e: React.DragEvent, payload: DragPayload | null): Resolved | null {
  if (payload && payload.type !== 'nodes') {
    const id = nodeAt(e.clientX, e.clientY);
    return id ? { kind: 'target', targetId: id } : null;
  }
  const root = currentRootId();
  if (!root) return null;
  const hit = containerAt(e.clientX, e.clientY) ?? { id: root, hoverSibling: null };
  const info = containerInfo(hit.id, { staticContent: true });
  if (!info) return null;
  const p = clientToWorld(e.clientX, e.clientY);
  const index = info.mode === 'flow' ? flowDrop(info, p, new Set()).index : null;
  return { kind: payload ? 'nodes' : 'files', info, index };
}

export function canvasDragOver(e: React.DragEvent) {
  const kinema = isKinemaDrag(e);
  if (!kinema && !isFileDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  const payload = kinema ? getDragPayload() : null;
  const r = resolve(e, payload);
  if (!r) return useCanvas.getState().set({ drop: null });
  if (r.kind === 'target') return useCanvas.getState().set({ drop: { containerId: r.targetId!, targetId: r.targetId } });
  const line = r.info!.mode === 'flow' ? flowDrop(r.info!, clientToWorld(e.clientX, e.clientY), new Set()).line : null;
  useCanvas.getState().set({ drop: { containerId: r.info!.id, line } });
}

export function canvasDragLeave(e: React.DragEvent) {
  const to = e.relatedTarget as Node | null;
  if (to && (e.currentTarget as Node).contains(to)) return;
  useCanvas.getState().set({ drop: null });
}

function cloneAnimation(a: KAnimation): KAnimation {
  const c = deepClone(a);
  c.id = uid('a');
  c.keyframes = c.keyframes.map((k) => ({ ...k, id: uid('k') }));
  return c;
}

async function readFiles(list: FileList): Promise<PickedFile[]> {
  return Promise.all(Array.from(list).map(async (f) => ({ name: f.name, mime: f.type, data: new Uint8Array(await f.arrayBuffer()) })));
}

export function canvasDrop(e: React.DragEvent) {
  const kinema = isKinemaDrag(e);
  const files = !kinema && isFileDrag(e) ? e.dataTransfer.files : null;
  if (!kinema && !files?.length) return;
  e.preventDefault();
  useCanvas.getState().set({ drop: null });
  const payload = kinema ? getDragPayload() : null;
  const r = resolve(e, payload);
  if (kinema) endDrag();
  if (!r) return;
  const bp = uiApi.state.breakpoint;

  if (payload?.type === 'animation' && r.targetId) {
    const anim = cloneAnimation(payload.animation);
    addAnimation(r.targetId, anim, `Add animation “${anim.name}”`);
    uiApi.set({ selection: [r.targetId], rightTab: 'animate', editingTextId: null });
    usePlayback.getState().set({ selectedAnimation: { nodeId: r.targetId, animId: anim.id } });
    return;
  }
  if (payload?.type === 'style' && r.targetId) {
    const id = r.targetId;
    docApi.mutate(`Apply ${payload.label}`, (d) => {
      const n = d.nodes[id];
      if (!n) return;
      for (const [k, v] of Object.entries(payload.styles)) writeStyle(n, bp, k, v);
      if (payload.states) {
        n.states ??= {};
        for (const [st, map] of Object.entries(payload.states)) n.states[st as 'hover'] = { ...(n.states[st as 'hover'] ?? {}), ...map };
      }
    });
    uiApi.state.select([id]);
    return;
  }
  const info = r.info!;
  const origin = paddingOrigin(info.el) ?? { x: info.rect.x, y: info.rect.y };
  const p = clientToWorld(e.clientX, e.clientY);

  if (files) {
    const point = { x: p.x - info.rect.x, y: p.y - info.rect.y };
    void readFiles(files).then((fs) => importAndInsertFiles(fs, info.id, point));
    return;
  }
  if (payload?.type !== 'nodes') return;
  const sub = payload.build();
  const root = sub.nodes[sub.rootId];
  const containerStatic = getComputedStyle(info.el).position === 'static';
  if (info.mode === 'flow') stripPosition(root);
  else {
    const w = payload.size?.w ?? parsePx(root.styles.base.width) ?? 0;
    const h = payload.size?.h ?? parsePx(root.styles.base.height) ?? 0;
    const pct = /%$/.test(root.styles.base.width ?? '');
    placeAbsolute(root, bp, pct ? 0 : p.x - origin.x - w / 2, p.y - origin.y - h / 2);
  }
  docApi.mutate(`Insert ${payload.label}`, (d) => {
    insertSubtree(d as KDocument, sub, info.id, r.index ?? undefined);
    if (info.mode === 'free' && containerStatic) writeStyle(d.nodes[info.id], 'base', 'position', 'relative');
  });
  uiApi.state.select([sub.rootId]);
}
