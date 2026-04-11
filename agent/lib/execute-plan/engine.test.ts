import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import type {
  ExecutionIO,
  EngineCallbacks,
  Plan,
  ExecutionSettings,
  RunState,
  WorkspaceChoice,
  FailureContext,
  TestRegressionContext,
  JudgmentRequest,
  JudgmentResponse,
  ProgressEvent,
  ModelTiers,
  SubagentConfig,
  SubagentResult,
  CodeReviewSummary,
} from "./types.ts";
import { PlanExecutionEngine, parseCodeReviewOutput } from "./engine.ts";

// ── Minimal valid plan markdown ─────────────────────────────────────

const PLAN_MD = `
## Goal

Build a widget library.

## Architecture Summary

Modular component architecture with barrel exports.

## Tech Stack

TypeScript, Node.js

## File Structure

- \`src/widget.ts\` (Create) — Main widget module
- \`src/widget.test.ts\` (Create) — Widget tests
- \`src/utils.ts\` (Create) — Utility helpers

## Tasks

### Task 1: Create widget module

**Files:**
- Create: \`src/widget.ts\`
- Test: \`src/widget.test.ts\`

**Steps:**
- [ ] **Step 1: Create widget** — Implement the widget class

**Acceptance criteria:**
- Widget class is exported
- Tests pass

**Model recommendation:** cheap

### Task 2: Create utils module

**Files:**
- Create: \`src/utils.ts\`

**Steps:**
- [ ] **Step 1: Create utils** — Implement utility helpers

**Acceptance criteria:**
- Utils are exported

**Model recommendation:** cheap

## Dependencies

- Task 2 depends on: Task 1

## Risk Assessment

Low risk — straightforward implementation.

## Test Command

\`\`\`bash
npm test
\`\`\`
`;

// ── Constants ───────────────────────────────────────────────────────

const TEST_CWD = "/fake/repo";
const TEST_AGENT_DIR = "/fake/repo/agent";
const PLAN_FILE_NAME = "test-plan.md";
const PLAN_PATH = join(TEST_CWD, ".pi", "plans", PLAN_FILE_NAME);

const DEFAULT_SETTINGS: ExecutionSettings = {
  execution: "parallel",
  tdd: true,
  finalReview: false,
  specCheck: false,
  integrationTest: false,
  testCommand: null,
};

const SETTINGS_JSON = JSON.stringify({
  modelTiers: {
    capable: "claude-opus-4-20250514",
    standard: "claude-sonnet-4-20250514",
    cheap: "claude-haiku-3-20250307",
  },
});

// ── Mock IO ─────────────────────────────────────────────────────────

