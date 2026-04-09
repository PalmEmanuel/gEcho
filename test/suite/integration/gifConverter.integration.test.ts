// Integration test — requires ffmpeg
import './vscodeMock.js'; // MUST be the first import — registers vscode stub

import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import { GifConverter } from '../../../src/converter/index.js';

// ---------------------------------------------------------------------------
// ffmpeg availability check
// ---------------------------------------------------------------------------
let ffmpegBin: string | undefined;
try {
  ffmpegBin =
    process.env['FFMPEG_PATH'] ??
    execSync('which ffmpeg', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
} catch {
  /* skip entire suite below */
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('GifConverter integration', function () {
  // ffmpeg operations can be slow on CI; give each test up to 60 s.
  this.timeout(60_000);

  let tmpDir: string;

  before(async function () {
    if (!ffmpegBin) {
      this.skip();
      return;
    }
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gecho-gif-int-'));
  });

  after(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('converts a lavfi test MP4 to GIF: file exists, size > 0, starts with GIF8 magic', async function () {
    const mp4Path = path.join(tmpDir, 'test-input.mp4');
    const gifPath = path.join(tmpDir, 'test-output.gif');

    // Generate a 2 s 320×240 @ 10 fps synthetic video using ffmpeg's lavfi input.
    // stdio: 'pipe' suppresses verbose ffmpeg output in test logs.
    execSync(
      `"${ffmpegBin}" -f lavfi -i testsrc=duration=2:size=320x240:rate=10 -y "${mp4Path}"`,
      { stdio: 'pipe' },
    );

    const stat0 = await fs.stat(mp4Path);
    assert.ok(stat0.size > 0, 'Generated MP4 should be non-empty');

    const converter = new GifConverter();
    // Use 'small' preset so the palette + GIF pass finish quickly.
    await converter.convert(mp4Path, gifPath, { fps: 10, width: 320, quality: 'small' });

    // The converter deletes the source MP4 — only gifPath remains in tmpDir.
    const stat = await fs.stat(gifPath);
    assert.ok(stat.size > 0, `GIF output should be non-empty (got ${stat.size} bytes)`);

    // Verify GIF magic bytes (GIF87a / GIF89a both start with "GIF8").
    const fh = await fs.open(gifPath, 'r');
    const magic = Buffer.alloc(4);
    await fh.read(magic, 0, 4, 0);
    await fh.close();
    assert.strictEqual(
      magic.toString('ascii'),
      'GIF8',
      `Expected GIF8 magic bytes, got: ${JSON.stringify(magic.toString('ascii'))}`,
    );
  });

  it('rejects when the source MP4 path does not exist', async function () {
    const converter = new GifConverter();
    await assert.rejects(
      () => converter.convert(path.join(tmpDir, 'nonexistent.mp4'), path.join(tmpDir, 'out.gif')),
      /ffmpeg exited with code/,
    );
  });
});
