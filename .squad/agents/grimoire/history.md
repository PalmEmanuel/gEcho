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

### 2026-04-08 — Integration Test Strategy

- **All integration tests run in VS Code extension host** — `ScreenCapture`, `EchoRecorder`, and `WorkbookPlayer` all depend on VS Code APIs or `getConfig()` (which reads `vscode.workspace.getConfiguration`). Pure Node.js Mocha can't test them. Separate runner: `test/runIntegrationTest.ts` → `test/integration/suite/index.ts`.
- **Fake ffmpeg via shell `exec node`** — shell scripts use `exec node script.js "$@"` so the Node.js process inherits the shell PID. `ScreenCapture.stop()` sends SIGINT to that PID; without `exec` the signal hits the shell (which may ignore it) instead of Node.js.
- **`ScreenCapture` has no `isRunning()` public method** — the `ffmpegProcess` field is private. Tests cannot inspect running state; they verify behaviour only through `start()`/`stop()` return values and file existence.
- **macOS TCC blocks real `avfoundation` capture in CI** — fake-ffmpeg tests work on all platforms (no TCC needed). Real `GifConverter` tests use `ffmpeg -f lavfi` (synthetic source, no capture) and skip via `this.skip()` if ffmpeg is absent.
- **SIGINT skip on Windows** — `proc.kill('SIGINT')` targeting a `.bat` wrapper is unreliable on Windows. The SIGINT integration test is skipped on `process.platform === 'win32'`.
- **`vscode.ConfigurationTarget.Global` is safe in `@vscode/test-electron`** — the test runner launches VS Code in a temporary profile directory; global config changes do not affect the developer's real VS Code settings. Always restore in `afterEach`.

### 2026-04-08 — Wave 1 Test Scaffolding

- **Import paths need `.js` extensions** — Node16 module resolution requires explicit `.js` extensions in all imports, even when importing `.ts` source files. TypeScript resolves them correctly at compile time.
- **Mocha UI must be consistent** — The `test/suite/index.ts` programmatic Mocha runner and `.mocharc.json` must agree on `ui: 'bdd'`. Mixing `suite`/`test` (TDD) with `describe`/`it` (BDD) in the same run causes "not defined" errors.
- **`validateWorkbook` / `readWorkbook` / `writeWorkbook` are stubs** — All three functions currently throw `'Not implemented'`. Tests are written TDD-style; they will fail until Epoch implements the functions. This is intentional and expected.
- **Pure-function tests don't need the VS Code extension host** — `platform.test.ts` and `recording.test.ts` import only from `src/types/` and `src/platform/`, so they can run under plain Mocha (via `.mocharc.json`) without `@vscode/test-electron`. VS Code API tests (e.g. `extension.test.ts`) still require the electron runner.
- **`os.tmpdir()` on macOS returns `/var/folders/…`** — Not `/tmp`. Safe to use for roundtrip test fixtures; cleanup via `fs.rm(dir, { recursive: true, force: true })` in `afterEach`.
