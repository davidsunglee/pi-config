# Wave 4 Task 15 Code Review

## Strengths
- The startup path is readable and mostly follows the planned sequencing: parse/validate the plan, load model tiers, check the repo-wide lock, handle resume detection, detect or request a test command, resolve workspace, capture the baseline, and record `preExecutionSha` before entering the wave loop (`agent/lib/execute-plan/engine.ts:68-242`).
- Main-branch workspace handling is wired in the right order for the happy path: `requestWorktreeSetup()` is gated behind `isMainBranch && !isInWorktree`, worktree creation is blocked on `isWorktreeDirectoryIgnored()`, and current-workspace-on-main confirmation happens before state creation (`agent/lib/execute-plan/engine.ts:156-199`).
- The completion lifecycle is connected end-to-end and exported publicly: release lock, move the plan to `done/`, close the linked todo, delete state, emit `execution_completed`, and re-export `PlanExecutionEngine` from the barrel (`agent/lib/execute-plan/engine.ts:256-274`, `agent/lib/execute-plan/index.ts:127-128`).
- Additional verification was clean: `node --experimental-strip-types --test lib/execute-plan/engine.test.ts` passed (18/18), the targeted `tsc --noEmit ...` command passed, and `rg -n "plan-reviewer\.md|plan-reviewer"` found no references in the scoped execute-plan files.

## Issues
### Critical
- None.

### Important
- `confirmMainBranch(false)` is implemented as an exception path, not the clean early return the task spec requires. The engine throws `"Execution cancelled: user declined to run on main branch."` (`agent/lib/execute-plan/engine.ts:186-193`), and the test suite codifies that behavior with `assert.rejects(...)` (`agent/lib/execute-plan/engine.test.ts:377-399`). The task plan explicitly says this case should "return early with no state file/lock side effects" (`/Users/david/Code/pi-config/.pi/plans/2026-04-10-execute-plan-extension.md:779-780`). Side effects are avoided, but the control-flow contract is still wrong.
- Resume `continue` currently overwrites the persisted run state before execution resumes, which drops the saved retry metadata and completed-wave history from disk. The engine reads `existingState.retryState` and related resume fields (`agent/lib/execute-plan/engine.ts:100-117`) but then unconditionally recreates the state file with `createState(...)` (`agent/lib/execute-plan/engine.ts:211-213`). `createState()` initializes `retryState` to empty objects and `waves` to `[]` (`agent/lib/execute-plan/state-manager.ts:52-75`). That means a resumed run loses its persisted state on disk unless later code rehydrates it, which is not consistent with the task's resume requirement (`/Users/david/Code/pi-config/.pi/plans/2026-04-10-execute-plan-extension.md:793-814`).
- The required try/finally lifecycle contract was not implemented. `execute()` is structured as `try { ... } catch { ... throw err; }` with best-effort cleanup (`agent/lib/execute-plan/engine.ts:67-305`), and there is no `finally` block even though the task explicitly requires the full lifecycle to be wrapped in try/finally (`/Users/david/Code/pi-config/.pi/plans/2026-04-10-execute-plan-extension.md:765-766,814`). This leaves the cleanup guarantee as a code-path convention instead of a structural invariant.

### Minor
- Several tests do not actually assert the acceptance criteria they are named after:
  - the `preExecutionSha` test never inspects state and only infers success from `wave_started` (`agent/lib/execute-plan/engine.test.ts:541-552`);
  - the lock-release test computes `lockReleased` but never asserts it (`agent/lib/execute-plan/engine.test.ts:816-823`);
  - the resume test verifies only that wave 1 is skipped, not that persisted retry counters were preserved/consumed (`agent/lib/execute-plan/engine.test.ts:729-740`);
  - the suite covers off-main no-prompt behavior (`agent/lib/execute-plan/engine.test.ts:867-882`) but does not add the acceptance-case where execution is already in a worktree and should also avoid prompting.

## Recommendations
- Change the current-workspace-on-main decline path to return cleanly before state creation instead of throwing, and update the corresponding test to assert non-error cancellation.
- Preserve resume state on `continue` instead of recreating it from scratch, or immediately seed the new state with the persisted `retryState` and wave history before any further lifecycle steps.
- Refactor `execute()` to use an explicit try/finally cleanup structure so the error-handling contract matches the task spec exactly.
- Strengthen the focused tests to assert the actual state mutations (`preExecutionSha`, unlocked state before deletion, persisted retry metadata) and add an explicit already-in-worktree no-prompt case.

## Assessment
This is a solid startup/completion scaffold with clean focused verification, but I would not sign off Task 15 as complete yet. The implementation diverges from the task spec in three meaningful places: cancellation on main returns as an error instead of a clean early exit, resume overwrites persisted state, and the required try/finally lifecycle contract is not present.