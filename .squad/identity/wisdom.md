---
last_updated: 2026-04-08T09:17:08.251Z
---

# Team Wisdom

Reusable patterns and heuristics learned through work. NOT transcripts — each entry is a distilled, actionable insight.

## Patterns

<!-- Append entries below. Format: **Pattern:** description. **Context:** when it applies. -->

---

## Branch & PR Workflow (standing rule — applies to all agents)

`main` is protected. No direct pushes. All work ships through pull requests.

**Before touching any source file:** create a branch. The coordinator provides `TARGET_BRANCH` in every spawn — use it.

```bash
git checkout -b {TARGET_BRANCH}   # if it doesn't exist yet
git checkout {TARGET_BRANCH}      # if it already exists
```

**Branch naming:**

| Work type | Pattern | Example |
|-----------|---------|---------|
| Feature | `feat/{scope}-{slug}` | `feat/replay-loop-mode` |
| Bug fix | `fix/{scope}-{slug}` | `fix/player-delay-clamp` |
| Issue-driven | `squad/{issue-number}-{slug}` | `squad/42-add-scroll-step` |
| CI / tooling | `chore/{slug}` | `chore/update-ci-matrix` |
| Test-only | `test/{slug}` | `test/player-step-dispatch` |
| Squad state only | `chore/squad-state-{YYYYMMDD}` | `chore/squad-state-20260408` |

**After finishing work:**
1. `git push -u origin {TARGET_BRANCH}`
2. Open a PR: `gh pr create --title "{type}({scope}): Description" --body "..." --base main`
3. PR titles **must** follow Conventional Commits — CI enforces this.
   Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`, `build`, `revert`
   Subject: capital letter, ≥10 chars.
4. Use `--draft` if the work is incomplete.
5. Reference any related issue in the PR body: `Closes #N` or `Fixes #N`.

**Gecko reviews all code PRs** before merge. No self-merge.
