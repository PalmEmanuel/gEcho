# CI Integration

gEcho echoes can be replayed in CI/CD pipelines to generate GIFs automatically. This ensures your demo GIFs stay up-to-date with every code change.

## Current Limitation: Interactive Dialogs

> **Important:** `gecho.replayAsGif` currently opens file-picker dialogs (Open Echo, Save GIF) during replay. It does not accept an echo path or output path via command-line arguments, which means it cannot run unattended in headless CI.

**Recommended workflow until non-interactive support is added:**

1. Record an echo locally with gEcho.
2. Run **gEcho: Replay Echo as GIF** locally to produce the GIF.
3. Commit both the `.echo.json` echo and the generated `.gif` to your repository.
4. Reference the committed GIF in your README or docs — no CI execution step is needed.

This is the reliable path for keeping demo GIFs in sync with your codebase today.

## Overview (Future: When Non-Interactive Mode Is Available)

When a non-interactive replay command is implemented, the workflow will be:

1. Record an echo locally (once)
2. Commit the `.echo.json` file to your repository
3. In CI, install the gEcho extension and replay the echo as a GIF
4. Use the generated GIF in your README, docs, or release notes

The sections below document the CI infrastructure that will support this workflow. They are provided for reference and for teams that implement their own replay automation.

## GitHub Actions Infrastructure

```yaml
name: Generate Demo GIFs

on:
  push:
    branches: [main]
    paths:
      - 'echoes/**'
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
        run: sudo apt-get install -y xvfb xdotool

      - name: Install gEcho extension
        run: code --install-extension PalmEmanuel.gEcho

      # NOTE: gecho.replayAsGif currently requires interactive dialogs.
      # A non-interactive command is needed for this step to work in CI.
      - name: Generate demo GIF
        run: |
          xvfb-run -a code --command gecho.replayAsGif

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
- **X11 tools:** `xdotool` is needed for window detection on Linux.

## Cross-Platform CI Infrastructure

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
        run: sudo apt-get update && sudo apt-get install -y ffmpeg xvfb xdotool

      - if: runner.os != 'Linux'
        uses: AnimMouse/setup-ffmpeg@v1

      - name: Install gEcho
        run: code --install-extension PalmEmanuel.gEcho

      # NOTE: gecho.replayAsGif currently requires interactive dialogs.
      # Platform-specific steps below are for future non-interactive support.
      - if: runner.os == 'Linux'
        run: xvfb-run -a code --command gecho.replayAsGif

      - if: runner.os != 'Linux'
        run: code --command gecho.replayAsGif
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

Override gEcho settings via VS Code's user settings file. The path is platform-specific:

**Linux** (`~/.config/Code/User/settings.json`):

```yaml
- name: Configure gEcho
  if: runner.os == 'Linux'
  run: |
    mkdir -p ~/.config/Code/User
    cat > ~/.config/Code/User/settings.json << 'EOF'
    {
      "gecho.gif.fps": 15,
      "gecho.gif.width": 1280,
      "gecho.gif.quality": "balanced",
      "gecho.replay.speed": 2.0
    }
    EOF
```

**macOS** (`~/Library/Application Support/Code/User/settings.json`):

```yaml
- name: Configure gEcho
  if: runner.os == 'macOS'
  run: |
    mkdir -p "$HOME/Library/Application Support/Code/User"
    cat > "$HOME/Library/Application Support/Code/User/settings.json" << 'EOF'
    {
      "gecho.gif.fps": 15,
      "gecho.gif.width": 1280,
      "gecho.gif.quality": "balanced",
      "gecho.replay.speed": 2.0
    }
    EOF
```

**Windows** (`%APPDATA%\Code\User\settings.json`):

```yaml
- name: Configure gEcho
  if: runner.os == 'Windows'
  shell: pwsh
  run: |
    $dir = "$env:APPDATA\Code\User"
    New-Item -ItemType Directory -Force $dir | Out-Null
    @'
    {
      "gecho.gif.fps": 15,
      "gecho.gif.width": 1280,
      "gecho.gif.quality": "balanced",
      "gecho.replay.speed": 2.0
    }
    '@ | Set-Content "$dir\settings.json"
```

### Recommended CI Settings

| Setting | CI Value | Reason |
|---------|----------|--------|
| `gecho.replay.speed` | `2.0` | Faster replay reduces CI time |
| `gecho.gif.quality` | `"balanced"` | Good quality/size ratio; this preset controls GIF output FPS (10 fps) |
| `gecho.gif.width` | `1280` | Reasonable resolution for docs |
| `gecho.gif.fps` | `15` | Smoother MP4 capture; does **not** affect final GIF FPS (that comes from the quality preset) |

## Authentication Considerations

Some echoes may involve authenticated features (e.g., Copilot Chat, GitHub integrations). These require valid credentials at replay time.

**Options:**
- **Run locally:** For auth-dependent demos, run gEcho on a developer machine where credentials are available, then commit the generated GIFs.
- **Service accounts:** Use CI secrets to provide authentication tokens where applicable.
- **Mock the interaction:** Design echoes to show only the typing portion without waiting for authenticated responses.

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
