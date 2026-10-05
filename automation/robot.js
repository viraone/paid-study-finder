/*
  The robot. Given a gig it:
    1. opens the sign-up page
    2. dismisses the cookie banner (reject by default, see profile.cookies)
    3. presses the Visit / Join now / Sign up / Apply button(s)
    4. pre-fills every empty field it recognises from profile.json
  It never presses Submit, never ticks consent boxes and never types passwords.
*/
const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Pretty labels for the banner */
const FIELD_LABEL = {
  firstName: 'first name', lastName: 'last name', fullName: 'name', email: 'email', phone: 'phone', zip: 'zip',
  city: 'city', state: 'state', country: 'country', address1: 'address', birthdate: 'birthday', birthMonth: 'birth month',
  birthDay: 'birth day', birthYear: 'birth year', age: 'age', gender: 'gender', company: 'employer',
  jobTitle: 'job title', industry: 'industry', linkedin: 'LinkedIn',
};

/* Turn profile.json into the value (or list of acceptable values) for each field key */
function valuesFor(p) {
  const v = {};
  const set = (k, x) => { if (x !== undefined && x !== null && String(x).trim() !== '') v[k] = x; };
  set('firstName', p.firstName);
  set('lastName', p.lastName);
  set('fullName', p.fullName || [p.firstName, p.lastName].filter(Boolean).join(' '));
  set('email', p.email);
  set('phone', p.phone);
  set('zip', p.zip);
  set('city', p.city);
  const abbr = String(p.state || '').toUpperCase();
  set('state', p.state && abbr.length === 2 && US_STATES[abbr] ? [abbr, US_STATES[abbr]] : p.state);
  set('country', p.country ? [p.country, p.country === 'US' ? 'United States' : p.country] : undefined);
  set('address1', p.address1);
  if (p.birthdate && /^\d{4}-\d{2}-\d{2}$/.test(p.birthdate)) {
    const [y, m, d] = p.birthdate.split('-');
    set('birthdate', { iso: p.birthdate, us: `${m}/${d}/${y}` });
    set('birthYear', [y]);
    set('birthMonth', [String(Number(m)), m, MONTHS[Number(m) - 1]]);
    set('birthDay', [String(Number(d)), d]);
    const age = Math.floor((Date.now() - new Date(p.birthdate).getTime()) / 31557600000);
    set('age', age);
  }
  set('age', p.age);
  set('gender', p.gender ? [p.gender] : undefined);
  set('company', p.employer);
  set('jobTitle', p.jobTitle);
  set('industry', p.industry);
  set('linkedin', p.linkedin);
  return v;
}

/* Runs inside the page. Marks fillable inputs with data-ap-id and fills <select>s itself. */
function scanFields(args) {
  const { rules, values, startId } = args;
  const re = rules.map(([key, src]) => [key, new RegExp(src, 'i')]);
  const out = [];
  let id = startId;
  const els = Array.from(document.querySelectorAll('input,select,textarea'));
  for (const el of els) {
    if (el.dataset.apDone) continue;
    const tag = el.tagName;
    const t = (el.type || '').toLowerCase();
    if (['hidden', 'submit', 'button', 'checkbox', 'radio', 'password', 'file', 'search', 'image', 'reset', 'range', 'color'].includes(t)) continue;
    if (el.disabled || el.readOnly) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width < 4 || r.height < 4 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.closest('nav,[role=search],[role=navigation],form[action*=search],form[role=search]')) continue;
    if (tag !== 'SELECT' && el.value) continue;
    const labelText = (el.labels ? Array.from(el.labels).map((l) => l.textContent).join(' ') : '') +
      ' ' + (el.getAttribute('aria-labelledby') || '').split(/\s+/).map((i) => (document.getElementById(i) || {}).textContent || '').join(' ');
    const desc = [
      el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.title, labelText,
      el.autocomplete ? 'autocomplete:' + el.autocomplete : '', t === 'email' ? 'email' : '', t === 'tel' ? 'phone' : '',
    ].join(' ').replace(/\s+/g, ' ').toLowerCase();
    let key = null;
    for (const [k, rx] of re) { if (rx.test(desc)) { key = k; break; } }
    if (!key || key === 'skip') continue;
    // "Confirm email" style fields still take the same value; an email-looking field type forces email
    if (t === 'email' && key !== 'email') key = 'email';
    const val = values[key];
    if (val === undefined) continue;

    if (tag === 'SELECT') {
      const cands = (Array.isArray(val) ? val : [val]).map((x) => String(x).toLowerCase().trim());
      const opt = Array.from(el.options).find((o) => cands.includes(o.text.toLowerCase().trim()) || cands.includes(String(o.value).toLowerCase().trim()));
      if (opt && !opt.disabled) {
        el.value = opt.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dataset.apDone = '1';
        out.push({ key, select: true });
      }
      continue;
    }
    let text;
    if (key === 'birthdate') {
      text = t === 'date' ? val.iso : val.us;
    } else {
      text = Array.isArray(val) ? val[0] : val;
    }
    el.dataset.apId = String(id);
    out.push({ key, id: id++, text: String(text) });
  }
  return out;
}

