import { exec, execFile } from 'node:child_process';
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
 * Uses python3 + ctypes to call CoreGraphics directly — no compilation, no caching,
 * no Automation permission required. Falls back to 0 on any failure.
 * macOS only; always returns 0 on other platforms.
 */
export async function getWindowDisplayIndex(): Promise<number> {
  if (detectPlatform() !== 'darwin') {
    return 0;
  }

  try {
    const bounds = await getWindowBounds();
    const SCRIPT = `
import ctypes, sys

class CGPoint(ctypes.Structure):
    _fields_ = [('x', ctypes.c_double), ('y', ctypes.c_double)]

class CGSize(ctypes.Structure):
    _fields_ = [('width', ctypes.c_double), ('height', ctypes.c_double)]

class CGRect(ctypes.Structure):
    _fields_ = [('origin', CGPoint), ('size', CGSize)]

CG = ctypes.cdll.LoadLibrary('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics')
CG.CGGetActiveDisplayList.argtypes = [ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(ctypes.c_uint32)]
CG.CGGetActiveDisplayList.restype = ctypes.c_int32
CG.CGDisplayBounds.argtypes = [ctypes.c_uint32]
CG.CGDisplayBounds.restype = CGRect

wx = float(sys.argv[1])
wy = float(sys.argv[2])

count = ctypes.c_uint32(0)
CG.CGGetActiveDisplayList(0, None, ctypes.byref(count))
n = count.value
if n == 0:
    print(0)
    sys.exit(0)
DisplayArray = ctypes.c_uint32 * n
displays = DisplayArray()
CG.CGGetActiveDisplayList(n, displays, ctypes.byref(count))

for i in range(n):
    b = CG.CGDisplayBounds(displays[i])
    if wx >= b.origin.x and wx < b.origin.x + b.size.width and wy >= b.origin.y and wy < b.origin.y + b.size.height:
        print(i)
        sys.exit(0)

print(0)
`.trim();

    return new Promise((resolve) => {
      execFile(
        'python3',
        ['-c', SCRIPT, String(bounds.x), String(bounds.y)],
        { timeout: 10_000 },
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
