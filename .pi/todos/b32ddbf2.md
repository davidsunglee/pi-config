{
  "id": "b32ddbf2",
  "title": "Add engine-level integration tests for execute-plan",
  "tags": [
    "execute-plan",
    "testing"
  ],
  "status": "open",
  "created_at": "2026-04-11T19:32:44.540Z",
  "assigned_to_session": "f50e71c4-1d85-4a00-bb76-f83537781e35"
}

## Goal

Add engine-level integration tests that run `PlanExecutionEngine.execute()` end-to-end through realistic multi-wave scenarios, covering orchestration lifecycle behavior that the current unit tests do not fully exercise.

Spec source: `.pi/execute-plan-integration-test-spec.md`

## Scope

Create a new test file:
- `agent/lib/execute-plan/engine.integration.test.ts`

Use the existing mocked seams (`ExecutionIO` + `EngineCallbacks`) and shared test helpers extracted from `agent/lib/execute-plan/engine.test.ts`.

## Decisions from refinement

- **Helper strategy:** extract shared helpers into a reusable helper module rather than duplicating them in the integration test file
- **Plan fixture:** create a **new dedicated 3-task integration fixture** tailored to these scenarios
- **Scenario scope:** implement **all 6 scenarios** from the spec now
- **Regression coverage:** cover **both** post-regression branches: `retry` and `skip`
- **Resume validation assertion:** prove resume validation **indirectly via behavior**, not by introducing a new mock seam
- **Happy-path ordering:** assert an **exact major lifecycle sequence**, with looser assertions for task-level events
- **Final review depth:** inspect and assert **details within the review output / emitted review summary**, not just that review ran
- **State persistence checks:** inspect **final persisted state only**, not every intermediate write
- **File organization:** structure the file as **6 top-level `describe` blocks**, one per scenario
- **Verification commands:** document both a **fast iteration command** and the final **full-suite command**

## Approach

### 1. Extract shared test helpers

Move reusable pieces out of `agent/lib/execute-plan/engine.test.ts` into a shared helper module, likely something like:
- `agent/lib/execute-plan/engine.test-helpers.ts`

Expected shared exports:
- `createMockIO`
- `createMockCallbacks`
- `seedFiles`
- `onMainBranchHandler`
- any reusable constants or fixture-path helpers needed by both test files

Goal: avoid duplicate mocking logic while keeping unit and integration tests independent and readable.

### 2. Add a dedicated integration plan fixture

Define a dedicated 3-task markdown fixture for integration tests rather than reusing the current unit-test fixture shape.

The fixture should support these needs:
- 3 tasks
- dependencies that produce **2 waves**
- a `**Source:** TODO-<id>` link so completion can close a todo
- a test command section suitable for regression scenarios
- distinctive task titles / files so dispatch and lifecycle assertions are easy to read

### 3. Keep tests fully mocked and deterministic

Do **not** use:
- real filesystem operations
- real git operations
- real subagent execution
- extension-level pi API integration

Use only the existing `ExecutionIO` and `EngineCallbacks` seams with richer scenario-specific mock behavior.

## Required scenarios

### 1. Happy path — multi-wave completion

Use the dedicated 3-task plan fixture with dependencies that produce 2 waves. All tasks return `DONE`. Enable final review.

Assert:
- major callback/lifecycle ordering is exact:
  - `requestSettings`
  - `wave_started(1)`
  - task activity for wave 1
  - `wave_completed(1)`
  - `wave_started(2)`
  - task activity for wave 2
  - `wave_completed(2)`
  - code review activity
  - `execution_completed`
- task-level events are present in the correct wave, but do not require a fully rigid per-task ordering
- plan moved to `.pi/plans/done/`
- linked todo closed
- state file deleted
- lock released
- return value is `"completed"`
- final review details are asserted, including emitted review summary / parsed findings rather than only checking that review ran

### 2. Mixed outcomes — BLOCKED task triggers judgment and retry

Set up task results so:
- one task completes with `DONE`
- another returns `BLOCKED` on first dispatch, then `DONE` on retry

Assert:
- `requestJudgment` receives `type: "blocked"`
- blocker/error context passed into judgment is correct
- final persisted state reflects retry handling appropriately
- `dispatchSubagent` is called twice for the retried task
- the wave still commits after the successful retry

### 3. Stop mid-run — cancellation after wave 1

Trigger `engine.requestCancellation("wave")` from `onProgress` after `wave_completed` for wave 1.

Assert:
- return value is `"stopped"`
- final persisted state remains present with:
  - `status: "stopped"`
  - `stopGranularity: "wave"`
- wave 1 committed
- wave 2 never starts
- lock is released

### 4. Resume from stopped state

Seed a stopped state where wave 1 is already done and `requestResumeAction` returns `"continue"`.

Assert indirectly that resume validation is happening by behavior:
- execution resumes from wave 2
- wave 1 tasks are not re-dispatched
- settings and workspace come from persisted state
- `requestSettings` is not called

No special mocking seam is required just to observe `validateResume()` directly.

### 5. Test regression — post-wave test failure

Enable `integrationTest` with a test command. Mock baseline tests to pass, then make tests fail after wave 1.

Cover **both** branches:

#### 5a. Regression action = `retry`
Assert:
- `requestTestRegressionAction` is called with expected regression context
- the wave is re-executed
- its checkpoint commit is reset
- tasks are re-dispatched

#### 5b. Regression action = `skip`
Assert:
- `requestTestRegressionAction` is called with expected regression context
- execution proceeds to the next wave without retrying forever

### 6. Precondition failures propagate correctly

Cover these startup/precondition paths:
- resume cancel → returns `"cancelled"`, no state or lock created
- main-branch decline → returns `"cancelled"`, no state or lock created
- active lock held by another session → throws a descriptive error

## File structure recommendation

Use one test file with **6 top-level `describe` blocks**, one per scenario from the spec.

This should mirror the spec directly and keep failures easy to localize.

## Useful mock pattern

A per-task result queue is likely the simplest way to model retries:

```ts
const perTaskResults: Record<number, SubagentResult[]> = {
  1: [doneResult(1)],
  2: [blockedResult(2, "missing dependency"), doneResult(2)],
};

io.dispatchSubagent = async (config) => {
  return perTaskResults[config.taskNumber].shift()!;
};
```

## Explicitly out of scope

Do not add:
- extension-level integration tests against mocked pi APIs
- real subagent dispatch
- real filesystem/git smoke tests

## Verification

For iteration, a narrow command is encouraged, for example:

```bash
cd agent
node --experimental-strip-types --test lib/execute-plan/engine.integration.test.ts
```

Before closing the todo, run the full suite:

```bash
cd agent
npm test
```
