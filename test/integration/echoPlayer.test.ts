import * as assert from 'assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { EchoPlayer } from '../../src/replay/player.js';
import { readEcho } from '../../src/echo/index.js';
import type { Echo } from '../../src/types/echo.js';

/**
 * Integration tests for EchoPlayer.
 *
 * Unlike the unit tests in test/suite/player.test.ts (which mock executeCommand and
 * assert the command ID is dispatched), these tests open a real VS Code editor and
 * assert that the DOCUMENT CONTENT actually changes — verifying end-to-end state.
 */
describe('EchoPlayer integration — executes steps against a real editor', function () {
  this.timeout(20000);

  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('type step with delay:0 inserts text into the active editor', async function () {
    const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);

    const player = new EchoPlayer();
    await player.play({
      version: '1.0',
      metadata: { name: 'type-test' },
      steps: [{ type: 'type', text: 'hello world', delay: 0 }],
    });

    assert.ok(
      doc.getText().includes('hello world'),
      `Document should contain "hello world", got: "${doc.getText()}"`,
    );
  });

  it('multiple type steps compose correctly in the editor', async function () {
    const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);

    const player = new EchoPlayer();
    await player.play({
      version: '1.0',
      metadata: { name: 'multi-type-test' },
      steps: [
        { type: 'type', text: 'foo', delay: 0 },
        { type: 'wait', ms: 50 },
        { type: 'type', text: 'bar', delay: 0 },
      ],
    });

    const text = doc.getText();
    assert.ok(text.includes('foo'), `Expected "foo" in document, got: "${text}"`);
    assert.ok(text.includes('bar'), `Expected "bar" in document, got: "${text}"`);
  });

  it('stop() cancels playback mid-sequence — only partial text is inserted', async function () {
    const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);

    const player = new EchoPlayer();

    // Start a slow playback and stop it shortly after the first step
    const playPromise = player.play({
      version: '1.0',
      metadata: { name: 'cancel-test' },
      steps: [
        { type: 'type', text: 'first', delay: 0 },
        { type: 'wait', ms: 2000 },   // long pause — stop() will cancel here
        { type: 'type', text: 'second', delay: 0 },
      ],
    });

    // Stop after first type step completes but before the long wait finishes
    await new Promise<void>(r => setTimeout(r, 100));
    player.stop();
    await playPromise;

    const text = doc.getText();
    assert.ok(text.includes('first'), `Expected "first" after partial playback, got: "${text}"`);
    assert.ok(!text.includes('second'), `Expected "second" to be absent (cancelled), got: "${text}"`);
  });

  it('plays an echo loaded from the sample fixture file', async function () {
    // sample.gecho.json types "hello integration world"
    const fixturePath = path.resolve(
      __dirname,
      '../../../test/integration/fixtures/sample.gecho.json',
    );

    const echo: Echo = await readEcho(fixturePath);
    assert.ok(echo.steps.length > 0, 'Fixture echo must have steps');

    const doc = await vscode.workspace.openTextDocument({ content: '', language: 'plaintext' });
    await vscode.window.showTextDocument(doc);

    const player = new EchoPlayer();
    await player.play(echo);

    const text = doc.getText();
    assert.ok(
      text.includes('hello integration') && text.includes('world'),
      `Expected fixture text in document, got: "${text}"`,
    );
  });

  it('select step moves the editor selection', async function () {
    const doc = await vscode.workspace.openTextDocument({
      content: 'line one\nline two\nline three',
      language: 'plaintext',
    });
    const editor = await vscode.window.showTextDocument(doc);

    const player = new EchoPlayer();
    await player.play({
      version: '1.0',
      metadata: { name: 'select-test' },
      steps: [{ type: 'select', anchor: [0, 0], active: [0, 4] }],
    });

    const sel = editor.selection;
    assert.strictEqual(sel.anchor.line, 0);
    assert.strictEqual(sel.anchor.character, 0);
    assert.strictEqual(sel.active.line, 0);
    assert.strictEqual(sel.active.character, 4);
  });
});
