# Contributing to gEcho

Thank you for contributing! This document outlines our contribution and testing policy.

## Echo Schema Changes

The echo format lives in `schemas/gecho-v1.schema.json` and `src/types/echo.ts`.

**Before the v1.0.0 extension release**, any schema change — additive or breaking — does **not** require a version bump or migration function. Move fast and iterate freely.

Once v1.0.0 is published to the VS Code Marketplace, breaking changes to the echo format require:
1. A schema version bump (e.g. `"1.1"`)
2. A migration function in `src/echo/echo.ts` that upgrades older files on read
3. An update to `ECHO_VERSION` in `src/types/echo.ts`

Purely additive changes after release (new optional step types, new optional fields) remain safe without migration, as long as older players silently skip unknown step types via the `default` case in the player `switch`.

## Testing Requirements

**All contributions must include tests.** This is a hard requirement:

- **New features** must include tests covering all new code paths
- **Bug fixes** must include a regression test that would have caught the bug
- **Refactors** must verify existing tests still pass and add tests for any newly exposed paths
- **PRs without tests for new or changed code will not be merged**

## Test Types

gEcho has three test tiers:

### Plain-Mocha Tests
Run with: `npx mocha --config .mocharc.json` (after `npm run compile`)

- Pure-function and isolated module tests
- Most tests mock ffmpeg; tests under `test/suite/integration/` may invoke real ffmpeg when available and self-skip when it is not
- No VS Code electron runner required for most tests
- Fast, well-isolated

### VS Code Extension Host Tests
Run with: `npm test`

- Require VS Code electron runner
- Test command activation and extension lifecycle
- For features that depend on VS Code APIs

### VS Code Extension Host Integration Tests
Run with: `npm run test:integration`

- Require VS Code electron runner
- End-to-end integration scenarios (GIF pipeline, screen capture, echo replay)
- May use real ffmpeg; tests self-skip when ffmpeg or a display is unavailable

## Test Location & Naming

- **Plain-Mocha tests**: `test/suite/*.test.ts` and `test/suite/integration/`
- **Extension Host tests**: `test/suite/` (run via `npm test`)
- **Extension Host integration tests**: `test/integration/`

## Key Conventions

1. **vscodeMock import** — If your Mocha test transitively loads source modules that import VS Code, **`./vscodeMock.js` must be the first import**:
   ```typescript
   import './vscodeMock.js';
   // ...rest of imports
   ```
   The mock lives at `test/suite/integration/vscodeMock.ts` and is imported as `'./vscodeMock.js'` from files in that directory.

2. **File extensions** — Use `.js` on all local imports (Node16 module resolution)

3. **ffmpeg usage** — Unit tests must not require a real ffmpeg binary. Integration tests may use real ffmpeg but must self-skip when it is unavailable (e.g. check `which ffmpeg` or catch `ENOENT`).

## Build & Lint

- **Build**: `npm run compile` (runs tsc -p ./)
- **Lint**: `npm run lint`

## Getting Started

1. Fork the repository
2. Create a feature branch
3. Write code and tests
4. Run `npm run compile` to verify TypeScript
5. Run `npm run lint` to check style
6. Run `npx mocha --config .mocharc.json` to verify plain-Mocha tests
7. Run `npm test` to verify Extension Host tests
8. Run `npm run test:integration` to verify Extension Host integration tests
9. Submit a PR

Questions? Open an issue or check the [README](README.md).
