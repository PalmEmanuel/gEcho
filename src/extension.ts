import * as vscode from 'vscode';
import * as path from 'path';
import { unlink } from 'node:fs/promises';
import { EchoRecorder } from './recording/index.js';
import { WorkbookPlayer } from './replay/index.js';
import { ScreenCapture } from './screen/index.js';
import { GifConverter } from './converter/index.js';
import { readWorkbook, writeWorkbook } from './workbook/index.js';
import type { RecordingState, Workbook } from './types/index.js';
import { WORKBOOK_VERSION } from './types/index.js';

let currentState: RecordingState = 'idle';
let activeRecorder: EchoRecorder | undefined;
let activePlayer: WorkbookPlayer | undefined;
let activeCapture: ScreenCapture | undefined;

function updateStatusBar(item: vscode.StatusBarItem): void {
  if (currentState === 'recording') {
    item.text = '🔴 Recording';
    item.show();
  } else if (currentState === 'replaying') {
    item.text = '▶️ Replaying';
    item.show();
  } else {
    item.hide();
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.hide();
  context.subscriptions.push(statusBarItem);

  // gecho.startEchoRecording
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.startEchoRecording', async () => {
      if (currentState !== 'idle') {
        vscode.window.showWarningMessage(
          `gEcho: Cannot start recording while ${currentState}.`
        );
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        'gEcho will record your keystrokes, commands, and file interactions. Avoid typing passwords or sensitive data during recording.',
        { modal: false },
        'Start Recording',
        'Cancel'
      );
      if (confirm !== 'Start Recording') {
        return;
      }
      try {
        currentState = 'recording';
        activeRecorder = new EchoRecorder();
        activeRecorder.start();
        updateStatusBar(statusBarItem);
        vscode.window.showInformationMessage('gEcho: Echo recording started.');
      } catch (err) {
        currentState = 'idle';
        activeRecorder = undefined;
        updateStatusBar(statusBarItem);
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
        currentState = 'idle';
        updateStatusBar(statusBarItem);

        const uri = await vscode.window.showSaveDialog({
          filters: { 'gEcho Workbook': ['gecho.json'] },
          saveLabel: 'Save Workbook',
        });

        if (!uri) {
          return;
        }

        const workbook: Workbook = {
          version: WORKBOOK_VERSION,
          metadata: {
            name: path.basename(uri.fsPath, '.gecho.json'),
            created: new Date().toISOString(),
          },
          steps,
        };
        await writeWorkbook(workbook, uri.fsPath);
        vscode.window.showInformationMessage(
          `gEcho: Workbook saved to ${uri.fsPath}`
        );
      } catch (err) {
        currentState = 'idle';
        activeRecorder = undefined;
        updateStatusBar(statusBarItem);
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
        vscode.window.showWarningMessage(
          `gEcho: Cannot start GIF recording while ${currentState}.`
        );
        return;
      }
      try {
        currentState = 'recording';
        activeCapture = new ScreenCapture();
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        const tmpMp4Path = path.join(
          context.globalStorageUri.fsPath,
          `gecho-${Date.now()}.mp4`
        );
        await activeCapture.start(tmpMp4Path);
        updateStatusBar(statusBarItem);
        vscode.window.showInformationMessage('gEcho: GIF recording started.');
      } catch (err) {
        currentState = 'idle';
        activeCapture = undefined;
        updateStatusBar(statusBarItem);
        vscode.window.showErrorMessage(
          `gEcho: Failed to start GIF recording — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // gecho.stopGifRecording
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.stopGifRecording', async () => {
      if (currentState !== 'recording' || !activeCapture) {
        vscode.window.showWarningMessage('gEcho: No active GIF recording.');
        return;
      }
      try {
        const mp4Path = await activeCapture.stop();
        activeCapture = undefined;
        currentState = 'idle';
        updateStatusBar(statusBarItem);

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

        const openAction = 'Reveal in Explorer';
        const choice = await vscode.window.showInformationMessage(
          `gEcho: GIF saved to ${saveUri.fsPath}`,
          openAction
        );
        if (choice === openAction) {
          await vscode.commands.executeCommand(
            'revealFileInOS',
            vscode.Uri.file(saveUri.fsPath)
          );
        }
      } catch (err) {
        currentState = 'idle';
        activeCapture = undefined;
        updateStatusBar(statusBarItem);
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
        vscode.window.showWarningMessage(
          `gEcho: Cannot replay while ${currentState}.`
        );
        return;
      }
      try {
        const uris = await vscode.window.showOpenDialog({
          filters: { 'gEcho Workbook': ['gecho.json'] },
          canSelectMany: false,
          openLabel: 'Open Workbook',
        });
        if (!uris || uris.length === 0) {
          return;
        }

        const workbook = await readWorkbook(uris[0].fsPath);
        currentState = 'replaying';
        activePlayer = new WorkbookPlayer();
        updateStatusBar(statusBarItem);

        await activePlayer.play(workbook);

        activePlayer = undefined;
        currentState = 'idle';
        updateStatusBar(statusBarItem);
      } catch (err) {
        activePlayer = undefined;
        currentState = 'idle';
        updateStatusBar(statusBarItem);
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
        vscode.window.showWarningMessage(
          `gEcho: Cannot replay while ${currentState}.`
        );
        return;
      }
      let tmpMp4Path: string | undefined;
      try {
        const uris = await vscode.window.showOpenDialog({
          filters: { 'gEcho Workbook': ['gecho.json'] },
          canSelectMany: false,
          openLabel: 'Open Workbook',
        });
        if (!uris || uris.length === 0) {
          return;
        }

        const saveUri = await vscode.window.showSaveDialog({
          filters: { 'GIF Image': ['gif'] },
          saveLabel: 'Save GIF',
        });
        if (!saveUri) {
          return;
        }

        const workbook = await readWorkbook(uris[0].fsPath);
        currentState = 'replaying';
        activePlayer = new WorkbookPlayer();
        activeCapture = new ScreenCapture();
        updateStatusBar(statusBarItem);

        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        tmpMp4Path = path.join(
          context.globalStorageUri.fsPath,
          `gecho-replay-${Date.now()}.mp4`
        );
        await activeCapture.start(tmpMp4Path);
        await activePlayer.play(workbook);
        const mp4Path = await activeCapture.stop();

        activePlayer = undefined;
        activeCapture = undefined;
        currentState = 'idle';
        updateStatusBar(statusBarItem);

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'gEcho: Converting to GIF...', cancellable: false },
          async () => {
            const converter = new GifConverter();
            await converter.convert(mp4Path, saveUri.fsPath);
          }
        );

        vscode.window.showInformationMessage(
          `gEcho: GIF saved to ${saveUri.fsPath}`
        );
      } catch (err) {
        if (activeCapture) {
          try { await activeCapture.stop(); } catch { /* ignore cleanup error */ }
        }
        if (tmpMp4Path) {
          await unlink(tmpMp4Path).catch(() => undefined);
        }
        activePlayer = undefined;
        activeCapture = undefined;
        currentState = 'idle';
        updateStatusBar(statusBarItem);
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
