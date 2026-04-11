import * as assert from 'assert';
import * as vscode from 'vscode';
import { runCountdown } from '../../src/ui/countdown.js';

function makeStatusBar(): vscode.StatusBarItem {
  return vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
}

describe('runCountdown', () => {
  it('returns true immediately when seconds is 0 (skip path)', async () => {
    const bar = makeStatusBar();
    try {
      const result = await runCountdown(0, bar);
      assert.strictEqual(result, true);
    } finally {
      bar.dispose();
    }
  });

  it('returns true immediately when seconds is negative', async () => {
    const bar = makeStatusBar();
    try {
      const result = await runCountdown(-5, bar);
      assert.strictEqual(result, true);
    } finally {
      bar.dispose();
    }
  });

  it('coerces fractional seconds to integer (0.9 treated as 0)', async () => {
    const bar = makeStatusBar();
    try {
      const result = await runCountdown(0.9, bar);
      assert.strictEqual(result, true);
    } finally {
      bar.dispose();
    }
  });

  it('returns false when token is already cancelled before countdown starts', async () => {
    const bar = makeStatusBar();
    const cts = new vscode.CancellationTokenSource();
    cts.cancel();
    try {
      const result = await runCountdown(5, bar, cts.token);
      assert.strictEqual(result, false);
    } finally {
      bar.dispose();
      cts.dispose();
    }
  });

  it('returns false when token is cancelled during countdown', async () => {
    const bar = makeStatusBar();
    const cts = new vscode.CancellationTokenSource();
    try {
      // Cancel after a short delay while countdown of 10s is running
      setTimeout(() => cts.cancel(), 150);
      const result = await runCountdown(10, bar, cts.token);
      assert.strictEqual(result, false);
    } finally {
      bar.dispose();
      cts.dispose();
    }
  }).timeout(2000);

  it('returns true when short countdown completes without cancellation', async () => {
    const bar = makeStatusBar();
    const cts = new vscode.CancellationTokenSource();
    try {
      const result = await runCountdown(1, bar, cts.token);
      assert.strictEqual(result, true);
    } finally {
      bar.dispose();
      cts.dispose();
    }
  }).timeout(3000);
});
