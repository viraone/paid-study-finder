#!/usr/bin/env node
/*
  Dry-runs the click-through for every gig (nothing is typed or submitted) and records
  where it ends up in verified.json. The robot then jumps straight to that page next time.

  Usage: node verify.js [id ...]        (no ids = all gigs)
         node verify.js --show          (watch it in a visible browser, one at a time)
*/
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { openGig } = require('./robot');

const args = process.argv.slice(2);
const show = args.includes('--show');
const ids = args.filter((a) => !a.startsWith('--'));
const file = path.join(__dirname, 'verified.json');
const db = JSON.parse(fs.readFileSync(path.join(__dirname, 'gigs.json'), 'utf8'));
let verified = {};
try { verified = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }

const todo = db.gigs.filter((g) => !ids.length || ids.includes(g.id));
const CONCURRENCY = show ? 1 : 4;

async function launch() {
  const opts = { headless: !show, args: ['--no-first-run'] };
  try { return await chromium.launch({ ...opts, channel: 'chrome' }); } catch { return chromium.launch(opts); }
}

(async () => {
  const browser = await launch();
  let i = 0;
  const counts = { ready: 0, opened: 0, error: 0 };
  async function worker() {
    while (i < todo.length) {
      const gig = todo[i++];
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const started = Date.now();
      const r = await openGig(context, gig, { cookies: 'reject' }, { fromStart: true, dryRun: true });
      const entry = {
        status: r.status,
        applyUrl: r.finalUrl,
        clicked: r.clicked,
        fieldCount: r.fieldCount,
        note: r.note || null,
        at: new Date().toISOString(),
      };
      verified[gig.id] = entry;
      counts[r.status]++;
      const tag = { ready: 'READY ', opened: 'OPENED', error: 'ERROR ' }[r.status];
      console.log(`${tag} ${gig.id.padEnd(26)} ${((Date.now() - started) / 1000).toFixed(0).padStart(2)}s  clicked=${JSON.stringify(r.clicked)}  fields=${r.fieldCount}  ${r.note || ''}`);
      await context.close().catch(() => {});
      fs.writeFileSync(file, JSON.stringify(verified, null, 2));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();
  console.log(`\nDone. ready=${counts.ready}  opened(no form found)=${counts.opened}  error=${counts.error}`);
  console.log('Now run: node build-db.js   (merges the results into gigs.json)');
})();
