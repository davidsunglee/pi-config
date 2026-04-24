# Code Review: Execute-Plan Blocked-Task Escalation
**Era:** v2 (iteration budget reset after final-verification issues in era v1)
**Final Verification Model:** crossProvider.capable (opus proxy)
**Base:** f6b9320 (original pre-implementation)
**Final HEAD:** a7413ec (post all remediations)

---

## Era v1 Summary

**Iteration 1 (full review, base f6b9320 → head 770f1fe):**
Found 4 Important issues, 5 Minor. Remediations committed at cb8e422:
- Step 9 BLOCKED bullet gate scope broadened to "before Step 10, Step 11, or any subsequent wave runs"
- Step 9.5 §1 drain requirement made affirmative (no longer "rely on that")
- Retry budget semantics clarified as shared across BLOCKED re-dispatches and DONE-verification retries

**Final Verification (full review, base f6b9320 → head cb8e422):**
Found 3 new Important issues — era v2 started.

---

## Era v2

### Iteration 1 Remediations (committed at a7413ec)

- Step 12 retry line now cross-references Step 9.5 budget sharing (bidirectional)
- Step 12 "Skip" bullet has explicit BLOCKED carve-out "(not offered for tasks currently in `BLOCKED` state — see Step 9.5)"
- Step 9.5 §4 `(s)` option states parent task slot is replaced by sub-tasks for subsequent tracking
- Step 9.5 §5 clarifies sub-tasks' responses replace original slot; BLOCKED sub-tasks surface on next gate pass

### Hybrid Re-Review (base cb8e422 → head a7413ec): All confirmed fixed, no regressions.

### Final Verification (full-diff f6b9320 → a7413ec)

---

### Strengths

- Clean separation between Step 9 triage and Step 9.5 gate; Step 9's BLOCKED bullet is now a pure pointer with no inline recovery.
- Bidirectional cross-references between Step 9.5 §5 and Step 12's retry clause ensure the shared retry budget is discoverable from either direction.
- Explicit rationale tied to the "Never ignore an escalation..." rule justifies why `(m)` is suppressed for `capable` tier.
- Combined escalation view explicitly requires successful same-wave tasks in the summary.
- Sub-task slot replacement semantics in §5 are unambiguous for gate re-entry.
- Example layout in §3 makes the contract concrete without over-constraining wording.

### Issues

#### Critical (Must Fix)

None.

#### Important (Should Fix)

None.

#### Minor (Nice to Have)

1. §5 retry-budget paragraph (~250 words) is a single dense block — splitting into two paragraphs (budget mechanics / skip-is-invalid rationale) would improve scannability.
2. §3 example uses emoji `🚫` — may be inconsistent with repo prose style; consider ASCII marker.
3. §3 header example could name Step 10/11 explicitly for symmetry with the Purpose paragraph (not required).
4. §4 `(s)` wording "between them" is slightly awkward; "collectively" is cleaner.

### Scenario Traces (all pass)

- **A** (single blocked, pacing "never pause"): Traced. Step 9 defers → 9.5 runs → user picks (c) → re-dispatch → 9.5 exits → 10/11 run → next wave.
- **B** (two blocked, different tiers): Traced. Combined view shown; `capable`-tier task suppresses `(m)`; per-task choices; re-dispatch together.
- **C** (user stops on one of several): Traced. §4 "stop the whole plan regardless" → §6 halts to Step 13, 10/11 don't run.
- **D** (retry budget exhausted): Traced. §5 "skip is not valid"; only intervention menu + stop; wave never advances to 10/11.

### Assessment

**Ready to merge: Yes**

**Reasoning:** All five tasks' acceptance criteria are satisfied verbatim, and all four scenario traces (A, B, C, D) work through the prose without gaps. The bidirectional Step 9.5 ↔ Step 12 cross-references, explicit BLOCKED carve-outs, and the hard "skip is not a valid exit" rule close every loophole the spec called out.

---

## Remediation Log

### Era v1 — Iteration 1 Batch 1 (Important #1, #2, #3 from v1 review)
**Commit:** cb8e422
**Fixed:**
- Step 9 BLOCKED bullet gate scope: "before Step 10, Step 11, or any subsequent wave runs"
- Step 9.5 §1: affirmative drain requirement
- Step 9.5 §5: retry budget shared-cap clarification with example

### Era v2 — Iteration 1 Batch 1 (Important #1, #2, #3 from v2 initial review)
**Commit:** a7413ec
**Fixed:**
- Step 12 retry line: bidirectional cross-ref to Step 9.5 §5
- Step 12 Skip bullet: BLOCKED carve-out "(not offered for tasks currently in BLOCKED state — see Step 9.5)"
- Step 9.5 §4 (s): parent task slot replacement semantics
- Step 9.5 §5: sub-task response mapping on gate re-entry

**Result:** Clean after 2 eras (4 remediations total). Final HEAD: a7413ec.
