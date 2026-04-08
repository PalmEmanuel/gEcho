import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { validateWorkbook, readWorkbook, writeWorkbook } from '../../src/workbook/index.js';
import type { Workbook, StepType } from '../../src/types/workbook.js';
import { WORKBOOK_VERSION } from '../../src/types/workbook.js';

function makeWorkbook(): Workbook {
  return {
    version: '1.0',
    metadata: { name: 'test' },
    steps: [],
  };
}

function makeFullWorkbook(): Workbook {
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
    metadata: { name: 'full-workbook', description: 'All step types' },
    steps,
  };
}

describe('validateWorkbook', () => {
  it('returns false for null', () => {
    assert.strictEqual(validateWorkbook(null), false);
  });

  it('returns false for empty object', () => {
    assert.strictEqual(validateWorkbook({}), false);
  });

  it('returns false when missing version', () => {
    assert.strictEqual(validateWorkbook({ metadata: { name: 'x' }, steps: [] }), false);
  });

  it('returns false when version is not 1.0', () => {
    assert.strictEqual(validateWorkbook({ version: '2.0', metadata: { name: 'x' }, steps: [] }), false);
  });

  it('returns false when missing metadata', () => {
    assert.strictEqual(validateWorkbook({ version: '1.0', steps: [] }), false);
  });

  it('returns false when metadata.name is not a string', () => {
    assert.strictEqual(validateWorkbook({ version: '1.0', metadata: { name: 42 }, steps: [] }), false);
  });

  it('returns false when steps is not an array', () => {
    assert.strictEqual(validateWorkbook({ version: '1.0', metadata: { name: 'x' }, steps: 'bad' }), false);
  });

  it('returns true for minimal valid workbook', () => {
    assert.strictEqual(validateWorkbook(makeWorkbook()), true);
  });

  it('returns true for workbook with all step types', () => {
    assert.strictEqual(validateWorkbook(makeFullWorkbook()), true);
  });
});

describe('workbook roundtrip', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gecho-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes and reads back a workbook', async () => {
    const wb = makeWorkbook();
    const filePath = path.join(tmpDir, 'test.gecho.json');
    await writeWorkbook(wb, filePath);
    const result = await readWorkbook(filePath);
    assert.deepStrictEqual(result, wb);
  });

  it('preserves all step types through roundtrip', async () => {
    const wb = makeFullWorkbook();
    const filePath = path.join(tmpDir, 'full.gecho.json');
    await writeWorkbook(wb, filePath);
    const result = await readWorkbook(filePath);
    assert.deepStrictEqual(result, wb);
  });

  it('throws on reading invalid JSON file', async () => {
    const filePath = path.join(tmpDir, 'bad.gecho.json');
    await fs.writeFile(filePath, 'this is not json', 'utf8');
    await assert.rejects(() => readWorkbook(filePath));
  });

  it('throws on reading valid JSON that fails validation', async () => {
    const filePath = path.join(tmpDir, 'invalid.gecho.json');
    await fs.writeFile(filePath, JSON.stringify({ not: 'a workbook' }), 'utf8');
    await assert.rejects(() => readWorkbook(filePath));
  });
});
