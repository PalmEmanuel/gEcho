# Project Context

- **Owner:** Emanuel Palm
- **Project:** gEcho — VS Code extension for recording, replaying, and generating reproducible GIFs from VS Code interactions
- **Stack:** TypeScript, VS Code Extension API (1.101.0+), Node.js, ffmpeg, JSON workbook format (.gecho.json)
- **Created:** 2026-04-08

## Key Visual Context

- Logo: `images/icon.png` — 1024×1024 PNG, provided by Emanuel Palm
- Extension publisher: `gecho`, name: `gecho`, displayName: `gEcho`
- VS Code marketplace icon field: `"icon": "images/icon.png"`
- Config namespace: `gecho.*`
- Target audience: developers who need reproducible demo GIFs for docs/CI

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

- **2026-04-08:** Icon analyzed — dominant palette is deep purple (#2D1F3D) + vibrant green (#4CAF50) + lavender accents. Gallery banner set to `#1E1432` (dark theme). Icon reads well at small sizes due to strong green/purple contrast. The gecko wizard with hourglass + play button perfectly captures "record and replay" concept. Full analysis in `.squad/decisions/inbox/sigil-icon-analysis.md`.
