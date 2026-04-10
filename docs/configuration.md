# Configuration Reference

All gEcho settings are configured through VS Code's settings (`Ctrl+,` / `Cmd+,`). Search for "gecho" to find them.

## Settings

### `gecho.ffmpegPath`

| | |
|---|---|
| **Type** | `string` |
| **Default** | `"ffmpeg"` |
| **Description** | Path to the ffmpeg binary. |

Set this if ffmpeg is not on your system `PATH`. Use the full absolute path to the binary.

```json
{
  "gecho.ffmpegPath": "/usr/local/bin/ffmpeg"
}
```

On Windows:

```json
{
  "gecho.ffmpegPath": "C:\\tools\\ffmpeg\\bin\\ffmpeg.exe"
}
```

> **Security:** The path is validated to reduce command injection risk by rejecting shell metacharacters (`;`, `&`, `|`, `` ` ``, `$`, `>`, `<`). Paths with other characters, including spaces and Unicode, are permitted.

---

### `gecho.outputDirectory`

| | |
|---|---|
| **Type** | `string` |
| **Default** | `"~/gecho-recordings"` |
| **Description** | Default directory for saving recordings. |

When you stop a recording, gEcho opens a save dialog. **Note:** this setting is not currently used to initialize the save dialog location, and `~` is not expanded to the home directory. Configuration in `.vscode/settings.json` is accepted for forward-compatibility, but the save dialog starts in the system default location.

```json
{
  "gecho.outputDirectory": "~/Documents/gecho-output"
}
```

---

### `gecho.gif.fps`

| | |
|---|---|
| **Type** | `number` |
| **Default** | `10` |
| **Description** | Frames per second used when capturing the screen to an intermediate MP4 file. |

Higher values produce smoother source captures but increase MP4 file size and processing time. **Note:** this setting controls the screen capture (MP4) frame rate only — the final GIF playback FPS is determined by the `gecho.gif.quality` preset during conversion.

```json
{
  "gecho.gif.fps": 15
}
```

---

### `gecho.gif.width`

| | |
|---|---|
| **Type** | `number` |
| **Default** | `1920` |
| **Description** | GIF output width in pixels. Height scales proportionally. |

Reducing the width produces smaller GIF files. Common values:

| Width | Use Case |
|-------|----------|
| `1920` | Full HD — high quality, large file |
| `1280` | HD — good balance for README images |
| `800` | Compact — smaller files for docs |

```json
{
  "gecho.gif.width": 1280
}
```

---

### `gecho.gif.quality`

| | |
|---|---|
| **Type** | `string` (enum) |
| **Default** | `"high"` |
| **Allowed values** | `"high"`, `"balanced"`, `"small"` |
| **Description** | GIF quality preset. |

Each preset adjusts internal ffmpeg parameters:

| Preset | Effective FPS | Scaling | Best For |
|--------|--------------|---------|----------|
| `high` | 15 fps | None | Final output, README demos |
| `balanced` | 10 fps | None | General use, CI pipelines |
| `small` | 8 fps | Scale to 1280px wide | File-size-sensitive contexts |

```json
{
  "gecho.gif.quality": "balanced"
}
```

> **Note:** The quality preset determines the GIF output FPS and scaling. `gecho.gif.fps` and `gecho.gif.width` only affect the intermediate MP4 capture, not the final GIF conversion.

---

### `gecho.replay.speed`

| | |
|---|---|
| **Type** | `number` |
| **Default** | `1.0` |
| **Description** | Replay speed multiplier. |

Controls how fast echo steps are replayed. Values greater than 1.0 speed up replay; values less than 1.0 slow it down. Minimum value is 0.1.

| Value | Effect |
|-------|--------|
| `0.5` | Half speed (slower, more dramatic) |
| `1.0` | Original recorded speed |
| `2.0` | Double speed (faster, saves time in CI) |
| `5.0` | Very fast (for testing echoes) |

The speed multiplier affects:
- `wait` step durations
- `type` step per-character delays

```json
{
  "gecho.replay.speed": 1.5
}
```

## Workspace vs User Settings

All gEcho settings can be configured at the **User** level (global) or **Workspace** level (per-project).

- **User settings** apply to all VS Code windows.
- **Workspace settings** override user settings for a specific project. Useful for per-repo GIF output directories or quality presets.

To set workspace-level settings, add them to `.vscode/settings.json` in your project:

```json
{
  "gecho.outputDirectory": "./docs/images",
  "gecho.gif.quality": "balanced"
}
```
