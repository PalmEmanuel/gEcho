// Integration test — requires ffmpeg (or a fake executable); subset is Linux-only
import './vscodeMock.js'; // MUST be the first import — registers vscode stub

import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { mockConfigValues, clearMockConfig } from './vscodeMock.js';
import { ScreenCapture } from '../../../src/screen/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Path to `/usr/bin/false` (Unix). This binary accepts any arguments and
 * exits immediately with code 1, perfectly simulating an ffmpeg binary that
 * fails to start — without touching the screen or needing any permissions.
 */
const FALSE_BIN = '/usr/bin/false';

async function falseBinExists(): Promise<boolean> {
  try {
    await fs.access(FALSE_BIN);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Suite 1 — start() rejection when the "ffmpeg" process exits immediately
// ---------------------------------------------------------------------------
describe('ScreenCapture.start() liveness (fake ffmpeg exits code 1)', function () {
  this.timeout(5_000);

  before(async function () {
    if (!(await falseBinExists())) {
      this.skip();
    }
  });

  beforeEach(function () {
    clearMockConfig();
    // Point ffmpegPath at /usr/bin/false — exits immediately with code 1,
    // no screen-capture permissions required.
    mockConfigValues['ffmpegPath'] = FALSE_BIN;
  });

  afterEach(function () {
    clearMockConfig();
  });

  it('rejects within 1500 ms with an error that includes the exit code', async function () {
    const capture = new ScreenCapture();
    const tmpOutput = path.join(os.tmpdir(), `gecho-sc-test-${Date.now()}.mp4`);

    const start = Date.now();
    let caughtError: Error | undefined;

    await assert.rejects(
      async () => {
        await capture.start(tmpOutput);
      },
      (err: unknown) => {
        caughtError = err instanceof Error ? err : new Error(String(err));
        return true;
      },
    );

    const elapsed = Date.now() - start;

    assert.ok(
      elapsed < 1500,
      `start() should reject within 1500 ms, took ${elapsed} ms`,
    );
    assert.ok(
      caughtError !== undefined,
      'Expected start() to produce an Error',
    );
    // The error message should mention the exit code (1).
    assert.ok(
      /code\s*1|exit.*1|1.*exit/i.test(caughtError!.message),
      `Expected error message to reference exit code 1, got: ${caughtError!.message}`,
    );

    // dispose() is safe to call even after rejection
    capture.dispose();
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — stop() with no active process and no output path
// ---------------------------------------------------------------------------
describe('ScreenCapture.stop() — no active process', function () {
  this.timeout(2_000);

  beforeEach(function () { clearMockConfig(); });
  afterEach(function () { clearMockConfig(); });

  it('rejects with "no output was written" when start() was never called', async function () {
    const capture = new ScreenCapture();
    await assert.rejects(
      () => capture.stop(),
      /no output was written/i,
    );
  });

  it('rejects when stop() is called without a prior start() (second guard path)', async function () {
    // We cannot run a real recording here, but we can verify the shape of the
    // error thrown on a fresh instance — tests the guard added in stop().
    const capture = new ScreenCapture();
    let threw = false;
    try {
      await capture.stop();
    } catch {
      threw = true;
    }
    assert.ok(threw, 'stop() with no process and no path should throw');
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — full screen-capture smoke test (Linux + display only)
// ---------------------------------------------------------------------------
describe('ScreenCapture full capture (Linux + Xvfb only)', function () {
  this.timeout(15_000);

  before(function () {
    if (process.platform !== 'linux') {
      this.skip();
      return;
    }
    if (!process.env['DISPLAY']) {
      this.skip();
    }
  });

  it('start() resolves and stop() returns a non-empty MP4 file', async function () {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gecho-sc-full-'));
    const outPath = path.join(tmpDir, 'capture.mp4');

    try {
      const capture = new ScreenCapture();
      await capture.start(outPath);

      // Record for 500 ms, then stop.
      await new Promise<void>(r => setTimeout(r, 500));
      const resultPath = await capture.stop();

      const stat = await fs.stat(resultPath);
      assert.ok(stat.size > 0, `MP4 output should be non-empty, got ${stat.size} bytes`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
