import type { TemplateDef } from './types';
import { icon, GOOGLE_G, STAR_FILLED } from './icons';

const html = `
<div class="auth">
  <section class="art">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
    <div class="art-top"><div class="brand"><div class="brand-mark"></div><span class="brand-name">Halo</span></div></div>
    <div class="art-content">
      <h2 class="art-title">The calm workspace for ambitious teams.</h2>
      <p class="art-text">Plan, write and ship together — with everything in one beautifully simple place.</p>
      <div class="quote-card">
        <div class="stars">${STAR_FILLED('star')}${STAR_FILLED('star')}${STAR_FILLED('star')}${STAR_FILLED('star')}${STAR_FILLED('star')}</div>
        <p class="quote">“Halo is the first tool our whole company actually enjoys opening every morning.”</p>
        <div class="person"><div class="avatar">LN</div><div class="person-meta"><p class="person-name">Lena Novak</p><p class="person-role">COO at Brightwave</p></div></div>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="form-wrap">
      <div class="form-head">
        <div class="mobile-brand"><div class="brand-mark"></div><span class="brand-name-dark">Halo</span></div>
        <h1 class="form-title">Welcome back</h1>
        <p class="form-sub">Sign in to continue to your workspace.</p>
      </div>
      <div class="socials">
        <button class="social">${GOOGLE_G('social-icon')}<span>Google</span></button>
        <button class="social">${icon('github', 'social-icon')}<span>GitHub</span></button>
      </div>
      <div class="divider"><div class="line"></div><span class="or">or continue with email</span><div class="line"></div></div>
      <form class="form">
        <div class="field">
          <label class="label" for="email">Email address</label>
          <div class="input-wrap">${icon('mail', 'input-icon')}<input class="input" id="email" type="email" placeholder="name@company.com"></div>
        </div>
        <div class="field">
          <div class="field-row"><label class="label" for="password">Password</label><a class="forgot" href="#">Forgot password?</a></div>
          <div class="input-wrap">${icon('lock', 'input-icon')}<input class="input" id="password" type="password" placeholder="Enter your password"></div>
        </div>
        <label class="remember"><input class="checkbox" type="checkbox" checked><span>Keep me signed in for 30 days</span></label>
        <button class="submit">Sign in${icon('arrowRight', 'submit-icon')}</button>
      </form>
      <p class="switch">Don’t have an account? <a class="switch-link" href="#">Create one for free</a></p>
    </div>
    <p class="legal">© 2026 Halo Inc. · Privacy · Terms</p>
  </section>
</div>
`;

