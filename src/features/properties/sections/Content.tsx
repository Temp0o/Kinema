import { useMemo, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Code, Component, ExternalLink, Plus, RefreshCw, Trash2, Unlink, Upload, Palette } from 'lucide-react';
import type { KAsset, KNode } from '@/core/model/types';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { setProps } from '@/core/store/actions';
import { assetRef, ensureAssetUrl, useAssetUrls } from '@/core/assets/assetStore';
import { platform } from '@/platform';
import { importFiles } from '@/features/assets/importer';
import { getCommands, runCommand, subscribeCommands } from '@/features/shortcuts/shortcuts';
import { sanitizeSvg } from '@/features/canvas/NodeView';
import { Button, Dialog, IconButton, Row, Section, Select, Switch, TextArea, TextInput } from '@/ui/primitives';
import { ColorField } from '@/ui/color/ColorPicker';
import { htmlToPlain, plainToHtml, hasRichFormatting, extractSvgColors, replaceSvgColor, svgToCurrentColor } from '../lib/content';
import { applyPatch, historyStep, readProp, setProp, type Scope } from '../scope';
import { AlignGrid, PropRow } from '../controls';
import { CodeEditor } from '../CodeEditor';
import type { AlignPos } from '../lib/layout';

const coalesce = (ids: string[], k: string) => ({ coalesceKey: `props:${ids.join(',')}:${k}` });

function common<T>(nodes: KNode[], fn: (n: KNode) => T): { value: T; mixed: boolean } {
  const v = nodes.map(fn);
  return { value: v[0], mixed: v.some((x) => JSON.stringify(x) !== JSON.stringify(v[0])) };
}

function useCommandAvailable(id: string): boolean {
  return useSyncExternalStore(subscribeCommands, () => getCommands().some((c) => c.id === id && (!c.when || c.when())));
}

export function ContentSection({ scope }: { scope: Scope }) {
  const nodes = scope.nodes;
  const type = nodes[0].type;
  if (!nodes.every((n) => n.type === type)) return null;
  let body: React.ReactNode = null;
  switch (type) {
    case 'text':
      body = <TextContent nodes={nodes} />;
      break;
    case 'button':
    case 'link':
      body = <ButtonLinkContent nodes={nodes} />;
      break;
    case 'image':
      body = <ImageContent scope={scope} />;
      break;
    case 'input':
    case 'textarea':
    case 'select':
      body = <FormContent nodes={nodes} scope={scope} />;
      break;
    case 'video':
      body = <VideoContent nodes={nodes} />;
      break;
    case 'svg':
      body = <SvgContent scope={scope} />;
      break;
    case 'instance':
      body = <InstanceContent nodes={nodes} />;
      break;
    default:
      return null;
  }
  return (
    <Section title="Content" id="dp-content">
      <div className="k-stack">{body}</div>
    </Section>
  );
}

// ─── Text ───────────────────────────────────────────────────────────────────

function TextEditor({ nodes, label = 'Text' }: { nodes: KNode[]; label?: string }) {
  const { value, mixed } = common(nodes, (n) => n.props.text ?? '');
  const plain = htmlToPlain(value);
  const rich = nodes.some((n) => hasRichFormatting(n.props.text));
  const ids = nodes.map((n) => n.id);
  return (
    <div className="k-stack">
      <TextArea
        value={mixed ? '' : plain}
        placeholder={mixed ? 'Mixed — typing replaces all' : 'Type text…'}
        rows={Math.min(8, Math.max(2, plain.split('\n').length))}
        onCommit={(v) => {
          if (!mixed && v === plain) return; // untouched: keep rich text
          setProps(ids, { text: plainToHtml(v) }, { label: `Edit ${label.toLowerCase()}`, ...coalesce(ids, 'text') });
        }}
      />
      {rich && <span className="k-hint">Has inline formatting (bold, links…). Editing here replaces it with plain text; double-click on the canvas to edit rich text.</span>}
    </div>
  );
}

function TextContent({ nodes }: { nodes: KNode[] }) {
  return <TextEditor nodes={nodes} />;
}