const RULES = [
  ['skip', 'user[\\s_-]*name|login|captcha|coupon|promo|referr|search|subject|message|comment|how did you|hear about|describe|why |tell us|other'],
  ['firstName', 'autocomplete:given-name|first[\\s_-]*name|f[\\s_-]*name|forename|given[\\s_-]*name'],
  ['lastName', 'autocomplete:family-name|last[\\s_-]*name|l[\\s_-]*name|surname|family[\\s_-]*name'],
  ['email', 'e-?mail'],
  ['phone', 'phone|mobile|cell|\\btel\\b|autocomplete:tel'],
  ['zip', 'zip|postal|post code|postcode'],
  ['linkedin', 'linkedin'],
  ['birthMonth', '(birth|dob|bday).*month|month.*(birth|dob)'],
  ['birthDay', '(birth|dob|bday).*day|day.*(birth|dob)'],
  ['birthYear', '(birth|dob|bday).*year|year.*(birth|dob)'],
  ['birthdate', 'birth|dob|bday|date of birth'],
  ['age', '\\bage\\b'],
  ['gender', 'gender|\\bsex\\b'],
  ['company', 'company|employer|organi[sz]ation|workplace|business name|autocomplete:organization'],
  ['jobTitle', 'job[\\s_-]*title|occupation|profession|current role|your role|position|autocomplete:organization-title'],
  ['industry', 'industry|sector'],
  ['city', 'city|town|address-level2'],
  ['country', 'country'],
  ['state', 'address-level1|\\bstate\\b|province|region'],
  ['address1', 'street|address-line1|address[\\s_-]*1|\\baddress\\b'],
  ['fullName', 'full[\\s_-]*name|your name|autocomplete:name|^name$|\\bname\\b'],
];

/* Fill every recognised empty field on the page and its iframes. Returns the keys filled. */
async function prefill(page, profile) {
  const values = valuesFor(profile);
  if (!Object.keys(values).length) return [];
  const filled = [];
  let nextId = 1;
  for (const frame of page.frames()) {
    let found;
    try {
      found = await frame.evaluate(scanFields, { rules: RULES, values, startId: nextId });
    } catch { continue; }
    for (const f of found) {
      if (f.select) { filled.push(f.key); continue; }
      nextId = Math.max(nextId, f.id + 1);
      try {
        await frame.locator(`[data-ap-id="${f.id}"]`).first().fill(f.text, { timeout: 2000 });
        await frame.evaluate((i) => {
          const el = document.querySelector(`[data-ap-id="${i}"]`);
          if (el) { el.dataset.apDone = '1'; el.style.outline = '2px solid #0A7A4A'; el.style.outlineOffset = '1px'; }
        }, f.id);
        filled.push(f.key);
      } catch { /* field vanished or refused input; leave it for the user */ }
    }
  }
  return filled;
}

/* How many empty-looking visible form fields are on the page (to tell "form is here" from "landing page") */
async function countFields(page) {
  let n = 0;
  for (const frame of page.frames()) {
    try {
      n += await frame.evaluate(() => Array.from(document.querySelectorAll('input,select,textarea')).filter((el) => {
        const t = (el.type || '').toLowerCase();
        if (['hidden', 'submit', 'button', 'search', 'image', 'reset'].includes(t)) return false;
        if (el.closest('nav,[role=search],form[action*=search]')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden';
      }).length);
    } catch { /* cross-origin or detached frame */ }
  }
  return n;
}

async function settle(page, ms = 1200) {
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 3500 }).catch(() => {});
  await sleep(ms);
}

async function dismissCookies(page, mode) {
  if (mode === 'leave') return false;
  const reject = /^\s*(reject( all)?|decline( all)?|deny( all)?|(only )?necessary( cookies)?( only)?|essential( cookies)? only|no,? thanks?)\s*$/i;
  const accept = /^\s*(accept( all)?( cookies)?|allow all( cookies)?|i agree|agree|got it|ok(ay)?)\s*$/i;
  const pick = async (rx) => {
    for (const frame of page.frames()) {
      for (const role of ['button', 'link']) {
        const loc = frame.getByRole(role, { name: rx });
        const n = Math.min(await loc.count().catch(() => 0), 3);
        for (let i = 0; i < n; i++) {
          const el = loc.nth(i);
          if (await el.isVisible().catch(() => false)) {
            await el.click({ timeout: 2000 }).catch(() => {});
            await sleep(400);
            return true;
          }
        }
      }
    }
    return false;
  };
  if (await pick(reject)) return true;
  if (mode === 'accept') return pick(accept);
  return false;
}

const NEVER_CLICK = /sign[\s-]?in|log[\s-]?in|researcher|for business|for companies|hire|post a|client|pricing|demo|contact sales|book a/i;
const GENERIC_JOIN = /^\s*(join( now| today| us| free| the panel)?|sign[\s-]?up( free| now| today| here)?|register( now| here| today)?|apply( now| here| today)?|get started( free| now)?|become an? [\w\s-]{2,30}|participate( now)?|take part|start now|get paid)\s*[→›>»!]*\s*$/i;

