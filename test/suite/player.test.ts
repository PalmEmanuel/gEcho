import * as assert from 'assert';
import * as vscode from 'vscode';
import type { Workbook } from '../../src/types/workbook.js';
import { WorkbookPlayer } from '../../src/replay/player.js';

describe('WorkbookPlayer', () => {
  it('exports WorkbookPlayer class', () => {
    assert.strictEqual(typeof WorkbookPlayer, 'function');
  });

  it('WorkbookPlayer has stop method', () => {
    const player = new WorkbookPlayer();
    assert.strictEqual(typeof player.stop, 'function');
  });

  describe('Security blocking', () => {
    it('blocks unsafe command ID and returns early without executing any command', async () => {
      const executedCommands: string[] = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string) => { executedCommands.push(cmd); };
      try {
        const player = new WorkbookPlayer();
        const workbook: Workbook = {
          version: '1.0',
          metadata: { name: 'test' },
          steps: [
            { type: 'command', id: 'bad command id with spaces' },
            { type: 'command', id: 'valid.command.id' },
          ],
        };
        await player.play(workbook);
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
        const player = new WorkbookPlayer();
        const workbook: Workbook = {
          version: '1.0',
          metadata: { name: 'test' },
          steps: [
            { type: 'openFile', path: '../../etc/passwd' },
            { type: 'type', text: 'should not run' },
          ],
        };
        await player.play(workbook);
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
        const player = new WorkbookPlayer();
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
        const player = new WorkbookPlayer();
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
        const player = new WorkbookPlayer();
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
        const player = new WorkbookPlayer();
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
        const player = new WorkbookPlayer();
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
        const player = new WorkbookPlayer();
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
        const player = new WorkbookPlayer();
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
      const player = new WorkbookPlayer();
      await assert.doesNotReject(() =>
        player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'wait', ms: 10 }],
        })
      );
    });

    it('paste step writes to clipboard then calls clipboardPasteAction', async () => {
      const calls: Array<{ cmd: string; args: any }> = [];
      const origExec = (vscode.commands as any).executeCommand;
      // vscode.env.clipboard is a getter-only property on Linux, so direct assignment throws.
      // Use Object.defineProperty to override it, then restore the original descriptor.
      const origClipboardDescriptor = Object.getOwnPropertyDescriptor(vscode.env, 'clipboard')
        ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(vscode.env), 'clipboard');
      const origClipboard = vscode.env.clipboard;
      let clipboardText = '';
      const mockClipboard = {
        writeText: async (t: string) => { clipboardText = t; },
        readText: async () => clipboardText,
      };
      Object.defineProperty(vscode.env, 'clipboard', { value: mockClipboard, configurable: true, writable: true });
      (vscode.commands as any).executeCommand = async (cmd: string, args: any) => { calls.push({ cmd, args }); };
      try {
        const player = new WorkbookPlayer();
        await player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'paste', text: 'clipboard content' }],
        });
        assert.strictEqual(clipboardText, 'clipboard content', 'Should write to clipboard');
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].cmd, 'editor.action.clipboardPasteAction');
      } finally {
        if (origClipboardDescriptor) {
          Object.defineProperty(vscode.env, 'clipboard', origClipboardDescriptor);
        } else {
          Object.defineProperty(vscode.env, 'clipboard', { value: origClipboard, configurable: true, writable: true });
        }
        (vscode.commands as any).executeCommand = origExec;
      }
    });

    it('scroll step calls editorScroll with correct direction and lines', async () => {
      const calls: Array<{ cmd: string; args: any }> = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string, args: any) => { calls.push({ cmd, args }); };
      try {
        const player = new WorkbookPlayer();
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
      const player = new WorkbookPlayer();
      // activeTextEditor is undefined in plain test host — step is silently skipped
      await assert.doesNotReject(() =>
        player.play({
          version: '1.0', metadata: { name: 't' },
          steps: [{ type: 'select', anchor: [0, 0], active: [1, 5] }],
        })
      );
    });

    it('stop() before play() cancels all step execution', async () => {
      const calls: string[] = [];
      const orig = (vscode.commands as any).executeCommand;
      (vscode.commands as any).executeCommand = async (cmd: string) => { calls.push(cmd); };
      try {
        const player = new WorkbookPlayer();
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
  });
});
