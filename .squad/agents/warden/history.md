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

### 2025-01-10 — PR #67 Security Review: Native Helpers for Window Detection

- **Reviewed:** `resources/bin/darwin/gecho-helper` (pre-compiled Swift binary), `resources/bin/linux/gecho-helper.js`, `resources/bin/win32/gecho-helper.js`, and `src/platform/platform.ts`.
- **Binary Execution Safety:** All invocations use `execFile` (not `exec`), eliminating shell injection risk. Paths are constructed via `resolve(__dirname, '../../..', 'resources/bin/...')` with no user input. Timeouts are set (10s for window info, 5s for permission check).
- **JSON Output Validation:** `platform.ts` validates parsed JSON with explicit type checks (`typeof parsed.displayIndex === 'number'`, etc.) before use. Falls back to `FALLBACK_INFO` on parse errors or missing fields. No arbitrary code execution or prototype pollution risk.
- **Pre-compiled Binary:** `resources/bin/darwin/gecho-helper` is a reproducible Mach-O universal binary (arm64 + x86_64), ad-hoc signed. Build script (`scripts/build-native.sh`) is deterministic (verified: same SHA-256 `bf861996ad022d0b28148051286d6d51271227f61d6d18357066f1f77eefc571` after rebuild). Source is `resources/native/darwin/main.swift`.
- **P2 Recommendation:** Add `resources/bin/darwin/gecho-helper.sha256` checksum file and CI verification step to prevent supply chain tampering. Not a blocker for this PR, but should be tracked as a follow-up.
- **Privacy Scope:** `main.swift` uses `CGWindowListCopyWindowInfo` to find VS Code's window by owner name. Output is minimal: window bounds, display index, and scale factor. Does NOT capture screen content or expose other apps' data. `CGPreflightScreenCaptureAccess` returns a boolean (permission granted Y/N) without triggering a prompt — safe and non-intrusive.
- **Linux/Windows Helpers:** Both use `execFileSync` with hardcoded commands (xprop/xwininfo/xrandr on Linux; PowerShell with compile-time script on Windows). No command injection vectors. Top-level try/catch ensures fallback on parse errors.
- **Activation Event:** `onStartupFinished` is least-privilege (runs after window init, not on every file). No overly broad scopes in `package.json`.
- **Decision:** ✅ Approved PR #67 for merge. No P1 (blocking) issues. Recommendations filed in `.squad/decisions/inbox/warden-pr67-review.md` for follow-up: binary checksum verification (P2), SECURITY.md updates for ad-hoc signing and window API privacy (P2/P3).
