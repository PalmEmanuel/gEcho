import * as vscode from 'vscode';

/**
 * Runs a status-bar countdown before GIF capture begins.
 *
 * Ticks the status bar item text each second: "gEcho: Starting in 3… 2… 1…"
 * while also showing a cancellable notification so the user can abort by
 * clicking Cancel (or pressing Escape to dismiss the notification).
 *
 * @param seconds  Number of seconds to count down. Pass 0 to skip entirely.
 * @param statusBar  The extension's status bar item (text is updated each tick).
 * @returns  `true` when the countdown completes; `false` if the user cancelled.
 */
export async function runCountdown(
  seconds: number,
  statusBar: vscode.StatusBarItem,
): Promise<boolean> {
  if (seconds <= 0) { return true; }

  let cancelled = false;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'gEcho',
      cancellable: true,
    },
    async (progress, token) => {
      token.onCancellationRequested(() => { cancelled = true; });

      for (let remaining = seconds; remaining > 0; remaining--) {
        if (cancelled || token.isCancellationRequested) { break; }

        statusBar.text = `gEcho: Starting in ${remaining}…`;
        progress.report({ message: `Starting in ${remaining}…` });

        const completed = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(true), 1000);
          token.onCancellationRequested(() => {
            clearTimeout(timer);
            resolve(false);
          });
        });

        if (!completed) {
          cancelled = true;
          break;
        }
      }
    },
  );

  return !cancelled;
}
