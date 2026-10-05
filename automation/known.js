/* Shared: every source we already have (from ../index.html and discovered.json), by id and hostname. */
const fs = require('fs');
const path = require('path');

function loadSite() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const start = html.indexOf('var G = ');
  const dbStart = html.indexOf('var DB = [');
  const end = html.indexOf('\n];', dbStart) + 3;
  const mod = { exports: {} };
  new Function('module', 'exports', html.slice(start, end) + ';module.exports={DB,CATS}')(mod, mod.exports);
  return mod.exports;
}
function readDiscovered() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'discovered.json'), 'utf8')); } catch { return []; }
}
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

function known() {
  const { DB, CATS } = loadSite();
  const items = [...DB.map((s) => ({ id: s.id, name: s.name, url: s.url })), ...readDiscovered().map((s) => ({ id: s.id, name: s.name, url: s.startUrl }))];
  return {
    ids: new Set(items.map((i) => i.id)),
    hosts: new Set(items.map((i) => host(i.url)).filter((h) => h && h !== 'google.com')),
    items, CATS,
  };
}
module.exports = { known, readDiscovered, host };
