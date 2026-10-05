#!/usr/bin/env node
/* Prints today's search prompt: the template, a rotating focus area, and the hosts we already have. */
const fs = require('fs');
const path = require('path');
const { known } = require('./known');

const FOCUS = [
  'paid in-person and online focus groups and market research recruiters in the US (especially Seattle, Portland, San Francisco, Los Angeles, New York, Chicago, Dallas)',
  'paid clinical trials and healthy-volunteer studies at US research units and hospitals',
  'UX research, usability and playtest panels, and AI data-collection studies that pay $50 or more',
  'expert networks and consulting calls (professionals paid per hour) and healthcare-professional research panels',
  'mock juries, legal research panels and university or academic studies that pay $50 or more',
  'high-paying market research panels and paid interview platforms (not tiny survey sites)',
  'paid studies in the Seattle and Pacific Northwest area: labs, universities, recruiters, and one-off studies',
];
const k = known();
const catList = Object.values(k.CATS).map((c) => c.label).join('; ');
const day = new Date().getDay();
const text = fs.readFileSync(path.join(__dirname, 'search-prompt.md'), 'utf8')
  .replace('{{FOCUS}}', FOCUS[day % FOCUS.length])
  .replace('{{CATS}}', catList)
  .replace('{{KNOWN}}', [...k.hosts].sort().join(', '));
process.stdout.write(text);
