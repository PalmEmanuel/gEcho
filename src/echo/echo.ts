import { readFile, writeFile } from 'node:fs/promises';
import type { Echo } from '../types/index.js';
import { isFocusTarget } from '../types/index.js';

export async function readEcho(filePath: string): Promise<Echo> {
  const raw = await readFile(filePath, 'utf-8');
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new Error(`Failed to parse echo at "${filePath}": ${String(err)}`, { cause: err });
  }
  if (!validateEcho(data)) {
    throw new Error(
      `Invalid echo format at "${filePath}": expected version "1.0", metadata.name string, and steps array`
    );
  }
  return data;
}

export async function writeEcho(echo: Echo, filePath: string): Promise<void> {
  const json = JSON.stringify(echo, null, 2);
  await writeFile(filePath, json, 'utf-8');
}

export function validateEcho(data: unknown): data is Echo {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  if (obj['version'] !== '1.0') {
    return false;
  }
  if (typeof obj['metadata'] !== 'object' || obj['metadata'] === null) {
    return false;
  }
  const metadata = obj['metadata'] as Record<string, unknown>;
  if (typeof metadata['name'] !== 'string') {
    return false;
  }
  if (!Array.isArray(obj['steps'])) {
    return false;
  }
  // Validate each step's required fields
  for (const step of obj['steps'] as unknown[]) {
    if (!isValidStep(step)) {
      return false;
    }
  }
  return true;
}

function isValidStep(step: unknown): boolean {
  if (typeof step !== 'object' || step === null) return false;
  const s = step as Record<string, unknown>;
  if (typeof s['type'] !== 'string') return false;
  switch (s['type']) {
    case 'type':
      return typeof s['text'] === 'string';
    case 'command':
      return typeof s['id'] === 'string';
    case 'key':
      return typeof s['key'] === 'string';
    case 'select':
      return Array.isArray(s['anchor']) && s['anchor'].length === 2 &&
             Array.isArray(s['active']) && s['active'].length === 2;
    case 'wait':
      return typeof s['ms'] === 'number';
    case 'openFile':
      return typeof s['path'] === 'string';
    case 'paste':
      return typeof s['text'] === 'string';
    case 'scroll':
      return typeof s['lines'] === 'number' &&
             (s['direction'] === 'up' || s['direction'] === 'down');
    case 'focus':
      return isFocusTarget(s['target']);
    default:
      return false;
  }
}
