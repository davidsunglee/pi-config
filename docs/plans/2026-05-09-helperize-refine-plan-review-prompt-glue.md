# Helperize remaining refine-plan review/prompt glue

**Source:** TODO-bd750b75

## Goal

Replace the remaining prompt-level/manual glue inside `plan-refiner` with tested helper scripts so review prompt assembly, review artifact parsing, and planner edit prompt assembly are deterministic without requiring a full `generate-plan` / `execute-plan` lifecycle to validate the change.

## Architecture summary

Keep the existing `refine-plan` and `plan-refiner` contracts intact, but move the remaining mechanical steps into three focused helpers under `agent/skills/refine-plan/scripts/`. The coordinator should continue to rely on the shared artifact-handoff, provenance-validation, and model-dispatch helpers, while delegating temp-file creation, prompt filling, verdict parsing, severity counting, and blocking-findings extraction to dedicated refine-plan helpers with direct unittest coverage. Validation for this work should be targeted helper tests plus prompt/doc rewiring checks, not a full workflow execution.

## Tech stack

Python 3 with `argparse`, `json`, `pathlib`, `tempfile`, and `unittest`, plus the existing markdown prompt contracts in `agent/skills/refine-plan/` and `agent/skills/generate-plan/`, and shared helpers in `agent/skills/_shared/scripts/`.

## File Structure

- `agent/skills/refine-plan/scripts/prepare-plan-review-prompt.py` (Create) — Builds reviewer provenance, computes era review paths, and writes a filled review prompt to a temp file.
- `agent/skills/refine-plan/scripts/validate-and-parse-plan-review.py` (Create) — Validates the review artifact handoff and parses verdict / severity / blocking findings data.
- `agent/skills/refine-plan/scripts/prepare-plan-edit-prompt.py` (Create) — Fills the planner edit prompt from blocking findings and plan provenance.
- `agent/skills/refine-plan/scripts/tests/test_prepare_plan_review_prompt.py` (Create) — Coverage for review-prompt helper path/provenance/prompt generation.
- `agent/skills/refine-plan/scripts/tests/test_validate_and_parse_plan_review.py` (Create) — Coverage for review artifact validation and verdict/finding parsing.
- `agent/skills/refine-plan/scripts/tests/test_prepare_plan_edit_prompt.py` (Create) — Coverage for edit-prompt helper generation.
- `agent/skills/refine-plan/scripts/tests/fixtures/review-approved.md` (Create) — Approved review fixture.
- `agent/skills/refine-plan/scripts/tests/fixtures/review-approved-with-concerns.md` (Create) — Approved-with-concerns review fixture.
- `agent/skills/refine-plan/scripts/tests/fixtures/review-not-approved.md` (Create) — Not-approved review fixture with blocking findings.
- `agent/skills/refine-plan/scripts/tests/fixtures/review-none-sections.md` (Create) — Review fixture whose severity sections render `_None._`.
- `agent/skills/refine-plan/refine-plan-prompt.md` (Modify) — Replace manual prompt-prep and review-parsing prose with helper invocations.
- `agent/skills/refine-plan/scripts/README.md` (Modify) — Document the new helpers and the targeted helper-test validation path.

### Task 1: Add the review-prompt preparation helper

**Files:**
- Create: `agent/skills/refine-plan/scripts/prepare-plan-review-prompt.py`
- Create: `agent/skills/refine-plan/scripts/tests/test_prepare_plan_review_prompt.py`

**Steps:**
- [ ] **Step 1:** Implement `prepare-plan-review-prompt.py` so it accepts the plan/provenance/spec/structural-only inputs already assembled by `refine-plan`, plus the resolved reviewer `model` and `cli`.
- [ ] **Step 2:** Have the helper build the exact `**Reviewer:** <provider>/<model> via <cli>` line, compute the era-specific absolute review output path, and write the filled review prompt to a temp file using Python `tempfile` instead of shell `mktemp`.
- [ ] **Step 3:** Return structured JSON that includes at least `prompt_path`, `review_path`, and `reviewer_provenance`.
- [ ] **Step 4:** Add focused tests for primary/fallback reviewer inputs, absolute review-path construction, and prompt output that preserves literal placeholder-like content from input values.

**Acceptance criteria:**
- The helper returns deterministic prompt metadata and writes a filled prompt file for the supplied reviewer model/cli.
  Verify: run `cd agent && python3 -m unittest discover -s skills/refine-plan/scripts/tests -p "test_prepare_plan_review_prompt.py" -v` and confirm the metadata/path assertions pass.
- Temp-file creation is handled inside the helper without depending on shell `mktemp` semantics.
  Verify: the same test suite asserts the helper creates readable prompt files via Python-managed temp paths on each run.

**Model recommendation:** standard

### Task 2: Add the review artifact validation/parser helper

**Files:**
- Create: `agent/skills/refine-plan/scripts/validate-and-parse-plan-review.py`
- Create: `agent/skills/refine-plan/scripts/tests/test_validate_and_parse_plan_review.py`
- Create: `agent/skills/refine-plan/scripts/tests/fixtures/review-approved.md`
- Create: `agent/skills/refine-plan/scripts/tests/fixtures/review-approved-with-concerns.md`
- Create: `agent/skills/refine-plan/scripts/tests/fixtures/review-not-approved.md`
- Create: `agent/skills/refine-plan/scripts/tests/fixtures/review-none-sections.md`

