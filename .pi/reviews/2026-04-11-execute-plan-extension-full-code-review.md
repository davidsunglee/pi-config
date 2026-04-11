### Strengths
- The orchestration migration is substantial and mostly well-structured: `agent/lib/execute-plan/*` cleanly separates parser, wave computation, state/lock management, git/worktree/test ops, and engine coordination.
- Test coverage is strong in breadth for the new core library (especially `engine.test.ts`, `state-manager.test.ts`, and module-level unit tests), and many state-machine paths are covered (resume, retries, cancellation, final review, regression retry).
- The skill stub (`agent/skills/execute-plan/SKILL.md`) is appropriately thin and aligned with the "mechanical orchestration in code" goal.
- Extension wiring is generally coherent: command + tool registration, IO adapter boundary, judgment bridge/tool registration, and progress forwarding into TUI widgets.

### Issues

#### Critical (Must Fix)
1. **`escalate` judgment action is not consistently honored, violating the documented action contract**
   - **File:line:** `agent/lib/execute-plan/engine.ts:730-753`, `agent/lib/execute-plan/engine.ts:1028-1040`, `agent/lib/execute-plan/engine.ts:1085-1093`
   - **What is wrong:**
     - Wave-level `retry_exhausted` handling only treats `skip` specially; all other actions (including `escalate`) end in stop.
     - Task-level `retry_exhausted` handling only allows `skip|accept`; `escalate` is effectively treated as stop.
     - Spec-review failure path does not handle `escalate` at all (it falls through like skip/accept and execution continues).
   - **Why it matters:** The skill stub and type contract define `escalate` as "present to user via failure action". Current behavior can silently continue after failed spec review or prematurely stop without escalation, breaking expected state-machine semantics and operator control.
   - **How to fix:** In all judgment sites, add explicit `escalate` handling that calls `callbacks.requestFailureAction(...)` and maps that decision to retry/skip/stop. Add targeted tests for `escalate` in spec-review-failed and both retry-exhausted paths.

#### Important (Should Fix)
1. **Resume validation checks git state in `cwd`, not the persisted workspace path**
   - **File:line:** `agent/lib/execute-plan/engine.ts:241`, `agent/lib/execute-plan/state-manager.ts:267-271`, `agent/lib/execute-plan/state-manager.ts:281`
   - **What is wrong:** `validateResume()` runs `git rev-parse` in the passed `cwd`, and engine passes repo cwd, not `state.workspace.path`.
   - **Why it matters:** For worktree executions, resume validation can check the wrong branch/SHA and incorrectly fail (or validate the wrong environment), undermining stop/resume reliability.
   - **How to fix:** Validate branch/SHA against `state.workspace.path` (or pass explicit workspace cwd), and add a test where `cwd !== state.workspace.path`.

2. **Code review parser does not match the configured reviewer output format**
   - **File:line:** `agent/lib/execute-plan/engine.ts:101-133`, `agent/skills/requesting-code-review/code-reviewer.md` (Output Format section)
   - **What is wrong:** `parseCodeReviewOutput()` expects `## Critical` + `### finding`, but the reviewer template requires `### Issues` with `#### Critical/Important/Minor` subsections.
   - **Why it matters:** Parsed summaries can come back with empty/undercounted findings even when serious issues exist, degrading final-review decision quality and TUI summaries.
   - **How to fix:** Update parser to support template-compatible heading hierarchy (including `####` severity sections) and typical list/numbered issue entries; add parser tests using realistic output from the current template.

3. **Test command execution is not shell-safe for real-world commands**
   - **File:line:** `agent/lib/execute-plan/test-ops.ts:82`
   - **What is wrong:** Test commands are split by whitespace (`split(/\s+/)`), which breaks quoted args, env-prefix commands, pipes, and compound commands.
   - **Why it matters:** Baseline/regression checks can run the wrong command, producing false pass/fail outcomes and invalid retry behavior.
   - **How to fix:** Execute via shell (`sh -lc` / `bash -lc`) or parse commands robustly; add tests for quoted and compound commands.

4. **Headless/non-UI runs on main branch are effectively forced to cancel**
   - **File:line:** `agent/extensions/execute-plan/index.ts:260`, `agent/extensions/execute-plan/index.ts:268`
   - **What is wrong:** In non-UI mode, `requestWorktreeSetup()` defaults to current workspace and `confirmMainBranch()` always returns `false`, causing cancellation on main/master/develop.
   - **Why it matters:** `execute_plan` tool usage in non-interactive contexts is unexpectedly blocked on main branch.
   - **How to fix:** Provide a deterministic non-UI policy (e.g., proceed with warning, auto-worktree if configured, or explicit tool param to allow main).

#### Minor (Nice to Have)
1. **`resetWaveCommit()` ignores git reset failures**
   - **File:line:** `agent/lib/execute-plan/git-ops.ts:97-99`
   - **What is wrong:** Exit code is not checked; failed reset is silently ignored.
   - **Why it matters:** Regression-retry flow may proceed from a bad git state and make follow-on behavior hard to reason about.
   - **How to fix:** Validate exit code and throw a descriptive error (similar to `commitWave()`/`getHeadSha()`).

### Recommendations
- Add a focused "judgment semantics" test block covering `escalate` for every judgment request type (`blocked`, `needs_context`, `done_with_concerns`, `spec_review_failed`, `retry_exhausted`, `code_review`).
- Add one true integration-style engine test file (as described in `.pi/execute-plan-integration-test-spec.md`) to verify callback ordering and full lifecycle transitions in one run.
- Add extension-level tests for `index.ts` non-UI behavior and command/tool precondition paths.
- Align parser expectations with the canonical code-review template to avoid drift between prompting and parsing.

### Assessment
**Merge readiness verdict: Not ready to merge yet.**

The architectural direction is good and most core mechanics are implemented with strong test breadth, but there are state-machine correctness gaps around judgment handling (especially `escalate`) plus resume/workspace validation and review parsing mismatches. These should be fixed before production rollout.
