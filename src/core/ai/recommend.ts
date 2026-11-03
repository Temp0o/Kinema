/**
 * Model recommendations: score installed Ollama models per AI task from cheap
 * signals (name/family, parameter size, quantization, capabilities). Pure.
 */

export type AITask = 'ui' | 'edit' | 'svg' | 'animation';

export const TASKS: AITask[] = ['ui', 'edit', 'svg', 'animation'];

export const TASK_LABELS: Record<AITask, string> = {
  ui: 'Pages & components',
  edit: 'Editing',
  svg: 'Logos & icons',
  animation: 'Animation',
};

/** What we know about an installed model (from /api/tags + /api/show). */
export interface ModelInfo {
  name: string;
  /** bytes on disk */
  size?: number;
  family?: string;
  families?: string[];
  /** e.g. "7.6B", "135M" */
  parameterSize?: string;
  /** e.g. "Q4_K_M" */
  quantization?: string;
  /** e.g. ["completion","tools","vision","thinking","embedding"] — undefined until /api/show answered */
  capabilities?: string[];
  contextLength?: number;
  modifiedAt?: string;
  digest?: string;
}

export interface RankedModel {
  name: string;
  score: number;
  reason: string;
  /** score is good enough to call the model suitable */
  suitable: boolean;
}

export interface RecommendOptions {
  /** The run will attach a canvas screenshot (vision models get a bonus). */
  wantVision?: boolean;
}

const EMBED_RE = /(^|[/:_-])(nomic-embed|mxbai-embed|bge|all-minilm|snowflake-arctic-embed|granite-embedding|paraphrase|e5-|gte-|embed)/i;

export function isEmbeddingModel(m: ModelInfo): boolean {
  if (m.capabilities?.includes('embedding') && !m.capabilities.includes('completion')) return true;
  if (EMBED_RE.test(m.name)) return true;
  const fam = [m.family, ...(m.families ?? [])].filter(Boolean).join(' ');
  return /\b(bert|nomic-bert)\b/i.test(fam) && !m.capabilities?.includes('completion');
}

/** Parameter count in billions from "7.6B" / "135M" or the tag (":14b"). */
export function parseParams(m: Pick<ModelInfo, 'name' | 'parameterSize'>): number | null {
  const fromStr = (s: string | undefined) => {
    if (!s) return null;
    const mm = /(\d+(?:\.\d+)?)\s*([bmk])\b/i.exec(s);
    if (!mm) return null;
    const n = parseFloat(mm[1]);
    const u = mm[2].toLowerCase();
    return u === 'b' ? n : u === 'm' ? n / 1000 : n / 1e6;
  };
  return fromStr(m.parameterSize) ?? fromStr((m.name.split(':')[1] ?? '').replace(/x/i, ' ')) ?? fromStr(m.name.split(':')[0].match(/[-_](\d+(?:\.\d+)?[bm])\b/i)?.[1]);
}

interface FamilyRule {
  re: RegExp;
  label: string;
  scores: Record<AITask, number>;
}

/** First match wins — order from most to least specific. */
const FAMILY_RULES: FamilyRule[] = [
  { re: /qwen[\d.]*-?coder|codeqwen/i, label: 'Coder model (Qwen)', scores: { ui: 46, edit: 44, svg: 40, animation: 30 } },
  { re: /devstral|codestral/i, label: 'Coder model (Mistral)', scores: { ui: 42, edit: 42, svg: 36, animation: 30 } },
  { re: /deepseek-coder/i, label: 'Coder model (DeepSeek)', scores: { ui: 42, edit: 40, svg: 36, animation: 28 } },
  { re: /granite[\d.]*-code|yi-coder|opencoder/i, label: 'Coder model', scores: { ui: 38, edit: 36, svg: 32, animation: 26 } },
  { re: /codellama|codegemma|starcoder/i, label: 'Coder model (older)', scores: { ui: 34, edit: 32, svg: 30, animation: 22 } },
  { re: /qwen3|qwen2\.5|qwq/i, label: 'Strong instruct model (Qwen)', scores: { ui: 34, edit: 36, svg: 30, animation: 38 } },
  { re: /gpt-oss|magistral|mistral-small|mistral-nemo|cogito/i, label: 'Strong instruct model', scores: { ui: 33, edit: 35, svg: 30, animation: 37 } },
  { re: /gemma3|gemma-3/i, label: 'Strong instruct model (Gemma 3)', scores: { ui: 32, edit: 33, svg: 30, animation: 36 } },
  { re: /llama3\.[1-3]|llama-3\.[1-3]|llama4/i, label: 'Instruct model (Llama 3)', scores: { ui: 30, edit: 31, svg: 26, animation: 34 } },
  { re: /deepseek-r1|deepseek-v[23]/i, label: 'Reasoning model (DeepSeek)', scores: { ui: 28, edit: 30, svg: 26, animation: 32 } },
  { re: /phi-?4|phi4/i, label: 'Instruct model (Phi-4)', scores: { ui: 29, edit: 30, svg: 26, animation: 33 } },
  { re: /qwen2|qwen\b|gemma2|gemma-2|llama3|llama-3|mistral|mixtral|phi-?3|phi3|granite3|command-r|hermes|openchat|olmo|exaone|nemotron|aya/i, label: 'Instruct model', scores: { ui: 26, edit: 27, svg: 22, animation: 30 } },
  { re: /llava|bakllava|moondream|minicpm-v|llama3\.2-vision|qwen2\.5vl|qwen-vl/i, label: 'Vision model', scores: { ui: 18, edit: 18, svg: 14, animation: 20 } },
  { re: /tinyllama|tinydolphin|orca-mini|smollm|gemma:2b|llama2|vicuna|alpaca/i, label: 'Small / older model', scores: { ui: 10, edit: 10, svg: 8, animation: 12 } },
];

