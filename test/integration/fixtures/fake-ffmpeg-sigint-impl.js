'use strict';
// Fake ffmpeg — stays alive until SIGINT/SIGTERM, then writes file and exits 0.
// Used by integration tests to verify ScreenCapture sends SIGINT and awaits clean shutdown.
const fs = require('fs');

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

// Register signal handlers BEFORE writing to stderr. The stderr write is what
// tells the parent process we are "ready" — on fast Linux CI runners, the
// parent can receive that notification and immediately send SIGINT. If the
// handler were registered after the write, there would be a race where SIGINT
// arrives before the handler is set, causing Node.js to use the default
// disposition (signal-kill, code=null) instead of calling writeAndExit.
process.on('SIGINT', writeAndExit);
process.on('SIGTERM', writeAndExit);

// Safety timeout so tests don't hang forever if signal never arrives
const safetyTimer = setTimeout(writeAndExit, 8000);
safetyTimer.unref();

// Keep event loop alive until signal
const keepAlive = setInterval(() => {}, 50);
process.on('exit', () => clearInterval(keepAlive));

// Signal readiness to parent last — SIGINT handler is already armed by now.
process.stderr.write('fake ffmpeg started\n');
