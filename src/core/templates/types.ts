import type { DesignTokens } from '../model/types';

export interface TemplateDef {
  id: string;
  name: string;
  description: string;
  /** Body markup (no <html>/<body>). */
  html: string;
  /** Stylesheet. `body` rules become the page frame's styles. Use `var(--k-*)` tokens. */
  css: string;
  /** Design tokens applied to the new document. */
  tokens?: {
    colors?: { name: string; value: string }[];
    fonts?: Partial<DesignTokens['fonts']>;
    radius?: number;
  };
  /** Page title / first page name. */
  pageName?: string;
  /** Accent used by template cards before the live preview loads. */
  swatch: string;
}
