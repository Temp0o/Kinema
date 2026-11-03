import type { CatalogItem } from '../types';
import { icon, type CatalogIconName } from '../icons';
import { AVATAR_FILLS, BORDER, EASE, HAIRLINE, R_LG, R_SM, R_XL, SHADOW_SM, buttonCss, tint } from '../snippets';

const SECTION = (sel: string, bg = 'var(--k-background)') =>
  `${sel} { width: 100%; padding: 96px 24px; background-color: ${bg}; }
@media (max-width: 1024px) { ${sel} { padding: 72px 24px; } }
@media (max-width: 640px) { ${sel} { padding: 56px 20px; } }`;

const HEAD = (p: string, align: 'center' | 'start' = 'center') =>
  `.${p}-head { display: flex; flex-direction: column; align-items: ${align === 'center' ? 'center' : 'flex-start'}; gap: 12px; ${align === 'center' ? 'text-align: center; margin: 0 auto;' : ''} max-width: 640px; }
.${p}-eyebrow { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--k-primary); }
.${p}-title { font-size: 40px; line-height: 1.1; letter-spacing: -0.03em; }
.${p}-text { font-size: 18px; line-height: 1.6; color: var(--k-muted); }
@media (max-width: 640px) { .${p}-title { font-size: 30px; } .${p}-text { font-size: 16px; } }`;

const FEATURES: [CatalogIconName, string, string][] = [
  ['layers', 'Visual timeline', 'Keyframe any property and scrub through your animation with frame-accurate control.'],
  ['gauge', '60 fps by default', 'Animations compile to GPU-friendly transforms and opacity for buttery playback.'],
  ['code', 'Clean code export', 'Semantic HTML and readable CSS you’d actually want to commit.'],
  ['sliders-horizontal', 'Design tokens', 'Change a color or font once and watch every page update instantly.'],
  ['shield-check', 'Private by design', 'Projects live on your machine. Nothing leaves it unless you say so.'],
  ['wand-sparkles', 'AI assistance', 'Describe a section or an animation and refine the result visually.'],
];

const LOGOS: { name: string; mark: string; weight: number; spacing: string }[] = [
  { name: 'Northwind', mark: '<path d="M12 3 3 20h18z" fill="currentColor"/>', weight: 700, spacing: '-0.02em' },
  { name: 'Globex', mark: '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="3.5"/>', weight: 800, spacing: '-0.03em' },
  { name: 'Hexa', mark: '<path d="M12 2.5 20.5 7.25v9.5L12 21.5 3.5 16.75v-9.5z" fill="currentColor"/>', weight: 600, spacing: '0.02em' },
  { name: 'Quanta', mark: '<rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor"/><rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor"/><rect x="13" y="3" width="8" height="8" rx="4" fill="currentColor" fill-opacity=".45"/>', weight: 700, spacing: '-0.01em' },
  { name: 'Pulse', mark: '<path d="M2 12h4l3-8 6 16 3-8h4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>', weight: 800, spacing: '-0.02em' },
  { name: 'Lumen', mark: '<circle cx="12" cy="12" r="5" fill="currentColor"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>', weight: 600, spacing: '0' },
];

const FAQS: [string, string][] = [
  ['Can I export clean, production-ready code?', 'Yes. Every page exports as semantic HTML and readable CSS, including your animations as native CSS keyframes. No runtime required.'],
  ['Does Kinema work offline?', 'Absolutely. Projects, fonts and assets are stored locally, so you can design anywhere — on a plane or in a cabin.'],
  ['How do responsive breakpoints work?', 'Design on desktop, then override any style for tablet and mobile. Overrides cascade just like CSS media queries.'],
  ['Can my team collaborate on a project?', 'Share libraries of components and animations across projects, and export projects to hand them to teammates.'],
  ['What happens when my trial ends?', 'You keep everything you made. Projects stay editable on the free plan with a limit on active projects.'],
];

const TEAM: [string, string, string][] = [
  ['AC', 'Ava Chen', 'Co-founder & CEO'],
  ['MO', 'Marcus Okafor', 'Head of Engineering'],
  ['LP', 'Lena Petrova', 'Design Lead'],
  ['RS', 'Rafael Santos', 'Motion Designer'],
];

