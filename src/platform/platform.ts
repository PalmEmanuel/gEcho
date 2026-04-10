import { exec } from 'node:child_process';
import type { Platform } from '../types/index.js';

export function detectPlatform(): Platform {
  return process.platform as Platform;
}

type WindowBounds = { x: number; y: number; width: number; height: number };

const FALLBACK_BOUNDS: WindowBounds = { x: 0, y: 0, width: 1920, height: 1080 };

function execAsync(cmd: string, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = exec(cmd, { timeout: timeoutMs }, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
    // Ensure the child is killed if the timeout fires (exec timeout only sets
    // an error but may leave the process running on some platforms).
    child.on('error', () => {});
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
