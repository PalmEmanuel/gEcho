import { spawn, execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { access, stat } from 'node:fs/promises';
import { getWindowBounds, detectPlatform, getWindowDisplayIndex, clearWindowInfoCache } from '../platform/index.js';
import type { GifConfig } from '../types/index.js';
import { sanitizeFfmpegPath } from '../security/index.js';
import { getConfig } from '../config.js';

const cachedDeviceIndices: Map<number, string> = new Map();
let avfDeviceEnumeration: Promise<string[]> | null = null;

/**
 * Run `ffmpeg -list_devices` once and return the indices of all "Capture screen" devices.
 * Result is cached as an in-flight Promise so concurrent callers share the same invocation.
 * Spawn errors (ENOENT, EACCES) are not cached — callers may retry after fixing the path.
 */
function enumerateAvfDevices(ffmpegPath: string): Promise<string[]> {
  if (avfDeviceEnumeration) {
    return avfDeviceEnumeration;
  }
  avfDeviceEnumeration = new Promise((resolve, reject) => {
    execFile(
      ffmpegPath,
      ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''],
      (err, _stdout, stderr) => {
        // ENOENT / EACCES mean ffmpeg itself could not be executed — not a permission issue.
        // Clear the cache so callers can retry once the path is fixed.
        if (err && (err.code === 'ENOENT' || err.code === 'EACCES')) {
          avfDeviceEnumeration = null;
          reject(new Error(`gEcho: Failed to enumerate AVFoundation devices — ${err.message}`));
          return;
        }
        // ffmpeg always exits non-zero when given `-i ""` — that is expected. Parse stderr.
        const matched: string[] = [];
        stderr.replace(/\[(\d+)\]\s+Capture\s+screen/gi, (_all, index: string) => {
          matched.push(index);
          return '';
        });
        resolve(matched);
      }
    );
  });
  return avfDeviceEnumeration;
}

/**
 * Check whether macOS Screen Recording permission has been granted.
 * AVFoundation only lists "Capture screen" devices when the permission is active;
 * an empty device list is a reliable signal that the permission is missing.
 *
 * On non-darwin platforms this always returns `{ granted: true, deviceCount: 0 }`.
 *
 * @param ffmpegPath Optional resolved ffmpeg path. Reads from config when omitted.
 */
export async function checkScreenRecordingPermission(
  ffmpegPath?: string
): Promise<{ granted: boolean; deviceCount: number }> {
  if (process.platform !== 'darwin') {
    return { granted: true, deviceCount: 0 };
  }
  let resolvedPath: string;
  try {
    resolvedPath = ffmpegPath ?? sanitizeFfmpegPath(getConfig().ffmpegPath);
  } catch {
    // Can't validate without a working ffmpeg path — don't block.
    return { granted: true, deviceCount: 0 };
  }
  const devices = await enumerateAvfDevices(resolvedPath);
  return { granted: devices.length > 0, deviceCount: devices.length };
}

/**
 * Enumerate AVFoundation video devices and return the index of the screen capture device
 * for the given display. Falls back to matched[0] if displayIndex is out of range,
 * then to '1' if no devices are found at all.
 * Results are cached per display index for the lifetime of the process.
 */
async function getScreenCaptureDeviceIndex(ffmpegPath: string, displayIndex: number): Promise<string> {
  if (cachedDeviceIndices.has(displayIndex)) {
    return cachedDeviceIndices.get(displayIndex)!;
  }
  const matched = await enumerateAvfDevices(ffmpegPath);
  if (matched.length === 0) {
    console.warn('gEcho: No AVFoundation screen capture devices found; falling back to device 1');
    cachedDeviceIndices.set(displayIndex, '1');
    return '1';
  }
  const device = matched[displayIndex] ?? matched[0];
  cachedDeviceIndices.set(displayIndex, device);
  return device;
}

export class ScreenCapture {
  private ffmpegProcess: ChildProcess | null = null;
  private outputPath: string = '';
  private startupStderr: string = '';
  /** Tracks the in-flight start() so stop() can wait for it and cancel safely. */
  private _startPromise: Promise<void> | null = null;
  /** Set to true by stop() when called before ffmpeg has spawned. */
  private _stopRequested = false;

  async start(outputPath: string, config?: GifConfig): Promise<void> {
    clearWindowInfoCache();
    this._stopRequested = false;
    const p = this._doStart(outputPath, config);
    this._startPromise = p;
    try {
      await p;
    } finally {
      this._startPromise = null;
    }
  }

