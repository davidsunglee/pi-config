import type { ExecutionIO, BaselineTest } from "./types.ts";

// ── Failing test name extraction ──────────────────────────────────────

/**
 * Extracts failing test names from test runner output.
 *
 * Supports common patterns:
 * - TAP: `not ok N - <test name>`
 * - Node test runner: lines starting with `✖` or `✗`
 * - pytest/general: lines containing `FAILED` (e.g. `FAILED tests/test_foo.py::test_bar`)
 * - Rust cargo test: `test <name> ... FAILED`
 * - General `FAIL <name>` lines
 */
function extractFailingTests(output: string): string[] {
  const failing: string[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();

    // TAP format: "not ok N - test name"
    const tapMatch = trimmed.match(/^not ok\s+\d+\s*[-–]?\s*(.+)/);
    if (tapMatch) {
      const name = tapMatch[1].trim();
      // Skip TAP plan lines or directives
      if (name && !name.startsWith("#")) {
        failing.push(name);
      }
      continue;
    }

    // Node test runner unicode markers: ✖ or ✗ at start
    if (trimmed.startsWith("✖") || trimmed.startsWith("✗")) {
      const name = trimmed.replace(/^[✖✗]\s*/, "").trim();
      if (name) {
        failing.push(name);
      }
      continue;
    }

    // pytest style: "FAILED tests/test_foo.py::test_bar"
    const pytestMatch = trimmed.match(/^FAILED\s+(.+)/);
    if (pytestMatch) {
      const name = pytestMatch[1].trim();
      if (name) {
        failing.push(name);
      }
      continue;
    }

    // Rust cargo test: "test some::path::test_name ... FAILED"
    const rustMatch = trimmed.match(/^test\s+(\S+)\s+\.\.\.\s+FAILED/);
    if (rustMatch) {
      failing.push(rustMatch[1]);
      continue;
    }

    // General "FAIL <name>" lines (e.g. Go test output: "FAIL github.com/foo/bar")
    const failMatch = trimmed.match(/^FAIL\s+(\S+)/);
    if (failMatch) {
      failing.push(failMatch[1]);
      continue;
    }
  }

  return failing;
}

// ── captureBaseline ───────────────────────────────────────────────────

/**
 * Runs the test command and captures results as a baseline.
 * The baseline records the exit code, combined output, and extracted
 * failing test names. A non-zero exit is expected when pre-existing
 * failures exist — that is not an error.
 */
export async function captureBaseline(
  io: ExecutionIO,
  cwd: string,
  testCommand: string,
): Promise<BaselineTest> {
  const [cmd, ...args] = testCommand.split(/\s+/);
  const result = await io.exec(cmd, args, cwd);
  const output = result.stdout + (result.stderr ? "\n" + result.stderr : "");
  const failingTests =
    result.exitCode !== 0 ? extractFailingTests(output) : [];
  return {
    exitCode: result.exitCode,
    output,
    failingTests,
  };
}

// ── runTests ──────────────────────────────────────────────────────────

/**
 * Runs the test command and returns the results. Identical in behaviour
 * to `captureBaseline` — separated so call sites can signal intent.
 */
export async function runTests(
  io: ExecutionIO,
  cwd: string,
  testCommand: string,
): Promise<BaselineTest> {
  return captureBaseline(io, cwd, testCommand);
}

// ── compareResults ────────────────────────────────────────────────────

/**
 * Compares a current test run against the captured baseline.
 *
 * Only tests that were *not* failing in the baseline and are failing now
 * are counted as regressions. Pre-existing failures are allowed to remain;
 * fixing failures is always fine.
 *
 * Returns `{ passed: true, newFailures: [] }` when there are no new failures.
 */
export function compareResults(
  baseline: BaselineTest,
  current: BaselineTest,
): { passed: boolean; newFailures: string[] } {
  const baselineSet = new Set(baseline.failingTests);
  const newFailures = current.failingTests.filter(
    (test) => !baselineSet.has(test),
  );
  return {
    passed: newFailures.length === 0,
    newFailures,
  };
}

// ── detectTestCommand ─────────────────────────────────────────────────

/**
 * Auto-detects the test command for the project in `cwd`.
 *
 * Detection order (first match wins):
 * 1. `package.json` → `npm test`
 * 2. `Cargo.toml` → `cargo test`
 * 3. `go.mod` → `go test ./...`
 * 4. `pytest.ini`, `setup.py`, or `pyproject.toml` → `pytest`
 * 5. `Makefile` with a `test:` target → `make test`
 *
 * Returns null when no supported project file is found.
 */
export async function detectTestCommand(
  io: ExecutionIO,
  cwd: string,
): Promise<string | null> {
  const p = (name: string) => `${cwd}/${name}`;

  // 1. Node / npm
  if (await io.fileExists(p("package.json"))) {
    return "npm test";
  }

  // 2. Rust
  if (await io.fileExists(p("Cargo.toml"))) {
    return "cargo test";
  }

  // 3. Go
  if (await io.fileExists(p("go.mod"))) {
    return "go test ./...";
  }

  // 4. Python
  for (const pyFile of ["pytest.ini", "setup.py", "pyproject.toml"]) {
    if (await io.fileExists(p(pyFile))) {
      return "pytest";
    }
  }

  // 5. Makefile with test target
  if (await io.fileExists(p("Makefile"))) {
    const content = await io.readFile(p("Makefile"));
    // A test target is a line that starts with "test:" (possibly with tabs/spaces before)
    if (/^test\s*:/m.test(content)) {
      return "make test";
    }
  }

  return null;
}