function ButtonLinkContent({ nodes }: { nodes: KNode[] }) {
  const ids = nodes.map((n) => n.id);
  const isLink = nodes[0].type === 'link';
  const hasKids = nodes.some((n) => n.children.length > 0);
  const href = common(nodes, (n) => n.props.href ?? '');
  const target = common(nodes, (n) => n.props.target ?? '_self');
  const btnType = common(nodes, (n) => n.props.attrs?.type ?? 'button');
  return (
    <>
      {!hasKids && <TextEditor nodes={nodes} label="Label" />}
      {isLink ? (
        <>
          <Row label="Link">
            <TextInput value={href.mixed ? '' : href.value} placeholder={href.mixed ? 'Mixed' : 'https://… or #section'} onCommit={(v) => setProps(ids, { href: v.trim() || undefined }, { label: 'Edit link' })} icon={<ExternalLink />} />
          </Row>
          <Row label="New tab">
            <Switch checked={!target.mixed && target.value === '_blank'} onChange={(v) => setProps(ids, { target: v ? '_blank' : undefined }, { label: 'Open in new tab' })} ariaLabel="Open in new tab" />
          </Row>
        </>
      ) : (
        <Row label="Type">
          <Select
            value={btnType.mixed ? '' : btnType.value}
            placeholder="Mixed"
            onChange={(v) =>
              historyStep('Button type', () => {
                for (const n of nodes) setProps([n.id], { attrs: { ...(n.props.attrs ?? {}), type: v } });
              })
            }
            options={['button', 'submit', 'reset'].map((t) => ({ value: t, label: t }))}
          />
        </Row>
      )}
    </>
  );
}

// ─── Assets ─────────────────────────────────────────────────────────────────

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'];
const VIDEO_EXT = ['mp4', 'webm', 'mov', 'm4v', 'ogg'];

async function pickAndImport(accept: string[]): Promise<KAsset | null> {
  const files = await platform.files.open({ accept, multiple: false });
  if (!files.length) return null;
  const assets = await importFiles(files);
  const asset = assets[0];
  if (!asset) {
    toast.error('Could not import file');
    return null;
  }
  const pid = useUI.getState().projectId;
  if (pid) await ensureAssetUrl(pid, asset).catch(() => {});
  return asset;
}

export function AssetPicker({ kinds, value, onPick }: { kinds: KAsset['kind'][]; value: string; onPick: (ref: string) => void }) {
  const assets = useDoc((s) => s.doc.assets);
  const urls = useAssetUrls((s) => s.urls);
  const list = useMemo(() => Object.values(assets).filter((a) => kinds.includes(a.kind)).sort((a, b) => b.createdAt - a.createdAt), [assets, kinds]);
  if (!list.length) return <div className="k-hint">No {kinds.includes('video') ? 'videos' : 'images'} in this project yet.</div>;
  return (
    <div className="k-assetgrid" role="listbox" aria-label="Project assets">
      {list.map((a) => (
        <button
          key={a.id}
          type="button"
          role="option"
          aria-selected={value === assetRef(a.id)}
          className="k-assetgrid__item"
          title={a.name}
          onClick={() => onPick(assetRef(a.id))}
        >
          {a.kind === 'video' ? <video src={urls[a.id]} muted preload="metadata" /> : urls[a.id] ? <img src={urls[a.id]} alt="" draggable={false} /> : <span className="k-hint">…</span>}
        </button>
      ))}
    </div>
  );
}

function SourceField({ nodes, kinds, accept }: { nodes: KNode[]; kinds: KAsset['kind'][]; accept: string[] }) {
  const ids = nodes.map((n) => n.id);
  const src = common(nodes, (n) => n.props.src ?? '');
  const assets = useDoc((s) => s.doc.assets);
  const isAsset = src.value.startsWith('asset:');
  const asset = isAsset ? assets[src.value.slice(6)] : undefined;
  const [busy, setBusy] = useState(false);
  const setSrc = (v: string) => setProps(ids, { src: v }, { label: 'Change source' });
  return (
    <>
      <AssetPicker kinds={kinds} value={src.mixed ? '' : src.value} onPick={setSrc} />
      <Row label="Source">
        <TextInput
          value={src.mixed ? '' : asset ? asset.name : src.value}
          placeholder={src.mixed ? 'Mixed' : 'Paste a URL'}
          onCommit={(v) => {
            if (asset && v === asset.name) return;
            setSrc(v.trim());
          }}
        />
      </Row>
      <Button
        size="sm"
        icon={<Upload />}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const a = await pickAndImport(accept);
            if (a) setSrc(assetRef(a.id));
          } finally {
            setBusy(false);
          }
        }}
      >
        Replace…
      </Button>
    </>
  );
}

