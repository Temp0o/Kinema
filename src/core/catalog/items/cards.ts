import type { CatalogItem } from '../types';
import { icon, type CatalogIconName } from '../icons';
import { AVATAR_FILLS, EASE, HAIRLINE, MESH_COOL, MESH_WARM, R_LG, R_SM, SHADOW_LG, SHADOW_MD, SHADOW_SM, buttonCss, tint } from '../snippets';

const CARD = (sel: string) =>
  `${sel} { background-color: var(--k-surface); border: ${HAIRLINE}; border-radius: ${R_LG}; box-shadow: ${SHADOW_SM}; transition: transform 0.25s ${EASE}, box-shadow 0.25s ${EASE}, border-color 0.25s ${EASE}; }
${sel}:hover { transform: translateY(-4px); box-shadow: ${SHADOW_MD}; }`;

const stars = (cls: string) => Array.from({ length: 5 }, () => icon('star', cls, 1.5, 'currentColor')).join('');
const check = (cls: string) => icon('check', cls, 2.5);

interface Tier {
  plan: string;
  desc: string;
  price: string;
  period: string;
  cta: string;
  features: string[];
  featured?: boolean;
}

const TIERS: Tier[] = [
  { plan: 'Starter', desc: 'For individuals exploring ideas.', price: '$0', period: 'forever', cta: 'Get started', features: ['3 projects', 'Basic animations', 'Export to HTML', 'Community support'] },
  { plan: 'Pro', desc: 'For professionals shipping every week.', price: '$24', period: 'per month', cta: 'Start free trial', featured: true, features: ['Unlimited projects', 'Timeline & motion presets', 'Custom domains', 'AI assistant', 'Priority support'] },
  { plan: 'Team', desc: 'For teams that design together.', price: '$59', period: 'per month', cta: 'Contact sales', features: ['Everything in Pro', 'Shared libraries', 'Roles & permissions', 'SSO & audit log'] },
];

const tierHtml = (t: Tier) =>
  `<div class="tier${t.featured ? ' tier--featured' : ''}">
<div class="tier-head"><span class="tier-plan">${t.plan}</span>${t.featured ? '<span class="tier-badge">Most popular</span>' : ''}</div>
<p class="tier-desc">${t.desc}</p>
<div class="tier-amount"><span class="tier-price">${t.price}</span><span class="tier-period">${t.period}</span></div>
<a class="tier-cta" href="#">${t.cta}</a>
<ul class="tier-features">${t.features.map((f) => `<li class="tier-feature">${check('tier-check')}<span class="tier-feature-text">${f}</span></li>`).join('')}</ul>
</div>`;

const TIER_CSS = `.tier { display: flex; flex-direction: column; gap: 14px; padding: 28px; border-radius: ${R_LG}; background-color: var(--k-surface); border: ${HAIRLINE}; box-shadow: ${SHADOW_SM}; }
.tier--featured { background-color: var(--k-text); color: var(--k-surface); border-color: transparent; box-shadow: ${SHADOW_LG}; }
.tier-head { display: flex; align-items: center; justify-content: space-between; }
.tier-plan { font-size: 15px; font-weight: 600; }
.tier-badge { padding: 3px 10px; border-radius: 999px; background-image: linear-gradient(135deg, var(--k-primary), var(--k-accent)); color: #ffffff; font-size: 12px; font-weight: 600; }
.tier-desc { font-size: 14px; line-height: 1.5; color: var(--k-muted); }
.tier--featured .tier-desc { color: color-mix(in srgb, var(--k-surface) 65%, transparent); }
.tier-amount { display: flex; align-items: baseline; gap: 8px; margin: 6px 0 4px; }
.tier-price { font-family: var(--k-font-heading); font-size: 44px; font-weight: 700; letter-spacing: -0.04em; line-height: 1; }
.tier-period { font-size: 14px; color: var(--k-muted); }
.tier--featured .tier-period { color: color-mix(in srgb, var(--k-surface) 60%, transparent); }
${buttonCss('.tier-cta', 'secondary')}
${buttonCss('.tier--featured .tier-cta', 'primary')}
.tier-features { display: flex; flex-direction: column; gap: 11px; margin-top: 10px; padding: 18px 0 0; border-top: ${HAIRLINE}; list-style: none; }
.tier--featured .tier-features { border-top-color: color-mix(in srgb, var(--k-surface) 14%, transparent); }
.tier-feature { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.tier-check { width: 16px; height: 16px; flex: none; color: var(--k-primary); }
.tier--featured .tier-check { color: var(--k-accent); }`;

