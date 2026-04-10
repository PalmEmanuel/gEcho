import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { validateEcho, readEcho, writeEcho } from '../../src/echo/index.js';
import type { Echo, StepType } from '../../src/types/echo.js';
import { ECHO_VERSION } from '../../src/types/echo.js';

function makeEcho(): Echo {
  return {
    version: '1.0',
    metadata: { name: 'test' },
    steps: [],
  };
}

function makeFullEcho(): Echo {
  const steps: StepType[] = [
    { type: 'type', text: 'hello world' },
    { type: 'command', id: 'editor.action.formatDocument' },
    { type: 'key', key: 'ctrl+s' },
    { type: 'select', anchor: [0, 0], active: [1, 5] },
    { type: 'wait', ms: 500 },
    { type: 'openFile', path: 'src/main.ts' },
    { type: 'paste', text: 'pasted text' },
    { type: 'scroll', direction: 'down', lines: 3 },
  ];
  return {
    version: '1.0',
    metadata: { name: 'full-echo', description: 'All step types' },
    steps,
  };
}

describe('validateEcho', () => {
  it('returns false for null', () => {
    assert.strictEqual(validateEcho(null), false);
  });

  it('returns false for empty object', () => {
    assert.strictEqual(validateEcho({}), false);
  });

  it('returns false when missing version', () => {
    assert.strictEqual(validateEcho({ metadata: { name: 'x' }, steps: [] }), false);
  });

  it('returns false when version is not 1.0', () => {
    assert.strictEqual(validateEcho({ version: '2.0', metadata: { name: 'x' }, steps: [] }), false);
  });

  it('returns false when missing metadata', () => {
    assert.strictEqual(validateEcho({ version: '1.0', steps: [] }), false);
  });

  it('returns false when metadata.name is not a string', () => {
    assert.strictEqual(validateEcho({ version: '1.0', metadata: { name: 42 }, steps: [] }), false);
  });

  it('returns false when steps is not an array', () => {
    assert.strictEqual(validateEcho({ version: '1.0', metadata: { name: 'x' }, steps: 'bad' }), false);
  });

  it('returns true for minimal valid echo', () => {
    assert.strictEqual(validateEcho(makeEcho()), true);
  });

  it('returns true for echo with all step types', () => {
    assert.strictEqual(validateEcho(makeFullEcho()), true);
  });

  it('returns false for scroll step missing direction', () => {
    const bad = {
      version: '1.0',
      metadata: { name: 'x' },
      steps: [{ type: 'scroll', lines: 3 }],
    };
    assert.strictEqual(validateEcho(bad), false);
  });

  it('returns false for scroll step with invalid direction', () => {
    const bad = {
      version: '1.0',
      metadata: { name: 'x' },
      steps: [{ type: 'scroll', lines: 3, direction: 'sideways' }],
    };
    assert.strictEqual(validateEcho(bad), false);
  });
});

describe('echo roundtrip', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gecho-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes and reads back an echo', async () => {
    const echo = makeEcho();
    const filePath = path.join(tmpDir, 'test.gecho.json');
    await writeEcho(echo, filePath);
    const result = await readEcho(filePath);
    assert.deepStrictEqual(result, echo);
  });

  it('preserves all step types through roundtrip', async () => {
    const echo = makeFullEcho();
    const filePath = path.join(tmpDir, 'full.gecho.json');
    await writeEcho(echo, filePath);
    const result = await readEcho(filePath);
    assert.deepStrictEqual(result, echo);
  });

  it('throws on reading invalid JSON file', async () => {
    const filePath = path.join(tmpDir, 'bad.gecho.json');
    await fs.writeFile(filePath, 'this is not json', 'utf8');
    await assert.rejects(() => readEcho(filePath));
  });

  it('throws on reading valid JSON that fails validation', async () => {
    const filePath = path.join(tmpDir, 'invalid.gecho.json');
    await fs.writeFile(filePath, JSON.stringify({ not: 'an echo' }), 'utf8');
    await assert.rejects(() => readEcho(filePath));
  });
});

