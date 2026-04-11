import type { StepType } from './echo.js';

export type RecordingMode = 'echo' | 'gif' | 'combined';

export type RecordingState = 'idle' | 'countdown' | 'starting-gif' | 'recording' | 'recording-gif' | 'saving-gif' | 'replaying' | 'replaying-gif';

export interface RecordingSession {
  mode: RecordingMode;
  startTime: number;
  steps: StepType[];
}

export interface GifConfig {
  fps: number;
  width: number;
  quality: 'high' | 'balanced' | 'small';
}

export interface ReplayConfig {
  speed: number;
  captureGif: boolean;
  cancelOnInput?: boolean;
}

export type Platform = 'darwin' | 'linux' | 'win32';
