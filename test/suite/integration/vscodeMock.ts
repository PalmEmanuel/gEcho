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
    showWarningMessage: (_msg: string, ..._actions: string[]): Promise<string | undefined> =>
      Promise.resolve(undefined),
    showInformationMessage: (_msg: string, ..._actions: string[]): Promise<string | undefined> =>
      Promise.resolve(undefined),
    showErrorMessage: (_msg: string, ..._actions: string[]): Promise<string | undefined> =>
      Promise.resolve(undefined),
    withProgress: async <T>(
      _opts: unknown,
      cb: (progress: { report: (v: { message?: string }) => void }) => Promise<T>
    ): Promise<T> => cb({ report: () => {} }),
    showTextDocument: () => Promise.resolve(undefined),
    onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    activeTextEditor: undefined,
  },
  env: {
    openExternal: (_uri: unknown): Promise<boolean> => Promise.resolve(true),
  },
  Uri: {
    file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }),
    parse: (s: string) => ({ toString: () => s }),
  },
  ProgressLocation: { Notification: 15, SourceControl: 1, Window: 10 },
  commands: {
    executeCommand: () => Promise.resolve(undefined),
  },
};

// Intercept require('vscode') via Module.prototype.require — works on all
// Node 18+ versions where _resolveFilename is a getter-only property.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const NodeCjs = require('module') as { prototype: { require: (id: string) => unknown } };
const origRequire = NodeCjs.prototype.require;

let isPatched = false;

function hasRealVscodeModule(): boolean {
  try {
    origRequire.call(module, 'vscode');
    return true;
  } catch {
    return false;
  }
}

export function installVscodeMock(): void {
  if (isPatched || hasRealVscodeModule()) {
    return;
  }

  NodeCjs.prototype.require = function mockedRequire(id: string) {
    if (id === 'vscode') {
      return vscodeStub;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, prefer-rest-params
    return origRequire.apply(this, arguments as unknown as [string]);
  };
  isPatched = true;
}

export function restoreVscodeMock(): void {
  if (!isPatched) {
    return;
  }

  NodeCjs.prototype.require = origRequire;
  isPatched = false;
}

installVscodeMock();
