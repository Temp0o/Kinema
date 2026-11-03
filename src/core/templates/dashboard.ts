import type { TemplateDef } from './types';
import { icon } from './icons';

const kpis = [
  { label: 'Total revenue', value: '$128,430', delta: '+14.2%', up: true, spark: [30, 42, 38, 55, 48, 62, 70, 66, 82] },
  { label: 'Active customers', value: '8,942', delta: '+6.8%', up: true, spark: [40, 38, 46, 50, 47, 58, 60, 64, 68] },
  { label: 'Conversion rate', value: '4.71%', delta: '-0.4%', up: false, spark: [70, 64, 66, 58, 60, 52, 55, 50, 48] },
  { label: 'Avg. order value', value: '$86.20', delta: '+2.1%', up: true, spark: [50, 54, 52, 58, 56, 62, 60, 66, 70] },
];

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const revenue = [42, 55, 48, 62, 58, 70, 66, 78, 72, 86, 80, 94];
const prev = [36, 44, 40, 50, 52, 54, 58, 60, 62, 66, 70, 72];

const orders = [
  { i: 'OL', name: 'Olivia Lane', email: 'olivia@lane.co', product: 'Pro plan · Annual', date: 'Nov 2, 2026', status: 'Paid', cls: 'paid', amount: '$1,188.00', c: '#f97066' },
  { i: 'MK', name: 'Marcus Kim', email: 'marcus@kim.dev', product: 'Team plan · Monthly', date: 'Nov 2, 2026', status: 'Pending', cls: 'pending', amount: '$249.00', c: '#6172f3' },
  { i: 'AS', name: 'Amara Singh', email: 'amara@studio.io', product: 'Pro plan · Monthly', date: 'Nov 1, 2026', status: 'Paid', cls: 'paid', amount: '$99.00', c: '#12b76a' },
  { i: 'JB', name: 'Jonas Berg', email: 'jonas@berg.se', product: 'Add-on · Storage', date: 'Oct 31, 2026', status: 'Refunded', cls: 'refunded', amount: '$29.00', c: '#f79009' },
];

const html = `
<div class="app">
  <aside class="sidebar">
    <div class="brand"><div class="brand-mark">${icon('trending', 'brand-icon', 2.5)}</div><span class="brand-name">Pulse</span></div>
    <nav class="menu">
      <a class="menu-item menu-active" href="#">${icon('home', 'micon')}<span>Overview</span></a>
      <a class="menu-item" href="#">${icon('chart', 'micon')}<span>Analytics</span></a>
      <a class="menu-item" href="#">${icon('users', 'micon')}<span>Customers</span><span class="menu-count">24</span></a>
      <a class="menu-item" href="#">${icon('cart', 'micon')}<span>Orders</span></a>
      <a class="menu-item" href="#">${icon('file', 'micon')}<span>Reports</span></a>
      <a class="menu-item" href="#">${icon('settings', 'micon')}<span>Settings</span></a>
    </nav>
    <p class="menu-label">Workspaces</p>
    <div class="spaces">
      <a class="space" href="#"><div class="space-dot s1"></div><span>Acme Store</span></a>
      <a class="space" href="#"><div class="space-dot s2"></div><span>Northwind EU</span></a>
      <a class="space" href="#"><div class="space-dot s3"></div><span>Side project</span></a>
    </div>
    <div class="upgrade">
      <p class="upgrade-title">Upgrade to Pro</p>
      <p class="upgrade-text">Unlock forecasting, cohorts and unlimited reports.</p>
      <a class="upgrade-btn" href="#">Upgrade now</a>
    </div>
  </aside>

  <main class="main">
    <header class="topbar">
      <div class="greeting">
        <h1 class="title">Good morning, Alex</h1>
        <p class="subtitle">Here’s what’s happening with your store today.</p>
      </div>
      <div class="top-actions">
        <div class="search">${icon('search', 'search-icon')}<input class="search-input" type="text" placeholder="Search anything…"></div>
        <button class="icon-btn">${icon('bell', 'ib-icon')}</button>
        <button class="primary-btn">${icon('plus', 'ib-icon')}<span>New report</span></button>
        <div class="avatar">AM</div>
      </div>
    </header>

    <div class="kpis">
      ${kpis
        .map(
          (k) => `<div class="kpi">
        <div class="kpi-top"><p class="kpi-label">${k.label}</p><span class="badge ${k.up ? 'badge-up' : 'badge-down'}">${k.delta}</span></div>
        <p class="kpi-value">${k.value}</p>
        <div class="spark">${k.spark.map((h) => `<div class="spark-bar${k.up ? '' : ' spark-down'}" style="height:${h}%"></div>`).join('')}</div>
      </div>`,
        )
        .join('\n')}
    </div>

    <div class="row">
      <section class="card chart-card">
        <div class="card-head">
          <div><h2 class="card-title">Revenue</h2><p class="card-sub">Compared to last year</p></div>
          <div class="tabs"><div class="tab tab-active">12 months</div><div class="tab">30 days</div><div class="tab">7 days</div></div>
        </div>
        <div class="legend"><div class="legend-item"><div class="lg lg-a"></div><span>This year</span></div><div class="legend-item"><div class="lg lg-b"></div><span>Last year</span></div></div>
        <div class="chart">
          ${revenue
            .map(
              (h, i) => `<div class="col"><div class="bars"><div class="b b-prev" style="height:${prev[i]}%"></div><div class="b b-cur" style="height:${h}%"></div></div><p class="x">${months[i]}</p></div>`,
            )
            .join('')}
        </div>
      </section>

      <section class="card sources">
        <div class="card-head"><div><h2 class="card-title">Traffic sources</h2><p class="card-sub">Last 30 days</p></div></div>
        <div class="donut"><div class="donut-hole"><p class="donut-value">24.8k</p><p class="donut-label">visits</p></div></div>
        <div class="source-list">
          <div class="source"><div class="sd sd1"></div><span class="source-name">Organic search</span><span class="source-val">42%</span></div>
          <div class="source"><div class="sd sd2"></div><span class="source-name">Direct</span><span class="source-val">28%</span></div>
          <div class="source"><div class="sd sd3"></div><span class="source-name">Social</span><span class="source-val">16%</span></div>
          <div class="source"><div class="sd sd4"></div><span class="source-name">Referral</span><span class="source-val">14%</span></div>
        </div>
      </section>
    </div>

    <section class="card table-card">
      <div class="card-head"><div><h2 class="card-title">Recent orders</h2><p class="card-sub">You have 18 new orders this week</p></div><a class="view-all" href="#">View all</a></div>
      <div class="thead"><div class="th">Customer</div><div class="th c-product">Product</div><div class="th c-date">Date</div><div class="th">Status</div><div class="th t-right">Amount</div></div>
      ${orders
        .map(
          (o) => `<div class="tr">
        <div class="cust"><div class="cust-av" style="background:${o.c}">${o.i}</div><div class="cust-meta"><p class="cust-name">${o.name}</p><p class="cust-email">${o.email}</p></div></div>
        <p class="td c-product">${o.product}</p>
        <p class="td c-date">${o.date}</p>
        <div class="status-cell"><span class="status ${o.cls}">${o.status}</span></div>
        <p class="td amount">${o.amount}</p>
      </div>`,
        )
        .join('\n')}
    </section>
  </main>
</div>
`;

