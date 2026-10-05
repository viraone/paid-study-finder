#!/usr/bin/env node
/*
  Builds gigs.json: every source in ../index.html whose MINIMUM pay is $50 or more.

  For each gig it stores the sign-up URL and the exact buttons the robot has to
  press (the "go" entries from the site's "When you open the site" guide), so the
  robot can click Visit site > Join now > Sign up for you.

  Hand-fixes go in overrides.json (they survive rebuilds). Link checks done by
  verify.js are kept in verified.json (they also survive rebuilds).

  Usage: node build-db.js [minPay]      (default 50)
*/
const fs = require('fs');
const path = require('path');

const MIN_PAY = Number(process.argv[2] || 50);
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const start = html.indexOf('var G = ');
const dbStart = html.indexOf('var DB = [');
const end = html.indexOf('\n];', dbStart) + 3;
if (start < 0 || dbStart < 0 || end < 3) throw new Error('Could not find the DB in ../index.html');

const mod = { exports: {} };
new Function('module', 'exports', html.slice(start, end) + ';module.exports={DB,CATS}')(mod, mod.exports);
const { DB, CATS } = mod.exports;

const readJson = (f, fallback) => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')); } catch { return fallback; }
};
const overrides = readJson('overrides.json', {});
const verified = readJson('verified.json', {});

/* "Sign up free (left side of the first screen)" -> ["Sign up free"]
   "Continue with LinkedIn / Continue with Google" -> both
   Descriptions of a form, an email box or a contact detail are not clickable. */
function clickLabels(label) {
  const clean = label.replace(/\([^)]*\)/g, ' ').replace(/[→›>»]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.split(/\s+\/\s+/).map((s) => s.replace(/[!.:]+$/, '').trim()).filter(Boolean);
}
function isFormDescription(label) {
  const l = label.toLowerCase();
  return /^(the |no |email box|any |your )/.test(l) || /\bform\b|\bbox\b|@|\d{3}[.\-\s]\d{3}/.test(l);
}

const discovered = readJson('discovered.json', []);
const knownIds = new Set(DB.map((s) => s.id));

const gigs = DB.filter((s) => s.pay && s.pay[0] >= MIN_PAY).map((s) => {
  const go = (s.land || []).filter((l) => l[2] === 'go');
  const labels = [];
  let formOnPage = false;
  for (const [label] of go) {
    if (isFormDescription(label)) formOnPage = true;
    else labels.push(...clickLabels(label));
  }
  const gig = {
    id: s.id,
    name: s.name,
    category: CATS[s.cat] ? CATS[s.cat].label : s.cat,
    payLow: s.pay[0],
    payHigh: s.pay[1],
    unit: s.unit,
    payText: s.payText,
    who: s.who,
    how: s.how,
    online: !!s.online,
    inPerson: !!s.inPerson,
    seattle: !!s.seattle,
    req: s.req || null,
    startUrl: s.url,
    click: labels,             // buttons to press, in order of preference
    formOnPage,                // the form is already on the landing page
    guide: go.map((l) => ({ button: l[0], what: l[1] })),
  };
  Object.assign(gig, overrides[s.id] || {});
  gig.verified = verified[s.id] || null;
  return gig;
});

for (const d of discovered) {
  if (knownIds.has(d.id) || d.payLow < MIN_PAY) continue;
  const gig = { ...d, discovered: true, guide: (d.click || []).map((b) => ({ button: b, what: 'The button for you.' })) };
  Object.assign(gig, overrides[d.id] || {});
  gig.verified = verified[d.id] || null;
  gigs.push(gig);
}

gigs.sort((a, b) => b.payLow - a.payLow || b.payHigh - a.payHigh);
fs.writeFileSync(path.join(__dirname, 'gigs.json'), JSON.stringify({ minPay: MIN_PAY, builtAt: new Date().toISOString(), gigs }, null, 2));
console.log(`gigs.json: ${gigs.length} gigs with minimum pay >= $${MIN_PAY} (${discovered.length} found by the daily search, ${DB.length} sources on the site)`);
