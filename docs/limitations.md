# Limitations

gEcho is built on the VS Code extension API, which provides powerful but bounded access to the editor. This page details what gEcho cannot do and suggests workarounds.

## No Mouse Event Recording

**Problem:** VS Code's extension API does not expose mouse position, click, or scroll events. Echo recording captures keyboard-driven actions only.

**Impact:** Any mouse-driven interaction (clicking buttons, dragging, using menus) is not recorded.

**Workarounds:**
- Manually add `command` steps for actions you would normally click (e.g., `workbench.action.files.save` instead of clicking the save icon).
- Use `key` steps for keyboard shortcuts that replace mouse interactions (e.g., `Ctrl+Shift+P` for the Command Palette).
- Add `scroll` steps to simulate scrolling in the editor.
- Use `select` steps to set cursor/selection positions that you would normally reach by clicking.

## No Webview Content Access

**Problem:** VS Code webview panels (Copilot Chat, Settings UI, extension panels) accept keyboard input via the `type` command when focused, but gEcho cannot read webview content or click specific elements within them.

**Impact:** You can type into a focused webview, but you cannot verify its output or click buttons inside it.

**Workarounds:**
- Use `wait` steps with generous timeouts after operations that depend on webview responses (e.g., waiting for a Copilot Chat reply).
- Use `command` steps to trigger webview actions when commands are available.

## Wayland Not Supported (Linux)

**Problem:** Screen recording on Linux relies on X11 (`x11grab` ffmpeg input) and `xdotool`/`xwininfo` for window detection. Wayland does not support these tools.

**Impact:** GIF recording and Replay-as-GIF will not capture the correct screen region on Wayland-based desktops.

**Workarounds:**
- Use X11 instead of Wayland. On GNOME, select "GNOME on Xorg" at the login screen.
- Set the `GDK_BACKEND=x11` environment variable before launching VS Code to force X11 mode.
- Use Echo recording (workbook-only) on Wayland — this does not require screen capture.

## Window Must Stay Still

**Problem:** Like all region-based screen recorders, gEcho captures a fixed screen region determined at the start of recording. The region is based on the VS Code window position and size.

**Impact:** Moving, resizing, minimizing, or overlapping the VS Code window during recording produces artifacts or captures the wrong content.

**Workarounds:**
- Position and size your VS Code window before starting a recording.
- Use `metadata.windowSize` in your workbook to document the expected dimensions.
- Avoid multi-monitor setups where windows might shift unexpectedly.
- Use the `gecho.gif.width` setting to control the output GIF resolution independently of the window size.

## Single-Window Capture Only

**Problem:** gEcho detects the VS Code window by searching for a process named "Visual Studio Code" (or "Code" on some platforms). If multiple VS Code windows are open, it may capture the wrong one.

**Impact:** The wrong VS Code window may be recorded.

**Workarounds:**
- Close other VS Code windows before recording.
- Use a dedicated VS Code workspace for recording.

## No Terminal Output Recording in Echo Mode

**Problem:** Echo mode records keystrokes and editor events via the VS Code API. Terminal output (command results, build output) is not captured as workbook steps.

**Impact:** Replaying a workbook that includes terminal commands will execute those commands, but the terminal output will vary between environments.

**Workarounds:**
- Use `wait` steps after terminal commands to allow output to render.
- Accept that terminal output will differ between recording and replay environments.

## Platform-Specific Screen Capture

Screen capture uses different ffmpeg backends per platform:

| Platform | Input Method | Window Detection |
|----------|-------------|-----------------|
| macOS | `avfoundation` | AppleScript |
| Linux | `x11grab` | `xdotool` / `xwininfo` |
| Windows | `gdigrab` | PowerShell |

**macOS:** Requires screen recording permission (System Settings → Privacy & Security → Screen Recording). The first recording attempt triggers a system permission prompt.

**Linux:** Requires X11 display server. The `xdotool` and `xwininfo` utilities must be installed (`sudo apt-get install xdotool x11-utils` on Debian/Ubuntu).

**Windows:** Window detection uses PowerShell to query the main window handle of the Code process.

## Recording State Restrictions

gEcho enforces a single active operation at a time. You cannot:

- Start a new recording while one is already running
- Start a replay while recording
- Start a recording while replaying

Cancel the current operation first with **gEcho: Cancel Replay** (for replays) or **gEcho: Stop Echo/GIF Recording** (for recordings).

## Keyboard Shortcut Limitations

The `key` step maps well-known shortcuts to VS Code commands. Unrecognized key combinations are attempted as-is, but may not work in all contexts. The recognized mappings are:

| Key | Action |
|-----|--------|
| `Ctrl+Shift+P` / `Cmd+Shift+P` | Open Command Palette |
| `Ctrl+P` / `Cmd+P` | Quick Open |
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `Tab` | Tab |
| `Enter` | New line |
| `Escape` | Close find widget |

For other shortcuts, consider using a `command` step with the corresponding VS Code command ID instead.
