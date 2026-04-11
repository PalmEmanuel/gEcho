import { rename, unlink, copyFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { sanitizeFfmpegPath } from '../security/index.js';
import { getConfig } from '../config.js';
import { GifConverter } from './gifConverter.js';

export type OutputFormat = 'gif' | 'mp4' | 'webm';

export interface OutputFormatMeta {
  label: string;
  ext: string;
  filterKey: string;
}

/** UI metadata for each output format (save dialog labels/filters). */
export const OUTPUT_FORMAT_META: Record<OutputFormat, OutputFormatMeta> = {
  gif:  { label: 'Save Recording', ext: 'gif',  filterKey: 'GIF Image' },
  mp4:  { label: 'Save Recording', ext: 'mp4',  filterKey: 'MP4 Video' },
  webm: { label: 'Save Recording', ext: 'webm', filterKey: 'WebM Video' },
};

const VALID_OUTPUT_FORMATS = new Set<OutputFormat>(['gif', 'mp4', 'webm']);

/** Type guard — returns true when `value` is a supported OutputFormat. */
export function isOutputFormat(value: unknown): value is OutputFormat {
  return typeof value === 'string' && VALID_OUTPUT_FORMATS.has(value as OutputFormat);
}

/**
 * Resolve an arbitrary config value to a valid OutputFormat.
 * Falls back to `'gif'` when the value is not a supported format,
 * so a misconfigured `settings.json` never causes a crash.
 */
export function resolveOutputFormat(value: unknown): OutputFormat {
  return isOutputFormat(value) ? value : 'gif';
}

/**
 * Convert (or move) the raw H.264 capture at `mp4Path` to the desired output format.
 * - gif:  two-pass palettegen+paletteuse pipeline via GifConverter (unchanged)
 * - mp4:  move the temp file to dest — no re-encode needed, it's already H.264
 * - webm: re-encode with libvpx-vp9 via ffmpeg; temp mp4 is deleted afterwards
 *
 * In all cases the temp mp4 is consumed.
 */
export async function convertOutput(mp4Path: string, destPath: string, format: OutputFormat): Promise<void> {
  switch (format) {
    case 'gif': {
      const converter = new GifConverter();
      await converter.convert(mp4Path, destPath);
      return;
    }
    case 'mp4': {
      await moveFile(mp4Path, destPath);
      return;
    }
    case 'webm': {
      const cfg = getConfig();
      let safeFfmpegPath: string;
      try {
        safeFfmpegPath = sanitizeFfmpegPath(cfg.ffmpegPath);
      } catch (err) {
        throw new Error(`gEcho: Invalid ffmpeg path — ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }
      try {
        await runFfmpegWebm(safeFfmpegPath, mp4Path, destPath);
      } finally {
        await unlink(mp4Path).catch(() => undefined);
      }
      return;
    }
    default: {
      const _exhaustive: never = format;
      throw new Error(`gEcho: Unsupported output format: ${_exhaustive}`);
    }
  }
}

/**
 * Move `src` to `dest`, overwriting `dest` if it already exists.
 * Falls back to copy+delete when a cross-device rename (EXDEV) is attempted.
 */
async function moveFile(src: string, dest: string): Promise<void> {
  // Remove dest first so rename succeeds even when dest already exists on Windows.
  await unlink(dest).catch(() => undefined);
  try {
    await rename(src, dest);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'EXDEV') {
      // Cross-device move: copy then delete source.
      await copyFile(src, dest);
      await unlink(src);
    } else {
      throw err;
    }
  }
}

function runFfmpegWebm(ffmpegPath: string, inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-i', inputPath,
      '-c:v', 'libvpx-vp9',
      '-b:v', '0',
      '-crf', '33',
      '-an',
      '-y', outputPath,
    ]);
    // Keep only the last 4 KiB of stderr to avoid unbounded memory growth on long recordings.
    const MAX_STDERR = 4096;
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > MAX_STDERR) {
        stderr = stderr.slice(stderr.length - MAX_STDERR);
      }
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) { resolve(); }
      else { reject(new Error(`gEcho: ffmpeg WebM encode exited with code ${code}: ${stderr.slice(-500)}`)); }
    });
  });
}
