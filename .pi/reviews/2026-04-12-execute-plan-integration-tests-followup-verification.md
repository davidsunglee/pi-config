### Verification summary

I inspected:
- `.pi/reviews/2026-04-12-execute-plan-integration-tests-review.md`
- `agent/lib/execute-plan/engine.integration.test.ts`
- `agent/lib/execute-plan/engine.test-helpers.ts`
- `agent/lib/execute-plan/engine.test.ts`
- `agent/lib/execute-plan/engine.ts` and `agent/lib/execute-plan/state-manager.ts` as needed to confirm what the integration tests are actually exercising

I also ran:
- `cd agent && node --experimental-strip-types --test lib/execute-plan/engine.integration.test.ts`
- `cd agent && npm test`

Both commands passed on `feat/execute-plan-integration-tests`.

Status of the 4 requested follow-up items:
1. **spec-review failure → wave retry coverage** — **implemented**
2. **final-review retry / fix-up / re-review integration coverage** — **implemented**
3. **tighter Scenario 5 assertions (regression retry/skip) including stronger rollback / rerun verification** — **partially implemented**
4. **resume-validation mismatch scenarios** — **implemented**

Overall verdict: the integration suite has **meaningfully improved**. The biggest missing piece from the requested list is that Scenario 5 is stronger now, but still does not fully assert the retry-path rerun count / rollback effects as tightly as it could.

### Implemented improvements

1. **spec-review failure → wave retry coverage — implemented**
   - Added in `agent/lib/execute-plan/engine.integration.test.ts:712-824` (Scenario **2d**).
   - The test at `:713` drives a failing `spec-reviewer` result on the first review of task 1, returns `requestJudgment({ type: "spec_review_failed" }) => { action: "retry" }`, and then verifies the wave is retried.
   - The assertions are meaningful for the integration path:
     - `spec_review_failed` judgment was requested (`:783-789`)
     - implementer for task 1 ran again (`:795-797`)
     - spec reviewer for task 1 ran again (`:801-803`)
     - task 1 emitted `task_started` twice (`:819-823`)
   - This matches the retry branch in `agent/lib/execute-plan/engine.ts:745-768`, where a spec-review failure causes wave retry handling inside `executeWaveWithRetry()`.

2. **final-review retry / fix-up / re-review integration coverage — implemented**
   - Added in `agent/lib/execute-plan/engine.integration.test.ts:829-1013` (Scenario **2e**).
   - The test at `:830` scripts:
     - first `code-reviewer` pass returning findings
     - `requestJudgment({ type: "code_review" }) => { action: "retry", context: ... }`
     - a fix-up `implementer` dispatch with `taskNumber: 0`
     - a second `code-reviewer` pass returning a clean review
   - Strong assertions now verify:
     - code reviewer dispatched twice (`:949-951`)
     - fix-up subagent dispatched exactly once (`:956-958`)
     - fix-up prompt contains the review findings and judgment context (`:960-973`)
     - two `code_review` judgments were requested (`:976-990`)
     - two `code_review_completed` progress events fired (`:993-995`)
     - dispatch ordering is review → fix-up → re-review (`:997-1011`)
   - This corresponds directly to the loop in `agent/lib/execute-plan/engine.ts:1333-1420`.

3. **Scenario 5 regression retry/skip assertions — partially implemented**
   - `agent/lib/execute-plan/engine.integration.test.ts:1253-1415` is clearly stronger than the reviewed version.
   - Improvements now present:
     - shared helper records test-command call counts and all exec calls (`:1254-1289`)
     - retry path asserts regression callback context, redispatch of task 1, and verifies `git reset --hard HEAD~1` happened (`:1325-1346`)
     - skip path asserts no redispatch of task 1, **exactly** 3 test-command executions, **no** reset call, and that wave 2 still starts (`:1387-1410`)
   - This meaningfully improves coverage of the `engine.ts:794-806` regression-retry branch.
   - However it is still only **partial** against the review request because the retry-path rerun assertion remains loose:
     - it checks `getTestCallCount() >= 3` at `:1337-1339`, not the expected exact sequence/count for baseline + failing wave + rerun + later wave
   - So rollback verification is improved, and skip-path rerun verification is tight, but retry-path rerun verification is not yet fully tightened.

