import * as path from 'node:path';

// Validates that a file path from a workbook step is safe to use
// Prevents path traversal attacks (../../etc/passwd style)
export function sanitizeFilePath(filePath: string, workspaceRoot?: string): string {
  // Normalize path separators
  const normalized = path.normalize(filePath);
  // Reject absolute paths that escape workspace
  if (path.isAbsolute(normalized) && workspaceRoot) {
    const normalizedRoot = path.normalize(workspaceRoot);
    const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : normalizedRoot + path.sep;
    if (!normalized.startsWith(rootWithSep) && normalized !== normalizedRoot) {
      throw new Error(`Path traversal attempt blocked: ${filePath}`);
    }
  }
  // Reject paths that try to escape with ../
  if (normalized.includes('..')) {
    throw new Error(`Path traversal attempt blocked: ${filePath}`);
  }
  return normalized;
}

// Validates that a VS Code command ID from a workbook step is safe
// Prevents execution of dangerous system commands
export function sanitizeCommandId(commandId: string): string {
  // Command IDs should only contain alphanumeric, dots, hyphens, underscores
  if (!/^[a-zA-Z0-9._-]+$/.test(commandId)) {
    throw new Error(`Invalid command ID: ${commandId}`);
  }
  return commandId;
}

// Validates ffmpegPath config value to prevent command injection
// Only allows safe path characters (no shell metacharacters)
export function sanitizeFfmpegPath(ffmpegPath: string): string {
  // Allow: alphanumeric, path separators, dots, hyphens, underscores, spaces
  // Block: semicolons, pipes, backticks, $(), &&, ||, redirects
  if (/[;&|`$><\n\r]/.test(ffmpegPath)) {
    throw new Error(`Invalid ffmpeg path — shell metacharacters not allowed: ${ffmpegPath}`);
  }
  return ffmpegPath;
}
