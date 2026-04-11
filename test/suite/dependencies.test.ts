import './integration/vscodeMock.js'; // MUST be the first import

import * as assert from 'node:assert';
import { isFfmpegAvailable, checkDependencies } from '../../src/dependencies.js';
import type { InstallResult } from '../../src/installer.js';
import * as vscode from 'vscode';
import { mockConfigValues, clearMockConfig } from './integration/vscodeMock.js';

/** Canonical download URL — matches the constant in dependencies.ts. */
const FFMPEG_DOWNLOAD_URL = 'https://ffmpeg.org/download.html';

describe('isFfmpegAvailable', () => {
  it('returns false for a non-existent binary', async () => {
    const result = await isFfmpegAvailable('__no_such_ffmpeg_binary__');
    assert.strictEqual(result, false);
  });

  it('returns true for a binary that succeeds with -version', async () => {
    // "echo" ignores its arguments and always exits 0, so execFile('echo', ['-version'])
    // succeeds — simulating a reachable ffmpeg.
    const result = await isFfmpegAvailable('echo');
    assert.strictEqual(result, true);
  });
});

// ---------------------------------------------------------------------------
// checkDependencies — action branching and user messaging
// ---------------------------------------------------------------------------

type WindowStub = {
  showWarningMessage: (...args: unknown[]) => Promise<unknown>;
  showInformationMessage: (...args: unknown[]) => Promise<unknown>;
  showErrorMessage: (...args: unknown[]) => Promise<unknown>;
  withProgress: (opts: unknown, cb: (p: { report: (v: { message?: string }) => void }) => Promise<unknown>) => Promise<unknown>;
};

type EnvStub = {
  openExternal: (uri: unknown) => Promise<boolean>;
};

/** Minimal fake ExtensionContext — only the fields checkDependencies accesses. */
const fakeContext = {} as vscode.ExtensionContext;

/** check stub that always reports ffmpeg as absent */
const unavailable = async () => false;
/** check stub that always reports ffmpeg as present */
const available = async () => true;

