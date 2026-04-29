# Code Review: execute-plan SKILL.md Shortening
**Date:** 2026-04-19
**Reviewer:** Senior Code Reviewer
**Git range:** aa8cfbab38e17d43f105bfde66928da2775d54b0..ce48697
**Branch:** execute-plan-skill-shortening-follow-up

---

## Summary

The refactor successfully reduces SKILL.md from 1000 lines to 799 lines (hard gate: < 800 — PASS; targeting < 700 — MISS by 99 lines). All three new sibling files are created correctly, the untouched files are confirmed unchanged, and the majority of the structural simplifications are behavior-preserving. However, two Important issues were found: (1) Step 10.3's simplified four-condition check drops two of four named conditions and could mislead a future reader into thinking the stated `S == {1..K}` rule alone covers all cases; (2) the removed closing clause at the bottom of Step 12 about wave pacing is not fully redundant — it clarified an interaction between option `(b)` and blocked/failed waves that is not otherwise explicitly stated in that section.

---

## Findings

### Finding 1 — Important

**File:** `agent/skills/execute-plan/SKILL.md`, lines 546–548 (Step 10.3 full-coverage requirement)
**Area:** Change 5 — Step 10.3 simplification

**Description:**
The original text listed four separately-numbered conditions:
1. Count: `|S| == K`
2. Coverage: `S == {1..K}`
3. Uniqueness: no duplicates
4. Range: no `N < 1` or `N > K`

The replacement collapses this to a single sentence:
> "The verifier output MUST satisfy `S == {1..K}` — exactly one header per criterion number, no gaps and no out-of-range numbers. In addition, no criterion number may appear in two or more `[Criterion N]` headers; duplicates are a protocol error even when both duplicates agree on `PASS`/`FAIL`."

The mathematical content is equivalent: `S == {1..K}` already implies count, coverage, and range simultaneously when `S` is a set (deduplicated), and duplicates are separately called out. Behaviorally, the rule is preserved.

However, the simplification drops the explicit "Count" condition label. For an agent following this protocol, the collapse is fine because set equality implies all four sub-conditions. The risk is that the text now silently relies on the reader understanding that `S` is a set (not a multiset). If an agent naively interprets `S` as including duplicates, `S == {1..K}` would not catch duplicate criterion headers. The preceding paragraph defines `S := { N : ... }` with set-builder notation, which convention treats as a set, but this is implicit rather than stated.

**Recommendation:** Add "where `S` is a set (deduplicated)" or "(S is a set — duplicates do not expand it)" inline at the point where `S` is assigned, to make the deduplication assumption explicit. This closes the gap between the collapsed rule and the original's explicit uniqueness check.

**Severity: Important** — The behavioral outcome is equivalent under a standard mathematical reading, but the implicit deduplication assumption is a latent ambiguity for an agent that reads this document literally without mathematical conventions.

---

### Finding 2 — Important

**File:** `agent/skills/execute-plan/SKILL.md`, lines 676–683 (Step 12 wave pacing)
**Area:** Change 4 / meta-narration removal — removed closing pacing clause

**Description:**
The following paragraph was removed from the bottom of Step 12's pacing section:

> "Under any of (a), (b), or (c), a wave that contains at least one `BLOCKED` task, has a Step 9.7 checkpoint that has not yet exited via `(c) Continue` or remediation, or has any task with Step 10 `VERDICT: FAIL` is not eligible to be 'collected and reported at the end' — such waves are surfaced via Step 9.5, Step 9.7, or Step 12's retry loop respectively before the next wave starts."

This is not purely redundant. The removed paragraph specifically addresses option `(b)` ("Never pause; collect all failures and report at the very end") and clarifies that `BLOCKED`, unresolved-concerns, and `VERDICT: FAIL` waves still pause, even under auto-continue mode. Without this clause, an agent reading Step 12 under option `(b)` could reason: "option `(b)` says never pause, so I should defer even `BLOCKED` outcomes until the end."

