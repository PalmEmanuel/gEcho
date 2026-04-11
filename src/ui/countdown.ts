import * as vscode from 'vscode';

const BAR_WIDTH = 20;
const TICK_MS = 100;
const FILLED = '█';
const EMPTY = '░';
const PREFIX = '$(loading~spin) gEcho: ';

/**
 * Runs a reverse progress-bar countdown in the status bar before GIF capture begins.
 *
 * Updates every 100ms with a draining Unicode block bar (starts full, empties right-to-left).
 * No notification toast is shown — the bar is the entire UX.
 *
 * @param seconds  Number of seconds to count down (coerced to a non-negative integer). Pass 0 to skip entirely.
 * @param statusBar  The extension's status bar item (text is updated each tick).
 * @param token  Optional cancellation token. When cancelled, resolves `false` immediately.
 * @returns  `true` when the countdown completes normally, `false` if cancelled.
 */
export function runCountdown(
  seconds: number,
  statusBar: vscode.StatusBarItem,
  token?: vscode.CancellationToken,
): Promise<boolean> {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  if (totalSeconds <= 0) { return Promise.resolve(true); }

  const totalMs = totalSeconds * 1000;
  let elapsed = 0;
  let interval: ReturnType<typeof setInterval> | undefined;

  return new Promise<boolean>((resolve) => {
    let cancellationDisposable: vscode.Disposable | undefined;

    function cleanup(result: boolean): void {
      clearInterval(interval);
      cancellationDisposable?.dispose();
      cancellationDisposable = undefined;
      resolve(result);
    }

    if (token) {
      if (token.isCancellationRequested) {
        cleanup(false);
        return;
      }
      cancellationDisposable = token.onCancellationRequested(() => cleanup(false));
    }

    interval = setInterval(() => {
      elapsed += TICK_MS;
      const remaining = Math.max(0, totalMs - elapsed);
      const filled = Math.round((remaining / totalMs) * BAR_WIDTH);
      statusBar.text = `${PREFIX}${FILLED.repeat(filled)}${EMPTY.repeat(BAR_WIDTH - filled)}`;

      if (elapsed >= totalMs) {
        cleanup(true);
      }
    }, TICK_MS);
  });
}
