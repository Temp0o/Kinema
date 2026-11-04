/**
 * Animation document actions. Every function here is exactly one undo step
 * (or joins an open transaction, e.g. a timeline drag).
 */
import type { Draft } from 'immer';
import { docApi } from '@/core/store/docStore';
import { updateAnimation } from '@/core/store/actions';
import { getSubtreeIds, deepClone } from '@/core/model/tree';
import { uid } from '@/core/model/factory';
import type { KAnimation, KDocument, KNode, Keyframe, KeyframeValues, NodeId } from '@/core/model/types';
import { addPathLength, usesStrokeDraw } from '@/core/anim/svg';
import { valuesAt } from '@/core/anim/timeline';
import { getPreset, type AnimationPreset } from '@/core/anim/presets';
import { planChoreography, type Choreography } from '@/core/anim/choreography';
import { usePlayback } from './playbackStore';
import { playAll, scheduleReplay } from './engine';

export function findAnimation(doc: KDocument, nodeId: NodeId, animId: string): KAnimation | undefined {
  return doc.nodes[nodeId]?.animations?.find((a) => a.id === animId);
}

export function selectAnimation(nodeId: NodeId, animId: string | null, keyframeId?: string | null) {
  usePlayback.getState().set({
    selectedAnimation: animId ? { nodeId, animId } : null,
    selectedKeyframe: animId && keyframeId ? { nodeId, animId, keyframeId } : null,
  });
}

/** SVG draw-on needs pathLength="1" on the shapes; patch the node (and nested svg nodes) markup. */
function patchSvgMarkup(d: Draft<KDocument>, nodeId: NodeId, anim: KAnimation) {
  if (!usesStrokeDraw(anim) || !anim.targetSelector) return;
  for (const id of getSubtreeIds(d.nodes as Record<NodeId, KNode>, nodeId)) {
    const n = d.nodes[id];
    if (n?.type === 'svg' && n.props.svg) {
      const next = addPathLength(n.props.svg, anim.targetSelector);
      if (next !== n.props.svg) n.props.svg = next;
    }
  }
}

/**
 * Apply an animation to nodes as one history step. `make` is called once per
 * node so each gets fresh ids. Returns the created (node, animation) ids.
 */
export function applyAnimation(nodeIds: NodeId[], make: () => KAnimation, label?: string): { nodeId: NodeId; animId: string }[] {
  const created: { nodeId: NodeId; animId: string }[] = [];
  const ids = nodeIds.filter((id) => !!docApi.doc.nodes[id]);
  if (!ids.length) return created;
  docApi.mutate(label ?? 'Add animation', (d) => {
    for (const id of ids) {
      const n = d.nodes[id];
      if (!n) continue;
      const anim = make();
      (n.animations ??= []).push(anim);
      patchSvgMarkup(d, id, anim);
      created.push({ nodeId: id, animId: anim.id });
    }
  });
  if (created.length) selectAnimation(created[0].nodeId, created[0].animId);
  return created;
}

export function applyPreset(nodeIds: NodeId[], preset: AnimationPreset) {
  return applyAnimation(nodeIds, () => preset.make(), `Add animation “${preset.name}”`);
}

/**
 * Choreograph a section: give every meaningful element inside the roots a
 * role-appropriate entrance with a cascading delay (one undo step), then play it.
 * Re-running replaces the entrance animations it set before (load / in-view
 * triggers on those elements); hover, click and loop animations are kept.
 * Returns the number of animated elements.
 */
export function applyChoreography(rootIds: NodeId[], choreo: Choreography, opts: { play?: boolean } = {}): number {
  const beats = planChoreography(docApi.doc, rootIds, choreo);
  if (!beats.length) return 0;
  docApi.mutate(`Choreograph “${choreo.name}”`, (d) => {
    for (const b of beats) {
      const n = d.nodes[b.nodeId];
      const preset = getPreset(b.presetId);
      if (!n || !preset) continue;
      const anim = preset.make();
      anim.trigger = 'inView';
      anim.delay = (anim.delay || 0) + b.delay;
      n.animations = [...(n.animations ?? []).filter((a) => a.trigger !== 'load' && a.trigger !== 'inView'), anim];
    }
  });
  if (opts.play !== false) playAll(beats.map((b) => b.nodeId));
  return beats.length;
}

