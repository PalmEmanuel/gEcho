/**
 * Unit tests for buildCropFilter — the pure function that computes the ffmpeg
 * `-vf` filter string for Retina-aware GIF crop+scale.
 *
 * These tests are the primary regression guard for the macOS Retina fix:
 * the crop coordinates MUST be in physical pixels (logical × scaleFactor) and
 * the scale= output MUST be in logical points so the GIF is not double-sized.
 */

import * as assert from 'node:assert';
import { buildCropFilter } from '../../src/screen/cropFilter.js';

// ---------------------------------------------------------------------------
// Helper — parse a vf string back into its components for readable assertions
// ---------------------------------------------------------------------------
function parseVf(vf: string): { fps: number; pw: number; ph: number; px: number; py: number; sw: number; sh: number } {
  // Expected format: fps=N,crop=pw:ph:px:py,scale=sw:sh
  const m = vf.match(/^fps=(\d+),crop=(\d+):(\d+):(\d+):(\d+),scale=(\d+):(\d+)$/);
  assert.ok(m, `vf string did not match expected format: ${vf}`);
  return {
    fps: Number(m[1]),
    pw: Number(m[2]),
    ph: Number(m[3]),
    px: Number(m[4]),
    py: Number(m[5]),
    sw: Number(m[6]),
    sh: Number(m[7]),
  };
}

// ---------------------------------------------------------------------------
// Suite: format
// ---------------------------------------------------------------------------
describe('buildCropFilter — format', () => {
  it('produces the exact format: fps=N,crop=pw:ph:px:py,scale=w:h', () => {
    const result = buildCropFilter({ x: 0, y: 0, width: 1920, height: 1080 }, 1.0, 10);
    assert.match(result, /^fps=\d+,crop=\d+:\d+:\d+:\d+,scale=\d+:\d+$/);
  });

  it('fps= is the first segment', () => {
    const result = buildCropFilter({ x: 100, y: 200, width: 800, height: 600 }, 1.0, 15);
    assert.ok(result.startsWith('fps=15,'), `Expected fps=15 first, got: ${result}`);
  });

  it('scale= uses logical (non-scaled) dimensions', () => {
    // Even at 2× scale, the output scale must be the logical size
    const result = buildCropFilter({ x: 0, y: 0, width: 1280, height: 800 }, 2.0, 10);
    const parts = parseVf(result);
    assert.strictEqual(parts.sw, 1280);
    assert.strictEqual(parts.sh, 800);
  });
});

// ---------------------------------------------------------------------------
// Suite: scale 1.0 (non-Retina)
// ---------------------------------------------------------------------------
describe('buildCropFilter — scale 1.0 (non-Retina)', () => {
  it('crop coordinates equal logical bounds', () => {
    const result = buildCropFilter({ x: 10, y: 20, width: 800, height: 600 }, 1.0, 10);
    const parts = parseVf(result);
    assert.strictEqual(parts.px, 10, 'px should equal x at scale 1');
    assert.strictEqual(parts.py, 20, 'py should equal y at scale 1');
    assert.strictEqual(parts.pw, 800, 'pw should equal width at scale 1');
    assert.strictEqual(parts.ph, 600, 'ph should equal height at scale 1');
  });

  it('scale= matches crop dimensions when scale is 1.0', () => {
    const result = buildCropFilter({ x: 0, y: 0, width: 1920, height: 1080 }, 1.0, 10);
    const parts = parseVf(result);
    assert.strictEqual(parts.sw, parts.pw);
    assert.strictEqual(parts.sh, parts.ph);
  });

  it('fps is reflected in output', () => {
    const result = buildCropFilter({ x: 0, y: 0, width: 1920, height: 1080 }, 1.0, 24);
    const parts = parseVf(result);
    assert.strictEqual(parts.fps, 24);
  });
});

// ---------------------------------------------------------------------------
// Suite: scale 2.0 (Retina / HiDPI)
// ---------------------------------------------------------------------------
describe('buildCropFilter — scale 2.0 (Retina)', () => {
  it('crop coordinates are exactly doubled', () => {
    const result = buildCropFilter({ x: 100, y: 50, width: 1280, height: 800 }, 2.0, 10);
    const parts = parseVf(result);
    assert.strictEqual(parts.px, 200, 'px should be 2× x');
    assert.strictEqual(parts.py, 100, 'py should be 2× y');
    assert.strictEqual(parts.pw, 2560, 'pw should be 2× width');
    assert.strictEqual(parts.ph, 1600, 'ph should be 2× height');
  });

  it('scale= output remains at logical resolution (not doubled)', () => {
    const result = buildCropFilter({ x: 0, y: 0, width: 1280, height: 800 }, 2.0, 10);
    const parts = parseVf(result);
    assert.strictEqual(parts.sw, 1280);
    assert.strictEqual(parts.sh, 800);
  });

  it('crop width/height are 2× logical, scale= is logical (full identity)', () => {
    const bounds = { x: 0, y: 0, width: 1920, height: 1080 };
    const result = buildCropFilter(bounds, 2.0, 10);
    const parts = parseVf(result);
    assert.strictEqual(parts.pw, 3840);
    assert.strictEqual(parts.ph, 2160);
    assert.strictEqual(parts.sw, 1920);
    assert.strictEqual(parts.sh, 1080);
  });
});

