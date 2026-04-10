import * as vscode from 'vscode';
import type { Echo, ReplayConfig } from '../types/index.js';
import { sanitizeCommandId, sanitizeFilePath } from '../security/index.js';

const DEFAULT_CHAR_DELAY_MS = 55;

/** Maps common shorthand key names to VS Code command IDs */
const KEY_COMMAND_MAP: Record<string, string> = {
  'ctrl+shift+p': 'workbench.action.showCommands',
  'cmd+shift+p': 'workbench.action.showCommands',
  'ctrl+p': 'workbench.action.quickOpen',
  'cmd+p': 'workbench.action.quickOpen',
  'ctrl+space': 'editor.action.triggerSuggest',
  'cmd+space': 'editor.action.triggerSuggest',
  'ctrl+z': 'undo',
  'cmd+z': 'undo',
  'ctrl+shift+z': 'redo',
  'cmd+shift+z': 'redo',
  'ctrl+/': 'editor.action.commentLine',
  'cmd+/': 'editor.action.commentLine',
  'ctrl+s': 'workbench.action.files.save',
  'cmd+s': 'workbench.action.files.save',
  'ctrl+f': 'actions.find',
  'cmd+f': 'actions.find',
  'escape': 'cancelSelection',
  'tab': 'tab',
  'enter': 'acceptSelectedSuggestion',
};

export class EchoPlayer {
  private cancelled = false;
  private isExecutingStep = false;
  private inputListeners: vscode.Disposable[] = [];

  async play(echo: Echo, config?: ReplayConfig): Promise<void> {
    if (this.cancelled) { return; }
    this.cancelled = false;
    const speed = Math.max(config?.speed ?? 1.0, 0.1);
    const cancelOnInput = config?.cancelOnInput ?? true;

    if (cancelOnInput) {
      this.inputListeners.push(
        vscode.workspace.onDidChangeTextDocument(() => {
          if (!this.isExecutingStep) {
            this.stop();
          }
        }),
        vscode.window.onDidChangeTextEditorSelection(e => {
          const kind = e.kind;
          if (
            !this.isExecutingStep &&
            (kind === vscode.TextEditorSelectionChangeKind.Mouse ||
              kind === vscode.TextEditorSelectionChangeKind.Keyboard)
          ) {
            this.stop();
          }
        }),
      );
    }

    try {
      for (const step of echo.steps) {
        if (this.cancelled) {
          break;
        }

        this.isExecutingStep = true;
        try {
          switch (step.type) {
            case 'type': {
              const charDelay = Math.min(step.delay ?? DEFAULT_CHAR_DELAY_MS, 500) / speed;
              if (charDelay > 0) {
                for (const char of step.text) {
                  if (this.cancelled) { break; }
                  await vscode.commands.executeCommand('type', { text: char });
                  await this.sleep(charDelay);
                }
              } else {
                await vscode.commands.executeCommand('type', { text: step.text });
              }
              break;
            }

            case 'command': {
              let safeId: string;
              try {
                safeId = sanitizeCommandId(step.id);
              } catch {
                vscode.window.showWarningMessage(`gEcho: Blocked unsafe command ID in echo: "${step.id}"`);
                return;
              }
              if (step.args !== undefined) {
                if (Array.isArray(step.args)) {
                  await vscode.commands.executeCommand(safeId, ...(step.args as unknown[]));
                } else {
                  await vscode.commands.executeCommand(safeId, step.args);
                }
              } else {
                await vscode.commands.executeCommand(safeId);
              }
              break;
            }

            case 'key': {
              const normalized = step.key.toLowerCase().trim();
              const mappedCommand = KEY_COMMAND_MAP[normalized];
              if (mappedCommand) {
                await vscode.commands.executeCommand(mappedCommand);
              } else if (step.key.length === 1) {
                await vscode.commands.executeCommand('type', { text: step.key });
              }
              // Unknown multi-key sequences are skipped silently
              break;
            }

            case 'select': {
              const editor = vscode.window.activeTextEditor;
              if (editor) {
                if (step.selections !== undefined) {
                  editor.selections = step.selections.map(s => {
                    const anchor = new vscode.Position(s.anchor[0], s.anchor[1]);
                    const active = new vscode.Position(s.active[0], s.active[1]);
                    return new vscode.Selection(anchor, active);
                  });
                } else {
                  const anchor = new vscode.Position(step.anchor[0], step.anchor[1]);
                  const active = new vscode.Position(step.active[0], step.active[1]);
                  editor.selection = new vscode.Selection(anchor, active);
                }
              }
              break;
            }

            case 'wait': {
              if (step.until === 'idle') {
                await this.waitForIdle(step.ms / speed);
              } else {
                await this.sleep(step.ms / speed);
              }
              break;
            }

            case 'openFile': {
              let safePath: string;
              try {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                safePath = sanitizeFilePath(step.path, workspaceRoot);
              } catch {
                vscode.window.showWarningMessage(`gEcho: Blocked unsafe file path in echo: "${step.path}"`);
                return;
              }
              const uris = await vscode.workspace.findFiles(safePath, undefined, 1);
              if (uris.length > 0) {
                const doc = await vscode.workspace.openTextDocument(uris[0]);
                await vscode.window.showTextDocument(doc);
              } else {
                const uri = vscode.Uri.file(safePath);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc);
              }
              break;
            }

            case 'paste': {
              const editor = vscode.window.activeTextEditor;
              if (editor) {
                const success = await editor.edit(editBuilder => {
                  for (const sel of editor.selections) {
                    if (sel.isEmpty) {
                      editBuilder.insert(sel.active, step.text);
                    } else {
                      editBuilder.replace(sel, step.text);
                    }
                  }
                });
                if (!success) {
                  vscode.window.showWarningMessage('gEcho: paste step could not be applied (document may be read-only).');
                }
              }
              break;
            }

            case 'scroll': {
              await vscode.commands.executeCommand('editorScroll', {
                to: step.direction,
                by: 'line',
                value: step.lines,
              });
              break;
            }

            default: {
              break;
            }
          }
        } finally {
          this.isExecutingStep = false;
        }
      }
    } finally {
      this.disposeInputListeners();
    }
  }

  stop(): void {
    this.cancelled = true;
    this.disposeInputListeners();
  }

  private disposeInputListeners(): void {
    for (const d of this.inputListeners) {
      d.dispose();
    }
    this.inputListeners = [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>(r => setTimeout(r, ms));
  }

  /**
   * Wait until VS Code is "idle" — no document changes for `quietMs` milliseconds.
   * Uses a hard cap of 30 seconds to prevent infinite waits.
   */
  private waitForIdle(quietMs: number): Promise<void> {
    const maxWaitMs = 30_000;
    return new Promise<void>(resolve => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const startIdle = () => {
        timer = setTimeout(() => {
          disposable.dispose();
          clearTimeout(hardCap);
          resolve();
        }, quietMs);
      };
      const disposable = vscode.workspace.onDidChangeTextDocument(() => {
        if (timer !== undefined) { clearTimeout(timer); }
        startIdle();
      });
      const hardCap = setTimeout(() => {
        if (timer !== undefined) { clearTimeout(timer); }
        disposable.dispose();
        resolve();
      }, maxWaitMs);
      startIdle();
    });
  }
}