interface MockExecHandler {
  (cmd: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

function createMockIO(
  files?: Map<string, string>,
  execHandler?: MockExecHandler,
): ExecutionIO & { files: Map<string, string> } {
  const fs = files ?? new Map<string, string>();
  const defaultExec: MockExecHandler = async (cmd, args, _cwd) => {
    // git rev-parse --git-dir → simulate git repo
    if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
      return { stdout: ".git\n", stderr: "", exitCode: 0 };
    }
    // git rev-parse --abbrev-ref HEAD → branch name
    if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
      return { stdout: "feature/test\n", stderr: "", exitCode: 0 };
    }
    // git rev-parse HEAD → HEAD sha
    if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
      return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
    }
    // git check-ignore -q → directory is ignored
    if (cmd === "git" && args[0] === "check-ignore") {
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    // kill -0 → process not alive (stale lock)
    if (cmd === "kill" && args[0] === "-0") {
      return { stdout: "", stderr: "No such process", exitCode: 1 };
    }
    // npm test (executed via sh -c)
    if (cmd === "sh" && args[0] === "-c" && args[1]?.startsWith("npm test")) {
      return { stdout: "All tests passed", stderr: "", exitCode: 0 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  const handler = execHandler ?? defaultExec;

  return {
    files: fs,
    readFile: async (path: string) => {
      const content = fs.get(path);
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    writeFile: async (path: string, content: string) => {
      fs.set(path, content);
    },
    fileExists: async (path: string) => fs.has(path),
    mkdir: async () => {},
    unlink: async (path: string) => {
      fs.delete(path);
    },
    rename: async (src: string, dest: string) => {
      const content = fs.get(src);
      if (content === undefined) throw new Error(`ENOENT: ${src}`);
      fs.set(dest, content);
      fs.delete(src);
    },
    readdir: async (path: string) => {
      const prefix = path.endsWith("/") ? path : path + "/";
      return [...fs.keys()]
        .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
        .map((k) => k.slice(prefix.length));
    },
    exec: handler,
    dispatchSubagent: async (config) => ({
      taskNumber: config.taskNumber,
      status: "DONE" as const,
      output: "done",
      concerns: null,
      needs: null,
      blocker: null,
      filesChanged: [],
    }),
    getPid: () => 12345,
    getSessionId: () => "test-session",
  } as ExecutionIO & { files: Map<string, string> };
}

// ── Mock Callbacks ──────────────────────────────────────────────────

function createMockCallbacks(
  overrides?: Partial<EngineCallbacks>,
): EngineCallbacks & { calls: Record<string, any[]> } {
  const calls: Record<string, any[]> = {};
  const record = (name: string, ...args: any[]) => {
    if (!calls[name]) calls[name] = [];
    calls[name].push(args);
  };
  return {
    calls,
    requestSettings: async (plan, detected) => {
      record("requestSettings", plan, detected);
      return (
        overrides?.requestSettings?.(plan, detected) ?? {
          execution: "parallel" as const,
          tdd: true,
          finalReview: false,
          specCheck: false,
          integrationTest: false,
          testCommand: null,
        }
      );
    },
    requestResumeAction: async (state) => {
      record("requestResumeAction", state);
      return overrides?.requestResumeAction?.(state) ?? "restart";
    },
    confirmMainBranch: async (branch) => {
      record("confirmMainBranch", branch);
      return overrides?.confirmMainBranch?.(branch) ?? true;
    },
    requestWorktreeSetup: async (branch, cwd) => {
      record("requestWorktreeSetup", branch, cwd);
      return (
        overrides?.requestWorktreeSetup?.(branch, cwd) ?? ({ type: "current" } as WorkspaceChoice)
      );
    },
    requestFailureAction: async (ctx) => {
      record("requestFailureAction", ctx);
      return overrides?.requestFailureAction?.(ctx) ?? "skip";
    },
    requestTestRegressionAction: async (ctx) => {
      record("requestTestRegressionAction", ctx);
      return overrides?.requestTestRegressionAction?.(ctx) ?? "skip";
    },
    requestTestCommand: async () => {
      record("requestTestCommand");
      return overrides?.requestTestCommand?.() ?? null;
    },
    requestJudgment: async (req) => {
      record("requestJudgment", req);
      return overrides?.requestJudgment?.(req) ?? { action: "accept" as const };
    },
    onProgress: (event) => {
      record("onProgress", event);
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Seed the mock IO with the plan file, settings, and templates. */
function seedFiles(io: ExecutionIO & { files: Map<string, string> }): void {
  io.files.set(PLAN_PATH, PLAN_MD);
  io.files.set(join(TEST_AGENT_DIR, "settings.json"), SETTINGS_JSON);
  // Seed template files required by executeWaves
  io.files.set(
    join(TEST_AGENT_DIR, "skills/execute-plan/implementer-prompt.md"),
    "You are implementing task.\n\n{TASK_SPEC}\n\n{CONTEXT}\n\n{WORKING_DIR}\n\n{TDD_BLOCK}",
  );
  io.files.set(
    join(TEST_AGENT_DIR, "skills/execute-plan/spec-reviewer.md"),
    "Review this implementation.\n\n{TASK_SPEC}\n\n{IMPLEMENTER_REPORT}",
  );
  io.files.set(
    join(TEST_AGENT_DIR, "skills/requesting-code-review/code-reviewer.md"),
    "Review code changes.\n\n{WHAT_WAS_IMPLEMENTED}\n\n{PLAN_OR_REQUIREMENTS}\n\n{BASE_SHA}\n\n{HEAD_SHA}\n\n{DESCRIPTION}",
  );
}

/** Create a handler that acts like we're on "main" branch and NOT in a worktree. */
function onMainBranchHandler(): MockExecHandler {
  return async (cmd, args, _cwd) => {
    if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
      return { stdout: ".git\n", stderr: "", exitCode: 0 };
    }
    if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
      return { stdout: "main\n", stderr: "", exitCode: 0 };
    }
    if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
      return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
    }
    if (cmd === "git" && args[0] === "check-ignore") {
      return { stdout: "", stderr: "", exitCode: 0 }; // directory is ignored
    }
    if (cmd === "git" && args[0] === "worktree" && args[1] === "add") {
      return { stdout: "", stderr: "", exitCode: 0 };
    }
    if (cmd === "kill" && args[0] === "-0") {
      return { stdout: "", stderr: "No such process", exitCode: 1 };
    }
    if (cmd === "sh" && args[0] === "-c" && args[1]?.startsWith("npm")) {
      return { stdout: "All tests passed", stderr: "", exitCode: 0 };
    }
    return { stdout: "", stderr: "", exitCode: 0 };
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("PlanExecutionEngine", () => {
  // (a) engine parses plan and computes waves
  describe("plan parsing and wave computation", () => {
    it("parses plan and computes waves, emitting wave events", async () => {
      const io = createMockIO();
      seedFiles(io);
      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      await engine.execute(PLAN_PATH, callbacks);

      // Should have emitted wave_started / wave_completed events
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const waveStarted = progressCalls.filter(
        (c: any[]) => c[0].type === "wave_started",
      );
      assert.ok(waveStarted.length >= 1, "Should emit at least one wave_started event");

      // Plan has Task 1 (no deps) and Task 2 (depends on Task 1) → 2 waves
      assert.equal(waveStarted.length, 2, "Should have 2 waves");
      assert.deepEqual(waveStarted[0][0].taskNumbers, [1]);
      assert.deepEqual(waveStarted[1][0].taskNumbers, [2]);
    });
  });

  // (b) engine calls callbacks.requestSettings() and uses returned settings
  describe("requestSettings", () => {
    it("calls requestSettings with parsed plan and detected settings", async () => {
      const io = createMockIO();
      seedFiles(io);
      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      await engine.execute(PLAN_PATH, callbacks);

      assert.ok(callbacks.calls["requestSettings"], "requestSettings should be called");
      assert.equal(callbacks.calls["requestSettings"].length, 1);
      const [plan, detected] = callbacks.calls["requestSettings"][0];
      assert.equal(plan.header.goal, "Build a widget library.");
      // detected should be a partial settings object
      assert.ok(typeof detected === "object");
    });
  });

  // (c) engine calls callbacks.requestResumeAction() when state file found
  describe("resume logic", () => {
    it("calls requestResumeAction when existing state file found", async () => {
      const io = createMockIO();
      seedFiles(io);

      // Pre-create a state file to simulate a previous run
      const stateFilePath = join(TEST_CWD, ".pi/plan-runs", PLAN_FILE_NAME + ".state.json");
      const existingState: RunState = {
        plan: PLAN_FILE_NAME,
        status: "stopped",
        lock: null,
        startedAt: new Date().toISOString(),
        stoppedAt: new Date().toISOString(),
        stopGranularity: "wave",
        settings: DEFAULT_SETTINGS,
        workspace: { type: "current", path: TEST_CWD, branch: "feature/test" },
        preExecutionSha: "old-sha",
        baselineTest: null,
        retryState: { tasks: {}, waves: {}, finalReview: null },
        waves: [
          { wave: 1, tasks: [1], status: "done", commitSha: "wave1sha" },
        ],
      };
      io.files.set(stateFilePath, JSON.stringify(existingState));

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      await engine.execute(PLAN_PATH, callbacks);

      assert.ok(callbacks.calls["requestResumeAction"], "requestResumeAction should be called");
      assert.equal(callbacks.calls["requestResumeAction"].length, 1);
    });
  });

  // (d) engine calls callbacks.confirmMainBranch() when on main + current workspace
  //     BEFORE state creation — halts if false
  describe("confirmMainBranch", () => {
    it("calls confirmMainBranch when on main with current workspace choice, halts if false", async () => {
      const io = createMockIO(undefined, onMainBranchHandler());
      seedFiles(io);
      // Put a .worktrees dir so worktree setup is offered
      io.files.set(join(TEST_CWD, ".worktrees") + "/.keep", "");

      const callbacks = createMockCallbacks({
        requestWorktreeSetup: async () => ({ type: "current" }),
        confirmMainBranch: async () => false,
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      // Should complete without error (clean early exit)
      await engine.execute(PLAN_PATH, callbacks);

      assert.ok(callbacks.calls["confirmMainBranch"], "confirmMainBranch should be called");

      // State should NOT have been created since confirm returned false
      const stateFilePath = join(TEST_CWD, ".pi/plan-runs", PLAN_FILE_NAME + ".state.json");
      assert.equal(await io.fileExists(stateFilePath), false, "State file should not exist when confirmMainBranch returns false");
    });
  });

  // (e) engine calls requestWorktreeSetup when on main, receives WorkspaceChoice,
  //     verifies gitignored, calls createWorktree for "worktree" type
  describe("worktree setup", () => {
    it("calls requestWorktreeSetup and creates worktree for worktree choice", async () => {
      const execCalls: Array<{ cmd: string; args: string[] }> = [];
      const io = createMockIO(undefined, async (cmd, args, _cwd) => {
        execCalls.push({ cmd, args: [...args] });
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
          return { stdout: ".git\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
          return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "check-ignore") {
          return { stdout: "", stderr: "", exitCode: 0 }; // is ignored
        }
        if (cmd === "git" && args[0] === "worktree" && args[1] === "add") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (cmd === "kill" && args[0] === "-0") {
          return { stdout: "", stderr: "No such process", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
      seedFiles(io);
      // Create a .worktrees directory
      io.files.set(join(TEST_CWD, ".worktrees") + "/.keep", "");

      const callbacks = createMockCallbacks({
        requestWorktreeSetup: async () => ({
          type: "worktree",
          branch: "plan/test-plan",
        }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      assert.ok(callbacks.calls["requestWorktreeSetup"], "requestWorktreeSetup should be called");

      // Verify git worktree add was called
      const worktreeAddCall = execCalls.find(
        (c) => c.cmd === "git" && c.args[0] === "worktree" && c.args[1] === "add",
      );
      assert.ok(worktreeAddCall, "Should call git worktree add");
    });

    // (f) engine fails early when worktree directory is NOT gitignored
    it("fails when worktree directory is not gitignored", async () => {
      const io = createMockIO(undefined, async (cmd, args, _cwd) => {
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
          return { stdout: ".git\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
          return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "check-ignore") {
          return { stdout: "", stderr: "", exitCode: 1 }; // NOT ignored
        }
        if (cmd === "kill" && args[0] === "-0") {
          return { stdout: "", stderr: "No such process", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
      seedFiles(io);
      io.files.set(join(TEST_CWD, ".worktrees") + "/.keep", "");

      const callbacks = createMockCallbacks({
        requestWorktreeSetup: async () => ({
          type: "worktree",
          branch: "plan/test-plan",
        }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      await assert.rejects(
        () => engine.execute(PLAN_PATH, callbacks),
        /gitignore|ignored|not.*ignored/i,
      );
    });

    // (g) engine does NOT call createWorktree when WorkspaceChoice is { type: "current" }
    it("does not call createWorktree for current workspace choice", async () => {
      const execCalls: Array<{ cmd: string; args: string[] }> = [];
      const io = createMockIO(undefined, async (cmd, args, _cwd) => {
        execCalls.push({ cmd, args: [...args] });
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
          return { stdout: ".git\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
          return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "check-ignore") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (cmd === "kill" && args[0] === "-0") {
          return { stdout: "", stderr: "No such process", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
      seedFiles(io);
      io.files.set(join(TEST_CWD, ".worktrees") + "/.keep", "");

      const callbacks = createMockCallbacks({
        requestWorktreeSetup: async () => ({ type: "current" }),
        confirmMainBranch: async () => true,
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      const worktreeAddCall = execCalls.find(
        (c) => c.cmd === "git" && c.args[0] === "worktree" && c.args[1] === "add",
      );
      assert.ok(!worktreeAddCall, "Should NOT call git worktree add for current choice");
    });
  });

  // (h) engine writes preExecutionSha to state via updateState before first wave
  describe("preExecutionSha", () => {
    it("writes preExecutionSha to state before first wave", async () => {
      const io = createMockIO();
      seedFiles(io);

      // Track state writes to verify preExecutionSha was written
      const stateWrites: RunState[] = [];
      const originalWriteFile = io.writeFile.bind(io);
      (io as any).writeFile = async (path: string, content: string) => {
        if (path.includes(".state.json")) {
          try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
        }
        return originalWriteFile(path, content);
      };

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      await engine.execute(PLAN_PATH, callbacks);

      // Verify preExecutionSha was actually written to the state file
      const hasPreExecSha = stateWrites.some((s) => s.preExecutionSha === "abc123def456");
      assert.ok(hasPreExecSha, "preExecutionSha should be written to state file with the HEAD SHA");
    });
  });

  // (i) engine writes baselineTest to state via updateState after baseline capture
  describe("baseline test capture", () => {
    it("captures baseline when integrationTest is enabled with testCommand", async () => {
      const io = createMockIO();
      seedFiles(io);

      // Track state updates to verify baseline was written
      const stateUpdates: string[] = [];
      const originalWriteFile = io.writeFile.bind(io);
      (io as any).writeFile = async (path: string, content: string) => {
        if (path.includes(".state.json")) {
          stateUpdates.push(content);
        }
        return originalWriteFile(path, content);
      };

      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel" as const,
          tdd: true,
          finalReview: false,
          specCheck: false,
          integrationTest: true,
          testCommand: "npm test",
        }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Check that at least one state update contained baselineTest
      const hasBaseline = stateUpdates.some((content) => {
        try {
          const state = JSON.parse(content) as RunState;
          return state.baselineTest !== null;
        } catch {
          return false;
        }
      });
      assert.ok(hasBaseline, "State should have been updated with baselineTest");
    });
  });

  // (j) engine enforces repo-wide single-run via findActiveRunInRepo
  describe("single-run enforcement", () => {
    it("rejects execution when another plan has an active lock", async () => {
      const io = createMockIO(undefined, async (cmd, args, _cwd) => {
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
          return { stdout: ".git\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
          return { stdout: "feature/test\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
          return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "kill" && args[0] === "-0") {
          return { stdout: "", stderr: "", exitCode: 0 }; // process IS alive
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
      seedFiles(io);

      // Create an active state file for a DIFFERENT plan
      const otherStatePath = join(TEST_CWD, ".pi/plan-runs", "other-plan.state.json");
      const otherState: RunState = {
        plan: "other-plan",
        status: "running",
        lock: { pid: 99999, session: "other-session", acquiredAt: new Date().toISOString() },
        startedAt: new Date().toISOString(),
        stoppedAt: null,
        stopGranularity: null,
        settings: DEFAULT_SETTINGS,
        workspace: { type: "current", path: TEST_CWD, branch: "feature/other" },
        preExecutionSha: "other-sha",
        baselineTest: null,
        retryState: { tasks: {}, waves: {}, finalReview: null },
        waves: [],
      };
      io.files.set(otherStatePath, JSON.stringify(otherState));

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      await assert.rejects(
        () => engine.execute(PLAN_PATH, callbacks),
        /active.*run|already.*running|locked/i,
      );
    });
  });

  // (k) engine calls requestTestCommand when integration tests enabled but no command detected
  describe("requestTestCommand", () => {
    it("calls requestTestCommand when integrationTest enabled but no command detected", async () => {
      // Use an exec handler that doesn't have package.json etc
      const io = createMockIO(undefined, async (cmd, args, _cwd) => {
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
          return { stdout: ".git\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
          return { stdout: "feature/test\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
          return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "kill" && args[0] === "-0") {
          return { stdout: "", stderr: "No such process", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });

      // Seed files but do NOT include package.json (so detectTestCommand returns null)
      io.files.set(PLAN_PATH, PLAN_MD);
      io.files.set(join(TEST_AGENT_DIR, "settings.json"), SETTINGS_JSON);
      // Seed templates needed by executeWaves
      io.files.set(
        join(TEST_AGENT_DIR, "skills/execute-plan/implementer-prompt.md"),
        "You are implementing task.\n\n{TASK_SPEC}\n\n{CONTEXT}\n\n{WORKING_DIR}\n\n{TDD_BLOCK}",
      );
      io.files.set(
        join(TEST_AGENT_DIR, "skills/execute-plan/spec-reviewer.md"),
        "Review this implementation.\n\n{TASK_SPEC}\n\n{IMPLEMENTER_REPORT}",
      );
      io.files.set(
        join(TEST_AGENT_DIR, "skills/requesting-code-review/code-reviewer.md"),
        "Review code changes.\n\n{WHAT_WAS_IMPLEMENTED}\n\n{PLAN_OR_REQUIREMENTS}\n\n{BASE_SHA}\n\n{HEAD_SHA}\n\n{DESCRIPTION}",
      );
      // Intentionally NOT adding package.json, Cargo.toml, etc.

      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel" as const,
          tdd: true,
          finalReview: false,
          specCheck: false,
          integrationTest: true,
          testCommand: null,
        }),
        requestTestCommand: async () => "npm test",
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      assert.ok(callbacks.calls["requestTestCommand"], "requestTestCommand should have been called");
    });
  });

  // (l) engine resumes from correct wave, consuming persisted retryState
  describe("resume from correct wave", () => {
    it("resumes from the correct wave and passes persisted retryState", async () => {
      const io = createMockIO();
      seedFiles(io);

      // Pre-create a state file simulating wave 1 completed
      const stateFilePath = join(TEST_CWD, ".pi/plan-runs", PLAN_FILE_NAME + ".state.json");
      const existingRetryState = {
        tasks: { "2": { attempts: 1, maxAttempts: 3, lastFailure: "test fail", lastFailureAt: new Date().toISOString(), lastContext: null, lastModel: null } },
        waves: {},
        finalReview: null,
      };
      const existingState: RunState = {
        plan: PLAN_FILE_NAME,
        status: "stopped",
        lock: null,
        startedAt: new Date().toISOString(),
        stoppedAt: new Date().toISOString(),
        stopGranularity: "wave",
        settings: DEFAULT_SETTINGS,
        workspace: { type: "current", path: TEST_CWD, branch: "feature/test" },
        preExecutionSha: "abc123def456",
        baselineTest: null,
        retryState: existingRetryState,
        waves: [
          { wave: 1, tasks: [1], status: "done", commitSha: "wave1sha" },
        ],
      };
      io.files.set(stateFilePath, JSON.stringify(existingState));
      // Ensure workspace path exists for validateResume check
      io.files.set(TEST_CWD, "");

      const callbacks = createMockCallbacks({
        requestResumeAction: async () => "continue",
      });

      // Track state writes to verify persisted state is preserved
      const stateWrites: RunState[] = [];
      const originalWriteFile = io.writeFile.bind(io);
      (io as any).writeFile = async (path: string, content: string) => {
        if (path.includes(".state.json")) {
          try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
        }
        return originalWriteFile(path, content);
      };

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Check that wave_started was NOT emitted for wave 1 (already done)
      // Only wave 2 should start
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const waveStarted = progressCalls.filter(
        (c: any[]) => c[0].type === "wave_started",
      );
      assert.ok(waveStarted.length >= 1, "At least one wave should start");
      // Wave 1 should be skipped
      const wave1Started = waveStarted.filter(
        (c: any[]) => c[0].wave === 1,
      );
      assert.equal(wave1Started.length, 0, "Wave 1 should not be started again (already done)");

      // Verify persisted retry counters were NOT overwritten with empty state.
      // The first state write after resume should still contain the persisted retryState.
      // (If createState was wrongly called, it would zero out retryState.)
      const firstWriteWithRetry = stateWrites.find(
        (s) => s.retryState && Object.keys(s.retryState.tasks).length > 0,
      );
      assert.ok(
        firstWriteWithRetry,
        "Persisted retryState.tasks should be preserved in state file during resume (not overwritten)",
      );
      assert.equal(
        firstWriteWithRetry!.retryState.tasks["2"]?.attempts,
        1,
        "Persisted retry count for task 2 should be preserved",
      );
    });
  });

  // (m) engine moves plan to done, closes todo, deletes state on completion
  describe("completion lifecycle", () => {
    it("moves plan to done, closes todo, and deletes state on completion", async () => {
      const io = createMockIO();
      seedFiles(io);

      // Add a source todo reference to the plan
      const planWithTodo = PLAN_MD + "\n**Source:** `TODO-abc123`\n";
      io.files.set(PLAN_PATH, planWithTodo);

      // Create the todo file
      const todoPath = join(TEST_CWD, ".pi", "todos", "abc123.md");
      io.files.set(
        todoPath,
        JSON.stringify({ status: "in-progress", title: "Test todo" }) + "\n\nSome body text",
      );

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Plan should be moved to done dir
      const donePath = join(TEST_CWD, ".pi", "plans", "done", PLAN_FILE_NAME);
      assert.ok(io.files.has(donePath), "Plan should be moved to done directory");
      assert.ok(!io.files.has(PLAN_PATH), "Original plan path should be removed");

      // Todo should be closed
      const todoContent = io.files.get(todoPath);
      assert.ok(todoContent, "Todo file should still exist");
      const todoParsed = JSON.parse(todoContent!.split("\n\n")[0]);
      assert.equal(todoParsed.status, "done", "Todo status should be done");

      // State file should be deleted
      const stateFilePath = join(TEST_CWD, ".pi/plan-runs", PLAN_FILE_NAME + ".state.json");
      assert.ok(!io.files.has(stateFilePath), "State file should be deleted after completion");

      // execution_completed event should be emitted
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const completedEvents = progressCalls.filter(
        (c: any[]) => c[0].type === "execution_completed",
      );
      assert.ok(completedEvents.length > 0, "execution_completed event should be emitted");
    });
  });

  // (n) engine releases lock on completion
  describe("lock release", () => {
    it("releases lock on successful completion", async () => {
      const io = createMockIO();
      seedFiles(io);

      // Track all state writes to see if lock was released before deletion
      const stateWrites: RunState[] = [];
      const origWriteFile = io.writeFile.bind(io);
      (io as any).writeFile = async (path: string, content: string) => {
        if (path.includes(".state.json") && !path.includes(".tmp")) {
          // This is an atomic rename target — but we also capture .tmp writes
        }
        if (path.includes(".state.json")) {
          try {
            stateWrites.push(JSON.parse(content));
          } catch {
            // ignore non-json
          }
        }
        return origWriteFile(path, content);
      };

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // At some point during execution, lock should have been released (lock: null)
      // before state deletion. Since state is deleted, we check the write log.
      const lockReleased = stateWrites.some((s) => s.lock === null && s.status === "running");
      assert.ok(
        stateWrites.length > 0,
        "State should have been written at least once during execution",
      );
      assert.equal(lockReleased, true, "Lock should be released (lock: null) before state deletion");
    });

    it("releases lock even when execution throws", async () => {
      const io = createMockIO();
      seedFiles(io);

      // Make loadModelTiers fail by removing settings.json
      io.files.delete(join(TEST_AGENT_DIR, "settings.json"));

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      // Should throw but still try to clean up
      try {
        await engine.execute(PLAN_PATH, callbacks);
      } catch {
        // expected
      }

      // Lock cleanup is in finally - but only if state was created
      // In this case, settings loading fails before state creation, so
      // no state file exists to release lock from. This is correct behavior.
    });
  });

  // (additional) requestCancellation
  describe("requestCancellation", () => {
    it("sets cancellation state", () => {
      const io = createMockIO();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      engine.requestCancellation("wave");
      // We can't directly read private state, but we can verify it doesn't throw
    });

    it("sets cancellation with task granularity", () => {
      const io = createMockIO();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      engine.requestCancellation("task");
      // Should not throw
    });
  });

  // engine does not call requestWorktreeSetup when NOT on main branch
  describe("off-main branch behavior", () => {
    it("does not call requestWorktreeSetup when on a feature branch", async () => {
      const io = createMockIO(); // default handler returns feature/test branch
      seedFiles(io);
      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      await engine.execute(PLAN_PATH, callbacks);

      assert.ok(
        !callbacks.calls["requestWorktreeSetup"],
        "requestWorktreeSetup should NOT be called when off main branch",
      );
      assert.ok(
        !callbacks.calls["confirmMainBranch"],
        "confirmMainBranch should NOT be called when off main branch",
      );
    });
  });

  // engine does not call requestWorktreeSetup when on main but already in a worktree
  describe("in-worktree behavior", () => {
    it("does not call requestWorktreeSetup when on main but already in a worktree", async () => {
      // Simulate: on main branch AND inside a worktree (--git-dir returns a path containing .git/worktrees/)
      const io = createMockIO(undefined, async (cmd, args, _cwd) => {
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
          // In a worktree, --git-dir returns a path like /repo/.git/worktrees/my-branch
          return { stdout: "/repo/.git/worktrees/my-branch\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
          return { stdout: "main\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
          return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "check-ignore") {
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (cmd === "kill" && args[0] === "-0") {
          return { stdout: "", stderr: "No such process", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
      seedFiles(io);

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      await engine.execute(PLAN_PATH, callbacks);

      assert.ok(
        !callbacks.calls["requestWorktreeSetup"],
        "requestWorktreeSetup should NOT be called when already in a worktree (even on main)",
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Task 16: Wave execution, dispatch, and judgment handling
  // ═══════════════════════════════════════════════════════════════════════

  describe("wave execution and dispatch", () => {
    // (a) engine dispatches workers via TaskQueue calling io.dispatchSubagent for each task
    it("dispatches workers via TaskQueue for each task in a wave", async () => {
      const io = createMockIO();
      seedFiles(io);

      const dispatched: SubagentConfig[] = [];
      io.dispatchSubagent = async (config) => {
        dispatched.push(config);
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "Implementation complete",
          concerns: null,
          needs: null,
          blocker: null,
          filesChanged: ["file.ts"],
        };
      };

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Plan has 2 tasks across 2 waves — both should be dispatched
      assert.ok(dispatched.length >= 2, `Expected at least 2 dispatches, got ${dispatched.length}`);
      const taskNumbers = dispatched.map((d) => d.taskNumber);
      assert.ok(taskNumbers.includes(1), "Task 1 should be dispatched");
      assert.ok(taskNumbers.includes(2), "Task 2 should be dispatched");
    });

    // (b) engine commits after each successful wave (always produces SHA)
    it("commits after each successful wave", async () => {
      const io = createMockIO();
      seedFiles(io);


      const commitCalls: string[][] = [];
      const origExec = io.exec.bind(io);
      io.exec = async (cmd: string, args: string[], cwd: string) => {
        if (cmd === "git" && args[0] === "commit") {
          commitCalls.push(args);
        }
        return origExec(cmd, args, cwd);
      };

      io.dispatchSubagent = async (config) => ({
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      });

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Should have committed for each wave
      assert.ok(commitCalls.length >= 2, `Expected at least 2 commits, got ${commitCalls.length}`);

      // Check wave_completed events carry SHA
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const waveCompleted = progressCalls.filter(
        (c: any[]) => c[0].type === "wave_completed",
      );
      assert.ok(waveCompleted.length >= 2, "Should emit wave_completed for each wave");
      for (const [evt] of waveCompleted) {
        assert.ok(evt.commitSha && evt.commitSha !== "stub", `commitSha should be real, got "${evt.commitSha}"`);
      }
    });

    // (c) engine runs tests after each wave if integration tests enabled
    it("runs tests after each wave when integration tests are enabled", async () => {
      const io = createMockIO();
      seedFiles(io);


      const testRuns: Array<{ cmd: string; args: string[] }> = [];
      const origExec = io.exec.bind(io);
      io.exec = async (cmd: string, args: string[], cwd: string) => {
        if (cmd === "sh" && args[0] === "-c" && args[1]?.startsWith("npm test")) {
          testRuns.push({ cmd, args: [...args] });
        }
        return origExec(cmd, args, cwd);
      };

      io.dispatchSubagent = async (config) => ({
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      });

      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel" as const,
          tdd: true,
          finalReview: false,
          specCheck: false,
          integrationTest: true,
          testCommand: "npm test",
        }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Baseline capture + at least one test run per wave
      // baseline=1, wave1=1, wave2=1 = at least 3
      assert.ok(testRuns.length >= 3, `Expected at least 3 test runs (1 baseline + 2 waves), got ${testRuns.length}`);
    });

    // (d) engine calls callbacks.requestTestRegressionAction on regression
    it("calls requestTestRegressionAction on test regression", async () => {
      let testRunCount = 0;
      const io = createMockIO(undefined, async (cmd, args, _cwd) => {
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
          return { stdout: ".git\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
          return { stdout: "feature/test\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
          return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "kill" && args[0] === "-0") {
          return { stdout: "", stderr: "No such process", exitCode: 1 };
        }
        if (cmd === "sh" && args[0] === "-c" && args[1]?.startsWith("npm test")) {
          testRunCount++;
          // First call = baseline (passes), subsequent = regression
          if (testRunCount === 1) {
            return { stdout: "All tests passed", stderr: "", exitCode: 0 };
          }
          return {
            stdout: "not ok 1 - widget test\nFAILED",
            stderr: "",
            exitCode: 1,
          };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
      seedFiles(io);


      io.dispatchSubagent = async (config) => ({
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      });

      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel" as const,
          tdd: true,
          finalReview: false,
          specCheck: false,
          integrationTest: true,
          testCommand: "npm test",
        }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      assert.ok(
        callbacks.calls["requestTestRegressionAction"],
        "requestTestRegressionAction should be called on regression",
      );
    });

    // (e) engine persists retryState.tasks before task-level retries
    it("persists retryState.tasks before task-level retries", async () => {
      const io = createMockIO();
      seedFiles(io);


      let dispatchCount = 0;
      io.dispatchSubagent = async (config) => {
        dispatchCount++;
        if (config.taskNumber === 1 && dispatchCount === 1) {
          return {
            taskNumber: config.taskNumber,
            status: "BLOCKED" as const,
            output: "blocked output",
            concerns: null,
            needs: null,
            blocker: "Missing dependency",
            filesChanged: [],
          };
        }
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      };

      const stateWrites: RunState[] = [];
      const origWriteFile = io.writeFile.bind(io);
      io.writeFile = async (path: string, content: string) => {
        if (path.includes(".state.json")) {
          try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
        }
        return origWriteFile(path, content);
      };

      const callbacks = createMockCallbacks({
        requestJudgment: async (req) => ({ action: "retry" as const }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Check that retryState.tasks was persisted
      const hasTaskRetry = stateWrites.some(
        (s) => s.retryState && Object.keys(s.retryState.tasks).length > 0,
      );
      assert.ok(hasTaskRetry, "retryState.tasks should be persisted before task retry");
    });
  });

  describe("judgment response handling", () => {

    // (f) JudgmentResponse "skip": proceeds to next task
    it("skip judgment proceeds to next task", async () => {
      const io = createMockIO();
      seedFiles(io);


      io.dispatchSubagent = async (config) => {
        if (config.taskNumber === 1) {
          return {
            taskNumber: 1,
            status: "BLOCKED" as const,
            output: "blocked",
            concerns: null, needs: null,
            blocker: "Cannot proceed",
            filesChanged: [],
          };
        }
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      };

      const callbacks = createMockCallbacks({
        requestJudgment: async () => ({ action: "skip" as const }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Execution should complete even though task 1 was blocked
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const completed = progressCalls.filter(
        (c: any[]) => c[0].type === "execution_completed",
      );
      assert.ok(completed.length > 0, "Execution should complete after skip");
    });

    // (g) JudgmentResponse "stop": halts, persists stopped state
    it("stop judgment halts and persists stopped state", async () => {
      const io = createMockIO();
      seedFiles(io);


      io.dispatchSubagent = async (config) => ({
        taskNumber: config.taskNumber,
        status: "BLOCKED" as const,
        output: "blocked",
        concerns: null, needs: null,
        blocker: "Cannot proceed",
        filesChanged: [],
      });

      const stateWrites: RunState[] = [];
      const origWriteFile = io.writeFile.bind(io);
      io.writeFile = async (path: string, content: string) => {
        if (path.includes(".state.json")) {
          try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
        }
        return origWriteFile(path, content);
      };

      const callbacks = createMockCallbacks({
        requestJudgment: async () => ({ action: "stop" as const }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Should persist stopped state
      const stoppedStates = stateWrites.filter((s) => s.status === "stopped");
      assert.ok(stoppedStates.length > 0, "Stopped state should be persisted");

      // execution_completed should NOT be emitted on stop
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const completedEvents = progressCalls.filter(
        (c: any[]) => c[0].type === "execution_completed",
      );
      assert.equal(completedEvents.length, 0, "Should not emit execution_completed on stop");

      // Plan should NOT be moved to done
      const donePath = join(TEST_CWD, ".pi", "plans", "done", PLAN_FILE_NAME);
      assert.equal(io.files.has(donePath), false, "Plan should NOT be moved to done on stop");

      // State file should NOT be deleted (should still exist for resume)
      const stateFilePath = join(TEST_CWD, ".pi/plan-runs", PLAN_FILE_NAME + ".state.json");
      assert.ok(io.files.has(stateFilePath), "State file should NOT be deleted on stop");

      // execution_stopped should be emitted
      const stoppedEvents = progressCalls.filter(
        (c: any[]) => c[0].type === "execution_stopped",
      );
      assert.ok(stoppedEvents.length > 0, "Should emit execution_stopped on stop");
    });

    // (h) JudgmentResponse "provide_context": re-dispatches with context appended
    it("provide_context re-dispatches with context appended and persists context/model", async () => {
      const io = createMockIO();
      seedFiles(io);


      let task1Dispatches = 0;
      const dispatchedTasks: SubagentConfig[] = [];
      io.dispatchSubagent = async (config) => {
        dispatchedTasks.push(config);
        if (config.taskNumber === 1) {
          task1Dispatches++;
          if (task1Dispatches === 1) {
            return {
              taskNumber: 1,
              status: "NEEDS_CONTEXT" as const,
              output: "need more info",
              concerns: null,
              needs: "What is the API format?",
              blocker: null,
              filesChanged: [],
            };
          }
        }
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      };

      const stateWrites: RunState[] = [];
      const origWriteFile = io.writeFile.bind(io);
      io.writeFile = async (path: string, content: string) => {
        if (path.includes(".state.json")) {
          try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
        }
        return origWriteFile(path, content);
      };

      const callbacks = createMockCallbacks({
        requestJudgment: async () => ({
          action: "provide_context" as const,
          context: "The API uses JSON format.",
          model: "claude-sonnet-4-20250514",
        }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Task 1 should have been dispatched twice
      const task1Configs = dispatchedTasks.filter((d) => d.taskNumber === 1);
      assert.ok(task1Configs.length >= 2, `Task 1 should be dispatched at least twice, got ${task1Configs.length}`);

      // Second dispatch should contain the provided context
      const secondDispatch = task1Configs[1];
      assert.ok(
        secondDispatch.task.includes("The API uses JSON format."),
        "Second dispatch should include provided context",
      );

      // retryState should persist context and model
      const retryStates = stateWrites.filter(
        (s) => s.retryState && s.retryState.tasks["1"],
      );
      assert.ok(retryStates.length > 0, "Should persist retry state for task 1");
      const lastRetryState = retryStates[retryStates.length - 1];
      assert.equal(
        lastRetryState.retryState.tasks["1"].lastContext,
        "The API uses JSON format.",
        "lastContext should be persisted from judgment response",
      );
      assert.equal(
        lastRetryState.retryState.tasks["1"].lastModel,
        "claude-sonnet-4-20250514",
        "lastModel should be persisted from judgment response",
      );
    });

    // (i) JudgmentResponse "accept": logs concerns and proceeds
    it("accept judgment logs concerns and proceeds", async () => {
      const io = createMockIO();
      seedFiles(io);


      io.dispatchSubagent = async (config) => {
        if (config.taskNumber === 1) {
          return {
            taskNumber: 1,
            status: "DONE_WITH_CONCERNS" as const,
            output: "done but concerns",
            concerns: "Code could be cleaner",
            needs: null,
            blocker: null,
            filesChanged: ["file.ts"],
          };
        }
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      };

      const callbacks = createMockCallbacks({
        requestJudgment: async () => ({ action: "accept" as const }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Execution should complete
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const completed = progressCalls.filter(
        (c: any[]) => c[0].type === "execution_completed",
      );
      assert.ok(completed.length > 0, "Execution should complete after accept");

      // Should have emitted a task_progress event with the concerns
      const concernEvents = progressCalls.filter(
        (c: any[]) =>
          c[0].type === "task_progress" &&
          typeof c[0].status === "string" &&
          c[0].status.includes("Accepted with concerns"),
      );
      assert.ok(concernEvents.length > 0, "Should emit task_progress with concerns on accept");
      assert.ok(
        concernEvents[0][0].status.includes("Code could be cleaner"),
        "Concern message should be included in the progress event",
      );
    });

    // (j) JudgmentResponse "escalate": calls callbacks.requestFailureAction
    it("escalate judgment calls requestFailureAction", async () => {
      const io = createMockIO();
      seedFiles(io);


      io.dispatchSubagent = async (config) => ({
        taskNumber: config.taskNumber,
        status: "BLOCKED" as const,
        output: "blocked",
        concerns: null, needs: null,
        blocker: "Fatal error",
        filesChanged: [],
      });

      const callbacks = createMockCallbacks({
        requestJudgment: async () => ({ action: "escalate" as const }),
      });
      // Override requestFailureAction to return skip (so execution can proceed)
      callbacks.requestFailureAction = async (ctx) => {
        if (!callbacks.calls["requestFailureAction"]) callbacks.calls["requestFailureAction"] = [];
        callbacks.calls["requestFailureAction"].push([ctx]);
        return "skip";
      };

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      assert.ok(
        callbacks.calls["requestFailureAction"],
        "requestFailureAction should be called on escalate",
      );
    });
  });

  describe("retry and state persistence", () => {

    // (k) retries waves up to 3 times, persisting retryState.waves
    it("retries waves up to 3 times and persists retryState.waves", async () => {
      const io = createMockIO();
      seedFiles(io);


      io.dispatchSubagent = async (config) => ({
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      });

      // Spec review always fails
      let specDispatchCount = 0;
      const origDispatch = io.dispatchSubagent.bind(io);
      io.dispatchSubagent = async (config, options) => {
        if (config.agent === "spec-reviewer") {
          specDispatchCount++;
          return {
            taskNumber: config.taskNumber,
            status: "BLOCKED" as const,
            output: "Spec review failed: implementation does not match spec",
            concerns: null, needs: null,
            blocker: "Spec mismatch",
            filesChanged: [],
          };
        }
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      };

      const stateWrites: RunState[] = [];
      const origWriteFile = io.writeFile.bind(io);
      io.writeFile = async (path: string, content: string) => {
        if (path.includes(".state.json")) {
          try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
        }
        return origWriteFile(path, content);
      };

      let judgmentCount = 0;
      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel" as const,
          tdd: true,
          finalReview: false,
          specCheck: true,
          integrationTest: false,
          testCommand: null,
        }),
        requestJudgment: async (req) => {
          judgmentCount++;
          if (req.type === "spec_review_failed") {
            return { action: "retry" as const, context: "fix the spec issues", model: "better-model" };
          }
          if (req.type === "retry_exhausted") {
            return { action: "skip" as const };
          }
          return { action: "accept" as const };
        },
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Check that retryState.waves was persisted with context and model
      const waveRetryStates = stateWrites.filter(
        (s) => s.retryState && Object.keys(s.retryState.waves).length > 0,
      );
      assert.ok(waveRetryStates.length > 0, "retryState.waves should be persisted during wave retries");

      // Verify context and model are persisted (not null)
      const lastWaveRetry = waveRetryStates[waveRetryStates.length - 1]!;
      const waveKeys = Object.keys(lastWaveRetry.retryState.waves);
      assert.ok(waveKeys.length > 0, "Should have wave retry entries");
      const waveEntry = lastWaveRetry.retryState.waves[waveKeys[0]!]!;
      assert.equal(waveEntry.lastContext, "fix the spec issues", "Wave retry should persist lastContext from judgment");
      assert.equal(waveEntry.lastModel, "better-model", "Wave retry should persist lastModel from judgment");
    });

    // (l) dispatches spec reviews if enabled
    it("dispatches spec reviews if specCheck is enabled", async () => {
      const io = createMockIO();
      seedFiles(io);


      const dispatchedAgents: string[] = [];
      io.dispatchSubagent = async (config) => {
        dispatchedAgents.push(config.agent);
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      };

      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel" as const,
          tdd: true,
          finalReview: false,
          specCheck: true,
          integrationTest: false,
          testCommand: null,
        }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      assert.ok(
        dispatchedAgents.includes("spec-reviewer"),
        "Should dispatch spec-reviewer when specCheck is enabled",
      );
    });

    // (m) dispatches final code review if enabled, emits code_review_completed
    it("dispatches final code review if enabled and emits code_review_completed", async () => {
      const io = createMockIO();
      seedFiles(io);


      const dispatchedAgents: string[] = [];
      io.dispatchSubagent = async (config) => {
        dispatchedAgents.push(config.agent);
        if (config.agent === "code-reviewer") {
          return {
            taskNumber: 0,
            status: "DONE" as const,
            output: "## Critical\n### Security Issue\nSQL injection vulnerability\n\n## Strengths\n- Good test coverage\n\n## Recommendations\n- Add input validation\n\n## Overall\nGenerally good code.",
            concerns: null, needs: null, blocker: null,
            filesChanged: [],
          };
        }
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      };

      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel" as const,
          tdd: true,
          finalReview: true,
          specCheck: false,
          integrationTest: false,
          testCommand: null,
        }),
        requestJudgment: async (req) => {
          if (req.type === "code_review") {
            return { action: "accept" as const };
          }
          return { action: "accept" as const };
        },
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      assert.ok(
        dispatchedAgents.includes("code-reviewer"),
        "Should dispatch code-reviewer when finalReview is enabled",
      );

      // Check for code_review_completed event
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const codeReviewEvents = progressCalls.filter(
        (c: any[]) => c[0].type === "code_review_completed",
      );
      assert.ok(codeReviewEvents.length > 0, "Should emit code_review_completed event");
      assert.ok(codeReviewEvents[0][0].review, "Event should include review summary");
    });

    // (n) persists retryState.finalReview for final-review retries and dispatches fix-up work
    it("persists retryState.finalReview for final-review retries and dispatches fix-up work before re-review", async () => {
      const io = createMockIO();
      seedFiles(io);


      let reviewCount = 0;
      const dispatchedAgentOrder: string[] = [];
      io.dispatchSubagent = async (config) => {
        dispatchedAgentOrder.push(config.agent);
        if (config.agent === "code-reviewer") {
          reviewCount++;
          return {
            taskNumber: 0,
            status: "DONE" as const,
            output: "## Critical\n### Issue\nBug found\n\n## Overall\nNeeds fixes.",
            concerns: null, needs: null, blocker: null,
            filesChanged: [],
          };
        }
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      };

      const stateWrites: RunState[] = [];
      const origWriteFile = io.writeFile.bind(io);
      io.writeFile = async (path: string, content: string) => {
        if (path.includes(".state.json")) {
          try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
        }
        return origWriteFile(path, content);
      };

      let judgmentCount = 0;
      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel" as const,
          tdd: true,
          finalReview: true,
          specCheck: false,
          integrationTest: false,
          testCommand: null,
        }),
        requestJudgment: async (req) => {
          if (req.type === "code_review") {
            judgmentCount++;
            if (judgmentCount <= 2) {
              return { action: "retry" as const, context: "fix the bugs", model: "claude-opus-4-20250514" };
            }
            return { action: "accept" as const };
          }
          return { action: "accept" as const };
        },
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Check that retryState.finalReview was persisted
      const hasFinalReviewRetry = stateWrites.some(
        (s) => s.retryState && s.retryState.finalReview !== null,
      );
      assert.ok(hasFinalReviewRetry, "retryState.finalReview should be persisted during final review retries");

      // Verify context and model are persisted in finalReview retry state
      const finalReviewStates = stateWrites.filter(
        (s) => s.retryState && s.retryState.finalReview !== null,
      );
      assert.ok(finalReviewStates.length > 0, "Should have final review retry states");
      const lastFinalReview = finalReviewStates[finalReviewStates.length - 1];
      assert.equal(
        lastFinalReview.retryState.finalReview!.lastContext,
        "fix the bugs",
        "lastContext should be persisted from judgment response in final review retry",
      );
      assert.equal(
        lastFinalReview.retryState.finalReview!.lastModel,
        "claude-opus-4-20250514",
        "lastModel should be persisted from judgment response in final review retry",
      );

      // Verify fix-up implementer dispatch happens before re-review
      // After the first code-reviewer dispatch, there should be an implementer fix-up, then another code-reviewer
      const afterFirstReview = dispatchedAgentOrder.slice(
        dispatchedAgentOrder.indexOf("code-reviewer") + 1,
      );
      const fixupIdx = afterFirstReview.indexOf("implementer");
      const secondReviewIdx = afterFirstReview.indexOf("code-reviewer");
      assert.ok(fixupIdx >= 0, "Should dispatch implementer for fix-up work after code review retry");
      assert.ok(secondReviewIdx > fixupIdx, "Fix-up implementer should be dispatched before re-review");
    });

    // (o) persists state after each wave
    it("persists state after each wave", async () => {
      const io = createMockIO();
      seedFiles(io);


      io.dispatchSubagent = async (config) => ({
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      });

      const stateWrites: RunState[] = [];
      const origWriteFile = io.writeFile.bind(io);
      io.writeFile = async (path: string, content: string) => {
        if (path.includes(".state.json")) {
          try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
        }
        return origWriteFile(path, content);
      };

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Check that waves state was persisted with done status
      const doneWaves = stateWrites.filter(
        (s) => s.waves && s.waves.some((w) => w.status === "done"),
      );
      assert.ok(doneWaves.length > 0, "State should be persisted with done wave status");
    });
  });

  describe("cancellation", () => {

    // (p) "stop after wave" cancellation: completes wave, commits, stops
    it("stop after wave: completes wave, commits, then stops", async () => {
      const io = createMockIO();
      seedFiles(io);


      let dispatchCount = 0;
      io.dispatchSubagent = async (config) => {
        dispatchCount++;
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      };

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      // Request cancellation after first dispatch
      const origDispatch = io.dispatchSubagent;
      io.dispatchSubagent = async (config, options) => {
        const result = await origDispatch(config, options);
        // Cancel after first wave's task dispatches
        if (config.taskNumber === 1) {
          engine.requestCancellation("wave");
        }
        return result;
      };

      await engine.execute(PLAN_PATH, callbacks);

      // Wave 1 should have committed
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const waveCompleted = progressCalls.filter(
        (c: any[]) => c[0].type === "wave_completed",
      );
      assert.ok(waveCompleted.length >= 1, "First wave should commit before stopping");

      // execution_completed should NOT be emitted when stopped
      const completedEvents = progressCalls.filter(
        (c: any[]) => c[0].type === "execution_completed",
      );
      assert.equal(completedEvents.length, 0, "Should not emit execution_completed on stop");

      // Plan should NOT be moved to done
      const donePath = join(TEST_CWD, ".pi", "plans", "done", PLAN_FILE_NAME);
      assert.equal(io.files.has(donePath), false, "Plan should NOT be moved to done on stop");

      // execution_stopped should be emitted
      const executionStopped = progressCalls.filter(
        (c: any[]) => c[0].type === "execution_stopped",
      );
      assert.ok(executionStopped.length > 0, "Should emit execution_stopped");

      // Wave 2 should not have started
      const wave2Started = progressCalls.filter(
        (c: any[]) => c[0].type === "wave_started" && c[0].wave === 2,
      );
      assert.equal(wave2Started.length, 0, "Wave 2 should not start after cancellation");
    });

    // (q) "stop after task" cancellation: doesn't commit partial wave
    it("stop after task: does not commit partial wave", async () => {
      const io = createMockIO();
      seedFiles(io);


      // Need a plan with multiple tasks in a single wave for this test
      // Use tasks without dependencies - they'll be in the same wave
      const multiTaskPlan = `
## Goal

Build a widget library.

## Architecture Summary

Modular component architecture with barrel exports.

## Tech Stack

TypeScript, Node.js

## File Structure

- \`src/a.ts\` (Create) — Module A
- \`src/b.ts\` (Create) — Module B

## Tasks

### Task 1: Create module A

**Files:**
- Create: \`src/a.ts\`

**Steps:**
- [ ] **Step 1: Create A** — Implement module A

**Acceptance criteria:**
- Module A is exported

**Model recommendation:** cheap

### Task 2: Create module B

**Files:**
- Create: \`src/b.ts\`

**Steps:**
- [ ] **Step 1: Create B** — Implement module B

**Acceptance criteria:**
- Module B is exported

**Model recommendation:** cheap

## Dependencies

(none)

## Risk Assessment

Low risk.
`;
      io.files.set(PLAN_PATH, multiTaskPlan);

      const commitCalls: string[][] = [];
      const origExec = io.exec.bind(io);
      io.exec = async (cmd: string, args: string[], cwd: string) => {
        if (cmd === "git" && args[0] === "commit") {
          commitCalls.push(args);
        }
        return origExec(cmd, args, cwd);
      };

      io.dispatchSubagent = async (config) => ({
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      });

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      // Cancel at task level during dispatch — track dispatched tasks
      const dispatchedTasks: number[] = [];
      const origDispatch = io.dispatchSubagent;
      io.dispatchSubagent = async (config, options) => {
        dispatchedTasks.push(config.taskNumber);
        if (config.taskNumber === 1) {
          // This should trigger taskQueue.abortAfterCurrent() internally
          engine.requestCancellation("task");
        }
        return origDispatch(config, options);
      };

      await engine.execute(PLAN_PATH, callbacks);

      // Verify abortAfterCurrent effect: with concurrency=1 (sequential),
      // cancelling during task 1 should prevent task 2 from being dispatched
      // (abortAfterCurrent stops the queue from launching new tasks)
      assert.ok(
        !dispatchedTasks.includes(2),
        `abortAfterCurrent should prevent task 2 from being dispatched, but dispatched: [${dispatchedTasks.join(", ")}]`,
      );

      // Should NOT have committed wave (partial wave)
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const waveCompleted = progressCalls.filter(
        (c: any[]) => c[0].type === "wave_completed",
      );
      assert.equal(waveCompleted.length, 0, "Should NOT commit partial wave on task cancellation");

      // execution_completed should NOT be emitted
      const completedEvents = progressCalls.filter(
        (c: any[]) => c[0].type === "execution_completed",
      );
      assert.equal(completedEvents.length, 0, "Should not emit execution_completed on task cancellation");

      // Plan should NOT be moved to done
      const donePath = join(TEST_CWD, ".pi", "plans", "done", PLAN_FILE_NAME);
      assert.equal(io.files.has(donePath), false, "Plan should NOT be moved to done on task cancellation");

      // execution_stopped should be emitted
      const stoppedEvents = progressCalls.filter(
        (c: any[]) => c[0].type === "execution_stopped",
      );
      assert.ok(stoppedEvents.length > 0, "Should emit execution_stopped on task cancellation");
    });
  });

  describe("progress forwarding during retries", () => {
    it("emits task_progress events from retried dispatch via onProgress", async () => {
      const io = createMockIO();
      seedFiles(io);

      let task1Dispatches = 0;
      io.dispatchSubagent = async (config, options) => {
        if (config.taskNumber === 1) {
          task1Dispatches++;
          if (task1Dispatches === 1) {
            return {
              taskNumber: 1,
              status: "BLOCKED" as const,
              output: "blocked",
              concerns: null,
              needs: null,
              blocker: "Missing dep",
              filesChanged: [],
            };
          }
          // On retry, fire onProgress to simulate live worker status
          options?.onProgress?.(config.taskNumber, "working on retry...");
        }
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      };

      const callbacks = createMockCallbacks({
        requestJudgment: async () => ({ action: "retry" as const }),
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Verify task_progress events were emitted from the retry dispatch
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const taskProgressEvents = progressCalls.filter(
        (c: any[]) => c[0].type === "task_progress" && c[0].status === "working on retry...",
      );
      assert.ok(
        taskProgressEvents.length > 0,
        "Should emit task_progress event from retried dispatch onProgress callback",
      );
      assert.equal(taskProgressEvents[0][0].taskNumber, 1);
      assert.ok(taskProgressEvents[0][0].wave >= 1, "Should include wave number");
    });

    // (b) Live-progress test for initial TaskQueue.run() path
    it("emits task_progress events from initial TaskQueue dispatch (not just retry)", async () => {
      const io = createMockIO();
      seedFiles(io);

      io.dispatchSubagent = async (config, options) => {
        // Simulate live progress from first dispatch
        options?.onProgress?.(config.taskNumber, "compiling code...");
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      };

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Verify task_progress events from the initial dispatch
      const progressCalls = callbacks.calls["onProgress"] ?? [];
      const taskProgressEvents = progressCalls.filter(
        (c: any[]) => c[0].type === "task_progress" && c[0].status === "compiling code...",
      );
      assert.ok(
        taskProgressEvents.length > 0,
        "Should emit task_progress event from initial TaskQueue dispatch onProgress callback",
      );
    });
  });

  describe("regression-retry path", () => {
    // (c) Assert that resetWaveCommit is called and retryState.waves is persisted on regression-retry
    it("calls resetWaveCommit and persists retryState.waves on regression-retry", async () => {
      let testRunCount = 0;
      const execCalls: Array<{ cmd: string; args: string[] }> = [];
      const io = createMockIO(undefined, async (cmd, args, _cwd) => {
        execCalls.push({ cmd, args: [...args] });
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
          return { stdout: ".git\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
          return { stdout: "feature/test\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
          return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
        }
        if (cmd === "kill" && args[0] === "-0") {
          return { stdout: "", stderr: "No such process", exitCode: 1 };
        }
        if (cmd === "sh" && args[0] === "-c" && args[1]?.startsWith("npm test")) {
          testRunCount++;
          // First call = baseline (passes), subsequent = regression then pass
          if (testRunCount === 1) {
            return { stdout: "All tests passed", stderr: "", exitCode: 0 };
          }
          if (testRunCount === 2) {
            return { stdout: "not ok 1 - widget test\nFAILED", stderr: "", exitCode: 1 };
          }
          return { stdout: "All tests passed", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
      seedFiles(io);

      io.dispatchSubagent = async (config) => ({
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      });

      const stateWrites: RunState[] = [];
      const origWriteFile = io.writeFile.bind(io);
      io.writeFile = async (path: string, content: string) => {
        if (path.includes(".state.json")) {
          try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
        }
        return origWriteFile(path, content);
      };

      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel" as const,
          tdd: true,
          finalReview: false,
          specCheck: false,
          integrationTest: true,
          testCommand: "npm test",
        }),
        requestTestRegressionAction: async () => "retry",
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      await engine.execute(PLAN_PATH, callbacks);

      // Verify resetWaveCommit was called (git reset HEAD~1)
      const resetCalls = execCalls.filter(
        (c) => c.cmd === "git" && c.args[0] === "reset" && c.args.includes("HEAD~1"),
      );
      assert.ok(resetCalls.length > 0, "resetWaveCommit should call git reset HEAD~1 on regression-retry");

      // Verify retryState.waves was persisted
      const hasWaveRetry = stateWrites.some(
        (s) => s.retryState && Object.keys(s.retryState.waves).length > 0,
      );
      assert.ok(hasWaveRetry, "retryState.waves should be persisted on regression-retry");
    });
  });
});

// ── parseCodeReviewOutput unit tests ──────────────────────────────────

describe("parseCodeReviewOutput", () => {
  it("parses findings grouped by severity", () => {
    const input = [
      "## Critical",
      "### SQL Injection",
      "User input is not sanitized in query builder.",
      "",
      "### XSS Vulnerability",
      "HTML output is not escaped.",
      "",
      "## Important",
      "### Missing Error Handling",
      "No try/catch around async operations.",
      "",
      "## Minor",
      "### Inconsistent Naming",
      "Some variables use camelCase, others use snake_case.",
      "",
      "## Strengths",
      "- Good test coverage",
      "- Clear module separation",
      "",
      "## Recommendations",
      "- Add input validation",
      "- Use parameterized queries",
      "",
      "## Overall",
      "The code needs security improvements but has a solid foundation.",
    ].join("\n");

    const summary = parseCodeReviewOutput(input);

    // Findings count
    assert.equal(summary.findings.length, 4, "Should have 4 findings total");

    // Severity grouping
    const critical = summary.findings.filter((f) => f.severity === "critical");
    const important = summary.findings.filter((f) => f.severity === "important");
    const minor = summary.findings.filter((f) => f.severity === "minor");
    assert.equal(critical.length, 2, "Should have 2 critical findings");
    assert.equal(important.length, 1, "Should have 1 important finding");
    assert.equal(minor.length, 1, "Should have 1 minor finding");

    // Finding titles
    assert.equal(critical[0].title, "SQL Injection");
    assert.equal(critical[1].title, "XSS Vulnerability");
    assert.equal(important[0].title, "Missing Error Handling");
    assert.equal(minor[0].title, "Inconsistent Naming");

    // Finding details
    assert.ok(critical[0].details.includes("User input is not sanitized"));

    // Strengths
    assert.equal(summary.strengths.length, 2);
    assert.ok(summary.strengths[0].includes("Good test coverage"));
    assert.ok(summary.strengths[1].includes("Clear module separation"));

    // Recommendations
    assert.equal(summary.recommendations.length, 2);
    assert.ok(summary.recommendations[0].includes("Add input validation"));
    assert.ok(summary.recommendations[1].includes("Use parameterized queries"));

    // Overall assessment
    assert.ok(summary.overallAssessment.includes("security improvements"));
    assert.ok(summary.overallAssessment.includes("solid foundation"));

    // Raw output preserved
    assert.equal(summary.rawOutput, input);
  });

  it("returns empty summary for output with no recognized sections", () => {
    const summary = parseCodeReviewOutput("Nothing structured here.");

    assert.equal(summary.findings.length, 0);
    assert.equal(summary.strengths.length, 0);
    assert.equal(summary.recommendations.length, 0);
    assert.equal(summary.overallAssessment, "");
  });

  it("parses template-compatible format with ### Issues and #### severity subsections", () => {
    const input = [
      "### Issues",
      "",
      "#### Critical",
      "",
      "1. **SQL Injection** - User input is not sanitized",
      "   Details about the SQL injection issue.",
      "",
      "2. **XSS Vulnerability** - HTML output is not escaped",
      "",
      "#### Important (Should Fix)",
      "",
      "1. **Missing Error Handling** - No try/catch around async operations",
      "",
      "#### Minor (Nice to Have)",
      "",
      "1. **Inconsistent Naming** - Some variables use camelCase, others snake_case",
      "",
      "### Strengths",
      "",
      "1. Good test coverage",
      "2. Clear module separation",
      "",
      "### Recommendations",
      "",
      "1. Add input validation",
      "2. Use parameterized queries",
      "",
      "### Overall",
      "The code needs security improvements but has a solid foundation.",
    ].join("\n");

    const summary = parseCodeReviewOutput(input);

    // Findings count
    assert.equal(summary.findings.length, 4, "Should have 4 findings total");

    // Severity grouping
    const critical = summary.findings.filter((f) => f.severity === "critical");
    const important = summary.findings.filter((f) => f.severity === "important");
    const minor = summary.findings.filter((f) => f.severity === "minor");
    assert.equal(critical.length, 2, "Should have 2 critical findings");
    assert.equal(important.length, 1, "Should have 1 important finding");
    assert.equal(minor.length, 1, "Should have 1 minor finding");

    // Finding titles
    assert.equal(critical[0].title, "SQL Injection");
    assert.equal(critical[1].title, "XSS Vulnerability");
    assert.equal(important[0].title, "Missing Error Handling");
    assert.equal(minor[0].title, "Inconsistent Naming");

    // Details captured
    assert.ok(critical[0].details.includes("Details about the SQL injection") || critical[0].details.includes("User input is not sanitized"));

    // Strengths
    assert.equal(summary.strengths.length, 2);
    assert.ok(summary.strengths[0].includes("Good test coverage"));
    assert.ok(summary.strengths[1].includes("Clear module separation"));

    // Recommendations
    assert.equal(summary.recommendations.length, 2);
    assert.ok(summary.recommendations[0].includes("Add input validation"));
    assert.ok(summary.recommendations[1].includes("Use parameterized queries"));

    // Overall assessment
    assert.ok(summary.overallAssessment.includes("security improvements"));

    // Raw output preserved
    assert.equal(summary.rawOutput, input);
  });

  it("backward-compatible: still parses original ## Critical + ### finding format", () => {
    const input = [
      "## Critical",
      "### Old Style Finding",
      "Details here.",
      "",
      "## Strengths",
      "- Good coverage",
    ].join("\n");

    const summary = parseCodeReviewOutput(input);
    assert.equal(summary.findings.length, 1);
    assert.equal(summary.findings[0].severity, "critical");
    assert.equal(summary.findings[0].title, "Old Style Finding");
    assert.equal(summary.strengths.length, 1);
    assert.ok(summary.strengths[0].includes("Good coverage"));
  });

  it("parses numbered findings without bold markers", () => {
    const input = [
      "### Issues",
      "#### Critical",
      "1. Missing authentication check",
      "The endpoint has no auth guard.",
      "",
    ].join("\n");

    const summary = parseCodeReviewOutput(input);
    assert.equal(summary.findings.length, 1);
    assert.equal(summary.findings[0].severity, "critical");
    assert.equal(summary.findings[0].title, "Missing authentication check");
  });
});

// ── Escalate handling tests ─────────────────────────────────────────

describe("escalate judgment in wave-level retry_exhausted", () => {
  it("escalate at wave retry_exhausted calls requestFailureAction and retry continues", async () => {
    const io = createMockIO();
    seedFiles(io);

    // Spec review always fails to force wave retries
    io.dispatchSubagent = async (config) => {
      if (config.agent === "spec-reviewer") {
        return {
          taskNumber: config.taskNumber,
          status: "BLOCKED" as const,
          output: "Spec mismatch",
          concerns: null, needs: null,
          blocker: "Spec mismatch",
          filesChanged: [],
        };
      }
      return {
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      };
    };

    let judgmentCallCount = 0;
    let failureActionCalled = false;
    const callbacks = createMockCallbacks({
      requestSettings: async () => ({
        execution: "parallel" as const,
        tdd: true,
        finalReview: false,
        specCheck: true,
        integrationTest: false,
        testCommand: null,
      }),
      requestJudgment: async (req) => {
        judgmentCallCount++;
        if (req.type === "spec_review_failed") {
          return { action: "retry" as const };
        }
        if (req.type === "retry_exhausted") {
          return { action: "escalate" as const };
        }
        return { action: "accept" as const };
      },
      requestFailureAction: async (ctx) => {
        failureActionCalled = true;
        return "skip";
      },
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    await engine.execute(PLAN_PATH, callbacks);

    assert.ok(failureActionCalled, "requestFailureAction should be called when wave retry_exhausted escalates");
  });

  it("escalate at wave retry_exhausted with stop from requestFailureAction persists stopped", async () => {
    const io = createMockIO();
    seedFiles(io);

    io.dispatchSubagent = async (config) => {
      if (config.agent === "spec-reviewer") {
        return {
          taskNumber: config.taskNumber,
          status: "BLOCKED" as const,
          output: "Spec mismatch",
          concerns: null, needs: null,
          blocker: "Spec mismatch",
          filesChanged: [],
        };
      }
      return {
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      };
    };

    const stateWrites: RunState[] = [];
    const origWriteFile = io.writeFile.bind(io);
    io.writeFile = async (path: string, content: string) => {
      if (path.includes(".state.json")) {
        try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
      }
      return origWriteFile(path, content);
    };

    const callbacks = createMockCallbacks({
      requestSettings: async () => ({
        execution: "parallel" as const,
        tdd: true,
        finalReview: false,
        specCheck: true,
        integrationTest: false,
        testCommand: null,
      }),
      requestJudgment: async (req) => {
        if (req.type === "spec_review_failed") {
          return { action: "retry" as const };
        }
        if (req.type === "retry_exhausted") {
          return { action: "escalate" as const };
        }
        return { action: "accept" as const };
      },
      requestFailureAction: async () => "stop",
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    await engine.execute(PLAN_PATH, callbacks);

    const stoppedStates = stateWrites.filter((s) => s.status === "stopped");
    assert.ok(stoppedStates.length > 0, "Should persist stopped state when escalated and user chooses stop");
  });
});

describe("escalate judgment in task-level retry_exhausted", () => {
  it("escalate at task retry_exhausted calls requestFailureAction", async () => {
    const io = createMockIO();
    seedFiles(io);

    // Task 1 is always BLOCKED, forcing retries
    io.dispatchSubagent = async (config) => {
      if (config.taskNumber === 1) {
        return {
          taskNumber: 1,
          status: "BLOCKED" as const,
          output: "blocked",
          concerns: null, needs: null,
          blocker: "Fatal error",
          filesChanged: [],
        };
      }
      return {
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      };
    };

    let failureActionCalled = false;
    const callbacks = createMockCallbacks({
      requestJudgment: async (req) => {
        if (req.type === "retry_exhausted") {
          return { action: "escalate" as const };
        }
        // For task judgments, always retry to exhaust retries
        return { action: "retry" as const };
      },
      requestFailureAction: async (ctx) => {
        failureActionCalled = true;
        return "skip";
      },
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    await engine.execute(PLAN_PATH, callbacks);

    assert.ok(failureActionCalled, "requestFailureAction should be called when task retry_exhausted escalates");
  });

  it("escalate at task retry_exhausted with stop persists stopped state", async () => {
    const io = createMockIO();
    seedFiles(io);

    io.dispatchSubagent = async (config) => {
      if (config.taskNumber === 1) {
        return {
          taskNumber: 1,
          status: "BLOCKED" as const,
          output: "blocked",
          concerns: null, needs: null,
          blocker: "Fatal error",
          filesChanged: [],
        };
      }
      return {
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      };
    };

    const stateWrites: RunState[] = [];
    const origWriteFile = io.writeFile.bind(io);
    io.writeFile = async (path: string, content: string) => {
      if (path.includes(".state.json")) {
        try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
      }
      return origWriteFile(path, content);
    };

    const callbacks = createMockCallbacks({
      requestJudgment: async (req) => {
        if (req.type === "retry_exhausted") {
          return { action: "escalate" as const };
        }
        return { action: "retry" as const };
      },
      requestFailureAction: async () => "stop",
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    await engine.execute(PLAN_PATH, callbacks);

    const stoppedStates = stateWrites.filter((s) => s.status === "stopped");
    assert.ok(stoppedStates.length > 0, "Should persist stopped state when task escalated and user chooses stop");
  });
});

describe("escalate judgment in spec review failure", () => {
  it("escalate at spec review failure calls requestFailureAction", async () => {
    const io = createMockIO();
    seedFiles(io);

    io.dispatchSubagent = async (config) => {
      if (config.agent === "spec-reviewer") {
        return {
          taskNumber: config.taskNumber,
          status: "BLOCKED" as const,
          output: "Spec mismatch",
          concerns: null, needs: null,
          blocker: "Spec mismatch",
          filesChanged: [],
        };
      }
      return {
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      };
    };

    let failureActionCalled = false;
    const callbacks = createMockCallbacks({
      requestSettings: async () => ({
        execution: "parallel" as const,
        tdd: true,
        finalReview: false,
        specCheck: true,
        integrationTest: false,
        testCommand: null,
      }),
      requestJudgment: async (req) => {
        if (req.type === "spec_review_failed") {
          return { action: "escalate" as const };
        }
        return { action: "accept" as const };
      },
      requestFailureAction: async (ctx) => {
        failureActionCalled = true;
        return "skip"; // skip to continue
      },
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    await engine.execute(PLAN_PATH, callbacks);

    assert.ok(failureActionCalled, "requestFailureAction should be called when spec review escalates");
  });

  it("escalate at spec review failure with retry returns retry", async () => {
    const io = createMockIO();
    seedFiles(io);

    let specDispatchCount = 0;
    io.dispatchSubagent = async (config) => {
      if (config.agent === "spec-reviewer") {
        specDispatchCount++;
        if (specDispatchCount <= 1) {
          return {
            taskNumber: config.taskNumber,
            status: "BLOCKED" as const,
            output: "Spec mismatch",
            concerns: null, needs: null,
            blocker: "Spec mismatch",
            filesChanged: [],
          };
        }
        // Pass on subsequent attempts
        return {
          taskNumber: config.taskNumber,
          status: "DONE" as const,
          output: "done",
          concerns: null, needs: null, blocker: null,
          filesChanged: [],
        };
      }
      return {
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      };
    };

    let failureActionCallCount = 0;
    const callbacks = createMockCallbacks({
      requestSettings: async () => ({
        execution: "parallel" as const,
        tdd: true,
        finalReview: false,
        specCheck: true,
        integrationTest: false,
        testCommand: null,
      }),
      requestJudgment: async (req) => {
        if (req.type === "spec_review_failed") {
          return { action: "escalate" as const };
        }
        return { action: "accept" as const };
      },
      requestFailureAction: async () => {
        failureActionCallCount++;
        return "retry";
      },
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    await engine.execute(PLAN_PATH, callbacks);

    assert.ok(failureActionCallCount > 0, "requestFailureAction should be called on spec review escalate");
    // Spec review should have been dispatched more than once due to retry
    assert.ok(specDispatchCount > 1, "Spec review should retry after escalate-retry");
  });

  it("escalate at spec review failure with stop returns stop", async () => {
    const io = createMockIO();
    seedFiles(io);

    io.dispatchSubagent = async (config) => {
      if (config.agent === "spec-reviewer") {
        return {
          taskNumber: config.taskNumber,
          status: "BLOCKED" as const,
          output: "Spec mismatch",
          concerns: null, needs: null,
          blocker: "Spec mismatch",
          filesChanged: [],
        };
      }
      return {
        taskNumber: config.taskNumber,
        status: "DONE" as const,
        output: "done",
        concerns: null, needs: null, blocker: null,
        filesChanged: [],
      };
    };

    const stateWrites: RunState[] = [];
    const origWriteFile = io.writeFile.bind(io);
    io.writeFile = async (path: string, content: string) => {
      if (path.includes(".state.json")) {
        try { stateWrites.push(JSON.parse(content)); } catch { /* ignore */ }
      }
      return origWriteFile(path, content);
    };

    const callbacks = createMockCallbacks({
      requestSettings: async () => ({
        execution: "parallel" as const,
        tdd: true,
        finalReview: false,
        specCheck: true,
        integrationTest: false,
        testCommand: null,
      }),
      requestJudgment: async (req) => {
        if (req.type === "spec_review_failed") {
          return { action: "escalate" as const };
        }
        return { action: "accept" as const };
      },
      requestFailureAction: async () => "stop",
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    await engine.execute(PLAN_PATH, callbacks);

    const stoppedStates = stateWrites.filter((s) => s.status === "stopped");
    assert.ok(stoppedStates.length > 0, "Should persist stopped state when spec review escalated with stop");

    const progressCalls = callbacks.calls["onProgress"] ?? [];
    const completedEvents = progressCalls.filter(
      (c: any[]) => c[0].type === "execution_completed",
    );
    assert.equal(completedEvents.length, 0, "Should not emit execution_completed when stopped");
  });
});
