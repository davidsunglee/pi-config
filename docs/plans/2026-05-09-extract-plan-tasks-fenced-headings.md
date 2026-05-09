# Fence-aware parsing for heading-like lines inside code fences

**Source:** TODO-aa932228

## Goal

Harden `agent/skills/execute-plan/scripts/extract-plan-tasks.py` so heading-like markdown inside fenced code blocks is ignored when detecting task boundaries and validating required sections, while preserving the current lightweight regex-based parser.

## Architecture summary

Keep the parser simple, but route its structure-sensitive scans through a small fence-state tracker. The tracker only decides whether a line is currently inside a fenced code block and must support backtick and tilde fences, fence lengths of 3+, leading indentation, same-marker closing fences with closing length >= opener length, and unclosed fences that stay open to EOF. Use one minimal synthetic fixture and one realistic regression fixture to pin the failure mode.

## Tech stack

Python 3, `re`, `argparse`, `json`, and `unittest` fixtures under `agent/skills/execute-plan/scripts/tests/`.

## File Structure

- `agent/skills/execute-plan/scripts/extract-plan-tasks.py` (Modify) — Make task-start detection, task-end detection, and required-section scanning ignore heading-like lines while inside fenced code blocks.
- `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` (Modify) — Add regression coverage for fenced headings, fence-shape rules, and post-fence parsing.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-minimal.md` (Create) — Minimal synthetic fixture with fake `## ...` and `### Task 999: ...` lines inside a fence.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-realistic.md` (Create) — Realistic regression fixture modeled on the observed failure pattern, including fenced markdown content and `**Model recommendation:** standard` after the fence.

### Task 1: Add regression coverage for fenced headings

**Files:**
- Modify: `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-minimal.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-fenced-headings-realistic.md`

**Steps:**
- [ ] **Step 1:** Add a minimal fixture with a real task that contains a fenced block holding both `## Completion contract` and `### Task 999: Not a real task`, followed by real task content after the fence.
- [ ] **Step 2:** Add a realistic fixture based on the observed failure pattern from `docs/plans/2026-05-08-2026-05-08-define-spec-and-artifact-handoff-fixes.md`, keeping fenced markdown headings inside task content and `**Model recommendation:** standard` after the fence.
- [ ] **Step 3:** Add failing tests that assert fenced headings do not create extra tasks, do not truncate the surrounding task block, and do not prevent post-fence content from being parsed.
- [ ] **Step 4:** Add fence-behavior tests for both backtick and tilde fences, leading indentation, closing fences that are at least as long as the opener, mismatched marker types that must not close the fence, and unclosed fences that suppress structure parsing to EOF.

**Acceptance criteria:**
- The minimal fixture parses to the expected real tasks only.
  Verify: run the parser against `plan-fenced-headings-minimal.md` and confirm no task numbered `999` appears.
- The realistic fixture keeps content after the fenced block inside the real task.
  Verify: assert the parsed task block still contains the post-fence `**Model recommendation:** standard` line and any following task content.
- Required-section validation ignores heading-like lines inside fenced blocks.
  Verify: add a test that would previously have been misled by a fenced `## ...` line and confirm the section validator reports only real structure.
- Fence-shape rules are pinned by tests.
  Verify: the new cases cover backticks, tildes, indentation, same-marker closing, longer closing fences, and unclosed fences.

**Model recommendation:** cheap

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

## Dependencies

- Task 2 depends on: Task 1

## Risk Assessment

Main risk is treating real headings as fenced content or failing to close a fence correctly, which would hide real structure. Keep the change small and rely on explicit regression coverage for opener/closer rules, mismatched marker handling, and the real-world failure pattern.

## Test Command

```bash
cd agent && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_extract_plan_tasks.py" -v
```
