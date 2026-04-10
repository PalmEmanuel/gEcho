import { spawn } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { sanitizeFfmpegPath } from '../security/index.js';
import { getConfig } from '../config.js';
import type { CropConfig, CropPreset } from '../types/index.js';

export interface GifConvertOptions {
  fps?: number;
  width?: number;
  quality?: 'high' | 'balanced' | 'small';
  cropPreset?: CropPreset;
  crop?: Partial<CropConfig>;
}

const QUALITY_PRESETS: Record<'high' | 'balanced' | 'small', { fps: number; scaleWidth: number | undefined }> = {
  high:     { fps: 15, scaleWidth: undefined },
  balanced: { fps: 10, scaleWidth: undefined },
  small:    { fps: 8,  scaleWidth: 1280 },
};

const CROP_PRESETS: Record<CropPreset, CropConfig> = {
  'none':          { top: 0,  bottom: 0,  left: 0, right: 0 },
  'no-title-bar':  { top: 30, bottom: 0,  left: 0, right: 0 },
  'no-status-bar': { top: 0,  bottom: 22, left: 0, right: 0 },
  'content-only':  { top: 30, bottom: 22, left: 0, right: 0 },
};

/**
 * Resolve crop values from preset + per-side overrides.
 * Explicit per-side values (including from config) override the preset.
 *
 * Priority: optionsCrop > configCrop > preset defaults.
 * `||` is used for configCrop because 0 is the VS Code config default,
 * meaning "not overridden — use the preset value". For optionsCrop,
 * `??` is used because undefined means "not specified" while 0 is a valid
 * explicit override.
 */
export function resolveCrop(
  preset: CropPreset,
  configCrop: CropConfig,
  optionsCrop?: Partial<CropConfig>,
): CropConfig {
  const base = CROP_PRESETS[preset];
  return {
    top:    optionsCrop?.top    ?? (configCrop.top    || base.top),
    bottom: optionsCrop?.bottom ?? (configCrop.bottom || base.bottom),
    left:   optionsCrop?.left   ?? (configCrop.left   || base.left),
    right:  optionsCrop?.right  ?? (configCrop.right  || base.right),
  };
}

/**
 * Build an ffmpeg crop filter expression, or undefined if no cropping is needed.
 * Uses ffmpeg input expressions: `crop=in_w-L-R:in_h-T-B:L:T`
 */
export function buildCropFilter(crop: CropConfig): string | undefined {
  if (crop.top === 0 && crop.bottom === 0 && crop.left === 0 && crop.right === 0) {
    return undefined;
  }
  const w = crop.left + crop.right > 0 ? `in_w-${crop.left + crop.right}` : 'in_w';
  const h = crop.top + crop.bottom > 0 ? `in_h-${crop.top + crop.bottom}` : 'in_h';
  return `crop=${w}:${h}:${crop.left}:${crop.top}`;
}

export class GifConverter {
  async convert(mp4Path: string, gifPath: string, options?: GifConvertOptions): Promise<void> {
    const cfg = getConfig();
    const quality = options?.quality ?? cfg.gif.quality;
    const preset = QUALITY_PRESETS[quality];
    const fps = options?.fps ?? preset.fps;
    const scaleWidth = options?.width ?? preset.scaleWidth ?? cfg.gif.width;

    const cropPreset = options?.cropPreset ?? cfg.gif.cropPreset;
    const crop = resolveCrop(cropPreset, cfg.gif.crop, options?.crop);
    const cropFilter = buildCropFilter(crop);

    let safeFfmpegPath: string;
    try {
      safeFfmpegPath = sanitizeFfmpegPath(cfg.ffmpegPath);
    } catch (err) {
      throw new Error(`gEcho: Invalid ffmpeg path — ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }

    const palettePath = path.join(os.tmpdir(), `gecho-palette-${Date.now()}.png`);
    const baseFilter = cropFilter ? `${cropFilter},` : '';
    const scaleFilter = `${baseFilter}fps=${fps},scale=${scaleWidth}:-1:flags=lanczos`;

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
