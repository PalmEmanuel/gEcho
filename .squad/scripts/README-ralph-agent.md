# Ralph Agent — Unattended Teams→Agent→Teams Processing

## Overview

Ralph agent enables fully automated task processing from Teams chat. Emanuel can send a message to Teams from his phone, and the system will:

1. **ralph-watch.js** polls Teams every 30s, writes tasks to `.squad/teams-inbox/` (repo-local)
2. **ralph-agent.js** (spawned by watch) routes task to the right agent and processes it
3. Response is posted back to Teams chat automatically

**Zero human intervention required on the Mac.**

## Setup

```bash
# From the repository root, install dependencies
cd .squad/scripts
npm install

# Ensure GITHUB_TOKEN is set for Copilot CLI access
export GITHUB_TOKEN=YOUR_GITHUB_TOKEN

# Start Ralph watch daemon
node ralph-watch.js
```

## Usage

From Teams chat:
```
@squad test the auth flow
@squad fix the broken CI pipeline
@squad what's the status of the replay engine?
```

Ralph will:
- Acknowledge the message ("👍 On it")
- Route to the appropriate agent (Grimoire, Chronos, Gecko, etc.)
- Process with GitHub Copilot CLI
- Post response back to Teams

## Architecture

```
Teams Chat
    ↓
ralph-watch.js (polls every 30s)
    ↓
.squad/teams-inbox/task-YYYY-MM-DD_HH-MM-SS-slug.md (repo-local)
    ↓
ralph-agent.js (spawned on new task)
    ↓
[Route by keyword] → Agent charter loaded
    ↓
@bradygaster/squad-sdk (with fallback to demo mode)
    ↓
teams-reply.js → Post to Teams
    ↓
.squad/teams-processed/ (archived)
```

## Paths

**Repo-local state** (`.squad/`, gitignored):
- `.squad/teams-inbox/` — incoming task files
- `.squad/teams-processed/` — archived after processing
- `.squad/teams-last-read.json` — cursor for dedup

**Auth/credentials** (`~/.squad/`, machine-specific):
- `teams-config.json` — chatId, clientId, tenantId
- `teams-auth.json` — MSAL token cache

## Routing Table

Keywords are matched in order (first match wins):

| Keywords | Agent | Role |
|----------|-------|------|
| test, bug, qa, coverage, spec, grimoire | Grimoire | Tester |
| security, auth, warden, credential, token | Warden | Security/Auth |
| ci, deploy, pipeline, chronos, action, workflow, github | Chronos | DevOps/CI |
| ui, frontend, vex, component, css, react, style | Vex | Frontend Dev |
| design, sigil, color, layout, visual | Sigil | Designer |
| *(default)* | Gecko | Lead |

## Demo Mode

Test without consuming tokens:

```bash
SQUAD_DEMO_MODE=true GITHUB_TOKEN=demo node ralph-agent.js
```

Posts simulated responses instead of calling Copilot CLI.

## Files

- **package.json** — Dependencies for Teams + SDK
- **ralph-watch.js** — Persistent watch daemon (updated to spawn agent)
- **ralph-agent.js** — Task processor (NEW)
- **teams-reply.js** — Post messages to Teams
- **teams-monitor.js** — Poll Teams for new messages
- **teams-graph-client.js** — Shared MSAL/Graph logic

## Auth Requirements

- **Teams access:** `Chat.ReadWrite` scope (configured via `teams-setup.js`)
- **Copilot access:** `GITHUB_TOKEN` env var with GitHub Copilot entitlement

## Limitations

- Single-turn responses only (no conversation history)
- Agent charter not passed to Copilot CLI (CLI doesn't support system messages)
- 2-minute timeout per task
- No streaming (waits for full response)

## Future Enhancements

If `@bradygaster/squad-sdk` becomes Node v25 compatible:
- Switch from CLI to SDK for system message support
- Add session persistence for multi-turn conversations
- Implement streaming responses
- Use full agent charters in prompts
