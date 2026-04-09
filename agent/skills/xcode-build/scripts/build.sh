#!/usr/bin/env bash
set -euo pipefail

# Build an Xcode project for macOS or iOS simulator
# Usage: ./build.sh <macos|ios> [project_root] [configuration]

PLATFORM="${1:?Usage: build.sh <macos|ios> [project_root] [configuration]}"
PROJECT_ROOT="${2:-.}"
CONFIGURATION="${3:-Debug}"

cd "$PROJECT_ROOT"

if [ ! -f "project.yml" ]; then
    echo "ERROR: No project.yml found in $(pwd)" >&2
    exit 1
fi

PROJECT_NAME=$(grep '^name:' project.yml | head -1 | awk '{print $2}')
XCODEPROJ="${PROJECT_NAME}.xcodeproj"
BUILD_DIR="$(pwd)/build"

if [ ! -d "$XCODEPROJ" ]; then
    echo "No .xcodeproj found. Generating..."
    xcodegen generate --spec project.yml
fi

case "$PLATFORM" in
    macos)
        SCHEME="${PROJECT_NAME}-macOS"
        DESTINATION="platform=macOS"
        echo "Building $SCHEME for macOS ($CONFIGURATION)..."
        ;;
    ios)
        SCHEME="${PROJECT_NAME}-iOS"
        # Find first available iPhone simulator
        SIM_ID=$(xcrun simctl list devices available -j | python3 -c "
import json, sys
data = json.load(sys.stdin)
for runtime, devices in data['devices'].items():
    if 'iOS' in runtime:
        for d in devices:
            if 'iPhone' in d['name'] and d['isAvailable']:
                print(d['udid'])
                sys.exit(0)
sys.exit(1)
" 2>/dev/null) || { echo "ERROR: No available iPhone simulator found" >&2; exit 1; }
        SIM_NAME=$(xcrun simctl list devices available | grep "$SIM_ID" | sed 's/ (.*//' | xargs)
        DESTINATION="platform=iOS Simulator,id=$SIM_ID"
        echo "Building $SCHEME for iOS Simulator: $SIM_NAME ($CONFIGURATION)..."
        ;;
    *)
        echo "ERROR: Unknown platform '$PLATFORM'. Use 'macos' or 'ios'." >&2
        exit 1
        ;;
esac

xcodebuild \
    -project "$XCODEPROJ" \
    -scheme "$SCHEME" \
    -configuration "$CONFIGURATION" \
    -destination "$DESTINATION" \
    -derivedDataPath "$BUILD_DIR" \
    build 2>&1 | tail -50

# Find and report the built .app
if [ "$PLATFORM" = "macos" ]; then
    APP_PATH=$(find "$BUILD_DIR" -name "*.app" -path "*/$CONFIGURATION/*" -not -path "*/iphonesimulator/*" | head -1)
else
    APP_PATH=$(find "$BUILD_DIR" -name "*.app" -path "*/$CONFIGURATION-iphonesimulator/*" | head -1)
fi

if [ -n "$APP_PATH" ]; then
    echo ""
    echo "✓ Build succeeded: $APP_PATH"
else
    echo ""
    echo "✗ Build may have failed — no .app found" >&2
    exit 1
fi
