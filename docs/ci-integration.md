# CI Integration

gEcho workbooks can be replayed in CI/CD pipelines to generate GIFs automatically. This ensures your demo GIFs stay up-to-date with every code change.

## Overview

The workflow is:

1. Record a workbook locally (once)
2. Commit the `.gecho.json` file to your repository
3. In CI, install the gEcho extension and replay the workbook as a GIF
4. Use the generated GIF in your README, docs, or release notes

## GitHub Actions Example

```yaml
name: Generate Demo GIFs

on:
  push:
    branches: [main]
    paths:
      - 'workbooks/**'
      - 'src/**'

jobs:
  generate-gifs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install ffmpeg
        run: sudo apt-get update && sudo apt-get install -y ffmpeg

      - name: Install xvfb and X11 tools
        run: sudo apt-get install -y xvfb xdotool x11-utils

      - name: Install gEcho extension
        run: code --install-extension PalmEmanuel.gEcho

      - name: Generate demo GIF
        run: |
          xvfb-run -a code \
            --command gecho.replayAsGif \
            workbooks/demo.gecho.json

      - name: Upload GIF artifacts
        uses: actions/upload-artifact@v4
        with:
          name: demo-gifs
          path: '*.gif'
          retention-days: 30
```

### Key Points

- **Linux + xvfb:** CI environments typically have no display. Use `xvfb-run` to provide a virtual X11 framebuffer for both VS Code and ffmpeg.
- **ffmpeg:** Must be installed. On Ubuntu, use `apt-get`. On macOS/Windows runners, use [AnimMouse/setup-ffmpeg](https://github.com/AnimMouse/setup-ffmpeg).
- **X11 tools:** `xdotool` and `x11-utils` are needed for window detection on Linux.

## Cross-Platform CI

```yaml
jobs:
  generate-gifs:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # ffmpeg setup - platform specific
      - if: runner.os == 'Linux'
        run: sudo apt-get update && sudo apt-get install -y ffmpeg xvfb xdotool x11-utils

      - if: runner.os != 'Linux'
        uses: AnimMouse/setup-ffmpeg@v1

      - name: Install gEcho
        run: code --install-extension PalmEmanuel.gEcho

      # Replay - platform specific
      - if: runner.os == 'Linux'
        run: xvfb-run -a code --command gecho.replayAsGif workbooks/demo.gecho.json

      - if: runner.os != 'Linux'
        run: code --command gecho.replayAsGif workbooks/demo.gecho.json
```

## Installing from VSIX

If you build gEcho from source in CI, install the `.vsix` directly:

```yaml
- name: Build gEcho VSIX
  run: |
    npm ci
    npm run compile
    npm run package

- name: Install from VSIX
  run: code --install-extension gecho-*.vsix
```

## Configuration in CI

Override gEcho settings via VS Code's CLI or settings file:

```yaml
- name: Configure gEcho
  run: |
    mkdir -p ~/.config/Code/User
    cat > ~/.config/Code/User/settings.json << 'EOF'
    {
      "gecho.outputDirectory": "./output",
      "gecho.gif.fps": 15,
      "gecho.gif.width": 1280,
      "gecho.gif.quality": "balanced",
      "gecho.replay.speed": 2.0
    }
    EOF
```

### Recommended CI Settings

| Setting | CI Value | Reason |
|---------|----------|--------|
| `gecho.replay.speed` | `2.0` | Faster replay reduces CI time |
| `gecho.gif.quality` | `"balanced"` | Good quality at smaller file sizes |
| `gecho.gif.width` | `1280` | Reasonable resolution for docs |
| `gecho.outputDirectory` | `"./output"` | Predictable artifact location |

## Authentication Considerations

Some workbooks may involve authenticated features (e.g., Copilot Chat, GitHub integrations). These require valid credentials at replay time.

**Options:**
- **Run locally:** For auth-dependent demos, run gEcho on a developer machine where credentials are available, then commit the generated GIFs.
- **Service accounts:** Use CI secrets to provide authentication tokens where applicable.
- **Mock the interaction:** Design workbooks to show only the typing portion without waiting for authenticated responses.

## Committing Generated GIFs

To auto-commit generated GIFs back to the repo:

```yaml
- name: Commit updated GIFs
  run: |
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add images/*.gif
    git diff --cached --quiet || git commit -m "chore: regenerate demo GIFs"
    git push
```

## Troubleshooting CI Issues

- **"ffmpeg not found"** — Ensure ffmpeg is installed before the replay step.
- **"Cannot find display"** (Linux) — Use `xvfb-run` to provide a virtual display.
- **Window detection fails** — Install `xdotool` and `x11-utils` on Linux. On macOS, screen recording permissions may block headless capture.
- **GIF is blank or wrong region** — The fallback window bounds (1920×1080 at 0,0) are used when detection fails. This may capture the wrong region in a headless environment.

See [Troubleshooting](troubleshooting.md) for more common issues.
