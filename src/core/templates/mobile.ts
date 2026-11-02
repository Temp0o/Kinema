import type { TemplateDef } from './types';
import { icon } from './icons';

const week = [
  { d: 'M', h: 46 },
  { d: 'T', h: 70 },
  { d: 'W', h: 38 },
  { d: 'T', h: 88, hi: true },
  { d: 'F', h: 60 },
  { d: 'S', h: 30 },
  { d: 'S', h: 52 },
];

const tx = [
  { icon: 'coffee', name: 'Blue Bottle Coffee', meta: 'Today · 8:42', amount: '−$6.40', cls: 't1', neg: true },
  { icon: 'arrowDownLeft', name: 'Salary — Lumen Co.', meta: 'Yesterday', amount: '+$4,250.00', cls: 't2', neg: false },
  { icon: 'music', name: 'Spotify Premium', meta: 'Nov 1', amount: '−$10.99', cls: 't3', neg: true },
  { icon: 'car', name: 'Uber trip', meta: 'Oct 31', amount: '−$18.20', cls: 't4', neg: true },
];

const html = `
<div class="stage">
  <div class="float-card float-left">
    <div class="fc-icon fc-green">${icon('trending', 'fc-svg')}</div>
    <div class="fc-meta"><p class="fc-title">Savings goal</p><p class="fc-sub">Japan trip · 72% reached</p><div class="progress"><div class="progress-fill"></div></div></div>
  </div>
  <div class="float-card float-right">
    <div class="fc-icon fc-violet">${icon('bell', 'fc-svg')}</div>
    <div class="fc-meta"><p class="fc-title">Payment received</p><p class="fc-sub">+$250.00 from Sam</p></div>
  </div>

  <div class="phone">
    <div class="status-bar"><span class="time">9:41</span><div class="status-icons"><div class="signal"></div><div class="battery"><div class="battery-level"></div></div></div></div>

    <div class="screen">
      <header class="top">
        <div class="hello"><div class="avatar">MC</div><div class="hello-text"><p class="hello-small">Good morning</p><p class="hello-name">Maya Chen</p></div></div>
        <button class="round-btn">${icon('bell', 'rb-icon')}</button>
      </header>

      <div class="balance">
        <div class="balance-glow"></div>
        <p class="balance-label">Total balance</p>
        <p class="balance-value">$24,562.80</p>
        <div class="balance-row"><div class="chip-up">+2.4% this month</div><div class="card-num">•••• 4291</div></div>
      </div>

      <div class="actions">
        <div class="action"><div class="action-btn action-primary">${icon('send', 'a-icon')}</div><p class="action-label">Send</p></div>
        <div class="action"><div class="action-btn">${icon('arrowDownLeft', 'a-icon')}</div><p class="action-label">Request</p></div>
        <div class="action"><div class="action-btn">${icon('plus', 'a-icon')}</div><p class="action-label">Top up</p></div>
        <div class="action"><div class="action-btn">${icon('grid', 'a-icon')}</div><p class="action-label">More</p></div>
      </div>

      <section class="spend">
        <div class="sec-head"><h2 class="sec-title">Spending</h2><p class="sec-link">This week</p></div>
        <div class="spend-total"><p class="spend-value">$642.18</p><span class="spend-delta">−12% vs last week</span></div>
        <div class="week">
          ${week.map((w) => `<div class="day"><div class="day-track"><div class="day-bar${w.hi ? ' day-hi' : ''}" style="height:${w.h}%"></div></div><p class="day-label">${w.d}</p></div>`).join('')}
        </div>
      </section>

      <section class="tx">
        <div class="sec-head"><h2 class="sec-title">Recent activity</h2><p class="sec-link">See all</p></div>
        ${tx
          .map(
            (t) => `<div class="tx-row"><div class="tx-icon ${t.cls}">${icon(t.icon, 'tx-svg')}</div><div class="tx-meta"><p class="tx-name">${t.name}</p><p class="tx-date">${t.meta}</p></div><p class="tx-amount${t.neg ? '' : ' tx-pos'}">${t.amount}</p></div>`,
          )
          .join('\n')}
      </section>
    </div>

    <nav class="tabbar">
      <div class="tab tab-active">${icon('home', 'tab-icon')}</div>
      <div class="tab">${icon('pie', 'tab-icon')}</div>
      <div class="fab">${icon('plus', 'fab-icon', 2.5)}</div>
      <div class="tab">${icon('card', 'tab-icon')}</div>
      <div class="tab">${icon('user', 'tab-icon')}</div>
    </nav>
  </div>
</div>
`;

