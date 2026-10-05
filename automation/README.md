# Paid Study Autopilot

Every paid gig with a **minimum payout of $50 or more** (65 of the 232 sources in `../index.html`),
with the clicking done for you.

## Use it

1. Double-click **Start Autopilot.command** (or run `npm install` once, then `npm start`).
2. Chrome opens. Tab 1 is the control page. Fill in **Your details** once.
3. Press **Start applying**. For each gig the robot:
   - opens the sign-up page
   - rejects the cookie pop-up
   - presses Visit / Join now / Sign up / Apply
   - fills in everything it recognises from your details
4. **You** check the form, solve any captcha, press the site's own **Submit**, then press
   **Applied - next gig** in the bar at the bottom right of the page.
5. The next gig is already open in a tab, prepared while you were busy.

Chrome uses its own profile (`.browser-profile/`), so sites you log in to stay logged in.

## What it does not do

- It never presses Submit, never ticks consent boxes, never types passwords.
- It cannot solve captchas or confirm emails for you.
- Some pages need a human choice (pick a region, pick a study, sign in first). The bar says which.
  Those show as "One manual click" on the control page.

## Files

| File | What it is |
|---|---|
| `gigs.json` | The database: URL, buttons to press, pay, who qualifies, last check result |
| `overrides.json` | Hand fixes (different button names, notes, closed studies). Survives rebuilds |
| `verified.json` | Result of the last dry run per gig (where the click-through ends up) |
| `profile.json` | Your details. Created by the control page. Git-ignored |
| `state.json` | Which gigs you applied to or skipped. Git-ignored |

## Keeping it fresh

```
npm run build     # rebuild gigs.json from ../index.html (change the cutoff: node build-db.js 100)
npm run verify    # dry-run every gig headless, record where each lands (about 5 minutes)
node verify.js glg sermo   # re-check just some
```

Run `verify` now and then: sites change their buttons. A gig that fails the check shows a warning
badge. Fix it by adding `click` (button names to try) or `steps` (buttons to press in order) for that
gig in `overrides.json`, then `npm run build`.

## Daily search for new gigs (10:00 every day)

`install-schedule.sh` sets up a macOS launchd job that runs `daily.sh` at 10:00 (if the Mac is asleep, it runs on wake). It:

1. builds a prompt from `search-prompt.md` with a rotating focus (focus groups, clinical, UX/AI, expert calls, juries, panels, Seattle) and the list of sites we already have
2. runs `claude -p` with web search and page-reading tools only
3. pipes the answer through `ingest.js`, which validates every entry (https, minimum pay >= $50, no duplicate hosts, length caps) and appends the good ones to `discovered.json`
4. dry-runs each new link with the robot, drops any that will not load, rebuilds `gigs.json`
5. shows a macOS notification when something new is found. New gigs carry a "New" badge for 14 days.

Logs: `logs/YYYY-MM-DD.log`. Run it by hand: `./daily.sh`. Remove the schedule: `./install-schedule.sh --remove`.
Tune what it looks for by editing `search-prompt.md` or the `FOCUS` list in `make-prompt.js`.
New finds live in `discovered.json`; they are not added to the public `../index.html` list.
