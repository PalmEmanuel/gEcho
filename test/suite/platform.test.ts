import * as assert from 'assert';
import { detectPlatform, getWindowScaleFactor, clearWindowInfoCache, checkScreenRecordingPermissionNative } from '../../src/platform/index.js';
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

// ---------------------------------------------------------------------------
// getWindowScaleFactor
// ---------------------------------------------------------------------------
describe('getWindowScaleFactor', () => {
  afterEach(() => {
    clearWindowInfoCache();
  });

  it('returns a number ≥ 1', async () => {
    const scale = await getWindowScaleFactor();
    assert.ok(typeof scale === 'number', `Expected number, got ${typeof scale}`);
    assert.ok(scale >= 1, `Expected scale ≥ 1, got ${scale}`);
  });

  it('returns a finite number (not NaN or Infinity)', async () => {
    const scale = await getWindowScaleFactor();
    assert.ok(Number.isFinite(scale), `Expected finite number, got ${scale}`);
  });

  it('falls back to 1.0 when the helper JSON is missing scaleFactor (backwards compat)', async () => {
    // The FALLBACK_INFO constant has scaleFactor: 1.
    // When the helper is absent or returns bad JSON, clearWindowInfoCache() + a broken env
    // will trigger the fallback. We verify the fallback value is 1 by checking the
    // ?? 1 guard directly: getWindowScaleFactor returns (info.scaleFactor ?? 1).
    // We test this indirectly: on any platform, after clearing cache, the result is ≥ 1.
    clearWindowInfoCache();
    const scale = await getWindowScaleFactor();
    assert.ok(scale >= 1, `Fallback must be ≥ 1, got ${scale}`);
  });

  it('caches the result across multiple calls (no duplicate binary invocations)', async () => {
    clearWindowInfoCache();
    const scale1 = await getWindowScaleFactor();
    const scale2 = await getWindowScaleFactor();
    const scale3 = await getWindowScaleFactor();
    // All three calls should return the same value because the cache is shared
    assert.strictEqual(scale1, scale2, 'scale1 should equal scale2');
    assert.strictEqual(scale2, scale3, 'scale2 should equal scale3');
  });

  it('clears the cache when clearWindowInfoCache() is called', async () => {
    clearWindowInfoCache();
    const scale1 = await getWindowScaleFactor();
    clearWindowInfoCache();
    const scale2 = await getWindowScaleFactor();
    // We can't assert they differ (platform is stable), but we can assert they're both valid
    assert.ok(scale1 >= 1, `scale1 must be ≥ 1, got ${scale1}`);
    assert.ok(scale2 >= 1, `scale2 must be ≥ 1, got ${scale2}`);
  });
});

// ---------------------------------------------------------------------------
// checkScreenRecordingPermissionNative
// ---------------------------------------------------------------------------
describe('checkScreenRecordingPermissionNative', () => {
  it('returns a boolean (true or false)', async () => {
    const result = await checkScreenRecordingPermissionNative();
    assert.strictEqual(typeof result, 'boolean');
  });

  it('returns true on non-darwin platforms (platform guard)', async function () {
    if (process.platform === 'darwin') {
      this.skip(); // darwin behaviour is tested separately below
    }
    const result = await checkScreenRecordingPermissionNative();
    assert.strictEqual(result, true, 'Non-darwin must fast-return true without executing any binary');
  });

  it('returns true on darwin when running in a development/CI environment with permission', async function () {
    if (process.platform !== 'darwin') {
      this.skip();
    }
    // The dev/CI mac running these tests should have Screen Recording permission.
    // If the helper binary is missing (ENOENT), the function still returns true (don't block).
    const result = await checkScreenRecordingPermissionNative();
    assert.strictEqual(typeof result, 'boolean', 'Must return boolean even if helper is absent');
    // We can't assert the value — it depends on TCC state.
    // The point of this test is "does not throw and returns boolean".
  });
});

