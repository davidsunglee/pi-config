**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The implementation meets the suffixed task ID requirements while preserving integer task IDs in the emitted JSON. Regression coverage exercises headings, dependencies, wave placement, malformed suffix variants, and the existing full parser suite passes.

### Strengths

- Shared task ID parsing and normalization keeps plain IDs as integers while preserving suffixed IDs as strings (`agent/skills/execute-plan/scripts/extract-plan-tasks.py:75-92`).
- Ordering and wave/cycle traversal use a common numeric-prefix/suffix sort key, avoiding mixed `int`/`str` comparison failures (`agent/skills/execute-plan/scripts/extract-plan-tasks.py:95-106`, `agent/skills/execute-plan/scripts/extract-plan-tasks.py:212-244`).
- The contiguous-order validation correctly requires base integer tasks for suffixed insertions and rejects suffixes declared out of canonical order (`agent/skills/execute-plan/scripts/extract-plan-tasks.py:364-399`).
- New tests cover the main acceptance cases, including `15a` with an em dash, suffixed dependency references, wave placement, orphan/out-of-order suffixes, malformed suffix variants, and `--task-number 2a` filtering (`agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py:1352-1507`).
- Verification run: `python3 -m unittest agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` completed successfully with 124 tests passing.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

- **agent/skills/execute-plan/scripts/extract-plan-tasks.py:700: Invalid `--task-number` values now succeed with an empty task list**
  - **What:** `normalize_task_id()` returns `None` for malformed CLI values such as `2A` or `abc`, and the filter then emits a successful result with zero tasks.
  - **Why it matters:** This is a small CLI ergonomics/backward-compatibility regression from the prior `type=int` behavior, which rejected invalid values up front.
  - **Recommendation:** If `wanted is None`, print a clear error and exit non-zero before filtering.

### Recommendations

- Consider anchoring `DEP_INNER_RE` if future work needs malformed dependency references (for example `Task 2ab`) to be rejected rather than partially ignored or parsed.
