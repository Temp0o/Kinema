import type { ReactNode } from 'react';
import { Component, Frame, Image, Link, List, MousePointerClick, PenTool, Square, TextCursorInput, Type, Video, Monitor, Tablet, Smartphone, RotateCcw, MousePointer2 } from 'lucide-react';
import type { KNode, NodeType } from '@/core/model/types';
import { DEFAULT_TAGS } from '@/core/model/factory';
import { renameNode, resetBreakpointOverrides, setNodeFields } from '@/core/store/actions';
import { Button, Select, TextInput, Tooltip } from '@/ui/primitives';
import { bpName, STATE_LABELS } from '../controls';
import { historyStep, type EditState, type Scope } from '../scope';
import { setStateStyle } from '@/core/store/actions';
import { usePropsUI } from '../propsStore';

export const TYPE_ICONS: Record<NodeType, ReactNode> = {
  frame: <Frame />,
  box: <Square />,
  text: <Type />,
  button: <MousePointerClick />,
  link: <Link />,
  image: <Image />,
  svg: <PenTool />,
  input: <TextCursorInput />,
  textarea: <TextCursorInput />,
  select: <List />,
  video: <Video />,
  instance: <Component />,
};

const TYPE_NAMES: Record<NodeType, string> = {
  frame: 'Frame',
  box: 'Box',
  text: 'Text',
  button: 'Button',
  link: 'Link',
  image: 'Image',
  svg: 'Vector',
  input: 'Input',
  textarea: 'Text area',
  select: 'Select',
  video: 'Video',
  instance: 'Instance',
};

const BOX_TAGS = ['div', 'section', 'header', 'nav', 'main', 'footer', 'article', 'aside', 'ul', 'ol', 'li', 'form', 'figure'];
const TEXT_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'blockquote', 'li', 'small'];

function tagOptionsFor(type: NodeType): string[] | null {
  if (type === 'box') return BOX_TAGS;
  if (type === 'text') return TEXT_TAGS;
  return null;
}

export function Header({ scope }: { scope: Scope }) {
  const nodes = scope.nodes;
  const single = nodes.length === 1 ? nodes[0] : null;
  const sameType = nodes.every((n) => n.type === nodes[0].type);
  const tags = sameType ? tagOptionsFor(nodes[0].type) : null;
  const isRoot = single && !single.parent;
  const tagValues = nodes.map((n) => n.tag || DEFAULT_TAGS[n.type]);
  const tagMixed = tagValues.some((t) => t !== tagValues[0]);
  return (
    <div className="k-dp-head">
      <div className="k-dp-head__row">
        <span className="k-dp-head__icon" data-type={sameType ? nodes[0].type : 'mixed'}>
          {sameType ? TYPE_ICONS[nodes[0].type] : <MousePointer2 />}
        </span>
        {single ? (
          <TextInput
            value={single.name}
            onCommit={(v) => renameNode(single.id, v)}
            wrapClassName="k-dp-head__name"
            aria-label="Layer name"
          />
        ) : (
          <div className="k-dp-head__multi">
            <b>{nodes.length} layers</b>
            <span>{sameType ? TYPE_NAMES[nodes[0].type] : 'Mixed types'}</span>
          </div>
        )}
        {tags && !isRoot && (
          <div className="k-dp-head__tag">
            <Select
              value={tagMixed ? '' : tagValues[0]}
              placeholder="Mixed"
              ariaLabel="HTML tag"
              onChange={(v) => setNodeFields(scope.ids, { tag: v === DEFAULT_TAGS[nodes[0].type] ? undefined : v }, 'Change tag')}
              options={tags.map((t) => ({ value: t, label: `<${t}>` }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BpIcon({ icon }: { icon: string }) {
  return icon === 'mobile' ? <Smartphone /> : icon === 'tablet' ? <Tablet /> : <Monitor />;
}

export function BreakpointBanner({ scope }: { scope: Scope }) {
  if (scope.isBase) return null;
  const bp = scope.breakpoints.find((b) => b.id === scope.bp);
  const count = scope.nodes.reduce((n, node) => n + Object.keys(node.styles[scope.bp] ?? {}).length, 0);
  return (
    <div className="k-dp-banner" data-kind="bp" data-testid="bp-banner">
      <BpIcon icon={bp?.icon ?? 'tablet'} />
      <span>
        Editing <b>{bpName(scope)}</b> overrides · {count} override{count === 1 ? '' : 's'}
      </span>
      <Button size="sm" variant="ghost" disabled={!count} onClick={() => resetBreakpointOverrides(scope.ids, scope.bp)} icon={<RotateCcw />}>
        Reset all
      </Button>
    </div>
  );
}

const STATES: EditState[] = ['default', 'hover', 'active', 'focus'];

export function StateSwitcher({ nodes }: { nodes: KNode[] }) {
  const editState = usePropsUI((s) => s.editState);
  const setEditState = usePropsUI((s) => s.setEditState);
  return (
    <div className="k-dp-states" role="tablist" aria-label="Interaction state">
      {STATES.map((s) => {
        const count = s === 'default' ? 0 : nodes.reduce((n, node) => n + Object.keys(node.states?.[s] ?? {}).length, 0);
        return (
          <Tooltip key={s} content={s === 'default' ? 'Default styles' : `${STATE_LABELS[s]} styles${count ? ` · ${count} set` : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={editState === s}
              className="k-dp-states__tab"
              data-state-id={s}
              onClick={() => setEditState(s)}
            >
              {STATE_LABELS[s]}
              {count > 0 && <span className="k-dp-states__dot" />}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function StateBanner({ scope }: { scope: Scope }) {
  const st = scope.state;
  if (!st) return null;
  const count = scope.nodes.reduce((n, node) => n + Object.keys(node.states?.[st] ?? {}).length, 0);
  return (
    <div className="k-dp-banner" data-kind="state" data-testid="state-banner">
      <MousePointerClick />
      <span>
        Editing <b>{STATE_LABELS[st]}</b> state · {count} propert{count === 1 ? 'y' : 'ies'}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={!count}
        icon={<RotateCcw />}
        onClick={() =>
          historyStep(`Clear ${STATE_LABELS[st]} styles`, () => {
            for (const n of scope.nodes) for (const p of Object.keys(n.states?.[st] ?? {})) setStateStyle([n.id], st, p, null);
          })
        }
      >
        Clear
      </Button>
    </div>
  );
}
