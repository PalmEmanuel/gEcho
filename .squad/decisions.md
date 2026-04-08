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

---

### Gecko Review Findings — Post-Wave 2 (2026-04-08)

**Date:** 2026-04-08
**Reviewer:** Gecko (Lead)
**Scope:** Full codebase review after Wave 2 completion

#### Critical Issues

**1. Security sanitizers are dead code — never called anywhere**

Files: `src/security/sanitizer.ts`, `src/replay/player.ts`, `src/screen/capture.ts`

The Warden decision mandates:
- `sanitizeCommandId()` before every `vscode.commands.executeCommand(step.id, ...)`
- `sanitizeFilePath()` before every `openFile` step
- `sanitizeFfmpegPath()` before spawning ffmpeg

None of these are called. Zero imports from `security/` exist in the codebase. A malicious workbook can execute arbitrary VS Code commands, open files outside the workspace, or inject shell metacharacters into the ffmpeg path.

**Action:** Epoch must wire sanitizers into `player.ts` (command + openFile steps) and `capture.ts` (ffmpeg path). Warden must verify integration.

**2. Missing recording confirmation dialog**

File: `src/extension.ts`

The Security Baseline decision requires a confirmation dialog before recording starts to prevent accidental credential capture. `startEchoRecording` sets state and begins recording immediately with no user confirmation.

**Action:** Vex must add `vscode.window.showWarningMessage` with confirm/cancel before activating the recorder.

**3. No cleanup of active processes on deactivate**

File: `src/extension.ts` (line 272-274)

`deactivate()` is empty. If VS Code shuts down mid-recording or mid-replay, the ffmpeg process is never killed. `activeRecorder`, `activeCapture`, and `activePlayer` are module-level but NOT registered with `context.subscriptions`. Only the statusBarItem is.

**Action:** Vex must implement `deactivate()` to stop activeCapture/activeRecorder/activePlayer and add them as disposables.

#### High Issues

**4. Failing test: validateWorkbook edge case**

File: `test/suite/recording.test.ts` (line 27-34)

Test asserts `validateWorkbook({...steps: [{type:'type', text: 42}]})` returns `false`. But `validateWorkbook` does NOT validate individual step contents — only checks version, metadata.name, and that steps is an array. This test will fail.

**Fix:** Either enhance `validateWorkbook` to validate step shapes (preferred), or fix the test expectation.

**5. `validateWorkbook` doesn't validate step contents**

File: `src/workbook/workbook.ts`

The validator accepts any array as `steps`. A workbook with `steps: [42, "garbage", null]` passes validation. For a security-sensitive replay system, step shapes must be validated before execution.

**Action:** Epoch should add per-step validation with switch on `type` field.

**6. `config.ts` is unused dead code**

File: `src/config.ts`

`getConfig()` is never imported. `capture.ts` reads config directly via `vscode.workspace.getConfiguration`. This creates inconsistency — config defaults are defined in two places (package.json + config.ts).

**Action:** Either wire `getConfig()` into capture.ts and player.ts, or delete config.ts.

#### Medium Issues

**7. Missing `.js` extension in security/index.ts**

File: `src/security/index.ts`

Uses `from './sanitizer'` while every other index.ts uses `.js` extensions. Works under CJS (no `"type": "module"` in package.json) but violates project convention.

**8. Windows `getWindowBounds` returns screen area, not window bounds**

File: `src/platform/platform.ts` (line 67-87)

The PowerShell script uses `[System.Windows.Forms.Screen]::FromHandle($h).WorkingArea` which returns the **screen's working area**, not the VS Code window's actual position and size. GIF recordings on Windows will capture the full screen.

**9. `TypeStep.delay` semantics are confusing**

File: `src/replay/player.ts` (line 24)

`delay` is recorded as elapsed-since-start (ms), but the player uses it as per-character delay: `setTimeout(r, step.delay! / speed)`. If delay is 30000 (30s since recording started), each character gets a 30s pause. The decision doc calls this "typing cadence" but the recording logic doesn't produce cadence values.

**10. No `repository` field in package.json**

Required for Marketplace publishing and for `vsce` to link the extension to its source.

**11. Missing test coverage**

No tests exist for:
- `security/sanitizer.ts` — the security layer has zero test coverage
- `replay/player.ts` — the step execution engine
- `screen/capture.ts` — ffmpeg lifecycle
- `config.ts` — config accessor (also unused)

**12. `package.json` missing `keywords`**

Discoverability on Marketplace is poor without keywords like `["gif", "recording", "replay", "screencast", "demo"]`.

#### Low Issues

**13. `activationEvents` are redundant**

Since VS Code 1.74+, `onCommand:*` events are auto-inferred from `contributes.commands`. The explicit list is harmless but unnecessary.

**14. `RecordingSession` type is never used**

File: `src/types/recording.ts` — defined but imported nowhere.

**15. No exhaustive check in player.ts switch**

File: `src/replay/player.ts` — no `default` case. If a new step type is added to the union but not to the switch, it silently does nothing.

**16. `categories` in package.json is just `["Other"]`**

Could use `["Visualization"]` or `["Other", "Snippets"]` for better Marketplace placement.

---

**Status:** Wave 3 security & UX fixes completed by Epoch, Vex, Chronos. All critical and high issues resolved.
