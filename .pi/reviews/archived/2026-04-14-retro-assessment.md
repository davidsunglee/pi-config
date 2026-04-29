# Retrospective Assessment: Review `23b7ebef..88baddc`

**Original review:** `.pi/reviews/2026-04-14-23b7ebef-to-88baddca-review.md`
**Assessed against:** Current HEAD (post-consistency-pass)

---

## A. Document Contradictions

### A1. Model-matrix key names conflict between plan and spec

**Status:** Valid (partially fixed, partially remaining)

**Evidence:**
- The plan (`docs/superpowers/plans/2026-04-13-review-loop.md:351-354`) uses bare keys: `crossProvider.capable`, `standard`, `capable`
- The spec (`docs/superpowers/specs/2026-04-13-review-and-remediate-design.md:23-25`) used `modelTiers.standard`, `modelTiers.capable` — inconsistent with the plan
- `refine-code/refine-code-prompt.md` (lines 29-31) correctly uses bare keys: `crossProvider.capable`, `standard`, `capable`
- `refine-code/SKILL.md` (lines 35-37) correctly uses bare keys
- `execute-plan/SKILL.md` Step 6 (lines 168-170, 177) still used `modelTiers.capable`, `modelTiers.standard`, `modelTiers.cheap` — inconsistent with refine-code
- The spec also had stale agent names (`plan-executor`, `remediation-coordinator`, `review-loop`) from before the consistency rename

**Action taken:**
- Fixed `execute-plan/SKILL.md` Step 6 mapping table and instruction text to use bare keys (`capable`, `standard`, `cheap` from `models.json`) instead of `modelTiers.*`
- Fixed spec `modelTiers.standard` and `modelTiers.capable` references to bare `standard` and `capable`
- Fixed spec stale agent/skill names: `plan-executor` -> `coder`, `remediation-coordinator` -> `code-refiner`, `review-loop` -> `refine-code`
- Fixed spec file path references to match current names (`refine-code-prompt.md`, `review-fix-block.md`, etc.)

### A2. Hybrid re-review placeholder contract conflicts between plan and spec

**Status:** Fixed (already addressed by consistency pass)

**Evidence:**
- `refine-code/review-fix-block.md` (lines 16-17) uses `{PREV_HEAD}` and `{NEW_HEAD}`, matching the plan
- `refine-code/refine-code-prompt.md` (lines 98-99) also uses `{PREV_HEAD}` and `{NEW_HEAD}`
- No `{REMEDIATION_DIFF}` placeholder exists anywhere in current code
- The implementation consistently follows the plan's approach

**Action:** None needed.

---

## B. Implementation Issues

### B1. execute-plan still uses old `modelTiers.*` contract after switching to `models.json`

**Status:** Valid (same root cause as A1)

**Evidence:** `execute-plan/SKILL.md` lines 168-170 had `modelTiers.capable`, `modelTiers.standard`, `modelTiers.cheap` in the mapping table, and line 177 said "use the exact strings from `modelTiers`". This is inconsistent with the `models.json` format where keys are bare (`capable`, `standard`, `cheap`).

**Action taken:** Fixed the mapping table and instruction text in Step 6 to reference bare keys from `models.json`.

### B2. Main-branch confirmation offers a removed "disable commits/checkpoints" path

**Status:** Valid

**Evidence:** `execute-plan/SKILL.md` line 225 said: "Disable commit-per-wave for this entire execution (proceed without checkpoints). Do not ask again." However, Step 9b unconditionally commits wave changes — there is no code path that skips commits. Offering an option the flow doesn't support is misleading.

**Action taken:** Changed the `n` response from "disable commit-per-wave" to "Cancel execution. The user should create a feature branch or worktree first." This is safer — if a user doesn't want commits on main, they should branch, not run commitless.

### B3. A removed spec-review step is still referenced

**Status:** Valid

**Evidence:** `execute-plan/SKILL.md` line 299 says "After wave verification (Step 9) and spec review complete successfully for a wave." The spec-reviewer was removed (`spec-reviewer.md` deleted, no spec-review step exists).

**Action taken:** Removed the stale "and spec review" clause. Line now reads: "After wave verification (Step 9) completes successfully for a wave."

### B4. Review-loop fills wrong placeholder for "What Was Implemented"

**Status:** Valid (partially — semantics were inverted)

**Evidence:**
- `review-code-prompt.md` line 7: `1. Review {WHAT_WAS_IMPLEMENTED}` (task instruction — gets the plan goal)
- `review-code-prompt.md` line 15: `{DESCRIPTION}` rendered under "What Was Implemented" heading
- `refine-code-prompt.md` line 44: `{DESCRIPTION}` was set to "Refine-code: full review" (a phase label)
- `refine-code-prompt.md` line 40: `{WHAT_WAS_IMPLEMENTED}` was set to the Plan Goal

The reviewer would see the "What Was Implemented" section showing "Refine-code: full review" instead of the actual feature description. The plan goal was only in the task instruction line at the top.

In standalone `requesting-code-review` usage, `{DESCRIPTION}` is set to "brief summary of changes" (SKILL.md line 41), so the template design works for that case. The issue was specifically in refine-code's placeholder mapping.

**Action taken:** Changed all three `{DESCRIPTION}` mappings in `refine-code-prompt.md` (lines 44, 106, 122) to use "the Plan Goal above" instead of phase labels. The reviewer now sees the actual feature description in the "What Was Implemented" section.

### B5. "Ready to merge" verdict format inconsistent

**Status:** Fixed (already addressed by consistency pass)

**Evidence:**
- `review-code-prompt.md` line 93: `**Ready to merge: [Yes/No/With fixes]**` (colon format)
- `refine-code-prompt.md` line 60: checks for `"Ready to merge: Yes"` (colon format)
- `review-fix-block.md` line 27: `report "Ready to merge: Yes"` (colon format)

All three files now consistently use `Ready to merge:` with a colon. The original review found the template used `Ready to merge?` (question mark) while the coordinator parsed `Ready to merge:` (colon). This was fixed in the consistency pass.

**Action:** None needed.

---

## Summary

| Finding | Status | Remediated |
|---------|--------|------------|
| A1. Model-matrix key names | Valid | Yes — execute-plan Step 6 + spec |
| A2. Hybrid re-review placeholders | Fixed | N/A |
| B1. execute-plan modelTiers.* | Valid (=A1) | Yes — same fix as A1 |
| B2. Main-branch disable commits | Valid | Yes — changed to cancel execution |
| B3. Stale spec-review reference | Valid | Yes — removed stale clause |
| B4. Wrong DESCRIPTION placeholder | Valid | Yes — maps to plan goal now |
| B5. Ready to merge format | Fixed | N/A |

### Additional fixes (discovered during assessment)

The spec document (`docs/superpowers/specs/2026-04-13-review-and-remediate-design.md`) had stale names from before the consistency rename pass. Fixed:
- `plan-executor` -> `coder` (3 occurrences)
- `remediation-coordinator` -> `code-refiner` (5 occurrences)
- `review-loop` -> `refine-code` (6 occurrences)
- `remediation-prompt.md` -> `refine-code-prompt.md`
- `re-review-block.md` -> `review-fix-block.md`

### Files modified

- `agent/skills/execute-plan/SKILL.md` — B1/A1 (model keys), B2 (main-branch guard), B3 (spec review ref)
- `agent/skills/refine-code/refine-code-prompt.md` — B4 (DESCRIPTION placeholder mapping)
- `docs/superpowers/specs/2026-04-13-review-and-remediate-design.md` — A1 (model keys), stale names
