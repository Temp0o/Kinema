import type { CatalogItem } from '../types';
import { icon, type CatalogIconName } from '../icons';
import { AVATAR_FILLS, BORDER_STRONG, EASE, HAIRLINE, R_LG, R_SM, R_XL, SHADOW_LG, SHADOW_SM, buttonCss, tint } from '../snippets';

function alertItem(kind: 'info' | 'success' | 'warning' | 'error', color: string, glyph: CatalogIconName, title: string, text: string): CatalogItem {
  const label = kind[0].toUpperCase() + kind.slice(1);
  return {
    id: `alert-${kind}`,
    name: `Alert · ${label}`,
    category: 'feedback',
    keywords: ['alert', 'banner', 'notice', 'message', 'callout', kind],
    width: 460,
    html: `<div class="alert" role="alert" data-name="${label} alert">${icon(glyph, 'alert-icon')}<div class="alert-body"><span class="alert-title">${title}</span><p class="alert-text">${text}</p></div><button class="alert-close" aria-label="Dismiss">${icon('x', 'alert-close-icon')}</button></div>`,
    css: `.alert { display: flex; align-items: flex-start; gap: 12px; width: 100%; max-width: 460px; padding: 14px 14px 14px 16px; border-radius: ${R_LG}; background-color: color-mix(in srgb, ${color} 7%, var(--k-surface)); border: 1px solid color-mix(in srgb, ${color} 24%, transparent); }
.alert-icon { width: 20px; height: 20px; margin-top: 1px; flex: none; color: ${color}; }
.alert-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.alert-title { font-size: 14.5px; font-weight: 600; color: color-mix(in srgb, ${color} 55%, var(--k-text)); }
.alert-text { font-size: 14px; line-height: 1.5; color: color-mix(in srgb, ${color} 18%, var(--k-muted)); }
.alert-close { display: grid; place-items: center; width: 26px; height: 26px; flex: none; border-radius: 6px; color: color-mix(in srgb, ${color} 40%, var(--k-muted)); transition: background-color 0.16s ${EASE}; }
.alert-close:hover { background-color: color-mix(in srgb, ${color} 12%, transparent); }
.alert-close-icon { width: 15px; height: 15px; }`,
  };
}

const AV = (cls: string, n: number) => `.${cls}--${n} { background-image: ${AVATAR_FILLS[n % AVATAR_FILLS.length]}; }`;

const SHIMMER = `@keyframes shimmer { from { background-position: 150% 0; } to { background-position: -50% 0; } }`;
const BONE = `background-image: linear-gradient(90deg, color-mix(in srgb, var(--k-text) 7%, transparent) 0%, color-mix(in srgb, var(--k-text) 13%, transparent) 50%, color-mix(in srgb, var(--k-text) 7%, transparent) 100%); background-size: 200% 100%; animation: shimmer 1.6s ease-in-out 0s infinite;`;

