import '../suite/integration/vscodeMock.js'; // MUST be the first import — registers vscode stub

import * as assert from 'assert';
import { resolveCrop, buildCropFilter } from '../../src/converter/gifConverter.js';
import type { CropConfig, CropPreset } from '../../src/types/recording.js';

const ZERO_CROP: CropConfig = { top: 0, bottom: 0, left: 0, right: 0 };

describe('buildCropFilter', () => {
  it('returns undefined when all values are zero', () => {
    assert.strictEqual(buildCropFilter(ZERO_CROP), undefined);
  });

  it('returns crop filter when top is set', () => {
    const result = buildCropFilter({ top: 30, bottom: 0, left: 0, right: 0 });
    assert.strictEqual(result, 'crop=in_w:in_h-30:0:30');
  });

  it('returns crop filter when bottom is set', () => {
    const result = buildCropFilter({ top: 0, bottom: 22, left: 0, right: 0 });
    assert.strictEqual(result, 'crop=in_w:in_h-22:0:0');
  });

  it('returns crop filter when left and right are set', () => {
    const result = buildCropFilter({ top: 0, bottom: 0, left: 10, right: 20 });
    assert.strictEqual(result, 'crop=in_w-30:in_h:10:0');
  });

  it('returns crop filter with all edges set', () => {
    const result = buildCropFilter({ top: 30, bottom: 22, left: 10, right: 15 });
    assert.strictEqual(result, 'crop=in_w-25:in_h-52:10:30');
  });

  it('handles top and bottom together', () => {
    const result = buildCropFilter({ top: 30, bottom: 22, left: 0, right: 0 });
    assert.strictEqual(result, 'crop=in_w:in_h-52:0:30');
  });
});

describe('resolveCrop', () => {
  it('returns zero crop for "none" preset with no overrides', () => {
    const result = resolveCrop('none', ZERO_CROP);
    assert.deepStrictEqual(result, ZERO_CROP);
  });

  it('returns preset values for "no-title-bar"', () => {
    const result = resolveCrop('no-title-bar', ZERO_CROP);
    assert.deepStrictEqual(result, { top: 30, bottom: 0, left: 0, right: 0 });
  });

  it('returns preset values for "no-status-bar"', () => {
    const result = resolveCrop('no-status-bar', ZERO_CROP);
    assert.deepStrictEqual(result, { top: 0, bottom: 22, left: 0, right: 0 });
  });

  it('returns preset values for "content-only"', () => {
    const result = resolveCrop('content-only', ZERO_CROP);
    assert.deepStrictEqual(result, { top: 30, bottom: 22, left: 0, right: 0 });
  });

  it('config values override preset values', () => {
    const configCrop: CropConfig = { top: 50, bottom: 0, left: 0, right: 0 };
    const result = resolveCrop('no-title-bar', configCrop);
    assert.strictEqual(result.top, 50);
  });

  it('options override both preset and config', () => {
    const configCrop: CropConfig = { top: 50, bottom: 0, left: 0, right: 0 };
    const result = resolveCrop('no-title-bar', configCrop, { top: 100 });
    assert.strictEqual(result.top, 100);
  });

  it('options override only specified sides', () => {
    const result = resolveCrop('content-only', ZERO_CROP, { top: 40 });
    assert.deepStrictEqual(result, { top: 40, bottom: 22, left: 0, right: 0 });
  });

  it('partial options merge with preset defaults', () => {
    const result = resolveCrop('none', ZERO_CROP, { left: 5, right: 5 });
    assert.deepStrictEqual(result, { top: 0, bottom: 0, left: 5, right: 5 });
  });

  it('accepts all valid CropPreset values', () => {
    const presets: CropPreset[] = ['none', 'no-title-bar', 'no-status-bar', 'content-only'];
    for (const preset of presets) {
      const result = resolveCrop(preset, ZERO_CROP);
      assert.strictEqual(typeof result.top, 'number');
      assert.strictEqual(typeof result.bottom, 'number');
      assert.strictEqual(typeof result.left, 'number');
      assert.strictEqual(typeof result.right, 'number');
    }
  });
});
