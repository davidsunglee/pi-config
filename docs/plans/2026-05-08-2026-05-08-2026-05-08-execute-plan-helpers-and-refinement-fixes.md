# Plan: Execute-plan helpers, menu standardization, and inter-era refinement fix

**Spec:** `docs/specs/2026-05-08-execute-plan-helpers-and-refinement-fixes.md`
**Source:** TODO-f7b45924

## Goal

Extract six mechanical procedures from `agent/skills/execute-plan/SKILL.md` into deterministic Python helpers (with shared/private placement matching their consumers), normalize three user-facing menus inside that skill so all "stop" options use a single byte-equal verbatim line and all options use mnemonic letters, and fix the inter-era refinement regression in `refine-plan` and `refine-code` where `(a) Keep iterating` at budget exhaustion currently re-reviews the unedited artifact instead of acting on the prior era's findings. The execute-plan SKILL.md must end up at most 600 lines.

## Architecture summary

Three concurrent change streams:

- **Helper extractions (Part A).** Six independent Python helpers under `agent/skills/_shared/scripts/` (cross-skill: `reconcile-test-run.py`, `git-workspace-status.py`, `detect-test-command.py`) and `agent/skills/execute-plan/scripts/` (execute-plan-private: extended `extract-plan-tasks.py`, new `compute-verifier-file-set.py`, new `parse-coder-report.py`). Each helper has structured stdout JSON, structured stderr JSON on protocol error, `--help` documenting all protocol-error labels, and unit tests under its skill's existing `scripts/tests/` layout invoked by `npm run test:helpers`.
- **SKILL.md rewrite (Parts A consumption + Part B menus).** `agent/skills/execute-plan/SKILL.md` Step 0/2/3/5/7/9/10/11/12/14/16 are rewritten in place to delegate to the new helpers; Steps 10/12/13/15/16 menus are normalized to byte-equal verbatim stop lines and mnemonic letter options. Cap: ≤ 600 lines.
- **Carry-over edit pass (Part C).** New optional `{CARRY_OVER_REVIEW}` placeholder threaded through `refine-plan-prompt.md`, `refine-plan/SKILL.md`, `fill-refine-plan-prompt.py` (and the parallel `refine-code` artifacts). When set, the inner agent performs one targeted edit pass against the prior era's findings before the new era's first review; that pass does not consume an iteration of the new budget.

## Tech stack

Python 3 (helpers), Markdown skill files. Test framework: Python `unittest`. Test runner entry point: `npm run test:helpers` (from `agent/`). No new runtime dependencies.

## File Structure

- `agent/skills/execute-plan/scripts/extract-plan-tasks.py` (Modify) — Add section-presence validation, dependency reference validation, dependency cycle detection, and `waves` output with sub-wave splitting at `MAX_PARALLEL_HARD_CAP`. Keep `parse_plan(text)` and a new `compute_waves(tasks)` as separate functions.
- `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` (Modify) — Add tests for new error kinds, wave grouping, sub-wave splitting, `--max-parallel-hard-cap` override.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-clean-with-deps.md` (Create) — Fixture: clean linear-deps plan for wave-grouping happy path.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-parallel-only.md` (Create) — Fixture: all tasks Wave 1.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-dep-cycle.md` (Create) — Fixture: A → B → A cycle.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-unknown-dep.md` (Create) — Fixture: dependency on nonexistent task number.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-header.md` (Create) — Fixture: missing all three top-level header components (Goal, Architecture summary, Tech stack).
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-arch-summary.md` (Create) — Fixture: missing only `## Architecture summary`.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-tech-stack.md` (Create) — Fixture: missing only `## Tech stack`.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-files.md` (Create) — Fixture: missing File Structure section.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-tasks.md` (Create) — Fixture: missing numbered tasks.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-deps.md` (Create) — Fixture: missing Dependencies section.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-risk.md` (Create) — Fixture: missing Risk Assessment.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-large-wave.md` (Create) — Fixture: wave with 10 parallel tasks for sub-wave splitting test.
- `agent/skills/_shared/scripts/reconcile-test-run.py` (Create) — Set arithmetic for baseline capture and per-run reconciliation. Uses `parse-test-runner-artifact.py` internally for artifact parsing.
- `agent/skills/_shared/scripts/tests/test_reconcile_test_run.py` (Create) — Unit tests for capture/reconcile modes and all classification outcomes.
- `agent/skills/_shared/scripts/tests/fixtures/baseline-failures-empty.json` (Create) — Fixture: `{"failing_identifiers": []}`.
- `agent/skills/_shared/scripts/tests/fixtures/baseline-failures-stable.json` (Create) — Fixture: `{"failing_identifiers": ["tests/test_a.py::test_one"]}`.
- `agent/skills/_shared/scripts/tests/fixtures/baseline-failures-malformed.json` (Create) — Fixture: not valid JSON.
- `agent/skills/_shared/scripts/git-workspace-status.py` (Create) — Read-only git workspace probe; replaces Step 0's inline bash block.
- `agent/skills/_shared/scripts/tests/test_git_workspace_status.py` (Create) — Unit tests covering plain repo, worktree, detached HEAD, dirty status, custom main branches, missing working dir.
- `agent/skills/execute-plan/scripts/compute-verifier-file-set.py` (Create) — Union-rule for verifier-visible file set; consumes JSON inputs from the orchestrator.
- `agent/skills/execute-plan/scripts/tests/test_compute_verifier_file_set.py` (Create) — Unit tests for both wave shapes, dedup, error labels.
- `agent/skills/_shared/scripts/detect-test-command.py` (Create) — Project file detection in resolution order with proper JSON parsing of `package.json`.
- `agent/skills/_shared/scripts/tests/test_detect_test_command.py` (Create) — Unit tests for every detection rule, malformed `package.json` fallthrough, no-marker case.
- `agent/skills/execute-plan/scripts/parse-coder-report.py` (Create) — Parse a coder worker's `## Report Format` text into structured JSON.
- `agent/skills/execute-plan/scripts/tests/test_parse_coder_report.py` (Create) — Unit tests for each STATUS branch, missing/invalid status, files-changed extraction.
- `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-done.md` (Create) — Fixture: well-formed DONE report with files-changed bullets.
- `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-done-with-concerns.md` (Create) — Fixture: DONE_WITH_CONCERNS with concerns block.
- `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-blocked.md` (Create) — Fixture: BLOCKED with blocker text.
- `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-needs-context.md` (Create) — Fixture: NEEDS_CONTEXT with needs text.
- `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-no-status.md` (Create) — Fixture: missing STATUS line.
- `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-bad-status.md` (Create) — Fixture: invalid STATUS token.
- `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-concerns-missing.md` (Create) — Fixture: DONE_WITH_CONCERNS without concerns block (warning case).
- `agent/skills/refine-plan/scripts/fill-refine-plan-prompt.py` (Modify) — Add `--carry-over-review` flag; substitute `{CARRY_OVER_REVIEW}` placeholder.
- `agent/skills/refine-plan/scripts/tests/test_fill_refine_plan_prompt.py` (Modify) — Add tests for carry-over flag with empty and populated values.
- `agent/skills/refine-code/scripts/fill-refine-code-prompt.py` (Modify) — Add `--carry-over-review` flag; substitute `{CARRY_OVER_REVIEW}` placeholder.
- `agent/skills/refine-code/scripts/tests/test_fill_refine_code_prompt.py` (Modify) — Add tests for carry-over flag with empty and populated values.
- `agent/skills/execute-plan/SKILL.md` (Modify) — Replace inline procedures with helper invocations (Steps 0, 2, 3, 5, 7, 9, 10, 11, 12, 14, 16); rewrite three menus (Step 13 budget-exhaustion, Step 13 wave-pacing, Step 15 not_approved_within_budget); trim Step 12 menu wording; cap file at ≤ 600 lines.
- `agent/skills/refine-plan/refine-plan-prompt.md` (Modify) — Add `## Carry-Over Review` placeholder section, add new "Carry-over edit pass (era handoff)" subsection before "Per-Iteration Full Review", extend Failure Modes table with new failure mode.
- `agent/skills/refine-plan/SKILL.md` (Modify) — Add `CARRY_OVER_REVIEW` input row to Step 1; thread `--carry-over-review` arg into Step 7's helper invocation; set carry-over before re-running from Step 6 in Step 10 § `not_approved_within_budget` `(a)`.
- `agent/skills/refine-code/refine-code-prompt.md` (Modify) — Add `## Carry-Over Review` placeholder section and new "Carry-over remediation pass" subsection before "Iteration 1: Full Review".
- `agent/skills/refine-code/SKILL.md` (Modify) — Thread `--carry-over-review` into Step 3's helper invocation; pass prior era's review file path on `(a) Keep iterating` re-entry from Step 5.
- `agent/skills/_shared/scripts/README.md` (Modify) — Document `reconcile-test-run.py`, `git-workspace-status.py`, `detect-test-command.py` in the Helpers list.
- `agent/skills/execute-plan/scripts/README.md` (Modify) — Document `compute-verifier-file-set.py`, `parse-coder-report.py`, and the extended `extract-plan-tasks.py` capabilities.
- `agent/skills/using-git-worktrees/SKILL.md` (Modify) — Replace hard-coded test command examples in step "Verify Clean Baseline" with a `detect-test-command.py` invocation.
- `agent/skills/finishing-a-development-branch/SKILL.md` (Modify) — Replace `<test command>` placeholder in Option 1 (Merge Locally) with a `detect-test-command.py` invocation.

## Tasks

### Task 1: Extend extract-plan-tasks.py with section validation, dependency validation, cycle detection, and wave grouping

**Files:**
- Modify: `agent/skills/execute-plan/scripts/extract-plan-tasks.py`
- Modify: `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-clean-with-deps.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-parallel-only.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-dep-cycle.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-unknown-dep.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-header.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-arch-summary.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-tech-stack.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-files.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-tasks.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-deps.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-risk.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-large-wave.md`

