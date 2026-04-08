import * as vscode from 'vscode';
import type { Workbook, ReplayConfig } from '../types/index.js';
import { sanitizeCommandId, sanitizeFilePath } from '../security/index.js';

export class WorkbookPlayer {
  private cancelled = false;

  async play(workbook: Workbook, config?: ReplayConfig): Promise<void> {
    this.cancelled = false;
    const speed = config?.speed ?? 1.0;

    for (const step of workbook.steps) {
      if (this.cancelled) {
        break;
      }

      switch (step.type) {
        case 'type': {
          if (step.delay !== undefined && step.delay > 0) {
            // Clamp per-char delay to [0, 500] ms to prevent frozen replays
            const charDelay = Math.min(step.delay, 500) / speed;
            for (const char of step.text) {
              if (this.cancelled) {
                break;
              }
              await vscode.commands.executeCommand('type', { text: char });
              await new Promise<void>(r => setTimeout(r, charDelay));
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
            vscode.window.showWarningMessage(`gEcho: Blocked unsafe command ID in workbook: "${step.id}"`);
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
          // Send key sequence to the terminal or active input
          await vscode.commands.executeCommand('workbench.action.terminal.sendSequence', {
            text: step.key,
          });
          break;
        }

        case 'select': {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            const anchor = new vscode.Position(step.anchor[0], step.anchor[1]);
            const active = new vscode.Position(step.active[0], step.active[1]);
            editor.selection = new vscode.Selection(anchor, active);
          }
          break;
        }

        case 'wait': {
          await new Promise<void>(r => setTimeout(r, step.ms / speed));
          break;
        }

        case 'openFile': {
          let safePath: string;
          try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            safePath = sanitizeFilePath(step.path, workspaceRoot);
          } catch {
            vscode.window.showWarningMessage(`gEcho: Blocked unsafe file path in workbook: "${step.path}"`);
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
          await vscode.commands.executeCommand('type', { text: step.text });
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
          // Unrecognized step type — skip silently
          break;
        }
      }
    }
  }

  stop(): void {
    this.cancelled = true;
  }
}
