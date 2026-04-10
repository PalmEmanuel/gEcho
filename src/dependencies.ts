import { execFile } from 'node:child_process';
import * as vscode from 'vscode';
import { getConfig } from './config.js';
import { autoInstallFfmpeg, type InstallResult } from './installer.js';

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
 * Checks for required external dependencies (currently only ffmpeg). When
 * ffmpeg is missing, prompts the user to either install it automatically via
 * the platform package manager or open the download page.
 */
export async function checkDependencies(context: vscode.ExtensionContext): Promise<void> {
  const available = await isFfmpegAvailable();
  if (!available) {
    const action = await vscode.window.showWarningMessage(
      'gEcho: ffmpeg was not found. GIF recording and conversion require ffmpeg.',
      'Install automatically',
      'Download'
    );

    if (action === 'Download') {
      await vscode.env.openExternal(vscode.Uri.parse(FFMPEG_DOWNLOAD_URL));
      return;
    }

    if (action === 'Install automatically') {
      let result: InstallResult = { success: false, reason: 'Install was cancelled.' };
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'gEcho: Installing ffmpeg...',
          cancellable: false,
        },
        async (progress) => {
          result = await autoInstallFfmpeg(context, progress);
        }
      );

      if (result.success) {
        const verified = await isFfmpegAvailable();
        if (verified) {
          vscode.window.showInformationMessage('gEcho: ffmpeg installed successfully.');
        } else {
          vscode.window.showWarningMessage(
            'gEcho: ffmpeg was installed but is not yet detectable. You may need to restart VS Code.'
          );
        }
      } else {
        const fallback = await vscode.window.showErrorMessage(
          `gEcho: Automatic ffmpeg installation failed. ${result.reason}`,
          'Download manually'
        );
        if (fallback === 'Download manually') {
          await vscode.env.openExternal(vscode.Uri.parse(FFMPEG_DOWNLOAD_URL));
        }
      }
    }
  }
}
