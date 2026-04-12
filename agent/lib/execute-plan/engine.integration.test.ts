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
