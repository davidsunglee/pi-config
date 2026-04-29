# Review: Execute-Plan Extension Plan (Review 4)

**Reviewer:** Claude (Opus 4.6)
**Date:** 2026-04-10
**Plan:** `.pi/plans/2026-04-10-execute-plan-extension.md`
**Prior reviews:** Initial (Issues Found), Follow-up (Approved), Review 2 (3 Warnings, 3 Info), Review 3 (3 Warnings, 4 Info)

---

## Overall Assessment

The plan is mature. Four review rounds have resolved the original structural errors (missing retry state, missing code review data flow, plan-reviewer scope, dependency graph). The additions since Review 3 — test files for Tasks 18 and 19, atomic writes in Task 10, explicit `detectTestCommand` scope in Task 9, `onProgress` error handling in Task 21, engine error contract in Risk #1 — addressed the most impactful findings from prior reviews.

What remains are execution-risk issues, a cross-skill template reference that will likely confuse implementers, and a few gaps in test coverage at the integration boundary.

---

## Issues

### [Error] Task 6: `code-reviewer.md` template lives in a different skill directory

Task 6 says `TEMPLATE_PATHS` maps "execute-plan template types to relative paths under the agent directory" and supports three templates: `implementer-prompt.md`, `spec-reviewer.md`, `code-reviewer.md`. The first two exist in `agent/skills/execute-plan/`:

```
agent/skills/execute-plan/implementer-prompt.md
agent/skills/execute-plan/spec-reviewer.md
```

But `code-reviewer.md` lives in `agent/skills/requesting-code-review/code-reviewer.md` — a completely different skill. The plan never calls this out. An implementer reading Task 6 will reasonably assume all three templates are co-located, construct paths like `agent/skills/execute-plan/code-reviewer.md`, and get a file-not-found error.

**Recommendation:** Make the cross-skill reference explicit in Task 6. Either:
1. State the actual path for each template in the `TEMPLATE_PATHS` constant definition, or
2. Copy `code-reviewer.md` into `agent/skills/execute-plan/` as part of Task 6 (but note the maintenance coupling), or
3. Have `getTemplatePath` accept a skill-relative path rather than assuming all templates are under `execute-plan/`

### [Warning] Task 17 (IO adapter) still has no tests

Review 3 flagged the entire extension layer as untested. The plan responded by adding test files for Tasks 18 and 19. But Task 17 (`io-adapter.ts`) still has zero tests.

The IO adapter implements `ExecutionIO.exec` using `child_process.spawn`, collecting stdout/stderr and mapping the exit code. This is the kind of code that silently misbehaves: stream backpressure can truncate output, `error` events vs `exit` events have different semantics, and the `ExecResult.exitCode` naming doesn't match Node's `ChildProcess.exitCode` / close event `code`.

The core library tests exercise `ExecutionIO` through mocks, so they won't catch bugs in the real implementation. A test that spawns `echo hello` and verifies `{ stdout: "hello\n", stderr: "", exitCode: 0 }` would catch the most common spawn implementation bugs.

**Recommendation:** Add `agent/extensions/execute-plan/io-adapter.test.ts` with at least:
- (a) `exec` captures stdout, stderr, and exit code from a real process
- (b) `exec` returns non-zero exit code without throwing
- (c) `readFile` / `writeFile` round-trip through a temp directory

### [Warning] Cancellation interception mechanism unspecified

Task 20 Step 10 says `CancellationSelectionComponent` is "Shown on Ctrl+C." Task 21 Step 9 says "Listen for user interrupt. Show CancellationSelectionComponent." But neither task specifies HOW the extension intercepts Ctrl+C.

The pi extension API may provide an interrupt hook, a signal handler, or nothing at all. If the mechanism is `process.on('SIGINT', ...)`, it needs to be registered and cleaned up correctly (especially in worktrees where the process may have a different lifecycle). If it's a pi API like `ctx.onInterrupt()`, that needs to be documented.

