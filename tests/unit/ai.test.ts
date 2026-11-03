import { afterEach, describe, expect, it } from 'vitest';
import { createNdjsonParser, ThinkFilter, stripThink, stripFences, extractHtml, extractSvg, extractJson, splitStyleAndMarkup, summarizePrompt } from '@/core/ai/text';
import { validateSvg, uniquifySvgIds, svgFromReply } from '@/core/ai/svg';
import { recommendModels, bestModel, isEmbeddingModel, parseParams, type ModelInfo } from '@/core/ai/recommend';
import { validateAnimations, normalizeEasing } from '@/core/ai/animSpec';
import { buildChatBody, chat, OllamaError } from '@/core/ai/ollama';
import { platform } from '@/platform';

// ─── NDJSON ───────────────────────────────────────────────────────────────────

describe('ndjson parser', () => {
  it('handles objects split across arbitrary chunk boundaries', () => {
    const lines = [{ a: 1 }, { message: { content: 'he said "hi"\n' } }, { done: true, n: [1, 2] }];
    const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
    for (const size of [1, 2, 3, 7, 13, text.length]) {
      const out: unknown[] = [];
      const p = createNdjsonParser((o) => out.push(o));
      for (let i = 0; i < text.length; i += size) p.push(text.slice(i, i + size));
      p.end();
      expect(out).toEqual(lines);
    }
  });
  it('tolerates CRLF, blank lines and a missing trailing newline', () => {
    const out: unknown[] = [];
    const p = createNdjsonParser((o) => out.push(o));
    p.push('{"x":1}\r\n\r\n{"x"');
    p.push(':2}');
    p.end();
    expect(out).toEqual([{ x: 1 }, { x: 2 }]);
  });
  it('reports invalid lines', () => {
    const bad: string[] = [];
    const p = createNdjsonParser(() => {}, (l) => bad.push(l));
    p.push('nope\n{"ok":true}\n');
    expect(bad).toEqual(['nope']);
    const strict = createNdjsonParser(() => {});
    expect(() => strict.push('{broken\n')).toThrow();
  });
});

// ─── think / fences / extraction ─────────────────────────────────────────────

describe('think handling', () => {
  it('splits reasoning from content across chunk boundaries', () => {
    const full = 'pre<think>plan the layout</think><section>ok</section>';
    for (const size of [1, 2, 3, 5]) {
      const f = new ThinkFilter();
      for (let i = 0; i < full.length; i += size) f.push(full.slice(i, i + size));
      f.end();
      expect(f.content).toBe('pre<section>ok</section>');
      expect(f.thinking).toBe('plan the layout');
      expect(f.sawThink).toBe(true);
    }
  });
  it('reports the in-think state while streaming', () => {
    const f = new ThinkFilter();
    f.push('<thi');
    expect(f.content).toBe('');
    f.push('nk>hmm');
    expect(f.inThink).toBe(true);
    f.push('</think>done');
    expect(f.inThink).toBe(false);
    expect(f.content).toBe('done');
  });
  it('handles a stray closing tag (template-injected opening)', () => {
    const f = new ThinkFilter();
    f.push('reasoning here</think>\n<svg/>');
    f.end();
    expect(f.thinking).toBe('reasoning here');
    expect(f.content.trim()).toBe('<svg/>');
  });
  it('stripThink removes blocks and unterminated reasoning', () => {
    expect(stripThink('<think>a\nb</think>\nHello')).toBe('Hello');
    expect(stripThink('<thinking>x</thinking>Y')).toBe('Y');
    expect(stripThink('oops</think>Z')).toBe('Z');
    expect(stripThink('<think>never closed')).toBe('');
  });
});