**Steps:**
- [ ] **Step 1:** Add a `SECTION_RULES` table near the top of `extract-plan-tasks.py` listing the seven required top-level entries: a non-empty `## Goal` (or `**Goal**:`) section, a non-empty `## Architecture summary` (or `**Architecture summary**:`) section, a non-empty `## Tech stack` (or `**Tech stack**:`) section, a File Structure section (`## File Structure`), at least one numbered task (`### Task <N>:` heading), a `## Dependencies` section, and a `## Risk Assessment` (case-insensitive: also accept `## Risk assessment`) section. All three header components (`goal`, `architecture_summary`, `tech_stack`) must be validated independently — non-empty Goal text alone is NOT sufficient.
- [ ] **Step 2:** Add a `validate_required_sections(text)` function called from `parse_plan` that returns a list of `{"kind": "missing_required_section", "section": "<name>"}` errors. Emit one error per missing section. Use exactly these section names in the error: `goal`, `architecture_summary`, `tech_stack`, `file_structure`, `numbered_tasks`, `dependencies`, `risk_assessment`. A header component is "missing" when its heading/label is absent OR its body content is empty after stripping whitespace.
- [ ] **Step 3:** Add a `validate_dependency_targets(tasks, dep_raw)` function: for every `(task_num, [dep_nums])` in `dep_raw`, every `dep_num` must be a known task number from `tasks`. Each unknown dep emits `{"kind": "dependency_unknown_target", "task_number": N, "unknown_dep": M}`.
- [ ] **Step 4:** Add a `detect_dependency_cycle(dep_raw)` function: build a directed graph (task → deps), detect a cycle via DFS with a recursion-stack set, and emit `{"kind": "dependency_cycle", "cycle": [N1, N2, ...]}` listing the participating numbers in topological discovery order. Stop after the first cycle found.
- [ ] **Step 5:** Add a top-level `compute_waves(tasks, dep_raw, max_parallel_hard_cap)` function: assign each task to the earliest wave where all its dependencies are in earlier waves (Wave 1 = tasks with no deps; Wave N = tasks whose latest dep is in Wave N-1). When a wave has more than `max_parallel_hard_cap` tasks, split into sequential subwaves of at most that cap, in ascending task-number order. Return `[{"wave": W, "subwave": S, "tasks": [T1, T2, ...]}, ...]`.
- [ ] **Step 6:** Add `--max-parallel-hard-cap` CLI flag (type=int, default=8) to `argparse`. Default value matches the constant referenced in `pi-interactive-subagent` (`MAX_PARALLEL_HARD_CAP = 8`).
- [ ] **Step 7:** Wire the new validation functions into `main()`: run section-presence validation first; if it produces any error, write the error JSON to stderr, exit 1, and skip task-block parsing. Run dependency reference + cycle detection after task parsing; on errors, write the error JSON to stderr and exit 1 without emitting `waves`. On clean parse, attach a `"waves"` key to the result JSON via `compute_waves`.
- [ ] **Step 8:** Update the script docstring at the top of the file to list the three new protocol-error kinds (`missing_required_section`, `dependency_unknown_target`, `dependency_cycle`), document `waves` shape, and document `--max-parallel-hard-cap`.
- [ ] **Step 9:** Author fixture `plan-clean-with-deps.md` with three tasks and the dependency `Task 3 depends on: Task 1, Task 2` to drive the linear-wave test (Wave 1 = [1,2], Wave 2 = [3]).
- [ ] **Step 10:** Author fixture `plan-parallel-only.md` with three tasks and an empty `## Dependencies` section (no `Task X depends on:` lines).
- [ ] **Step 11:** Author fixture `plan-dep-cycle.md` with three tasks and `Task 1 depends on: Task 2`, `Task 2 depends on: Task 1`.
- [ ] **Step 12:** Author fixture `plan-unknown-dep.md` with two tasks and `Task 2 depends on: Task 99`.
- [ ] **Step 13:** Author each `plan-missing-section-*.md` fixture by starting from `plan-clean.md` and removing exactly one required section. The `plan-missing-section-header.md` fixture must remove ALL THREE header components (Goal, Architecture summary, Tech stack) so its presence proves the validator enforces all three; additionally author `plan-missing-section-arch-summary.md` (removes only `## Architecture summary`) and `plan-missing-section-tech-stack.md` (removes only `## Tech stack`) to prove each header subcomponent is independently enforced. Other fixtures remove `## File Structure` / `### Task <N>:` content / `## Dependencies` / `## Risk Assessment` respectively.
- [ ] **Step 14:** Author fixture `plan-large-wave.md` with 10 numbered tasks and an empty `## Dependencies` section so all 10 land in Wave 1; subwave 1 must contain 8 tasks and subwave 2 must contain 2 tasks (or the deterministic split your `compute_waves` implementation produces — assert the exact split in the test).
- [ ] **Step 15:** Add `TestRequiredSectionMissing` test cases (one per missing section fixture). Each asserts non-zero exit and `missing_required_section` in stderr `errors[*].kind`, with the correct `section` field. The `plan-missing-section-header.md` test must assert that all three section names (`goal`, `architecture_summary`, `tech_stack`) appear in the emitted errors. The `plan-missing-section-arch-summary.md` test asserts a single error with `section == "architecture_summary"`. The `plan-missing-section-tech-stack.md` test asserts a single error with `section == "tech_stack"`.
- [ ] **Step 16:** Add `TestDependencyValidation` test cases for `dependency_unknown_target` (against `plan-unknown-dep.md`) and `dependency_cycle` (against `plan-dep-cycle.md`).
- [ ] **Step 17:** Add `TestWaveGrouping` test cases: linear-deps fixture → expected `waves` shape; parallel-only fixture → all tasks in `wave: 1, subwave: 1`; large-wave fixture → splits into subwaves at 8.
- [ ] **Step 18:** Add `TestMaxParallelHardCapOverride` running on `plan-large-wave.md` with `--max-parallel-hard-cap 4`; assert at least three subwaves with no subwave exceeding 4 tasks.
- [ ] **Step 19:** Run `cd agent && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_extract_plan_tasks.py" -v` and confirm all existing and new tests pass.

**Acceptance criteria:**
- `extract-plan-tasks.py` rejects plans missing any required section (the three header subcomponents plus File Structure / numbered tasks / Dependencies / Risk Assessment) with kind `missing_required_section`.
  Verify: run `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-deps.md`; confirm exit code is non-zero and stderr JSON `.errors[].kind` contains `missing_required_section` with `.section` equal to `dependencies`.
- `extract-plan-tasks.py` rejects plans missing `## Architecture summary` independently from Goal.
  Verify: run `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-arch-summary.md`; confirm exit non-zero and stderr JSON `.errors[].section` includes `architecture_summary`.
- `extract-plan-tasks.py` rejects plans missing `## Tech stack` independently from Goal.
  Verify: run `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-tech-stack.md`; confirm exit non-zero and stderr JSON `.errors[].section` includes `tech_stack`.
- The combined-header fixture proves all three header components are enforced together.
  Verify: run `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-section-header.md`; confirm exit non-zero and the stderr JSON `.errors[].section` set includes all three of `goal`, `architecture_summary`, and `tech_stack`.
- `extract-plan-tasks.py` rejects plans whose `## Dependencies` references nonexistent task numbers with kind `dependency_unknown_target`.
  Verify: run `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-unknown-dep.md`; confirm exit non-zero and stderr JSON `.errors[].kind` contains `dependency_unknown_target` with `.task_number` and `.unknown_dep` populated.
- `extract-plan-tasks.py` rejects dependency cycles with kind `dependency_cycle` that names the participating task numbers.
  Verify: run `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-dep-cycle.md`; confirm exit non-zero and stderr JSON `.errors[].kind` contains `dependency_cycle` with `.cycle` populated as a list including both task numbers 1 and 2.
- On a clean plan, the helper emits a `waves` array with `wave`, `subwave`, and `tasks` fields per entry, ordered by `(wave, subwave)` ascending.
  Verify: run `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-clean-with-deps.md` and confirm stdout JSON has `.waves[0].wave == 1`, `.waves[0].subwave == 1`, and `.waves[0].tasks == [1, 2]` and `.waves[1].tasks == [3]`.
- A wave with more than `MAX_PARALLEL_HARD_CAP` tasks splits into sub-waves of ≤ cap.
  Verify: run `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-large-wave.md` and confirm every entry in `.waves[*].tasks` has `len() <= 8`.
- `--max-parallel-hard-cap N` overrides the default and is enforced.
  Verify: run `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-large-wave.md --max-parallel-hard-cap 4` and confirm every entry in `.waves[*].tasks` has `len() <= 4`.
- Existing tests still pass.
  Verify: run `cd agent && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_extract_plan_tasks.py" -v` and confirm exit code 0 and at least the previous 24+ test cases plus the new ones report OK.
- `--help` documents the new error kinds.
  Verify: run `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --help`; confirm stdout contains the strings `missing_required_section`, `dependency_unknown_target`, and `dependency_cycle`.

**Model recommendation:** standard

---

### Task 2: Create reconcile-test-run.py for baseline capture and per-run reconciliation

**Files:**
- Create: `agent/skills/_shared/scripts/reconcile-test-run.py`
- Create: `agent/skills/_shared/scripts/tests/test_reconcile_test_run.py`
- Create: `agent/skills/_shared/scripts/tests/fixtures/baseline-failures-empty.json`
- Create: `agent/skills/_shared/scripts/tests/fixtures/baseline-failures-stable.json`
- Create: `agent/skills/_shared/scripts/tests/fixtures/baseline-failures-malformed.json`

**Steps:**
- [ ] **Step 1:** Create `reconcile-test-run.py` with a docstring that names the helper, summarizes both modes (`capture` for Step 7 baseline, `reconcile` for Steps 12.2/14/16), and lists every protocol-error label including the new `baseline_failures_invalid` plus the labels propagated from `parse-test-runner-artifact.py`.
- [ ] **Step 2:** Add `argparse` flags: `--artifact PATH` (required), `--mode {capture,reconcile}` (required), `--baseline-failures PATH` (required when `--mode reconcile`).
- [ ] **Step 3:** Implement artifact parsing by calling `parse-test-runner-artifact.py` as a subprocess (`subprocess.run([sys.executable, ".../parse-test-runner-artifact.py", "--artifact", args.artifact], ...)`). On non-zero exit, propagate stderr verbatim and exit with the same return code. On success, parse stdout JSON to obtain `failing_identifiers`, `non_reconcilable_failures`, and `exit_code`.
- [ ] **Step 4:** In `capture` mode, build the response dict: `mode = "capture"`; `baseline_failures = failing_identifiers`; `non_reconcilable_at_baseline = non_reconcilable_failures`; classify as `clean` (both empty AND `exit_code == 0`), `stable-failures-only` (`failing_identifiers` non-empty AND `non_reconcilable_failures` empty), or `contains-non-reconcilable-evidence` (`non_reconcilable_failures` non-empty). Emit JSON to stdout, exit 0.
- [ ] **Step 5:** In `reconcile` mode, read `--baseline-failures` JSON and validate the structure: must be an object containing key `failing_identifiers` whose value is a list of strings. On JSON parse error or shape mismatch, emit `{"failure": "baseline_failures_invalid", ...}` to stderr and exit 1.
- [ ] **Step 6:** In `reconcile` mode, compute `current_failing_stable = failing_identifiers`, `current_non_reconcilable = non_reconcilable_failures`, `current_non_baseline_stable = [x for x in current_failing_stable if x not in baseline_failures]` (preserving order from artifact). Classify as `pass` if both `current_non_baseline_stable` and `current_non_reconcilable` are empty, else `fail`. Emit `{mode, current_failing_stable, current_non_reconcilable, current_non_baseline_stable, classification}` JSON to stdout.
- [ ] **Step 7:** Add `--help` epilog (using `argparse.RawDescriptionHelpFormatter`) listing every protocol-error label: `baseline_failures_invalid`, `artifact_missing_or_empty`, `header_missing`, `header_out_of_order`, `exit_code_malformed`, `count_field_malformed`, `failing_identifiers_count_mismatch`, `non_reconcilable_count_mismatch`, `raw_output_marker_missing`.
- [ ] **Step 8:** Author fixture `baseline-failures-empty.json` containing `{"failing_identifiers": []}`.
- [ ] **Step 9:** Author fixture `baseline-failures-stable.json` containing `{"failing_identifiers": ["tests/test_a.py::test_one"]}`.
- [ ] **Step 10:** Author fixture `baseline-failures-malformed.json` containing the literal text `{not valid json` (no closing brace).
- [ ] **Step 11:** Write `test_reconcile_test_run.py`: capture mode against existing `test-runner-artifact-clean.txt` → `classification == "clean"`, `baseline_failures == []`.
- [ ] **Step 12:** Add capture test against `test-runner-artifact-stable-failures.txt` → `classification == "stable-failures-only"` and `baseline_failures == ["tests/test_a.py::test_one", "tests/test_b.py::test_two"]`.
- [ ] **Step 13:** Add capture test against `test-runner-artifact-non-reconcilable.txt` → `classification == "contains-non-reconcilable-evidence"`.
- [ ] **Step 14:** Add reconcile test: artifact-clean + empty baseline → `classification == "pass"`, `current_non_baseline_stable == []`.
- [ ] **Step 15:** Add reconcile test: stable-failures artifact + empty baseline → `classification == "fail"`, `current_non_baseline_stable == ["tests/test_a.py::test_one", "tests/test_b.py::test_two"]`.
- [ ] **Step 16:** Add reconcile test: non-reconcilable artifact + empty baseline → `classification == "fail"` (non-reconcilable alone fails the gate).
- [ ] **Step 17:** Add reconcile test: stable-failures artifact + `baseline-failures-stable.json` (overlap on `tests/test_a.py::test_one`) → `tests/test_a.py::test_one` NOT in `current_non_baseline_stable`, `tests/test_b.py::test_two` IS in `current_non_baseline_stable`, `classification == "fail"`.
- [ ] **Step 18:** Add reconcile test: malformed baseline JSON → exit 1 and stderr JSON `failure == "baseline_failures_invalid"`.
- [ ] **Step 19:** Add propagation test: invoke against a missing artifact (non-existent path) and confirm the helper exits non-zero with the upstream `artifact_missing_or_empty` label in stderr JSON.
- [ ] **Step 20:** Run `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_reconcile_test_run.py" -v` and confirm all tests pass.