const FITS = ['cover', 'contain', 'fill', 'none', 'scale-down'];

function parseObjPos(v: string | undefined): { h: AlignPos; v: AlignPos } {
  const t = (v ?? '50% 50%').toLowerCase();
  const h: AlignPos = /left|^0%/.test(t) ? 'start' : /right|^100%/.test(t) ? 'end' : 'center';
  const vv: AlignPos = /top|\s0%$/.test(t) ? 'start' : /bottom|\s100%$/.test(t) ? 'end' : 'center';
  return { h, v: vv };
}

export function posToCss(h: AlignPos, v: AlignPos): string {
  const hx = h === 'start' ? 'left' : h === 'end' ? 'right' : 'center';
  const vy = v === 'start' ? 'top' : v === 'end' ? 'bottom' : 'center';
  return hx === 'center' && vy === 'center' ? 'center' : `${hx} ${vy}`;
}

function ImageContent({ scope }: { scope: Scope }) {
  const nodes = scope.nodes;
  const ids = scope.ids;
  const alt = common(nodes, (n) => n.props.alt ?? '');
  const fit = readProp(scope, 'object-fit');
  const pos = parseObjPos(readProp(scope, 'object-position').value);
  return (
    <>
      <SourceField nodes={nodes} kinds={['image', 'svg']} accept={IMAGE_EXT} />
      <Row label="Alt text">
        <TextInput value={alt.mixed ? '' : alt.value} placeholder={alt.mixed ? 'Mixed' : 'Describe the image'} onCommit={(v) => setProps(ids, { alt: v }, { label: 'Edit alt text' })} />
      </Row>
      <PropRow scope={scope} props={['object-fit']} label="Fit">
        <Select value={fit.mixed ? '' : fit.value ?? 'fill'} placeholder="Mixed" onChange={(v) => setProp(scope, 'object-fit', v)} options={FITS.map((f) => ({ value: f, label: f }))} />
      </PropRow>
      <PropRow scope={scope} props={['object-position']} label="Position">
        <AlignGrid h={pos.h} v={pos.v} onPick={(h, v) => applyPatch(scope, { 'object-position': posToCss(h, v) })} ariaLabel="Object position" />
      </PropRow>
    </>
  );
}

// ─── Form fields ────────────────────────────────────────────────────────────

const INPUT_TYPES = ['text', 'email', 'password', 'number', 'search', 'tel', 'url', 'date', 'time', 'checkbox', 'radio', 'range', 'color', 'file'];

