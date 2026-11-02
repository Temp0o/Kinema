/**
 * Renders document nodes as real DOM on the canvas. Every element gets
 * `data-kid="<nodeId>"` so overlays, hit-testing and the animation engine can find
 * it. Nodes inside a component instance get `data-kmid="<masterId>"` and
 * `data-kinst="<instanceId>"` instead (the instance root carries the data-kid).
 */
import { createContext, memo, useContext, type CSSProperties, type ReactElement } from 'react';
import DOMPurify from 'dompurify';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { resolveStyles, toReactStyle } from '@/core/style/style';
import { resolveAssetRefs, useAssetUrls } from '@/core/assets/assetStore';
import { DEFAULT_TAGS } from '@/core/model/factory';
import type { InstanceOverride, KNode, NodeId, StyleMap } from '@/core/model/types';

// ─── Sanitizers (memoized) ──────────────────────────────────────────────────

const RICH_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'span', 'a', 'code', 'mark', 'small', 'sub', 'sup', 'del', 'ins'];
const richCache = new Map<string, string>();
export function sanitizeRich(html: string): string {
  let v = richCache.get(html);
  if (v === undefined) {
    v = DOMPurify.sanitize(html, { ALLOWED_TAGS: RICH_TAGS, ALLOWED_ATTR: ['style', 'href', 'class', 'target', 'rel'] });
    if (richCache.size > 2000) richCache.clear();
    richCache.set(html, v);
  }
  return v;
}

const svgCache = new Map<string, string>();
export function sanitizeSvg(svg: string): string {
  let v = svgCache.get(svg);
  if (v === undefined) {
    v = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['use'], FORBID_TAGS: ['script', 'foreignObject'] });
    if (svgCache.size > 500) svgCache.clear();
    svgCache.set(svg, v);
  }
  return v;
}

// ─── Render context ─────────────────────────────────────────────────────────

interface InstanceCtx {
  instanceId: NodeId;
  overrides: Record<NodeId, InstanceOverride>;
  /** instance root styles override master root styles */
  rootStyles?: StyleMap;
  masterRootId: NodeId;
  depth: number;
}

const InstanceContext = createContext<InstanceCtx | null>(null);

const resolvedCache = new WeakMap<KNode, Map<string, StyleMap>>();
function useResolved(node: KNode, bp: string): StyleMap {
  const doc = useDoc.getState().doc;
  let m = resolvedCache.get(node);
  if (!m) {
    m = new Map();
    resolvedCache.set(node, m);
  }
  let v = m.get(bp);
  if (!v) {
    v = resolveStyles(doc, node, bp);
    m.set(bp, v);
  }
  return v;
}

function withAssets(style: StyleMap, urls: Record<string, string>): StyleMap {
  let changed = false;
  const out: StyleMap = {};
  for (const k in style) {
    const v = style[k];
    if (v && v.indexOf('asset:') >= 0) {
      out[k] = resolveAssetRefs(v, urls);
      changed = true;
    } else out[k] = v;
  }
  return changed ? out : style;
}

// ─── NodeView ───────────────────────────────────────────────────────────────

export const NodeView = memo(function NodeView({ id }: { id: NodeId }): ReactElement | null {
  const node = useDoc((s) => s.doc.nodes[id]);
  const bp = useUI((s) => s.breakpoint);
  const forced = useUI((s) => (s.forcedState && s.forcedState.id === id ? s.forcedState.state : null));
  const editingText = useUI((s) => s.editingTextId === id);
  const inst = useContext(InstanceContext);
  const urls = useAssetUrls((s) => s.urls);
  if (!node || node.hidden) return null;
  return <NodeElement node={node} bp={bp} forced={forced} inst={inst} urls={urls} editingText={editingText} />;
});

