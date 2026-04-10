import { rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { sanitizeFfmpegPath } from '../security/index.js';
import { getConfig } from '../config.js';
import { GifConverter } from './gifConverter.js';

export type OutputFormat = 'gif' | 'mp4' | 'webm';

/**
 * Convert (or move) the raw H.264 capture at `mp4Path` to the desired output format.
 * - gif:  two-pass palettegen+paletteuse pipeline via GifConverter (unchanged)
 * - mp4:  rename the temp file in-place — no re-encode needed, it's already H.264
 * - webm: re-encode with libvpx-vp9 via ffmpeg
 *
 * In all cases the temp mp4 is consumed (GifConverter unlinks it; mp4 renames it; webm unlinks after encode).
 */
export async function convertOutput(mp4Path: string, destPath: string, format: OutputFormat): Promise<void> {
  switch (format) {
    case 'gif': {
      const converter = new GifConverter();
      await converter.convert(mp4Path, destPath);
      return;
    }
    case 'mp4': {
      await rename(mp4Path, destPath);
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
      await runFfmpegWebm(safeFfmpegPath, mp4Path, destPath);
      return;
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
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) { resolve(); }
      else { reject(new Error(`gEcho: ffmpeg WebM encode exited with code ${code}: ${stderr.slice(-500)}`)); }
    });
  });
}
