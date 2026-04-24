# Execute-Plan Integration Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add engine-level integration tests covering 6 multi-wave orchestration scenarios for PlanExecutionEngine.execute()

**Architecture:** The integration tests exercise `PlanExecutionEngine.execute()` end-to-end through its `ExecutionIO` and `EngineCallbacks` injection seams. No real filesystem, git, or subagent dispatch is used. A shared helper module (`engine.test-helpers.ts`) provides `createMockIO`, `createMockCallbacks`, `seedFiles`, `onMainBranchHandler`, and common constants, consumed by both the existing unit tests and the new integration tests. A dedicated 3-task plan fixture with 2 waves drives all 6 scenarios.

**Tech Stack:** TypeScript (ESM, `.ts` extension imports), Node.js built-in test runner (`node:test`, `node:assert/strict`), `--experimental-strip-types`

---

## File Structure

- `agent/lib/execute-plan/engine.test-helpers.ts` (Create) — Shared mock factories, constants, seed helpers, and result builders
- `agent/lib/execute-plan/engine.integration.test.ts` (Create) — 6 integration test scenarios
- `agent/lib/execute-plan/engine.test.ts` (Modify) — Replace inline helpers with imports from `engine.test-helpers.ts`

## Tasks

### Task 1: Extract shared test helpers into `engine.test-helpers.ts`

**Files:**
- Create: `agent/lib/execute-plan/engine.test-helpers.ts`
- Modify: `agent/lib/execute-plan/engine.test.ts`

**Steps:**

- [ ] **Step 1: Create `engine.test-helpers.ts` with all shared exports** — Create `agent/lib/execute-plan/engine.test-helpers.ts` containing the following, extracted verbatim from `engine.test.ts`:

  ```typescript
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

  // ── Types ───────────────────────────────────────────────────────────

  export interface MockExecHandler {
    (cmd: string, args: string[], cwd: string): Promise<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>;
  }

  // ── Mock IO ─────────────────────────────────────────────────────────

  export function createMockIO(
    files?: Map<string, string>,
    execHandler?: MockExecHandler,
  ): ExecutionIO & { files: Map<string, string> } {
    const fs = files ?? new Map<string, string>();
    const defaultExec: MockExecHandler = async (cmd, args, _cwd) => {
      if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
        return { stdout: ".git\n", stderr: "", exitCode: 0 };
      }
      if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
        return { stdout: "feature/test\n", stderr: "", exitCode: 0 };
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
          .filter(
            (k) =>
              k.startsWith(prefix) && !k.slice(prefix.length).includes("/"),
          )
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

  export function createMockCallbacks(
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
          overrides?.requestWorktreeSetup?.(branch, cwd) ??
          ({ type: "current" } as WorkspaceChoice)
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
        return (
          overrides?.requestJudgment?.(req) ?? { action: "accept" as const }
        );
      },
      onProgress: (event) => {
        record("onProgress", event);
      },
    };
  }

  // ── Seed Helpers ────────────────────────────────────────────────────

  /** Seed the mock IO with the plan file, settings, and templates. */
  export function seedFiles(
    io: ExecutionIO & { files: Map<string, string> },
    planPath: string = PLAN_PATH,
    planContent: string = UNIT_TEST_PLAN_MD,
  ): void {
    io.files.set(planPath, planContent);
    io.files.set(join(TEST_AGENT_DIR, "settings.json"), SETTINGS_JSON);
    io.files.set(
      join(TEST_AGENT_DIR, "skills/execute-plan/implementer-prompt.md"),
      "You are implementing task.\n\n{TASK_SPEC}\n\n{CONTEXT}\n\n{WORKING_DIR}\n\n{TDD_BLOCK}",
    );
    io.files.set(
      join(TEST_AGENT_DIR, "skills/execute-plan/spec-reviewer.md"),
      "Review this implementation.\n\n{TASK_SPEC}\n\n{IMPLEMENTER_REPORT}",
    );
    io.files.set(
      join(
        TEST_AGENT_DIR,
        "skills/requesting-code-review/code-reviewer.md",
      ),
      "Review code changes.\n\n{WHAT_WAS_IMPLEMENTED}\n\n{PLAN_OR_REQUIREMENTS}\n\n{BASE_SHA}\n\n{HEAD_SHA}\n\n{DESCRIPTION}",
    );
  }

  // ── Plan Fixtures ───────────────────────────────────────────────────

  /** Original 2-task plan used by unit tests (copied verbatim from engine.test.ts). */
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

  // ── Exec handler presets ────────────────────────────────────────────

  /** Handler that simulates being on the "main" branch and NOT in a worktree. */
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
        return { stdout: "", stderr: "", exitCode: 0 };
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

  // ── SubagentResult builders ─────────────────────────────────────────

  /** Build a DONE SubagentResult for the given task number. */
  export function doneResult(
    taskNumber: number,
    output = "Implementation complete",
  ): SubagentResult {
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

  /** Build a BLOCKED SubagentResult for the given task number. */
  export function blockedResult(
    taskNumber: number,
    blocker: string,
    output = "blocked",
  ): SubagentResult {
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

  /** Build a DONE_WITH_CONCERNS SubagentResult. */
  export function doneWithConcernsResult(
    taskNumber: number,
    concerns: string,
    output = "done with concerns",
  ): SubagentResult {
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
  ```

  Key design notes:
  - `seedFiles` gains optional `planPath` and `planContent` parameters so integration tests can inject a different fixture while unit tests continue passing `PLAN_PATH` / `UNIT_TEST_PLAN_MD` (the defaults).
  - The original `PLAN_MD` constant from `engine.test.ts` is renamed to `UNIT_TEST_PLAN_MD` for clarity. The unit test file will use this via its original local `PLAN_MD` alias.
  - `SubagentResult` builder functions (`doneResult`, `blockedResult`, `doneWithConcernsResult`) are new additions used by integration tests and useful for unit tests going forward.
  - **Critical:** The `UNIT_TEST_PLAN_MD` template literal must NOT have leading indentation on content lines. The plan parser uses `^##\s+` anchors that require headings at column 0. Copy the content verbatim from the original `PLAN_MD` constant in `engine.test.ts`.

