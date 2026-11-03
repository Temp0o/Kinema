import type { CatalogItem } from '../types';
import { icon } from '../icons';
import { AVATAR_FILLS, BORDER, BORDER_STRONG, EASE, HAIRLINE, R_SM, SHADOW_MD, SHADOW_XS, buttonCss, tint } from '../snippets';

const MARK = (sel: string, size = 28) =>
  `${sel} { width: ${size}px; height: ${size}px; border-radius: ${Math.round(size * 0.3)}px; background-image: linear-gradient(135deg, var(--k-primary), var(--k-accent)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3); flex: none; }`;

const NAV_LINK = (sel: string) =>
  `${sel} { color: var(--k-muted); font-size: 14.5px; font-weight: 500; text-decoration: none; transition: color 0.16s ${EASE}; }
${sel}:hover { color: var(--k-text); }`;

const MENU_BTN = (sel: string) =>
  `${sel} { display: none; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: ${R_SM}; border: 1px solid ${BORDER_STRONG}; color: var(--k-text); }
${sel}-icon { width: 18px; height: 18px; }`;

const LINKS4 = (cls: string) =>
  ['Product', 'Solutions', 'Pricing', 'Docs'].map((l) => `<a class="${cls}" href="#">${l}</a>`).join('');

export const NAVIGATION: CatalogItem[] = [
  {
    id: 'navbar-simple',
    name: 'Navbar · Simple',
    category: 'navigation',
    keywords: ['navbar', 'header', 'menu', 'navigation', 'top bar', 'links'],
    width: 1280,
    html: `<header class="nav" data-name="Navbar"><div class="nav-inner">
<a class="nav-brand" href="#" data-name="Logo"><div class="nav-mark"></div><span class="nav-name">Acme</span></a>
<nav class="nav-links">${LINKS4('nav-link')}</nav>
<div class="nav-actions"><a class="nav-signin" href="#">Sign in</a><button class="nav-menu" aria-label="Open menu">${icon('menu', 'nav-menu-icon')}</button></div>
</div></header>`,
    css: `.nav { width: 100%; background-color: var(--k-surface); border-bottom: ${HAIRLINE}; }
.nav-inner { display: flex; align-items: center; gap: 40px; max-width: 1200px; height: 64px; margin: 0 auto; padding: 0 24px; }
.nav-brand { display: flex; align-items: center; gap: 10px; color: var(--k-text); text-decoration: none; }
${MARK('.nav-mark')}
.nav-name { font-family: var(--k-font-heading); font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
.nav-links { display: flex; align-items: center; gap: 28px; flex: 1; }
${NAV_LINK('.nav-link')}
.nav-actions { display: flex; align-items: center; gap: 12px; }
${buttonCss('.nav-signin', 'secondary', 'sm')}
${MENU_BTN('.nav-menu')}
@media (max-width: 640px) { .nav-links { display: none; } .nav-inner { justify-content: space-between; padding: 0 16px; } .nav-signin { display: none; } .nav-menu { display: flex; } }`,
  },
  {
    id: 'navbar-centered',
    name: 'Navbar · Centered logo',
    category: 'navigation',
    keywords: ['navbar', 'header', 'centered', 'logo', 'navigation', 'brand'],
    width: 1280,
    html: `<header class="cnav" data-name="Navbar centered"><div class="cnav-inner">
<nav class="cnav-links"><a class="cnav-link" href="#">Shop</a><a class="cnav-link" href="#">Collections</a><a class="cnav-link" href="#">Journal</a></nav>
<a class="cnav-brand" href="#" data-name="Logo">${icon('sparkles', 'cnav-mark', 2)}<span class="cnav-name">Lumen</span></a>
<div class="cnav-actions"><a class="cnav-link" href="#">Account</a><a class="cnav-cart" href="#">${icon('shopping-cart', 'cnav-cart-icon')}<span class="cnav-count">2</span></a><button class="cnav-menu" aria-label="Open menu">${icon('menu', 'cnav-menu-icon')}</button></div>
</div></header>`,
    css: `.cnav { width: 100%; background-color: var(--k-surface); border-bottom: ${HAIRLINE}; }
.cnav-inner { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; max-width: 1200px; height: 72px; margin: 0 auto; padding: 0 24px; }
.cnav-links { display: flex; align-items: center; gap: 28px; }
${NAV_LINK('.cnav-link')}
.cnav-brand { display: flex; align-items: center; gap: 8px; color: var(--k-text); text-decoration: none; }
.cnav-mark { width: 22px; height: 22px; color: var(--k-primary); }
.cnav-name { font-family: var(--k-font-heading); font-size: 22px; font-weight: 700; letter-spacing: -0.03em; }
.cnav-actions { display: flex; align-items: center; justify-content: flex-end; gap: 20px; }
.cnav-cart { position: relative; display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 50%; color: var(--k-text); background-color: color-mix(in srgb, var(--k-text) 5%, transparent); transition: background-color 0.16s ${EASE}; }
.cnav-cart:hover { background-color: color-mix(in srgb, var(--k-text) 10%, transparent); }
.cnav-cart-icon { width: 18px; height: 18px; }
.cnav-count { position: absolute; left: 24px; top: -2px; display: grid; place-items: center; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background-color: var(--k-primary); color: #ffffff; font-size: 11px; font-weight: 700; border: 2px solid var(--k-surface); }
${MENU_BTN('.cnav-menu')}
@media (max-width: 640px) { .cnav-links { display: none; } .cnav-inner { grid-template-columns: auto 1fr; gap: 12px; padding: 0 16px; } .cnav-actions .cnav-link { display: none; } .cnav-menu { display: flex; } }`,
  },
  {
    id: 'navbar-cta',
    name: 'Navbar · With CTA',
    category: 'navigation',
    keywords: ['navbar', 'floating', 'pill', 'cta', 'header', 'sticky', 'glass'],
    width: 1280,
    html: `<div class="pnav-wrap" data-name="Navbar with CTA"><nav class="pnav">
<a class="pnav-brand" href="#" data-name="Logo"><div class="pnav-mark"></div><span class="pnav-name">Kinema</span></a>
<div class="pnav-links"><a class="pnav-link" href="#">Features</a><a class="pnav-link" href="#">Showcase</a><a class="pnav-link" href="#">Pricing</a><a class="pnav-link" href="#">Changelog</a></div>
<div class="pnav-actions"><a class="pnav-login" href="#">Log in</a><a class="pnav-cta" href="#">Start free ${icon('arrow-right', 'pnav-cta-icon')}</a></div>
</nav></div>`,
    css: `.pnav-wrap { width: 100%; padding: 16px 24px; }
.pnav { display: flex; align-items: center; gap: 32px; max-width: 1080px; height: 60px; margin: 0 auto; padding: 0 10px 0 20px; border-radius: 999px; background-color: color-mix(in srgb, var(--k-surface) 82%, transparent); border: ${HAIRLINE}; box-shadow: ${SHADOW_MD}; backdrop-filter: blur(14px); }
.pnav-brand { display: flex; align-items: center; gap: 9px; color: var(--k-text); text-decoration: none; }
${MARK('.pnav-mark', 24)}
.pnav-name { font-family: var(--k-font-heading); font-size: 16px; font-weight: 700; letter-spacing: -0.02em; }
.pnav-links { display: flex; align-items: center; justify-content: center; gap: 4px; flex: 1; }
.pnav-link { padding: 8px 14px; border-radius: 999px; color: var(--k-muted); font-size: 14px; font-weight: 500; text-decoration: none; transition: color 0.16s ${EASE}, background-color 0.16s ${EASE}; }
.pnav-link:hover { color: var(--k-text); background-color: color-mix(in srgb, var(--k-text) 6%, transparent); }
.pnav-actions { display: flex; align-items: center; gap: 6px; }
.pnav-login { padding: 8px 14px; color: var(--k-text); font-size: 14px; font-weight: 600; text-decoration: none; }
${buttonCss('.pnav-cta', 'primary', 'sm')}
.pnav-cta { border-radius: 999px; }
.pnav-cta-icon { width: 15px; height: 15px; }
@media (max-width: 1024px) { .pnav-links { display: none; } .pnav { justify-content: space-between; } }
@media (max-width: 640px) { .pnav-wrap { padding: 12px; } .pnav-login { display: none; } }`,
  },
  {
    id: 'sidebar',
    name: 'Sidebar navigation',
    category: 'navigation',
    keywords: ['sidebar', 'side nav', 'menu', 'dashboard', 'app shell', 'vertical navigation'],
    width: 264,
    html: `<aside class="side" data-name="Sidebar">
<div class="side-brand"><div class="side-mark"></div><span class="side-org">Acme Inc.</span>${icon('chevron-down', 'side-chev')}</div>
<div class="side-search">${icon('search', 'side-search-icon')}<span class="side-search-text">Search</span><span class="side-kbd">⌘K</span></div>
<nav class="side-nav">
<a class="side-link side-link--active" href="#">${icon('house', 'side-icon')}<span class="side-label">Home</span></a>
<a class="side-link" href="#">${icon('inbox', 'side-icon')}<span class="side-label">Inbox</span><span class="side-count">12</span></a>
<a class="side-link" href="#">${icon('layout-dashboard', 'side-icon')}<span class="side-label">Projects</span></a>
<a class="side-link" href="#">${icon('chart-column', 'side-icon')}<span class="side-label">Analytics</span></a>
<a class="side-link" href="#">${icon('users', 'side-icon')}<span class="side-label">Team</span></a>
</nav>
<span class="side-section">Favorites</span>
<nav class="side-nav">
<a class="side-link" href="#"><div class="side-dot side-dot--a"></div><span class="side-label">Website redesign</span></a>
<a class="side-link" href="#"><div class="side-dot side-dot--b"></div><span class="side-label">Mobile app</span></a>
<a class="side-link" href="#"><div class="side-dot side-dot--c"></div><span class="side-label">Brand refresh</span></a>
</nav>
<div class="side-spacer"></div>
<div class="side-user"><div class="side-avatar">JD</div><div class="side-user-copy"><span class="side-user-name">Jordan Diaz</span><span class="side-user-mail">jordan@acme.com</span></div>${icon('settings', 'side-settings')}</div>
</aside>`,
    css: `.side { display: flex; flex-direction: column; gap: 6px; width: 264px; height: 680px; padding: 14px 12px; background-color: var(--k-surface); border-right: ${HAIRLINE}; }
.side-brand { display: flex; align-items: center; gap: 10px; padding: 6px 8px 10px; }
${MARK('.side-mark', 26)}
.side-org { flex: 1; font-size: 14.5px; font-weight: 700; letter-spacing: -0.01em; }
.side-chev { width: 15px; height: 15px; color: var(--k-muted); }
.side-search { display: flex; align-items: center; gap: 8px; height: 36px; margin-bottom: 8px; padding: 0 10px; border-radius: ${R_SM}; border: 1px solid ${BORDER}; background-color: color-mix(in srgb, var(--k-text) 3%, var(--k-surface)); color: var(--k-muted); }
.side-search-icon { width: 15px; height: 15px; }
.side-search-text { flex: 1; font-size: 13.5px; }
.side-kbd { padding: 1px 6px; border-radius: 5px; border: 1px solid ${BORDER}; font-size: 11px; font-weight: 600; background-color: var(--k-surface); }
.side-nav { display: flex; flex-direction: column; gap: 2px; }
.side-link { display: flex; align-items: center; gap: 10px; height: 36px; padding: 0 10px; border-radius: ${R_SM}; color: var(--k-muted); font-size: 14px; font-weight: 500; text-decoration: none; transition: background-color 0.16s ${EASE}, color 0.16s ${EASE}; }
.side-link:hover { color: var(--k-text); background-color: color-mix(in srgb, var(--k-text) 5%, transparent); }
.side-link--active { color: var(--k-text); background-color: color-mix(in srgb, var(--k-text) 6%, transparent); font-weight: 600; }
.side-icon { width: 17px; height: 17px; flex: none; }
.side-link--active .side-icon { color: var(--k-primary); }
.side-label { flex: 1; }
.side-count { padding: 1px 7px; border-radius: 999px; background-color: ${tint(12)}; color: var(--k-primary); font-size: 11.5px; font-weight: 700; }
.side-section { margin: 14px 10px 4px; font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: color-mix(in srgb, var(--k-muted) 80%, transparent); }
.side-dot { width: 8px; height: 8px; margin: 0 4px; border-radius: 3px; flex: none; }
.side-dot--a { background-color: var(--k-primary); }
.side-dot--b { background-color: var(--k-accent); }
.side-dot--c { background-color: #f59e0b; }
.side-spacer { flex: 1; }
.side-user { display: flex; align-items: center; gap: 10px; padding: 10px 8px 4px; border-top: ${HAIRLINE}; }
.side-avatar { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background-image: ${AVATAR_FILLS[1]}; color: #ffffff; font-size: 12px; font-weight: 700; flex: none; }
.side-user-copy { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.side-user-name { font-size: 13.5px; font-weight: 600; }
.side-user-mail { font-size: 12px; color: var(--k-muted); }
.side-settings { width: 16px; height: 16px; color: var(--k-muted); }`,
  },
  {
    id: 'tabs',
    name: 'Tabs',
    category: 'navigation',
    keywords: ['tabs', 'tab bar', 'segmented', 'switcher', 'underline'],
    width: 560,
    html: `<div class="tabs" role="tablist" data-name="Tabs"><button class="tab tab--active" role="tab">Overview</button><button class="tab" role="tab">Analytics</button><button class="tab" role="tab">Reports</button><button class="tab" role="tab">Settings</button></div>`,
    css: `.tabs { display: flex; align-items: center; gap: 4px; width: 100%; max-width: 560px; border-bottom: ${HAIRLINE}; }
.tab { margin-bottom: -1px; padding: 12px 12px 11px; border-bottom: 2px solid transparent; color: var(--k-muted); font-size: 14.5px; font-weight: 500; transition: color 0.16s ${EASE}, border-color 0.16s ${EASE}; }
.tab:hover { color: var(--k-text); }
.tab--active { color: var(--k-text); font-weight: 600; border-bottom-color: var(--k-primary); }`,
  },
  {
    id: 'breadcrumb',
    name: 'Breadcrumb',
    category: 'navigation',
    keywords: ['breadcrumb', 'path', 'trail', 'hierarchy', 'navigation'],
    html: `<nav class="crumbs" aria-label="Breadcrumb" data-name="Breadcrumb"><a class="crumb-home" href="#" aria-label="Home">${icon('house', 'crumb-home-icon')}</a>${icon('chevron-right', 'crumb-sep')}<a class="crumb" href="#">Projects</a>${icon('chevron-right', 'crumb-sep')}<a class="crumb" href="#">Kinema</a>${icon('chevron-right', 'crumb-sep')}<span class="crumb-current">Landing page</span></nav>`,
    css: `.crumbs { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.crumb-home { display: flex; color: var(--k-muted); transition: color 0.16s ${EASE}; }
.crumb-home:hover { color: var(--k-text); }
.crumb-home-icon { width: 16px; height: 16px; }
.crumb-sep { width: 14px; height: 14px; color: color-mix(in srgb, var(--k-muted) 60%, transparent); }
.crumb { color: var(--k-muted); font-weight: 500; text-decoration: none; transition: color 0.16s ${EASE}; }
.crumb:hover { color: var(--k-text); }
.crumb-current { padding: 3px 10px; border-radius: 999px; background-color: color-mix(in srgb, var(--k-text) 6%, transparent); color: var(--k-text); font-weight: 600; }`,
  },
  {
    id: 'pagination',
    name: 'Pagination',
    category: 'navigation',
    keywords: ['pagination', 'pages', 'pager', 'next', 'previous', 'table'],
    width: 640,
    html: `<nav class="pager" aria-label="Pagination" data-name="Pagination">
<a class="pager-step" href="#">${icon('chevron-left', 'pager-icon')}<span class="pager-step-label">Previous</span></a>
<div class="pager-pages"><a class="pager-page pager-page--active" href="#">1</a><a class="pager-page" href="#">2</a><a class="pager-page" href="#">3</a><span class="pager-gap">…</span><a class="pager-page" href="#">8</a><a class="pager-page" href="#">9</a><a class="pager-page" href="#">10</a></div>
<a class="pager-step" href="#"><span class="pager-step-label">Next</span>${icon('chevron-right', 'pager-icon')}</a>
</nav>`,
    css: `.pager { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; max-width: 640px; padding-top: 14px; border-top: ${HAIRLINE}; }
.pager-step { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border-radius: ${R_SM}; border: 1px solid ${BORDER_STRONG}; background-color: var(--k-surface); color: var(--k-text); font-size: 14px; font-weight: 600; text-decoration: none; box-shadow: ${SHADOW_XS}; transition: background-color 0.16s ${EASE}; }
.pager-step:hover { background-color: color-mix(in srgb, var(--k-text) 4%, var(--k-surface)); }
.pager-icon { width: 16px; height: 16px; }
.pager-pages { display: flex; align-items: center; gap: 4px; }
.pager-page { display: grid; place-items: center; width: 36px; height: 36px; border-radius: ${R_SM}; color: var(--k-muted); font-size: 14px; font-weight: 500; text-decoration: none; font-variant-numeric: tabular-nums; transition: background-color 0.16s ${EASE}, color 0.16s ${EASE}; }
.pager-page:hover { color: var(--k-text); background-color: color-mix(in srgb, var(--k-text) 6%, transparent); }
.pager-page--active { color: var(--k-primary); background-color: ${tint(10)}; font-weight: 700; }
.pager-gap { width: 24px; text-align: center; color: var(--k-muted); }
@media (max-width: 640px) { .pager-step-label { display: none; } .pager-step { width: 36px; padding: 0; justify-content: center; } }`,
  },
  {
    id: 'footer-columns',
    name: 'Footer · Columns',
    category: 'navigation',
    keywords: ['footer', 'links', 'sitemap', 'columns', 'bottom', 'legal'],
    width: 1280,
    html: `<footer class="foot" data-name="Footer"><div class="foot-inner">
<div class="foot-top">
<div class="foot-brand"><div class="foot-logo"><div class="foot-mark"></div><span class="foot-name">Acme</span></div><p class="foot-tagline">Tools for teams who sweat the details. Designed and built with care.</p>
<div class="foot-social"><a class="foot-social-link" href="#" aria-label="Website">${icon('globe', 'foot-social-icon')}</a><a class="foot-social-link" href="#" aria-label="Email">${icon('at-sign', 'foot-social-icon')}</a><a class="foot-social-link" href="#" aria-label="Blog feed">${icon('rss', 'foot-social-icon')}</a></div></div>
<div class="foot-col"><span class="foot-heading">Product</span><a class="foot-link" href="#">Features</a><a class="foot-link" href="#">Integrations</a><a class="foot-link" href="#">Pricing</a><a class="foot-link" href="#">Changelog</a></div>
<div class="foot-col"><span class="foot-heading">Company</span><a class="foot-link" href="#">About</a><a class="foot-link" href="#">Careers</a><a class="foot-link" href="#">Blog</a><a class="foot-link" href="#">Contact</a></div>
<div class="foot-col"><span class="foot-heading">Resources</span><a class="foot-link" href="#">Documentation</a><a class="foot-link" href="#">Guides</a><a class="foot-link" href="#">Community</a><a class="foot-link" href="#">Status</a></div>
<div class="foot-col"><span class="foot-heading">Legal</span><a class="foot-link" href="#">Privacy</a><a class="foot-link" href="#">Terms</a><a class="foot-link" href="#">Security</a></div>
</div>
<div class="foot-bottom"><span class="foot-copy">© 2026 Acme, Inc. All rights reserved.</span><div class="foot-status"><div class="foot-status-dot"></div><span class="foot-status-text">All systems operational</span></div></div>
</div></footer>`,
    css: `.foot { width: 100%; padding: 72px 24px 32px; background-color: var(--k-surface); border-top: ${HAIRLINE}; }
.foot-inner { display: flex; flex-direction: column; gap: 56px; max-width: 1120px; margin: 0 auto; }
.foot-top { display: grid; grid-template-columns: 1.7fr repeat(4, 1fr); gap: 32px; }
.foot-brand { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; padding-right: 24px; }
.foot-logo { display: flex; align-items: center; gap: 10px; }
${MARK('.foot-mark')}
.foot-name { font-family: var(--k-font-heading); font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
.foot-tagline { max-width: 280px; font-size: 14.5px; line-height: 1.6; color: var(--k-muted); }
.foot-social { display: flex; gap: 8px; }
.foot-social-link { display: grid; place-items: center; width: 34px; height: 34px; border-radius: ${R_SM}; border: 1px solid ${BORDER}; color: var(--k-muted); transition: color 0.16s ${EASE}, border-color 0.16s ${EASE}; }
.foot-social-link:hover { color: var(--k-text); border-color: ${BORDER_STRONG}; }
.foot-social-icon { width: 16px; height: 16px; }
.foot-col { display: flex; flex-direction: column; gap: 12px; }
.foot-heading { margin-bottom: 4px; font-size: 13.5px; font-weight: 600; color: var(--k-text); }
.foot-link { color: var(--k-muted); font-size: 14px; text-decoration: none; transition: color 0.16s ${EASE}; }
.foot-link:hover { color: var(--k-text); }
.foot-bottom { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 24px; border-top: ${HAIRLINE}; }
.foot-copy { font-size: 13.5px; color: var(--k-muted); }
.foot-status { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: var(--k-muted); }
.foot-status-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #22c55e; box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18); }
@media (max-width: 1024px) { .foot-top { grid-template-columns: repeat(4, 1fr); } .foot-brand { grid-column: 1 / -1; padding-right: 0; } }
@media (max-width: 640px) { .foot { padding: 56px 20px 28px; } .foot-top { grid-template-columns: repeat(2, 1fr); row-gap: 36px; } .foot-bottom { flex-direction: column; align-items: flex-start; } }`,
  },
  {
    id: 'footer-simple',
    name: 'Footer · Centered dark',
    category: 'navigation',
    keywords: ['footer', 'dark', 'centered', 'minimal', 'copyright', 'social'],
    width: 1280,
    html: `<footer class="dfoot" data-name="Footer dark"><div class="dfoot-inner">
<div class="dfoot-logo"><div class="dfoot-mark"></div><span class="dfoot-name">Acme</span></div>
<nav class="dfoot-links"><a class="dfoot-link" href="#">Product</a><a class="dfoot-link" href="#">Pricing</a><a class="dfoot-link" href="#">About</a><a class="dfoot-link" href="#">Blog</a><a class="dfoot-link" href="#">Careers</a><a class="dfoot-link" href="#">Contact</a></nav>
<div class="dfoot-social"><a class="dfoot-social-link" href="#" aria-label="Website">${icon('globe', 'dfoot-icon')}</a><a class="dfoot-social-link" href="#" aria-label="Email">${icon('mail', 'dfoot-icon')}</a><a class="dfoot-social-link" href="#" aria-label="Community">${icon('message-circle', 'dfoot-icon')}</a></div>
<p class="dfoot-copy">© 2026 Acme, Inc. Made with care, everywhere.</p>
</div></footer>`,
    css: `.dfoot { width: 100%; padding: 64px 24px; background-color: var(--k-text); color: color-mix(in srgb, var(--k-surface) 70%, transparent); }
.dfoot-inner { display: flex; flex-direction: column; align-items: center; gap: 28px; max-width: 1120px; margin: 0 auto; text-align: center; }
.dfoot-logo { display: flex; align-items: center; gap: 10px; color: var(--k-surface); }
${MARK('.dfoot-mark')}
.dfoot-name { font-family: var(--k-font-heading); font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
.dfoot-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 32px; }
.dfoot-link { color: color-mix(in srgb, var(--k-surface) 72%, transparent); font-size: 14.5px; text-decoration: none; transition: color 0.16s ${EASE}; }
.dfoot-link:hover { color: var(--k-surface); }
.dfoot-social { display: flex; gap: 10px; }
.dfoot-social-link { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; background-color: color-mix(in srgb, var(--k-surface) 8%, transparent); color: var(--k-surface); transition: background-color 0.16s ${EASE}; }
.dfoot-social-link:hover { background-color: color-mix(in srgb, var(--k-surface) 16%, transparent); }
.dfoot-icon { width: 17px; height: 17px; }
.dfoot-copy { padding-top: 24px; border-top: 1px solid color-mix(in srgb, var(--k-surface) 12%, transparent); font-size: 13.5px; width: 100%; }
@media (max-width: 640px) { .dfoot { padding: 48px 20px; } .dfoot-links { gap: 10px 20px; } }`,
  },
];

