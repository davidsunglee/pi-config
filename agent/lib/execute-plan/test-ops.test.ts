import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionIO, ExecResult } from "./types.ts";
import {
  captureBaseline,
  runTests,
  compareResults,
  detectTestCommand,
} from "./test-ops.ts";

const TEST_CWD = "/fake/cwd";

// ── Mock helpers ─────────────────────────────────────────────────────

function createMockIO(
  execResponses: Map<string, ExecResult>,
  existingFiles: Set<string> = new Set(),
  fileContents: Map<string, string> = new Map(),
) {
  return {
    exec: async (cmd: string, args: string[], _cwd: string) => {
      const key = `${cmd} ${args.join(" ")}`;
      return execResponses.get(key) ?? { stdout: "", stderr: "", exitCode: 0 };
    },
    fileExists: async (path: string) => existingFiles.has(path),
    readFile: async (path: string) => fileContents.get(path) ?? "",
  } as unknown as ExecutionIO;
}

// ── captureBaseline ──────────────────────────────────────────────────

describe("captureBaseline", () => {
  // (a) captureBaseline with exit 0 returns clean baseline
  it("returns clean baseline when all tests pass (exit 0)", async () => {
    const io = createMockIO(
      new Map([
        [
          "npm test",
          {
            stdout: "ok 1 - my test\nok 2 - another test\n",
            stderr: "",
            exitCode: 0,
          },
        ],
      ]),
    );
    const result = await captureBaseline(io, TEST_CWD, "npm test");
    assert.equal(result.exitCode, 0);
    assert.ok(result.output.length > 0);
    assert.deepEqual(result.failingTests, []);
  });

  // (b) captureBaseline with exit 1 returns baseline with failing tests
  it("returns baseline with failing tests when exit code is 1", async () => {
    const io = createMockIO(
      new Map([
        [
          "npm test",
          {
            stdout:
              "ok 1 - passing test\nnot ok 2 - failing test\nnot ok 3 - another failure\n",
            stderr: "",
            exitCode: 1,
          },
        ],
      ]),
    );
    const result = await captureBaseline(io, TEST_CWD, "npm test");
    assert.equal(result.exitCode, 1);
    assert.ok(result.failingTests.length > 0);
    assert.ok(
      result.failingTests.some((t) => t.includes("failing test")),
      `Expected 'failing test' in: ${result.failingTests.join(", ")}`,
    );
  });

  it("captures output from stdout", async () => {
    const io = createMockIO(
      new Map([
        [
          "cargo test",
          {
            stdout: "running 3 tests\ntest result: ok. 3 passed",
            stderr: "",
            exitCode: 0,
          },
        ],
      ]),
    );
    const result = await captureBaseline(io, TEST_CWD, "cargo test");
    assert.ok(result.output.includes("running 3 tests"));
  });
});

// ── runTests ──────────────────────────────────────────────────────────

describe("runTests", () => {
  it("returns same structure as captureBaseline", async () => {
    const io = createMockIO(
      new Map([
        [
          "go test ./...",
          {
            stdout: "ok  \tgithub.com/foo/bar\t0.123s\n",
            stderr: "",
            exitCode: 0,
          },
        ],
      ]),
    );
    const result = await runTests(io, TEST_CWD, "go test ./...");
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.failingTests, []);
    assert.ok(result.output.length > 0);
  });
});

// ── compareResults ────────────────────────────────────────────────────

describe("compareResults", () => {
  // (c) clean baseline + clean result → pass
  it("passes when baseline is clean and result is clean", () => {
    const baseline = { exitCode: 0, output: "", failingTests: [] };
    const current = { exitCode: 0, output: "", failingTests: [] };
    const result = compareResults(baseline, current);
    assert.equal(result.passed, true);
    assert.deepEqual(result.newFailures, []);
  });

  // (d) clean baseline + failing result → fail with new failures
  it("fails with new failures when baseline clean but result has failures", () => {
    const baseline = { exitCode: 0, output: "", failingTests: [] };
    const current = {
      exitCode: 1,
      output: "",
      failingTests: ["test A", "test B"],
    };
    const result = compareResults(baseline, current);
    assert.equal(result.passed, false);
    assert.deepEqual(result.newFailures, ["test A", "test B"]);
  });

  // (e) pre-existing failures + same failures → pass
  it("passes when current failures match pre-existing baseline failures", () => {
    const baseline = {
      exitCode: 1,
      output: "",
      failingTests: ["test X", "test Y"],
    };
    const current = {
      exitCode: 1,
      output: "",
      failingTests: ["test X", "test Y"],
    };
    const result = compareResults(baseline, current);
    assert.equal(result.passed, true);
    assert.deepEqual(result.newFailures, []);
  });

  // (f) pre-existing + new → fail listing only new
  it("fails listing only new failures when added on top of pre-existing", () => {
    const baseline = {
      exitCode: 1,
      output: "",
      failingTests: ["test X"],
    };
    const current = {
      exitCode: 1,
      output: "",
      failingTests: ["test X", "test NEW"],
    };
    const result = compareResults(baseline, current);
    assert.equal(result.passed, false);
    assert.deepEqual(result.newFailures, ["test NEW"]);
    assert.ok(
      !result.newFailures.includes("test X"),
      "Should not include pre-existing failure",
    );
  });

  it("passes when a pre-existing failure is fixed (fewer failures is fine)", () => {
    const baseline = {
      exitCode: 1,
      output: "",
      failingTests: ["test X", "test Y"],
    };
    const current = {
      exitCode: 1,
      output: "",
      failingTests: ["test X"],
    };
    const result = compareResults(baseline, current);
    assert.equal(result.passed, true);
    assert.deepEqual(result.newFailures, []);
  });
});