  private async _doStart(outputPath: string, config?: GifConfig): Promise<void> {
    this.outputPath = outputPath;

    const bounds = await getWindowBounds();
    const { x, y, width, height } = bounds;

    const cfg = getConfig();
    const fps = config?.fps ?? cfg.gif.fps;

    let safeFfmpegPath: string;
    try {
      safeFfmpegPath = sanitizeFfmpegPath(cfg.ffmpegPath);
    } catch (err) {
      throw new Error(`gEcho: Invalid ffmpeg path — ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }

    const platform = detectPlatform();
    let args: string[];

    if (platform === 'darwin') {
      const perm = await checkScreenRecordingPermission(safeFfmpegPath);
      if (!perm.granted) {
        throw new Error(
          'gEcho: Screen Recording permission not granted. ' +
          'Open System Settings → Privacy & Security → Screen Recording and enable VS Code, then restart VS Code.'
        );
      }
      // AVFoundation requires the input framerate to exactly match a supported device mode.
      // We capture at the native rate and downsample to the desired fps via the fps filter.
      const AVFOUNDATION_NATIVE_FRAMERATE = 60;
      const displayIndex = await getWindowDisplayIndex();

      // If stop() was called while we were awaiting getWindowDisplayIndex()
      // (e.g. during the first-ever swiftc compilation), abort before spawning.
      if (this._stopRequested) {
        return;
      }

      const deviceIndex = await getScreenCaptureDeviceIndex(safeFfmpegPath, displayIndex);
      args = [
        '-f', 'avfoundation',
        '-framerate', String(AVFOUNDATION_NATIVE_FRAMERATE),
        '-i', deviceIndex,
        '-vf', `fps=${fps},crop=${width}:${height}:${x}:${y}`,
        '-vcodec', 'libx264',
        '-preset', 'ultrafast',
        // Force a keyframe every second so fragments flush quickly.
        '-g', String(AVFOUNDATION_NATIVE_FRAMERATE),
        // Write self-contained fragments progressively — the file is valid even if
        // recording is interrupted, avoiding "No such file" errors on quick stops.
        '-movflags', '+frag_keyframe+empty_moov',
        '-y', outputPath,
      ];
    } else if (platform === 'linux') {
      args = [
        '-f', 'x11grab',
        '-framerate', String(fps),
        '-video_size', `${width}x${height}`,
        '-i', `:0.0+${x},${y}`,
        '-vcodec', 'libx264',
        '-preset', 'ultrafast',
        '-g', String(fps),
        '-movflags', '+frag_keyframe+empty_moov',
        '-y', outputPath,
      ];
    } else {
      // win32 and any other platform
      args = [
        '-f', 'gdigrab',
        '-framerate', String(fps),
        '-offset_x', String(x),
        '-offset_y', String(y),
        '-video_size', `${width}x${height}`,
        '-i', 'desktop',
        '-vcodec', 'libx264',
        '-preset', 'ultrafast',
        '-g', String(fps),
        '-movflags', '+frag_keyframe+empty_moov',
        '-y', outputPath,
      ];
    }

    this.startupStderr = '';

    // On Windows, .bat/.cmd files cannot be spawned directly — wrap via cmd.exe.
    if (process.platform === 'win32' && /\.(bat|cmd)$/i.test(safeFfmpegPath)) {
      args = ['/c', safeFfmpegPath, ...args];
      safeFfmpegPath = 'cmd.exe';
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(safeFfmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      this.ffmpegProcess = proc;

      let resolved = false;

      proc.stderr?.on('data', (data: Buffer) => {
        this.startupStderr += data.toString();
        // ffmpeg writes to stderr when it begins encoding — first data means it started
        if (!resolved) {
          resolved = true;
          resolve();
        }
      });

      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      proc.on('close', (code) => {
        this.ffmpegProcess = null;
        if (!resolved) {
          resolved = true;
          if (code !== 0) {
            reject(new Error(`ffmpeg exited early with code ${code}: ${this.startupStderr}`));
          } else {
            resolve();
          }
        }
        // if already resolved, ffmpeg died after startup — startupStderr is available for diagnostics
      });
    });
  }

  isRunning(): boolean {
    return this.ffmpegProcess !== null;
  }

  /**
   * Wait until ffmpeg has opened the output file and is ready to encode frames.
   *
   * We watch stderr for "Output #0" — the line ffmpeg emits when it has opened
   * the muxer and is about to start writing. This is more reliable than a fixed
   * timeout because AVFoundation device initialisation can take 2-5 seconds on
   * some machines regardless of CPU speed.
   *
   * Falls back to `timeoutMs` (default 8 s) if the signal never arrives.
   */
  async waitForReady(timeoutMs = 8_000): Promise<void> {
    if (!this.ffmpegProcess) {
      throw new Error(`ffmpeg is not running — it may have failed to start. ${this.startupStderr.slice(-500)}`);
    }

    // "Output #0" may already be in the buffer if stderr arrived fast.
    if (this.startupStderr.includes('Output #0')) {
      return;
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const settle = (err?: Error) => {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        this.ffmpegProcess?.stderr?.off('data', onData);
        this.ffmpegProcess?.off('close', onClose);
        if (err) { reject(err); } else { resolve(); }
      };

      // Watch for the encoding-ready signal in the continuously accumulated stderr.
      const onData = (_chunk: Buffer) => {
        if (this.startupStderr.includes('Output #0')) {
          settle();
        }
      };

      const onClose = (code: number | null) => {
        const stderr = this.startupStderr.slice(-500);
        settle(new Error(
          `ffmpeg exited with code ${code}${stderr ? ` — ${stderr}` : ''}`
        ));
      };

      // Fallback: if "Output #0" never appears within the window, proceed anyway
      // (some ffmpeg builds may phrase this line differently).
      const timer = setTimeout(() => {
        this.ffmpegProcess?.stderr?.off('data', onData);
        this.ffmpegProcess?.off('close', onClose);
        settle();
      }, timeoutMs);

      this.ffmpegProcess!.stderr?.on('data', onData);
      this.ffmpegProcess!.once('close', onClose);
    });
  }

  async stop(stopTimeoutMs = 15_000): Promise<string> {
    // If start() is still in the pre-spawn phase (e.g. awaiting swiftc compilation or
    // device enumeration), signal cancellation and wait for it to finish before proceeding.
    if (this._startPromise !== null) {
      this._stopRequested = true;
      await this._startPromise.catch(() => {}); // never throws — we just want to wait
    }

    const proc = this.ffmpegProcess;
    if (!proc) {
      // start() was cancelled before ffmpeg spawned — no process, no output file.
      if (this._stopRequested) {
        throw new Error('Recording was cancelled before it could start.');
      }
      try {
        await access(this.outputPath);
      } catch {
        throw new Error(
          `Recording failed — no output was written to ${this.outputPath}. Check ffmpeg permissions and device availability.`
        );
      }
      return this.outputPath;
    }

    return new Promise((resolve, reject) => {
      let sigtermTimer: ReturnType<typeof setTimeout>;
      let sigkillTimer: ReturnType<typeof setTimeout>;

      proc.on('close', async (code, signal) => {
        clearTimeout(sigtermTimer);
        clearTimeout(sigkillTimer);
        this.ffmpegProcess = null;

        // Verify the output file was actually written before resolving.
        // If ffmpeg was killed before flushing (or never opened the file), provide
        // a clear error rather than letting the GIF converter fail silently.
        try {
          const fileStat = await stat(this.outputPath);
          if (fileStat.size === 0) {
            reject(new Error(
              'Recording produced an empty file — no frames were captured. ' +
              'Try recording for a longer duration before stopping.'
            ));
            return;
          }
        } catch {
          reject(new Error(
            `Recording file not found after stop — ffmpeg exited (code ${code}, signal ${signal}) ` +
            `before writing data. Diagnostics: ${this.startupStderr.slice(-300)}`
          ));
          return;
        }

        resolve(this.outputPath);
      });

      // Chronicler pattern: write 'q' and close stdin.
      // ffmpeg treats 'q' on stdin as a graceful quit, and the stdin EOF is an
      // additional fallback so ffmpeg exits even if it's not polling stdin.
      proc.stdin?.end('q');

      // Escalation ladder if stdin signal is ignored.
      // AVFoundation capture sessions can take several seconds to tear down after
      // receiving the quit signal, so we give generous grace periods before escalating.
      sigtermTimer = setTimeout(() => { if (this.ffmpegProcess) { proc.kill('SIGTERM'); } }, Math.floor(stopTimeoutMs * 0.5));
      sigkillTimer = setTimeout(() => { if (this.ffmpegProcess) { proc.kill('SIGKILL'); } }, stopTimeoutMs);
    });
  }

  dispose(): void {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.stdin?.end('q');
      this.ffmpegProcess.kill('SIGTERM');
      this.ffmpegProcess = null;
    }
  }
}
