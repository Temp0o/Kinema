import type { TemplateDef } from './types';
import { icon, STAR_FILLED } from './icons';

const bars = [38, 52, 44, 63, 58, 72, 66, 81, 74, 88, 79, 94];

const html = `
<header class="nav">
  <a class="brand" href="#"><div class="brand-mark"></div><span class="brand-name">Nova</span></a>
  <nav class="nav-links">
    <a class="nav-link" href="#features">Product</a>
    <a class="nav-link" href="#features">Features</a>
    <a class="nav-link" href="#pricing">Pricing</a>
    <a class="nav-link" href="#customers">Customers</a>
  </nav>
  <div class="nav-actions">
    <a class="nav-login" href="#">Sign in</a>
    <a class="btn btn-small" href="#">Get started</a>
  </div>
</header>

<section class="hero">
  <div class="glow glow-a"></div>
  <div class="glow glow-b"></div>
  <a class="pill" href="#"><span class="pill-tag">New</span><span class="pill-text">Nova 2.0 — meet Autopilot</span>${icon('arrowRight', 'pill-icon')}</a>
  <h1 class="hero-title">Ship products your users <span class="grad">fall in love with</span></h1>
  <p class="hero-sub">Nova brings planning, design reviews and product analytics into one fast workspace — so your team spends less time syncing and more time shipping.</p>
  <div class="hero-ctas">
    <a class="btn btn-primary" href="#">Start free trial${icon('arrowRight', 'btn-icon')}</a>
    <a class="btn btn-ghost" href="#">${icon('play', 'btn-icon')}Watch the demo</a>
  </div>
  <p class="hero-note">Free for 14 days · No credit card required</p>

  <div class="mockup">
    <div class="mock-bar">
      <div class="dot dot-r"></div><div class="dot dot-y"></div><div class="dot dot-g"></div>
      <div class="mock-url">app.nova.so/overview</div>
    </div>
    <div class="mock-body">
      <div class="mock-side">
        <div class="mock-logo"></div>
        <div class="mock-item mock-item-active"></div>
        <div class="mock-item"></div>
        <div class="mock-item"></div>
        <div class="mock-item mock-item-short"></div>
      </div>
      <div class="mock-main">
        <div class="mock-kpis">
          <div class="kpi"><p class="kpi-label">Active users</p><p class="kpi-value">48,210</p><p class="kpi-delta">+12.4%</p></div>
          <div class="kpi"><p class="kpi-label">Conversion</p><p class="kpi-value">6.82%</p><p class="kpi-delta">+0.9%</p></div>
          <div class="kpi"><p class="kpi-label">MRR</p><p class="kpi-value">$184k</p><p class="kpi-delta">+18.2%</p></div>
        </div>
        <div class="mock-chart">
          ${bars.map((h, i) => `<div class="bar${i === bars.length - 1 ? ' bar-hi' : ''}" style="height:${h}%"></div>`).join('')}
        </div>
      </div>
    </div>
  </div>
</section>

<section class="logos">
  <p class="logos-title">Trusted by 4,000+ fast-moving teams</p>
  <div class="logos-row">
    <div class="logo">Lumen</div><div class="logo">Northwind</div><div class="logo">Vertex</div><div class="logo">Polaris</div><div class="logo">Cobalt</div>
  </div>
</section>

<section class="features" id="features">
  <div class="section-head">
    <p class="eyebrow">Why Nova</p>
    <h2 class="section-title">Everything your team needs, nothing it doesn’t</h2>
    <p class="section-sub">Built for speed from the first keystroke. Nova keeps work flowing with real-time collaboration and automation that just works.</p>
  </div>
  <div class="feature-grid">
    <div class="feature"><div class="feature-icon">${icon('zap', 'ficon')}</div><h3 class="feature-title">Lightning fast</h3><p class="feature-text">Every interaction under 50ms. Keyboard-first by design, so you never wait for your tools.</p></div>
    <div class="feature"><div class="feature-icon">${icon('layers', 'ficon')}</div><h3 class="feature-title">One source of truth</h3><p class="feature-text">Roadmaps, specs and feedback live together and stay in sync across every team.</p></div>
    <div class="feature"><div class="feature-icon">${icon('sparkles', 'ficon')}</div><h3 class="feature-title">Autopilot</h3><p class="feature-text">Triage, summaries and status updates written for you — reviewed by you.</p></div>
    <div class="feature"><div class="feature-icon">${icon('chart', 'ficon')}</div><h3 class="feature-title">Insights built in</h3><p class="feature-text">See how features perform the moment they ship, without a data team.</p></div>
    <div class="feature"><div class="feature-icon">${icon('users', 'ficon')}</div><h3 class="feature-title">Made for teams</h3><p class="feature-text">Comments, mentions and reviews in context. Async by default, live when it counts.</p></div>
    <div class="feature"><div class="feature-icon">${icon('shield', 'ficon')}</div><h3 class="feature-title">Secure by default</h3><p class="feature-text">SOC 2 Type II, SSO and granular permissions for teams of every size.</p></div>
  </div>
</section>

<section class="stats">
  <div class="stat"><p class="stat-value">3.2×</p><p class="stat-label">faster release cycles</p></div>
  <div class="stat"><p class="stat-value">48%</p><p class="stat-label">fewer status meetings</p></div>
  <div class="stat"><p class="stat-value">99.99%</p><p class="stat-label">uptime, every month</p></div>
  <div class="stat"><p class="stat-value">4.9/5</p><p class="stat-label">average customer rating</p></div>
</section>

<section class="testimonial" id="customers">
  <div class="stars">${STAR_FILLED('star')}${STAR_FILLED('star')}${STAR_FILLED('star')}${STAR_FILLED('star')}${STAR_FILLED('star')}</div>
  <blockquote class="quote">“Nova replaced four tools for us. Our team ships twice as often and our planning meetings went from an hour to ten minutes.”</blockquote>
  <div class="person">
    <div class="avatar">SR</div>
    <div class="person-meta"><p class="person-name">Sofia Reyes</p><p class="person-role">VP Product, Northwind</p></div>
  </div>
</section>

<section class="pricing" id="pricing">
  <div class="section-head">
    <p class="eyebrow">Pricing</p>
    <h2 class="section-title">Simple pricing that scales with you</h2>
  </div>
  <div class="plans">
    <div class="plan">
      <p class="plan-name">Starter</p>
      <p class="plan-price">$0<span class="per"> / month</span></p>
      <p class="plan-desc">For individuals and side projects.</p>
      <a class="btn btn-outline" href="#">Get started</a>
      <ul class="plan-list">
        <li class="plan-item">${icon('check', 'check')}<span>Up to 3 projects</span></li>
        <li class="plan-item">${icon('check', 'check')}<span>Basic analytics</span></li>
        <li class="plan-item">${icon('check', 'check')}<span>Community support</span></li>
      </ul>
    </div>
    <div class="plan plan-featured">
      <div class="plan-top"><p class="plan-name">Pro</p><span class="plan-badge">Most popular</span></div>
      <p class="plan-price">$24<span class="per"> / seat / month</span></p>
      <p class="plan-desc">For growing teams that ship every week.</p>
      <a class="btn btn-primary" href="#">Start free trial</a>
      <ul class="plan-list">
        <li class="plan-item">${icon('check', 'check')}<span>Unlimited projects</span></li>
        <li class="plan-item">${icon('check', 'check')}<span>Autopilot &amp; insights</span></li>
        <li class="plan-item">${icon('check', 'check')}<span>Integrations &amp; API</span></li>
        <li class="plan-item">${icon('check', 'check')}<span>Priority support</span></li>
      </ul>
    </div>
    <div class="plan">
      <p class="plan-name">Enterprise</p>
      <p class="plan-price">Custom</p>
      <p class="plan-desc">For organisations with advanced needs.</p>
      <a class="btn btn-outline" href="#">Talk to sales</a>
      <ul class="plan-list">
        <li class="plan-item">${icon('check', 'check')}<span>SSO &amp; SCIM</span></li>
        <li class="plan-item">${icon('check', 'check')}<span>Audit logs</span></li>
        <li class="plan-item">${icon('check', 'check')}<span>Dedicated success manager</span></li>
      </ul>
    </div>
  </div>
</section>

<section class="cta">
  <h2 class="cta-title">Ready to build what’s next?</h2>
  <p class="cta-sub">Join thousands of teams shipping better products with Nova.</p>
  <div class="hero-ctas">
    <a class="btn btn-light" href="#">Start for free</a>
    <a class="btn btn-ghost" href="#">Contact sales</a>
  </div>
</section>

<footer class="footer">
  <div class="footer-top">
    <div class="footer-brand">
      <a class="brand" href="#"><div class="brand-mark"></div><span class="brand-name">Nova</span></a>
      <p class="footer-tag">The product workspace for teams that move fast.</p>
    </div>
    <div class="footer-cols">
      <div class="footer-col"><p class="footer-head">Product</p><a class="footer-link" href="#">Features</a><a class="footer-link" href="#">Pricing</a><a class="footer-link" href="#">Changelog</a></div>
      <div class="footer-col"><p class="footer-head">Company</p><a class="footer-link" href="#">About</a><a class="footer-link" href="#">Careers</a><a class="footer-link" href="#">Blog</a></div>
      <div class="footer-col"><p class="footer-head">Resources</p><a class="footer-link" href="#">Docs</a><a class="footer-link" href="#">Guides</a><a class="footer-link" href="#">Support</a></div>
    </div>
  </div>
  <div class="footer-bottom">
    <p class="copyright">© 2026 Nova Labs, Inc. All rights reserved.</p>
    <div class="socials">
      <a class="social" href="#">${icon('twitter', 'sicon')}</a>
      <a class="social" href="#">${icon('github', 'sicon')}</a>
      <a class="social" href="#">${icon('linkedin', 'sicon')}</a>
    </div>
  </div>
</footer>
`;

