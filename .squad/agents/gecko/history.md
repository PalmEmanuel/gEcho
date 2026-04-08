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
