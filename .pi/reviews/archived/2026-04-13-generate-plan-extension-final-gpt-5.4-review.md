# Generate-Plan Extension Final Verification Review

- **Date:** 2026-04-13
- **Reviewer:** `reviewer` subagent
- **Model:** `gpt-5.4`
- **Worktree:** `/Users/david/Code/pi-config-generate-plan-extension`
- **Scope:** Current worktree state, including uncommitted modifications
- **Reviewed against:**
  - `.pi/plans/2026-04-12-generate-plan-extension.md`
  - `.pi/todos/d68082f8.md`

## Summary

Assessment: **No**

The implementation is close, but not yet merge-ready. The main generate-plan flow is well-implemented and heavily tested, but there is one production-grade data-loss risk in `engine.ts` and the current branch is not typecheck-clean. Tests are green, but those two issues are enough to block merge readiness.

## Strengths

- The implementation largely matches the planned architecture:
  - pure core library in `agent/lib/generate-plan/`
  - thin extension adapter in `agent/extensions/generate-plan/`
  - thin skill stub in `agent/skills/generate-plan/SKILL.md`
- The engine covers the intended lifecycle: input resolution, prompt building, shared-contract validation, review dispatch, repair loop, and review-note appending.
- Review fallback behavior is implemented correctly: cross-provider review first, then fallback to `modelTiers.capable` with a warning.
- Repair-loop behavior is thoughtfully handled, including stale-review clearing after a post-edit validation failure.
- Verification is strong:
  - `cd agent && npm test` passed (`532` tests, `0` failures)
  - extension import sanity-check passed
- The current uncommitted changes in `agent/extensions/generate-plan/index.ts` and `index.test.ts` improve testability and registration coverage.

## Issues

### Critical (Must Fix)

1. **Existing plan files are destructively truncated before each generate/repair dispatch**
   - **Reference:** `agent/lib/generate-plan/engine.ts:226-228`
   - **What is wrong:** `dispatchPlanGeneratorAndReadPlan()` clears `planPath` by writing an empty string before dispatching `plan-generator`.
   - **Why it matters:** This can destroy the last known-good plan if the subagent crashes, writes to the wrong path, or produces no output. Because plan filenames are deterministic (`date + shortDescription`), re-running generation for the same input on the same day can wipe an existing plan. The same risk exists during repair cycles, where a failed edit can erase the current plan under review.
   - **How to fix:** Do not truncate the canonical plan file up front. Generate into a unique temp/attempt path and atomically promote it after a successful read, or extend `GenerationIO` to support backup/restore/rename semantics so failed attempts preserve the previous file.

### Important (Should Fix)

1. **Generate-plan code currently breaks the project typecheck**
   - **References:**
     - `agent/extensions/generate-plan/index.ts:151`
     - `agent/extensions/generate-plan/index.ts:486-487`
   - **What is wrong:** `npm run typecheck` fails on two generate-plan-specific typing errors:
     - `buildSpawnOptions()` returns `['ignore','pipe','pipe']` under `SpawnOptionsWithoutStdio`, which does not permit `"ignore"` in that position.
     - `notify` is typed with `level: string`, but `ctx.ui.notify` expects `"info" | "warning" | "error" | undefined`.
   - **Why it matters:** The branch is not typecheck-clean. That blocks a standard production-readiness gate and makes future regressions harder to trust.
   - **How to fix:**
     - Change the spawn-options type to a compatible type such as `SpawnOptions` (or otherwise widen/narrow the type so `stdio: ["ignore","pipe","pipe"]` is valid).
     - Type `level` as `"info" | "warning" | "error"` in the local notify wrapper.

2. **Async command path reports “started” before validating the request**
   - **Reference:** `agent/extensions/generate-plan/index.ts:490-500`
   - **What is wrong:** In async mode, the handler immediately returns success and only then performs `parseInputFn(input, cwd)` inside the detached task.
   - **Why it matters:** A bad file path or malformed request produces a misleading `Plan generation started in background...` success notification followed by a later error. That is confusing for users and poor operational behavior for a command intended to be reliable.
   - **How to fix:** Validate/classify the input before returning the async-start success message. Ideally also do fast existence checks for file/todo inputs before backgrounding the run.

## Recommendations

- Add a regression test for the data-loss case:
  - existing plan present
  - generation/repair dispatch fails or writes elsewhere
  - previous plan content remains intact
- Add async command tests for:
  - invalid file path with `--async`
  - invalid todo with `--async`
  - ensuring no false `started` success is emitted before validation
- After fixing the generate-plan-specific type errors, rerun `cd agent && npm run typecheck` and then clear the remaining pre-existing non-generate-plan typecheck failures before merge.

## Assessment

- **Ready to merge?** No
- **Reasoning:** The main generate-plan flow is well-implemented and heavily tested, but there is one production-grade data-loss risk in `engine.ts` and the current branch is not typecheck-clean. Tests are green, but those two issues are enough to block merge readiness.
