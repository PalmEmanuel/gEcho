import * as assert from 'assert';
import { WORKBOOK_VERSION, WORKBOOK_FILE_EXTENSION } from '../../src/types/workbook.js';
import type {
  TypeStep,
  CommandStep,
  KeyStep,
  SelectStep,
  WaitStep,
  OpenFileStep,
  PasteStep,
  ScrollStep,
  StepType,
} from '../../src/types/workbook.js';
import { validateWorkbook } from '../../src/workbook/index.js';

describe('Constants', () => {
  it("WORKBOOK_VERSION is '1.0'", () => {
    assert.strictEqual(WORKBOOK_VERSION, '1.0');
  });

  it("WORKBOOK_FILE_EXTENSION is '.gecho.json'", () => {
    assert.strictEqual(WORKBOOK_FILE_EXTENSION, '.gecho.json');
  });
});

describe('validateWorkbook edge cases', () => {
  it('returns false for TypeStep with non-string text', () => {
    const bad = {
      version: '1.0',
      metadata: { name: 'x' },
      steps: [{ type: 'type', text: 42 }],
    };
    assert.strictEqual(validateWorkbook(bad), false);
  });

  it('returns false for TypeStep missing required text field', () => {
    const bad = {
      version: '1.0',
      metadata: { name: 'x' },
      steps: [{ type: 'type' }],
    };
    assert.strictEqual(validateWorkbook(bad), false);
  });

  it('returns false for step with unknown type', () => {
    const bad = {
      version: '1.0',
      metadata: { name: 'x' },
      steps: [{ type: 'unknown-step' }],
    };
    assert.strictEqual(validateWorkbook(bad), false);
  });
});

describe('StepType discriminated union', () => {
  it('type field distinguishes steps', () => {
    const steps: StepType[] = [
      { type: 'type', text: 'hello' },
      { type: 'command', id: 'workbench.action.files.save' },
      { type: 'key', key: 'escape' },
      { type: 'select', anchor: [0, 0], active: [0, 5] },
      { type: 'wait', ms: 100 },
      { type: 'openFile', path: 'README.md' },
      { type: 'paste', text: 'clip' },
      { type: 'scroll', direction: 'up', lines: 2 },
    ];

    const types = steps.map((s) => s.type);
    assert.deepStrictEqual(types, [
      'type', 'command', 'key', 'select', 'wait', 'openFile', 'paste', 'scroll',
    ]);
  });

  it('TypeStep shape is correctly typed', () => {
    const step: TypeStep = { type: 'type', text: 'hello', delay: 50 };
    assert.strictEqual(step.type, 'type');
    assert.strictEqual(step.text, 'hello');
    assert.strictEqual(step.delay, 50);
  });

  it('CommandStep shape is correctly typed', () => {
    const step: CommandStep = { type: 'command', id: 'some.command', args: { foo: 1 } };
    assert.strictEqual(step.type, 'command');
    assert.strictEqual(step.id, 'some.command');
  });

  it('KeyStep shape is correctly typed', () => {
    const step: KeyStep = { type: 'key', key: 'ctrl+z' };
    assert.strictEqual(step.type, 'key');
    assert.strictEqual(step.key, 'ctrl+z');
  });

  it('SelectStep shape is correctly typed', () => {
    const step: SelectStep = { type: 'select', anchor: [1, 0], active: [1, 10] };
    assert.strictEqual(step.type, 'select');
    assert.deepStrictEqual(step.anchor, [1, 0]);
    assert.deepStrictEqual(step.active, [1, 10]);
  });

  it('WaitStep shape is correctly typed', () => {
    const step: WaitStep = { type: 'wait', ms: 1000, until: 'idle' };
    assert.strictEqual(step.type, 'wait');
    assert.strictEqual(step.ms, 1000);
    assert.strictEqual(step.until, 'idle');
  });

  it('OpenFileStep shape is correctly typed', () => {
    const step: OpenFileStep = { type: 'openFile', path: 'src/index.ts' };
    assert.strictEqual(step.type, 'openFile');
    assert.strictEqual(step.path, 'src/index.ts');
  });

  it('PasteStep shape is correctly typed', () => {
    const step: PasteStep = { type: 'paste', text: 'clipboard content' };
    assert.strictEqual(step.type, 'paste');
    assert.strictEqual(step.text, 'clipboard content');
  });

  it('ScrollStep shape is correctly typed', () => {
    const stepDown: ScrollStep = { type: 'scroll', direction: 'down', lines: 5 };
    const stepUp: ScrollStep = { type: 'scroll', direction: 'up', lines: 1 };
    assert.strictEqual(stepDown.direction, 'down');
    assert.strictEqual(stepUp.direction, 'up');
  });
});
