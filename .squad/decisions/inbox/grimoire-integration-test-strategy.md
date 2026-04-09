# Integration Test Strategy — gEcho

**Author:** Grimoire (Tester)  
**Date:** 2026-04-08  
**Status:** Active

---

## Context

gEcho had unit tests (VS Code extension host via `@vscode/test-electron`, and pure Mocha for
functions that don't need VS Code) but no integration tests. There was no verification that:

- ffmpeg could be spawned, survive a SIGINT, and produce an output file
- `EchoRecorder` could record real VS Code editor events and produce a valid `.gecho.json` on disk
- `WorkbookPlayer` could actually mutate document state in a real editor (unit tests only verified
  `executeCommand` was called, not that content changed)

---

## Decision

### Where integration tests live

All integration tests reside in `test/integration/`.  
They run in the VS Code extension host (via a new `test/runIntegrationTest.ts` entry point)
because all three components — `ScreenCapture`, `EchoRecorder`, and `WorkbookPlayer` — depend
on `vscode` APIs or on `getConfig()` which reads VS Code workspace configuration.

A separate Mocha config for pure-Node.js integration tests is not needed yet; everything runs
in the extension host. If a future component has no VS Code dependency, add it to a
`test/integration/.mocharc.json` using `out/test/integration/*.test.js` as the glob.

### Suite index

`test/integration/suite/index.ts` is a minimal Mocha runner that globs `*.test.js` from the
`out/test/integration/` directory (one level above its own compiled location). Timeout is set
to 20 000 ms to accommodate the VS Code launch overhead.

### npm scripts

| Script | What it does |
|---|---|
| `npm test` | Existing unit tests — fast, no ffmpeg required |
| `npm run test:integration` | Integration tests in VS Code extension host |

`pretest:integration` runs `compile` so the suite always runs against fresh output.

---

## What is mocked vs. what runs real

| Component | Integration test approach |
|---|---|
| **ScreenCapture** | Fake ffmpeg binary (shell script on Unix, `.bat` on Windows). Verifies spawn/SIGINT/stop lifecycle without TCC or real screen capture. |
| **GifConverter** | Real ffmpeg (skips with `this.skip()` if not in PATH). Uses `ffmpeg -f lavfi` to generate a synthetic test video — no screen capture, no TCC required. |
| **EchoRecorder** | Real VS Code editor opened in the extension host. `type` command triggers real `onDidChangeTextDocument` events. |
| **WorkbookPlayer** | Real VS Code editor. Asserts document `.getText()` content after playback — not just that `executeCommand` was called. |

**Principle:** thin mocks only. The fake ffmpeg is the thinnest possible stand-in — a
platform-native script that delegates to a Node.js implementation file for portability.

---

## Fake ffmpeg design

Two variants, each a thin shell/batch wrapper that `exec`s a Node.js script:

| Variant | Behaviour | Used by |
|---|---|---|
| `fake-ffmpeg.sh` / `.bat` | Writes stderr + MP4 header to output path → exits 0 immediately | `start()` resolve + natural-exit `stop()` path |
| `fake-ffmpeg-sigint.sh` / `.bat` | Writes stderr, then waits for SIGINT/SIGTERM → writes file → exits 0 | SIGINT `stop()` path (Unix only) |

The shell scripts use `exec node ...` so the Node.js process inherits the shell's PID.
`ScreenCapture.stop()` calls `proc.kill('SIGINT')` on the PID — with `exec` the signal reaches
Node.js directly instead of being sent to a shell that ignores it.

---

## Per-platform CI plan

CI uses a 3-platform matrix: `ubuntu-latest`, `macos-latest`, `windows-latest`.

### ffmpeg installation (already in ci.yml)

| Platform | Step |
|---|---|
| Linux | `sudo apt-get install -y ffmpeg` |
| macOS / Windows | `AnimMouse/setup-ffmpeg@v1` action |

### xvfb on Linux

Both `npm test` and `npm run test:integration` are wrapped with `xvfb-run -a` on Linux so the
VS Code extension host has a virtual display available.

### macOS TCC constraint

`ScreenCapture` with real `avfoundation` capture **cannot run on macOS CI** — the runner
has no Screen Recording TCC permission and it cannot be granted headlessly.

**Mitigation:** the fake-ffmpeg tests run fine on macOS (no TCC needed). The `GifConverter`
lavfi test is skip-if-no-ffmpeg — it will run on macOS CI once ffmpeg is installed. The only
thing that genuinely cannot run on macOS CI is a real end-to-end screen capture, which is
intentionally untested in CI and verified manually during development.

### Windows

The SIGINT lifecycle test calls `this.skip()` on Windows. Windows SIGINT propagation via
`proc.kill('SIGINT')` is unreliable in batch-script subprocesses. The fake-ffmpeg-sigint
variant is still provided for local Windows testing (it works when Node.js is the direct
target process).

---

## Wave 2 Update — 2026-04-09

**Author:** Grimoire  
**Status:** Addendum to above

### New test location: `test/suite/integration/`

Wave 2 adds a second integration layer in `test/suite/integration/` — colocated with the
existing VS Code extension host tests in `test/suite/`. Rationale:

1. **Mocha-only tests** (`gifConverter`, `screenCapture`) live here and are picked up by
   `.mocharc.json`. They run without VS Code, making them fast and suitable for local dev.
2. **Extension host tests** (`workbookRoundtrip`, `playerFidelity`) also live here. The
   updated `test/suite/index.ts` glob (`**/*.test.js`) includes the `integration/`
   subdirectory automatically.

### vscode stub strategy: `Module.prototype.require`

`GifConverter` and `ScreenCapture` both call `getConfig()`, which requires `vscode`. In plain
Mocha (no extension host) this would throw. The `vscodeMock.ts` helper patches
`Module.prototype.require` at load time so `require('vscode')` returns a configurable stub:

- `Module.prototype.require` is writable in Node 18+ (unlike `Module._resolveFilename`
  which became a getter-only property).
- `mockConfigValues` is an exported mutable object; tests set `mockConfigValues['ffmpegPath']`
  etc. per test case and call `clearMockConfig()` in `afterEach`.
- The mock must be the **first import** in any test file that transitively loads vscode.

### Fake ffmpeg without fixtures: `/usr/bin/false`

For the `ScreenCapture.start()` rejection test, the stub is `/usr/bin/false` (always present on
Unix). It accepts any arguments and exits with code 1 immediately — no shell scripts, no
executable bits to set, no platform wrappers needed. The test is skipped if `/usr/bin/false`
is absent (i.e., non-Unix).

### `stop()` defensive guard

The test spec required `stop()` to reject with `'no output was written'` when called without
a prior `start()`. The current implementation silently returned `''`. The guard was added to
`src/screen/capture.ts` as a one-line defensive improvement. This does NOT break any existing
call sites: a legitimate `stop()` after `start()` always has a non-empty `outputPath`.

### Files added (Wave 2)

```
test/suite/integration/
  vscodeMock.ts
  gifConverter.integration.test.ts        ← plain Mocha
  screenCapture.integration.test.ts       ← plain Mocha
  workbookRoundtrip.integration.test.ts   ← VS Code Extension Host
  playerFidelity.integration.test.ts      ← VS Code Extension Host
```

`.mocharc.json` — spec as array, ignore list extended, timeout 30 s.  
`test/suite/index.ts` — glob fixed to `**/*.test.js`.  
`src/screen/capture.ts` — `stop()` no-output guard.

