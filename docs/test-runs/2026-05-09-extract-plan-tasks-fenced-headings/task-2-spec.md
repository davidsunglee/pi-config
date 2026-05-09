### Task 2: Make structural scans fence-aware in `extract-plan-tasks.py`

**Files:**
- Modify: `agent/skills/execute-plan/scripts/extract-plan-tasks.py`
- Modify: `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py`

**Steps:**
- [ ] **Step 1:** Add a small fence-state helper that tracks whether each scanned line is inside a fenced code block using the required opener/closer rules, without introducing a full markdown parser.
- [ ] **Step 2:** Reuse that helper in task-start detection so `### Task N: ...` lines inside fences are ignored.
- [ ] **Step 3:** Reuse that helper in task block end detection so fake `## ...` and `### Task N: ...` lines inside fences do not truncate the enclosing real task block.
- [ ] **Step 4:** Reuse that helper in required-section validation/body scanning so fenced headings do not satisfy or terminate real top-level sections.
- [ ] **Step 5:** Run the focused parser test suite and fix any regressions without broadening scope beyond fenced-heading handling.

**Acceptance criteria:**
- All three affected structure-detection paths are fence-aware.
  Verify: the new regression tests pass for task discovery, task block boundaries, and required-section validation.
- Post-fence task content is still parsed normally.
  Verify: assert the parser still captures `model_recommendation == "standard"` when that line appears after a fenced block.
- Existing parser behavior outside fenced blocks remains intact.
  Verify: run the existing `test_extract_plan_tasks.py` suite and confirm it stays green.

**Model recommendation:** standard