**Acceptance criteria:**
- `reconcile-test-run.py --mode capture` against a clean baseline artifact emits `classification: clean` with empty sets.
  Verify: run `python3 agent/skills/_shared/scripts/reconcile-test-run.py --artifact agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-clean.txt --mode capture` and confirm stdout JSON `.classification == "clean"` and `.baseline_failures == []`.
- `reconcile-test-run.py --mode capture` against a baseline with stable failures emits `classification: stable-failures-only` and populates `baseline_failures`.
  Verify: run `python3 agent/skills/_shared/scripts/reconcile-test-run.py --artifact agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-stable-failures.txt --mode capture` and confirm `.classification == "stable-failures-only"` and `.baseline_failures` is a non-empty array.
- `reconcile-test-run.py --mode reconcile` distinguishes baseline-overlapping failures from new failures.
  Verify: run `python3 agent/skills/_shared/scripts/reconcile-test-run.py --artifact agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-stable-failures.txt --mode reconcile --baseline-failures agent/skills/_shared/scripts/tests/fixtures/baseline-failures-stable.json` and confirm `.current_non_baseline_stable` contains exactly `tests/test_b.py::test_two` (not `tests/test_a.py::test_one`).
- A non-reconcilable failure alone causes `classification: fail`.
  Verify: run `python3 agent/skills/_shared/scripts/reconcile-test-run.py --artifact agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-non-reconcilable.txt --mode reconcile --baseline-failures agent/skills/_shared/scripts/tests/fixtures/baseline-failures-empty.json` and confirm stdout `.classification == "fail"`.
- Malformed baseline JSON emits `baseline_failures_invalid` on stderr.
  Verify: run `python3 agent/skills/_shared/scripts/reconcile-test-run.py --artifact agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-clean.txt --mode reconcile --baseline-failures agent/skills/_shared/scripts/tests/fixtures/baseline-failures-malformed.json`; confirm exit non-zero and stderr JSON `.failure == "baseline_failures_invalid"`.
- Tests pass.
  Verify: run `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_reconcile_test_run.py" -v` and confirm exit code 0.
- `--help` documents protocol-error labels.
  Verify: run `python3 agent/skills/_shared/scripts/reconcile-test-run.py --help` and confirm stdout contains both `baseline_failures_invalid` and `artifact_missing_or_empty`.

**Model recommendation:** standard

---

### Task 3: Create git-workspace-status.py for Step 0 worktree pre-flight

**Files:**
- Create: `agent/skills/_shared/scripts/git-workspace-status.py`
- Create: `agent/skills/_shared/scripts/tests/test_git_workspace_status.py`

**Steps:**
- [ ] **Step 1:** Create `git-workspace-status.py` with a docstring naming the helper, listing every output field (`is_git_repo`, `workspace_path`, `is_worktree`, `current_branch`, `branch_label`, `is_feature_branch`, `dirty_status`), and listing both protocol-error labels (`working_dir_not_found`, `git_command_failed`).
- [ ] **Step 2:** Add CLI flags: `--working-dir PATH` (default `.`), `--main-branches MAIN1,MAIN2,...` (default `main,master,develop`).
- [ ] **Step 3:** On startup, resolve `--working-dir` to an absolute path; if `os.path.isdir(working_dir)` is False, emit `{"failure": "working_dir_not_found", "working_dir": <input>}` to stderr and exit 1.
- [ ] **Step 4:** Run `git -C <working_dir> rev-parse --git-dir` capturing stdout and stderr; if exit code is non-zero, emit JSON `{is_git_repo: false, workspace_path: null, is_worktree: null, current_branch: null, branch_label: null, is_feature_branch: null, dirty_status: null}` to stdout and exit 0.
- [ ] **Step 5:** Run `git -C <working_dir> rev-parse --git-dir` and `git -C <working_dir> rev-parse --git-common-dir`. Resolve both to absolute paths. `is_worktree = (git_dir_abs != git_common_dir_abs)`.
- [ ] **Step 6:** Run `git -C <working_dir> branch --show-current` to get `current_branch` (empty string when detached). Run `git -C <working_dir> rev-parse --show-toplevel` to get `workspace_path`.
- [ ] **Step 7:** Compute `branch_label`: if `current_branch` is non-empty use it; otherwise run `git -C <working_dir> rev-parse --short HEAD` and form `detached HEAD at <short-sha>`.
- [ ] **Step 8:** Compute `is_feature_branch`: True if `current_branch` is non-empty AND not in the comma-split `--main-branches` list.
- [ ] **Step 9:** Run `git -C <working_dir> status --porcelain` and store stdout verbatim as `dirty_status` (empty string when clean).
- [ ] **Step 10:** On any unexpected git invocation failure (exit non-zero outside the initial `rev-parse --git-dir` non-repo case), emit `{"failure": "git_command_failed", "stderr": <captured stderr>}` to stderr and exit 1.
- [ ] **Step 11:** Print the result JSON (with the exact field set above) to stdout, exit 0.
- [ ] **Step 12:** Add `--help` epilog listing both protocol-error labels.
- [ ] **Step 13:** Author `test_git_workspace_status.py` setUp that creates a temporary directory tree using `tempfile.mkdtemp()` and uses `subprocess.run` to drive `git init`, `git checkout -b`, `git config user.email`, `git config user.name`, file creation, etc.
- [ ] **Step 14:** Add test: a non-git temp directory → `is_git_repo: false` and all other fields `null`, exit 0.
- [ ] **Step 15:** Add test: a fresh `git init` repo on `main` (after first commit) → `is_git_repo: true`, `is_worktree: false`, `is_feature_branch: false`, `current_branch: "main"`.
- [ ] **Step 16:** Add test: that same repo after `git checkout -b feature/foo` → `is_feature_branch: true`, `current_branch: "feature/foo"`.
- [ ] **Step 17:** Add test: detached HEAD via `git checkout <sha>` → `current_branch == ""`, `branch_label` matches regex `^detached HEAD at [0-9a-f]{7,}$`.
- [ ] **Step 18:** Add test: a linked worktree created via `git worktree add` → `is_worktree: true` when `--working-dir` points at the linked worktree directory.
- [ ] **Step 19:** Add test: a repo with an untracked file → `dirty_status` contains a `?? <file>` line.
- [ ] **Step 20:** Add test: `--main-branches trunk` against a repo on `trunk` → `is_feature_branch: false`.
- [ ] **Step 21:** Add test: `--working-dir /nonexistent/path` → exit 1 and stderr JSON `failure == "working_dir_not_found"`.
- [ ] **Step 22:** Run `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_git_workspace_status.py" -v` and confirm all tests pass.

**Acceptance criteria:**
- A non-git directory returns `is_git_repo: false` and exits 0.
  Verify: run `python3 agent/skills/_shared/scripts/git-workspace-status.py --working-dir /tmp` (assuming `/tmp` is not a git repo) and confirm exit 0 and stdout JSON `.is_git_repo == false`.
- The helper detects worktrees, feature branches, detached HEAD, and dirty status.
  Verify: run `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_git_workspace_status.py" -v` and confirm all of `test_plain_repo_on_main`, `test_feature_branch`, `test_detached_head`, `test_linked_worktree`, `test_dirty_status`, `test_custom_main_branches` pass.
- A nonexistent `--working-dir` emits `working_dir_not_found`.
  Verify: run `python3 agent/skills/_shared/scripts/git-workspace-status.py --working-dir /this/path/does/not/exist`; confirm exit non-zero and stderr JSON `.failure == "working_dir_not_found"`.
- `--help` documents protocol-error labels.
  Verify: run `python3 agent/skills/_shared/scripts/git-workspace-status.py --help` and confirm stdout contains both `working_dir_not_found` and `git_command_failed`.

**Model recommendation:** standard

---

### Task 4: Create compute-verifier-file-set.py for Step 11.2 union rule

**Files:**
- Create: `agent/skills/execute-plan/scripts/compute-verifier-file-set.py`
- Create: `agent/skills/execute-plan/scripts/tests/test_compute_verifier_file_set.py`

