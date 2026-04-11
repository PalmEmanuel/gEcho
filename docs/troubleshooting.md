# Troubleshooting

Common issues and how to resolve them.

## ffmpeg Not Found

**Symptom:** Error message "ffmpeg not found" or "spawn ffmpeg ENOENT" when starting a GIF recording.

**Cause:** ffmpeg is not installed or not on your system `PATH`.

**Fix:**
1. Verify ffmpeg is installed: run `ffmpeg -version` in a terminal.
2. If installed but not on `PATH`, set the full path in VS Code settings:
   ```json
   { "gecho.ffmpegPath": "/usr/local/bin/ffmpeg" }
   ```
3. If not installed, see the [Getting Started](getting-started.md#ffmpeg) guide for installation instructions.

---

## macOS Screen Recording Permission

**Symptom:** GIF recording produces a blank or black output on macOS.

**Cause:** macOS requires explicit screen recording permission for applications.

**Fix:**
1. Open **System Settings → Privacy & Security → Screen Recording**
2. Enable permission for **Visual Studio Code**
3. Restart VS Code after granting permission

> **Note:** The permission prompt usually appears the first time you attempt a screen recording.

---

## Window Detection Fails

**Symptom:** The GIF captures the wrong screen region, or you see a message about falling back to default bounds.

**Cause:** gEcho could not detect the VS Code window position. This happens when:
- Multiple VS Code windows are open
- Required detection tools are missing
- The window manager does not expose window information

**Fix (Linux):**
- Install `xdotool`:
  ```bash
  sudo apt-get install xdotool
  ```
- Ensure you are running X11, not Wayland

**Fix (macOS):**
- Grant screen recording permission (see above)
- Close other VS Code windows

**Fix (Windows):**
- Ensure PowerShell is available (it is by default on Windows 10+)
- Close other VS Code windows

**Fallback behavior:** If detection fails, gEcho falls back to capturing a 1920×1080 region at screen coordinates (0, 0).

---

## GIF Is Too Large

**Symptom:** Generated GIF files are very large (tens of MB).

**Fix:**
- Reduce the output width:
  ```json
  { "gecho.gif.width": 1280 }
  ```
- Use the `"balanced"` or `"small"` quality preset:
  ```json
  { "gecho.gif.quality": "small" }
  ```
- Lower the frame rate:
  ```json
  { "gecho.gif.fps": 8 }
  ```
- Shorten the recording by reducing `wait` durations and increasing `gecho.replay.speed`.

---

## Replay Does Nothing

**Symptom:** Running "Replay Echo" appears to do nothing, or the command is not found.

**Cause:** The extension may not be activated, or the echo file is invalid.

**Fix:**
1. Ensure gEcho is installed and enabled in VS Code's Extensions view.
2. Open the Command Palette and verify that gEcho commands appear.
3. Check the echo file for JSON syntax errors — VS Code will show red squiggles if the file does not match the schema.
4. Check VS Code's Output panel (View → Output → select "gEcho" from the dropdown) for error messages.

---

## "Cannot Start / Cannot Replay" State Conflict

**Symptom:** Starting a recording or replay shows a warning such as `gEcho: Cannot start recording while replaying` or `gEcho: Cannot replay while recording-gif`.

**Cause:** gEcho allows only one active operation at a time.

**Fix:**
- Stop the current operation:
  - For recordings: run **gEcho: Stop Echo Recording** or **gEcho: Stop GIF Recording**
  - For replays: run **gEcho: Cancel Replay**
- If the state is stuck, reload the VS Code window (`Ctrl+Shift+P` → "Developer: Reload Window").

---

## Echo Validation Errors

**Symptom:** Red squiggles appear in your `.echo.json` file, or replay fails with "Invalid echo format."

**Common causes and fixes:**

| Error | Fix |
|-------|-----|
| Missing `version` field | Add `"version": "1.0"` at the top level |
| Missing `metadata.name` | Add a `name` string to the `metadata` object |
| Unknown step type | Check the `type` field matches one of: `type`, `command`, `key`, `select`, `wait`, `openFile`, `paste`, `scroll` |
| Extra properties | Remove unrecognized fields — the schema uses `additionalProperties: false` |
| Invalid `anchor`/`active` in `select` | Ensure they are arrays of exactly two non-negative integers: `[line, character]` |

See the [Echo Format Reference](echo-reference.md) for the complete schema.

---

## Recording Artifacts (Flickering, Wrong Region)

**Symptom:** The GIF shows flickering, black frames, or captures content outside the VS Code window.

**Cause:** The VS Code window was moved, resized, or overlapped during recording.

**Fix:**
- Position the VS Code window before starting the recording and do not move it.
- Close overlapping windows, notifications, or popup menus.
- Avoid switching virtual desktops during recording.
- On multi-monitor setups, ensure VS Code is fully visible on a single monitor.

---

## Slow Replay

**Symptom:** Echo replay is too slow, especially in CI.

**Fix:**
- Increase the replay speed:
  ```json
  { "gecho.replay.speed": 2.0 }
  ```
- Reduce `wait` step durations in the echo.
- Remove unnecessary `wait` steps.

---

## Linux: "Cannot Open Display"

**Symptom:** Error about missing display or `$DISPLAY` not set, usually in CI or SSH sessions.

**Cause:** No X11 display server is available.

**Fix:**
- Use `xvfb-run` to provide a virtual framebuffer:
  ```bash
  xvfb-run -a code --command gecho.replayAsGif
  ```
- Or start Xvfb manually:
  ```bash
  Xvfb :99 -screen 0 1920x1080x24 &
  export DISPLAY=:99
  ```

---

## Still Stuck?

If none of the above resolve your issue:

1. Check the VS Code Output panel for gEcho-specific error messages.
2. Open VS Code Developer Tools (`Ctrl+Shift+I` / `Cmd+Shift+I`) and check the Console tab for errors.
3. [Open an issue](https://github.com/emanuelpalm/gEcho/issues) with:
   - Your OS and VS Code version
   - The error message or unexpected behavior
   - The echo file (if applicable)
   - Output from `ffmpeg -version`
