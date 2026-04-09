#!/usr/bin/env bash
set -euo pipefail

# List available iOS simulators
# Usage: ./simulators.sh

echo "Available iOS Simulators:"
echo "========================="
xcrun simctl list devices available | grep -E "(-- iOS|iPhone|iPad)" | sed 's/^    //'
