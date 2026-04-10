# Native Helpers for Window Detection — Epoch (2026-06-10)

**Context:** `platform.ts` used `osascript` (triggers Automation permission dialog on macOS) and `python3 + ctypes` (python3 not guaranteed without Xcode CLI tools) for `getWindowBounds()` and `getWindowDisplayIndex()`.

**Decision:** Ship pre-compiled platform-native helper binaries inside the extension under `resources/bin/{platform}/`. They run as child processes (not native Node addons), output JSON to stdout, and require **no additional permissions**.

**macOS:** `resources/bin/darwin/gecho-helper` — Swift binary compiled as a universal binary (arm64 + x86_64). Uses `CGWindowListCopyWindowInfo` (no Screen Recording needed for bounds) and `CGDisplayBounds` to find the VS Code window by `kCGWindowOwnerName == "Code"`. No Apple Events, no `osascript`, no Automation permission dialog.

**Linux:** `resources/bin/linux/gecho-helper.js` — Node.js script using `xprop`, `xwininfo`, `xrandr` (standard X11 tools).

**Windows:** `resources/bin/win32/gecho-helper.js` — Node.js script using PowerShell inline to call `GetForegroundWindow` + `GetWindowRect` via P/Invoke and `System.Windows.Forms.Screen` for display index.

**API changes in `platform.ts`:**
- `getWindowBounds()` and `getWindowDisplayIndex()` now both delegate to a single `getWindowInfo()` that calls the platform helper once.
- Module-level cache (`cachedWindowInfo`) means one binary invocation per recording session.
- New export: `clearWindowInfoCache()` — called at the start of `ScreenCapture.start()` so each new recording re-queries (handles monitor moves between recordings).

**Source for Swift:** `resources/native/darwin/main.swift` (committed alongside binary).

**`.vscodeignore`:** `!resources/bin/**` already present — binaries will be packaged in the extension.

**Constraints:**
1. Never spawn `osascript` for window detection.
2. Never use `python3` for platform detection.
3. Call `clearWindowInfoCache()` at the top of `ScreenCapture.start()` before any awaits.
4. The binary at `resources/bin/darwin/gecho-helper` must be kept in sync with `resources/native/darwin/main.swift`.
