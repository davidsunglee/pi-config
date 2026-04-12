### Overall assessment
These tests are **meaningful engine-level orchestration tests**, not just filename smoke tests. They execute `PlanExecutionEngine.execute()` end-to-end through plan parsing, wave computation, state transitions, callbacks, and lifecycle cleanup using a realistic 3-task/2-wave fixture in `agent/lib/execute-plan/engine.integration.test.ts`.

That said, they are still heavily bounded by the same fake seams as the unit suite: `createMockIO()` in `agent/lib/execute-plan/engine.test-helpers.ts:112` makes git/test/fs behavior mostly synthetic, and every subagent result is injected. So this suite is best understood as **integration of engine.ts with its internal collaborators**, not integration with real git, filesystem, or pi subagent execution.

**Bottom-line verdict: moderate confidence.**

The suite should catch a fair number of control-flow/orchestration regressions inside `agent/lib/execute-plan/engine.ts`, but it does **not** provide strong confidence for real-world git/test/worktree behavior or concurrency bugs.

### What these tests meaningfully cover
- **Fresh multi-wave lifecycle**: Scenario 1 (`engine.integration.test.ts:200`) is the strongest test in the file. It verifies a full fresh run over a real parsed markdown plan, checks wave sequencing, final review, plan move to `.pi/plans/done/`, todo closure, and state cleanup.
- **Task judgment plumbing across real wave boundaries**: Scenario 2 (`:348`), plus `2b` (`:558`), exercises `BLOCKED`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, retry exhaustion, and retry-state persistence through the actual `execute()` path rather than isolated helper calls.
- **Optional lifecycle branches**:
  - `specCheck` success path (`:639`) verifies implementer + spec-reviewer dispatching within the same run.
  - integration-test regression retry/skip (`:935`) verifies post-wave regression handling branches.
- **Stop/resume lifecycle**:
  - cancellation after wave completion and mid-wave/task (`:712`) verifies stopped-state persistence and no partial-wave commit.
  - resume continue/restart (`:831`, `:1240`) verifies skipped completed waves and reuse/discard of persisted settings.
- **Precondition handling**: Scenario 6 (`:1070`) covers resume cancel, main-branch cancel, active repo lock, and restart behavior.

In short: the suite does cover the main **functional lifecycle** of execute-plan orchestration: start → waves → judgment/retry → optional review/test hooks → stop/resume → completion cleanup.

### Gaps / weaknesses
- **Overmocked external world**: `createMockIO()` (`engine.test-helpers.ts:112`) returns a constant HEAD SHA, treats most `exec` calls as success, no-ops `mkdir`, and uses a map-backed fake FS. That means the suite does not really validate:
  - git commit/reset semantics,
  - HEAD movement across wave commits,
  - worktree creation/removal realism,
  - shell/test command quoting or environment behavior.
- **Regression tests are weaker than they look**: Scenario 5 checks callback invocation and redispatch counts, but not the most important mechanics of rollback/retest. For example, it does not assert `resetWaveCommit()` behavior, new SHA behavior, or exact test rerun counts. Notably, `getTestCallCount()` is prepared in `engine.integration.test.ts:942` but never asserted.
- **No meaningful concurrency/race coverage**: wave 2 has two tasks, but all dispatch is immediate and deterministic. This suite is unlikely to catch bugs in `TaskQueue` interleaving, cancellation timing, or partial in-flight behavior.
- **Missing high-value failure paths**:
  - spec-review failure causing a **wave retry** is not covered here, only the success path (`:639`), even though that is one of the more orchestration-heavy branches in `engine.ts:745`.
  - final code review **retry/fix-up/re-review** is not covered in the integration suite, only final-review happy path (`:200`).
  - resume validation mismatch cases (workspace missing / branch changed / SHA changed) are not covered.
