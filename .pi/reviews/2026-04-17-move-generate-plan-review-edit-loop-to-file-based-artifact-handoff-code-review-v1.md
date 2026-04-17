# Code Review: Path-Based Handoff Extension (Review + Edit Dispatches)

**Iteration:** 1 (full review) + Final Verification
**Base:** 875a6da7722105b948c18ec2e78f3c1b36cc612b
**Head:** dc9e2c93fd8552b38e1c9024ce41efa0578563ba
**Model:** crossProvider.capable (opus)
**Date:** 2026-04-17

---

## Iteration 1 — Full Review

### Strengths

- **Clean plan alignment** — The implementation is a faithful execution of the plan. Every task's acceptance criteria are met: the two prompt templates are rewritten, both agent contracts updated, and SKILL.md Steps 4.1/4.3/Edge cases/Scope note all reflect path-based handoff.
- **Consistent policy language across the three dispatches** — The "read from disk / warn-and-continue on missing brief / fail on missing plan or task artifact" shape mirrors the planner-slice precedent verbatim, keeping the mental model simple for future maintainers.
- **Proper freshness checks** — `SKILL.md:120-124` and `SKILL.md:182-186` explicitly re-check artifact existence at dispatch time rather than trusting Step 1 state. Good defensive design for a multi-step orchestration.
- **Clear conflict resolution** — Both prompts explicitly state "prefer on-disk artifact as authoritative" if both on-disk and inline are populated, with the review prompt directing the reviewer to flag it as an inconsistency. Good disambiguation.
- **Reviewer frontmatter updated correctly** — `agent/agents/plan-reviewer.md` adds `tools: read, grep, find, ls, bash`, which was a required precondition for the reviewer to actually read artifacts from disk.
- **Planner edit-mode wording is accurate** — `agent/agents/planner.md:32-39` cleanly removes the previous "continues to inline plan content" statement and replaces it with a correct description that preserves `## Review Findings` and `## Output` as inline while instructing read-from-disk for plan/task artifacts.
- **Scope boundary explicitly stated** — `SKILL.md` states "execute-plan and execute-plan -> coder are out of scope for this handoff contract." Prevents future confusion.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)

1. **Placeholder naming inconsistency between templates** — `generate-plan-prompt.md` uses `{SOURCE_BRIEF}` while `review-plan-prompt.md` and `edit-plan-prompt.md` use `{SCOUT_BRIEF}`. SKILL.md correctly treats these as distinct per-template placeholders so this is not a bug — but the divergent naming is a small cognitive tax. Consider standardizing in a follow-up.

2. **Task artifact path reuse assumption** — SKILL.md Steps 4.1 and 4.3 both say `same path used in Step 3`. Existence-check language covers the "file deleted" case; no change needed, but the state dependency is worth noting.

3. **`review-plan-prompt.md` wording** — "self-contained (this is the todo/freeform case)" is slightly ambiguous. Low priority.

4. **Edge case error string duplication** — The exact error message format is duplicated across Step 4.1, Step 4.3, and Edge cases. Non-blocking.

### Recommendations

- Unify `{SOURCE_BRIEF}` and `{SCOUT_BRIEF}` naming across all three prompt templates in a future cleanup pass.
- Consider adding concrete examples of a filled `## Provenance` block (file-based and todo cases) to `plan-reviewer.md`'s Input Contract section — mirrors what was done well in `planner.md`.

### Assessment

**Ready to merge: Yes**

**Reasoning:** This is a documentation/prompt-template slice with no code paths or tests. Every acceptance criterion from the plan is met, the placeholder set is exact (verified via grep), the handoff contract is symmetric and consistent across the three dispatches, and failure modes align with the planner-slice precedent. The only findings are minor nomenclature inconsistencies that do not affect correctness.

---

## Final Verification — Full-Diff Review

**Base:** 875a6da7722105b948c18ec2e78f3c1b36cc612b (pre-implementation)
**Head:** dc9e2c93fd8552b38e1c9024ce41efa0578563ba (all changes)

### Strengths

- Placeholder sets are exact across all three prompts and SKILL.md mapping tables: `{PLAN_ARTIFACT}`, `{TASK_ARTIFACT}`, `{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}`, `{ORIGINAL_SPEC_INLINE}` (plus `{REVIEW_FINDINGS}` and `{OUTPUT_PATH}` in edit-plan).
- SKILL.md is clean of any `{PLAN_CONTENTS}` or `{ORIGINAL_SPEC}` stale references (grep returns zero hits).
- Both prompts contain the three required sections: `## Provenance`, `## Original Spec (inline)`, `## Artifact Reading Contract`.
- Inline-vs-disk conflict resolution is specified consistently (prefer on-disk, flag inconsistency in reviewer; prefer on-disk silently in editor).
- `plan-reviewer.md` frontmatter tools field (`read, grep, find, ls, bash`) grants sufficient access for disk reads. The new `## Input Contract` describes both file-based and inline shapes.
- `planner.md` Edit mode correctly instructs reading plan artifact from disk and task artifact when present; keeps `## Review Findings` and `## Output` inline.
- Failure mode strings match exactly across Step 4.1, Step 4.3, and Edge cases: `Plan file <path> missing — cannot dispatch plan review.` / `... plan edit.` and `Task artifact <path> missing — cannot dispatch plan review.` / `... plan edit.`.
- Scope note explicitly lists all three dispatches (Steps 3, 4.1, 4.3) and correctly calls out the small-inline control data exceptions.
- Scout brief warn-and-continue policy is consistent across generation, review, and edit passes.
- "Do NOT read the plan, task artifact, or scout brief contents into the orchestrator prompt" appears verbatim in both Step 4.1 and Step 4.3.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)

1. **Subtle inconsistency in inline-vs-disk conflict policy between reviewer and editor prompts.** `review-plan-prompt.md` says "report an inconsistency in your review but continue using the on-disk artifact." `edit-plan-prompt.md` says "prefer the on-disk artifact as authoritative and ignore the inline section." The editor policy silently ignores, whereas reviewer flags. This is defensible (reviewers flag; editors edit) but could be noted explicitly so a future reader doesn't perceive it as drift.

2. **`planner.md` Edit mode references `## Artifact Reading Contract`** but that section is carried by the prompt file, not described in the file-based input section above. The phrasing "same shape as file-based input above" could mislead — consider clarifying "same shape as file-based input above, with an explicit `## Artifact Reading Contract` section carried by the edit prompt." (`agent/agents/planner.md` line 34)

3. **`{SOURCE_BRIEF}` vs `{SCOUT_BRIEF}` naming split** — holdover from the previous wave, out of scope for this change.

### Assessment

**Ready to merge: Yes**

**Reasoning:** All seven tasks are satisfied exactly as specified — placeholder sets are exact, required sections present, failure modes consistent, scope note covers all three dispatches, and the stale-placeholder grep is clean. Only minor wording nitpicks remain, none of which block production use.

---

## Remediation Log

No remediations required — first review and final verification both clean.

**Result:** Clean after 1 iteration.
