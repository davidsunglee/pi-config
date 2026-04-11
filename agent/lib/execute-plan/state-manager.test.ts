import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import type { ExecutionIO, RunState, ExecutionSettings, WorkspaceInfo } from "./types.ts";
import {
  getStateDir,
  getStateFilePath,
  createState,
  readState,
  updateState,
  updateWaveStatus,
  acquireLock,
  releaseLock,
  deleteState,
  validateResume,
  findActiveRunInRepo,
} from "./state-manager.ts";

// ── Mock IO ──────────────────────────────────────────────────────────

function createMockIO(files: Map<string, string> = new Map()): ExecutionIO & { files: Map<string, string> } {
  const io = {
    files,
    readFile: async (path: string) => {
      const content = files.get(path);
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    writeFile: async (path: string, content: string) => { files.set(path, content); },
    fileExists: async (path: string) => files.has(path),
    mkdir: async () => {},
    unlink: async (path: string) => { files.delete(path); },
    rename: async (src: string, dest: string) => {
      const content = files.get(src);
      if (content === undefined) throw new Error(`ENOENT: ${src}`);
      files.set(dest, content);
      files.delete(src);
    },
    readdir: async (path: string) => {
      const prefix = path.endsWith('/') ? path : path + '/';
      return [...files.keys()]
        .filter(k => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
        .map(k => k.slice(prefix.length));
    },
    exec: async (cmd: string, args: string[], cwd: string) => ({ stdout: '', stderr: '', exitCode: 0 }),
    getPid: () => 12345,
    getSessionId: () => 'test-session',
  } as unknown as ExecutionIO & { files: Map<string, string> };
  return io;
}

const TEST_CWD = "/fake/repo";
const PLAN_FILE = "my-plan";

const TEST_SETTINGS: ExecutionSettings = {
  execution: "parallel",
  tdd: false,
  finalReview: true,
  specCheck: false,
  integrationTest: false,
  testCommand: null,
};

const TEST_WORKSPACE: WorkspaceInfo = {
  type: "worktree",
  path: "/fake/repo/.worktrees/feature-branch",
  branch: "feature/my-feature",
};

// ── Path helpers ─────────────────────────────────────────────────────

describe("getStateDir", () => {
  it("returns .pi/plan-runs", () => {
    assert.equal(getStateDir(), ".pi/plan-runs");
  });
});

describe("getStateFilePath", () => {
  it("returns .pi/plan-runs/<planFileName>.state.json", () => {
    assert.equal(getStateFilePath("my-plan"), ".pi/plan-runs/my-plan.state.json");
  });

  it("handles plan names with hyphens and underscores", () => {
    assert.equal(getStateFilePath("my-cool_plan"), ".pi/plan-runs/my-cool_plan.state.json");
  });
});

// ── createState ──────────────────────────────────────────────────────

describe("createState", () => {
  // (a) writes valid JSON to .pi/plan-runs/<name>.state.json with all initial fields
  it("writes state file to correct path", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    const expectedPath = join(TEST_CWD, ".pi/plan-runs", `${PLAN_FILE}.state.json`);
    assert.ok(io.files.has(expectedPath), `Expected file at ${expectedPath}`);
  });

  it("writes valid JSON", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    const expectedPath = join(TEST_CWD, ".pi/plan-runs", `${PLAN_FILE}.state.json`);
    const content = io.files.get(expectedPath)!;
    assert.doesNotThrow(() => JSON.parse(content), "Should be valid JSON");
  });

  it("sets status to running", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.equal(state.status, "running");
  });

  it("sets preExecutionSha to empty string", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.equal(state.preExecutionSha, "");
  });

  it("sets baselineTest to null", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.equal(state.baselineTest, null);
  });

  it("sets stoppedAt to null", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.equal(state.stoppedAt, null);
  });

  it("sets stopGranularity to null", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.equal(state.stopGranularity, null);
  });

  it("sets retryState with empty tasks, waves, and null finalReview", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.deepEqual(state.retryState, { tasks: {}, waves: {}, finalReview: null });
  });

  it("sets lock to null", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.equal(state.lock, null);
  });

  it("persists settings in state", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.deepEqual(state.settings, TEST_SETTINGS);
  });

  it("persists workspace in state", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.deepEqual(state.workspace, TEST_WORKSPACE);
  });

  it("sets plan to planFileName", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.equal(state.plan, PLAN_FILE);
  });

  it("sets startedAt to a valid ISO timestamp", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.ok(typeof state.startedAt === "string", "startedAt should be a string");
    assert.ok(!isNaN(Date.parse(state.startedAt)), "startedAt should be a valid date");
  });

  it("initializes waves to empty array", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    assert.deepEqual(state.waves, []);
  });

  it("uses atomic write (write to .tmp then rename)", async () => {
    const io = createMockIO();
    const writeCalls: string[] = [];
    const renameCalls: Array<{ src: string; dest: string }> = [];
    const originalWrite = (io as any).writeFile;
    const originalRename = (io as any).rename;
    (io as any).writeFile = async (path: string, content: string) => {
      writeCalls.push(path);
      return originalWrite(path, content);
    };
    (io as any).rename = async (src: string, dest: string) => {
      renameCalls.push({ src, dest });
      return originalRename(src, dest);
    };

    await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);

    const expectedPath = join(TEST_CWD, ".pi/plan-runs", `${PLAN_FILE}.state.json`);
    const tmpPath = expectedPath + ".tmp";
    assert.ok(writeCalls.includes(tmpPath), "Should write to .tmp file first");
    assert.ok(
      renameCalls.some(r => r.src === tmpPath && r.dest === expectedPath),
      "Should rename .tmp to final path"
    );
  });
});

