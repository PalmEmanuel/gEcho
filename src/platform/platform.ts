import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import type { Platform } from '../types/index.js';

export function detectPlatform(): Platform {
  return process.platform as Platform;
}

type WindowBounds = { x: number; y: number; width: number; height: number };
type WindowInfo = { bounds: WindowBounds; displayIndex: number };

const FALLBACK_INFO: WindowInfo = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  displayIndex: 0,
};

/** Module-level cache — one binary invocation per recording session is enough. */
let cachedWindowInfo: Promise<WindowInfo> | null = null;

export function clearWindowInfoCache(): void {
  cachedWindowInfo = null;
}

function resolveHelperPath(platform: Platform): { cmd: string; args: string[] } {
  // __dirname is out/src/platform — go up 3 levels to repo root
  const base = resolve(__dirname, '../../..');
  if (platform === 'darwin') {
    return { cmd: resolve(base, 'resources/bin/darwin/gecho-helper'), args: [] };
  }
  const script = resolve(base, `resources/bin/${platform}/gecho-helper.js`);
  return { cmd: process.execPath, args: [script] };
}

function fetchWindowInfo(): Promise<WindowInfo> {
  const platform = detectPlatform();
  if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') {
    return Promise.resolve(FALLBACK_INFO);
  }
  const { cmd, args } = resolveHelperPath(platform);
  return new Promise((resolvePromise) => {
    execFile(cmd, args, { timeout: 10_000 }, (err, stdout) => {
      if (err) { resolvePromise(FALLBACK_INFO); return; }
      try {
        const info = JSON.parse(stdout.trim()) as WindowInfo;
        resolvePromise(info);
      } catch {
        resolvePromise(FALLBACK_INFO);
      }
    });
  });
}

export function getWindowInfo(): Promise<WindowInfo> {
  if (!cachedWindowInfo) {
    cachedWindowInfo = fetchWindowInfo().catch(() => {
      cachedWindowInfo = null;
      return FALLBACK_INFO;
    });
  }
  return cachedWindowInfo;
}

export async function getWindowBounds(): Promise<WindowBounds> {
  return (await getWindowInfo()).bounds;
}

export async function getWindowDisplayIndex(): Promise<number> {
  return (await getWindowInfo()).displayIndex;
}
