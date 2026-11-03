/**
 * Shared presentation metadata for the animation UI: trigger colors/icons,
 * animatable channel definitions, node-type icons.
 */
import type { ReactNode } from 'react';
import {
  Zap,
  ScanEye,
  MousePointer2,
  MousePointerClick,
  Repeat,
  Frame,
  Square,
  Type,
  RectangleHorizontal,
  Link,
  Image as ImageIcon,
  PenTool,
  TextCursorInput,
  ChevronsUpDown,
  Video,
  Component,
} from 'lucide-react';
import type { AnimTrigger, KAnimation, NodeType } from '@/core/model/types';
import { formatMs, isInfiniteAnim } from '@/core/anim/timeline';

export interface TriggerMeta {
  id: AnimTrigger;
  label: string;
  short: string;
  color: string;
  icon: ReactNode;
}

export const TRIGGERS: TriggerMeta[] = [
  { id: 'load', label: 'On load', short: 'Load', color: '#8b6cff', icon: <Zap /> },
  { id: 'inView', label: 'Scroll into view', short: 'In view', color: '#22d3ee', icon: <ScanEye /> },
  { id: 'hover', label: 'Hover', short: 'Hover', color: '#fbbf24', icon: <MousePointer2 /> },
  { id: 'click', label: 'Click', short: 'Click', color: '#f472b6', icon: <MousePointerClick /> },
  { id: 'loop', label: 'Loop', short: 'Loop', color: '#34d399', icon: <Repeat /> },
];

export const triggerMeta = (t: AnimTrigger): TriggerMeta => TRIGGERS.find((x) => x.id === t) ?? TRIGGERS[0];

export function TriggerBadge({ trigger }: { trigger: AnimTrigger }) {
  const m = triggerMeta(trigger);
  return (
    <span className="k-anim-trigger" style={{ ['--trigger' as string]: m.color }}>
      {m.icon}
      {m.short}
    </span>
  );
}

/** "600ms · +200ms · ×2" */
export function timingSummary(a: KAnimation): string {
  const parts = [formatMs(a.duration)];
  if (a.delay) parts.push(`+${formatMs(a.delay)} delay`);
  if (isInfiniteAnim(a)) parts.push('∞');
  else if (a.iterations > 1) parts.push(`×${a.iterations}`);
  if (a.stagger != null) parts.push(`${a.stagger}ms stagger`);
  return parts.join(' · ');
}

// ─── Channels ─────────────────────────────────────────────────────────────

export type ChannelKind = 'number' | 'color' | 'text' | 'blur';

export interface ChannelDef {
  key: string;
  label: string;
  short: string;
  kind: ChannelKind;
  group: 'Transform' | 'Appearance' | 'Effects' | 'Layout' | 'SVG';
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  def: string | number;
}