// ── readState ────────────────────────────────────────────────────────

describe("readState", () => {
  // (b) parses existing state file
  it("parses existing state file", async () => {
    const io = createMockIO();
    const created = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    const read = await readState(io, TEST_CWD, PLAN_FILE);
    assert.ok(read !== null, "Should return state");
    assert.deepEqual(read, created);
  });

  // (c) returns null for non-existent state
  it("returns null for non-existent state", async () => {
    const io = createMockIO();
    const result = await readState(io, TEST_CWD, "nonexistent-plan");
    assert.equal(result, null);
  });
});

// ── updateState ──────────────────────────────────────────────────────

describe("updateState", () => {
  async function setupState(io: ReturnType<typeof createMockIO>) {
    return createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
  }

  // (d) sets preExecutionSha persists the change
  it("persists preExecutionSha update", async () => {
    const io = createMockIO();
    await setupState(io);
    const updated = await updateState(io, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      preExecutionSha: "abc123def456",
    }));
    assert.equal(updated.preExecutionSha, "abc123def456");

    // Verify persisted
    const read = await readState(io, TEST_CWD, PLAN_FILE);
    assert.equal(read!.preExecutionSha, "abc123def456");
  });

  // (e) sets baselineTest persists the baseline
  it("persists baselineTest update", async () => {
    const io = createMockIO();
    await setupState(io);
    const baseline = { exitCode: 0, output: "All tests passed", failingTests: [] };
    const updated = await updateState(io, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      baselineTest: baseline,
    }));
    assert.deepEqual(updated.baselineTest, baseline);

    // Verify persisted
    const read = await readState(io, TEST_CWD, PLAN_FILE);
    assert.deepEqual(read!.baselineTest, baseline);
  });

  // (f) sets status: "stopped", stoppedAt, stopGranularity persists cancellation fields
  it("persists cancellation fields (status, stoppedAt, stopGranularity)", async () => {
    const io = createMockIO();
    await setupState(io);
    const stoppedAt = new Date().toISOString();
    const updated = await updateState(io, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      status: "stopped" as const,
      stoppedAt,
      stopGranularity: "wave" as const,
    }));
    assert.equal(updated.status, "stopped");
    assert.equal(updated.stoppedAt, stoppedAt);
    assert.equal(updated.stopGranularity, "wave");

    // Verify persisted
    const read = await readState(io, TEST_CWD, PLAN_FILE);
    assert.equal(read!.status, "stopped");
    assert.equal(read!.stoppedAt, stoppedAt);
    assert.equal(read!.stopGranularity, "wave");
  });

  // (g) sets retryState.tasks["3"] persists task retry metadata
  it("persists retryState.tasks update", async () => {
    const io = createMockIO();
    await setupState(io);
    const retryRecord = {
      attempts: 2,
      maxAttempts: 3,
      lastFailure: "Test failed",
      lastFailureAt: new Date().toISOString(),
      lastContext: null,
      lastModel: null,
    };
    const updated = await updateState(io, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      retryState: {
        ...s.retryState,
        tasks: { ...s.retryState.tasks, "3": retryRecord },
      },
    }));
    assert.deepEqual(updated.retryState.tasks["3"], retryRecord);

    // Verify persisted
    const read = await readState(io, TEST_CWD, PLAN_FILE);
    assert.deepEqual(read!.retryState.tasks["3"], retryRecord);
  });

  // (h) sets retryState.waves["2"] persists wave retry metadata
  it("persists retryState.waves update", async () => {
    const io = createMockIO();
    await setupState(io);
    const retryRecord = {
      attempts: 1,
      maxAttempts: 2,
      lastFailure: "Wave failed",
      lastFailureAt: new Date().toISOString(),
      lastContext: "some context",
      lastModel: "claude-3-5-sonnet",
    };
    const updated = await updateState(io, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      retryState: {
        ...s.retryState,
        waves: { ...s.retryState.waves, "2": retryRecord },
      },
    }));
    assert.deepEqual(updated.retryState.waves["2"], retryRecord);

    // Verify persisted
    const read = await readState(io, TEST_CWD, PLAN_FILE);
    assert.deepEqual(read!.retryState.waves["2"], retryRecord);
  });

  // (i) sets retryState.finalReview persists final review retry metadata
  it("persists retryState.finalReview update", async () => {
    const io = createMockIO();
    await setupState(io);
    const finalReviewRecord = {
      attempts: 1,
      maxAttempts: 3,
      lastFailure: "Review found issues",
      lastFailureAt: new Date().toISOString(),
      lastContext: null,
      lastModel: null,
    };
    const updated = await updateState(io, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      retryState: {
        ...s.retryState,
        finalReview: finalReviewRecord,
      },
    }));
    assert.deepEqual(updated.retryState.finalReview, finalReviewRecord);

    // Verify persisted
    const read = await readState(io, TEST_CWD, PLAN_FILE);
    assert.deepEqual(read!.retryState.finalReview, finalReviewRecord);
  });

  it("uses atomic write for updates", async () => {
    const io = createMockIO();
    await setupState(io);

    const writeCalls: string[] = [];
    const renameCalls: Array<{ src: string; dest: string }> = [];
    const originalWrite = (io as any).writeFile;
    const originalRename = (io as any).rename;
    (io as any).writeFile = async (path: string, content: string) => {
      writeCalls.push(path);
      return originalWrite(path, content);
    };
    (io as any).rename = async (src: string, dest: string) => {
      renameCalls.push({ src, dest });
      return originalRename(src, dest);
    };

    await updateState(io, TEST_CWD, PLAN_FILE, (s) => ({ ...s, preExecutionSha: "xyz" }));

    const expectedPath = join(TEST_CWD, ".pi/plan-runs", `${PLAN_FILE}.state.json`);
    const tmpPath = expectedPath + ".tmp";
    assert.ok(writeCalls.includes(tmpPath), "Should write to .tmp file");
    assert.ok(renameCalls.some(r => r.src === tmpPath && r.dest === expectedPath), "Should rename .tmp to final");
  });
});