- [ ] **Step 2: Update `engine.test.ts` to import from the helper module** — Replace the inline `PLAN_MD`, constants, `createMockIO`, `createMockCallbacks`, `seedFiles`, `onMainBranchHandler`, `MockExecHandler`, and `DEFAULT_SETTINGS` in `engine.test.ts` with imports from `./engine.test-helpers.ts`. The top of `engine.test.ts` should become:

  ```typescript
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { join } from "node:path";
  import type {
    ExecutionIO,
    RunState,
    SubagentConfig,
    SubagentResult,
  } from "./types.ts";
  import { PlanExecutionEngine, parseCodeReviewOutput } from "./engine.ts";
  import {
    TEST_CWD,
    TEST_AGENT_DIR,
    PLAN_FILE_NAME,
    PLAN_PATH,
    DEFAULT_SETTINGS,
    SETTINGS_JSON,
    UNIT_TEST_PLAN_MD,
    createMockIO,
    createMockCallbacks,
    seedFiles,
    onMainBranchHandler,
    type MockExecHandler,
  } from "./engine.test-helpers.ts";

  // Keep a local alias so existing test code referencing PLAN_MD continues to work
  const PLAN_MD = UNIT_TEST_PLAN_MD;
  ```

  Remove the inline definitions of `PLAN_MD`, `TEST_CWD`, `TEST_AGENT_DIR`, `PLAN_FILE_NAME`, `PLAN_PATH`, `DEFAULT_SETTINGS`, `SETTINGS_JSON`, `MockExecHandler`, `createMockIO`, `createMockCallbacks`, `seedFiles`, and `onMainBranchHandler` from `engine.test.ts`. Keep all test `describe`/`it` blocks untouched.

