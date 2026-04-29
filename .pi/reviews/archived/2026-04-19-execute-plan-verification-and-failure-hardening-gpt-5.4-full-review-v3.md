# GPT-5.4 Third Full Code Review

- **Reviewer model:** `openai-codex/gpt-5.4`
- **Dispatch:** `pi`
- **Worktree:** `/Users/david/Code/pi-config/.worktrees/execute-plan-verification-and-failure-hardening`
- **Git range:** `5f29dc9e7c51d48246752ac11ee00df0058b22f1..9932b39a5f5600bd8b9dc7b6f2a9764c13c9e91b`
- **Reviewed after commits:**
  - `ee69c66` — `fix(review): align workflow contract follow-ups`
  - `9932b39` — `docs(reviews): add GPT-5.4 execute-plan reviews`
- **Plan artifact:** `.pi/plans/2026-04-18-execute-plan-verification-and-failure-hardening.md`

### Strengths
- The `Verify:` contract is now consistently enforced across planning and review artifacts. `agent/agents/planner.md`, `agent/skills/generate-plan/review-plan-prompt.md`, and `edit-plan-prompt.md` form a coherent fail-closed story instead of treating verification recipes as optional guidance.
- The typed `DONE_WITH_CONCERNS` flow is well aligned end-to-end. `agent/agents/coder.md`, `agent/skills/execute-plan/execute-task-prompt.md`, and `agent/skills/execute-plan/SKILL.md` now agree on the three concern types and route them through an explicit wave-level checkpoint.
- The verifier split is a solid architectural improvement. `agent/agents/verifier.md`, `agent/skills/execute-plan/verify-task-prompt.md`, and Step 10 in `agent/skills/execute-plan/SKILL.md` clearly separate evidence collection from judgment and lock the report format down to something parser-friendly.
- Failure handling is materially stronger than the old flow: Step 12 removes the skip path, Step 11 tracks deferred regressions explicitly, and Step 15 adds a real final-completion gate.

### Issues

#### Critical (Must Fix)
- None.

#### Important (Should Fix)

1. **New-file verification can still lose diff context**
   - **File:** `agent/skills/execute-plan/SKILL.md:639`
   - **What's wrong:** Step 10.2 says `{DIFF_CONTEXT}` is produced with `git diff HEAD -- <modified files>`, but it no longer includes the plan-required fallback for untracked/newly created files.
   - **Why it matters:** `git diff HEAD -- ...` does not reliably provide content for brand-new files. That means a task that creates a file can reach the verifier with empty or incomplete diff context even though the file is central to the change. Since Step 10 explicitly passes diff context as one of the verifier inputs, this weakens verification and can lead to false `insufficient evidence` failures or incomplete review of creation-heavy tasks.
   - **How to fix:** Restore explicit untracked-file handling in Step 10.2, e.g. use `git diff --no-index /dev/null -- <file>` (or equivalent) for newly created files and concatenate that into `{DIFF_CONTEXT}`.

2. **The Step 15 gate depends on history that the workflow never formally tracks**
   - **File:** `agent/skills/execute-plan/SKILL.md:713-723,880`
   - **What's wrong:** Step 11 says only `baseline_failures` and `deferred_integration_regressions` are carried across waves, but Step 15 now skips or runs based on whether deferment “ever occurred at any point during this run.” There is no documented run-scoped flag or artifact that records that history once `deferred_integration_regressions` has been reconciled back to empty.
   - **Why it matters:** After a deferred regression is incidentally fixed and removed from `deferred_integration_regressions`, the written state model no longer contains enough information to decide whether Step 15 must still run. Different implementations can legitimately make different choices here, which makes the final-completion contract non-deterministic.
   - **How to fix:** Either add an explicit run-scoped state such as `had_deferred_integration_regressions`, set when the user picks defer, or remove the optimization and always run the Step 15 gate whenever integration tests are enabled.

#### Minor (Nice to Have)

1. **README still misstates the defer flow**
   - **File:** `README.md:141`
   - **What's wrong:** The README says the orchestrator “invokes `Defer integration debugging`” and records a timestamped note. Step 11 actually defines deferment as a user choice on intermediate waves, and there is no timestamped-note behavior in the workflow text.
   - **Why it matters:** This is user-facing workflow documentation, and it currently describes automatic behavior that the skill does not implement.
   - **How to fix:** Rewrite bullet 6 to match Step 11/15 precisely: deferment is an intermediate-wave user option, deferred regressions do not disappear, and final completion remains blocked until they are resolved.

### Recommendations
- Add lightweight contract tests/lints for these markdown-driven workflow protocols. This branch is parser- and wording-sensitive enough that simple checks would pay off:
  - verify Step 10 includes untracked-file diff handling,
  - verify any state referenced in Step 15 is actually defined earlier in the workflow,
  - snapshot key README workflow bullets against the canonical `SKILL.md` semantics.
- Consider centralizing the three-set integration vocabulary in one reusable fragment or checklist; the current flow is much better, but it is still easy for README/Step 11/Step 15 wording to drift.

### Assessment

**Ready to merge: With fixes**

**Reasoning:** The branch is much stronger architecturally and most of the hardening plan is implemented well, but Step 10 still drops a required verification path for newly created files and Step 15 relies on undeclared state. Those two workflow-contract gaps should be corrected before treating this as production-ready.
