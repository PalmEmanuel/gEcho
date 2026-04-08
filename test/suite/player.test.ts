import * as assert from 'assert';
import { WorkbookPlayer } from '../../src/replay/player.js';

describe('WorkbookPlayer', () => {
  it('exports WorkbookPlayer class', () => {
    assert.strictEqual(typeof WorkbookPlayer, 'function');
  });

  it('WorkbookPlayer has stop method', () => {
    const player = new WorkbookPlayer();
    assert.strictEqual(typeof player.stop, 'function');
  });

  describe.skip('Integration tests (requires VS Code extension host)', () => {
    it('plays a type step', async () => {
      // Requires vscode.commands.executeCommand — run in Extension Development Host
    });
    it('blocks unsafe command IDs', async () => {
      // Requires vscode.window.showWarningMessage
    });
    it('blocks path traversal in openFile steps', async () => {
      // Requires vscode.workspace.workspaceFolders
    });
  });
});
