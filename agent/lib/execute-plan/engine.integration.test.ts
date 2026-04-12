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
  doneWithConcernsResult,
  needsContextResult,
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

// ── Shared helpers ───────────────────────────────────────────────────

/** Seed the integration plan fixture and templates. */
function seedIntegrationFiles(
  io: ExecutionIO & { files: Map<string, string> },
  planContent: string = INTEGRATION_PLAN_WITH_TODO,
): void {
  seedFiles(io, INT_PLAN_PATH, planContent);
}

/**
 * Seed a linked todo file that the engine can close.
 *
 * Format must match the canonical todo file layout parsed by
 * `closeTodo` in plan-lifecycle.ts (via `splitFrontMatter`):
 *
 *   <JSON front-matter object>\n\n<markdown body>
 *
 * `closeTodo` reads the front-matter JSON, sets `status` to "done",
 * and preserves the body. If this format changes, update this fixture
 * to match (see also: agent/extensions/todos.ts parseFrontMatter).
 */
function seedTodo(io: ExecutionIO & { files: Map<string, string> }): void {
  const frontMatter = JSON.stringify({ status: "in-progress", title: "Build notification service" });
  const body = "Implement the notification service.";
  io.files.set(TODO_PATH, `${frontMatter}\n\n${body}`);
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
  it("completes all waves, runs final code review, closes todo, and deletes state", async () => {
    const io = createMockIO();
    seedIntegrationFiles(io);
    seedTodo(io);

    // All 3 tasks return DONE via perTaskDispatcher; code-reviewer returns review output
    const REVIEW_OUTPUT = `
## Critical

### Missing error handling
The dispatcher does not handle null inputs.

## Strengths

- Clean adapter pattern
- Well-structured module layout

## Recommendations

- Add input validation
- Consider adding retry logic

## Overall

Solid implementation with minor gaps in error handling.
`.trim();

    // Single dispatch handler: code-reviewer returns review output,
    // all other tasks go through perTaskDispatcher.
    const taskDispatch = perTaskDispatcher({
      1: [doneResult(1)],
      2: [doneResult(2)],
      3: [doneResult(3)],
    });
    io.dispatchSubagent = async (config, options) => {
      if (config.agent === "code-reviewer") {
        return {
          taskNumber: 0,
          status: "DONE" as const,
          output: REVIEW_OUTPUT,
          concerns: null,
          needs: null,
          blocker: null,
          filesChanged: [],
        };
      }
      return taskDispatch(config, options);
    };

    const callbacks = createMockCallbacks({
      requestSettings: async (plan, detected) => ({
        execution: "parallel" as const,
        tdd: false,
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

    // Outcome
    assert.equal(outcome, "completed");

    // requestSettings called exactly once
    assert.equal((callbacks.calls["requestSettings"] ?? []).length, 1);

    // Major lifecycle event ordering
    const waveStarted = progressEvents(callbacks, "wave_started");
    const waveCompleted = progressEvents(callbacks, "wave_completed");
    const reviewCompleted = progressEvents(callbacks, "code_review_completed");
    const execCompleted = progressEvents(callbacks, "execution_completed");

    assert.equal(waveStarted.length, 2);
    assert.equal(waveCompleted.length, 2);
    assert.equal(reviewCompleted.length, 1);
    assert.equal(execCompleted.length, 1);

    // Verify wave numbers
    assert.equal(waveStarted[0].wave, 1);
    assert.equal(waveStarted[1].wave, 2);
    assert.equal(waveCompleted[0].wave, 1);
    assert.equal(waveCompleted[1].wave, 2);

    // Verify ordering: wave_started(1) before wave_completed(1) before wave_started(2) etc.
    const allProgress = (callbacks.calls["onProgress"] ?? []).map((c: any[]) => c[0] as ProgressEvent);
    const majorTypes = ["wave_started", "wave_completed", "code_review_completed", "execution_completed"];
    const majorEvents = allProgress.filter((e) => majorTypes.includes(e.type));

    assert.equal(majorEvents[0].type, "wave_started");
    assert.equal((majorEvents[0] as Extract<ProgressEvent, { type: "wave_started" }>).wave, 1);
    assert.equal(majorEvents[1].type, "wave_completed");
    assert.equal((majorEvents[1] as Extract<ProgressEvent, { type: "wave_completed" }>).wave, 1);
    assert.equal(majorEvents[2].type, "wave_started");
    assert.equal((majorEvents[2] as Extract<ProgressEvent, { type: "wave_started" }>).wave, 2);
    assert.equal(majorEvents[3].type, "wave_completed");
    assert.equal((majorEvents[3] as Extract<ProgressEvent, { type: "wave_completed" }>).wave, 2);
    assert.equal(majorEvents[4].type, "code_review_completed");
    assert.equal(majorEvents[5].type, "execution_completed");

    // Task-wave assignments: task 1 in wave 1, tasks 2 and 3 in wave 2
    assert.deepEqual(waveStarted[0].taskNumbers, [1]);
    assert.ok(
      waveStarted[1].taskNumbers.includes(2) && waveStarted[1].taskNumbers.includes(3),
      "Wave 2 should contain tasks 2 and 3",
    );

    // Code review findings
    const review = reviewCompleted[0].review;
    assert.ok(review.findings.length > 0, "Should have findings");
    assert.equal(review.findings[0].severity, "critical");
    assert.ok(review.findings[0].title.length > 0, "Finding should have a title");
    assert.ok(review.strengths.length > 0, "Should have strengths");
    assert.ok(review.recommendations.length > 0, "Should have recommendations");
    assert.ok(review.overallAssessment.length > 0, "Should have overall assessment");

    // Plan moved to done/
    assert.ok(io.files.has(INT_DONE_PATH), "Plan should be moved to done/");
    assert.ok(!io.files.has(INT_PLAN_PATH), "Original plan path should be gone");

    // Linked todo closed
    const todoContent = io.files.get(TODO_PATH);
    assert.ok(todoContent !== undefined, "Todo file should exist");
    assert.ok(todoContent!.includes('"status":"done"') || todoContent!.includes('"status": "done"'), "Todo should be marked done");

    // State file deleted
    assert.ok(!io.files.has(INT_STATE_PATH), "State file should be deleted after completion");

    // Lock released: verified implicitly — state file deletion means releaseLock ran,
    // since the engine releases the lock before deleting state.

    // Wave completed events have commitSha
    assert.ok(waveCompleted[0].commitSha, "Wave 1 should have a commitSha");
    assert.ok(waveCompleted[1].commitSha, "Wave 2 should have a commitSha");
  });
});

// ── Scenario 2: Mixed outcomes — BLOCKED triggers judgment + retry ─

describe("Scenario 2: Mixed outcomes — BLOCKED task triggers judgment and retry", () => {
  it("retries a BLOCKED task after judgment and completes successfully", async () => {
    const io = createMockIO();
    seedIntegrationFiles(io);

    const BLOCKER_TEXT = "Cannot connect to email provider";

    // Task 1: DONE, Task 2: BLOCKED then DONE on retry, Task 3: DONE
    const dispatched: number[] = [];
    const baseDispatch = perTaskDispatcher({
      1: [doneResult(1)],
      2: [blockedResult(2, BLOCKER_TEXT), doneResult(2)],
      3: [doneResult(3)],
    });
    io.dispatchSubagent = async (config, options) => {
      dispatched.push(config.taskNumber);
      return baseDispatch(config, options);
    };

    const judgmentRequests: JudgmentRequest[] = [];

    // Capture state file content when wave 2 completes — at that point
    // persistTaskRetryState has already been called (it runs during handleTaskResult,
    // which completes before wave_completed fires).
    let wave2StateSnapshot: string | undefined;

    const callbacks = createMockCallbacks({
      requestJudgment: async (req) => {
        judgmentRequests.push(req);
        if (req.type === "blocked") {
          return { action: "retry" as const };
        }
        return { action: "accept" as const };
      },
    });

    const origOnProgress = callbacks.onProgress;
    callbacks.onProgress = (event) => {
      origOnProgress(event);
      if (event.type === "wave_completed" && event.wave === 2) {
        wave2StateSnapshot = io.files.get(INT_STATE_PATH);
      }
    };

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome
    assert.equal(outcome, "completed");

    // Judgment was requested for the blocked task
    const blockedJudgments = judgmentRequests.filter((r) => r.type === "blocked");
    assert.ok(blockedJudgments.length > 0, "Should have at least one blocked judgment request");

    const blockedReq = blockedJudgments[0] as Extract<JudgmentRequest, { type: "blocked" }>;
    assert.equal(blockedReq.type, "blocked");
    assert.equal(blockedReq.taskNumber, 2);
    assert.equal(blockedReq.wave, 2);
    assert.equal(blockedReq.blocker, BLOCKER_TEXT);

    // Both waves completed
    const waveCompleted = progressEvents(callbacks, "wave_completed");
    assert.equal(waveCompleted.length, 2);
    assert.ok(waveCompleted[0].commitSha, "Wave 1 should have a commitSha");
    assert.ok(waveCompleted[1].commitSha, "Wave 2 should have a commitSha");

    // dispatchSubagent called twice for task 2 (original BLOCKED + retry DONE)
    const task2Dispatches = dispatched.filter((n) => n === 2);
    assert.equal(task2Dispatches.length, 2, "Task 2 should be dispatched exactly twice (original + retry)");

    // Final execution_completed emitted
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 1);

    // Retry state was persisted: the state snapshot captured at wave_completed(2)
    // should contain an entry for task 2 in retryState.tasks.
    assert.ok(wave2StateSnapshot !== undefined, "State snapshot at wave_completed(2) should exist");
    const wave2State: RunState = JSON.parse(wave2StateSnapshot!);
    assert.ok(
      wave2State.retryState.tasks["2"] !== undefined,
      "retryState.tasks should have an entry for task 2 after a BLOCKED->retry sequence",
    );
    const task2RetryRecord = wave2State.retryState.tasks["2"];
    assert.equal(task2RetryRecord.attempts, 1, "Task 2 should have 1 recorded retry attempt");
    assert.ok(
      task2RetryRecord.lastFailure.length > 0,
      "Task 2 retry record should capture the last failure text",
    );
    assert.ok(
      task2RetryRecord.lastFailureAt.length > 0,
      "Task 2 retry record should have a lastFailureAt timestamp",
    );
  });

  it("accepts a DONE_WITH_CONCERNS task after judgment and completes successfully", async () => {
    const io = createMockIO();
    seedIntegrationFiles(io);

    const CONCERNS_TEXT = "Email retry logic may drop messages under load";

    // Task 1: DONE, Task 2: DONE_WITH_CONCERNS, Task 3: DONE
    io.dispatchSubagent = perTaskDispatcher({
      1: [doneResult(1)],
      2: [doneWithConcernsResult(2, CONCERNS_TEXT)],
      3: [doneResult(3)],
    });

    const judgmentRequests: JudgmentRequest[] = [];

    const callbacks = createMockCallbacks({
      requestJudgment: async (req) => {
        judgmentRequests.push(req);
        if (req.type === "done_with_concerns") {
          return { action: "accept" as const };
        }
        return { action: "accept" as const };
      },
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome
    assert.equal(outcome, "completed");

    // Judgment was requested for the done_with_concerns task
    const dwcJudgments = judgmentRequests.filter((r) => r.type === "done_with_concerns");
    assert.ok(dwcJudgments.length > 0, "Should have at least one done_with_concerns judgment request");

    const dwcReq = dwcJudgments[0] as Extract<JudgmentRequest, { type: "done_with_concerns" }>;
    assert.equal(dwcReq.type, "done_with_concerns");
    assert.equal(dwcReq.taskNumber, 2);
    assert.ok(dwcReq.concerns.includes(CONCERNS_TEXT), "Judgment request should contain the concerns text");

    // Both waves completed
    const waveCompleted = progressEvents(callbacks, "wave_completed");
    assert.equal(waveCompleted.length, 2);
    assert.ok(waveCompleted[0].commitSha, "Wave 1 should have a commitSha");
    assert.ok(waveCompleted[1].commitSha, "Wave 2 should have a commitSha");

    // Final execution_completed emitted
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 1);
  });

  it("retries a NEEDS_CONTEXT task after judgment and completes successfully", async () => {
    const io = createMockIO();
    seedIntegrationFiles(io);

    const NEEDS_TEXT = "Need database schema for the email adapter";

    // Task 1: DONE, Task 2: NEEDS_CONTEXT then DONE on retry, Task 3: DONE
    const dispatched: number[] = [];
    const baseDispatch = perTaskDispatcher({
      1: [doneResult(1)],
      2: [needsContextResult(2, NEEDS_TEXT), doneResult(2)],
      3: [doneResult(3)],
    });
    io.dispatchSubagent = async (config, options) => {
      dispatched.push(config.taskNumber);
      return baseDispatch(config, options);
    };

    const judgmentRequests: JudgmentRequest[] = [];

    const callbacks = createMockCallbacks({
      requestJudgment: async (req) => {
        judgmentRequests.push(req);
        if (req.type === "needs_context") {
          return { action: "retry" as const };
        }
        return { action: "accept" as const };
      },
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome
    assert.equal(outcome, "completed");

    // Judgment was requested for the needs_context task
    const ncJudgments = judgmentRequests.filter((r) => r.type === "needs_context");
    assert.ok(ncJudgments.length > 0, "Should have at least one needs_context judgment request");

    const ncReq = ncJudgments[0] as Extract<JudgmentRequest, { type: "needs_context" }>;
    assert.equal(ncReq.type, "needs_context");
    assert.equal(ncReq.taskNumber, 2);
    assert.equal(ncReq.wave, 2);
    assert.equal(ncReq.needs, NEEDS_TEXT);
    assert.ok(ncReq.details.length > 0, "Judgment request should have details");

    // Task 2 dispatched exactly twice (original NEEDS_CONTEXT + retry DONE)
    const task2Dispatches = dispatched.filter((n) => n === 2);
    assert.equal(task2Dispatches.length, 2, "Task 2 should be dispatched exactly twice (original + retry)");

    // Both waves completed
    const waveCompleted = progressEvents(callbacks, "wave_completed");
    assert.equal(waveCompleted.length, 2);
    assert.ok(waveCompleted[0].commitSha, "Wave 1 should have a commitSha");
    assert.ok(waveCompleted[1].commitSha, "Wave 2 should have a commitSha");

    // Final execution_completed emitted
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 1);
  });
});

// ── Scenario 2b: Retry exhaustion — task fails all retries ─────────

describe("Scenario 2b: Retry exhaustion — task fails until retries are exhausted", () => {
  it("exhausts MAX_TASK_RETRIES, fires retry_exhausted judgment, then skips and completes", async () => {
    const io = createMockIO();
    seedIntegrationFiles(io);

    const BLOCKER_TEXT = "Persistent connection failure";

    // Task 1: DONE
    // Task 2: BLOCKED every time (never succeeds)
    // Task 3: DONE
    const dispatched: number[] = [];
    const baseDispatch = perTaskDispatcher({
      1: [doneResult(1)],
      // Supply enough BLOCKED results: 1 initial + 3 retries = 4 dispatches
      2: [
        blockedResult(2, BLOCKER_TEXT),
        blockedResult(2, BLOCKER_TEXT),
        blockedResult(2, BLOCKER_TEXT),
        blockedResult(2, BLOCKER_TEXT),
      ],
      3: [doneResult(3)],
    });
    io.dispatchSubagent = async (config, options) => {
      dispatched.push(config.taskNumber);
      return baseDispatch(config, options);
    };

    const judgmentRequests: JudgmentRequest[] = [];

    const callbacks = createMockCallbacks({
      requestJudgment: async (req) => {
        judgmentRequests.push(req);
        if (req.type === "blocked") {
          // Keep retrying until exhaustion
          return { action: "retry" as const };
        }
        if (req.type === "retry_exhausted") {
          // Skip to allow execution to complete
          return { action: "skip" as const };
        }
        return { action: "accept" as const };
      },
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome — execution completes because retry_exhausted returned "skip"
    assert.equal(outcome, "completed");

    // Blocked judgments: should have exactly MAX_TASK_RETRIES (3) blocked judgments
    const blockedJudgments = judgmentRequests.filter((r) => r.type === "blocked");
    assert.equal(blockedJudgments.length, 3, "Should have exactly 3 blocked judgment requests (one per retry attempt)");

    // Retry exhausted judgment fired
    const exhaustedJudgments = judgmentRequests.filter((r) => r.type === "retry_exhausted");
    assert.equal(exhaustedJudgments.length, 1, "Should have exactly one retry_exhausted judgment request");

    const exhaustedReq = exhaustedJudgments[0] as Extract<JudgmentRequest, { type: "retry_exhausted" }>;
    assert.equal(exhaustedReq.taskNumber, 2);
    assert.equal(exhaustedReq.wave, 2);
    assert.equal(exhaustedReq.attempts, 3, "retry_exhausted should report MAX_TASK_RETRIES attempts");
    assert.ok(exhaustedReq.lastFailure.length > 0, "retry_exhausted should have lastFailure text");
    assert.ok(exhaustedReq.details.includes("3"), "Details should mention the retry count");

    // Task 2 dispatched MAX_TASK_RETRIES + 1 times (1 initial + 3 retries)
    const task2Dispatches = dispatched.filter((n) => n === 2);
    assert.equal(task2Dispatches.length, 4, "Task 2 should be dispatched 4 times (1 initial + 3 retries)");

    // Both waves completed
    const waveCompleted = progressEvents(callbacks, "wave_completed");
    assert.equal(waveCompleted.length, 2);

    // Final execution_completed emitted
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 1);
  });
});

// ── Scenario 2c: specCheck — spec reviewer dispatched when enabled ──

describe("Scenario 2c: specCheck — spec reviewer dispatched when enabled", () => {
  it("dispatches spec-reviewer for each task when specCheck is enabled and completes", async () => {
    const io = createMockIO();
    seedIntegrationFiles(io);

    // Track all dispatches by agent type
    const dispatchLog: { agent: string; taskNumber: number }[] = [];

    const baseDispatch = perTaskDispatcher({
      1: [doneResult(1)],
      2: [doneResult(2)],
      3: [doneResult(3)],
    });
    io.dispatchSubagent = async (config, options) => {
      dispatchLog.push({ agent: config.agent, taskNumber: config.taskNumber });
      if (config.agent === "spec-reviewer") {
        // Spec reviewer passes — return DONE
        return doneResult(config.taskNumber);
      }
      return baseDispatch(config, options);
    };

    const callbacks = createMockCallbacks({
      requestSettings: async (_plan, _detected) => ({
        execution: "parallel" as const,
        tdd: false,
        finalReview: false,
        specCheck: true,
        integrationTest: false,
        testCommand: null,
      }),
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome
    assert.equal(outcome, "completed");

    // Spec reviewer was dispatched for each task (1 in wave 1, 2 and 3 in wave 2)
    const specDispatches = dispatchLog.filter((d) => d.agent === "spec-reviewer");
    assert.ok(specDispatches.length >= 3, `Spec reviewer should be dispatched for all 3 tasks, got ${specDispatches.length}`);

    // Verify spec reviewer was dispatched for each task number
    const specTaskNumbers = new Set(specDispatches.map((d) => d.taskNumber));
    assert.ok(specTaskNumbers.has(1), "Spec reviewer should be dispatched for task 1");
    assert.ok(specTaskNumbers.has(2), "Spec reviewer should be dispatched for task 2");
    assert.ok(specTaskNumbers.has(3), "Spec reviewer should be dispatched for task 3");

    // Implementer dispatches still happened
    const implementerDispatches = dispatchLog.filter((d) => d.agent === "implementer");
    assert.equal(implementerDispatches.length, 3, "Implementer should be dispatched for all 3 tasks");

    // Spec reviewer happens AFTER implementer for each wave
    // Check wave 1: implementer for task 1 before spec-reviewer for task 1
    const wave1Impl = dispatchLog.findIndex((d) => d.agent === "implementer" && d.taskNumber === 1);
    const wave1Spec = dispatchLog.findIndex((d) => d.agent === "spec-reviewer" && d.taskNumber === 1);
    assert.ok(wave1Impl < wave1Spec, "Implementer for task 1 should be dispatched before spec-reviewer for task 1");

    // Both waves completed
    const waveCompleted = progressEvents(callbacks, "wave_completed");
    assert.equal(waveCompleted.length, 2);
    assert.ok(waveCompleted[0].commitSha, "Wave 1 should have a commitSha");
    assert.ok(waveCompleted[1].commitSha, "Wave 2 should have a commitSha");

    // Final execution_completed emitted
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 1);
  });
});

// ── Scenario 3: Stop mid-run ───────────────────────────────────────

describe("Scenario 3: Stop mid-run — cancellation after wave 1", () => {
  it("stops after wave 1 completes, persists stopped state, and does not start wave 2", async () => {
    const io = createMockIO();
    // Use INTEGRATION_PLAN_MD (no todo link) per task description
    seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

    io.dispatchSubagent = perTaskDispatcher({
      1: [doneResult(1)],
      2: [doneResult(2)],
      3: [doneResult(3)],
    });

    let engine: PlanExecutionEngine;
    const callbacks = createMockCallbacks();
    const origOnProgress = callbacks.onProgress;
    callbacks.onProgress = (event) => {
      origOnProgress(event); // preserve recording
      if (event.type === "wave_completed" && event.wave === 1) {
        engine!.requestCancellation("wave");
      }
    };
    engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome must be "stopped"
    assert.equal(outcome, "stopped");

    // State file persists (not deleted)
    assert.ok(io.files.has(INT_STATE_PATH), "State file should persist after stop");

    // State has status "stopped" and stopGranularity "wave"
    const stateContent = io.files.get(INT_STATE_PATH)!;
    const state: RunState = JSON.parse(stateContent);
    assert.equal(state.status, "stopped");
    assert.equal(state.stopGranularity, "wave");

    // Lock released
    assert.equal(state.lock, null, "Lock should be released after stop");

    // Wave 1 committed — wave_completed event for wave 1
    const waveCompleted = progressEvents(callbacks, "wave_completed");
    assert.equal(waveCompleted.length, 1, "Only wave 1 should have completed");
    assert.equal(waveCompleted[0].wave, 1);
    assert.ok(waveCompleted[0].commitSha, "Wave 1 should have a commitSha");

    // Wave 2 never started — no wave_started event for wave 2
    const waveStarted = progressEvents(callbacks, "wave_started");
    const wave2Started = waveStarted.filter((e) => e.wave === 2);
    assert.equal(wave2Started.length, 0, "Wave 2 should never have started");

    // execution_completed NOT emitted
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 0, "execution_completed should not be emitted");

    // Plan NOT moved to done/
    assert.ok(!io.files.has(INT_DONE_PATH), "Plan should NOT be moved to done/");
    assert.ok(io.files.has(INT_PLAN_PATH), "Original plan path should still exist");
  });

  it("task-level cancellation: stops after current task, wave 2 not committed", async () => {
    const io = createMockIO();
    seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

    io.dispatchSubagent = perTaskDispatcher({
      1: [doneResult(1)],
      2: [doneResult(2)],
      3: [doneResult(3)],
    });

    let engine: PlanExecutionEngine;
    const callbacks = createMockCallbacks();
    const origOnProgress = callbacks.onProgress;
    let wave2TaskStartedSeen = false;
    callbacks.onProgress = (event) => {
      origOnProgress(event); // preserve recording
      // Trigger task-level cancellation on the first task_started event in wave 2
      if (
        event.type === "task_started" &&
        (event as Extract<ProgressEvent, { type: "task_started" }>).wave === 2 &&
        !wave2TaskStartedSeen
      ) {
        wave2TaskStartedSeen = true;
        engine!.requestCancellation("task");
      }
    };
    engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome must be "stopped"
    assert.equal(outcome, "stopped");

    // State file persists with stopGranularity "task"
    assert.ok(io.files.has(INT_STATE_PATH), "State file should persist after task-level stop");
    const stateContent = io.files.get(INT_STATE_PATH)!;
    const state: RunState = JSON.parse(stateContent);
    assert.equal(state.status, "stopped");
    assert.equal(state.stopGranularity, "task");

    // Lock released
    assert.equal(state.lock, null, "Lock should be released after stop");

    // Wave 1 committed — wave_completed event for wave 1
    const waveCompleted = progressEvents(callbacks, "wave_completed");
    assert.equal(waveCompleted.length, 1, "Only wave 1 should have committed");
    assert.equal(waveCompleted[0].wave, 1);
    assert.ok(waveCompleted[0].commitSha, "Wave 1 should have a commitSha");

    // Wave 2 NOT committed — no wave_completed event for wave 2
    const wave2Completed = waveCompleted.filter((e) => e.wave === 2);
    assert.equal(wave2Completed.length, 0, "Wave 2 should NOT have been committed (partial waves must not commit)");

    // execution_completed NOT emitted
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 0, "execution_completed should not be emitted");
  });
});

// ── Scenario 4: Resume from stopped state ──────────────────────────

describe("Scenario 4: Resume from stopped state", () => {
  it("resumes from stopped state, skips wave 1 tasks, dispatches wave 2 tasks, and completes", async () => {
    const io = createMockIO();
    seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

    // Seed the workspace path so validateResume's fileExists check passes
    io.files.set(TEST_CWD, "");

    // Track which task numbers are dispatched
    const dispatched: number[] = [];
    io.dispatchSubagent = async (config, options) => {
      dispatched.push(config.taskNumber);
      return doneResult(config.taskNumber);
    };

    // Pre-seed a stopped RunState where wave 1 is done
    const stoppedState: RunState = {
      plan: INT_PLAN_FILE_NAME,
      status: "stopped",
      lock: null,
      startedAt: new Date(Date.now() - 60000).toISOString(),
      stoppedAt: new Date().toISOString(),
      stopGranularity: "wave",
      settings: DEFAULT_SETTINGS,
      workspace: {
        type: "current",
        path: TEST_CWD,
        branch: "feature/test",
      },
      preExecutionSha: "abc123def456",
      baselineTest: null,
      retryState: {
        tasks: {},
        waves: {},
        finalReview: null,
      },
      waves: [
        {
          wave: 1,
          tasks: [1],
          status: "done",
          commitSha: "wave1sha123",
        },
      ],
    };
    io.files.set(INT_STATE_PATH, JSON.stringify(stoppedState, null, 2));

    const callbacks = createMockCallbacks({
      requestResumeAction: async (_state) => "continue",
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome must be "completed"
    assert.equal(outcome, "completed");

    // Wave 1 tasks (task 1) NOT re-dispatched
    assert.ok(!dispatched.includes(1), "Task 1 should NOT be re-dispatched on resume");

    // Wave 2 tasks (2 and 3) dispatched
    assert.ok(dispatched.includes(2), "Task 2 should be dispatched");
    assert.ok(dispatched.includes(3), "Task 3 should be dispatched");

    // requestSettings NOT called (uses persisted settings from stopped state)
    assert.equal(
      (callbacks.calls["requestSettings"] ?? []).length,
      0,
      "requestSettings should not be called when resuming",
    );

    // requestResumeAction WAS called
    assert.ok(
      (callbacks.calls["requestResumeAction"] ?? []).length > 0,
      "requestResumeAction should have been called",
    );

    // requestResumeAction received the persisted stopped state as its argument
    const resumeArg = callbacks.calls["requestResumeAction"]![0][0] as RunState;
    assert.equal(resumeArg.status, "stopped", "Resume arg should have status 'stopped'");
    assert.equal(resumeArg.plan, INT_PLAN_FILE_NAME, "Resume arg should reference the correct plan file");
    assert.ok(Array.isArray(resumeArg.waves), "Resume arg should have a waves array");
    assert.equal(resumeArg.waves.length, 1, "Resume arg should have exactly one wave (wave 1 done)");
    assert.equal(resumeArg.waves[0].wave, 1, "Resume arg wave entry should be wave 1");
    assert.equal(resumeArg.waves[0].status, "done", "Resume arg wave 1 should be marked done");

    // Only wave 2 started (not wave 1 again)
    const waveStarted = progressEvents(callbacks, "wave_started");
    const wave1Started = waveStarted.filter((e) => e.wave === 1);
    assert.equal(wave1Started.length, 0, "Wave 1 should not be re-started on resume");
    const wave2Started = waveStarted.filter((e) => e.wave === 2);
    assert.equal(wave2Started.length, 1, "Wave 2 should start exactly once");

    // execution_completed emitted (means resume validation passed and run finished)
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 1, "execution_completed should be emitted on successful resume");

    // State file deleted after completion
    assert.ok(!io.files.has(INT_STATE_PATH), "State file should be deleted after completion");
  });
});

// ── Scenario 5: Test regression — post-wave test failure ───────────

describe("Scenario 5: Test regression — post-wave test failure", () => {
  // Wraps io.exec to intercept the test command (sh -c npm test) with
  // call-counting logic. Call 1 = baseline (pass), call 2 = post-wave-1 (fail),
  // call 3+ = pass. All other commands delegate to the default exec handler.
  function makeTestRegressionExecHandler(io: ReturnType<typeof createMockIO>): { getTestCallCount: () => number } {
    let testCallCount = 0;
    const defaultExec = io.exec;
    io.exec = async (cmd, args, cwd) => {
      if (cmd === "sh" && args[0] === "-c" && args[1]?.startsWith("npm test")) {
        testCallCount++;
        if (testCallCount === 1) {
          // Baseline run — all tests pass
          return { stdout: "All tests passed\n", stderr: "", exitCode: 0 };
        }
        if (testCallCount === 2) {
          // Post-wave-1 run — a new test failure (regression)
          return {
            stdout: "not ok 1 - notifier dispatches events\nnpm test failed\n",
            stderr: "",
            exitCode: 1,
          };
        }
        // Call 3+ — tests pass again (after retry/wave reset)
        return { stdout: "All tests passed\n", stderr: "", exitCode: 0 };
      }
      return defaultExec(cmd, args, cwd);
    };
    return { getTestCallCount: () => testCallCount };
  }

  it("5a — regression action retry: re-dispatches wave 1 tasks and completes", async () => {
    const io = createMockIO();
    const { getTestCallCount } = makeTestRegressionExecHandler(io);
    seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

    const dispatched: number[] = [];
    io.dispatchSubagent = async (config) => {
      dispatched.push(config.taskNumber);
      return doneResult(config.taskNumber);
    };

    const regressionContexts: import("./types.ts").TestRegressionContext[] = [];

    const callbacks = createMockCallbacks({
      requestSettings: async (_plan, _detected) => ({
        execution: "parallel" as const,
        tdd: false,
        finalReview: false,
        specCheck: false,
        integrationTest: true,
        testCommand: "npm test",
      }),
      requestTestRegressionAction: async (ctx) => {
        regressionContexts.push(ctx);
        return "retry";
      },
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome
    assert.equal(outcome, "completed");

    // requestTestRegressionAction was called with the right context
    assert.ok(regressionContexts.length > 0, "requestTestRegressionAction should be called");
    const ctx = regressionContexts[0];
    assert.equal(ctx.wave, 1, "Regression context should report wave 1");
    assert.ok(ctx.newFailures.length > 0, "Regression context should have new failures");
    assert.ok(ctx.testOutput.length > 0, "Regression context should have test output");

    // Task 1 was dispatched at least twice (original + after regression retry)
    const task1Dispatches = dispatched.filter((n) => n === 1);
    assert.ok(task1Dispatches.length >= 2, `Task 1 should be dispatched at least twice, got ${task1Dispatches.length}`);

    // Execution completed
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 1, "execution_completed should be emitted");
  });

  it("5b — regression action skip: wave 1 not retried, wave 2 proceeds, completes", async () => {
    const io = createMockIO();
    makeTestRegressionExecHandler(io);
    seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

    const dispatched: number[] = [];
    io.dispatchSubagent = async (config) => {
      dispatched.push(config.taskNumber);
      return doneResult(config.taskNumber);
    };

    const regressionContexts: import("./types.ts").TestRegressionContext[] = [];

    const callbacks = createMockCallbacks({
      requestSettings: async (_plan, _detected) => ({
        execution: "parallel" as const,
        tdd: false,
        finalReview: false,
        specCheck: false,
        integrationTest: true,
        testCommand: "npm test",
      }),
      requestTestRegressionAction: async (ctx) => {
        regressionContexts.push(ctx);
        return "skip";
      },
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome
    assert.equal(outcome, "completed");

    // requestTestRegressionAction was called
    assert.ok(regressionContexts.length > 0, "requestTestRegressionAction should be called");

    // Task 1 dispatched only once (no retry after skip)
    const task1Dispatches = dispatched.filter((n) => n === 1);
    assert.equal(task1Dispatches.length, 1, "Task 1 should be dispatched only once (no retry on skip)");

    // Wave 2 started (execution continued past regression)
    const waveStarted = progressEvents(callbacks, "wave_started");
    const wave2Started = waveStarted.filter((e) => e.wave === 2);
    assert.equal(wave2Started.length, 1, "Wave 2 should have started after skip");

    // Execution completed
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 1, "execution_completed should be emitted");
  });
});

// ── Scenario 6: Precondition failures propagate correctly ──────────

describe("Scenario 6: Precondition failures propagate correctly", () => {
  it("6a — resume cancel: returns 'cancelled', does not acquire a new lock", async () => {
    const io = createMockIO();
    seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

    // Pre-seed a stopped state for the integration plan
    const stoppedState: RunState = {
      plan: INT_PLAN_FILE_NAME,
      status: "stopped",
      lock: null,
      startedAt: new Date(Date.now() - 60000).toISOString(),
      stoppedAt: new Date().toISOString(),
      stopGranularity: "wave",
      settings: DEFAULT_SETTINGS,
      workspace: {
        type: "current",
        path: TEST_CWD,
        branch: "feature/test",
      },
      preExecutionSha: "abc123def456",
      baselineTest: null,
      retryState: {
        tasks: {},
        waves: {},
        finalReview: null,
      },
      waves: [
        {
          wave: 1,
          tasks: [1],
          status: "done",
          commitSha: "wave1sha123",
        },
      ],
    };
    io.files.set(INT_STATE_PATH, JSON.stringify(stoppedState, null, 2));

    const callbacks = createMockCallbacks({
      requestResumeAction: async (_state) => "cancel",
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome must be "cancelled"
    assert.equal(outcome, "cancelled");

    // Lock should not have been acquired — state still has lock: null
    const stateContent = io.files.get(INT_STATE_PATH);
    assert.ok(stateContent !== undefined, "State file should still exist");
    const state: RunState = JSON.parse(stateContent!);
    assert.equal(state.lock, null, "Lock should not have been acquired");
  });

  it("6b — main-branch decline: returns 'cancelled', no new state file created", async () => {
    // Use the onMainBranchHandler from helpers, but override confirmMainBranch to return false
    const io = createMockIO(undefined, async (cmd, args, _cwd) => {
      // git rev-parse --git-dir → simulate git repo
      if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
        return { stdout: ".git\n", stderr: "", exitCode: 0 };
      }
      // git rev-parse --abbrev-ref HEAD → on main branch
      if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
        return { stdout: "main\n", stderr: "", exitCode: 0 };
      }
      // git rev-parse HEAD → HEAD sha
      if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
        return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
      }
      // git check-ignore -q → directory is NOT ignored (worktree dir not gitignored)
      if (cmd === "git" && args[0] === "check-ignore") {
        return { stdout: "", stderr: "", exitCode: 1 };
      }
      // kill -0 → process not alive
      if (cmd === "kill" && args[0] === "-0") {
        return { stdout: "", stderr: "No such process", exitCode: 1 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

    const callbacks = createMockCallbacks({
      // User chooses "current" workspace (stays on main, no worktree)
      requestWorktreeSetup: async (_branch, _cwd) => ({ type: "current" as const }),
      confirmMainBranch: async (_branch) => false,
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome must be "cancelled"
    assert.equal(outcome, "cancelled");

    // No state file should have been created
    assert.ok(!io.files.has(INT_STATE_PATH), "No state file should be created when main branch is declined");
  });

  it("6c — active lock held by another session: engine.execute throws with descriptive error", async () => {
    const DIFFERENT_PLAN = "other-plan.md";
    const DIFFERENT_PLAN_STATE_PATH = join(
      TEST_CWD,
      ".pi/plan-runs",
      DIFFERENT_PLAN + ".state.json",
    );

    const io = createMockIO(undefined, async (cmd, args, _cwd) => {
      // git rev-parse --git-dir → simulate git repo
      if (cmd === "git" && args[0] === "rev-parse" && args.includes("--git-dir")) {
        return { stdout: ".git\n", stderr: "", exitCode: 0 };
      }
      // git rev-parse --abbrev-ref HEAD → feature branch
      if (cmd === "git" && args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
        return { stdout: "feature/test\n", stderr: "", exitCode: 0 };
      }
      // git rev-parse HEAD
      if (cmd === "git" && args[0] === "rev-parse" && args.includes("HEAD")) {
        return { stdout: "abc123def456\n", stderr: "", exitCode: 0 };
      }
      // git check-ignore
      if (cmd === "git" && args[0] === "check-ignore") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      // kill -0: return exitCode 0 to simulate a LIVE process (active lock)
      if (cmd === "kill" && args[0] === "-0") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    });
    seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

    // Pre-seed a state file for a DIFFERENT plan with an active lock
    const activeLockState: RunState = {
      plan: DIFFERENT_PLAN,
      status: "running",
      lock: {
        pid: 99999,
        session: "other-session",
        acquiredAt: new Date(Date.now() - 30000).toISOString(),
      },
      startedAt: new Date(Date.now() - 60000).toISOString(),
      stoppedAt: null,
      stopGranularity: null,
      settings: DEFAULT_SETTINGS,
      workspace: {
        type: "current",
        path: TEST_CWD,
        branch: "feature/test",
      },
      preExecutionSha: "abc123def456",
      baselineTest: null,
      retryState: {
        tasks: {},
        waves: {},
        finalReview: null,
      },
      waves: [],
    };
    io.files.set(DIFFERENT_PLAN_STATE_PATH, JSON.stringify(activeLockState, null, 2));

    const callbacks = createMockCallbacks();

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);

    // Engine should throw because there's an active lock on a different plan
    await assert.rejects(
      () => engine.execute(INT_PLAN_PATH, callbacks),
      (err: Error) => /already.*running|active.*run|locked/i.test(err.message),
      "Should throw with a descriptive error about active lock",
    );
  });

  it("6d — restart resume: deletes old state, calls requestSettings, dispatches all tasks, completes", async () => {
    const io = createMockIO();
    seedIntegrationFiles(io, INTEGRATION_PLAN_MD);

    // Seed the workspace path so validateResume's fileExists check passes (not needed for restart, but safe)
    io.files.set(TEST_CWD, "");

    // Track which task numbers are dispatched
    const dispatched: number[] = [];
    io.dispatchSubagent = async (config, options) => {
      dispatched.push(config.taskNumber);
      return doneResult(config.taskNumber);
    };

    // Pre-seed a stopped RunState where wave 1 is done
    const stoppedState: RunState = {
      plan: INT_PLAN_FILE_NAME,
      status: "stopped",
      lock: null,
      startedAt: new Date(Date.now() - 60000).toISOString(),
      stoppedAt: new Date().toISOString(),
      stopGranularity: "wave",
      settings: DEFAULT_SETTINGS,
      workspace: {
        type: "current",
        path: TEST_CWD,
        branch: "feature/test",
      },
      preExecutionSha: "abc123def456",
      baselineTest: null,
      retryState: {
        tasks: {},
        waves: {},
        finalReview: null,
      },
      waves: [
        {
          wave: 1,
          tasks: [1],
          status: "done",
          commitSha: "wave1sha123",
        },
      ],
    };
    io.files.set(INT_STATE_PATH, JSON.stringify(stoppedState, null, 2));

    const callbacks = createMockCallbacks({
      requestResumeAction: async (_state) => "restart",
    });

    const engine = new PlanExecutionEngine(io, TEST_CWD, TEST_AGENT_DIR);
    const outcome = await engine.execute(INT_PLAN_PATH, callbacks);

    // Outcome must be "completed"
    assert.equal(outcome, "completed");

    // requestResumeAction WAS called
    assert.ok(
      (callbacks.calls["requestResumeAction"] ?? []).length > 0,
      "requestResumeAction should have been called",
    );

    // requestSettings IS called (fresh start — restart discards persisted settings)
    assert.ok(
      (callbacks.calls["requestSettings"] ?? []).length > 0,
      "requestSettings should be called when restarting",
    );

    // All 3 tasks dispatched (restart means start over from wave 1)
    assert.ok(dispatched.includes(1), "Task 1 should be dispatched on restart");
    assert.ok(dispatched.includes(2), "Task 2 should be dispatched on restart");
    assert.ok(dispatched.includes(3), "Task 3 should be dispatched on restart");

    // execution_completed emitted
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 1, "execution_completed should be emitted on successful restart");

    // State file deleted after completion
    assert.ok(!io.files.has(INT_STATE_PATH), "State file should be deleted after completion");
  });
});