**Steps:**
- [ ] **Step 1:** Create `compute-verifier-file-set.py` with a docstring describing both wave shapes (`single-task`, `parallel-multi-task`) and listing both protocol-error labels (`input_json_invalid`, `wave_shape_invalid`).
- [ ] **Step 2:** Add CLI flags: `--task-files PATH` (required, JSON array of strings), `--worker-files PATH` (required, JSON array of strings), `--observed-status PATH_OR_DASH` (required), `--observed-diff-paths PATH` (required, JSON array of strings), `--wave-shape VALUE` (required, accepts an arbitrary string — do NOT use argparse `choices=`; explicit validation in Step 5 must reject invalid values via the structured `wave_shape_invalid` JSON failure rather than argparse's default usage error).
- [ ] **Step 3:** Implement a `_load_json_array(path, field_name)` helper: read the file (or stdin if value is `-`), parse JSON, assert the value is a list of strings; on any failure emit `{"failure": "input_json_invalid", "field": field_name}` to stderr and exit 1.
- [ ] **Step 4:** Read `--observed-status`: if value is `-`, read stdin; otherwise read the file. Parse the porcelain output into a list of paths by stripping the leading 2-character status code and a single space; deduplicate using first-occurrence order (NOT sort) so the input ordering is preserved through the dedup step.
- [ ] **Step 5:** Validate `--wave-shape`; on invalid value emit `{"failure": "wave_shape_invalid", "value": <input>}` to stderr and exit 1.
- [ ] **Step 6:** Compute `observed_paths` as the first-occurrence-deduplicated concatenation of porcelain paths followed by `observed_diff_paths`. The output preserves input order — porcelain paths appear first in their porcelain order, then diff paths in their input order, with duplicates of any earlier-seen path skipped. Do NOT sort.
- [ ] **Step 7:** Implement the union rule per `--wave-shape`:
  - `single-task`: `verifier_visible_files = first-occurrence-dedup union of (task_files + worker_files + observed_paths)`.
  - `parallel-multi-task`: include every path in `task_files`, every path in `worker_files`, and every observed path that either (a) is also in `task_files` or `worker_files`, OR (b) is a descendant of any directory in `task_files` (use `os.path.normpath`-based prefix matching).
- [ ] **Step 8:** Emit JSON to stdout: `{"verifier_visible_files": [...], "task_files_resolved": task_files_input, "worker_files_resolved": worker_files_input, "observed_paths": [...], "scoping_rule": "<wave_shape>"}`.
- [ ] **Step 9:** Add `--help` epilog listing both protocol-error labels.
- [ ] **Step 10:** Write `test_compute_verifier_file_set.py` covering: single-task wave with disjoint sets → union of all three.
- [ ] **Step 11:** Add test: parallel-multi-task wave with an observed path NOT under any task-files directory and NOT in worker-files → excluded.
- [ ] **Step 12:** Add test: parallel-multi-task wave with an observed path under a task-files directory (e.g., `task_files = ["src/a/"]`, observed `src/a/b.ts`) → included.
- [ ] **Step 13:** Add test: empty inputs (all JSON arrays empty, empty porcelain) → empty `verifier_visible_files`, exit 0.
- [ ] **Step 14:** Add test: malformed JSON (e.g., a non-array) → exit 1, stderr JSON `failure == "input_json_invalid"` with `field` populated.
- [ ] **Step 15:** Add test: invalid `--wave-shape` → exit non-zero with `failure == "wave_shape_invalid"`.
- [ ] **Step 16:** Add test: same path in all three sources → exactly one occurrence in `verifier_visible_files`.
- [ ] **Step 17:** Add test: `observed_paths` ordering — given porcelain paths `["b.ts", "a.ts"]` (in that porcelain order) and `observed-diff-paths = ["c.ts", "a.ts"]`, assert stdout JSON `.observed_paths == ["b.ts", "a.ts", "c.ts"]` (first-occurrence dedup, no sorting).
- [ ] **Step 18:** Run `cd agent && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_compute_verifier_file_set.py" -v` and confirm all tests pass.

**Acceptance criteria:**
- The helper computes the union per `--wave-shape single-task`.
  Verify: run `cd agent && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_compute_verifier_file_set.py" -v 2>&1 | grep -E "^(OK|test_single_task)"` and confirm at least one line starting with `test_single_task` and a final line `OK`.
- The helper restricts observed paths to task-declared directories under `--wave-shape parallel-multi-task`.
  Verify: run `cd agent && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_compute_verifier_file_set.py" -v 2>&1 | grep -E "test_parallel"` and confirm at least one matching line indicating a parallel-multi-task test method exists; the same discover invocation must exit 0.
- `observed_paths` uses first-occurrence dedup in input order, not sorting.
  Verify: run `cd agent && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_compute_verifier_file_set.py" -v 2>&1 | grep -i "observed_paths"` and confirm at least one matching test method line; the same discover invocation must exit 0.
- Malformed JSON inputs surface `input_json_invalid` and exit non-zero.
  Verify: write a temporary file containing the literal text `not valid json`, then run `python3 agent/skills/execute-plan/scripts/compute-verifier-file-set.py --task-files <that-file> --worker-files <that-file> --observed-status - --observed-diff-paths <that-file> --wave-shape single-task < /dev/null`; confirm exit non-zero and stderr JSON `.failure == "input_json_invalid"`.
- Invalid wave-shape surfaces `wave_shape_invalid`.
  Verify: write a temp file containing `[]`, then run `python3 agent/skills/execute-plan/scripts/compute-verifier-file-set.py --task-files <that-file> --worker-files <that-file> --observed-status - --observed-diff-paths <that-file> --wave-shape bogus < /dev/null`; confirm exit non-zero and stderr JSON `.failure == "wave_shape_invalid"`.
- `--help` documents protocol-error labels.
  Verify: run `python3 agent/skills/execute-plan/scripts/compute-verifier-file-set.py --help` and confirm stdout contains both `input_json_invalid` and `wave_shape_invalid`.
- All test methods in the file pass.
  Verify: run `cd agent && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_compute_verifier_file_set.py" -v` and confirm exit code 0 with no FAIL or ERROR lines.

**Model recommendation:** cheap

---

### Task 5: Create detect-test-command.py for Step 3 fallback and shared use

**Files:**
- Create: `agent/skills/_shared/scripts/detect-test-command.py`
- Create: `agent/skills/_shared/scripts/tests/test_detect_test_command.py`

**Steps:**
- [ ] **Step 1:** Create `detect-test-command.py` with a docstring listing the five resolution rules (in order) and the protocol-error label `working_dir_not_found`.
- [ ] **Step 2:** Add CLI flag `--working-dir PATH` (default `.`).
- [ ] **Step 3:** Resolve `--working-dir` to an absolute path; if the directory does not exist, emit `{"failure": "working_dir_not_found", "working_dir": <input>}` to stderr and exit 1.
- [ ] **Step 4:** Rule 1: if `<working_dir>/package.json` exists, attempt `json.load`. If parsing succeeds AND `data.get("scripts", {}).get("test")` is a non-empty string, emit `{"detected": true, "command": "npm test", "source": "package.json"}` and exit 0. If parsing fails, write `warning: malformed package.json at <path>: <error>` to stderr (no JSON, just a warning line) and continue to Rule 2.
- [ ] **Step 5:** Rule 2: if `<working_dir>/Cargo.toml` exists, emit `{"detected": true, "command": "cargo test", "source": "Cargo.toml"}` and exit 0.
- [ ] **Step 6:** Rule 3: if `<working_dir>/Makefile` exists AND it contains a line matching the regex `^test:` (use `re.MULTILINE`), emit `{"detected": true, "command": "make test", "source": "Makefile"}` and exit 0.
- [ ] **Step 7:** Rule 4: if `<working_dir>/pyproject.toml` exists, emit `{"detected": true, "command": "pytest", "source": "pyproject.toml"}`. Otherwise if `<working_dir>/setup.py` exists, emit `{"detected": true, "command": "pytest", "source": "setup.py"}`. Exit 0 if either matched.
- [ ] **Step 8:** Rule 5: if `<working_dir>/go.mod` exists, emit `{"detected": true, "command": "go test ./...", "source": "go.mod"}` and exit 0.
- [ ] **Step 9:** Fallthrough: emit `{"detected": false, "command": null, "source": null}` and exit 0.
- [ ] **Step 10:** Add `--help` epilog listing the protocol-error label.
- [ ] **Step 11:** Write `test_detect_test_command.py` setUp that creates a temp dir per test.
- [ ] **Step 12:** Add test: `package.json` with `{"scripts": {"test": "vitest"}}` → `detected: true, command: "npm test", source: "package.json"`.
- [ ] **Step 13:** Add test: `package.json` with no `scripts.test` (e.g., `{"name": "foo"}`) → fallthrough; if other markers exist, follow next rule; if none, `detected: false`.
- [ ] **Step 14:** Add test: malformed `package.json` (literal text `{not valid json`) plus a sibling `Cargo.toml` → `command: "cargo test"`, AND stderr contains `warning: malformed package.json`.
- [ ] **Step 15:** Add test: `Cargo.toml` only → `cargo test`.
- [ ] **Step 16:** Add test: `Makefile` containing `test:\n\techo hi` → `make test`.
- [ ] **Step 17:** Add test: `Makefile` without a `test:` target (e.g., `build:\n\techo hi`) → fallthrough.
- [ ] **Step 18:** Add test: `pyproject.toml` only → `pytest`, source `pyproject.toml`.
- [ ] **Step 19:** Add test: `setup.py` only → `pytest`, source `setup.py`.
- [ ] **Step 20:** Add test: `go.mod` only → `go test ./...`.
- [ ] **Step 21:** Add test: both `package.json` (with scripts.test) AND `Cargo.toml` → rule 1 wins (`npm test`).
- [ ] **Step 22:** Add test: empty directory → `detected: false`.
- [ ] **Step 23:** Add test: nonexistent `--working-dir` → exit 1, stderr JSON `failure == "working_dir_not_found"`.
- [ ] **Step 24:** Run `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_detect_test_command.py" -v` and confirm all tests pass.

**Acceptance criteria:**
- A `package.json` with a `.scripts.test` string yields `npm test`.
  Verify: create a temp directory, write `{"scripts":{"test":"vitest"}}` to `package.json` inside it, run `python3 agent/skills/_shared/scripts/detect-test-command.py --working-dir <tempdir>`, and confirm stdout JSON `.detected == true`, `.command == "npm test"`, `.source == "package.json"`.
- A `package.json` without `.scripts.test` falls through (rule 1 actually parses JSON, not just checks file presence).
  Verify: create a temp directory, write `{"name":"foo"}` to `package.json` inside it, run the helper against that directory, and confirm stdout JSON `.detected == false` (no other markers present).
- Malformed `package.json` emits a stderr warning and falls through to subsequent rules.
  Verify: create a temp directory, write `{not valid json` to `package.json`, write a `Cargo.toml` next to it, run the helper, and confirm stdout JSON `.command == "cargo test"` AND captured stderr contains the substring `warning: malformed package.json`.
- Cargo, Makefile, pyproject, setup.py, and go.mod each yield their expected commands.
  Verify: run `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_detect_test_command.py" -v` and confirm exit code 0 with no FAIL or ERROR lines and at least one passing test for each marker rule (Cargo, Makefile, pyproject, setup.py, go.mod) printed in the verbose output.
- No markers → `detected: false`.
  Verify: create an empty temp directory, then run `python3 agent/skills/_shared/scripts/detect-test-command.py --working-dir <empty-tempdir>`; confirm stdout JSON `.detected == false`.
- Nonexistent working dir surfaces `working_dir_not_found`.
  Verify: run `python3 agent/skills/_shared/scripts/detect-test-command.py --working-dir /this/path/does/not/exist`; confirm exit non-zero and stderr JSON `.failure == "working_dir_not_found"`.

**Model recommendation:** cheap

---

### Task 6: Create parse-coder-report.py for Steps 9, 10, 11

**Files:**
- Create: `agent/skills/execute-plan/scripts/parse-coder-report.py`
- Create: `agent/skills/execute-plan/scripts/tests/test_parse_coder_report.py`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-done.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-done-with-concerns.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-blocked.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-needs-context.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-no-status.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-bad-status.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/coder-report-concerns-missing.md`

**Steps:**
- [ ] **Step 1:** Create `parse-coder-report.py` with a docstring listing every output field from the spec's "Output (stdout JSON)" plus all three protocol-error labels (`status_line_missing`, `status_token_invalid`, `report_unreadable`) and the warning label (`concerns_block_missing`).
- [ ] **Step 2:** Add CLI flag `--report PATH_OR_DASH` (required); read stdin when value is `-`, else open the file. On `OSError`, emit `{"failure": "report_unreadable", "path": <input>}` and exit 1.
- [ ] **Step 3:** Find a line matching `^STATUS:\s*(\S+)` (case-sensitive `STATUS:`). On no match, emit `{"failure": "status_line_missing"}` to stderr and exit 1.
- [ ] **Step 4:** Validate the captured token against `{DONE, DONE_WITH_CONCERNS, BLOCKED, NEEDS_CONTEXT}`. If not in the set, emit `{"failure": "status_token_invalid", "token": <captured>}` and exit 1.
- [ ] **Step 5:** Implement a `_section(name, text)` helper that returns the verbatim text under `## <name>` (everything from the line after `## <name>` to the next `## ` heading or end-of-file, stripped of trailing newlines).
- [ ] **Step 6:** Extract `tests_block = _section("Tests", text)`, `completed_block = _section("Completed", text)`, `self_review_block = _section("Self-Review Findings", text)`, and `concerns_block = _section("Concerns / Needs / Blocker", text)`.
- [ ] **Step 7:** Compute `blocker_text = concerns_block if status == "BLOCKED" else None`; `needs_text = concerns_block if status == "NEEDS_CONTEXT" else None`.
- [ ] **Step 8:** Build `protocol_warnings`: append `"concerns_block_missing"` when `status == "DONE_WITH_CONCERNS"` and `concerns_block.strip() == ""`.
- [ ] **Step 9:** Extract `files_changed`: locate the `## Files Changed` section; iterate its lines for bullets matching `^- \`(?P<path>[^`]+)\``; collect `path` in order. Bullets without backticks are skipped silently (no warning).
- [ ] **Step 10:** Emit JSON `{"status", "files_changed", "concerns_block", "blocker_text", "needs_text", "tests_block", "completed_block", "self_review_block", "protocol_warnings"}` to stdout, exit 0.
- [ ] **Step 11:** Add `--help` epilog listing protocol-error labels and the `concerns_block_missing` warning.
- [ ] **Step 12:** Author fixture `coder-report-done.md` with `STATUS: DONE`, populated `## Completed`, `## Tests`, `## Files Changed` (with two `- \`path\` — desc` bullets), and `## Self-Review Findings`.
- [ ] **Step 13:** Author fixture `coder-report-done-with-concerns.md` with `STATUS: DONE_WITH_CONCERNS` and a populated `## Concerns / Needs / Blocker` block.
- [ ] **Step 14:** Author fixture `coder-report-blocked.md` with `STATUS: BLOCKED` and a populated blocker explanation under `## Concerns / Needs / Blocker`.
- [ ] **Step 15:** Author fixture `coder-report-needs-context.md` with `STATUS: NEEDS_CONTEXT` and a populated needs explanation under `## Concerns / Needs / Blocker`.
- [ ] **Step 16:** Author fixture `coder-report-no-status.md` with no `STATUS:` line.
- [ ] **Step 17:** Author fixture `coder-report-bad-status.md` with `STATUS: COMPLETED` (an invalid token).
- [ ] **Step 18:** Author fixture `coder-report-concerns-missing.md` with `STATUS: DONE_WITH_CONCERNS` but no `## Concerns / Needs / Blocker` section.
- [ ] **Step 19:** Write `test_parse_coder_report.py`: DONE → `status: "DONE"`, `files_changed` length 2, both paths extracted in order.
- [ ] **Step 20:** Add test: DONE_WITH_CONCERNS with concerns block → `concerns_block` non-empty, `protocol_warnings` does NOT contain `concerns_block_missing`.
- [ ] **Step 21:** Add test: BLOCKED → `blocker_text` non-empty, `needs_text` is null.
- [ ] **Step 22:** Add test: NEEDS_CONTEXT → `needs_text` non-empty, `blocker_text` is null.
- [ ] **Step 23:** Add test: missing STATUS → exit 1, stderr JSON `failure == "status_line_missing"`.
- [ ] **Step 24:** Add test: invalid status token → exit 1, stderr JSON `failure == "status_token_invalid"` with `token == "COMPLETED"`.
- [ ] **Step 25:** Add test: DONE_WITH_CONCERNS without concerns block → exit 0, `protocol_warnings` contains `concerns_block_missing`.
- [ ] **Step 26:** Add test: bullet without backticks (e.g., `- file.ts — note`) → skipped silently in `files_changed`, no warning.
- [ ] **Step 27:** Run `cd agent && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_parse_coder_report.py" -v` and confirm all tests pass.

