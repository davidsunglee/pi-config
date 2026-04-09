#!/usr/bin/env bash
set -euo pipefail

# Run a built Xcode app on macOS or iOS Simulator
# Usage: ./run.sh <macos|ios> [project_root] [simulator_name] [configuration]

PLATFORM="${1:?Usage: run.sh <macos|ios> [project_root] [simulator_name] [configuration]}"
PROJECT_ROOT="${2:-.}"
SIM_NAME="${3:-}"
CONFIGURATION="${4:-Debug}"

cd "$PROJECT_ROOT"

if [ ! -f "project.yml" ]; then
    echo "ERROR: No project.yml found in $(pwd)" >&2
    exit 1
fi

PROJECT_NAME=$(grep '^name:' project.yml | head -1 | awk '{print $2}')
BUILD_DIR="$(pwd)/build"

case "$PLATFORM" in
    macos)
        APP_PATH=$(find "$BUILD_DIR" -name "*.app" -path "*/$CONFIGURATION/*" -not -path "*/iphonesimulator/*" -not -path "*/iphoneos/*" | head -1)
        if [ -z "$APP_PATH" ]; then
            echo "ERROR: No macOS .app found in $BUILD_DIR. Build first with: ./build.sh macos" >&2
            exit 1
        fi
        echo "Running: $APP_PATH"
        open "$APP_PATH"
        echo "✓ Launched $(basename "$APP_PATH") on macOS"
        ;;
    ios)
        APP_PATH=$(find "$BUILD_DIR" -name "*.app" -path "*/$CONFIGURATION-iphonesimulator/*" | head -1)
        if [ -z "$APP_PATH" ]; then
            echo "ERROR: No iOS Simulator .app found in $BUILD_DIR. Build first with: ./build.sh ios" >&2
            exit 1
        fi

        # Find simulator
        if [ -n "$SIM_NAME" ]; then
            SIM_ID=$(xcrun simctl list devices available -j | python3 -c "
import json, sys
name = '$SIM_NAME'
data = json.load(sys.stdin)
for runtime, devices in data['devices'].items():
    if 'iOS' in runtime:
        for d in devices:
            if d['name'] == name and d['isAvailable']:
                print(d['udid'])
                sys.exit(0)
print(f'ERROR: Simulator \"{name}\" not found', file=sys.stderr)
sys.exit(1)
")
        else
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
        fi

        echo "Booting simulator: ${SIM_NAME:-$SIM_ID}..."
        xcrun simctl boot "$SIM_ID" 2>/dev/null || true
        open -a Simulator

        echo "Installing: $(basename "$APP_PATH")"
        xcrun simctl install "$SIM_ID" "$APP_PATH"

        # Extract bundle identifier
        BUNDLE_ID=$(defaults read "$APP_PATH/Info.plist" CFBundleIdentifier 2>/dev/null || echo "com.unknown")

        echo "Launching: $BUNDLE_ID"
        xcrun simctl launch "$SIM_ID" "$BUNDLE_ID"

        echo "✓ Launched $(basename "$APP_PATH") on ${SIM_NAME:-$SIM_ID}"
        ;;
    *)
        echo "ERROR: Unknown platform '$PLATFORM'. Use 'macos' or 'ios'." >&2
        exit 1
        ;;
esac
