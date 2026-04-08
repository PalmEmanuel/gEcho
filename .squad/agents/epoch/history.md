# Project Context

- **Owner:** Emanuel Palm
- **Project:** gEcho — VS Code extension for recording, replaying, and generating reproducible GIFs from VS Code interactions
- **Stack:** TypeScript, VS Code Extension API (1.101.0+), Node.js, ffmpeg, JSON workbook format (.gecho.json)
- **Created:** 2026-04-08

## Key Platform Details

- **macOS:** AppleScript for window bounds, `avfoundation` capture input
- **Linux:** `xdotool`/`xwininfo` for window bounds, `x11grab` capture (Wayland not supported)
- **Windows:** PowerShell for window bounds, `gdigrab` capture
- **Replay engine:** Steps executed sequentially via VS Code command API

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