// ── detectTestCommand ─────────────────────────────────────────────────

describe("detectTestCommand", () => {
  // (g) detects from package.json (npm/node)
  it("detects npm test command from package.json", async () => {
    const io = createMockIO(
      new Map(),
      new Set([`${TEST_CWD}/package.json`]),
      new Map([
        [
          `${TEST_CWD}/package.json`,
          JSON.stringify({ scripts: { test: "node --test" } }),
        ],
      ]),
    );
    const result = await detectTestCommand(io, TEST_CWD);
    assert.ok(result !== null, "Should detect a test command");
    assert.ok(
      result!.includes("npm") || result!.includes("node"),
      `Expected npm or node test command, got: ${result}`,
    );
  });

  // (h) detects from Cargo.toml (Rust)
  it("detects cargo test command from Cargo.toml", async () => {
    const io = createMockIO(
      new Map(),
      new Set([`${TEST_CWD}/Cargo.toml`]),
      new Map([[`${TEST_CWD}/Cargo.toml`, '[package]\nname = "my-crate"\n']]),
    );
    const result = await detectTestCommand(io, TEST_CWD);
    assert.ok(result !== null, "Should detect a test command");
    assert.equal(result, "cargo test");
  });

  // (i) detects from go.mod (Go)
  it("detects go test command from go.mod", async () => {
    const io = createMockIO(
      new Map(),
      new Set([`${TEST_CWD}/go.mod`]),
      new Map([[`${TEST_CWD}/go.mod`, "module github.com/example/myapp\n"]]),
    );
    const result = await detectTestCommand(io, TEST_CWD);
    assert.ok(result !== null, "Should detect a test command");
    assert.equal(result, "go test ./...");
  });

  // (j) detects from pytest.ini / setup.py / pyproject.toml (Python)
  it("detects pytest command from pytest.ini", async () => {
    const io = createMockIO(
      new Map(),
      new Set([`${TEST_CWD}/pytest.ini`]),
      new Map([[`${TEST_CWD}/pytest.ini`, "[pytest]\n"]]),
    );
    const result = await detectTestCommand(io, TEST_CWD);
    assert.ok(result !== null, "Should detect a test command");
    assert.equal(result, "pytest");
  });

  it("detects pytest command from setup.py", async () => {
    const io = createMockIO(
      new Map(),
      new Set([`${TEST_CWD}/setup.py`]),
      new Map([[`${TEST_CWD}/setup.py`, "from setuptools import setup\n"]]),
    );
    const result = await detectTestCommand(io, TEST_CWD);
    assert.ok(result !== null, "Should detect a test command");
    assert.equal(result, "pytest");
  });

  it("detects pytest command from pyproject.toml", async () => {
    const io = createMockIO(
      new Map(),
      new Set([`${TEST_CWD}/pyproject.toml`]),
      new Map([
        [
          `${TEST_CWD}/pyproject.toml`,
          "[tool.pytest.ini_options]\ntestpaths = [\"tests\"]\n",
        ],
      ]),
    );
    const result = await detectTestCommand(io, TEST_CWD);
    assert.ok(result !== null, "Should detect a test command");
    assert.equal(result, "pytest");
  });

  // (k) detects from Makefile with test target
  it("detects make test command from Makefile with test target", async () => {
    const io = createMockIO(
      new Map(),
      new Set([`${TEST_CWD}/Makefile`]),
      new Map([
        [
          `${TEST_CWD}/Makefile`,
          "build:\n\tgo build ./...\n\ntest:\n\tgo test ./...\n",
        ],
      ]),
    );
    const result = await detectTestCommand(io, TEST_CWD);
    assert.ok(result !== null, "Should detect a test command");
    assert.equal(result, "make test");
  });

  it("returns null when no recognizable test files exist", async () => {
    const io = createMockIO(new Map(), new Set(), new Map());
    const result = await detectTestCommand(io, TEST_CWD);
    assert.equal(result, null);
  });

  it("does not detect make test from Makefile without test target", async () => {
    const io = createMockIO(
      new Map(),
      new Set([`${TEST_CWD}/Makefile`]),
      new Map([
        [
          `${TEST_CWD}/Makefile`,
          "build:\n\tgo build ./...\n\nclean:\n\trm -rf dist/\n",
        ],
      ]),
    );
    const result = await detectTestCommand(io, TEST_CWD);
    assert.equal(result, null);
  });
});
