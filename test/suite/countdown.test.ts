import * as assert from 'assert';
import { runCountdown } from '../../src/ui/countdown.js';
import type * as vscode from 'vscode';

// Minimal StatusBarItem stub — runCountdown only writes to .text
function makeStatusBar(): vscode.StatusBarItem {
  return { text: '' } as unknown as vscode.StatusBarItem;
}

// Minimal CancellationTokenSource stub that does not depend on the real VS Code runtime.
// runCountdown only uses token.isCancellationRequested and token.onCancellationRequested.
class FakeTokenSource {
  private _cancelled = false;
  private _listeners: (() => void)[] = [];

  readonly token = {
    get isCancellationRequested() { return false; }, // overridden below
    onCancellationRequested: (listener: () => void): vscode.Disposable => {
      this._listeners.push(listener);
      return { dispose: () => { /* noop */ } } as vscode.Disposable;
    },
  } as unknown as vscode.CancellationToken;

  constructor() {
    // Give token a mutable isCancellationRequested backed by _cancelled.
    Object.defineProperty(this.token, 'isCancellationRequested', {
      get: () => this._cancelled,
      enumerable: true,
      configurable: true,
    });
  }

  cancel(): void {
    if (!this._cancelled) {
      this._cancelled = true;
      for (const l of this._listeners) { l(); }
    }
  }

  dispose(): void { /* noop */ }
}

describe('runCountdown', () => {
  it('returns true immediately when seconds is 0 (skip path)', async () => {
    const bar = makeStatusBar();
    const result = await runCountdown(0, bar);
    assert.strictEqual(result, true);
  });

  it('returns true immediately when seconds is negative', async () => {
    const bar = makeStatusBar();
    const result = await runCountdown(-5, bar);
    assert.strictEqual(result, true);
  });

  it('coerces fractional seconds to integer (0.9 treated as 0)', async () => {
    const bar = makeStatusBar();
    const result = await runCountdown(0.9, bar);
    assert.strictEqual(result, true);
  });

  it('coerces fractional seconds to integer (1.7 treated as 1, completes normally)', async () => {
    const bar = makeStatusBar();
    const result = await runCountdown(1.7, bar);
    assert.strictEqual(result, true);
  }).timeout(3000);

  it('returns false when token is already cancelled before countdown starts', async () => {
    const bar = makeStatusBar();
    const cts = new FakeTokenSource();
    cts.cancel();
    const result = await runCountdown(5, bar, cts.token);
    assert.strictEqual(result, false);
  });

  it('returns false when token is cancelled during countdown', async () => {
    const bar = makeStatusBar();
    const cts = new FakeTokenSource();
    // Cancel after a short delay while countdown of 10s is running
    setTimeout(() => cts.cancel(), 150);
    const result = await runCountdown(10, bar, cts.token);
    assert.strictEqual(result, false);
  }).timeout(2000);

  it('returns true when short countdown completes without cancellation', async () => {
    const bar = makeStatusBar();
    const cts = new FakeTokenSource();
    const result = await runCountdown(1, bar, cts.token);
    assert.strictEqual(result, true);
  }).timeout(3000);
});