const css = `
body { background: var(--k-background); color: var(--k-text); }

.stage { position: relative; display: flex; align-items: center; justify-content: center; flex: 1; min-height: 1000px; padding: 64px 24px; overflow: hidden; background: radial-gradient(50% 45% at 30% 25%, rgba(108, 92, 231, 0.28), transparent 70%), radial-gradient(45% 45% at 75% 75%, rgba(0, 194, 168, 0.22), transparent 70%), var(--k-background); }

.float-card { position: absolute; display: flex; align-items: center; gap: 14px; width: 270px; padding: 16px; border-radius: 20px; background: rgba(255, 255, 255, 0.82); border: 1px solid rgba(255, 255, 255, 0.9); backdrop-filter: blur(14px); box-shadow: 0 24px 60px rgba(40, 30, 110, 0.14); }
.float-left { left: calc(50% - 470px); top: 300px; animation: bob 6s ease-in-out infinite alternate; }
.float-right { right: calc(50% - 470px); top: 620px; animation: bob 7s ease-in-out 1s infinite alternate-reverse; }
.fc-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 14px; color: #fff; }
.fc-green { background: linear-gradient(135deg, #34d399, var(--k-accent)); }
.fc-violet { background: linear-gradient(135deg, #a78bfa, var(--k-primary)); }
.fc-svg { width: 20px; height: 20px; }
.fc-meta { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.fc-title { font-size: 15px; font-weight: 600; }
.fc-sub { color: var(--k-muted); font-size: 13px; }
.progress { height: 6px; margin-top: 6px; border-radius: 99px; background: #e9e7f7; overflow: hidden; }
.progress-fill { width: 72%; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #34d399, var(--k-accent)); }

.phone { position: relative; display: flex; flex-direction: column; width: 390px; height: 844px; border-radius: 56px; border: 11px solid #0e0e16; background: var(--k-surface); overflow: hidden; box-shadow: 0 0 0 2px #2a2a3a, 0 50px 100px rgba(30, 20, 90, 0.35), 0 20px 40px rgba(30, 20, 90, 0.2); animation: rise 1s cubic-bezier(.2,.7,.2,1) backwards; }
.status-bar { display: flex; align-items: center; justify-content: space-between; height: 46px; padding: 12px 28px 0; flex-shrink: 0; }
.time { font-size: 15px; font-weight: 600; }
.status-icons { display: flex; align-items: center; gap: 6px; }
.signal { width: 18px; height: 10px; border-radius: 2px; background: linear-gradient(90deg, var(--k-text) 0 20%, transparent 20% 27%, var(--k-text) 27% 47%, transparent 47% 54%, var(--k-text) 54% 74%, transparent 74% 81%, var(--k-text) 81%); }
.battery { width: 25px; height: 12px; padding: 2px; border-radius: 4px; border: 1.5px solid var(--k-text); }
.battery-level { width: 75%; height: 100%; border-radius: 1.5px; background: var(--k-text); }

.screen { display: flex; flex-direction: column; gap: 22px; flex: 1; padding: 14px 22px 24px; overflow: hidden; }
.top { display: flex; align-items: center; justify-content: space-between; }
.hello { display: flex; align-items: center; gap: 12px; }
.avatar { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, #fbbf24, #f472b6); color: #fff; font-size: 15px; font-weight: 700; }
.hello-text { display: flex; flex-direction: column; }
.hello-small { color: var(--k-muted); font-size: 13px; }
.hello-name { font-size: 17px; font-weight: 600; }
.round-btn { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: var(--k-background); color: var(--k-text); transition: transform .2s ease; }
.round-btn:hover { transform: scale(1.06); }
.rb-icon { width: 20px; height: 20px; }

.balance { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 22px; border-radius: 26px; overflow: hidden; background: linear-gradient(140deg, #7b6cf6 0%, var(--k-primary) 45%, #4834d4 100%); color: #fff; box-shadow: 0 18px 36px rgba(108, 92, 231, 0.4); animation: rise .9s cubic-bezier(.2,.7,.2,1) .15s backwards; }
.balance-glow { position: absolute; width: 220px; height: 220px; right: -70px; top: -90px; border-radius: 50%; background: radial-gradient(circle, rgba(0, 230, 200, 0.75), transparent 65%); }
.balance-label { position: relative; font-size: 14px; opacity: 0.85; }
.balance-value { position: relative; font-family: var(--k-font-heading); font-size: 36px; font-weight: 700; letter-spacing: -0.03em; }
.balance-row { position: relative; display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.chip-up { padding: 5px 10px; border-radius: 99px; background: rgba(255, 255, 255, 0.2); font-size: 12px; font-weight: 600; }
.card-num { font-size: 14px; letter-spacing: 0.08em; opacity: 0.85; }

.actions { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.action { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.action-btn { display: flex; align-items: center; justify-content: center; width: 58px; height: 58px; border-radius: 20px; background: var(--k-background); color: var(--k-text); transition: transform .2s ease, background-color .2s ease; }
.action-btn:hover { transform: translateY(-2px); background: #e9e6ff; }
.action-primary { background: var(--k-text); color: #fff; }
.a-icon { width: 22px; height: 22px; }
.action-label { font-size: 13px; font-weight: 500; }

.spend { display: flex; flex-direction: column; gap: 12px; }
.sec-head { display: flex; align-items: center; justify-content: space-between; }
.sec-title { font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
.sec-link { color: var(--k-primary); font-size: 14px; font-weight: 600; }
.spend-total { display: flex; align-items: baseline; gap: 10px; }
.spend-value { font-family: var(--k-font-heading); font-size: 26px; font-weight: 700; letter-spacing: -0.02em; }
.spend-delta { color: #0f9d7a; font-size: 13px; font-weight: 600; }
.week { display: flex; gap: 10px; height: 110px; }
.day { display: flex; flex-direction: column; align-items: center; gap: 8px; flex: 1; }
.day-track { display: flex; align-items: flex-end; flex: 1; width: 100%; border-radius: 10px; background: var(--k-background); overflow: hidden; }
.day-bar { width: 100%; border-radius: 10px; background: #cfc8ff; }
.day-hi { background: linear-gradient(180deg, var(--k-accent), #00a48e); }
.day-label { color: var(--k-muted); font-size: 12px; font-weight: 600; }

.tx { display: flex; flex-direction: column; gap: 14px; }
.tx-row { display: flex; align-items: center; gap: 12px; }
.tx-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 14px; }
.t1 { background: #fff1e6; color: #c2410c; }
.t2 { background: #e3fbf5; color: #047857; }
.t3 { background: #e8f8ec; color: #15803d; }
.t4 { background: #eef0ff; color: #4338ca; }
.tx-svg { width: 20px; height: 20px; }
.tx-meta { display: flex; flex-direction: column; flex: 1; }
.tx-name { font-size: 15px; font-weight: 600; }
.tx-date { color: var(--k-muted); font-size: 13px; }
.tx-amount { font-size: 15px; font-weight: 600; }
.tx-pos { color: #0f9d7a; }

.tabbar { display: flex; align-items: center; justify-content: space-around; height: 84px; padding: 0 18px 18px; border-top: 1px solid #efeef7; background: var(--k-surface); flex-shrink: 0; }
.tab { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 16px; color: #a4a5bb; }
.tab-active { color: var(--k-primary); background: #efedff; }
.tab-icon { width: 22px; height: 22px; }
.fab { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; margin-top: -18px; border-radius: 20px; background: linear-gradient(135deg, var(--k-primary), #4834d4); color: #fff; box-shadow: 0 12px 24px rgba(108, 92, 231, 0.45); transition: transform .2s ease; }
.fab:hover { transform: translateY(-2px) rotate(90deg); }
.fab-icon { width: 24px; height: 24px; }

@keyframes rise { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes bob { from { transform: translateY(0px); } to { transform: translateY(-16px); } }

@media (max-width: 1024px) {
  .float-card { display: none; }
}
@media (max-width: 640px) {
  .stage { padding: 0; min-height: 844px; align-items: stretch; background: var(--k-surface); }
  .phone { width: 100%; height: 844px; border: none; border-radius: 0; box-shadow: none; }
}
`;

export const mobileTemplate: TemplateDef = {
  id: 'mobile',
  name: 'Mobile app screen',
  description: 'Finance app home screen in a device frame',
  pageName: 'App home',
  swatch: '#6c5ce7',
  tokens: {
    colors: [
      { name: 'primary', value: '#6c5ce7' },
      { name: 'accent', value: '#00c2a8' },
      { name: 'text', value: '#14142b' },
      { name: 'muted', value: '#7b7d95' },
      { name: 'surface', value: '#ffffff' },
      { name: 'background', value: '#f2f1fb' },
    ],
    fonts: { heading: 'Outfit Variable', body: 'Outfit Variable' },
    radius: 20,
  },
  html,
  css,
};
