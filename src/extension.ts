import * as vscode from 'vscode';
import * as path from 'path';
import { unlink } from 'node:fs/promises';
import { EchoRecorder } from './recording/index.js';
import { EchoPlayer } from './replay/index.js';
import { ScreenCapture, checkScreenRecordingPermission } from './screen/index.js';
import { GifConverter } from './converter/index.js';
import { readEcho, writeEcho } from './echo/index.js';
import { createStatusBar, updateStatusBar, runCountdown } from './ui/index.js';
import { getConfig } from './config.js';
import type { RecordingState, Echo } from './types/index.js';
import { ECHO_VERSION } from './types/index.js';
import { checkDependencies } from './dependencies.js';

let currentState: RecordingState = 'idle';
let activeRecorder: EchoRecorder | undefined;
let activePlayer: EchoPlayer | undefined;
let activeCapture: ScreenCapture | undefined;
let activeCountdownSource: vscode.CancellationTokenSource | undefined;

export function activate(context: vscode.ExtensionContext): void {
  // Check for required external dependencies (e.g. ffmpeg) in the background
  checkDependencies(context);

  // On macOS, proactively verify Screen Recording permission so the user is warned
  // before they try to start a GIF recording.
  if (process.platform === 'darwin') {
    checkScreenRecordingPermission().then((result) => {
      if (!result.granted) {
        vscode.window.showErrorMessage(
          'gEcho: Screen Recording permission not granted. Enable VS Code in System Settings → Privacy & Security → Screen Recording, then restart VS Code.',
          'Open System Settings'
        ).then((choice) => {
          if (choice === 'Open System Settings') {
            vscode.env.openExternal(
              vscode.Uri.parse('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
            );
          }
        });
      }
    }).catch(() => undefined);
  }

  const statusBar = createStatusBar(context);

  function setState(state: RecordingState): void {
    currentState = state;
    updateStatusBar(statusBar, state);
  }

  // gecho.showCommands — show a quick-pick menu of all gEcho commands
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.showCommands', async () => {
      const items: (vscode.QuickPickItem & { command: string })[] = [
        { label: '$(record) Start Echo Recording', description: 'Record keystrokes as an echo', command: 'gecho.startEchoRecording' },
        { label: '$(device-camera-video) Start GIF Recording', description: 'Capture screen to GIF', command: 'gecho.startGifRecording' },
        { label: '$(play) Replay Echo', description: 'Execute a .gecho.json echo', command: 'gecho.replayEcho' },
        { label: '$(play) Replay Echo as GIF', description: 'Execute echo and capture GIF', command: 'gecho.replayAsGif' },
      ];
      const pick = await vscode.window.showQuickPick(items, { placeHolder: 'gEcho — choose an action' });
      if (!pick) { return; }
      await vscode.commands.executeCommand(pick.command);
    })
  );

  // gecho.cancelReplay
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.cancelReplay', () => {
      if (activeCountdownSource) {
        activeCountdownSource.cancel();
        activeCountdownSource.dispose();
        activeCountdownSource = undefined;
      }
      if (activePlayer) {
        activePlayer.stop();
      }
      if (activeCapture) {
        activeCapture.stop(getConfig().recording.stopTimeoutMs).catch(() => undefined);
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
          filters: { 'gEcho Echo': ['gecho.json'] },
          saveLabel: 'Save Echo',
        });
        if (!uri) { return; }

        const echo: Echo = {
          version: ECHO_VERSION,
          metadata: {
            name: path.basename(uri.fsPath, '.gecho.json'),
            created: new Date().toISOString(),
          },
          steps,
        };
        await writeEcho(echo, uri.fsPath);
        vscode.window.showInformationMessage(`gEcho: Echo saved to ${uri.fsPath}`);
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
        setState('countdown');
        const countdownSource = new vscode.CancellationTokenSource();
        activeCountdownSource = countdownSource;
        let proceeded: boolean;
        try {
          proceeded = await runCountdown(getConfig().countdown.seconds, statusBar, countdownSource.token);
        } finally {
          countdownSource.dispose();
          if (activeCountdownSource === countdownSource) {
            activeCountdownSource = undefined;
          }
        }
        if (!proceeded) {
          setState('idle');
          return;
        }
        setState('starting-gif');
        activeCapture = new ScreenCapture();
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        const tmpMp4Path = path.join(context.globalStorageUri.fsPath, `gecho-${Date.now()}.mp4`);
        await activeCapture.start(tmpMp4Path);
        await activeCapture.waitForReady(getConfig().recording.startupTimeoutMs);
        setState('recording-gif');

      } catch (err) {
        setState('idle');
        activeCapture = undefined;
        const msg = err instanceof Error ? err.message : String(err);
        const isPermissionError = /permission not granted|screen recording|not authorized/i.test(msg);
        const hint = process.platform === 'darwin' && isPermissionError
          ? ' Go to System Settings → Privacy & Security → Screen Recording and enable VS Code.'
          : '';
        vscode.window.showErrorMessage(`gEcho: Failed to start GIF recording — ${msg}${hint}`);
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

      // Immediately reflect the finalisation phase in the UI — stop() takes ~1-2s.
      setState('saving-gif');

      let mp4Path: string;
      try {
        mp4Path = await activeCapture.stop(getConfig().recording.stopTimeoutMs);
        activeCapture = undefined;
        setState('idle');
      } catch (err) {
        setState('idle');
        activeCapture = undefined;
        vscode.window.showErrorMessage(
          `gEcho: Failed to stop GIF recording — ${err instanceof Error ? err.message : String(err)}`
        );
        return;
      }

      try {
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
        await unlink(mp4Path).catch(() => undefined);
        vscode.window.showErrorMessage(
          `gEcho: GIF conversion failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    })
  );

  // gecho.replayEcho
  context.subscriptions.push(
    vscode.commands.registerCommand('gecho.replayEcho', async () => {
      if (currentState !== 'idle') {
        vscode.window.showWarningMessage(`gEcho: Cannot replay while ${currentState}.`);
        return;
      }
      try {
        const uris = await vscode.window.showOpenDialog({
          filters: { 'gEcho Echo': ['gecho.json'] },
          canSelectMany: false,
          openLabel: 'Open Echo',
        });
        if (!uris || uris.length === 0) { return; }

        const echo = await readEcho(uris[0].fsPath);
        setState('replaying');
        activePlayer = new EchoPlayer();

        await activePlayer.play(echo, getConfig().replay);

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
          filters: { 'gEcho Echo': ['gecho.json'] },
          canSelectMany: false,
          openLabel: 'Open Echo',
        });
        if (!uris || uris.length === 0) { return; }

        const saveUri = await vscode.window.showSaveDialog({
          filters: { 'GIF Image': ['gif'] },
          saveLabel: 'Save GIF',
        });
        if (!saveUri) { return; }

        const echo = await readEcho(uris[0].fsPath);

        setState('countdown');
        const countdownSource = new vscode.CancellationTokenSource();
        activeCountdownSource = countdownSource;
        let proceeded: boolean;
        try {
          proceeded = await runCountdown(getConfig().countdown.seconds, statusBar, countdownSource.token);
        } finally {
          countdownSource.dispose();
          if (activeCountdownSource === countdownSource) {
            activeCountdownSource = undefined;
          }
        }
        if (!proceeded) {
          setState('idle');
          return;
        }

        setState('replaying-gif');
        activePlayer = new EchoPlayer();
        activeCapture = new ScreenCapture();

        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        tmpMp4Path = path.join(context.globalStorageUri.fsPath, `gecho-replay-${Date.now()}.mp4`);
        await activeCapture.start(tmpMp4Path);
        await activeCapture.waitForReady();
        await activePlayer.play(echo, getConfig().replay);
        const mp4Path = await activeCapture?.stop(getConfig().recording.stopTimeoutMs);

        activePlayer = undefined;
        activeCapture = undefined;
        setState('idle');

        await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'gEcho: Converting to GIF...', cancellable: false },
          async () => {
            const converter = new GifConverter();
            await converter.convert(mp4Path!, saveUri.fsPath);
          }
        );

        vscode.window.showInformationMessage(`gEcho: GIF saved to ${saveUri.fsPath}`);
      } catch (err) {
        if (activeCapture) {
          try { await activeCapture?.stop(getConfig().recording.stopTimeoutMs); } catch { /* ignore */ }
        }
        if (tmpMp4Path) {
          await unlink(tmpMp4Path).catch(() => undefined);
        }
        activePlayer = undefined;
        activeCapture = undefined;
        setState('idle');
        const msg = err instanceof Error ? err.message : String(err);
        const isPermissionError = /permission not granted|screen recording|not authorized/i.test(msg);
        const hint = process.platform === 'darwin' && isPermissionError
          ? ' Go to System Settings → Privacy & Security → Screen Recording and enable VS Code.'
          : '';
        vscode.window.showErrorMessage(`gEcho: Replay as GIF failed — ${msg}${hint}`);
      }
    })
  );
}

export function deactivate(): void {
  if (activeCountdownSource) {
    activeCountdownSource.cancel();
    activeCountdownSource.dispose();
    activeCountdownSource = undefined;
  }
  if (activeCapture) {
    activeCapture.stop(getConfig().recording.stopTimeoutMs).catch(() => undefined);
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
