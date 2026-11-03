/**
 * Bottom-dock "Code" tab: live, read-only HTML / CSS / JS for the selection or
 * the current page, updated (debounced) as the design changes.
 */
import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { currentRootId } from '@/core/store/actions';
import { Button, Segmented } from '@/ui/primitives';
import { compileFragment, compileSiteText } from '@/core/export';
import { CodeViewer, type CodeLang } from './CodeViewer';
import { copyText, previewOptions } from './exportService';
import './export.css';

type Scope = 'selection' | 'page';
interface Code {
  html: string;
  css: string;
  js: string;
  note: string;
  reveal: Record<CodeLang, string | null>;
}

const SCOPE_KEY = 'kinema.codeScope';

function build(scope: Scope): Code {
  const doc = useDoc.getState().doc;
  const ui = useUI.getState();
  const sel = ui.selection.find((id) => doc.nodes[id]);
  const none = { html: null, css: null, js: null };
  if (scope === 'selection' && sel) {
    const f = compileFragment(doc, sel, { title: doc.settings.title });
    return { ...f, note: `“${doc.nodes[sel].name}”`, reveal: none };
  }
  const rootId = currentRootId();
  if (!rootId) return { html: '', css: '', js: '', note: '', reveal: none };
  const page = doc.pages.find((p) => p.rootId === rootId);
  const opts = { ...previewOptions(), bundle: 'files' as const, assets: 'files' as const };
  const r = compileSiteText(doc, page ? { ...opts, pageIds: [page.id] } : { ...opts, rootNodeId: rootId });
  const file = (p: string) => (r.files.find((f) => f.path === p)?.data as string) ?? '';
  const cls = sel ? r.classMap[sel] : undefined;
  const note = scope === 'selection' ? 'Nothing selected — showing the page' : page ? `${page.name} · ${r.pages[0]?.file ?? ''}` : 'Component';
  return {
    html: file(r.entry),
    css: file('styles.css'),
    js: file('script.js'),
    note,
    reveal: { html: cls ? `class="${cls}` : null, css: cls ? `.${cls} {` : null, js: null },
  };
}

export function CodePanel() {
  const [lang, setLang] = useState<CodeLang>('html');
  const [scope, setScope] = useState<Scope>(() => {
    try {
      return (localStorage.getItem(SCOPE_KEY) as Scope) || 'selection';
    } catch {
      return 'selection';
    }
  });
  const [code, setCode] = useState<Code>(() => build(scope));

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setCode(build(scope)), 250);
    };
    setCode(build(scope));
    const u1 = useDoc.subscribe((s, p) => s.doc !== p.doc && schedule());
    const u2 = useUI.subscribe((s, p) => (s.selection !== p.selection || s.activePageId !== p.activePageId || s.editingComponentId !== p.editingComponentId) && schedule());
    return () => {
      if (t) clearTimeout(t);
      u1();
      u2();
    };
  }, [scope]);

  const value = code[lang];
  const label = lang === 'html' ? 'HTML' : lang === 'css' ? 'CSS' : 'JavaScript';
  return (
    <div className="k-codepanel">
      <div className="k-codepanel__bar">
        <Segmented
          value={lang}
          onChange={setLang}
          options={[
            { value: 'html', label: 'HTML' },
            { value: 'css', label: 'CSS' },
            { value: 'js', label: 'JS' },
          ]}
        />
        <Segmented
          value={scope}
          onChange={(v) => {
            setScope(v);
            try {
              localStorage.setItem(SCOPE_KEY, v);
            } catch {
              /* ignore */
            }
          }}
          options={[
            { value: 'selection', label: 'Selection' },
            { value: 'page', label: 'Page' },
          ]}
        />
        <span className="k-codepanel__note">{code.note}</span>
        <span className="k-codepanel__spacer" />
        <Button size="sm" variant="ghost" icon={<Copy />} disabled={!value} onClick={() => void copyText(value, label)}>
          Copy {label}
        </Button>
      </div>
      {value ? (
        <CodeViewer value={value} lang={lang} reveal={code.reveal[lang]} ariaLabel={`Generated ${label}`} />
      ) : (
        <div className="k-codepanel__empty">{lang === 'js' ? 'No JavaScript needed — all animations here are pure CSS.' : 'Nothing to show'}</div>
      )}
    </div>
  );
}
