# Project Context

- **Owner:** Emanuel Palm
- **Project:** gEcho — VS Code extension for recording, replaying, and generating reproducible GIFs from VS Code interactions
- **Stack:** TypeScript, VS Code Extension API (1.101.0+), Node.js, ffmpeg, JSON workbook format (.gecho.json)
- **Created:** 2026-04-08

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- **Teams webhook URL lives at `~/.squad/teams-webhook.url` (machine-local, never in repo).** All agents read it at runtime via `cat ~/.squad/teams-webhook.url`. The skill at `.squad/skills/teams-notifications/SKILL.md` is the authoritative reference for payload formats and anti-spam rules.

- **Node16 module resolution requires `.js` extensions in imports.** All internal imports (e.g., `from './workbook.js'`) use `.js` even though source is `.ts`. This is a TypeScript + Node16 requirement — downstream agents must follow this convention.
- **ESLint 8 is required with @typescript-eslint v7.** ESLint 9 has peer dependency conflicts with @typescript-eslint/parser ^7.14.0. Pinned to `^8.56.0`.
- **tsconfig rootDir is `.` (not `./src`) because test files live outside src/.** Output mirrors the source layout under `out/src/` and `out/test/`. The `main` field in package.json points to `./out/src/extension.js` to match.
- **Workbook step types use discriminated unions on the `type` field.** All step processing should use switch statements on `step.type` — never ad-hoc type guards.
- **Zero runtime dependencies is a hard constraint.** All platform interactions (ffmpeg, AppleScript, xdotool, PowerShell) go through `child_process`. Any new dependency needs a decision record.
- **Wave 2 complete:** Full team delivered EchoRecorder, WorkbookPlayer, ScreenCapture, platform detection, workbook I/O, 3 test suites, GitHub Actions CI/release, security sanitizers, and brand assets. Project compiles clean; no stubs remain. Ready for testing and bug fixes.
- **Post-Wave 2 review: sanitizers are dead code.** All three sanitizer functions (`sanitizeCommandId`, `sanitizeFilePath`, `sanitizeFfmpegPath`) exist in `src/security/sanitizer.ts` but are imported and called nowhere. The security contract from the Warden decision is unimplemented. This is the highest-priority fix.
- **`validateWorkbook` is shallow.** Only checks top-level shape (version, metadata.name, steps is array). Does not validate individual step contents. Combined with missing sanitizers, a malicious workbook gets zero validation before execution.
- **`deactivate()` is empty.** Active ffmpeg processes, recorders, and players are not cleaned up on extension shutdown. These objects are not registered as disposables.
- **Missing recording confirmation dialog.** The Warden-mandated confirmation before recording (credential capture protection) was never wired in.
- **`config.ts` is orphaned.** The `getConfig()` accessor is defined but never imported. `capture.ts` reads config directly instead.
- **Test coverage gaps:** No tests for sanitizers, player, or capture. One test in `recording.test.ts` will fail because it asserts `validateWorkbook` rejects invalid step shapes, but the validator doesn't check step contents.
- **Windows `getWindowBounds` returns screen area, not window bounds.** The PowerShell script uses `Screen.WorkingArea` instead of actual window geometry.

- **Activation Event Strategy settled (2026-04-09):** `onStartupFinished` is intentionally kept over per-command activation. For a recording extension where the status bar is the primary discovery mechanism, showing the idle state (`🦎 gEcho`) on startup is a deliberate UX win. The updated constraint: prefer `onCommand:gecho.*` unless the feature's UX value requires eager visibility — `onStartupFinished` is acceptable for UI-critical features (like status bars) when the activation payload is lightweight.

- **VS Code config cannot distinguish user-set 0 from default 0 without `inspect()`.** For `configCrop` in `resolveCrop`, `||` is intentionally used so that 0 (the VS Code default) falls through to the preset. Users who need to override a preset edge back to 0 must use `optionsCrop` (programmatic API), not VS Code settings. Document this clearly in JSDoc and user-facing docs.

- **Test vscodeMock import path convention:** Suite-level tests import the mock as `'./integration/vscodeMock.js'` (relative to the suite directory). Never use `'../suite/...'` style — it duplicates the directory name and breaks if files move.

- **PR #67 (macOS display index + native permission check):** Refactored platform detection to use native helper binaries that return JSON with `{bounds, displayIndex, scaleFactor}` in one call. The macOS helper uses `CGPreflightScreenCaptureAccess()` to check Screen Recording permission without triggering a prompt (reliable on macOS 10.15+). AVFoundation scale factor handling is now correct: crop coordinates are scaled to physical pixels, then scaled back to logical size in the output. The `buildCropFilter()` pure function encapsulates this transform. Native helpers live in `resources/bin/{darwin,linux,win32}/` and are invoked via `execFile()` with a 10-second timeout and FALLBACK_INFO on any error. Permission checks in `capture.ts` and `extension.ts` now use the native helper instead of device enumeration (which could fail for unrelated reasons).

- **ScreenCapture cancellation contract:** `stop()` waits for in-flight `start()` by awaiting `_startPromise`. If `_doStart()` threw a real error (permission denied, bad ffmpeg path), `stop()` surfaces that error even if `_stopRequested` is set — cancellation only succeeds when `start()` completes gracefully after checking the flag. This ensures users see the actual failure reason, not a generic "cancelled" message.
