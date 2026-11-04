/**
 * Selection action bar: the everyday actions for whatever is selected, right next to
 * it on the canvas — animate it (with element-aware suggestions and live hover
 * preview), switch its children between Free and Flow, ask AI, duplicate, delete.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Zap, Sparkles, Copy, Trash2, MoreHorizontal, ArrowRight } from 'lucide-react';
import { Popover as RPopover } from 'radix-ui';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { deleteSelection, duplicateNodes } from '@/core/store/actions';
import { isContainerType } from '@/core/model/factory';
import type { KNode, NodeType } from '@/core/model/types';
import { getPreset, type AnimationPreset } from '@/core/anim/presets';
import { usePlayback } from '@/features/animation/playbackStore';
import { previewTemplate, stopPreview } from '@/features/animation/engine';
import { applyPreset } from '@/features/animation/animActions';
import { PresetThumb } from '@/features/animation/PresetBrowser';
import { LayoutModeSwitch } from '@/features/layout/layoutUi';
import { worldRectFor, worldToScreen, viewportEl } from '@/features/canvas/measure';
import { getCommands, runCommand } from '@/features/shortcuts/shortcuts';
import { IconButton, Tooltip } from '@/ui/primitives';
import { setWorkspaceMode } from '@/app/TitleBar';
import { AIMotionPrompt } from '@/features/ai/AIMotionPrompt';
import { ChoreographyPicker } from '@/features/animation/ChoreographyPicker';
import './selection-bar.css';

/** Animation suggestions by what the element is. */
const SUGGEST: Record<string, string[]> = {
  button: ['hover-lift', 'hover-glow-ring', 'pulse', 'pop', 'hover-push', 'shimmer'],
  link: ['hover-nudge', 'hover-lift', 'fade-up', 'reveal-right'],
  text: ['fade-up', 'reveal-up', 'typewriter', 'blur-in', 'focus-in', 'reveal-right'],
  heading: ['reveal-up', 'fade-up', 'focus-in', 'blur-in', 'typewriter', 'glitch-in'],
  image: ['zoom-in', 'blur-in', 'reveal-right', 'fade-up', 'float', 'hover-grow'],
  svg: ['svg-draw', 'svg-fill-in', 'pop', 'spin', 'float', 'svg-color-cycle'],
  group: ['stagger-fade-up', 'stagger-pop', 'cascade-left', 'fade-up', 'rise-tilt', 'hover-lift'],
  box: ['fade-up', 'pop', 'rise-tilt', 'hover-lift', 'float', 'drop-in'],
  input: ['fade-up', 'shake', 'glow', 'reveal-right'],
};

function kindOf(n: KNode): string {
  if (n.type === 'text' && /^h[1-6]$/.test(n.tag ?? '')) return 'heading';
  if ((n.type === 'box' || n.type === 'frame' || n.type === 'instance') && n.children.length > 1) return 'group';
  const map: Partial<Record<NodeType, string>> = { textarea: 'input', select: 'input', video: 'image', instance: 'box', frame: 'box' };
  return map[n.type] ?? n.type;
}

export function suggestedPresets(n: KNode): AnimationPreset[] {
  return (SUGGEST[kindOf(n)] ?? SUGGEST.box).map((id) => getPreset(id)).filter((p): p is AnimationPreset => !!p);
}

