/**
 * Animate panel (right sidebar tab): page overview without selection, the
 * selected layer's animation stack, the preset browser, and editors for the
 * selected animation and keyframe.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BookmarkPlus, Copy, GripVertical, Play, Plus, Sparkles, Square, Trash2, Wand2, Clapperboard } from 'lucide-react';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import type { KAnimation, KNode, NodeId } from '@/core/model/types';
import { Button, IconButton, Switch, Tooltip } from '@/ui/primitives';
import { getCommands, runCommand, subscribeCommands } from '@/features/shortcuts/shortcuts';
import { usePlayback } from './playbackStore';
import { playAll, playNode, stopAll } from './engine';
import { deleteAnimation, duplicateAnimation, moveAnimation, selectAnimation, setAnimationEnabled } from './animActions';
import { PresetBrowser } from './PresetBrowser';
import { AnimationEditor } from './AnimationEditor';
import { KeyframeEditor } from './KeyframeEditor';
import { NodeIcon, TriggerBadge, timingSummary, triggerMeta } from './meta';
import { openPresetBrowser, toggleTimeline } from './install';
import { useAnimatedNodes } from './hooks';
import './animation.css';

function useHasCommand(id: string) {
  return useSyncExternalStore(subscribeCommands, () => getCommands().some((c) => c.id === id));
}

// ─── Page overview ──────────────────────────────────────────────────────────

function PageAnimations() {
  const list = useAnimatedNodes();
  const playing = usePlayback((s) => s.playing);
  const total = list.reduce((n, x) => n + (x.node.animations?.length ?? 0), 0);
  if (!list.length)
    return (
      <div className="k-anim-empty">
        <div className="k-anim-empty__art" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <div className="k-anim-empty__title">Bring this page to life</div>
        <p>Select a layer and add an animation — or drag any preset straight onto the canvas.</p>
        <Button variant="primary" icon={<Sparkles />} onClick={openPresetBrowser}>
          Browse presets
        </Button>
        <div className="k-anim-empty__tips">
          <span>
            <kbd>Shift</kbd>+<kbd>Space</kbd> play page
          </span>
          <span>
            <kbd>Alt</kbd>+<kbd>T</kbd> timeline
          </span>
        </div>
      </div>
    );
  return (
    <div className="k-anim-page">
      <div className="k-anim-page__head">
        <div>
          <div className="k-anim-page__title">Page animations</div>
          <div className="k-muted" style={{ fontSize: 'var(--fs-xs)' }}>
            {total} animation{total === 1 ? '' : 's'} on {list.length} layer{list.length === 1 ? '' : 's'}
          </div>
        </div>
        <Button variant={playing ? 'default' : 'primary'} size="sm" icon={playing ? <Square /> : <Play />} onClick={() => (playing ? stopAll() : playAll())} data-testid="page-play-all">
          {playing ? 'Stop' : 'Play all'}
        </Button>
      </div>
      <div className="k-anim-layers">
        {list.map(({ node, depth }) => (
          <button key={node.id} className="k-anim-layer" style={{ paddingLeft: 10 + Math.max(0, depth - 1) * 10 }} onClick={() => useUI.getState().select([node.id])}>
            <span className="k-anim-layer__icon">
              <NodeIcon type={node.type} />
            </span>
            <span className="k-anim-layer__name">{node.name}</span>
            <span className="k-anim-layer__dots">
              {node.animations!.slice(0, 5).map((a) => (
                <i key={a.id} style={{ background: triggerMeta(a.trigger).color, opacity: a.enabled === false ? 0.3 : 1 }} title={`${a.name} · ${triggerMeta(a.trigger).label}`} />
              ))}
            </span>
          </button>
        ))}
      </div>
      <div className="k-anim-page__foot">
        <Button variant="ghost" size="sm" icon={<Clapperboard />} onClick={toggleTimeline}>
          Open timeline
        </Button>
      </div>
    </div>
  );
}

// ─── Animation cards ────────────────────────────────────────────────────────

function AnimationCard({ nodeId, anim, index, selected, onGrip }: { nodeId: NodeId; anim: KAnimation; index: number; selected: boolean; onGrip: (e: React.PointerEvent, index: number) => void }) {
  const t = triggerMeta(anim.trigger);
  const disabled = anim.enabled === false;
  return (
    <div
      className="k-anim-card"
      data-selected={selected ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      data-anim={anim.id}
      style={{ ['--trigger' as string]: t.color }}
      onClick={() => selectAnimation(nodeId, anim.id)}
    >
      <span className="k-anim-card__grip" onPointerDown={(e) => onGrip(e, index)} onClick={(e) => e.stopPropagation()} title="Drag to reorder">
        <GripVertical />
      </span>
      <div className="k-anim-card__body">
        <div className="k-anim-card__row">
          <span className="k-anim-card__name">{anim.name}</span>
          <span onClick={(e) => e.stopPropagation()}>
            <Switch checked={!disabled} onChange={(v) => setAnimationEnabled(nodeId, anim.id, v)} ariaLabel={disabled ? 'Enable animation' : 'Disable animation'} />
          </span>
        </div>
        <div className="k-anim-card__row">
          <TriggerBadge trigger={anim.trigger} />
          <span className="k-anim-card__meta">{timingSummary(anim)}</span>
          <span className="k-anim-card__actions" onClick={(e) => e.stopPropagation()}>
            <IconButton label="Play" size="sm" disabled={disabled} onClick={() => playNode(nodeId, anim.id)}>
              <Play />
            </IconButton>
            <IconButton label="Duplicate" size="sm" onClick={() => duplicateAnimation(nodeId, anim.id)}>
              <Copy />
            </IconButton>
            <IconButton label="Delete" size="sm" onClick={() => deleteAnimation(nodeId, anim.id)}>
              <Trash2 />
            </IconButton>
          </span>
        </div>
      </div>
    </div>
  );
}

function AnimationList({ node }: { node: KNode }) {
  const anims = node.animations ?? [];
  const selectedId = usePlayback((s) => (s.selectedAnimation?.nodeId === node.id ? s.selectedAnimation.animId : null));
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  const onGrip = (e: React.PointerEvent, from: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const cards = [...(listRef.current?.querySelectorAll<HTMLElement>('.k-anim-card') ?? [])];
    const mids = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    let to = from;
    setDrag({ from, to });
    const move = (ev: PointerEvent) => {
      to = mids.filter((m) => ev.clientY > m).length;
      setDrag({ from, to });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      const target = to > from ? to - 1 : to;
      if (target !== from) moveAnimation(node.id, from, target);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div className="k-anim-list" ref={listRef} data-dragging={drag ? 'true' : undefined}>
      {anims.map((a, i) => (
        <div key={a.id} className="k-anim-list__slot" data-drop-before={drag && drag.to === i && drag.to !== drag.from && drag.to !== drag.from + 1 ? 'true' : undefined} data-drag-src={drag?.from === i ? 'true' : undefined}>
          <AnimationCard nodeId={node.id} anim={a} index={i} selected={a.id === selectedId} onGrip={onGrip} />
        </div>
      ))}
      {drag && drag.to === anims.length && drag.from !== anims.length - 1 && <div className="k-anim-list__drop-end" />}
    </div>
  );
}

function NodeAnimations({ id }: { id: NodeId }) {
  const node = useDoc((s) => s.doc.nodes[id]);
  const selected = usePlayback((s) => (s.selectedAnimation?.nodeId === id ? s.selectedAnimation.animId : null));
  const hasSave = useHasCommand('library.saveAnimation');
  const anim = node?.animations?.find((a) => a.id === selected) ?? null;
  // keep a sensible selection when arriving on a node
  useEffect(() => {
    if (!node) return;
    if (!anim && node.animations?.length) selectAnimation(id, node.animations[0].id);
  }, [id, node, anim]);
  if (!node) return null;
  const anims = node.animations ?? [];
  return (
    <div className="k-anim-node" data-testid="anim-node">
      <div className="k-anim-node__head">
        <span className="k-anim-layer__icon">
          <NodeIcon type={node.type} />
        </span>
        <span className="k-anim-node__name">{node.name}</span>
        {anims.length > 0 && (
          <Tooltip content="Play this layer’s animations">
            <Button size="sm" variant="ghost" icon={<Play />} onClick={() => playNode(id)}>
              Play
            </Button>
          </Tooltip>
        )}
      </div>
      {anims.length ? (
        <AnimationList node={node} />
      ) : (
        <div className="k-anim-node__empty">
          <Wand2 />
          <span>No animations on this layer yet.</span>
        </div>
      )}
      <div className="k-anim-node__add">
        <Button block variant={anims.length ? 'outline' : 'primary'} icon={<Plus />} onClick={openPresetBrowser} data-testid="anim-add">
          Add animation
        </Button>
      </div>
      {anim && (
        <>
          <AnimationEditor key={anim.id} nodeId={id} anim={anim} />
          <KeyframeEditor nodeId={id} anim={anim} />
          <div className="k-anim-node__foot">
            <Tooltip content={hasSave ? 'Save this animation to your library' : 'Library is not available'}>
              <span style={{ display: 'block' }}>
                <Button block variant="ghost" icon={<BookmarkPlus />} disabled={!hasSave} onClick={() => runCommand('library.saveAnimation')}>
                  Save to library
                </Button>
              </span>
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
}

function MultiSelection({ ids }: { ids: NodeId[] }) {
  const nodes = useDoc((s) => s.doc.nodes);
  const items = ids.map((i) => nodes[i]).filter(Boolean);
  return (
    <div className="k-anim-node">
      <div className="k-anim-node__head">
        <span className="k-anim-node__name">{items.length} layers selected</span>
        <Button size="sm" variant="ghost" icon={<Play />} onClick={() => playAll(ids)}>
          Play
        </Button>
      </div>
      <div className="k-anim-layers">
        {items.map((n) => (
          <button key={n.id} className="k-anim-layer" onClick={() => useUI.getState().select([n.id])}>
            <span className="k-anim-layer__icon">
              <NodeIcon type={n.type} />
            </span>
            <span className="k-anim-layer__name">{n.name}</span>
            <span className="k-muted" style={{ fontSize: 'var(--fs-xs)' }}>
              {n.animations?.length ?? 0}
            </span>
          </button>
        ))}
      </div>
      <div className="k-anim-node__add">
        <Button block variant="primary" icon={<Plus />} onClick={openPresetBrowser}>
          Add animation to all
        </Button>
      </div>
    </div>
  );
}

export function AnimatePanel() {
  const selection = useUI((s) => s.selection);
  const browser = usePlayback((s) => s.presetBrowser);
  if (browser) return <PresetBrowser />;
  if (!selection.length) return <PageAnimations />;
  if (selection.length > 1) return <MultiSelection ids={selection} />;
  return <NodeAnimations id={selection[0]} />;
}
