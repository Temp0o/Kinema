import type { TemplateDef } from './types';
import { icon } from './icons';

const units = [
  { n: '42', l: 'Days' },
  { n: '18', l: 'Hours' },
  { n: '36', l: 'Minutes' },
  { n: '09', l: 'Seconds' },
];

const html = `
<main class="soon">
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
  <div class="grid-lines"></div>

  <header class="top">
    <div class="brand"><div class="mark"></div><span class="brand-name">Lumen</span></div>
    <a class="top-link" href="mailto:hello@lumen.studio">hello@lumen.studio</a>
  </header>

  <section class="center">
    <div class="badge"><div class="pulse"></div><span class="badge-text">Launching spring 2027</span></div>
    <h1 class="title">Something <span class="grad">extraordinary</span> is on its way.</h1>
    <p class="lead">We’re crafting a new way to capture ideas, shape them together and bring them to life. Join the waitlist for early access and founding-member perks.</p>
    <div class="countdown">
      ${units.map((u) => `<div class="unit"><p class="num">${u.n}</p><p class="unit-label">${u.l}</p></div>`).join('\n      ')}
    </div>
    <form class="signup">
      <input class="email" type="email" placeholder="Enter your email address">
      <button class="join">Join the waitlist${icon('arrowRight', 'join-icon')}</button>
    </form>
    <p class="fine">Join 2,400+ creators on the list. No spam, ever.</p>
  </section>

  <footer class="bottom">
    <p class="copy">© 2026 Lumen Studio</p>
    <div class="socials">
      <a class="social" href="#">${icon('twitter', 'sicon')}</a>
      <a class="social" href="#">${icon('instagram', 'sicon')}</a>
      <a class="social" href="#">${icon('github', 'sicon')}</a>
    </div>
  </footer>
</main>
`;

