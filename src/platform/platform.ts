import { exec, execFile } from 'node:child_process';
import { mkdir, writeFile, access, constants as fsConstants } from 'node:fs/promises';
import { homedir } from 'node:os';
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

// Swift source for the display-index helper binary.
// Accepts wx and wy as command-line arguments; prints the 0-based display index.
const DISPLAY_INDEX_SOURCE = `
import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count >= 3,
      let wx = Double(args[1]),
      let wy = Double(args[2]) else {
    print(0)
    exit(0)
}

var count: UInt32 = 0
CGGetActiveDisplayList(0, nil, &count)
var displays = [CGDirectDisplayID](repeating: 0, count: Int(count))
CGGetActiveDisplayList(count, &displays, &count)

for (i, d) in displays.enumerated() {
    let b = CGDisplayBounds(d)
    if wx >= b.origin.x && wx < b.origin.x + b.size.width &&
       wy >= b.origin.y && wy < b.origin.y + b.size.height {
        print(i)
        exit(0)
    }
}
print(0)
`.trim();

/**
 * Module-level Promise that resolves to the path of the compiled display-index binary.
 * Compilation happens at most once per process lifetime; the on-disk binary at
 * ~/.cache/gecho/display-index is reused across sessions (no recompilation).
 * Reset to null on error so callers can retry.
 */
let compiledBinaryPath: Promise<string> | null = null;

async function buildDisplayIndexBinary(): Promise<string> {
  const cacheDir = join(homedir(), '.cache', 'gecho');
  const binaryPath = join(cacheDir, 'display-index');

  await mkdir(cacheDir, { recursive: true });

  // Reuse the binary from a previous session if it is already executable.
  try {
    await access(binaryPath, fsConstants.X_OK);
    return binaryPath;
  } catch { /* not cached yet — compile below */ }

  const sourcePath = join(cacheDir, 'display-index.swift');
  await writeFile(sourcePath, DISPLAY_INDEX_SOURCE, 'utf8');

  await new Promise<void>((resolve, reject) => {
    execFile('swiftc', ['-O', '-o', binaryPath, sourcePath], { timeout: 60_000 }, (err) => {
      if (err) { reject(err); } else { resolve(); }
    });
  });

  return binaryPath;
}

/**
 * Returns a Promise that resolves to the compiled display-index binary path.
 * The first call compiles the helper once with swiftc (≈10-30 s on first ever run,
 * then the on-disk binary is reused — sub-millisecond). Concurrent callers share the
 * same in-flight Promise. On error the cache is cleared so the next call may retry.
 */
function getDisplayIndexBinary(): Promise<string> {
  if (compiledBinaryPath) {
    return compiledBinaryPath;
  }
  compiledBinaryPath = buildDisplayIndexBinary().catch((err) => {
    compiledBinaryPath = null; // reset so the next caller can retry
    throw err;
  });
  return compiledBinaryPath;
}

/**
 * Returns the 0-based index of the physical screen that VS Code's window is currently on.
 * Uses a precompiled CoreGraphics helper binary (~/.cache/gecho/display-index) so that
 * repeated calls are sub-millisecond. The binary is compiled once with swiftc on first use
 * and reused on disk across VS Code sessions. No Automation permission is required.
 * Falls back to 0 on any failure. macOS only; always returns 0 on other platforms.
 */
export async function getWindowDisplayIndex(): Promise<number> {
  if (detectPlatform() !== 'darwin') {
    return 0;
  }

  try {
    const [bounds, binaryPath] = await Promise.all([getWindowBounds(), getDisplayIndexBinary()]);
    return new Promise((resolve) => {
      execFile(
        binaryPath,
        [String(bounds.x), String(bounds.y)],
        { timeout: 5_000 },
        (err, stdout) => {
          if (err) { resolve(0); return; }
          const index = parseInt(stdout.trim(), 10);
          resolve(isNaN(index) ? 0 : index);
        },
      );
    });
  } catch {
    return 0;
  }
}
