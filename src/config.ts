import * as vscode from 'vscode';
import type { GifConfig, ReplayConfig } from './types/index.js';

export function getConfig() {
  const cfg = vscode.workspace.getConfiguration('gecho');
  return {
    ffmpegPath: cfg.get<string>('ffmpegPath', 'ffmpeg'),
    outputDirectory: cfg.get<string>('outputDirectory', '~/gecho-recordings'),
    gif: {
      fps: cfg.get<number>('gif.fps', 10),
      width: cfg.get<number>('gif.width', 1920),
      quality: cfg.get<'high' | 'balanced' | 'small'>('gif.quality', 'high'),
    } satisfies GifConfig,
    replay: {
      speed: cfg.get<number>('replay.speed', 1.0),
      captureGif: false,
    } satisfies ReplayConfig,
  };
}