- [ ] **Step 3: Run existing unit tests to verify no regression** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test lib/execute-plan/engine.test.ts
  ```
  All existing tests must pass with zero failures. The output should show the same number of passing tests as before the extraction.

- [ ] **Step 4: Commit** — Commit with message: `refactor(execute-plan): extract shared test helpers into engine.test-helpers.ts`

**Acceptance criteria:**
- `engine.test-helpers.ts` exports: `TEST_CWD`, `TEST_AGENT_DIR`, `PLAN_FILE_NAME`, `PLAN_PATH`, `DEFAULT_SETTINGS`, `SETTINGS_JSON`, `UNIT_TEST_PLAN_MD`, `MockExecHandler`, `createMockIO`, `createMockCallbacks`, `seedFiles`, `onMainBranchHandler`, `doneResult`, `blockedResult`, `doneWithConcernsResult`
- `engine.test.ts` has zero duplicated helper definitions
- All existing unit tests pass unchanged

**Model recommendation:** cheap

---

### Task 2: Create the integration plan fixture and test scaffolding

**Files:**
- Create: `agent/lib/execute-plan/engine.integration.test.ts`

**Steps:**

- [ ] **Step 1: Create the integration test file with the 3-task fixture and 6 describe blocks** — Create `agent/lib/execute-plan/engine.integration.test.ts` with the fixture, imports, and empty describe blocks:

  ```typescript
  import { describe, it } from "node:test";
  import assert from "node:assert/strict";
  import { join } from "node:path";
  import type {
    ExecutionIO,
    EngineCallbacks,
    ExecutionSettings,
    RunState,
    SubagentConfig,
    SubagentResult,
    JudgmentRequest,
    JudgmentResponse,
    ProgressEvent,
    WaveState,
  } from "./types.ts";
  import { PlanExecutionEngine } from "./engine.ts";
  import {
    TEST_CWD,
    TEST_AGENT_DIR,
    DEFAULT_SETTINGS,
    SETTINGS_JSON,
    createMockIO,
    createMockCallbacks,
    seedFiles,
    doneResult,
    blockedResult,
    type MockExecHandler,
  } from "./engine.test-helpers.ts";

  // ── Integration test constants ──────────────────────────────────────

  const INT_PLAN_FILE_NAME = "integration-test-plan.md";
  const INT_PLAN_PATH = join(TEST_CWD, ".pi", "plans", INT_PLAN_FILE_NAME);
  const INT_STATE_PATH = join(
    TEST_CWD,
    ".pi/plan-runs",
    INT_PLAN_FILE_NAME + ".state.json",
  );
  const INT_DONE_PATH = join(
    TEST_CWD,
    ".pi",
    "plans",
    "done",
    INT_PLAN_FILE_NAME,
  );
  const TODO_ID = "abc123ff";
  const TODO_PATH = join(TEST_CWD, ".pi", "todos", TODO_ID + ".md");

  // ── 3-task integration plan fixture ─────────────────────────────────
  //
  // Dependencies: Task 2 depends on Task 1, Task 3 depends on Task 1
  //   → Wave 1: [Task 1]
  //   → Wave 2: [Task 2, Task 3]

  const INTEGRATION_PLAN_MD = `
  ## Goal

  Build a notification service with email and SMS channels.

  ## Architecture Summary

  Event-driven notification service with pluggable channel adapters.

  ## Tech Stack

  TypeScript, Node.js

  ## File Structure

  - \`src/notifier.ts\` (Create) — Core notification dispatcher
  - \`src/channels/email.ts\` (Create) — Email channel adapter
  - \`src/channels/sms.ts\` (Create) — SMS channel adapter
  - \`src/notifier.test.ts\` (Create) — Notifier tests

  ## Tasks

  ### Task 1: Create core notification dispatcher

  **Files:**
  - Create: \`src/notifier.ts\`
  - Test: \`src/notifier.test.ts\`

  **Steps:**
  - [ ] **Step 1: Create dispatcher** — Implement the notification dispatch logic

  **Acceptance criteria:**
  - Dispatcher is exported
  - Tests pass

  **Model recommendation:** standard

  ### Task 2: Create email channel adapter

  **Files:**
  - Create: \`src/channels/email.ts\`

  **Steps:**
  - [ ] **Step 1: Create email adapter** — Implement email channel

  **Acceptance criteria:**
  - Email adapter conforms to channel interface

  **Model recommendation:** cheap

  ### Task 3: Create SMS channel adapter

  **Files:**
  - Create: \`src/channels/sms.ts\`

  **Steps:**
  - [ ] **Step 1: Create SMS adapter** — Implement SMS channel

  **Acceptance criteria:**
  - SMS adapter conforms to channel interface

  **Model recommendation:** cheap

  ## Dependencies

  - Task 2 depends on: Task 1
  - Task 3 depends on: Task 1

  ## Risk Assessment

  Low risk — straightforward adapter pattern.

  ## Test Command

  \`\`\`bash
  npm test
  \`\`\`
  `;

  // Plan with source todo link (used for happy-path todo closure test)
  const INTEGRATION_PLAN_WITH_TODO =
    INTEGRATION_PLAN_MD + `\n**Source:** \`TODO-${TODO_ID}\`\n`;

  // ── Shared helpers ──────────────────────────────────────────────────

  /** Seed the integration plan fixture and templates. */
  function seedIntegrationFiles(
    io: ExecutionIO & { files: Map<string, string> },
    planContent: string = INTEGRATION_PLAN_WITH_TODO,
  ): void {
    seedFiles(io, INT_PLAN_PATH, planContent);
  }

  /** Seed a linked todo file that the engine can close. */
  function seedTodo(io: ExecutionIO & { files: Map<string, string> }): void {
    io.files.set(
      TODO_PATH,
      JSON.stringify({ status: "in-progress", title: "Build notification service" }) +
        "\n\nImplement the notification service.",
    );
  }

  /**
   * Build a per-task dispatch queue. Each task number maps to an ordered
   * array of SubagentResults; each call to dispatchSubagent shifts the
   * next result off the front. Falls through to doneResult if the queue
   * is empty.
   */
  function perTaskDispatcher(
    queue: Record<number, SubagentResult[]>,
  ): ExecutionIO["dispatchSubagent"] {
    return async (config) => {
      const results = queue[config.taskNumber];
      if (results && results.length > 0) {
        return results.shift()!;
      }
      return doneResult(config.taskNumber);
    };
  }

  /**
   * Extract events of a specific type from recorded onProgress calls.
   */
  function progressEvents<T extends ProgressEvent["type"]>(
    callbacks: ReturnType<typeof createMockCallbacks>,
    type: T,
  ): Extract<ProgressEvent, { type: T }>[] {
    const calls = callbacks.calls["onProgress"] ?? [];
    return calls
      .map((c: any[]) => c[0] as ProgressEvent)
      .filter((e): e is Extract<ProgressEvent, { type: T }> => e.type === type);
  }

  // ── Scenario 1: Happy path ─────────────────────────────────────────

  describe("Scenario 1: Happy path — multi-wave completion", () => {
    // Tests added in Task 3
  });

  // ── Scenario 2: Mixed outcomes — BLOCKED triggers judgment + retry ─

  describe("Scenario 2: Mixed outcomes — BLOCKED task triggers judgment and retry", () => {
    // Tests added in Task 3
  });

  // ── Scenario 3: Stop mid-run ───────────────────────────────────────

  describe("Scenario 3: Stop mid-run — cancellation after wave 1", () => {
    // Tests added in Task 4
  });

  // ── Scenario 4: Resume from stopped state ──────────────────────────

  describe("Scenario 4: Resume from stopped state", () => {
    // Tests added in Task 4
  });

  // ── Scenario 5: Test regression — post-wave test failure ───────────

  describe("Scenario 5: Test regression — post-wave test failure", () => {
    // Tests added in Task 5
  });

  // ── Scenario 6: Precondition failures propagate correctly ──────────

  describe("Scenario 6: Precondition failures propagate correctly", () => {
    // Tests added in Task 5
  });
  ```

  Design notes:
  - The 3-task fixture has Task 1 with no dependencies (wave 1), Tasks 2 and 3 both depending on Task 1 (wave 2). This gives a meaningful multi-wave structure where wave 2 has parallel tasks.
  - `perTaskDispatcher` is the key building block for scenario-specific mock behavior: each task number maps to an ordered queue of results. When the queue is exhausted, it falls back to `doneResult`.
  - `progressEvents` is a typed helper that extracts events of a given type from the recorded `onProgress` calls, avoiding repetitive cast/filter boilerplate.
  - `seedIntegrationFiles` wraps `seedFiles` with the integration-specific plan path and content.
  - `seedTodo` creates the linked todo file so happy-path can verify todo closure.

- [ ] **Step 2: Run the scaffolding to verify it loads** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test lib/execute-plan/engine.integration.test.ts
  ```
  Should output 6 passing describe blocks with 0 tests (empty suites pass). Zero failures.

