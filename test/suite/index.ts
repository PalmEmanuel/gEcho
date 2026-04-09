import * as path from 'path';
import Mocha = require('mocha');
import { glob } from 'glob';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'bdd', color: true });
  const testsRoot = path.resolve(__dirname, '.');

  return new Promise((resolve, reject) => {
    // Match all *.test.js files including those in subdirectories (e.g. integration/).
    glob('**/*.test.js', { cwd: testsRoot }).then((files) => {
      files
        .filter((f) => !f.endsWith('.integration.test.js'))
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