const css = `
body { background: var(--k-background); color: var(--k-text); }
a { text-decoration: none; color: inherit; }

.app { display: grid; grid-template-columns: 260px 1fr; flex: 1; min-height: 900px; }
.sidebar { display: flex; flex-direction: column; gap: 6px; padding: 24px 16px; background: var(--k-surface); border-right: 1px solid var(--k-border); }
.brand { display: flex; align-items: center; gap: 10px; padding: 4px 10px 22px; }
.brand-mark { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 10px; background: linear-gradient(135deg, var(--k-primary), #7c3aed); color: #fff; box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35); }
.brand-icon { width: 18px; height: 18px; }
.brand-name { font-family: var(--k-font-heading); font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
.menu { display: flex; flex-direction: column; gap: 2px; }
.menu-item { display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 12px; border-radius: 10px; color: var(--k-muted); font-size: 14px; font-weight: 600; transition: background-color .15s ease, color .15s ease; }
.menu-item:hover { background: var(--k-background); color: var(--k-text); }
.menu-active { background: rgba(79, 70, 229, 0.08); color: var(--k-primary); }
.micon { width: 19px; height: 19px; }
.menu-count { margin-left: auto; padding: 1px 8px; border-radius: 999px; background: var(--k-background); color: var(--k-muted); font-size: 12px; }
.menu-label { margin: 22px 12px 6px; color: var(--k-muted); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.spaces { display: flex; flex-direction: column; gap: 2px; }
.space { display: flex; align-items: center; gap: 12px; height: 36px; padding: 0 12px; border-radius: 10px; font-size: 14px; font-weight: 500; color: var(--k-text); transition: background-color .15s ease; }
.space:hover { background: var(--k-background); }
.space-dot { width: 10px; height: 10px; border-radius: 3px; }
.s1 { background: var(--k-primary); }
.s2 { background: var(--k-accent); }
.s3 { background: #f79009; }
.upgrade { display: flex; flex-direction: column; gap: 8px; margin-top: auto; padding: 18px; border-radius: 16px; background: radial-gradient(100% 120% at 100% 0%, rgba(6, 182, 212, 0.35), transparent 55%), linear-gradient(145deg, #4f46e5, #312e81); color: #fff; }
.upgrade-title { font-size: 15px; font-weight: 700; }
.upgrade-text { font-size: 13px; line-height: 1.5; opacity: 0.85; }
.upgrade-btn { display: flex; align-items: center; justify-content: center; height: 36px; margin-top: 6px; border-radius: 10px; background: #fff; color: #312e81; font-size: 13px; font-weight: 700; transition: transform .2s ease; }
.upgrade-btn:hover { transform: translateY(-1px); }

.main { display: flex; flex-direction: column; gap: 24px; padding: 28px 36px 40px; min-width: 0; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 24px; animation: rise .7s cubic-bezier(.2,.7,.2,1) backwards; }
.greeting { display: flex; flex-direction: column; gap: 4px; }
.title { font-size: 28px; font-weight: 800; letter-spacing: -0.025em; }
.subtitle { color: var(--k-muted); font-size: 15px; }
.top-actions { display: flex; align-items: center; gap: 10px; }
.search { display: flex; align-items: center; gap: 8px; width: 280px; height: 42px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--k-border); background: var(--k-surface); }
.search-icon { width: 17px; height: 17px; color: var(--k-muted); }
.search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: 14px; color: var(--k-text); }
.icon-btn { display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 12px; border: 1px solid var(--k-border); background: var(--k-surface); color: var(--k-text); transition: background-color .15s ease; }
.icon-btn:hover { background: var(--k-background); }
.ib-icon { width: 18px; height: 18px; }
.primary-btn { display: flex; align-items: center; gap: 8px; height: 42px; padding: 0 16px; border-radius: 12px; background: var(--k-primary); color: #fff; font-size: 14px; font-weight: 700; box-shadow: 0 6px 16px rgba(79, 70, 229, 0.3); transition: transform .2s ease, box-shadow .2s ease; }
.primary-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(79, 70, 229, 0.38); }
.avatar { display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, #fdb022, #f97066); color: #fff; font-size: 14px; font-weight: 800; }

.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.kpi { display: flex; flex-direction: column; gap: 10px; padding: 20px; border-radius: 18px; background: var(--k-surface); border: 1px solid var(--k-border); box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04); transition: transform .25s ease, box-shadow .25s ease; animation: rise .8s cubic-bezier(.2,.7,.2,1) .08s backwards; }
.kpi:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(16, 24, 40, 0.08); }
.kpi-top { display: flex; align-items: center; justify-content: space-between; }
.kpi-label { color: var(--k-muted); font-size: 14px; font-weight: 600; }
.badge { padding: 3px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.badge-up { background: rgba(18, 183, 106, 0.12); color: #067647; }
.badge-down { background: rgba(240, 68, 56, 0.1); color: #b42318; }
.kpi-value { font-family: var(--k-font-heading); font-size: 30px; font-weight: 800; letter-spacing: -0.03em; }
.spark { display: flex; align-items: flex-end; gap: 4px; height: 40px; }
.spark-bar { flex: 1; border-radius: 3px; background: linear-gradient(180deg, var(--k-primary), rgba(79, 70, 229, 0.25)); }
.spark-down { background: linear-gradient(180deg, #f97066, rgba(249, 112, 102, 0.25)); }

.row { display: grid; grid-template-columns: 1.8fr 1fr; gap: 20px; animation: rise .9s cubic-bezier(.2,.7,.2,1) .16s backwards; }
.card { display: flex; flex-direction: column; gap: 18px; padding: 24px; border-radius: 18px; background: var(--k-surface); border: 1px solid var(--k-border); box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04); }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.card-title { font-size: 18px; font-weight: 800; letter-spacing: -0.015em; }
.card-sub { color: var(--k-muted); font-size: 13px; margin-top: 2px; }
.tabs { display: flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--k-background); }
.tab { padding: 6px 12px; border-radius: 8px; color: var(--k-muted); font-size: 13px; font-weight: 600; }
.tab-active { background: var(--k-surface); color: var(--k-text); box-shadow: 0 1px 3px rgba(16, 24, 40, 0.1); }
.legend { display: flex; gap: 20px; }
.legend-item { display: flex; align-items: center; gap: 8px; color: var(--k-muted); font-size: 13px; font-weight: 600; }
.lg { width: 10px; height: 10px; border-radius: 3px; }
.lg-a { background: var(--k-primary); }
.lg-b { background: #c7d2fe; }
.chart { display: flex; gap: 10px; height: 260px; padding-top: 8px; }
.col { display: flex; flex-direction: column; align-items: center; gap: 10px; flex: 1; }
.bars { display: flex; align-items: flex-end; justify-content: center; gap: 4px; flex: 1; width: 100%; }
.b { width: 40%; max-width: 16px; border-radius: 6px 6px 2px 2px; }
.b-prev { background: #e0e7ff; }
.b-cur { background: linear-gradient(180deg, #6366f1, var(--k-primary)); }
.x { color: var(--k-muted); font-size: 12px; font-weight: 600; }

.sources { align-items: stretch; }
.donut { position: relative; display: flex; align-items: center; justify-content: center; width: 200px; height: 200px; margin: 4px auto; border-radius: 50%; background: conic-gradient(var(--k-primary) 0 42%, var(--k-accent) 42% 70%, #f79009 70% 86%, #e0e7ff 86% 100%); }
.donut-hole { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 136px; height: 136px; border-radius: 50%; background: var(--k-surface); }
.donut-value { font-family: var(--k-font-heading); font-size: 28px; font-weight: 800; letter-spacing: -0.03em; }
.donut-label { color: var(--k-muted); font-size: 13px; }
.source-list { display: flex; flex-direction: column; gap: 12px; }
.source { display: flex; align-items: center; gap: 10px; font-size: 14px; }
.sd { width: 10px; height: 10px; border-radius: 50%; }
.sd1 { background: var(--k-primary); }
.sd2 { background: var(--k-accent); }
.sd3 { background: #f79009; }
.sd4 { background: #c7d2fe; }
.source-name { flex: 1; color: var(--k-muted); font-weight: 600; }
.source-val { font-weight: 800; }

.table-card { gap: 0; animation: rise 1s cubic-bezier(.2,.7,.2,1) .24s backwards; }
.table-card .card-head { margin-bottom: 18px; }
.view-all { color: var(--k-primary); font-size: 14px; font-weight: 700; }
.thead { display: grid; grid-template-columns: 2fr 1.5fr 1.2fr 1fr 1fr; gap: 16px; padding: 12px 16px; border-radius: 10px; background: var(--k-background); }
.th { color: var(--k-muted); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.t-right { text-align: right; }
.tr { display: grid; grid-template-columns: 2fr 1.5fr 1.2fr 1fr 1fr; gap: 16px; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--k-border); transition: background-color .15s ease; }
.tr:hover { background: rgba(79, 70, 229, 0.03); }
.cust { display: flex; align-items: center; gap: 12px; min-width: 0; }
.cust-av { display: flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 50%; color: #fff; font-size: 13px; font-weight: 800; }
.cust-meta { display: flex; flex-direction: column; min-width: 0; }
.cust-name { font-size: 14px; font-weight: 700; }
.cust-email { color: var(--k-muted); font-size: 13px; }
.td { color: var(--k-muted); font-size: 14px; font-weight: 500; }
.amount { color: var(--k-text); font-weight: 800; text-align: right; }
.status-cell { display: flex; }
.status { padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.paid { background: rgba(18, 183, 106, 0.12); color: #067647; }
.pending { background: rgba(247, 144, 9, 0.14); color: #b54708; }
.refunded { background: rgba(102, 112, 133, 0.12); color: #344054; }

@keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 1024px) {
  .app { grid-template-columns: 1fr; }
  .sidebar { display: none; }
  .main { padding: 24px; }
  .search { display: none; }
  .kpis { grid-template-columns: repeat(2, 1fr); }
  .row { grid-template-columns: 1fr; }
  .thead { grid-template-columns: 2fr 1fr 1fr; }
  .tr { grid-template-columns: 2fr 1fr 1fr; }
  .c-product { display: none; }
  .c-date { display: none; }
}
@media (max-width: 640px) {
  .main { padding: 20px 16px; gap: 16px; }
  .topbar { flex-direction: column; align-items: flex-start; }
  .primary-btn { display: none; }
  .title { font-size: 24px; }
  .kpis { grid-template-columns: 1fr; gap: 12px; }
  .card { padding: 18px; }
  .card-head { flex-direction: column; }
  .chart { height: 200px; gap: 4px; }
  .x { font-size: 10px; }
  .thead { display: none; }
  .tr { grid-template-columns: 1fr auto; padding: 14px 0; }
  .status-cell { display: none; }
}
`;

export const dashboardTemplate: TemplateDef = {
  id: 'dashboard',
  name: 'SaaS dashboard',
  description: 'Analytics app with KPIs, charts & tables',
  pageName: 'Overview',
  swatch: '#4f46e5',
  tokens: {
    colors: [
      { name: 'primary', value: '#4f46e5' },
      { name: 'accent', value: '#06b6d4' },
      { name: 'text', value: '#101828' },
      { name: 'muted', value: '#667085' },
      { name: 'surface', value: '#ffffff' },
      { name: 'background', value: '#f4f5fa' },
      { name: 'border', value: '#e7e9f1' },
    ],
    fonts: { heading: 'Manrope Variable', body: 'Manrope Variable' },
    radius: 12,
  },
  html,
  css,
};
