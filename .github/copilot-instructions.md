# gEcho — Copilot Instructions

## Project Overview

gEcho is a VS Code extension that records, replays, and generates reproducible GIFs from VS Code interactions.

- **Echo mode** — Records user actions (keystrokes, commands, selections) into a replayable echo (`.gecho.json`)
- **GIF mode** — Captures the VS Code window as a GIF via ffmpeg
- **Combined** — Replay an echo while capturing the screen to produce a deterministic GIF

An **echo** is a replay definition — a JSON file describing a sequence of VS Code interactions that can be replayed deterministically.

The extension has zero runtime dependencies. All platform integrations are invoked as child processes.

## Source Layout

```
src/types/        — Echo + recording types (discriminated unions on `type` field)
src/recording/    — EchoRecorder (VS Code event capture → WorkbookStep[])
src/replay/       — WorkbookPlayer (WorkbookStep[] → VS Code commands)
src/screen/       — ScreenCapture (ffmpeg wrapper)
src/converter/    — GifConverter (mp4 → gif via ffmpeg)
src/platform/     — OS detection + window bounds (macOS/Linux/Windows)
src/workbook/     — Read/write/validate .gecho.json files
src/security/     — sanitizeCommandId, sanitizeFilePath, sanitizeFfmpegPath
src/ui/           — Status bar helpers
src/config.ts     — Config accessor (gecho.* settings)
src/dependencies.ts — Startup dependency check (ffmpeg availability)
src/extension.ts  — Thin entry point (command registration only)
schemas/          — JSON Schema for .gecho.json (gecho-v1.schema.json)
test/suite/       — VS Code Extension Host tests
workbooks/        — Example .gecho.json echoes
docs/             — User-facing documentation
```

Each module directory has an `index.ts` re-exporter backed by named implementation files. Import paths must use `.js` extensions (required by TypeScript `module: Node16`).

## Architecture Constraints

1. **Import paths use `.js` extensions** — TypeScript is compiled with `module: Node16`.
2. **Discriminated unions** — All step types switch on the `step.type` string literal. Always add a `default` (exhaustiveness) check.
3. **No runtime dependencies** — All dependencies are `devDependencies`. Never add a runtime dependency without a recorded team decision.
4. **Activation** — Per-command activation only (`onCommand:gecho.*`). Do not add `onStartupFinished` or `"*"` without a new decision record.
5. **Echo format changes** — Any addition or change to `.gecho.json` step types requires a version bump + migration function.
6. **Module-level state** — `extension.ts` tracks state with `currentState: RecordingState` and `active*` variables. Do not introduce a separate state manager.
7. **Security sanitizers must be called** — `sanitizeCommandId()` before every `executeCommand(step.id)`, `sanitizeFilePath()` before every `openFile` step, `sanitizeFfmpegPath()` before any ffmpeg spawn.
8. **Recording confirmation** — Always show a `showWarningMessage` before starting Echo recording to warn the user about keystroke capture.
9. **deactivate cleanup** — Stop `activeCapture`, `activeRecorder`, and `activePlayer` in `deactivate()`.

## Build, Lint, and Test

```bash
npm run compile        # TypeScript compile (tsc -p ./)
npm run lint           # ESLint (src/ only)
npm run test           # VS Code Extension Host tests (requires compile)
npm run test:integration  # Integration tests with ffmpeg
```

TypeScript config: `strict: true`, `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true`, target ES2022, module Node16.

## RecordingState

```typescript
type RecordingState = 'idle' | 'recording' | 'recording-gif' | 'replaying' | 'replaying-gif';
```

Always reset `currentState = 'idle'` in both success and catch paths. `activeCapture` may be set during both `'recording-gif'` and `'replaying-gif'`.

## Platform Details

- **macOS** — AppleScript for window bounds, `avfoundation` for ffmpeg capture. Exit codes `0`, `254`, `255` are success.
- **Linux** — `xdotool`/`xwininfo` for window bounds, `x11grab` capture. Wayland is not supported.
- **Windows** — PowerShell for window bounds, `gdigrab` capture.
- `getWindowBounds()` falls back to `{x:0, y:0, width:1920, height:1080}` on failure.

## Echo Format

Echoes are `.gecho.json` files validated against `schemas/gecho-v1.schema.json` (JSON Schema draft-07). The schema uses `oneOf` for the step discriminated union. Current step types: `type`, `command`, `key`, `select`, `wait`, `openFile`, `paste`, `scroll`.

## Testing

- Tests run inside the VS Code Extension Host (`@vscode/test-electron`).
- ffmpeg is always mocked in tests — never spawn a real ffmpeg process.
- Use `os.tmpdir()` subdirectories for filesystem I/O; clean up in `afterEach`.
- 80% line coverage floor. Priority: `types/` → `workbook/` → `platform/` → `replay/` → `recording/` → `screen/`.

## PR Titles — Conventional Commits

All PR titles are validated by CI (`validate-pr-title.yml`) and **must** follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<optional-scope>): <subject with at least 10 characters>
```

### Allowed Types

| Type | Use for |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, whitespace (no logic change) |
| `refactor` | Code restructuring (no feature/fix) |
| `test` | Adding or fixing tests |
| `chore` | Maintenance, tooling, config |
| `perf` | Performance improvement |
| `ci` | CI/CD pipeline changes |
| `revert` | Revert a previous commit |
| `deps` | Dependency updates |

### Allowed Scopes (optional)

**Architecture scopes** (pair with any type):

`recording`, `replay`, `capture`, `workbook`, `platform`, `config`, `security`, `ci`, `release`

**Dependency scopes** (pair with `deps` type):

`deps`, `deps-dev`, `deps-peer`, `github-actions`

### Examples

```
feat(recording): Add scroll event capture to EchoRecorder
fix(replay): Handle undefined delay in TypeStep
docs: Update echo format reference with paste step
chore(ci): Pin ubuntu-latest to ubuntu-22.04
deps(deps-dev): Bump typescript to 5.5.0
```

The subject must be at least 10 characters. The PR title is used as the squash-merge commit message.
