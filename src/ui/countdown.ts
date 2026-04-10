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
 * @param seconds  Number of seconds to count down. Pass 0 to skip entirely.
 * @param statusBar  The extension's status bar item (text is updated each tick).
 * @returns  `true` when the countdown completes normally.
 */
export function runCountdown(
  seconds: number,
  statusBar: vscode.StatusBarItem,
): Promise<boolean> {
  if (seconds <= 0) { return Promise.resolve(true); }

  const totalMs = seconds * 1000;
  let elapsed = 0;
  let interval: ReturnType<typeof setInterval> | undefined;

  return new Promise<boolean>((resolve) => {
    interval = setInterval(() => {
      elapsed += TICK_MS;
      const remaining = Math.max(0, totalMs - elapsed);
      const filled = Math.round((remaining / totalMs) * BAR_WIDTH);
      statusBar.text = `${PREFIX}${FILLED.repeat(filled)}${EMPTY.repeat(BAR_WIDTH - filled)}`;

      if (elapsed >= totalMs) {
        clearInterval(interval);
        resolve(true);
      }
    }, TICK_MS);
  });
}
