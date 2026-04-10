import { execFile } from 'node:child_process';
import * as vscode from 'vscode';
import { getConfig } from './config.js';

const FFMPEG_DOWNLOAD_URL = 'https://ffmpeg.org/download.html';

/**
 * Checks whether ffmpeg is reachable at the configured path.
 * Returns `true` when the binary responds to `-version`, `false` otherwise.
 */
export function isFfmpegAvailable(ffmpegPath?: string): Promise<boolean> {
  const bin = ffmpegPath ?? getConfig().ffmpegPath;
  return new Promise((resolve) => {
    execFile(bin, ['-version'], { timeout: 5000 }, (error) => {
      resolve(!error);
    });
  });
}

/**
 * Checks for required external dependencies (currently only ffmpeg) and shows
 * a warning with an install link when any are missing.
 */
export async function checkDependencies(): Promise<void> {
  const available = await isFfmpegAvailable();
  if (!available) {
    const action = await vscode.window.showWarningMessage(
      'gEcho: ffmpeg was not found. GIF recording and conversion require ffmpeg.',
      'Install ffmpeg'
    );
    if (action === 'Install ffmpeg') {
      await vscode.env.openExternal(vscode.Uri.parse(FFMPEG_DOWNLOAD_URL));
    }
  }
}
