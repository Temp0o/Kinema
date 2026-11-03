import type { CatalogItem } from '../types';
import { icon } from '../icons';
import { AVATAR_FILLS, BORDER, EASE, HAIRLINE, R_LG, R_SM, R_XL, SHADOW_SM, buttonCss } from '../snippets';

const PEOPLE: [string, string, string, string, 'active' | 'invited' | 'away', string][] = [
  ['AC', 'Ava Chen', 'ava@acme.com', 'Owner', 'active', '2 min ago'],
  ['MO', 'Marcus Okafor', 'marcus@acme.com', 'Admin', 'active', '1 hour ago'],
  ['LP', 'Lena Petrova', 'lena@acme.com', 'Editor', 'away', 'Yesterday'],
  ['RS', 'Rafael Santos', 'rafael@acme.com', 'Editor', 'active', '3 days ago'],
  ['JW', 'Jade Williams', 'jade@acme.com', 'Viewer', 'invited', '—'],
];

const STATUS: Record<string, string> = {
  active: 'color: #12a150; background-color: rgba(18, 161, 80, 0.1);',
  invited: 'color: #2563eb; background-color: rgba(37, 99, 235, 0.1);',
  away: 'color: #b45309; background-color: rgba(217, 119, 6, 0.12);',
};

const ACTIVITY: [string, string, string, string][] = [
  ['AC', 'Ava Chen', 'Published “Pricing page”', '2m'],
  ['MO', 'Marcus Okafor', 'Commented on Hero section', '18m'],
  ['LP', 'Lena Petrova', 'Updated the color tokens', '1h'],
  ['RS', 'Rafael Santos', 'Added 3 animations', '3h'],
  ['JW', 'Jade Williams', 'Joined the workspace', '1d'],
];

