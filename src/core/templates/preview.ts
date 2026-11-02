/** Live template previews (sandboxed iframe documents) for template cards. */
import { createDocument } from '../model/factory';
import { designResetCss } from '../style/reset';
import { tokenCssVars } from '../style/style';
import { findBundledFont } from '../fonts/designFonts';
import { applyTemplateTokens } from './index';
import type { TemplateDef } from './types';

function fontFaceCss(families: string[]): string {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const fam of families) {
    const f = findBundledFont(fam);
    if (!f || seen.has(f.family)) continue;
    seen.add(f.family);
    for (const file of f.files) out.push(`@font-face{font-family:'${f.family}';src:url(${file.url}) format('woff2');font-weight:${file.weight};font-style:${file.style};font-display:block}`);
  }
  return out.join('\n');
}

/** Standalone HTML document rendering a template (for sandboxed preview iframes). */
export function templatePreviewHtml(def: TemplateDef): string {
  const doc = createDocument(def.name);
  applyTemplateTokens(doc, def);
  const vars = Object.entries(tokenCssVars(doc))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  const fonts = fontFaceCss([doc.tokens.fonts.heading, doc.tokens.fonts.body]);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts}
:root{${vars}}
${designResetCss(null)}
html,body{overflow:hidden}
body{min-height:900px;display:flex;flex-direction:column;background:#fff}
${def.css}
</style></head><body>${def.html}</body></html>`;
}
