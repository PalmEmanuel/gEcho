# Project Context

- **Owner:** Emanuel Palm
- **Project:** gEcho — VS Code extension for recording, replaying, and generating reproducible GIFs from VS Code interactions
- **Stack:** TypeScript, VS Code Extension API (1.101.0+), Node.js, ffmpeg, JSON workbook format (.gecho.json)
- **Created:** 2026-04-08

## Key Extension Details

- Commands: Start/Stop Echo Recording, Start/Stop GIF Recording, Replay Workbook, Replay as GIF
- Configuration namespace: `gecho.*` (ffmpegPath, outputDirectory, gif.fps, gif.width, gif.quality, replay.speed)
- File extension: `.gecho.json` (workbook format)
- Min VS Code version: 1.101.0

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### Issue #1 Audit — 2026-04-08

- Issue #1 (extension scaffold) was fully implemented except for two missing npm scripts: `build` and `check-types`.
- Added `build` as an alias for `compile`, and `check-types` as `tsc --noEmit`. Both pushed to main, issue closed.
- `esbuild.js` was intentionally absent — project uses `tsc` directly (no bundler decision recorded; this is acceptable at current scale).
- `activationEvents` uses `onStartupFinished` (eager activation) instead of per-command as Gecko's decision prescribes. This is a live deviation — noted but not changed here as it affects runtime behavior.
- **Team note (2026-04-08)**: Extension ID is now authoritative as `PalmEmanuel.gEcho` (Coordinator update). All references normalized in package.json, README, test files.
- **Team note (2026-04-08)**: Epoch fixed 3 GIF recording race condition bugs on feat/status-bar-recorder-player (see Epoch history). Monitor `stop()` file-existence check, exit code 254 acceptance, state handling in next code reviews.


### Wave 3 — Confirmation dialog, deactivate cleanup

- `WorkbookPlayer` exposes `stop()` (sets `cancelled = true`), NOT `cancel()`. Always use `stop()` to halt an in-progress replay.
- `deactivate()` is the correct cleanup hook for module-level resources (`activeCapture`, `activeRecorder`, `activePlayer`) that don't implement `vscode.Disposable` directly — no need to push them to `context.subscriptions`.
- `stopGifRecording` already sets `activeCapture = undefined` after `await activeCapture.stop()`, both in the happy path and the catch block — no additional changes needed there.
- Confirmation dialog for `startEchoRecording` uses `{ modal: false }` (toast-style) with explicit `'Start Recording'` / `'Cancel'` buttons; guard pattern is `if (confirm !== 'Start Recording') return` to also handle dismiss (undefined).

### 2026-04-08 — Wave 1: extension.ts + config.ts

- Module resolution is Node16: all internal imports require `.js` extensions even for `.ts` source files.
- `globalStorageUri.fsPath` is the right place for temporary GIF output during recording — it's writable, extension-scoped, and survives restarts.
- `satisfies` keyword (TS 4.9+) is available (target ES2022 + strict) and used in `getConfig()` to enforce `GifConfig`/`ReplayConfig` shape without widening the return type.
- Status bar lifecycle: create before registering commands, always push to `context.subscriptions`, use a single `updateStatusBar()` helper driven by `currentState`.
- All command bodies wrapped in `try/catch`; stub implementations throw `"Not implemented"` — that is intentional and correct for Wave 1.
- `src/config.ts` is the single typed accessor for all `gecho.*` workspace configuration — downstream agents should import `getConfig()` rather than calling `vscode.workspace.getConfiguration` directly.
