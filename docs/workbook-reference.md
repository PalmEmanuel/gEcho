# Workbook Format Reference

gEcho workbooks are human-readable JSON files with a `.gecho.json` extension. They describe a sequence of VS Code interactions that can be replayed deterministically.

## File Structure

```jsonc
{
  "version": "1.0",
  "metadata": {
    "name": "My Demo",
    "description": "Optional description of the demo",
    "windowSize": { "width": 1920, "height": 1080 },
    "created": "2026-04-08T00:00:00.000Z",
    "version": "1.0.0"
  },
  "steps": [
    // Array of step objects
  ]
}
```

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `string` | ✅ | Schema version. Must be `"1.0"`. |
| `metadata` | `object` | ✅ | Descriptive information about the workbook. |
| `steps` | `array` | ✅ | Ordered list of steps to execute during replay. |

### Metadata Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Display name for the workbook. |
| `description` | `string` | | What the workbook demonstrates. |
| `windowSize` | `object` | | Target VS Code window dimensions (`width` and `height` in pixels). |
| `created` | `string` | | ISO 8601 timestamp of when the workbook was created. |
| `version` | `string` | | User-defined version string (e.g., `"1.0.0"`). |

## Step Types

Every step object has a `type` field that determines its behavior. There are 8 step types.

---

### `type` — Type Text

Types text character-by-character into the active editor, simulating natural keyboard input.

