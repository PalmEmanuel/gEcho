import './integration/vscodeMock.js'; // MUST be the first import

import * as assert from 'node:assert';
import { isFfmpegAvailable } from '../../src/dependencies.js';

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

