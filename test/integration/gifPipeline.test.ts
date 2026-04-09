import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { ScreenCapture } from '../../src/screen/capture.js';
import { GifConverter } from '../../src/converter/gifConverter.js';

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';

/**
 * Absolute path to the source fixtures directory.
 * After compilation, __dirname is out/test/integration/ — three levels up is the project root.
 */
function fixturesDir(): string {
  return path.resolve(__dirname, '../../../test/integration/fixtures');
}

function fakeFfmpegPath(): string {
  return isWindows
    ? path.join(fixturesDir(), 'fake-ffmpeg.bat')
    : path.join(fixturesDir(), 'fake-ffmpeg.sh');
}

function fakeFfmpegSigintPath(): string {
  return isWindows
    ? path.join(fixturesDir(), 'fake-ffmpeg-sigint.bat')
    : path.join(fixturesDir(), 'fake-ffmpeg-sigint.sh');
}

async function ffmpegInPath(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    return true;
  } catch {
    return false;
  }
}

describe('GIF Pipeline Integration', function () {
  this.timeout(20000);

  let tmpDir: string;
  let savedFfmpegPath: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gecho-gif-inttest-'));
    savedFfmpegPath = vscode.workspace.getConfiguration('gecho').get<string>('ffmpegPath');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    // Restore original ffmpegPath so we don't pollute other tests
    await vscode.workspace.getConfiguration('gecho').update(
      'ffmpegPath',
      savedFfmpegPath,
      vscode.ConfigurationTarget.Global,
    );
  });

  // ────────────────────────────────────────────────────────────────────────────
  // ScreenCapture lifecycle — uses fake ffmpeg, no TCC / screen-capture permission needed
  // ────────────────────────────────────────────────────────────────────────────

  describe('ScreenCapture lifecycle (fake ffmpeg)', () => {
    it('start() resolves and stop() returns the output path when process exits naturally', async function () {
      await vscode.workspace.getConfiguration('gecho').update(
        'ffmpegPath', fakeFfmpegPath(), vscode.ConfigurationTarget.Global,
      );

      const outputPath = path.join(tmpDir, 'test-natural.mp4');
      const capture = new ScreenCapture();

      await capture.start(outputPath);

      // Give the fake process time to write the file and exit
      await new Promise<void>(r => setTimeout(r, 300));

      const resultPath = await capture.stop();

      assert.strictEqual(resultPath, outputPath, 'stop() must return the configured output path');
      const stat = await fs.stat(resultPath);
      assert.ok(stat.size > 0, 'Output file must be non-empty');
    });

    it('start() then stop() via SIGINT writes file and resolves (Unix only)', async function () {
      if (isWindows) { return this.skip(); }

      await vscode.workspace.getConfiguration('gecho').update(
        'ffmpegPath', fakeFfmpegSigintPath(), vscode.ConfigurationTarget.Global,
      );

      const outputPath = path.join(tmpDir, 'test-sigint.mp4');
      const capture = new ScreenCapture();

      await capture.start(outputPath);

      const resultPath = await capture.stop();

      assert.strictEqual(resultPath, outputPath);
      const stat = await fs.stat(resultPath);
      assert.ok(stat.size > 0, 'Output file must be non-empty after SIGINT-triggered stop');
    });

    it('dispose() on a running capture does not throw', async function () {
      await vscode.workspace.getConfiguration('gecho').update(
        'ffmpegPath', fakeFfmpegSigintPath(), vscode.ConfigurationTarget.Global,
      );

      const outputPath = path.join(tmpDir, 'test-dispose.mp4');
      const capture = new ScreenCapture();
      await capture.start(outputPath);

      assert.doesNotThrow(() => capture.dispose());
      // Brief wait so the fake process can terminate before afterEach cleans up
      await new Promise<void>(r => setTimeout(r, 300));
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // GifConverter — requires real ffmpeg in PATH; skips gracefully if absent
  // ────────────────────────────────────────────────────────────────────────────

  describe('GifConverter (real ffmpeg — skipped if not installed)', () => {
    it('converts a synthetic lavfi MP4 to a valid GIF', async function () {
      if (!(await ffmpegInPath())) {
        return this.skip();
      }

      await vscode.workspace.getConfiguration('gecho').update(
        'ffmpegPath', 'ffmpeg', vscode.ConfigurationTarget.Global,
      );

      // Create a synthetic test video — no screen capture required
      const mp4Path = path.join(tmpDir, 'synthetic.mp4');
      await execFileAsync('ffmpeg', [
        '-f', 'lavfi',
        '-i', 'color=c=blue:s=320x240:r=5',
        '-t', '1',
        '-y', mp4Path,
      ]);

      const gifPath = path.join(tmpDir, 'output.gif');
      const converter = new GifConverter();
      await converter.convert(mp4Path, gifPath, { fps: 5, width: 320 });

      const stat = await fs.stat(gifPath);
      assert.ok(stat.size > 0, 'GIF output file must be non-empty');

      // Verify GIF89a magic bytes
      const fh = await fs.open(gifPath, 'r');
      const magic = Buffer.alloc(6);
      await fh.read(magic, 0, 6, 0);
      await fh.close();
      assert.strictEqual(
        magic.toString('ascii'),
        'GIF89a',
        'Output must be a valid GIF89a file',
      );
    });
  });
});
