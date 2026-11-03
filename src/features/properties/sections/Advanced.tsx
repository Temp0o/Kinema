import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { docApi } from '@/core/store/docStore';
import { setProps } from '@/core/store/actions';
import { parseDeclarations, styleMapToCss } from '@/core/style/style';
import { Button, IconButton, Section, TextInput } from '@/ui/primitives';
import { Dropdown } from '@/ui/menu';
import { CodeEditor } from '../CodeEditor';
import { bpName, STATE_LABELS, SubHead } from '../controls';
import { attrNameError } from '../lib/content';
import type { Scope } from '../scope';

export function AdvancedSection({ scope }: { scope: Scope }) {
  return (
    <Section title="Advanced" id="dp-advanced" defaultCollapsed>
      {scope.nodes.length === 1 ? (
        <>
          <CssBlock scope={scope} />
          {!scope.state && <AttrsEditor scope={scope} />}
        </>
      ) : (
        <div className="k-hint">Select a single layer to edit its CSS and attributes.</div>
      )}
    </Section>
  );
}

function CssBlock({ scope }: { scope: Scope }) {
  const node = scope.nodes[0];
  const map = scope.state ? node.states?.[scope.state] ?? {} : node.styles[scope.bp] ?? {};
  const source = styleMapToCss(map, '');
  const [draft, setDraft] = useState(source);
  const dirty = draft !== source;
  useEffect(() => setDraft(source), [source]);
  const where = scope.state ? `${STATE_LABELS[scope.state]} state` : scope.isBase ? 'base styles' : `${bpName(scope)} overrides (inherited values not shown)`;
  const apply = (text: string) => {
    const next = parseDeclarations(text.replace(/\/\*[\s\S]*?\*\//g, ''));
    for (const k of Object.keys(next)) if (/^on/i.test(k) || /[{}<>]/.test(next[k])) delete next[k];
    docApi.mutate(scope.state ? `Edit ${scope.state} CSS` : 'Edit CSS', (d) => {
      const n = d.nodes[node.id];
      if (!n) return;
      if (scope.state) {
        n.states ??= {};
        if (Object.keys(next).length) n.states[scope.state] = next;
        else delete n.states[scope.state];
      } else if (scope.isBase) n.styles.base = next;
      else if (Object.keys(next).length) n.styles[scope.bp] = next;
      else delete n.styles[scope.bp];
    });
    toast.success('CSS applied', { duration: 1200 });
  };
  return (
    <div className="k-stack">
      <SubHead>CSS · {where}</SubHead>
      <CodeEditor value={draft} onChange={setDraft} onSubmit={apply} language="css" minHeight={90} maxHeight={300} compact ariaLabel="Layer CSS" />
      <div className="k-hstack" style={{ justifyContent: 'flex-end' }}>
        <span className="k-hint" style={{ marginRight: 'auto' }}>
          Mod+Enter to apply
        </span>
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setDraft(source)}>
          Revert
        </Button>
        <Button size="sm" variant="primary" disabled={!dirty} onClick={() => apply(draft)} data-testid="apply-css">
          Apply
        </Button>
      </div>
    </div>
  );
}

const PRESET_ATTRS = ['id', 'aria-label', 'role', 'title', 'data-'];

function AttrsEditor({ scope }: { scope: Scope }) {
  const node = scope.nodes[0];
  const attrs = node.props.attrs ?? {};
  const [newKey, setNewKey] = useState('');
  const write = (next: Record<string, string>, label = 'Edit attributes') => setProps([node.id], { attrs: Object.keys(next).length ? next : undefined }, { label });
  const add = (key: string) => {
    const k = key.trim();
    const err = attrNameError(k);
    if (err) return toast.error(err);
    if (k in attrs) return toast.error(`“${k}” already exists`);
    write({ ...attrs, [k]: '' }, 'Add attribute');
    setNewKey('');
  };
  return (
    <div className="k-stack" style={{ marginTop: 10 }}>
      <SubHead
        actions={
          <Dropdown
            align="end"
            items={PRESET_ATTRS.map((a) => ({
              label: a === 'data-' ? 'data-… (custom data)' : a,
              disabled: a !== 'data-' && a in attrs,
              onSelect: () => (a === 'data-' ? setNewKey('data-') : add(a)),
            }))}
            trigger={
              <button type="button" className="k-iconbtn k-iconbtn--sm" aria-label="Add attribute">
                <Plus />
              </button>
            }
          />
        }
      >
        Attributes
      </SubHead>
      {Object.entries(attrs).map(([k, v]) => (
        <div key={k} className="k-attrrow">
          <span className="k-mono k-attrrow__key" title={k}>
            {k}
          </span>
          <TextInput value={v} onCommit={(nv) => write({ ...attrs, [k]: nv })} aria-label={`${k} value`} />
          <IconButton
            label="Remove attribute"
            size="sm"
            noTooltip
            onClick={() => {
              const next = { ...attrs };
              delete next[k];
              write(next, 'Remove attribute');
            }}
          >
            <Trash2 />
          </IconButton>
        </div>
      ))}
      <TextInput value={newKey} onChange={setNewKey} onCommit={(v) => v.trim() && add(v)} placeholder="New attribute name ↵" aria-label="New attribute name" wrapClassName="k-mono-input" />
      <span className="k-hint">Exported verbatim. Event handlers (on*) are blocked.</span>
    </div>
  );
}