describe('checkDependencies', function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = vscode.window as unknown as Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (vscode as unknown as Record<string, unknown>)['env'] as Record<string, unknown>;

  // Saved originals to restore after each test
  const originals: Record<string, unknown> = {};

  beforeEach(() => {
    originals['showWarningMessage'] = win['showWarningMessage'];
    originals['showInformationMessage'] = win['showInformationMessage'];
    originals['showErrorMessage'] = win['showErrorMessage'];
    originals['withProgress'] = win['withProgress'];
    if (env) { originals['openExternal'] = env['openExternal']; }
  });

  afterEach(() => {
    win['showWarningMessage'] = originals['showWarningMessage'];
    win['showInformationMessage'] = originals['showInformationMessage'];
    win['showErrorMessage'] = originals['showErrorMessage'];
    win['withProgress'] = originals['withProgress'];
    if (env) { env['openExternal'] = originals['openExternal']; }
    clearMockConfig();
  });

  it('shows no prompt when ffmpeg is already available', async () => {
    let promptShown = false;
    win['showWarningMessage'] = async () => { promptShown = true; return undefined; };

    await checkDependencies(fakeContext, available);

    assert.strictEqual(promptShown, false, 'No prompt expected when ffmpeg is available');
  });

  it('shows warning prompt when ffmpeg is unavailable', async () => {
    const msgs: string[] = [];
    win['showWarningMessage'] = async (msg: unknown) => { msgs.push(String(msg)); return undefined; };

    await checkDependencies(fakeContext, unavailable);

    assert.ok(msgs.length > 0, 'Warning prompt should be shown');
    assert.ok(msgs[0].includes('ffmpeg was not found'), `Unexpected message: ${msgs[0]}`);
  });

  it('does nothing extra when user dismisses the prompt', async () => {
    let openExternalCalled = false;
    let installCalled = false;
    win['showWarningMessage'] = async () => undefined; // user dismisses
    if (env) { env['openExternal'] = async () => { openExternalCalled = true; return true; }; }
    const stubInstall = async () => { installCalled = true; return { success: true } as InstallResult; };

    await checkDependencies(fakeContext, unavailable, stubInstall);

    assert.strictEqual(openExternalCalled, false, 'openExternal should not be called on dismiss');
    assert.strictEqual(installCalled, false, 'installer should not be called on dismiss');
  });

  it('opens the download URL when user selects "Download"', async () => {
    const openedUris: string[] = [];
    win['showWarningMessage'] = async () => 'Download';
    if (env) {
      env['openExternal'] = async (uri: unknown) => {
        openedUris.push(String(uri));
        return true;
      };
    }

    await checkDependencies(fakeContext, unavailable);

    assert.ok(openedUris.some(u => u === FFMPEG_DOWNLOAD_URL), `Expected ${FFMPEG_DOWNLOAD_URL}, got: ${JSON.stringify(openedUris)}`);
  });

  it('runs installer and shows success when auto-install succeeds and ffmpeg is then found', async () => {
    const infoMsgs: string[] = [];
    let progressUsed = false;
    win['showWarningMessage'] = async () => 'Install automatically';
    win['showInformationMessage'] = async (msg: unknown) => { infoMsgs.push(String(msg)); return undefined; };
    win['withProgress'] = async (_opts: unknown, cb: (p: { report: () => void }) => Promise<unknown>) => {
      progressUsed = true;
      return cb({ report: () => {} });
    };

    const stubInstall = async (): Promise<InstallResult> => ({ success: true });
    // Second check (post-install verification) returns true
    let callCount = 0;
    const checkOnce = async () => { callCount++; return callCount > 1; };

    await checkDependencies(fakeContext, checkOnce, stubInstall);

    assert.ok(progressUsed, 'Progress notification should be shown during install');
    assert.ok(infoMsgs.some(m => m.includes('installed successfully')), `Expected success message, got: ${JSON.stringify(infoMsgs)}`);
  });

  it('shows "restart VS Code" warning when install succeeds but ffmpeg is still undetectable', async () => {
    const warnMsgs: string[] = [];
    win['showWarningMessage'] = async (msg: unknown) => {
      warnMsgs.push(String(msg));
      // First call is the initial prompt — return "Install automatically"
      return warnMsgs.length === 1 ? 'Install automatically' : undefined;
    };
    win['withProgress'] = async (_opts: unknown, cb: (p: { report: () => void }) => Promise<unknown>) => cb({ report: () => {} });

    const stubInstall = async (): Promise<InstallResult> => ({ success: true });
    // Both check calls return false (ffmpeg never becomes detectable)
    await checkDependencies(fakeContext, unavailable, stubInstall);

    assert.ok(
      warnMsgs.some(m => m.includes('not yet detectable')),
      `Expected restart warning, got: ${JSON.stringify(warnMsgs)}`
    );
  });

  it('shows error message when auto-install fails, with the failure reason', async () => {
    const errMsgs: string[] = [];
    win['showWarningMessage'] = async () => 'Install automatically';
    win['showErrorMessage'] = async (msg: unknown) => { errMsgs.push(String(msg)); return undefined; };
    win['withProgress'] = async (_opts: unknown, cb: (p: { report: () => void }) => Promise<unknown>) => cb({ report: () => {} });

    const stubInstall = async (): Promise<InstallResult> => ({ success: false, reason: 'brew not found' });

    await checkDependencies(fakeContext, unavailable, stubInstall);

    assert.ok(errMsgs.some(m => m.includes('brew not found')), `Expected failure reason in error, got: ${JSON.stringify(errMsgs)}`);
  });

  it('opens download URL when user clicks "Download manually" after install failure', async () => {
    const openedUris: string[] = [];
    win['showWarningMessage'] = async () => 'Install automatically';
    win['showErrorMessage'] = async () => 'Download manually';
    win['withProgress'] = async (_opts: unknown, cb: (p: { report: () => void }) => Promise<unknown>) => cb({ report: () => {} });
    if (env) {
      env['openExternal'] = async (uri: unknown) => { openedUris.push(String(uri)); return true; };
    }

    const stubInstall = async (): Promise<InstallResult> => ({ success: false, reason: 'brew not found' });

    await checkDependencies(fakeContext, unavailable, stubInstall);

    assert.ok(openedUris.some(u => u === FFMPEG_DOWNLOAD_URL), `Expected ${FFMPEG_DOWNLOAD_URL}, got: ${JSON.stringify(openedUris)}`);
  });
});