function FormContent({ nodes, scope }: { nodes: KNode[]; scope: Scope }) {
  const ids = nodes.map((n) => n.id);
  const type = nodes[0].type;
  const inputType = common(nodes, (n) => n.props.inputType ?? 'text');
  const ph = common(nodes, (n) => n.props.placeholder ?? '');
  const val = common(nodes, (n) => n.props.value ?? '');
  const checked = common(nodes, (n) => !!n.props.checked);
  const toggle = inputType.value === 'checkbox' || inputType.value === 'radio';
  const resize = readProp(scope, 'resize');
  return (
    <>
      {type === 'input' && (
        <Row label="Type">
          <Select value={inputType.mixed ? '' : inputType.value} placeholder="Mixed" onChange={(v) => setProps(ids, { inputType: v }, { label: 'Input type' })} options={INPUT_TYPES.map((t) => ({ value: t, label: t }))} />
        </Row>
      )}
      {type !== 'select' && !toggle && (
        <Row label="Placeholder">
          <TextInput value={ph.mixed ? '' : ph.value} placeholder={ph.mixed ? 'Mixed' : ''} onCommit={(v) => setProps(ids, { placeholder: v || undefined }, { label: 'Edit placeholder' })} />
        </Row>
      )}
      {toggle ? (
        <Row label="Checked">
          <Switch checked={!checked.mixed && checked.value} onChange={(v) => setProps(ids, { checked: v }, { label: 'Toggle checked' })} ariaLabel="Checked" />
        </Row>
      ) : type === 'select' ? (
        <OptionsEditor nodes={nodes} />
      ) : (
        <Row label="Value">
          {type === 'textarea' ? (
            <TextArea value={val.mixed ? '' : val.value} rows={2} onCommit={(v) => setProps(ids, { value: v || undefined }, { label: 'Edit value' })} />
          ) : (
            <TextInput value={val.mixed ? '' : val.value} placeholder={val.mixed ? 'Mixed' : 'Empty'} onCommit={(v) => setProps(ids, { value: v || undefined }, { label: 'Edit value' })} />
          )}
        </Row>
      )}
      {type === 'textarea' && (
        <PropRow scope={scope} props={['resize']} label="Resize">
          <Select value={resize.value ?? 'both'} onChange={(v) => setProp(scope, 'resize', v)} options={['none', 'vertical', 'horizontal', 'both'].map((r) => ({ value: r, label: r }))} />
        </PropRow>
      )}
    </>
  );
}

function OptionsEditor({ nodes }: { nodes: KNode[] }) {
  const ids = nodes.map((n) => n.id);
  const opts = nodes[0].props.options ?? [];
  const value = nodes[0].props.value ?? '';
  const write = (next: string[], label = 'Edit options') => setProps(ids, { options: next }, { label });
  return (
    <div className="k-stack">
      <div className="k-dp-sub">
        <span>Options</span>
        <IconButton label="Add option" size="sm" onClick={() => write([...opts, `Option ${opts.length + 1}`], 'Add option')}>
          <Plus />
        </IconButton>
      </div>
      {opts.map((o, i) => (
        <div key={i} className="k-optrow">
          <TextInput value={o} onCommit={(v) => write(opts.map((x, j) => (j === i ? v : x)))} aria-label={`Option ${i + 1}`} />
          <IconButton label="Move up" size="sm" noTooltip disabled={i === 0} onClick={() => write(opts.map((x, j) => (j === i - 1 ? opts[i] : j === i ? opts[i - 1] : x)))}>
            <ArrowUp />
          </IconButton>
          <IconButton label="Move down" size="sm" noTooltip disabled={i === opts.length - 1} onClick={() => write(opts.map((x, j) => (j === i + 1 ? opts[i] : j === i ? opts[i + 1] : x)))}>
            <ArrowDown />
          </IconButton>
          <IconButton label="Remove option" size="sm" noTooltip onClick={() => write(opts.filter((_, j) => j !== i), 'Remove option')}>
            <Trash2 />
          </IconButton>
        </div>
      ))}
      {opts.length > 0 && (
        <Row label="Selected">
          <Select value={opts.includes(value) ? value : opts[0]} onChange={(v) => setProps(ids, { value: v }, { label: 'Select option' })} options={[...new Set(opts)].map((o) => ({ value: o, label: o }))} />
        </Row>
      )}
    </div>
  );
}

// ─── Video ──────────────────────────────────────────────────────────────────

function VideoContent({ nodes }: { nodes: KNode[] }) {
  const ids = nodes.map((n) => n.id);
  const flag = (k: 'autoplay' | 'loop' | 'muted' | 'controls') => {
    const c = common(nodes, (n) => !!n.props[k]);
    return (
      <Row label={k[0].toUpperCase() + k.slice(1)} key={k}>
        <Switch checked={!c.mixed && c.value} onChange={(v) => setProps(ids, { [k]: v }, { label: `Video ${k}` })} ariaLabel={k} />
      </Row>
    );
  };
  return (
    <>
      <SourceField nodes={nodes} kinds={['video']} accept={VIDEO_EXT} />
      <div className="k-grid2 k-dp-flags">
        {flag('autoplay')}
        {flag('loop')}
        {flag('muted')}
        {flag('controls')}
      </div>
    </>
  );
}