**Steps:**
- [ ] **Step 1:** Implement `validate-and-parse-plan-review.py` so it validates `REVIEW_ARTIFACT:` handoff/path/existence via the shared artifact-handoff contract and enforces exact first-line provenance matching.
- [ ] **Step 2:** Reuse `_shared/scripts/validate-review-provenance.py` for defense-in-depth provenance validation and keep failure output machine-readable.
- [ ] **Step 3:** Parse `**Verdict:**` robustly, count Critical / Important / Minor findings from the review sections, and extract only Critical + Important findings into `blocking_findings_markdown`.
- [ ] **Step 4:** Add fixtures and tests for `Approved`, `Approved with concerns`, `Not approved`, `_None._` severity sections, and the handoff/provenance/path failure cases called out in the todo.

**Acceptance criteria:**
- The helper validates artifact handoff/provenance failures deterministically and reports them without ad hoc inline parsing.
  Verify: run `cd agent && python3 -m unittest discover -s skills/refine-plan/scripts/tests -p "test_validate_and_parse_plan_review.py" -v` and confirm the marker/path/provenance failure cases pass.
- The helper parses verdicts, severity counts, and blocking findings correctly for the supported review shapes.
  Verify: the same test suite asserts the approved / approved-with-concerns / not-approved / `_None._` fixtures produce the expected verdict and count JSON.

**Model recommendation:** standard

### Task 3: Add the planner edit-prompt preparation helper

**Files:**
- Create: `agent/skills/refine-plan/scripts/prepare-plan-edit-prompt.py`
- Create: `agent/skills/refine-plan/scripts/tests/test_prepare_plan_edit_prompt.py`

**Steps:**
- [ ] **Step 1:** Implement `prepare-plan-edit-prompt.py` so it accepts blocking findings markdown plus the existing plan/provenance/spec inputs and fills the planner edit prompt deterministically.
- [ ] **Step 2:** Have the helper write the filled edit prompt to a temp file and return structured JSON with at least `prompt_path`.
- [ ] **Step 3:** Add focused tests for task-artifact and inline-spec cases, ensuring the helper preserves the existing edit-prompt contract without manual placeholder JSON plumbing.

**Acceptance criteria:**
- The helper produces a filled planner edit prompt file from blocking findings and provenance inputs.
  Verify: run `cd agent && python3 -m unittest discover -s skills/refine-plan/scripts/tests -p "test_prepare_plan_edit_prompt.py" -v` and confirm the prompt-path/content assertions pass.
- The helper supports both on-disk task-artifact and inline-spec inputs without requiring ad hoc coordinator glue.
  Verify: the same test suite covers both provenance shapes and confirms the correct prompt sections are populated.

**Model recommendation:** standard

### Task 4: Rewire `plan-refiner` docs/prompts to use the helpers

**Files:**
- Modify: `agent/skills/refine-plan/refine-plan-prompt.md`
- Modify: `agent/skills/refine-plan/scripts/README.md`

**Steps:**
- [ ] **Step 1:** Update `refine-plan-prompt.md` so the coordinator uses `prepare-plan-review-prompt.py` for primary/fallback review prompt preparation instead of manual temp-file and placeholder instructions.
- [ ] **Step 2:** Update `refine-plan-prompt.md` so review artifact handoff, verdict parsing, severity counting, and blocking-findings extraction are delegated to `validate-and-parse-plan-review.py`.
- [ ] **Step 3:** Update `refine-plan-prompt.md` so planner edit prompt preparation is delegated to `prepare-plan-edit-prompt.py`.
- [ ] **Step 4:** Document the new helpers and the targeted helper-test validation strategy in `agent/skills/refine-plan/scripts/README.md`, explicitly keeping full `generate-plan` / `execute-plan` lifecycle runs out of scope for this todo.

**Acceptance criteria:**
- The coordinator prompt references the new helper invocations for review prompt prep, review validation/parsing, and edit prompt prep instead of describing manual fill-template / verdict-parsing glue.
  Verify: read `agent/skills/refine-plan/refine-plan-prompt.md` and confirm the helper names replace the current manual prompt-prep and review-parsing substeps.
- The helper README documents the three new scripts and the targeted validation path without requiring a full workflow lifecycle run.
  Verify: read `agent/skills/refine-plan/scripts/README.md` and confirm it documents the new helpers plus the refine-plan helper unittest command.
- The full refine-plan helper suite passes after the rewiring.
  Verify: run `cd agent && python3 -m unittest discover -s skills/refine-plan/scripts/tests -p "test_*.py" -v` and confirm all helper tests pass.

**Model recommendation:** standard

## Dependencies

- Task 4 depends on: Task 1, Task 2, Task 3

## Risk Assessment

The main risks are accidentally changing `plan-refiner`'s outward failure taxonomy, drifting from the existing prompt placeholders, or writing helpers that duplicate shared logic inconsistently. Keep the helper interfaces narrow, reuse the existing shared artifact/provenance contracts rather than forking them, and validate behavior with targeted helper tests instead of broad workflow runs that make failures harder to localize.

## Test Command

```bash
cd agent && python3 -m unittest discover -s skills/refine-plan/scripts/tests -p "test_*.py" -v
```