// Mock Ollama server for tests and offline demos.
//   node tests/mock-ollama/server.mjs [port]      (or MOCK_OLLAMA_PORT=11500)
// Endpoints: /api/version, /api/tags, /api/show, /api/chat (NDJSON streaming).
// Canned outputs are chosen from the system/user prompt: page/section/component
// HTML+CSS, edit (echoes data-kid), animation JSON, SVG logo. The model named
// "*thinking*" prefixes a <think> block. Set MOCK_DELAY_MS to change chunk pacing.
import http from 'node:http';

const PORT = Number(process.argv[2] ?? process.env.MOCK_OLLAMA_PORT ?? 11434);
const DELAY = Number(process.env.MOCK_DELAY_MS ?? 14);

const MODELS = [
  { name: 'qwen2.5-coder:7b', size: 4_683_087_332, family: 'qwen2', params: '7.6B', quant: 'Q4_K_M', caps: ['completion', 'tools', 'insert'], ctx: 32768 },
  { name: 'llama3.1:8b', size: 4_920_753_328, family: 'llama', params: '8.0B', quant: 'Q4_K_M', caps: ['completion', 'tools'], ctx: 131072 },
  { name: 'gemma3:12b', size: 8_149_190_253, family: 'gemma3', params: '12.2B', quant: 'Q4_K_M', caps: ['completion', 'vision'], ctx: 131072 },
  { name: 'qwen3:8b-thinking', size: 5_225_388_164, family: 'qwen3', params: '8.2B', quant: 'Q4_K_M', caps: ['completion', 'tools', 'thinking'], ctx: 40960 },
  { name: 'nomic-embed-text:latest', size: 274_302_450, family: 'nomic-bert', params: '137M', quant: 'F16', caps: ['embedding'], ctx: 2048 },
].map((m) => ({ ...m, digest: Buffer.from(m.name).toString('hex').padEnd(64, '0').slice(0, 64) }));

// ─── Canned outputs ──────────────────────────────────────────────────────────

const PAGE_CSS = `<style>
body{background:#0b1020;color:#e7eaf6;font-family:'Inter Variable',sans-serif}
.nav{display:flex;align-items:center;justify-content:space-between;padding:20px 64px;border-bottom:1px solid #232c47}
.nav__logo{font-family:'Sora Variable',sans-serif;font-weight:800;font-size:20px;color:#fff}
.nav__links{display:flex;gap:28px;color:#8b93b0;font-size:15px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:12px 22px;border-radius:999px;background:#6d7cff;color:#fff;font-weight:600;text-decoration:none;box-shadow:0 8px 24px rgba(109,124,255,.35);transition:transform .2s ease,box-shadow .2s ease}
.btn:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(109,124,255,.55)}
.btn--ghost{background:transparent;border:1px solid #33406b;box-shadow:none;color:#e7eaf6}
.hero{display:flex;flex-direction:column;align-items:center;gap:22px;padding:110px 24px 90px;text-align:center;background:radial-gradient(900px 400px at 50% 0%,rgba(109,124,255,.28),transparent)}
.hero__eyebrow{padding:6px 14px;border-radius:999px;background:rgba(109,124,255,.16);color:#aab3ff;font-size:13px;font-weight:600;animation:fade-up .7s cubic-bezier(.16,1,.3,1) both}
.hero__title{max-width:820px;font-family:'Sora Variable',sans-serif;font-size:60px;font-weight:800;line-height:1.05;animation:fade-up .7s .08s cubic-bezier(.16,1,.3,1) both}
.hero__sub{max-width:600px;font-size:19px;color:#8b93b0;animation:fade-up .7s .16s cubic-bezier(.16,1,.3,1) both}
.hero__cta{display:flex;gap:14px;margin-top:10px;animation:fade-up .7s .24s cubic-bezier(.16,1,.3,1) both}
.features{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1160px;margin:0 auto;padding:40px 24px 90px}
.card{display:flex;flex-direction:column;gap:12px;padding:28px;border-radius:16px;background:#131a2e;border:1px solid #232c47;transition:transform .2s ease,border-color .2s ease}
.card:hover{transform:translateY(-4px);border-color:#6d7cff}
.card__icon{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:rgba(109,124,255,.16);color:#aab3ff}
.card__title{font-size:20px;font-weight:700}
.card__text{color:#8b93b0;font-size:15px;line-height:1.6}
.footer{padding:36px 64px;border-top:1px solid #232c47;color:#8b93b0;font-size:14px;display:flex;justify-content:space-between}
@keyframes fade-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@media (max-width:1024px){.features{grid-template-columns:repeat(2,1fr)}.hero__title{font-size:46px}.nav{padding:18px 32px}}
@media (max-width:640px){.features{grid-template-columns:1fr}.hero__title{font-size:34px}.nav__links{display:none}.nav{padding:16px 20px}.footer{flex-direction:column;gap:8px;padding:28px 20px}}
</style>`;

