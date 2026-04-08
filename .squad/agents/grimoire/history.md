# Project Context

- **Owner:** Emanuel Palm
- **Project:** gEcho — VS Code extension for recording, replaying, and generating reproducible GIFs from VS Code interactions
- **Stack:** TypeScript, VS Code Extension API (1.101.0+), Node.js, ffmpeg, JSON workbook format (.gecho.json)
- **Created:** 2026-04-08

## Key Testing Considerations

- ffmpeg must be mocked in unit tests — real capture requires a display
- Workbook replay tests can use synthetic `.gecho.json` fixtures
- Timing-sensitive code (replay engine) needs controlled clock or sequence-driven testing
- VS Code Integration Test Host is required for extension API tests

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-08 — Wave 1 Test Scaffolding

- **Import paths need `.js` extensions** — Node16 module resolution requires explicit `.js` extensions in all imports, even when importing `.ts` source files. TypeScript resolves them correctly at compile time.
- **Mocha UI must be consistent** — The `test/suite/index.ts` programmatic Mocha runner and `.mocharc.json` must agree on `ui: 'bdd'`. Mixing `suite`/`test` (TDD) with `describe`/`it` (BDD) in the same run causes "not defined" errors.
- **`validateWorkbook` / `readWorkbook` / `writeWorkbook` are stubs** — All three functions currently throw `'Not implemented'`. Tests are written TDD-style; they will fail until Epoch implements the functions. This is intentional and expected.
- **Pure-function tests don't need the VS Code extension host** — `platform.test.ts` and `recording.test.ts` import only from `src/types/` and `src/platform/`, so they can run under plain Mocha (via `.mocharc.json`) without `@vscode/test-electron`. VS Code API tests (e.g. `extension.test.ts`) still require the electron runner.
- **`os.tmpdir()` on macOS returns `/var/folders/…`** — Not `/tmp`. Safe to use for roundtrip test fixtures; cleanup via `fs.rm(dir, { recursive: true, force: true })` in `afterEach`.
