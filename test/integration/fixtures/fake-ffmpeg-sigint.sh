#!/bin/sh
# Unix wrapper for fake-ffmpeg-sigint-impl.js — exec ensures Node.js gets SIGINT directly.
exec node "$(dirname "$0")/fake-ffmpeg-sigint-impl.js" "$@"
