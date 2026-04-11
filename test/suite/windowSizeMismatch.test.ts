import * as assert from 'assert';
import * as vscode from 'vscode';
import { checkWindowSizeMismatch, WINDOW_SIZE_TOLERANCE_PX } from '../../src/extension.js';
import * as platform from '../../src/platform/index.js';
import type { Echo } from '../../src/types/echo.js';

function makeEcho(windowSize?: { width: number; height: number }): Echo {
  return {
    version: '1.0',
    metadata: { name: 'test', windowSize },
    steps: [],
  };
}

describe('checkWindowSizeMismatch', () => {
  let origGetWindowBounds: typeof platform.getWindowBounds;
  let origClearCache: typeof platform.clearWindowInfoCache;
  let origShowWarning: typeof vscode.window.showWarningMessage;

  beforeEach(() => {
    origGetWindowBounds = platform.getWindowBounds;
    origClearCache = platform.clearWindowInfoCache;
    origShowWarning = vscode.window.showWarningMessage;
  });

  afterEach(() => {
    (platform as any).getWindowBounds = origGetWindowBounds;
    (platform as any).clearWindowInfoCache = origClearCache;
    (vscode.window as any).showWarningMessage = origShowWarning;
  });

  it('returns true when echo has no windowSize in metadata', async () => {
    const echo = makeEcho(undefined);
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, true);
  });

  it('returns true when window size is within tolerance', async () => {
    (platform as any).getWindowBounds = async () => ({
      x: 0, y: 0, width: 1920 + WINDOW_SIZE_TOLERANCE_PX, height: 1080 - WINDOW_SIZE_TOLERANCE_PX,
    });
    (platform as any).clearWindowInfoCache = () => {};
    const echo = makeEcho({ width: 1920, height: 1080 });
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, true);
  });

  it('shows warning when width differs by more than tolerance', async () => {
    (platform as any).getWindowBounds = async () => ({
      x: 0, y: 0, width: 1920 + WINDOW_SIZE_TOLERANCE_PX + 1, height: 1080,
    });
    (platform as any).clearWindowInfoCache = () => {};
    let warningMessage = '';
    (vscode.window as any).showWarningMessage = async (msg: string) => {
      warningMessage = msg;
      return 'Continue';
    };
    const echo = makeEcho({ width: 1920, height: 1080 });
    await checkWindowSizeMismatch(echo, false);
    assert.ok(warningMessage.includes('1920'), 'Warning should include echo width');
    assert.ok(warningMessage.includes('1080'), 'Warning should include echo height');
    assert.ok(warningMessage.includes(`${1920 + WINDOW_SIZE_TOLERANCE_PX + 1}`), 'Warning should include current width');
  });

  it('shows warning when height differs by more than tolerance', async () => {
    (platform as any).getWindowBounds = async () => ({
      x: 0, y: 0, width: 1440, height: 900 + WINDOW_SIZE_TOLERANCE_PX + 1,
    });
    (platform as any).clearWindowInfoCache = () => {};
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
    (platform as any).getWindowBounds = async () => ({
      x: 0, y: 0, width: 1920, height: 1080,
    });
    (platform as any).clearWindowInfoCache = () => {};
    (vscode.window as any).showWarningMessage = async () => 'Continue';
    const echo = makeEcho({ width: 1440, height: 900 });
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, true);
  });

  it('returns false when user clicks Cancel', async () => {
    (platform as any).getWindowBounds = async () => ({
      x: 0, y: 0, width: 1920, height: 1080,
    });
    (platform as any).clearWindowInfoCache = () => {};
    (vscode.window as any).showWarningMessage = async () => 'Cancel';
    const echo = makeEcho({ width: 1440, height: 900 });
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, false);
  });

  it('returns false when user dismisses the dialog', async () => {
    (platform as any).getWindowBounds = async () => ({
      x: 0, y: 0, width: 1920, height: 1080,
    });
    (platform as any).clearWindowInfoCache = () => {};
    (vscode.window as any).showWarningMessage = async () => undefined;
    const echo = makeEcho({ width: 1440, height: 900 });
    const result = await checkWindowSizeMismatch(echo, false);
    assert.strictEqual(result, false);
  });

  it('includes GIF detail in warning when isGifMode is true', async () => {
    (platform as any).getWindowBounds = async () => ({
      x: 0, y: 0, width: 1920, height: 1080,
    });
    (platform as any).clearWindowInfoCache = () => {};
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
    (platform as any).getWindowBounds = async () => ({
      x: 0, y: 0, width: 1920, height: 1080,
    });
    (platform as any).clearWindowInfoCache = () => {};
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
