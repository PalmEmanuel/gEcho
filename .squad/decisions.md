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

---

---

## Vex — Issue #1 Audit (2026-04-08)

**Date:** 2026-04-08  
**Author:** Vex  
**Context:** Post-audit of Issue #1 (extension scaffold)

### Finding: No bundler in use

Issue #1 listed `esbuild.js` as a deliverable. The project uses `tsc` directly with no bundler.  
There is no existing decision record explicitly approving or rejecting esbuild/bundling.  
At current scale (small extension, no runtime deps), `tsc` is sufficient.

**Recommendation:** Team should formally record whether a bundler is desired for the production VSIX (smaller artifact, faster load). If esbuild is wanted, a decision + `esbuild.js` + updated `package` script would be needed.

### Finding: activationEvents deviation

Gecko's architecture decision mandates per-command activation (`onCommand:gecho.*`).  
Current `package.json` uses `onStartupFinished` — eager activation on every VS Code startup.  
This is harmless for a dev extension but violates the stated constraint.

**Recommendation:** If the team wants to enforce Gecko's constraint, `activationEvents` should be changed back to per-command. Not changed by Vex to avoid unilateral runtime behavior change.

---

## Epoch — GIF Recording Race Condition Fix (2026-04-08)

**Date:** 2026-04-08  
**Author:** Epoch  
**Branch:** feat/status-bar-recorder-player

### Context

When ffmpeg fails immediately after printing its version header (e.g. avfoundation permission denied, wrong device index on macOS), `ScreenCapture.start()` resolves (first stderr data received), but the close handler then fires, nulling `this.ffmpegProcess`. A subsequent `stop()` call sees `proc === null` and returned `this.outputPath` unconditionally — even though ffmpeg never wrote the file. The GIF converter then fails with a cryptic code 254 / "No such file or directory" error on the palette-generation pass.

### Decision

#### 1. `ScreenCapture.stop()` early-return path must verify file existence

When `this.ffmpegProcess` is null at `stop()` time, call `fs/promises.access(this.outputPath)` before returning. If the file does not exist, throw:

```
Recording failed — no output was written to <path>. Check ffmpeg permissions and device availability.
```

#### 2. Accept exit code 254 as a valid SIGINT response

On some macOS/avfoundation combinations, ffmpeg exits with code 254 (`-2` signed = SIGINT signal 2). The accepted success codes in `stop()` are `0`, `254`, and `255`.

#### 3. GIF recording state is `'recording-gif'`

`startGifRecording` sets `currentState = 'recording-gif'` (not `'recording'`). This is required so the status bar renders the correct label and click-command during GIF recording. `stopGifRecording` guards on `currentState !== 'recording-gif'`.

#### 4. Split try/catch in `stopGifRecording`

Two separate try/catch blocks:
- **Block 1** — `capture.stop()` → error message: "Failed to stop GIF recording — …"
- **Block 2** — save dialog + conversion → error message: "GIF conversion failed — …"

### Rationale

- The silent no-file failure is a confusing UX: the user sees a cryptic ffmpeg error about the conversion step, not the actual root cause (ffmpeg never started capturing).
- Separate error messages give users actionable context: one message for "ffmpeg didn't capture anything" vs. "ffmpeg captured but conversion failed".
- Using the correct `'recording-gif'` state is required by the status bar architecture (`src/ui/statusBar.ts`) which maps each `RecordingState` to a distinct label + command.

### Files Changed

- `src/screen/capture.ts` — file-existence check + accept exit code 254
- `src/extension.ts` — correct state + split catch blocks

---

## Chronos — Conventional Commits Enforcement and Auto-Changelog (2026-06-08)

**Date:** 2026-06-08  
**Agent:** Chronos  
**Issue:** PalmEmanuel/gEcho#15  

### Decision

Adopt Conventional Commits enforcement on all PRs and automatic CHANGELOG generation on release.

### Rationale

