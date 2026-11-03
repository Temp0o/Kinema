import type { TemplateDef } from './types';
import { icon } from './icons';

const work = [
  { title: 'Fieldnotes', meta: 'Brand & app design · 2026', cls: 'w1', shape: 'shape-phone' },
  { title: 'Meridian Bank', meta: 'Product design · 2025', cls: 'w2', shape: 'shape-card' },
  { title: 'Atlas Studio', meta: 'Identity · 2025', cls: 'w3', shape: 'shape-circle' },
  { title: 'Calm Commerce', meta: 'Design system · 2024', cls: 'w4', shape: 'shape-stack' },
];

const html = `
<header class="nav">
  <a class="logo" href="#">Elena Marsh<span class="logo-dot">.</span></a>
  <nav class="links">
    <a class="link" href="#work">Work</a>
    <a class="link" href="#about">About</a>
    <a class="link" href="#services">Services</a>
    <a class="link" href="#contact">Contact</a>
  </nav>
  <div class="status"><div class="status-dot"></div><span class="status-text">Available for projects</span></div>
</header>

<section class="hero">
  <p class="kicker">Independent product designer — Lisbon</p>
  <h1 class="headline">Designing calm, <em class="accent">thoughtful</em> products people return to.</h1>
  <div class="hero-row">
    <p class="intro">I help early-stage teams turn complicated ideas into simple, beautiful software. Ten years of shaping products for startups and studios across Europe.</p>
    <div class="hero-meta">
      <div class="meta-item"><p class="meta-label">Currently</p><p class="meta-value">Design lead at Studio North</p></div>
      <div class="meta-item"><p class="meta-label">Previously</p><p class="meta-value">Monzo, Pitch, Linear</p></div>
    </div>
  </div>
</section>

<section class="work" id="work">
  <div class="section-row"><h2 class="section-title">Selected work</h2><a class="section-link" href="#">View all projects${icon('arrowUpRight', 'link-icon')}</a></div>
  <div class="work-grid">
    ${work
      .map(
        (w) => `<a class="project" href="#">
      <div class="cover ${w.cls}"><div class="${w.shape}"></div></div>
      <div class="project-info"><h3 class="project-title">${w.title}</h3><p class="project-meta">${w.meta}</p></div>
    </a>`,
      )
      .join('\n')}
  </div>
</section>

<section class="about" id="about">
  <div class="portrait"><div class="portrait-inner">EM</div></div>
  <div class="about-text">
    <p class="kicker">About</p>
    <h2 class="about-title">Good design is quiet. It gets out of the way and lets people do their best work.</h2>
    <p class="body">I work closely with founders and engineers, from the first sketch to the final pixel. My process is collaborative, fast and grounded in research — and I care a great deal about the details nobody notices.</p>
    <div class="chips"><div class="chip">Product strategy</div><div class="chip">Interaction design</div><div class="chip">Design systems</div><div class="chip">Prototyping</div><div class="chip">Brand</div></div>
  </div>
</section>

<section class="services" id="services">
  <h2 class="section-title">How I can help</h2>
  <div class="service-list">
    <div class="service"><p class="service-num">01</p><h3 class="service-title">Product design</h3><p class="service-desc">End-to-end design of web and mobile products, from discovery to launch.</p>${icon('arrowUpRight', 'service-icon')}</div>
    <div class="service"><p class="service-num">02</p><h3 class="service-title">Design systems</h3><p class="service-desc">Scalable foundations and components your whole team will enjoy using.</p>${icon('arrowUpRight', 'service-icon')}</div>
    <div class="service"><p class="service-num">03</p><h3 class="service-title">Brand &amp; identity</h3><p class="service-desc">Distinctive visual identities for products that want to stand out.</p>${icon('arrowUpRight', 'service-icon')}</div>
  </div>
</section>

<section class="quote-section">
  <blockquote class="quote">“Elena has a rare ability to make complex products feel effortless. She raised the bar for our entire team.”</blockquote>
  <p class="quote-author">Daniel Osei — Founder, Fieldnotes</p>
</section>

<section class="contact" id="contact">
  <p class="kicker">Have a project in mind?</p>
  <h2 class="contact-title">Let’s make something <em class="accent">great</em> together.</h2>
  <a class="email" href="mailto:hello@elenamarsh.design">hello@elenamarsh.design</a>
  <div class="socials">
    <a class="social" href="#">${icon('dribbble', 'sicon')}<span>Dribbble</span></a>
    <a class="social" href="#">${icon('linkedin', 'sicon')}<span>LinkedIn</span></a>
    <a class="social" href="#">${icon('instagram', 'sicon')}<span>Instagram</span></a>
  </div>
</section>

<footer class="footer">
  <p class="foot-text">© 2026 Elena Marsh</p>
  <p class="foot-text">Designed with care in Lisbon</p>
</footer>
`;

