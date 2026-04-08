# Squad Decisions

## Active Decisions

### Initial Architecture — Gecko (2026-04-08)

**Context:** gEcho is a brand-new VS Code extension. This decision captures the foundational architecture choices made during Wave 1 scaffolding so all downstream agents build on the same assumptions.

**Module System:** Node16 module resolution with explicit `.js` extensions in imports (required by TypeScript + Node16).

**Target:** ES2022 (VS Code 1.101.0+ ships Node 18+).

**Source Layout:**
```
src/types/        — Workbook + recording types (discriminated unions)
src/recording/    — EchoRecorder (event capture → steps)
src/replay/       — WorkbookPlayer (steps → VS Code commands)
src/screen/       — ScreenCapture (ffmpeg wrapper)
src/platform/     — OS detection + window bounds
src/workbook/     — Read/write/validate .gecho.json files
src/extension.ts  — Thin entry point (registration only)
```

**Workbook Format v1.0:** Discriminated union on `type` field; strict versioning; `.gecho.json` extension.

**Activation Strategy:** Per-command activation only (`onCommand:gecho.*`). Never `"*"` activation.

**Zero Runtime Dependencies:** All dependencies are devDependencies. Platform integrations invoked via child processes.

**Constraints:**
1. Import paths use `.js` extensions
2. All step types are discriminated unions (switch on `step.type`)
3. No new activation events without a decision record
4. Workbook format changes require version bump + migration function
5. No runtime dependencies without team approval

---

### Extension State Shape — Vex (2026-04-08)

**Context:** `extension.ts` needs to track recording/replaying state and active objects.

**Decision:** Module-level variables:
```typescript
let currentState: RecordingState = 'idle';
let activeRecorder: EchoRecorder | undefined;
let activePlayer: WorkbookPlayer | undefined;
let activeCapture: ScreenCapture | undefined;
```

`RecordingState` (`'idle' | 'recording' | 'replaying'`) is the single source of truth. All three `active*` variables are reset to `undefined` when state returns to idle.

**Rationale:** VS Code extensions have single activation per window; module-level state is idiomatic and readable at this scale. No need for a state class.

**Constraints:**
1. Do not introduce a separate state manager without team approval
2. Always reset `currentState = 'idle'` in success and catch blocks
3. `activeCapture` may be set during both GIF recording and replayAsGif

---

### Implementation — Epoch (2026-04-08)

**Module File Layout:** Each module has `index.ts` re-exporter backed by named implementation file (e.g., `recorder.ts`). Respects Gecko's "single index.ts entry point" constraint.

**EchoRecorder:** Insert-only capture (`onDidChangeTextDocument` with `rangeLength === 0`). Deletions and replacements are skipped.

**TypeStep.delay:** Recorded as `Date.now() - startTime` (elapsed ms since start). Dual use: manually authored workbooks use it as typing cadence. Player respects both: if `delay > 0`, waits `delay / speed` ms between characters.

**ffmpeg:** `stop()` sends SIGINT (not SIGKILL) for graceful shutdown. Exit code `255` on macOS is treated as success (alongside `0`).

**ffmpeg Startup:** Promise resolves on first `stderr` emission (ffmpeg writes version + stream info immediately).

**Platform Fallback:** `getWindowBounds()` falls back to `{x:0, y:0, width:1920, height:1080}` on all platforms if command fails.

**WorkbookPlayer Cancellation:** `cancelled` flag checked at iteration top and within per-char loop. `stop()` sets flag synchronously; loop drains on next awaitable boundary.

**OpenFileStep:** Tries `vscode.workspace.findFiles()` first; falls back to `Uri.file()` if no file found.

---

### Test Strategy — Grimoire (2026-04-08)

**Test Runner:** `@vscode/test-electron` for integration tests; plain Mocha (`.mocharc.json`) for unit tests.

**Mock Strategy:**
- ffmpeg is mocked (never spawn real ffmpeg in tests)
- VS Code API mocked via host or thin stubs
- Filesystem: real I/O in `os.tmpdir()` subdirectories, cleaned up in afterEach

**Coverage:** 80% line coverage floor. Priority: `types/` → `workbook/` → `platform/` → `replay/` → `recording/` → `screen/`.

**TDD Status:** Tests in workbook.test.ts will fail (expected) until implementations complete.

---

### CI/CD — Chronos (2026-04-08)

**Reproducibility:** Use `npm ci` instead of `npm install` in CI (locks exact versions from package-lock.json).

**Cross-Platform Matrix:** CI runs on `[ubuntu-latest, macos-latest, windows-latest]`; each combination compiles, lints, tests independently.

**Linux Display:** Tests on Linux wrapped with `xvfb-run -a` (virtual X11 display).

**VSIX Artifact:** Produced only on ubuntu-latest (avoid 3 identical artifacts). Conditional with `if: runner.os == 'Linux'`.

**Marketplace Publishing:** CI prepares VSIX but does not publish. Marketplace publish requires `VSCE_PAT` (VS Code Service Principal Account Token), configured separately.

**Release Pipeline:** Triggered by tags matching `v*.*.*`. Runs on ubuntu-latest only; checks out tag, installs, compiles, packages, uploads VSIX (90-day retention).

---

### Security Baseline — Warden (2026-04-08)

**Command Sanitization:** All `CommandStep` execution calls `sanitizeCommandId()` before `vscode.commands.executeCommand()`.

**File Path Sanitization:** All `OpenFileStep` calls `sanitizeFilePath()` with workspace root as second argument (enforces workspace confinement, blocks path traversal).

**ffmpeg Path Validation:** `gecho.ffmpegPath` config validated with `sanitizeFfmpegPath()` before any spawn/exec call.

**No Credentials:** SecretStorage NOT needed at this time. If future features require auth, SecretStorage MUST be used.

**Keystroke Recording Warning:** Confirmation dialog before recording starts (prevents accidental credential capture).

**VSIX Bundle Security:** No credential/token/env files in VSIX. All dependencies are devDependencies; package script uses `--no-dependencies` flag.

---

### Icon Analysis & Branding — Sigil (2026-04-08)

**Icon Palette:**
- Primary dark: Deep purple robe (`#2D1F3D`)
- Secondary: Vibrant green gecko skin (`#4CAF50`)
- Accent: Lavender magic (`#9B7BBF`)
- Highlight: White/silver stars (`#E8E0F0`)

**Small Size (16px):** Good readability. Central green gecko + circular border identifiable. Green-on-purple is colorblind-accessible.

**Brand Fit:** Wizard gecko with hourglass (recording) + play button (replay) directly communicates "record and replay magic."

**Gallery Banner:** Dark purple (`#1E1432`) backdrop on `dark` theme. Harmonizes with VS Code dark themes; lets green gecko pop.

**Recommendations:** Use VS Code dark theme for screenshots; consider subtle purple border for demo GIFs; social preview at 1280×640 with centered 256px icon.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