Without this, the implementer has to either guess the mechanism or skip cancellation, which undermines the cancellation state machine designed into the engine.

**Recommendation:** Add a step to Task 21 specifying the interrupt mechanism. Check whether the pi extension API provides `ctx.onInterrupt()` or similar, and document it. If no API exists, note that `process.on('SIGINT', ...)` is the fallback and describe cleanup requirements.

### [Warning] Task 18 Step 3 references a version-specific, machine-specific path

Task 18 Step 3 says: "Read the subagent extension at `/opt/homebrew/Cellar/pi-coding-agent/0.66.0/libexec/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/subagent/index.ts`"

This path is specific to Homebrew on macOS with version 0.66.0 installed. If the pi-coding-agent is updated (the `devDependencies` already reference `^0.66.1`), or the worker runs on a machine with a different installation method, this path won't exist. The step will fail silently (the worker will skip it) or block execution.

**Recommendation:** Replace with a version-agnostic approach:
- `node -e "console.log(require.resolve('@mariozechner/pi-coding-agent/package.json'))"` to find the installed package root, or
- Reference the npm package contents by module path rather than filesystem path, or
- Extract the relevant pattern into a brief description in the task steps so the worker doesn't need to read the external file at all

### [Info] Tasks 6 and 11 have an unnecessary dependency on Task 2

Review 3 noted this. The plan didn't change. Task 6 (template filler) takes `Plan` objects from Task 1's types — it never calls `parsePlan()` from Task 2. Task 11 (plan lifecycle) similarly takes `Plan` objects directly and manipulates files.

Both tasks could use constructed `Plan` objects in tests without needing Task 2. Removing the dependency would move them from Wave 3 to Wave 2, shortening the critical path by eliminating one wave level.

The dependency graph currently shows:
```
- Task 6 depends on: Task 1    (NOT Task 2)
- Task 11 depends on: Task 1   (NOT Task 2)
```

Wait — looking again at the actual dependency section, Tasks 6 and 11 *don't* list Task 2 as a dependency. They only depend on Task 1. So this was already fixed. This is correct as-is. (Disregard — prior reviews referenced an older version of the plan.)

### [Info] Wave sub-wave splitting semantics need clarification

Task 3 says "Split any wave >7 tasks into sequential sub-waves of ≤7." The dependency graph shows Wave 2 has 13 tasks (Tasks 2-5, 7-10, 12, 13, 18, 19, 20). When splitting 13 tasks into sub-waves of 7 and 6:

- Are the sub-waves truly sequential (sub-wave B waits for sub-wave A to complete)?
- Or is it just a concurrency limit (run 7 at a time, then 6, but they're logically the same wave)?

The distinction matters for:
- Commit timing: Does each sub-wave get its own commit, or one commit after all sub-wave tasks complete?
- Test running: Are tests run between sub-waves?
- State persistence: Is a sub-wave a distinct `WaveState` entry?

**Recommendation:** Clarify in Task 3 whether sub-waves are purely a concurrency limit within one logical wave (one commit, one test run) or separate waves with full lifecycle (separate commits, separate tests). The former seems intended but should be explicit.

### [Info] `closeTodo` reimplements private parsing logic from `todos.ts`

Review 2 flagged this. The plan chose to reimplement rather than extract shared utilities, with a round-trip compatibility test (Task 11 Step 5) and a source comment as mitigations. This is an acceptable trade-off, but note:

- `findJsonObjectEnd`, `splitFrontMatter`, and `parseFrontMatter` are all private to `todos.ts` (~60 lines of parsing logic)
- `closeTodo` will reimplement ~40 lines of this
- If `todos.ts` adds a field or changes serialization order, the round-trip test catches it — but only if someone runs the execute-plan tests after changing todos.ts

The existing mitigations (round-trip test + source comment) are adequate for now but create a maintenance burden. If the todo format changes frequently, consider extracting to a shared module in a follow-up.

### [Info] SKILL.md line count is understated

The plan says "Replace the 300-line prose SKILL.md" but the actual file is 523 lines. This doesn't affect implementation but sets incorrect expectations for the scope of what's being replaced.

---

## Design Observations (not issues)

### Prior review findings are thoroughly addressed

Comparing the current plan against all prior review findings:

| Finding | Status |
|---------|--------|
| Retry state not persisted (Review 1 Error) | Fixed: `RetryState` in types, state-manager tests, engine consumes on resume |
| No code review data flow to TUI (Review 1 Error) | Fixed: `code_review_completed` progress event, `CodeReviewSummary` type |
| `plan-reviewer.md` dead scope (Review 1 Error) | Fixed: removed from execute-plan scope |
| Task 15 too large (Review 1 Warning) | Fixed: split into Tasks 15 and 16 |
| Extension layer untested (Review 3 Warning) | Partially fixed: tests added for Tasks 18, 19; Tasks 17, 21 still untested |
| `detectTestCommand` unspecified (Reviews 2, 3) | Fixed: 5 project types listed explicitly |
| Atomic writes missing from Task 10 (Reviews 2, 3) | Fixed: `writeStateAtomic` in Task 10 Step 3 |
| `onProgress` errors silently dropped (Review 3) | Fixed: try/catch in Task 21, Risk #11 |
| No error handling strategy (Review 3) | Fixed: try/finally contract in Task 15, Risk #1 |

### The three-layer architecture is clean

Core library with no pi imports → Extension as thin adapter → Thin skill pointing to extension. The `ExecutionIO` / `EngineCallbacks` interfaces create a testable boundary. The engine is fully unit-testable with mock I/O.

### The `updateState` updater pattern is the right abstraction

The general `updateState(io, cwd, planName, updater)` approach avoids a proliferation of setter methods while keeping state mutations explicit and testable. The explicit test cases for retry state, baseline, and cancellation fields provide good coverage.

---

## Summary

| Category | Count |
|----------|-------|
| Errors | 1 |
| Warnings | 3 |
| Info | 4 |

The plan is architecturally sound and has been refined through 4 review rounds. The one error (code-reviewer template cross-skill path) will cause a file-not-found failure during Task 6 implementation unless the template path is made explicit. The warnings (missing IO adapter tests, unspecified cancellation mechanism, version-pinned reference path) are execution risks that could cause worker failures during autonomous execution but are recoverable. The info items are minor improvements.

**Verdict:** Fixable. Address the template path error and the cancellation mechanism warning before execution. The other items can be handled during implementation.

---

## Post-Review Fixes Applied

All errors and warnings from this review were addressed in the plan:

1. **[Error] code-reviewer.md template path** — Fixed in Task 6 Step 3: `TEMPLATE_PATHS` now lists explicit skill-relative paths for all 3 templates, noting that `code-reviewer.md` lives under `skills/requesting-code-review/`, not `skills/execute-plan/`.

2. **[Warning] Task 17 missing tests** — Fixed: Added `io-adapter.test.ts` to both the File Structure section and Task 17. Tests cover `exec` stdout/stderr/exitCode capture (including Node's `code` → `exitCode` mapping), file operation round-trips via temp directory, and dispatch delegation. Model recommendation bumped from `cheap` to `standard`.

3. **[Warning] Cancellation interception unspecified** — Fixed in Task 20 Step 10 and Task 21 Step 9: Cancellation uses `ctx.ui.onTerminalInput()` to intercept Ctrl+C (`\x03`), consumes the input, shows `CancellationSelectionComponent`, and calls `engine.requestCancellation()`. The unsubscribe function is stored and called during cleanup.

4. **[Warning] Task 18 hardcoded brew path** — Fixed in Task 18 Step 3: Replaced version-specific `/opt/homebrew/Cellar/...` path with `node -e "console.log(require.resolve('@mariozechner/pi-coding-agent/package.json'))"` for dynamic package root discovery.