```json
{ "type": "type", "text": "console.log('hello');", "delay": 55 }
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | `"type"` | ✅ | | Step type identifier. |
| `text` | `string` | ✅ | | Text to type character by character. |
| `delay` | `number` | | `55` | Per-character delay in milliseconds. Controls typing speed. |

**Notes:**
- The `delay` value is adjusted by the `gecho.replay.speed` setting during replay.
- Multi-line text is supported — include `\n` for newlines.
- During echo recording, consecutive single-character insertions within 300 ms are coalesced into a single `type` step, preserving your natural typing rhythm.

---

### `command` — Execute a VS Code Command

Executes any VS Code command by its identifier.

```json
{ "type": "command", "id": "editor.action.formatDocument" }
```

With arguments:

```json
{ "type": "command", "id": "workbench.action.openSettings", "args": "gecho" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"command"` | ✅ | Step type identifier. |
| `id` | `string` | ✅ | VS Code command ID (e.g., `workbench.action.files.save`). |
| `args` | `any` | | Optional arguments passed to the command. |

**Common commands:**

| Command ID | Action |
|-----------|--------|
| `workbench.action.files.newUntitledFile` | Create a new untitled file |
| `workbench.action.files.save` | Save the active file |
| `editor.action.formatDocument` | Format the document |
| `workbench.action.terminal.toggleTerminal` | Toggle the integrated terminal |
| `workbench.action.showCommands` | Open the Command Palette |

> **Security:** Command IDs are validated against an allowlist pattern during replay. Only alphanumeric characters, dots, hyphens, and underscores are permitted.

---

### `key` — Press a Key or Shortcut

Simulates a keyboard key press or key combination.

```json
{ "type": "key", "key": "Ctrl+Shift+P" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"key"` | ✅ | Step type identifier. |
| `key` | `string` | ✅ | Key or key combination (e.g., `escape`, `Ctrl+Z`, `Shift+Alt+F`). |

**Recognized key mappings:**

| Key | VS Code Command |
|-----|----------------|
| `Ctrl+Shift+P` / `Cmd+Shift+P` | `workbench.action.showCommands` |
| `Ctrl+P` / `Cmd+P` | `workbench.action.quickOpen` |
| `Ctrl+Z` / `Cmd+Z` | `undo` |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | `redo` |
| `Tab` | `tab` |
| `Enter` | `acceptSelectedSuggestion` |
| `Escape` | `cancelSelection` |

For single printable characters, gEcho types the character directly. Unrecognized multi-key combinations are skipped.

---

### `select` — Set Text Selection

Sets the text selection in the active editor by specifying anchor and active (cursor) positions.

```json
{ "type": "select", "anchor": [0, 0], "active": [0, 20] }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"select"` | ✅ | Step type identifier. |
| `anchor` | `[line, character]` | ✅ | Start of selection (zero-based). |
| `active` | `[line, character]` | ✅ | End of selection / cursor position (zero-based). |

**Notes:**
- Positions are zero-based: `[0, 0]` is the first character of the first line.
- If `anchor` equals `active`, the selection is collapsed (just a cursor position).
- To select an entire line, use `[line, 0]` for anchor and `[line, lineLength]` for active.

---

### `wait` — Pause Execution

Pauses replay for a specified duration, optionally waiting for VS Code to become idle.

```json
{ "type": "wait", "ms": 2000 }
```

With idle condition:

```json
{ "type": "wait", "ms": 1000, "until": "idle" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"wait"` | ✅ | Step type identifier. |
| `ms` | `number` | ✅ | Duration to wait in milliseconds. |
| `until` | `"idle"` | | Wait for VS Code to become idle before continuing. |

**Notes:**
- The `ms` value is adjusted by the `gecho.replay.speed` setting.
- Use `"until": "idle"` after commands that trigger async operations (e.g., IntelliSense, file loading).
- A `wait` step at the end of your workbook gives the viewer time to see the final result in the GIF.

---

### `openFile` — Open a File

Opens a file in the VS Code editor.

```json
{ "type": "openFile", "path": "src/index.ts" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"openFile"` | ✅ | Step type identifier. |
| `path` | `string` | ✅ | Path to the file, relative to the workspace root. |

**Notes:**
- Paths are relative to the workspace root by default.
- The path is sanitized during replay to prevent directory traversal attacks.
- The file must exist in the workspace for the step to succeed.

---

### `paste` — Paste Text

Pastes text into the active editor, replacing the current selection (if any).

```json
{ "type": "paste", "text": "const greeting = 'hello world';" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"paste"` | ✅ | Step type identifier. |
| `text` | `string` | ✅ | Text to paste into the editor. |

**Notes:**
- Unlike `type`, paste inserts all text at once (no character-by-character animation).
- Replaces the current selection if text is selected.
- Useful for inserting large blocks of code without a slow typing animation.

---

### `scroll` — Scroll the Editor

Scrolls the active editor up or down by a specified number of lines.

```json
{ "type": "scroll", "direction": "down", "lines": 10 }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"scroll"` | ✅ | Step type identifier. |
| `direction` | `"up"` \| `"down"` | ✅ | Scroll direction. |
| `lines` | `integer` | ✅ | Number of lines to scroll (minimum 1). |

---

## JSON Schema

gEcho ships with a JSON Schema at `schemas/gecho-v1.schema.json`. VS Code automatically validates `.gecho.json` files against this schema, providing IntelliSense, auto-completion, and error highlighting as you edit workbooks.

## Example Workbook

A complete example workbook demonstrating all step types is available at [`workbooks/example.gecho.json`](../workbooks/example.gecho.json).

```jsonc
{
  "version": "1.0",
  "metadata": {
    "name": "Example Workbook",
    "description": "Demonstrates all gEcho step types",
    "created": "2026-04-08T00:00:00.000Z"
  },
  "steps": [
    { "type": "openFile", "path": "src/extension.ts" },
    { "type": "wait", "ms": 500 },
    { "type": "type", "text": "// Hello from gEcho!", "delay": 55 },
    { "type": "command", "id": "workbench.action.files.save" },
    { "type": "select", "anchor": [0, 0], "active": [0, 20] },
    { "type": "key", "key": "escape" },
    { "type": "paste", "text": "// Pasted text" },
    { "type": "scroll", "direction": "down", "lines": 3 },
    { "type": "wait", "ms": 1000, "until": "idle" }
  ]
}
```

## Tips for Authoring Workbooks

- **Start with a recording**, then clean up the JSON. The echo recorder captures your natural timing, which you can adjust in the JSON.
- **Add `wait` steps** after commands that trigger async operations (IntelliSense, file loading, formatting).
- **Use `openFile`** at the beginning to ensure the correct file is active.
- **End with a `wait`** so the final state is visible in the GIF output.
- **Keep `delay` values between 30–80 ms** for natural-looking typing in GIFs.
- **Use `paste`** for large code blocks to avoid lengthy typing animations.
