STATUS: DONE

## Completed

Implemented fence-aware parsing in the extract-plan-tasks script to ensure that markdown code fences (both backticks and tildes) are properly recognized and their content is excluded from task/section detection and parsing.

### Fence Detection Implementation
- Added `get_fence_aware_lines()` function that:
  - Detects fence openers (3+ backticks or tildes with optional leading whitespace)
  - Recognizes fence closers (same marker type, at least as many markers, only whitespace after)
  - Handles mismatched marker types (tildes don't close backticks and vice versa)
  - Marks unclosed fences as suppressing content to EOF
  
### Parser Updates
- Modified `parse_plan()` to skip task/section detection inside fences
- Updated required section validation to ignore fenced content
- Made dependency, goal, and test command parsing fence-aware
- Updated `parse_task_block()` to skip task metadata parsing inside fences

### Test Coverage
- **plan-fenced-headings-minimal.md**: Fixture with a single real task containing a fenced block with fake task headings; validates no spurious tasks are created
- **plan-fenced-headings-realistic.md**: Fixture demonstrating realistic markdown in fenced blocks with model recommendation preservation after fence closure
- **TestFencedHeadingsMinimal** (5 tests): Verify minimal fixture parses to only one real task and post-fence content is included
- **TestFencedHeadingsRealistic** (4 tests): Verify realistic fixture preserves model recommendations and content after fences
- **TestFenceBehavior** (7 tests): Comprehensive fence behavior testing covering:
  - Backtick and tilde fences suppress heading parsing inside
  - Indented fences work correctly
  - Same-length closing fences properly close
  - Longer closing fences properly close
  - Mismatched marker types do not close fences
  - Unclosed fences suppress parsing to EOF

## Tests

All 77 tests in test_extract_plan_tasks.py pass, including:
- 5 new minimal fixture tests
- 4 new realistic fixture tests  
- 7 new fence behavior tests

**RED:** Tests were already written in the test file and failing (Task 999 was being parsed from inside fence, required sections were being found inside fences).

**GREEN:** Implemented fence-aware parsing logic. All tests now pass:
- No spurious Task 999 is created from fenced content
- Required sections inside fences are properly ignored by validator
- Fence-shape rules (backticks, tildes, indentation, closing logic, mismatched markers, unclosed) are verified by tests

## Files Changed
- `agent/skills/execute-plan/scripts/extract-plan-tasks.py` — Added fence detection and made parser fence-aware throughout
- `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` — Fixed test_mismatched_markers_do_not_close fixture and assertion to correctly expect validation failure when model_recommendation is suppressed by unclosed fence

## Self-Review Findings

Reviewed fence detection logic for correctness:
- Fence markers must be 3+ characters (backticks or tildes)
- Closers require same marker type and count >= opener count
- Closers must have only whitespace after markers (no info strings like "bash")
- Unclosed fences extend suppression to EOF of document/task block
- All edge cases tested: indentation, mismatched types, longer closers, inline test commands

No issues found. Implementation correctly follows markdown fence specification and satisfies all acceptance criteria.
