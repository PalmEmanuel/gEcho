import * as vscode from 'vscode';
import * as path from 'path';
import { EchoRecorder } from './recording/index.js';
import { WorkbookPlayer } from './replay/index.js';
import { ScreenCapture } from './screen/index.js';
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
        const tmpPath = path.join(
          context.globalStorageUri.fsPath,
          `gecho-${Date.now()}.gif`
        );
        await activeCapture.start(tmpPath);
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
        const outputPath = await activeCapture.stop();
        activeCapture = undefined;
        currentState = 'idle';
        updateStatusBar(statusBarItem);

        const openAction = 'Reveal in Explorer';
        const choice = await vscode.window.showInformationMessage(
          `gEcho: GIF saved to ${outputPath}`,
          openAction
        );
        if (choice === openAction) {
          await vscode.commands.executeCommand(
            'revealFileInOS',
            vscode.Uri.file(outputPath)
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

        await activeCapture.start(saveUri.fsPath);
        await activePlayer.play(workbook);
        await activeCapture.stop();

        activePlayer = undefined;
        activeCapture = undefined;
        currentState = 'idle';
        updateStatusBar(statusBarItem);

        vscode.window.showInformationMessage(
          `gEcho: GIF saved to ${saveUri.fsPath}`
        );
      } catch (err) {
        if (activeCapture) {
          try { await activeCapture.stop(); } catch { /* ignore cleanup error */ }
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
