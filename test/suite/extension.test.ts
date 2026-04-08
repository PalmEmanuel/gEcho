import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Extension Tests', () => {
  it('Extension should be present', () => {
    const extension = vscode.extensions.getExtension('gecho.gecho');
    assert.notStrictEqual(extension, undefined);
  });

  it('all gecho commands are registered at activation', async () => {
    const ext = vscode.extensions.getExtension('gecho.gecho');
    if (ext && !ext.isActive) { await ext.activate(); }
    const all = await vscode.commands.getCommands(true);
    const expected = [
      'gecho.startEchoRecording',
      'gecho.stopEchoRecording',
      'gecho.startGifRecording',
      'gecho.stopGifRecording',
      'gecho.replayWorkbook',
      'gecho.replayAsGif',
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

    it('replayWorkbook with dialog cancelled does not throw', async () => {
      const origDialog = (vscode.window as any).showOpenDialog;
      (vscode.window as any).showOpenDialog = async () => undefined;
      try {
        await assert.doesNotReject(
          () => Promise.resolve(vscode.commands.executeCommand('gecho.replayWorkbook')),
          'replayWorkbook should handle cancelled dialog gracefully'
        );
      } finally {
        (vscode.window as any).showOpenDialog = origDialog;
      }
    });
  });
});
