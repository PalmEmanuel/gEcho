# Project Context

- **Owner:** Emanuel Palm
- **Project:** gEcho — VS Code extension for recording, replaying, and generating reproducible GIFs from VS Code interactions
- **Stack:** TypeScript, VS Code Extension API (1.101.0+), Node.js, ffmpeg, JSON workbook format (.gecho.json)
- **Created:** 2026-04-08

## Key CI Considerations

- Extension tests require a display; Linux CI needs `xvfb-run`
- ffmpeg must be available in CI for GIF recording tests
- Cross-platform matrix: macOS, Ubuntu, Windows
- VSIX is produced via `@vscode/vsce`
- Headless VS Code test mode: `--extensionTestsPath`

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
