#!/usr/bin/env bash
set -euo pipefail

# Only run on macOS — skip silently on other platforms
if [[ "$(uname)" != "Darwin" ]]; then
  echo "ℹ️  Skipping native build on non-macOS platform ($(uname))"
  exit 0
fi

SOURCE="resources/native/darwin/main.swift"
OUT="resources/bin/darwin/gecho-helper"

mkdir -p resources/bin/darwin

# Use a temp directory to avoid clobbering concurrent builds.
TMPDIR_BUILD="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_BUILD"' EXIT

ARM64_OBJ="$TMPDIR_BUILD/gecho-helper-arm64"
X86_OBJ="$TMPDIR_BUILD/gecho-helper-x86_64"

echo "Compiling arm64..."
swiftc -O -target arm64-apple-macos11 -o "$ARM64_OBJ" "$SOURCE"

echo "Compiling x86_64..."
swiftc -O -target x86_64-apple-macos10.15 -o "$X86_OBJ" "$SOURCE"

echo "Creating universal binary..."
lipo -create -output "$OUT" "$ARM64_OBJ" "$X86_OBJ"
chmod +x "$OUT"

echo "✅ Built: $OUT ($(file "$OUT" | grep -o 'Mach-O.*'))"
