STATUS: DONE

## Completed

All steps in the task were already implemented as part of the wave 1 task 1 commit (`eeebb42`), which added both the regression tests and the full fence-aware implementation to `extract-plan-tasks.py`. Task 2 verification confirms:

- **Step 1 (fence-state helper):** `get_fence_aware_lines()` function at line 79 tracks line indices inside fenced code blocks, following the required opener/closer rules (same marker type, `>=` marker count, whitespace-only closer, indentation allowed).
- **Step 2 (task-start detection):** `parse_plan()` guards `TASK_HEADING_RE.match` with `if i not in in_fence:` so `### Task N:` lines inside fences are ignored.
- **Step 3 (task block end detection):** `find_block_end()` guards both `TASK_HEADING_RE.match` and `SECTION_HEADING_RE.match` with `if j not in in_fence:` so fake headings inside fences do not truncate the enclosing real task block.
- **Step 4 (required-section validation):** `validate_required_sections()` skips fenced lines when scanning for section patterns and body content, so fenced headings do not satisfy or terminate real top-level sections.
- **Step 5 (run test suite):** All 81 tests pass with no regressions.

## Tests

All 81 tests pass. Key fenced-heading tests (added in the prior task):

- **`TestFencedHeadingsMinimal`** (5 tests) — task-discovery fence-awareness: only one real task found, `Task 999` inside fence not parsed, post-fence content included in `task_spec`.
- **`TestFencedHeadingsRealistic`** (5 tests) — `model_recommendation == "standard"` captured correctly when it appears after a fenced block.
- **`TestFencedFakeRequiredSection`** (3 tests) — required-section validation fence-awareness: `## Architecture summary` inside a fence does not satisfy section validation, exactly one `missing_required_section` error reported.
- **`TestFenceBehavior`** (7 tests) — backtick/tilde/indented fences suppress headings, longer-than-opener closes correctly, mismatched markers do not close, unclosed fence suppresses to EOF.

**RED/GREEN evidence:** The regression tests were written before the implementation was merged (prior task commit). Since all tests are already green and no new production code was needed, there is no new RED→GREEN cycle in this task. The relevant prior RED evidence is recorded in the task 1 retry logs in the test-run directory.

## Files Changed

- `agent/skills/execute-plan/scripts/extract-plan-tasks.py` — no changes required; fence-aware implementation verified complete
- `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` — no changes required; regression tests verified present and passing

## Self-Review Findings

Reviewed all three detection paths against the acceptance criteria:

1. Task-start detection (`parse_plan()` first pass loop, line 302): `if i not in in_fence` guards `TASK_HEADING_RE` — confirmed fence-aware.
2. Task block end detection (`find_block_end()`, line 325): `if j not in in_fence` guards both heading regexes — confirmed fence-aware.
3. Required-section validation (`validate_required_sections()`, lines 155–181): `if idx in in_fence: continue` skips fenced lines in the section scanner; `if j in in_fence: j += 1; continue` skips fenced lines in the body scanner — confirmed fence-aware.
4. `parse_task_block()` uses a separate `block_in_fence = get_fence_aware_lines(block_lines)` so the per-task body parser is also fence-aware (Steps/Files/Criteria state machine skips fenced lines).

All three paths confirmed fence-aware. Post-fence content parsing verified by `test_model_recommendation_after_fence` (passes). Full suite green (81/81). None.
