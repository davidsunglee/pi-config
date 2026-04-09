#!/usr/bin/env bash
set -euo pipefail

# Clean build artifacts
# Usage: ./clean.sh [project_root]

PROJECT_ROOT="${1:-.}"
cd "$PROJECT_ROOT"

BUILD_DIR="$(pwd)/build"

if [ -d "$BUILD_DIR" ]; then
    echo "Removing build directory: $BUILD_DIR"
    rm -rf "$BUILD_DIR"
    echo "✓ Build directory cleaned"
else
    echo "No build directory found — nothing to clean"
fi

# Also clean Xcode derived data for this project if it exists
if [ -f "project.yml" ]; then
    PROJECT_NAME=$(grep '^name:' project.yml | head -1 | awk '{print $2}')
    DERIVED="$HOME/Library/Developer/Xcode/DerivedData"
    if [ -d "$DERIVED" ]; then
        MATCHES=$(find "$DERIVED" -maxdepth 1 -name "${PROJECT_NAME}-*" -type d 2>/dev/null)
        if [ -n "$MATCHES" ]; then
            echo "Removing Xcode DerivedData for $PROJECT_NAME..."
            echo "$MATCHES" | xargs rm -rf
            echo "✓ DerivedData cleaned"
        fi
    fi
fi
