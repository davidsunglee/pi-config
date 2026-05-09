## Per-Criterion Verdicts

[Criterion 1] PASS
  recipe: the new regression tests pass for task discovery, task block boundaries, and required-section validation.
  evidence: agent/skills/execute-plan/scripts/extract-plan-tasks.py:79-178, agent/skills/execute-plan/scripts/extract-plan-tasks.py:277-343, agent/skills/execute-plan/scripts/extract-plan-tasks.py:447-534, agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py:510-583
  reason: `get_fence_aware_lines()` is reused in required-section validation, task-start discovery, task block end detection, and task-block parsing, so fenced headings are ignored across the affected structural scans. The test file adds regressions covering fake fenced task headings, post-fence block continuity, and fenced fake required sections.

[Criterion 2] PASS
  recipe: assert the parser still captures `model_recommendation == "standard"` when that line appears after a fenced block.
  evidence: agent/skills/execute-plan/scripts/extract-plan-tasks.py:447-534, agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py:543-566
  reason: Task-block parsing skips only lines marked inside fences, then resumes normal parsing and still reads `**Model recommendation:**` afterward. The realistic fenced-heading regression explicitly asserts `model_recommendation == "standard"` after the fenced block.

[Criterion 3] PASS
  recipe: run the existing `test_extract_plan_tasks.py` suite and confirm it stays green.
  evidence: agent/skills/execute-plan/scripts/extract-plan-tasks.py:79-178, agent/skills/execute-plan/scripts/extract-plan-tasks.py:277-534, agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py:1-509
  reason: The fence-aware changes are narrowly scoped to ignoring fenced lines while leaving the existing parsing branches and preexisting test coverage in place. The existing suite remains present alongside the added fence regressions, with no file evidence of unrelated behavior changes outside fenced-block handling.

## Overall Verdict

VERDICT: PASS
summary: All three criteria are satisfied by the file evidence. The parser now computes fence-aware line membership and reuses it for required-section validation, task discovery, task boundary detection, and task-block scanning, while the test suite includes focused regressions for fenced fake headings and preserved post-fence parsing without indicating unrelated behavior changes.