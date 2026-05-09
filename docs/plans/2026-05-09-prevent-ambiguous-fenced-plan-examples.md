# Prevent ambiguous fenced examples from breaking plan validation

**Source:** TODO-857b3552

## Goal

Prevent plan artifacts from containing ambiguous fenced examples that can confuse `extract-plan-tasks.py`, and replace the current misleading missing-section failure with a dedicated ambiguous-fence protocol error when malformed plans still appear.

## Architecture summary

Add one shared Python helper that understands this specific malformed-fence pattern in plan prose/examples, use it in two places, and keep the behavior deterministic. `extract-plan-tasks.py` should import the helper to hard-fail with a dedicated `ambiguous_nested_fence` error before section validation reports misleading missing sections. The plan-writing workflows should run the same helper in rewrite mode after initial planner output and after planner edit passes so newly generated/refined plans are normalized to unambiguous outer fences before later validation.

## Tech stack

Python 3, `re`, `json`, `argparse`, and `unittest` in `agent/skills/_shared/scripts/tests/` and `agent/skills/execute-plan/scripts/tests/`, plus markdown workflow contracts in `agent/skills/generate-plan/`, `agent/skills/refine-plan/`, and `agent/agents/planner.md`.

## File Structure

- `agent/skills/_shared/scripts/plan_fence_hardening.py` (Create) — Shared helper with pure functions for ambiguous-fence detection plus a CLI rewrite mode for plan files.
- `agent/skills/_shared/scripts/tests/test_plan_fence_hardening.py` (Create/Modify) — Unit and smoke coverage for detection metadata, rewrite behavior, and rewrite-then-parse flow.
- `agent/skills/execute-plan/scripts/extract-plan-tasks.py` (Modify) — Emit `ambiguous_nested_fence` protocol errors before misleading `missing_required_section` failures.
- `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` (Modify) — Regression tests for malformed and safe nested-fence plan fixtures.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-ambiguous-nested-fence.md` (Create) — Malformed outer triple-backtick example that contains an inner triple-backtick fence and hides later real sections.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-safe-tilde-outer-fence.md` (Create) — Equivalent safe plan using `~~~` as the outer example fence.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-safe-long-backtick-outer-fence.md` (Create) — Equivalent safe plan using a longer backtick outer fence.
- `agent/skills/generate-plan/SKILL.md` (Modify) — Run the shared helper after `PLAN_ARTIFACT` validation and before `refine-plan` handoff.
- `agent/skills/refine-plan/refine-plan-prompt.md` (Modify) — Require the plan-refiner to run the shared helper after each planner edit pass and before the next review iteration.
- `agent/agents/planner.md` (Modify) — State the exact rule for emitting unambiguous example fences.
- `agent/skills/generate-plan/edit-plan-prompt.md` (Modify) — Tell edit-mode planner passes to preserve or repair fence safety when examples contain nested fences.

### Task 1: Build the shared ambiguous-fence detection and rewrite helper

**Files:**
- Create: `agent/skills/_shared/scripts/plan_fence_hardening.py`
- Create: `agent/skills/_shared/scripts/tests/test_plan_fence_hardening.py`

**Steps:**
- [ ] **Step 1:** Create `plan_fence_hardening.py` with pure functions `detect_ambiguous_nested_fences(text)` and `rewrite_ambiguous_nested_fences(text)` that scan fenced blocks in plan markdown, track outer fence marker/length, and identify same-marker inner runs that would prematurely terminate the outer fence.
- [ ] **Step 2:** Make `detect_ambiguous_nested_fences(text)` return structured issue records with 1-based line numbers, marker type, outer fence length, inner run length, and a remediation hint that tells the caller to switch the outer fence to `~~~` or use a longer same-marker fence.
- [ ] **Step 3:** Add a CLI entrypoint `python3 agent/skills/_shared/scripts/plan_fence_hardening.py --plan <path> --rewrite-in-place` that rewrites only the ambiguous outer example fences, preferring `~~~` when the payload contains triple backticks and `~~~` is not already present inside the payload, otherwise choosing a fence marker/length strictly longer than the longest same-marker run inside that payload.
- [ ] **Step 4:** Add focused unit tests that cover malformed triple-backtick nesting, safe `~~~` outer fences, safe longer-backtick outer fences, unchanged already-safe content, and preservation of the inner literal fenced payload after rewrite.

**Acceptance criteria:**
- The shared helper reports ambiguous nested fences with line numbers and a concrete remediation hint.
  Verify: run `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_plan_fence_hardening.py" -v` and confirm the detection cases pass.
- Rewrite mode converts the malformed outer example fence to an unambiguous fence without changing the inner literal fenced payload.
  Verify: the same test suite asserts that the rewritten text still contains the original inner fenced snippet verbatim while changing only the outer fence shape.
- Already-safe plans are left unchanged.
  Verify: the same test suite asserts no rewrite occurs for both the `~~~` outer-fence case and the longer-backtick outer-fence case.

**Model recommendation:** standard

### Task 2: Teach `extract-plan-tasks.py` to fail with a dedicated ambiguous-fence error

**Files:**
- Modify: `agent/skills/execute-plan/scripts/extract-plan-tasks.py`
- Modify: `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-ambiguous-nested-fence.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-safe-tilde-outer-fence.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-safe-long-backtick-outer-fence.md`