export const DATA: CatalogItem[] = [
  {
    id: 'table',
    name: 'Data table',
    category: 'data',
    keywords: ['table', 'grid', 'rows', 'users', 'admin', 'list', 'data'],
    width: 880,
    html: `<div class="tbl" data-name="Data table">
<div class="tbl-toolbar"><div class="tbl-heading"><h3 class="tbl-title">Team members</h3><span class="tbl-count">24 users</span></div><div class="tbl-tools"><div class="tbl-search">${icon('search', 'tbl-search-icon')}<span class="tbl-search-text">Search members</span></div><button class="tbl-add">${icon('plus', 'tbl-add-icon')} Invite</button></div></div>
<div class="tbl-scroll"><table class="tbl-table"><thead><tr><th class="tbl-th">Name</th><th class="tbl-th">Role</th><th class="tbl-th">Status</th><th class="tbl-th tbl-col-last">Last active</th></tr></thead><tbody>
${PEOPLE.map(([ini, name, mail, role, st, last], i) => `<tr class="tbl-row"><td class="tbl-td"><div class="tbl-user"><div class="tbl-avatar tbl-avatar--${i}">${ini}</div><div class="tbl-user-copy"><span class="tbl-name">${name}</span><span class="tbl-email">${mail}</span></div></div></td><td class="tbl-td tbl-role">${role}</td><td class="tbl-td"><span class="tbl-status" style="${STATUS[st]}">${st[0].toUpperCase() + st.slice(1)}</span></td><td class="tbl-td tbl-muted tbl-col-last">${last}</td></tr>`).join('')}
</tbody></table></div></div>`,
    css: `.tbl { width: 100%; max-width: 880px; overflow: hidden; border-radius: ${R_LG}; background-color: var(--k-surface); border: ${HAIRLINE}; box-shadow: ${SHADOW_SM}; }
.tbl-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: ${HAIRLINE}; }
.tbl-heading { display: flex; align-items: center; gap: 10px; }
.tbl-title { font-size: 16px; letter-spacing: -0.01em; }
.tbl-count { padding: 2px 8px; border-radius: 999px; background-color: color-mix(in srgb, var(--k-text) 6%, transparent); color: var(--k-muted); font-size: 12.5px; font-weight: 600; }
.tbl-tools { display: flex; align-items: center; gap: 10px; }
.tbl-search { display: flex; align-items: center; gap: 8px; width: 220px; height: 36px; padding: 0 12px; border-radius: ${R_SM}; border: 1px solid ${BORDER}; color: var(--k-muted); font-size: 13.5px; }
.tbl-search-icon { width: 15px; height: 15px; }
${buttonCss('.tbl-add', 'primary', 'sm')}
.tbl-add-icon { width: 15px; height: 15px; }
.tbl-scroll { overflow-x: auto; }
.tbl-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.tbl-th { padding: 10px 20px; background-color: color-mix(in srgb, var(--k-text) 3%, var(--k-surface)); border-bottom: ${HAIRLINE}; color: var(--k-muted); font-size: 12.5px; font-weight: 600; text-align: left; text-transform: uppercase; letter-spacing: 0.04em; }
.tbl-row { transition: background-color 0.16s ${EASE}; }
.tbl-row:hover { background-color: color-mix(in srgb, var(--k-primary) 3%, transparent); }
.tbl-td { padding: 12px 20px; border-bottom: ${HAIRLINE}; vertical-align: middle; }
.tbl-row:last-child .tbl-td { border-bottom: none; }
.tbl-user { display: flex; align-items: center; gap: 12px; }
.tbl-avatar { display: grid; place-items: center; width: 34px; height: 34px; flex: none; border-radius: 50%; color: #ffffff; font-size: 12px; font-weight: 700; }
${PEOPLE.map((_, i) => `.tbl-avatar--${i} { background-image: ${AVATAR_FILLS[i % AVATAR_FILLS.length]}; }`).join('\n')}
.tbl-user-copy { display: flex; flex-direction: column; }
.tbl-name { font-weight: 600; }
.tbl-email { font-size: 13px; color: var(--k-muted); }
.tbl-role { color: var(--k-text); }
.tbl-status { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12.5px; font-weight: 600; }
.tbl-muted { color: var(--k-muted); }
@media (max-width: 640px) { .tbl-toolbar { flex-direction: column; align-items: stretch; } .tbl-search { width: auto; flex: 1; } .tbl-col-last { display: none; } .tbl-td { padding: 12px 14px; } .tbl-th { padding: 10px 14px; } }`,
  },
  {
    id: 'list-avatars',
    name: 'List with avatars',
    category: 'data',
    keywords: ['list', 'activity', 'feed', 'people', 'avatars', 'users'],
    width: 420,
    html: `<div class="feed" data-name="Activity list"><div class="feed-head"><h3 class="feed-title">Recent activity</h3><a class="feed-link" href="#">View all</a></div>
<ul class="feed-list">${ACTIVITY.map(([ini, name, what, when], i) => `<li class="feed-item"><div class="feed-avatar feed-avatar--${i}">${ini}</div><div class="feed-copy"><span class="feed-name">${name}</span><span class="feed-what">${what}</span></div><span class="feed-time">${when}</span></li>`).join('')}</ul></div>`,
    css: `.feed { display: flex; flex-direction: column; width: 100%; max-width: 420px; padding: 8px; border-radius: ${R_LG}; background-color: var(--k-surface); border: ${HAIRLINE}; box-shadow: ${SHADOW_SM}; }
.feed-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px 8px; }
.feed-title { font-size: 15px; letter-spacing: -0.01em; }
.feed-link { color: var(--k-primary); font-size: 13.5px; font-weight: 600; text-decoration: none; }
.feed-list { display: flex; flex-direction: column; padding: 0; list-style: none; }
.feed-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: ${R_SM}; transition: background-color 0.16s ${EASE}; }
.feed-item:hover { background-color: color-mix(in srgb, var(--k-text) 4%, transparent); }
.feed-avatar { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 50%; color: #ffffff; font-size: 12.5px; font-weight: 700; }
${ACTIVITY.map((_, i) => `.feed-avatar--${i} { background-image: ${AVATAR_FILLS[(i + 2) % AVATAR_FILLS.length]}; }`).join('\n')}
.feed-copy { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.feed-name { font-size: 14px; font-weight: 600; }
.feed-what { font-size: 13.5px; color: var(--k-muted); }
.feed-time { font-size: 12.5px; color: var(--k-muted); font-variant-numeric: tabular-nums; }`,
  },
  {
    id: 'description-list',
    name: 'Description list',
    category: 'data',
    keywords: ['description list', 'key value', 'details', 'properties', 'definition', 'dl'],
    width: 600,
    html: `<div class="dlist" data-name="Description list"><div class="dlist-head"><h3 class="dlist-title">Project details</h3><p class="dlist-sub">Settings and ownership for this workspace.</p></div>
<dl class="dlist-rows">
<div class="dlist-row"><dt class="dlist-key">Project name</dt><dd class="dlist-value">Website redesign</dd></div>
<div class="dlist-row"><dt class="dlist-key">Status</dt><dd class="dlist-value"><span class="dlist-pill" style="display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px; background-color: rgba(18, 161, 80, 0.1); color: #12a150; font-size: 12.5px; font-weight: 600;">Live</span></dd></div>
<div class="dlist-row"><dt class="dlist-key">Owner</dt><dd class="dlist-value dlist-owner"><div class="dlist-avatar">AC</div><span class="dlist-owner-name">Ava Chen</span></dd></div>
<div class="dlist-row"><dt class="dlist-key">Domain</dt><dd class="dlist-value"><a href="#" style="color: var(--k-primary); font-weight: 600; text-decoration: none;">acme.design</a></dd></div>
<div class="dlist-row"><dt class="dlist-key">Plan</dt><dd class="dlist-value">Pro · billed yearly</dd></div>
<div class="dlist-row"><dt class="dlist-key">Created</dt><dd class="dlist-value">March 14, 2026</dd></div>
</dl></div>`,
    css: `.dlist { display: flex; flex-direction: column; width: 100%; max-width: 600px; padding: 24px 28px 8px; border-radius: ${R_XL}; background-color: var(--k-surface); border: ${HAIRLINE}; box-shadow: ${SHADOW_SM}; }
.dlist-head { display: flex; flex-direction: column; gap: 4px; padding-bottom: 18px; }
.dlist-title { font-size: 17px; letter-spacing: -0.015em; }
.dlist-sub { font-size: 14px; color: var(--k-muted); }
.dlist-rows { margin: 0; }
.dlist-row { display: grid; grid-template-columns: 180px 1fr; align-items: center; gap: 16px; padding: 14px 0; border-top: ${HAIRLINE}; }
.dlist-key { font-size: 14px; font-weight: 500; color: var(--k-muted); }
.dlist-value { margin: 0; font-size: 14.5px; color: var(--k-text); }
.dlist-owner { display: flex; align-items: center; gap: 10px; }
.dlist-avatar { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background-image: ${AVATAR_FILLS[0]}; color: #ffffff; font-size: 10.5px; font-weight: 700; }
.dlist-owner-name { font-weight: 600; }
@media (max-width: 640px) { .dlist { padding: 20px 20px 4px; } .dlist-row { grid-template-columns: 1fr; gap: 4px; } }`,
  },
];