**Acceptance criteria:**
- The helper extracts `status`, `files_changed`, and the four content blocks from a well-formed report.
  Verify: run `python3 agent/skills/execute-plan/scripts/parse-coder-report.py --report agent/skills/execute-plan/scripts/tests/fixtures/coder-report-done.md` and confirm stdout JSON `.status == "DONE"`, `.files_changed` is a non-empty list, `.completed_block` non-empty.
- BLOCKED and NEEDS_CONTEXT route concerns text into the right field.
  Verify: run `python3 agent/skills/execute-plan/scripts/parse-coder-report.py --report agent/skills/execute-plan/scripts/tests/fixtures/coder-report-blocked.md` and confirm stdout JSON `.status == "BLOCKED"`, `.blocker_text` non-empty, `.needs_text == null`. Then run `python3 agent/skills/execute-plan/scripts/parse-coder-report.py --report agent/skills/execute-plan/scripts/tests/fixtures/coder-report-needs-context.md` and confirm `.status == "NEEDS_CONTEXT"`, `.needs_text` non-empty, `.blocker_text == null`.
- Missing STATUS surfaces `status_line_missing`.
  Verify: run `python3 agent/skills/execute-plan/scripts/parse-coder-report.py --report agent/skills/execute-plan/scripts/tests/fixtures/coder-report-no-status.md`; confirm exit non-zero and stderr JSON `.failure == "status_line_missing"`.
- Invalid STATUS token surfaces `status_token_invalid`.
  Verify: run `python3 agent/skills/execute-plan/scripts/parse-coder-report.py --report agent/skills/execute-plan/scripts/tests/fixtures/coder-report-bad-status.md`; confirm exit non-zero and stderr JSON `.failure == "status_token_invalid"`.
- DONE_WITH_CONCERNS without concerns block emits `concerns_block_missing` as a non-fatal warning.
  Verify: run `python3 agent/skills/execute-plan/scripts/parse-coder-report.py --report agent/skills/execute-plan/scripts/tests/fixtures/coder-report-concerns-missing.md`; confirm exit 0 and stdout JSON `.protocol_warnings` contains the string `concerns_block_missing`.
- `--help` documents protocol-error labels.
  Verify: run `python3 agent/skills/execute-plan/scripts/parse-coder-report.py --help` and confirm stdout contains `status_line_missing`, `status_token_invalid`, and `report_unreadable`.

**Model recommendation:** standard

---

### Task 7: Add --carry-over-review flag to fill-refine-plan-prompt.py

**Files:**
- Modify: `agent/skills/refine-plan/scripts/fill-refine-plan-prompt.py`
- Modify: `agent/skills/refine-plan/scripts/tests/test_fill_refine_plan_prompt.py`

**Steps:**
- [ ] **Step 1:** Add `--carry-over-review` (required; literal string value, empty `""` is valid) to `argparse` in `fill-refine-plan-prompt.py`.
- [ ] **Step 2:** Add `"{CARRY_OVER_REVIEW}": args.carry_over_review` to the `placeholders` dict.
- [ ] **Step 3:** Update the `--help` epilog and module docstring to list `CARRY_OVER_REVIEW` alongside the other twelve placeholders.
- [ ] **Step 4:** Update the existing `test_full_success_against_real_template` to pass `--carry-over-review ""` and assert the literal `{CARRY_OVER_REVIEW}` placeholder is no longer present in the output.
- [ ] **Step 5:** Update every other test that invokes the script (currently 8 callers across `TestInputMissingOrUnreadable`, `TestUnreplacedPlaceholder`, `TestEmptyStringSubstitution`, `TestNoRecursiveExpansion` etc.) to pass `--carry-over-review ""`.
- [ ] **Step 6:** Add a new test class `TestCarryOverReviewPopulated` that passes `--carry-over-review docs/plans/reviews/foo-plan-review-v1.md` and asserts the substituted text appears in the output and the placeholder is replaced.
- [ ] **Step 7:** Add a new test case in `TestHelp` confirming `--help` output mentions `CARRY_OVER_REVIEW`.
- [ ] **Step 8:** Run `cd agent && python3 -m unittest discover -s skills/refine-plan/scripts/tests -p "test_fill_refine_plan_prompt.py" -v` and confirm all tests pass.

**Acceptance criteria:**
- `--carry-over-review` accepts an empty string and substitutes `{CARRY_OVER_REVIEW}` with empty.
  Verify: run `cd agent && python3 -m unittest discover -s skills/refine-plan/scripts/tests -p "test_fill_refine_plan_prompt.py" -v 2>&1 | tail -20` and confirm exit code 0 with no FAIL or ERROR; the run includes the existing `test_full_success_against_real_template` test which now passes `--carry-over-review ""`.
- `--carry-over-review` accepts a populated path string and substitutes the literal text.
  Verify: run `cd agent && python3 -m unittest discover -s skills/refine-plan/scripts/tests -p "test_fill_refine_plan_prompt.py" -v 2>&1 | grep -i "test.*carry"` and confirm at least one matching `TestCarryOverReviewPopulated`-style test method line in stdout.
- `--help` documents the new flag.
  Verify: run `python3 agent/skills/refine-plan/scripts/fill-refine-plan-prompt.py --help` and confirm stdout contains the string `CARRY_OVER_REVIEW`.
- Existing tests still pass.
  Verify: run `cd agent && python3 -m unittest discover -s skills/refine-plan/scripts/tests -p "test_*.py" -v` and confirm exit 0 with no FAIL or ERROR.

**Model recommendation:** cheap

---

### Task 8: Add --carry-over-review flag to fill-refine-code-prompt.py

**Files:**
- Modify: `agent/skills/refine-code/scripts/fill-refine-code-prompt.py`
- Modify: `agent/skills/refine-code/scripts/tests/test_fill_refine_code_prompt.py`

**Steps:**
- [ ] **Step 1:** Add `--carry-over-review` (required; literal string value, empty `""` is valid) to `argparse` in `fill-refine-code-prompt.py`.
- [ ] **Step 2:** Add `"CARRY_OVER_REVIEW": args.carry_over_review` to the `placeholders` dict (note: this helper uses keys without braces in its dict, matching the existing pattern).
- [ ] **Step 3:** Update the `--help` epilog and module docstring to add `CARRY_OVER_REVIEW` to the placeholder list.
- [ ] **Step 4:** Update every existing test invocation to pass `--carry-over-review ""` so they still pass under the new required flag.
- [ ] **Step 5:** Add a new test class `TestCarryOverReviewPopulated` that passes a populated path and asserts the substituted text appears in the output.
- [ ] **Step 6:** Add a `--help` test case confirming output includes `CARRY_OVER_REVIEW`.
- [ ] **Step 7:** Run `cd agent && python3 -m unittest discover -s skills/refine-code/scripts/tests -p "test_fill_refine_code_prompt.py" -v` and confirm all tests pass.

**Acceptance criteria:**
- `--carry-over-review` accepts empty and populated values and substitutes correctly.
  Verify: run `cd agent && python3 -m unittest discover -s skills/refine-code/scripts/tests -p "test_fill_refine_code_prompt.py" -v` and confirm exit 0 with no FAIL or ERROR. The verbose stdout must include a test method named with `carry_over` (case-insensitive — `test_carry_over_review_populated` or similar).
- `--help` documents the new flag.
  Verify: run `python3 agent/skills/refine-code/scripts/fill-refine-code-prompt.py --help` and confirm stdout contains `CARRY_OVER_REVIEW`.
- Existing tests still pass.
  Verify: run `cd agent && python3 -m unittest discover -s skills/refine-code/scripts/tests -p "test_*.py" -v` and confirm exit 0 with no FAIL or ERROR.

**Model recommendation:** cheap

---

