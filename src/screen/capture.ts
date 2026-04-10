import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import { getWindowBounds, detectPlatform } from '../platform/index.js';
import type { GifConfig } from '../types/index.js';
import { sanitizeFfmpegPath } from '../security/index.js';
import { getConfig } from '../config.js';

export class ScreenCapture {
  private ffmpegProcess: ChildProcess | null = null;
  private outputPath: string = '';
  private startupStderr: string = '';

  async start(outputPath: string, config?: GifConfig): Promise<void> {
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
      args = [
        '-f', 'avfoundation',
        '-framerate', String(fps),
        '-i', '1',
        '-vf', `crop=${width}:${height}:${x}:${y}`,
        '-vcodec', 'libx264',
        '-preset', 'ultrafast',
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
      const proc = spawn(safeFfmpegPath, args);
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

  async waitForReady(timeoutMs = 800): Promise<void> {
    if (!this.ffmpegProcess) {
      throw new Error(`ffmpeg is not running — it may have failed to start. ${this.startupStderr.slice(-500)}`);
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const settle = (err?: Error) => {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        if (err) { reject(err); } else { resolve(); }
      };

      const onClose = (code: number | null) => {
        const stderr = this.startupStderr.slice(-500);
        settle(new Error(
          `ffmpeg exited with code ${code}${stderr ? ` — ${stderr}` : ''}`
        ));
      };

      const timer = setTimeout(() => {
        this.ffmpegProcess?.off('close', onClose);
        settle();
      }, timeoutMs);

      this.ffmpegProcess!.once('close', onClose);
    });
  }

  async stop(): Promise<string> {
    const proc = this.ffmpegProcess;
    if (!proc) {
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
      proc.on('close', (code) => {
        this.ffmpegProcess = null;
        // ffmpeg exits 255 on some platforms when interrupted by SIGINT;
        // exits 254 (-2 signed) on some macOS/avfoundation combinations
        if (code === 0 || code === 254 || code === 255) {
          resolve(this.outputPath);
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });

      // SIGINT lets ffmpeg flush buffers and write the final file properly
      proc.kill('SIGINT');
    });
  }

  dispose(): void {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGINT');
      this.ffmpegProcess = null;
    }
  }
}
