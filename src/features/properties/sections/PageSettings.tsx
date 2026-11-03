import { useEffect, useMemo, useState } from 'react';
import { FileText, Monitor, Plus, Smartphone, Tablet, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { KDocument } from '@/core/model/types';
import { docApi, useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { renamePage, useCurrentRootId } from '@/core/store/actions';
import { uid } from '@/core/model/factory';
import { Button, IconButton, NumberField, Row, Section, TextInput } from '@/ui/primitives';
import { ColorField } from '@/ui/color/ColorPicker';
import { FontPicker, primaryFamily } from '../FontPicker';
import { CodeEditor } from '../CodeEditor';
import { LengthField, PropRow, SubHead } from '../controls';
import { buildScope } from '../scope';
import { FillEditor } from './Style';

function mutateDoc(label: string, fn: (d: KDocument) => void, coalesceKey?: string) {
  docApi.mutate(label, (d) => fn(d as KDocument), { coalesceKey });
}

/** Replace `var(--k-old)` references in every style value. */
function renameTokenRefs(d: KDocument, from: string, to: string) {
  const re = new RegExp(`var\\(\\s*--k-${from.replace(/[-]/g, '\\-')}\\s*([,)])`, 'g');
  for (const n of Object.values(d.nodes)) {
    const maps = [...Object.values(n.styles), ...Object.values(n.states ?? {})];
    for (const m of maps) {
      if (!m) continue;
      for (const k of Object.keys(m)) if (m[k].includes(`--k-${from}`)) m[k] = m[k].replace(re, `var(--k-${to}$1`);
    }
  }
}

const slug = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function PageSettings() {
  const rootId = useCurrentRootId();
  const root = useDoc((s) => (rootId ? s.doc.nodes[rootId] : undefined));
  const breakpoints = useDoc((s) => s.doc.breakpoints);
  const bp = useUI((s) => s.breakpoint);
  const activePageId = useUI((s) => s.activePageId);
  const editingComponent = useUI((s) => s.editingComponentId);
  const page = useDoc((s) => s.doc.pages.find((p) => p.id === activePageId) ?? s.doc.pages[0]);
  const scope = useMemo(() => (root ? buildScope([root], [undefined], bp, null, breakpoints) : null), [root, bp, breakpoints]);

  return (
    <div className="k-dp" data-testid="page-settings">
      <div className="k-dp-head">
        <div className="k-dp-head__row">
          <span className="k-dp-head__icon">
            <FileText />
          </span>
          <div className="k-dp-head__multi">
            <b>{editingComponent ? 'Component' : 'Page'}</b>
            <span>Nothing selected</span>
          </div>
        </div>
      </div>
      {scope && (
        <Section title={editingComponent ? 'Component frame' : 'Page'} id="dp-page">
          {page && !editingComponent && (
            <Row label="Name">
              <TextInput value={page.name} onCommit={(v) => renamePage(page.id, v)} aria-label="Page name" />
            </Row>
          )}
          <SubHead>Background</SubHead>
          <FillEditor scope={scope} />
          <PropRow scope={scope} props={['min-height']} label="Min height">
            <LengthField scope={scope} prop="min-height" label="H" min={0} />
          </PropRow>
        </Section>
      )}
      <TokensSection />
      <DocumentSection />
      <BreakpointsSection />
      <CustomCssSection />
    </div>
  );
}

function TokensSection() {
  const tokens = useDoc((s) => s.doc.tokens);
  const setColor = (id: string, value: string, final: boolean) =>
    mutateDoc(
      'Edit color token',
      (d) => {
        const t = d.tokens.colors.find((c) => c.id === id);
        if (t) t.value = value;
      },
      final ? undefined : `token:${id}`,
    );
  const rename = (id: string, raw: string) => {
    const name = slug(raw);
    const t = tokens.colors.find((c) => c.id === id);
    if (!t || !name || name === t.name) return;
    if (tokens.colors.some((c) => c.name === name)) return toast.error(`A token named “${name}” already exists`);
    if (/^font-|^radius$|^space$/.test(name)) return toast.error('That name is reserved');
    mutateDoc('Rename token', (d) => {
      const tok = d.tokens.colors.find((c) => c.id === id)!;
      renameTokenRefs(d, tok.name, name);
      tok.name = name;
    });
  };
  return (
    <Section title="Design tokens" id="dp-tokens">
      <SubHead
        actions={
          <IconButton
            label="Add color token"
            size="sm"
            onClick={() =>
              mutateDoc('Add color token', (d) => {
                let n = d.tokens.colors.length + 1;
                while (d.tokens.colors.some((c) => c.name === `color-${n}`)) n++;
                d.tokens.colors.push({ id: uid('c'), name: `color-${n}`, value: '#7c5cff' });
              })
            }
          >
            <Plus />
          </IconButton>
        }
      >
        Colors
      </SubHead>
      <div className="k-stack" data-testid="token-list">
        {tokens.colors.map((t) => (
          <div key={t.id} className="k-tokrow">
            <ColorField value={t.value} onChange={(v, o) => setColor(t.id, v, o?.final ?? true)} swatches={false} ariaLabel={`${t.name} color`} />
            <TextInput value={t.name} onCommit={(v) => rename(t.id, v)} aria-label="Token name" wrapClassName="k-mono-input" />
            <IconButton
              label="Remove token"
              size="sm"
              noTooltip
              onClick={() =>
                mutateDoc('Remove color token', (d) => {
                  d.tokens.colors = d.tokens.colors.filter((c) => c.id !== t.id);
                })
              }
            >
              <Trash2 />
            </IconButton>
          </div>
        ))}
      </div>
      <SubHead>Fonts</SubHead>
      {(['heading', 'body', 'mono'] as const).map((k) => (
        <Row key={k} label={k[0].toUpperCase() + k.slice(1)}>
          <FontPicker
            value={`'${tokens.fonts[k]}'`}
            withTokens={false}
            ariaLabel={`${k} font`}
            onChange={(v) =>
              mutateDoc('Change token font', (d) => {
                d.tokens.fonts[k] = primaryFamily(v);
              })
            }
          />
        </Row>
      ))}
      <Row label="Units">
        <div className="k-grid2">
          <NumberField label="◜" labelTitle="Radius token (--k-radius)" value={tokens.radius} min={0} suffix="px" onChange={(n, o) => mutateDoc('Change radius token', (d) => void (d.tokens.radius = n), o.final ? undefined : 'tok-radius')} />
          <NumberField label="␣" labelTitle="Spacing unit (--k-space)" value={tokens.spacing} min={0} suffix="px" onChange={(n, o) => mutateDoc('Change spacing token', (d) => void (d.tokens.spacing = n), o.final ? undefined : 'tok-space')} />
        </div>
      </Row>
    </Section>
  );
}

function DocumentSection() {
  const settings = useDoc((s) => s.doc.settings);
  return (
    <Section title="Document" id="dp-document">
      <Row label="Title">
        <TextInput value={settings.title} onCommit={(v) => mutateDoc('Change title', (d) => void (d.settings.title = v.trim()))} aria-label="Document title" />
      </Row>
      <Row label="Grid size">
        <NumberField value={settings.gridSize} min={1} max={200} suffix="px" precision={0} onChange={(n, o) => mutateDoc('Change grid size', (d) => void (d.settings.gridSize = Math.max(1, Math.round(n))), o.final ? undefined : 'grid')} />
      </Row>
    </Section>
  );
}

function BreakpointsSection() {
  const bps = useDoc((s) => s.doc.breakpoints);
  const active = useUI((s) => s.breakpoint);
  const icon = (i: string) => (i === 'mobile' ? <Smartphone /> : i === 'tablet' ? <Tablet /> : <Monitor />);
  const write = (id: string, patch: { width?: number; maxWidth?: number; name?: string }) => {
    mutateDoc('Edit breakpoint', (d) => {
      const b = d.breakpoints.find((x) => x.id === id);
      if (b) Object.assign(b, patch);
    });
    if (patch.width && id === active) useUI.getState().set({ canvasWidth: patch.width });
  };
  return (
    <Section title="Breakpoints" id="dp-breakpoints">
      {bps.map((b, i) => (
        <div key={b.id} className="k-bprow" data-active={b.id === active ? 'true' : undefined}>
          <span className="k-bprow__icon">{icon(b.icon)}</span>
          <TextInput value={b.name} onCommit={(v) => v.trim() && write(b.id, { name: v.trim() })} aria-label="Breakpoint name" />
          <NumberField label="W" labelTitle="Canvas width" value={b.width} min={200} max={4000} precision={0} onChange={(n, o) => o.final && write(b.id, { width: Math.round(n) })} />
          {i > 0 ? (
            <NumberField label="≤" labelTitle="Media query max-width" value={b.maxWidth ?? null} min={200} max={4000} precision={0} onChange={(n, o) => o.final && write(b.id, { maxWidth: Math.round(n) })} />
          ) : (
            <span className="k-hint" style={{ textAlign: 'center' }}>
              base
            </span>
          )}
        </div>
      ))}
    </Section>
  );
}

function CustomCssSection() {
  const css = useDoc((s) => s.doc.settings.customCss ?? '');
  const [draft, setDraft] = useState(css);
  useEffect(() => setDraft(css), [css]);
  const apply = (v: string) => {
    if (v === css) return;
    mutateDoc('Edit custom CSS', (d) => {
      d.settings.customCss = v.trim() ? v : undefined;
    });
  };
  return (
    <Section title="Custom CSS" id="dp-customcss" defaultCollapsed>
      <CodeEditor value={draft} onChange={setDraft} onSubmit={apply} onBlur={apply} language="css" minHeight={120} maxHeight={360} ariaLabel="Project custom CSS" />
      <div className="k-hstack" style={{ marginTop: 6 }}>
        <span className="k-hint" style={{ flex: 1 }}>
          Applied to the canvas and exports. Saved on blur or Mod+Enter.
        </span>
        <Button size="sm" variant="primary" disabled={draft === css} onClick={() => apply(draft)}>
          Apply
        </Button>
      </div>
    </Section>
  );
}
