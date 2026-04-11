import './integration/vscodeMock.js'; // MUST be first

import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { convertOutput } from '../../src/converter/outputConverter.js';
import { mockConfigValues, clearMockConfig } from './integration/vscodeMock.js';

/** Create an OS-appropriate wrapper script that delegates to a Node.js fixture. */
async function createFfmpegWrapper(dir: string, name: string, fixturePath: string): Promise<string> {
  if (process.platform === 'win32') {
    const wrapperPath = path.join(dir, `${name}.cmd`);
    await fs.writeFile(wrapperPath, `@echo off\nnode "${fixturePath}" %*\n`);
    return wrapperPath;
  } else {
    const wrapperPath = path.join(dir, `${name}.sh`);
    await fs.writeFile(wrapperPath, `#!/bin/sh\nexec node "${fixturePath}" "$@"\n`, { mode: 0o755 });
    return wrapperPath;
  }
}

describe('outputConverter', () => {
  let tempDir: string;
  let tempMp4Path: string;
  // Fixture paths relative to project root
  const projectRoot = path.resolve(__dirname, '../../..');
  const fixtureSuccessPath = path.join(projectRoot, 'test/suite/fixtures/fake-ffmpeg-success.js');
  const fixtureFailPath = path.join(projectRoot, 'test/suite/fixtures/fake-ffmpeg-fail.js');

  beforeEach(async () => {
    // Create a temporary directory and temp mp4 file for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gecho-test-'));
    tempMp4Path = path.join(tempDir, 'test-input.mp4');
    await fs.writeFile(tempMp4Path, 'fake mp4 content for testing');
    clearMockConfig();
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    clearMockConfig();
  });

  describe('mp4 format', () => {
    it('renames the mp4 file to destination path', async () => {
      const destPath = path.join(tempDir, 'output.mp4');
      
      await convertOutput(tempMp4Path, destPath, 'mp4');
      
      // Source should be gone, destination should exist
      const destExists = await fs.access(destPath).then(() => true).catch(() => false);
      const srcExists = await fs.access(tempMp4Path).then(() => true).catch(() => false);
      
      assert.strictEqual(destExists, true, 'Destination file should exist');
      assert.strictEqual(srcExists, false, 'Source file should be renamed (gone)');
    });

    it('propagates rename errors', async () => {
      const invalidDest = path.join('/nonexistent/directory/output.mp4');
      
      await assert.rejects(
        async () => convertOutput(tempMp4Path, invalidDest, 'mp4'),
        /ENOENT|no such file or directory/i
      );
    });
  });

  describe('gif format', () => {
    it('rejects with sanitization error for invalid ffmpeg path before conversion starts', async () => {
      const destPath = path.join(tempDir, 'output.gif');

      // GIF conversion must sanitize the configured ffmpeg path before spawning.
      mockConfigValues['ffmpegPath'] = 'bad;path';

      await assert.rejects(
        async () => convertOutput(tempMp4Path, destPath, 'gif'),
        /gEcho: Invalid ffmpeg path/
      );
    });

    it('propagates GifConverter errors', async () => {
      const destPath = path.join(tempDir, 'output.gif');
      
      // Use non-existent ffmpeg binary to trigger spawn error in GifConverter
      mockConfigValues['ffmpegPath'] = '/no/such/ffmpeg/binary';
      
      await assert.rejects(
        async () => convertOutput(tempMp4Path, destPath, 'gif')
        // Error will be from the spawn attempt
      );
    });
  });

  describe('webm format', () => {
    it('rejects with sanitization error for invalid ffmpeg path', async () => {
      const destPath = path.join(tempDir, 'output.webm');
      
      // Path with shell metacharacters should be rejected by sanitizer
      mockConfigValues['ffmpegPath'] = 'ffmpeg; rm -rf /';
      
      await assert.rejects(
        async () => convertOutput(tempMp4Path, destPath, 'webm'),
        /gEcho: Invalid ffmpeg path/
      );
    });

    it('rejects with spawn error when ffmpeg binary does not exist', async () => {
      const destPath = path.join(tempDir, 'output.webm');
      
      // Non-existent binary triggers spawn ENOENT error
      mockConfigValues['ffmpegPath'] = '/no/such/ffmpeg/binary';
      
      await assert.rejects(
        async () => convertOutput(tempMp4Path, destPath, 'webm'),
        /ENOENT|no such file/i
      );
    });

    it('resolves when ffmpeg exits with code 0', async () => {
      const destPath = path.join(tempDir, 'output.webm');
      
      const wrapperPath = await createFfmpegWrapper(tempDir, 'ffmpeg-wrapper', fixtureSuccessPath);
      mockConfigValues['ffmpegPath'] = wrapperPath;
      
      // Should resolve without error
      await convertOutput(tempMp4Path, destPath, 'webm');
    });

    it('rejects with exit code and stderr when ffmpeg fails', async () => {
      const destPath = path.join(tempDir, 'output.webm');
      
      const wrapperPath = await createFfmpegWrapper(tempDir, 'ffmpeg-wrapper-fail', fixtureFailPath);
      mockConfigValues['ffmpegPath'] = wrapperPath;
      
      await assert.rejects(
        async () => convertOutput(tempMp4Path, destPath, 'webm'),
        (err: Error) => {
          // Check error message contains the key parts
          assert.match(err.message, /gEcho: ffmpeg WebM encode exited with code 1/);
          assert.match(err.message, /WebM encoding failed/);
          return true;
        }
      );
    });

    it('includes last 500 chars of stderr in error message', async () => {
      const destPath = path.join(tempDir, 'output.webm');
      
      const wrapperPath = await createFfmpegWrapper(tempDir, 'ffmpeg-wrapper-stderr', fixtureFailPath);
      mockConfigValues['ffmpegPath'] = wrapperPath;
      
      await assert.rejects(
        async () => convertOutput(tempMp4Path, destPath, 'webm'),
        (err: Error) => {
          // Verify stderr is included (our fixture writes recognizable text)
          assert.match(err.message, /simulated error for testing/);
          return true;
        }
      );
    });
  });
});
