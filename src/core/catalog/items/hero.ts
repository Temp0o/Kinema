import type { CatalogItem } from '../types';
import { icon } from '../icons';
import { AVATAR_FILLS, EASE, HAIRLINE, MESH_COOL, R_LG, R_SM, R_XL, RISE_KEYFRAMES, SHADOW_LG, SHADOW_MD, buttonCss, inputCss, tint } from '../snippets';

const rise = (sel: string, delay: number) => `${sel} { animation: rise 0.8s ${EASE} ${delay}ms both; }`;

export const HERO: CatalogItem[] = [
  {
    id: 'hero-centered',
    name: 'Hero · Centered',
    category: 'hero',
    keywords: ['hero', 'header', 'landing', 'headline', 'above the fold', 'centered', 'screenshot'],
    width: 1280,
    html: `<section class="hero" data-name="Hero"><div class="hero-inner">
<a class="hero-pill" href="#"><span class="hero-pill-tag">New</span><span class="hero-pill-text">Kinema 2.0 is here</span>${icon('chevron-right', 'hero-pill-icon')}</a>
<h1 class="hero-title">Design interfaces that move</h1>
<p class="hero-text">The visual canvas for building animated, responsive websites — with real, clean code under every pixel.</p>
<div class="hero-actions"><a class="hero-primary" href="#">Start for free ${icon('arrow-right', 'hero-btn-icon')}</a><a class="hero-secondary" href="#">${icon('play', 'hero-btn-icon')} Watch the demo</a></div>
<p class="hero-note">Free for individuals · No credit card required</p>
<div class="hero-shot" data-name="Product screenshot"><div class="hero-shot-bar"><div class="hero-shot-dot"></div><div class="hero-shot-dot"></div><div class="hero-shot-dot"></div></div><div class="hero-shot-body"><div class="hero-shot-side"></div><div class="hero-shot-canvas"><div class="hero-shot-card"></div></div></div></div>
</div></section>`,
    css: `${RISE_KEYFRAMES}
.hero { width: 100%; padding: 96px 24px 0; overflow: hidden; background-color: var(--k-background); background-image: radial-gradient(60% 50% at 50% 0%, ${tint(14)} 0%, transparent 70%); }
.hero-inner { display: flex; flex-direction: column; align-items: center; gap: 22px; max-width: 1120px; margin: 0 auto; text-align: center; }
.hero-pill { display: inline-flex; align-items: center; gap: 10px; padding: 4px 12px 4px 4px; border-radius: 999px; background-color: var(--k-surface); border: ${HAIRLINE}; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05); color: var(--k-text); font-size: 13.5px; font-weight: 500; text-decoration: none; transition: border-color 0.18s ${EASE}; }
.hero-pill:hover { border-color: ${tint(40)}; }
.hero-pill-tag { padding: 3px 9px; border-radius: 999px; background-color: var(--k-primary); color: #ffffff; font-size: 12px; font-weight: 600; }
.hero-pill-icon { width: 14px; height: 14px; color: var(--k-muted); }
.hero-title { max-width: 860px; font-size: 76px; line-height: 1.02; letter-spacing: -0.045em; font-weight: 750; }
.hero-text { max-width: 620px; font-size: 20px; line-height: 1.6; color: var(--k-muted); }
.hero-actions { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
${buttonCss('.hero-primary', 'primary', 'lg')}
${buttonCss('.hero-secondary', 'secondary', 'lg')}
.hero-btn-icon { width: 17px; height: 17px; }
.hero-note { font-size: 13.5px; color: var(--k-muted); }
.hero-shot { width: 100%; max-width: 1040px; margin-top: 40px; border-radius: ${R_XL} ${R_XL} 0 0; border: ${HAIRLINE}; border-bottom: none; background-color: var(--k-surface); box-shadow: ${SHADOW_LG}; overflow: hidden; }
.hero-shot-bar { display: flex; gap: 7px; padding: 14px 16px; border-bottom: ${HAIRLINE}; }
.hero-shot-dot { width: 11px; height: 11px; border-radius: 50%; background-color: color-mix(in srgb, var(--k-text) 14%, transparent); }
.hero-shot-body { display: flex; height: 380px; }
.hero-shot-side { width: 200px; border-right: ${HAIRLINE}; background-color: color-mix(in srgb, var(--k-text) 2%, var(--k-surface)); }
.hero-shot-canvas { display: flex; align-items: center; justify-content: center; flex: 1; background-image: ${MESH_COOL}; }
.hero-shot-card { width: 46%; height: 52%; border-radius: ${R_LG}; background-color: rgba(255, 255, 255, 0.85); box-shadow: ${SHADOW_LG}; }
${rise('.hero-pill', 0)}
${rise('.hero-title', 80)}
${rise('.hero-text', 160)}
${rise('.hero-actions', 240)}
${rise('.hero-shot', 360)}
@media (max-width: 1024px) { .hero { padding-top: 80px; } .hero-title { font-size: 58px; } .hero-shot-side { width: 140px; } .hero-shot-body { height: 300px; } }
@media (max-width: 640px) { .hero { padding: 64px 20px 0; } .hero-title { font-size: 42px; } .hero-text { font-size: 17px; } .hero-actions { flex-direction: column; align-self: stretch; } .hero-shot-side { display: none; } .hero-shot-body { height: 220px; } }`,
  },
  {
    id: 'hero-split',
    name: 'Hero · Split with visual',
    category: 'hero',
    keywords: ['hero', 'split', 'two column', 'landing', 'signup', 'email capture', 'dashboard'],
    width: 1280,
    html: `<section class="shero" data-name="Split hero"><div class="shero-inner">
<div class="shero-copy">
<span class="shero-badge">${icon('zap', 'shero-badge-icon')} Analytics for product teams</span>
<h1 class="shero-title">Know what your users love — instantly</h1>
<p class="shero-text">Real-time insights, beautiful dashboards and alerts that matter. Set up in five minutes, no engineers required.</p>
<form class="shero-form"><input class="shero-input" type="email" placeholder="Work email"><button class="shero-button" type="submit">Get started</button></form>
<div class="shero-proof"><div class="shero-avatars"><div class="shero-avatar shero-avatar--a">AK</div><div class="shero-avatar shero-avatar--b">ML</div><div class="shero-avatar shero-avatar--c">JS</div><div class="shero-avatar shero-avatar--d">RT</div></div><div class="shero-proof-copy"><div class="shero-stars">${icon('star', 'shero-star', 1.5, 'currentColor')}${icon('star', 'shero-star', 1.5, 'currentColor')}${icon('star', 'shero-star', 1.5, 'currentColor')}${icon('star', 'shero-star', 1.5, 'currentColor')}${icon('star', 'shero-star', 1.5, 'currentColor')}</div><span class="shero-proof-text">Loved by 12,000+ teams</span></div></div>
</div>
<div class="shero-visual" data-name="Hero visual">
<div class="shero-panel"><div class="shero-panel-head"><span class="shero-panel-title">Weekly active users</span><span class="shero-delta">+18.2%</span></div><span class="shero-panel-value">84,210</span>
<div class="shero-bars"><div class="shero-bar shero-bar--1"></div><div class="shero-bar shero-bar--2"></div><div class="shero-bar shero-bar--3"></div><div class="shero-bar shero-bar--4"></div><div class="shero-bar shero-bar--5"></div><div class="shero-bar shero-bar--6"></div><div class="shero-bar shero-bar--7"></div></div></div>
<div class="shero-float"><div class="shero-float-icon">${icon('bell', 'shero-float-glyph')}</div><div class="shero-float-copy"><span class="shero-float-title">Conversion spike</span><span class="shero-float-text">Checkout up 32% today</span></div></div>
</div>
</div></section>`,
    css: `${RISE_KEYFRAMES}
.shero { width: 100%; padding: 96px 24px; background-color: var(--k-surface); }
.shero-inner { display: grid; grid-template-columns: 1.05fr 1fr; align-items: center; gap: 64px; max-width: 1180px; margin: 0 auto; }
.shero-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 22px; }
.shero-badge { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px; border-radius: 999px; background-color: ${tint(9)}; color: var(--k-primary); font-size: 13px; font-weight: 600; }
.shero-badge-icon { width: 14px; height: 14px; }
.shero-title { font-size: 60px; line-height: 1.04; letter-spacing: -0.04em; }
.shero-text { max-width: 520px; font-size: 19px; line-height: 1.6; color: var(--k-muted); }
.shero-form { display: flex; gap: 10px; width: 100%; max-width: 460px; }
${inputCss('.shero-input', 48)}
.shero-input { flex: 1; }
${buttonCss('.shero-button', 'primary', 'lg')}
.shero-proof { display: flex; align-items: center; gap: 14px; margin-top: 6px; }
.shero-avatars { display: flex; }
.shero-avatar { display: grid; place-items: center; width: 36px; height: 36px; margin-left: -10px; border-radius: 50%; border: 2.5px solid var(--k-surface); color: #ffffff; font-size: 12px; font-weight: 700; }
.shero-avatar--a { margin-left: 0; background-image: ${AVATAR_FILLS[0]}; }
.shero-avatar--b { background-image: ${AVATAR_FILLS[1]}; }
.shero-avatar--c { background-image: ${AVATAR_FILLS[2]}; }
.shero-avatar--d { background-image: ${AVATAR_FILLS[3]}; }
.shero-proof-copy { display: flex; flex-direction: column; gap: 2px; }
.shero-stars { display: flex; gap: 2px; color: #f5a524; }
.shero-star { width: 14px; height: 14px; }
.shero-proof-text { font-size: 13.5px; font-weight: 500; color: var(--k-muted); }
.shero-visual { position: relative; display: flex; align-items: center; justify-content: center; aspect-ratio: 1 / 1; padding: 56px; border-radius: ${R_XL}; background-image: ${MESH_COOL}; }
.shero-panel { display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 24px; border-radius: ${R_LG}; background-color: var(--k-surface); box-shadow: ${SHADOW_LG}; }
.shero-panel-head { display: flex; align-items: center; justify-content: space-between; }
.shero-panel-title { font-size: 14px; font-weight: 500; color: var(--k-muted); }
.shero-delta { padding: 2px 8px; border-radius: 999px; background-color: rgba(18, 161, 80, 0.12); color: #12a150; font-size: 12.5px; font-weight: 700; }
.shero-panel-value { font-family: var(--k-font-heading); font-size: 34px; font-weight: 700; letter-spacing: -0.03em; }
.shero-bars { display: flex; align-items: flex-end; gap: 10px; height: 140px; margin-top: 12px; }
.shero-bar { flex: 1; border-radius: 6px 6px 3px 3px; background-color: ${tint(22)}; }
.shero-bar--1 { height: 38%; } .shero-bar--2 { height: 52%; } .shero-bar--3 { height: 44%; } .shero-bar--4 { height: 66%; } .shero-bar--5 { height: 58%; }
.shero-bar--6 { height: 80%; } .shero-bar--7 { height: 100%; background-image: linear-gradient(180deg, var(--k-primary), color-mix(in srgb, var(--k-primary) 60%, var(--k-accent))); }
.shero-float { position: absolute; left: 24px; top: 32px; display: flex; align-items: center; gap: 12px; padding: 12px 16px 12px 12px; border-radius: ${R_LG}; background-color: var(--k-surface); box-shadow: ${SHADOW_MD}; border: ${HAIRLINE}; }
.shero-float-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: ${R_SM}; background-color: ${tint(12)}; color: var(--k-primary); }
.shero-float-glyph { width: 18px; height: 18px; }
.shero-float-copy { display: flex; flex-direction: column; }
.shero-float-title { font-size: 13.5px; font-weight: 600; }
.shero-float-text { font-size: 12.5px; color: var(--k-muted); }
${rise('.shero-copy', 0)}
${rise('.shero-panel', 200)}
${rise('.shero-float', 420)}
@media (max-width: 1024px) { .shero-inner { grid-template-columns: 1fr; gap: 48px; } .shero-title { font-size: 50px; } .shero-visual { aspect-ratio: 4 / 3; } }
@media (max-width: 640px) { .shero { padding: 64px 20px; } .shero-title { font-size: 38px; } .shero-text { font-size: 17px; } .shero-form { flex-direction: column; } .shero-visual { padding: 24px; } .shero-float { display: none; } }`,
  },
  {
    id: 'hero-glow',
    name: 'Hero · Gradient glow',
    category: 'hero',
    keywords: ['hero', 'dark', 'gradient', 'glow', 'aurora', 'landing', 'gradient text'],
    width: 1280,
    html: `<section class="glow" data-name="Gradient hero">
<div class="glow-orb glow-orb--a"></div><div class="glow-orb glow-orb--b"></div><div class="glow-grid"></div>
<div class="glow-inner">
<span class="glow-badge">${icon('sparkles', 'glow-badge-icon')} Now with AI motion</span>
<h1 class="glow-title">Ship <span class="glow-gradient">beautiful motion</span> in minutes, not sprints</h1>
<p class="glow-text">Describe it, tweak it on the timeline, export it as clean CSS. Kinema keeps designers and developers in the same flow.</p>
<div class="glow-actions"><a class="glow-primary" href="#">Start building ${icon('arrow-right', 'glow-btn-icon')}</a><a class="glow-secondary" href="#">Book a demo</a></div>
<div class="glow-metrics"><div class="glow-metric"><span class="glow-metric-value">4.9/5</span><span class="glow-metric-label">Average rating</span></div><div class="glow-metric"><span class="glow-metric-value">120k+</span><span class="glow-metric-label">Creators</span></div><div class="glow-metric"><span class="glow-metric-value">60 fps</span><span class="glow-metric-label">Smooth exports</span></div></div>
</div></section>`,
    css: `${RISE_KEYFRAMES}
@keyframes drift { from { transform: translateY(0) scale(1); } to { transform: translateY(30px) scale(1.08); } }
.glow { position: relative; width: 100%; padding: 128px 24px 112px; overflow: hidden; background-color: var(--k-text); color: #ffffff; isolation: isolate; }
.glow-orb { position: absolute; width: 560px; height: 560px; border-radius: 50%; filter: blur(90px); opacity: 0.55; z-index: -1; }
.glow-orb--a { left: 8%; top: -260px; background-color: var(--k-primary); animation: drift 9s ease-in-out 0s infinite alternate both; }
.glow-orb--b { left: 52%; top: -180px; background-color: var(--k-accent); opacity: 0.4; animation: drift 11s ease-in-out 0s infinite alternate-reverse both; }
.glow-grid { position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: -1; background-image: linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px); background-size: 56px 56px; -webkit-mask-image: radial-gradient(70% 60% at 50% 0%, #000000 0%, transparent 75%); mask-image: radial-gradient(70% 60% at 50% 0%, #000000 0%, transparent 75%); }
.glow-inner { display: flex; flex-direction: column; align-items: center; gap: 24px; max-width: 960px; margin: 0 auto; text-align: center; }
.glow-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.14); background-color: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.86); font-size: 13.5px; font-weight: 500; backdrop-filter: blur(8px); }
.glow-badge-icon { width: 15px; height: 15px; color: var(--k-accent); }
.glow-title { font-size: 72px; line-height: 1.03; letter-spacing: -0.045em; font-weight: 750; color: #ffffff; }
.glow-gradient { background-image: linear-gradient(100deg, color-mix(in srgb, var(--k-primary) 60%, #ffffff), var(--k-accent)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.glow-text { max-width: 620px; font-size: 19px; line-height: 1.6; color: rgba(255, 255, 255, 0.68); }
.glow-actions { display: flex; gap: 12px; margin-top: 8px; }
${buttonCss('.glow-primary', 'light', 'lg')}
.glow-secondary { display: inline-flex; align-items: center; height: 48px; padding: 0 24px; border-radius: ${R_SM}; border: 1px solid rgba(255, 255, 255, 0.2); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; transition: background-color 0.18s ${EASE}, border-color 0.18s ${EASE}; }
.glow-secondary:hover { background-color: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.32); }
.glow-btn-icon { width: 17px; height: 17px; }
.glow-metrics { display: flex; gap: 48px; margin-top: 40px; padding-top: 32px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.glow-metric { display: flex; flex-direction: column; gap: 4px; }
.glow-metric-value { font-family: var(--k-font-heading); font-size: 28px; font-weight: 700; letter-spacing: -0.03em; color: #ffffff; }
.glow-metric-label { font-size: 13.5px; color: rgba(255, 255, 255, 0.55); }
${rise('.glow-badge', 0)}
${rise('.glow-title', 90)}
${rise('.glow-text', 180)}
${rise('.glow-actions', 270)}
${rise('.glow-metrics', 380)}
@media (max-width: 1024px) { .glow { padding: 104px 24px 88px; } .glow-title { font-size: 56px; } }
@media (max-width: 640px) { .glow { padding: 80px 20px 64px; } .glow-title { font-size: 40px; } .glow-text { font-size: 17px; } .glow-actions { flex-direction: column; align-self: stretch; } .glow-metrics { gap: 24px; } .glow-metric-value { font-size: 22px; } }`,
  },
];

