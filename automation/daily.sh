#!/bin/bash
# Daily search for new paid gigs. Run by launchd at 10am (see install-schedule.sh), or by hand.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")" || exit 1
mkdir -p logs
LOG="logs/$(date +%F).log"
{
  echo "== $(date)"
  PROMPT="$(node make-prompt.js)"
  # Read-only web tools only: Claude can search and read pages, nothing else.
  ANSWER="$(claude -p "$PROMPT" --allowedTools "WebSearch" "WebFetch" 2>&1)"
  echo "--- answer ---"; echo "$ANSWER"; echo "--- ingest ---"
  RESULT="$(echo "$ANSWER" | node ingest.js 2>&1)"
  echo "$RESULT"
  NEW="$(echo "$RESULT" | grep -c '^NEW:')"
  if [ "$NEW" -gt 0 ]; then
    MSG="$(echo "$RESULT" | grep '^NEW:' | cut -c6- | cut -c1-120)"
    osascript -e "display notification \"$MSG\" with title \"Paid Study Autopilot: new gigs\"" 2>/dev/null
  fi
  echo "== done $(date)"
} >> "$LOG" 2>&1
