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

// ── Shared helpers ───────────────────────────────────────────────────

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

    io.dispatchSubagent = perTaskDispatcher({
      1: [doneResult(1)],
      2: [doneResult(2)],
      3: [doneResult(3)],
    });

    // Override code-reviewer dispatch to return review output
    const baseDispatch = io.dispatchSubagent;
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
      return baseDispatch(config, options);
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
    io.dispatchSubagent = perTaskDispatcher({
      1: [doneResult(1)],
      2: [blockedResult(2, BLOCKER_TEXT), doneResult(2)],
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

    // Task 2 has at least one task_completed event after retry (should be 2: initial BLOCKED + retry DONE)
    const taskCompleted = progressEvents(callbacks, "task_completed");
    const task2Events = taskCompleted.filter((e) => e.taskNumber === 2);
    assert.ok(task2Events.length >= 1, "Task 2 should have at least one task_completed event");

    // Final execution_completed emitted
    const execCompleted = progressEvents(callbacks, "execution_completed");
    assert.equal(execCompleted.length, 1);
  });
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
