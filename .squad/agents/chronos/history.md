# Project Context

- **Owner:** Emanuel Palm
- **Project:** gEcho — VS Code extension for recording, replaying, and generating reproducible GIFs from VS Code interactions
- **Stack:** TypeScript, VS Code Extension API (1.101.0+), Node.js, ffmpeg, JSON workbook format (.gecho.json)
- **Created:** 2026-04-08

## Key CI Considerations

- Extension tests require a display; Linux CI needs `xvfb-run`
- ffmpeg must be available in CI for GIF recording tests
- Cross-platform matrix: macOS, Ubuntu, Windows
- VSIX is produced via `@vscode/vsce`
- Headless VS Code test mode: `--extensionTestsPath`

## Learnings

- **npm ci for CI reproducibility:** Use `npm ci` (not `npm install`) in workflows to lock exact dependency versions from package-lock.json
- **xvfb-run on Linux:** VS Code extension tests require a display; Linux CI needs `xvfb-run -a` wrapper; macOS and Windows have native displays
- **VSIX packaging once per matrix:** Generate VSIX only on ubuntu-latest to avoid triple artifacts; use conditional steps `if: runner.os == 'Linux'`
- **Marketplace publish requires separate secret:** VSCE_PAT must be configured separately; CI prepares artifacts but doesn't publish
- **Cross-platform matrix non-negotiable:** Always test on [ubuntu-latest, macos-latest, windows-latest] to catch platform bugs early
- **VS Code Marketplace requires repository, bugs, homepage fields:** Missing `repository`, `bugs`, or `homepage` in package.json blocks Marketplace publishing; also add relevant `keywords` and expand `categories` for discoverability
- **VS Code 1.74+ auto-generates activation events:** With vscode >=1.74.0, explicit `activationEvents` for commands are auto-generated from `contributes.commands`; redundant activation events can be removed (gEcho targets 1.101.0, so safe to remove)

