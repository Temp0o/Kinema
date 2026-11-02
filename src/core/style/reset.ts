/**
 * The design reset shared by the editor canvas (scoped under `.kc-root`) and
 * exported sites (global). Keeping one source guarantees WYSIWYG exports.
 */
export function designResetCss(scope: string | null): string {
  const s = (sel: string) =>
    scope
      ? sel
          .split(',')
          .map((x) => {
            const t = x.trim();
            if (t === ':root' || t === 'html' || t === 'body') return scope;
            return `${scope} ${t}`;
          })
          .join(', ')
      : sel;
  return `
${s('*, *::before, *::after')} { box-sizing: border-box; }
${s('body')} { margin: 0; font-family: var(--k-font-body); color: var(--k-text, #0f1020); line-height: 1.5; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
${s('h1, h2, h3, h4, h5, h6')} { margin: 0; font-family: var(--k-font-heading); font-weight: 700; line-height: 1.15; }
${s('p, figure, blockquote, dl, dd, pre')} { margin: 0; }
${s('ul, ol')} { margin: 0; padding-left: 1.25em; }
${s('img, svg, video, canvas, picture')} { display: block; max-width: 100%; }
${s('button, input, select, textarea')} { font: inherit; color: inherit; margin: 0; }
${s('button')} { background: none; border: none; padding: 0; cursor: pointer; text-align: inherit; }
${s('a')} { color: inherit; }
${s('hr')} { border: none; border-top: 1px solid currentColor; margin: 0; opacity: .2; }
${s('table')} { border-collapse: collapse; }
`.trim();
}
