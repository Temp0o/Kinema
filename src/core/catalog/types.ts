/**
 * Component catalog item definitions. Items are authored as HTML + CSS snippets
 * (converted to nodes with the HTML importer) so they stay readable, responsive
 * (media queries → breakpoints) and themable (design token CSS variables).
 */

export type CatalogCategoryId = 'basics' | 'layout' | 'navigation' | 'hero' | 'cards' | 'forms' | 'content' | 'feedback' | 'data';

export interface CatalogCategory {
  id: CatalogCategoryId;
  label: string;
  /** One-line description shown in the panel section header tooltip. */
  description: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: CatalogCategoryId;
  keywords: string[];
  /** Markup with a single root element (use `data-name` for nice layer names). */
  html: string;
  /** Stylesheet for the markup (supports @media, :hover/:focus, @keyframes). */
  css: string;
  /**
   * Natural render width in px (previews and freeform placement measure the item
   * at this width). Omit for intrinsically sized elements such as buttons.
   */
  width?: number;
}