const DEFAULT_FAMILY = { label: 'General model', scores: { ui: 20, edit: 20, svg: 16, animation: 22 } as Record<AITask, number> };

function familyOf(m: ModelInfo) {
  const hay = `${m.name} ${m.family ?? ''}`;
  return FAMILY_RULES.find((r) => r.re.test(hay)) ?? DEFAULT_FAMILY;
}

function paramsScore(b: number | null): { pts: number; note: string } {
  if (b == null) return { pts: 0, note: '' };
  const label = b < 1 ? `${Math.round(b * 1000)}M` : `${Math.round(b * 10) / 10}B`;
  if (b < 1) return { pts: -30, note: `${label} — too small` };
  if (b < 3) return { pts: -18, note: `${label} — small, weaker output` };
  if (b < 6) return { pts: -4, note: `${label} — fast, lighter quality` };
  if (b <= 14.9) return { pts: 14, note: `${label} — sweet spot` };
  if (b <= 34) return { pts: 16, note: `${label} — high quality` };
  if (b <= 80) return { pts: 8, note: `${label} — great but slow` };
  return { pts: 2, note: `${label} — very large, slow` };
}

function quantScore(q: string | undefined): { pts: number; note: string } {
  if (!q) return { pts: 0, note: '' };
  const s = q.toUpperCase();
  if (/^(IQ1|IQ2|Q2|IQ3|Q3)/.test(s)) return { pts: -6, note: `${s} (lossy)` };
  if (/^(Q4|IQ4)/.test(s)) return { pts: 1, note: s };
  if (/^(Q5|Q6|Q8)/.test(s)) return { pts: 2, note: s };
  if (/^(F16|FP16|BF16|F32)/.test(s)) return { pts: -2, note: `${s} (heavy)` };
  return { pts: 0, note: s };
}

/** Score one model for a task. Returns null for models that can't do chat (embeddings). */
export function scoreModel(m: ModelInfo, task: AITask, opts: RecommendOptions = {}): RankedModel | null {
  if (isEmbeddingModel(m)) return null;
  const fam = familyOf(m);
  let score = fam.scores[task];
  const notes: string[] = [fam.label];
  const p = paramsScore(parseParams(m));
  score += p.pts;
  if (p.note) notes.push(p.note);
  const q = quantScore(m.quantization);
  score += q.pts;
  const caps = m.capabilities ?? [];
  if (caps.includes('vision') && (task === 'ui' || task === 'edit')) {
    score += opts.wantVision ? 7 : 2;
    notes.push(opts.wantVision ? 'vision: sees your canvas' : 'vision');
  }
  if (caps.includes('thinking') && task === 'ui') score -= 1; // slower first token
  if (m.contextLength && m.contextLength < 8192 && (task === 'ui' || task === 'edit')) {
    score -= 5;
    notes.push(`short context (${m.contextLength})`);
  }
  if (q.note && q.pts !== 0 && q.pts !== 1) notes.push(q.note);
  return { name: m.name, score, reason: notes.join(' · '), suitable: score >= 30 };
}

/** Rank installed models for a task (best first). Embedding-only models are excluded. */
export function recommendModels(models: ModelInfo[], task: AITask, opts: RecommendOptions = {}): RankedModel[] {
  return models
    .map((m) => scoreModel(m, task, opts))
    .filter((r): r is RankedModel => !!r)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** Best suitable model for a task, or the best available one if none is "suitable". */
export function bestModel(models: ModelInfo[], task: AITask, opts: RecommendOptions = {}): RankedModel | null {
  return recommendModels(models, task, opts)[0] ?? null;
}

/** Best model across all tasks (for "use one model for everything"). */
export function bestOverall(models: ModelInfo[]): RankedModel | null {
  const totals = new Map<string, number>();
  for (const t of TASKS) for (const r of recommendModels(models, t)) totals.set(r.name, (totals.get(r.name) ?? 0) + r.score);
  const [name] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!name) return null;
  return scoreModel(models.find((m) => m.name === name)!, 'ui');
}

export interface PullSuggestion {
  model: string;
  why: string;
  /** approx download size */
  size: string;
  tasks: AITask[];
}

/** Models worth pulling when nothing suitable is installed (newer models may exist). */
export const PULL_SUGGESTIONS: PullSuggestion[] = [
  { model: 'qwen2.5-coder:7b', why: 'Best all-rounder for HTML/CSS and SVG on 8 GB+ machines', size: '4.7 GB', tasks: ['ui', 'edit', 'svg'] },
  { model: 'qwen2.5-coder:14b', why: 'Noticeably better layouts; needs 16 GB+ RAM', size: '9.0 GB', tasks: ['ui', 'edit', 'svg'] },
  { model: 'qwen3:8b', why: 'Strong general model, great at animation JSON', size: '5.2 GB', tasks: ['animation', 'edit'] },
  { model: 'gemma3:12b', why: 'Vision: can look at your canvas to match its style', size: '8.1 GB', tasks: ['ui', 'edit', 'animation'] },
];

/** Suggestions relevant to a task (when no suitable model is installed). */
export function pullSuggestions(models: ModelInfo[], task?: AITask): PullSuggestion[] {
  const installed = new Set(models.map((m) => m.name));
  return PULL_SUGGESTIONS.filter((s) => !installed.has(s.model) && (!task || s.tasks.includes(task)));
}

/** "4.7 GB" */
export function formatBytes(n: number | undefined): string {
  if (!n) return '';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}