function NodeElement({
  node,
  bp,
  forced,
  inst,
  urls,
  editingText,
}: {
  node: KNode;
  bp: string;
  forced: 'hover' | 'active' | 'focus' | null;
  inst: InstanceCtx | null;
  urls: Record<string, string>;
  editingText: boolean;
}): ReactElement | null {
  const resolved = useResolved(node, bp);
  const ov = inst?.overrides[node.id];

  let style: StyleMap = resolved;
  if (inst && node.id === inst.masterRootId && inst.rootStyles) style = { ...style, ...inst.rootStyles };
  if (ov?.styles) style = { ...style, ...ov.styles };
  if (forced && node.states?.[forced]) style = { ...style, ...node.states[forced] };
  style = withAssets(style, urls);

  const reactStyle: CSSProperties = toReactStyle(style);
  const dataAttrs: Record<string, string> = inst
    ? { 'data-kmid': node.id, 'data-kinst': inst.instanceId }
    : { 'data-kid': node.id };
  // The master root rendered inside an instance carries the instance id so the
  // instance is measurable/selectable as one element.
  if (inst && node.id === inst.masterRootId) {
    dataAttrs['data-kid'] = inst.instanceId;
    dataAttrs['data-kinstance-root'] = 'true';
  }
  if (node.type === 'frame' && !node.parent) dataAttrs['data-kroot'] = 'true';

  // ── Instances ──
  if (node.type === 'instance') {
    return <InstanceView node={node} bp={bp} />;
  }

  const Tag = (node.tag || DEFAULT_TAGS[node.type]) as keyof React.JSX.IntrinsicElements;
  const text = ov?.text ?? node.props.text ?? '';
  const src = resolveAssetRefs(ov?.src ?? node.props.src ?? '', urls);
  const children = node.children.map((c) => <NodeView key={c} id={c} />);
  const common = { ...dataAttrs, style: reactStyle } as Record<string, unknown>;

  switch (node.type) {
    case 'image': {
      if (!src) {
        return (
          <div {...common} data-kplaceholder="image" style={{ ...reactStyle, ...placeholderStyle }}>
            <ImageGlyph />
          </div>
        );
      }
      return <img {...common} src={src} alt={node.props.alt ?? ''} draggable={false} />;
    }
    case 'video': {
      if (!src) {
        return (
          <div {...common} data-kplaceholder="video" style={{ ...reactStyle, ...placeholderStyle }}>
            <VideoGlyph />
          </div>
        );
      }
      return <video {...common} src={src} muted playsInline preload="metadata" loop={node.props.loop} controls={false} />;
    }
    case 'svg':
      return <div {...common} className="kc-svg" dangerouslySetInnerHTML={{ __html: sanitizeSvg(node.props.svg ?? '') }} />;
    case 'input': {
      const t = node.props.inputType ?? 'text';
      if (t === 'checkbox' || t === 'radio')
        return <input {...common} type={t} readOnly tabIndex={-1} checked={!!node.props.checked} onChange={noop} />;
      return <input {...common} type={t} readOnly tabIndex={-1} placeholder={node.props.placeholder} value={node.props.value ?? ''} onChange={noop} />;
    }
    case 'textarea':
      return <textarea {...common} readOnly tabIndex={-1} placeholder={node.props.placeholder} value={node.props.value ?? ''} onChange={noop} />;
    case 'select':
      return (
        <select {...common} tabIndex={-1} value={node.props.value ?? ''} onChange={noop}>
          {(node.props.options ?? []).map((o, i) => (
            <option key={i} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case 'text':
    case 'button':
    case 'link': {
      if (node.children.length) return <Tag {...common}>{children}</Tag>;
      return (
        <Tag
          {...common}
          {...(node.type === 'button' ? ({ type: 'button', tabIndex: -1 } as Record<string, unknown>) : {})}
          data-kediting={editingText ? 'true' : undefined}
          dangerouslySetInnerHTML={{ __html: sanitizeRich(text) || (editingText ? '' : '&#8203;') }}
        />
      );
    }
    default:
      return <Tag {...common}>{children}</Tag>;
  }
}

function noop() {}

const placeholderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(124, 92, 255, 0.08)',
  backgroundImage:
    'repeating-linear-gradient(45deg, rgba(124,92,255,0.07) 0 10px, transparent 10px 20px)',
  color: 'rgba(124, 92, 255, 0.6)',
};

function ImageGlyph() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ maxWidth: '40%', maxHeight: '40%' }}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
function VideoGlyph() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ maxWidth: '40%', maxHeight: '40%' }}>
      <rect x="2" y="5" width="15" height="14" rx="2" />
      <path d="M17 10l5-3v10l-5-3z" />
    </svg>
  );
}

// ─── Instances ──────────────────────────────────────────────────────────────

function InstanceView({ node, bp }: { node: KNode; bp: string }) {
  const comp = useDoc((s) => (node.props.componentId ? s.doc.components[node.props.componentId] : undefined));
  const parentInst = useContext(InstanceContext);
  const instStyles = useResolved(node, bp);
  if (!comp || (parentInst && parentInst.depth > 8)) {
    return (
      <div data-kid={node.id} style={{ ...toReactStyle(instStyles), ...placeholderStyle, minWidth: 80, minHeight: 40, fontSize: 12 }}>
        Missing component
      </div>
    );
  }
  const ctx: InstanceCtx = {
    instanceId: node.id,
    overrides: node.overrides ?? {},
    rootStyles: instStyles,
    masterRootId: comp.rootId,
    depth: (parentInst?.depth ?? 0) + 1,
  };
  return (
    <InstanceContext.Provider value={ctx}>
      <NodeView id={comp.rootId} />
    </InstanceContext.Provider>
  );
}
