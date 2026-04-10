#!/bin/sh
# Unix wrapper for fake-ffmpeg-impl.js — uses exec so the Node.js process
# inherits the shell's PID. ScreenCapture sends SIGINT to this PID, so
# exec ensures the signal reaches Node.js directly.
exec node "$(dirname "$0")/fake-ffmpeg-impl.js" "$@"
