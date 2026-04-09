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

- **Teams Graph API chat reply (2026-04-08):** Extracted shared MSAL/Graph logic into `teams-graph-client.js` (exports `acquireToken`, `getNewMessages`, `sendChatMessage`). Added `teams-reply.js` for posting task results directly to the group chat via `POST /chats/{chatId}/messages`. Scope upgraded from `Chat.Read` to `Chat.ReadWrite` — same delegated token, no new consent flow needed. Plain text is HTML-escaped and `\n` → `<br/>` before sending; Teams renders it cleanly. `teams-monitor.js` now imports from the shared client — all MSAL/auth code removed from monitor. Ralph's charter updated to route task replies through `teams-reply.js` instead of the outbound webhook.

- **Ralph agent automation (2026-04-09):** Built `ralph-agent.js` to process tasks from `~/.squad/teams-inbox/` using GitHub Copilot CLI (`gh copilot explain`). Originally planned to use `@bradygaster/squad-sdk` with `SquadClientWithPool`, but SDK has Node v25 ESM compatibility issues (imports `vscode-jsonrpc/node` without `.js` extension). CLI approach is simpler and zero-dependency for the actual processing. Routing table uses keyword matching (test→Grimoire, security→Warden, etc., default→Gecko). Auth via `GITHUB_TOKEN` env var. Demo mode (`SQUAD_DEMO_MODE=true`) skips Copilot and posts simulated responses. `ralph-watch.js` now spawns `ralph-agent.js` fire-and-forget after finding tasks. Task files archived to `~/.squad/teams-processed/` for debugging. See `.squad/decisions/inbox/epoch-ralph-agent-sdk.md` for full architecture.

- **Ralph agent automation & repo-local Teams state (2026-04-09):** Built `ralph-agent.js` to process Teams inbox tasks unattended. Teams inbox moved from `~/.squad/teams-inbox/` to `.squad/teams-inbox/` (repo-local, gitignored). Processed files archived to `.squad/teams-processed/`. `teams-last-read.json` cursor also moved to `.squad/teams-last-read.json` (gitignored). Auth/config files (`teams-config.json`, `teams-auth.json`) stay in `~/.squad/` (credentials). Routing table matches keywords (test→Grimoire, security→Warden, ci→Chronos, ui→Vex, design→Sigil, default→Gecko). `ralph-watch.js` spawns `ralph-agent.js` after finding tasks. `@bradygaster/squad-sdk` (v0.9.1) is ESM-only — dynamic `import()` required in CommonJS context. SDK has dependency issues (vscode-jsonrpc import failure); fallback to demo mode implemented with `SQUAD_DEMO_MODE=true`. Agents receive charter-based system message: "You are {Agent}, the {Role} on the gEcho project. {charter}. Keep replies concise for Teams chat (2-4 sentences)."

- **GitHub Copilot CLI syntax fix (2026-04-09):** Fixed `ralph-agent.js` CLI fallback. The correct non-interactive command is `gh copilot -p "<prompt>"` (NOT `gh copilot explain "<prompt>"` or `gh copilot explain --prompt "<prompt>"`). The `explain` and `suggest` subcommands are interactive-only; non-interactive mode uses the top-level `-p`/`--prompt` flag. Error was: `error: Invalid command format. For non-interactive mode, use the -p or --prompt option.` Root cause: called `gh copilot explain` as positional arg instead of using `-p` flag.

- **Ralph routing word-boundary fix (2026-04-09):** Fixed keyword routing in `ralph-agent.js` to use word-boundary regex (`\b${keyword}\b`) instead of simple `includes()`. Previous implementation caused false-positives: "perspective" matched "spec" → routed to Grimoire instead of Gecko. Added `matchesKeyword(text, keyword)` helper and updated `routeTask()` to use it. Also added Epoch (Backend Dev) to routing table with keywords: `['api', 'backend', 'server', 'database', 'endpoint', 'epoch']`.
