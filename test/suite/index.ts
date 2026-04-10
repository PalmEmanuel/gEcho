import * as path from 'path';
import Mocha = require('mocha');
import { glob } from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true });
  const testsRoot = path.resolve(__dirname, '.');

  return new Promise((resolve, reject) => {
    // Match all *.test.js files including those in subdirectories (e.g. integration/).
    // Exclude mocha-only tests that patch Module.prototype.require via vscodeMock —
    // in the extension host real vscode is available so the mock is skipped, causing
    // these tests to use real VS Code config instead of the test doubles.
    glob('**/*.test.js', { cwd: testsRoot }).then((files) => {
      files
        .filter((f) =>
          !f.includes('gifConverter.integration') &&
          !f.includes('screenCapture.integration') &&
          !f.includes('outputConverter.test')
        )
        .forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        mocha.run((failures: number) => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            resolve();
          }
        });
      } catch (err) {
        reject(err);
      }
    }).catch(reject);
  });
}