/** Apply an animation object (e.g. a dropped/library animation) with fresh ids. */
export function applyAnimationCopy(nodeIds: NodeId[], anim: KAnimation, label?: string) {
  return applyAnimation(nodeIds, () => cloneAnimation(anim), label ?? `Add animation “${anim.name}”`);
}

export function cloneAnimation(anim: KAnimation): KAnimation {
  const c = deepClone(anim);
  c.id = uid('a');
  c.keyframes = c.keyframes.map((k) => ({ ...k, id: uid('k') }));
  return c;
}

/** Edit an animation (one undo step, coalesced by key) and replay it on the canvas. */
export function editAnimation(
  nodeId: NodeId,
  animId: string,
  recipe: (a: Draft<KAnimation>) => void,
  opts: { label?: string; coalesceKey?: string; replay?: boolean } = {},
) {
  updateAnimation(nodeId, animId, recipe, { label: opts.label ?? 'Edit animation', coalesceKey: opts.coalesceKey });
  if (opts.replay !== false) scheduleReplay(nodeId, animId);
}

export function duplicateAnimation(nodeId: NodeId, animId: string) {
  const src = findAnimation(docApi.doc, nodeId, animId);
  if (!src) return;
  const copy = cloneAnimation(src);
  copy.name = `${src.name} copy`;
  docApi.mutate(`Duplicate animation “${src.name}”`, (d) => {
    const list = d.nodes[nodeId]?.animations;
    if (!list) return;
    const i = list.findIndex((a) => a.id === animId);
    list.splice(i + 1, 0, copy);
  });
  selectAnimation(nodeId, copy.id);
}

export function deleteAnimation(nodeId: NodeId, animId: string) {
  const list = docApi.doc.nodes[nodeId]?.animations ?? [];
  const idx = list.findIndex((a) => a.id === animId);
  if (idx < 0) return;
  docApi.mutate(`Remove animation “${list[idx].name}”`, (d) => {
    const n = d.nodes[nodeId];
    if (!n?.animations) return;
    n.animations = n.animations.filter((a) => a.id !== animId);
    if (!n.animations.length) delete n.animations;
  });
  const sel = usePlayback.getState().selectedAnimation;
  if (sel?.nodeId === nodeId && sel.animId === animId) {
    const rest = docApi.doc.nodes[nodeId]?.animations ?? [];
    const next = rest[Math.min(idx, rest.length - 1)];
    selectAnimation(nodeId, next?.id ?? null);
  }
}

export function moveAnimation(nodeId: NodeId, from: number, to: number) {
  const list = docApi.doc.nodes[nodeId]?.animations ?? [];
  if (from === to || from < 0 || from >= list.length) return;
  docApi.mutate('Reorder animations', (d) => {
    const l = d.nodes[nodeId]?.animations;
    if (!l) return;
    const [a] = l.splice(from, 1);
    l.splice(Math.max(0, Math.min(l.length, to)), 0, a);
  });
}

export function setAnimationEnabled(nodeId: NodeId, animId: string, enabled: boolean) {
  updateAnimation(nodeId, animId, (a) => {
    a.enabled = enabled;
  }, { label: enabled ? 'Enable animation' : 'Disable animation' });
}

// ─── Keyframes ──────────────────────────────────────────────────────────────

