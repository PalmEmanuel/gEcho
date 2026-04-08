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

### 2025-01-01 — Security Baseline Established

- Created `src/security/sanitizer.ts` with three guards: `sanitizeFilePath`, `sanitizeCommandId`, `sanitizeFfmpegPath`. Re-exported via `src/security/index.ts`.
- Added `.github/SECURITY.md` covering workbook trust, screen recording, keystroke recording, and ffmpegPath injection risks.
- Decisions filed in `.squad/decisions/inbox/warden-security-baseline.md`: sanitizers must be called at replay time; Echo mode requires a confirm dialog before recording; no SecretStorage needed for current scope; VSIX bundles no credentials.
- The `package` script already uses `--no-dependencies`, which is correct for a zero-runtime-dependency extension — this should be preserved.
- `gecho.ffmpegPath` defaults to `"ffmpeg"` (bare binary name). `sanitizeFfmpegPath` does not block spaces, so paths like `/usr/local/bin/ffmpeg` and `C:\Program Files\ffmpeg\bin\ffmpeg.exe` are accepted; only shell metacharacters are rejected.