const kpiIcon = (name: CatalogIconName) => icon(name, 'kpi-icon-glyph');

export const CARDS: CatalogItem[] = [
  {
    id: 'card-feature',
    name: 'Feature card',
    category: 'cards',
    keywords: ['card', 'feature', 'benefit', 'icon', 'service'],
    width: 360,
    html: `<div class="fcard" data-name="Feature card"><div class="fcard-icon">${icon('zap', 'fcard-glyph')}</div><h3 class="fcard-title">Lightning-fast previews</h3><p class="fcard-text">See every change instantly across breakpoints, with animations playing in real time as you design.</p><a class="fcard-link" href="#">Learn more ${icon('arrow-right', 'fcard-link-icon')}</a></div>`,
    css: `${CARD('.fcard')}
.fcard { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; width: 100%; max-width: 360px; padding: 28px; }
.fcard:hover { border-color: ${tint(30)}; }
.fcard-icon { display: grid; place-items: center; width: 44px; height: 44px; margin-bottom: 6px; border-radius: ${R_SM}; background-image: linear-gradient(135deg, ${tint(16)}, ${tint(6, 'var(--k-accent)')}); color: var(--k-primary); border: 1px solid ${tint(18)}; }
.fcard-glyph { width: 21px; height: 21px; }
.fcard-title { font-size: 18px; letter-spacing: -0.015em; }
.fcard-text { font-size: 15px; line-height: 1.6; color: var(--k-muted); }
.fcard-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 4px; color: var(--k-primary); font-size: 14.5px; font-weight: 600; text-decoration: none; transition: gap 0.2s ${EASE}; }
.fcard-link:hover { gap: 10px; }
.fcard-link-icon { width: 15px; height: 15px; }`,
  },
  {
    id: 'card-pricing',
    name: 'Pricing card',
    category: 'cards',
    keywords: ['pricing', 'plan', 'tier', 'subscription', 'price', 'card'],
    width: 360,
    html: `<div class="pcard" data-name="Pricing card">
<div class="pcard-head"><span class="pcard-plan">Pro</span><span class="pcard-badge">Most popular</span></div>
<p class="pcard-desc">For growing teams that ship every week.</p>
<div class="pcard-amount"><span class="pcard-price">$24</span><span class="pcard-period">/ seat / month</span></div>
<a class="pcard-cta" href="#">Start 14-day trial</a>
<ul class="pcard-features"><li class="pcard-feature">${check('pcard-check')}<span class="pcard-feature-text">Unlimited projects</span></li><li class="pcard-feature">${check('pcard-check')}<span class="pcard-feature-text">Advanced timeline &amp; easing</span></li><li class="pcard-feature">${check('pcard-check')}<span class="pcard-feature-text">Custom domains</span></li><li class="pcard-feature">${check('pcard-check')}<span class="pcard-feature-text">Priority support</span></li></ul>
</div>`,
    css: `.pcard { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 360px; padding: 28px; border-radius: ${R_LG}; background-color: var(--k-surface); border: 1.5px solid var(--k-primary); box-shadow: 0 0 0 4px ${tint(10)}, ${SHADOW_MD}; }
.pcard-head { display: flex; align-items: center; justify-content: space-between; }
.pcard-plan { font-size: 15px; font-weight: 600; color: var(--k-primary); }
.pcard-badge { padding: 3px 10px; border-radius: 999px; background-color: ${tint(12)}; color: var(--k-primary); font-size: 12px; font-weight: 600; }
.pcard-desc { font-size: 14.5px; color: var(--k-muted); }
.pcard-amount { display: flex; align-items: baseline; gap: 8px; margin: 4px 0; }
.pcard-price { font-family: var(--k-font-heading); font-size: 48px; font-weight: 700; line-height: 1; letter-spacing: -0.04em; }
.pcard-period { font-size: 14px; color: var(--k-muted); }
${buttonCss('.pcard-cta', 'primary')}
.pcard-features { display: flex; flex-direction: column; gap: 11px; margin-top: 8px; padding: 18px 0 0; border-top: ${HAIRLINE}; list-style: none; }
.pcard-feature { display: flex; align-items: center; gap: 10px; font-size: 14.5px; }
.pcard-check { width: 18px; height: 18px; padding: 3px; flex: none; border-radius: 50%; background-color: ${tint(12)}; color: var(--k-primary); }`,
  },
  {
    id: 'pricing-3tier',
    name: 'Pricing · 3 tiers',
    category: 'cards',
    keywords: ['pricing', 'plans', 'tiers', 'table', 'comparison', 'section', 'subscription'],
    width: 1280,
    html: `<section class="pricing" data-name="Pricing"><div class="pricing-inner">
<div class="pricing-head"><span class="pricing-eyebrow">Pricing</span><h2 class="pricing-title">Simple, transparent pricing</h2><p class="pricing-text">Start free and upgrade when you need more. Every plan includes unlimited previews.</p>
<div class="pricing-toggle"><span class="pricing-option pricing-option--active">Monthly</span><span class="pricing-option">Yearly <span class="pricing-save">−20%</span></span></div></div>
<div class="pricing-grid">${TIERS.map(tierHtml).join('')}</div>
</div></section>`,
    css: `.pricing { width: 100%; padding: 96px 24px; background-color: var(--k-background); }
.pricing-inner { display: flex; flex-direction: column; gap: 48px; max-width: 1080px; margin: 0 auto; }
.pricing-head { display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; }
.pricing-eyebrow { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--k-primary); }
.pricing-title { font-size: 44px; letter-spacing: -0.035em; }
.pricing-text { max-width: 520px; font-size: 18px; color: var(--k-muted); }
.pricing-toggle { display: flex; gap: 4px; margin-top: 8px; padding: 4px; border-radius: 999px; background-color: color-mix(in srgb, var(--k-text) 6%, transparent); }
.pricing-option { padding: 7px 16px; border-radius: 999px; font-size: 14px; font-weight: 600; color: var(--k-muted); }
.pricing-option--active { background-color: var(--k-surface); color: var(--k-text); box-shadow: ${SHADOW_SM}; }
.pricing-save { color: #12a150; }
.pricing-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; gap: 20px; }
${TIER_CSS}
@media (max-width: 1024px) { .pricing-grid { grid-template-columns: minmax(0, 1fr); max-width: 440px; margin: 0 auto; width: 100%; } .pricing-title { font-size: 36px; } }
@media (max-width: 640px) { .pricing { padding: 64px 20px; } .pricing-title { font-size: 30px; } }`,
  },
  {
    id: 'card-testimonial',
    name: 'Testimonial card',
    category: 'cards',
    keywords: ['testimonial', 'quote', 'review', 'customer', 'social proof'],
    width: 400,
    html: `<figure class="qcard" data-name="Testimonial card"><div class="qcard-stars">${stars('qcard-star')}</div><blockquote class="qcard-text">“Kinema replaced three tools for us. Our marketing site now ships with motion that used to take a full sprint.”</blockquote><figcaption class="qcard-author"><div class="qcard-avatar">MR</div><div class="qcard-meta"><span class="qcard-name">Maya Rodriguez</span><span class="qcard-role">Head of Design, Northwind</span></div></figcaption></figure>`,
    css: `${CARD('.qcard')}
.qcard { display: flex; flex-direction: column; gap: 18px; width: 100%; max-width: 400px; margin: 0; padding: 28px; }
.qcard-stars { display: flex; gap: 3px; color: #f5a524; }
.qcard-star { width: 17px; height: 17px; }
.qcard-text { margin: 0; font-size: 17px; line-height: 1.6; color: var(--k-text); letter-spacing: -0.005em; }
.qcard-author { display: flex; align-items: center; gap: 12px; }
.qcard-avatar { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background-image: ${AVATAR_FILLS[5]}; color: #ffffff; font-size: 14px; font-weight: 700; flex: none; }
.qcard-meta { display: flex; flex-direction: column; }
.qcard-name { font-size: 14.5px; font-weight: 600; }
.qcard-role { font-size: 13.5px; color: var(--k-muted); }`,
  },
  {
    id: 'card-profile',
    name: 'Profile card',
    category: 'cards',
    keywords: ['profile', 'user', 'person', 'team member', 'social', 'follow', 'card'],
    width: 340,
    html: `<div class="prof" data-name="Profile card"><div class="prof-cover"></div><div class="prof-body"><div class="prof-avatar">SK</div><h3 class="prof-name">Sofia Kim</h3><p class="prof-role">Product designer · Seoul</p>
<div class="prof-stats"><div class="prof-stat"><span class="prof-stat-value">128</span><span class="prof-stat-label">Projects</span></div><div class="prof-stat"><span class="prof-stat-value">14.2k</span><span class="prof-stat-label">Followers</span></div><div class="prof-stat"><span class="prof-stat-value">312</span><span class="prof-stat-label">Following</span></div></div>
<div class="prof-actions"><a class="prof-follow" href="#">Follow</a><a class="prof-message" href="#">Message</a></div></div></div>`,
    css: `${CARD('.prof')}
.prof { width: 100%; max-width: 340px; overflow: hidden; }
.prof-cover { height: 96px; background-image: ${MESH_COOL}; }
.prof-body { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0 24px 24px; text-align: center; }
.prof-avatar { display: grid; place-items: center; width: 84px; height: 84px; margin-top: -42px; margin-bottom: 8px; border-radius: 50%; border: 4px solid var(--k-surface); background-image: ${AVATAR_FILLS[0]}; color: #ffffff; font-size: 26px; font-weight: 700; box-shadow: ${SHADOW_SM}; }
.prof-name { font-size: 20px; letter-spacing: -0.02em; }
.prof-role { font-size: 14px; color: var(--k-muted); }
.prof-stats { display: grid; grid-template-columns: repeat(3, 1fr); width: 100%; margin: 18px 0; padding: 14px 0; border-top: ${HAIRLINE}; border-bottom: ${HAIRLINE}; }
.prof-stat { display: flex; flex-direction: column; gap: 2px; }
.prof-stat-value { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
.prof-stat-label { font-size: 12.5px; color: var(--k-muted); }
.prof-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
${buttonCss('.prof-follow', 'primary', 'sm')}
${buttonCss('.prof-message', 'secondary', 'sm')}`,
  },
  {
    id: 'card-blog',
    name: 'Blog card',
    category: 'cards',
    keywords: ['blog', 'article', 'post', 'news', 'card', 'cover', 'author'],
    width: 380,
    html: `<article class="post" data-name="Blog card"><div class="post-cover"><span class="post-tag">Design</span></div><div class="post-body">
<div class="post-meta"><span class="post-date">Oct 24, 2026</span><div class="post-dot"></div><span class="post-read">6 min read</span></div>
<h3 class="post-title">The craft of motion: designing transitions that feel natural</h3>
<p class="post-excerpt">Easing, timing and choreography — a practical guide to animation that supports your interface instead of distracting from it.</p>
<div class="post-author"><div class="post-avatar">LT</div><span class="post-author-name">Leo Tanaka</span></div>
</div></article>`,
    css: `${CARD('.post')}
.post { width: 100%; max-width: 380px; overflow: hidden; }
.post-cover { display: flex; align-items: flex-start; aspect-ratio: 16 / 9; padding: 14px; background-image: ${MESH_WARM}; }
.post-tag { padding: 4px 10px; border-radius: 999px; background-color: rgba(255, 255, 255, 0.85); color: #0f1020; font-size: 12px; font-weight: 600; backdrop-filter: blur(6px); }
.post-body { display: flex; flex-direction: column; gap: 10px; padding: 20px 22px 22px; }
.post-meta { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--k-muted); }
.post-dot { width: 3px; height: 3px; border-radius: 50%; background-color: currentColor; }
.post-title { font-size: 19px; line-height: 1.3; letter-spacing: -0.02em; }
.post-excerpt { font-size: 14.5px; line-height: 1.6; color: var(--k-muted); }
.post-author { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.post-avatar { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background-image: ${AVATAR_FILLS[3]}; color: #ffffff; font-size: 11px; font-weight: 700; }
.post-author-name { font-size: 13.5px; font-weight: 600; }`,
  },
  {
    id: 'card-stat',
    name: 'Stat card',
    category: 'cards',
    keywords: ['kpi', 'metric', 'stat', 'dashboard', 'analytics', 'number', 'sparkline'],
    width: 320,
    html: `<div class="kpi" data-name="Stat card"><div class="kpi-head"><span class="kpi-label">Monthly revenue</span><div class="kpi-icon">${kpiIcon('trending-up')}</div></div><div class="kpi-value">$48,294</div>
<div class="kpi-foot"><span class="kpi-delta">${icon('arrow-up-right', 'kpi-delta-icon', 2.5)}12.5%</span><span class="kpi-note">vs last month</span></div>
<svg class="kpi-spark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 56" fill="none" preserveAspectRatio="none"><path d="M0 46 C24 44 36 34 58 36 S96 22 118 28 S158 40 180 26 S222 10 246 14 S270 4 280 2 V56 H0 Z" fill="currentColor" fill-opacity="0.1"/><path d="M0 46 C24 44 36 34 58 36 S96 22 118 28 S158 40 180 26 S222 10 246 14 S270 4 280 2" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></div>`,
    css: `${CARD('.kpi')}
.kpi { display: flex; flex-direction: column; gap: 6px; width: 100%; max-width: 320px; padding: 22px 22px 0; overflow: hidden; }
.kpi-head { display: flex; align-items: center; justify-content: space-between; }
.kpi-label { font-size: 14px; font-weight: 500; color: var(--k-muted); }
.kpi-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: ${R_SM}; background-color: ${tint(10)}; color: var(--k-primary); }
.kpi-icon-glyph { width: 16px; height: 16px; }
.kpi-value { font-family: var(--k-font-heading); font-size: 34px; font-weight: 700; letter-spacing: -0.035em; font-variant-numeric: tabular-nums; }
.kpi-foot { display: flex; align-items: center; gap: 8px; }
.kpi-delta { display: inline-flex; align-items: center; gap: 2px; padding: 2px 8px 2px 6px; border-radius: 999px; background-color: rgba(18, 161, 80, 0.12); color: #12a150; font-size: 12.5px; font-weight: 700; }
.kpi-delta-icon { width: 13px; height: 13px; }
.kpi-note { font-size: 13px; color: var(--k-muted); }
.kpi-spark { width: calc(100% + 44px); height: 56px; margin: 14px -22px 0; color: var(--k-primary); }`,
  },
  {
    id: 'card-product',
    name: 'Product card',
    category: 'cards',
    keywords: ['product', 'shop', 'ecommerce', 'store', 'price', 'cart', 'card'],
    width: 320,
    html: `<div class="prod" data-name="Product card"><div class="prod-media"><span class="prod-badge">New</span><button class="prod-like" aria-label="Save to wishlist">${icon('heart', 'prod-like-icon')}</button></div><div class="prod-body">
<div class="prod-row"><h3 class="prod-name">Aura Wireless Headphones</h3><span class="prod-price">$249</span></div>
<p class="prod-variant">Midnight · Active noise cancelling</p>
<div class="prod-rating">${icon('star', 'prod-star', 1.5, 'currentColor')}<span class="prod-score">4.8</span><span class="prod-reviews">(1,204 reviews)</span></div>
<button class="prod-cta">${icon('shopping-cart', 'prod-cta-icon')} Add to cart</button></div></div>`,
    css: `${CARD('.prod')}
.prod { width: 100%; max-width: 320px; overflow: hidden; }
.prod-media { display: flex; align-items: flex-start; justify-content: space-between; aspect-ratio: 1 / 1; padding: 14px; background-image: radial-gradient(45% 45% at 50% 55%, rgba(255, 255, 255, 0.9) 0%, transparent 70%), ${MESH_WARM}; }
.prod-badge { padding: 4px 10px; border-radius: 999px; background-color: var(--k-text); color: var(--k-surface); font-size: 12px; font-weight: 600; }
.prod-like { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background-color: rgba(255, 255, 255, 0.9); color: #0f1020; box-shadow: ${SHADOW_SM}; transition: transform 0.18s ${EASE}, color 0.18s ${EASE}; }
.prod-like:hover { transform: scale(1.08); color: #e11d48; }
.prod-like-icon { width: 17px; height: 17px; }
.prod-body { display: flex; flex-direction: column; gap: 8px; padding: 18px 18px 20px; }
.prod-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.prod-name { font-size: 16px; line-height: 1.35; letter-spacing: -0.01em; }
.prod-price { font-size: 16px; font-weight: 700; }
.prod-variant { font-size: 13.5px; color: var(--k-muted); }
.prod-rating { display: flex; align-items: center; gap: 5px; font-size: 13.5px; }
.prod-star { width: 15px; height: 15px; color: #f5a524; }
.prod-score { font-weight: 600; }
.prod-reviews { color: var(--k-muted); }
${buttonCss('.prod-cta', 'dark')}
.prod-cta { margin-top: 8px; width: 100%; }
.prod-cta-icon { width: 16px; height: 16px; }`,
  },
];

