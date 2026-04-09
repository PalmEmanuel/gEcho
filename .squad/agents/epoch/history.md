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

- **TypeStep.delay semantics**: The recorded `delay` field stores elapsed ms since `startTime` (a timestamp), not a per-character typing interval. During replay, `step.delay` is treated as the per-char delay between keystrokes. These are different semantics — manually authored workbooks use `delay` as typing cadence (e.g. 55 ms/char), while recorder-generated workbooks use it as a recording timestamp.
- **ffmpeg SIGINT vs SIGKILL**: ffmpeg must receive SIGINT (not SIGKILL) to flush its output buffers and finalize the file. On some platforms, ffmpeg exits with code 255 when killed by SIGINT — treat both 0 and 255 as success in `stop()`.
- **ffmpeg startup detection**: ffmpeg writes to stderr immediately when it begins encoding. Resolving the `start()` promise on first stderr data (rather than a fixed timeout) is a reliable event-driven signal that the capture has actually started.
- **Node16 module resolution**: All imports of local `.ts` files require the `.js` extension in import paths (compiled output uses `.js`). This is enforced by `moduleResolution: Node16` in tsconfig.
- **CommandStep.args is `unknown`**: The type is `unknown`, not `unknown[]`. During replay, the args must be narrowed: spread if array, pass as single arg otherwise.
- **Teams inbound integration (2026-04-08):** `@azure/msal-node` device code flow is the correct auth pattern for interactive CLI setup scripts (no redirect URI needed). MSAL token cache must be serialized after every acquisition (`pca.getTokenCache().serialize()`) and deserialized on startup to enable silent refresh. Graph API `GET /me/chats?$filter=chatType eq 'group'` requires `Chat.Read` delegated scope. The monitor uses a `lastReadAt` ISO timestamp cursor in `~/.squad/teams-last-read.json` for deduplication — messages with `createdDateTime <= lastReadAt` are skipped. HTML message bodies must be stripped before trigger-word matching. Exit code contract: `AUTH_REQUIRED` on stderr + exit 1 signals Ralph to notify the user; exit 0 always for network/transient errors to avoid crashing Ralph's loop.

