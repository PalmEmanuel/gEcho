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

### 2026-04-09 — Wave 2 Integration Tests (Mocha + Extension Host, test/suite/integration/)

- **`Module.prototype.require` works; `Module._resolveFilename` does not** — In Node 18+, `_resolveFilename` is a getter-only property on the `module` object and cannot be overwritten. `Module.prototype.require` IS writable and is the correct hook for intercepting `require('vscode')` in plain Mocha tests. Patch it in a side-effect-only import that must be the first `import` in the file.
- **`/usr/bin/false` is the thinnest fake ffmpeg** — For testing `ScreenCapture.start()` rejection, `/usr/bin/false` is universally available on Unix, accepts any arguments, and exits immediately with code 1. No shell scripts or executable fixture files needed.
- **`getConfig()` is called at call-site, not module-load time** — `GifConverter.convert()` and `ScreenCapture.start()` call `getConfig()` internally on every invocation. The vscode stub's `getConfiguration().get()` can therefore read from a mutable `mockConfigValues` object set by each test without any module reload.
- **`stop()` silent empty-string return was a design gap** — When `stop()` was called without a prior `start()` (i.e. `ffmpegProcess === null` AND `outputPath === ''`), the original code silently returned `''`. A one-line guard (`throw new Error('no output was written')`) was added to make the error explicit. No existing call sites were broken.
- **VS Code integration tests auto-load from `integration/` subdirectory** — `test/suite/index.ts`'s glob pattern `**/*.test.js` already matches files in any subdirectory. The only required change was renaming the pattern from `**/**.test.js` to the more idiomatic `**/*.test.js`; both work with the `glob` package but the latter is clearer.
- **`applyEdit` insert fires one `onDidChangeTextDocument` event** — A `WorkspaceEdit` that inserts text at a position fires a single content-change with `rangeLength === 0` and the full inserted string as `text`. `EchoRecorder` captures it as one `TypeStep`. This is important for round-trip tests: the recorder captures the whole string, not individual characters.



- **Integration tests split across two runners** — Extension-host integration tests (via `npm test`) run under VS Code's test electron and have access to the real `vscode` API. Plain Mocha integration tests (`test/suite/integration/*.integration.test.ts`, run via `npm run test:integration`) use `vscodeMock` to stub the `vscode` module and execute in a plain Node.js process. The extension-host glob (`**/*.test.js`) explicitly excludes `*.integration.test.js` to prevent cross-contamination. Both runners require ffmpeg to be in PATH; CI installs it via `setup-ffmpeg` / `apt-get`.
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

### 2026-04-10 — GIF Retina / macOS permission tests

- **Extract pure functions to make them unit-testable** — The `buildCropFilter` formula was inlined inside `_doStart()` with ffmpeg spawn side-effects all around it. Extracting it to `src/screen/cropFilter.ts` as a pure function cost ~20 lines and made 19 focused unit tests possible with zero mocking. When new logic is mixed into side-effectful code, always extract before testing.
- **Integration test file extension matters for test runner selection** — Files ending in `.integration.test.ts` are excluded from the plain Mocha unit test run. `captureScale.test.ts` (pure unit, no ffmpeg) MUST NOT use that extension to run automatically. Verify the `.mocharc.json` ignore list any time a new test file is created.
- **`checkScreenRecordingPermissionNative` non-darwin fast-return** — The platform guard (`process.platform !== 'darwin'`) returns `true` synchronously via `Promise.resolve(true)`. Tests for this behaviour must use `this.skip()` on darwin, not an `if` conditional without skip, to avoid false positives.
- **Pre-existing `vscode.WorkspaceEdit is not a constructor` failure** — The `workbookRoundtrip.integration.test.ts` suite fails because the vscodeMock does not implement `WorkspaceEdit`. This is a pre-existing gap unrelated to the capture/permission work. Noted here to avoid future confusion.
- **`it.skip()` for manually-triggered TCC tests** — The "permission denied" path for Screen Recording cannot be tested in CI without revoking TCC access. Use `it.skip()` with a `// TODO` comment explaining the manual steps. Do not leave these as unskipped pending tests — they show as green (pending) and provide false confidence.

### 2026-04-10 — Linux E2E full GIF pipeline integration test

- **`GifConverter.convert()` deletes the source mp4 after conversion** — `Promise.allSettled([unlink(palettePath), unlink(mp4Path)])` is called at the end of `convert()`. Any test that asserts `mp4Stat.size > 0` must do so **before** calling `converter.convert()`, not after. This is a permanent API contract; do not assert mp4 existence post-conversion.
- **Linux E2E tests use real ffmpeg x11grab** — The full GIF pipeline E2E suite (Suite 7 in `screenCapture.integration.test.ts`) skips on non-Linux, when `DISPLAY` is unset, or when `ffmpeg` is not in `PATH`. It uses `execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })` as the availability guard. macOS is intentionally excluded because `avfoundation` requires Screen Recording TCC permission which is unavailable in headless CI environments.
- **`GifConverter` in plain Mocha tests requires `mockConfigValues['ffmpegPath']`** — `GifConverter.convert()` calls `getConfig()` which reads `cfg.ffmpegPath` via the vscode workspace stub. In plain Mocha integration tests, always set `mockConfigValues['ffmpegPath'] = 'ffmpeg'` (or a specific path) before calling `converter.convert()` or the sanitizer will reject an empty/undefined path.
- **`ScreenCapture` x11grab uses parsed `$DISPLAY` value** — The x11grab `-i` argument extracts the display number from `process.env['DISPLAY']` using `.replace(/^[^:]*:/, '').split('.')[0] ?? '0'`, handling formats like `:0`, `:0.0`, `localhost:10.0`, and `10.0.0.1:1.0`. The regex strips the optional host prefix and screen suffix, leaving only the numeric display part. CI with `xvfb-run -a` must ensure the Xvfb server is reachable at the parsed display number.

### 2026-04-10 — PR #67 Test Review (macOS display index + permission handling)

- **`buildCropFilter` negative coordinates for multi-monitor** — Multi-monitor setups where a secondary display is positioned to the left or above the primary can produce negative x/y window bounds. The `buildCropFilter` function correctly scales negative coordinates (e.g., `x=-500, scale=2.0 → px=-1000`). Tests added to `captureScale.test.ts` verify this edge case.
- **`getWindowInfo()` caching is transparent** — The module-level cache (`cachedWindowInfo`) is reused across multiple calls within a session, avoiding redundant binary invocations. `clearWindowInfoCache()` invalidates the cache, triggering a fresh fetch on the next call. Tests verify that multiple calls return stable values and that clearing the cache doesn't break subsequent calls.
- **`stop()` startErr surfacing is platform-specific** — When `stop()` is called while `start()` is still in-flight (e.g., awaiting device enumeration) and `start()` fails, `stop()` waits for the `_startPromise` to settle and surfaces the original error. This path is difficult to test reliably on macOS due to the AVFoundation device enumeration flow, so the test is platform-guarded (skipped on darwin). The logic itself is covered by the "ffmpeg exits code 1" test (Suite 1), which validates that early failures are correctly reported.
- **`$DISPLAY` regex edge cases are unit-testable** — The regex that parses `$DISPLAY` (used in Linux x11grab) handles edge cases like `:0`, `:0.0`, `localhost:10.0`, `10.0.0.1:1.0`, `unix:10`, and empty string (defaulting to `:0`). Added explicit unit tests in `screenCapture.integration.test.ts` (Suite 6A) that run only on Linux, verifying the regex logic in isolation without spawning ffmpeg.

