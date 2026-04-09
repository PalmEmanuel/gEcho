import * as vscode from 'vscode';
import type { RecordingState } from '../types/index.js';

const STATE_CONFIG: Record<RecordingState, { text: string; tooltip: string; command: string }> = {
  idle: {
    text: '🦎 gEcho',
    tooltip: 'gEcho — click to browse commands',
    command: 'gecho.showCommands',
  },
  recording: {
    text: '🔴 gEcho: Recording...',
    tooltip: 'gEcho — click to stop recording',
    command: 'gecho.stopEchoRecording',
  },
  'recording-gif': {
    text: '🔴 gEcho: Recording GIF...',
    tooltip: 'gEcho — click to stop GIF recording',
    command: 'gecho.stopGifRecording',
  },
  replaying: {
    text: '▶️ gEcho: Replaying...',
    tooltip: 'gEcho — click to cancel replay',
    command: 'gecho.cancelReplay',
  },
  'replaying-gif': {
    text: '▶️🔴 gEcho: Replay → GIF...',
    tooltip: 'gEcho — click to cancel replay + recording',
    command: 'gecho.cancelReplay',
  },
};

export function createStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  context.subscriptions.push(item);
  updateStatusBar(item, 'idle');
  return item;
}

export function updateStatusBar(item: vscode.StatusBarItem, state: RecordingState): void {
  const config = STATE_CONFIG[state];
  item.text = config.text;
  item.tooltip = config.tooltip;
  item.command = config.command;
  item.show();
}
