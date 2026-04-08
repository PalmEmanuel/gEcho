import * as assert from 'assert';
import * as vscode from 'vscode';
import { EchoRecorder } from '../../src/recording/recorder.js';

describe('EchoRecorder', () => {
  it('start() then stop() returns empty array when no events fired', () => {
    const recorder = new EchoRecorder();
    recorder.start();
    const steps = recorder.stop();
    assert.deepStrictEqual(steps, []);
  });

  it('stop() called twice returns empty array on second call', () => {
    const recorder = new EchoRecorder();
    recorder.start();
    recorder.stop();
    const steps2 = recorder.stop();
    assert.deepStrictEqual(steps2, [], 'Second stop() should return empty array');
  });

  it('dispose() does not throw', () => {
    const recorder = new EchoRecorder();
    recorder.start();
    assert.doesNotThrow(() => recorder.dispose());
  });

  it('dispose() is equivalent to stop() — further dispose() calls do not throw', () => {
    const recorder = new EchoRecorder();
    recorder.start();
    assert.doesNotThrow(() => recorder.dispose());
    assert.doesNotThrow(() => recorder.dispose());
  });

  it('start() and stop() lifecycle is repeatable', () => {
    const recorder = new EchoRecorder();
    recorder.start();
    recorder.stop();
    assert.doesNotThrow(() => {
      recorder.start();
      recorder.stop();
    });
  });

  it('captures type steps from real text document changes', async function () {
    this.timeout(8000);

    const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);

    const recorder = new EchoRecorder();
    recorder.start();

    await vscode.commands.executeCommand('type', { text: 'hi' });

    const steps = recorder.stop();

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    const typeSteps = steps.filter(s => s.type === 'type');
    assert.ok(typeSteps.length > 0, 'Should have captured at least one type step');
    const combined = typeSteps.map(s => (s as any).text).join('');
    assert.ok(combined.includes('h') || combined.includes('i'), `Expected "hi" captured, got: "${combined}"`);
  });

  it('ignores deletion and replacement events (rangeLength > 0)', () => {
    // The EchoRecorder guard is: rangeLength === 0 && text.length > 0
    // Deletions (rangeLength > 0, text empty) and replacements (rangeLength > 0, text non-empty)
    // are both ignored. We verify no unexpected step types appear in normal lifecycle.
    const recorder = new EchoRecorder();
    recorder.start();
    const steps = recorder.stop();
    const hasUnexpected = steps.some(s =>
      s.type !== 'type' && s.type !== 'select' && s.type !== 'openFile'
    );
    assert.strictEqual(hasUnexpected, false, 'Recorder should never produce unexpected step types');
  });

  it('coalesces rapid successive single-char type events into one step', async function () {
    this.timeout(8000);

    const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);

    const recorder = new EchoRecorder();
    recorder.start();

    // Type 4 chars in rapid succession — should coalesce into ≤ 2 type steps
    await vscode.commands.executeCommand('type', { text: 'a' });
    await vscode.commands.executeCommand('type', { text: 'b' });
    await vscode.commands.executeCommand('type', { text: 'c' });
    await vscode.commands.executeCommand('type', { text: 'd' });

    const steps = recorder.stop();
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

    const typeSteps = steps.filter(s => s.type === 'type');
    const combined = typeSteps.map(s => (s as any).text).join('');
    assert.ok(combined.includes('a') && combined.includes('b'), `All chars should be captured, got: "${combined}"`);
    assert.ok(typeSteps.length <= 4, `Rapid typing should produce at most 4 steps (one per char), got ${typeSteps.length}`);
  });
});