- **Some implementation coupling**: several assertions are against internal persisted state shape (`retryState.tasks`, `lock`, wave entries) and exact progress event sequencing. That is acceptable for engine contract tests, but it means the suite is not especially black-box.
- **Same mock foundation as unit tests**: because the integration suite reuses `engine.test-helpers.ts`, it is not a truly independent oracle from the unit suite.

### Likelihood of catching real regressions
**Likely to catch:**
- wrong wave boundaries / dependency handling affecting start order,
- missing or miswired `requestJudgment` / `requestTestRegressionAction` callbacks,
- broken stop/resume state transitions,
- failure to delete or preserve state in the right lifecycle branch,
- failure to move the plan / close the linked todo on completion,
- accidental skipping of final review/spec-check dispatch in the happy path.

**Less likely to catch:**
- bugs in actual git operations (`commitWave`, `resetWaveCommit`, worktree commands),
- regressions in test-output parsing beyond the trivial mocked strings,
- prompt/model/cwd propagation bugs that still produce the same dispatch counts,
- race conditions or ordering bugs under real parallel execution,
- issues that only appear with real filesystem atomicity / rename / directory behavior.

Relative to the unit suite, the biggest incremental value is **composition**: verifying that several branches still work when stitched together in a full `execute()` run. Relative to production behavior, confidence is still only **moderate**.

Also, a non-trivial portion of the suite is redundant with existing unit coverage in `agent/lib/execute-plan/engine.test.ts`, for example:
- completion lifecycle (`engine.test.ts:521`),
- requestTestRegressionAction (`:818`) and reset behavior (`:1807`),
- task retry persistence (`:879`),
- stop/provide_context/accept branches (`:975`, `:1032`, `:1114`),
- wave retry persistence (`:1206`),
- spec-review dispatch (`:1293`),
- resume/precondition paths (`:74`, `:111`, `:335`, `:440`).

So the integration suite is most valuable where it combines those behaviors across a multi-wave run; it is less valuable where it simply replays already-unit-tested branches with the same mocks.

### Recommended next improvements
#### Highest-value next steps that are addressable **without changing the current mocking strategy**
1. **Add spec-review failure → wave retry coverage**.
   This is a high-value orchestration branch and currently only the spec-review success path is covered in `engine.integration.test.ts:639`. It can be added with the existing mock seams by injecting a failing `spec-reviewer` result and driving `requestJudgment()` to `retry`.
2. **Add final-review retry/fix-up integration coverage**.
   The unit suite covers pieces of this more directly, but the integration suite does not yet prove that a full run survives fix-up + re-review end-to-end. This is still addressable with the current mock setup by scripting code-review findings, fix-up dispatch, and a passing re-review.
3. **Tighten Scenario 5 assertions**.
   Assert exact test invocation counts and that rollback/reset actually occurred, not just that a callback fired and task 1 was redispatched. For example, assert the recorded `git reset --hard HEAD~1` exec call and exact test rerun counts.
4. **Add resume-validation mismatch scenarios**.
   Workspace missing / branch changed / SHA changed are all still testable with the current fake IO layer and would improve confidence in the stop/resume contract.
5. **Optionally prune lower-increment-value cases**.
   Scenario 6 and some individual judgment branches mostly duplicate `engine.test.ts`. If suite cost matters, some of that space could be traded for the stronger orchestration cases above.

#### Improvements that likely **do require a different or stronger mocking strategy**
1. **Add one stronger git-state integration test**.
   Use either a stateful fake git layer or a temp repo so HEAD actually changes on commit and rollback. That would materially raise confidence in the regression-retry path, which is currently under-asserted.
2. **Improve concurrency / race realism**.
   The current deterministic mock dispatch is unlikely to catch real `TaskQueue` interleaving, cancellation-timing, or partial in-flight behavior issues.
3. **Add real filesystem/worktree realism**.
   Atomic rename behavior, actual worktree creation/removal, and shell/test-command environment behavior are not meaningfully exercised by the current fake FS + fake exec setup.