- Consistent commit messages enable automated tooling (changelog, release notes, semantic versioning)
- `pull_request_target` trigger ensures fork PRs are validated without granting write access
- bARGE uses this exact pattern successfully; adapting it reduces risk

### Implementation

1. **`validate-pr-title.yml`** — Runs `amannn/action-semantic-pull-request@v6` on every PR open/edit/reopen/sync. Enforces types (feat, fix, docs, style, refactor, test, chore, perf, ci, revert, deps) and optional scopes matching gEcho's architecture (recording, replay, capture, workbook, platform, config, security, ci, release). Subject must start with a capital letter and be ≥10 chars.

2. **`release.yml`** — Extended with:
   - `requarks/changelog-action@v1`: generates CHANGELOG from commits between last tag and new tag; excludes internal types (docs, style, refactor, test, ci, chore, revert) and scopes (ci, release)
   - `softprops/action-gh-release@v2`: creates GitHub Release with changelog body + VSIX attachment; marks as pre-release if tag contains `-preview`
   - `peter-evans/create-pull-request@v7`: opens auto-PR to commit the updated CHANGELOG.md back to main

3. **`CHANGELOG.md`** — Reset to standard Keep a Changelog format with `[Unreleased]` section ready for auto-population.

### Trade-offs

- PR authors must follow conventional commits format (slight friction, but enforced at PR level not commit level)
- Release workflow requires `contents: write` and `pull-requests: write` permissions
- No Marketplace publishing secret change needed (existing `VSCE_PAT` not present in current release.yml; can be added separately)

---

## Vex — JSON Schema for .gecho.json files (2026-04-08)

**Date:** 2026-04-08  
**Author:** Vex  
**Issue:** #14  
**PR:** #17  
**Branch:** feat/json-schema

### What was done

Added `schemas/gecho-v1.schema.json` (JSON Schema draft-07) bundled with the extension to power IntelliSense in VS Code when editing `.gecho.json` workbook files. Registered via `contributes.jsonValidation` in `package.json`.

### Key decisions

- **`oneOf` over `if/then/else`** for the step discriminated union — VS Code's IntelliSense resolves `oneOf` cleanly when each branch has a `const` on the `type` property.
- **Schema lives in `schemas/`**, not inside `src/`. It's pure JSON with no build step, ships as-is with the extension. Not added to `.vscodeignore`.
- **`contributes.languages` alias** (`"aliases": ["gEcho Workbook"]`) added so the language picker shows a friendly name instead of "JSON".
- **`gecho.gif.quality` enum** was already correct — no change needed.
- **`workbooks/example.gecho.json`** added as a reference file demonstrating all 8 step types; validates cleanly against the schema.

### What others should know

The schema path in `contributes.jsonValidation` uses a relative `./schemas/gecho-v1.schema.json` URL — this is correct for bundled schemas and is resolved by VS Code relative to the extension install directory.

---

## Gecko — bARGE Test Strategy Research (2025-07-18)

**Date:** 2025-07-18  
**Author:** Gecko (Lead)  
**Status:** Research complete

**Repo:** https://github.com/PalmEmanuel/bARGE

### Key Patterns Found

1. **Private method testing via reflection** — Use `(obj as any).method` to test private methods without exposing internals.

2. **VS Code API monkey-patching** — Direct replacement of VS Code API methods with test stubs, restored in `finally` blocks. No mocking library needed.

3. **Command registration verification** — Integration tests assert all expected commands are present after extension activation.

4. **Playwright-based webview testing** — Separate tier with custom `acquireVsCodeApi` mock for full DOM testing of VS Code webviews.

5. **Realistic test data generators** — Generate test fixtures matching production data distributions.

6. **Separated CI pipeline** — Independent build and test jobs that run in parallel after build succeeds.

7. **`doesNotReject` for graceful degradation** — Assert that commands don't throw even in error conditions.

### Actionable Takeaways for gEcho

