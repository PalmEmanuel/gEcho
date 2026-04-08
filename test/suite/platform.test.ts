import * as assert from 'assert';
import { detectPlatform } from '../../src/platform/index.js';
import type { Platform } from '../../src/types/recording.js';

const KNOWN_PLATFORMS: Platform[] = ['darwin', 'linux', 'win32'];

describe('detectPlatform', () => {
  it('returns a known platform string', () => {
    const platform = detectPlatform();
    assert.ok(
      KNOWN_PLATFORMS.includes(platform),
      `Expected one of ${KNOWN_PLATFORMS.join('/')} but got '${platform}'`,
    );
  });

  it('result is one of darwin/linux/win32', () => {
    const platform = detectPlatform();
    const valid = platform === 'darwin' || platform === 'linux' || platform === 'win32';
    assert.ok(valid, `Unexpected platform: '${platform}'`);
  });
});
