'use strict';
// Fake ffmpeg — exits immediately after writing a minimal MP4-like file to the output path.
// Used by integration tests to verify ScreenCapture's spawn/stop lifecycle without TCC.
const fs = require('fs');

process.stderr.write('fake ffmpeg started\n');

const outputPath = process.argv[process.argv.length - 1];
// Minimal MP4 ftyp box (24 bytes) so the file is non-empty and identifiable
const header = Buffer.from([
  0x00, 0x00, 0x00, 0x18,              // box size = 24
  0x66, 0x74, 0x79, 0x70,              // 'ftyp'
  0x69, 0x73, 0x6f, 0x6d,              // major brand 'isom'
  0x00, 0x00, 0x00, 0x00,              // minor version
  0x69, 0x73, 0x6f, 0x6d,              // compatible brand 'isom'
  0x69, 0x73, 0x6f, 0x32,              // compatible brand 'iso2'
]);
try { fs.writeFileSync(outputPath, header); } catch (_e) {}
process.exit(0);