4. **resume-validation mismatch scenarios — implemented**
   - Added in `agent/lib/execute-plan/engine.integration.test.ts:1674-1795` (Scenario **6e-6g**).
   - The new helper `makeStoppedState()` at `:1674-1704` builds resume fixtures, and the tests now explicitly cover:
     - missing workspace path (`:1706-1731`)
     - branch mismatch (`:1734-1763`)
     - SHA mismatch (`:1766-1795`)
   - Each test verifies both:
     - `engine.execute()` rejects with a descriptive resume error
     - the saved state remains unlocked (`lock === null`) after the failed resume validation
   - This is the right integration seam for `agent/lib/execute-plan/engine.ts:341-349`, which invokes `validateResume(...)` before proceeding, and for `agent/lib/execute-plan/state-manager.ts:251-292`, which performs the workspace / branch / SHA checks.

Related unit-test support remains present in `agent/lib/execute-plan/engine.test.ts`, especially:
- wave retry persistence: `:1206-1289`
- final-review retry state / fix-up sequencing: `:1392-1474`
- regression reset + wave retry persistence: `:1807-1881`

That means the integration suite is now filling the previously identified orchestration gaps rather than relying only on unit coverage.

### Remaining gaps

1. **Item 3 is not fully closed.**
   - In Scenario 5 retry (`agent/lib/execute-plan/engine.integration.test.ts:1291-1350`), the test still does **not** assert the exact retry-path test-run count; it only checks `>= 3` at `:1338-1339`.
   - The original review specifically called for exact rerun-count verification. The skip path now does that (`:1396-1398`), but the retry path does not.

2. **Rollback semantics are still only partially observable because the helper layer is synthetic.**
   - `agent/lib/execute-plan/engine.test-helpers.ts:112-140` still uses a fake IO layer with:
     - constant `git rev-parse HEAD` output (`:126-128`)
     - default `npm test` success (`:138-140`)
   - So even with the new `git reset --hard HEAD~1` assertion, the integration suite still does not prove real SHA movement or real git-state restoration.

3. **The new integration tests do not add persistence assertions for some retry states, even though unit tests cover them.**
   - For example, Scenario 2d proves spec-review retry orchestration, but does not assert `retryState.waves` persistence in the integration file.
   - Scenario 2e proves fix-up/re-review orchestration, but does not assert `retryState.finalReview` persistence in the integration file.
   - I do **not** consider these blockers for the requested follow-up items, because `engine.test.ts:1206-1289` and `:1392-1474` already cover those state-persistence details. But they are still a reason the integration suite remains orchestration-focused rather than fully state-contract-complete.

### Confidence after changes

Confidence is **higher than in the original review**.

Why it improved:
- the suite now covers the two biggest missing orchestration branches:
  - spec-review failure causing a wave retry
  - final-review failure causing fix-up and re-review
- resume validation now has explicit mismatch-path coverage instead of only happy-path / cancel / restart handling
- Scenario 5 now verifies actual rollback invocation on retry and no rollback on skip

Why confidence is still bounded:
- `engine.test-helpers.ts` still provides a fake filesystem / fake git / fake test environment, so these remain engine-orchestration integration tests, not realistic git/worktree end-to-end tests
- Scenario 5 retry still stops short of exact rerun-count verification

**Final confidence call:** the suite is now a **meaningfully better engine-level integration suite**, with **3 of the 4 requested high-priority items implemented and the remaining one partially implemented**. It should catch more real orchestration regressions than before, but it still does not fully validate real git-state behavior.
