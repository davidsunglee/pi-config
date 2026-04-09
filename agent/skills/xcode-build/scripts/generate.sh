#!/usr/bin/env bash
set -euo pipefail

# Generate Xcode project from project.yml using XcodeGen
# Usage: ./generate.sh [project_root]

PROJECT_ROOT="${1:-.}"
cd "$PROJECT_ROOT"

if [ ! -f "project.yml" ]; then
    echo "ERROR: No project.yml found in $(pwd)" >&2
    exit 1
fi

PROJECT_NAME=$(grep '^name:' project.yml | head -1 | awk '{print $2}')
echo "Generating Xcode project for: $PROJECT_NAME"

xcodegen generate --spec project.yml

echo "✓ Generated ${PROJECT_NAME}.xcodeproj"
