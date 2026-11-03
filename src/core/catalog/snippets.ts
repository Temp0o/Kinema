/**
 * Shared design language for catalog snippets. Everything is expressed through
 * the project's design-token CSS variables so inserted items adopt each
 * project's palette, fonts and radius.
 */

/** Hairline border color derived from the text token. */
export const BORDER = 'color-mix(in srgb, var(--k-text) 10%, transparent)';
export const BORDER_STRONG = 'color-mix(in srgb, var(--k-text) 16%, transparent)';
export const HAIRLINE = `1px solid ${BORDER}`;

/** Transparent tint of a token color (default: primary). */
export const tint = (pct: number, color = 'var(--k-primary)') => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
/** Opaque tint of a token color mixed into the surface color. */
export const soft = (pct: number, color = 'var(--k-primary)') => `color-mix(in srgb, ${color} ${pct}%, var(--k-surface))`;

export const R_SM = 'calc(var(--k-radius) * 0.67)';
export const R_MD = 'var(--k-radius)';
export const R_LG = 'calc(var(--k-radius) * 1.34)';
export const R_XL = 'calc(var(--k-radius) * 2)';

export const SHADOW_XS = '0 1px 2px rgba(16, 24, 40, 0.06)';
export const SHADOW_SM = '0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 12px -4px rgba(16, 24, 40, 0.08)';
export const SHADOW_MD = '0 1px 2px rgba(16, 24, 40, 0.04), 0 12px 32px -12px rgba(16, 24, 40, 0.16)';
export const SHADOW_LG = '0 2px 4px rgba(16, 24, 40, 0.04), 0 24px 64px -16px rgba(16, 24, 40, 0.24)';

export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** Soft mesh gradients used as tasteful image placeholders. */
export const MESH_COOL = `radial-gradient(90% 120% at 0% 0%, color-mix(in srgb, var(--k-primary) 55%, #ffffff) 0%, transparent 62%), radial-gradient(80% 110% at 100% 100%, color-mix(in srgb, var(--k-accent) 60%, #ffffff) 0%, transparent 60%), linear-gradient(135deg, color-mix(in srgb, var(--k-primary) 24%, #ffffff), color-mix(in srgb, var(--k-accent) 24%, #ffffff))`;
export const MESH_WARM = `radial-gradient(90% 120% at 100% 0%, #ffd6a5 0%, transparent 60%), radial-gradient(90% 110% at 0% 100%, color-mix(in srgb, var(--k-primary) 45%, #ffffff) 0%, transparent 62%), linear-gradient(160deg, #ffe4ef, #f3e8ff)`;
export const MESH_DUSK = `radial-gradient(80% 100% at 15% 10%, color-mix(in srgb, var(--k-primary) 80%, transparent) 0%, transparent 60%), radial-gradient(70% 90% at 90% 90%, color-mix(in srgb, var(--k-accent) 70%, transparent) 0%, transparent 60%), linear-gradient(135deg, color-mix(in srgb, var(--k-text) 92%, var(--k-primary)), var(--k-text))`;
export const MESH_MINT = `radial-gradient(90% 120% at 0% 100%, #b9f6ca 0%, transparent 60%), radial-gradient(90% 120% at 100% 0%, color-mix(in srgb, var(--k-accent) 55%, #ffffff) 0%, transparent 60%), linear-gradient(135deg, #e6fff4, #e0f7ff)`;

/** Avatar gradient fills (paired with white initials). */
export const AVATAR_FILLS = [
  'linear-gradient(135deg, #8b5cf6, #ec4899)',
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #10b981, #06b6d4)',
  'linear-gradient(135deg, #6366f1, #22d3ee)',
  'linear-gradient(135deg, #f43f5e, #fb923c)',
];

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'light';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'height: 34px; padding: 0 14px; font-size: 13.5px;',
  md: 'height: 40px; padding: 0 18px; font-size: 14.5px;',
  lg: 'height: 48px; padding: 0 24px; font-size: 16px;',
};

