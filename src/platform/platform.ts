import { exec } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Platform } from '../types/index.js';

export function detectPlatform(): Platform {
  return process.platform as Platform;
}

type WindowBounds = { x: number; y: number; width: number; height: number };

const FALLBACK_BOUNDS: WindowBounds = { x: 0, y: 0, width: 1920, height: 1080 };

function execAsync(cmd: string, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

export async function getWindowBounds(): Promise<WindowBounds> {
  const platform = detectPlatform();

  if (platform === 'darwin') {
    try {
      const out = await execAsync(
        `osascript -e 'tell application "Visual Studio Code" to get bounds of window 1'`
      );
      // AppleScript returns: "x1, y1, x2, y2"
      const parts = out.trim().split(',').map(s => parseInt(s.trim(), 10));
      if (parts.length === 4 && parts.every(n => !isNaN(n))) {
        const [x1, y1, x2, y2] = parts as [number, number, number, number];
        return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
      }
    } catch {
      // fall through to fallback
    }
    return FALLBACK_BOUNDS;
  }

  if (platform === 'linux') {
    try {
      const out = await execAsync(
        `xdotool search --name "Visual Studio Code" getwindowgeometry --shell`
      );
      const x = /X=(\d+)/.exec(out)?.[1];
      const y = /Y=(\d+)/.exec(out)?.[1];
      const width = /WIDTH=(\d+)/.exec(out)?.[1];
      const height = /HEIGHT=(\d+)/.exec(out)?.[1];
      if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
        return {
          x: parseInt(x, 10),
          y: parseInt(y, 10),
          width: parseInt(width, 10),
          height: parseInt(height, 10),
        };
      }
    } catch {
      // fall through to fallback
    }
    return FALLBACK_BOUNDS;
  }

  if (platform === 'win32') {
    try {
      const ps = [
        `$p = Get-Process -Name 'Code' -ErrorAction SilentlyContinue | Select-Object -First 1;`,
        `if ($p) {`,
        `  $h = $p.MainWindowHandle;`,
        `  Add-Type -AssemblyName System.Windows.Forms;`,
        `  $b = [System.Windows.Forms.Screen]::FromHandle($h).WorkingArea;`,
        `  "$($b.X),$($b.Y),$($b.Width),$($b.Height)"`,
        `}`,
      ].join(' ');
      const out = await execAsync(`powershell -NoProfile -Command "${ps}"`);
      const parts = out.trim().split(',').map(s => parseInt(s.trim(), 10));
      if (parts.length === 4 && parts.every(n => !isNaN(n))) {
        const [x, y, width, height] = parts as [number, number, number, number];
        return { x, y, width, height };
      }
    } catch {
      // fall through to fallback
    }
    return FALLBACK_BOUNDS;
  }

  return FALLBACK_BOUNDS;
}

/**
 * Returns the 0-based index of the physical screen that VS Code's window is currently on.
 * Uses NSScreen via osascript to match the window's left edge against screen frames.
 * Falls back to 0 on any failure (safe default — first screen).
 * macOS only; always returns 0 on other platforms.
 */
export async function getWindowDisplayIndex(): Promise<number> {
  if (detectPlatform() !== 'darwin') {
    return 0;
  }

  const script = [
    'use framework "AppKit"',
    'use scripting additions',
    'tell application "Visual Studio Code"',
    '  set wb to bounds of window 1',
    '  set wx to (item 1 of wb) as integer',
    'end tell',
    'set theScreens to current application\'s NSScreen\'s screens() as list',
    'set idx to 0',
    'repeat with i from 1 to count of theScreens',
    '  set s to item i of theScreens',
    '  set f to s\'s frame()',
    '  set sX to (f\'s origin\'s x) as integer',
    '  set sW to (f\'s size\'s width) as integer',
    '  if wx >= sX and wx < (sX + sW) then',
    '    set idx to (i - 1)',
    '  end if',
    'end repeat',
    'return idx',
  ].join('\n');

  const tmpFile = join(tmpdir(), `gecho-screen-idx-${Date.now()}.scpt`);
  try {
    await writeFile(tmpFile, script, 'utf8');
    const out = await execAsync(`osascript "${tmpFile}"`, 3000);
    const idx = parseInt(out.trim(), 10);
    return isNaN(idx) ? 0 : idx;
  } catch {
    return 0;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}
