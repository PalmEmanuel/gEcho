import * as assert from 'assert';
import * as vscode from 'vscode';
import { checkWindowSizeMismatch, WINDOW_SIZE_TOLERANCE_PX } from '../../src/extension.js';
import type { Echo } from '../../src/types/echo.js';

// Use require() to get the raw CJS exports object from platform.js — its
// properties are writable, unlike the getter-only re-exports in index.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const platformImpl = require('../../src/platform/platform.js') as typeof import('../../src/platform/platform.js');

function makeEcho(windowSize?: { width: number; height: number } | any): Echo {
  return {
    version: '1.0',
    metadata: { name: 'test', windowSize },
    steps: [],
  } as Echo;
}

describe('checkWindowSizeMismatch', () => {
  let origGetWindowBounds: typeof platformImpl.getWindowBounds;
  let origClearCache: typeof platformImpl.clearWindowInfoCache;
  let origShowWarning: typeof vscode.window.showWarningMessage;

  beforeEach(() => {
    origGetWindowBounds = platformImpl.getWindowBounds;
    origClearCache = platformImpl.clearWindowInfoCache;
    origShowWarning = vscode.window.showWarningMessage;
  });

  afterEach(() => {
    platformImpl.getWindowBounds = origGetWindowBounds;
    platformImpl.clearWindowInfoCache = origClearCache;
    (vscode.window as any).showWarningMessage = origShowWarning;
  });

  it('returns true when echo has no windowSize in metadata', async () => {
    const echo = makeEcho(undefined);
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, true);
  });

  it('returns true when windowSize has non-numeric width', async () => {
    const echo = makeEcho({ width: 'bad', height: 1080 });
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, true);
  });

  it('returns true when windowSize has NaN height', async () => {
    const echo = makeEcho({ width: 1920, height: NaN });
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, true);
  });

  it('returns true when windowSize has Infinity width', async () => {
    const echo = makeEcho({ width: Infinity, height: 1080 });
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, true);
  });

  it('returns true when window size is within tolerance', async () => {
    platformImpl.getWindowBounds = (async () => ({
      x: 0, y: 0, width: 1920 + WINDOW_SIZE_TOLERANCE_PX, height: 1080 - WINDOW_SIZE_TOLERANCE_PX,
    })) as typeof platformImpl.getWindowBounds;
    platformImpl.clearWindowInfoCache = () => {};
    const echo = makeEcho({ width: 1920, height: 1080 });
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, true);
  });

  it('shows warning when width differs by more than tolerance', async () => {
    platformImpl.getWindowBounds = (async () => ({
      x: 0, y: 0, width: 1920 + WINDOW_SIZE_TOLERANCE_PX + 1, height: 1080,
    })) as typeof platformImpl.getWindowBounds;
    platformImpl.clearWindowInfoCache = () => {};
    let warningMessage = '';
    (vscode.window as any).showWarningMessage = async (msg: string) => {
      warningMessage = msg;
      return 'Continue';
    };
    const echo = makeEcho({ width: 1920, height: 1080 });
    await checkWindowSizeMismatch(echo, false);
    assert.ok(warningMessage.startsWith('gEcho:'), 'Warning should have gEcho: prefix');
    assert.ok(warningMessage.includes('1920'), 'Warning should include echo width');
    assert.ok(warningMessage.includes('1080'), 'Warning should include echo height');
    assert.ok(warningMessage.includes(`${1920 + WINDOW_SIZE_TOLERANCE_PX + 1}`), 'Warning should include current width');
  });

  it('shows warning when height differs by more than tolerance', async () => {
    platformImpl.getWindowBounds = (async () => ({
      x: 0, y: 0, width: 1440, height: 900 + WINDOW_SIZE_TOLERANCE_PX + 1,
    })) as typeof platformImpl.getWindowBounds;
    platformImpl.clearWindowInfoCache = () => {};
    let warningMessage = '';
    (vscode.window as any).showWarningMessage = async (msg: string) => {
      warningMessage = msg;
      return 'Continue';
    };
    const echo = makeEcho({ width: 1440, height: 900 });
    await checkWindowSizeMismatch(echo, false);
    assert.ok(warningMessage.includes('1440'), 'Warning should include echo width');
    assert.ok(warningMessage.includes('900'), 'Warning should include echo height');
  });

  it('returns true when user clicks Continue', async () => {
    platformImpl.getWindowBounds = (async () => ({
      x: 0, y: 0, width: 1920, height: 1080,
    })) as typeof platformImpl.getWindowBounds;
    platformImpl.clearWindowInfoCache = () => {};
    (vscode.window as any).showWarningMessage = async () => 'Continue';
    const echo = makeEcho({ width: 1440, height: 900 });
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, true);
  });

  it('returns false when user clicks Cancel', async () => {
    platformImpl.getWindowBounds = (async () => ({
      x: 0, y: 0, width: 1920, height: 1080,
    })) as typeof platformImpl.getWindowBounds;
    platformImpl.clearWindowInfoCache = () => {};
    (vscode.window as any).showWarningMessage = async () => 'Cancel';
    const echo = makeEcho({ width: 1440, height: 900 });
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, false);
  });

  it('returns false when user dismisses the dialog', async () => {
    platformImpl.getWindowBounds = (async () => ({
      x: 0, y: 0, width: 1920, height: 1080,
    })) as typeof platformImpl.getWindowBounds;
    platformImpl.clearWindowInfoCache = () => {};
    (vscode.window as any).showWarningMessage = async () => undefined;
    const echo = makeEcho({ width: 1440, height: 900 });
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, false);
  });

  it('includes GIF detail in warning when isGifMode is true', async () => {
    platformImpl.getWindowBounds = (async () => ({
      x: 0, y: 0, width: 1920, height: 1080,
    })) as typeof platformImpl.getWindowBounds;
    platformImpl.clearWindowInfoCache = () => {};
    let warningMessage = '';
    (vscode.window as any).showWarningMessage = async (msg: string) => {
      warningMessage = msg;
      return 'Continue';
    };
    const echo = makeEcho({ width: 1440, height: 900 });
    await checkWindowSizeMismatch(echo, true);
    assert.ok(
      warningMessage.includes('GIF output will reflect the actual window size'),
      'GIF mode warning should include GIF detail'
    );
  });

  it('does not include GIF detail when isGifMode is false', async () => {
    platformImpl.getWindowBounds = (async () => ({
      x: 0, y: 0, width: 1920, height: 1080,
    })) as typeof platformImpl.getWindowBounds;
    platformImpl.clearWindowInfoCache = () => {};
    let warningMessage = '';
    (vscode.window as any).showWarningMessage = async (msg: string) => {
      warningMessage = msg;
      return 'Continue';
    };
    const echo = makeEcho({ width: 1440, height: 900 });
    await checkWindowSizeMismatch(echo, false);
    assert.ok(
      !warningMessage.includes('GIF'),
      'Non-GIF mode warning should not include GIF detail'
    );
  });
});