**Steps:**
- [ ] **Step 1:** Add three parser fixtures: one malformed plan whose outer triple-backtick example contains an inner triple-backtick fence before the real `## Dependencies` / `## Risk Assessment` sections, one equivalent plan using `~~~` as the outer fence, and one equivalent plan using a longer backtick outer fence.
- [ ] **Step 2:** Import `detect_ambiguous_nested_fences(text)` into `extract-plan-tasks.py` and run it before required-section validation so malformed plans stop on the real protocol problem instead of falling through to `missing_required_section`.
- [ ] **Step 3:** Emit a new error kind `ambiguous_nested_fence` in the existing `{"errors": [...]}` stderr shape, and include at least `line`, `marker`, `outer_fence_length`, `inner_fence_length`, and `hint` fields on each reported issue.
- [ ] **Step 4:** Extend `test_extract_plan_tasks.py` so the malformed fixture asserts `ambiguous_nested_fence` is returned with the remediation hint, while the `~~~` and longer-backtick fixtures both parse successfully and still expose the real later sections.

**Acceptance criteria:**
- The malformed ambiguous fixture fails with `ambiguous_nested_fence` instead of a misleading `missing_required_section` error.
  Verify: run `cd agent && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_extract_plan_tasks.py" -v` and confirm the malformed-fixture regression checks for `ambiguous_nested_fence` pass.
- The safe `~~~` outer-fence fixture parses successfully.
  Verify: the same test suite asserts exit code 0 and successful task parsing for `plan-safe-tilde-outer-fence.md`.
- The safe longer-backtick outer-fence fixture parses successfully.
  Verify: the same test suite asserts exit code 0 and successful task parsing for `plan-safe-long-backtick-outer-fence.md`.
- Existing parser behavior outside this malformed case remains intact.
  Verify: the same test suite still passes the existing missing-section, dependency, task-order, and `## Test Command` coverage.

**Model recommendation:** standard

### Task 3: Wire deterministic fence hardening into generate-plan and refine-plan outputs

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`
- Modify: `agent/skills/refine-plan/refine-plan-prompt.md`
- Modify: `agent/agents/planner.md`
- Modify: `agent/skills/generate-plan/edit-plan-prompt.md`
- Modify: `agent/skills/_shared/scripts/tests/test_plan_fence_hardening.py`

**Steps:**
- [ ] **Step 1:** Update `agent/skills/generate-plan/SKILL.md` so that after `PLAN_ARTIFACT` handoff validation succeeds, it runs `python3 agent/skills/_shared/scripts/plan_fence_hardening.py --plan "<validated plan path>" --rewrite-in-place` and stops on non-zero exit before handing off to `refine-plan`.
- [ ] **Step 2:** Update `agent/skills/refine-plan/refine-plan-prompt.md` so that after each planner edit pass returns, the plan-refiner runs the same helper against `{PLAN_PATH}`, treats helper failure as `STATUS: failed`, and only then continues to the next review iteration or final approval path.
- [ ] **Step 3:** Update `agent/agents/planner.md` and `agent/skills/generate-plan/edit-plan-prompt.md` to state the exact authoring rule: when an example payload contains triple backticks, prefer `~~~` for the outer fence if that marker is unambiguous for the payload; otherwise choose a fence marker/length strictly longer than any same-marker run inside the payload.
- [ ] **Step 4:** Extend `test_plan_fence_hardening.py` with a temp-file smoke test that rewrites a malformed plan via `--rewrite-in-place` and then runs `agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan <temp-file>` successfully on the corrected artifact.

**Acceptance criteria:**
- The initial generate-plan path explicitly hardens the written plan file before `refine-plan` starts.
  Verify: read `agent/skills/generate-plan/SKILL.md` and confirm the `plan_fence_hardening.py --rewrite-in-place` step appears after `PLAN_ARTIFACT` validation and before the `refine-plan` handoff.
- The refine-plan edit loop explicitly hardens plan files after planner edit passes.
  Verify: read `agent/skills/refine-plan/refine-plan-prompt.md` and confirm the helper invocation occurs after the planner edit pass and before the next review iteration proceeds.
- Planner authoring and edit-mode guidance both spell out the `~~~` preference and the longer same-marker fallback.
  Verify: `grep -n "~~~" agent/agents/planner.md agent/skills/generate-plan/edit-plan-prompt.md` shows the new rule text in both files.
- A malformed temp plan rewritten by the helper becomes parseable by `extract-plan-tasks.py`.
  Verify: rerun `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_plan_fence_hardening.py" -v` and confirm the rewrite-then-parse smoke test passes.

**Model recommendation:** standard

## Dependencies

- Task 2 depends on: Task 1
- Task 3 depends on: Task 1

## Risk Assessment

The main risks are over-rewriting valid example fences, wiring the rewrite helper into the wrong workflow step, or introducing a new validator error that breaks the existing stderr shape. Keep the helper narrowly focused on outer fences whose payload proves ambiguity, preserve the current `{"errors": [...]}` response wrapper, and pin both the pure helper behavior and the rewrite-then-parse flow with regression tests.

## Test Command

```bash
cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_plan_fence_hardening.py" -v && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_extract_plan_tasks.py" -v
```