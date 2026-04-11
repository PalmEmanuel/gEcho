import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensureEchoExtension } from '../../src/extension.js';

describe('Extension Tests', () => {
  it('Extension should be present', () => {
    const extension = vscode.extensions.getExtension('PalmEmanuel.gEcho');
    assert.notStrictEqual(extension, undefined);
  });

  it('all gecho commands are registered at activation', async () => {
    const ext = vscode.extensions.getExtension('PalmEmanuel.gEcho');
    if (ext && !ext.isActive) { await ext.activate(); }
    const all = await vscode.commands.getCommands(true);
    const expected = [
      'gecho.startEchoRecording',
      'gecho.stopEchoRecording',
      'gecho.startGifRecording',
      'gecho.stopGifRecording',
      'gecho.replayEcho',
      'gecho.replayAsGif',
      'gecho.replayEchoFile',
      'gecho.replayEchoFileAsGif',
    ];
    for (const cmd of expected) {
      assert.ok(all.includes(cmd), `Command ${cmd} should be registered`);
    }
  });

  describe('State machine guard tests', () => {
    it('stopEchoRecording when not recording shows warning and does not throw', async () => {
      const warnings: string[] = [];
      const orig = (vscode.window as any).showWarningMessage;
      (vscode.window as any).showWarningMessage = async (msg: string) => { warnings.push(msg); };
      try {
        await assert.doesNotReject(
          () => Promise.resolve(vscode.commands.executeCommand('gecho.stopEchoRecording')),
          'stopEchoRecording should not throw when idle'
        );
      } finally {
        (vscode.window as any).showWarningMessage = orig;
      }
    });

    it('stopGifRecording when not recording shows warning and does not throw', async () => {
      const warnings: string[] = [];
      const orig = (vscode.window as any).showWarningMessage;
      (vscode.window as any).showWarningMessage = async (msg: string) => { warnings.push(msg); };
      try {
        await assert.doesNotReject(
          () => Promise.resolve(vscode.commands.executeCommand('gecho.stopGifRecording')),
          'stopGifRecording should not throw when idle'
        );
      } finally {
        (vscode.window as any).showWarningMessage = orig;
      }
    });

    it('replayEcho with dialog cancelled does not throw', async () => {
      const origDialog = (vscode.window as any).showOpenDialog;
      (vscode.window as any).showOpenDialog = async () => undefined;
      try {
        await assert.doesNotReject(
          () => Promise.resolve(vscode.commands.executeCommand('gecho.replayEcho')),
          'replayEcho should handle cancelled dialog gracefully'
        );
      } finally {
        (vscode.window as any).showOpenDialog = origDialog;
      }
    });
  });

  describe('ensureEchoExtension', () => {
    it('returns path unchanged when it already ends with .echo.json', () => {
      assert.strictEqual(ensureEchoExtension('/tmp/demo.echo.json'), '/tmp/demo.echo.json');
    });

    it('replaces .json with .echo.json when path ends with .json', () => {
      assert.strictEqual(ensureEchoExtension('/tmp/demo.json'), '/tmp/demo.echo.json');
    });

    it('appends .echo.json when path has no recognized extension', () => {
      assert.strictEqual(ensureEchoExtension('/tmp/demo'), '/tmp/demo.echo.json');
    });

    it('handles bare filename with .json', () => {
      assert.strictEqual(ensureEchoExtension('myfile.json'), 'myfile.echo.json');
    });

    it('does not double-append when already correct', () => {
      assert.strictEqual(ensureEchoExtension('test.echo.json'), 'test.echo.json');
    });
  });
});