### Task 9: Rewrite execute-plan/SKILL.md to consume helpers, normalize menus, cap at 600 lines

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1:** In Step 0 (Worktree pre-flight), replace the inline bash block (lines roughly 19–39 covering `GIT_DIR_ABS=...; GIT_COMMON_DIR_ABS=...; CURRENT_BRANCH=...; case "$CURRENT_BRANCH" in ...`) with a single helper invocation: `python3 agent/skills/_shared/scripts/git-workspace-status.py --working-dir <working-dir>`. Keep the precondition check (the early `git rev-parse --git-dir` exit) by deriving it from the helper's `is_git_repo: false` output: stop with the same fixed message `execute-plan requires a git repository.`. Keep the dirty-workspace `(c)/(q)/(n)` menu and the new-worktree fall-through prose unchanged.
- [ ] **Step 2:** In Step 2 (Validate the plan), replace the prose checklist `Check the plan contains all of (1)–(5)` with a single sentence: `Run python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan <PLAN_PATH>; on non-zero exit, surface the stderr JSON missing_required_section / dependency_unknown_target / dependency_cycle errors verbatim and stop. Suggest re-running generate-plan.` Preserve the `## Test Command` extraction note (rule still defined here).
- [ ] **Step 3:** In Step 3 (Confirm execution settings), inside the `**Test command resolution order:**` block, replace the five-bullet sub-list under rule 2 ("Otherwise, auto-detect from project files:" — `package.json with a test script → npm test`, `Cargo.toml → cargo test`, `Makefile with a test: target → make test`, `pyproject.toml or setup.py → pytest`, `go.mod → go test ./...`) with a single sentence invoking `python3 agent/skills/_shared/scripts/detect-test-command.py --working-dir <working-dir>`; consume the helper's `.command` field. Keep rule 1 (plan-supplied command) and rule 3 (`If neither yields a command, show "not detected"`) unchanged.
- [ ] **Step 4:** In Step 5 (Build dependency graph and group into waves), delete the inline pseudo-code (`Wave 1 = tasks with no dependencies; Wave N = tasks whose latest dependency is in Wave N−1`) and replace with: `Read the waves array from extract-plan-tasks.py output (Step 2 invocation). Each entry is {wave, subwave, tasks}; dispatch each subwave in order. The cap MAX_PARALLEL_HARD_CAP = 8 is enforced by the helper; pass --max-parallel-hard-cap N to override.` Keep the worked example as a worked example only (no longer authoritative).
- [ ] **Step 5:** In Step 7 (Baseline test capture), replace the three-branch classification arithmetic (`If EXIT_CODE == 0 ... If EXIT_CODE != 0 AND NON_RECONCILABLE_COUNT == 0 ... If EXIT_CODE != 0 AND NON_RECONCILABLE_COUNT != 0`) with: `After artifact readback, run python3 agent/skills/_shared/scripts/reconcile-test-run.py --artifact <baseline-artifact-path> --mode capture. Read .classification (clean | stable-failures-only | contains-non-reconcilable-evidence) and .baseline_failures from stdout JSON, then route to the per-classification user prompts described below.` Keep the warning text and the `(c)/(x)` menu prose for the `contains-non-reconcilable-evidence` case unchanged. Step 7's stop-line `(x) Stop plan execution — fix the suite first.` is pre-wave-commit (parallel to Step 0's `(q) Quit`) and is NOT in spec Part B's verbatim list — leave it unchanged.
- [ ] **Step 6:** In Step 9 (Handle worker status codes), replace the prose `Read results[i].finalMessage for each worker report` with: `For each result, run python3 agent/skills/execute-plan/scripts/parse-coder-report.py --report <results[i].finalMessage path>; route on .status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED).` Keep the routing prose for each STATUS branch unchanged.
- [ ] **Step 7:** In Step 10 § 1 ("Drain the current wave"), replace the prose `Build BLOCKED_TASKS (Step 9 status BLOCKED) and CONCERNED_TASKS (status DONE_WITH_CONCERNS)` with: `Build BLOCKED_TASKS from parse-coder-report.py output (.status == "BLOCKED") and CONCERNED_TASKS from .status == "DONE_WITH_CONCERNS". Use the helper's .blocker_text or .concerns_block field for the user-facing escalation view.`
- [ ] **Step 8:** In Step 10 § 2 ("Blocked handling") `Task <N>:` per-task intervention menu, change the existing `(x) Stop execution    — halt the plan; prior wave commits remain in git history` line to the byte-equal Part B verbatim line: `(x) Stop execution — halt the plan; prior wave commits remain in git history` (single space before and after the em dash). Also confirm the surrounding indentation matches the other lines.
- [ ] **Step 9:** In Step 10 § 3 ("Concerns handling") menu, replace the existing `(x) Stop execution                      — halt the plan; prior wave commits remain in git history` with the Part B verbatim line, removing the trailing-spaces alignment so the line is byte-equal across all five sites.
- [ ] **Step 10:** In Step 11.2 (Dispatch the verifier), replace the union-rule prose (the three-bullet block describing task-declared / worker-reported / observed-diff inputs and the parallel-wave scoping rule) with: `For each task in the wave, run python3 agent/skills/execute-plan/scripts/compute-verifier-file-set.py --task-files <task-files-json> --worker-files <worker-files-json> --observed-status <git-status-output-path-or-dash> --observed-diff-paths <diff-paths-json> --wave-shape <single-task|parallel-multi-task>; consume .verifier_visible_files as {MODIFIED_FILES}.` The `--observed-status` argument is the path to a file holding the verbatim git status --porcelain output, or `-` to stream that output via stdin (matches the helper's `PATH_OR_DASH` contract from Task 4); never pass the porcelain text directly as the argument value. Keep the sub-task carve-out paragraph (covers protocol-violation recovery — orchestrator concern, not the helper's).
- [ ] **Step 11:** In Step 12.2 (Run integration tests), replace the inline arithmetic (`current_failing_stable := FAILING_IDENTIFIERS:`, `current_non_reconcilable := NON_RECONCILABLE_FAILURES:`, `current_non_baseline_stable := current_failing_stable \ baseline_failures`) with: `Run python3 agent/skills/_shared/scripts/reconcile-test-run.py --artifact <wave-artifact-path> --mode reconcile --baseline-failures <baseline-json-path>; consume .current_failing_stable, .current_non_reconcilable, .current_non_baseline_stable, and .classification (pass|fail). Render the integration-regression-gate.md three-section summary from those fields.` Keep all subsequent menu prose (intermediate-wave and final-wave variants) unchanged in policy but update both `(x) Stop plan execution      — halt plan execution; prior wave commits remain in git history` lines to the byte-equal Part B verbatim line.
- [ ] **Step 12:** In Step 13 ("Handle failures and retries"), rewrite the `Retry again ... / Stop the entire plan.` bullet list as the Part B.1 menu block, byte-equal:
  ```
  Options:
  (r) Retry again — optionally with a different model or more context. Resets the per-task budget back to 3 for that task only.
  (x) Stop execution — halt the plan; prior wave commits remain in git history
  ```
  Keep the surrounding prose `There is no skip option. Any unresolved failure ...` adjacent to the menu but updated to reference `(r)` and `(x)` instead of "Retry again" / "Stop the entire plan".
- [ ] **Step 13:** In Step 13 (wave pacing block — the trailing `(a)/(b)/(c)` list), replace the three-option list with the Part B.2 two-option menu, byte-equal:
  ```
  Options:
  (f) Pause only on failure   [default]
  (w) Pause every wave
  ```
  Update the surrounding prose `Apply wave pacing from Step 3.` to refer to `(f)` (the default) and `(w)`. Update the existing wording `BLOCKED, unresolved concerns, and VERDICT: FAIL already pause execution and are never eligible for option (b) deferral.` to `BLOCKED, unresolved concerns, and VERDICT: FAIL always pause via the gates regardless of wave pacing.` Update Step 3's `Wave pacing if parallel` prompt to surface the new two options and their default labels.
- [ ] **Step 14:** In Step 14 ("Report partial progress"), wherever the prose says `recompute current_non_baseline_stable and current_non_reconcilable against the frozen baseline_failures from the most recent artifact`, replace with: `Run python3 agent/skills/_shared/scripts/reconcile-test-run.py --artifact <most-recent-artifact-path> --mode reconcile --baseline-failures <baseline-json-path>; render .current_non_baseline_stable and .current_non_reconcilable into the report sections below.`
- [ ] **Step 15:** In Step 15 (Request code review) § `not_approved_within_budget` menu, replace the existing `(a) keep iterating (budget resets), (b) proceed with issues noted, or (c) stop` prose with the Part B.3 menu, byte-equal:
  ```
  Options:
  (c) Continue iterating — fresh budget; new era starts with a remediation pass on the prior era's findings before the next review.
  (p) Proceed with issues noted
  (x) Stop execution — halt the plan; prior wave commits remain in git history
  ```
  Update the immediately following sentence about preservation of `docs/test-runs/<plan-name>/` so it references the `(x)` option.
- [ ] **Step 16:** In Step 16 (Final integration regression gate) step 2, replace the inline arithmetic three bullets (`current_failing_stable := FAILING_IDENTIFIERS:`, etc.) with a single bullet: `Run python3 agent/skills/_shared/scripts/reconcile-test-run.py --artifact <final-gate-artifact-path> --mode reconcile --baseline-failures <baseline-json-path>; consume .current_failing_stable, .current_non_reconcilable, .current_non_baseline_stable, .classification.` In the failure menu, replace the existing `(x) Stop execution     — halt plan execution; prior wave commits remain in git history` with the byte-equal Part B verbatim line.
- [ ] **Step 17:** Run `wc -l agent/skills/execute-plan/SKILL.md` and confirm the line count is `<= 600`. If it exceeds 600, tighten prose: drop redundant cross-reference sentences, shorten descriptive paragraphs, but do NOT remove any of the documented hard rules, the boundary blocks, or the verbatim menu text. Iterate until the cap is met.
- [ ] **Step 18:** Search the file for the exact verbatim Part B stop line and confirm it appears at least 7 times: Step 10 § 2 (blocked per-task menu), Step 10 § 3 (concerns menu), Step 12.2 intermediate-wave menu, Step 12.2 final-wave menu, Step 13 (B.1 budget exhaustion), Step 15 (B.3 not-approved), Step 16 (final gate).
- [ ] **Step 19:** Confirm Step 0's `(q) Quit — cancel execution` line is unchanged (no edit; spec explicitly excludes Step 0 from menu standardization).

**Acceptance criteria:**
- Step 0's inline bash workspace detection is replaced by a `git-workspace-status.py` invocation; the dirty-workspace `(c)/(q)/(n)` menu remains.
  Verify: run `grep -nE "GIT_DIR_ABS=\$\(cd|GIT_COMMON_DIR_ABS=\$\(cd" agent/skills/execute-plan/SKILL.md` and confirm zero matches; then `grep -n "git-workspace-status.py" agent/skills/execute-plan/SKILL.md` and confirm at least one match within Step 0.
- Step 2 delegates plan validation to `extract-plan-tasks.py`; the inline 5-section enumeration is gone.
  Verify: open `agent/skills/execute-plan/SKILL.md`, locate `## Step 2: Validate the plan`, and confirm the section delegates to `extract-plan-tasks.py` and references `missing_required_section`, with no inline `1. A header (goal, architecture summary, tech stack)` enumeration remaining in Step 2.
- Step 3's auto-detect rules are replaced with a `detect-test-command.py` invocation.
  Verify: open `agent/skills/execute-plan/SKILL.md`, locate `**Test command resolution order:**` block, confirm rule 2 references `detect-test-command.py` and the original five-bullet list of project markers (`package.json with a test script → npm test`, etc.) is replaced by a single helper invocation.
- Step 5's wave-grouping pseudo-code is no longer the executable rule (helper output is).
  Verify: open `agent/skills/execute-plan/SKILL.md`, locate `## Step 5: Build dependency graph and group into waves`, confirm it states "Read the waves array from extract-plan-tasks.py output" and does not contain the words "topological" or "earliest wave where all its dependencies are" as instructions to the orchestrator (worked-example rendering of the same content may remain).
- Steps 9 and 10 delegate worker-report parsing to `parse-coder-report.py`.
  Verify: run `grep -n "parse-coder-report.py" agent/skills/execute-plan/SKILL.md` and confirm at least two matches inside Step 9 / Step 10.
- Step 11.2's union rule is delegated to `compute-verifier-file-set.py`, and the SKILL.md instruction passes `--observed-status` as a file path or `-` (not as raw porcelain text) to match the helper's `PATH_OR_DASH` contract.
  Verify: run `grep -n "compute-verifier-file-set.py" agent/skills/execute-plan/SKILL.md` and confirm at least one match inside Step 11; then open Step 11.2 and confirm the `--observed-status` argument in the helper invocation references a path or `-`/stdin (e.g. `<git-status-output-path-or-dash>`, `<porcelain-file>`, or `-`) and does NOT instruct the orchestrator to pass the verbatim porcelain text inline as the argument value.
- Steps 7, 12.2, 14, 16 invoke `reconcile-test-run.py`.
  Verify: run `grep -n "reconcile-test-run.py" agent/skills/execute-plan/SKILL.md` and confirm at least four matches.
- The verbatim line `(x) Stop execution — halt the plan; prior wave commits remain in git history` appears byte-equal at least seven times (Steps 10 § 2 blocked, 10 § 3 concerns, 12.2 intermediate-wave menu, 12.2 final-wave menu, 13 B.1 budget exhaustion, 15 B.3 not-approved, 16 final-gate).
  Verify: run `grep -cF "(x) Stop execution — halt the plan; prior wave commits remain in git history" agent/skills/execute-plan/SKILL.md` and confirm the printed count is >= 7.
- The Part B.1 budget-exhaustion menu uses `(r)` and `(x)` only.
  Verify: open Step 13 and confirm the menu reads exactly `(r) Retry again — optionally with a different model or more context. Resets the per-task budget back to 3 for that task only.` followed by the verbatim stop line.
- The Part B.2 wave-pacing menu uses `(f)` and `(w)` only — three-option `(a)/(b)/(c)` list is gone.
  Verify: run `grep -nE "^- \*\*\(a\)\*\* Always pause and report before the next wave starts" agent/skills/execute-plan/SKILL.md` and confirm zero matches; run `grep -n "(f) Pause only on failure" agent/skills/execute-plan/SKILL.md` and confirm at least one match.
