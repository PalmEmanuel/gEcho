import * as vscode from 'vscode';
import * as path from 'path';
import { unlink } from 'node:fs/promises';
import { EchoRecorder } from './recording/index.js';
import { WorkbookPlayer } from './replay/index.js';
import { ScreenCapture } from './screen/index.js';
import { GifConverter } from './converter/index.js';
import { readWorkbook, writeWorkbook } from './workbook/index.js';
import { createStatusBar, updateStatusBar } from './ui/index.js';
import type { RecordingState, Workbook } from './types/index.js';
import { WORKBOOK_VERSION } from './types/index.js';

let currentState: RecordingState = 'idle';
let activeRecorder: EchoRecorder | undefined;
let activePlayer: WorkbookPlayer | undefined;
let activeCapture: ScreenCapture | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const statusBar = createStatusBar(context);

  function setState(state: RecordingState): void {
    currentState = state;
    updateStatusBar(statusBar, state);
  }

  // gecho.showCommands — show a quick-pick menu of all gEcho commands
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.showCommands', async () => {
      const items: vscode.QuickPickItem[] = [
        { label: '$(record) Start Echo Recording', description: 'Record keystrokes as a workbook' },
        { label: '$(device-camera-video) Start GIF Recording', description: 'Capture screen to GIF' },
        { label: '$(play) Replay Workbook', description: 'Execute a .gecho.json workbook' },
        { label: '$(play) Replay Workbook as GIF', description: 'Execute workbook and capture GIF' },
      ];
      const pick = await vscode.window.showQuickPick(items, { placeHolder: 'gEcho — choose an action' });
      if (!pick) { return; }
      if (pick.label.includes('Echo Recording')) {
        await vscode.commands.executeCommand('gecho.startEchoRecording');
      } else if (pick.label.includes('GIF Recording')) {
        await vscode.commands.executeCommand('gecho.startGifRecording');
      } else if (pick.label.includes('Replay Workbook as GIF')) {
        await vscode.commands.executeCommand('gecho.replayAsGif');
      } else if (pick.label.includes('Replay Workbook')) {
        await vscode.commands.executeCommand('gecho.replayWorkbook');
      }
    })
  );

  // gecho.cancelReplay
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.cancelReplay', () => {
      if (activePlayer) {
        activePlayer.stop();
      }
      if (activeCapture) {
        activeCapture.stop().catch(() => undefined);
        activeCapture = undefined;
      }
      setState('idle');
      vscode.window.showInformationMessage('gEcho: Replay cancelled.');
    })
  );

  // gecho.startEchoRecording
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.startEchoRecording', async () => {
      if (currentState !== 'idle') {
        vscode.window.showWarningMessage(`gEcho: Cannot start recording while ${currentState}.`);
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        'gEcho will record your keystrokes, commands, and file interactions. Avoid typing passwords or sensitive data during recording.',
        { modal: false },
        'Start Recording',
        'Cancel'
      );
      if (confirm !== 'Start Recording') { return; }
      try {
        setState('recording');
        activeRecorder = new EchoRecorder();
        activeRecorder.start();
        vscode.window.showInformationMessage('gEcho: Echo recording started.');
      } catch (err) {
        setState('idle');
        activeRecorder = undefined;
        vscode.window.showErrorMessage(
          `gEcho: Failed to start recording — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // gecho.stopEchoRecording
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.stopEchoRecording', async () => {
      if (currentState !== 'recording' || !activeRecorder) {
        vscode.window.showWarningMessage('gEcho: No active echo recording.');
        return;
      }
      try {
        const steps = activeRecorder.stop();
        activeRecorder = undefined;
        setState('idle');

        const uri = await vscode.window.showSaveDialog({
          filters: { 'gEcho Workbook': ['gecho.json'] },
          saveLabel: 'Save Workbook',
        });
        if (!uri) { return; }

        const workbook: Workbook = {
          version: WORKBOOK_VERSION,
          metadata: {
            name: path.basename(uri.fsPath, '.gecho.json'),
            created: new Date().toISOString(),
          },
          steps,
        };
        await writeWorkbook(workbook, uri.fsPath);
        vscode.window.showInformationMessage(`gEcho: Workbook saved to ${uri.fsPath}`);
      } catch (err) {
        setState('idle');
        activeRecorder = undefined;
        vscode.window.showErrorMessage(
          `gEcho: Failed to stop recording — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // gecho.startGifRecording
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.startGifRecording', async () => {
      if (currentState !== 'idle') {
        vscode.window.showWarningMessage(`gEcho: Cannot start GIF recording while ${currentState}.`);
        return;
      }
      try {
        setState('recording-gif');
        activeCapture = new ScreenCapture();
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        const tmpMp4Path = path.join(context.globalStorageUri.fsPath, `gecho-${Date.now()}.mp4`);
        await activeCapture.start(tmpMp4Path);
        vscode.window.showInformationMessage('gEcho: GIF recording started.');
      } catch (err) {
        setState('idle');
        activeCapture = undefined;
        vscode.window.showErrorMessage(
          `gEcho: Failed to start GIF recording — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // gecho.stopGifRecording
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.stopGifRecording', async () => {
      if (currentState !== 'recording-gif' || !activeCapture) {
        vscode.window.showWarningMessage('gEcho: No active GIF recording.');
        return;
      }
      try {
        const mp4Path = await activeCapture.stop();
        activeCapture = undefined;
        setState('idle');

        const saveUri = await vscode.window.showSaveDialog({
          filters: { 'GIF Image': ['gif'] },
          saveLabel: 'Save GIF',
          defaultUri: vscode.Uri.file(mp4Path.replace('.mp4', '.gif')),
        });
        if (!saveUri) {
          await unlink(mp4Path).catch(() => undefined);
          return;
        }

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'gEcho: Converting to GIF...', cancellable: false },
          async () => {
            const converter = new GifConverter();
            await converter.convert(mp4Path, saveUri.fsPath);
          }
        );

        const choice = await vscode.window.showInformationMessage(
          `gEcho: GIF saved to ${saveUri.fsPath}`,
          'Reveal in Explorer'
        );
        if (choice === 'Reveal in Explorer') {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(saveUri.fsPath));
        }
      } catch (err) {
        setState('idle');
        activeCapture = undefined;
        vscode.window.showErrorMessage(
          `gEcho: Failed to stop GIF recording — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // gecho.replayWorkbook
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.replayWorkbook', async () => {
      if (currentState !== 'idle') {
        vscode.window.showWarningMessage(`gEcho: Cannot replay while ${currentState}.`);
        return;
      }
      try {
        const uris = await vscode.window.showOpenDialog({
          filters: { 'gEcho Workbook': ['gecho.json'] },
          canSelectMany: false,
          openLabel: 'Open Workbook',
        });
        if (!uris || uris.length === 0) { return; }

        const workbook = await readWorkbook(uris[0].fsPath);
        setState('replaying');
        activePlayer = new WorkbookPlayer();

        await activePlayer.play(workbook);

        activePlayer = undefined;
        setState('idle');
      } catch (err) {
        activePlayer = undefined;
        setState('idle');
        vscode.window.showErrorMessage(
          `gEcho: Replay failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // gecho.replayAsGif
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.replayAsGif', async () => {
      if (currentState !== 'idle') {
        vscode.window.showWarningMessage(`gEcho: Cannot replay while ${currentState}.`);
        return;
      }
      let tmpMp4Path: string | undefined;
      try {
        const uris = await vscode.window.showOpenDialog({
          filters: { 'gEcho Workbook': ['gecho.json'] },
          canSelectMany: false,
          openLabel: 'Open Workbook',
        });
        if (!uris || uris.length === 0) { return; }

        const saveUri = await vscode.window.showSaveDialog({
          filters: { 'GIF Image': ['gif'] },
          saveLabel: 'Save GIF',
        });
        if (!saveUri) { return; }

        const workbook = await readWorkbook(uris[0].fsPath);
        setState('replaying-gif');
        activePlayer = new WorkbookPlayer();
        activeCapture = new ScreenCapture();

        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        tmpMp4Path = path.join(context.globalStorageUri.fsPath, `gecho-replay-${Date.now()}.mp4`);
        await activeCapture.start(tmpMp4Path);
        await activePlayer.play(workbook);
        const mp4Path = await activeCapture.stop();

        activePlayer = undefined;
        activeCapture = undefined;
        setState('idle');

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'gEcho: Converting to GIF...', cancellable: false },
          async () => {
            const converter = new GifConverter();
            await converter.convert(mp4Path, saveUri.fsPath);
          }
        );

        vscode.window.showInformationMessage(`gEcho: GIF saved to ${saveUri.fsPath}`);
      } catch (err) {
        if (activeCapture) {
          try { await activeCapture.stop(); } catch { /* ignore */ }
        }
        if (tmpMp4Path) {
          await unlink(tmpMp4Path).catch(() => undefined);
        }
        activePlayer = undefined;
        activeCapture = undefined;
        setState('idle');
        vscode.window.showErrorMessage(
          `gEcho: Replay as GIF failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );
}

export function deactivate(): void {
  if (activeCapture) {
    activeCapture.stop().catch(() => undefined);
    activeCapture = undefined;
  }
  if (activeRecorder) {
    activeRecorder.stop();
    activeRecorder = undefined;
  }
  if (activePlayer) {
    activePlayer.stop();
    activePlayer = undefined;
  }
}