// ─── SVG ────────────────────────────────────────────────────────────────────

function SvgContent({ scope }: { scope: Scope }) {
  const nodes = scope.nodes;
  const single = nodes[0];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const svg = single.props.svg ?? '';
  const colors = useMemo(() => extractSvgColors(svg), [svg]);
  const usesCurrent = /currentcolor/i.test(svg);
  const color = readProp(scope, 'color');
  const writeSvg = (next: string, label: string, final = true) => setProps([single.id], { svg: sanitizeSvg(next) }, { label, ...(final ? {} : coalesce([single.id], 'svg')) });
  if (nodes.length > 1) return <div className="k-hint">Select a single vector to edit its markup and colors.</div>;
  return (
    <>
      <Button
        size="sm"
        icon={<Code />}
        onClick={() => {
          setDraft(svg);
          setOpen(true);
        }}
      >
        Edit SVG code
      </Button>
      {colors.length > 0 && (
        <div className="k-stack">
          <div className="k-dp-sub">
            <span>Colors</span>
            <Button
              size="sm"
              variant="ghost"
              icon={<Palette />}
              onClick={() => {
                const r = svgToCurrentColor(svg);
                historyStep('Use currentColor', () => {
                  setProps([single.id], { svg: sanitizeSvg(r.svg) });
                  if (r.color) setProp(scope, 'color', r.color);
                });
              }}
            >
              Use currentColor
            </Button>
          </div>
          {colors.map((c) => (
            <ColorField key={c} value={c} onChange={(v, o) => writeSvg(replaceSvgColor(svg, c, v), 'Recolor vector', o?.final ?? true)} ariaLabel={`SVG color ${c}`} />
          ))}
        </div>
      )}
      {(usesCurrent || !colors.length) && (
        <PropRow scope={scope} props={['color']} label="Color">
          <ColorField value={color.value ?? ''} placeholder="Inherit" mixed={color.mixed} onChange={(v, o) => setProp(scope, 'color', v, { final: o?.final })} onClear={() => setProp(scope, 'color', null)} />
        </PropRow>
      )}
      {!usesCurrent && !colors.length && (
        <Button size="sm" variant="ghost" icon={<Palette />} onClick={() => writeSvg(svgToCurrentColor(svg).svg, 'Use currentColor')}>
          Use currentColor
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Edit SVG"
        description="Markup is sanitized when applied (scripts and event handlers are removed)."
        width={760}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const clean = sanitizeSvg(draft);
                if (!/<svg[\s>]/i.test(clean)) {
                  toast.error('That markup does not contain a valid <svg> element');
                  return;
                }
                setProps([single.id], { svg: clean }, { label: 'Edit SVG code' });
                setOpen(false);
              }}
            >
              Apply
            </Button>
          </>
        }
      >
        <div className="k-svgedit">
          <CodeEditor value={draft} onChange={setDraft} language="html" minHeight={320} maxHeight={420} ariaLabel="SVG markup" />
          <div className="k-svgedit__preview" dangerouslySetInnerHTML={{ __html: sanitizeSvg(draft) }} />
        </div>
      </Dialog>
    </>
  );
}

// ─── Instance ───────────────────────────────────────────────────────────────

function InstanceContent({ nodes }: { nodes: KNode[] }) {
  const comps = useDoc((s) => s.doc.components);
  const canEdit = useCommandAvailable('component.edit');
  const canDetach = useCommandAvailable('component.detach');
  const c = common(nodes, (n) => n.props.componentId ?? '');
  const comp = c.mixed ? undefined : comps[c.value];
  return (
    <>
      <div className="k-dp-comp">
        <Component />
        <span>{c.mixed ? 'Mixed components' : comp?.name ?? 'Missing component'}</span>
      </div>
      <div className="k-grid2">
        <Button size="sm" icon={<RefreshCw />} disabled={!canEdit || nodes.length > 1} onClick={() => runCommand('component.edit')}>
          Edit component
        </Button>
        <Button size="sm" icon={<Unlink />} disabled={!canDetach} onClick={() => runCommand('component.detach')}>
          Detach
        </Button>
      </div>
    </>
  );
}
