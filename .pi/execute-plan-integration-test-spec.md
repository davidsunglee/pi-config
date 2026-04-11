# Integration Test Spec: execute-plan Engine

## Goal

Add engine-level integration tests that run `PlanExecutionEngine.execute()` start-to-finish through realistic multi-wave scenarios, validating the full orchestration lifecycle that unit tests don't cover.

## Approach

Use the existing mock infrastructure (`createMockIO`, `createMockCallbacks`, `seedFiles`) with richer scenario-specific configurations. No real filesystem, git, or subagent dispatch needed — the `ExecutionIO` + `EngineCallbacks` injection seams are sufficient.

New file: `agent/lib/execute-plan/engine.integration.test.ts`

## Scenarios

### 1. Happy path — multi-wave completion

3-task plan with dependencies → 2 waves → all DONE → final review enabled → plan moved to `done/`, todo closed, state file deleted, lock released. Assert:
- Callback ordering: `requestSettings` → `wave_started(1)` → tasks → `wave_completed(1)` → `wave_started(2)` → tasks → `wave_completed(2)` → code review → `execution_completed`
- State file cleaned up
- Plan file moved to `.pi/plans/done/`
- Linked todo marked closed
- Return value is `"completed"`

### 2. Mixed outcomes — BLOCKED task triggers judgment and retry

Task 1 DONE, Task 2 BLOCKED → `requestJudgment` called with `type: "blocked"` → judgment returns `retry` → retry succeeds with DONE → wave completes. Assert:
- Judgment request has correct blocker context
- Retry state persisted between attempts (check state file mid-run)
- `dispatchSubagent` called twice for Task 2
- Wave still commits after successful retry

### 3. Stop mid-run — cancellation after wave 1

Configure `onProgress` to call `engine.requestCancellation("wave")` when `wave_completed` fires for wave 1. Assert:
- Return value is `"stopped"`
- State file persists with `status: "stopped"`, `stopGranularity: "wave"`
- Wave 1 committed, wave 2 never started
- Lock released

### 4. Resume from stopped state

Seed a state file with wave 1 done (commitSha set), status `"stopped"`. Configure `requestResumeAction` to return `"continue"`. Assert:
- `validateResume` called
- Execution picks up at wave 2
- Wave 1 tasks not re-dispatched
- Settings and workspace come from persisted state, `requestSettings` not called

### 5. Test regression — post-wave test failure

Enable `integrationTest` with a test command. Mock exec to pass baseline but fail after wave 1. Assert:
- `requestTestRegressionAction` called with failure context
- If action is `"retry"` → wave re-executed (commit reset, tasks re-dispatched)
- If action is `"skip"` → proceeds to next wave

### 6. Precondition failures propagate correctly

- Resume cancel → returns `"cancelled"`, no state/lock created
- Main-branch decline → returns `"cancelled"`, no state/lock created
- Active lock by another session → throws with descriptive error

## What to skip

- Extension-level integration tests (mocking pi APIs is complex and brittle)
- Real subagent dispatch (slow, flaky, requires running pi instance)
- Real filesystem + git smoke tests (secondary value, can add later)

## Test infrastructure reuse

Reuse `createMockIO`, `createMockCallbacks`, `seedFiles`, `onMainBranchHandler` from `engine.test.ts`. These may need to be extracted to a shared `engine.test-helpers.ts` if the integration test file imports them, or duplicated minimally.

A `dispatchSubagent` mock that returns different results per task number is the main new building block:

```typescript
const perTaskResults: Record<number, SubagentResult[]> = {
  1: [doneResult(1)],
  2: [blockedResult(2, "missing dependency"), doneResult(2)], // first call blocked, retry succeeds
};
io.dispatchSubagent = async (config) => perTaskResults[config.taskNumber].shift()!;
```
