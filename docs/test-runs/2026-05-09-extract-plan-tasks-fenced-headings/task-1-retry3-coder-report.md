STATUS: DONE

## Completed

Added the missing explicit assertion to the `TestFencedHeadingsRealistic` test class in `test_extract_plan_tasks.py`. The new test `test_task_spec_contains_literal_model_recommendation_line` verifies that the parsed task specification contains the literal post-fence line `**Model recommendation:** standard`, addressing the failing criterion that previously only checked for partial text content after the fence.

## Tests

All tests pass (81 total): 
- **NEW TEST:** `test_task_spec_contains_literal_model_recommendation_line` — Explicitly asserts that the literal line `**Model recommendation:** standard` appears in the parsed task_spec
- **RED/GREEN:** Not applicable for test-only change. The new test was written to pass immediately because the implementation already properly preserves post-fence content in task_spec.
- **Existing tests:** All 20 fenced-heading related tests pass, including `TestFencedHeadingsMinimal` (5 tests), `TestFencedHeadingsRealistic` (5 tests including the new one), `TestFencedFakeRequiredSection` (3 tests), and `TestFenceBehavior` (7 tests).

## Files Changed
- `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` — Added explicit assertion test for literal model recommendation line in realistic fixture

## Self-Review Findings

None. The change is minimal, focused, and directly addresses the failing criterion. The fixture files already existed with correct structure, and the implementation already has full fence-aware parsing support. The test suite validates all required fence behaviors: suppression of fake headings, preservation of post-fence content, required-section validation ignoring fenced content, and fence-shape rules for backticks, tildes, indentation, closing conditions, and unclosed fences.