| Priority | Action | Effort |
|----------|--------|--------|
| **High** | Add `doesNotReject` tests for all commands with bad inputs | Low |
| **High** | Use reflection pattern to test sanitizer internals | Low |
| **Medium** | Create realistic workbook generators for test fixtures | Low |
| **Medium** | Add integration tests verifying command registration | Low |
| **Medium** | Add VS Code API monkey-patching for testing | Medium |
| **Low** | Separate CI into build → test jobs | Low |
| **Future** | If webviews added, adopt Playwright pattern | High |

---

## Grimoire — bARGE Test Patterns Applicability Assessment (2025-07-18)

**Date:** 2025-07-18  
**Author:** Grimoire (Tester)  
**Status:** Assessment complete

### Critical Gaps in gEcho Test Coverage

| File | What's missing |
|------|----------------|
| `player.test.ts` | `play()` method entirely untested; security logic completely uncovered |
| `extension.test.ts` | Zero command registration tests; zero state machine tests |
| `recording.test.ts` | `EchoRecorder` itself has zero tests |

### High-Value Adoptions

1. **`doesNotReject` for command graceful degradation** — Assert commands don't throw on bad inputs (corrupted workbooks, invalid state transitions, cancelled dialogs).

2. **VS Code API monkey-patching** — Enable testing of `WorkbookPlayer.play()` by mocking `vscode.commands.executeCommand` to verify step dispatch and security checks.

3. **Command registration assertions** — Simple integration test verifying all 6 `gecho.*` commands registered after activation.

### Adapt (needs modification)

4. **Realistic test data generators** — Create `generateWorkbook(stepCount, options?)` factory for stress-testing and edge cases.

5. **Real VS Code documents** — For `.gecho.json` file testing and language detection validation.

### Skip (doesn't apply)

