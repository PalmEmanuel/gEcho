#!/usr/bin/env node
// Fake ffmpeg that always fails (exit 1) with stderr output
// Used for testing WebM conversion failure path
process.stderr.write('Error: WebM encoding failed - simulated error for testing\n');
process.stderr.write('Additional stderr content to verify truncation works\n');
process.exit(1);