const css = `
body { background: var(--k-background); color: var(--k-text); }
a { text-decoration: none; }

.auth { display: grid; grid-template-columns: 1.05fr 1fr; flex: 1; min-height: 900px; }

.art { position: relative; display: flex; flex-direction: column; justify-content: space-between; margin: 16px; padding: 40px; border-radius: 28px; overflow: hidden; background: radial-gradient(90% 70% at 15% 10%, #8f8cff 0%, transparent 60%), radial-gradient(70% 60% at 90% 30%, #4fd1c5 0%, transparent 55%), radial-gradient(80% 70% at 60% 100%, #f0abfc 0%, transparent 60%), linear-gradient(160deg, #4338ca, #312e81); color: #fff; }
.orb { position: absolute; border-radius: 50%; }
.orb-1 { width: 320px; height: 320px; right: -60px; top: 120px; background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.04) 70%); border: 1px solid rgba(255, 255, 255, 0.35); animation: float 9s ease-in-out infinite alternate; }
.orb-2 { width: 140px; height: 140px; left: 48%; top: 60px; background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.05) 70%); border: 1px solid rgba(255, 255, 255, 0.3); animation: float 7s ease-in-out 1s infinite alternate-reverse; }
.orb-3 { width: 70px; height: 70px; left: 14%; top: 300px; background: radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.08) 70%); border: 1px solid rgba(255, 255, 255, 0.3); animation: float 6s ease-in-out 0.5s infinite alternate; }
.art-top { position: relative; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand-mark { width: 30px; height: 30px; border-radius: 50%; background: conic-gradient(from 200deg, #fff, rgba(255, 255, 255, 0.3), #fff); box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.2); }
.brand-name { font-family: var(--k-font-heading); font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
.art-content { position: relative; display: flex; flex-direction: column; gap: 18px; max-width: 520px; animation: rise 1s cubic-bezier(.2,.7,.2,1) backwards; }
.art-title { font-size: 46px; line-height: 1.08; letter-spacing: -0.035em; }
.art-text { font-size: 18px; line-height: 1.6; color: rgba(255, 255, 255, 0.82); }
.quote-card { display: flex; flex-direction: column; gap: 14px; margin-top: 18px; padding: 24px; border-radius: 20px; background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.25); backdrop-filter: blur(16px); box-shadow: 0 20px 50px rgba(20, 10, 80, 0.25); }
.stars { display: flex; gap: 3px; color: #fde68a; }
.star { width: 17px; height: 17px; }
.quote { font-size: 17px; line-height: 1.55; }
.person { display: flex; align-items: center; gap: 12px; }
.avatar { display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, #fdba74, #f472b6); font-size: 14px; font-weight: 700; }
.person-meta { display: flex; flex-direction: column; }
.person-name { font-weight: 700; font-size: 15px; }
.person-role { font-size: 13px; color: rgba(255, 255, 255, 0.75); }

.panel { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px; position: relative; }
.form-wrap { display: flex; flex-direction: column; gap: 26px; width: 100%; max-width: 420px; animation: rise .9s cubic-bezier(.2,.7,.2,1) .1s backwards; }
.form-head { display: flex; flex-direction: column; gap: 8px; }
.mobile-brand { display: none; align-items: center; gap: 10px; margin-bottom: 18px; }
.brand-name-dark { font-family: var(--k-font-heading); font-size: 20px; font-weight: 700; }
.form-title { font-size: 38px; letter-spacing: -0.035em; }
.form-sub { color: var(--k-muted); font-size: 16px; }
.socials { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.social { display: flex; align-items: center; justify-content: center; gap: 10px; height: 48px; border-radius: 12px; border: 1px solid var(--k-border); background: var(--k-surface); color: var(--k-text); font-size: 15px; font-weight: 600; transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease; }
.social:hover { border-color: #c9cbe0; box-shadow: 0 6px 18px rgba(15, 18, 34, 0.08); transform: translateY(-1px); }
.social-icon { width: 19px; height: 19px; }
.divider { display: flex; align-items: center; gap: 14px; }
.line { flex: 1; height: 1px; background: var(--k-border); }
.or { color: var(--k-muted); font-size: 13px; }
.form { display: flex; flex-direction: column; gap: 18px; }
.field { display: flex; flex-direction: column; gap: 8px; }
.field-row { display: flex; align-items: center; justify-content: space-between; }
.label { font-size: 14px; font-weight: 600; }
.forgot { color: var(--k-primary); font-size: 14px; font-weight: 600; }
.forgot:hover { color: #3f3fd0; }
.input-wrap { display: flex; align-items: center; gap: 10px; height: 50px; padding: 0 16px; border-radius: 12px; border: 1px solid var(--k-border); background: var(--k-surface); transition: border-color .2s ease, box-shadow .2s ease; }
.input-wrap:hover { border-color: #c9cbe0; }
.input-icon { width: 18px; height: 18px; color: var(--k-muted); }
.input { flex: 1; min-width: 0; height: 100%; border: none; outline: none; background: transparent; font-size: 15px; color: var(--k-text); }
.remember { display: flex; align-items: center; gap: 10px; color: var(--k-muted); font-size: 14px; }
.checkbox { width: 18px; height: 18px; accent-color: var(--k-primary); }
.submit { display: flex; align-items: center; justify-content: center; gap: 8px; height: 52px; margin-top: 6px; border-radius: 12px; background: linear-gradient(180deg, #6d6dff, var(--k-primary)); color: #fff; font-size: 16px; font-weight: 700; box-shadow: 0 10px 24px rgba(91, 91, 246, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2); transition: transform .2s ease, box-shadow .2s ease; }
.submit:hover { transform: translateY(-2px); box-shadow: 0 16px 32px rgba(91, 91, 246, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.2); }
.submit-icon { width: 18px; height: 18px; }
.switch { text-align: center; color: var(--k-muted); font-size: 15px; }
.switch-link { color: var(--k-primary); font-weight: 700; }
.legal { position: absolute; bottom: 28px; color: var(--k-muted); font-size: 13px; }

@keyframes rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: translateY(0); } }
@keyframes float { from { transform: translate(0px, 0px); } to { transform: translate(-18px, 26px); } }

@media (max-width: 1024px) {
  .auth { grid-template-columns: 1fr; }
  .art { display: none; }
  .mobile-brand { display: flex; }
  .panel { padding: 64px 40px 96px; }
}
@media (max-width: 640px) {
  .panel { padding: 40px 20px 88px; justify-content: flex-start; }
  .form-title { font-size: 30px; }
  .socials { grid-template-columns: 1fr; }
}
`;

export const authTemplate: TemplateDef = {
  id: 'auth',
  name: 'Login / sign-up',
  description: 'Split-screen sign-in with social login',
  pageName: 'Sign in',
  swatch: '#5b5bf6',
  tokens: {
    colors: [
      { name: 'primary', value: '#5b5bf6' },
      { name: 'accent', value: '#22c3a6' },
      { name: 'text', value: '#0f1222' },
      { name: 'muted', value: '#646a85' },
      { name: 'surface', value: '#ffffff' },
      { name: 'background', value: '#f7f7fb' },
      { name: 'border', value: '#e3e5ef' },
    ],
    fonts: { heading: 'Sora Variable', body: 'Inter Variable' },
    radius: 12,
  },
  html,
  css,
};
