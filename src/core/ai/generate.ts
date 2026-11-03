/**
 * Generation pipelines: page / section / component (HTML → nodes), edit &
 * regenerate selection (round-trip with data-kid), animate (structured JSON),
 * logo / icon / illustration (SVG variants).
 *
 * Each pipeline streams from Ollama, reports phases + progress, validates the
 * output, retries once with error feedback, then applies the result as ONE undo
 * step (SVG variants are returned for the user to pick instead).
 */
import type { NodeId } from '../model/types';
import { docApi } from '../store/docStore';
import { currentRootId } from '../store/actions';
import { importHtml, type HtmlImportResult } from '../io/htmlImport';
import { chat, type ChatMessage, type ChatResult } from './ollama';
import { extractHtml, extractJson, estimateTokens } from './text';
import { svgFromReply, type SvgValidation } from './svg';
import { ANIMATION_SCHEMA, validateAnimations } from './animSpec';
import { describeOutline, outlineIds, serializeNodes } from './serialize';
import { paletteFor, type StyleSource } from './styleContext';
import { animateMessages, buildStyleSection, editMessages, htmlMessages, retryMessages, svgMessages } from './prompts';
import { aiLabel, applyAnimations, applyEdit, editTargets, insertGenerated, reservedIdsFor } from './apply';
import type { AITask } from './recommend';

export type AIMode = 'page' | 'section' | 'component' | 'edit' | 'regenerate' | 'animate' | 'svg';
export type AIPhase = 'reading' | 'loading' | 'thinking' | 'generating' | 'building' | 'done';

export const MODE_TASK: Record<AIMode, AITask> = {
  page: 'ui',
  section: 'ui',
  component: 'ui',
  edit: 'edit',
  regenerate: 'edit',
  animate: 'animation',
  svg: 'svg',
};

export interface AISettings {
  temperature: number;
  numCtx: number;
  keepAlive: string;
  /** let reasoning models think (sent only to models with the `thinking` capability) */
  think: boolean;
}

export interface AIJob {
  mode: AIMode;
  prompt: string;
  model: string;
  /** model already resident in memory (no load wait expected) */
  modelLoaded?: boolean;
  capabilities?: string[];
  contextLength?: number;
  styleSource: StyleSource;
  presetId?: string;
  settings: AISettings;
  /** SVG variants to generate (1–3) */
  variants?: number;
  /** selection snapshot at start */
  selection: NodeId[];
  /** Provide to attach a canvas screenshot (base64 PNG) for vision models. */
  captureImage?: () => Promise<string | null>;
}

export interface AIProgress {
  /** visible content so far (reasoning removed) */
  content: string;
  thinking: string;
  inThink: boolean;
  tokens: number;
  tokensPerSecond: number;
  attempt: number;
  /** svg variant index (0-based) */
  variant: number;
}

export interface SvgVariant {
  index: number;
  svg: string;
  width: number;
  height: number;
  shapes: number;
}

export interface AICallbacks {
  onPhase?: (phase: AIPhase, detail?: string) => void;
  onProgress?: (p: AIProgress) => void;
  onVariant?: (v: SvgVariant) => void;
  onImageAttached?: () => void;
}

export type AIOutcome =
  | { kind: 'inserted'; label: string; rootIds: NodeId[]; historyId?: number; warnings: string[]; stats: RunStats }
  | { kind: 'edited'; label: string; rootIds: NodeId[]; kept: number; total: number; historyId?: number; warnings: string[]; stats: RunStats }
  | { kind: 'animated'; label: string; count: number; targets: NodeId[]; names: string[]; historyId?: number; warnings: string[]; stats: RunStats }
  | { kind: 'svg'; label: string; variants: SvgVariant[]; warnings: string[]; stats: RunStats };

export interface RunStats {
  tokens: number;
  tokensPerSecond: number;
  attempts: number;
}

/** User-facing problems with the request or the model's output (not transport). */
export class AIError extends Error {
  constructor(
    readonly kind: 'input' | 'output',
    message: string,
  ) {
    super(message);
    this.name = 'AIError';
  }
}

const OUTPUT_BUDGET: Record<AIMode, number> = { page: 6000, section: 3500, component: 2200, edit: 2000, regenerate: 2000, animate: 1400, svg: 2400 };

function contextFor(job: AIJob, messages: ChatMessage[], out: number, images: boolean): { numCtx: number; need: number; max: number } {
  const need = estimateTokens(messages.map((m) => m.content).join('\n')) + (images ? 900 : 0) + out;
  const max = job.contextLength ?? 32768;
  const rounded = Math.ceil(need / 2048) * 2048;
  const numCtx = Math.min(Math.max(job.settings.numCtx, rounded), Math.max(max, job.settings.numCtx));
  return { numCtx, need, max };
}