const ICON = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;

const PAGE_HTML = `<header class="nav">
  <div class="nav__logo">Lumen</div>
  <nav class="nav__links"><a>Product</a><a>Pricing</a><a>Customers</a><a>Docs</a></nav>
  <a class="btn" href="#">Get started</a>
</header>
<section class="hero">
  <span class="hero__eyebrow">New · Lumen 2.0 is here</span>
  <h1 class="hero__title">Turn meetings into decisions, automatically</h1>
  <p class="hero__sub">Lumen listens, summarizes and assigns action items so your team ships instead of scheduling follow-ups.</p>
  <div class="hero__cta"><a class="btn" href="#">Start free trial</a><a class="btn btn--ghost" href="#">Watch demo</a></div>
</section>
<section class="features">
  <article class="card"><div class="card__icon">${ICON('M12 2l3 7h7l-5.5 4.5 2 7.5L12 16.5 5.5 21l2-7.5L2 9h7z')}</div><h3 class="card__title">Instant summaries</h3><p class="card__text">Get a crisp recap within seconds of hanging up, with decisions and owners highlighted.</p></article>
  <article class="card"><div class="card__icon">${ICON('M4 12l5 5L20 6')}</div><h3 class="card__title">Action items</h3><p class="card__text">Tasks are extracted, assigned and pushed to Linear, Jira or Notion in one click.</p></article>
  <article class="card"><div class="card__icon">${ICON('M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z')}</div><h3 class="card__title">Searchable memory</h3><p class="card__text">Ask “what did we decide about pricing?” and jump to the exact moment it was said.</p></article>
</section>
<footer class="footer"><span>© 2026 Lumen Labs</span><span>Privacy · Terms · Status</span></footer>`;

const SECTION = `<style>
.pricing{padding:88px 24px;background:#f5f7fb;color:#0f172a}
.pricing__inner{max-width:1100px;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:40px}
.pricing__title{font-size:40px;font-weight:800;text-align:center;animation:fade-up .6s ease both}
.pricing__grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;width:100%}
.tier{display:flex;flex-direction:column;gap:14px;padding:32px;border-radius:16px;background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.08);transition:transform .2s ease,box-shadow .2s ease}
.tier:hover{transform:translateY(-4px);box-shadow:0 16px 36px rgba(15,23,42,.12)}
.tier--hot{background:#2563eb;color:#fff}
.tier__price{font-size:38px;font-weight:800}
.tier__btn{padding:12px;border-radius:10px;background:#0f172a;color:#fff;text-align:center;font-weight:600}
@keyframes fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
@media (max-width:1024px){.pricing__grid{grid-template-columns:1fr 1fr}}
@media (max-width:640px){.pricing__grid{grid-template-columns:1fr}.pricing__title{font-size:30px}}
</style>
<section class="pricing"><div class="pricing__inner">
  <h2 class="pricing__title">Simple pricing that scales with you</h2>
  <div class="pricing__grid">
    <div class="tier"><h3>Starter</h3><div class="tier__price">$0</div><p>For individuals trying things out.</p><a class="tier__btn" href="#">Get started</a></div>
    <div class="tier tier--hot"><h3>Team</h3><div class="tier__price">$24</div><p>Per seat, billed monthly. Unlimited meetings.</p><a class="tier__btn" href="#">Start trial</a></div>
    <div class="tier"><h3>Enterprise</h3><div class="tier__price">Custom</div><p>SSO, audit logs and dedicated support.</p><a class="tier__btn" href="#">Contact sales</a></div>
  </div>
</div></section>`;

