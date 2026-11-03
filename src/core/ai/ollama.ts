/**
 * Ollama client. All traffic goes through `platform.http.request` (the Electron
 * main process in the desktop app — no CORS — or fetch in web mode).
 *
 * - version / listModels (/api/tags) / showModel (/api/show, cached)
 * - chat: streaming NDJSON, robust to chunk boundaries, structured outputs via
 *   `format` (JSON schema), `<think>` reasoning separated from visible content
 * - typed errors: not running, model missing, aborted, bad response, timeout
 */
import { platform } from '@/platform';
import type { HttpResponse } from '@/platform';
import { createNdjsonParser, ThinkFilter } from './text';
import type { ModelInfo } from './recommend';

export const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const BASE_URL_KEY = 'kinema.ai.baseUrl';

// ─── Errors ──────────────────────────────────────────────────────────────────

export type OllamaErrorKind = 'not-running' | 'model-missing' | 'aborted' | 'bad-response' | 'timeout';

export class OllamaError extends Error {
  constructor(
    readonly kind: OllamaErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'OllamaError';
  }
}
export class OllamaNotRunningError extends OllamaError {
  constructor(readonly baseUrl: string, cause?: unknown) {
    super('not-running', `Can't reach Ollama at ${baseUrl}. Is it running?${cause ? ` (${cause instanceof Error ? cause.message : String(cause)})` : ''}`);
  }
}
export class OllamaModelMissingError extends OllamaError {
  constructor(readonly model: string) {
    super('model-missing', `Model “${model}” is not installed. Run: ollama pull ${model}`);
  }
}
export class OllamaAbortedError extends OllamaError {
  constructor() {
    super('aborted', 'Cancelled');
  }
}
export class OllamaBadResponseError extends OllamaError {
  constructor(message: string) {
    super('bad-response', message);
  }
}
export class OllamaTimeoutError extends OllamaError {
  constructor(what: string, ms: number) {
    super('timeout', `Ollama did not respond (${what}) within ${Math.round(ms / 1000)}s.`);
  }
}

export function isAbortError(e: unknown): boolean {
  return e instanceof OllamaError && e.kind === 'aborted';
}

// ─── Base URL setting ────────────────────────────────────────────────────────

export function normalizeBaseUrl(url: string): string {
  let u = url.trim();
  if (!u) return DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, '').replace(/\/api$/, '');
}

