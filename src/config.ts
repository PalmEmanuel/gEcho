import * as vscode from 'vscode';
import type { GifConfig, ReplayConfig, CropPreset } from './types/index.js';

export function getConfig() {
  const cfg = vscode.workspace.getConfiguration('gecho');
  return {
    ffmpegPath: cfg.get<string>('ffmpegPath', 'ffmpeg'),
    outputDirectory: cfg.get<string>('outputDirectory', '~/gecho-recordings'),
    gif: {
      fps: cfg.get<number>('gif.fps', 10),
      width: cfg.get<number>('gif.width', 1920),
      quality: cfg.get<'high' | 'balanced' | 'small'>('gif.quality', 'high'),
      cropPreset: cfg.get<CropPreset>('gif.cropPreset', 'none'),
      crop: {
        top: cfg.get<number>('gif.crop.top', 0),
        bottom: cfg.get<number>('gif.crop.bottom', 0),
        left: cfg.get<number>('gif.crop.left', 0),
        right: cfg.get<number>('gif.crop.right', 0),
      },
    } satisfies GifConfig,
    replay: {
      speed: cfg.get<number>('replay.speed', 1.0),
      captureGif: false,
      cancelOnInput: cfg.get<boolean>('replay.cancelOnInput', true),
    } satisfies ReplayConfig,
    recording: {
      startupTimeoutMs: cfg.get<number>('recording.startupTimeoutMs', 20_000),
      stopTimeoutMs: cfg.get<number>('recording.stopTimeoutMs', 15_000),
      outputFormat: cfg.get<'gif' | 'mp4' | 'webm'>('recording.outputFormat', 'gif'),
    },
    countdown: {
      seconds: cfg.get<number>('countdown.seconds', 3),
    },
  };
}