describe('fences & extraction', () => {
  it('strips fences', () => {
    expect(stripFences('Here you go:\n```html\n<div>x</div>\n```\nEnjoy!')).toBe('<div>x</div>');
    expect(stripFences('```<svg></svg>```')).toBe('<svg></svg>');
    expect(stripFences('<p>plain</p>')).toBe('<p>plain</p>');
  });
  it('extracts html with separate css fence and chatter', () => {
    const reply = '<think>hmm</think>Sure! Here is the section:\n```html\n<section class="a">Hi</section>\n```\nAnd the CSS:\n```css\n.a{color:red}\n```\nThis design uses a bold color.';
    const html = extractHtml(reply);
    expect(html).toContain('<style>');
    expect(html).toContain('.a{color:red}');
    expect(html).toContain('<section class="a">Hi</section>');
    expect(html).not.toContain('Sure');
    expect(html).not.toContain('bold color');
  });
  it('extracts unfenced and partial html', () => {
    expect(extractHtml('Okay.\n<style>.x{}</style><div class="x">a</div>\nHope this helps!')).toBe('<style>.x{}</style><div class="x">a</div>');
    expect(extractHtml('```html\n<style>.x{color:red}</style><section><h1>Par')).toBe('<style>.x{color:red}</style><section><h1>Par');
    expect(extractHtml('no markup at all')).toBe('');
  });
  it('splits style and markup, including an unclosed style', () => {
    expect(splitStyleAndMarkup('<style>.a{}</style><p>x</p>')).toEqual({ css: '.a{}', markup: '<p>x</p>' });
    expect(splitStyleAndMarkup('<style>.a{color:r')).toEqual({ css: '.a{color:r', markup: '' });
  });
  it('extracts json from chatty replies', () => {
    expect(extractJson('```json\n{"a":[1,2,],}\n```')).toEqual({ a: [1, 2] });
    expect(extractJson('Result: {"animations":[]} done')).toEqual({ animations: [] });
    expect(() => extractJson('nothing')).toThrow();
  });
  it('summarizes prompts', () => {
    expect(summarizePrompt('short')).toBe('short');
    expect(summarizePrompt('A landing page for a coffee subscription startup with pricing and testimonials').length).toBeLessThanOrEqual(49);
  });
});

// ─── SVG ─────────────────────────────────────────────────────────────────────

