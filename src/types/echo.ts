/**
 * Echo types — discriminated union steps and echo schema.
 */

export interface TypeStep {
  type: 'type';
  text: string;
  delay?: number;
}

export interface CommandStep {
  type: 'command';
  id: string;
  args?: unknown;
}

export interface KeyStep {
  type: 'key';
  key: string;
}

export type SelectStep =
  | { type: 'select'; anchor: [number, number]; active: [number, number]; selections?: never }
  | { type: 'select'; selections: Array<{ anchor: [number, number]; active: [number, number] }>; anchor?: never; active?: never };

export interface WaitStep {
  type: 'wait';
  ms: number;
  until?: 'idle';
}

export interface OpenFileStep {
  type: 'openFile';
  path: string;
}

export interface PasteStep {
  type: 'paste';
  text: string;
}

export interface ScrollStep {
  type: 'scroll';
  direction: 'up' | 'down';
  lines: number;
}

export type StepType =
  | TypeStep
  | CommandStep
  | KeyStep
  | SelectStep
  | WaitStep
  | OpenFileStep
  | PasteStep
  | ScrollStep;

export interface EchoMetadata {
  name: string;
  description?: string;
  windowSize?: { width: number; height: number };
  created?: string;
  version?: string;
}

export interface Echo {
  version: string;
  metadata: EchoMetadata;
  steps: StepType[];
}

export const ECHO_VERSION = '1.0';
export const ECHO_FILE_EXTENSION = '.echo.json';
