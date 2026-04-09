/**
 * Minimal vscode stub for plain Mocha integration tests.
 * Patches Module.prototype.require so that require('vscode') returns this stub
 * instead of throwing. Must be the FIRST import in any Mocha test file that
 * transitively loads a source module depending on the vscode API.
 */

/**
 * Mutable config overrides that tests can populate before calling source code
 * that reads from `vscode.workspace.getConfiguration()`.
 * Keys mirror the gecho config property names (e.g. 'ffmpegPath').
 */
export const mockConfigValues: Record<string, unknown> = {};

/** Clears all per-test config overrides. */
export function clearMockConfig(): void {
  for (const k of Object.keys(mockConfigValues)) {
    delete mockConfigValues[k];
  }
}

const vscodeStub = {
  workspace: {
    getConfiguration: (_section?: string) => ({
      get<T>(key: string, defaultValue: T): T {
        return (key in mockConfigValues)
          ? (mockConfigValues[key] as T)
          : defaultValue;
      },
    }),
    asRelativePath: (uri: unknown): string => String(uri),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    findFiles: async () => [],
    openTextDocument: async () => ({}),
    applyEdit: async () => true,
    workspaceFolders: undefined,
  },
  window: {
    showWarningMessage: (_msg: string) => Promise.resolve(undefined),
    showTextDocument: () => Promise.resolve(undefined),
    onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    activeTextEditor: undefined,
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
  },
  commands: {
    executeCommand: () => Promise.resolve(undefined),
  },
};

// Intercept require('vscode') via Module.prototype.require — works on all
// Node 18+ versions where _resolveFilename is a getter-only property.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const NodeCjs = require('module') as { prototype: { require: (id: string) => unknown } };
const origRequire = NodeCjs.prototype.require;
NodeCjs.prototype.require = function mockedRequire(id: string) {
  if (id === 'vscode') {
    return vscodeStub;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, prefer-rest-params
  return origRequire.apply(this, arguments as unknown as [string]);
};