const QUOTES: [string, string, string, string][] = [
  ['MR', 'Maya Rodriguez', 'Design Lead, Northwind', 'We prototyped our entire onboarding flow — with motion — in an afternoon. Engineering shipped the exported CSS almost untouched.'],
  ['DK', 'Daniel Kim', 'Founder, Pulse', 'Finally a tool that treats animation as a first-class citizen.'],
  ['SN', 'Sara Nakamura', 'Frontend Engineer, Hexa', 'The exported code is genuinely clean. Semantic tags, sensible class names and keyframes I can read. It made me trust a visual tool again.'],
  ['JB', 'Jonas Berg', 'Product Designer, Globex', 'Tokens + breakpoints + timeline in one place. It’s the workflow I always wanted.'],
  ['PL', 'Priya Laghari', 'Creative Director, Lumen', 'Our launch pages feel alive now. Clients notice the difference immediately — and we build them faster than before.'],
  ['TW', 'Tom Wright', 'Indie maker', 'I replaced a design tool, a prototyping tool and a page builder with one app. Wild.'],
];

const quoteCard = ([ini, name, role, text]: [string, string, string, string], i: number) =>
  `<figure class="wall-card"><blockquote class="wall-quote">${text}</blockquote><figcaption class="wall-author"><div class="wall-avatar wall-avatar--${i % AVATAR_FILLS.length}">${ini}</div><div class="wall-meta"><span class="wall-name">${name}</span><span class="wall-role">${role}</span></div></figcaption></figure>`;

