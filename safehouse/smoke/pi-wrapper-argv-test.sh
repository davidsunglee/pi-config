#!/usr/bin/env bash
# pi-wrapper-argv-test.sh
#
# Argv assembly tests for the pi-safe / pi-ios / pi-ios-debug wrappers.
#
# The wrappers exec `safehouse ... -- pi ...`. This test stubs `safehouse`
# and `pi` on PATH so each wrapper invocation writes the argv it would have
# handed to the real binaries, then asserts the wrappers route documented
# one-off Safehouse flags (--add-dirs, --add-dirs-ro, --env, --env-pass,
# --enable, --append-profile) to `safehouse` and everything else to `pi`.
#
# Run from any directory; the script creates its own isolated temp area.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRAPPER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/bin"

pass=0
fail=0
log_pass() { printf '  PASS  %s\n' "$1"; pass=$((pass + 1)); }
log_fail() { printf '  FAIL  %s\n  expected: %s\n  actual:   %s\n' "$1" "$2" "$3"; fail=$((fail + 1)); }

work_root="$(mktemp -d "${TMPDIR:-/tmp}/pi-wrapper-argv-test.XXXXXX")"
stub_bin="$work_root/bin"
mkdir -p "$stub_bin"
trap 'rm -rf "$work_root"' EXIT

# Stub: safehouse prints its full argv to $SAFEHOUSE_ARGV_OUT and exits 0
# without execing anything. The wrapper uses `exec safehouse ...`, so the
# stub terminates the wrapper entirely (which is what we want — we are
# inspecting the assembled argv, not running the real safehouse).
cat >"$stub_bin/safehouse" <<'STUB'
#!/usr/bin/env bash
: >"$SAFEHOUSE_ARGV_OUT"
for a in "$@"; do
  printf '%s\n' "$a" >>"$SAFEHOUSE_ARGV_OUT"
done
STUB
chmod +x "$stub_bin/safehouse"

# Stub: pi is referenced only by the wrappers' command -v check; safehouse
# is stubbed so pi is never actually invoked. We still need it on PATH.
cat >"$stub_bin/pi" <<'STUB'
#!/usr/bin/env bash
echo "stub-pi should not be invoked: $*" >&2
exit 99
STUB
chmod +x "$stub_bin/pi"

# Run a wrapper with a clean PATH that has only our stubs + system bin.
# Force PI_SAFEHOUSE_OVERRIDES to a path that doesn't exist so the wrappers
# don't append a real overrides profile.
run_wrapper() {
  local wrapper="$1"; shift
  local out="$work_root/argv.out"
  rm -f "$out"
  SAFEHOUSE_ARGV_OUT="$out" \
    PI_SAFEHOUSE_OVERRIDES="$work_root/nonexistent-overrides.sb" \
    PATH="$stub_bin:/usr/bin:/bin" \
    "$WRAPPER_DIR/$wrapper" "$@"
  cat "$out"
}

# Helper: assert the argv (one arg per line) matches the expected list.
assert_argv() {
  local label="$1"; shift
  local expected="$1"; shift
  local actual="$1"; shift
  if [ "$expected" = "$actual" ]; then
    log_pass "$label"
  else
    log_fail "$label" "$expected" "$actual"
  fi
}

cd "$work_root"
cwd="$PWD"

# ---- pi-safe ----

# No Pi args: launching the daily-driver alias should still invoke Pi.
expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  -- \
  pi)"
actual="$(run_wrapper pi-safe)"
assert_argv "pi-safe: no args launches pi" "$expected" "$actual"

# Baseline: no extra flags. All user args go to pi after `--`.
expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  -- \
  pi \
  chat \
  hello)"
actual="$(run_wrapper pi-safe chat hello)"
assert_argv "pi-safe: baseline routes user args to pi" "$expected" "$actual"

# --add-dirs-ro=... must go to safehouse, not pi.
expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  --add-dirs-ro=/tmp/shared-lib \
  -- \
  pi \
  chat \
  hello)"
actual="$(run_wrapper pi-safe --add-dirs-ro=/tmp/shared-lib chat hello)"
assert_argv "pi-safe: --add-dirs-ro routes to safehouse" "$expected" "$actual"

# --add-dirs=... must go to safehouse.
expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  --add-dirs=/tmp/some-repo \
  -- \
  pi \
  /bin/true)"
actual="$(run_wrapper pi-safe --add-dirs=/tmp/some-repo /bin/true)"
assert_argv "pi-safe: --add-dirs routes to safehouse" "$expected" "$actual"

# --env-pass=... must go to safehouse.
expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  --env-pass=ANTHROPIC_API_KEY,OPENAI_API_KEY \
  -- \
  pi \
  chat)"
actual="$(run_wrapper pi-safe --env-pass=ANTHROPIC_API_KEY,OPENAI_API_KEY chat)"
assert_argv "pi-safe: --env-pass routes to safehouse" "$expected" "$actual"

# Mixed Safehouse + Pi args.
expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  --add-dirs-ro=/tmp/a \
  --env-pass=X \
  -- \
  pi \
  chat \
  --some-pi-flag \
  value)"
actual="$(run_wrapper pi-safe --add-dirs-ro=/tmp/a --env-pass=X chat --some-pi-flag value)"
assert_argv "pi-safe: mixed safehouse + pi args" "$expected" "$actual"

# Explicit `--` terminator stops Safehouse-flag parsing.
expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  --add-dirs=/tmp/a \
  -- \
  pi \
  --add-dirs=/tmp/b \
  chat)"
actual="$(run_wrapper pi-safe --add-dirs=/tmp/a -- --add-dirs=/tmp/b chat)"
assert_argv "pi-safe: -- terminator stops safehouse-flag parsing" "$expected" "$actual"

# Unrelated leading flag falls through to pi unchanged.
expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  -- \
  pi \
  --version)"
actual="$(run_wrapper pi-safe --version)"
assert_argv "pi-safe: unknown leading flag goes to pi" "$expected" "$actual"

# ---- pi-ios ----

expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  --enable=xcode \
  -- \
  pi)"
actual="$(run_wrapper pi-ios)"
assert_argv "pi-ios: no args launches pi with --enable=xcode" "$expected" "$actual"

expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  --enable=xcode \
  -- \
  pi \
  chat)"
actual="$(run_wrapper pi-ios chat)"
assert_argv "pi-ios: baseline includes --enable=xcode" "$expected" "$actual"

expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  --enable=xcode \
  --add-dirs-ro=/tmp/shared-lib \
  -- \
  pi \
  chat)"
actual="$(run_wrapper pi-ios --add-dirs-ro=/tmp/shared-lib chat)"
assert_argv "pi-ios: --add-dirs-ro routes to safehouse" "$expected" "$actual"

# ---- pi-ios-debug ----

expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  --enable=xcode,lldb \
  -- \
  pi)"
actual="$(run_wrapper pi-ios-debug)"
assert_argv "pi-ios-debug: no args launches pi with --enable=xcode,lldb" "$expected" "$actual"

expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  --enable=xcode,lldb \
  -- \
  pi \
  chat)"
actual="$(run_wrapper pi-ios-debug chat)"
assert_argv "pi-ios-debug: baseline includes --enable=xcode,lldb" "$expected" "$actual"

expected="$(printf '%s\n' \
  "--workdir=$cwd" \
  --enable=xcode,lldb \
  --env-pass=FOO \
  -- \
  pi \
  chat)"
actual="$(run_wrapper pi-ios-debug --env-pass=FOO chat)"
assert_argv "pi-ios-debug: --env-pass routes to safehouse" "$expected" "$actual"

echo
printf 'Summary: %d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