/** External image URLs can't load offline — they become Kinema image placeholders. */
const mapSrc = (src: string) => (/^(https?:)?\/\//i.test(src.trim()) ? '' : src);

interface StreamOpts {
  format?: Record<string, unknown>;
  temperature?: number;
  seed?: number;
  numPredict: number;
  numCtx: number;
  attempt: number;
  variant?: number;
}

async function stream(job: AIJob, messages: ChatMessage[], o: StreamOpts, cb: AICallbacks, signal: AbortSignal, totals: RunStats): Promise<ChatResult> {
  let phase: AIPhase | null = null;
  let firstAt = 0;
  if (!job.modelLoaded && o.attempt === 1 && !o.variant) {
    phase = 'loading';
    cb.onPhase?.('loading', `Loading ${job.model} into memory — the first run after switching models can take a moment…`);
  }
  const res = await chat(
    {
      model: job.model,
      messages,
      format: o.format,
      think: job.settings.think,
      capabilities: job.capabilities,
      keepAlive: job.settings.keepAlive || undefined,
      options: { temperature: o.temperature ?? job.settings.temperature, num_ctx: o.numCtx, num_predict: o.numPredict, seed: o.seed },
    },
    (p) => {
      const now = performance.now();
      if (!firstAt) firstAt = now;
      const next: AIPhase = p.inThink ? 'thinking' : 'generating';
      if (next !== phase) {
        phase = next;
        cb.onPhase?.(next, o.attempt > 1 ? 'Fixing the output (retry)…' : undefined);
      }
      const secs = (now - firstAt) / 1000;
      cb.onProgress?.({
        content: p.content,
        thinking: p.thinking,
        inThink: p.inThink,
        tokens: totals.tokens + p.tokens,
        tokensPerSecond: secs > 0.25 ? p.tokens / secs : 0,
        attempt: o.attempt,
        variant: o.variant ?? 0,
      });
    },
    signal,
  );
  const streamed = res.evalCount ?? 0;
  totals.tokens += streamed || Math.round(res.content.length / 3.6);
  if (res.tokensPerSecond) totals.tokensPerSecond = res.tokensPerSecond;
  totals.attempts = Math.max(totals.attempts, o.attempt);
  return res;
}

// ─── Pipelines ───────────────────────────────────────────────────────────────

async function runHtml(job: AIJob & { mode: 'page' | 'section' | 'component' }, cb: AICallbacks, signal: AbortSignal): Promise<AIOutcome> {
  const doc = docApi.doc;
  const rootId = currentRootId();
  const style = buildStyleSection(doc, { source: job.styleSource, rootId, selection: job.selection, presetId: job.presetId });
  const image = job.captureImage ? await job.captureImage() : null;
  if (image) cb.onImageAttached?.();
  let messages = htmlMessages(job.mode, job.prompt, style, image ? [image] : undefined);
  const ctx = contextFor(job, messages, OUTPUT_BUDGET[job.mode], !!image);
  const totals: RunStats = { tokens: 0, tokensPerSecond: 0, attempts: 0 };
  let imported: HtmlImportResult | null = null;
  for (let attempt = 1; attempt <= 2 && !imported; attempt++) {
    const res = await stream(job, messages, { numCtx: ctx.numCtx, numPredict: OUTPUT_BUDGET[job.mode] + 1500, attempt }, cb, signal, totals);
    const html = extractHtml(res.content);
    let error = '';
    if (!html) error = 'it contained no HTML markup.';
    else {
      const imp = importHtml(html, { breakpoints: doc.breakpoints, aiGenerated: true, mapSrc });
      if (imp.rootIds.length) imported = imp;
      else error = 'no HTML elements could be built from it.';
    }
    if (!imported) {
      if (attempt === 2) throw new AIError('output', `The model's reply could not be turned into a design (${error}) Try again, rephrase, or pick a stronger model.`);
      messages = [...messages, ...retryMessages('html', res.content, error)];
    }
  }
  cb.onPhase?.('building');
  const label = aiLabel(job.prompt);
  const out = await insertGenerated(imported!, job.mode, label);
  return { kind: 'inserted', label, rootIds: out.rootIds, historyId: out.historyId, warnings: imported!.warnings, stats: totals };
}

async function runEdit(job: AIJob, cb: AICallbacks, signal: AbortSignal): Promise<AIOutcome> {
  const doc = docApi.doc;
  const targets = editTargets(doc, job.selection);
  if (!targets.ids.length) throw new AIError('input', 'Select a layer on the canvas first.');
  const ser = serializeNodes(doc, targets.ids, { rootAsBody: targets.rootAsBody });
  const regenerate = job.mode === 'regenerate';
  const style =
    job.styleSource === 'preset' || job.styleSource === 'tokens'
      ? buildStyleSection(doc, { source: job.styleSource, rootId: currentRootId(), selection: job.selection, presetId: job.presetId }) +
        '\nApply this design direction to the HTML below.'
      : undefined;
  const image = job.captureImage ? await job.captureImage() : null;
  if (image) cb.onImageAttached?.();
  let messages = editMessages(ser.html, job.prompt, { regenerate, styleSection: style, count: ser.ids.length, images: image ? [image] : undefined });
  const out = Math.max(OUTPUT_BUDGET.edit, Math.round(estimateTokens(ser.html) * 1.3) + 400);
  const ctx = contextFor(job, messages, out, !!image);
  if (ctx.need > ctx.max) {
    throw new AIError('input', `The selection is too large for this model (needs ≈${Math.round(ctx.need / 1000)}k tokens of context, the model supports ${Math.round(ctx.max / 1000)}k). Select a smaller part of the page.`);
  }
  const reserved = reservedIdsFor(doc, targets.rootAsBody ? ser.ids.filter((id) => id !== targets.ids[0]) : ser.ids);
  const totals: RunStats = { tokens: 0, tokensPerSecond: 0, attempts: 0 };
  let imported: HtmlImportResult | null = null;
  for (let attempt = 1; attempt <= 2 && !imported; attempt++) {
    const res = await stream(job, messages, { numCtx: ctx.numCtx, numPredict: out + 1000, attempt }, cb, signal, totals);
    const html = extractHtml(res.content);
    let error = '';
    if (!html) error = 'it contained no HTML markup.';
    else {
      const imp = importHtml(html, { breakpoints: doc.breakpoints, keepIds: true, reservedIds: reserved, aiGenerated: true, mapSrc: (s) => (s.startsWith('kimg-') ? s : mapSrc(s)) });
      if (imp.rootIds.length) imported = imp;
      else error = 'no HTML elements could be built from it.';
    }
    if (!imported) {
      if (attempt === 2) throw new AIError('output', `The edited HTML could not be used (${error}) Nothing was changed.`);
      messages = [...messages, ...retryMessages('edit', res.content, error)];
    }
  }
  cb.onPhase?.('building');
  // the document may have changed while streaming — re-resolve targets
  const label = aiLabel(job.prompt || (regenerate ? 'Regenerate selection' : 'Edit selection'), regenerate ? 'Regenerate' : 'Edit');
  const live = editTargets(docApi.doc, targets.ids);
  if (!live.ids.length) throw new AIError('input', 'The selected layers were deleted while generating.');
  const r = applyEdit(live, imported!, ser, label);
  const warnings = [...imported!.warnings];
  if (r.total > 1 && r.kept === 0) warnings.push('The model did not keep any element ids, so animations on these layers were not carried over.');
  return { kind: 'edited', label, rootIds: r.rootIds, kept: r.kept, total: r.total, historyId: r.historyId, warnings, stats: totals };
}

async function runAnimate(job: AIJob, cb: AICallbacks, signal: AbortSignal): Promise<AIOutcome> {
  const doc = docApi.doc;
  const roots = job.selection.filter((id) => doc.nodes[id]);
  if (!roots.length) throw new AIError('input', 'Select the layers to animate first.');
  const outline = describeOutline(doc, roots, { withIds: true, maxLines: 60, maxDepth: 5 });
  const targets = outlineIds(doc, roots, 120).map((id) => ({ id, name: doc.nodes[id].name }));
  let messages = animateMessages(outline.text, job.prompt);
  const ctx = contextFor(job, messages, OUTPUT_BUDGET.animate, false);
  const totals: RunStats = { tokens: 0, tokensPerSecond: 0, attempts: 0 };
  let result: ReturnType<typeof validateAnimations> | null = null;
  for (let attempt = 1; attempt <= 2 && !result; attempt++) {
    const res = await stream(
      job,
      messages,
      { format: ANIMATION_SCHEMA as unknown as Record<string, unknown>, temperature: Math.min(job.settings.temperature, 0.5), numCtx: ctx.numCtx, numPredict: OUTPUT_BUDGET.animate + 800, attempt },
      cb,
      signal,
      totals,
    );
    let error = '';
    try {
      const v = validateAnimations(extractJson(res.content), targets);
      if (v.items.length) result = v;
      else error = v.warnings[0] ?? 'it contained no usable animations.';
    } catch (e) {
      error = `it was not valid JSON (${e instanceof Error ? e.message : String(e)}).`;
    }
    if (!result) {
      if (attempt === 2) throw new AIError('output', `The model's animation reply could not be used: ${error}`);
      messages = [...messages, ...retryMessages('json', res.content, error)];
    }
  }
  cb.onPhase?.('building');
  const label = aiLabel(job.prompt || 'Animate selection', 'Animate');
  const live = result!.items.filter((i) => docApi.doc.nodes[i.target]);
  const r = applyAnimations(live, label);
  return { kind: 'animated', label, count: r.count, targets: r.targets, names: live.map((i) => `${i.anim.name} → ${docApi.doc.nodes[i.target]?.name ?? i.target}`), historyId: r.historyId, warnings: result!.warnings, stats: totals };
}

function describeVariant(v: SvgValidation): string {
  const kinds = new Map<string, number>();
  v.svg.replace(/<(path|circle|rect|ellipse|polygon|line|text)\b/g, (_m, t: string) => {
    kinds.set(t, (kinds.get(t) ?? 0) + 1);
    return '';
  });
  const colors = [...new Set(v.svg.match(/#[0-9a-f]{6}\b/gi) ?? [])].slice(0, 3);
  return `${[...kinds].map(([k, n]) => `${n} ${k}`).join(', ')}${colors.length ? `, colors ${colors.join(' ')}` : ''}`;
}

async function runSvg(job: AIJob, cb: AICallbacks, signal: AbortSignal): Promise<AIOutcome> {
  const doc = docApi.doc;
  const rootId = currentRootId();
  const palette = paletteFor(doc, job.styleSource, { rootIds: job.styleSource === 'selection' ? job.selection : rootId ? [rootId] : [], presetId: job.presetId });
  const total = Math.max(1, Math.min(3, job.variants ?? 1));
  const variants: SvgVariant[] = [];
  const warnings: string[] = [];
  const previous: string[] = [];
  const totals: RunStats = { tokens: 0, tokensPerSecond: 0, attempts: 0 };
  const seedBase = Math.floor(Math.random() * 1e6);
  let lastError = '';
  for (let i = 0; i < total; i++) {
    let messages = svgMessages(job.prompt, palette, { index: i, total, previous });
    const ctx = contextFor(job, messages, OUTPUT_BUDGET.svg, false);
    let ok: SvgValidation | null = null;
    try {
      for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
        const res = await stream(
          job,
          messages,
          { numCtx: ctx.numCtx, numPredict: OUTPUT_BUDGET.svg + 600, temperature: Math.min(1.2, job.settings.temperature + i * 0.1), seed: seedBase + i * 7919, attempt, variant: i },
          cb,
          signal,
          totals,
        );
        const v = svgFromReply(res.content);
        if (v.ok) ok = v;
        else {
          lastError = v.error ?? 'invalid SVG';
          if (attempt < 2) messages = [...messages, ...retryMessages('svg', res.content, lastError)];
        }
      }
    } catch (e) {
      // keep finished variants when the user cancels mid-way
      if (variants.length && e instanceof Error && (e as { kind?: string }).kind === 'aborted') {
        warnings.push('Cancelled — showing the variants finished so far.');
        break;
      }
      throw e;
    }
    if (ok) {
      const v: SvgVariant = { index: i, svg: ok.svg, width: ok.width, height: ok.height, shapes: ok.shapes };
      variants.push(v);
      previous.push(`variant ${i + 1}: ${describeVariant(ok)}`);
      cb.onVariant?.(v);
    } else warnings.push(`Variant ${i + 1} failed: ${lastError}`);
  }
  if (!variants.length) throw new AIError('output', `The model did not produce a valid SVG (${lastError}). Try again or pick a coder model.`);
  cb.onPhase?.('building');
  return { kind: 'svg', label: aiLabel(job.prompt, 'Logo'), variants, warnings, stats: totals };
}

/** Run a job end to end. Rejects with OllamaError (transport) or AIError. */
export async function runAIJob(job: AIJob, cb: AICallbacks, signal: AbortSignal): Promise<AIOutcome> {
  cb.onPhase?.('reading');
  let out: AIOutcome;
  switch (job.mode) {
    case 'page':
    case 'section':
    case 'component':
      out = await runHtml(job as AIJob & { mode: 'page' | 'section' | 'component' }, cb, signal);
      break;
    case 'edit':
    case 'regenerate':
      out = await runEdit(job, cb, signal);
      break;
    case 'animate':
      out = await runAnimate(job, cb, signal);
      break;
    case 'svg':
      out = await runSvg(job, cb, signal);
      break;
  }
  cb.onPhase?.('done');
  return out;
}
