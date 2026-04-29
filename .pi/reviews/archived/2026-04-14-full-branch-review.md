# Full Branch Review: 23b7ebef..HEAD

## Summary

This range implements two major pieces of work: (1) a review-loop skill (now renamed to `refine-code`) for iterative code review and remediation, and (2) a generate-plan upgrade with an iterative review-edit loop plus a suite-wide consistency pass renaming agents, templates, and skills. The implementation is thorough and closely follows the spec. All file renames are clean, all cross-references within the active skill/agent files use the new names, and the placeholder contracts between SKILL files and their templates are consistent. One important issue remains: the `requesting-code-review` SKILL.md does not document the `{RE_REVIEW_BLOCK}` placeholder that was added to its template in this range.

## Findings

### Critical

None.

### Important

#### 1. `requesting-code-review/SKILL.md` missing `{RE_REVIEW_BLOCK}` in fill instructions

- **File(s):** `agent/skills/requesting-code-review/SKILL.md:36-41`, `agent/skills/requesting-code-review/review-code-prompt.md:31`
- **What:** Commit `0a2796f` added `{RE_REVIEW_BLOCK}` to the `review-code-prompt.md` template. The `refine-code-prompt.md` correctly fills this placeholder (empty string on first pass, filled block on re-reviews). However, the `requesting-code-review/SKILL.md` fill instructions (lines 36-41) list only 5 placeholders and do not mention `{RE_REVIEW_BLOCK}`. When the standalone code review skill is used (not via refine-code), the literal string `{RE_REVIEW_BLOCK}` will appear unfilled in the reviewer's prompt.
- **Why it matters:** A code reviewer dispatched through the standalone `requesting-code-review` skill will receive a prompt containing the raw placeholder `{RE_REVIEW_BLOCK}` instead of an empty string. This is confusing to the reviewer agent and could affect review quality.
- **Recommendation:** Add `{RE_REVIEW_BLOCK}` to the fill instructions in `requesting-code-review/SKILL.md` with the note: "empty string (standalone reviews are always full reviews, not re-reviews)."

### Minor

#### 2. `execute-task-prompt.md` heading still says "Implementer Prompt"

- **File(s):** `agent/skills/execute-plan/execute-task-prompt.md:1`
- **What:** The file was renamed from `implementer-prompt.md` to `execute-task-prompt.md`, but the H1 heading inside still reads `# Implementer Prompt`.
- **Why it matters:** The heading is part of the template content sent to the coder agent. It doesn't break anything, but it's a vestigial reference to the old naming scheme in a range specifically aimed at consistency.
- **Recommendation:** Update the heading to `# Execute Task Prompt` or `# Task Prompt` to match the new filename convention.

#### 3. `review-and-remediate` spec contains pre-rename names throughout

- **File(s):** `docs/superpowers/specs/2026-04-13-review-and-remediate-design.md` (lines 13-17, 60, 117, 190-301)
- **What:** This spec still references `review-loop`, `remediation-coordinator`, `plan-executor`, `remediation-prompt.md`, `re-review-block.md`, and `code-reviewer.md` (as a template path). These are all pre-rename names.
- **Why it matters:** The spec is a historical design document, not an active instruction set, so it won't break execution. However, it may confuse future readers who try to map spec references to current file paths.
- **Recommendation:** Either add a note at the top of the spec saying "Names in this document reflect the original design; see the generate-plan upgrade spec for current naming" or leave as-is since it's a historical record.

#### 4. `edit-plan-prompt.md` has `{OUTPUT_PATH}` placeholder not in the spec

- **File(s):** `agent/skills/generate-plan/edit-plan-prompt.md:23`, `agent/skills/generate-plan/SKILL.md:107`
- **What:** The spec's template specification for `edit-plan-prompt.md` lists only 3 placeholders (`{PLAN_CONTENTS}`, `{REVIEW_FINDINGS}`, `{ORIGINAL_SPEC}`). The implementation adds a fourth, `{OUTPUT_PATH}`, to both the template and the SKILL.md fill instructions.
- **Why it matters:** This is a justified deviation. The planner agent's system prompt says it writes to "the output path specified in your task prompt," so providing `{OUTPUT_PATH}` makes the contract explicit and avoids ambiguity about where to write the edited plan. The earlier in-range review (finding #1 in `2026-04-14-0257ac50-to-HEAD-review.md`) correctly identified this gap and it was remediated.
- **Recommendation:** No change needed to the code. Optionally update the spec to reflect this addition.

## Strengths

1. **Clean rename execution.** All 9 file renames are tracked by git. No orphaned files remain at old paths. Zero stale references to old names (`plan-executor`, `plan-generator`, `remediation-coordinator`, `implementer-prompt`, `remediation-prompt`, `re-review-block`, `review-loop`, `code-reviewer.md` as template) exist in any active agent/skill file.

2. **Placeholder contract consistency.** For every SKILL.md that references a template, the fill instructions match the placeholders in the template file. The one exception (finding #1 above) is in the standalone code review skill, not in the primary execution path.

3. **Severity label consistency.** The code review template uses `Critical / Important / Minor` throughout, and the `refine-code-prompt.md` consumer correctly keys on `Critical/Important`. The plan review template uses `Error / Warning / Suggestion`, and the `generate-plan/SKILL.md` Step 4.2 correctly parses these. No cross-contamination between the two severity vocabularies.

4. **Self-correcting review cycle.** The in-range review (`2026-04-14-0257ac50-to-HEAD-review.md`) found 4 real issues (output path gap, verdict format mismatch, coder output schema conflict, wording inconsistency), all of which were remediated in commit `857cc35`. This demonstrates the review-edit loop working as designed.

5. **Agent naming convention is clear and consistent.** Primary actors (`planner`, `coder`) have short names; review/refinement roles (`plan-reviewer`, `code-reviewer`, `code-refiner`) use `<domain>-<role>` format. Template naming follows `<verb>-<domain>-prompt.md` consistently.

6. **Edge case documentation is thorough.** Both the generate-plan and refine-code SKILL files document edge cases (missing models.json, no git repo, empty requirements, todo ID vs file path input handling) with explicit error messages.

## Assessment

**Ready to merge: With fixes**

**Reasoning:** The implementation closely follows the spec across 16 changed files. The one important finding (missing `{RE_REVIEW_BLOCK}` in standalone code review fill instructions) is a real contract gap that will produce a raw placeholder in the reviewer's prompt when the skill is used outside the refine-code path. It's a one-line fix. The minor findings are cosmetic and non-blocking.
