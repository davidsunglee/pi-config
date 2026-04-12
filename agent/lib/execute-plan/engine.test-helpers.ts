import { join } from "node:path";
import type {
  ExecutionIO,
  EngineCallbacks,
  ExecutionSettings,
  WorkspaceChoice,
  SubagentResult,
  Plan,
  RunState,
  FailureContext,
  TestRegressionContext,
  JudgmentRequest,
  ProgressEvent,
} from "./types.ts";

// ── Constants ───────────────────────────────────────────────────────

export const TEST_CWD = "/fake/repo";
export const TEST_AGENT_DIR = "/fake/repo/agent";
export const PLAN_FILE_NAME = "test-plan.md";
export const PLAN_PATH = join(TEST_CWD, ".pi", "plans", PLAN_FILE_NAME);

export const DEFAULT_SETTINGS: ExecutionSettings = {
  execution: "parallel",
  tdd: true,
  finalReview: false,
  specCheck: false,
  integrationTest: false,
  testCommand: null,
};

export const SETTINGS_JSON = JSON.stringify({
  modelTiers: {
    capable: "claude-opus-4-20250514",
    standard: "claude-sonnet-4-20250514",
    cheap: "claude-haiku-3-20250307",
  },
});

// ── Plan fixture ────────────────────────────────────────────────────

export const UNIT_TEST_PLAN_MD = `
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

// ── Mock IO ─────────────────────────────────────────────────────────

export interface MockExecHandler {
  (cmd: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export function createMockIO(
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

/**
 * Typed record of callback invocations captured by `createMockCallbacks`.
 * Each key maps to an array of argument-tuples for that callback.
 * The index signature preserves backwards-compatibility with ad-hoc
 * string keys while giving typed access for known callback names.
 */
export interface CallRecord {
  requestSettings: [Plan, Partial<ExecutionSettings>][];
  requestResumeAction: [RunState][];
  confirmMainBranch: [string][];
  requestWorktreeSetup: [string, string][];
  requestFailureAction: [FailureContext][];
  requestTestRegressionAction: [TestRegressionContext][];
  requestTestCommand: [][];
  requestJudgment: [JudgmentRequest][];
  onProgress: [ProgressEvent][];
  [key: string]: unknown[][];
}

export function createMockCallbacks(
  overrides?: Partial<EngineCallbacks>,
): EngineCallbacks & { calls: CallRecord } {
  const calls: CallRecord = {} as CallRecord;
  const record = (name: string, ...args: unknown[]) => {
    if (!calls[name]) calls[name] = [];
    (calls[name] as unknown[][]).push(args);
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
export function seedFiles(
  io: ExecutionIO & { files: Map<string, string> },
  planPath: string = PLAN_PATH,
  planContent: string = UNIT_TEST_PLAN_MD,
): void {
  io.files.set(planPath, planContent);
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
export function onMainBranchHandler(): MockExecHandler {
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

// ── SubagentResult builder functions ───────────────────────────────

export function doneResult(taskNumber: number, output = "Implementation complete"): SubagentResult {
  return {
    taskNumber,
    status: "DONE",
    output,
    concerns: null,
    needs: null,
    blocker: null,
    filesChanged: [],
  };
}

export function blockedResult(taskNumber: number, blocker: string, output: string = "blocked"): SubagentResult {
  return {
    taskNumber,
    status: "BLOCKED",
    output,
    concerns: null,
    needs: null,
    blocker,
    filesChanged: [],
  };
}

export function doneWithConcernsResult(taskNumber: number, concerns: string, output: string = "done with concerns"): SubagentResult {
  return {
    taskNumber,
    status: "DONE_WITH_CONCERNS",
    output,
    concerns,
    needs: null,
    blocker: null,
    filesChanged: [],
  };
}

export function needsContextResult(taskNumber: number, needs: string, output: string = "needs context"): SubagentResult {
  return {
    taskNumber,
    status: "NEEDS_CONTEXT",
    output,
    concerns: null,
    needs,
    blocker: null,
    filesChanged: [],
  };
}
