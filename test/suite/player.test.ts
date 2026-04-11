import * as assert from 'assert';
import * as vscode from 'vscode';
import type { Echo } from '../../src/types/echo.js';
import { EchoPlayer } from '../../src/replay/player.js';

describe('EchoPlayer', () => {
  it('exports EchoPlayer class', () => {
    assert.strictEqual(typeof EchoPlayer, 'function');
  });

  it('EchoPlayer has stop method', () => {
    const player = new EchoPlayer();
    assert.strictEqual(typeof player.stop, 'function');
  });

  describe('Security blocking', () => {
    it('blocks unsafe command ID and returns early without executing any command', async () => {
      const executedCommands: string[] = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string) => { executedCommands.push(cmd); };
      try {
        const player = new EchoPlayer();
        const echo: Echo = {
          version: '1.0',
          metadata: { name: 'test' },
          steps: [
            { type: 'command', id: 'bad command id with spaces' },
            { type: 'command', id: 'valid.command.id' },
          ],
        };
        await player.play(echo);
        assert.strictEqual(executedCommands.length, 0, 'No commands should execute after block');
      } finally {
        (vscode.commands as any).executeCommand = orig;
      }
    });

    it('blocks path traversal in openFile step and returns early without calling file APIs', async () => {
      const fileCalls: string[] = [];
      const origExec = (vscode.commands as any).executeCommand;
      const origFind = (vscode.workspace as any).findFiles;
      const origOpen = (vscode.workspace as any).openTextDocument;
      (vscode.commands as any).executeCommand = async (cmd: string) => { fileCalls.push(cmd); };
      (vscode.workspace as any).findFiles = async () => { fileCalls.push('findFiles'); return []; };
      (vscode.workspace as any).openTextDocument = async () => { fileCalls.push('openTextDocument'); };
      try {
        const player = new EchoPlayer();
        const echo: Echo = {
          version: '1.0',
          metadata: { name: 'test' },
          steps: [
            { type: 'openFile', path: '../../etc/passwd' },
            { type: 'type', text: 'should not run' },
          ],
        };
        await player.play(echo);
        assert.strictEqual(fileCalls.length, 0, 'No file APIs should be called after path traversal block');
      } finally {
        (vscode.commands as any).executeCommand = origExec;
        (vscode.workspace as any).findFiles = origFind;
        (vscode.workspace as any).openTextDocument = origOpen;
      }
    });
  });

  describe('Step dispatch', () => {
    it('type step with no delay dispatches per-character with default 55ms delay', async () => {
      const calls: Array<{ cmd: string; args: any }> = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string, args: any) => { calls.push({ cmd, args }); };
      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'type', text: 'hi' }],
        });
        assert.strictEqual(calls.length, 2, 'Should dispatch one call per character with default delay');
        assert.deepStrictEqual(calls.map(c => c.args.text), ['h', 'i']);
      } finally {
        (vscode.commands as any).executeCommand = orig;
      }
    });

    it('type step with delay > 0 dispatches per-character', async () => {
      const calls: Array<{ cmd: string; args: any }> = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string, args: any) => { calls.push({ cmd, args }); };
      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'type', text: 'abc', delay: 30 }],
        });
        assert.strictEqual(calls.length, 3, 'Should dispatch one call per character');
        assert.deepStrictEqual(calls.map(c => c.args.text), ['a', 'b', 'c']);
      } finally {
        (vscode.commands as any).executeCommand = orig;
      }
    });

    it('command step with valid id calls executeCommand with that id', async () => {
      const calls: string[] = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string) => { calls.push(cmd); };
      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'command', id: 'workbench.action.files.save' }],
        });
        assert.deepStrictEqual(calls, ['workbench.action.files.save']);
      } finally {
        (vscode.commands as any).executeCommand = orig;
      }
    });

    it('command step with args passes args to executeCommand', async () => {
      const calls: Array<{ cmd: string; args: any[] }> = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string, ...args: any[]) => { calls.push({ cmd, args }); };
      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'command', id: 'someCommand', args: ['arg1', 42] }],
        });
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].cmd, 'someCommand');
        assert.deepStrictEqual(calls[0].args, ['arg1', 42]);
      } finally {
        (vscode.commands as any).executeCommand = orig;
      }
    });

    it('key step with known shortcut (escape) calls mapped VS Code command', async () => {
      const calls: Array<{ cmd: string; args: any }> = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string, args: any) => { calls.push({ cmd, args }); };
      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'key', key: 'escape' }],
        });
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].cmd, 'cancelSelection');
      } finally {
        (vscode.commands as any).executeCommand = orig;
      }
    });

    it('key step with single character dispatches via type command', async () => {
      const calls: Array<{ cmd: string; args: any }> = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string, args: any) => { calls.push({ cmd, args }); };
      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'key', key: 'x' }],
        });
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].cmd, 'type');
        assert.deepStrictEqual(calls[0].args, { text: 'x' });
      } finally {
        (vscode.commands as any).executeCommand = orig;
      }
    });

    it('key step with unknown multi-key sequence is silently skipped', async () => {
      const calls: string[] = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string) => { calls.push(cmd); };
      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'key', key: 'ctrl+shift+unknown' }],
        });
        assert.strictEqual(calls.length, 0, 'Unknown multi-key should be skipped silently');
      } finally {
        (vscode.commands as any).executeCommand = orig;
      }
    });

    it('wait step completes without error (10ms)', async () => {
      const player = new EchoPlayer();
      await assert.doesNotReject(() =>
        player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'wait', ms: 10 }],
        })
      );
    });

    it('wait step with until:"idle" completes without error', async () => {
      const player = new EchoPlayer();
      await assert.doesNotReject(() =>
        player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'wait', ms: 50, until: 'idle' }],
        })
      );
    });

    it('paste step inserts text at cursor position via editor.edit', async () => {
      const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
      await vscode.window.showTextDocument(doc);
      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'paste', text: 'clipboard content' }],
        });
        assert.ok(
          doc.getText().includes('clipboard content'),
          `Expected pasted text in document, got: ${JSON.stringify(doc.getText())}`,
        );
      } finally {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }
    });

    it('scroll step calls editorScroll with correct direction and lines', async () => {
      const calls: Array<{ cmd: string; args: any }> = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string, args: any) => { calls.push({ cmd, args }); };
      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'scroll', direction: 'down', lines: 3 }],
        });
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].cmd, 'editorScroll');
        assert.deepStrictEqual(calls[0].args, { to: 'down', by: 'line', value: 3 });
      } finally {
        (vscode.commands as any).executeCommand = orig;
      }
    });

    it('select step does not throw when no active editor', async () => {
      const player = new EchoPlayer();
      // activeTextEditor is undefined in plain test host — step is silently skipped
      await assert.doesNotReject(() =>
        player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'select', anchor: [0, 0], active: [1, 5] }],
        })
      );
    });

    it('select step with selections array does not throw when no active editor', async () => {
      const player = new EchoPlayer();
      await assert.doesNotReject(() =>
        player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{
            type: 'select',
            selections: [
              { anchor: [0, 0], active: [0, 5] },
              { anchor: [1, 0], active: [1, 3] },
            ],
          }],
        })
      );
    });

    it('select step with anchor/active updates editor selection when editor is open', async () => {
      const doc = await vscode.workspace.openTextDocument({ content: 'hello\nworld', language: 'plaintext' });
      const editor = await vscode.window.showTextDocument(doc);
      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'select', anchor: [0, 0], active: [0, 5] }],
        });
        const sel = editor.selection;
        assert.deepStrictEqual(
          [sel.anchor.line, sel.anchor.character, sel.active.line, sel.active.character],
          [0, 0, 0, 5],
          'Selection should match the step anchor/active positions',
        );
      } finally {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }
    });

    it('select step with selections array updates multi-cursor when editor is open', async () => {
      const doc = await vscode.workspace.openTextDocument({ content: 'hello\nworld', language: 'plaintext' });
      const editor = await vscode.window.showTextDocument(doc);
      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{
            type: 'select',
            selections: [
              { anchor: [0, 0], active: [0, 5] },
              { anchor: [1, 0], active: [1, 3] },
            ],
          }],
        });
        assert.strictEqual(editor.selections.length, 2, 'Expected two cursors after multi-cursor select step');
        assert.deepStrictEqual(
          [editor.selections[0].anchor.line, editor.selections[0].anchor.character,
           editor.selections[0].active.line, editor.selections[0].active.character],
          [0, 0, 0, 5],
        );
        assert.deepStrictEqual(
          [editor.selections[1].anchor.line, editor.selections[1].anchor.character,
           editor.selections[1].active.line, editor.selections[1].active.character],
          [1, 0, 1, 3],
        );
      } finally {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }
    });

    it('stop() before play() cancels all step execution', async () => {
      const calls: string[] = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string) => { calls.push(cmd); };
      try {
        const player = new EchoPlayer();
        player.stop();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'type', text: 'should not run' }],
        });
        assert.strictEqual(calls.length, 0, 'All steps should be skipped after stop()');
      } finally {
        (vscode.commands as any).executeCommand = orig;
      }
    });

    it('stop() during a long wait step resolves promptly', async () => {
      const player = new EchoPlayer();
      const start = Date.now();

      const playPromise = player.play({
        version: '1.0', metadata: { name: 't' },
        steps: [{ type: 'wait', ms: 5000 }],
      }, { speed: 1.0, captureGif: false, cancelOnInput: false });

      // Stop after a short delay — should not have to wait for the full 5s
      await new Promise<void>(r => setTimeout(r, 50));
      player.stop();
      await playPromise;

      const elapsed = Date.now() - start;
      assert.ok(elapsed < 1000, `Expected play() to resolve promptly after stop(), took ${elapsed}ms`);
    });
  });

  describe('cancelOnInput', () => {
    it('Mouse selection change triggers stop() when cancelOnInput is true', async () => {
      let selectionHandler: ((e: vscode.TextEditorSelectionChangeEvent) => void) | undefined;
      const origOnSelection = (vscode.window as any).onDidChangeTextEditorSelection;
      (vscode.window as any).onDidChangeTextEditorSelection = (handler: (e: vscode.TextEditorSelectionChangeEvent) => void) => {
        selectionHandler = handler;
        return { dispose: () => {} };
      };

      const calls: string[] = [];
      const origExec = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string) => { calls.push(cmd); };

      try {
        const player = new EchoPlayer();
        const playPromise = player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [
            { type: 'wait', ms: 5000 },
            { type: 'command', id: 'should.not.run' },
          ],
        }, { speed: 1.0, captureGif: false, cancelOnInput: true });

        // Simulate a Mouse selection change
        await new Promise<void>(r => setTimeout(r, 30));
        selectionHandler?.({ kind: vscode.TextEditorSelectionChangeKind.Mouse } as vscode.TextEditorSelectionChangeEvent);
        await playPromise;

        assert.strictEqual(calls.length, 0, 'Command should not execute after Mouse cancel');
      } finally {
        (vscode.window as any).onDidChangeTextEditorSelection = origOnSelection;
        (vscode.commands as any).executeCommand = origExec;
      }
    });

    it('Keyboard selection change triggers stop() when cancelOnInput is true', async () => {
      let selectionHandler: ((e: vscode.TextEditorSelectionChangeEvent) => void) | undefined;
      const origOnSelection = (vscode.window as any).onDidChangeTextEditorSelection;
      (vscode.window as any).onDidChangeTextEditorSelection = (handler: (e: vscode.TextEditorSelectionChangeEvent) => void) => {
        selectionHandler = handler;
        return { dispose: () => {} };
      };

      const calls: string[] = [];
      const origExec = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string) => { calls.push(cmd); };

      try {
        const player = new EchoPlayer();
        const playPromise = player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [
            { type: 'wait', ms: 5000 },
            { type: 'command', id: 'should.not.run' },
          ],
        }, { speed: 1.0, captureGif: false, cancelOnInput: true });

        await new Promise<void>(r => setTimeout(r, 30));
        selectionHandler?.({ kind: vscode.TextEditorSelectionChangeKind.Keyboard } as vscode.TextEditorSelectionChangeEvent);
        await playPromise;

        assert.strictEqual(calls.length, 0, 'Command should not execute after Keyboard cancel');
      } finally {
        (vscode.window as any).onDidChangeTextEditorSelection = origOnSelection;
        (vscode.commands as any).executeCommand = origExec;
      }
    });

    it('Mouse selection change during step execution still cancels replay', async () => {
      let selectionHandler: ((e: vscode.TextEditorSelectionChangeEvent) => void) | undefined;
      const origOnSelection = (vscode.window as any).onDidChangeTextEditorSelection;
      (vscode.window as any).onDidChangeTextEditorSelection = (handler: (e: vscode.TextEditorSelectionChangeEvent) => void) => {
        selectionHandler = handler;
        return { dispose: () => {} };
      };

      let stepStarted = false;
      const executedAfterCancel: string[] = [];
      const origExec = (vscode.commands as any).executeCommand;
      let cancelFired = false;
      (vscode.commands as any).executeCommand = async (cmd: string) => {
        if (cmd === 'workbench.action.files.save') {
          stepStarted = true;
          // Simulate user Mouse input while this step is executing
          selectionHandler?.({ kind: vscode.TextEditorSelectionChangeKind.Mouse } as vscode.TextEditorSelectionChangeEvent);
          cancelFired = true;
        } else if (cancelFired) {
          executedAfterCancel.push(cmd);
        }
      };

      try {
        const player = new EchoPlayer();
        const playPromise = player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [
            { type: 'command', id: 'workbench.action.files.save' },
            { type: 'wait', ms: 5000 },
            { type: 'command', id: 'should.not.run' },
          ],
        }, { speed: 1.0, captureGif: false, cancelOnInput: true });
        await playPromise;

        assert.ok(stepStarted, 'First step should have executed');
        assert.strictEqual(executedAfterCancel.length, 0, 'No steps should execute after Mouse cancel');
      } finally {
        (vscode.window as any).onDidChangeTextEditorSelection = origOnSelection;
        (vscode.commands as any).executeCommand = origExec;
      }
    });

    it('Command selection change does not cancel replay', async () => {
      let selectionHandler: ((e: vscode.TextEditorSelectionChangeEvent) => void) | undefined;
      const origOnSelection = (vscode.window as any).onDidChangeTextEditorSelection;
      (vscode.window as any).onDidChangeTextEditorSelection = (handler: (e: vscode.TextEditorSelectionChangeEvent) => void) => {
        selectionHandler = handler;
        return { dispose: () => {} };
      };

      const calls: string[] = [];
      const origExec = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string) => { calls.push(cmd); };

      try {
        const player = new EchoPlayer();
        const playPromise = player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [
            { type: 'wait', ms: 50 },
            { type: 'command', id: 'workbench.action.files.save' },
          ],
        }, { speed: 1.0, captureGif: false, cancelOnInput: true });

        // Command kind should be ignored — replay continues
        selectionHandler?.({ kind: vscode.TextEditorSelectionChangeKind.Command } as vscode.TextEditorSelectionChangeEvent);
        await playPromise;

        assert.ok(calls.includes('workbench.action.files.save'), 'Command step should execute after Command selection change');
      } finally {
        (vscode.window as any).onDidChangeTextEditorSelection = origOnSelection;
        (vscode.commands as any).executeCommand = origExec;
      }
    });

    it('cancelOnInput: false ignores Mouse selection change', async () => {
      let listenerRegistered = false;
      const origOnSelection = (vscode.window as any).onDidChangeTextEditorSelection;
      (vscode.window as any).onDidChangeTextEditorSelection = (_handler: (e: vscode.TextEditorSelectionChangeEvent) => void) => {
        listenerRegistered = true;
        return { dispose: () => {} };
      };

      const calls: string[] = [];
      const origExec = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string) => { calls.push(cmd); };

      try {
        const player = new EchoPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [
            { type: 'wait', ms: 50 },
            { type: 'command', id: 'workbench.action.files.save' },
          ],
        }, { speed: 1.0, captureGif: false, cancelOnInput: false });

        assert.strictEqual(listenerRegistered, false, 'No selection listener should be registered when cancelOnInput is false');
        assert.ok(calls.includes('workbench.action.files.save'), 'Command should execute when cancelOnInput is false');
      } finally {
        (vscode.window as any).onDidChangeTextEditorSelection = origOnSelection;
        (vscode.commands as any).executeCommand = origExec;
      }
    });
  });
});
