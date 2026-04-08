# Project Context

- **Owner:** Emanuel Palm
- **Project:** gEcho — VS Code extension for recording, replaying, and generating reproducible GIFs from VS Code interactions
- **Stack:** TypeScript, VS Code Extension API (1.101.0+), Node.js, ffmpeg, JSON workbook format (.gecho.json)
- **Created:** 2026-04-08

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

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