- Private method reflection (gEcho's internals are already public)
- Playwright webview tests (gEcho has no webview yet)
- Separate CI pipeline (current scale doesn't justify multi-job overhead)

### Recommended Next Test Sprint

1. **`extension.test.ts` — command registration** *(~30 min)*
2. **`player.test.ts` — play() security blocking** *(~2 hours)*
3. **`player.test.ts` — play() step dispatch** *(~3 hours)*
4. **`recorder.test.ts` (new file)** *(~2 hours)*
5. **`extension.test.ts` — state machine guards** *(~1.5 hours)*
6. **`doesNotReject` sweep** *(~1 hour)*
7. **`workbook.test.ts` — step field edge cases** *(~30 min)*

---

## Grimoire — Wave 4 Test Coverage Implementation (2025-07-18)

**Date:** 2025-07-18  
**Author:** Grimoire (Tester)  
**Branch:** test/wave4-coverage  
**Status:** Implemented, compiled, PR open

### What Was Implemented

#### Priority 1 — `test/suite/extension.test.ts`
- Added command registration test: all 6 `gecho.*` commands asserted present after activation
- Added state machine guard tests (monkey-patched `showWarningMessage` and `showOpenDialog`):
  - `stopEchoRecording` when idle → does not throw
  - `stopGifRecording` when idle → does not throw
  - `replayWorkbook` with cancelled dialog → does not throw

#### Priority 2 — `test/suite/player.test.ts`
- Removed `describe.skip` from integration tests; replaced with real tests
- Added `vscode` import (all tests run in VS Code Extension Host)
- **Security blocking tests** (2 tests): unsafe command ID, path traversal — both verify `executeCommand` never called
- **Step dispatch tests** (9 tests): type, command, key, wait, paste, scroll, select per bARGE patterns
- **stop() cancellation test**: stop() before play() → all steps skipped

#### Priority 3 — `test/suite/recorder.test.ts` (new file)
- Created from scratch; 6 tests covering EchoRecorder lifecycle:
  - start/stop returns empty array
  - second stop() returns empty array
  - dispose() doesn't throw (twice)
  - lifecycle is repeatable (start/stop cycles)
  - real VS Code integration test: opens scratch doc, types via `type` command, verifies type steps captured

#### Priority 4 — `src/workbook/workbook.ts` scroll direction bug fix
- Fixed `isValidStep` for `scroll` case: now requires `direction === 'up' || direction === 'down'`
- Added two validation tests to `test/suite/workbook.test.ts`:
  - scroll with missing direction → `validateWorkbook` returns false
  - scroll with invalid direction ('sideways') → `validateWorkbook` returns false

#### Priority 5 — `doesNotReject` sweep
- Covered inline in the extension.test.ts state machine section

### Key Patterns

- **`vscode.commands.executeCommand` returns `Thenable`** — wrap with `Promise.resolve()` for `assert.doesNotReject`
- **Monkey-patching pattern** — always use `try/finally` to restore originals
- **Recorder integration test requires Extension Host** — uses real VS Code events, only works in development host

---

## 2026-04-08T10:47:22Z: User directive
**By:** Emanuel Palm (via Copilot)

**What:** Every new feature must have proper tests. Grimoire is always involved when features are built — no feature ships without test coverage.

**Why:** User requirement — quality and maintainability standard for the project.

**Effect on routing:** All feature work spawns Grimoire in parallel. Grimoire's test coverage is a required deliverable, not optional.

---

## 2026-04-09T14:51:50Z: User directive
**By:** Emanuel Palm (via Copilot)

**What:** Squad agents must never consume tokens unless a new task has actually been discovered. The watch loop (`ralph-watch.js`) runs token-free on a schedule. When the Copilot CLI is open and Ralph's monitoring cycle runs, Ralph checks `~/.squad/teams-inbox/` — if the inbox is empty, NO agents are spawned. Only when task files are present does Ralph route work to agents.

**Why:** User request — cost discipline. Polling should be pure infrastructure (no AI). Intelligence (and token spend) is triggered only by real work.

---

## 2026-04-09T15:04:30Z: User directive
**By:** Emanuel Palm (via Copilot)

**What:** Teams inbox (task files) should live in the repo at `.squad/teams-inbox/` (gitignored), not at `~/.squad/teams-inbox/`. Processed files go to `.squad/teams-processed/` (also gitignored).

**Why:** User preference — keeps all squad state in one place (the repo), easier to navigate and debug. Not scattered across home directory.

**Effect:** Update `.gitignore` to exclude `.squad/teams-inbox/` and `.squad/teams-processed/`. Update `teams-monitor.js`, `ralph-watch.js`, `ralph-agent.js` to use repo-local paths.
# Decision: Event-driven ffmpeg startup liveness check

**Date:** 2026-04-08  
**Author:** Epoch  
**Status:** Implemented  

## Context

`ScreenCapture.start()` resolves as soon as ffmpeg writes anything to stderr — which is the version banner, printed before the capture device is opened. On macOS, if Screen Recording permission is denied or the device index is wrong, ffmpeg exits ~200–500ms after `start()` has resolved. The caller (extension command) then sets state to `'recording-gif'` against a process that is already dead.

The symptom: the user sees "GIF recording started" but gets a confusing error ("no output was written") only when they try to stop.

## Decision

Add `waitForReady(timeoutMs = 800): Promise<void>` to `ScreenCapture`:

- Attach a `once('close')` listener on `this.ffmpegProcess`.
- If the process exits within the window → reject immediately with the last 500 chars of `startupStderr`.
- If the `timeoutMs` deadline fires and the process is still alive → remove the listener and resolve.

The timer is purely a deadline, not a polling sleep. This keeps the check event-driven.

## Consequences

- `setState('recording-gif')` and the "GIF recording started" notification must be called **after** `waitForReady()` resolves, not before `start()`.
- `startupStderr` must be an instance variable (populated in the `stderr.on('data')` handler) so `waitForReady` and the `close` handler can both read it.
- Apply to both `startGifRecording` and `startReplayGifRecording` (same device, same failure mode).
- On macOS, check `/permission|AVFoundation/i` in the rejection message and append a System Settings hint to the user-facing error.

## Alternatives Rejected

- **`setImmediate` check only**: Too fast — ffmpeg hasn't had time to fail yet. Only catches processes that are already dead before the microtask queue drains.
- **Fixed `setTimeout(500)` poll**: Sleep-based; fragile on slow machines. The event-driven `once('close')` + timeout deadline is strictly better.
- **Retry on stop()**: Detecting failure at stop-time (the old behavior) gives the user no actionable information at the right moment.


---

## 2026-04-09: Chronos — Teams Security Hygiene Decision

**Date:** 2026-04-09  
**Author:** Chronos (DevOps/CI)  
**Status:** Implemented and committed

Fixed two critical security/hygiene issues:

1. **PII committed to git** — Teams runtime state (messages, sender names, message IDs) now gitignored and removed from index
2. **Weak auth file permissions** — Auth files now hardened to chmod 600 after write

### Decision: Gitignore Teams Runtime State (CRITICAL)

**Problem:** `.squad/teams-last-read.json`, `.squad/teams-inbox/`, `.squad/teams-processed/` were tracked in git and contained real Teams message content, sender display names, and message IDs — user PII and operational state.

**Solution:** 
- Added to `.gitignore`: Teams runtime dirs
- Removed from git index: `git rm --cached` without deleting from disk (files needed at runtime)

### Decision: Hardened Auth File Permissions (CRITICAL)

**Problem:** `~/.squad/teams-auth.json` and `~/.squad/teams-config.json` were created with `644` permissions (world-readable).

**Solutions:**
- Added `fs.chmodSync(AUTH_PATH, 0o600)` in `teams-graph-client.js` after token cache write
- Created `teams-setup.js` interactive setup script that applies `chmod 600` to both files on creation

---

## 2026-04-09: Epoch — Decision Record — Teams Script Fixes

**Author:** Epoch  
**Date:** 2026-04-09  
**Status:** Applied

### Decisions Made

**Lockfile location:** `.squad/teams-inbox/.ralph-agent.lock` — co-located with inbox so directory exists when ralph-agent starts. PID written as plain text; cleaned on `process.on('exit')`.

**poll() parameter strategy:** `poll({ autoReply: autoReplyArg = false } = {})` with `effectiveAutoReply = autoReplyArg || autoReply` — module-level `autoReply` preserved for CLI invocation; parameter takes precedence when set by teams-watch.

**isBotSender fallback:** One-time warn via module-level `_botHeuristicWarnShown` flag rather than warning on every message. Prevents log spam.

**sanitizePromptInput placement:** Applied to `taskContent` before building `fullPrompt` in `processTask()`. System context (charter, persona) is trusted internal content — only inbound Teams message text is sanitized.

**Error code propagation:** Wrapped SDK errors copy `.code` from original error so network-retry block works as intended.

---

## 2026-04-09: Gecko — Decision: poll() must accept an explicit autoReply parameter

**Context:** `teams-watch.js` mutated `process.argv` before requiring `teams-monitor` to inject `--reply` because `autoReply` is evaluated at module load time. This breaks module encapsulation.

**Decision:** `poll()` must accept `{ autoReply: boolean }` parameter (defaulting to `false`). Module-level `autoReply` is only used for CLI mode. `teams-watch.js` calls `poll({ autoReply: true })` directly and removes the `process.argv.push('--reply')` hack.

---

## 2026-04-09: Gecko — Decision: ackMessageId must be hoisted out of the try block

**Context:** `const ackMessageId` declared inside try block in `ralph-agent.js::processTask`, but catch block references it — variable out of scope, condition always falsy, edit path is dead.

**Decision:** Declare `let ackMessageId = null` before try block so catch handler can correctly branch on whether an ack was posted.

---

## 2026-04-09: Gecko — Decision: Remove askCopilot() / buildSystemMessage() dead code

**Context:** `askCopilot()` and `buildSystemMessage()` are defined but never called. `askCopilot()` calls undefined `getSquadSDK()` — latent `ReferenceError`.

**Decision:** Delete `askCopilot()`, `buildSystemMessage()`, and `getSquadSDK()` reference. If a helper is needed, inline it in `processTask()` or extract a named `buildPrompt()` function.

---

## 2026-04-09: Gecko — Decision: Add a concurrency guard for ralph-agent.js

**Context:** `teams-watch.js` spawns new `ralph-agent.js` process on every poll cycle with no check if previous run has completed. Two processes can race on `readdirSync` + `renameSync`.

**Decision:** Write `.ralph-agent.lock` file before spawning. `teams-watch.js` checks for lock before spawning; if locked, skip and log that previous run is still in progress.

---

## 2026-04-09: Gecko — Decision: isBotSender must use a configured identity list

**Context:** `isBotSender()` uses `displayName.includes('squad')`, `includes('bot')`, `includes('gecho')` — fragile, real users with those substrings would be silently dropped.

**Decision:** `teams-config.json` must include `botDisplayNames: string[]` field. `isBotSender()` does exact match against list. Fallback to substring matching only if field absent (with warning).

---

## 2026-04-09: Grimoire — Decision Proposal: Teams Monitor Pipeline — Testability Improvements

**From:** Grimoire (Tester)  
**Date:** 2026-04-09  
**Trigger:** Testability review of Teams monitor pipeline

### Problem

Teams monitor pipeline contains ~15 pure helper functions that are deterministic but not exported — impossible to unit test without module introspection hacks.

### Proposed Decisions

**1. Export pure helpers for testing:**
Each module should add conditional test-export block:
```js
if (process.env.NODE_ENV === 'test') {
  Object.assign(module.exports, { slugify, stripHtml, textToHtml, ... });
}
```

**2. Add test runner to `.squad/scripts/`:**
Add `mocha` as devDependency with `.mocharc.json` pointing at `test/` subdirectory.

**3. Wrap `https.request` in adapter:**
Extract `graphRequest` into injectable dependency or export for mocking.

**4. Extract `invokeCopilot` as injectable:**
`processTask` accepts optional `copilotFn` parameter (defaults to `invokeCopilot`). Tests pass a stub.

### Impact

- No breaking changes to runtime
- Unlocks entire pure-function test tier
- Enables full error-path coverage for `graphRequest` and `poll()`

---

## 2026-04-09: Warden — Teams Pipeline Security Review Decision

**Date:** 2026-04-09  
**Author:** Warden (Security/Auth)  
**Status:** Decisions pending action → Most applied; testability pending Grimoire

### Decision 1 — CRITICAL: gitignore the Teams runtime state directories

**Finding:** Teams runtime dirs tracked by git, already contain committed files with real Teams message content.

**Decision:** Add to `.gitignore` and remove from git index (applied ✓).

### Decision 2 — Fix file permissions on ~/.squad auth files

**Finding:** Auth files world-readable (`644`).

**Decision:** Set permissions to `600`; add chmod call in setup script (applied ✓).

### Decision 3 — Prompt injection mitigation for Teams→Copilot pipeline

**Finding:** Raw Teams message text interpolated into Copilot prompt with no sanitization.

**Decision:** Sanitize `taskContent` before building prompt: hard length cap (2000 chars), strip patterns (`SYSTEM:`, `[SYSTEM]`, `You are`, etc.) (applied ✓).

### Decision 4 — Clean up dead/broken `getSquadSDK` reference

**Finding:** `getSquadSDK()` called in dead code, never defined.

**Decision:** Remove `askCopilot()` or fix reference (applied ✓ — removed dead code).