const COMPONENT = `<style>
.login{display:flex;flex-direction:column;gap:16px;width:360px;padding:32px;border-radius:20px;background:rgba(255,255,255,.7);border:1px solid rgba(255,255,255,.8);box-shadow:0 20px 50px rgba(30,27,75,.18);font-family:'Inter Variable',sans-serif;color:#1e1b4b}
.login__title{font-size:26px;font-weight:800}
.login__input{padding:12px 14px;border-radius:10px;border:1px solid #d9d6f5;background:#fff;font-size:15px}
.login__btn{padding:13px;border-radius:10px;background:#4c1d95;color:#fff;font-weight:700;text-align:center;transition:transform .2s ease,box-shadow .2s ease}
.login__btn:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(76,29,149,.4)}
@media (max-width:640px){.login{width:100%}}
</style>
<form class="login"><h2 class="login__title">Welcome back</h2><input class="login__input" type="email" placeholder="you@company.com"><input class="login__input" type="password" placeholder="Password"><a class="login__btn" href="#">Sign in</a></form>`;

const SVG_LOGOS = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect x="24" y="24" width="208" height="208" rx="56" fill="url(#g)"/><path d="M80 176V84l48 56 48-56v92" fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><circle cx="196" cy="60" r="12" fill="#fff"/></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><circle cx="128" cy="128" r="104" fill="#0f172a"/><path d="M128 52l24 56 56 24-56 24-24 56-24-56-56-24 56-24z" fill="#fbbf24"/><circle cx="128" cy="128" r="14" fill="#0f172a"/></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><radialGradient id="r"><stop offset="0" stop-color="#f472b6"/><stop offset="1" stop-color="#7c3aed"/></radialGradient></defs><path d="M128 28c60 0 100 44 100 100s-40 100-100 100S28 188 28 128 68 28 128 28z" fill="url(#r)"/><path d="M84 132c16-36 72-36 88 0-16 28-72 28-88 0z" fill="#fff" opacity=".9"/><circle cx="128" cy="130" r="16" fill="#4c1d95"/></svg>`,
];

function editReply(user) {
  // echo the incoming HTML, tweaking the visuals so a diff is visible
  const m = /CURRENT HTML \(\d+ elements\):\n([\s\S]*?)\n\nINSTRUCTION:/.exec(user);
  let html = m ? m[1] : '';
  const instr = (/INSTRUCTION: ([\s\S]*?)\n\nReply/.exec(user)?.[1] ?? '').toLowerCase();
  html = html.replace(/<\/style>/, `.mock-edit{}\n</style>`);
  if (/alternative|redesign/.test(instr)) {
    html = html.replace('<style>', '<style>\n[data-kid]{letter-spacing:.01em}').replace(/background(-color)?:#[0-9a-f]{3,8}/i, 'background:linear-gradient(135deg,#1e1b4b,#4c1d95)');
  } else if (/dark/.test(instr)) {
    html = html.replace(/background(-color)?:#[0-9a-f]{3,8}/i, 'background:#0b1020').replace(/(^|[;{])color:#[0-9a-f]{3,8}/i, '$1color:#e7eaf6');
  } else {
    html = html.replace(/border-radius:\d+px/g, 'border-radius:999px');
    html = html.replace(/<(h[1-3])([^>]*)>([^<]*)</i, (_x, t, a, txt) => `<${t}${a}>${txt.replace(/\s*✦$/, '')} ✦<`);
  }
  return html;
}

function animationReply(user) {
  const kids = [...user.matchAll(/^\s*([a-z0-9_]+) (\w+)/gim)].map((m) => m[1]).filter((k) => k !== 'ELEMENTS');
  const uniq = [...new Set(kids)];
  const list = uniq.slice(0, 5).map((id, i) => ({
    target: id,
    name: i === 0 ? 'Rise in' : `Stagger ${i}`,
    trigger: i === 0 ? 'load' : 'inView',
    duration: 700,
    delay: i * 120,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    iterations: 1,
    stagger: i === 0 ? 0 : 90,
    keyframes: [
      { offset: 0, opacity: 0, y: 28, blur: 6 },
      { offset: 1, opacity: 1, y: 0, blur: 0 },
    ],
  }));
  return JSON.stringify({ animations: list });
}

function chooseReply(system, user, model) {
  const sys = system.toLowerCase();
  const u = user.toLowerCase();
  if (sys.includes('motion designer')) return animationReply(user);
  if (sys.includes('brand and icon designer')) {
    const v = /variant (\d+) of/.exec(user);
    const idx = v ? Number(v[1]) - 1 : 0;
    if (u.includes('__bad_svg__')) return 'Sorry, I cannot draw that.';
    return SVG_LOGOS[idx % SVG_LOGOS.length];
  }
  if (sys.includes('ui editor')) return editReply(user);
  if (sys.includes('landing page')) return PAGE_CSS + '\n' + PAGE_HTML;
  if (/\bcomponent\b/.test(sys.slice(0, 220))) return COMPONENT;
  return SECTION;
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
}

function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(b || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

function chunkText(text) {
  const out = [];
  for (let i = 0; i < text.length; ) {
    const n = 8 + Math.floor(Math.random() * 18);
    out.push(text.slice(i, i + n));
    i += n;
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/api/version') return json(res, 200, { version: '0.9.0-mock' });
  if (url.pathname === '/api/tags') {
    return json(res, 200, {
      models: MODELS.map((m) => ({
        name: m.name,
        model: m.name,
        modified_at: '2026-10-01T12:00:00Z',
        size: m.size,
        digest: m.digest,
        details: { parent_model: '', format: 'gguf', family: m.family, families: [m.family], parameter_size: m.params, quantization_level: m.quant },
      })),
    });
  }
  if (url.pathname === '/api/show' && req.method === 'POST') {
    const b = await readBody(req);
    const m = MODELS.find((x) => x.name === (b.model ?? b.name));
    if (!m) return json(res, 404, { error: `model '${b.model ?? b.name}' not found` });
    return json(res, 200, {
      capabilities: m.caps,
      details: { family: m.family, parameter_size: m.params, quantization_level: m.quant },
      model_info: { 'general.architecture': m.family, [`${m.family}.context_length`]: m.ctx },
    });
  }
  if (url.pathname === '/api/chat' && req.method === 'POST') {
    const b = await readBody(req);
    const m = MODELS.find((x) => x.name === b.model);
    if (!m) return json(res, 404, { error: `model '${b.model}' not found, try pulling it first` });
    const msgs = b.messages ?? [];
    const system = msgs.find((x) => x.role === 'system')?.content ?? '';
    const user = [...msgs].reverse().find((x) => x.role === 'user')?.content ?? '';
    let reply = chooseReply(system, user, m.name);
    if (m.caps.includes('thinking') && b.think !== false) reply = `<think>Let me plan the structure, palette and spacing before writing any code. The brief asks for a clean layout with good hierarchy.</think>\n${reply}`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson');
    let closed = false;
    res.on('close', () => (closed = true));
    const t0 = Date.now();
    const parts = chunkText(reply);
    for (const p of parts) {
      if (closed) return;
      res.write(JSON.stringify({ model: m.name, created_at: new Date().toISOString(), message: { role: 'assistant', content: p }, done: false }) + '\n');
      await sleep(DELAY);
    }
    if (closed) return;
    const dur = (Date.now() - t0) * 1e6;
    res.end(JSON.stringify({ model: m.name, created_at: new Date().toISOString(), message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', total_duration: dur, eval_count: parts.length, eval_duration: dur, prompt_eval_count: Math.round(system.length / 4) }) + '\n');
    return;
  }
  json(res, 404, { error: 'not found' });
});

server.listen(PORT, '127.0.0.1', () => console.log(`[mock-ollama] listening on http://127.0.0.1:${PORT}`));