// ── updateWaveStatus ─────────────────────────────────────────────────

describe("updateWaveStatus", () => {
  async function setupStateWithWave(io: ReturnType<typeof createMockIO>) {
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    // Add a wave to state
    return updateState(io, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      waves: [{ wave: 1, tasks: [1, 2], status: "in-progress" as const, commitSha: null }],
    }));
  }

  // (j) transitions wave to done with commitSha (must be non-empty string)
  it("transitions wave to done with commitSha", async () => {
    const io = createMockIO();
    const state = await setupStateWithWave(io);
    const updated = await updateWaveStatus(io, TEST_CWD, PLAN_FILE, 1, "done", "abc123sha");
    const wave = updated.waves.find(w => w.wave === 1);
    assert.ok(wave, "Wave 1 should exist");
    assert.equal(wave!.status, "done");
    assert.equal(wave!.commitSha, "abc123sha");
  });

  // (k) rejects null/empty commitSha for "done" status
  it("rejects null commitSha for done status", async () => {
    const io = createMockIO();
    const state = await setupStateWithWave(io);
    await assert.rejects(
      () => updateWaveStatus(io, TEST_CWD, PLAN_FILE, 1, "done", null),
      /commitSha/i,
      "Should reject null commitSha for done status"
    );
  });

  it("rejects empty string commitSha for done status", async () => {
    const io = createMockIO();
    const state = await setupStateWithWave(io);
    await assert.rejects(
      () => updateWaveStatus(io, TEST_CWD, PLAN_FILE, 1, "done", ""),
      /commitSha/i,
      "Should reject empty commitSha for done status"
    );
  });

  it("allows null commitSha for non-done statuses", async () => {
    const io = createMockIO();
    const state = await setupStateWithWave(io);
    const updated = await updateWaveStatus(io, TEST_CWD, PLAN_FILE, 1, "in-progress", null);
    const wave = updated.waves.find(w => w.wave === 1);
    assert.equal(wave!.status, "in-progress");
    assert.equal(wave!.commitSha, null);
  });
});

