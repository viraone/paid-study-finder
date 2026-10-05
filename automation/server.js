#!/usr/bin/env node
/*
  Paid Study Autopilot.   Run:  npm start

  Opens one Chrome window (its own profile, so your logins stay saved). Tab 1 is the control
  page. Press Apply on a gig and a new tab opens already clicked through and pre-filled.
  You submit, press "Applied, next" in the little bar at the bottom right, and the next gig
  (prepared in the background while you worked) is on screen.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { openGig, FIELD_LABEL, sleep } = require('./robot');

const PORT = Number(process.env.PORT || 3737);
const DIR = __dirname;
const STATE_FILE = path.join(DIR, 'state.json');
const PROFILE_FILE = path.join(DIR, 'profile.json');
const PROFILE_KEYS = ['firstName', 'lastName', 'email', 'phone', 'zip', 'city', 'state', 'country', 'address1', 'birthdate',
  'gender', 'employer', 'jobTitle', 'industry', 'linkedin', 'cookies', 'prefetch'];

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } };
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));
const loadGigs = () => readJson(path.join(DIR, 'gigs.json'), { gigs: [] }).gigs;
const loadProfile = () => ({ cookies: 'reject', prefetch: true, country: 'US', ...readJson(PROFILE_FILE, {}) });

let state = readJson(STATE_FILE, {});           // id -> { status: applied|skipped, at }
const saveState = () => writeJson(STATE_FILE, state);

/* ---------- browser ---------- */
let context = null;
let launching = null;
const meta = new Map();                          // page -> { gig, result }
let queue = [];                                  // ids still to do, in order
let current = null;                              // { id, gig, page, result }
const prepared = new Map();                      // id -> Promise<{ page, result }>
let busy = false;

async function getContext() {
  if (context) return context;
  if (launching) return launching;
  launching = (async () => {
    const opts = {
      headless: !!process.env.HEADLESS, viewport: null,
      args: ['--no-first-run', '--no-default-browser-check', '--start-maximized'],
    };
    const dir = path.join(DIR, '.browser-profile');
    let ctx;
    try { ctx = await chromium.launchPersistentContext(dir, { ...opts, channel: 'chrome' }); }
    catch { ctx = await chromium.launchPersistentContext(dir, opts); }
    await ctx.exposeBinding('__autopilot', async ({ page }, action) => { await onBannerAction(page, action); });
    ctx.on('close', () => { context = null; launching = null; current = null; prepared.clear(); meta.clear(); });
    const first = ctx.pages()[0] || (await ctx.newPage());
    await first.goto(`http://127.0.0.1:${PORT}/`).catch(() => {});
    context = ctx;
    return ctx;
  })();
  try { return await launching; } finally { launching = null; }
}