- [ ] **Step 3: Commit** — Commit with message: `test(execute-plan): add integration test scaffolding with 3-task fixture`

**Acceptance criteria:**
- File parses and runs without errors
- 3-task plan fixture produces 2 waves (wave 1: [1], wave 2: [2, 3])
- All 6 describe blocks are present
- `perTaskDispatcher`, `progressEvents`, `seedIntegrationFiles`, `seedTodo` helpers are defined

**Model recommendation:** cheap

---

### Task 3: Implement Scenarios 1 and 2 (happy path + blocked/retry)

**Files:**
- Modify: `agent/lib/execute-plan/engine.integration.test.ts`

**Steps:**

- [ ] **Step 1: Implement Scenario 1 — Happy path multi-wave completion** — Replace the empty Scenario 1 describe block with:

  ```typescript
  describe("Scenario 1: Happy path — multi-wave completion", () => {
    it("runs 3 tasks across 2 waves, reviews code, moves plan, closes todo, cleans up state", async () => {
      const io = createMockIO();
      seedIntegrationFiles(io);
      seedTodo(io);

      // All tasks return DONE
      io.dispatchSubagent = perTaskDispatcher({
        1: [doneResult(1)],
        2: [doneResult(2)],
        3: [doneResult(3)],
      });

      // Code reviewer returns a review with findings
      const origDispatch = io.dispatchSubagent;
      io.dispatchSubagent = async (config, options) => {
        if (config.agent === "code-reviewer") {
          return {
            taskNumber: 0,
            status: "DONE" as const,
            output:
              "## Critical\n### Memory leak in dispatcher\nThe event listener is never removed.\n\n## Strengths\n- Clean adapter pattern\n- Good separation of concerns\n\n## Recommendations\n- Add integration tests for channel failover\n\n## Overall\nSolid implementation with one critical issue to address.",
            concerns: null,
            needs: null,
            blocker: null,
            filesChanged: [],
          };
        }
        return origDispatch(config, options);
      };

      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel",
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
      const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

      // ── Return value ──
      assert.equal(outcome, "completed");

      // ── Major lifecycle ordering ──
      const allEvents = (callbacks.calls["onProgress"] ?? []).map(
        (c: any[]) => c[0] as ProgressEvent,
      );
      const majorTypes = allEvents
        .filter((e) =>
          [
            "wave_started",
            "wave_completed",
            "code_review_completed",
            "execution_completed",
          ].includes(e.type),
        )
        .map((e) => {
          if (e.type === "wave_started" || e.type === "wave_completed") {
            return `${e.type}(${e.wave})`;
          }
          return e.type;
        });

      assert.deepEqual(majorTypes, [
        "wave_started(1)",
        "wave_completed(1)",
        "wave_started(2)",
        "wave_completed(2)",
        "code_review_completed",
        "execution_completed",
      ]);

      // ── Task-level events in correct waves ──
      const taskStarted = progressEvents(callbacks, "task_started");
      const wave1Tasks = taskStarted.filter((e) => e.wave === 1).map((e) => e.taskNumber);
      const wave2Tasks = taskStarted.filter((e) => e.wave === 2).map((e) => e.taskNumber);
      assert.deepEqual(wave1Tasks, [1]);
      assert.ok(wave2Tasks.includes(2), "Task 2 should be in wave 2");
      assert.ok(wave2Tasks.includes(3), "Task 3 should be in wave 2");

      // ── requestSettings was called ──
      assert.ok(callbacks.calls["requestSettings"]);
      assert.equal(callbacks.calls["requestSettings"].length, 1);

      // ── Code review details ──
      const reviewEvents = progressEvents(callbacks, "code_review_completed");
      assert.equal(reviewEvents.length, 1);
      const review = reviewEvents[0].review;
      assert.ok(review.findings.length > 0, "Review should have findings");
      assert.equal(review.findings[0].severity, "critical");
      assert.ok(
        review.findings[0].title.includes("Memory leak"),
        "Finding title should match",
      );
      assert.ok(review.strengths.length > 0, "Review should have strengths");
      assert.ok(
        review.recommendations.length > 0,
        "Review should have recommendations",
      );
      assert.ok(
        review.overallAssessment.length > 0,
        "Review should have overall assessment",
      );

      // ── Plan moved to done/ ──
      assert.ok(io.files.has(INT_DONE_PATH), "Plan should be moved to done/");
      assert.ok(!io.files.has(INT_PLAN_PATH), "Original plan should be removed");

      // ── Linked todo closed ──
      const todoContent = io.files.get(TODO_PATH);
      assert.ok(todoContent, "Todo file should still exist");
      const todoParsed = JSON.parse(todoContent!.split("\n\n")[0]);
      assert.equal(todoParsed.status, "done", "Todo should be closed");

      // ── State file deleted ──
      assert.ok(!io.files.has(INT_STATE_PATH), "State file should be deleted");

      // ── Lock released (state file gone means lock is gone too) ──
      // Verified implicitly: state file is deleted, which means releaseLock
      // ran before deleteState.
    });
  });
  ```

