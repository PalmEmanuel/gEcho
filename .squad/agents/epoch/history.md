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

- **Issue #2 audit (2026-04-08):** Fully implemented prior to audit. All 8 step types live in `src/types/workbook.ts`. `validateWorkbook()` in `src/workbook/workbook.ts` (via `isValidStep()`) rejects unknown step types and steps missing required fields — satisfies the validator completeness note. JSON Schema covers all 8 types; example workbook and `contributes.jsonValidation` are in place. Build clean. Issue closed.

- **TypeStep.delay semantics**: The recorded `delay` field stores elapsed ms since `startTime` (a timestamp), not a per-character typing interval. During replay, `step.delay` is treated as the per-char delay between keystrokes. These are different semantics — manually authored workbooks use `delay` as typing cadence (e.g. 55 ms/char), while recorder-generated workbooks use it as a recording timestamp.
- **ffmpeg SIGINT vs SIGKILL**: ffmpeg must receive SIGINT (not SIGKILL) to flush its output buffers and finalize the file. On some platforms, ffmpeg exits with code 255 when killed by SIGINT — treat both 0 and 255 as success in `stop()`.
- **ffmpeg startup detection**: ffmpeg writes to stderr immediately when it begins encoding. Resolving the `start()` promise on first stderr data (rather than a fixed timeout) is a reliable event-driven signal that the capture has actually started.
- **Node16 module resolution**: All imports of local `.ts` files require the `.js` extension in import paths (compiled output uses `.js`). This is enforced by `moduleResolution: Node16` in tsconfig.
- **CommandStep.args is `unknown`**: The type is `unknown`, not `unknown[]`. During replay, the args must be narrowed: spread if array, pass as single arg otherwise.

- **ffmpeg early-exit race condition (2026-04-08)**: When ffmpeg fails immediately after printing its version header (e.g. avfoundation permission denied, wrong device index), the `start()` promise resolves (first stderr data received) but then the close handler fires, setting `this.ffmpegProcess = null`. When `stop()` is later called and sees `proc` is null, it must verify the output file actually exists before returning — otherwise the GIF converter gets a silent non-existent file path and fails with a cryptic "No such file or directory" error.
- **ffmpeg exit code 254 on macOS**: On some macOS/avfoundation combinations, ffmpeg exits with code 254 (= -2 in signed 8-bit = SIGINT signal 2) when stopped via SIGINT. Accept 0, 254, and 255 as success codes in `stop()`.
- **GIF recording state must be 'recording-gif'**: `startGifRecording` must set `currentState = 'recording-gif'`, not `'recording'`. The status bar uses the state to render context-appropriate UI (label + click command). Using the wrong state breaks status bar interactivity during GIF recording.
- **Split stop/convert error handling**: `stopGifRecording` should use two separate try/catch blocks — one for `capture.stop()` (reports "Failed to stop GIF recording") and one for the save dialog + conversion (reports "GIF conversion failed"). A single catch merges two distinct failure modes into one unhelpful message.

### Team Updates (2026-04-08)

- **Extension ID normalized**: Coordinator updated all references to `PalmEmanuel.gEcho` (package.json, README, tests).
- **Player.test.ts clipboard mock fixed**: Coordinator implemented read-only getter workaround for Jest/vitest compatibility.
- **Decisions inbox merged**: All 8 pending decision files merged into decisions.md, inbox cleaned. See vex-issue1-audit, chronos-conventional-commits, vex-json-schema for relevant adjacent decisions.
- **waitForReady pattern (2026-04-08)**: `start()` resolves on first stderr line (ffmpeg version banner), which fires BEFORE avfoundation attempts to open the device. Permission denials and missing devices cause ffmpeg to exit ~200–500ms later — after `start()` has already resolved. The fix is `waitForReady(800ms)`: attach a `once('close')` listener on `this.ffmpegProcess`; if the process exits within the window, reject immediately with the stderr tail; if the timer fires and the process is still alive, remove the listener and resolve. This is purely event-driven — the timer is only a deadline, not a sleep. `setState('recording-gif')` must be moved to AFTER `waitForReady()` succeeds, so the status bar never enters recording state for a phantom capture.
- **Platform-aware error hints**: On macOS, permission errors from avfoundation show up as "AVFoundation" in stderr. After a `waitForReady` rejection, check `process.platform === 'darwin'` + `/permission|AVFoundation/i.test(msg)` and append a specific System Settings path to the error message. This applies to both `startGifRecording` and `startReplayGifRecording`.