/* ---------- the bar shown on top of each gig page ---------- */
async function injectBanner(page) {
  const m = meta.get(page);
  if (!m) return;
  const { gig, result } = m;
  const left = queue.filter((id) => !state[id]).length;
  let msg;
  if (result.status === 'ready') {
    const names = [...new Set((result.filled || []).map((k) => FIELD_LABEL[k] || k))];
    msg = names.length
      ? `Filled in: ${names.join(', ')}. Check it, finish any captcha, then press the site's own Submit.`
      : 'The form is on screen. Fill it in, then press the site’s own Submit.';
  } else if (result.status === 'opened') {
    const g = (gig.guide || []).find((x) => x.what && !/skip/i.test(x.what));
    msg = `I couldn’t find the form on this page.${g ? ` Look for: “${g.button}”.` : ''}`;
  } else {
    msg = `This page would not load${result.note ? ` (${result.note})` : ''}. Try again later or skip.`;
  }
  const info = { name: gig.name, msg, left, pay: `$${gig.payLow}${gig.payHigh !== gig.payLow ? '–$' + gig.payHigh : ''} ${gig.unit || ''}`.trim() };
  await page.evaluate((i) => {
    const old = document.getElementById('__autopilot_bar'); if (old) old.remove();
    const host = document.createElement('div');
    host.id = '__autopilot_bar';
    host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .b{font:14px/1.4 -apple-system,system-ui,sans-serif;background:#14181F;color:#fff;border-radius:14px;padding:14px 16px;width:340px;box-shadow:0 8px 30px rgba(0,0,0,.35)}
      .t{font-weight:700;margin:0 0 2px}.p{color:#7FE3B1;font-weight:600}.m{margin:6px 0 12px;color:#D5DAE1}
      .r{display:flex;gap:8px;flex-wrap:wrap}
      button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:9px 12px;cursor:pointer}
      .go{background:#7FE3B1;color:#06301D;flex:1 1 100%}.o{background:#2A313B;color:#fff}
      .l{margin-top:8px;color:#8D97A4;font-size:12px}
    </style><div class="b"><p class="t"></p><div class="p"></div><p class="m"></p>
      <div class="r"><button class="go" data-a="applied">✓ Applied – next gig</button>
      <button class="o" data-a="skip">Skip</button><button class="o" data-a="later">Later</button>
      <button class="o" data-a="hide">Hide bar</button></div><div class="l"></div></div>`;
    root.querySelector('.t').textContent = i.name;
    root.querySelector('.p').textContent = i.pay;
    root.querySelector('.m').textContent = i.msg;
    root.querySelector('.l').textContent = i.left > 0 ? `${i.left} more in your queue` : 'Last one in your queue';
    root.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.a === 'hide') host.remove(); else window.__autopilot(b.dataset.a);
    }));
    document.documentElement.appendChild(host);
  }, info).catch(() => {});
}

function track(page, gig, result) {
  meta.set(page, { gig, result });
  page.on('domcontentloaded', () => { if (meta.has(page)) injectBanner(page); });
  page.on('close', () => { meta.delete(page); if (current && current.page === page) current = null; });
}

/* ---------- queue ---------- */
function prepare(id) {
  if (prepared.has(id)) return prepared.get(id);
  const gig = loadGigs().find((g) => g.id === id);
  if (!gig) return null;
  const p = (async () => {
    const ctx = await getContext();
    const page = await ctx.newPage();
    if (current && !current.page.isClosed()) current.page.bringToFront().catch(() => {});
    const result = await openGig(ctx, gig, loadProfile(), { page });
    if (result.page !== page) await page.close().catch(() => {});   // the button opened a new tab; keep only that one
    if (current && !current.page.isClosed()) current.page.bringToFront().catch(() => {});
    return { gig, page: result.page, result };
  })();
  prepared.set(id, p);
  return p;
}

function nextId() { return queue.find((id) => !state[id]); }

async function advance() {
  if (busy) return;
  busy = true;
  try {
    const id = nextId();
    if (!id) { current = null; return; }
    const got = await prepare(id);
    prepared.delete(id);
    queue = queue.filter((x) => x !== id);
    if (!got) return;
    current = { id, gig: got.gig, page: got.page, result: got.result };
    track(got.page, got.gig, got.result);
    await got.page.bringToFront().catch(() => {});
    await injectBanner(got.page);
    if (loadProfile().prefetch !== false) {
      const upcoming = queue.find((x) => !state[x]);
      if (upcoming) prepare(upcoming);
    }
  } finally { busy = false; }
}

async function onBannerAction(page, action) {
  const m = meta.get(page);
  if (!m) return;
  const id = m.gig.id;
  if (action === 'applied') state[id] = { status: 'applied', at: new Date().toISOString() };
  else if (action === 'skip') state[id] = { status: 'skipped', at: new Date().toISOString() };
  else if (action === 'later' && queue.some((x) => x !== id && !state[x])) queue.push(id);
  saveState();
  if (current && current.page === page) current = null;
  meta.delete(page);
  await page.close().catch(() => {});
  await advance();
}

async function start(ids) {
  const known = new Set(loadGigs().map((g) => g.id));
  for (const [id, p] of [...prepared]) { prepared.delete(id); p.then((r) => r.page.close()).catch(() => {}); }
  queue = ids.filter((id) => known.has(id));
  await getContext();
  await advance();
}

/* ---------- http ---------- */
function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
  });
}
const send = (res, code, obj, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(obj) : obj);
};

const server = http.createServer(async (req, res) => {
  const okHost = new RegExp(`^(127\\.0\\.0\\.1|localhost):${PORT}$`).test(req.headers.host || '');
  if (!okHost) return send(res, 403, { error: 'bad host' });
  if (req.method === 'POST') {
    const o = req.headers.origin;
    if (o && o !== `http://127.0.0.1:${PORT}` && o !== `http://localhost:${PORT}`) return send(res, 403, { error: 'bad origin' });
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, fs.readFileSync(path.join(DIR, 'app.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/gigs') {
      const gigs = loadGigs().map((g) => ({ ...g, done: state[g.id] || null }));
      return send(res, 200, { gigs, hasProfile: !!loadProfile().email });
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return send(res, 200, {
        browserOpen: !!context,
        current: current ? { id: current.id, name: current.gig.name, status: current.result.status, filled: current.result.filled } : null,
        remaining: queue.filter((id) => !state[id]).length,
        preparing: [...prepared.keys()],
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/profile') return send(res, 200, loadProfile());
    if (req.method === 'POST' && url.pathname === '/api/profile') {
      const b = await body(req);
      const clean = {};
      for (const k of PROFILE_KEYS) if (b[k] !== undefined && b[k] !== '') clean[k] = b[k];
      writeJson(PROFILE_FILE, clean);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/start') {
      const b = await body(req);
      if (!Array.isArray(b.ids)) return send(res, 400, { error: 'ids required' });
      start(b.ids.map(String)).catch((e) => console.error(e));
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/mark') {
      const b = await body(req);
      if (b.status) state[b.id] = { status: b.status, at: new Date().toISOString() }; else delete state[b.id];
      saveState();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/action') {
      const b = await body(req);
      if (!['applied', 'skip', 'later'].includes(b.action)) return send(res, 400, { error: 'bad action' });
      if (current) await onBannerAction(current.page, b.action);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/api/stop') {
      queue = [];
      for (const [id, p] of [...prepared]) { prepared.delete(id); p.then((r) => r.page.close()).catch(() => {}); }
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`Paid Study Autopilot: http://127.0.0.1:${PORT}`);
  if (!fs.existsSync(path.join(DIR, 'gigs.json'))) console.log('No gigs.json yet. Run: npm run build');
  await getContext().catch((e) => { console.error('Could not start Chrome:', e.message); process.exit(1); });
  console.log('Chrome is open. Tab 1 is the control page. Press Ctrl+C here to quit.');
});
process.on('SIGINT', async () => { try { if (context) await context.close(); } catch { /* already gone */ } process.exit(0); });
