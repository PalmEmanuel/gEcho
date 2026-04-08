import { spawn } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { sanitizeFfmpegPath } from '../security/index.js';
import { getConfig } from '../config.js';

export interface GifConvertOptions {
  fps?: number;
  width?: number;
  quality?: 'high' | 'balanced' | 'small';
}

const QUALITY_PRESETS: Record<'high' | 'balanced' | 'small', { fps: number; scaleWidth: number | undefined }> = {
  high:     { fps: 15, scaleWidth: undefined },
  balanced: { fps: 10, scaleWidth: undefined },
  small:    { fps: 8,  scaleWidth: 1280 },
};

export class GifConverter {
  async convert(mp4Path: string, gifPath: string, options?: GifConvertOptions): Promise<void> {
    const cfg = getConfig();
    const quality = options?.quality ?? cfg.gif.quality;
    const preset = QUALITY_PRESETS[quality];
    const fps = options?.fps ?? preset.fps;
    const scaleWidth = options?.width ?? preset.scaleWidth ?? cfg.gif.width;

    let safeFfmpegPath: string;
    try {
      safeFfmpegPath = sanitizeFfmpegPath(cfg.ffmpegPath);
    } catch (err) {
      throw new Error(`gEcho: Invalid ffmpeg path — ${err instanceof Error ? err.message : String(err)}`);
    }

    const palettePath = path.join(os.tmpdir(), `gecho-palette-${Date.now()}.png`);
    const scaleFilter = `fps=${fps},scale=${scaleWidth}:-1:flags=lanczos`;

    // Pass 1: generate palette
    await this._runFfmpeg(safeFfmpegPath, [
      '-i', mp4Path,
      '-vf', `${scaleFilter},palettegen`,
      '-y', palettePath,
    ]);

    // Pass 2: apply palette
    await this._runFfmpeg(safeFfmpegPath, [
      '-i', mp4Path,
      '-i', palettePath,
      '-lavfi', `${scaleFilter} [x]; [x][1:v] paletteuse`,
      '-loop', '0',
      '-y', gifPath,
    ]);

    await Promise.allSettled([unlink(palettePath), unlink(mp4Path)]);
  }

  private _runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, args);
      let stderr = '';
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) { resolve(); }
        else { reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`)); }
      });
    });
  }
}
