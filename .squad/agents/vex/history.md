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

### 2026-04-08 — Wave 1: extension.ts + config.ts

- Module resolution is Node16: all internal imports require `.js` extensions even for `.ts` source files.
- `globalStorageUri.fsPath` is the right place for temporary GIF output during recording — it's writable, extension-scoped, and survives restarts.
- `satisfies` keyword (TS 4.9+) is available (target ES2022 + strict) and used in `getConfig()` to enforce `GifConfig`/`ReplayConfig` shape without widening the return type.
- Status bar lifecycle: create before registering commands, always push to `context.subscriptions`, use a single `updateStatusBar()` helper driven by `currentState`.
- All command bodies wrapped in `try/catch`; stub implementations throw `"Not implemented"` — that is intentional and correct for Wave 1.
- `src/config.ts` is the single typed accessor for all `gecho.*` workspace configuration — downstream agents should import `getConfig()` rather than calling `vscode.workspace.getConfiguration` directly.
