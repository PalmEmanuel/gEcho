#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');

const fallback = { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, displayIndex: 0 };

try {
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinHelper {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
}
public struct RECT { public int Left, Top, Right, Bottom; }
"@
$h = [WinHelper]::GetForegroundWindow()
$r = New-Object RECT
[WinHelper]::GetWindowRect($h, [ref]$r) | Out-Null
$cx = ($r.Left + $r.Right) / 2
$cy = ($r.Top + $r.Bottom) / 2
$di = 0
$i = 0
foreach ($s in [System.Windows.Forms.Screen]::AllScreens) {
  $b = $s.Bounds
  if ($cx -ge $b.X -and $cx -lt ($b.X+$b.Width) -and $cy -ge $b.Y -and $cy -lt ($b.Y+$b.Height)) { $di = $i }
  $i++
}
"$($r.Left),$($r.Top),$($r.Right-$r.Left),$($r.Bottom-$r.Top),$di"
`.trim();

  const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    encoding: 'utf8', timeout: 8000
  }).trim();
  const parts = out.split(',').map(Number);
  if (parts.length === 5 && parts.every(n => !isNaN(n))) {
    const [x, y, width, height, displayIndex] = parts;
    process.stdout.write(JSON.stringify({ bounds: { x, y, width, height }, displayIndex }) + '\n');
  } else {
    process.stdout.write(JSON.stringify(fallback) + '\n');
  }
} catch {
  process.stdout.write(JSON.stringify(fallback) + '\n');
}
