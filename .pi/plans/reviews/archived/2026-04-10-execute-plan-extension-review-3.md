# Review: Execute-Plan Extension Plan (Review 3)

**Reviewer:** Claude (Opus 4.6)
**Date:** 2026-04-10
**Plan:** `.pi/plans/2026-04-10-execute-plan-extension.md`
**Prior reviews:** Initial review (Issues Found), Follow-up review (Approved), Review 2 (Approved with warnings)

---

## Overall Assessment

The plan is architecturally sound. The three-layer split (core library, pi extension, thin skill) is well-motivated, the `ExecutionIO` abstraction is clean, the `WorkspaceChoice` / `WorkspaceInfo` split fixes a real prior design flaw, and the "code orchestrates; agents judge" principle is applied consistently. The prior review errors (retry state, code review data flow, plan-reviewer scope) were all addressed.

That said, there are several execution-risk and structural issues that prior reviews either flagged but weren't fixed, or missed entirely. The biggest concern is that **four of the six extension-layer modules (Tasks 17, 18, 19, 21) have zero tests**, and these contain the most integration-sensitive code in the plan.

---

## Issues

### [Warning] Tasks 17, 18, 19, and 21 have no tests — the entire extension layer is untested

| Task | Module | What it does | Tests? |
|------|--------|-------------|--------|
| 17 | io-adapter.ts | Implements `ExecutionIO` via Node.js `fs` and `child_process.spawn` | None |
| 18 | subagent-dispatch.ts | Process spawning, JSON stream parsing, abort/kill, agent config resolution | None |
| 19 | judgment.ts | Promise lifecycle, timeout, global tool registration, resolver wiring | None |
| 21 | index.ts | Wires engine, IO, TUI, judgment bridge, callbacks — the integration point | None |

The core library has excellent test coverage (13 test files across 13 modules). But the extension layer — which does process management, stream parsing, timeout handling, and the full integration wiring — has exactly one test file (`tui-formatters.test.ts`), and that covers only pure data-transformation helpers.

This matters because:
- `child_process.spawn` has well-known subtleties (stream backpressure, error vs. exit events, SIGTERM vs. SIGKILL timing)
- JSON stream parsing is fragile (partial chunks, multiple events per chunk, encoding issues)
- The judgment bridge's Promise/timeout lifecycle is the kind of code that breaks silently in edge cases
- Task 21 is where all the layers meet — callback wiring bugs won't be caught until manual testing

**Recommendation:** At minimum, add test files for Tasks 18 and 19:
- `subagent-dispatch.test.ts` — test `parseWorkerResponse` (pure function, easy to test), and verify `dispatchWorker` handles abort signal correctly with a mock process
- `judgment.test.ts` — test the bridge's Promise resolution, timeout, stale resolver rejection, and concurrent request handling

Tasks 17 and 21 are harder to unit test (heavy I/O, full integration), but even a few smoke tests would catch wiring bugs that currently have zero automated coverage.

### [Warning] `detectTestCommand` auto-detection scope is unspecified (carried from Review 2)

Review 2 flagged this as [Info]: Task 9's acceptance criteria say "covers all 5 project types" but the plan never lists which 5 project types. This is still unspecified. The implementer will have to guess or reverse-engineer the existing SKILL.md.

**Recommendation:** List the project types explicitly in Task 9's steps. Based on the tech stack and common conventions: npm/package.json, Cargo.toml, go.mod, pytest/setup.py, Makefile. Or whatever the actual 5 are — the plan should say.

### [Warning] Atomic file writes described in Risk #8 but absent from Task 10 steps (carried from Review 2)

Risk #8 says "write to temp file then rename (atomic on most filesystems)" but Task 10's implementation steps don't mention this pattern. The state manager uses `io.writeFile()` directly. If the implementer doesn't read the Risk Assessment (they probably won't — it's 180+ lines down from Task 10), they'll write directly to the state file, and a crash during write will corrupt it.

**Recommendation:** Add an explicit step to Task 10: "Implement `writeStateAtomic(io, path, content)` that writes to `path + '.tmp'` then renames." Or, accept that this is a minor risk and remove the claim from Risk #8 to keep the plan internally consistent.

### [Info] Task 6 and Task 11 have unnecessary dependency on Task 2

Task 6 (template filler) takes `Plan` objects from Task 1's types — it doesn't call `parsePlan()` from Task 2. Its `buildTaskContext` function accepts a `Plan` parameter directly. Similarly, Task 11 (plan lifecycle) takes `Plan` objects and manipulates files; it doesn't parse plan markdown.

Both tasks could use constructed `Plan` objects in their tests without needing Task 2. This means they could run in Wave 2 instead of Wave 3, potentially shortening the critical path when combined with other scheduling changes.

**Recommendation:** Verify whether Tasks 6 and 11 actually import from `plan-parser.ts`. If not, remove the Task 2 dependency to allow earlier scheduling.

### [Info] The combined engine.ts will be very large

Even split across Tasks 15 and 16, the final `engine.ts` will contain:
- Startup sequence (parse, settings, lock, resume, workspace, baseline, SHA)
- Wave execution loop with TaskQueue integration
- 6-branch JudgmentResponse handling
- Spec review dispatch
- Final code review dispatch and parsing
- Cancellation state machine
- Resume logic with retry state consumption
- Plan completion

