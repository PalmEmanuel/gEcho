#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', timeout: 3000 });
}

function getActiveWindowId() {
  const out = run('xprop', ['-root', '_NET_ACTIVE_WINDOW']);
  const m = out.match(/0x[0-9a-fA-F]+/);
  if (!m) throw new Error('No active window');
  return m[0];
}

function getWindowBounds(id) {
  const out = run('xwininfo', ['-id', id]);
  const x = parseInt(out.match(/Absolute upper-left X:\s*(-?\d+)/)[1], 10);
  const y = parseInt(out.match(/Absolute upper-left Y:\s*(-?\d+)/)[1], 10);
  const w = parseInt(out.match(/Width:\s*(\d+)/)[1], 10);
  const h = parseInt(out.match(/Height:\s*(\d+)/)[1], 10);
  return { x, y, width: w, height: h };
}

function getDisplayIndex(bounds) {
  const out = run('xrandr', []);
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const regex = /\bconnected\b[^0-9]*(\d+)x(\d+)\+(\d+)\+(\d+)/g;
  let m, i = 0;
  while ((m = regex.exec(out))) {
    const [, w, h, ox, oy] = m.map(Number);
    if (cx >= ox && cx < ox + w && cy >= oy && cy < oy + h) return i;
    i++;
  }
  return 0;
}

const fallback = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, displayIndex: 0 };
try {
  const id = getActiveWindowId();
  const bounds = getWindowBounds(id);
  process.stdout.write(JSON.stringify({ bounds, displayIndex: getDisplayIndex(bounds) }) + '\n');
} catch {
  process.stdout.write(JSON.stringify(fallback) + '\n');
}