/* Press the first visible control matching any of the labels. Returns the page that results (may be a popup). */
async function pressOne(page, matcher, exact) {
  const tries = [
    page.getByRole('link', { name: matcher, exact }),
    page.getByRole('button', { name: matcher, exact }),
    page.getByText(matcher, { exact }),
  ];
  for (const loc of tries) {
    const n = Math.min(await loc.count().catch(() => 0), 6);
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const raw = ((await el.innerText({ timeout: 800 }).catch(() => '')) || '').trim();
      const text = raw.split('\n')[0].trim().slice(0, 60);
      if (NEVER_CLICK.test(text)) continue;
      const popupP = page.waitForEvent('popup', { timeout: 3000 }).catch(() => null);
      try {
        await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
        await el.click({ timeout: 4000 });
      } catch { continue; }
      const popup = await popupP;
      if (popup) {
        await settle(popup);
        return { page: popup, label: text };
      }
      await settle(page, 900);
      return { page, label: text };
    }
  }
  return null;
}

/*
  Open a gig and get it as far as automation safely can.
  Returns { page, status, clicked, filled, fieldCount, finalUrl, note }
    status: "ready"   a form is on screen (and was pre-filled where recognised)
            "opened"  page is open but the robot could not find the form; the user presses the named button
            "error"   page would not load
*/
async function openGigInner(context, gig, profile, opts, state) {
  const page = state.page;
  const clicked = state.clicked;
  let cur = page;
  const result = (extra) => ({ page: cur, clicked, finalUrl: cur.url(), ...extra });
  try {
    const trusted = gig.verified && gig.verified.applyUrl && gig.verified.applyUrl !== gig.startUrl &&
      !/token|session|sid=|nonce|code=/i.test(gig.verified.applyUrl);
    const target = opts.fromStart || !trusted ? gig.startUrl : gig.verified.applyUrl;
    await cur.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await settle(cur, 1500);
    await dismissCookies(cur, profile.cookies || 'reject');

    const usedShortcut = target !== gig.startUrl;
    let fields = await countFields(cur);

    // Press the listed buttons unless the form is already here or we jumped straight to the verified page.
    if (!usedShortcut && gig.steps && gig.steps.length) {
      for (const label of gig.steps) {
        const hit = await pressOne(cur, label, false);
        if (!hit) break;
        clicked.push(hit.label || label);
        cur = hit.page;
        await dismissCookies(cur, profile.cookies || 'reject');
      }
      fields = await countFields(cur);
    } else if (!usedShortcut && !(gig.formOnPage && fields > 0)) {
      for (const label of gig.click || []) {
        const hit = await pressOne(cur, label, false);
        if (hit) {
          clicked.push(hit.label || label);
          cur = hit.page;
          await dismissCookies(cur, profile.cookies || 'reject');
          fields = await countFields(cur);
          break;
        }
      }
    }

    // Nothing worked and no form: try the usual "Join now / Sign up / Apply" buttons.
    if (fields === 0) {
      const hit = await pressOne(cur, GENERIC_JOIN, false);
      if (hit) {
        clicked.push(hit.label);
        cur = hit.page;
        await dismissCookies(cur, profile.cookies || 'reject');
        fields = await countFields(cur);
      }
    }

    // A modal, survey or single-page app may still be loading: look for up to 9 more seconds.
    for (let t = 0; t < 9 && fields === 0; t++) {
      await sleep(1000);
      fields = await countFields(cur);
      if (fields === 0 && t === 3) {
        const hit = await pressOne(cur, GENERIC_JOIN, false);
        if (hit) { clicked.push(hit.label); cur = hit.page; }
      }
    }

    const filled = fields > 0 && !opts.dryRun ? await prefill(cur, profile) : [];
    if (filled.length) { await sleep(500); await prefill(cur, profile).then((more) => filled.push(...more)); }
    return result({ status: fields > 0 ? 'ready' : 'opened', filled, fieldCount: fields });
  } catch (err) {
    return result({ status: 'error', filled: [], fieldCount: 0, note: String(err.message || err).split('\n')[0] });
  }
}

/* Whole-gig time limit so one stubborn site can never freeze the queue. */
async function openGig(context, gig, profile, opts = {}) {
  const state = { page: opts.page || (await context.newPage()), clicked: [] };
  const limit = opts.timeoutMs || 90000;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({
      page: state.page, clicked: state.clicked, finalUrl: state.page.url(), status: 'opened', filled: [], fieldCount: 0,
      note: 'This site was slow. Its page is open; look for the sign-up button.',
    }), limit);
  });
  try { return await Promise.race([openGigInner(context, gig, profile, opts, state), timeout]); } finally { clearTimeout(timer); }
}

module.exports = { openGig, prefill, countFields, FIELD_LABEL, sleep };