// ── acquireLock / releaseLock ────────────────────────────────────────

describe("acquireLock", () => {
  // (l) writes lock info
  it("writes lock info to state", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    const updated = await acquireLock(io, TEST_CWD, PLAN_FILE, 12345, "test-session");
    assert.ok(updated.lock !== null, "Lock should not be null");
    assert.equal(updated.lock!.pid, 12345);
    assert.equal(updated.lock!.session, "test-session");
    assert.ok(typeof updated.lock!.acquiredAt === "string");
    assert.ok(!isNaN(Date.parse(updated.lock!.acquiredAt)));
  });

  // (m) fails when lock exists with live PID
  it("fails when lock exists with live PID", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    // Set a lock with a "live" PID - we need kill -0 to return exitCode 0
    // Override exec to simulate live process check
    const liveIo = createMockIO(io.files);
    // kill -0 returning 0 = process is live
    (liveIo as any).exec = async (cmd: string, args: string[], cwd: string) => {
      if (cmd === "kill" && args[0] === "-0") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    // First acquire lock with a different PID
    await updateState(liveIo, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      lock: { pid: 99999, session: "other-session", acquiredAt: new Date().toISOString() },
    }));

    await assert.rejects(
      () => acquireLock(liveIo, TEST_CWD, PLAN_FILE, 12345, "test-session"),
      /lock/i,
      "Should fail when lock is held by live PID"
    );
  });

  // (n) detects stale lock (dead PID)
  it("detects stale lock and acquires when PID is dead", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    // Set existing stale lock
    await updateState(io, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      lock: { pid: 99999, session: "dead-session", acquiredAt: new Date().toISOString() },
    }));

    // Override exec to simulate dead process (kill -0 returns non-zero)
    const deadIo = createMockIO(io.files);
    (deadIo as any).exec = async (cmd: string, args: string[], cwd: string) => {
      if (cmd === "kill" && args[0] === "-0") {
        return { stdout: "", stderr: "No such process", exitCode: 1 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };

    const updated = await acquireLock(deadIo, TEST_CWD, PLAN_FILE, 12345, "new-session");
    assert.ok(updated.lock !== null);
    assert.equal(updated.lock!.pid, 12345);
    assert.equal(updated.lock!.session, "new-session");
  });
});

describe("releaseLock", () => {
  // (o) clears lock
  it("clears the lock from state", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    await acquireLock(io, TEST_CWD, PLAN_FILE, 12345, "test-session");

    const released = await releaseLock(io, TEST_CWD, PLAN_FILE);
    assert.equal(released.lock, null);

    // Verify persisted
    const read = await readState(io, TEST_CWD, PLAN_FILE);
    assert.equal(read!.lock, null);
  });
});

// ── deleteState ──────────────────────────────────────────────────────

describe("deleteState", () => {
  // (p) removes file
  it("removes the state file", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    const expectedPath = join(TEST_CWD, ".pi/plan-runs", `${PLAN_FILE}.state.json`);
    assert.ok(io.files.has(expectedPath), "File should exist before delete");

    await deleteState(io, TEST_CWD, PLAN_FILE);
    assert.ok(!io.files.has(expectedPath), "File should be removed after delete");
  });
});

// ── validateResume ───────────────────────────────────────────────────

