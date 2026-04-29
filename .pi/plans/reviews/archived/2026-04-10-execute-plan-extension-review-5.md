# Review: Execute-Plan Extension Plan (Review 5)

**Reviewer:** Claude (Opus 4.6)
**Date:** 2026-04-10
**Plan:** `.pi/plans/2026-04-10-execute-plan-extension.md`
**Prior reviews:** Initial (Issues Found), Follow-up (Approved), Review 2 (3W, 3I), Review 3 (3W, 4I), Review 4 (1E, 3W, 4I — all addressed)

---

## Overall Assessment

The plan has been through four rounds of review and all prior findings have been resolved. The architecture (core lib → extension adapter → thin skill) is clean, the type contracts are well-defined, and the testing strategy is comprehensive. After reading the full 1244-line plan against the current codebase, I found no blocking errors. What remains are execution-risk items and a few design observations that may matter during implementation.

---

## Issues

### [Warning] Task 11: `closeTodo` reimplements ~60 lines of private parsing from `todos.ts` without a shared extraction path

This was flagged in Reviews 2, 3, and 4 as an accepted trade-off. The mitigations (round-trip test, source comment) are good. But one thing hasn't been called out: `todos.ts` uses synchronous `readFileSync`/`readdirSync` (line 37), while `closeTodo` must use async `ExecutionIO.readFile`/`writeFile`. The brace-matching logic in `findJsonObjectEnd` is pure string processing and ports trivially, but `splitFrontMatter` calls `findJsonObjectEnd` and returns `{ frontMatter, body }` — the reimplementation needs to faithfully reproduce this split, including the blank-line separator behavior between JSON frontmatter and markdown body.

