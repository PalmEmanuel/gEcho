/**
 * Unit tests for the platform-specific ffmpeg installer.
 *
 * `import * as cp from 'node:child_process'` produces a TypeScript namespace
 * object whose properties are getter-only wrappers — they cannot be reassigned.
 * We therefore access the real, mutable module object via `require()` so that
 * patches propagate to installer.ts (which also holds a reference to the same
 * cached module object).
 */

import './integration/vscodeMock.js'; // MUST be the first import

import * as assert from 'node:assert';
import type { SpawnOptions } from 'node:child_process';
import type { InstallResult } from '../../src/installer.js';
import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Access the real, mutable child_process module object via require so that
// patches are visible to installer.ts (same cached module reference).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cpMod = require('node:child_process') as {
  execFile: (
    bin: string,
    args: string[],
    opts: unknown,
    cb: (err: Error | null) => void
  ) => void;
  spawn: (bin: string, args: string[], opts?: SpawnOptions) => NodeJS.EventEmitter & {
    stderr: NodeJS.EventEmitter;
    kill: () => void;
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeContext = {} as vscode.ExtensionContext;
const noopProgress = { report: (_v: { message?: string }) => {} };

/** Override process.platform for the duration of a test. */
function withPlatform(platform: string, fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    const orig = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    try {
      await fn();
    } finally {
      if (orig) {
        Object.defineProperty(process, 'platform', orig);
      }
    }
  };
}

/**
 * Replaces `execFile` on the real child_process module so that calls to
 * `checkBinary` (which uses execFile internally) return the desired result for
 * specific binaries.  Returns a restore function.
 */
function stubExecFile(outcomes: Record<string, boolean>): () => void {
  const original = cpMod.execFile;
  cpMod.execFile = (bin, _args, _opts, cb) => {
    const succeed = outcomes[bin] ?? false;
    setImmediate(() => cb(succeed ? null : new Error(`${bin}: command not found`)));
  };
  return () => { cpMod.execFile = original; };
}

/**
 * Replaces `spawn` on the real child_process module so that every spawn call
 * exits 0 (succeed=true) or exits non-zero (succeed=false).
 * Returns a restore function.
 */
function stubSpawn(succeed: boolean): () => void {
  const original = cpMod.spawn;
  cpMod.spawn = (_bin, _args, _opts?) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventEmitter } = require('node:events') as { EventEmitter: new () => NodeJS.EventEmitter };
    const child = new EventEmitter() as NodeJS.EventEmitter & { stderr: NodeJS.EventEmitter; kill: () => void };
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => child.emit('close', succeed ? 0 : 1));
    return child;
  };
  return () => { cpMod.spawn = original; };
}

/**
 * Replaces `spawn` with a per-call outcome: first call exits with `firstCode`,
 * all subsequent calls exit 0.  Useful for winget-fails/choco-succeeds tests.
 */