export const CONTENT: CatalogItem[] = [
  {
    id: 'feature-grid',
    name: 'Feature grid',
    category: 'content',
    keywords: ['features', 'grid', 'benefits', 'icons', 'section', 'services'],
    width: 1280,
    html: `<section class="feat" data-name="Feature grid"><div class="feat-inner">
<div class="feat-head"><span class="feat-eyebrow">Features</span><h2 class="feat-title">Everything you need to ship delightful sites</h2><p class="feat-text">A focused toolset for designing, animating and exporting — without the busywork.</p></div>
<div class="feat-grid">${FEATURES.map(([ic, t, d]) => `<div class="feat-item"><div class="feat-icon">${icon(ic, 'feat-glyph')}</div><h3 class="feat-item-title">${t}</h3><p class="feat-item-text">${d}</p></div>`).join('')}</div>
</div></section>`,
    css: `${SECTION('.feat')}
.feat-inner { display: flex; flex-direction: column; gap: 56px; max-width: 1120px; margin: 0 auto; }
${HEAD('feat')}
.feat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; overflow: hidden; border-radius: ${R_XL}; border: ${HAIRLINE}; background-color: ${BORDER}; }
.feat-item { display: flex; flex-direction: column; gap: 10px; padding: 32px; background-color: var(--k-surface); transition: background-color 0.2s ${EASE}; }
.feat-item:hover { background-color: color-mix(in srgb, var(--k-primary) 3%, var(--k-surface)); }
.feat-icon { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 8px; border-radius: ${R_SM}; background-color: ${tint(10)}; color: var(--k-primary); }
.feat-glyph { width: 20px; height: 20px; }
.feat-item-title { font-size: 17px; letter-spacing: -0.015em; }
.feat-item-text { font-size: 15px; line-height: 1.6; color: var(--k-muted); }
@media (max-width: 1024px) { .feat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .feat-grid { grid-template-columns: minmax(0, 1fr); } .feat-item { padding: 24px; } }`,
  },
  {
    id: 'logo-cloud',
    name: 'Logo cloud',
    category: 'content',
    keywords: ['logos', 'clients', 'customers', 'trusted by', 'brands', 'social proof'],
    width: 1280,
    html: `<section class="logos" data-name="Logo cloud"><div class="logos-inner"><p class="logos-title">Trusted by fast-moving teams at</p>
<div class="logos-row">${LOGOS.map((l, i) => `<div class="logo logo--${i}"><svg class="logo-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">${l.mark}</svg><span class="logo-name logo-name--${i}">${l.name}</span></div>`).join('')}</div></div></section>`,
    css: `.logos { width: 100%; padding: 56px 24px; background-color: var(--k-surface); }
.logos-inner { display: flex; flex-direction: column; align-items: center; gap: 28px; max-width: 1120px; margin: 0 auto; }
.logos-title { font-size: 14px; font-weight: 500; color: var(--k-muted); }
.logos-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 24px 56px; }
.logo { display: flex; align-items: center; gap: 8px; color: color-mix(in srgb, var(--k-text) 55%, transparent); transition: color 0.2s ${EASE}; }
.logo:hover { color: var(--k-text); }
.logo-mark { width: 24px; height: 24px; }
.logo-name { font-family: var(--k-font-heading); font-size: 21px; }
${LOGOS.map((l, i) => `.logo-name--${i} { font-weight: ${l.weight}; letter-spacing: ${l.spacing}; }`).join('\n')}
@media (max-width: 640px) { .logos-row { gap: 20px 32px; } .logo-name { font-size: 18px; } }`,
  },
  {
    id: 'faq',
    name: 'FAQ list',
    category: 'content',
    keywords: ['faq', 'questions', 'accordion', 'help', 'answers', 'support'],
    width: 1280,
    html: `<section class="faq" data-name="FAQ"><div class="faq-inner">
<div class="faq-head"><h2 class="faq-title">Frequently asked questions</h2><p class="faq-text">Can’t find what you’re looking for? <a href="#" style="color: var(--k-primary); font-weight: 600; text-decoration: none;">Contact support</a></p></div>
<div class="faq-list">${FAQS.map(([q, a], i) => `<div class="faq-item${i === 0 ? ' faq-item--open' : ''}"><div class="faq-q"><span class="faq-question">${q}</span>${icon(i === 0 ? 'minus' : 'plus', 'faq-toggle')}</div>${i === 0 ? `<p class="faq-a">${a}</p>` : ''}</div>`).join('')}</div>
</div></section>`,
    css: `${SECTION('.faq', 'var(--k-surface)')}
.faq-inner { display: grid; grid-template-columns: 1fr 1.6fr; gap: 64px; max-width: 1120px; margin: 0 auto; }
.faq-head { display: flex; flex-direction: column; gap: 14px; }
.faq-title { font-size: 40px; line-height: 1.1; letter-spacing: -0.03em; }
.faq-text { font-size: 16px; color: var(--k-muted); }
.faq-list { display: flex; flex-direction: column; border-top: ${HAIRLINE}; }
.faq-item { display: flex; flex-direction: column; gap: 10px; padding: 22px 4px; border-bottom: ${HAIRLINE}; }
.faq-q { display: flex; align-items: center; justify-content: space-between; gap: 16px; cursor: pointer; }
.faq-question { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
.faq-toggle { width: 26px; height: 26px; padding: 5px; flex: none; border-radius: 50%; border: ${HAIRLINE}; color: var(--k-muted); transition: background-color 0.18s ${EASE}; }
.faq-item--open .faq-toggle { background-color: var(--k-text); color: var(--k-surface); border-color: transparent; }
.faq-a { max-width: 620px; font-size: 15.5px; line-height: 1.65; color: var(--k-muted); }
@media (max-width: 1024px) { .faq-inner { grid-template-columns: 1fr; gap: 32px; } }
@media (max-width: 640px) { .faq-title { font-size: 30px; } .faq-question { font-size: 16px; } }`,
  },
  {
    id: 'cta-banner',
    name: 'CTA banner',
    category: 'content',
    keywords: ['cta', 'call to action', 'banner', 'signup', 'conversion', 'gradient'],
    width: 1280,
    html: `<section class="cta" data-name="CTA banner"><div class="cta-panel"><div class="cta-copy"><h2 class="cta-title">Ready to bring your ideas to life?</h2><p class="cta-text">Start designing in minutes. Upgrade when your team is ready.</p></div><div class="cta-actions"><a class="cta-primary" href="#">Get started free</a><a class="cta-secondary" href="#">Talk to sales</a></div></div></section>`,
    css: `.cta { width: 100%; padding: 64px 24px; background-color: var(--k-background); }
.cta-panel { display: flex; align-items: center; justify-content: space-between; gap: 40px; max-width: 1120px; margin: 0 auto; padding: 56px; border-radius: ${R_XL}; color: #ffffff; background-image: radial-gradient(60% 120% at 100% 0%, color-mix(in srgb, var(--k-accent) 70%, transparent) 0%, transparent 60%), radial-gradient(50% 100% at 0% 100%, rgba(255, 255, 255, 0.18) 0%, transparent 60%), linear-gradient(135deg, var(--k-primary), color-mix(in srgb, var(--k-primary) 70%, #000000)); box-shadow: 0 30px 80px -30px ${tint(70)}; }
.cta-copy { display: flex; flex-direction: column; gap: 10px; max-width: 560px; }
.cta-title { font-size: 38px; line-height: 1.1; letter-spacing: -0.03em; color: #ffffff; }
.cta-text { font-size: 18px; color: rgba(255, 255, 255, 0.78); }
.cta-actions { display: flex; gap: 12px; flex: none; }
${buttonCss('.cta-primary', 'light', 'lg')}
.cta-secondary { display: inline-flex; align-items: center; height: 48px; padding: 0 22px; border-radius: ${R_SM}; border: 1px solid rgba(255, 255, 255, 0.35); color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; transition: background-color 0.18s ${EASE}; }
.cta-secondary:hover { background-color: rgba(255, 255, 255, 0.12); }
@media (max-width: 1024px) { .cta-panel { flex-direction: column; align-items: flex-start; padding: 44px; } }
@media (max-width: 640px) { .cta { padding: 40px 16px; } .cta-panel { padding: 32px 24px; } .cta-title { font-size: 28px; } .cta-actions { flex-direction: column; align-self: stretch; } }`,
  },
  {
    id: 'stats-row',
    name: 'Stats row',
    category: 'content',
    keywords: ['stats', 'numbers', 'metrics', 'figures', 'counters', 'achievements'],
    width: 1280,
    html: `<section class="stats" data-name="Stats row"><div class="stats-inner">
<div class="stat"><span class="stat-value">10k+</span><span class="stat-label">Teams onboarded</span></div>
<div class="stat"><span class="stat-value">99.99%</span><span class="stat-label">Uptime this year</span></div>
<div class="stat"><span class="stat-value">4.9★</span><span class="stat-label">Average rating</span></div>
<div class="stat"><span class="stat-value">3×</span><span class="stat-label">Faster launches</span></div>
</div></section>`,
    css: `.stats { width: 100%; padding: 64px 24px; background-color: var(--k-surface); border-top: ${HAIRLINE}; border-bottom: ${HAIRLINE}; }
.stats-inner { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); max-width: 1120px; margin: 0 auto; }
.stat { display: flex; flex-direction: column; gap: 6px; padding: 8px 32px; border-left: ${HAIRLINE}; }
.stat:first-child { border-left: none; padding-left: 0; }
.stat-value { font-family: var(--k-font-heading); font-size: 48px; font-weight: 700; letter-spacing: -0.04em; line-height: 1.05; background-image: linear-gradient(180deg, var(--k-text), color-mix(in srgb, var(--k-text) 55%, transparent)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.stat-label { font-size: 15px; color: var(--k-muted); }
@media (max-width: 1024px) { .stats-inner { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 32px; } .stat:nth-child(3) { border-left: none; padding-left: 0; } }
@media (max-width: 640px) { .stat { padding: 4px 16px; } .stat-value { font-size: 34px; } }`,
  },
  {
    id: 'steps',
    name: 'Steps timeline',
    category: 'content',
    keywords: ['steps', 'timeline', 'process', 'how it works', 'onboarding', 'roadmap'],
    width: 1280,
    html: `<section class="steps" data-name="Steps"><div class="steps-inner">
<div class="steps-head"><span class="steps-eyebrow">How it works</span><h2 class="steps-title">From idea to launch in three steps</h2></div>
<div class="steps-list"><div class="steps-line"></div>
<div class="step"><div class="step-marker">1</div><h3 class="step-title">Design</h3><p class="step-text">Start from a template or a blank canvas and lay out your pages visually.</p></div>
<div class="step"><div class="step-marker">2</div><h3 class="step-title">Animate</h3><p class="step-text">Add entrance, hover and scroll animations with presets or keyframes.</p></div>
<div class="step"><div class="step-marker step-marker--done">${icon('check', 'step-check', 3)}</div><h3 class="step-title">Publish</h3><p class="step-text">Export clean HTML and CSS, or preview it in your browser instantly.</p></div>
</div></div></section>`,
    css: `${SECTION('.steps')}
.steps-inner { display: flex; flex-direction: column; gap: 56px; max-width: 1120px; margin: 0 auto; }
${HEAD('steps')}
.steps-list { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px; }
.steps-line { position: absolute; left: 16.6%; top: 22px; width: 66.8%; height: 2px; background-image: linear-gradient(90deg, var(--k-primary), color-mix(in srgb, var(--k-primary) 25%, transparent)); }
.step { position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
.step-marker { display: grid; place-items: center; width: 46px; height: 46px; margin-bottom: 10px; border-radius: 50%; background-color: var(--k-surface); border: 2px solid var(--k-primary); color: var(--k-primary); font-size: 17px; font-weight: 700; box-shadow: 0 0 0 6px var(--k-background); }
.step-marker--done { background-color: var(--k-primary); color: #ffffff; }
.step-check { width: 20px; height: 20px; }
.step-title { font-size: 19px; letter-spacing: -0.015em; }
.step-text { max-width: 280px; font-size: 15px; line-height: 1.6; color: var(--k-muted); }
@media (max-width: 640px) { .steps-list { grid-template-columns: 1fr; gap: 36px; } .steps-line { display: none; } }`,
  },
  {
    id: 'team-grid',
    name: 'Team grid',
    category: 'content',
    keywords: ['team', 'people', 'about', 'staff', 'members', 'founders'],
    width: 1280,
    html: `<section class="team" data-name="Team grid"><div class="team-inner">
<div class="team-head"><span class="team-eyebrow">Our team</span><h2 class="team-title">The people behind the pixels</h2><p class="team-text">A small, senior team of designers and engineers obsessed with craft.</p></div>
<div class="team-grid">${TEAM.map(([ini, name, role], i) => `<div class="member"><div class="member-photo member-photo--${i}">${ini}</div><h3 class="member-name">${name}</h3><p class="member-role">${role}</p><div class="member-links"><a class="member-link" href="#" aria-label="Website">${icon('globe', 'member-icon')}</a><a class="member-link" href="#" aria-label="Email">${icon('mail', 'member-icon')}</a></div></div>`).join('')}</div>
</div></section>`,
    css: `${SECTION('.team', 'var(--k-surface)')}
.team-inner { display: flex; flex-direction: column; gap: 56px; max-width: 1120px; margin: 0 auto; }
${HEAD('team')}
.team-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px; }
.member { display: flex; flex-direction: column; gap: 4px; }
.member-photo { display: grid; place-items: center; aspect-ratio: 1 / 1; margin-bottom: 12px; border-radius: ${R_LG}; color: rgba(255, 255, 255, 0.92); font-family: var(--k-font-heading); font-size: 44px; font-weight: 700; letter-spacing: -0.02em; transition: transform 0.3s ${EASE}; }
.member-photo:hover { transform: scale(1.02); }
${TEAM.map((_, i) => `.member-photo--${i} { background-image: radial-gradient(70% 70% at 30% 20%, rgba(255, 255, 255, 0.3) 0%, transparent 60%), ${AVATAR_FILLS[i]}; }`).join('\n')}
.member-name { font-size: 17px; letter-spacing: -0.015em; }
.member-role { font-size: 14.5px; color: var(--k-muted); }
.member-links { display: flex; gap: 6px; margin-top: 8px; }
.member-link { display: grid; place-items: center; width: 30px; height: 30px; border-radius: ${R_SM}; color: var(--k-muted); border: ${HAIRLINE}; transition: color 0.16s ${EASE}; }
.member-link:hover { color: var(--k-text); }
.member-icon { width: 15px; height: 15px; }
@media (max-width: 1024px) { .team-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .team-grid { gap: 20px; } .member-photo { font-size: 32px; } }`,
  },
  {
    id: 'testimonial-wall',
    name: 'Testimonial wall',
    category: 'content',
    keywords: ['testimonials', 'reviews', 'wall of love', 'quotes', 'customers', 'masonry'],
    width: 1280,
    html: `<section class="wall" data-name="Testimonial wall"><div class="wall-inner">
<div class="wall-head"><span class="wall-eyebrow">Wall of love</span><h2 class="wall-title">Loved by designers and developers</h2></div>
<div class="wall-grid"><div class="wall-col">${quoteCard(QUOTES[0], 0)}${quoteCard(QUOTES[1], 1)}</div><div class="wall-col">${quoteCard(QUOTES[2], 2)}${quoteCard(QUOTES[3], 3)}</div><div class="wall-col">${quoteCard(QUOTES[4], 4)}${quoteCard(QUOTES[5], 5)}</div></div>
</div></section>`,
    css: `${SECTION('.wall')}
.wall-inner { display: flex; flex-direction: column; gap: 56px; max-width: 1120px; margin: 0 auto; }
${HEAD('wall')}
.wall-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; gap: 20px; }
.wall-col { display: flex; flex-direction: column; gap: 20px; }
.wall-card { display: flex; flex-direction: column; gap: 18px; margin: 0; padding: 24px; border-radius: ${R_LG}; background-color: var(--k-surface); border: ${HAIRLINE}; box-shadow: ${SHADOW_SM}; }
.wall-quote { margin: 0; font-size: 15.5px; line-height: 1.6; }
.wall-author { display: flex; align-items: center; gap: 10px; }
.wall-avatar { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; color: #ffffff; font-size: 12.5px; font-weight: 700; flex: none; }
${AVATAR_FILLS.map((f, i) => `.wall-avatar--${i} { background-image: ${f}; }`).join('\n')}
.wall-meta { display: flex; flex-direction: column; }
.wall-name { font-size: 14px; font-weight: 600; }
.wall-role { font-size: 13px; color: var(--k-muted); }
@media (max-width: 1024px) { .wall-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .wall-grid { grid-template-columns: minmax(0, 1fr); } }`,
  },
];