/** Button rules (base + :hover + :focus-visible) for a selector. */
export function buttonCss(sel: string, variant: ButtonVariant, size: ButtonSize = 'md'): string {
  const base = `display: inline-flex; align-items: center; justify-content: center; gap: 8px; ${BTN_SIZES[size]} border-radius: ${R_SM}; font-weight: 600; line-height: 1; letter-spacing: -0.01em; white-space: nowrap; text-decoration: none; cursor: pointer; transition: background-color 0.18s ${EASE}, border-color 0.18s ${EASE}, box-shadow 0.18s ${EASE}, transform 0.18s ${EASE}, color 0.18s ${EASE};`;
  const v: Record<ButtonVariant, [string, string]> = {
    primary: [
      `background-color: var(--k-primary); color: #ffffff; border: 1px solid transparent; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.18);`,
      `background-color: color-mix(in srgb, var(--k-primary) 86%, #000000); transform: translateY(-1px); box-shadow: 0 8px 20px -6px color-mix(in srgb, var(--k-primary) 60%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.18);`,
    ],
    secondary: [
      `background-color: var(--k-surface); color: var(--k-text); border: 1px solid ${BORDER_STRONG}; box-shadow: ${SHADOW_XS};`,
      `background-color: color-mix(in srgb, var(--k-text) 4%, var(--k-surface)); border-color: color-mix(in srgb, var(--k-text) 26%, transparent);`,
    ],
    ghost: [`background-color: transparent; color: var(--k-text); border: 1px solid transparent;`, `background-color: color-mix(in srgb, var(--k-text) 6%, transparent);`],
    dark: [
      `background-color: var(--k-text); color: var(--k-surface); border: 1px solid transparent; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.2);`,
      `background-color: color-mix(in srgb, var(--k-text) 82%, var(--k-primary)); transform: translateY(-1px);`,
    ],
    light: [
      `background-color: #ffffff; color: #0f1020; border: 1px solid transparent; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);`,
      `background-color: rgba(255, 255, 255, 0.88); transform: translateY(-1px); box-shadow: 0 10px 30px -10px rgba(255, 255, 255, 0.5);`,
    ],
  };
  const [rest, hover] = v[variant];
  return `${sel} { ${base} ${rest} }
${sel}:hover { ${hover} }
${sel}:focus-visible { outline: none; box-shadow: 0 0 0 4px ${tint(22)}; }`;
}

/** Text input / textarea / select rules for a selector. */
export function inputCss(sel: string, height = 40): string {
  return `${sel} { width: 100%; height: ${height}px; padding: 0 12px; border: 1px solid ${BORDER_STRONG}; border-radius: ${R_SM}; background-color: var(--k-surface); color: var(--k-text); font-size: 14.5px; box-shadow: ${SHADOW_XS}; outline: none; transition: border-color 0.16s ${EASE}, box-shadow 0.16s ${EASE}; }
${sel}:hover { border-color: color-mix(in srgb, var(--k-text) 28%, transparent); }
${sel}:focus { border-color: var(--k-primary); box-shadow: 0 0 0 4px ${tint(16)}; }`;
}

/** Chevron used by custom <select> styling (static color: data URLs can't read CSS variables). */
export const SELECT_CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

/** Gradient landscape placeholder for <img> items (a data URL, so no network). */
export const PLACEHOLDER_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9ccff"/><stop offset=".55" stop-color="#c3d4ff"/><stop offset="1" stop-color="#b6f0f7"/></linearGradient><radialGradient id="s" cx=".72" cy=".28" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="800" height="520" fill="url(#g)"/><rect width="800" height="520" fill="url(#s)"/><circle cx="584" cy="150" r="46" fill="#fff" fill-opacity=".75"/><path d="M0 410 190 250l120 96 140-150 350 254v70H0z" fill="#fff" fill-opacity=".42"/><path d="M0 470 240 330l170 110 120-70 270 150H0z" fill="#fff" fill-opacity=".6"/></svg>`,
)}`;

/** Fade-up entrance keyframes shared by hero sections. */
export const RISE_KEYFRAMES = `@keyframes rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }`;