The remaining pacing text (lines 676–683 in the current file) does state: "These options only govern the cadence of waves that contain no `BLOCKED` results and where Step 9.7 has already exited via `(c) Continue` or remediation." This partially addresses the concern. However, it does not explicitly mention that waves with `VERDICT: FAIL` are also ineligible for `(b)` auto-collect, and the interaction between `(b)` and Step 12's own retry loop is no longer explicitly stated.

**Recommendation:** Restore a one-sentence clarification after the pacing options:
> "Under option (b), a wave with any `BLOCKED` task, unresolved Step 9.7 concerns, or `VERDICT: FAIL` from Step 10 is NOT eligible for auto-collect — such waves are surfaced immediately via their respective gates before the next wave starts."

This is roughly equivalent to the removed clause but more compact.

**Severity: Important** — An agent running in `(b)` auto-continue mode that defers a `VERDICT: FAIL` wave would violate the protocol. The existing pacing caveat addresses `BLOCKED` and Step 9.7, but the `VERDICT: FAIL` carve-out is no longer explicitly stated.

---

### Finding 3 — Minor

**File:** `agent/skills/execute-plan/SKILL.md`, line 299 (Step 7 integration regression model reference)
**Area:** Change 2 — Integration regression model extraction

**Description:**
The removed paragraph that preceded the section pointer read:
> "How new failures are distinguished from pre-existing ones: Step 11's reconciliation uses exact set operations on identifiers extracted via the same contract above (`baseline_failures`, `deferred_integration_regressions`, `current_failing`). There is no count-based or heuristic fallback — a test is a new regression if and only if its identifier appears in the current run and is not in either tracked set. Step 7 and Step 11 MUST use the same extraction logic so the sets are comparable."

This sentence contained one substantive constraint: "Step 7 and Step 11 MUST use the same extraction logic so the sets are comparable." The replacement pointer to `integration-regression-model.md` does not explicitly restate this constraint. The `integration-regression-model.md` document does reference the "Step 7 identifier-extraction contract" in its reconciliation algorithm (step 1), which implicitly enforces this. However, the explicit "MUST use the same extraction logic" guard that prevented a protocol deviation is no longer directly visible at the point in Step 7 where the baseline is captured.

**Recommendation:** No change required if the extracted file is considered authoritative — the `integration-regression-model.md` reconciliation algorithm (step 1) explicitly requires using the "Step 7 identifier-extraction contract," which enforces the same-logic rule indirectly. This is a Minor observation about reduced emphasis, not a behavioral gap.

---

### Finding 4 — Minor

**File:** `agent/skills/execute-plan/SKILL.md`, lines 427–430 (Step 9.5 §4, `(m) Better model` option)
**Area:** Change 4 — removed redundant explanation in `(m) Better model`

**Description:**
The removed text after the `(m) Better model` bullet was:
> "If the task's current tier is `capable`, do NOT offer this option and do NOT re-dispatch to `capable` again under the guise of a 'better model' — that would re-dispatch the same task to the same model with no change, which the Step 9 rule forbids. The user must instead pick `(c)` (which adds new context, satisfying the 'with changes' requirement) or `(s)` (which restructures the task itself), or `(x)`."

The replacement retains only: "only offered when the task's current tier is `cheap` or `standard`" and defers the rationale to the suppression paragraph immediately above (lines 427–428), which explicitly states the reason: "there is no higher tier to escalate to and re-dispatching to the same model would violate the Step 9 rule."

The behavioral rule is preserved via the retained paragraph. The removed text did add one additional explicit statement: "The user must instead pick `(c)`, `(s)`, or `(x)`" when `(m)` is suppressed. This is now present in the suppression paragraph as well ("the user must pick `(c)`, `(s)`, or `(x)` for that task"). No behavioral gap.

**Recommendation:** No change required. The suppression paragraph adequately covers the removed text.

---

### Finding 5 — Minor

**File:** `agent/skills/execute-plan/SKILL.md`, line 299 vs. `integration-regression-model.md`, line 41
**Area:** Change 2 — Final gate stricter pass condition representation

