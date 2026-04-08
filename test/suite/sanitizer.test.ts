import * as assert from 'assert';
import { sanitizeFilePath, sanitizeCommandId, sanitizeFfmpegPath } from '../../src/security/sanitizer.js';

describe('sanitizeFilePath', () => {
  it('returns normalized string for valid relative path', () => {
    const result = sanitizeFilePath('src/foo.ts');
    assert.strictEqual(typeof result, 'string');
  });

  it('throws with "traversal" for path containing ../', () => {
    assert.throws(
      () => sanitizeFilePath('../etc/passwd'),
      /traversal/
    );
  });

  it('throws for path containing .. alone', () => {
    assert.throws(
      () => sanitizeFilePath('src/../../../etc/passwd'),
      /traversal/
    );
  });

  it('returns path for absolute path within workspaceRoot', () => {
    const workspaceRoot = '/home/user/project';
    const result = sanitizeFilePath('/home/user/project/src/main.ts', workspaceRoot);
    assert.strictEqual(typeof result, 'string');
  });

  it('throws with "traversal" for absolute path outside workspaceRoot', () => {
    const workspaceRoot = '/home/user/project';
    assert.throws(
      () => sanitizeFilePath('/etc/passwd', workspaceRoot),
      /traversal/
    );
  });
});

describe('sanitizeCommandId', () => {
  it('returns same string for valid command workbench.action.files.save', () => {
    const result = sanitizeCommandId('workbench.action.files.save');
    assert.strictEqual(result, 'workbench.action.files.save');
  });

  it('returns same string for valid command gecho.startEchoRecording', () => {
    const result = sanitizeCommandId('gecho.startEchoRecording');
    assert.strictEqual(result, 'gecho.startEchoRecording');
  });

  it('throws with "Invalid command ID" for command with space', () => {
    assert.throws(
      () => sanitizeCommandId('bad command'),
      /Invalid command ID/
    );
  });

  it('throws for command with $(rm -rf /)', () => {
    assert.throws(
      () => sanitizeCommandId('$(rm -rf /)'),
      /Invalid command ID/
    );
  });

  it('throws for command with semicolon', () => {
    assert.throws(
      () => sanitizeCommandId('cmd;rm -rf /'),
      /Invalid command ID/
    );
  });
});

describe('sanitizeFfmpegPath', () => {
  it('returns ffmpeg for plain ffmpeg', () => {
    const result = sanitizeFfmpegPath('ffmpeg');
    assert.strictEqual(result, 'ffmpeg');
  });

  it('returns path for /usr/local/bin/ffmpeg', () => {
    const result = sanitizeFfmpegPath('/usr/local/bin/ffmpeg');
    assert.strictEqual(result, '/usr/local/bin/ffmpeg');
  });

  it('throws with "shell metacharacters" for ffmpeg; rm -rf /', () => {
    assert.throws(
      () => sanitizeFfmpegPath('ffmpeg; rm -rf /'),
      /shell metacharacters/
    );
  });

  it('throws for path with pipe', () => {
    assert.throws(
      () => sanitizeFfmpegPath('ffmpeg | cat'),
      /shell metacharacters/
    );
  });

  it('throws for path with backtick', () => {
    assert.throws(
      () => sanitizeFfmpegPath('ffmpeg`whoami`'),
      /shell metacharacters/
    );
  });

  it('throws for path with $()', () => {
    assert.throws(
      () => sanitizeFfmpegPath('ffmpeg$(id)'),
      /shell metacharacters/
    );
  });
});
