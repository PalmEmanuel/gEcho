import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Extension Tests', () => {
  it('Extension should be present', () => {
    const extension = vscode.extensions.getExtension('gecho.gecho');
    assert.notStrictEqual(extension, undefined);
  });
});
