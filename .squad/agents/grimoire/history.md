# Project Context

- **Owner:** Emanuel Palm
- **Project:** gEcho — VS Code extension for recording, replaying, and generating reproducible GIFs from VS Code interactions
- **Stack:** TypeScript, VS Code Extension API (1.101.0+), Node.js, ffmpeg, JSON workbook format (.gecho.json)
- **Created:** 2026-04-08

## Key Testing Considerations

- ffmpeg must be mocked in unit tests — real capture requires a display
- Workbook replay tests can use synthetic `.gecho.json` fixtures
- Timing-sensitive code (replay engine) needs controlled clock or sequence-driven testing
- VS Code Integration Test Host is required for extension API tests

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
