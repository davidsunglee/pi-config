# GPT-5.4 Second Full Code Review

- **Reviewer model:** `openai-codex/gpt-5.4`
- **Dispatch:** `pi`
- **Worktree:** `/Users/david/Code/pi-config/.worktrees/execute-plan-verification-and-failure-hardening`
- **Git range:** `5f29dc9e7c51d48246752ac11ee00df0058b22f1..e99281baa49719dee47f6d2d62190c4890db3264`
- **Reviewed after remediation commit:** `e99281b` — `fix(review): address GPT-5.4 follow-up findings`
- **Plan artifact:** `.pi/plans/2026-04-18-execute-plan-verification-and-failure-hardening.md`

### Strengths
- The plan-generation side is much tighter: `agent/agents/planner.md`, `agent/skills/generate-plan/review-plan-prompt.md`, and `agent/skills/generate-plan/edit-plan-prompt.md` now form a coherent contract around per-criterion `Verify:` recipes.
- The typed `DONE_WITH_CONCERNS` protocol is well aligned across `agent/agents/coder.md` and `agent/skills/execute-plan/execute-task-prompt.md`; the three concern classes are clearly defined and operationally meaningful.
- The verifier split is a solid architectural improvement. `agent/agents/verifier.md` removes shell access, keeps scope narrow, and Step 10 now clearly separates evidence collection from judgment.
- Step 10’s deterministic truncation rules and Step 11’s three-set integration model are materially stronger than the prior “trust the orchestrator / skip failures” flow.

### Issues

#### Critical (Must Fix)
- None.

#### Important (Should Fix)

1. **Stale Step 9.5 exits still route directly to Step 10**
   - **File:** `agent/skills/execute-plan/SKILL.md:437,511`
   - **What’s wrong:** Step 9.5 still says “skip this entire step and proceed to Step 10” when `BLOCKED_TASKS` is empty, and its exit text says the wave is “eligible for Step 10.” That is now inconsistent with the new Step 9.7 gate.
   - **Why it matters:** In the common case of a wave with `DONE_WITH_CONCERNS` but no `BLOCKED` task, these instructions can bypass the combined concerns checkpoint entirely. Step 10’s precondition partially compensates, but the workflow is contradictory in a core control-flow path.
   - **How to fix:** Update both Step 9.5 references so the post-9.5 path is explicitly `Step 9.7 -> Step 10`, never direct to Step 10.

2. **Step 12 drops the required retry-budget reset after user-selected “Retry again”**
   - **File:** `agent/skills/execute-plan/SKILL.md:818-822`
   - **What’s wrong:** After the automatic 3 retries are exhausted, Step 12 offers “Retry again” but no longer states that this choice resets the per-task 3-retry budget.
   - **Why it matters:** The retry state becomes ambiguous. A task can immediately re-hit the exhausted-budget branch on the next failure instead of getting a fresh retry window, which breaks the intended remediation loop from the plan.
   - **How to fix:** Restore the explicit “Retry again … This resets the per-task 3-retry budget for that task” rule and clarify how that reset interacts with the shared counter described in Step 12.1.

3. **The Step 15 final gate no longer matches the approved deferred-regression contract**
   - **File:** `agent/skills/execute-plan/SKILL.md:880,896-924`
   - **What’s wrong:** The gate is skipped whenever `deferred_integration_regressions` is empty at Step 15 start, even if regressions were deferred earlier in the run and later auto-cleared. And when it does run, it blocks on both `still_failing_deferred` and newly discovered `new_regressions_after_deferment`, whereas the plan explicitly scoped this gate to `still_failing_deferred`.
   - **Why it matters:** This changes the final-completion semantics in two directions: it can skip the promised final reconciliation/retest after prior deferments, and it can also stop completion on brand-new final-gate failures that the plan did not route through this gate. That is both a requirements miss and a workflow-behavior change.
   - **How to fix:** Make Step 15 run whenever deferment occurred at any point in the run, always re-run the suite, reconcile the deferred set, compute `still_failing_deferred`, and gate only on that subset. If final-gate “new regressions” should also block completion, update the authoritative plan first.

#### Minor (Nice to Have)

1. **README still describes a five-agent system and omits the verifier agent**
   - **File:** `README.md:22,149,472`
   - **What’s wrong:** The README still says there are five local/specialized subagents, but `agent/agents/` now contains six files, and there is no dedicated `verifier` entry in the Local subagents section.
   - **Why it matters:** Documentation is now inaccurate and understates the role of the new verifier flow that this branch introduced.
   - **How to fix:** Update the counts to six and add a short `agent/agents/verifier.md` subsection.

### Recommendations
- Add a lightweight contract check for these workflow artifacts. The regressions above are text/protocol inconsistencies that a simple linter or snapshot test could catch:
  - step ordering invariants (`9.5 -> 9.7 -> 10`)
  - required section names (`## Concerns / Needs / Blocker`)
  - agent counts in `README.md`
  - retry-budget semantics in Step 12
  - final-gate wording in Step 15
- Because these changes are markdown-only workflow contracts, automated contract tests would add more value here than conventional unit tests.

### Assessment

**Ready to merge: With fixes**

**Reasoning:** The branch substantially improves the generate-plan/execute-plan architecture, but there are still a few workflow-contract regressions in `SKILL.md` plus stale README documentation. The Step 9.5, Step 12, and Step 15 issues should be corrected before relying on this flow in production.
