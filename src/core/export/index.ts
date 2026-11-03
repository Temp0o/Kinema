/**
 * Public API of the Kinema exporter.
 *
 *   compileSite(doc, opts)            → Promise<{ files, entry, pages, stats }>  (with assets & fonts)
 *   compileSiteText(doc, opts)        → { files, binaries, entry, pages, stats } (sync, text only)
 *   compileFragment(doc, nodeId, opts) → { html, css, js }                         (one element)
 *
 * Single-file output: `compileSite(doc, { bundle: 'single' })`.
 */
export {
  compileSite,
  compileSiteText,
  compileFragment,
  escapeHtml,
  escapeAttr,
  type AssetMode,
  type BinaryRef,
  type CompileResult,
  type ExportOptions,
  type ExportStats,
  type Fragment,
  type OutFile,
  type PageOut,
  type SiteText,
} from './compiler';
export { evalEasing, parseEasing, remapIterationEasing } from './easing';
export { minifyCss } from './css';
export { slugify } from './naming';