Conservatively, this is 500-700 lines of implementation plus 800+ lines of tests. The `engine.test.ts` file will have 30+ distinct test cases (a through dd in Task 15 alone, plus a through q in Task 16).

This isn't necessarily wrong — the engine *is* the central module — but it's worth acknowledging that:
- A `capable`-tier model will need to hold a lot of context to implement Task 16 correctly (it must understand Task 15's code and extend it)
- If the engine tests are flaky or slow, they block all downstream tasks
- Debugging a test failure in a 30-case file is harder than in smaller, focused files

**No action required**, but consider whether private methods like the cancellation state machine or retry logic could be extracted into small helper modules (not tasks — just files) if the engine gets unwieldy during implementation.

### [Info] No error handling strategy for infrastructure failures

The plan thoroughly covers application-level failures (BLOCKED, DONE_WITH_CONCERNS, test regressions, spec review failures). But it's silent on infrastructure failures:
- What if `io.readFile` throws during state read (disk error, permissions)?
- What if a git command fails unexpectedly (lock file, corrupted repo)?
- What if `child_process.spawn` fails to launch (PATH issues, binary not found)?
- What if the state file is valid JSON but has an unexpected schema (upgraded from an older version)?

The engine's try/catch in Task 21 will catch these, but the plan doesn't specify what the engine should do: retry? Persist partial state? Leave the lock? Report to user?

**Recommendation:** Add a brief section to the Risk Assessment or to Task 15's steps describing the engine's error-handling contract: "On unhandled error, release lock, persist current state, emit `execution_stopped`, re-throw." Or similar. This gives the implementer a clear rule instead of forcing them to invent one.

### [Info] `onProgress` callback failures are silently dropped

`EngineCallbacks.onProgress` is documented as "fire-and-forget. Does not block the engine." But if a TUI component throws during rendering (e.g., invalid data in a `ProgressEvent`), the error vanishes. Over time this makes debugging rendering issues nearly impossible — the engine keeps running but the UI is broken.

**Recommendation:** Add a note that the extension's `onProgress` implementation should catch and log errors rather than propagating them, so rendering bugs don't crash the engine but also don't disappear silently.

---

## Design Observations (not issues)

### The TaskQueue design is well-scoped

Single-dispatch with engine-owned concurrency via `TaskQueue` is the right call. It makes both cancellation granularities (wave-level and task-level) implementable without I/O interface changes, and the `AbortSignal` integration follows Node.js conventions. The `onProgress` passthrough from dispatch to TUI is a clean end-to-end data path.

### The judgment bridge lifecycle is sound

Registering the tool once globally and managing only Promise resolvers avoids re-registration issues. The `getResolver() => null` guard for no-active-execution is a clean boundary. The 5-minute timeout prevents infinite hangs.

### The retry state persistence design is thorough

Persisting `RetryState` with per-task, per-wave, and final-review records means resume logic has full context. The `updateState` updater pattern avoids the explosion of narrow setter methods. This directly addresses the original review's Error finding.

### The TUI formatter extraction was a good response to Review 2

Splitting pure data-transformation logic from rendering components means the data pipeline is testable even though the TUI itself isn't. The `formatCodeReviewSummary` grouping-by-severity logic is exactly the kind of thing that should be unit tested.

---

## Dependency Graph Validation

The dependency graph is valid. Wave assignment:

| Wave | Tasks | Notes |
|------|-------|-------|
| 1 | 1 | Types only |
| 2 | 2, 3, 4, 5, 7, 8, 9, 10, 12, 13, 18, 19, 20 | 13 tasks → split into sub-waves of ≤7 |
| 3 | 6, 11, 16*, 17 | *Task 16 is I/O adapter, not engine Task 16 — renumbered from prior review |
| 4 | 14 | Barrel index |
| 5 | 15 | Engine startup/lifecycle |
| 6 | 16 | Engine wave execution (depends on 15) |
| 7 | 21 | Extension entry point |
| 8 | 22 | Thin skill |

Wait — the plan's numbering is:
- Task 15: Engine startup/lifecycle (depends on Task 14)
- Task 16: Engine wave execution (depends on Task 15)
- Task 17: IO adapter (depends on Tasks 1, 18)

So the actual critical path is: 1 → [2-13 parallel] → 14 → 15 → 16 → 21 → 22 = 7 waves. Task 17 resolves in Wave 3 (after Task 18 in Wave 2). This is correct. Task 16 (wave execution) is Wave 6, not Wave 5 — it depends on Task 15 which depends on Task 14.

The critical path runs through the engine and cannot be shortened without restructuring the barrel index dependency (Task 14 depends on all library modules).

---

## Summary

| Category | Count |
|----------|-------|
| Warnings | 3 |
| Info | 4 |

The plan is architecturally approved. The prior review findings were thoroughly addressed — retry state is persisted, code review findings have an explicit data path, plan-reviewer.md is out of scope, and the engine is split across two tasks.

The most impactful improvement would be **adding test files for Tasks 18 (subagent dispatch) and 19 (judgment bridge)**. These modules contain the most integration-sensitive logic in the extension layer, and they're currently the only complex modules in the entire plan with zero test coverage. The carried warnings about `detectTestCommand` scope and atomic writes are low-effort fixes that prevent implementer confusion.
