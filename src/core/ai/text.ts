/**
 * Pure text helpers for LLM output: NDJSON stream parsing, `<think>` handling,
 * markdown-fence stripping and extraction of HTML / SVG / JSON payloads from
 * chatty model replies. No DOM or store dependencies (unit tested).
 */

// ─── NDJSON ──────────────────────────────────────────────────────────────────

export interface NdjsonParser {
  /** Feed a raw text chunk (may contain partial lines). */
  push(chunk: string): void;
  /** Flush the trailing line (if the stream did not end with a newline). */
  end(): void;
}

/**
 * Incremental newline-delimited JSON parser, robust to arbitrary chunk boundaries
 * (lines split across chunks, several lines per chunk, CRLF, blank lines).
 * Invalid lines are reported to `onError` (default: throw).
 */
export function createNdjsonParser<T = unknown>(onObject: (obj: T) => void, onError?: (line: string, err: unknown) => void): NdjsonParser {
  let buf = '';
  const handle = (line: string) => {
    const t = line.trim();
    if (!t) return;
    let obj: T;
    try {
      obj = JSON.parse(t) as T;
    } catch (err) {
      if (onError) onError(t, err);
      else throw new SyntaxError(`Invalid NDJSON line: ${t.slice(0, 120)}`);
      return;
    }
    onObject(obj);
  };
  return {
    push(chunk) {
      buf += chunk;
      let nl = buf.indexOf('\n');
      while (nl >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        handle(line);
        nl = buf.indexOf('\n');
      }
    },
    end() {
      const rest = buf;
      buf = '';
      handle(rest);
    },
  };
}

// ─── <think> handling ────────────────────────────────────────────────────────

const OPEN = '<think>';
const CLOSE = '</think>';

/** Length of the longest suffix of `s` that is a proper prefix of one of `tags`. */
function partialTagSuffix(s: string, tags: string[]): number {
  let best = 0;
  for (const tag of tags) {
    for (let n = Math.min(tag.length - 1, s.length); n > best; n--) {
      if (s.endsWith(tag.slice(0, n))) {
        best = n;
        break;
      }
    }
  }
  return best;
}

/**
 * Streaming splitter separating `<think>…</think>` reasoning from visible content,
 * correct across chunk boundaries (a tag may be split over several chunks).
 * Also handles templates that emit only the closing tag.
 */
export class ThinkFilter {
  content = '';
  thinking = '';
  inThink = false;
  /** True once any reasoning was seen. */
  sawThink = false;
  private pending = '';

  push(chunk: string): void {
    let s = this.pending + chunk;
    this.pending = '';
    while (s) {
      if (!this.inThink) {
        const i = s.indexOf(OPEN);
        const j = s.indexOf(CLOSE);
        if (j >= 0 && (i < 0 || j < i) && !this.sawThink) {
          // stray closing tag: everything before it was reasoning
          this.thinking += this.content + s.slice(0, j);
          this.content = '';
          this.sawThink = true;
          s = s.slice(j + CLOSE.length);
          continue;
        }
        if (i >= 0) {
          this.content += s.slice(0, i);
          this.inThink = true;
          this.sawThink = true;
          s = s.slice(i + OPEN.length);
          continue;
        }
        const hold = partialTagSuffix(s, this.sawThink ? [OPEN] : [OPEN, CLOSE]);
        this.content += s.slice(0, s.length - hold);
        this.pending = s.slice(s.length - hold);
        s = '';
      } else {
        const j = s.indexOf(CLOSE);
        if (j >= 0) {
          this.thinking += s.slice(0, j);
          this.inThink = false;
          s = s.slice(j + CLOSE.length);
          continue;
        }
        const hold = partialTagSuffix(s, [CLOSE]);
        this.thinking += s.slice(0, s.length - hold);
        this.pending = s.slice(s.length - hold);
        s = '';
      }
    }
  }

  end(): void {
    if (this.inThink) this.thinking += this.pending;
    else this.content += this.pending;
    this.pending = '';
  }
}

/** Remove reasoning blocks (`<think>`, `<thinking>`, `<reasoning>`) from a full reply. */
export function stripThink(text: string): string {
  let t = text.replace(/<(think|thinking|reasoning)>[\s\S]*?(<\/\1>|$)/gi, '');
  const close = t.search(/<\/(think|thinking|reasoning)>/i);
  if (close >= 0) {
    const m = /<\/(think|thinking|reasoning)>/gi;
    let last = 0;
    let mm: RegExpExecArray | null;
    while ((mm = m.exec(t))) last = mm.index + mm[0].length;
    t = t.slice(last);
  }
  return t.trim();
}

// ─── Markdown fences ─────────────────────────────────────────────────────────

export interface FencedBlock {
  lang: string;
  code: string;
  /** false when the closing fence is missing (truncated / still streaming) */
  closed: boolean;
}

