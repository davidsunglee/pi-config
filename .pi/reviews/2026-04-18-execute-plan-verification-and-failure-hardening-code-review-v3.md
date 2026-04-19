# Code Review: Execute-Plan Verification and Failure Hardening
**Era:** 3
**Iteration:** Final Verification
**Model:** crossProvider.capable (`openai-codex/gpt-5.4` via `pi`)
**Base:** `5f29dc9e7c51d48246752ac11ee00df0058b22f1`
**Head:** `bb5195d`

---

### Strengths
- The hardening is implemented end-to-end rather than in just one place: plan generation (`agent/agents/planner.md`), plan review/edit (`agent/skills/generate-plan/review-plan-prompt.md`, `edit-plan-prompt.md`), worker reporting (`agent/agents/coder.md`, `agent/skills/execute-plan/execute-task-prompt.md`), verifier contract (`agent/agents/verifier.md`, `agent/skills/execute-plan/verify-task-prompt.md`), and executor orchestration (`agent/skills/execute-plan/SKILL.md`) now line up on the new verification model.
- `agent/skills/execute-plan/SKILL.md` cleanly separates responsibilities: the orchestrator gathers command evidence, the verifier judges, and malformed verifier output is explicitly treated as a failure path instead of being partially accepted.
- The three-set integration model and the Step 15 final gate close the largest silent-success hole: deferred regressions may continue mid-run, but they cannot leak into normal completion.
- The `DONE_WITH_CONCERNS` flow is well hardened: typed concerns, a combined wave-level checkpoint, and severity-based routing all match the stated requirements.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)

1. **README wording still says concerns may be “deferred” at the checkpoint**
   - **File:** `README.md:139`
   - **What's wrong:** The README says the combined `DONE_WITH_CONCERNS` checkpoint lets concerns be “reviewed, deferred, or resolved before the wave is committed.”
   - **Why it matters:** The hardened workflow does not allow `correctness` or `scope` concerns to be deferred past the checkpoint; observation concerns can be acknowledged, but not silently deferred.
   - **How to fix:** Update the sentence to say concerns are reviewed, acknowledged when observation-only, remediated, or execution stops.

### Recommendations
- Add a lightweight regression harness for the parser-sensitive prompt/protocol contracts (`[Criterion N] PASS|FAIL`, `VERDICT: PASS|FAIL`, typed concern prefixes, exact menu labels) to catch wording drift early.

### Assessment

**Ready to merge: Yes**

**Reasoning:** The core requirements are implemented comprehensively and consistently across the planner, verifier, and executor specs, and the new verification/failure boundaries are materially stronger. The only remaining issue is a minor README wording mismatch that does not affect execution behavior.

---

## Remediation Log

### Era 3 — Review received
**Status:** Final verification found additional Important issues; iteration budget reset again.
- Remaining: Important #1 `agent/agents/verifier.md` still uses the old worker-centered `## Modified Files` contract
- Remaining: Important #2 Step 15 debug-now path still assumes wave-local debugging context

### Era 3 — Batch 1 remediation
**Status:** Committed in `bb5195d` (`fix(review): era 3 — align verifier and final debug flow`)
- Fixed: `agent/agents/verifier.md` now consistently uses `## Verifier-Visible Files` and describes the orchestrator-authored authoritative union rather than a worker self-report.
- Fixed: `agent/agents/planner.md` now references `## Verifier-Visible Files`, removing a stale prompt-contract mismatch.
- Fixed: Step 15 now defines a dedicated final-gate debugger-first flow that uses the plan execution range and current branch state instead of wave-local artifacts.
- Fixed: Final-gate debugging commits are now guarded so a `STATUS: DONE` result without file changes does not force a spurious commit.

### Era 3 — Hybrid re-review
**Status:** No Critical or Important issues remain.
- Verified fixed: Important #1 verifier contract now matches the authoritative verifier-visible file-set model
- Verified fixed: Important #2 Step 15 now has a self-contained final-gate debugging flow
- Remaining minor: placeholder name `{MODIFIED_FILES}` could be renamed for full terminology alignment

### Era 3 — Final verification
**Status:** Clean on full-diff verification.
- Verified: end-to-end planner/reviewer/verifier/executor alignment on the hardened verification model
- Verified: final gate blocks deferred and newly introduced plan regressions from reaching normal completion
- Remaining minor: README wording at `README.md:139` still says concerns may be “deferred” at the checkpoint
- **Result:** Clean after 7 review passes across 3 eras.
