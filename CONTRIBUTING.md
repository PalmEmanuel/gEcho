# Contributing to gEcho

Thank you for contributing! This document outlines our contribution and testing policy.

## Code Tours

The `.tours/` directory contains [CodeTour](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.codetour) files for VS Code. Install the CodeTour extension and run **CodeTour: Start Tour** to explore:

- **Architecture Overview** — module structure and core concepts; start here if you are new to the codebase
- **Adding a New Step Type** — step-by-step guide for implementing a new echo step type (uses the `scroll` step as a worked example)

**Keeping tours current:** tour steps reference specific line numbers. If you significantly change a file that a tour references, check whether the tour step still points to the right place and update the line number if needed. The affected file is listed in each `.tour` JSON step's `"file"` field.

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
