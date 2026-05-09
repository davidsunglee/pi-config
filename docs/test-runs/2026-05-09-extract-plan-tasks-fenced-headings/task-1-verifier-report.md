## Per-Criterion Verdicts

[Criterion 1] PASS
  recipe: run the parser against `plan-fenced-headings-minimal.md` and confirm no task numbered `999` appears.
  evidence: agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-minimal.md:1-61; agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py:438-472; agent/skills/execute-plan/scripts/extract-plan-tasks.py:79-138, 450-529
  reason: The minimal fixture places `### Task 999` inside a fenced block and the new tests assert the parser returns exactly one task and excludes task 999. The parser now skips fenced lines while detecting task structure and task-block fields.

[Criterion 2] PASS
  recipe: assert the parsed task block still contains the post-fence `**Model recommendation:** standard` line and any following task content.
  evidence: agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-realistic.md:1-67; agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py:474-507; agent/skills/execute-plan/scripts/extract-plan-tasks.py:450-538
  reason: The realistic fixture puts `**Model recommendation:** standard` after a fenced markdown block, and the tests explicitly assert both the post-fence prose and the literal model recommendation line remain in `task_spec` while the parsed model recommendation is `standard`.

[Criterion 3] PASS
  recipe: add a test that would previously have been misled by a fenced `## ...` line and confirm the section validator reports only real structure.
  evidence: agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-fake-section.md:1-52; agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py:509-531; agent/skills/execute-plan/scripts/extract-plan-tasks.py:141-188
  reason: The fake-section fixture contains `## Architecture summary` only inside a fence, and the tests require a nonzero exit, require `architecture_summary` to be reported missing, and require exactly one missing-section error. The validator now ignores lines marked as fenced when checking required sections.

[Criterion 4] PASS
  recipe: the new cases cover backticks, tildes, indentation, same-marker closing, longer closing fences, and unclosed fences.
  evidence: agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py:533-904; agent/skills/execute-plan/scripts/extract-plan-tasks.py:79-138
  reason: `TestFenceBehavior` includes explicit cases for backtick fences, tilde fences, indented fences, same-length closing fences, longer closing fences, mismatched markers that do not close, and unclosed fences to EOF. `get_fence_aware_lines` implements the same marker-type and minimum-length closing rules those tests pin.

## Overall Verdict

VERDICT: PASS
summary: All four criteria pass. The added fixtures and tests cover the minimal and realistic fenced-heading regressions, required-section validation now ignores fenced fake headings, and fence-shape behavior is pinned for backticks, tildes, indentation, valid closers, mismatched markers, and unclosed fences.