**Recommendation:** Task 11 Step 3 should call out that the reimplemented `splitFrontMatter` must handle:
- No body (file ends after the JSON object)
- Body starting immediately after JSON (no blank line — shouldn't happen, but `todos.ts` handles it)
- Multiple blank lines between JSON and body

The round-trip test in Step 5 covers the happy path but should include a case with no body content.

### [Warning] Task 15/16: Engine error handling try/finally may not cover all exit paths

The plan says `execute()` wraps the full lifecycle in try/finally that guarantees lock release and state persistence. But there's an edge case: if `createState` succeeds but `acquireLock` fails (another process acquired the lock between the check and the acquire), the engine has an orphaned state file with no lock. The try/finally would call `releaseLock` on a state with `lock: null`, which should no-op, but `deleteState` wouldn't run (since execution didn't "complete").

Similarly, if the engine is between state creation (step 8) and the first wave, and an unhandled error occurs, the try/finally should ensure the state file is cleaned up or at least marked as stopped — not left in "running" status with no lock.

**Recommendation:** Document the invariant: the try/finally begins at the point where the state file exists. Before state creation, errors should propagate without cleanup. After state creation, errors should mark state as "stopped" and release the lock. The plan's current description is close to this but doesn't distinguish the pre-state-creation failure path.

### [Warning] Task 18: `dispatchWorker` spawns processes but cleanup on abort is under-specified

The plan says AbortSignal kills the spawned process with "SIGTERM then SIGKILL after timeout." But:
1. The timeout duration isn't specified
2. On macOS, child process groups may survive SIGTERM if the worker spawned grandchild processes (e.g., the worker running `npm test` internally)
3. The pi process spawned via `getPiInvocation` may have its own signal handling

These are runtime behaviors that can't be fully tested in unit tests and may lead to zombie processes during cancellation.

**Recommendation:** Specify a concrete SIGKILL timeout (e.g., 5 seconds). Note that process group killing may be needed (`process.kill(-pid, signal)` on POSIX) if workers spawn child processes. This is an implementation detail but worth documenting as a known edge case in the risk assessment.

### [Info] Task 9: `detectTestCommand` covers 5 project types but this repo uses `node --experimental-strip-types --test`

The `package.json` test script is `node --experimental-strip-types --experimental-test-coverage --test extensions/**/*.test.ts`. `detectTestCommand` should detect this from `package.json` as `npm test`. But the plan doesn't specify exactly how npm/node detection works — does it check for a `"test"` script key in `package.json`? If so, it should handle the case where `"test"` is the default npm placeholder (`"echo \"Error: no test specified\" && exit 1"`) and not return that as a valid command.

**Recommendation:** Task 9 Step 3 should note that `detectTestCommand` returns `"npm test"` when `package.json` has a `"test"` script that is NOT the default npm placeholder.

### [Info] Task 13: Glob pattern for test discovery may not work cross-platform

The test script change to `node --experimental-strip-types --experimental-test-coverage --test extensions/**/*.test.ts lib/**/*.test.ts` relies on shell glob expansion. On some shells/platforms, if `lib/**/*.test.ts` matches zero files (before Task 2+ create test files), Node.js will receive the literal glob string and fail.

This is a non-issue during normal execution (Task 13 runs after Wave 2 creates test files), but if someone runs `npm test` before the lib tests exist, it'll fail. The current `extensions/**/*.test.ts` works because test files already exist there.

**Recommendation:** Minor, but consider noting that `npm test` will fail if run before any `lib/**/*.test.ts` files exist. An alternative is `--test 'extensions/**/*.test.ts' --test 'lib/**/*.test.ts'` with separate `--test` flags, though the behavior depends on the Node.js version.

### [Info] Task 20: Nine TUI components is a lot for one task

Task 20 creates 3 files and implements 9 distinct TUI components plus a test file. Even with formatting logic extracted to `tui-formatters.ts`, each component requires understanding pi-tui primitives, keyboard handling, and the extension context lifecycle. The model recommendation is "capable" which helps, but this is the densest task in the plan.

The risk is that a single worker implementing all 9 components may produce lower-quality later components as the context fills up. The task could be split into "formatting helpers + data-display components" (SettingsConfirmation, ResumePrompt, WaveProgress, ReviewSummary) and "interactive components" (WorktreeSetup, FailureHandler, CancellationSelection, MainBranchWarning, TestCommandInput).

**Recommendation:** Not blocking, but if Task 20 fails during execution, consider splitting it on retry rather than re-running the full task.

### [Info] Dependency graph leaves Task 6 and Task 11 correctly independent of Task 2

Review 4 confirmed this was correct after initial confusion. Verified: the dependency graph shows Task 6 and Task 11 depending only on Task 1, not Task 2. This means Wave 2 can run them in parallel with Tasks 2-5, 7-10, 12-13, 18-20. This is correct and optimal.

---

## Design Strengths

### The `ExecutionIO` / `EngineCallbacks` split is well-designed

`ExecutionIO` handles side effects (file I/O, process spawning). `EngineCallbacks` handles decisions (user prompts, judgment calls). The engine sits between them as pure orchestration logic. This makes the engine fully testable with mock I/O and mock callbacks — the test strategy in Tasks 15/16 leverages this cleanly.

### Single-dispatch with TaskQueue is better than bulk dispatch

The decision to have `dispatchSubagent` as a single-call method with the engine owning concurrency via `TaskQueue` is architecturally sound. It makes cancellation granularity ("stop after current task" vs "stop after current wave") fall out naturally from the queue's `abortAfterCurrent()` method, rather than requiring the I/O layer to understand cancellation semantics.

### The `WorkspaceChoice` → `WorkspaceInfo` split cleanly separates decision from execution

The callback returns what the user chose (branch name or "use current"), the engine creates the actual worktree. This eliminates the temporal paradox where a callback would need to return final workspace data before the workspace exists. The engine's gitignore check between choice and creation (Task 15 steps e-f) is a good safety gate.

### Atomic state writes via `writeStateAtomic`

The write-to-tmp-then-rename pattern prevents state corruption on crash. This is the correct approach for a long-running orchestration engine where state persistence is critical for resume.

### Progress event architecture supports end-to-end observability

The typed `ProgressEvent` discriminated union with `code_review_completed` carrying `CodeReviewSummary` gives the TUI everything it needs without side channels. The `onProgress` callback from `dispatchSubagent` through `TaskQueue` to the engine enables real-time worker status in the WaveProgressWidget.

---

## Summary

| Category | Count |
|----------|-------|
| Errors | 0 |
| Warnings | 3 |
| Info | 4 |

The plan is ready for execution. The three warnings are implementation-risk items that a capable worker can handle with the guidance provided — they don't require plan changes. The four info items are observations for awareness during implementation.

**Verdict: Approved.** No changes required before execution. The warnings should be noted by implementers but don't block dispatch.
