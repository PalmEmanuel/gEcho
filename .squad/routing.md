# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|---------|
| Architecture, schema, scope decisions | Gecko | Workbook format changes, component boundaries, API design |
| Recording engine, ffmpeg, replay engine | Epoch | Capture pipeline, step execution, timing, platform detection |
| Extension UI, commands, activation, config | Vex | package.json, command registration, status bar, settings |
| Tests, quality, edge cases | Grimoire | Unit tests, integration tests, mock design, coverage |
| CI pipelines, VSIX packaging, releases | Chronos | GitHub Actions, cross-platform builds, publish automation |
| Security, permissions, credential storage | Warden | SecretStorage, npm audit, permission review, workbook data safety |
| Visual design, icon, marketplace assets, README visuals | Sigil | icon.png, galleryBanner, screenshots, README images |
| Code review | Gecko | Review PRs, check quality, enforce workbook schema compat |
| Scope & priorities | Gecko | What to build next, trade-offs, architectural decisions |
| Session logging | Scribe | Automatic — never needs routing |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Gecko |
| `squad:gecko` | Architecture, review, scope work | Gecko |
| `squad:epoch` | Recording engine, ffmpeg, replay | Epoch |
| `squad:vex` | Extension commands, UI, config | Vex |
| `squad:grimoire` | Tests, quality, edge cases | Grimoire |
| `squad:chronos` | CI, packaging, releases | Chronos |
| `squad:warden` | Security, permissions, auditing | Warden |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, **Gecko** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Gecko's review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for factual questions from context.
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn Grimoire to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. Gecko handles all `squad` (base label) triage.