const css = `
body { background: var(--k-background); color: var(--k-text); }
a { text-decoration: none; color: inherit; }

.nav { display: flex; align-items: center; justify-content: space-between; padding: 28px 72px; }
.logo { font-family: var(--k-font-heading); font-size: 24px; font-weight: 600; font-style: italic; letter-spacing: -0.01em; }
.logo-dot { color: var(--k-primary); }
.links { display: flex; gap: 36px; }
.link { font-size: 15px; color: var(--k-muted); transition: color .2s ease; }
.link:hover { color: var(--k-text); }
.status { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--k-border); background: var(--k-surface); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #3fa66b; box-shadow: 0 0 0 4px rgba(63, 166, 107, 0.18); animation: pulse 2.4s ease-in-out infinite; }
.status-text { font-size: 13px; font-weight: 500; }

.hero { display: flex; flex-direction: column; gap: 32px; padding: 96px 72px 112px; }
.kicker { color: var(--k-muted); font-size: 14px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; animation: rise 0.9s cubic-bezier(.2,.7,.2,1) backwards; }
.headline { max-width: 1120px; font-size: 92px; line-height: 1.02; font-weight: 500; letter-spacing: -0.035em; animation: rise 1s cubic-bezier(.2,.7,.2,1) 0.1s backwards; }
.accent { color: var(--k-primary); font-style: italic; }
.hero-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 64px; padding-top: 32px; border-top: 1px solid var(--k-border); animation: rise 1s cubic-bezier(.2,.7,.2,1) 0.2s backwards; }
.intro { max-width: 520px; font-size: 20px; line-height: 1.6; color: var(--k-muted); }
.hero-meta { display: flex; gap: 48px; }
.meta-item { display: flex; flex-direction: column; gap: 4px; }
.meta-label { font-size: 13px; color: var(--k-muted); }
.meta-value { font-size: 16px; font-weight: 500; }

.work { display: flex; flex-direction: column; gap: 40px; padding: 0 72px 120px; }
.section-row { display: flex; align-items: flex-end; justify-content: space-between; }
.section-title { font-size: 48px; font-weight: 500; letter-spacing: -0.03em; }
.section-link { display: flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 500; padding-bottom: 4px; border-bottom: 1px solid var(--k-text); transition: color .2s ease, border-color .2s ease; }
.section-link:hover { color: var(--k-primary); border-color: var(--k-primary); }
.link-icon { width: 16px; height: 16px; }
.work-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px 32px; }
.project { display: flex; flex-direction: column; gap: 18px; transition: transform .4s cubic-bezier(.2,.7,.2,1); }
.project:hover { transform: translateY(-6px); }
.cover { position: relative; display: flex; align-items: center; justify-content: center; height: 460px; border-radius: 20px; overflow: hidden; }
.w1 { background: radial-gradient(120% 90% at 20% 10%, #f7c9a8 0%, transparent 55%), linear-gradient(160deg, #e8794a, #c2461f); }
.w2 { background: radial-gradient(100% 80% at 80% 0%, #b8d8c9 0%, transparent 60%), linear-gradient(160deg, #3d6e5f, #1f3f36); }
.w3 { background: radial-gradient(90% 90% at 50% 100%, #f2e3c6 0%, transparent 60%), linear-gradient(160deg, #e9d8b8, #cdb68d); }
.w4 { background: radial-gradient(120% 90% at 0% 100%, #c9c3f2 0%, transparent 55%), linear-gradient(160deg, #6b5fd3, #3b3194); }
.shape-phone { width: 190px; height: 360px; border-radius: 34px; background: rgba(255, 255, 255, 0.92); box-shadow: 0 40px 80px rgba(90, 30, 10, 0.35), inset 0 0 0 8px #1d1a16; transform: rotate(-8deg); }
.shape-card { width: 340px; height: 210px; border-radius: 22px; background: linear-gradient(135deg, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.08)); border: 1px solid rgba(255, 255, 255, 0.45); box-shadow: 0 40px 80px rgba(10, 30, 25, 0.45); backdrop-filter: blur(10px); transform: rotate(6deg); }
.shape-circle { width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #2b2620, #1d1a16 70%); box-shadow: 30px 40px 80px rgba(80, 60, 20, 0.35); }
.shape-stack { width: 300px; height: 220px; border-radius: 18px; background: #fff; box-shadow: 24px 24px 0 rgba(255, 255, 255, 0.35), 48px 48px 0 rgba(255, 255, 255, 0.18), 0 50px 90px rgba(20, 10, 70, 0.4); transform: translate(-24px, -24px); }
.project-info { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.project-title { font-size: 26px; font-weight: 500; letter-spacing: -0.02em; }
.project-meta { color: var(--k-muted); font-size: 15px; }

.about { display: grid; grid-template-columns: 420px 1fr; gap: 80px; align-items: center; padding: 120px 72px; background: var(--k-surface); }
.portrait { height: 520px; border-radius: 24px; overflow: hidden; background: radial-gradient(80% 60% at 30% 20%, #f3cdb0, transparent 60%), radial-gradient(80% 70% at 80% 90%, #9fbfb2, transparent 60%), #e7dccb; display: flex; align-items: flex-end; padding: 28px; }
.portrait-inner { display: flex; align-items: center; justify-content: center; width: 84px; height: 84px; border-radius: 50%; background: var(--k-text); color: var(--k-background); font-family: var(--k-font-heading); font-size: 28px; font-style: italic; }
.about-text { display: flex; flex-direction: column; gap: 24px; }
.about-title { font-size: 40px; line-height: 1.2; font-weight: 500; letter-spacing: -0.025em; }
.body { max-width: 620px; font-size: 18px; line-height: 1.7; color: var(--k-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 10px; }
.chip { padding: 9px 16px; border-radius: 999px; border: 1px solid var(--k-border); font-size: 14px; transition: background-color .2s ease, color .2s ease, border-color .2s ease; }
.chip:hover { background: var(--k-text); color: var(--k-background); border-color: var(--k-text); }

.services { display: flex; flex-direction: column; gap: 40px; padding: 120px 72px; }
.service-list { display: flex; flex-direction: column; border-top: 1px solid var(--k-border); }
.service { display: grid; grid-template-columns: 80px 1fr 1.2fr 40px; align-items: center; gap: 32px; padding: 36px 8px; border-bottom: 1px solid var(--k-border); transition: background-color .3s ease, padding .3s ease; }
.service:hover { background: var(--k-surface); padding-left: 24px; }
.service-num { font-family: var(--k-font-heading); font-size: 20px; font-style: italic; color: var(--k-primary); }
.service-title { font-size: 32px; font-weight: 500; letter-spacing: -0.02em; }
.service-desc { color: var(--k-muted); font-size: 17px; line-height: 1.6; }
.service-icon { width: 28px; height: 28px; color: var(--k-text); }

.quote-section { display: flex; flex-direction: column; align-items: center; gap: 28px; padding: 120px 72px; text-align: center; background: var(--k-accent); color: #f5f0e8; }
.quote { max-width: 1000px; font-family: var(--k-font-heading); font-size: 48px; line-height: 1.25; font-style: italic; letter-spacing: -0.02em; }
.quote-author { font-size: 15px; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.8; }

.contact { display: flex; flex-direction: column; align-items: center; gap: 28px; padding: 140px 72px; text-align: center; }
.contact-title { max-width: 980px; font-size: 80px; line-height: 1.05; font-weight: 500; letter-spacing: -0.035em; }
.email { font-family: var(--k-font-heading); font-size: 32px; font-style: italic; border-bottom: 2px solid var(--k-primary); padding-bottom: 4px; transition: color .2s ease; }
.email:hover { color: var(--k-primary); }
.socials { display: flex; gap: 12px; margin-top: 12px; }
.social { display: flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 999px; border: 1px solid var(--k-border); font-size: 15px; transition: background-color .2s ease, color .2s ease; }
.social:hover { background: var(--k-text); color: var(--k-background); }
.sicon { width: 17px; height: 17px; }

.footer { display: flex; justify-content: space-between; padding: 32px 72px; border-top: 1px solid var(--k-border); }
.foot-text { color: var(--k-muted); font-size: 14px; }

@keyframes rise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.45; } 100% { opacity: 1; } }

@media (max-width: 1024px) {
  .nav { padding: 24px 40px; }
  .links { display: none; }
  .hero { padding: 72px 40px 88px; }
  .headline { font-size: 64px; }
  .hero-row { flex-direction: column; align-items: flex-start; gap: 32px; }
  .work { padding: 0 40px 96px; }
  .cover { height: 340px; }
  .shape-phone { width: 140px; height: 270px; }
  .shape-card { width: 240px; height: 150px; }
  .shape-circle { width: 180px; height: 180px; }
  .shape-stack { width: 200px; height: 150px; }
  .about { grid-template-columns: 1fr; gap: 48px; padding: 96px 40px; }
  .portrait { height: 380px; }
  .services { padding: 96px 40px; }
  .service { grid-template-columns: 60px 1fr 32px; }
  .service-desc { display: none; }
  .quote-section { padding: 96px 40px; }
  .quote { font-size: 36px; }
  .contact { padding: 112px 40px; }
  .contact-title { font-size: 56px; }
  .footer { padding: 28px 40px; }
}
@media (max-width: 640px) {
  .nav { padding: 20px; }
  .status { display: none; }
  .hero { padding: 48px 20px 64px; gap: 24px; }
  .headline { font-size: 44px; }
  .intro { font-size: 17px; }
  .hero-meta { flex-direction: column; gap: 20px; }
  .work { padding: 0 20px 72px; gap: 28px; }
  .section-row { flex-direction: column; align-items: flex-start; gap: 12px; }
  .section-title { font-size: 34px; }
  .work-grid { grid-template-columns: 1fr; gap: 32px; }
  .cover { height: 300px; }
  .project-info { flex-direction: column; gap: 4px; }
  .about { padding: 72px 20px; }
  .portrait { height: 320px; }
  .about-title { font-size: 28px; }
  .services { padding: 72px 20px; }
  .service { grid-template-columns: 40px 1fr 24px; gap: 16px; padding: 24px 0; }
  .service-title { font-size: 22px; }
  .quote-section { padding: 72px 20px; }
  .quote { font-size: 26px; }
  .contact { padding: 88px 20px; }
  .contact-title { font-size: 38px; }
  .email { font-size: 22px; }
  .socials { flex-wrap: wrap; justify-content: center; }
  .footer { flex-direction: column; gap: 8px; padding: 24px 20px; }
}
`;

export const portfolioTemplate: TemplateDef = {
  id: 'portfolio',
  name: 'Portfolio',
  description: 'Editorial personal site with work & contact',
  pageName: 'Home',
  swatch: '#d4572a',
  tokens: {
    colors: [
      { name: 'primary', value: '#d4572a' },
      { name: 'accent', value: '#2f5d50' },
      { name: 'text', value: '#1d1a16' },
      { name: 'muted', value: '#6e665c' },
      { name: 'surface', value: '#fbf8f3' },
      { name: 'background', value: '#f3eee6' },
      { name: 'border', value: '#ddd3c4' },
    ],
    fonts: { heading: 'Playfair Display Variable', body: 'DM Sans Variable' },
    radius: 16,
  },
  html,
  css,
};
