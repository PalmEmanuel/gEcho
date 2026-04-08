# Project Context

- **Owner:** Emanuel Palm
- **Project:** gEcho — VS Code extension for recording, replaying, and generating reproducible GIFs from VS Code interactions
- **Stack:** TypeScript, VS Code Extension API (1.101.0+), Node.js, ffmpeg, JSON workbook format (.gecho.json)
- **Created:** 2026-04-08

## Key Security Considerations

- Workbook files record keystrokes — user must explicitly control what is saved
- `vscode.SecretStorage` is the correct API for any credentials or tokens
- Extension captures screen region — must not capture beyond declared window bounds
- ffmpeg path config (`gecho.ffmpegPath`) must not allow command injection

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