describe("validateResume", () => {
  // (q) checks workspace, branch, commit SHAs
  it("returns valid when workspace, branch, and commit match", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    // Set a pre-execution SHA and update state
    const stateWithSha = await updateState(io, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      preExecutionSha: "abc123",
    }));

    // Mock exec to return matching workspace, branch, and SHA
    const validIo = createMockIO(io.files);
    (validIo as any).exec = async (cmd: string, args: string[], cwd: string) => {
      if (cmd === "git" && args.includes("--abbrev-ref")) {
        return { stdout: TEST_WORKSPACE.branch + "\n", stderr: "", exitCode: 0 };
      }
      if (cmd === "git" && args.includes("rev-parse") && args.includes("HEAD")) {
        return { stdout: "abc123\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    (validIo as any).fileExists = async (path: string) => {
      return path === TEST_WORKSPACE.path || io.files.has(path);
    };

    const result = await validateResume(validIo, stateWithSha, TEST_WORKSPACE.path);
    assert.equal(result.valid, true);
    assert.deepEqual(result.issues, []);
  });

  it("reports issue when workspace path does not exist", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);

    const noWorkspaceIo = createMockIO(io.files);
    (noWorkspaceIo as any).fileExists = async (_path: string) => false;
    (noWorkspaceIo as any).exec = async () => ({ stdout: "", stderr: "", exitCode: 0 });

    const result = await validateResume(noWorkspaceIo, state, TEST_WORKSPACE.path);
    assert.equal(result.valid, false);
    assert.ok(result.issues.length > 0, "Should have at least one issue");
    assert.ok(result.issues.some(i => /workspace|path/i.test(i)), "Issue should mention workspace or path");
  });

  it("reports issue when branch does not match", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);

    const wrongBranchIo = createMockIO(io.files);
    (wrongBranchIo as any).fileExists = async (_path: string) => true;
    (wrongBranchIo as any).exec = async (cmd: string, args: string[]) => {
      if (cmd === "git" && args.includes("--abbrev-ref")) {
        return { stdout: "wrong-branch\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };

    const result = await validateResume(wrongBranchIo, state, TEST_WORKSPACE.path);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(i => /branch/i.test(i)), "Issue should mention branch");
  });

  it("checks git state at workspace path, not cwd, when they differ", async () => {
    const io = createMockIO();
    const state = await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    const stateWithSha = await updateState(io, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      preExecutionSha: "abc123",
    }));

    // cwd is different from workspace path
    const callerCwd = "/different/cwd";

    // Track which cwd is passed to exec
    const execCwds: string[] = [];
    const checkIo = createMockIO(io.files);
    (checkIo as any).exec = async (cmd: string, args: string[], cwd: string) => {
      execCwds.push(cwd);
      if (cmd === "git" && args.includes("--abbrev-ref")) {
        return { stdout: TEST_WORKSPACE.branch + "\n", stderr: "", exitCode: 0 };
      }
      if (cmd === "git" && args.includes("rev-parse") && args.includes("HEAD")) {
        return { stdout: "abc123\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    (checkIo as any).fileExists = async (path: string) => {
      return path === TEST_WORKSPACE.path || io.files.has(path);
    };

    const result = await validateResume(checkIo, stateWithSha, callerCwd);
    assert.equal(result.valid, true);
    assert.deepEqual(result.issues, []);

    // All git exec calls should have used workspace path, NOT callerCwd
    for (const cwd of execCwds) {
      assert.equal(cwd, TEST_WORKSPACE.path, "Git commands should run against workspace path, not caller cwd");
    }
    assert.ok(execCwds.length > 0, "Should have made at least one git exec call");
  });

  it("reports issue when preExecutionSha does not match HEAD", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, PLAN_FILE, TEST_SETTINGS, TEST_WORKSPACE);
    const stateWithSha = await updateState(io, TEST_CWD, PLAN_FILE, (s) => ({
      ...s,
      preExecutionSha: "expected-sha",
    }));

    const wrongShaIo = createMockIO(io.files);
    (wrongShaIo as any).fileExists = async (_path: string) => true;
    (wrongShaIo as any).exec = async (cmd: string, args: string[]) => {
      if (cmd === "git" && args.includes("--abbrev-ref")) {
        return { stdout: TEST_WORKSPACE.branch + "\n", stderr: "", exitCode: 0 };
      }
      if (cmd === "git" && args.includes("rev-parse") && args.includes("HEAD")) {
        return { stdout: "different-sha\n", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };

    const result = await validateResume(wrongShaIo, stateWithSha, TEST_WORKSPACE.path);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some(i => /sha|commit/i.test(i)), "Issue should mention SHA or commit");
  });
});

// ── findActiveRunInRepo ──────────────────────────────────────────────

