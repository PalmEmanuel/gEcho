'use strict';
// Fake ffmpeg — stays alive until SIGINT/SIGTERM, then writes file and exits 0.
// Used by integration tests to verify ScreenCapture sends SIGINT and awaits clean shutdown.
const fs = require('fs');

process.stderr.write('fake ffmpeg started\n');

const outputPath = process.argv[process.argv.length - 1];

const header = Buffer.from([
  0x00, 0x00, 0x00, 0x18,
  0x66, 0x74, 0x79, 0x70,
  0x69, 0x73, 0x6f, 0x6d,
  0x00, 0x00, 0x00, 0x00,
  0x69, 0x73, 0x6f, 0x6d,
  0x69, 0x73, 0x6f, 0x32,
]);

let written = false;
function writeAndExit() {
  if (!written) {
    written = true;
    try { fs.writeFileSync(outputPath, header); } catch (_e) {}
  }
  process.exit(0);
}

process.on('SIGINT', writeAndExit);
process.on('SIGTERM', writeAndExit);

// Safety timeout so tests don't hang forever if signal never arrives
const safetyTimer = setTimeout(writeAndExit, 8000);
safetyTimer.unref();

// Keep event loop alive until signal
const keepAlive = setInterval(() => {}, 50);
process.on('exit', () => clearInterval(keepAlive));
