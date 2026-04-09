// Integration test — requires VS Code Extension Host
import * as assert from 'node:assert';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import type { Workbook } from '../../../src/types/workbook.js';
import { WorkbookPlayer } from '../../../src/replay/player.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeWorkbook(steps: Workbook['steps']): Workbook {
  return { version: '1.0', metadata: { name: 'fidelity-test' }, steps };
}

async function openFreshDoc(): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
  await vscode.window.showTextDocument(doc);
  return doc;
}

async function waitMs(ms: number): Promise<void> {
  return new Promise<void>(r => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describe('WorkbookPlayer fidelity integration', function () {
  this.timeout(20_000);

  // ------------------------------------------------------------------
  // type step
  // ------------------------------------------------------------------
  describe('type step', function () {
    it('inserts text into the active editor (no delay)', async function () {
      const doc = await openFreshDoc();
      const player = new WorkbookPlayer();
      await player.play(makeWorkbook([{ type: 'type', text: 'fidelity' }]));
      assert.ok(
        doc.getText().includes('fidelity'),
        `Expected "fidelity" in document, got: ${JSON.stringify(doc.getText())}`,
      );
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });

    it('inserts text per-character when delay > 0', async function () {
      const doc = await openFreshDoc();
      const player = new WorkbookPlayer();
      // delay: 10 ms → per-char cadence, finishes quickly
      await player.play(makeWorkbook([{ type: 'type', text: 'abc', delay: 10 }]));
      assert.ok(
        doc.getText().includes('abc'),
        `Expected "abc" in document, got: ${JSON.stringify(doc.getText())}`,
      );
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
  });

  // ------------------------------------------------------------------
  // wait step
  // ------------------------------------------------------------------
  describe('wait step', function () {
    it('pauses execution for approximately the requested duration (±200 ms)', async function () {
      await openFreshDoc();
      const player = new WorkbookPlayer();
      const waitMs = 200;
      const start = Date.now();
      await player.play(makeWorkbook([{ type: 'wait', ms: waitMs }]));
      const elapsed = Date.now() - start;
      assert.ok(
        elapsed >= waitMs - 50,
        `Elapsed ${elapsed} ms is less than expected ${waitMs - 50} ms`,
      );
      assert.ok(
        elapsed <= waitMs + 200,
        `Elapsed ${elapsed} ms exceeds tolerance of ${waitMs + 200} ms`,
      );
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
  });

  // ------------------------------------------------------------------
  // select step
  // ------------------------------------------------------------------
  describe('select step', function () {
    it('moves the editor selection to the specified position', async function () {
      // Pre-populate the document with a few lines so the selection target exists.
      const doc = await vscode.workspace.openTextDocument({
        content: 'line0\nline1\nline2',
        language: 'plaintext',
      });
      await vscode.window.showTextDocument(doc);

      const player = new WorkbookPlayer();
      await player.play(makeWorkbook([{ type: 'select', anchor: [1, 0], active: [1, 4] }]));

      const editor = vscode.window.activeTextEditor;
      assert.ok(editor, 'Active editor should exist after select step');
      assert.strictEqual(editor.selection.anchor.line, 1);
      assert.strictEqual(editor.selection.active.line, 1);
      assert.strictEqual(editor.selection.active.character, 4);

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
  });

  // ------------------------------------------------------------------
  // scroll step  (mocked executeCommand for editorScroll)
  // ------------------------------------------------------------------
  describe('scroll step', function () {
    it('calls editorScroll with the correct direction and line count', async function () {
      await openFreshDoc();

      const scrollCalls: Array<{ to: string; by: string; value: number }> = [];
      const orig = (vscode.commands as unknown as Record<string, unknown>)['executeCommand'];
      (vscode.commands as unknown as Record<string, unknown>)['executeCommand'] = async (
        cmd: string,
        ...args: unknown[]
      ) => {
        if (cmd === 'editorScroll') {
          scrollCalls.push(args[0] as { to: string; by: string; value: number });
          return;
        }
        return (orig as (...a: unknown[]) => unknown).call(vscode.commands, cmd, ...args);
      };

      try {
        const player = new WorkbookPlayer();
        await player.play(makeWorkbook([{ type: 'scroll', direction: 'down', lines: 5 }]));
        assert.strictEqual(scrollCalls.length, 1, 'editorScroll should be called once');
        assert.deepStrictEqual(scrollCalls[0], { to: 'down', by: 'line', value: 5 });
      } finally {
        (vscode.commands as unknown as Record<string, unknown>)['executeCommand'] = orig;
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }
    });
  });

  // ------------------------------------------------------------------
  // paste step
  // ------------------------------------------------------------------
  describe('paste step', function () {
    it('inserts paste text into the active editor', async function () {
      const doc = await openFreshDoc();
      const player = new WorkbookPlayer();
      await player.play(makeWorkbook([{ type: 'paste', text: 'pasted-content' }]));
      assert.ok(
        doc.getText().includes('pasted-content'),
        `Expected "pasted-content" in document, got: ${JSON.stringify(doc.getText())}`,
      );
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
  });

  // ------------------------------------------------------------------
  // openFile step
  // ------------------------------------------------------------------
  describe('openFile step', function () {
    let tmpFile: string;

    before(async function () {
      tmpFile = path.join(os.tmpdir(), `gecho-openfile-${Date.now()}.txt`);
      await fs.writeFile(tmpFile, 'open file test content', 'utf8');
    });

    after(async () => {
      await fs.rm(tmpFile, { force: true });
    });

    it('opens the specified file and makes it the active editor', async function () {
      const player = new WorkbookPlayer();
      await player.play(makeWorkbook([{ type: 'openFile', path: tmpFile }]));

      const editor = vscode.window.activeTextEditor;
      assert.ok(editor, 'Active editor should exist after openFile step');
      assert.ok(
        editor.document.uri.fsPath.includes(path.basename(tmpFile)),
        `Expected active editor to show "${path.basename(tmpFile)}", ` +
          `got: ${editor.document.uri.fsPath}`,
      );

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
  });

  // ------------------------------------------------------------------
  // stop() cancellation
  // ------------------------------------------------------------------
  describe('cancellation', function () {
    it('stop() called before play() prevents any steps from executing', async function () {
      await openFreshDoc();

      const executed: string[] = [];
      const orig = (vscode.commands as unknown as Record<string, unknown>)['executeCommand'];
      (vscode.commands as unknown as Record<string, unknown>)['executeCommand'] = async (
        cmd: string,
        ...args: unknown[]
      ) => {
        if (cmd === 'type') {
          executed.push((args[0] as { text: string }).text);
        }
        return (orig as (...a: unknown[]) => unknown).call(vscode.commands, cmd, ...args);
      };

      try {
        const player = new WorkbookPlayer();
        player.stop();
        await player.play(
          makeWorkbook([
            { type: 'type', text: 'should-not-appear' },
            { type: 'wait', ms: 50 },
          ]),
        );
        assert.strictEqual(executed.length, 0, 'No type commands should execute after stop()');
      } finally {
        (vscode.commands as unknown as Record<string, unknown>)['executeCommand'] = orig;
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }
    });
  });
});