// ---------------------------------------------------------------------------
// Suite: scale 1.5 (fractional, e.g. some Windows/Linux displays)
// ---------------------------------------------------------------------------
describe('buildCropFilter — scale 1.5 (fractional)', () => {
  it('applies Math.round() to fractional pixel coordinates', () => {
    // x=1, scale=1.5 → 1.5 → rounds to 2
    const result = buildCropFilter({ x: 1, y: 1, width: 100, height: 100 }, 1.5, 10);
    const parts = parseVf(result);
    assert.strictEqual(parts.px, Math.round(1 * 1.5));
    assert.strictEqual(parts.py, Math.round(1 * 1.5));
    assert.strictEqual(parts.pw, Math.round(100 * 1.5));
    assert.strictEqual(parts.ph, Math.round(100 * 1.5));
  });

  it('rounds 3.5 up to 4 (x=7/3, scale=1.5 scenario)', () => {
    // width=7, scale=1.5 → 10.5 → rounds to 11
    const result = buildCropFilter({ x: 0, y: 0, width: 7, height: 7 }, 1.5, 10);
    const parts = parseVf(result);
    assert.strictEqual(parts.pw, Math.round(7 * 1.5)); // 11
    assert.strictEqual(parts.ph, Math.round(7 * 1.5)); // 11
  });

  it('scale= output stays at logical (unrounded) dimensions', () => {
    const result = buildCropFilter({ x: 0, y: 0, width: 800, height: 600 }, 1.5, 10);
    const parts = parseVf(result);
    // scale= uses original logical coords — no rounding applied there
    assert.strictEqual(parts.sw, 800);
    assert.strictEqual(parts.sh, 600);
  });
});

// ---------------------------------------------------------------------------
// Suite: zero/edge cases
// ---------------------------------------------------------------------------
describe('buildCropFilter — zero and edge cases', () => {
  it('x=0, y=0 (top-left origin)', () => {
    const result = buildCropFilter({ x: 0, y: 0, width: 1920, height: 1080 }, 2.0, 10);
    const parts = parseVf(result);
    assert.strictEqual(parts.px, 0);
    assert.strictEqual(parts.py, 0);
  });

  it('full-screen bounds with scale 1.0', () => {
    const result = buildCropFilter({ x: 0, y: 0, width: 2560, height: 1440 }, 1.0, 10);
    const parts = parseVf(result);
    assert.strictEqual(parts.pw, 2560);
    assert.strictEqual(parts.ph, 1440);
    assert.strictEqual(parts.px, 0);
    assert.strictEqual(parts.py, 0);
    assert.strictEqual(parts.sw, 2560);
    assert.strictEqual(parts.sh, 1440);
  });

  it('minimal 1×1 window at 2× scale', () => {
    const result = buildCropFilter({ x: 5, y: 10, width: 1, height: 1 }, 2.0, 10);
    const parts = parseVf(result);
    assert.strictEqual(parts.px, 10);
    assert.strictEqual(parts.py, 20);
    assert.strictEqual(parts.pw, 2);
    assert.strictEqual(parts.ph, 2);
  });

  it('large offset coordinates', () => {
    const result = buildCropFilter({ x: 3840, y: 2160, width: 1280, height: 720 }, 2.0, 30);
    const parts = parseVf(result);
    assert.strictEqual(parts.px, 7680);
    assert.strictEqual(parts.py, 4320);
    assert.strictEqual(parts.pw, 2560);
    assert.strictEqual(parts.ph, 1440);
  });

  it('fps=1 (lowest sensible frame rate)', () => {
    const result = buildCropFilter({ x: 0, y: 0, width: 800, height: 600 }, 1.0, 1);
    const parts = parseVf(result);
    assert.strictEqual(parts.fps, 1);
  });

  it('fps=60 (high frame rate)', () => {
    const result = buildCropFilter({ x: 0, y: 0, width: 1920, height: 1080 }, 2.0, 60);
    const parts = parseVf(result);
    assert.strictEqual(parts.fps, 60);
  });
});

// ---------------------------------------------------------------------------
// Suite: regression — old vs new format
// ---------------------------------------------------------------------------
describe('buildCropFilter — format is crop=pw:ph:px:py (not crop=w:h:x:y)', () => {
  it('old format would have crop=800:600:100:50, new format has crop=pw:ph:px:py with scale', () => {
    // At scale 1.0, old and new produce the same crop coords.
    // At scale 2.0 (Retina), they MUST differ — the crop must use physical pixels.
    const logicalBounds = { x: 100, y: 50, width: 800, height: 600 };
    const result = buildCropFilter(logicalBounds, 2.0, 10);

    // The old (buggy) format would be: fps=10,crop=800:600:100:50,scale=800:600
    const oldWouldBe = `fps=10,crop=800:600:100:50,scale=800:600`;
    assert.notStrictEqual(result, oldWouldBe, 'Must not produce old non-Retina crop values');

    // The new format must use physical pixel values
    const parts = parseVf(result);
    assert.strictEqual(parts.pw, 1600, 'pw must be 2× logical width');
    assert.strictEqual(parts.ph, 1200, 'ph must be 2× logical height');
    assert.strictEqual(parts.px, 200, 'px must be 2× logical x');
    assert.strictEqual(parts.py, 100, 'py must be 2× logical y');
  });
});
