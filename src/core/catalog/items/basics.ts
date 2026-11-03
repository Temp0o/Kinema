import type { CatalogItem } from '../types';
import { icon } from '../icons';
import {
  AVATAR_FILLS,
  BORDER_STRONG,
  EASE,
  HAIRLINE,
  PLACEHOLDER_IMAGE,
  R_LG,
  SELECT_CHEVRON,
  SHADOW_SM,
  buttonCss,
  inputCss,
  soft,
  tint,
} from '../snippets';

const FIELD = `.field { display: flex; flex-direction: column; gap: 6px; width: 320px; max-width: 100%; }
.field-label { font-size: 13.5px; font-weight: 600; color: var(--k-text); }
.field-hint { font-size: 12.5px; color: var(--k-muted); }`;

export const BASICS: CatalogItem[] = [
  {
    id: 'box',
    name: 'Box',
    category: 'basics',
    keywords: ['container', 'div', 'rectangle', 'shape', 'frame', 'panel'],
    html: `<div class="box" data-name="Box"></div>`,
    css: `.box { width: 240px; height: 160px; background-color: var(--k-surface); border: ${HAIRLINE}; border-radius: ${R_LG}; box-shadow: ${SHADOW_SM}; }`,
  },
  {
    id: 'text',
    name: 'Text',
    category: 'basics',
    keywords: ['label', 'span', 'copy', 'words', 'typography'],
    html: `<p class="text" data-name="Text">Add a line of text</p>`,
    css: `.text { font-size: 16px; line-height: 1.5; color: var(--k-text); }`,
  },
  {
    id: 'heading',
    name: 'Heading',
    category: 'basics',
    keywords: ['title', 'h1', 'h2', 'headline', 'typography', 'display'],
    html: `<h2 class="heading" data-name="Heading">Build something people love</h2>`,
    css: `.heading { max-width: 640px; font-size: 44px; line-height: 1.08; letter-spacing: -0.03em; font-weight: 700; color: var(--k-text); }
@media (max-width: 1024px) { .heading { font-size: 38px; } }
@media (max-width: 640px) { .heading { font-size: 30px; } }`,
  },
  {
    id: 'paragraph',
    name: 'Paragraph',
    category: 'basics',
    keywords: ['body', 'copy', 'text', 'p', 'lead', 'description'],
    html: `<p class="paragraph" data-name="Paragraph">Kinema turns ideas into polished, animated interfaces. Design visually, refine with real CSS and ship production-ready code without the hand-off.</p>`,
    css: `.paragraph { max-width: 560px; font-size: 17px; line-height: 1.65; color: var(--k-muted); }
@media (max-width: 640px) { .paragraph { font-size: 16px; } }`,
  },
  {
    id: 'button-primary',
    name: 'Primary button',
    category: 'basics',
    keywords: ['button', 'cta', 'action', 'submit', 'primary'],
    html: `<button class="button" data-name="Primary button">Get started ${icon('arrow-right', 'button-icon')}</button>`,
    css: `${buttonCss('.button', 'primary')}
.button-icon { width: 16px; height: 16px; flex: none; }`,
  },
  {
    id: 'button-secondary',
    name: 'Secondary button',
    category: 'basics',
    keywords: ['button', 'outline', 'secondary', 'action', 'bordered'],
    html: `<button class="button" data-name="Secondary button">${icon('play', 'button-icon')} Watch demo</button>`,
    css: `${buttonCss('.button', 'secondary')}
.button-icon { width: 15px; height: 15px; flex: none; color: var(--k-muted); }`,
  },
  {
    id: 'button-ghost',
    name: 'Ghost button',
    category: 'basics',
    keywords: ['button', 'ghost', 'text button', 'tertiary', 'subtle'],
    html: `<button class="button" data-name="Ghost button">Cancel</button>`,
    css: buttonCss('.button', 'ghost'),
  },
  {
    id: 'link',
    name: 'Link',
    category: 'basics',
    keywords: ['anchor', 'href', 'url', 'text link', 'arrow'],
    html: `<a class="link" href="#" data-name="Link">Learn more ${icon('arrow-right', 'link-icon')}</a>`,
    css: `.link { display: inline-flex; align-items: center; gap: 6px; color: var(--k-primary); font-size: 15px; font-weight: 600; text-decoration: none; transition: gap 0.2s ${EASE}, color 0.2s ${EASE}; }
.link:hover { gap: 10px; color: color-mix(in srgb, var(--k-primary) 80%, var(--k-text)); }
.link-icon { width: 16px; height: 16px; flex: none; }`,
  },
  {
    id: 'image',
    name: 'Image',
    category: 'basics',
    keywords: ['img', 'picture', 'photo', 'media', 'graphic'],
    html: `<img class="image" data-name="Image" src="${PLACEHOLDER_IMAGE}" alt="Placeholder image">`,
    css: `.image { display: block; width: 400px; height: 260px; max-width: 100%; object-fit: cover; border-radius: ${R_LG}; }`,
  },
  {
    id: 'video',
    name: 'Video',
    category: 'basics',
    keywords: ['movie', 'media', 'clip', 'player', 'mp4'],
    html: `<video class="video" data-name="Video" muted loop playsinline></video>`,
    css: `.video { display: block; width: 480px; height: 270px; max-width: 100%; object-fit: cover; background-color: #0b0b12; border-radius: ${R_LG}; }`,
  },
  {
    id: 'divider',
    name: 'Divider',
    category: 'basics',
    keywords: ['hr', 'separator', 'line', 'rule'],
    html: `<hr class="divider" data-name="Divider">`,
    css: `.divider { width: 480px; max-width: 100%; height: 1px; margin: 0; border: none; background-color: ${BORDER_STRONG}; opacity: 1; }`,
  },
  {
    id: 'badge',
    name: 'Badge',
    category: 'basics',
    keywords: ['tag', 'pill', 'chip', 'label', 'status', 'new'],
    html: `<div class="badge" data-name="Badge"><div class="badge-dot"></div><span class="badge-text">New feature</span></div>`,
    css: `.badge { display: inline-flex; align-items: center; gap: 7px; padding: 4px 11px 4px 9px; border-radius: 999px; background-color: ${tint(9)}; border: 1px solid ${tint(20)}; color: var(--k-primary); font-size: 12.5px; font-weight: 600; }
.badge-dot { width: 6px; height: 6px; border-radius: 50%; background-color: var(--k-primary); box-shadow: 0 0 0 3px ${tint(18)}; }`,
  },
  {
    id: 'input',
    name: 'Input',
    category: 'basics',
    keywords: ['text field', 'form', 'email', 'field', 'textbox'],
    html: `<label class="field" data-name="Input field"><span class="field-label">Email address</span><input class="field-input" type="email" placeholder="you@company.com"><span class="field-hint">We’ll only use this to send you receipts.</span></label>`,
    css: `${FIELD}
${inputCss('.field-input')}`,
  },
  {
    id: 'textarea',
    name: 'Textarea',
    category: 'basics',
    keywords: ['multiline', 'message', 'comment', 'form', 'field'],
    html: `<label class="field" data-name="Textarea field"><span class="field-label">Message</span><textarea class="field-input" placeholder="Tell us a little about your project…"></textarea><span class="field-hint">Markdown is supported.</span></label>`,
    css: `${FIELD}
${inputCss('.field-input')}
.field-input { height: 112px; padding: 10px 12px; line-height: 1.5; resize: none; }`,
  },
  {
    id: 'select',
    name: 'Select',
    category: 'basics',
    keywords: ['dropdown', 'picker', 'options', 'menu', 'form'],
    html: `<label class="field" data-name="Select field"><span class="field-label">Country</span><select class="field-input"><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Germany</option><option>Japan</option></select></label>`,
    css: `${FIELD}
${inputCss('.field-input')}
.field-input { appearance: none; padding-right: 36px; background-image: ${SELECT_CHEVRON}; background-repeat: no-repeat; background-position: right 12px center; background-size: 16px 16px; cursor: pointer; }`,
  },
  {
    id: 'checkbox',
    name: 'Checkbox',
    category: 'basics',
    keywords: ['check', 'tick', 'option', 'agree', 'form', 'label'],
    html: `<label class="check" data-name="Checkbox"><input class="check-box" type="checkbox" checked><div class="check-copy"><span class="check-title">Product updates</span><span class="check-desc">News about features and improvements.</span></div></label>`,
    css: `.check { display: flex; align-items: flex-start; gap: 12px; width: 320px; max-width: 100%; cursor: pointer; }
.check-box { width: 18px; height: 18px; margin: 2px 0 0; flex: none; accent-color: var(--k-primary); cursor: pointer; }
.check-copy { display: flex; flex-direction: column; gap: 2px; }
.check-title { font-size: 14.5px; font-weight: 600; color: var(--k-text); }
.check-desc { font-size: 13.5px; color: var(--k-muted); }`,
  },
  {
    id: 'radio-group',
    name: 'Radio group',
    category: 'basics',
    keywords: ['radio', 'options', 'choice', 'plan', 'select one', 'form'],
    html: `<div class="radios" role="radiogroup" data-name="Radio group">
<label class="radio radio--active"><input class="radio-input" type="radio" name="plan" checked><div class="radio-copy"><span class="radio-title">Starter</span><span class="radio-desc">For individuals and side projects</span></div><span class="radio-price">Free</span></label>
<label class="radio"><input class="radio-input" type="radio" name="plan"><div class="radio-copy"><span class="radio-title">Pro</span><span class="radio-desc">Unlimited projects and exports</span></div><span class="radio-price">$12</span></label>
<label class="radio"><input class="radio-input" type="radio" name="plan"><div class="radio-copy"><span class="radio-title">Team</span><span class="radio-desc">Shared libraries and roles</span></div><span class="radio-price">$32</span></label>
</div>`,
    css: `.radios { display: flex; flex-direction: column; gap: 10px; width: 360px; max-width: 100%; }
.radio { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid ${BORDER_STRONG}; border-radius: ${R_LG}; background-color: var(--k-surface); cursor: pointer; transition: border-color 0.18s ${EASE}, background-color 0.18s ${EASE}; }
.radio:hover { border-color: color-mix(in srgb, var(--k-text) 28%, transparent); }
.radio--active { border-color: var(--k-primary); background-color: ${soft(5)}; box-shadow: 0 0 0 3px ${tint(12)}; }
.radio-input { width: 18px; height: 18px; margin: 0; flex: none; accent-color: var(--k-primary); }
.radio-copy { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.radio-title { font-size: 14.5px; font-weight: 600; color: var(--k-text); }
.radio-desc { font-size: 13px; color: var(--k-muted); }
.radio-price { font-size: 14px; font-weight: 600; color: var(--k-text); }`,
  },
  {
    id: 'toggle',
    name: 'Toggle switch',
    category: 'basics',
    keywords: ['switch', 'toggle', 'on off', 'boolean', 'setting'],
    html: `<label class="toggle" data-name="Toggle switch"><div class="toggle-track"><div class="toggle-thumb"></div></div><span class="toggle-label">Email notifications</span></label>`,
    css: `.toggle { display: inline-flex; align-items: center; gap: 12px; cursor: pointer; }
.toggle-track { display: flex; justify-content: flex-end; align-items: center; width: 44px; height: 24px; padding: 2px; border-radius: 999px; background-color: var(--k-primary); box-shadow: inset 0 1px 2px rgba(16, 24, 40, 0.18); transition: background-color 0.2s ${EASE}; }
.toggle-thumb { width: 20px; height: 20px; border-radius: 50%; background-color: #ffffff; box-shadow: 0 1px 3px rgba(16, 24, 40, 0.25); }
.toggle-label { font-size: 14.5px; font-weight: 500; color: var(--k-text); }`,
  },
  {
    id: 'range',
    name: 'Range slider',
    category: 'basics',
    keywords: ['slider', 'range', 'volume', 'value', 'input'],
    html: `<div class="range" data-name="Range slider"><div class="range-head"><span class="range-label">Opacity</span><span class="range-value">64%</span></div><input class="range-input" type="range" min="0" max="100" value="64"></div>`,
    css: `.range { display: flex; flex-direction: column; gap: 10px; width: 300px; max-width: 100%; }
.range-head { display: flex; justify-content: space-between; align-items: center; }
.range-label { font-size: 13.5px; font-weight: 600; color: var(--k-text); }
.range-value { padding: 2px 8px; border-radius: 6px; background-color: color-mix(in srgb, var(--k-text) 6%, transparent); font-size: 12.5px; font-weight: 600; color: var(--k-muted); font-variant-numeric: tabular-nums; }
.range-input { width: 100%; margin: 0; accent-color: var(--k-primary); cursor: pointer; }`,
  },
  {
    id: 'avatar',
    name: 'Avatar',
    category: 'basics',
    keywords: ['user', 'profile', 'picture', 'initials', 'person', 'status'],
    html: `<div class="avatar" data-name="Avatar"><div class="avatar-image">AK</div><div class="avatar-status"></div></div>`,
    css: `.avatar { position: relative; width: 48px; height: 48px; }
.avatar-image { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background-image: ${AVATAR_FILLS[0]}; color: #ffffff; font-size: 16px; font-weight: 600; letter-spacing: 0.02em; }
.avatar-status { position: absolute; left: 34px; top: 34px; width: 14px; height: 14px; border-radius: 50%; background-color: #22c55e; border: 2.5px solid var(--k-surface); }`,
  },
  {
    id: 'icon',
    name: 'Icon',
    category: 'basics',
    keywords: ['icon', 'glyph', 'symbol', 'svg', 'tile'],
    html: `<div class="icon-tile" data-name="Icon">${icon('sparkles', 'icon-glyph', 1.75)}</div>`,
    css: `.icon-tile { display: grid; place-items: center; width: 56px; height: 56px; border-radius: ${R_LG}; background-color: ${tint(10)}; border: 1px solid ${tint(18)}; color: var(--k-primary); }
.icon-glyph { width: 26px; height: 26px; }`,
  },
];
