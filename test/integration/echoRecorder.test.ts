import * as assert from 'assert';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as vscode from 'vscode';
import { EchoRecorder } from '../../src/recording/recorder.js';
import { readEcho, writeEcho, validateEcho } from '../../src/echo/index.js';
import type { Echo } from '../../src/types/echo.js';

/**
 * Integration tests for EchoRecorder.
 *
 * Unlike the unit tests in test/suite/recorder.test.ts (which verify individual behaviours
 * like coalescing or the stop() contract), these tests exercise the full
 * record → save → reload pipeline against a real VS Code editor instance.
 */
describe('EchoRecorder integration — record → write → reload', function () {
  this.timeout(15000);

  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gecho-rec-inttest-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('captures real typing events, writes a valid .gecho.json, and reloads it correctly', async function () {
    const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);

    const recorder = new EchoRecorder();
    recorder.start();

    // Type via VS Code command — this triggers onDidChangeTextDocument
    await vscode.commands.executeCommand('type', { text: 'integration test recording' });

    const steps = recorder.stop();

    assert.ok(steps.length > 0, 'Recorder should have captured at least one step');
    const typeSteps = steps.filter(s => s.type === 'type');
    assert.ok(typeSteps.length > 0, 'At least one type step should be captured');

    const combined = typeSteps.map(s => (s as { text: string }).text).join('');
    assert.ok(
      combined.includes('integration test recording'),
      `Expected captured text to contain "integration test recording", got: "${combined}"`,
    );

    // Build an echo and write it to disk
    const echo: Echo = {
      version: '1.0',
      metadata: { name: 'integration-recorder-test', created: new Date().toISOString() },
      steps,
    };

    const filePath = path.join(tmpDir, 'recording.gecho.json');
    await writeEcho(echo, filePath);

    // Verify the file exists and parses as a valid echo
    const stat = await fs.stat(filePath);
    assert.ok(stat.size > 0, 'Written echo file must not be empty');

    const reloaded = await readEcho(filePath);
    assert.ok(validateEcho(reloaded), 'Reloaded echo must pass validation');
    assert.strictEqual(reloaded.version, '1.0');
    assert.strictEqual(reloaded.metadata.name, 'integration-recorder-test');
    assert.strictEqual(reloaded.steps.length, steps.length, 'Step count must survive serialisation roundtrip');
  });

  it('produces an echo that can immediately be replayed by EchoPlayer', async function () {
    const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);

    const recorder = new EchoRecorder();
    recorder.start();
    await vscode.commands.executeCommand('type', { text: 'replay me' });
    const steps = recorder.stop();

    const echo: Echo = {
      version: '1.0',
      metadata: { name: 'replay-roundtrip' },
      steps,
    };

    // Write and reload to test the full roundtrip path, not just in-memory
    const filePath = path.join(tmpDir, 'replay-roundtrip.gecho.json');
    await writeEcho(echo, filePath);
    const reloaded = await readEcho(filePath);

    // Open a fresh document, replay the recording into it
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const fresh = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
    await vscode.window.showTextDocument(fresh);

    const { EchoPlayer } = await import('../../src/replay/player.js');
    const player = new EchoPlayer();
    await player.play(reloaded);

    const result = fresh.getText();
    assert.ok(
      result.includes('replay me'),
      `Replayed document should contain "replay me", got: "${result}"`,
    );
  });
});
