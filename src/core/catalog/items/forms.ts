import type { CatalogItem } from '../types';
import { icon } from '../icons';
import { BORDER, BORDER_STRONG, EASE, HAIRLINE, R_LG, R_SM, R_XL, SELECT_CHEVRON, SHADOW_LG, SHADOW_MD, buttonCss, inputCss, soft, tint } from '../snippets';

const FIELD_CSS = (p: string) => `.${p}-field { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.${p}-label { font-size: 13.5px; font-weight: 600; color: var(--k-text); }
${inputCss(`.${p}-input`)}`;

const AUTH_CARD = (sel: string) =>
  `${sel} { display: flex; flex-direction: column; gap: 18px; width: 100%; max-width: 400px; padding: 36px; border-radius: ${R_XL}; background-color: var(--k-surface); border: ${HAIRLINE}; box-shadow: ${SHADOW_LG}; }`;

export const FORMS: CatalogItem[] = [
  {
    id: 'form-login',
    name: 'Login form',
    category: 'forms',
    keywords: ['login', 'sign in', 'auth', 'password', 'form', 'account'],
    width: 400,
    html: `<form class="auth" data-name="Login form">
<div class="auth-head"><div class="auth-mark"></div><h2 class="auth-title">Welcome back</h2><p class="auth-sub">Sign in to continue to your workspace.</p></div>
<button class="auth-sso" type="button">${icon('lock', 'auth-sso-icon')} Continue with SSO</button>
<div class="auth-divider"><div class="auth-line"></div><span class="auth-or">or</span><div class="auth-line"></div></div>
<label class="auth-field"><span class="auth-label">Email</span><input class="auth-input" type="email" placeholder="you@company.com"></label>
<label class="auth-field"><div class="auth-label-row"><span class="auth-label">Password</span><a class="auth-forgot" href="#">Forgot password?</a></div><input class="auth-input" type="password" placeholder="••••••••"></label>
<label class="auth-check"><input class="auth-checkbox" type="checkbox" checked><span class="auth-check-text">Keep me signed in</span></label>
<button class="auth-submit" type="submit">Sign in</button>
<p class="auth-foot">Don’t have an account? <a href="#" style="color: var(--k-primary); font-weight: 600; text-decoration: none;">Create one</a></p>
</form>`,
    css: `${AUTH_CARD('.auth')}
.auth-head { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-bottom: 4px; text-align: center; }
.auth-mark { width: 40px; height: 40px; margin-bottom: 10px; border-radius: 12px; background-image: linear-gradient(135deg, var(--k-primary), var(--k-accent)); box-shadow: 0 8px 20px -6px ${tint(60)}, inset 0 1px 0 rgba(255, 255, 255, 0.3); }
.auth-title { font-size: 24px; letter-spacing: -0.025em; }
.auth-sub { font-size: 14.5px; color: var(--k-muted); }
${buttonCss('.auth-sso', 'secondary')}
.auth-sso { width: 100%; }
.auth-sso-icon { width: 16px; height: 16px; }
.auth-divider { display: flex; align-items: center; gap: 12px; }
.auth-line { flex: 1; height: 1px; background-color: ${BORDER}; }
.auth-or { font-size: 12.5px; font-weight: 500; color: var(--k-muted); text-transform: uppercase; letter-spacing: 0.06em; }
${FIELD_CSS('auth')}
.auth-label-row { display: flex; align-items: center; justify-content: space-between; }
.auth-forgot { color: var(--k-primary); font-size: 13px; font-weight: 600; text-decoration: none; }
.auth-check { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--k-text); }
.auth-checkbox { width: 16px; height: 16px; margin: 0; accent-color: var(--k-primary); }
${buttonCss('.auth-submit', 'primary')}
.auth-submit { width: 100%; height: 44px; }
.auth-foot { font-size: 14px; color: var(--k-muted); text-align: center; }
@media (max-width: 640px) { .auth { padding: 28px 22px; } }`,
  },
  {
    id: 'form-signup',
    name: 'Sign-up form',
    category: 'forms',
    keywords: ['sign up', 'register', 'create account', 'onboarding', 'form', 'password strength'],
    width: 420,
    html: `<form class="reg" data-name="Sign-up form">
<div class="reg-head"><h2 class="reg-title">Create your account</h2><p class="reg-sub">Start your 14-day free trial. No credit card required.</p></div>
<div class="reg-row"><label class="reg-field"><span class="reg-label">First name</span><input class="reg-input" type="text" placeholder="Ada"></label><label class="reg-field"><span class="reg-label">Last name</span><input class="reg-input" type="text" placeholder="Lovelace"></label></div>
<label class="reg-field"><span class="reg-label">Work email</span><input class="reg-input" type="email" placeholder="ada@company.com"></label>
<label class="reg-field"><span class="reg-label">Password</span><input class="reg-input" type="password" placeholder="At least 8 characters">
<div class="reg-meter"><div class="reg-seg reg-seg--on"></div><div class="reg-seg reg-seg--on"></div><div class="reg-seg reg-seg--on"></div><div class="reg-seg"></div></div><span class="reg-hint">Strong password</span></label>
<label class="reg-check"><input class="reg-checkbox" type="checkbox"><span class="reg-check-text">I agree to the <a href="#" style="color: var(--k-text); font-weight: 600;">Terms</a> and <a href="#" style="color: var(--k-text); font-weight: 600;">Privacy Policy</a></span></label>
<button class="reg-submit" type="submit">Create account</button>
<p class="reg-foot">Already have an account? <a href="#" style="color: var(--k-primary); font-weight: 600; text-decoration: none;">Sign in</a></p>
</form>`,
    css: `${AUTH_CARD('.reg')}
.reg { max-width: 420px; }
.reg-head { display: flex; flex-direction: column; gap: 6px; }
.reg-title { font-size: 24px; letter-spacing: -0.025em; }
.reg-sub { font-size: 14.5px; color: var(--k-muted); }
.reg-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
${FIELD_CSS('reg')}
.reg-meter { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 4px; }
.reg-seg { height: 4px; border-radius: 999px; background-color: color-mix(in srgb, var(--k-text) 10%, transparent); }
.reg-seg--on { background-color: #12a150; }
.reg-hint { font-size: 12.5px; font-weight: 500; color: #12a150; }
.reg-check { display: flex; align-items: flex-start; gap: 10px; font-size: 13.5px; color: var(--k-muted); }
.reg-checkbox { width: 16px; height: 16px; margin: 2px 0 0; flex: none; accent-color: var(--k-primary); }
${buttonCss('.reg-submit', 'primary')}
.reg-submit { width: 100%; height: 44px; }
.reg-foot { font-size: 14px; color: var(--k-muted); text-align: center; }
@media (max-width: 640px) { .reg { padding: 28px 22px; } .reg-row { grid-template-columns: 1fr; } }`,
  },
  {
    id: 'form-newsletter',
    name: 'Newsletter signup',
    category: 'forms',
    keywords: ['newsletter', 'subscribe', 'email', 'mailing list', 'signup', 'updates'],
    width: 560,
    html: `<div class="news" data-name="Newsletter"><div class="news-icon">${icon('mail', 'news-glyph')}</div><div class="news-copy"><h3 class="news-title">Get the motion design digest</h3><p class="news-text">One email a month with hand-picked tutorials, tools and inspiration.</p></div>
<form class="news-form"><input class="news-input" type="email" placeholder="Enter your email"><button class="news-button" type="submit">Subscribe</button></form>
<p class="news-note">${icon('shield-check', 'news-note-icon')} Join 18,000+ designers. Unsubscribe anytime.</p></div>`,
    css: `.news { display: flex; flex-direction: column; gap: 18px; width: 100%; max-width: 560px; padding: 32px; border-radius: ${R_XL}; background-color: ${soft(4)}; border: 1px solid ${tint(16)}; }
.news-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: ${R_SM}; background-color: var(--k-surface); color: var(--k-primary); border: 1px solid ${tint(18)}; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.06); }
.news-glyph { width: 20px; height: 20px; }
.news-copy { display: flex; flex-direction: column; gap: 6px; }
.news-title { font-size: 22px; letter-spacing: -0.02em; }
.news-text { font-size: 15px; line-height: 1.55; color: var(--k-muted); }
.news-form { display: flex; gap: 10px; }
${inputCss('.news-input', 44)}
.news-input { flex: 1; }
${buttonCss('.news-button', 'primary')}
.news-button { height: 44px; }
.news-note { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--k-muted); }
.news-note-icon { width: 14px; height: 14px; }
@media (max-width: 640px) { .news { padding: 24px; } .news-form { flex-direction: column; } }`,
  },
  {
    id: 'form-contact',
    name: 'Contact form',
    category: 'forms',
    keywords: ['contact', 'message', 'support', 'inquiry', 'form', 'get in touch'],
    width: 560,
    html: `<form class="contact" data-name="Contact form">
<div class="contact-head"><h2 class="contact-title">Get in touch</h2><p class="contact-sub">We usually respond within one business day.</p></div>
<div class="contact-row"><label class="contact-field"><span class="contact-label">First name</span><input class="contact-input" type="text" placeholder="Jane"></label><label class="contact-field"><span class="contact-label">Last name</span><input class="contact-input" type="text" placeholder="Cooper"></label></div>
<label class="contact-field"><span class="contact-label">Work email</span><input class="contact-input" type="email" placeholder="jane@company.com"></label>
<label class="contact-field"><span class="contact-label">Topic</span><select class="contact-input contact-select"><option>General question</option><option>Sales &amp; pricing</option><option>Partnerships</option><option>Support</option></select></label>
<label class="contact-field"><span class="contact-label">Message</span><textarea class="contact-input contact-textarea" placeholder="Tell us a bit about your project…"></textarea></label>
<button class="contact-submit" type="submit">Send message ${icon('send', 'contact-submit-icon')}</button>
</form>`,
    css: `.contact { display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 560px; padding: 32px; border-radius: ${R_XL}; background-color: var(--k-surface); border: ${HAIRLINE}; box-shadow: ${SHADOW_MD}; }
.contact-head { display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }
.contact-title { font-size: 26px; letter-spacing: -0.025em; }
.contact-sub { font-size: 15px; color: var(--k-muted); }
.contact-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
${FIELD_CSS('contact')}
.contact-select { appearance: none; padding-right: 36px; background-image: ${SELECT_CHEVRON}; background-repeat: no-repeat; background-position: right 12px center; background-size: 16px 16px; }
.contact-textarea { height: 120px; padding: 10px 12px; line-height: 1.5; resize: none; }
${buttonCss('.contact-submit', 'primary')}
.contact-submit { align-self: flex-start; height: 44px; }
.contact-submit-icon { width: 15px; height: 15px; }
@media (max-width: 640px) { .contact { padding: 24px 20px; } .contact-row { grid-template-columns: 1fr; } .contact-submit { align-self: stretch; } }`,
  },
  {
    id: 'search-bar',
    name: 'Search bar',
    category: 'forms',
    keywords: ['search', 'find', 'query', 'command', 'filter', 'input'],
    width: 480,
    html: `<div class="search" data-name="Search bar">${icon('search', 'search-icon')}<input class="search-input" type="search" placeholder="Search components, pages, assets…"><span class="search-kbd">⌘K</span></div>`,
    css: `.search { display: flex; align-items: center; gap: 10px; width: 100%; max-width: 480px; height: 48px; padding: 0 10px 0 16px; border-radius: ${R_LG}; background-color: var(--k-surface); border: 1px solid ${BORDER_STRONG}; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05), 0 8px 24px -12px rgba(16, 24, 40, 0.12); transition: border-color 0.16s ${EASE}, box-shadow 0.16s ${EASE}; }
.search:focus-within { border-color: var(--k-primary); box-shadow: 0 0 0 4px ${tint(16)}; }
.search-icon { width: 18px; height: 18px; flex: none; color: var(--k-muted); }
.search-input { flex: 1; min-width: 0; height: 100%; border: none; outline: none; background-color: transparent; color: var(--k-text); font-size: 15px; }
.search-kbd { padding: 3px 8px; border-radius: 6px; border: 1px solid ${BORDER}; background-color: color-mix(in srgb, var(--k-text) 4%, var(--k-surface)); color: var(--k-muted); font-size: 12px; font-weight: 600; }`,
  },
];