- The Part B.3 Step 15 menu uses `(c)`, `(p)`, `(x)`.
  Verify: open Step 15 and confirm the menu lines read `(c) Continue iterating — fresh budget; new era starts with a remediation pass on the prior era's findings before the next review.`, `(p) Proceed with issues noted`, and the verbatim Part B stop line.
- Step 12 menu wording is trimmed — `halt plan execution` (the old Step 12 wording) no longer appears anywhere in the file.
  Verify: run `grep -cF "halt plan execution" agent/skills/execute-plan/SKILL.md` and confirm the printed count is `0`. (Step 7's pre-wave-commit `(x) Stop plan execution — fix the suite first.` uses different wording, so it does not contribute.)
- Step 0's `(q) Quit — cancel execution` is unchanged.
  Verify: run `grep -F "(q) Quit — cancel execution" agent/skills/execute-plan/SKILL.md` and confirm at least one match.
- The file is at most 600 lines.
  Verify: run `wc -l agent/skills/execute-plan/SKILL.md` and confirm the printed line count is `<= 600`.

**Model recommendation:** capable

---

### Task 10: Wire {CARRY_OVER_REVIEW} through refine-plan

**Files:**
- Modify: `agent/skills/refine-plan/refine-plan-prompt.md`
- Modify: `agent/skills/refine-plan/SKILL.md`

**Steps:**
- [ ] **Step 1:** In `refine-plan-prompt.md`, after the `## Original Spec` section and before `## Configuration`, insert a new section:
  ```
  ## Carry-Over Review

  {CARRY_OVER_REVIEW}
  ```
- [ ] **Step 2:** In `refine-plan-prompt.md`, in the `## Protocol` section, after the `### Reviewer provenance stamping` block and before `### Per-Iteration Full Review`, insert a new subsection titled `### Carry-over edit pass (era handoff)` with the exact body specified in spec Part C ("Fix (refine-plan)"):
  ```
  When `{CARRY_OVER_REVIEW}` is non-empty, perform a planner edit pass against that review file's findings BEFORE entering the Per-Iteration Full Review loop:

  1. Read the carry-over review file at `{CARRY_OVER_REVIEW}`.
  2. Extract Critical + Important findings (skip Minor — non-blocking, same rule as the in-loop Planner Edit Pass).
  3. Dispatch `planner` (edit mode) per the existing Planner Edit Pass procedure with `{REVIEW_FINDINGS}` populated from the extracted findings and `{OUTPUT_PATH} = {PLAN_PATH}`.
  4. After the planner returns, verify the plan file still exists and is non-empty (same check as the in-loop Planner Edit Pass step 4). If missing or empty, emit `STATUS: failed` with reason `input artifact missing or empty: plan file after carry-over edit pass`.
  5. Begin Per-Iteration Full Review at iteration 1. The carry-over edit pass does NOT consume an iteration of the new era's `{MAX_ITERATIONS}` budget.

  When `{CARRY_OVER_REVIEW}` is empty (first-era runs, etc.), skip the carry-over edit pass entirely and begin Per-Iteration Full Review at iteration 1 as today.
  ```
- [ ] **Step 3:** In `refine-plan-prompt.md`'s `## Failure Modes` table, extend the `Input artifact` row's `<which>` enumeration from `plan file at iteration start | plan file after planner edit pass` to `plan file at iteration start | plan file after planner edit pass | plan file after carry-over edit pass`.
- [ ] **Step 4:** In `refine-plan/SKILL.md` Step 1 inputs table, add a new row: `| CARRY_OVER_REVIEW | no | empty | Path to a prior era's review file. Internally re-set by Step 10 § not_approved_within_budget (a) re-entry. May also be supplied directly by a caller for standalone "edit-then-review" use against a hand-crafted review file (see spec Part C "Standalone-use bonus"). |`. Whatever path is supplied (caller-set or internally re-set) MUST be threaded through to Step 7's `fill-refine-plan-prompt.py --carry-over-review` invocation unchanged.
- [ ] **Step 5:** In `refine-plan/SKILL.md` Step 7 (Assemble coordinator prompt), append `--carry-over-review "<CARRY_OVER_REVIEW or empty>"` to the existing `fill-refine-plan-prompt.py` invocation argument list. Update the surrounding sentence to mention the new flag.
- [ ] **Step 6:** In `refine-plan/SKILL.md` Step 10 § `not_approved_within_budget` `(a)` ("Run Step 10a (commit current era). Step 10a MUST succeed (`COMMIT = committed`) before the next era is dispatched."), add a sentence after the existing "may the skill re-run from Step 6 onward, with `STARTING_ERA` recomputed by re-scanning `docs/plans/reviews/`": `Before re-entering Step 6, set CARRY_OVER_REVIEW = <era-N review file path that was just committed in Step 10a> so the next plan-refiner dispatch performs a carry-over edit pass against era N's findings.`
- [ ] **Step 7:** Open the file and confirm visually that the new section in `refine-plan-prompt.md` has only ONE `## ` heading per section and that the new subsection in `## Protocol` is placed ABOVE `### Per-Iteration Full Review` so the carry-over edit pass runs first.
- [ ] **Step 8:** Run a sanity check: pre-build a temp plan file and a temp review file, then invoke `python3 agent/skills/refine-plan/scripts/fill-refine-plan-prompt.py --plan-path <tmp-plan> --task-artifact "" --source-todo "" --source-spec "" --scout-brief "" --original-spec-inline /dev/null --structural-only-note /dev/null --max-iterations 3 --starting-era 1 --review-output-path docs/plans/reviews/foo --working-dir /tmp --model-matrix /dev/null --carry-over-review docs/plans/reviews/foo-plan-review-v1.md --output -` and confirm the printed output contains the substituted `## Carry-Over Review` section text.

**Acceptance criteria:**
- `refine-plan-prompt.md` contains a `## Carry-Over Review` placeholder section and a `### Carry-over edit pass (era handoff)` subsection.
  Verify: run `grep -nF "## Carry-Over Review" agent/skills/refine-plan/refine-plan-prompt.md` and confirm at least one match; run `grep -nF "### Carry-over edit pass (era handoff)" agent/skills/refine-plan/refine-plan-prompt.md` and confirm at least one match.
- The carry-over subsection is placed before `### Per-Iteration Full Review`.
  Verify: open `agent/skills/refine-plan/refine-plan-prompt.md` and confirm the line number of `### Carry-over edit pass (era handoff)` is strictly less than the line number of `### Per-Iteration Full Review`.
- The `## Failure Modes` table is extended with the new failure mode.
  Verify: run `grep -F "plan file after carry-over edit pass" agent/skills/refine-plan/refine-plan-prompt.md` and confirm at least one match.
- `refine-plan/SKILL.md` Step 1 lists `CARRY_OVER_REVIEW` as an input that is ALSO directly supplyable by a caller (standalone-use mode), not internal-only.
  Verify: run `grep -F "CARRY_OVER_REVIEW" agent/skills/refine-plan/SKILL.md` and confirm at least one match within Step 1's inputs table; then open Step 1 and confirm the `CARRY_OVER_REVIEW` row's description mentions caller-supplied / standalone use (e.g. words like "may also be supplied", "caller", "standalone", or "directly") and does NOT say "not user-supplied directly".
- A caller-supplied (non-empty) `CARRY_OVER_REVIEW` is propagated unchanged through Step 7's helper invocation.
  Verify: open `agent/skills/refine-plan/SKILL.md` Step 7 and confirm the `fill-refine-plan-prompt.py` invocation passes `--carry-over-review "<CARRY_OVER_REVIEW or empty>"` (or equivalent variable interpolation) such that whatever value Step 1 received — caller-set OR internally re-set — flows into the helper without being overridden or discarded.
- `refine-plan/SKILL.md` Step 7's helper invocation includes `--carry-over-review`.
  Verify: run `grep -F "--carry-over-review" agent/skills/refine-plan/SKILL.md` and confirm at least one match within Step 7.
- `refine-plan/SKILL.md` Step 10 § `not_approved_within_budget` `(a)` sets `CARRY_OVER_REVIEW` before re-running from Step 6.
  Verify: open `agent/skills/refine-plan/SKILL.md` and confirm the `not_approved_within_budget` `(a)` block contains the literal text `CARRY_OVER_REVIEW =` (assignment) followed by a description that the era-N review file path is used.
- The fill helper produces a populated `## Carry-Over Review` section when `--carry-over-review` is non-empty.
  Verify: run the command from Step 8 above (with temporary files) and confirm the output (stdout) contains a `## Carry-Over Review` section followed by a non-empty value (the path argument).

**Model recommendation:** standard

---

### Task 11: Wire {CARRY_OVER_REVIEW} through refine-code

**Files:**
- Modify: `agent/skills/refine-code/refine-code-prompt.md`
- Modify: `agent/skills/refine-code/SKILL.md`

**Steps:**
- [ ] **Step 1:** In `refine-code-prompt.md`, after `## Requirements/Plan` and before `## Git Range`, insert a new section:
  ```
  ## Carry-Over Review

  {CARRY_OVER_REVIEW}
  ```
- [ ] **Step 2:** In `refine-code-prompt.md`, in the `## Protocol` section, after the `### Era handling` subsection and before `### Iteration 1: Full Review`, insert a new subsection titled `### Carry-over remediation pass (era handoff)` with body:
  ```
  When `{CARRY_OVER_REVIEW}` is non-empty, perform one targeted code-edit pass against that review file's findings BEFORE entering the Iteration 1 Full Review loop:

  1. Read the carry-over review file at `{CARRY_OVER_REVIEW}`.
  2. Extract Critical + Important findings (skip Minor — non-blocking).
  3. Dispatch `coder` (remediator) per the existing Iteration 1 Step 6 remediation procedure with `{REVIEW_FINDINGS}` populated from the extracted findings, scoped to the files referenced by the carry-over findings.
  4. Commit the remediation per Iteration 1 Step 7's commit shape (`fix(review): carry-over — <summary>`).
  5. Begin Iteration 1 Full Review against the post-remediation HEAD. The carry-over remediation pass does NOT consume an iteration of the new era's `{MAX_ITERATIONS}` budget.

  When `{CARRY_OVER_REVIEW}` is empty (first-era runs, etc.), skip the carry-over remediation pass entirely and begin Iteration 1 Full Review as today.
  ```
- [ ] **Step 3:** In `refine-code/SKILL.md` Step 1 inputs table, add a new row: `| Carry-over review | no | empty | Path to a prior era's review file. Internally re-set on (a) Keep iterating re-entry from Step 5. May also be supplied directly by a caller for standalone "fix this set of findings, then verify" use against a hand-crafted review file (see spec Part C "Standalone-use bonus"). |`. Whatever path is supplied (caller-set or internally re-set) MUST be threaded through to Step 3's `fill-refine-code-prompt.py --carry-over-review` invocation unchanged.
- [ ] **Step 4:** In `refine-code/SKILL.md` Step 3 (Assemble coordinator prompt), append `--carry-over-review "<carry-over review path or empty>"` to the existing `fill-refine-code-prompt.py` invocation argument list.
- [ ] **Step 5:** In `refine-code/SKILL.md` Step 5 § `not_approved_within_budget` `(a) Keep iterating`, replace the existing `re-invoke this skill from Step 3 with the same inputs but HEAD_SHA updated to current HEAD (budget resets, new cycle)` with: `re-invoke this skill from Step 3 with the same inputs but HEAD_SHA updated to current HEAD AND --carry-over-review set to the prior era's review file path (so code-refiner runs a carry-over remediation pass against the prior era's findings before the next review). Budget resets, new cycle.`
- [ ] **Step 6:** Confirm visually that `### Carry-over remediation pass (era handoff)` is placed ABOVE `### Iteration 1: Full Review` in `refine-code-prompt.md`.

**Acceptance criteria:**
- `refine-code-prompt.md` contains a `## Carry-Over Review` placeholder section and a `### Carry-over remediation pass (era handoff)` subsection.
  Verify: run `grep -nF "## Carry-Over Review" agent/skills/refine-code/refine-code-prompt.md` and confirm at least one match; run `grep -nF "### Carry-over remediation pass (era handoff)" agent/skills/refine-code/refine-code-prompt.md` and confirm at least one match.
- The carry-over subsection precedes `### Iteration 1: Full Review`.
  Verify: open `agent/skills/refine-code/refine-code-prompt.md` and confirm the line number of `### Carry-over remediation pass (era handoff)` is strictly less than `### Iteration 1: Full Review`.
- `refine-code/SKILL.md` Step 1 lists Carry-over review as an input that is ALSO directly supplyable by a caller (standalone-use mode), not internal-only.
  Verify: run `grep -nF "Carry-over review" agent/skills/refine-code/SKILL.md` and confirm at least one match within Step 1's inputs table; then open Step 1 and confirm the Carry-over review row's description mentions caller-supplied / standalone use (e.g. words like "may also be supplied", "caller", "standalone", or "directly") and does NOT say "not user-supplied directly".
- A caller-supplied (non-empty) carry-over review path is propagated unchanged through Step 3's helper invocation.
  Verify: open `agent/skills/refine-code/SKILL.md` Step 3 and confirm the `fill-refine-code-prompt.py` invocation passes `--carry-over-review "<carry-over review path or empty>"` (or equivalent variable interpolation) such that whatever value Step 1 received — caller-set OR internally re-set — flows into the helper without being overridden or discarded.
- `refine-code/SKILL.md` Step 3's helper invocation includes `--carry-over-review`.
  Verify: run `grep -F "--carry-over-review" agent/skills/refine-code/SKILL.md` and confirm at least one match within Step 3.
- `refine-code/SKILL.md` Step 5 § `not_approved_within_budget` `(a)` re-entry sets carry-over.
  Verify: open `agent/skills/refine-code/SKILL.md` Step 5 and confirm the `(a) Keep iterating` bullet's text mentions `--carry-over-review` and the prior era's review file path.

**Model recommendation:** standard

---

### Task 12: Update READMEs to document new helpers

**Files:**
- Modify: `agent/skills/_shared/scripts/README.md`
- Modify: `agent/skills/execute-plan/scripts/README.md`

**Steps:**
- [ ] **Step 1:** In `agent/skills/_shared/scripts/README.md`, under `## Helpers`, insert three new bullets in alphabetical order: `- **detect-test-command.py** — Detects the project's test command from on-disk markers (package.json with a scripts.test, Cargo.toml, Makefile with a test: target, pyproject.toml/setup.py, go.mod) in resolution order. Example: \`python3 detect-test-command.py --working-dir .\`.`; `- **git-workspace-status.py** — Read-only git workspace probe. Detects whether the directory is a git repo, on a worktree, on a feature branch, in detached HEAD, and reports git status --porcelain output. Example: \`python3 git-workspace-status.py --working-dir .\`.`; `- **reconcile-test-run.py** — Computes baseline capture and per-run reconciliation for the integration regression gate. Two modes: capture (Step 7 baseline) and reconcile (Steps 12.2, 14, 16). Example: \`python3 reconcile-test-run.py --artifact baseline.log --mode capture\`.`.
- [ ] **Step 2:** In `agent/skills/execute-plan/scripts/README.md`, under `## Helpers`, update the existing `extract-plan-tasks.py` bullet to mention the new validation behaviors and `waves` output: `- **extract-plan-tasks.py** — Parses a structured plan document and extracts tasks, dependencies, and acceptance criteria. Validates required top-level sections, dependency reference targets, and dependency cycles, and emits a waves array (with sub-wave splitting at MAX_PARALLEL_HARD_CAP) for use by Step 5 of execute-plan. Example: \`python3 extract-plan-tasks.py --plan plan.md --max-parallel-hard-cap 8\`.`.
- [ ] **Step 3:** In `agent/skills/execute-plan/scripts/README.md`, add two new bullets in alphabetical position: `- **compute-verifier-file-set.py** — Computes the verifier-visible file set per the Step 11.2 union rule, from task-declared, worker-reported, and orchestrator-observed inputs. Wave-shape-specific scoping (single-task or parallel-multi-task). Example: \`python3 compute-verifier-file-set.py --task-files task.json --worker-files worker.json --observed-status status.txt --observed-diff-paths diff.json --wave-shape single-task\`.`; `- **parse-coder-report.py** — Parses a coder worker's STATUS / files-changed / concerns blocks per execute-task-prompt.md's Report Format. Used by Steps 9, 10, and 11 of execute-plan for status routing, BLOCKED/CONCERNED task building, and files-changed extraction. Example: \`python3 parse-coder-report.py --report final-message.txt\`.`.

**Acceptance criteria:**
- `_shared/scripts/README.md` documents all three new helpers.
  Verify: run `grep -nF "detect-test-command.py" agent/skills/_shared/scripts/README.md` and `grep -nF "git-workspace-status.py" agent/skills/_shared/scripts/README.md` and `grep -nF "reconcile-test-run.py" agent/skills/_shared/scripts/README.md`; each returns at least one match.
- `execute-plan/scripts/README.md` documents both new helpers and the extended `extract-plan-tasks.py` capabilities.
  Verify: run `grep -nF "compute-verifier-file-set.py" agent/skills/execute-plan/scripts/README.md` and `grep -nF "parse-coder-report.py" agent/skills/execute-plan/scripts/README.md`; each returns at least one match. Also run `grep -F "waves" agent/skills/execute-plan/scripts/README.md` and confirm the bullet mentioning `waves` appears under the `extract-plan-tasks.py` bullet.

**Model recommendation:** cheap

---

### Task 13: Wire detect-test-command.py into using-git-worktrees and finishing-a-development-branch

**Files:**
- Modify: `agent/skills/using-git-worktrees/SKILL.md`
- Modify: `agent/skills/finishing-a-development-branch/SKILL.md`

**Steps:**
- [ ] **Step 1:** In `using-git-worktrees/SKILL.md` step `### 4. Verify Clean Baseline`, replace the four-line example block (`npm test\ncargo test\npytest\ngo test ./...`) with: `Resolve the project's test command via python3 ~/.pi/agent/skills/_shared/scripts/detect-test-command.py --working-dir <worktree-path>; consume .command. If .detected is false, ask the user for an explicit command before continuing.` Keep the surrounding "If tests fail" / "If tests pass" paragraphs unchanged.
- [ ] **Step 2:** In `finishing-a-development-branch/SKILL.md` `### Step 4: Execute Choice` `#### Option 1: Merge Locally` block, replace the literal `<test command>` placeholder line with: `# Resolve the test command via detect-test-command.py and run it.` followed on the next line by `python3 ~/.pi/agent/skills/_shared/scripts/detect-test-command.py --working-dir . | jq -r '.command' | xargs -I{} sh -c '{}'` (or equivalent prose noting that the command is detected via the helper, then run). If the surrounding markdown is bash-fenced and shouldn't include `jq`-style chains, simplify to plain prose: replace the placeholder with `Run the command returned by python3 ~/.pi/agent/skills/_shared/scripts/detect-test-command.py --working-dir . (consume the .command field) before proceeding.`. Choose the form that fits the file's style.
- [ ] **Step 3:** In `using-git-worktrees/SKILL.md`, scan the file for the `## Quick Reference` and `## Common Mistakes` sections; if any reference hard-coded test commands (`npm test`, `cargo test`, `pytest`, `go test ./...`) as illustrative examples in tables/lists, leave them alone — those are example forms, not the executable instruction. Only the executable "Verify Clean Baseline" step needs the helper invocation.
- [ ] **Step 4:** Open both files and confirm the wording is consistent: each consumer either references `detect-test-command.py` directly or describes consuming its `.command` field.

**Acceptance criteria:**
- `using-git-worktrees/SKILL.md` references `detect-test-command.py` in the baseline test verification step.
  Verify: run `grep -nF "detect-test-command.py" agent/skills/using-git-worktrees/SKILL.md` and confirm at least one match within or after the `### 4. Verify Clean Baseline` heading.
- `finishing-a-development-branch/SKILL.md` references `detect-test-command.py` in Option 1 (Merge Locally).
  Verify: run `grep -nF "detect-test-command.py" agent/skills/finishing-a-development-branch/SKILL.md` and confirm at least one match within or after `#### Option 1: Merge Locally`.
- The previous hard-coded example commands are no longer presented as the executable instruction in the baseline-verification step (illustrative tables/quick-reference rows may keep them).
  Verify: open `agent/skills/using-git-worktrees/SKILL.md` and confirm the `### 4. Verify Clean Baseline` block does not contain a fenced bash code block listing `npm test`, `cargo test`, `pytest`, and `go test ./...` together as the instruction.

**Model recommendation:** standard

---

## Dependencies

- Task 9 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6
- Task 10 depends on: Task 7
- Task 11 depends on: Task 8
- Task 12 depends on: Task 1, Task 4, Task 6, Task 2, Task 3, Task 5
- Task 13 depends on: Task 5

## Risk Assessment

- **600-line cap on `execute-plan/SKILL.md` may force harder prose tightening than the helper extractions provide.** Mitigation: the cap is enforced by an explicit verify recipe in Task 9 (`wc -l <= 600`); if Task 9's worker reports a line overrun, the spec says the implementer tightens prose rather than raising the cap. Risk that aggressive trimming removes a load-bearing rule is mitigated by the byte-equal verify recipes for the verbatim stop line, the menu structure, and the Step 0 `(q)` preservation — those are all checked separately so prose tightening cannot accidentally drop them.
- **`reconcile-test-run.py` calling `parse-test-runner-artifact.py` as a subprocess is one extra process per gate.** Acceptable: gate runs are infrequent (once per wave), and re-using the existing parser avoids duplicating its already-tested header validation. If profiling later shows the subprocess cost is meaningful, importing the parser as a module is a follow-up.
- **`compute-verifier-file-set.py`'s parallel-multi-task scoping rule depends on directory-prefix matching.** Path normalization (`os.path.normpath`) handles Windows-style separators inconsistently with POSIX. The codebase is exercised on macOS/Linux per the env description; sticking with POSIX-style `/` separators is the documented convention. Helper tests fix the contract on POSIX paths.
- **Worker reports may include shape variants in `## Files Changed` bullets that the spec describes as "skipped silently".** This is documented behavior — skipping a malformed bullet does not raise an error. Risk: if every bullet is malformed, `files_changed` is empty and Step 11.2's union rule reduces to task-declared + observed. That is acceptable per the spec ("Worker-reported changes — paths from the worker's `## Files Changed` section (informative, not authoritative on their own)").
- **Carry-over edit pass changes the era-handoff semantics in subtle ways.** The risk is a malformed or missing carry-over review file silently dropping era-N findings. Mitigated by the new failure mode `input artifact missing or empty: plan file after carry-over edit pass` plus the existing post-edit-pass plan-file existence check.
- **The execute-plan SKILL.md edits touch 11 separate steps in one task.** This concentrates risk in Task 9. Mitigation: each step rewrite has an explicit verify recipe (grep / line-number checks) in the acceptance criteria so a single regression in Task 9 is caught quickly. The model recommendation is `capable` to give the worker enough room for the cross-step coordination.
- **Tests that drive `git-workspace-status.py` need a working `git` binary in `PATH`.** All CI environments and the user's macOS shell have one; the test setUp uses `subprocess.run(["git", "init", ...])` with a fresh `tempfile.mkdtemp()` per test. If a test environment lacks `git`, the failure surfaces immediately as `FileNotFoundError`, not as a flaky pass.

## Test Command

```bash
cd agent && npm run test:helpers
```

## Review Notes

_Approved with concerns by plan reviewer in the prior iteration. The Important (waived) finding regarding `observed_paths` ordering in Task 4 has been incorporated into this iteration: Task 4 Step 4 and Step 6 now explicitly state first-occurrence dedup (no sorting), and Step 17 adds an ordering test._
