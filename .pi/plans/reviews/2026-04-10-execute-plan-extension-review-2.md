# Review: Execute-Plan Extension Plan

**Reviewer:** Claude  
**Date:** 2026-04-10  
**Plan:** `.pi/plans/2026-04-10-execute-plan-extension.md`  
**Prior reviews:** Initial review (Issues Found), Follow-up review (Approved)

---

## Overall Assessment

The plan is well-structured and addresses all prior review findings cleanly. The three-layer architecture (core library, pi extension, thin skill) is sound, the type contracts are precise, and the "code orchestrates; agents judge" principle is applied consistently. The dependency graph is valid and the wave structure is reasonable.

That said, there are several concerns — mostly around implementation risk, testability strategy, and a few design choices that may cause friction during execution.

---

## Issues

### [Warning] Task 15 remains a monolith despite prior review flagging this

The original review called this out as a warning. The plan kept it as a single task. Task 15 asks one worker to implement:

- Full engine lifecycle (parse, settings, lock, resume, workspace, baseline, pre-execution SHA)
- Wave dispatch loop with TaskQueue integration
- All 6 JudgmentResponse branches with retry/skip/stop/provide_context/accept/escalate
- Spec review dispatch and retry path
- Final code review dispatch, CodeReviewSummary parsing, and progress emission
- Cancellation state machine (both granularities)
- Resume from persisted retryState
- Plan completion (move to done, close todo, delete state)
- 30 distinct test cases (a through dd)

This is the highest-complexity module in the plan, and it's assigned to a single worker with `capable` model recommendation. The test file alone will likely be 500+ lines. If the worker produces a partial or buggy implementation, the retry scope is the entire engine — there's no way to retry just the cancellation logic or just the resume path.

**Recommendation:** Split into at least two tasks:
- **15a:** Engine startup, resume, workspace setup, state lifecycle, locking, baseline, pre-execution SHA (tests a-m, bb, dd)
- **15b:** Wave execution loop, dispatch, JudgmentResponse handling, spec review, final code review, cancellation (tests n-aa, cc)

This reduces blast radius on retry and lets the two tasks run in separate waves if 15a's dependency set differs.

### [Warning] Task 19 (TUI) is also large — 9 components, no tests

Task 19 creates 9 distinct TUI components in a single file with no test file. The components span very different interaction patterns:

- `SettingsConfirmationComponent` — multi-mode (display/customize/input)
- `WaveProgressWidget` — real-time widget via `setWidget`
- `ReviewSummaryComponent` — rich Markdown rendering with overlay
- `CancellationSelectionComponent` — interrupt handler

These are difficult to test via unit tests (TUI rendering), but there's no validation strategy described. If a component has a rendering bug or interaction issue, the only way to catch it is manual testing after the full extension is wired up in Task 20.

**Recommendation:** At minimum, extract the data-transformation logic from TUI components (e.g., formatting CodeReviewSummary into displayable sections, mapping ExecutionSettings to grid rows) into pure functions that *can* be unit tested. The rendering itself can remain untested, but the data pipeline into it shouldn't be.

### [Warning] `closeTodo` in plan-lifecycle.ts reimplements todo format parsing

Task 11 says `closeTodo` "directly manipulates the todo file's JSON frontmatter (same format as `todos.ts`)." The existing `todos.ts` extension already handles todo CRUD. Reimplementing the frontmatter parsing/serialization creates a coupling to an undocumented format — if `todos.ts` changes how it writes frontmatter (e.g., adds fields, changes delimiters), `closeTodo` silently diverges.

**Recommendation:** Either:
1. Import the parsing/serialization helpers from the todos extension (if they're exported), or
2. Document the exact format contract in a shared location and test round-trip compatibility, or
3. Accept the risk but add a comment in `closeTodo` pointing to the canonical format in `todos.ts`

### [Info] `--allow-empty` commits may confuse downstream tooling

Task 7 mandates `--allow-empty` for wave commits, and the plan acknowledges this in Risk #7 ("can be squashed during branch completion"). This is fine for the execute-plan workflow, but be aware that:

- `git log --diff-filter` won't find these commits
- Some PR review tools skip empty commits
- The `finishing-a-development-branch` skill should be aware of this pattern

No action needed, but worth a note in the skill or engine docs.

### [Info] `detectTestCommand` auto-detection scope is unspecified

Task 9 says `detectTestCommand` "auto-detects from project files" and acceptance criteria say "covers all 5 project types" — but the plan never lists which 5 project types. The implementer will have to guess or read the existing SKILL.md for context.

**Recommendation:** List the project types explicitly in Task 9's steps (e.g., npm/package.json, cargo, go, python/pytest, make).

### [Info] Atomic file writes not specified in state-manager

Risk #8 mentions "write to temp file then rename (atomic on most filesystems)" for state file corruption protection, but the actual Task 10 steps don't mention this pattern. The implementer may just use `io.writeFile()` directly.

**Recommendation:** Add a step or note in Task 10 to implement write-then-rename via `io.writeFile(tmpPath) + io.rename(tmpPath, finalPath)`.

---

## Design Observations (not issues)

### The ExecutionIO interface is well-scoped

Single-dispatch with `AbortSignal` and `onProgress` callback is the right call. It keeps the I/O boundary simple and pushes concurrency concerns into the `TaskQueue` where they're testable. The prior plan's bulk `dispatchSubagents` would have made cancellation much harder.

### The WorkspaceChoice / WorkspaceInfo split is clean

Returning a *choice* from the callback and having the engine create the worktree eliminates a subtle timing bug. The `isWorktreeDirectoryIgnored` check before creation is a good safety net.

### The judgment tool lifecycle is sound

Registering once globally and managing only Promise resolvers avoids the re-registration anti-pattern. The timeout on pending judgments prevents infinite hangs. The `getResolver() => null` path for no-active-execution is a clean error boundary.

### The general `updateState` pattern is appropriate

The updater-function approach for state mutations is well-proven (React, Redux). It avoids the explosion of narrow setter methods that the prior plan would have required. The explicit test cases for each field type (retry, baseline, cancellation) are good.

---

## Dependency Graph Validation

The dependency graph is valid. A few observations:

- **Wave 1:** Task 1 (types only, no deps)
- **Wave 2:** Tasks 2-5, 7-10, 12-13, 17-19 (all depend only on Task 1) — this is 12 tasks, which will be split into sub-waves of ≤7
- **Wave 3:** Tasks 6, 11 (depend on Task 1 + Task 2)
- **Wave 4:** Task 14 (barrel, depends on everything in waves 1-3)
- **Wave 5:** Task 15 (engine, depends on Task 14) and Task 16 (I/O adapter, depends on Task 1 + Task 17)
- **Wave 6:** Task 20 (extension entry point, depends on 15-19)
- **Wave 7:** Task 21 (thin skill, depends on Task 20)

Task 16 depends on Tasks 1 and 17. Since Task 17 is in Wave 2, Task 16 lands in Wave 3 (not Wave 5 as I initially thought — it can run alongside Tasks 6 and 11). This is correct.

Task 15 is correctly the critical path bottleneck. Splitting it (per my recommendation above) would not change the critical path length but would reduce risk on that path.

---

## Summary

| Category | Count |
|----------|-------|
| Warnings | 3 |
| Info | 3 |

The plan is approved from an architecture standpoint. The prior review's findings were addressed thoroughly. The remaining concerns are execution-risk issues (Task 15 size, Task 19 testability, todo format coupling) that could cause friction during autonomous execution but don't represent architectural flaws. The most impactful change would be splitting Task 15.
