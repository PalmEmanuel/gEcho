// Integration test — requires VS Code Extension Host
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import type { Workbook } from '../../../src/types/workbook.js';
import { EchoRecorder } from '../../../src/recording/recorder.js';
import { WorkbookPlayer } from '../../../src/replay/player.js';

// ---------------------------------------------------------------------------
// Helper: wait up to `ms` for a condition to be true, polling every 20 ms.
// ---------------------------------------------------------------------------
async function waitUntil(condition: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('waitUntil timed out');
    }
    await new Promise<void>(r => setTimeout(r, 20));
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('Workbook round-trip integration', function () {
  this.timeout(30_000);

  it('records text insertion and replays it back into a fresh document', async function () {
    // 1. Open an untitled plaintext document and make it the active editor.
    const doc = await vscode.workspace.openTextDocument({
      content: '',
      language: 'plaintext',
    });
    await vscode.window.showTextDocument(doc);

    // 2. Start the recorder.
    const recorder = new EchoRecorder();
    recorder.start();

    // 3. Insert known text via applyEdit — fires onDidChangeTextDocument with
    //    rangeLength === 0 and text.length > 0, which EchoRecorder captures.
    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, new vscode.Position(0, 0), 'Hello, world!');
    await vscode.workspace.applyEdit(edit);

    // Give the event loop a tick so the listener fires.
    await new Promise<void>(r => setTimeout(r, 50));

    // 4. Stop recording.
    const steps = recorder.stop();

    // 5. Assert at least one TypeStep was captured containing the inserted text.
    const typeSteps = steps.filter(s => s.type === 'type');
    assert.ok(typeSteps.length > 0, 'Recorder should have captured at least one type step');
    const capturedText = typeSteps.map(s => (s as { text: string }).text).join('');
    assert.ok(
      capturedText.includes('Hello'),
      `Expected captured text to contain "Hello", got: ${JSON.stringify(capturedText)}`,
    );

    // 6. Build a workbook from the captured steps, keeping only type steps so
    //    the playback is deterministic (exclude select/openFile side-effects).
    const workbook: Workbook = {
      version: '1.0',
      metadata: { name: 'roundtrip-test' },
      steps: typeSteps,
    };

    // 7. Clear the document so we start from empty.
    const clearEdit = new vscode.WorkspaceEdit();
    clearEdit.replace(
      doc.uri,
      new vscode.Range(0, 0, doc.lineCount, 0),
      '',
    );
    await vscode.workspace.applyEdit(clearEdit);
    await waitUntil(() => doc.getText() === '');

    // Ensure the editor is still active before playback.
    await vscode.window.showTextDocument(doc);

    // 8. Play back the recorded workbook.
    const player = new WorkbookPlayer();
    await player.play(workbook);

    // 9. Verify the document now contains the replayed text.
    const finalText = doc.getText();
    assert.ok(
      finalText.includes('Hello'),
      `Expected document to contain "Hello" after playback, got: ${JSON.stringify(finalText)}`,
    );

    // Cleanup.
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });

  it('recorded workbook is a valid Workbook structure', async function () {
    const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);

    const recorder = new EchoRecorder();
    recorder.start();

    const edit = new vscode.WorkspaceEdit();
    edit.insert(doc.uri, new vscode.Position(0, 0), 'test');
    await vscode.workspace.applyEdit(edit);
    await new Promise<void>(r => setTimeout(r, 50));

    const steps = recorder.stop();

    const workbook: Workbook = {
      version: '1.0',
      metadata: { name: 'structure-test' },
      steps,
    };

    assert.strictEqual(workbook.version, '1.0');
    assert.strictEqual(typeof workbook.metadata.name, 'string');
    assert.ok(Array.isArray(workbook.steps));

    // Write and re-read to verify JSON round-trip.
    const tmpFile = path.join(os.tmpdir(), `gecho-rtrip-${Date.now()}.json`);
    try {
      await fs.writeFile(tmpFile, JSON.stringify(workbook, null, 2), 'utf8');
      const raw = await fs.readFile(tmpFile, 'utf8');
      const parsed = JSON.parse(raw) as Workbook;
      assert.strictEqual(parsed.version, '1.0');
      assert.ok(Array.isArray(parsed.steps));
    } finally {
      await fs.rm(tmpFile, { force: true });
    }

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
});
