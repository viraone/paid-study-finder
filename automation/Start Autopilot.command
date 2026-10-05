#!/bin/bash
# Double-click this file. First run installs what it needs, then opens the Autopilot.
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --silent
npm start
