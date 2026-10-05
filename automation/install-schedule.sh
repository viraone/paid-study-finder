#!/bin/bash
# Installs (or removes with --remove) a macOS launchd job that runs daily.sh every day at 10:00.
# If the Mac is asleep at 10:00, launchd runs it when the Mac wakes.
LABEL="com.viraone.paidstudy.daily"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$1" = "--remove" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
  rm -f "$PLIST"; echo "Removed."; exit 0
fi
mkdir -p "$DIR/logs"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$DIR/daily.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardErrorPath</key><string>$DIR/logs/launchd.err</string>
  <key>StandardOutPath</key><string>$DIR/logs/launchd.out</string>
</dict></plist>
PLISTEOF
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null
launchctl bootstrap "gui/$(id -u)" "$PLIST" && echo "Installed: runs every day at 10:00. Logs in $DIR/logs/"
