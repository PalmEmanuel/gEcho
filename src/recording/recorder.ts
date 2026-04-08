import * as vscode from 'vscode';
import type { StepType } from '../types/index.js';

export class EchoRecorder {
  private startTime: number = 0;
  private steps: StepType[] = [];
  private disposables: vscode.Disposable[] = [];

  start(): void {
    this.startTime = Date.now();
    this.steps = [];
    this.disposables = [];

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        for (const change of event.contentChanges) {
          // Only record inserts (no deletions, no replacements)
          if (change.rangeLength === 0 && change.text.length > 0) {
            this.steps.push({
              type: 'type',
              text: change.text,
              delay: Date.now() - this.startTime,
            });
          }
        }
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(event => {
        const selection = event.selections[0];
        if (selection) {
          this.steps.push({
            type: 'select',
            anchor: [selection.anchor.line, selection.anchor.character],
            active: [selection.active.line, selection.active.character],
          });
        }
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
          this.steps.push({
            type: 'openFile',
            path: vscode.workspace.asRelativePath(editor.document.uri),
          });
        }
      })
    );
  }

  stop(): StepType[] {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    return [...this.steps];
  }

  dispose(): void {
    this.stop();
  }
}
