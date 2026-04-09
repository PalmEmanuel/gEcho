# Skill: teams-notifications
confidence: medium
version: 1.0
authors: [Gecko]
tags: [teams, notifications, webhook, adaptive-cards]

## Summary
How gEcho squad agents send Microsoft Teams notifications via incoming webhook.

## Webhook URL
The webhook URL is stored at `~/.squad/teams-webhook.url` (never in the repo).
Read it with: `cat ~/.squad/teams-webhook.url` or `fs.readFileSync(path.join(os.homedir(), '.squad', 'teams-webhook.url'), 'utf8').trim()`

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
