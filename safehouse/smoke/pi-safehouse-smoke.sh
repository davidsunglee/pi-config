#!/usr/bin/env bash
# pi-safehouse-smoke.sh
#
# Quick smoke checks for the Pi + Agent Safehouse wrappers in safehouse/bin.
# Verifies:
#   1. safehouse and pi are on PATH
#   2. The wrapper scripts are present, executable, and on PATH
#   3. Safehouse can launch Pi (`pi-safe` reports the Pi version)
#   4. Read/write inside the chosen workdir works
#   5. Reading a file outside the workdir is denied
#   6. `pi-ios` can run `xcodebuild -version` (skipped if no Xcode CLT)
#
# Run from any directory; the script creates its own isolated workdir.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/bin"

pass=0
fail=0
skip=0

log_pass() { printf '  PASS  %s\n' "$1"; pass=$((pass + 1)); }
log_fail() { printf '  FAIL  %s\n' "$1"; fail=$((fail + 1)); }
log_skip() { printf '  SKIP  %s (%s)\n' "$1" "$2"; skip=$((skip + 1)); }

echo "Pi Safehouse smoke tests"
echo "  wrappers:        $WRAPPER_DIR"
echo "  safehouse:       $(command -v safehouse 2>/dev/null || echo MISSING)"
echo "  pi:              $(command -v pi 2>/dev/null || echo MISSING)"
echo

# 1. Prerequisites.
if command -v safehouse >/dev/null 2>&1; then
  log_pass "safehouse on PATH ($(safehouse --version 2>&1 | head -1))"
else
  log_fail "safehouse not on PATH"
fi
if command -v pi >/dev/null 2>&1; then
  log_pass "pi on PATH ($(pi --version 2>&1 | head -1))"
else
  log_fail "pi not on PATH"
fi

# 2. Wrappers present and executable.
for wrapper in pi-safe pi-ios pi-ios-debug; do
  path="$WRAPPER_DIR/$wrapper"
  if [ -x "$path" ]; then
    log_pass "$wrapper exists and is executable"
  else
    log_fail "$wrapper missing or not executable at $path"
  fi
done

# 3. pi-safe can start Pi under Safehouse and report a version.
if [ -x "$WRAPPER_DIR/pi-safe" ] && command -v safehouse >/dev/null 2>&1 && command -v pi >/dev/null 2>&1; then
  if version_out=$("$WRAPPER_DIR/pi-safe" --version 2>&1); then
    if [ -n "$version_out" ]; then
      log_pass "pi-safe --version produced output ($(echo "$version_out" | head -1))"
    else
      log_fail "pi-safe --version produced empty output"
    fi
  else
    log_fail "pi-safe --version exited non-zero: $version_out"
  fi
else
  log_skip "pi-safe --version" "prerequisites missing"
fi

# 4 + 5. Workdir read/write allowed; outside-workdir read denied.
# Use `safehouse` directly (not pi-safe) so we can run /bin/cat/echo as the
# wrapped command and observe the policy without depending on Pi tool calls.
#
# Both paths must live under $HOME. macOS system tmp (/private/var/folders,
# /tmp) is read-allowed by Safehouse defaults because countless system
# services share that area, so using mktemp's default location would
# produce a false negative on the outside-read check.
if command -v safehouse >/dev/null 2>&1; then
  tmp_workdir="$(mktemp -d "$HOME/.pi-safehouse-smoke-workdir.XXXXXX")"
  outside_dir="$(mktemp -d "$HOME/.pi-safehouse-smoke-outside.XXXXXX")"
  trap 'rm -rf "$tmp_workdir" "$outside_dir" 2>/dev/null || true' EXIT
  echo "secret-payload" > "$outside_dir/forbidden.txt"

  # Inside workdir: write then read.
  if safehouse --workdir="$tmp_workdir" -- /bin/bash -c \
       "echo hello > '$tmp_workdir/inside.txt' && cat '$tmp_workdir/inside.txt'" \
       >/dev/null 2>&1; then
    log_pass "workdir read/write allowed inside $tmp_workdir"
  else
    log_fail "workdir read/write was unexpectedly denied"
  fi

  # Outside workdir: reading a sibling home-dir tmpdir should fail.
  if safehouse --workdir="$tmp_workdir" -- /bin/cat "$outside_dir/forbidden.txt" \
       >/dev/null 2>&1; then
    log_fail "outside-workdir read was unexpectedly allowed ($outside_dir)"
  else
    log_pass "outside-workdir read denied ($outside_dir)"
  fi
else
  log_skip "workdir read/write + outside-workdir denial" "safehouse missing"
fi

# 6. pi-ios can run an Xcode-related command (only if Xcode CLT present).
if [ -x "$WRAPPER_DIR/pi-ios" ] && command -v xcodebuild >/dev/null 2>&1; then
  # Invoke safehouse directly with --enable=xcode so the smoke test does not
  # rely on Pi being able to shell out from inside its agent loop.
  if safehouse --workdir="$PWD" --enable=xcode -- xcodebuild -version >/dev/null 2>&1; then
    log_pass "safehouse --enable=xcode allows xcodebuild -version"
  else
    log_fail "safehouse --enable=xcode could not run xcodebuild -version"
  fi
else
  log_skip "xcodebuild under --enable=xcode" "xcodebuild or pi-ios unavailable"
fi

echo
printf 'Summary: %d passed, %d failed, %d skipped\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ]