export function getOllamaBaseUrl(): string {
  try {
    const v = localStorage.getItem(BASE_URL_KEY);
    return v ? normalizeBaseUrl(JSON.parse(v)) : DEFAULT_BASE_URL;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

export function setOllamaBaseUrl(url: string): string {
  const u = normalizeBaseUrl(url);
  try {
    localStorage.setItem(BASE_URL_KEY, JSON.stringify(u));
  } catch {
    /* ignore */
  }
  showCache.clear();
  return u;
}

// ─── Transport ───────────────────────────────────────────────────────────────

interface Timeouts {
  /** connection / first byte */
  firstByteMs: number;
  /** max silence between streamed chunks */
  idleMs?: number;
}

async function send(
  baseUrl: string,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown },
  timeouts: Timeouts,
  signal?: AbortSignal,
  onChunk?: (t: string) => void,
): Promise<HttpResponse> {
  if (signal?.aborted) throw new OllamaAbortedError();
  const ctrl = new AbortController();
  let timedOut: string | null = null;
  let chunkErr: unknown = null;
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  let timer = setTimeout(() => {
    timedOut = 'connecting';
    ctrl.abort();
  }, timeouts.firstByteMs);
  const bump = () => {
    if (!timeouts.idleMs) return clearTimeout(timer);
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = 'while streaming';
      ctrl.abort();
    }, timeouts.idleMs);
  };
  try {
    const res = await platform.http.request(
      {
        url: baseUrl + path,
        method: init.method ?? 'GET',
        headers: init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      },
      onChunk
        ? (t) => {
            bump();
            if (chunkErr) return;
            try {
              onChunk(t);
            } catch (e) {
              chunkErr = e;
              ctrl.abort();
            }
          }
        : undefined,
      ctrl.signal,
    );
    if (chunkErr) throw chunkErr;
    return res;
  } catch (e) {
    if (chunkErr) throw chunkErr;
    if (signal?.aborted) throw new OllamaAbortedError();
    if (timedOut) throw new OllamaTimeoutError(timedOut, timedOut === 'connecting' ? timeouts.firstByteMs : (timeouts.idleMs ?? 0));
    if (e instanceof OllamaError) throw e;
    throw new OllamaNotRunningError(baseUrl, e);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function errorFromBody(status: number, text: string, model?: string): OllamaError {
  let msg = text.trim();
  try {
    const j = JSON.parse(text);
    if (j && typeof j.error === 'string') msg = j.error;
  } catch {
    /* plain text */
  }
  if (model && (status === 404 || /not found|pull/i.test(msg))) return new OllamaModelMissingError(model);
  return new OllamaBadResponseError(`Ollama error ${status}${msg ? `: ${msg.slice(0, 200)}` : ''}`);
}

function parseJson<T>(res: HttpResponse, what: string): T {
  try {
    return JSON.parse(res.text) as T;
  } catch {
    throw new OllamaBadResponseError(`Unexpected ${what} response from Ollama.`);
  }
}

// ─── API ─────────────────────────────────────────────────────────────────────

export interface CallOpts {
  baseUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function version(opts: CallOpts = {}): Promise<string> {
  const base = opts.baseUrl ?? getOllamaBaseUrl();
  const res = await send(base, '/api/version', {}, { firstByteMs: opts.timeoutMs ?? 4000 }, opts.signal);
  if (!res.ok) throw errorFromBody(res.status, res.text);
  const j = parseJson<{ version?: string }>(res, 'version');
  if (typeof j.version !== 'string') throw new OllamaBadResponseError('This server does not look like Ollama.');
  return j.version;
}

interface TagsModel {
  name: string;
  model?: string;
  size?: number;
  digest?: string;
  modified_at?: string;
  details?: { family?: string; families?: string[] | null; parameter_size?: string; quantization_level?: string };
}

export async function listModels(opts: CallOpts = {}): Promise<ModelInfo[]> {
  const base = opts.baseUrl ?? getOllamaBaseUrl();
  const res = await send(base, '/api/tags', {}, { firstByteMs: opts.timeoutMs ?? 5000 }, opts.signal);
  if (!res.ok) throw errorFromBody(res.status, res.text);
  const j = parseJson<{ models?: TagsModel[] }>(res, 'model list');
  if (!Array.isArray(j.models)) throw new OllamaBadResponseError('Unexpected model list from Ollama.');
  return j.models
    .filter((m) => m && typeof m.name === 'string')
    .map((m) => ({
      name: m.name,
      size: m.size,
      digest: m.digest,
      modifiedAt: m.modified_at,
      family: m.details?.family,
      families: m.details?.families ?? undefined,
      parameterSize: m.details?.parameter_size,
      quantization: m.details?.quantization_level,
    }));
}

export interface LoadedModel {
  name: string;
  /** bytes held in GPU memory (0 = CPU only) */
  sizeVram?: number;
  expiresAt?: string;
}

/** /api/ps — models currently loaded in memory (empty list on older servers). */
export async function loadedModels(opts: CallOpts = {}): Promise<LoadedModel[]> {
  const base = opts.baseUrl ?? getOllamaBaseUrl();
  const res = await send(base, '/api/ps', {}, { firstByteMs: opts.timeoutMs ?? 4000 }, opts.signal);
  if (res.status === 404) return [];
  if (!res.ok) throw errorFromBody(res.status, res.text);
  const j = parseJson<{ models?: { name?: string; model?: string; size_vram?: number; expires_at?: string }[] }>(res, 'loaded models');
  return (j.models ?? [])
    .map((m) => ({ name: m.name ?? m.model ?? '', sizeVram: m.size_vram, expiresAt: m.expires_at }))
    .filter((m) => m.name);
}

/**
 * Load a model into memory ahead of time (an empty generate request), so the first
 * generation after selecting a model starts immediately. Resolves when loaded.
 */
export async function preloadModel(name: string, opts: CallOpts & { keepAlive?: string | number } = {}): Promise<void> {
  const base = opts.baseUrl ?? getOllamaBaseUrl();
  const body: Record<string, unknown> = { model: name };
  if (opts.keepAlive !== undefined && opts.keepAlive !== '') body.keep_alive = opts.keepAlive;
  // loading a large model from disk can take a while: allow up to 3 minutes
  const res = await send(base, '/api/generate', { method: 'POST', body }, { firstByteMs: opts.timeoutMs ?? 180_000 }, opts.signal);
  if (!res.ok) throw errorFromBody(res.status, res.text, name);
}

/** Release a model from memory immediately. */
export async function unloadModel(name: string, opts: CallOpts = {}): Promise<void> {
  const base = opts.baseUrl ?? getOllamaBaseUrl();
  const res = await send(base, '/api/generate', { method: 'POST', body: { model: name, keep_alive: 0 } }, { firstByteMs: opts.timeoutMs ?? 10_000 }, opts.signal);
  if (!res.ok) throw errorFromBody(res.status, res.text, name);
}

export interface ModelDetails {
  capabilities: string[];
  contextLength?: number;
  family?: string;
  parameterSize?: string;
  quantization?: string;
}

const showCache = new Map<string, Promise<ModelDetails>>();

/** /api/show → capabilities, context length, family, size, quantization (cached per digest). */
export function showModel(name: string, opts: CallOpts & { digest?: string } = {}): Promise<ModelDetails> {
  const base = opts.baseUrl ?? getOllamaBaseUrl();
  const key = `${base}|${name}|${opts.digest ?? ''}`;
  let p = showCache.get(key);
  if (!p) {
    p = (async () => {
      const res = await send(base, '/api/show', { method: 'POST', body: { model: name, name } }, { firstByteMs: opts.timeoutMs ?? 8000 }, opts.signal);
      if (!res.ok) throw errorFromBody(res.status, res.text, name);
      const j = parseJson<{
        capabilities?: string[];
        details?: { family?: string; parameter_size?: string; quantization_level?: string };
        model_info?: Record<string, unknown>;
      }>(res, 'model details');
      let ctx: number | undefined;
      for (const [k, v] of Object.entries(j.model_info ?? {})) if (k.endsWith('.context_length') && typeof v === 'number') ctx = v;
      return {
        capabilities: Array.isArray(j.capabilities) ? j.capabilities : ['completion'],
        contextLength: ctx,
        family: j.details?.family,
        parameterSize: j.details?.parameter_size,
        quantization: j.details?.quantization_level,
      };
    })();
    showCache.set(key, p);
    p.catch(() => showCache.delete(key));
  }
  return p;
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /** base64 images (no data: prefix) for vision models */
  images?: string[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  /** 'json' or a JSON schema (structured outputs) */
  format?: 'json' | Record<string, unknown>;
  options?: { temperature?: number; num_ctx?: number; num_predict?: number; seed?: number; top_p?: number; repeat_penalty?: number };
  /** Desired reasoning mode. Only sent when the model has the `thinking` capability. */
  think?: boolean;
  /** Model capabilities (from showModel) — decides whether `think` may be sent. */
  capabilities?: string[];
  keepAlive?: string | number;
}

export interface ChatProgress {
  /** raw text of this chunk */
  delta: string;
  /** visible content so far (reasoning removed) */
  content: string;
  /** reasoning so far */
  thinking: string;
  /** currently inside a reasoning block */
  inThink: boolean;
  /** streamed chunks so far (≈ tokens) */
  tokens: number;
}

export interface ChatResult {
  content: string;
  thinking: string;
  /** eval_count (output tokens) when reported */
  evalCount?: number;
  /** tokens / second from eval_count / eval_duration */
  tokensPerSecond?: number;
  promptTokens?: number;
  doneReason?: string;
}

interface ChatChunk {
  message?: { role?: string; content?: string; thinking?: string };
  done?: boolean;
  done_reason?: string;
  eval_count?: number;
  eval_duration?: number;
  prompt_eval_count?: number;
  error?: string;
}

/** Build the /api/chat request body (exported for tests). */
export function buildChatBody(req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map((m) => (m.images?.length ? m : { role: m.role, content: m.content })),
    stream: true,
  };
  if (req.format) body.format = req.format;
  if (req.options) body.options = Object.fromEntries(Object.entries(req.options).filter(([, v]) => v !== undefined));
  if (req.keepAlive !== undefined && req.keepAlive !== '') body.keep_alive = req.keepAlive;
  if (req.think !== undefined && req.capabilities?.includes('thinking')) body.think = req.think;
  return body;
}

/**
 * Streaming chat. `onProgress` fires for every chunk. Resolves with the full,
 * reasoning-free content. Rejects with an OllamaError.
 */
export async function chat(
  req: ChatRequest,
  onProgress?: (p: ChatProgress) => void,
  signal?: AbortSignal,
  opts: { baseUrl?: string; firstByteTimeoutMs?: number; idleTimeoutMs?: number } = {},
): Promise<ChatResult> {
  const base = opts.baseUrl ?? getOllamaBaseUrl();
  const filter = new ThinkFilter();
  let fieldThinking = '';
  let tokens = 0;
  let final: ChatChunk | null = null;
  let streamError: string | null = null;
  const parser = createNdjsonParser<ChatChunk>((c) => {
    if (c.error) {
      streamError = c.error;
      throw errorFromBody(404, JSON.stringify({ error: c.error }), /not found|pull/i.test(c.error) ? req.model : undefined);
    }
    const delta = c.message?.content ?? '';
    const th = c.message?.thinking ?? '';
    if (delta) filter.push(delta);
    if (th) fieldThinking += th;
    if (delta || th) {
      tokens++;
      onProgress?.({ delta: delta || th, content: filter.content, thinking: fieldThinking + filter.thinking, inThink: filter.inThink || (!!th && !delta), tokens });
    }
    if (c.done) final = c;
  }, () => {
    /* tolerate a malformed line (proxies sometimes inject keep-alives) */
  });

  const res = await send(
    base,
    '/api/chat',
    { method: 'POST', body: buildChatBody(req) },
    { firstByteMs: opts.firstByteTimeoutMs ?? 180_000, idleMs: opts.idleTimeoutMs ?? 90_000 },
    signal,
    (t) => parser.push(t),
  );
  if (!res.ok) {
    // non-streamed error body (Electron returns it as text; web streams it through the parser)
    if (res.text) throw errorFromBody(res.status, res.text, req.model);
    if (!streamError) throw errorFromBody(res.status, '', res.status === 404 ? req.model : undefined);
  }
  try {
    parser.end();
  } catch (e) {
    if (e instanceof OllamaError) throw e;
  }
  filter.end();
  const done = final as ChatChunk | null;
  const tps = done?.eval_count && done.eval_duration ? done.eval_count / (done.eval_duration / 1e9) : undefined;
  return {
    content: filter.content.trim(),
    thinking: (fieldThinking + filter.thinking).trim(),
    evalCount: done?.eval_count,
    tokensPerSecond: tps,
    promptTokens: done?.prompt_eval_count,
    doneReason: done?.done_reason,
  };
}