export const FEEDBACK: CatalogItem[] = [
  alertItem('info', '#2563eb', 'info', 'A new version is available', 'Refresh the page to get the latest features and fixes.'),
  alertItem('success', '#16a34a', 'circle-check', 'Payment received', 'Your invoice #1042 has been paid. A receipt is on its way.'),
  alertItem('warning', '#d97706', 'triangle-alert', 'Storage almost full', 'You’ve used 92% of your plan. Upgrade to keep uploading.'),
  alertItem('error', '#dc2626', 'circle-x', 'Couldn’t publish site', 'The domain could not be verified. Check your DNS settings.'),
  {
    id: 'toast',
    name: 'Toast',
    category: 'feedback',
    keywords: ['toast', 'snackbar', 'notification', 'message', 'popup'],
    width: 400,
    html: `<div class="toast" role="status" data-name="Toast"><div class="toast-icon">${icon('circle-check', 'toast-glyph')}</div><div class="toast-body"><span class="toast-title">Changes published</span><span class="toast-text">Your site is live at acme.com</span></div><a class="toast-action" href="#">View</a><button class="toast-close" aria-label="Close">${icon('x', 'toast-close-icon')}</button></div>`,
    css: `@keyframes toast-in { from { opacity: 0; transform: translateY(14px) scale(0.98); } to { opacity: 1; transform: none; } }
.toast { display: flex; align-items: center; gap: 12px; width: 100%; max-width: 400px; padding: 12px 12px 12px 14px; border-radius: ${R_LG}; background-color: var(--k-text); color: var(--k-surface); box-shadow: ${SHADOW_LG}; animation: toast-in 0.45s ${EASE} 0s both; }
.toast-icon { display: grid; place-items: center; width: 32px; height: 32px; flex: none; border-radius: 50%; background-color: rgba(34, 197, 94, 0.16); color: #4ade80; }
.toast-glyph { width: 18px; height: 18px; }
.toast-body { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.toast-title { font-size: 14px; font-weight: 600; }
.toast-text { font-size: 13px; color: color-mix(in srgb, var(--k-surface) 62%, transparent); }
.toast-action { padding: 6px 10px; border-radius: 6px; background-color: color-mix(in srgb, var(--k-surface) 10%, transparent); color: var(--k-surface); font-size: 13px; font-weight: 600; text-decoration: none; transition: background-color 0.16s ${EASE}; }
.toast-action:hover { background-color: color-mix(in srgb, var(--k-surface) 18%, transparent); }
.toast-close { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 6px; color: color-mix(in srgb, var(--k-surface) 55%, transparent); }
.toast-close-icon { width: 15px; height: 15px; }`,
  },
  {
    id: 'progress',
    name: 'Progress bar',
    category: 'feedback',
    keywords: ['progress', 'loading', 'upload', 'bar', 'percentage', 'meter'],
    width: 400,
    html: `<div class="prog" data-name="Progress bar"><div class="prog-head"><div class="prog-file"><div class="prog-file-icon">${icon('file-text', 'prog-file-glyph')}</div><div class="prog-copy"><span class="prog-name">brand-guidelines.pdf</span><span class="prog-meta">3.4 MB of 5 MB · 12s left</span></div></div><span class="prog-value">68%</span></div><div class="prog-track"><div class="prog-fill"></div></div></div>`,
    css: `@keyframes fill { from { width: 0%; } to { width: 68%; } }
.prog { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 400px; padding: 16px; border-radius: ${R_LG}; background-color: var(--k-surface); border: ${HAIRLINE}; box-shadow: ${SHADOW_SM}; }
.prog-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.prog-file { display: flex; align-items: center; gap: 12px; min-width: 0; }
.prog-file-icon { display: grid; place-items: center; width: 38px; height: 38px; flex: none; border-radius: ${R_SM}; background-color: ${tint(10)}; color: var(--k-primary); }
.prog-file-glyph { width: 18px; height: 18px; }
.prog-copy { display: flex; flex-direction: column; min-width: 0; }
.prog-name { font-size: 14px; font-weight: 600; }
.prog-meta { font-size: 12.5px; color: var(--k-muted); }
.prog-value { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
.prog-track { height: 8px; border-radius: 999px; background-color: color-mix(in srgb, var(--k-text) 8%, transparent); overflow: hidden; }
.prog-fill { width: 68%; height: 100%; border-radius: 999px; background-image: linear-gradient(90deg, var(--k-primary), var(--k-accent)); animation: fill 1.2s ${EASE} 0.2s both; }`,
  },
  {
    id: 'tooltip',
    name: 'Tooltip',
    category: 'feedback',
    keywords: ['tooltip', 'hint', 'popover', 'help', 'hover', 'label'],
    html: `<div class="tip" data-name="Tooltip"><div class="tip-bubble"><span class="tip-text">Copy link</span><span class="tip-kbd">⌘C</span><div class="tip-arrow"></div></div><button class="tip-trigger" aria-label="Copy link">${icon('copy', 'tip-icon')}</button></div>`,
    css: `.tip { display: inline-flex; flex-direction: column; align-items: center; gap: 10px; }
.tip-bubble { position: relative; display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 8px; background-color: var(--k-text); color: var(--k-surface); font-size: 13px; font-weight: 500; box-shadow: ${SHADOW_LG}; }
.tip-kbd { padding: 0 5px; border-radius: 4px; background-color: color-mix(in srgb, var(--k-surface) 14%, transparent); color: color-mix(in srgb, var(--k-surface) 70%, transparent); font-size: 11.5px; }
.tip-arrow { position: absolute; left: calc(50% - 5px); top: calc(100% - 5px); width: 10px; height: 10px; border-radius: 2px; background-color: var(--k-text); rotate: 45deg; }
.tip-trigger { display: grid; place-items: center; width: 40px; height: 40px; border-radius: ${R_SM}; background-color: var(--k-surface); border: 1px solid ${BORDER_STRONG}; color: var(--k-text); box-shadow: ${SHADOW_SM}; transition: background-color 0.16s ${EASE}; }
.tip-trigger:hover { background-color: color-mix(in srgb, var(--k-text) 4%, var(--k-surface)); }
.tip-icon { width: 17px; height: 17px; }`,
  },
  {
    id: 'modal',
    name: 'Modal dialog',
    category: 'feedback',
    keywords: ['modal', 'dialog', 'popup', 'confirm', 'overlay', 'lightbox'],
    width: 720,
    html: `<div class="scrim" data-name="Modal dialog"><div class="modal" role="dialog" aria-label="Delete project"><div class="modal-icon">${icon('triangle-alert', 'modal-glyph')}</div><div class="modal-body"><h3 class="modal-title">Delete this project?</h3><p class="modal-text">“Website redesign” and all of its pages, assets and animations will be permanently deleted. This can’t be undone.</p></div><div class="modal-actions"><button class="modal-cancel">Cancel</button><button class="modal-confirm">Delete project</button></div><button class="modal-close" aria-label="Close">${icon('x', 'modal-close-icon')}</button></div></div>`,
    css: `@keyframes modal-in { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: none; } }
.scrim { display: grid; place-items: center; width: 100%; min-height: 460px; padding: 48px 24px; border-radius: ${R_LG}; background-color: color-mix(in srgb, var(--k-text) 45%, transparent); backdrop-filter: blur(4px); }
.modal { position: relative; display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 440px; padding: 28px; border-radius: ${R_XL}; background-color: var(--k-surface); box-shadow: ${SHADOW_LG}; animation: modal-in 0.4s ${EASE} 0s both; }
.modal-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; background-color: rgba(220, 38, 38, 0.1); color: #dc2626; box-shadow: 0 0 0 6px rgba(220, 38, 38, 0.05); }
.modal-glyph { width: 21px; height: 21px; }
.modal-body { display: flex; flex-direction: column; gap: 6px; }
.modal-title { font-size: 19px; letter-spacing: -0.02em; }
.modal-text { font-size: 14.5px; line-height: 1.6; color: var(--k-muted); }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; }
${buttonCss('.modal-cancel', 'secondary')}
.modal-confirm { display: inline-flex; align-items: center; height: 40px; padding: 0 18px; border-radius: ${R_SM}; background-color: #dc2626; color: #ffffff; font-size: 14.5px; font-weight: 600; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.14); transition: background-color 0.18s ${EASE}; }
.modal-confirm:hover { background-color: #b91c1c; }
.modal-close { position: absolute; left: calc(100% - 44px); top: 16px; display: grid; place-items: center; width: 28px; height: 28px; border-radius: 6px; color: var(--k-muted); }
.modal-close-icon { width: 16px; height: 16px; }
@media (max-width: 640px) { .modal-actions { flex-direction: column-reverse; } }`,
  },
  {
    id: 'empty-state',
    name: 'Empty state',
    category: 'feedback',
    keywords: ['empty', 'zero state', 'no results', 'placeholder', 'blank', 'onboarding'],
    width: 480,
    html: `<div class="empty" data-name="Empty state"><div class="empty-art">${icon('inbox', 'empty-glyph', 1.75)}</div><h3 class="empty-title">No projects yet</h3><p class="empty-text">Create your first project to start designing, or import an existing site to pick up where you left off.</p><div class="empty-actions"><button class="empty-primary">${icon('plus', 'empty-btn-icon')} New project</button><button class="empty-secondary">${icon('upload', 'empty-btn-icon')} Import</button></div></div>`,
    css: `.empty { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; max-width: 480px; padding: 48px 32px; border-radius: ${R_XL}; border: 1.5px dashed ${BORDER_STRONG}; background-color: var(--k-surface); text-align: center; }
.empty-art { display: grid; place-items: center; width: 64px; height: 64px; margin-bottom: 14px; border-radius: 50%; background-color: ${tint(10)}; color: var(--k-primary); box-shadow: 0 0 0 10px ${tint(5)}, 0 0 0 20px ${tint(3)}; }
.empty-glyph { width: 28px; height: 28px; }
.empty-title { font-size: 19px; letter-spacing: -0.02em; }
.empty-text { max-width: 340px; font-size: 14.5px; line-height: 1.6; color: var(--k-muted); }
.empty-actions { display: flex; gap: 10px; margin-top: 12px; }
${buttonCss('.empty-primary', 'primary')}
${buttonCss('.empty-secondary', 'secondary')}
.empty-btn-icon { width: 16px; height: 16px; }`,
  },
  {
    id: 'avatar-group',
    name: 'Avatar group',
    category: 'feedback',
    keywords: ['avatars', 'group', 'stack', 'collaborators', 'members', 'facepile'],
    html: `<div class="avg" data-name="Avatar group"><div class="avg-stack"><div class="avg-item avg-item--0">AK</div><div class="avg-item avg-item--1">ML</div><div class="avg-item avg-item--2">JS</div><div class="avg-item avg-item--3">RT</div><div class="avg-item avg-item--4">EV</div><div class="avg-more">+12</div></div><span class="avg-label">17 collaborators</span></div>`,
    css: `.avg { display: inline-flex; align-items: center; gap: 12px; }
.avg-stack { display: flex; }
.avg-item { display: grid; place-items: center; width: 38px; height: 38px; margin-left: -10px; border-radius: 50%; border: 2.5px solid var(--k-surface); color: #ffffff; font-size: 12.5px; font-weight: 700; transition: transform 0.2s ${EASE}; }
.avg-item:hover { transform: translateY(-3px); }
.avg-item--0 { margin-left: 0; }
${[0, 1, 2, 3, 4].map((n) => AV('avg-item', n)).join('\n')}
.avg-more { display: grid; place-items: center; width: 38px; height: 38px; margin-left: -10px; border-radius: 50%; border: 2.5px solid var(--k-surface); background-color: color-mix(in srgb, var(--k-text) 8%, var(--k-surface)); color: var(--k-text); font-size: 12px; font-weight: 700; }
.avg-label { font-size: 14px; font-weight: 500; color: var(--k-muted); }`,
  },
  {
    id: 'skeleton',
    name: 'Skeleton loader',
    category: 'feedback',
    keywords: ['skeleton', 'loading', 'placeholder', 'shimmer', 'loader'],
    width: 360,
    html: `<div class="skel" data-name="Skeleton loader"><div class="skel-head"><div class="skel-avatar"></div><div class="skel-lines"><div class="skel-line skel-line--60"></div><div class="skel-line skel-line--35"></div></div></div><div class="skel-block"></div><div class="skel-line"></div><div class="skel-line skel-line--80"></div></div>`,
    css: `${SHIMMER}
.skel { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 360px; padding: 20px; border-radius: ${R_LG}; background-color: var(--k-surface); border: ${HAIRLINE}; }
.skel-head { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
.skel-avatar { width: 40px; height: 40px; flex: none; border-radius: 50%; ${BONE} }
.skel-lines { display: flex; flex-direction: column; gap: 8px; flex: 1; }
.skel-line { width: 100%; height: 11px; border-radius: 999px; ${BONE} }
.skel-line--60 { width: 60%; }
.skel-line--35 { width: 35%; }
.skel-line--80 { width: 80%; }
.skel-block { height: 140px; border-radius: ${R_SM}; ${BONE} }`,
  },
];
