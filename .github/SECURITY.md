# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x.x   | ✅         |

## Reporting a Vulnerability

Please report security vulnerabilities by opening a GitHub issue with the "security" label.

## Security Considerations

### Workbook Files
gEcho workbooks (.gecho.json) execute VS Code commands and open files during replay.
Only replay workbooks from sources you trust — a malicious workbook could execute
arbitrary VS Code commands.

### Screen Recording
GIF recordings capture your screen content. Review recorded GIFs before sharing to
ensure no sensitive information (passwords, API keys, personal data) is visible.

### Keystroke Recording
Echo mode records keystrokes. The resulting workbook JSON contains all typed text.
Do not use Echo mode when typing passwords or other sensitive credentials.

### ffmpeg Path
The `gecho.ffmpegPath` setting specifies the path to ffmpeg. Only set this to a
trusted binary path. Shell metacharacters in this setting are rejected.