export const CHANNELS: ChannelDef[] = [
  { key: 'x', label: 'Move X', short: 'X', kind: 'number', group: 'Transform', unit: 'px', def: 0, precision: 1 },
  { key: 'y', label: 'Move Y', short: 'Y', kind: 'number', group: 'Transform', unit: 'px', def: 0, precision: 1 },
  { key: 'scale', label: 'Scale', short: 'S', kind: 'number', group: 'Transform', step: 0.01, def: 1, precision: 3 },
  { key: 'scaleX', label: 'Scale X', short: 'SX', kind: 'number', group: 'Transform', step: 0.01, def: 1, precision: 3 },
  { key: 'scaleY', label: 'Scale Y', short: 'SY', kind: 'number', group: 'Transform', step: 0.01, def: 1, precision: 3 },
  { key: 'rotate', label: 'Rotate', short: 'R', kind: 'number', group: 'Transform', unit: 'deg', def: 0, precision: 1 },
  { key: 'skewX', label: 'Skew X', short: 'KX', kind: 'number', group: 'Transform', unit: 'deg', def: 0, precision: 2 },
  { key: 'skewY', label: 'Skew Y', short: 'KY', kind: 'number', group: 'Transform', unit: 'deg', def: 0, precision: 2 },
  { key: 'opacity', label: 'Opacity', short: 'O', kind: 'number', group: 'Appearance', step: 0.01, min: 0, max: 1, def: 1, precision: 2 },
  { key: 'background-color', label: 'Background', short: 'BG', kind: 'color', group: 'Appearance', def: '#7c5cff' },
  { key: 'color', label: 'Text color', short: 'C', kind: 'color', group: 'Appearance', def: '#0f1020' },
  { key: 'border-radius', label: 'Radius', short: 'Rd', kind: 'number', group: 'Appearance', unit: 'px', min: 0, def: 12, precision: 1 },
  { key: 'filter', label: 'Blur', short: 'Bl', kind: 'blur', group: 'Effects', unit: 'px', min: 0, def: 'blur(0px)', precision: 1 },
  { key: 'box-shadow', label: 'Shadow', short: 'Sh', kind: 'text', group: 'Effects', def: '0 12px 32px rgba(15, 16, 32, 0.22)' },
  { key: 'clip-path', label: 'Clip path', short: 'Cl', kind: 'text', group: 'Effects', def: 'inset(0% 0% 0% 0%)' },
  { key: 'background-position', label: 'BG position', short: 'BP', kind: 'text', group: 'Effects', def: '0% 50%' },
  { key: 'letter-spacing', label: 'Letter spacing', short: 'LS', kind: 'number', group: 'Layout', unit: 'px', def: 0, precision: 2 },
  { key: 'width', label: 'Width', short: 'W', kind: 'number', group: 'Layout', unit: 'px', min: 0, def: 200, precision: 0 },
  { key: 'height', label: 'Height', short: 'H', kind: 'number', group: 'Layout', unit: 'px', min: 0, def: 120, precision: 0 },
  { key: 'transform-origin', label: 'Origin', short: 'Or', kind: 'text', group: 'Layout', def: '50% 50%' },
  { key: 'stroke-dashoffset', label: 'Stroke offset', short: 'SO', kind: 'number', group: 'SVG', step: 0.01, def: 0, precision: 3 },
  { key: 'stroke-dasharray', label: 'Stroke dash', short: 'SD', kind: 'text', group: 'SVG', def: '1' },
  { key: 'fill-opacity', label: 'Fill opacity', short: 'FO', kind: 'number', group: 'SVG', step: 0.01, min: 0, max: 1, def: 1, precision: 2 },
  { key: 'stroke', label: 'Stroke color', short: 'St', kind: 'color', group: 'SVG', def: '#7c5cff' },
  { key: 'fill', label: 'Fill color', short: 'Fi', kind: 'color', group: 'SVG', def: '#7c5cff' },
];

const channelMap = new Map(CHANNELS.map((c) => [c.key, c]));

export function channelDef(key: string): ChannelDef {
  return channelMap.get(key) ?? { key, label: key, short: key.slice(0, 2), kind: 'text', group: 'Effects', def: '' };
}

/** Stable display order for a set of keys. */
export function sortChannelKeys(keys: Iterable<string>): string[] {
  const order = new Map(CHANNELS.map((c, i) => [c.key, i]));
  return [...keys].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b));
}

// ─── Nodes ────────────────────────────────────────────────────────────────

export function NodeIcon({ type }: { type: NodeType }) {
  switch (type) {
    case 'frame':
      return <Frame />;
    case 'text':
      return <Type />;
    case 'button':
      return <RectangleHorizontal />;
    case 'link':
      return <Link />;
    case 'image':
      return <ImageIcon />;
    case 'svg':
      return <PenTool />;
    case 'input':
    case 'textarea':
      return <TextCursorInput />;
    case 'select':
      return <ChevronsUpDown />;
    case 'video':
      return <Video />;
    case 'instance':
      return <Component />;
    default:
      return <Square />;
  }
}