describe('svg', () => {
  it('extracts, sanitizes and validates', () => {
    const reply = '<think>circle</think>Here:\n```svg\n<svg viewBox="0 0 100 100" width="100" height="100"><script>alert(1)</script><circle cx="50" cy="50" r="40" fill="#f00" onclick="x()"/><image href="https://evil/x.png"/><foreignObject><div>x</div></foreignObject></svg>\n```';
    const v = svgFromReply(reply);
    expect(v.ok).toBe(true);
    expect(v.svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(v.svg).toContain('<circle');
    expect(v.svg).not.toMatch(/script|onclick|foreignObject|<image|evil/i);
    expect(v.svg).not.toMatch(/\swidth="100"/);
    expect(v.width).toBe(100);
    expect(v.shapes).toBe(1);
  });
  it('derives a viewBox from width/height and rejects bad svg', () => {
    expect(validateSvg('<svg width="64" height="32"><rect width="10" height="10"/></svg>').svg).toContain('viewBox="0 0 64 32"');
    expect(validateSvg('<svg><rect width="1" height="1"/></svg>').ok).toBe(false);
    expect(validateSvg('<svg viewBox="0 0 10 10"></svg>').ok).toBe(false);
    expect(validateSvg('<div>no</div>').ok).toBe(false);
    expect(extractSvg('<svg viewBox="0 0 10 10"><rect', { partial: true })).toBe('<svg viewBox="0 0 10 10"><rect');
    expect(extractSvg('<svg viewBox="0 0 10 10"><rect/><circ')).toBe('<svg viewBox="0 0 10 10"><rect/></svg>');
  });
  it('strips external references but keeps local gradients', () => {
    const v = validateSvg('<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)"/><rect width="2" height="2" fill="url(http://x/y#z)"/></svg>');
    expect(v.ok).toBe(true);
    expect(v.svg).toContain('url(#g)');
    expect(v.svg).not.toContain('http://x');
  });
  it('uniquifies ids and references', () => {
    const out = uniquifySvgIds('<svg><linearGradient id="g1"/><rect fill="url(#g1)"/><use href="#g1"/></svg>', 'k1-');
    expect(out).toContain('id="k1-g1"');
    expect(out).toContain('url(#k1-g1)');
    expect(out).toContain('href="#k1-g1"');
  });
});

// ─── Recommendations ────────────────────────────────────────────────────────

const M = (name: string, extra: Partial<ModelInfo> = {}): ModelInfo => ({ name, capabilities: ['completion'], ...extra });

describe('recommendations', () => {
  const models: ModelInfo[] = [
    M('nomic-embed-text:latest', { parameterSize: '137M', capabilities: ['embedding'], family: 'nomic-bert' }),
    M('llama3.2:1b', { parameterSize: '1.2B', quantization: 'Q8_0' }),
    M('qwen2.5-coder:7b', { parameterSize: '7.6B', quantization: 'Q4_K_M', family: 'qwen2' }),
    M('qwen3:8b', { parameterSize: '8.2B', quantization: 'Q4_K_M', capabilities: ['completion', 'thinking', 'tools'] }),
    M('gemma3:12b', { parameterSize: '12.2B', quantization: 'Q4_K_M', capabilities: ['completion', 'vision'] }),
    M('llama3.1:405b', { parameterSize: '405B', quantization: 'Q4_K_M' }),
  ];
  it('parses parameter sizes', () => {
    expect(parseParams({ name: 'x', parameterSize: '7.6B' })).toBe(7.6);
    expect(parseParams({ name: 'x', parameterSize: '137M' })).toBeCloseTo(0.137);
    expect(parseParams({ name: 'qwen2.5-coder:14b-instruct' })).toBe(14);
    expect(parseParams({ name: 'foo:latest' })).toBeNull();
  });
  it('excludes embedding models', () => {
    expect(isEmbeddingModel(models[0])).toBe(true);
    expect(isEmbeddingModel(M('mxbai-embed-large'))).toBe(true);
    expect(isEmbeddingModel(models[2])).toBe(false);
    expect(recommendModels(models, 'ui').map((r) => r.name)).not.toContain('nomic-embed-text:latest');
  });
  it('ranks coder models first for ui and svg, instruct models for animation', () => {
    expect(bestModel(models, 'ui')?.name).toBe('qwen2.5-coder:7b');
    expect(bestModel(models, 'svg')?.name).toBe('qwen2.5-coder:7b');
    expect(bestModel(models, 'animation')?.name).toBe('qwen3:8b');
    const ui = recommendModels(models, 'ui');
    expect(ui[ui.length - 1].name).toBe('llama3.2:1b');
    expect(ui.find((r) => r.name === 'llama3.2:1b')?.suitable).toBe(false);
    expect(ui[0].reason).toMatch(/Coder/);
  });
  it('gives vision a bonus when matching the canvas', () => {
    const a = recommendModels(models, 'ui').find((r) => r.name === 'gemma3:12b')!.score;
    const b = recommendModels(models, 'ui', { wantVision: true }).find((r) => r.name === 'gemma3:12b')!.score;
    expect(b).toBeGreaterThan(a);
  });
  it('penalises very large models slightly vs sweet spot', () => {
    const big = recommendModels(models, 'edit').find((r) => r.name === 'llama3.1:405b')!.score;
    const mid = recommendModels([M('llama3.1:8b', { parameterSize: '8B' })], 'edit')[0].score;
    expect(mid).toBeGreaterThan(big);
  });
});

// ─── Animation validation ────────────────────────────────────────────────────

describe('animation validation', () => {
  const targets = [
    { id: 'n_hero', name: 'Hero' },
    { id: 'n_title', name: 'Title' },
  ];
  it('clamps durations, sorts offsets and maps blur', () => {
    const { items, warnings } = validateAnimations(
      {
        animations: [
          {
            target: 'n_title',
            name: 'Fade up',
            trigger: 'load',
            duration: 0.6,
            delay: 99999,
            easing: 'easeOut',
            keyframes: [
              { offset: 1, opacity: 1, y: 0, blur: 0 },
              { offset: 0, opacity: 0, y: 30, blur: 8 },
            ],
          },
          { target: 'nope', name: 'x', trigger: 'load', duration: 5, keyframes: [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 1 }] },
        ],
      },
      targets,
    );
    expect(items).toHaveLength(1);
    expect(warnings[0]).toMatch(/unknown/);
    const a = items[0].anim;
    expect(a.duration).toBe(600);
    expect(a.delay).toBe(10000);
    expect(a.easing).toBe('ease-out');
    expect(a.keyframes.map((k) => k.offset)).toEqual([0, 1]);
    expect(a.keyframes[0].values).toMatchObject({ opacity: 0, y: 30, filter: 'blur(8px)' });
    expect(a.presetId).toBe('ai');
  });
  it('completes single keyframes, clamps ranges and handles loops', () => {
    const { items } = validateAnimations(
      [
        { target: 'Hero', name: 'Pop', trigger: 'loop', duration: 20000, iterations: 3, keyframes: [{ offset: 0, opacity: 5, scale: 0.5 }] },
        { target: 'n_title', name: 'Spin', trigger: 'hover', duration: 30, keyframes: [{ offset: 150, rotate: 99999 }, { offset: -1, rotate: 0 }] },
      ],
      targets,
    );
    expect(items).toHaveLength(2);
    const pop = items[0].anim;
    expect(items[0].target).toBe('n_hero');
    expect(pop.iterations).toBe(-1);
    expect(pop.duration).toBe(10000);
    expect(pop.keyframes).toHaveLength(2);
    expect(pop.keyframes[0].values.opacity).toBe(0.05);
    expect(pop.keyframes[1].values).toMatchObject({ opacity: 1, scale: 1 });
    const spin = items[1].anim;
    expect(spin.duration).toBe(50);
    expect(spin.keyframes[1].values.rotate).toBe(3600);
    expect(spin.keyframes.map((k) => k.offset)).toEqual([0, 1]);
  });
  it('maps a single unknown target to the only selected element and rejects empties', () => {
    const r = validateAnimations({ animations: [{ target: 'whatever', name: 'a', trigger: 'load', duration: 300, keyframes: [{ offset: 0, x: -20 }, { offset: 1, x: 0 }] }] }, [targets[0]]);
    expect(r.items[0].target).toBe('n_hero');
    expect(validateAnimations({ animations: [{ target: 'n_hero', keyframes: [{ offset: 0 }] }] }, targets).items).toHaveLength(0);
    expect(normalizeEasing('cubic-bezier(0.2, 0.8, 0.2, 1)')).toBe('cubic-bezier(0.2, 0.8, 0.2, 1)');
    expect(normalizeEasing('javascript:alert(1)')).toMatch(/cubic-bezier/);
  });
});