function stubSpawnFirstFails(): () => void {
  const original = cpMod.spawn;
  let callCount = 0;
  cpMod.spawn = (_bin, _args, _opts?) => {
    callCount++;
    const code = callCount === 1 ? 1 : 0;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EventEmitter } = require('node:events') as { EventEmitter: new () => NodeJS.EventEmitter };
    const child = new EventEmitter() as NodeJS.EventEmitter & { stderr: NodeJS.EventEmitter; kill: () => void };
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => child.emit('close', code));
    return child;
  };
  return () => { cpMod.spawn = original; };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('autoInstallFfmpeg', () => {

  // Import lazily so that vscodeMock is installed before installer.ts is
  // first evaluated (installer.ts imports vscode at module load time).
  let autoInstallFfmpeg: (
    ctx: vscode.ExtensionContext,
    progress: vscode.Progress<{ message?: string }>
  ) => Promise<InstallResult>;

  before(async () => {
    ({ autoInstallFfmpeg } = await import('../../src/installer.js'));
  });

  // -------------------------------------------------------------------------
  // Unsupported platform
  // -------------------------------------------------------------------------

  it('returns failure for unsupported platform', withPlatform('freebsd', async () => {
    const result = await autoInstallFfmpeg(fakeContext, noopProgress);
    assert.strictEqual(result.success, false);
    assert.ok(
      !result.success && result.reason.includes('Unsupported'),
      `Unexpected reason: ${(result as { reason: string }).reason}`
    );
  }));

  // -------------------------------------------------------------------------
  // macOS (darwin)
  // -------------------------------------------------------------------------

  describe('macOS (darwin)', () => {
    it('returns failure with Homebrew hint when brew is absent',
      withPlatform('darwin', async () => {
        const restoreExec = stubExecFile({ brew: false });
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, false);
          assert.ok(
            !result.success && result.reason.includes('Homebrew'),
            `Unexpected reason: ${(result as { reason: string }).reason}`
          );
        } finally {
          restoreExec();
        }
      })
    );

    it('returns success when brew is present and install succeeds',
      withPlatform('darwin', async () => {
        const restoreExec = stubExecFile({ brew: true });
        const restoreSpawn = stubSpawn(true);
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, true);
        } finally {
          restoreSpawn();
          restoreExec();
        }
      })
    );

    it('returns failure with brew error when brew install fails',
      withPlatform('darwin', async () => {
        const restoreExec = stubExecFile({ brew: true });
        const restoreSpawn = stubSpawn(false);
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, false);
          assert.ok(
            !result.success && result.reason.includes('brew install ffmpeg failed'),
            `Unexpected reason: ${(result as { reason: string }).reason}`
          );
        } finally {
          restoreSpawn();
          restoreExec();
        }
      })
    );
  });

  // -------------------------------------------------------------------------
  // Linux — apt/snap combinations
  // -------------------------------------------------------------------------

  describe('Linux', () => {
    let origGetuid: (() => number) | undefined;

    beforeEach(() => { origGetuid = process.getuid; });
    afterEach(() => {
      if (origGetuid !== undefined) {
        process.getuid = origGetuid;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (process as any).getuid;
      }
    });

    it('returns failure when neither apt-get nor snap is available',
      withPlatform('linux', async () => {
        const restoreExec = stubExecFile({ 'apt-get': false, snap: false });
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, false);
          assert.ok(
            !result.success && result.reason.includes('Neither apt-get nor snap'),
            `Unexpected reason: ${(result as { reason: string }).reason}`
          );
        } finally {
          restoreExec();
        }
      })
    );

    it('returns root-privilege message when apt-get is present but not running as root and snap is absent',
      withPlatform('linux', async () => {
        process.getuid = () => 1000; // non-root
        const restoreExec = stubExecFile({ 'apt-get': true, snap: false });
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, false);
          assert.ok(
            !result.success && result.reason.includes('root privileges'),
            `Unexpected reason: ${(result as { reason: string }).reason}`
          );
        } finally {
          restoreExec();
        }
      })
    );

    it('skips apt-get when not root and succeeds via snap',
      withPlatform('linux', async () => {
        process.getuid = () => 1000; // non-root
        const restoreExec = stubExecFile({ 'apt-get': true, snap: true });
        const restoreSpawn = stubSpawn(true);
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, true);
        } finally {
          restoreSpawn();
          restoreExec();
        }
      })
    );

    it('returns success when running as root and apt-get install succeeds',
      withPlatform('linux', async () => {
        process.getuid = () => 0; // root
        const restoreExec = stubExecFile({ 'apt-get': true });
        const restoreSpawn = stubSpawn(true);
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, true);
        } finally {
          restoreSpawn();
          restoreExec();
        }
      })
    );

    it('includes apt-get failure reason in result when apt-get fails and snap is absent',
      withPlatform('linux', async () => {
        process.getuid = () => 0; // root
        const restoreExec = stubExecFile({ 'apt-get': true, snap: false });
        const restoreSpawn = stubSpawn(false); // apt-get install exits non-zero
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, false);
          assert.ok(
            !result.success && result.reason.includes('apt-get install ffmpeg failed'),
            `Unexpected reason: ${(result as { reason: string }).reason}`
          );
        } finally {
          restoreSpawn();
          restoreExec();
        }
      })
    );

    it('includes both apt-get and snap failure reasons when both fail',
      withPlatform('linux', async () => {
        process.getuid = () => 0; // root
        const restoreExec = stubExecFile({ 'apt-get': true, snap: true });
        const restoreSpawn = stubSpawn(false); // both package manager installs fail
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, false);
          assert.ok(
            !result.success && result.reason.includes('apt-get install ffmpeg failed'),
            `Missing apt reason: ${(result as { reason: string }).reason}`
          );
          assert.ok(
            !result.success && result.reason.includes('snap install ffmpeg failed'),
            `Missing snap reason: ${(result as { reason: string }).reason}`
          );
        } finally {
          restoreSpawn();
          restoreExec();
        }
      })
    );
  });

  // -------------------------------------------------------------------------
  // Windows — winget/choco combinations
  // -------------------------------------------------------------------------

  describe('Windows', () => {
    it('returns failure when neither winget nor choco is available',
      withPlatform('win32', async () => {
        const restoreExec = stubExecFile({ winget: false, choco: false });
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, false);
          assert.ok(
            !result.success && result.reason.includes('Neither winget nor Chocolatey'),
            `Unexpected reason: ${(result as { reason: string }).reason}`
          );
        } finally {
          restoreExec();
        }
      })
    );

    it('returns success when winget is present and install succeeds',
      withPlatform('win32', async () => {
        const restoreExec = stubExecFile({ winget: true });
        const restoreSpawn = stubSpawn(true);
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, true);
        } finally {
          restoreSpawn();
          restoreExec();
        }
      })
    );

    it('returns success via choco when winget install fails but choco succeeds',
      withPlatform('win32', async () => {
        const restoreExec = stubExecFile({ winget: true, choco: true });
        const restoreSpawn = stubSpawnFirstFails();
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, true);
        } finally {
          restoreSpawn();
          restoreExec();
        }
      })
    );

    it('includes winget failure reason when winget fails and choco is absent',
      withPlatform('win32', async () => {
        const restoreExec = stubExecFile({ winget: true, choco: false });
        const restoreSpawn = stubSpawn(false); // winget install exits non-zero
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, false);
          assert.ok(
            !result.success && result.reason.includes('winget install ffmpeg failed'),
            `Unexpected reason: ${(result as { reason: string }).reason}`
          );
        } finally {
          restoreSpawn();
          restoreExec();
        }
      })
    );

    it('includes both winget and choco failure reasons when both fail',
      withPlatform('win32', async () => {
        const restoreExec = stubExecFile({ winget: true, choco: true });
        const restoreSpawn = stubSpawn(false); // both package manager installs fail
        try {
          const result = await autoInstallFfmpeg(fakeContext, noopProgress);
          assert.strictEqual(result.success, false);
          assert.ok(
            !result.success && result.reason.includes('winget install ffmpeg failed'),
            `Missing winget reason: ${(result as { reason: string }).reason}`
          );
          assert.ok(
            !result.success && result.reason.includes('choco install ffmpeg failed'),
            `Missing choco reason: ${(result as { reason: string }).reason}`
          );
        } finally {
          restoreSpawn();
          restoreExec();
        }
      })
    );
  });
});
