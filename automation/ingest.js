#!/usr/bin/env node
/*
  Reads Claude's answer (stdin or a file), pulls out the JSON array of new gigs, validates every
  entry, and appends the good ones to discovered.json. Anything from the web is untrusted, so
  nothing reaches the database without passing these checks:
    - https URL, a host we do not already have
    - minimum pay is a number >= MIN_PAY, top pay >= minimum
    - text fields are plain strings with a length cap
  New gigs are then dry-run by verify.js; a link that will not even load is dropped again.
*/
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { known, readDiscovered, host } = require('./known');

const MIN_PAY = 50;
const file = process.argv[2];
const raw = file ? fs.readFileSync(file, 'utf8') : fs.readFileSync(0, 'utf8');
const a = raw.indexOf('['), b = raw.lastIndexOf(']');
let incoming = [];
try { incoming = JSON.parse(raw.slice(a, b + 1)); } catch { console.log('ingest: no JSON array found in the answer'); process.exit(0); }
if (!Array.isArray(incoming)) process.exit(0);

const k = known();
const catLabels = Object.values(k.CATS).map((c) => c.label);
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max) : '');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 40);

const added = [], rejected = [];
for (const c of incoming) {
  const why = (m) => rejected.push(`${str(c && c.name, 40) || '?'}: ${m}`);
  if (!c || typeof c !== 'object') continue;
  const name = str(c.name, 80), startUrl = str(c.startUrl, 300);
  const lo = Number(c.payLow), hi = Number(c.payHigh);
  if (!name) { why('no name'); continue; }
  if (!/^https:\/\//.test(startUrl) || !host(startUrl)) { why('start URL must be https'); continue; }
  if (!(lo >= MIN_PAY) || !(hi >= lo) || hi > 100000) { why(`minimum pay below $${MIN_PAY} or invalid`); continue; }
  const id = slug(name);
  if (!id || k.ids.has(id)) { why('already have it'); continue; }
  if (k.hosts.has(host(startUrl))) { why('already have that site'); continue; }
  const click = Array.isArray(c.click) ? c.click.map((x) => str(x, 60)).filter(Boolean).slice(0, 4) : [];
  const entry = {
    id, name,
    category: catLabels.includes(c.category) ? c.category : 'Focus groups & market research',
    payLow: lo, payHigh: hi,
    unit: str(c.unit, 30) || 'per study',
    payText: str(c.payText, 400),
    who: str(c.who, 300) || 'See the site for who qualifies.',
    how: str(c.how, 300) || 'Sign up on the site.',
    online: !!c.online, inPerson: !!c.inPerson, seattle: !!c.seattle,
    req: ['healthcare', 'pro', 'student', 'patient'].includes(c.req) ? c.req : null,
    startUrl, click, formOnPage: !!c.formOnPage,
    evidenceUrl: /^https:\/\//.test(str(c.evidenceUrl, 300)) ? str(c.evidenceUrl, 300) : null,
    addedAt: new Date().toISOString(),
  };
  k.ids.add(id); k.hosts.add(host(startUrl));
  added.push(entry);
}

const all = readDiscovered().concat(added);
fs.writeFileSync(path.join(__dirname, 'discovered.json'), JSON.stringify(all, null, 2));
console.log(`ingest: ${added.length} added, ${rejected.length} rejected`);
rejected.forEach((r) => console.log('  rejected -', r));

if (added.length) {
  // build so the new gigs exist in gigs.json, dry-run their links, drop dead ones, rebuild
  execFileSync('node', ['build-db.js'], { cwd: __dirname, stdio: 'inherit' });
  try { execFileSync('node', ['verify.js', ...added.map((g) => g.id)], { cwd: __dirname, stdio: 'inherit' }); } catch (e) { console.log('verify failed:', e.message); }
  const ver = JSON.parse(fs.readFileSync(path.join(__dirname, 'verified.json'), 'utf8'));
  const dead = new Set(added.filter((g) => ver[g.id] && ver[g.id].status === 'error').map((g) => g.id));
  if (dead.size) {
    fs.writeFileSync(path.join(__dirname, 'discovered.json'), JSON.stringify(all.filter((g) => !dead.has(g.id)), null, 2));
    console.log(`dropped ${dead.size} whose link would not load: ${[...dead].join(', ')}`);
  }
  execFileSync('node', ['build-db.js'], { cwd: __dirname, stdio: 'inherit' });
  console.log('NEW:', added.filter((g) => !dead.has(g.id)).map((g) => g.name).join(' | '));
}