function AnimateMenu({ node, ids }: { node: KNode; ids: string[] }) {
  const presets = useMemo(() => suggestedPresets(node), [node]);
  useEffect(() => () => stopPreview(), []);
  return (
    <div className="k-sbar__anim">
      <div className="k-sbar__animhead">
        Suggested for <b>{node.name}</b>
        <span>Hover to preview · click to apply</span>
      </div>
      <div className="k-sbar__animgrid">
        {presets.map((p) => (
          <button
            key={p.id}
            className="k-sbar__animitem"
            onMouseEnter={() => previewTemplate(ids, p.make())}
            onMouseLeave={() => stopPreview()}
            onClick={() => {
              stopPreview();
              applyPreset(ids, p);
            }}
          >
            <PresetThumb preset={p} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      {isContainerType(node.type) && node.type !== 'button' && node.type !== 'link' && node.children.length > 0 && <ChoreographyPicker ids={ids} compact />}
      <div className="k-sbar__animai">
        <AIMotionPrompt ids={ids} compact />
      </div>
      <button
        className="k-sbar__animall"
        onClick={() => {
          stopPreview();
          setWorkspaceMode('animate');
        }}
      >
        All animations & timeline <ArrowRight />
      </button>
    </div>
  );
}

export function SelectionBar() {
  const selection = useUI((s) => s.selection);
  const editingText = useUI((s) => !!s.editingTextId);
  const viewport = useUI((s) => s.viewport);
  const bp = useUI((s) => s.breakpoint);
  const playing = usePlayback((s) => s.playing);
  const node = useDoc((s) => (selection.length ? s.doc.nodes[selection[0]] : undefined));
  const revision = useDoc((s) => s.revision);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const [animOpen, setAnimOpen] = useState(false);

  useLayoutEffect(() => {
    if (!selection.length) return setPos(null);
    const raf = requestAnimationFrame(() => {
      const rects = selection.map((id) => worldRectFor(id)).filter((r): r is NonNullable<typeof r> => !!r);
      const vp = viewportEl();
      if (!rects.length || !vp) return setPos(null);
      const minX = Math.min(...rects.map((r) => r.x));
      const maxX = Math.max(...rects.map((r) => r.x + r.w));
      const minY = Math.min(...rects.map((r) => r.y));
      const maxY = Math.max(...rects.map((r) => r.y + r.h));
      const tl = worldToScreen(minX, minY);
      const br = worldToScreen(maxX, maxY);
      const below = tl.y < 56;
      const x = Math.min(Math.max((tl.x + br.x) / 2, 160), vp.clientWidth - 160);
      setPos({ x, y: below ? Math.min(br.y + 34, vp.clientHeight - 60) : tl.y - 12, below });
    });
    return () => cancelAnimationFrame(raf);
  }, [selection, viewport, revision, bp]);

  if (!node || !pos || editingText || playing) return null;
  const isContainer = selection.length === 1 && isContainerType(node.type) && node.type !== 'button' && node.type !== 'link' && node.children.length > 0;
  const hasAI = getCommands().some((c) => c.id === 'ai.editSelection');

  return (
    <div ref={ref} className="k-sbar" data-tour="selection-bar" data-below={pos.below ? 'true' : undefined} style={{ left: pos.x, top: pos.y }} onPointerDown={(e) => e.stopPropagation()}>
      <span className="k-sbar__name">{selection.length > 1 ? `${selection.length} layers` : node.name}</span>
      <RPopover.Root open={animOpen} onOpenChange={setAnimOpen}>
        <RPopover.Trigger asChild>
          <button className="k-sbar__btn k-sbar__btn--animate" data-tour="animate-button" data-open={animOpen ? 'true' : undefined}>
            <Zap />
            Animate
          </button>
        </RPopover.Trigger>
        <RPopover.Portal>
          <RPopover.Content className="k-popover k-app k-sbar__pop" side={pos.below ? 'bottom' : 'top'} sideOffset={8} collisionPadding={12} onKeyDown={(e) => e.stopPropagation()}>
            <AnimateMenu node={node} ids={selection} />
          </RPopover.Content>
        </RPopover.Portal>
      </RPopover.Root>
      {isContainer && (
        <>
          <span className="k-sbar__sep" />
          <LayoutModeSwitch id={node.id} compact className="k-sbar__layout" />
        </>
      )}
      <span className="k-sbar__sep" />
      <Tooltip content={hasAI ? 'Edit with AI' : 'AI assistant'} shortcut="Mod+I">
        <button className="k-sbar__btn k-sbar__btn--ai" onClick={() => (hasAI ? runCommand('ai.editSelection') : useUI.getState().set({ assistantOpen: true }))}>
          <Sparkles />
          AI
        </button>
      </Tooltip>
      <span className="k-sbar__sep" />
      <IconButton label="Duplicate" shortcut="Mod+D" size="sm" onClick={() => duplicateNodes(selection)}>
        <Copy />
      </IconButton>
      <IconButton label="Delete" shortcut="Del" size="sm" onClick={deleteSelection}>
        <Trash2 />
      </IconButton>
      <IconButton
        label="More actions"
        size="sm"
        onClick={(e) => {
          const el = document.querySelector(`.kc-root [data-kid="${CSS.escape(selection[0])}"]`);
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          el?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left, clientY: r.bottom + 4 }));
        }}
      >
        <MoreHorizontal />
      </IconButton>
    </div>
  );
}
