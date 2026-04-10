#!/usr/bin/env bash
set -euo pipefail

SOURCE="resources/native/darwin/main.swift"
OUT="resources/bin/darwin/gecho-helper"

mkdir -p resources/bin/darwin

echo "Compiling arm64..."
swiftc -O -target arm64-apple-macos11 -o /tmp/gecho-helper-arm64 "$SOURCE"

echo "Compiling x86_64..."
swiftc -O -target x86_64-apple-macos10.15 -o /tmp/gecho-helper-x86_64 "$SOURCE"

echo "Creating universal binary..."
lipo -create -output "$OUT" /tmp/gecho-helper-arm64 /tmp/gecho-helper-x86_64
chmod +x "$OUT"
rm -f /tmp/gecho-helper-arm64 /tmp/gecho-helper-x86_64

echo "✅ Built: $OUT ($(file "$OUT" | grep -o 'Mach-O.*'))"
