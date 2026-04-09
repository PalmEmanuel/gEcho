# Decision: Teams Inbound Integration Design

**Date:** 2026-04-08
**Author:** Epoch
**Status:** Implemented

## Context

Emanuel wants the squad to monitor a Microsoft Teams group chat for incoming tasks, execute them without a GitHub Issues intermediary, and post results back via the existing outbound webhook.

## Design Decisions

### Auth: MSAL Device Code Flow
- Used `@azure/msal-node` `PublicClientApplication` with device code callback
- Device code flow requires no redirect URI — correct for interactive CLI setup
- Token cache serialized to `~/.squad/teams-auth.json` after every acquisition
- Silent token refresh on subsequent monitor runs; `AUTH_REQUIRED` exit if refresh fails

### File Locations (all outside repo)
- `~/.squad/teams-config.json` — chatId, clientId, tenantId, triggerWords
- `~/.squad/teams-auth.json` — MSAL token cache
- `~/.squad/teams-last-read.json` — dedup cursor
- `~/.squad/teams-inbox/*.md` — pending task files for Ralph

### Deduplication Strategy
- `lastReadAt` ISO timestamp cursor (not message IDs alone)
- Messages with `createdDateTime <= lastReadAt` are skipped
- Cursor updated to latest processed message after each run
- Fallback: look back 30 minutes on first run (no prior state)

### Trigger Word Matching
- Case-insensitive prefix match on message body (after HTML stripping)
- Trigger word stripped from task body before writing inbox file
- Sender filtered: skip messages from display names containing "squad", "bot", "gecho"

### Exit Code Contract (for Ralph)
- Exit 0 + stdout "Found N new task(s)" or "No new tasks" → normal
- Exit 1 + stderr "AUTH_REQUIRED" → token expired, notify user to re-run setup
- Exit 0 + stdout "Network error — skipping Teams check" → transient, skip this cycle

### Repo vs Home Dir Split
- Repo contains template `.squad/teams-config.json` (no secrets, documents schema)
- All runtime state in `~/.squad/` (home dir, outside repo)
- `.gitignore` guards `.squad/teams-inbox/` in case of accidental placement

## Trade-offs

- `$top=20` without pagination: sufficient for normal cadence; warns if limit hit
- CommonJS (not TypeScript): squad scripts run directly with `node`, no build step needed
- No scheduler built into monitor: Ralph calls it on each loop iteration — separation of concerns
