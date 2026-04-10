import { execFile } from 'node:child_process';
import * as vscode from 'vscode';

/** Outcome of an automatic ffmpeg install attempt. */
export type InstallResult =
  | { success: true }
  | { success: false; reason: string };

const INSTALL_TIMEOUT_MS = 120_000;

function runCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: INSTALL_TIMEOUT_MS }, (err) => {
      if (err) { reject(err); } else { resolve(); }
    });
  });
}

function checkBinary(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, ['--version'], { timeout: 5000 }, (err) => resolve(!err));
  });
}

async function tryInstallDarwin(
  progress: vscode.Progress<{ message?: string }>
): Promise<InstallResult> {
  progress.report({ message: 'Checking for Homebrew...' });
  const hasBrew = await checkBinary('brew');
  if (!hasBrew) {
    return {
      success: false,
      reason: 'Homebrew is not installed. Install Homebrew from https://brew.sh or download ffmpeg manually.',
    };
  }
  progress.report({ message: 'Running brew install ffmpeg (this may take a few minutes)...' });
  try {
    await runCommand('brew', ['install', 'ffmpeg']);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      reason: `brew install ffmpeg failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function tryInstallLinux(
  progress: vscode.Progress<{ message?: string }>
): Promise<InstallResult> {
  const hasApt = await checkBinary('apt-get');
  if (hasApt) {
    progress.report({ message: 'Running apt-get install -y ffmpeg...' });
    try {
      await runCommand('apt-get', ['install', '-y', 'ffmpeg']);
      return { success: true };
    } catch {
      // fall through to snap
    }
  }

  const hasSnap = await checkBinary('snap');
  if (hasSnap) {
    progress.report({ message: 'Running snap install ffmpeg...' });
    try {
      await runCommand('snap', ['install', 'ffmpeg']);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        reason: `snap install ffmpeg failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    success: false,
    reason: 'Neither apt-get nor snap is available. Please install ffmpeg manually.',
  };
}

async function tryInstallWindows(
  progress: vscode.Progress<{ message?: string }>
): Promise<InstallResult> {
  const hasWinget = await checkBinary('winget');
  if (hasWinget) {
    progress.report({ message: 'Running winget install ffmpeg...' });
    try {
      await runCommand('winget', [
        'install',
        '--id', 'Gyan.FFmpeg',
        '--silent',
        '--accept-package-agreements',
        '--accept-source-agreements',
      ]);
      return { success: true };
    } catch {
      // fall through to choco
    }
  }

  const hasChoco = await checkBinary('choco');
  if (hasChoco) {
    progress.report({ message: 'Running choco install ffmpeg...' });
    try {
      await runCommand('choco', ['install', 'ffmpeg', '-y']);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        reason: `choco install ffmpeg failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    success: false,
    reason: 'Neither winget nor Chocolatey is available. Please install ffmpeg manually.',
  };
}

/**
 * Attempts to install ffmpeg using the platform's preferred package manager.
 * Falls back to the next available manager if the first attempt fails.
 *
 * All installs use execFile with static args — no shell string construction.
 */
export async function autoInstallFfmpeg(
  _context: vscode.ExtensionContext,
  progress: vscode.Progress<{ message?: string }>
): Promise<InstallResult> {
  const platform = process.platform as string;

  if (platform === 'darwin') { return tryInstallDarwin(progress); }
  if (platform === 'linux') { return tryInstallLinux(progress); }
  if (platform === 'win32') { return tryInstallWindows(progress); }

  return { success: false, reason: `Unsupported platform: ${platform}` };
}
