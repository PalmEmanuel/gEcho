import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { getWindowBounds, detectPlatform } from '../platform/index.js';
import type { GifConfig } from '../types/index.js';
import { sanitizeFfmpegPath } from '../security/index.js';
import { getConfig } from '../config.js';

export class ScreenCapture {
  private ffmpegProcess: ChildProcess | null = null;
  private outputPath: string = '';

  async start(outputPath: string, config?: GifConfig): Promise<void> {
    this.outputPath = outputPath;

    const bounds = await getWindowBounds();
    const { x, y, width, height } = bounds;

    const cfg = getConfig();
    const fps = config?.fps ?? cfg.gif.fps;
    const gifWidth = config?.width ?? cfg.gif.width;

    let safeFfmpegPath: string;
    try {
      safeFfmpegPath = sanitizeFfmpegPath(cfg.ffmpegPath);
    } catch (err) {
      throw new Error(`gEcho: Invalid ffmpeg path — ${err instanceof Error ? err.message : String(err)}`);
    }

    const platform = detectPlatform();
    let args: string[];

    if (platform === 'darwin') {
      args = [
        '-f', 'avfoundation',
        '-framerate', String(fps),
        '-i', '1',
        '-vf', `crop=${width}:${height}:${x}:${y},scale=${gifWidth}:-1:flags=lanczos`,
        '-y', outputPath,
      ];
    } else if (platform === 'linux') {
      args = [
        '-f', 'x11grab',
        '-framerate', String(fps),
        '-video_size', `${width}x${height}`,
        '-i', `:0.0+${x},${y}`,
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
        '-y', outputPath,
      ];
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(safeFfmpegPath, args);
      this.ffmpegProcess = proc;

      let startupError = '';
      let resolved = false;

      proc.stderr?.on('data', (data: Buffer) => {
        startupError += data.toString();
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
            reject(new Error(`ffmpeg exited early with code ${code}: ${startupError}`));
          } else {
            resolve();
          }
        }
      });
    });
  }

  async stop(): Promise<string> {
    const proc = this.ffmpegProcess;
    if (!proc) {
      return this.outputPath;
    }

    return new Promise((resolve, reject) => {
      proc.on('close', (code) => {
        this.ffmpegProcess = null;
        // ffmpeg exits 255 on some platforms when interrupted by SIGINT
        if (code === 0 || code === 255) {
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
