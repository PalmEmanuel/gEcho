import { execFile, spawn } from 'node:child_process';
import * as vscode from 'vscode';

/** Outcome of an automatic ffmpeg install attempt. */
export type InstallResult =
  | { success: true }
  | { success: false; reason: string };

/** 5-minute ceiling — brew/apt/winget first-run downloads can exceed 2 min. */
const INSTALL_TIMEOUT_MS = 300_000;

/**
 * Runs `bin args` via spawn (no shell, streamed stdio) so that large package
 * manager output never overflows a buffer.  Captures stderr for diagnostics.
 * On timeout the child process is killed and the promise rejects with a
 * descriptive error; on non-zero exit the stderr excerpt is included.
 */
function runCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderrChunks: Buffer[] = [];
    child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      reject(new Error(`${bin} timed out after ${INSTALL_TIMEOUT_MS / 1000}s`));
    }, INSTALL_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) { return; }
      if (code === 0) {
        resolve();
      } else {
        const stderr = Buffer.concat(stderrChunks).toString().trim();
        const detail = stderr ? ` (${stderr})` : '';
        reject(new Error(`${bin} exited with code ${code}${detail}`));
      }
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
  // process.getuid is undefined on Windows; undefined === 0 is false (non-root), which is correct.
  const isRoot = process.getuid?.() === 0;
  const hasApt = await checkBinary('apt-get');
  let aptFailReason: string | undefined;

  if (hasApt) {
    if (!isRoot) {
      aptFailReason = 'apt-get requires root privileges. Run sudo apt-get install ffmpeg from a terminal, or use snap instead.';
    } else {
      progress.report({ message: 'Running apt-get install -y ffmpeg...' });
      try {
        await runCommand('apt-get', ['install', '-y', 'ffmpeg']);
        return { success: true };
      } catch (err) {
        aptFailReason = `apt-get install ffmpeg failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
  }

  const hasSnap = await checkBinary('snap');
  if (hasSnap) {
    progress.report({ message: 'Running snap install ffmpeg...' });
    try {
      await runCommand('snap', ['install', 'ffmpeg']);
      return { success: true };
    } catch (err) {
      const snapFail = `snap install ffmpeg failed: ${err instanceof Error ? err.message : String(err)}`;
      const reasons = [aptFailReason, snapFail].filter(Boolean).join('; ');
      return { success: false, reason: reasons };
    }
  }

  if (aptFailReason) {
    return {
      success: false,
      reason: `${aptFailReason} No snap available as fallback.`,
    };
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
  let wingetFailReason: string | undefined;

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
    } catch (err) {
      wingetFailReason = `winget install ffmpeg failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const hasChoco = await checkBinary('choco');
  if (hasChoco) {
    progress.report({ message: 'Running choco install ffmpeg...' });
    try {
      await runCommand('choco', ['install', 'ffmpeg', '-y']);
      return { success: true };
    } catch (err) {
      const chocoFail = `choco install ffmpeg failed: ${err instanceof Error ? err.message : String(err)}`;
      const reasons = [wingetFailReason, chocoFail].filter(Boolean).join('; ');
      return { success: false, reason: reasons };
    }
  }

  if (wingetFailReason) {
    return {
      success: false,
      reason: `${wingetFailReason} No Chocolatey available as fallback.`,
    };
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
 * All installs use spawn with static args — no shell string construction.
 * On Linux, apt-get requires root; if the process is not root, snap is tried
 * instead. On Windows, winget is tried first and Chocolatey is the fallback.
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