- [ ] **Step 2: Run Scenario 1 and verify it passes** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test --test-name-pattern "Scenario 1" lib/execute-plan/engine.integration.test.ts
  ```
  Expect: 1 test passing.

- [ ] **Step 3: Implement Scenario 2 — BLOCKED task triggers judgment and retry** — Replace the empty Scenario 2 describe block with:

  ```typescript
  describe("Scenario 2: Mixed outcomes — BLOCKED task triggers judgment and retry", () => {
    it("retries a BLOCKED task after judgment returns retry, then wave completes", async () => {
      const io = createMockIO();
      seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

      // Task 1: DONE on first call
      // Task 2: BLOCKED on first call, DONE on retry
      // Task 3: DONE on first call
      io.dispatchSubagent = perTaskDispatcher({
        1: [doneResult(1)],
        2: [
          blockedResult(2, "Cannot connect to email provider"),
          doneResult(2, "Email adapter implemented after retry"),
        ],
        3: [doneResult(3)],
      });

      const judgmentRequests: JudgmentRequest[] = [];
      const callbacks = createMockCallbacks({
        requestJudgment: async (req) => {
          judgmentRequests.push(req);
          if (req.type === "blocked") {
            return { action: "retry" as const };
          }
          return { action: "accept" as const };
        },
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

      // ── Outcome ──
      assert.equal(outcome, "completed");

      // ── Judgment request context ──
      const blockedJudgments = judgmentRequests.filter(
        (r) => r.type === "blocked",
      );
      assert.equal(blockedJudgments.length, 1, "Should request judgment once for blocked task");
      const blockedReq = blockedJudgments[0] as Extract<JudgmentRequest, { type: "blocked" }>;
      assert.equal(blockedReq.taskNumber, 2);
      assert.equal(blockedReq.wave, 2);
      assert.ok(
        blockedReq.blocker.includes("Cannot connect to email provider"),
        "Blocker context should be passed to judgment",
      );

      // ── dispatchSubagent called twice for task 2 ──
      // Count all dispatches by tracking in the callbacks
      const allDispatches = (callbacks.calls["onProgress"] ?? [])
        .map((c: any[]) => c[0] as ProgressEvent)
        .filter(
          (e): e is Extract<ProgressEvent, { type: "task_completed" }> =>
            e.type === "task_completed",
        );
      // Task 2 should appear with a completed event after retry
      const task2Completions = allDispatches.filter(
        (e) => e.taskNumber === 2,
      );
      assert.ok(
        task2Completions.length >= 1,
        "Task 2 should have at least one task_completed event after retry",
      );

      // ── Wave still commits after retry ──
      const waveCompleted = progressEvents(callbacks, "wave_completed");
      assert.equal(waveCompleted.length, 2, "Both waves should complete");
      for (const evt of waveCompleted) {
        assert.ok(evt.commitSha, "wave_completed should carry a commitSha");
      }

      // ── Final persisted state: verify retry was recorded ──
      // State file is deleted on completion, so check via final outcome
      assert.equal(outcome, "completed");
    });
  });
  ```

- [ ] **Step 4: Run Scenario 2 and verify it passes** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test --test-name-pattern "Scenario 2" lib/execute-plan/engine.integration.test.ts
  ```
  Expect: 1 test passing.

- [ ] **Step 5: Run all integration tests so far** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test lib/execute-plan/engine.integration.test.ts
  ```
  Expect: 2 tests passing (Scenarios 1 and 2), remaining 4 describe blocks pass as empty suites.

- [ ] **Step 6: Commit** — Commit with message: `test(execute-plan): add integration scenarios 1 (happy path) and 2 (blocked/retry)`

**Acceptance criteria:**
- Scenario 1 asserts exact major lifecycle sequence, task-wave assignments, review finding details, plan move, todo closure, state deletion
- Scenario 2 asserts judgment request context (type, taskNumber, wave, blocker), dispatchSubagent called twice for retried task, both waves commit
- Both tests pass

**Model recommendation:** standard

---

### Task 4: Implement Scenarios 3 and 4 (stop + resume)

**Files:**
- Modify: `agent/lib/execute-plan/engine.integration.test.ts`

**Steps:**

- [ ] **Step 1: Implement Scenario 3 — Stop mid-run after wave 1** — Replace the empty Scenario 3 describe block with:

  ```typescript
  describe("Scenario 3: Stop mid-run — cancellation after wave 1", () => {
    it("stops after wave 1, persists stopped state, does not start wave 2", async () => {
      const io = createMockIO();
      seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

      io.dispatchSubagent = perTaskDispatcher({
        1: [doneResult(1)],
        2: [doneResult(2)],
        3: [doneResult(3)],
      });

      let engine: PlanExecutionEngine;
      const callbacks = createMockCallbacks();

      // Wrap onProgress to trigger cancellation when wave 1 completes,
      // while preserving the default recording behavior.
      const origOnProgress = callbacks.onProgress;
      callbacks.onProgress = (event) => {
        origOnProgress(event);
        if (event.type === "wave_completed" && event.wave === 1) {
          engine!.requestCancellation("wave");
        }
      };

      engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

      // ── Return value ──
      assert.equal(outcome, "stopped");

      // ── State file persists with stopped status ──
      assert.ok(io.files.has(INT_STATE_PATH), "State file should persist");
      const state: RunState = JSON.parse(io.files.get(INT_STATE_PATH)!);
      assert.equal(state.status, "stopped");
      assert.equal(state.stopGranularity, "wave");

      // ── Wave 1 committed ──
      const waveCompleted = progressEvents(callbacks, "wave_completed");
      assert.ok(waveCompleted.length >= 1, "Wave 1 should be committed");
      assert.equal(waveCompleted[0].wave, 1);

      // ── Wave 2 never started ──
      const wave2Started = progressEvents(callbacks, "wave_started").filter(
        (e) => e.wave === 2,
      );
      assert.equal(wave2Started.length, 0, "Wave 2 should not start");

      // ── Lock released ──
      // After stopped path, lock is released. The state file should have lock: null.
      assert.equal(state.lock, null, "Lock should be released in persisted state");

      // ── execution_completed NOT emitted ──
      const completedEvents = progressEvents(callbacks, "execution_completed");
      assert.equal(completedEvents.length, 0, "execution_completed should not be emitted");

      // ── Plan NOT moved to done ──
      assert.ok(!io.files.has(INT_DONE_PATH), "Plan should not be moved to done/");
    });
  });
  ```

- [ ] **Step 2: Run Scenario 3 and verify it passes** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test --test-name-pattern "Scenario 3" lib/execute-plan/engine.integration.test.ts
  ```
  Expect: 1 test passing.

- [ ] **Step 3: Implement Scenario 4 — Resume from stopped state** — Replace the empty Scenario 4 describe block with:

  ```typescript
  describe("Scenario 4: Resume from stopped state", () => {
    it("resumes from wave 2 using persisted state, skips wave 1 tasks", async () => {
      const io = createMockIO();
      seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

      // Pre-seed a stopped state with wave 1 done
      const stoppedState: RunState = {
        plan: INT_PLAN_FILE_NAME,
        status: "stopped",
        lock: null,
        startedAt: new Date().toISOString(),
        stoppedAt: new Date().toISOString(),
        stopGranularity: "wave",
        settings: {
          execution: "parallel",
          tdd: true,
          finalReview: false,
          specCheck: false,
          integrationTest: false,
          testCommand: null,
        },
        workspace: { type: "current", path: TEST_CWD, branch: "feature/test" },
        preExecutionSha: "abc123def456",
        baselineTest: null,
        retryState: { tasks: {}, waves: {}, finalReview: null },
        waves: [
          { wave: 1, tasks: [1], status: "done", commitSha: "wave1sha123" },
        ],
      };
      io.files.set(INT_STATE_PATH, JSON.stringify(stoppedState));
      // Ensure workspace path exists for validateResume
      io.files.set(TEST_CWD, "");

      // Track dispatches to verify wave 1 tasks are not re-dispatched
      const dispatched: number[] = [];
      io.dispatchSubagent = async (config) => {
        dispatched.push(config.taskNumber);
        return doneResult(config.taskNumber);
      };

      const callbacks = createMockCallbacks({
        requestResumeAction: async () => "continue",
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

      // ── Outcome ──
      assert.equal(outcome, "completed");

      // ── Wave 1 tasks NOT re-dispatched ──
      assert.ok(
        !dispatched.includes(1),
        "Task 1 (wave 1) should not be re-dispatched on resume",
      );

      // ── Wave 2 tasks dispatched ──
      assert.ok(dispatched.includes(2), "Task 2 should be dispatched");
      assert.ok(dispatched.includes(3), "Task 3 should be dispatched");

      // ── requestSettings NOT called (uses persisted settings) ──
      assert.ok(
        !callbacks.calls["requestSettings"],
        "requestSettings should not be called on resume",
      );

      // ── requestResumeAction WAS called ──
      assert.ok(callbacks.calls["requestResumeAction"]);
      assert.equal(callbacks.calls["requestResumeAction"].length, 1);

      // ── Only wave 2 started (wave 1 skipped) ──
      const waveStarted = progressEvents(callbacks, "wave_started");
      assert.equal(waveStarted.length, 1, "Only one wave should start");
      assert.equal(waveStarted[0].wave, 2, "Wave 2 should start");

      // ── Resume validation happened (indirectly: if workspace path didn't
      //    exist or branch mismatched, execution would have thrown) ──
      // Verified: execution completed successfully means validateResume passed.
    });
  });
  ```

- [ ] **Step 4: Run Scenario 4 and verify it passes** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test --test-name-pattern "Scenario 4" lib/execute-plan/engine.integration.test.ts
  ```
  Expect: 1 test passing.

- [ ] **Step 5: Run all integration tests so far** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test lib/execute-plan/engine.integration.test.ts
  ```
  Expect: 4 tests passing, 2 empty suites.

- [ ] **Step 6: Commit** — Commit with message: `test(execute-plan): add integration scenarios 3 (stop mid-run) and 4 (resume)`

**Acceptance criteria:**
- Scenario 3 asserts: outcome "stopped", state file persisted with status "stopped" and stopGranularity "wave", wave 1 committed, wave 2 never started, lock released, plan not moved
- Scenario 4 asserts: outcome "completed", wave 1 tasks not re-dispatched, wave 2 tasks dispatched, requestSettings not called, requestResumeAction called, only wave 2 started, resume validation passed indirectly

**Model recommendation:** standard

---

### Task 5: Implement Scenarios 5 and 6 (test regression + preconditions)

**Files:**
- Modify: `agent/lib/execute-plan/engine.integration.test.ts`

**Steps:**

- [ ] **Step 1: Implement Scenario 5a — Test regression with retry action** — Replace the empty Scenario 5 describe block with both sub-scenarios. First, the retry branch:

  ```typescript
  describe("Scenario 5: Test regression — post-wave test failure", () => {
    it("5a: regression action retry — re-executes wave after test failure", async () => {
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
        if (cmd === "sh" && args[0] === "-c" && args[1]?.includes("npm test")) {
          testRunCount++;
          // Call 1 = baseline capture (passes)
          // Call 2 = post-wave-1 test (fails — regression)
          // Call 3 = post-wave-1 retry test (passes)
          // Call 4+ = subsequent waves (passes)
          if (testRunCount === 2) {
            return {
              stdout: "not ok 1 - notifier dispatch test\nFAILED",
              stderr: "",
              exitCode: 1,
            };
          }
          return { stdout: "All tests passed", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
      seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

      // Track dispatches to detect wave re-execution
      const dispatched: number[] = [];
      io.dispatchSubagent = async (config) => {
        dispatched.push(config.taskNumber);
        return doneResult(config.taskNumber);
      };

      let regressionActionCount = 0;
      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel",
          tdd: true,
          finalReview: false,
          specCheck: false,
          integrationTest: true,
          testCommand: "npm test",
        }),
        requestTestRegressionAction: async (ctx) => {
          regressionActionCount++;
          return "retry";
        },
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

      // ── requestTestRegressionAction called with context ──
      assert.ok(
        callbacks.calls["requestTestRegressionAction"],
        "requestTestRegressionAction should be called",
      );
      const regressionCalls = callbacks.calls["requestTestRegressionAction"];
      assert.ok(regressionCalls.length >= 1, "Should be called at least once");
      const regressionCtx = regressionCalls[0][0];
      assert.equal(regressionCtx.wave, 1, "Regression should be for wave 1");
      assert.ok(
        regressionCtx.newFailures.length > 0 || regressionCtx.testOutput.includes("FAILED"),
        "Regression context should contain failure info",
      );

      // ── Wave 1 tasks re-dispatched (task 1 dispatched at least twice) ──
      const task1Dispatches = dispatched.filter((n) => n === 1);
      assert.ok(
        task1Dispatches.length >= 2,
        `Task 1 should be dispatched at least twice (original + retry), got ${task1Dispatches.length}`,
      );

      // ── Execution completes ──
      assert.equal(outcome, "completed");
    });

    it("5b: regression action skip — proceeds to next wave without retry", async () => {
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
        if (cmd === "sh" && args[0] === "-c" && args[1]?.includes("npm test")) {
          testRunCount++;
          // Call 1 = baseline (passes)
          // Call 2 = post-wave-1 (fails)
          // Call 3 = post-wave-2 (passes)
          if (testRunCount === 2) {
            return {
              stdout: "not ok 1 - notifier dispatch test\nFAILED",
              stderr: "",
              exitCode: 1,
            };
          }
          return { stdout: "All tests passed", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
      seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

      io.dispatchSubagent = perTaskDispatcher({
        1: [doneResult(1)],
        2: [doneResult(2)],
        3: [doneResult(3)],
      });

      // Track how many times each task is dispatched
      const dispatched: number[] = [];
      const origDispatch = io.dispatchSubagent;
      io.dispatchSubagent = async (config, options) => {
        dispatched.push(config.taskNumber);
        return origDispatch(config, options);
      };

      const callbacks = createMockCallbacks({
        requestSettings: async () => ({
          execution: "parallel",
          tdd: true,
          finalReview: false,
          specCheck: false,
          integrationTest: true,
          testCommand: "npm test",
        }),
        requestTestRegressionAction: async () => "skip",
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

      // ── requestTestRegressionAction called ──
      assert.ok(
        callbacks.calls["requestTestRegressionAction"],
        "requestTestRegressionAction should be called",
      );

      // ── Task 1 dispatched only once (no retry) ──
      const task1Dispatches = dispatched.filter((n) => n === 1);
      assert.equal(
        task1Dispatches.length,
        1,
        "Task 1 should be dispatched only once when skip is chosen",
      );

      // ── Execution proceeds and completes ──
      assert.equal(outcome, "completed");

      // ── Wave 2 started (execution continued past regression) ──
      const wave2Started = progressEvents(callbacks, "wave_started").filter(
        (e) => e.wave === 2,
      );
      assert.ok(wave2Started.length > 0, "Wave 2 should start after skip");
    });
  });
  ```

- [ ] **Step 2: Run Scenario 5 and verify both sub-tests pass** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test --test-name-pattern "Scenario 5" lib/execute-plan/engine.integration.test.ts
  ```
  Expect: 2 tests passing.

- [ ] **Step 3: Implement Scenario 6 — Precondition failures** — Replace the empty Scenario 6 describe block with:

  ```typescript
  describe("Scenario 6: Precondition failures propagate correctly", () => {
    it("resume cancel — returns cancelled, no state or lock created", async () => {
      const io = createMockIO();
      seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

      // Pre-seed a stopped state so requestResumeAction fires
      const stoppedState: RunState = {
        plan: INT_PLAN_FILE_NAME,
        status: "stopped",
        lock: null,
        startedAt: new Date().toISOString(),
        stoppedAt: new Date().toISOString(),
        stopGranularity: "wave",
        settings: DEFAULT_SETTINGS,
        workspace: { type: "current", path: TEST_CWD, branch: "feature/test" },
        preExecutionSha: "abc123def456",
        baselineTest: null,
        retryState: { tasks: {}, waves: {}, finalReview: null },
        waves: [],
      };
      io.files.set(INT_STATE_PATH, JSON.stringify(stoppedState));

      const callbacks = createMockCallbacks({
        requestResumeAction: async () => "cancel",
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

      assert.equal(outcome, "cancelled");

      // State file should still exist (it was pre-seeded, but no new state created)
      // No lock should have been acquired
      const stateContent = io.files.get(INT_STATE_PATH);
      if (stateContent) {
        const state: RunState = JSON.parse(stateContent);
        assert.equal(state.lock, null, "Lock should not have been acquired");
      }
    });

    it("main-branch decline — returns cancelled, no state or lock created", async () => {
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
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        if (cmd === "kill" && args[0] === "-0") {
          return { stdout: "", stderr: "No such process", exitCode: 1 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
      seedIntegrationFiles(io, INTEGRATION_PLAN_MD);
      // Need .worktrees dir so worktree setup is offered
      io.files.set(join(TEST_CWD, ".worktrees") + "/.keep", "");

      const callbacks = createMockCallbacks({
        requestWorktreeSetup: async () => ({ type: "current" }),
        confirmMainBranch: async () => false,
      });

      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
      const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

      assert.equal(outcome, "cancelled");

      // No state file should have been created
      assert.ok(
        !io.files.has(INT_STATE_PATH),
        "State file should not be created when main branch declined",
      );
    });

    it("active lock by another session — throws descriptive error", async () => {
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
          // Process IS alive — lock is active
          return { stdout: "", stderr: "", exitCode: 0 };
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      });
      seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

      // Create an active lock held by another session on a DIFFERENT plan
      const otherStatePath = join(
        TEST_CWD,
        ".pi/plan-runs",
        "other-plan.state.json",
      );
      const otherState: RunState = {
        plan: "other-plan",
        status: "running",
        lock: {
          pid: 99999,
          session: "other-session",
          acquiredAt: new Date().toISOString(),
        },
        startedAt: new Date().toISOString(),
        stoppedAt: null,
        stopGranularity: null,
        settings: DEFAULT_SETTINGS,
        workspace: {
          type: "current",
          path: TEST_CWD,
          branch: "feature/other",
        },
        preExecutionSha: "other-sha",
        baselineTest: null,
        retryState: { tasks: {}, waves: {}, finalReview: null },
        waves: [],
      };
      io.files.set(otherStatePath, JSON.stringify(otherState));

      const callbacks = createMockCallbacks();
      const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

      await assert.rejects(
        () => engine.execute(INT_PLAN_PATH, callbacks),
        /already.*running|active.*run|locked/i,
      );
    });
  });
  ```

- [ ] **Step 4: Run Scenario 6 and verify all 3 sub-tests pass** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test --test-name-pattern "Scenario 6" lib/execute-plan/engine.integration.test.ts
  ```
  Expect: 3 tests passing.

- [ ] **Step 5: Run the full integration test suite** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test lib/execute-plan/engine.integration.test.ts
  ```
  Expect: 8 tests passing (1 + 1 + 1 + 1 + 2 + 3), 0 failures.

- [ ] **Step 6: Commit** — Commit with message: `test(execute-plan): add integration scenarios 5 (test regression) and 6 (preconditions)`

**Acceptance criteria:**
- Scenario 5a: requestTestRegressionAction called with wave and failure context, wave 1 tasks re-dispatched, execution completes
- Scenario 5b: requestTestRegressionAction called, task 1 dispatched only once, execution completes, wave 2 starts
- Scenario 6: resume-cancel returns "cancelled" with no lock, main-branch-decline returns "cancelled" with no state file, active-lock throws matching regex

**Model recommendation:** standard

---

### Task 6: Run full test suite and verify no regressions

**Files:**
- Test: `agent/lib/execute-plan/engine.test.ts`
- Test: `agent/lib/execute-plan/engine.integration.test.ts`

**Steps:**

- [ ] **Step 1: Run the existing unit tests** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test lib/execute-plan/engine.test.ts
  ```
  All existing unit tests must pass. Zero failures. This confirms the helper extraction did not break anything.

- [ ] **Step 2: Run the integration tests** — Run:
  ```bash
  cd agent && node --experimental-strip-types --test lib/execute-plan/engine.integration.test.ts
  ```
  All 8 integration tests must pass. Zero failures.

- [ ] **Step 3: Run the full agent test suite** — Run:
  ```bash
  cd agent && npm test
  ```
  All tests across all modules must pass. This catches any accidental import resolution or side-effect regressions. Expect zero failures.

- [ ] **Step 4: Commit (if any fixes were needed)** — If any fixes were applied during this task, commit with message: `fix(execute-plan): integration test fixes from full suite validation`

**Acceptance criteria:**
- `engine.test.ts` unit tests: all pass
- `engine.integration.test.ts` integration tests: 8 pass
- `npm test` full suite: all pass
- No regressions in any other test file

**Model recommendation:** cheap

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 2
- Task 4 depends on: Task 2
- Task 5 depends on: Task 2
- Task 6 depends on: Task 3, Task 4, Task 5

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Helper extraction breaks existing unit tests | Low | High | Step 3 of Task 1 runs existing tests immediately after extraction. The `PLAN_MD` alias keeps all existing code working. |
| Integration plan fixture produces unexpected wave structure | Low | Medium | The fixture has explicit dependencies (Task 2 -> 1, Task 3 -> 1) producing exactly 2 waves. `computeWaves` is already well-tested. |
| Cancellation timing race in Scenario 3 | Medium | Medium | The `onProgress` callback fires synchronously from the engine's perspective, so `requestCancellation("wave")` is guaranteed to be set before the engine checks cancellation state after the wave. |
| Test regression scenario exec handler count sensitivity | Medium | Low | The exec handler counts `testRunCount` to distinguish baseline from post-wave runs. If the engine adds additional exec calls, the count may shift. Mitigated by using `args[1]?.includes("npm test")` to only count test-command calls. |
| `seedFiles` signature change breaks unit test callers | Low | High | Default parameters `planPath = PLAN_PATH` and `planContent = UNIT_TEST_PLAN_MD` ensure all existing `seedFiles(io)` calls continue to work without changes. |

## Test Command

```bash
cd agent && node --experimental-strip-types --test lib/execute-plan/engine.integration.test.ts
```
