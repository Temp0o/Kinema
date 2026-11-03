/**
 * Export dialog: scope × format × options, a live file tree with sizes and a
 * code preview of every generated text file.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Archive,
  Boxes,
  ChevronDown,
  Clipboard,
  ExternalLink,
  File as FileIcon,
  FileCode2,
  FileImage,
  FileType,
  Files,
  Folder,
  FolderOpen,
  Layers,
  Upload,
} from 'lucide-react';
import { useDoc } from '@/core/store/docStore';
import { useUI } from '@/core/store/uiStore';
import { Button, Dialog, Segmented, Select, Switch, Tooltip } from '@/ui/primitives';
import { compileSite, compileSiteText, type CompileResult, type ExportOptions, type OutFile } from '@/core/export';
import { CodeViewer, type CodeLang } from './CodeViewer';
import { activePageId, copyText, openInBrowser, readers, saveResult, siteSlug, siteTitle, type ExportFormat } from './exportService';
import './export.css';

type Scope = 'project' | 'page' | 'selection';

interface Prefs {
  scope: Scope;
  format: ExportFormat;
  minify: boolean;
  reducedMotion: boolean;
  inlineAssets: boolean;
}
const PREFS_KEY = 'kinema.exportPrefs';
const DEFAULT_PREFS: Prefs = { scope: 'project', format: 'folder', minify: false, reducedMotion: true, inlineAssets: false };
function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
const sizeOf = (f: OutFile) => (typeof f.data === 'string' ? new TextEncoder().encode(f.data).length : f.data.length);
const langOf = (path: string): CodeLang | null => (path.endsWith('.html') ? 'html' : path.endsWith('.css') ? 'css' : path.endsWith('.js') ? 'js' : null);

function Choice({ checked, onSelect, icon, label, desc, disabled }: { checked: boolean; onSelect: () => void; icon: ReactNode; label: string; desc: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="k-choice" onClick={onSelect} disabled={disabled}>
      <span className="k-choice__icon">{icon}</span>
      <span className="k-choice__text">
        <span className="k-choice__label">{label}</span>
        <span className="k-choice__desc">{desc}</span>
      </span>
    </button>
  );
}

function Option({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="k-option">
      <div className="k-option__text">
        <div className="k-option__label">{label}</div>
        <div className="k-option__desc">{desc}</div>
      </div>
      <Switch checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

function FileTree({ files, onOpen }: { files: OutFile[]; onOpen: (path: string) => void }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const top = files.filter((f) => !f.path.includes('/'));
  const folders = new Map<string, OutFile[]>();
  for (const f of files) {
    const i = f.path.indexOf('/');
    if (i < 0) continue;
    const dir = f.path.slice(0, i);
    if (!folders.has(dir)) folders.set(dir, []);
    folders.get(dir)!.push(f);
  }
  const icon = (p: string) => {
    const l = langOf(p);
    if (l) return <FileCode2 />;
    if (/\.(woff2?|ttf|otf)$/.test(p)) return <FileType />;
    if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(p)) return <FileImage />;
    return <FileIcon />;
  };
  const row = (f: OutFile, indent: number) => (
    <button key={f.path} type="button" className="k-tree__row" data-kind={langOf(f.path) ?? 'bin'} style={{ paddingLeft: 8 + indent * 18 }} onClick={() => onOpen(f.path)}>
      {icon(f.path)}
      <span className="k-tree__name">{f.path.split('/').pop()}</span>
      <span className="k-tree__size">{formatBytes(sizeOf(f))}</span>
    </button>
  );
  return (
    <div className="k-tree" role="tree" aria-label="Exported files">
      {[...folders.entries()].map(([dir, list]) => {
        const open = !closed.has(dir);
        return (
          <div key={dir}>
            <button
              type="button"
              className="k-tree__row"
              data-folder="true"
              aria-expanded={open}
              onClick={() => setClosed((s) => {
                const n = new Set(s);
                if (n.has(dir)) n.delete(dir);
                else n.add(dir);
                return n;
              })}
            >
              <ChevronDown style={{ transform: open ? undefined : 'rotate(-90deg)', transition: 'transform 120ms' }} />
              {open ? <FolderOpen /> : <Folder />}
              <span className="k-tree__name">{dir}/</span>
              <span className="k-tree__size">
                {list.length} {list.length === 1 ? 'file' : 'files'} · {formatBytes(list.reduce((s, f) => s + sizeOf(f), 0))}
              </span>
            </button>
            {open && list.map((f) => row(f, 1))}
          </div>
        );
      })}
      {top.map((f) => row(f, 0))}
    </div>
  );
}

export function ExportDialog() {
  const open = useUI((s) => s.exportOpen);
  return open ? <ExportDialogInner /> : null;
}

function ExportDialogInner() {
  const doc = useDoc((s) => s.doc);
  const selection = useUI((s) => s.selection);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [view, setView] = useState<'files' | 'code'>('files');
  const [file, setFile] = useState<string>('index.html');
  const [result, setResult] = useState<CompileResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selId = selection.find((id) => doc.nodes[id] && doc.nodes[id].parent) ?? null;
  const scope: Scope = prefs.scope === 'selection' && !selId ? 'page' : prefs.scope;
  const update = (p: Partial<Prefs>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const options = useMemo<ExportOptions>(() => {
    const pid = activePageId(doc);
    return {
      title: siteTitle(),
      minify: prefs.minify,
      respectReducedMotion: prefs.reducedMotion,
      bundle: prefs.format === 'single' ? 'single' : 'files',
      assets: prefs.format === 'single' || prefs.inlineAssets ? 'inline' : 'files',
      ...(scope === 'page' && pid ? { pageIds: [pid] } : {}),
      ...(scope === 'selection' && selId ? { rootNodeId: selId, isolate: true } : {}),
    };
  }, [doc, prefs, scope, selId]);

  // Full compile (with binaries) whenever inputs change.
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(() => {
      compileSite(doc, { ...options, ...readers })
        .then((r) => {
          if (cancelled) return;
          setResult(r);
          setError(null);
          setFile((f) => (r.files.some((x) => x.path === f) ? f : r.entry));
        })
        .catch((err) => !cancelled && setError(String(err instanceof Error ? err.message : err)))
        .finally(() => !cancelled && setBusy(false));
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [doc, options]);

  const close = () => useUI.getState().set({ exportOpen: false });
  const total = result ? result.files.reduce((s, f) => s + sizeOf(f), 0) : 0;
  const current = result?.files.find((f) => f.path === file) ?? null;
  const textFiles = result?.files.filter((f) => langOf(f.path)) ?? [];
  const multiPage = scope === 'project' && doc.pages.length > 1;

  const doExport = async () => {
    if (!result) return;
    setSaving(true);
    try {
      const where = await saveResult(result, prefs.format, siteSlug());
      if (where) {
        toast.success('Export complete', { description: `Saved to ${where}` });
        close();
      }
    } catch (err) {
      console.error(err);
      setError(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
      toast.error('Export failed', { description: String(err) });
    } finally {
      setSaving(false);
    }
  };

  // Copy uses separate files (not inlined) so CSS is available on its own.
  const plain = () => compileSiteText(doc, { ...options, bundle: 'files', assets: 'files' });
  const copyHtml = () => {
    const entry = result?.files.find((f) => f.path === result.entry);
    if (entry && typeof entry.data === 'string') void copyText(entry.data, 'HTML');
  };
  const copyCss = () => {
    const css = plain().files.find((f) => f.path === 'styles.css');
    if (css) void copyText(css.data as string, 'CSS');
  };

  const footer = (
    <div className="k-export-foot">
      <Button variant="ghost" icon={<Clipboard />} onClick={copyHtml} disabled={!result}>
        Copy HTML
      </Button>
      <Button variant="ghost" icon={<Clipboard />} onClick={copyCss} disabled={!result}>
        Copy CSS
      </Button>
      <Button variant="ghost" icon={<ExternalLink />} onClick={() => void openInBrowser(options)} disabled={!result}>
        Open in browser
      </Button>
      <span className="k-export-foot__spacer" />
      <Button onClick={close}>Cancel</Button>
      <Button variant="primary" icon={<Upload />} onClick={() => void doExport()} loading={saving} disabled={!result || busy}>
        {prefs.format === 'zip' ? 'Export ZIP' : prefs.format === 'single' ? 'Export HTML' : 'Export folder'}
      </Button>
    </div>
  );

  const warnings = result?.stats.warnings ?? [];
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && close()}
      title="Export code"
      description="Clean, standalone HTML, CSS and a tiny animation script — ready to host anywhere."
      width={980}
      footer={footer}
    >
      <div className="k-export">
        <div className="k-export__side">
          <div>
            <div className="k-export__group-title">Scope</div>
            <div className="k-choice-list" role="radiogroup" aria-label="Scope">
              <Choice checked={scope === 'project'} onSelect={() => update({ scope: 'project' })} icon={<Files />} label="Whole project" desc={`${doc.pages.length} ${doc.pages.length === 1 ? 'page' : 'pages'}, shared stylesheet`} />
              <Choice checked={scope === 'page'} onSelect={() => update({ scope: 'page' })} icon={<Layers />} label="Current page" desc={doc.pages.find((p) => p.id === activePageId(doc))?.name ?? 'Page'} />
              <Choice
                checked={scope === 'selection'}
                onSelect={() => update({ scope: 'selection' })}
                icon={<Boxes />}
                label="Selected element"
                desc={selId ? `“${doc.nodes[selId].name}” as a standalone component` : 'Select an element on the canvas first'}
                disabled={!selId}
              />
            </div>
          </div>
          <div>
            <div className="k-export__group-title">Format</div>
            <div className="k-choice-list" role="radiogroup" aria-label="Format">
              <Choice checked={prefs.format === 'folder'} onSelect={() => update({ format: 'folder' })} icon={<Folder />} label="Folder with files" desc="HTML pages, styles.css, script.js, assets/ and fonts/" />
              <Choice
                checked={prefs.format === 'single'}
                onSelect={() => update({ format: 'single' })}
                icon={<FileCode2 />}
                label="Single HTML file"
                desc={multiPage ? `One self-contained file per page (${doc.pages.length} files)` : 'Everything inlined into one file'}
              />
              <Choice checked={prefs.format === 'zip'} onSelect={() => update({ format: 'zip' })} icon={<Archive />} label="ZIP archive" desc="The folder, compressed for sharing or uploading" />
            </div>
          </div>
          <div>
            <div className="k-export__group-title">Options</div>
            <Option label="Minify" desc="Smaller files, no indentation or comments" checked={prefs.minify} onChange={(v) => update({ minify: v })} />
            <Option label="Respect reduced motion" desc="Animations finish instantly for visitors who ask for less motion" checked={prefs.reducedMotion} onChange={(v) => update({ reducedMotion: v })} />
            {prefs.format !== 'single' && (
              <Option label="Inline assets" desc="Embed images and fonts as data URIs instead of files" checked={prefs.inlineAssets} onChange={(v) => update({ inlineAssets: v })} />
            )}
          </div>
        </div>

        <div className="k-export__main">
          <div className="k-export__bar">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'files', label: 'Files' },
                { value: 'code', label: 'Code' },
              ]}
            />
            {view === 'code' && textFiles.length > 0 && (
              <Select value={current && langOf(current.path) ? file : textFiles[0].path} onChange={setFile} options={textFiles.map((f) => ({ value: f.path, label: f.path }))} ariaLabel="File" />
            )}
            <span className="k-export__bar-info">
              {result && (
                <span>
                  {result.files.length} {result.files.length === 1 ? 'file' : 'files'} · {formatBytes(total)}
                </span>
              )}
              {result && result.stats.animations > 0 && (
                <Tooltip content={`${result.stats.keyframes} keyframe sets`}>
                  <span className="k-badge k-badge--accent">{result.stats.animations} animations</span>
                </Tooltip>
              )}
            </span>
          </div>
          {error && (
            <div className="k-export__alert" data-tone="error" role="alert">
              <AlertTriangle />
              <span>{error}</span>
            </div>
          )}
          {warnings.length > 0 && (
            <div className="k-export__alert" role="status">
              <AlertTriangle />
              <ul>
                {warnings.slice(0, 4).map((w) => (
                  <li key={w}>{w}</li>
                ))}
                {warnings.length > 4 && <li>…and {warnings.length - 4} more</li>}
              </ul>
            </div>
          )}
          <div className="k-export__body">
            {busy && !result && (
              <div className="k-export__busy">
                <span className="k-spinner" /> Compiling…
              </div>
            )}
            {result && view === 'files' && (
              <FileTree
                files={result.files}
                onOpen={(p) => {
                  if (!langOf(p)) return;
                  setFile(p);
                  setView('code');
                }}
              />
            )}
            {result && view === 'code' && (() => {
              const f = current && langOf(current.path) ? current : textFiles[0];
              if (!f) return <div className="k-export__binary">No text files</div>;
              const src = f.data as string;
              const shown = src.replace(/data:[^"')\s]{200,}/g, (m) => `${m.slice(0, 48)}…(${formatBytes(m.length)} inlined)`);
              return <CodeViewer value={shown} lang={langOf(f.path)!} ariaLabel={f.path} />;
            })()}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
