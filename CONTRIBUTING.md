# Contributing to gEcho

Thank you for contributing! This document outlines our contribution and testing policy.

## Testing Requirements

**All contributions must include tests.** This is a hard requirement:

- **New features** must include tests covering all new code paths
- **Bug fixes** must include a regression test that would have caught the bug
- **Refactors** must verify existing tests still pass and add tests for any newly exposed paths
- **PRs without tests for new or changed code will not be merged**

## Test Types

gEcho has two test tiers:

### Unit Tests
Run with: `npx mocha --config .mocharc.json` (after `npm run compile`)

- Pure-function tests
- ffmpeg always mocked
- No VS Code API required
- Fast, isolated test suite

### VS Code Integration Tests
Run with: `npm test`

- Require VS Code electron runner
- Test command activation and extension lifecycle
- For features that depend on VS Code APIs

## Test Location & Naming

Tests live in `test/suite/`:
- Unit tests: `*.test.ts` files at `test/suite/`
- Integration tests: `test/suite/integration/`

## Key Conventions

1. **vscodeMock import** — If your test transitively loads source modules that import VS Code, **import `test/suite/integration/vscodeMock.js` first**:
   ```typescript
   import './vscodeMock';
   // ...rest of imports
   ```

2. **File extensions** — Use `.js` on all local imports (Node16 module resolution)

3. **ffmpeg mocking** — ffmpeg must always be mocked in unit tests. Never require a real ffmpeg binary.

## Build & Lint

- **Build**: `npm run compile` (runs tsc -p ./)
- **Lint**: `npm run lint`

## Getting Started

1. Fork the repository
2. Create a feature branch
3. Write code and tests
4. Run `npm run compile` to verify TypeScript
5. Run `npm run lint` to check style
6. Run `npx mocha --config .mocharc.json` to verify unit tests
7. Run `npm test` to verify integration tests
8. Submit a PR

Questions? Open an issue or check the [README](README.md).