**Description:**
The `integration-regression-model.md` file's "Pass/fail classification" section correctly notes:
> "Step 15's final gate uses a stricter condition — it gates on the union `still_failing_deferred ∪ new_regressions_after_deferment` — but uses the same reconciliation algorithm and the same three-section report format defined here."

This is faithful to the original. However, Step 15's gate protocol (SKILL.md lines 740–758) references `integration-regression-model.md` for the reconciliation algorithm and for the user-facing summary format, while independently restating the stricter gate condition. This creates a slightly split definition: the stricter condition appears both inline in Step 15 and as a note in `integration-regression-model.md`. This is not a behavioral problem — the inline Step 15 gate description is authoritative and complete — but it means the two files must be kept in sync if the final-gate condition ever changes.

**Recommendation:** The current arrangement is acceptable. If future changes are made to the final-gate condition, both files must be updated together.

---

### Finding 6 — Minor

**File:** `agent/skills/execute-plan/tdd-block.md` / `SKILL.md` line 347
**Area:** Change 1 — TDD extraction fidelity

**Description:**
The extraction is faithful. The content of `tdd-block.md` is identical to the TDD block that was inlined in Step 8. The instruction in SKILL.md (line 347) correctly reads: "read `agent/skills/execute-plan/tdd-block.md` and substitute its full contents verbatim." The `{TDD_BLOCK}` placeholder in `execute-task-prompt.md` (line 81) is unchanged and will receive the file's contents via the new load instruction. No behavioral change.

The one edge case to verify at runtime: the instruction says to "read" the file. If the orchestrator agent's file-read is relative to the working directory (the plan's project root, not the skill directory), the path `agent/skills/execute-plan/tdd-block.md` must be resolvable. The same path convention is already used for `execute-task-prompt.md` and `verify-task-prompt.md` in Steps 8 and 10.2, so this is consistent with existing practice. No change needed.

---

## Untouched Files Verification

Confirmed via `git diff aa8cfbab..ce48697` with no output for:
- `agent/skills/execute-plan/execute-task-prompt.md` — unchanged
- `agent/skills/execute-plan/verify-task-prompt.md` — unchanged
- `agent/skills/generate-plan/SKILL.md` — unchanged
- `agent/skills/refine-code/SKILL.md` — unchanged

---

## Line Count

- `SKILL.md`: 799 lines — satisfies hard gate (< 800). Does NOT satisfy the non-blocking target (< 700); falls 99 lines short.
- `tdd-block.md`: 60 lines (new)
- `integration-regression-model.md`: 71 lines (new)

The < 700 target was non-blocking and is noted for informational purposes only.

---

## Preservation Requirements Check

| Requirement | Status | Notes |
|---|---|---|
| Worker dispatch shape | Preserved | `execute-task-prompt.md` unchanged; `{TDD_BLOCK}` substitution updated to load from file |
| Gate ordering (Steps 0–15 including 9.5 and 9.7) | Preserved | All steps present in original order |
| Retry-budget semantics | Preserved | 3-retry limit, shared counter, split-task inheritance all intact |
| Integration-test three-set model | Preserved | Full model moved to `integration-regression-model.md`; content verified identical |
| User-facing report format (three-section block) | Preserved | Format definition in `integration-regression-model.md` lines 44–71 is identical to original |
| `{TDD_BLOCK}` placeholder satisfied | Preserved | SKILL.md Step 8 instruction updated to load `tdd-block.md` verbatim |

---

## Verdict

**NEEDS_WORK**

Two Important issues require resolution before this refactor is considered complete:
1. Finding 1: Make the set-deduplication assumption explicit at the `S :=` definition in Step 10.3 to close the latent ambiguity in the collapsed full-coverage rule.
2. Finding 2: Restore an explicit one-sentence carve-out in Step 12 clarifying that `VERDICT: FAIL` waves are not eligible for option `(b)` auto-collect (the existing pacing caveat covers `BLOCKED` and Step 9.7 but not `VERDICT: FAIL` explicitly).