const css = `
body { background: var(--k-background); color: var(--k-text); }
a { text-decoration: none; }

.nav { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 22px 64px; position: relative; z-index: 2; }
.brand { display: flex; align-items: center; gap: 10px; color: var(--k-text); }
.brand-mark { width: 28px; height: 28px; border-radius: 9px; background: linear-gradient(135deg, var(--k-primary), var(--k-accent)); box-shadow: 0 6px 20px rgba(139, 123, 255, 0.45); }
.brand-name { font-family: var(--k-font-heading); font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
.nav-links { display: flex; gap: 32px; }
.nav-link { color: var(--k-muted); font-size: 15px; font-weight: 500; transition: color .2s ease; }
.nav-link:hover { color: var(--k-text); }
.nav-actions { display: flex; align-items: center; gap: 20px; }
.nav-login { color: var(--k-text); font-size: 15px; font-weight: 500; }

.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 48px; padding: 0 22px; border-radius: 12px; font-size: 15px; font-weight: 600; transition: transform .2s ease, box-shadow .2s ease, background-color .2s ease, border-color .2s ease; }
.btn-small { height: 40px; padding: 0 16px; border-radius: 10px; font-size: 14px; background: var(--k-text); color: var(--k-background); }
.btn-small:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(255, 255, 255, 0.18); }
.btn-primary { background: linear-gradient(135deg, var(--k-primary), #6a5cff); color: #fff; box-shadow: 0 10px 30px rgba(124, 108, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25); }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 16px 40px rgba(124, 108, 255, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.25); }
.btn-ghost { color: var(--k-text); background: rgba(255, 255, 255, 0.04); border: 1px solid var(--k-border); }
.btn-ghost:hover { background: rgba(255, 255, 255, 0.09); border-color: rgba(255, 255, 255, 0.2); }
.btn-outline { color: var(--k-text); border: 1px solid var(--k-border); width: 100%; }
.btn-outline:hover { border-color: var(--k-primary); background: rgba(139, 123, 255, 0.08); }
.btn-light { background: #fff; color: #0b0b18; }
.btn-light:hover { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(255, 255, 255, 0.25); }
.btn-icon { width: 18px; height: 18px; }

.hero { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 72px 64px 0; overflow: hidden; }
.glow { position: absolute; border-radius: 50%; filter: blur(90px); opacity: 0.55; }
.glow-a { width: 620px; height: 620px; left: 8%; top: -220px; background: radial-gradient(circle, rgba(139, 123, 255, 0.9), transparent 65%); animation: drift 14s ease-in-out infinite alternate; }
.glow-b { width: 560px; height: 560px; right: 6%; top: -120px; background: radial-gradient(circle, rgba(52, 224, 208, 0.6), transparent 65%); animation: drift 18s ease-in-out infinite alternate-reverse; }
.pill { position: relative; display: inline-flex; align-items: center; gap: 10px; height: 36px; padding: 0 14px 0 5px; border-radius: 999px; border: 1px solid var(--k-border); background: rgba(255, 255, 255, 0.04); color: var(--k-text); font-size: 14px; animation: rise 0.8s cubic-bezier(.2,.7,.2,1) backwards; transition: border-color .2s ease, background-color .2s ease; }
.pill:hover { border-color: rgba(139, 123, 255, 0.6); background: rgba(139, 123, 255, 0.1); }
.pill-tag { padding: 4px 10px; border-radius: 999px; background: linear-gradient(135deg, var(--k-primary), var(--k-accent)); color: #fff; font-size: 12px; font-weight: 700; }
.pill-text { color: var(--k-muted); }
.pill-icon { width: 15px; height: 15px; color: var(--k-muted); }
.hero-title { position: relative; max-width: 940px; margin-top: 28px; font-size: 76px; line-height: 1.02; letter-spacing: -0.045em; font-weight: 700; animation: rise 0.9s cubic-bezier(.2,.7,.2,1) 0.08s backwards; }
.grad { background: linear-gradient(100deg, #c4b8ff 0%, var(--k-primary) 40%, var(--k-accent) 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hero-sub { position: relative; max-width: 640px; margin-top: 24px; color: var(--k-muted); font-size: 19px; line-height: 1.6; animation: rise 0.9s cubic-bezier(.2,.7,.2,1) 0.16s backwards; }
.hero-ctas { position: relative; display: flex; gap: 12px; margin-top: 36px; animation: rise 0.9s cubic-bezier(.2,.7,.2,1) 0.24s backwards; }
.hero-note { position: relative; margin-top: 16px; color: var(--k-muted); font-size: 13px; opacity: 0.8; }

.mockup { position: relative; width: 100%; max-width: 1080px; margin-top: 64px; border-radius: 18px 18px 0 0; border: 1px solid var(--k-border); border-bottom: none; background: linear-gradient(180deg, rgba(23, 23, 38, 0.95), rgba(13, 13, 22, 0.95)); box-shadow: 0 -20px 80px rgba(124, 108, 255, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.03) inset; overflow: hidden; animation: lift 1.1s cubic-bezier(.2,.7,.2,1) 0.32s backwards; }
.mock-bar { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px; border-bottom: 1px solid var(--k-border); }
.dot { width: 11px; height: 11px; border-radius: 50%; }
.dot-r { background: #ff5f57; }
.dot-y { background: #febc2e; }
.dot-g { background: #28c840; }
.mock-url { margin-left: 16px; padding: 5px 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.05); color: var(--k-muted); font-size: 12px; }
.mock-body { display: flex; height: 360px; }
.mock-side { display: flex; flex-direction: column; gap: 12px; width: 200px; padding: 20px 16px; border-right: 1px solid var(--k-border); }
.mock-logo { width: 90px; height: 14px; border-radius: 6px; background: rgba(255, 255, 255, 0.14); margin-bottom: 12px; }
.mock-item { height: 30px; border-radius: 8px; background: rgba(255, 255, 255, 0.04); }
.mock-item-active { background: rgba(139, 123, 255, 0.22); border: 1px solid rgba(139, 123, 255, 0.35); }
.mock-item-short { width: 70%; }
.mock-main { display: flex; flex-direction: column; gap: 18px; flex: 1; padding: 22px; }
.mock-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.kpi { display: flex; flex-direction: column; gap: 4px; padding: 16px; border-radius: 12px; border: 1px solid var(--k-border); background: rgba(255, 255, 255, 0.025); text-align: left; }
.kpi-label { color: var(--k-muted); font-size: 12px; }
.kpi-value { font-family: var(--k-font-heading); font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
.kpi-delta { color: var(--k-accent); font-size: 12px; font-weight: 600; }
.mock-chart { display: flex; align-items: flex-end; gap: 10px; flex: 1; padding: 18px; border-radius: 12px; border: 1px solid var(--k-border); background: linear-gradient(180deg, rgba(139, 123, 255, 0.06), transparent); }
.bar { flex: 1; border-radius: 6px 6px 3px 3px; background: linear-gradient(180deg, rgba(139, 123, 255, 0.75), rgba(139, 123, 255, 0.15)); }
.bar-hi { background: linear-gradient(180deg, var(--k-accent), rgba(52, 224, 208, 0.2)); box-shadow: 0 0 24px rgba(52, 224, 208, 0.45); }

.logos { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 56px 64px; border-top: 1px solid var(--k-border); }
.logos-title { color: var(--k-muted); font-size: 14px; }
.logos-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 64px; }
.logo { font-family: var(--k-font-heading); font-size: 24px; font-weight: 700; letter-spacing: -0.03em; color: var(--k-text); opacity: 0.45; transition: opacity .2s ease; }
.logo:hover { opacity: 0.9; }

.section-head { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; max-width: 720px; margin: 0 auto 56px; }
.eyebrow { color: var(--k-accent); font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
.section-title { font-size: 48px; line-height: 1.1; letter-spacing: -0.035em; }
.section-sub { color: var(--k-muted); font-size: 18px; line-height: 1.6; }

.features { padding: 112px 64px; }
.feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 1120px; margin: 0 auto; }
.feature { display: flex; flex-direction: column; gap: 12px; padding: 28px; border-radius: 18px; border: 1px solid var(--k-border); background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.01)); transition: transform .3s cubic-bezier(.2,.7,.2,1), border-color .3s ease, box-shadow .3s ease; }
.feature:hover { transform: translateY(-4px); border-color: rgba(139, 123, 255, 0.45); box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(139, 123, 255, 0.12); }
.feature-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; margin-bottom: 8px; border-radius: 12px; background: linear-gradient(135deg, rgba(139, 123, 255, 0.25), rgba(52, 224, 208, 0.15)); border: 1px solid rgba(139, 123, 255, 0.3); color: #d6ceff; }
.ficon { width: 22px; height: 22px; }
.feature-title { font-size: 20px; letter-spacing: -0.02em; }
.feature-text { color: var(--k-muted); font-size: 15px; line-height: 1.6; }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; max-width: 1120px; width: calc(100% - 128px); margin: 0 auto; padding: 44px 48px; border-radius: 24px; border: 1px solid var(--k-border); background: radial-gradient(120% 140% at 0% 0%, rgba(139, 123, 255, 0.16), transparent 50%), radial-gradient(120% 140% at 100% 100%, rgba(52, 224, 208, 0.12), transparent 50%), var(--k-surface); }
.stat { display: flex; flex-direction: column; gap: 6px; text-align: center; }
.stat-value { font-family: var(--k-font-heading); font-size: 44px; font-weight: 700; letter-spacing: -0.04em; }
.stat-label { color: var(--k-muted); font-size: 15px; }

.testimonial { display: flex; flex-direction: column; align-items: center; gap: 28px; max-width: 880px; margin: 0 auto; padding: 120px 64px; text-align: center; }
.stars { display: flex; gap: 4px; color: #fbbf24; }
.star { width: 20px; height: 20px; }
.quote { font-family: var(--k-font-heading); font-size: 34px; line-height: 1.35; letter-spacing: -0.025em; font-weight: 500; }
.person { display: flex; align-items: center; gap: 14px; }
.avatar { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, #f0abfc, var(--k-primary)); color: #fff; font-weight: 700; }
.person-meta { display: flex; flex-direction: column; text-align: left; }
.person-name { font-weight: 600; }
.person-role { color: var(--k-muted); font-size: 14px; }

.pricing { padding: 40px 64px 120px; }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: stretch; max-width: 1120px; margin: 0 auto; }
.plan { display: flex; flex-direction: column; gap: 14px; padding: 32px; border-radius: 22px; border: 1px solid var(--k-border); background: var(--k-surface); transition: transform .3s cubic-bezier(.2,.7,.2,1), box-shadow .3s ease; }
.plan:hover { transform: translateY(-4px); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4); }
.plan-featured { border-color: rgba(139, 123, 255, 0.6); background: linear-gradient(180deg, rgba(139, 123, 255, 0.16), rgba(139, 123, 255, 0.02) 60%), var(--k-surface); box-shadow: 0 30px 80px rgba(124, 108, 255, 0.25); }
.plan-top { display: flex; align-items: center; justify-content: space-between; }
.plan-name { font-family: var(--k-font-heading); font-size: 18px; font-weight: 600; }
.plan-badge { padding: 4px 10px; border-radius: 999px; background: rgba(139, 123, 255, 0.2); color: #d6ceff; font-size: 12px; font-weight: 700; }
.plan-price { font-family: var(--k-font-heading); font-size: 48px; font-weight: 700; letter-spacing: -0.04em; line-height: 1.1; }
.per { color: var(--k-muted); font-family: var(--k-font-body); font-size: 15px; font-weight: 500; letter-spacing: 0; }
.plan-desc { color: var(--k-muted); font-size: 15px; margin-bottom: 8px; }
.plan-list { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; padding: 0; list-style: none; }
.plan-item { display: flex; align-items: center; gap: 10px; font-size: 15px; color: var(--k-text); }
.check { width: 18px; height: 18px; color: var(--k-accent); }

.cta { display: flex; flex-direction: column; align-items: center; gap: 16px; margin: 0 64px 96px; padding: 80px 48px; border-radius: 28px; text-align: center; background: radial-gradient(80% 120% at 50% 0%, rgba(255, 255, 255, 0.18), transparent 60%), linear-gradient(135deg, #6f5cff 0%, #8b7bff 45%, #2bc8c0 100%); box-shadow: 0 40px 100px rgba(124, 108, 255, 0.35); }
.cta-title { color: #fff; font-size: 52px; letter-spacing: -0.04em; }
.cta-sub { color: rgba(255, 255, 255, 0.85); font-size: 18px; }

.footer { display: flex; flex-direction: column; gap: 48px; padding: 64px 64px 40px; border-top: 1px solid var(--k-border); }
.footer-top { display: flex; justify-content: space-between; gap: 48px; }
.footer-brand { display: flex; flex-direction: column; gap: 14px; max-width: 300px; }
.footer-tag { color: var(--k-muted); font-size: 15px; }
.footer-cols { display: flex; gap: 96px; }
.footer-col { display: flex; flex-direction: column; gap: 12px; }
.footer-head { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.footer-link { color: var(--k-muted); font-size: 14px; transition: color .2s ease; }
.footer-link:hover { color: var(--k-text); }
.footer-bottom { display: flex; align-items: center; justify-content: space-between; padding-top: 28px; border-top: 1px solid var(--k-border); }
.copyright { color: var(--k-muted); font-size: 13px; }
.socials { display: flex; gap: 10px; }
.social { display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 10px; border: 1px solid var(--k-border); color: var(--k-muted); transition: color .2s ease, border-color .2s ease; }
.social:hover { color: var(--k-text); border-color: rgba(255, 255, 255, 0.25); }
.sicon { width: 17px; height: 17px; }

@keyframes rise { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
@keyframes lift { from { opacity: 0; transform: translateY(60px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes drift { from { transform: translate(0px, 0px) scale(1); } to { transform: translate(60px, 40px) scale(1.15); } }

@media (max-width: 1024px) {
  .nav { padding: 20px 32px; }
  .nav-links { display: none; }
  .hero { padding: 56px 32px 0; }
  .hero-title { font-size: 56px; }
  .mock-side { display: none; }
  .features { padding: 88px 32px; }
  .feature-grid { grid-template-columns: repeat(2, 1fr); }
  .stats { grid-template-columns: repeat(2, 1fr); width: calc(100% - 64px); row-gap: 32px; }
  .pricing { padding: 32px 32px 96px; }
  .plans { grid-template-columns: 1fr; max-width: 520px; }
  .cta { margin: 0 32px 80px; padding: 64px 32px; }
  .cta-title { font-size: 40px; }
  .footer { padding: 56px 32px 32px; }
  .footer-top { flex-direction: column; }
  .footer-cols { gap: 56px; }
}
@media (max-width: 640px) {
  .nav { padding: 16px 20px; }
  .nav-login { display: none; }
  .hero { padding: 40px 20px 0; }
  .hero-title { font-size: 40px; letter-spacing: -0.035em; }
  .hero-sub { font-size: 16px; }
  .hero-ctas { flex-direction: column; width: 100%; }
  .mockup { margin-top: 44px; }
  .mock-body { height: 280px; }
  .mock-kpis { grid-template-columns: 1fr 1fr; }
  .logos { padding: 40px 20px; }
  .logos-row { gap: 28px; }
  .logo { font-size: 19px; }
  .features { padding: 72px 20px; }
  .section-title { font-size: 34px; }
  .feature-grid { grid-template-columns: 1fr; }
  .stats { width: calc(100% - 40px); padding: 32px 20px; }
  .stat-value { font-size: 34px; }
  .testimonial { padding: 80px 20px; }
  .quote { font-size: 24px; }
  .pricing { padding: 24px 20px 72px; }
  .cta { margin: 0 20px 64px; padding: 48px 20px; border-radius: 22px; }
  .cta-title { font-size: 32px; }
  .footer { padding: 48px 20px 28px; }
  .footer-cols { flex-direction: column; gap: 28px; }
  .footer-bottom { flex-direction: column; gap: 16px; }
}
`;

export const landingTemplate: TemplateDef = {
  id: 'landing',
  name: 'Landing page',
  description: 'Product launch page with hero, features & pricing',
  pageName: 'Home',
  swatch: '#8b7bff',
  tokens: {
    colors: [
      { name: 'primary', value: '#8b7bff' },
      { name: 'accent', value: '#34e0d0' },
      { name: 'text', value: '#f4f4fb' },
      { name: 'muted', value: '#9c9eb8' },
      { name: 'surface', value: '#10101b' },
      { name: 'background', value: '#07070d' },
      { name: 'border', value: '#202034' },
    ],
    fonts: { heading: 'Space Grotesk Variable', body: 'Inter Variable' },
    radius: 12,
  },
  html,
  css,
};