const css = `
body { background: var(--k-background); color: var(--k-text); }
a { text-decoration: none; color: inherit; }

.soon { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 900px; overflow: hidden; background: radial-gradient(60% 50% at 50% 0%, rgba(167, 139, 250, 0.16), transparent 70%), var(--k-background); }
.orb { position: absolute; border-radius: 50%; filter: blur(70px); }
.orb-1 { width: 520px; height: 520px; left: -120px; top: 160px; background: radial-gradient(circle, rgba(167, 139, 250, 0.75), transparent 65%); animation: orbit 16s ease-in-out infinite alternate; }
.orb-2 { width: 460px; height: 460px; right: -100px; top: -80px; background: radial-gradient(circle, rgba(244, 114, 182, 0.6), transparent 65%); animation: orbit 20s ease-in-out infinite alternate-reverse; }
.orb-3 { width: 380px; height: 380px; right: 22%; bottom: -200px; background: radial-gradient(circle, rgba(56, 189, 248, 0.45), transparent 65%); animation: orbit 18s ease-in-out 2s infinite alternate; }
.grid-lines { position: absolute; inset: 0; opacity: 0.5; background-image: linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px); background-size: 64px 64px; }

.top { position: relative; display: flex; align-items: center; justify-content: space-between; padding: 32px 56px; }
.brand { display: flex; align-items: center; gap: 12px; }
.mark { width: 30px; height: 30px; border-radius: 10px; background: conic-gradient(from 140deg, var(--k-primary), var(--k-accent), #38bdf8, var(--k-primary)); box-shadow: 0 0 30px rgba(167, 139, 250, 0.6); animation: spin 12s linear infinite; }
.brand-name { font-family: var(--k-font-heading); font-size: 21px; font-weight: 600; letter-spacing: -0.02em; }
.top-link { color: var(--k-muted); font-size: 15px; transition: color .2s ease; }
.top-link:hover { color: var(--k-text); }

.center { position: relative; display: flex; flex-direction: column; align-items: center; gap: 28px; flex: 1; justify-content: center; padding: 40px 32px 64px; text-align: center; }
.badge { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); animation: rise .9s cubic-bezier(.2,.7,.2,1) backwards; }
.pulse { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 12px #4ade80; animation: blink 1.8s ease-in-out infinite; }
.badge-text { color: var(--k-muted); font-size: 14px; font-weight: 500; }
.title { max-width: 920px; font-size: 80px; line-height: 1.02; letter-spacing: -0.045em; font-weight: 600; animation: rise 1s cubic-bezier(.2,.7,.2,1) .1s backwards; }
.grad { background: linear-gradient(95deg, #c4b5fd 0%, var(--k-primary) 35%, var(--k-accent) 75%, #fbcfe8 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lead { max-width: 600px; color: var(--k-muted); font-size: 19px; line-height: 1.6; animation: rise 1s cubic-bezier(.2,.7,.2,1) .2s backwards; }
.countdown { display: grid; grid-template-columns: repeat(4, 120px); gap: 16px; margin-top: 8px; animation: rise 1s cubic-bezier(.2,.7,.2,1) .3s backwards; }
.unit { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 20px 0 16px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1); background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02)); backdrop-filter: blur(12px); transition: transform .3s cubic-bezier(.2,.7,.2,1), border-color .3s ease; }
.unit:hover { transform: translateY(-4px); border-color: rgba(167, 139, 250, 0.5); }
.num { font-family: var(--k-font-heading); font-size: 48px; font-weight: 600; letter-spacing: -0.04em; line-height: 1.1; }
.unit-label { color: var(--k-muted); font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; }
.signup { display: flex; gap: 10px; width: 100%; max-width: 520px; margin-top: 12px; padding: 6px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(12px); animation: rise 1s cubic-bezier(.2,.7,.2,1) .4s backwards; }
.email { flex: 1; min-width: 0; height: 48px; padding: 0 16px; border: none; outline: none; border-radius: 12px; background: transparent; color: var(--k-text); font-size: 15px; }
.join { display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 20px; border-radius: 12px; background: linear-gradient(135deg, var(--k-primary), #8b5cf6 50%, var(--k-accent)); color: #fff; font-size: 15px; font-weight: 600; box-shadow: 0 10px 30px rgba(167, 139, 250, 0.4); transition: transform .2s ease, box-shadow .2s ease; }
.join:hover { transform: translateY(-1px); box-shadow: 0 16px 40px rgba(167, 139, 250, 0.55); }
.join-icon { width: 18px; height: 18px; }
.fine { color: var(--k-muted); font-size: 13px; opacity: 0.8; }

.bottom { position: relative; display: flex; align-items: center; justify-content: space-between; padding: 28px 56px; }
.copy { color: var(--k-muted); font-size: 14px; }
.socials { display: flex; gap: 8px; }
.social { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); color: var(--k-muted); transition: color .2s ease, background-color .2s ease; }
.social:hover { color: var(--k-text); background: rgba(255, 255, 255, 0.08); }
.sicon { width: 18px; height: 18px; }

@keyframes rise { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: translateY(0); } }
@keyframes orbit { from { transform: translate(0px, 0px) scale(1); } to { transform: translate(80px, -50px) scale(1.2); } }
@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.35; } 100% { opacity: 1; } }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

@media (max-width: 1024px) {
  .top { padding: 28px 32px; }
  .title { font-size: 60px; }
  .bottom { padding: 24px 32px; }
}
@media (max-width: 640px) {
  .top { padding: 20px; }
  .top-link { display: none; }
  .center { padding: 32px 20px 48px; gap: 22px; }
  .title { font-size: 42px; }
  .lead { font-size: 16px; }
  .countdown { grid-template-columns: repeat(2, 1fr); width: 100%; gap: 10px; }
  .num { font-size: 38px; }
  .signup { flex-direction: column; }
  .join { justify-content: center; }
  .bottom { flex-direction: column; gap: 16px; padding: 24px 20px; }
}
`;

export const comingSoonTemplate: TemplateDef = {
  id: 'coming-soon',
  name: 'Coming soon',
  description: 'Launch teaser with countdown & waitlist',
  pageName: 'Coming soon',
  swatch: '#f472b6',
  tokens: {
    colors: [
      { name: 'primary', value: '#a78bfa' },
      { name: 'accent', value: '#f472b6' },
      { name: 'text', value: '#f6f5ff' },
      { name: 'muted', value: '#9d9bb8' },
      { name: 'surface', value: '#12121c' },
      { name: 'background', value: '#06060c' },
    ],
    fonts: { heading: 'Sora Variable', body: 'Inter Variable' },
    radius: 16,
  },
  html,
  css,
};