/** All fenced code blocks (``` or ~~~) in order, including an unterminated last one. */
export function fencedBlocks(text: string): FencedBlock[] {
  const out: FencedBlock[] = [];
  const re = /(^|\n)[ \t]*(```|~~~)[ \t]*([\w+-]*)[^\n]*\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const fence = m[2];
    const start = m.index + m[0].length;
    const c = text.indexOf(fence, start);
    if (c >= 0) {
      out.push({ lang: m[3].toLowerCase(), code: text.slice(start, c).replace(/\n[ \t]*$/, ''), closed: true });
      re.lastIndex = c + fence.length;
    } else {
      out.push({ lang: m[3].toLowerCase(), code: text.slice(start), closed: false });
      break;
    }
  }
  return out;
}

/** Strip markdown fences: returns the code of all fenced blocks joined, or the text itself. */
export function stripFences(text: string): string {
  const blocks = fencedBlocks(text);
  if (!blocks.length) {
    // inline single-line fence like ```<svg …>```
    const inline = /```[\w-]*\s*([\s\S]*?)```/.exec(text);
    return (inline ? inline[1] : text).trim();
  }
  return blocks
    .map((b) => b.code)
    .join('\n')
    .trim();
}

// ─── Payload extraction ──────────────────────────────────────────────────────

const HTML_START_RE = /<(!doctype|html|head|body|style|header|nav|main|section|article|aside|footer|div|form|ul|ol|h[1-6]|p|a|button|figure|svg|span|table|blockquote|img|label|input)\b/i;

/**
 * Extract the HTML (+ CSS) payload from a model reply. Handles reasoning blocks,
 * fenced ```html / ```css blocks (CSS blocks are wrapped in <style>), chatter
 * before/after the markup and full documents. Works on partial (streaming) text.
 * Returns '' when no markup is found.
 */
export function extractHtml(reply: string): string {
  const text = stripThink(reply);
  const blocks = fencedBlocks(text);
  let html = '';
  if (blocks.length) {
    const css: string[] = [];
    const markup: string[] = [];
    for (const b of blocks) {
      if (b.lang === 'css' || b.lang === 'scss') css.push(b.code);
      else if (/</.test(b.code)) markup.push(b.code);
    }
    html = (css.length ? `<style>\n${css.join('\n')}\n</style>\n` : '') + markup.join('\n');
    if (!markup.length && !css.length) html = '';
  }
  if (!html) html = text;
  const start = html.search(HTML_START_RE);
  if (start < 0) return '';
  html = html.slice(start);
  // trim trailing chatter after the last closing tag
  const lastClose = html.lastIndexOf('>');
  if (lastClose >= 0) {
    const tail = html.slice(lastClose + 1);
    if (tail.trim() && !/[<{]/.test(tail) && /\b(this|the|here|i |note|let me|feel free|hope)\b/i.test(tail)) html = html.slice(0, lastClose + 1);
  }
  return html.trim();
}

/** Split extracted HTML into its CSS (all <style> contents, incl. an unclosed one) and markup. */
export function splitStyleAndMarkup(html: string): { css: string; markup: string } {
  let css = '';
  let markup = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, c: string) => {
    css += c + '\n';
    return '';
  });
  const open = /<style\b[^>]*>/i.exec(markup);
  if (open) {
    // unterminated <style> (still streaming): everything after it is CSS
    css += markup.slice(open.index + open[0].length);
    markup = markup.slice(0, open.index);
  }
  return { css: css.trim(), markup: markup.trim() };
}

/**
 * Extract a single `<svg>…</svg>` from a reply. With `partial`, an unterminated
 * svg (still streaming) is returned as-is; otherwise a missing close tag is added.
 */
export function extractSvg(reply: string, opts: { partial?: boolean } = {}): string {
  const text = stripFences(stripThink(reply));
  const start = text.search(/<svg\b/i);
  if (start < 0) return '';
  const rest = text.slice(start);
  const end = rest.toLowerCase().lastIndexOf('</svg>');
  if (end >= 0) return rest.slice(0, end + 6).trim();
  if (opts.partial) return rest.trim();
  // truncated: drop a dangling partial tag and close
  const lastGt = rest.lastIndexOf('>');
  return (lastGt >= 0 ? rest.slice(0, lastGt + 1) : rest) + '</svg>';
}

/** Extract the first JSON object/array from a reply and parse it. Throws SyntaxError. */
export function extractJson(reply: string): unknown {
  const text = stripFences(stripThink(reply));
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const first = firstObj < 0 ? firstArr : firstArr < 0 ? firstObj : Math.min(firstObj, firstArr);
  if (first < 0) throw new SyntaxError('No JSON found in the reply');
  const closeCh = text[first] === '{' ? '}' : ']';
  const last = text.lastIndexOf(closeCh);
  if (last <= first) throw new SyntaxError('Unterminated JSON in the reply');
  const slice = text.slice(first, last + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // common small-model slips: trailing commas, single-quoted keys
    const repaired = slice.replace(/,\s*([}\]])/g, '$1').replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":');
    return JSON.parse(repaired);
  }
}

/** Short one-line summary of a prompt for history / undo labels. */
export function summarizePrompt(prompt: string, max = 48): string {
  const t = prompt.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,.;:\s]+$/, '') + '…';
}

/** Rough token estimate (≈3.6 chars/token for code-heavy text). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}

/** Truncate long text to `maxChars`, cutting at a line boundary and marking the cut. */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const nl = cut.lastIndexOf('\n');
  return (nl > maxChars * 0.7 ? cut.slice(0, nl) : cut) + '\n… (truncated)';
}