describe("findActiveRunInRepo", () => {
  // (r) scans all state files, returns first with active lock
  it("returns first state file with an active lock", async () => {
    const io = createMockIO();
    // Create two state files; one with active lock (live PID)
    await createState(io, TEST_CWD, "plan-a", TEST_SETTINGS, TEST_WORKSPACE);
    await createState(io, TEST_CWD, "plan-b", TEST_SETTINGS, TEST_WORKSPACE);

    // Give plan-b an active lock
    await updateState(io, TEST_CWD, "plan-b", (s) => ({
      ...s,
      lock: { pid: 77777, session: "active-session", acquiredAt: new Date().toISOString() },
    }));

    // Override exec to simulate live process
    const liveIo = createMockIO(io.files);
    (liveIo as any).exec = async (cmd: string, args: string[]) => {
      if (cmd === "kill" && args[0] === "-0") {
        return { stdout: "", stderr: "", exitCode: 0 }; // process is live
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };

    const result = await findActiveRunInRepo(liveIo, TEST_CWD);
    assert.ok(result !== null, "Should find active run");
    assert.equal(result!.planName, "plan-b");
    assert.equal(result!.state.lock!.session, "active-session");
  });

  // (s) returns null when no active locks
  it("returns null when no active locks exist", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, "plan-a", TEST_SETTINGS, TEST_WORKSPACE);
    await createState(io, TEST_CWD, "plan-b", TEST_SETTINGS, TEST_WORKSPACE);
    // No locks set - both plans have lock: null

    const result = await findActiveRunInRepo(io, TEST_CWD);
    assert.equal(result, null);
  });

  // (t) ignores stale/completed/stopped state files
  it("ignores stale lock (dead PID)", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, "plan-a", TEST_SETTINGS, TEST_WORKSPACE);

    // Set a stale lock (dead PID)
    await updateState(io, TEST_CWD, "plan-a", (s) => ({
      ...s,
      lock: { pid: 99999, session: "dead-session", acquiredAt: new Date().toISOString() },
    }));

    const deadIo = createMockIO(io.files);
    (deadIo as any).exec = async (cmd: string, args: string[]) => {
      if (cmd === "kill" && args[0] === "-0") {
        return { stdout: "", stderr: "No such process", exitCode: 1 }; // process dead
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };

    const result = await findActiveRunInRepo(deadIo, TEST_CWD);
    assert.equal(result, null, "Should not return stale lock as active");
  });

  it("ignores completed state files without locks", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, "plan-a", TEST_SETTINGS, TEST_WORKSPACE);
    await updateState(io, TEST_CWD, "plan-a", (s) => ({
      ...s,
      status: "completed" as const,
    }));

    const result = await findActiveRunInRepo(io, TEST_CWD);
    assert.equal(result, null, "Should not return completed state as active");
  });

  it("ignores stopped state files without locks", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, "plan-a", TEST_SETTINGS, TEST_WORKSPACE);
    await updateState(io, TEST_CWD, "plan-a", (s) => ({
      ...s,
      status: "stopped" as const,
      stoppedAt: new Date().toISOString(),
      stopGranularity: "wave" as const,
    }));

    const result = await findActiveRunInRepo(io, TEST_CWD);
    assert.equal(result, null, "Should not return stopped state as active");
  });

  it("returns null when state directory does not exist", async () => {
    const io = createMockIO(); // empty file system, no state dir
    const result = await findActiveRunInRepo(io, TEST_CWD);
    assert.equal(result, null);
  });

  it("ignores completed state with a live PID lock", async () => {
    const io = createMockIO();
    await createState(io, TEST_CWD, "plan-a", TEST_SETTINGS, TEST_WORKSPACE);

    // Set status to completed but leave a live lock (simulates crash after completion)
    await updateState(io, TEST_CWD, "plan-a", (s) => ({
      ...s,
      status: "completed" as const,
      lock: { pid: 77777, session: "active-session", acquiredAt: new Date().toISOString() },
    }));

    // Override exec to simulate live process
    const liveIo = createMockIO(io.files);
    (liveIo as any).exec = async (cmd: string, args: string[]) => {
      if (cmd === "kill" && args[0] === "-0") {
        return { stdout: "", stderr: "", exitCode: 0 }; // process is live
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    };

    const result = await findActiveRunInRepo(liveIo, TEST_CWD);
    assert.equal(result, null, "Should not return completed state even with live PID lock");
  });
});
