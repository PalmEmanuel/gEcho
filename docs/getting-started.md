# Getting Started with gEcho

This guide walks you through installing gEcho, setting up ffmpeg, and creating your first recording.

## Prerequisites

### VS Code

gEcho requires **VS Code 1.101.0** or later. Download it from [code.visualstudio.com](https://code.visualstudio.com/).

### ffmpeg

ffmpeg is required for GIF recording and screen capture. It is **not** needed for Echo (workbook) recording or workbook replay without GIF output.

#### macOS

```bash
# Homebrew
brew install ffmpeg

# MacPorts
sudo port install ffmpeg
```

#### Linux (Debian / Ubuntu)

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
```

#### Linux (Fedora)

```bash
sudo dnf install ffmpeg
```

#### Windows

1. Download a release build from [ffmpeg.org/download.html](https://ffmpeg.org/download.html)
2. Extract the archive and add the `bin/` folder to your system `PATH`
3. Verify with `ffmpeg -version` in a terminal

> **Tip:** If you install ffmpeg to a non-standard location, set the `gecho.ffmpegPath` setting in VS Code to the full path of the binary.

#### Verify Installation

Open a terminal and run:

```bash
ffmpeg -version
```

You should see version information. If not, ensure ffmpeg is on your `PATH`.

## Install the Extension

1. Open VS Code
2. Go to the **Extensions** view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for **gEcho**
4. Click **Install**

Alternatively, install from the command line:

```bash
code --install-extension PalmEmanuel.gEcho
```

## Your First Echo Recording

Echo mode records your VS Code interactions (typing, commands, selections) into a replayable **workbook** — a human-readable JSON file.

1. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run **gEcho: Start Echo Recording**
3. Confirm the keystroke recording prompt
4. Perform some demo actions — type code, open files, use shortcuts
5. Open the Command Palette again and run **gEcho: Stop Echo Recording**
6. Choose a save location and save as `my-first-demo.gecho.json`

The resulting workbook captures your typing rhythm, commands, and file navigation. You can open it in VS Code to inspect or edit the steps.

## Your First GIF Recording

GIF mode captures the VS Code window as a screen recording.

1. Open the Command Palette
2. Run **gEcho: Start GIF Recording**
3. Perform your demo (keep the VS Code window stationary)
4. Run **gEcho: Stop GIF Recording**
5. Choose a save location for the GIF

> **macOS users:** The first time you record, macOS may prompt for screen recording permission. Grant it in **System Settings → Privacy & Security → Screen Recording**.

## Replay a Workbook as GIF

The most powerful workflow: replay a recorded workbook while capturing it as a GIF. This produces deterministic, reproducible output.

1. Open the Command Palette
2. Run **gEcho: Replay as GIF**
3. Select a `.gecho.json` workbook file
4. gEcho replays your recorded actions and simultaneously records the screen
5. When replay finishes, choose a save location for the GIF

## Replay Without Recording

To test a workbook without generating a GIF:

1. Open the Command Palette
2. Run **gEcho: Replay Workbook**
3. Select a `.gecho.json` workbook file
4. Watch as gEcho replays each step

## Next Steps

- Learn the full [Workbook Format Reference](workbook-reference.md) to hand-author or edit workbooks
- Review all available [Configuration](configuration.md) settings
- Set up [CI Integration](ci-integration.md) to auto-generate GIFs in your pipeline
- Check [Limitations](limitations.md) to understand what gEcho can and cannot capture
- See [Troubleshooting](troubleshooting.md) if you run into issues
