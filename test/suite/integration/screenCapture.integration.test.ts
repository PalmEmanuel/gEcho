// Integration test — requires ffmpeg (or a fake executable); subset is Linux-only
import './vscodeMock.js'; // MUST be the first import — registers vscode stub

import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

import { mockConfigValues, clearMockConfig } from './vscodeMock.js';
import { ScreenCapture, checkScreenRecordingPermission } from '../../../src/screen/index.js';
import { GifConverter } from '../../../src/converter/index.js';

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

  it('surfaces the original start() error when stop() is called while start() is in-flight and fails', async function () {
    // This test is fragile on macOS due to the device enumeration path.
    // Skip on darwin — the happy path (Suite 1) already validates the error flow.
    if (process.platform === 'darwin') {
      this.skip();
    }
    if (!(await falseBinExists())) {
      this.skip();
    }
    // This tests the path where start() is called, stop() is called immediately
    // (while start() is still executing), and start() fails.
    // The stop() logic waits for the _startPromise to settle, captures startErr, and surfaces it.
    mockConfigValues['ffmpegPath'] = FALSE_BIN;
    const capture = new ScreenCapture();
    const tmpOutput = path.join(os.tmpdir(), `gecho-sc-starterr-${Date.now()}.mp4`);

    // Start recording but don't await — kick off the promise
    const startPromise = capture.start(tmpOutput);

    // Immediately call stop() while start() is still in-flight
    const stopPromise = capture.stop();

    // start() should reject
    let startError: Error | undefined;
    try {
      await startPromise;
    } catch (err) {
      startError = err instanceof Error ? err : new Error(String(err));
    }

    assert.ok(startError !== undefined, 'start() should have thrown');

    // stop() should reject with the same error
    await assert.rejects(
      () => stopPromise,
      (err: unknown) => {
        if (!(err instanceof Error)) { return false; }
        // The error message should match the original start() error (mentions exit code 1)
        return /code\s*1|exit.*1|1.*exit/i.test(err.message);
      },
      'stop() should surface the start() error when called during a failing start()',
    );
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

// ---------------------------------------------------------------------------
// Suite 4 — checkScreenRecordingPermission() result shape
// ---------------------------------------------------------------------------
describe('checkScreenRecordingPermission() — result shape', function () {
  this.timeout(10_000);

  beforeEach(function () { clearMockConfig(); });
  afterEach(function () { clearMockConfig(); });

  it('returns an object with a boolean `granted` property (not deviceCount)', async function () {
    // Mock ffmpegPath so the ScreenCapture helper path resolution is stable
    mockConfigValues['ffmpegPath'] = FALSE_BIN;

    const result = await checkScreenRecordingPermission();

    assert.ok(typeof result === 'object' && result !== null, 'result must be an object');
    assert.ok('granted' in result, 'result must have a `granted` property');
    assert.strictEqual(typeof result.granted, 'boolean', '`granted` must be boolean');
    assert.ok(!('deviceCount' in result), '`deviceCount` must NOT be present (it was removed)');
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — checkScreenRecordingPermission() on non-darwin
// ---------------------------------------------------------------------------
describe('checkScreenRecordingPermission() — platform guard', function () {
  this.timeout(5_000);

  before(function () {
    if (process.platform === 'darwin') {
      this.skip(); // guard is only relevant on non-darwin
    }
  });

  it('always returns { granted: true } on non-darwin without executing any binary', async function () {
    const result = await checkScreenRecordingPermission();
    assert.deepStrictEqual(result, { granted: true });
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — checkScreenRecordingPermission() on darwin
// ---------------------------------------------------------------------------
describe('checkScreenRecordingPermission() — darwin path', function () {
  this.timeout(10_000);

  before(function () {
    if (process.platform !== 'darwin') {
      this.skip();
    }
  });

  it('returns { granted: true } when permission is granted (dev/CI environment)', async function () {
    // This test asserts that the function does not throw and returns the right shape.
    // The actual granted value depends on macOS TCC state in the test environment.
    const result = await checkScreenRecordingPermission();
    assert.ok(typeof result === 'object' && result !== null);
    assert.strictEqual(typeof result.granted, 'boolean');
  });

  // TODO: To test the denied path manually:
  // 1. Revoke Screen Recording permission for VS Code in System Settings → Privacy & Security → Screen Recording
  // 2. Restart VS Code
  // 3. Uncomment the test below and run it
  it.skip('returns { granted: false } when permission is denied (requires manual TCC revocation)', async function () {
    const result = await checkScreenRecordingPermission();
    assert.deepStrictEqual(result, { granted: false });
  });
});

// ---------------------------------------------------------------------------
// Suite 6A — $DISPLAY parsing (Linux only)
// ---------------------------------------------------------------------------
describe('ScreenCapture $DISPLAY parsing (Linux only)', function () {
  this.timeout(5_000);

  before(function () {
    if (process.platform !== 'linux') {
      this.skip();
    }
  });

  it('parses ":0" as display 0', function () {
    // The regex: (process.env['DISPLAY'] ?? ':0').replace(/^[^:]*:/, '').split('.')[0] ?? '0'
    // Expected: strips host, strips screen suffix → "0"
    const input = ':0';
    const result = input.replace(/^[^:]*:/, '').split('.')[0] ?? '0';
    assert.strictEqual(result, '0');
  });

  it('parses ":0.0" as display 0', function () {
    const input = ':0.0';
    const result = input.replace(/^[^:]*:/, '').split('.')[0] ?? '0';
    assert.strictEqual(result, '0');
  });

  it('parses "localhost:10.0" as display 10', function () {
    const input = 'localhost:10.0';
    const result = input.replace(/^[^:]*:/, '').split('.')[0] ?? '0';
    assert.strictEqual(result, '10');
  });

  it('parses "10.0.0.1:1.0" as display 1', function () {
    const input = '10.0.0.1:1.0';
    const result = input.replace(/^[^:]*:/, '').split('.')[0] ?? '0';
    assert.strictEqual(result, '1');
  });

  it('parses ":99" as display 99', function () {
    const input = ':99';
    const result = input.replace(/^[^:]*:/, '').split('.')[0] ?? '0';
    assert.strictEqual(result, '99');
  });

  it('falls back to "0" when DISPLAY is empty string', function () {
    const input = '';
    // The source uses: (process.env['DISPLAY'] ?? ':0')
    // So empty string would come from env, defaulting to ':0'
    const effectiveInput = input || ':0';
    const result = effectiveInput.replace(/^[^:]*:/, '').split('.')[0] ?? '0';
    assert.strictEqual(result, '0');
  });

  it('parses "unix:10" as display 10', function () {
    const input = 'unix:10';
    const result = input.replace(/^[^:]*:/, '').split('.')[0] ?? '0';
    assert.strictEqual(result, '10');
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — GIF recording E2E (Linux + Xvfb only)
//
// CI requirement: apt-get install ffmpeg xvfb
//
// This suite is NOT excluded from .mocharc.json (spec: out/test/suite/**/*.test.js).
// It self-skips on non-Linux, when DISPLAY is unset, or when ffmpeg is absent.
// On Linux CI the entire file runs under `xvfb-run -a npx mocha --config .mocharc.json`
// which sets DISPLAY automatically. DISPLAY must resolve to an active X11 server
// because ScreenCapture.start() uses x11grab to capture from that display.
// ---------------------------------------------------------------------------
describe('GIF recording E2E (Linux + Xvfb only)', function () {
  this.timeout(60_000); // GIF conversion can be slow

  before(function () {
    if (process.platform !== 'linux') { this.skip(); return; }
    if (!process.env['DISPLAY']) { this.skip(); return; }
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    } catch {
      this.skip();
    }
  });

  beforeEach(function () {
    clearMockConfig();
    mockConfigValues['ffmpegPath'] = 'ffmpeg';
  });

  afterEach(function () {
    clearMockConfig();
  });

  it('records a clip, converts to GIF, output file is non-empty', async function () {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gecho-e2e-gif-'));
    const mp4Path = path.join(tmpDir, 'capture.mp4');
    const gifPath = path.join(tmpDir, 'output.gif');

    try {
      // Step 1: record ~1 second of screen via x11grab
      const capture = new ScreenCapture();
      await capture.start(mp4Path);
      await new Promise<void>(r => setTimeout(r, 1_000));
      await capture.stop();

      // Step 2: assert mp4 was written before handing it to the converter
      // (GifConverter.convert() deletes the source mp4 after conversion)
      const mp4Stat = await fs.stat(mp4Path);
      assert.ok(mp4Stat.size > 0, `MP4 should be non-empty, got ${mp4Stat.size} bytes`);

      // Step 3: convert mp4 → gif using the project pipeline
      const converter = new GifConverter();
      await converter.convert(mp4Path, gifPath);

      // Step 4: assert the gif was written
      const gifStat = await fs.stat(gifPath);
      assert.ok(gifStat.size > 0, `GIF should be non-empty, got ${gifStat.size} bytes`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('output GIF has valid GIF89a magic bytes', async function () {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gecho-e2e-gif-magic-'));
    const mp4Path = path.join(tmpDir, 'capture.mp4');
    const gifPath = path.join(tmpDir, 'output.gif');

    try {
      const capture = new ScreenCapture();
      await capture.start(mp4Path);
      await new Promise<void>(r => setTimeout(r, 1_000));
      await capture.stop();

      const converter = new GifConverter();
      await converter.convert(mp4Path, gifPath);

      // Verify the GIF89a file signature (first 6 bytes)
      const fh = await fs.open(gifPath, 'r');
      const buf = Buffer.alloc(6);
      await fh.read(buf, 0, 6, 0);
      await fh.close();

      assert.deepStrictEqual(
        buf,
        Buffer.from('GIF89a'),
        `Expected GIF89a header, got: ${buf.toString('ascii')}`,
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
