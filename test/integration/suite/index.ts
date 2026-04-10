import * as path from 'path';
import Mocha = require('mocha');
import { glob } from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true, timeout: 20000 });

  // Load integration test files from the parent directory (out/test/integration/)
  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((resolve, reject) => {
    glob('*.test.js', { cwd: testsRoot }).then((files) => {
      files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        mocha.run((failures: number) => {
          if (failures > 0) {
            reject(new Error(`${failures} integration test(s) failed.`));
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
