/**
 * The AI tab: connection status + model picker, mode chips, style source, prompt,
 * generation progress with live preview, results (apply / undo / variants),
 * session history and setup guidance.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { toast } from 'sonner';
import {
  Check,
  ChevronDown,
  Component as ComponentIcon,
  Copy,
  Cpu,
  Eye,
  History,
  LayoutTemplate,
  Pencil,
  RefreshCw,
  Rows3,
  Settings2,
  Shapes,
  Sparkles,
  Square,
  Undo2,
  Clapperboard,
  ExternalLink,
  CircleAlert,
  Brain,
  RotateCcw,
} from 'lucide-react';
import { useUI } from '@/core/store/uiStore';
import { useDoc } from '@/core/store/docStore';
import { platform } from '@/platform';
import { Button, IconButton, Popover, Segmented, Select, Slider, Switch, TextInput } from '@/ui/primitives';
import { EXAMPLE_PROMPTS } from '@/core/ai/prompts';
import { MODE_TASK } from '@/core/ai/generate';
import { STYLE_PRESETS, STYLE_SOURCE_LABELS, pageHasContent, type StyleSource } from '@/core/ai/styleContext';
import { TASK_LABELS, formatBytes, pullSuggestions, recommendModels } from '@/core/ai/recommend';
import { currentRootId } from '@/core/store/actions';
import { useAI, useResolvedModel, type UiMode } from './aiStore';
import { LivePreview } from './LivePreview';
import './ai.css';

const MODES: { id: UiMode; label: string; icon: React.ReactNode; needsSelection?: boolean; hint: string }[] = [
  { id: 'page', label: 'Page', icon: <LayoutTemplate />, hint: 'A complete landing page' },
  { id: 'section', label: 'Section', icon: <Rows3 />, hint: 'One full-width section' },
  { id: 'component', label: 'Component', icon: <ComponentIcon />, hint: 'A card, form, navbar…' },
  { id: 'edit', label: 'Edit', icon: <Pencil />, needsSelection: true, hint: 'Edit the selected layers' },
  { id: 'animate', label: 'Animate', icon: <Clapperboard />, needsSelection: true, hint: 'Animate the selected layers' },
  { id: 'svg', label: 'Logo / SVG', icon: <Shapes />, hint: 'Logo, icon or illustration' },
];

const PLACEHOLDERS: Record<UiMode, string> = {
  page: 'Describe the page: product, audience, tone…',
  section: 'Describe the section: pricing tiers, testimonials, FAQ…',
  component: 'Describe the component: a login card, navbar, product card…',
  edit: 'What should change? e.g. “make it dark with pill buttons”',
  animate: 'Describe the motion, or leave empty for a staggered entrance',
  svg: 'Describe the logo, icon or illustration',
};

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success('Copied', { description: text }),
    () => toast.error('Could not copy'),
  );
}

// ─── Status ──────────────────────────────────────────────────────────────────

function StatusChip() {
  const status = useAI((s) => s.status);
  const n = useAI((s) => s.models.filter((m) => !m.capabilities?.includes('embedding') || m.capabilities.includes('completion')).length);
  const version = useAI((s) => s.serverVersion);
  const refresh = useAI((s) => s.refresh);
  const label =
    status === 'connected' ? `Connected · ${n} model${n === 1 ? '' : 's'}` : status === 'empty' ? 'No models installed' : status === 'offline' ? 'Ollama not running' : status === 'checking' || status === 'unknown' ? 'Checking…' : 'Connection problem';
  return (
    <div className="k-ai-status" data-status={status} data-testid="ai-status" title={version ? `Ollama ${version}` : undefined}>
      <span className="k-ai-status__dot" />
      <span>{label}</span>
      <IconButton label="Refresh models" size="sm" onClick={() => void refresh()} data-testid="ai-refresh">
        <RefreshCw className={clsx(status === 'checking' && 'k-ai-spin')} />
      </IconButton>
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

function SettingsPopover() {
  const settings = useAI((s) => s.settings);
  const baseUrl = useAI((s) => s.baseUrl);
  const setSettings = useAI((s) => s.setSettings);
  const setBaseUrl = useAI((s) => s.setBaseUrl);
  const status = useAI((s) => s.status);
  const err = useAI((s) => s.connectionError);
  const version = useAI((s) => s.serverVersion);
  const refresh = useAI((s) => s.refresh);
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    await refresh();
    setTesting(false);
  };
  return (
    <Popover
      align="end"
      width={290}
      trigger={
        <IconButton label="AI settings" data-testid="ai-settings">
          <Settings2 />
        </IconButton>
      }
    >
      <div className="k-stack" style={{ gap: 12 }} data-testid="ai-settings-panel">
        <div className="k-stack" style={{ gap: 4 }}>
          <span className="k-label">Ollama address</span>
          <TextInput value={baseUrl} onCommit={(v) => void setBaseUrl(v)} placeholder="http://127.0.0.1:11434" data-testid="ai-base-url" />
        </div>
        <div className="k-stack" style={{ gap: 2 }}>
          <div className="k-ai-rowhead">
            <span className="k-label">Temperature</span>
            <span className="k-ai-num">{settings.temperature.toFixed(2)}</span>
          </div>
          <Slider value={settings.temperature} min={0} max={1.2} step={0.05} onChange={(v) => setSettings({ temperature: v })} ariaLabel="Temperature" />
          <span className="k-ai-hint">Lower is more predictable, higher more creative.</span>
        </div>
        <div className="k-stack" style={{ gap: 4 }}>
          <span className="k-label">Context size (tokens)</span>
          <Select
            value={String(settings.numCtx)}
            onChange={(v) => setSettings({ numCtx: Number(v) })}
            options={[4096, 8192, 16384, 32768, 65536].map((n) => ({ value: String(n), label: `${n.toLocaleString()}` }))}
          />
          <span className="k-ai-hint">Raised automatically when a prompt needs more. Larger uses more memory.</span>
        </div>
        <div className="k-stack" style={{ gap: 4 }}>
          <span className="k-label">Keep model loaded</span>
          <Select
            value={settings.keepAlive}
            onChange={(v) => setSettings({ keepAlive: v })}
            options={[
              { value: '0', label: 'Unload right away' },
              { value: '5m', label: '5 minutes' },
              { value: '10m', label: '10 minutes' },
              { value: '30m', label: '30 minutes' },
              { value: '-1', label: 'Until Ollama quits' },
            ]}
          />
        </div>
        <label className="k-ai-switchrow">
          <span>
            <span className="k-label" style={{ color: 'var(--text-0)' }}>Let reasoning models think</span>
            <span className="k-ai-hint" style={{ display: 'block' }}>Slower but sometimes better. Only affects models that support it.</span>
          </span>
          <Switch checked={settings.think} onChange={(v) => setSettings({ think: v })} ariaLabel="Reasoning" />
        </label>
        <div className="k-ai-test">
          <Button size="sm" variant="outline" onClick={() => void test()} loading={testing} data-testid="ai-test">
            Test connection
          </Button>
          <span className="k-ai-test__res" data-ok={status === 'connected' || status === 'empty'}>
            {status === 'connected' || status === 'empty' ? `Connected${version ? ` · Ollama ${version}` : ''}` : status === 'checking' ? '' : err ? err.slice(0, 90) : ''}
          </span>
        </div>
      </div>
    </Popover>
  );
}

// ─── Model picker ────────────────────────────────────────────────────────────

function ModelPicker() {
  const mode = useAI((s) => s.mode);
  const task = MODE_TASK[mode === 'edit' ? 'edit' : mode];
  const models = useAI((s) => s.models);
  const prefs = useAI((s) => s.prefs);
  const setPrefs = useAI((s) => s.setPrefs);
  const setTaskModel = useAI((s) => s.setTaskModel);
  const refresh = useAI((s) => s.refresh);
  const styleSource = useAI((s) => s.styleSource);
  const current = useResolvedModel(task);
  const [open, setOpen] = useState(false);
  const wantVision = styleSource === 'match' && mode !== 'animate' && mode !== 'svg';
  const ranked = useMemo(() => recommendModels(models, task, { wantVision }), [models, task, wantVision]);
  const top = ranked[0]?.suitable ? ranked[0].name : null;
  const byName = useMemo(() => new Map(models.map((m) => [m.name, m])), [models]);
  const info = current ? byName.get(current) : undefined;
  const suggestions = useMemo(() => pullSuggestions(models, task), [models, task]);
  const noneSuitable = !ranked.some((r) => r.suitable);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) void refresh({ quiet: true });
      }}
      width={316}
      trigger={
        <button className="k-ai-model" data-testid="ai-model-picker" disabled={!models.length && !current}>
          <Cpu />
          <span className="k-ai-model__name">{current ?? 'No model'}</span>
          {current && top === current && <span className="k-badge k-badge--accent" data-testid="ai-recommended">Recommended</span>}
          {info?.capabilities?.includes('vision') && <Eye className="k-ai-model__eye" />}
          <ChevronDown />
        </button>
      }
    >
      <div className="k-stack" style={{ gap: 8 }}>
        <div className="k-ai-rowhead">
          <span className="k-label">{prefs.single ? 'Model for everything' : `Model for ${TASK_LABELS[task].toLowerCase()}`}</span>
          <IconButton label="Refresh models" size="sm" noTooltip onClick={() => void refresh()}>
            <RefreshCw />
          </IconButton>
        </div>
        <div className="k-ai-models" role="listbox">
          {ranked.map((r, i) => {
            const m = byName.get(r.name)!;
            return (
              <button
                key={r.name}
                role="option"
                aria-selected={r.name === current}
                className="k-ai-modelrow"
                data-selected={r.name === current}
                data-testid="ai-model-option"
                onClick={() => {
                  setTaskModel(task, r.name);
                  setOpen(false);
                }}
              >
                <span className="k-ai-modelrow__top">
                  <span className="k-ai-modelrow__name">{r.name}</span>
                  {i === 0 && r.suitable && <span className="k-badge k-badge--accent">Recommended</span>}
                  {m.capabilities?.includes('vision') && <span className="k-badge">Vision</span>}
                  {m.capabilities?.includes('thinking') && <span className="k-badge">Thinking</span>}
                  {r.name === current && <Check className="k-ai-modelrow__check" />}
                </span>
                <span className="k-ai-modelrow__meta">
                  {[m.parameterSize, formatBytes(m.size), m.quantization].filter(Boolean).join(' · ')}
                </span>
                <span className="k-ai-modelrow__why">{r.reason}</span>
              </button>
            );
          })}
          {!ranked.length && <div className="k-ai-hint" style={{ padding: 8 }}>No chat models installed.</div>}
        </div>
        <label className="k-ai-switchrow">
          <span className="k-label" style={{ color: 'var(--text-0)' }}>Use one model for everything</span>
          <Switch
            checked={prefs.single}
            onChange={(v) => setPrefs({ single: v, singleModel: v ? (current ?? undefined) : prefs.singleModel })}
            ariaLabel="Use one model for everything"
          />
        </label>
        {noneSuitable && <PullSuggestions suggestions={suggestions} compact />}
      </div>
    </Popover>
  );
}

function PullSuggestions({ suggestions, compact }: { suggestions: ReturnType<typeof pullSuggestions>; compact?: boolean }) {
  if (!suggestions.length) return null;
  return (
    <div className={clsx('k-ai-pull', compact && 'k-ai-pull--compact')}>
      <span className="k-label">{compact ? 'No suitable model yet — install one:' : 'Recommended models to install'}</span>
      {suggestions.slice(0, compact ? 2 : 4).map((s) => (
        <div key={s.model} className="k-ai-cmd">
          <div className="k-ai-cmd__text">
            <code>ollama pull {s.model}</code>
            <span className="k-ai-hint">{s.why} · {s.size}</span>
          </div>
          <IconButton label="Copy command" size="sm" onClick={() => copy(`ollama pull ${s.model}`)}>
            <Copy />
          </IconButton>
        </div>
      ))}
      <span className="k-ai-hint">Newer models may exist — check ollama.com/library.</span>
    </div>
  );
}

// ─── Setup guidance ──────────────────────────────────────────────────────────

function SetupGuide() {
  const status = useAI((s) => s.status);
  const models = useAI((s) => s.models);
  const err = useAI((s) => s.connectionError);
  const baseUrl = useAI((s) => s.baseUrl);
  const refresh = useAI((s) => s.refresh);
  if (status === 'connected' || status === 'checking' || status === 'unknown') return null;
  const empty = status === 'empty';
  const suggestions = pullSuggestions(models);
  const rec = suggestions[0]?.model ?? 'qwen2.5-coder:7b';
  return (
    <div className="k-ai-setup" data-testid="ai-setup">
      <div className="k-ai-setup__head">
        <CircleAlert />
        <div>
          <strong>{empty ? 'No models installed yet' : status === 'offline' ? 'Ollama isn’t running' : 'Can’t talk to Ollama'}</strong>
          <p>{empty ? 'Kinema’s AI runs 100% on your machine. Download a model to get started.' : `Kinema’s AI runs locally through Ollama. Couldn’t reach ${baseUrl}.`}</p>
        </div>
      </div>
      <ol className="k-ai-steps-list">
        {!empty && (
          <li>
            <span>Install Ollama</span>
            <Button size="sm" variant="outline" icon={<ExternalLink />} onClick={() => void platform.files.openExternal('https://ollama.com/download')}>
              ollama.com/download
            </Button>
          </li>
        )}
        {!empty && (
          <li>
            <span>Start it</span>
            <div className="k-ai-cmd">
              <code>ollama serve</code>
              <IconButton label="Copy" size="sm" onClick={() => copy('ollama serve')}><Copy /></IconButton>
            </div>
          </li>
        )}
        <li>
          <span>Pull a model</span>
          <div className="k-ai-cmd">
            <code>ollama pull {rec}</code>
            <IconButton label="Copy" size="sm" onClick={() => copy(`ollama pull ${rec}`)}><Copy /></IconButton>
          </div>
        </li>
      </ol>
      {empty && <PullSuggestions suggestions={suggestions.slice(1)} />}
      {platform.kind === 'web' && !empty && (
        <p className="k-ai-hint">
          Running in a browser? Allow it with <code>OLLAMA_ORIGINS=*</code> before <code>ollama serve</code>. The desktop app doesn’t need this.
        </p>
      )}
      {err && !empty && <p className="k-ai-hint k-ai-hint--err">{err}</p>}
      <Button size="sm" icon={<RefreshCw />} onClick={() => void refresh()}>
        Check again
      </Button>
    </div>
  );
}

// ─── Style source ────────────────────────────────────────────────────────────

function StyleSourceRow({ hasSelection }: { hasSelection: boolean }) {
  const styleSource = useAI((s) => s.styleSource);
  const presetId = useAI((s) => s.presetId);
  const set = useAI((s) => s.set);
  const rootId = useDoc((st) => {
    void st.doc;
    return currentRootId();
  });
  const hasContent = useDoc((st) => pageHasContent(st.doc, rootId));
  const options: { value: StyleSource; label: string; disabled?: boolean; hint?: string }[] = [
    { value: 'match', label: STYLE_SOURCE_LABELS.match, disabled: !hasContent, hint: hasContent ? undefined : 'empty' },
    { value: 'selection', label: STYLE_SOURCE_LABELS.selection, disabled: !hasSelection, hint: hasSelection ? undefined : 'none' },
    { value: 'tokens', label: STYLE_SOURCE_LABELS.tokens },
    { value: 'preset', label: 'Preset theme…' },
    { value: 'fresh', label: STYLE_SOURCE_LABELS.fresh },
  ];
  return (
    <div className="k-ai-field">
      <span className="k-ai-field__label">Style</span>
      <div className="k-ai-field__ctl">
        <Select value={styleSource} onChange={(v) => set({ styleSource: v })} options={options} ariaLabel="Style source" />
        {styleSource === 'preset' && (
          <div className="k-ai-presets" data-testid="ai-presets">
            {STYLE_PRESETS.map((p) => (
              <button key={p.id} className="k-ai-preset" data-active={presetId === p.id} title={p.description} onClick={() => set({ presetId: p.id })}>
                <span className="k-ai-preset__sw" style={{ background: `linear-gradient(135deg, ${p.colors.background} 50%, ${p.colors.primary} 50%)` }} />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Run view ────────────────────────────────────────────────────────────────

const STEPS = ['Reading design', 'Generating', 'Building', 'Done'];

function stepIndex(phase: string) {
  return phase === 'reading' ? 0 : phase === 'thinking' || phase === 'generating' ? 1 : phase === 'building' ? 2 : 3;
}

function RunView() {
  const run = useAI((s) => s.run);
  const cancel = useAI((s) => s.cancel);
  const [, tick] = useState(0);
  useEffect(() => {
    if (run.status !== 'running') return;
    const t = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, [run.status]);
  if (run.status !== 'running') return null;
  const idx = stepIndex(run.phase);
  const thinking = run.phase === 'thinking';
  const p = run.progress;
  const kind = run.mode === 'svg' ? 'svg' : run.mode === 'animate' ? null : 'html';
  const mode = run.mode;
  return (
    <div className="k-ai-run" data-testid="ai-run">
      <ol className="k-ai-steps">
        {STEPS.map((s, i) => (
          <li key={s} data-state={i < idx ? 'done' : i === idx ? 'active' : 'todo'}>
            <span className="k-ai-steps__dot">{i < idx ? <Check /> : i === idx ? <span className="k-spinner" /> : null}</span>
            {i === 1 && thinking ? 'Thinking…' : s}
          </li>
        ))}
      </ol>
      <div className="k-ai-stats">
        <span>{fmtElapsed(Date.now() - run.startedAt)}</span>
        <span>{p ? `${p.tokens.toLocaleString()} tokens` : '—'}</span>
        <span>{p && p.tokensPerSecond ? `${p.tokensPerSecond.toFixed(0)} tok/s` : ''}</span>
        {run.usedVision && <span title="A canvas screenshot was sent to the model"><Eye /> sees canvas</span>}
      </div>
      {run.phaseDetail && <div className="k-ai-hint">{run.phaseDetail}</div>}
      {thinking && p?.thinking && <div className="k-ai-thinking"><Brain /> {p.thinking.slice(-140)}</div>}
      {kind && p && p.content && !thinking && (
        <LivePreview content={p.content} kind={kind} designWidth={mode === 'component' ? 520 : 1100} maxHeight={kind === 'svg' ? 200 : 240} />
      )}
      {mode === 'animate' && p?.content && <pre className="k-ai-json">{p.content.slice(-260)}</pre>}
      <Button size="sm" variant="outline" icon={<Square />} onClick={cancel} block data-testid="ai-cancel">
        Cancel
      </Button>
    </div>
  );
}

function ResultView() {
  const run = useAI((s) => s.run);
  const applyVariant = useAI((s) => s.applyVariant);
  const discard = useAI((s) => s.discard);
  const undoApplied = useAI((s) => s.undoApplied);
  const start = useAI((s) => s.start);
  const set = useAI((s) => s.set);
  const past = useDoc((s) => s.past);
  const stillApplied = run.appliedHistoryId != null && past[past.length - 1]?.id === run.appliedHistoryId;

  if (run.status === 'error')
    return (
      <div className="k-ai-result k-ai-result--err" data-testid="ai-error">
        <CircleAlert />
        <div>
          <strong>Couldn’t finish</strong>
          <p>{run.error}</p>
          <Button size="sm" variant="ghost" onClick={discard}>Dismiss</Button>
        </div>
      </div>
    );
  if (run.status === 'cancelled')
    return (
      <div className="k-ai-result" data-testid="ai-cancelled">
        <Square />
        <div>
          <strong>Cancelled</strong>
          <p>Nothing was changed.</p>
          <Button size="sm" variant="ghost" onClick={discard}>Dismiss</Button>
        </div>
      </div>
    );
  if (run.status === 'preview')
    return (
      <div className="k-ai-result k-ai-result--col" data-testid="ai-variants">
        <div className="k-ai-variants" data-count={run.variants.length}>
          {run.variants.map((v, i) => (
            <button key={i} className="k-ai-variant" data-active={run.chosen === i} onClick={() => useAI.setState((s) => ({ run: { ...s.run, chosen: i } }))} data-testid="ai-variant">
              <LivePreview content={v.svg} kind="svg" active={false} />
            </button>
          ))}
        </div>
        {run.outcome?.warnings.map((w) => <div key={w} className="k-ai-hint">{w}</div>)}
        <div className="k-ai-actions">
          <Button size="sm" variant="primary" icon={<Check />} onClick={() => applyVariant()} data-testid="ai-apply">Apply</Button>
          <Button size="sm" variant="outline" icon={<RotateCcw />} onClick={() => void start()} data-testid="ai-regenerate">Regenerate</Button>
          <Button size="sm" variant="ghost" onClick={discard} data-testid="ai-discard">Discard</Button>
        </div>
      </div>
    );
  if (run.status === 'applied' && run.outcome) {
    const o = run.outcome;
    const isSvg = run.job?.mode === 'svg';
    const summary =
      o.kind === 'animated'
        ? `Added ${o.count} animation${o.count === 1 ? '' : 's'}`
        : o.kind === 'edited'
          ? `Updated the selection${o.total > 1 ? ` (kept ${o.kept}/${o.total} layers)` : ''}`
          : isSvg
            ? 'Inserted the artwork'
            : 'Added to the canvas';
    return (
      <div className="k-ai-result k-ai-result--ok" data-testid="ai-applied">
        <Sparkles />
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong>{stillApplied ? 'Applied' : 'Applied earlier'}</strong>
          <p>
            {summary}
            {o.stats.tokens ? ` · ${o.stats.tokens.toLocaleString()} tokens` : ''}
            {o.stats.attempts > 1 ? ' · fixed on retry' : ''}
          </p>
          {o.kind === 'animated' && <p className="k-ai-hint">{o.names.slice(0, 4).join(' · ')}</p>}
          {o.warnings.slice(0, 2).map((w) => <p key={w} className="k-ai-hint">{w}</p>)}
          <div className="k-ai-actions">
            {stillApplied && (
              <Button size="sm" variant="outline" icon={<Undo2 />} onClick={undoApplied} data-testid="ai-undo">Undo</Button>
            )}
            {isSvg && (
              <Button
                size="sm"
                variant="outline"
                icon={<Clapperboard />}
                data-testid="ai-animate-logo"
                onClick={() => {
                  set({ mode: 'animate', prompt: 'Animate this logo: draw/pop each shape in one after another (use targetSelector "path, circle, rect, ellipse, polygon"), then settle.' });
                  void start();
                }}
              >
                Animate this logo
              </Button>
            )}
            {(o.kind === 'inserted' && !isSvg || o.kind === 'edited') && (
              <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={() => void start({ regenerate: o.kind === 'edited' })}>
                {o.kind === 'edited' ? 'Alternative' : 'Regenerate'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={discard}>Done</Button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function AIPanel() {
  const mode = useAI((s) => s.mode);
  const prompt = useAI((s) => s.prompt);
  const variants = useAI((s) => s.variants);
  const set = useAI((s) => s.set);
  const start = useAI((s) => s.start);
  const status = useAI((s) => s.status);
  const runStatus = useAI((s) => s.run.status);
  const history = useAI((s) => s.history);
  const focusTick = useAI((s) => s.focusTick);
  const refresh = useAI((s) => s.refresh);
  const selection = useUI((s) => s.selection);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const hasSelection = selection.length > 0;
  const rootId = useDoc((st) => {
    void st.doc;
    return currentRootId();
  });
  const hasContent = useDoc((st) => pageHasContent(st.doc, rootId));
  const styleSource = useAI((s) => s.styleSource);
  const running = runStatus === 'running';
  const task = MODE_TASK[mode];
  const model = useResolvedModel(task);
  const canRun = status === 'connected' && !!model && !running;

  // auto-detect: mount, focus, every 30s while visible
  useEffect(() => {
    void refresh({ quiet: true });
    const onFocus = () => void refresh({ quiet: true });
    window.addEventListener('focus', onFocus);
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh({ quiet: true });
    }, 30_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(t);
    };
  }, [refresh]);

  // default style: match when the page has content, else fresh
  const touchedStyle = useRef(false);
  useEffect(() => {
    if (touchedStyle.current) return;
    set({ styleSource: hasContent ? 'match' : 'fresh' });
  }, [hasContent, set]);
  useEffect(() => {
    if (styleSource === 'match' && !hasContent) set({ styleSource: 'fresh' });
    if (styleSource === 'selection' && !hasSelection) set({ styleSource: hasContent ? 'match' : 'fresh' });
  }, [hasContent, hasSelection, styleSource, set]);

  // modes needing a selection fall back when it's cleared
  useEffect(() => {
    if (!hasSelection && (mode === 'edit' || mode === 'animate') && !running) set({ mode: 'section' });
  }, [hasSelection, mode, running, set]);

  useEffect(() => {
    if (focusTick > 0) requestAnimationFrame(() => taRef.current?.focus());
  }, [focusTick]);

  const examples = EXAMPLE_PROMPTS[mode === 'edit' ? 'edit' : mode === 'animate' ? 'animate' : mode === 'svg' ? 'svg' : mode];
  const visionOn = useAI((s) => !!s.models.find((m) => m.name === model)?.capabilities?.includes('vision'));
  const needsText = mode !== 'animate';

  return (
    <div className="k-ai" data-testid="ai-panel">
      <div className="k-ai-top">
        <StatusChip />
        <SettingsPopover />
      </div>

      <SetupGuide />

      {(status === 'connected' || status === 'empty') && (
        <div className="k-ai-section">
          <ModelPicker />
        </div>
      )}

      <div className="k-ai-section">
        <div className="k-ai-modes" role="tablist" aria-label="AI mode">
          {MODES.map((m) => {
            const disabled = !!m.needsSelection && !hasSelection;
            return (
              <button
                key={m.id}
                role="tab"
                aria-selected={mode === m.id}
                className="k-ai-mode"
                data-active={mode === m.id}
                data-testid={`ai-mode-${m.id}`}
                disabled={disabled || running}
                title={disabled ? 'Select a layer on the canvas first' : m.hint}
                onClick={() => set({ mode: m.id })}
              >
                {m.icon}
                {m.label}
              </button>
            );
          })}
        </div>
        {(mode === 'edit' || mode === 'animate') && hasSelection && (
          <div className="k-ai-hint">Working on {selection.length} selected layer{selection.length === 1 ? '' : 's'}.</div>
        )}
        {!hasSelection && <div className="k-ai-hint">Select a layer to unlock Edit and Animate.</div>}
      </div>

      {mode !== 'animate' && (
        <div className="k-ai-section">
          <StyleSourceRow hasSelection={hasSelection} />
          {styleSource === 'match' && visionOn && mode !== 'svg' && <div className="k-ai-hint"><Eye /> This model can see your canvas — a screenshot will be attached.</div>}
        </div>
      )}

      <div className="k-ai-section">
        <textarea
          ref={taRef}
          className="k-ai-prompt"
          data-testid="ai-prompt"
          data-ai-prompt
          rows={4}
          value={prompt}
          placeholder={PLACEHOLDERS[mode]}
          spellCheck={false}
          disabled={running}
          onChange={(e) => set({ prompt: e.target.value })}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canRun) {
              e.preventDefault();
              void start();
            }
          }}
        />
        <div className="k-ai-chips">
          {examples.map((ex) => (
            <button key={ex} className="k-ai-chip" disabled={running} onClick={() => { set({ prompt: ex }); taRef.current?.focus(); }} title={ex}>
              {ex}
            </button>
          ))}
        </div>
        <div className="k-ai-gen">
          {mode === 'svg' && (
            <div className="k-ai-variantsel">
              <span className="k-ai-hint">Variants</span>
              <Segmented
                value={String(variants) as '1' | '2' | '3'}
                onChange={(v) => set({ variants: Number(v) })}
                options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]}
              />
            </div>
          )}
          <Button
            variant="ai"
            size="lg"
            block
            icon={<Sparkles />}
            disabled={!canRun || (needsText && !prompt.trim())}
            loading={running}
            onClick={() => void start()}
            data-testid="ai-generate"
            title={!canRun ? 'Connect Ollama and pick a model first' : needsText && !prompt.trim() ? 'Describe what you want first' : undefined}
          >
            {running ? 'Generating…' : mode === 'edit' ? 'Apply edit' : mode === 'animate' ? 'Animate' : mode === 'svg' ? 'Draw it' : 'Generate'}
            {!running && <span className="k-ai-kbd">Ctrl ⏎</span>}
          </Button>
          {mode === 'edit' && hasSelection && (
            <Button variant="outline" size="sm" block icon={<RotateCcw />} disabled={!canRun} onClick={() => void start({ regenerate: true })} data-testid="ai-alternative">
              Regenerate as an alternative design
            </Button>
          )}
        </div>
      </div>

      <RunView />
      <ResultView />

      {history.length > 0 && (
        <div className="k-ai-section">
          <div className="k-ai-rowhead">
            <span className="k-label"><History style={{ width: 12, height: 12, verticalAlign: -2 }} /> This session</span>
          </div>
          <div className="k-ai-history" data-testid="ai-history">
            {history.slice(0, 6).map((h) => (
              <button key={h.id} className="k-ai-hist" disabled={running || ((h.mode === 'edit' || h.mode === 'animate') && !hasSelection)} onClick={() => void start({ fromHistory: h })} title="Run again">
                <span className="k-ai-hist__mode">{MODES.find((m) => m.id === h.mode)?.label}</span>
                <span className="k-ai-hist__text">{h.prompt}</span>
                <RotateCcw />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