// ─── Chat client (stubbed transport) ─────────────────────────────────────────

describe('ollama chat', () => {
  const original = platform.http.request;
  afterEach(() => {
    platform.http.request = original;
  });

  it('only sends think:false for thinking-capable models', () => {
    const base = { model: 'm', messages: [{ role: 'user' as const, content: 'hi' }], think: false };
    expect(buildChatBody({ ...base, capabilities: ['completion'] }).think).toBeUndefined();
    expect(buildChatBody({ ...base, capabilities: ['completion', 'thinking'] }).think).toBe(false);
    expect(buildChatBody({ ...base, format: { type: 'object' }, options: { temperature: 0.3, num_ctx: undefined } })).toMatchObject({ format: { type: 'object' }, options: { temperature: 0.3 }, stream: true });
  });

  it('streams split NDJSON, strips <think> and reports stats', async () => {
    const lines = ['<think>plan', '</think>', '<svg viewBox="0 0 1 1">', '<rect/></svg>'].map((c) => JSON.stringify({ message: { role: 'assistant', content: c }, done: false }));
    lines.push(JSON.stringify({ done: true, done_reason: 'stop', eval_count: 40, eval_duration: 2e9 }));
    const raw = lines.join('\n') + '\n';
    platform.http.request = async (_req, onChunk) => {
      for (let i = 0; i < raw.length; i += 9) onChunk?.(raw.slice(i, i + 9));
      return { ok: true, status: 200, text: '' };
    };
    const seen: boolean[] = [];
    const r = await chat({ model: 'm', messages: [] }, (p) => seen.push(p.inThink), undefined, { baseUrl: 'http://x' });
    expect(r.content).toBe('<svg viewBox="0 0 1 1"><rect/></svg>');
    expect(r.thinking).toBe('plan');
    expect(r.tokensPerSecond).toBe(20);
    expect(seen[0]).toBe(true);
  });

  it('maps errors to typed classes', async () => {
    platform.http.request = async (_req, onChunk) => {
      onChunk?.('{"error":"model \\"x\\" not found, try pulling it first"}\n');
      return { ok: false, status: 404, text: '' };
    };
    await expect(chat({ model: 'x', messages: [] }, undefined, undefined, { baseUrl: 'http://x' })).rejects.toMatchObject({ kind: 'model-missing' });
    platform.http.request = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(chat({ model: 'x', messages: [] }, undefined, undefined, { baseUrl: 'http://x' })).rejects.toMatchObject({ kind: 'not-running' });
    const ctrl = new AbortController();
    platform.http.request = (_req, _c, signal) =>
      new Promise((_res, rej) => signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    const p = chat({ model: 'x', messages: [] }, undefined, ctrl.signal, { baseUrl: 'http://x' });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ kind: 'aborted' });
    platform.http.request = (_req, _c, signal) =>
      new Promise((_res, rej) => signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    const t = chat({ model: 'x', messages: [] }, undefined, undefined, { baseUrl: 'http://x', firstByteTimeoutMs: 20 });
    await expect(t).rejects.toBeInstanceOf(OllamaError);
    await expect(t).rejects.toMatchObject({ kind: 'timeout' });
  });
});

import * as ollamaApi from '@/core/ai/ollama';
describe('model pre-loading', () => {
  it('exports preload / loaded-models / unload helpers', () => {
    expect(typeof ollamaApi.preloadModel).toBe('function');
    expect(typeof ollamaApi.loadedModels).toBe('function');
    expect(typeof ollamaApi.unloadModel).toBe('function');
  });
});
