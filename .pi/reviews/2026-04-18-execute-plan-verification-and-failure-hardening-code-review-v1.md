# Code Review: Execute-Plan Verification and Failure Hardening
**Iteration:** 2 (Hybrid Re-Review)
**Model:** `standard` (`anthropic/claude-sonnet-4-6` via `claude`)
**Base:** `8e6ca8b`
**Head:** `97cffe41dbd9e760263cd7d621de6eefe3566b3e`

---

### Strengths
- Finding 1 fix is thorough. The four-condition full-coverage requirement (`Count`, `Coverage`, `Uniqueness`, `Range`) cleanly closes the gap where a verifier could omit criteria and still pass, and routing protocol violations to Step 12 with concrete violation details gives retries an actionable target.
- Finding 2 fix is well-designed. The new Step 7 identifier-extraction contract defines exact suite-native failing-test identifiers, includes runner examples, and explicitly removes heuristic/count-based comparison so Step 7 and Step 11 use the same set semantics.
- Finding 3 fix correctly widens the three-section integration summary requirement. The fully-clean vs. not-fully-clean split means the headed `Baseline failures` / `Deferred integration regressions` / `New regressions in this wave` sections now remain visible whenever the suite is not clean, even on the pass path.
- Finding 4 fix precisely scopes debugger-first success to Step 11 reconciliation. Requiring `new_regressions_after_deferment` to be empty — while allowing baseline failures and previously deferred regressions to remain — preserves the intended defer-and-continue model.
- The `CONCERNED_TASKS` reference now matches the canonical worker heading `## Concerns / Needs / Blocker`, removing a prompt-contract mismatch.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)

1. **Step 11 reconciliation step 1 does not cross-reference the extraction contract**
   - **File:** `agent/skills/execute-plan/SKILL.md:750`
   - **What's wrong:** Step 11 says to compute `current_failing` from the just-completed integration run, but it does not point back to the Step 7 identifier-extraction contract for how those identifiers must be extracted.
   - **Why it matters:** Someone reading Step 11 in isolation could miss the runner-specific extraction rules defined in Step 7, even though Step 7 requires both stages to use the same logic.
   - **How to fix:** Add a short cross-reference in Step 11 step 1 directing readers back to the Step 7 identifier-extraction contract.

### Recommendations
- Add a small set of fixture-based or golden-output tests for the parser-sensitive prompt contracts, especially verifier outputs missing criterion blocks and integration summaries with deferred-but-not-new regressions.
- Consider a one-sentence note explaining why the fully-clean condition uses `baseline_failures ∩ current_failing` rather than `baseline_failures` alone; it is correct, but easy to misread later.

### Assessment

**Ready to merge: Yes**

**Reasoning:** All four previously flagged Important issues are substantively fixed in the remediation diff. The remaining note is minor documentation tightening and does not block merging.

---

## Remediation Log

### Iteration 1 — Review received
**Status:** Important issues identified and verified against the code.
- Remaining: #1 incomplete Step 10 criterion coverage validation
- Remaining: #2 heuristic baseline failure-set tracking
- Remaining: #3 three-section integration summary not required on pass path
- Remaining: #4 debugger-first success still requires baseline equality/clean pass
- Deferred: Minor #1 concern-heading mismatch

### Iteration 1 — Batch 1 remediation
**Status:** Committed in `97cffe4` (`fix(review): iteration 1 — tighten verification hardening`)
- Fixed: Step 10.3 now requires exactly one verdict block for every acceptance criterion and routes missing/duplicate/out-of-range criterion numbers to Step 12 as protocol errors.
- Fixed: Step 7 baseline capture now uses the same exact failing-test identifier extraction contract as Step 11, removing heuristic/count-based classification.
- Fixed: Step 11 now requires the three headed sections (`Baseline failures`, `Deferred integration regressions`, `New regressions in this wave`) whenever the suite is not fully clean, including pass/no-new-regression cases.
- Fixed: Debugger-first remediation success is now judged by Step 11 reconciliation (`new_regressions_after_deferment` empty), preserving deferred-regression continuation semantics.
- Fixed: Step 9.7 now references the canonical worker heading `## Concerns / Needs / Blocker`.

### Iteration 2 — Hybrid re-review
**Status:** No Critical or Important issues remain.
- Verified fixed: #1 full verifier criterion coverage validation
- Verified fixed: #2 exact identifier-based baseline/integration tracking
- Verified fixed: #3 three-section integration summaries on non-clean pass path
- Verified fixed: #4 reconciliation-based debugger-first success criteria
- Remaining minor: add a Step 11 cross-reference back to the Step 7 identifier-extraction contract
