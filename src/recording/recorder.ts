import * as vscode from 'vscode';
import type { StepType, TypeStep } from '../types/index.js';

/** ms window within which adjacent single-char inserts are coalesced */
const COALESCE_WINDOW_MS = 300;

export class EchoRecorder {
  private startTime: number = 0;
  private steps: StepType[] = [];
  private disposables: vscode.Disposable[] = [];
  /** timestamp of last text-change event — used to suppress implied selection noise */
  private lastTextChangeAt: number = -1;

  start(): void {
    this.startTime = Date.now();
    this.steps = [];
    this.disposables = [];
    this.lastTextChangeAt = -1;

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(event => {
        const now = Date.now();
        for (const change of event.contentChanges) {
          if (change.rangeLength === 0 && change.text.length > 0) {
            this.lastTextChangeAt = now;
            this.pushTypeStep(change.text, now);
          }
        }
      })
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(event => {
        const now = Date.now();
        // Skip selection noise that fires immediately after a text change
        if (now - this.lastTextChangeAt < 50) {
          return;
        }
        const selection = event.selections[0];
        if (!selection) { return; }
        // Skip empty collapsed cursors that match an earlier position (no real intent)
        if (selection.isEmpty) {
          const prev = this.lastStep();
          if (prev?.type === 'select') {
            const [al, ac] = prev.active;
            if (al === selection.active.line && ac === selection.active.character) {
              return;
            }
          }
        }
        this.steps.push({
          type: 'select',
          anchor: [selection.anchor.line, selection.anchor.character],
          active: [selection.active.line, selection.active.character],
        });
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

  /**
   * Push a type step, coalescing adjacent single-char inserts within
   * COALESCE_WINDOW_MS into a single step whose `delay` is the average
   * inter-keystroke interval.
   */
  private pushTypeStep(text: string, now: number): void {
    const delay = now - this.startTime;
    const prev = this.lastStep();

    if (
      prev?.type === 'type' &&
      text.length === 1 &&
      prev.text.length < 80 &&
      prev.delay !== undefined &&
      delay - prev.delay < COALESCE_WINDOW_MS
    ) {
      (prev as TypeStep).text += text;
      // Update delay to reflect the most-recent keystroke timing
      (prev as TypeStep).delay = delay;
    } else {
      this.steps.push({ type: 'type', text, delay });
    }
  }

  private lastStep(): StepType | undefined {
    return this.steps[this.steps.length - 1];
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
