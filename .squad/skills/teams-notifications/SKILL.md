# Skill: teams-notifications
confidence: medium
version: 1.1
authors: [Gecko, Epoch]
tags: [teams, notifications, webhook, adaptive-cards, graph-api]

## Summary
How gEcho squad agents communicate via Microsoft Teams — two distinct channels for two distinct purposes.

## Two channels

### 1. Outbound webhook (`~/.squad/teams-webhook.url`) — broadcast notifications
Use for: CI failures, PR merges, security findings, major decisions. Messages appear as connector cards in the channel.

The webhook URL is stored at `~/.squad/teams-webhook.url` (never in the repo).
Read it with: `cat ~/.squad/teams-webhook.url` or `fs.readFileSync(path.join(os.homedir(), '.squad', 'teams-webhook.url'), 'utf8').trim()`

### 2. Graph API chat reply (`teams-reply.js`) — task results
Use for: responding to `/task` messages in the group chat. Messages appear as real conversation messages from the authenticated user (Emanuel).

```bash
# Short reply
node .squad/scripts/teams-reply.js "✅ Done: fixed the status bar icon"

# Long reply from file
node .squad/scripts/teams-reply.js --file /path/to/result.md
```

Or from Node.js:
```js
const { sendChatMessage } = require('./.squad/scripts/teams-graph-client');
await sendChatMessage('✅ Done: fixed the status bar icon');
```

## When to use each channel

| Channel | Use when |
|---------|----------|
| Outbound webhook | CI failure, PR merged, security finding, major decision |
| Graph API chat reply | Responding to a `/task` message from the group chat |

**Never use the webhook for task replies.** Task results go back as chat messages via `teams-reply.js`.

## When to Send
Only send when genuinely newsworthy. Default: DON'T send. Send only when:
- CI pipeline fails on a PR targeting main (Chronos)
- A PR is merged to main (Chronos)
- A test suite has unexpected failures (Grimoire)
- A major architectural decision is made (Gecko)
- A security finding is discovered (Sigil/Warden)

## How to Send (bash — for CI scripts and agent shell commands)
curl -H "Content-Type: application/json" -d @payload.json "$(cat ~/.squad/teams-webhook.url)"

## Adaptive Card Payload Format

Use message type to pick the right format:

### ⚡ Breaking News (critical events — CI failure, security finding)
```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "themeColor": "FF0000",
  "summary": "⚡ gEcho Alert",
  "sections": [{
    "activityTitle": "⚡ **{TITLE}**",
    "activitySubtitle": "{SUBTITLE}",
    "activityText": "{BODY}",
    "facts": [{"name": "{KEY}", "value": "{VALUE}"}]
  }],
  "potentialAction": [{"@type": "OpenUri", "name": "View", "targets": [{"os": "default", "uri": "{URL}"}]}]
}
```

### 🎯 Status Flash (quick update — PR merged, test passed)
```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "themeColor": "0078D7",
  "summary": "🎯 gEcho Update",
  "sections": [{
    "activityTitle": "🎯 **{TITLE}**",
    "activityText": "{BODY}"
  }]
}
```

### 📰 Daily Briefing (summaries, changelogs)
```json
{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "themeColor": "28A745",
  "summary": "📰 gEcho Daily Briefing",
  "sections": [{
    "activityTitle": "📰 **gEcho Daily Briefing**",
    "activitySubtitle": "{DATE}",
    "activityText": "{BODY}"
  }]
}
```

## Anti-spam rules
- NEVER send a Teams message just because work was completed
- NEVER send per-commit or per-push updates
- DO send on: failures, merges to main, security findings
- Deduplicate: do NOT send the same alert twice for the same event

## Testing the webhook
```bash
curl -H "Content-Type: application/json" \
  -d '{"@type":"MessageCard","@context":"http://schema.org/extensions","themeColor":"0078D7","summary":"Test","sections":[{"activityTitle":"🧪 Test message","activityText":"Teams integration is working for gEcho squad."}]}' \
  "$(cat ~/.squad/teams-webhook.url)"
```

---

## Inbound: Reading Tasks from Teams

### Full cycle

```
Teams group chat message
  → teams-monitor.js polls Graph API
  → .squad/teams-inbox/{timestamp}-{slug}.md written
  → Ralph picks up file on next loop iteration
  → Routes task to appropriate squad agent
  → Result posted back via `teams-reply.js` (Graph API chat message)
  → Inbox file deleted
```

### Setup (once per machine)

1. Complete Azure AD app registration — see `.squad/docs/teams-setup-instructions.md`
2. Run `node .squad/scripts/teams-setup.js` and follow the device code prompt
3. Select the group chat to monitor — chat ID is saved to `~/.squad/teams-config.json`

### Running the monitor

```bash
# Run once (e.g. from Ralph's loop):
node .squad/scripts/teams-monitor.js

# Output:
#   "Found N new task(s)"  — task files written to .squad/teams-inbox/
#   "No new tasks"         — nothing to do
#   AUTH_REQUIRED on stderr, exit 1 — token expired, re-run teams-setup.js
#   "Network error — skipping Teams check", exit 0 — transient, skip this cycle
```

### Trigger word format

Messages must start with one of the configured trigger words (default: `/task`, `@squad`, `@gecho`).

Examples:
- `/task fix the status bar icon` → task body: `fix the status bar icon`
- `@squad run the test suite and report results`
- `@gecho what is the current recording state?`

Matching is case-insensitive. The trigger word is stripped before writing the task file.

### How Ralph checks the inbox

On each monitoring cycle, after GitHub checks:
1. Run `node .squad/scripts/teams-monitor.js` (if file exists)
2. Read `.squad/teams-inbox/*.md` files
3. For each: parse task, route to agent, post result via `node .squad/scripts/teams-reply.js`
4. Delete processed file

### Re-auth when AUTH_REQUIRED

If `teams-monitor.js` outputs `AUTH_REQUIRED` on stderr:
1. Send a Teams notification to Emanuel asking him to re-run `node .squad/scripts/teams-setup.js`
2. Skip Teams check for this cycle (do not crash or retry in the same loop)

### Config paths (all outside repo)

| File | Purpose |
|------|---------|
| `~/.squad/teams-config.json` | clientId, tenantId, chatId, triggerWords |
| `~/.squad/teams-auth.json` | Serialized MSAL token cache |
| `~/.squad/teams-last-read.json` | Dedup cursor (lastMessageId, lastReadAt) |
| `.squad/teams-inbox/` | Pending task files |
| `~/.squad/teams-webhook.url` | Outbound webhook URL |