/** Insert a keyframe at `offset` with values interpolated from its neighbours. Returns its id. */
export function addKeyframeAt(nodeId: NodeId, animId: string, offset: number, opts: { replay?: boolean } = {}): string | null {
  const anim = findAnimation(docApi.doc, nodeId, animId);
  if (!anim) return null;
  const o = Math.round(Math.min(1, Math.max(0, offset)) * 1000) / 1000;
  const existing = anim.keyframes.find((k) => Math.abs(k.offset - o) < 0.001);
  if (existing) {
    selectAnimation(nodeId, animId, existing.id);
    return existing.id;
  }
  const kf: Keyframe = { id: uid('k'), offset: o, values: valuesAt(anim, o) };
  editAnimation(
    nodeId,
    animId,
    (a) => {
      a.keyframes.push(kf);
      a.keyframes.sort((x, y) => x.offset - y.offset);
    },
    { label: 'Add keyframe', replay: opts.replay },
  );
  selectAnimation(nodeId, animId, kf.id);
  return kf.id;
}

export function removeKeyframe(nodeId: NodeId, animId: string, keyframeId: string): boolean {
  const anim = findAnimation(docApi.doc, nodeId, animId);
  if (!anim || anim.keyframes.length <= 2) return false;
  const idx = anim.keyframes.findIndex((k) => k.id === keyframeId);
  if (idx < 0) return false;
  editAnimation(nodeId, animId, (a) => {
    a.keyframes = a.keyframes.filter((k) => k.id !== keyframeId);
  }, { label: 'Delete keyframe' });
  const rest = findAnimation(docApi.doc, nodeId, animId)?.keyframes ?? [];
  const next = rest[Math.min(idx, rest.length - 1)];
  selectAnimation(nodeId, animId, next?.id ?? null);
  return true;
}

export function setKeyframeValue(nodeId: NodeId, animId: string, keyframeId: string, key: string, value: string | number | undefined, opts: { coalesce?: boolean } = {}) {
  editAnimation(
    nodeId,
    animId,
    (a) => {
      const k = a.keyframes.find((x) => x.id === keyframeId);
      if (!k) return;
      if (value === undefined) delete k.values[key];
      else k.values[key] = value;
    },
    { label: value === undefined ? `Remove ${key}` : `Edit keyframe ${key}`, coalesceKey: opts.coalesce === false ? undefined : `kf:${keyframeId}:${key}` },
  );
}

/** Add a property to a keyframe (default value), or rename one key to another. */
export function setKeyframeValues(nodeId: NodeId, animId: string, keyframeId: string, patch: KeyframeValues, label = 'Edit keyframe') {
  editAnimation(nodeId, animId, (a) => {
    const k = a.keyframes.find((x) => x.id === keyframeId);
    if (k) Object.assign(k.values, patch);
  }, { label });
}

/** Remove a property from every keyframe of an animation. */
export function removePropertyEverywhere(nodeId: NodeId, animId: string, key: string) {
  editAnimation(nodeId, animId, (a) => {
    for (const k of a.keyframes) delete k.values[key];
  }, { label: `Remove ${key}` });
}

export function setKeyframeOffset(nodeId: NodeId, animId: string, keyframeId: string, offset: number, opts: { coalesce?: boolean; replay?: boolean } = {}) {
  editAnimation(
    nodeId,
    animId,
    (a) => {
      const k = a.keyframes.find((x) => x.id === keyframeId);
      if (!k) return;
      k.offset = Math.round(Math.min(1, Math.max(0, offset)) * 1000) / 1000;
      a.keyframes.sort((x, y) => x.offset - y.offset);
    },
    { label: 'Move keyframe', coalesceKey: opts.coalesce === false ? undefined : `kfo:${keyframeId}`, replay: opts.replay },
  );
}

export function setKeyframeEasing(nodeId: NodeId, animId: string, keyframeId: string, easing: string | null) {
  editAnimation(nodeId, animId, (a) => {
    const k = a.keyframes.find((x) => x.id === keyframeId);
    if (!k) return;
    if (easing) k.easing = easing;
    else delete k.easing;
  }, { label: 'Keyframe easing' });
}
