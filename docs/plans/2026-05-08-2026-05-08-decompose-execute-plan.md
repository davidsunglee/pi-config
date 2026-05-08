# Decompose execute-plan: extract internal protocol docs and shared test-runner dispatch

**Source:** TODO-b733a4af
**Spec:** docs/specs/2026-05-08-decompose-execute-plan.md

## Goal

Extract four reusable pieces from the `execute-plan` monolith into internal protocol markdown documents to slim `agent/skills/execute-plan/SKILL.md` from 775 lines to ≤ 600. The test-runner dispatch path (with its prompt template + parser + tests) becomes `agent/skills/_shared/test-runner-dispatch.md` and friends — co-located with `coordinator-dispatch.md` because its four-input contract is clean of execute-plan-specific shape. Per-task acceptance verification, the integration-regression gate (replacing `integration-regression-model.md`), and the parameterized debugger-first flow each become internal protocol docs co-located with `execute-plan/`. Also rename `agent/skills/define-spec/procedure.md` → `spec-design-procedure.md` to align with the suite-wide noun-phrase-ending-in-a-type-word convention. After this plan: SKILL.md is shorter, the four protocols have single-source-of-truth files, and `parse-test-runner-artifact.py` tolerates artifacts written without a `PHASE:` header line so future callers can omit `phase_label`.

## Architecture summary

The pre-change SKILL.md is 775 lines and mixes orchestrator-side wave coordination with several reusable sub-protocols. The chosen approach extracts exactly four protocol skeletons into markdown and migrates the test-runner support files (prompt template + parser + tests + fixtures) under `_shared/`:

- `agent/skills/_shared/test-runner-dispatch.md` (new) — Documents the four-input dispatch contract (`test_command`, `working_dir`, `artifact_path`, optional `phase_label`), the orchestrator behavior (`mkdir -p`, hardcoded `crossProvider.cheap` model resolution, fill the prompt, dispatch via `subagent_run_serial`, parse handoff + artifact), the success output shape, and the enumerated structured failure reasons. Replaces the inline `Test-runner dispatch (shared)` subsection currently in execute-plan Step 7.
- `agent/skills/_shared/test-runner-prompt.md` (moved from `execute-plan/`) — Test-runner prompt template; gains a conditional `{PHASE_SECTION}` placeholder that callers fill with either the phase section or an empty string.
- `agent/skills/_shared/scripts/parse-test-runner-artifact.py` (moved from `execute-plan/scripts/`) — Same artifact parser; gains tolerance for an absent `PHASE:` header line and continues to reject malformed `PHASE:` lines.
- `agent/skills/_shared/scripts/tests/test_parse_test_runner_artifact.py` and the six fixtures (moved with the parser) — gain new tests for the optional-`PHASE:` cases per spec Requirement 8.
- `agent/skills/_shared/scripts/tests/test_test_runner_prompt_assembly.py` (new test file) — covers prompt assembly with and without a phase section.
- `agent/skills/execute-plan/acceptance-criteria-verification.md` (new) — Documents the per-task verification protocol: inputs (task spec, criteria + Verify recipes, verifier-visible files, diff context, working dir), behavior (validate Verify recipes present, classify as command/inspection style, fill `verify-task-prompt.md`, dispatch one verifier on `crossProvider.standard`, parse), output (per-criterion verdicts + overall `VERDICT:`), and out-of-scope items (parallel dispatch shape, retry loops, `{MODIFIED_FILES}` union rule — all caller-owned). Step 11 of SKILL.md retains only the wave-level orchestration.
- `agent/skills/execute-plan/integration-regression-gate.md` (new; replaces `integration-regression-model.md`) — Subsumes the data model + summary format from the predecessor and adds the gate procedure: `capture mode` (returns frozen `baseline_failures` and classification), `reconcile mode` (returns the structured classification + canonical three-section summary string). Menus, debug dispatch, commits, retry-budget bookkeeping stay in callers.
- `agent/skills/execute-plan/integration-regression-debugging.md` (new) — Parameterized debugger-first flow with both Step 12 (post-wave) and Step 16 (final-gate) parameter rows in-file. Inputs: `current_failures`, `change_range`, `suspect_universe`, `commit_template`, `undo_policy`, `re_test_callback`. Output: `success | fail` plus an optional "may undo wave commit" hint when `undo_policy = allowed`. Menu rendering, retry-budget bookkeeping, and undo execution stay in callers.
- `agent/skills/define-spec/spec-design-procedure.md` (renamed from `procedure.md`) — Content preserved verbatim; rename only.
- `agent/skills/execute-plan/SKILL.md` (modified) — Step 7 references `test-runner-dispatch.md` and `integration-regression-gate.md`; Step 11 references `acceptance-criteria-verification.md`; Step 12 references `integration-regression-debugging.md` and `integration-regression-gate.md`; Step 16's `(d)` path references `integration-regression-debugging.md` directly rather than indirecting through Step 12. Final line count ≤ 600.

After all references update, `agent/skills/execute-plan/integration-regression-model.md` is deleted. Repo-wide greps for `integration-regression-model`, `define-spec/procedure.md`, `agent/skills/execute-plan/test-runner-prompt.md`, and `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py` must all return zero matches at the end.

## Tech stack

- Markdown documents under `agent/skills/_shared/`, `agent/skills/execute-plan/`, and `agent/skills/define-spec/`.
- Python 3 helper scripts and unittest test files under `agent/skills/_shared/scripts/` and `agent/skills/execute-plan/scripts/`. Test runner is `python3 -m unittest discover` invoked via the repo's `npm run test:helpers` script in `agent/package.json`.
- No new helper scripts. The migrated `parse-test-runner-artifact.py` retains its CLI / JSON-output shape.

## File Structure

- `agent/skills/_shared/test-runner-dispatch.md` (Create) — New shared internal protocol doc documenting the four-input test-runner dispatch contract, behavior, success output, and enumerated failure reasons. No frontmatter; no README.
- `agent/skills/_shared/test-runner-prompt.md` (Create — moved from `agent/skills/execute-plan/test-runner-prompt.md`) — Test-runner prompt template with conditional `{PHASE_SECTION}` placeholder.
- `agent/skills/_shared/scripts/parse-test-runner-artifact.py` (Create — moved from `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py`) — Test-runner artifact parser; tolerates absent `PHASE:` header line, rejects malformed `PHASE:` line. Path-resolution to `parse-artifact-handoff.py` updated for the new location.
- `agent/skills/_shared/scripts/tests/test_parse_test_runner_artifact.py` (Create — moved from `agent/skills/execute-plan/scripts/tests/test_parse_test_runner_artifact.py`) — Existing tests plus new tests for absent-`PHASE:` and malformed-`PHASE:` cases.
- `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-clean.txt` (Create — moved) — Existing fixture.
- `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-stable-failures.txt` (Create — moved) — Existing fixture.
- `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-non-reconcilable.txt` (Create — moved) — Existing fixture.
- `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-out-of-order.txt` (Create — moved) — Existing fixture.
- `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-missing-marker.txt` (Create — moved) — Existing fixture.
- `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-count-mismatch.txt` (Create — moved) — Existing fixture.
- `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-no-phase.txt` (Create) — New fixture demonstrating an artifact without the `PHASE:` header line.
- `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-malformed-phase.txt` (Create) — New fixture demonstrating an artifact with a present-but-malformed `PHASE:` line.
- `agent/skills/_shared/scripts/tests/test_test_runner_prompt_assembly.py` (Create) — New test file covering prompt assembly with and without a phase section.
- `agent/skills/execute-plan/acceptance-criteria-verification.md` (Create) — Per-task verification protocol; no frontmatter.
- `agent/skills/execute-plan/integration-regression-gate.md` (Create) — Subsumes content from `integration-regression-model.md`, adds capture/reconcile gate procedure; no frontmatter.
- `agent/skills/execute-plan/integration-regression-debugging.md` (Create) — Parameterized debugger-first flow with both Step 12 and Step 16 parameter rows; no frontmatter.
- `agent/skills/execute-plan/integration-regression-model.md` (Delete) — Subsumed by `integration-regression-gate.md`.
- `agent/skills/execute-plan/test-runner-prompt.md` (Delete — moved to `_shared/`) — Path superseded.
- `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py` (Delete — moved to `_shared/scripts/`) — Path superseded.
- `agent/skills/execute-plan/scripts/tests/test_parse_test_runner_artifact.py` (Delete — moved) — Path superseded.
- `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-*.txt` (Delete — six fixtures moved) — Paths superseded.
- `agent/skills/execute-plan/SKILL.md` (Modify) — Replace inline test-runner dispatch + per-task verification + debugger-first flow content with references; update all `integration-regression-model.md` references to `integration-regression-gate.md`; trim to ≤ 600 lines.
- `agent/skills/execute-plan/README.md` (Modify) — Update `integration-regression-model.md` reference to `integration-regression-gate.md`; remove file-list entries that have moved out (test-runner-prompt.md is not in the README's file list, but verify).
- `agent/skills/execute-plan/scripts/README.md` (Modify) — Remove the `parse-test-runner-artifact.py` bullet (it has moved).
- `agent/skills/_shared/scripts/README.md` (Modify) — Add a `parse-test-runner-artifact.py` bullet to the helpers list (it now lives here).
- `agent/skills/_shared/orchestrator-verification-boundary.md` (Modify) — Update the inline path reference for `parse-test-runner-artifact.py` to the new `_shared/scripts/` location.
- `agent/agents/test-runner.md` (Modify) — Mark the `PHASE:` artifact-format line optional; update prose to clarify `PHASE:` is included only when the orchestrator supplies a non-empty phase label.
- `agent/skills/define-spec/spec-design-procedure.md` (Create — renamed from `agent/skills/define-spec/procedure.md`) — Content preserved verbatim from the predecessor file.
- `agent/skills/define-spec/procedure.md` (Delete — renamed) — Path superseded.
- `agent/skills/define-spec/SKILL.md` (Modify) — Update three references to `procedure.md` so they read `spec-design-procedure.md`.

## Tasks

### Task 1: Update parse-test-runner-artifact.py to tolerate absent `PHASE:` header line

**Files:**
- Modify: `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py`
- Modify: `agent/skills/execute-plan/scripts/tests/test_parse_test_runner_artifact.py`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-no-phase.txt`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-malformed-phase.txt`

**Steps:**
- [ ] **Step 1: Add new "no PHASE" fixture** — Write `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-no-phase.txt` containing a clean-baseline artifact with the `PHASE: baseline` line removed (first non-empty line is now `COMMAND: npm test`). All other headers in canonical order; both counts 0; raw output marker present.
- [ ] **Step 2: Add new "malformed PHASE" fixture** — Write `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-malformed-phase.txt` containing a clean-baseline artifact whose first line is `PHASE:` (colon with no space, no value) — i.e. present-but-malformed. All other headers canonical; both counts 0; raw output marker present.
- [ ] **Step 3: Update `parse_artifact()` to make `PHASE:` optional** — In `parse-test-runner-artifact.py`, change the first header read so that if `lines[0]` starts with `PHASE: `, consume it and capture the value as `phase`; if `lines[0]` is exactly `PHASE` or `PHASE:` (no value, malformed), call `_fail("header_missing", path, ...)` (treat the malformed shape as the existing header_missing failure rather than introducing a new label); otherwise (first line starts with `COMMAND: ` or any other content), set `phase = None` and proceed without consuming a line. The downstream JSON output sets `phase` to the string value when present, or `None` when absent.
- [ ] **Step 4: Add the four new tests** — In `test_parse_test_runner_artifact.py`, add four new `unittest.TestCase` classes covering: (a) the new no-phase fixture parses successfully with `phase` field equal to `None`; (b) the new malformed-phase fixture is rejected with the existing `header_missing` (or equivalent) failure label; (c) prompt assembly placeholder behavior — moved to Task 11 — is NOT covered here; this task only covers parser behavior; (d) an inline-content test (using `write_temp_artifact`) confirming the JSON output shape includes `phase: null` when no PHASE: line is present.
- [ ] **Step 5: Run the test file in isolation** — From `agent/`, run `python3 -m unittest discover -s skills/execute-plan/scripts/tests -p test_parse_test_runner_artifact.py`. All tests must pass (existing + new).
- [ ] **Step 6: Run the full helper suite** — From `agent/`, run `npm run test:helpers`. All tests in all four discovery directories must continue to pass.

**Acceptance criteria:**

- The parser script accepts an artifact whose first non-empty line is `COMMAND:` rather than `PHASE:`; the parsed JSON contains `phase: null`.
  Verify: from `agent/`, run `python3 skills/execute-plan/scripts/parse-test-runner-artifact.py --artifact skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-no-phase.txt` and confirm exit code is 0 and stdout JSON contains `"phase": null`.
- The parser script rejects an artifact whose first line is `PHASE:` (malformed — no space, no value).
  Verify: from `agent/`, run `python3 skills/execute-plan/scripts/parse-test-runner-artifact.py --artifact skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-malformed-phase.txt` and confirm exit code is non-zero and stderr JSON `.failure` field equals `"header_missing"` (or equivalent existing label — the recipe accepts whichever existing label the implementation chose).
- Existing parser tests continue to pass.
  Verify: from `agent/`, run `python3 -m unittest discover -s skills/execute-plan/scripts/tests -p test_parse_test_runner_artifact.py` and confirm zero failures, zero errors.
- The full helper test suite passes after this task.
  Verify: from `agent/`, run `npm run test:helpers` and confirm exit code 0 and no failure output.
- The two new fixtures exist on disk.
  Verify: `ls agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-no-phase.txt agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-malformed-phase.txt` returns both files.

**Model recommendation:** standard

### Task 2: Update test-runner-prompt.md to use a conditional `{PHASE_SECTION}` placeholder

**Files:**
- Modify: `agent/skills/execute-plan/test-runner-prompt.md`

**Steps:**
- [ ] **Step 1: Replace the phase block with `{PHASE_SECTION}`** — In `agent/skills/execute-plan/test-runner-prompt.md`, replace the three lines `## Phase Label\n\n{PHASE_LABEL}` (currently lines 17–19) with the single placeholder `{PHASE_SECTION}`. Callers fill `{PHASE_SECTION}` with the literal block `## Phase Label\n\n<phase_label>\n` when `phase_label` is supplied and non-empty, or with the empty string when `phase_label` is omitted or empty.
- [ ] **Step 2: Update the `## Task` body's reference to the phase value** — In the `## Task` section (currently around line 27), the sentence `…with the value from \`## Phase Label\` filled into the \`PHASE:\` header line.` MUST become `…with the value from \`## Phase Label\` filled into the \`PHASE:\` header line when that section is present; if the \`## Phase Label\` section is absent in this prompt, omit the \`PHASE:\` header line from the artifact entirely.` Preserve all other prose in the section verbatim.
- [ ] **Step 3: Update the `## Output` section** — No change required to the `TEST_RESULT_ARTIFACT:` marker rule. Verify the section's text remains as-is.
- [ ] **Step 4: Re-read the file end-to-end** — Confirm the file still has the expected top-level headings (`## Test Command`, `## Working Directory`, `## Artifact Output Path`, `## Task`, `## Output`, `## Rules`) and that `{TEST_COMMAND}`, `{WORKING_DIR}`, `{ARTIFACT_PATH}`, and `{PHASE_SECTION}` are the only `{...}` placeholders.

**Acceptance criteria:**

- The file no longer contains the literal placeholder `{PHASE_LABEL}`.
  Verify: `grep -n "{PHASE_LABEL}" agent/skills/execute-plan/test-runner-prompt.md` returns no matches.
- The file contains exactly one occurrence of the placeholder `{PHASE_SECTION}`.
  Verify: `grep -c "{PHASE_SECTION}" agent/skills/execute-plan/test-runner-prompt.md` returns the integer `1`.
- The file's other placeholders are unchanged.
  Verify: `grep -E "\{[A-Z_]+\}" agent/skills/execute-plan/test-runner-prompt.md` returns exactly four lines, one each for `{TEST_COMMAND}`, `{WORKING_DIR}`, `{ARTIFACT_PATH}`, `{PHASE_SECTION}`.
- The `## Task` section's wording for the artifact `PHASE:` line is updated to reflect that the line is omitted when no phase section is present in the prompt.
  Verify: open `agent/skills/execute-plan/test-runner-prompt.md` and confirm the `## Task` section contains the substring `omit the \`PHASE:\` header line from the artifact entirely`.

**Model recommendation:** cheap

### Task 3: Update agent/agents/test-runner.md to mark the `PHASE:` artifact line optional

**Files:**
- Modify: `agent/agents/test-runner.md`

**Steps:**
- [ ] **Step 1: Update the `## Input Contract` `## Phase Label` bullet** — In `agent/agents/test-runner.md`, the line beginning `- \`## Phase Label\` — a short string labeling this run` (currently around line 23) MUST be updated to read: `- \`## Phase Label\` — *optional.* When this section is present, its body is a short string labeling this run (e.g. \`baseline\`, \`wave-2-attempt-1\`, \`final-gate-3\`); written verbatim into the \`PHASE:\` header line. When this section is absent, omit the \`PHASE:\` header line from the artifact entirely.` The other three input-contract bullets (`Test Command`, `Working Directory`, `Artifact Output Path`) remain mandatory and unchanged.
- [ ] **Step 2: Update the opening sentence about all four placeholders being mandatory** — The sentence (currently around line 18) `The orchestrator supplies four mandatory placeholders in your task prompt. All four are required; if any is missing, halt and report the missing field.` MUST become: `The orchestrator supplies up to four placeholders in your task prompt. The first three (\`## Test Command\`, \`## Working Directory\`, \`## Artifact Output Path\`) are mandatory; if any is missing, halt and report the missing field. The fourth (\`## Phase Label\`) is optional — see below.`
- [ ] **Step 3: Update the `## Artifact Format` block** — Within the `~~~`-fenced sample artifact (currently lines 65–88), the `PHASE: <phase label, e.g. baseline | wave-2-attempt-1 | final-gate-3>` line MUST be annotated as optional. Replace that single line with a comment-style annotation immediately above it: insert a new line `<!-- PHASE: line is included only when the orchestrator supplied a ## Phase Label section in the prompt -->` immediately before the existing `PHASE: …` line. Preserve all other lines in the artifact sample byte-for-byte.
- [ ] **Step 4: Update the `## Format constraints` block** — In the `## Format constraints` bullet list (currently around lines 90–98), update the bullet that reads `The first non-empty line MUST be \`PHASE: ...\`.` to read: `When the orchestrator supplied a \`## Phase Label\` section in the prompt, the first non-empty line of the artifact MUST be \`PHASE: ...\`. When that section is absent, the \`PHASE:\` line MUST be omitted from the artifact entirely and the first non-empty line MUST be \`COMMAND: ...\`.` Update the next bullet (the one starting `The header fields \`PHASE\`, \`COMMAND\`, …`) to remove `PHASE` from the required-headers list and add a sentence: `The optional \`PHASE\` header, when present, MUST appear before \`COMMAND\` and follow the same one-label-per-line rule.` Preserve all other constraints verbatim.

**Acceptance criteria:**

- The `## Input Contract` section marks the `## Phase Label` placeholder as optional.
  Verify: `grep -n "Phase Label" agent/agents/test-runner.md | head -5` shows the entry beginning `- \`## Phase Label\` — *optional.*` (look for the literal `*optional.*` token).
- The opening sentence of `## Input Contract` no longer claims all four placeholders are mandatory.
  Verify: `grep -n "All four are required" agent/agents/test-runner.md` returns zero matches.
- The `## Artifact Format` sample block contains a comment annotation indicating the `PHASE:` line is conditional.
  Verify: `grep -n "PHASE: line is included only when" agent/agents/test-runner.md` returns at least one match inside the `## Artifact Format` section.
- The `## Format constraints` section explicitly documents both the present-`PHASE:` and absent-`PHASE:` shapes.
  Verify: open `agent/agents/test-runner.md` and confirm the `## Format constraints` bullet list contains both substrings `When the orchestrator supplied a \`## Phase Label\` section` and `When that section is absent, the \`PHASE:\` line MUST be omitted`.

**Model recommendation:** standard

### Task 4: Rename define-spec/procedure.md → spec-design-procedure.md and update define-spec/SKILL.md references

**Files:**
- Create: `agent/skills/define-spec/spec-design-procedure.md`
- Delete: `agent/skills/define-spec/procedure.md`
- Modify: `agent/skills/define-spec/SKILL.md`

**Steps:**
- [ ] **Step 1: Read the existing procedure.md** — Read `agent/skills/define-spec/procedure.md` in full from disk to capture the exact byte content.
- [ ] **Step 2: Write the same content to the new path** — Create `agent/skills/define-spec/spec-design-procedure.md` with the byte-for-byte identical content from Step 1. Do NOT alter any line, header, or whitespace.
- [ ] **Step 3: Delete the predecessor file** — Remove `agent/skills/define-spec/procedure.md` from disk.
- [ ] **Step 4: Update all references in define-spec/SKILL.md** — In `agent/skills/define-spec/SKILL.md`, replace every occurrence of the bare substring `procedure.md` with `spec-design-procedure.md` (this includes both full-path references `agent/skills/define-spec/procedure.md` and bare `procedure.md`). Preserve all other prose verbatim. The exact pre-rename count is not part of the acceptance contract; the invariant the criterion checks is that no `procedure.md` references remain that are not part of the new `spec-design-procedure.md` form.
- [ ] **Step 5: Confirm the rename via diff-aware grep** — Verify the only repository references to `procedure.md` (as a path component) point at the new file under `define-spec/`.

**Acceptance criteria:**

- `agent/skills/define-spec/spec-design-procedure.md` exists on disk.
  Verify: `ls agent/skills/define-spec/spec-design-procedure.md` returns the file.
- `agent/skills/define-spec/procedure.md` no longer exists.
  Verify: `ls agent/skills/define-spec/procedure.md 2>&1` returns a "No such file" error or non-zero exit.
- The byte content of `spec-design-procedure.md` is identical to the predecessor (no content drift).
  Verify: open `agent/skills/define-spec/spec-design-procedure.md` and confirm its first heading is `# Spec Design Procedure` and the file's `## Step 1: Resolve input shape` section matches the prose previously in `procedure.md` (same opening sentence `The orchestrator passes the user's raw input as your task body. Detect the shape by pattern; do not ask the user which kind it is.`).
- A repo-wide grep for `define-spec/procedure.md` returns zero matches.
  Verify: from the repo root, run `grep -rn "define-spec/procedure.md" .` and confirm exit code is non-zero (no matches) — this also covers fenced backticks.
- `agent/skills/define-spec/SKILL.md` references the new `spec-design-procedure.md` path in every call site and contains no remaining references to the old `procedure.md` path.
  Verify: `grep -c "[^-]procedure.md" agent/skills/define-spec/SKILL.md` (matching `procedure.md` not preceded by `-`) returns the integer `0`, AND `grep -c "spec-design-procedure.md" agent/skills/define-spec/SKILL.md` returns an integer ≥ 1.

**Model recommendation:** cheap

### Task 5: Create acceptance-criteria-verification.md

**Files:**
- Create: `agent/skills/execute-plan/acceptance-criteria-verification.md`

**Steps:**
- [ ] **Step 1: Open file with no frontmatter** — Begin the file with the heading `# Acceptance-criteria verification` (no YAML frontmatter; this is an internal protocol doc, not a discoverable Skill).
- [ ] **Step 2: Add a "Why this exists" section** — Write a short section explaining that the file is the per-task acceptance-verification protocol consumed by `agent/skills/execute-plan/SKILL.md` Step 11 and by any future caller that has explicit acceptance criteria with attached `Verify:` recipes; ad hoc / inferred-criteria mode is out of scope and recorded as a future-todo follow-up.
- [ ] **Step 3: Add an "Inputs" section** — Document the five caller-supplied inputs as a bullet list: (1) task spec verbatim (string), (2) acceptance criteria as a list of `(criterion_text, verify_recipe)` pairs (each pair has a non-empty Verify recipe), (3) verifier-visible file set as a deduplicated path list (caller computes this via the `{MODIFIED_FILES}` union rule — out of scope for this file), (4) diff context as a single text block produced by `agent/skills/execute-plan/scripts/collect-diff-context.py`, (5) working directory absolute path.
- [ ] **Step 4: Add a "Behavior" section** — Document the protocol step by step: (a) validate every criterion has a non-empty `Verify:` recipe; if any criterion lacks one, surface the protocol-error stop "plan without complete `Verify:` recipes is a protocol error from generate-plan and must be regenerated" and stop the call site; (b) classify each recipe as command-style or inspection-style; (c) fill `agent/skills/execute-plan/verify-task-prompt.md` via `agent/skills/execute-plan/scripts/assemble-verifier-prompt.py`; (d) resolve `(model, cli)` for the dispatch by invoking `agent/skills/_shared/scripts/resolve-model-dispatch.py --tier crossProvider.standard --agent verifier`; surface byte-equal canonical Templates (1)–(4) on resolution failure per `agent/skills/_shared/model-tier-resolution.md`; (e) dispatch a single `verifier` subagent via `subagent_run_serial { tasks: [{ name: "verifier: <task-N>", agent: "verifier", task: <filled prompt>, model: <resolved>, cli: <resolved> }] }`; (f) parse the dispatched final message via `agent/skills/execute-plan/scripts/parse-verifier-report.py` and treat its protocol errors as `VERDICT: FAIL`.
- [ ] **Step 5: Add an "Output" section** — Document the structured return shape: per-criterion verdicts (`[Criterion N] PASS|FAIL` plus the verifier's `reason:` text), overall `VERDICT: PASS|FAIL`, OR a structured protocol-error reason that the caller treats as `VERDICT: FAIL`. Output is the JSON shape `parse-verifier-report.py` produces (`verdict`, `per_criterion`, `phase1_evidence`, `protocol_errors`); cite the script as the canonical contract.
- [ ] **Step 6: Add an "Out of scope (caller's responsibility)" section** — Explicitly list five items: (1) wave-level parallel/serial dispatch shape, (2) retry loops on `VERDICT: FAIL` (Step 13 of execute-plan), (3) remediation menus, (4) post-verification commits, (5) the `{MODIFIED_FILES}` union rule (which is wave-shape-specific). State that this protocol applies to a single task; the caller composes per-wave parallelism and retry semantics.
- [ ] **Step 7: Confirm no frontmatter** — Re-read the file's first three lines. They must NOT begin with `---` (no YAML frontmatter). The first non-empty line must be the `# Acceptance-criteria verification` heading.

**Acceptance criteria:**

- The file exists at the documented path.
  Verify: `ls agent/skills/execute-plan/acceptance-criteria-verification.md` returns the file.
- The file has no YAML frontmatter.
  Verify: open `agent/skills/execute-plan/acceptance-criteria-verification.md` and confirm its first non-empty line is `# Acceptance-criteria verification` and the second line is NOT `---`.
- The file documents all five caller-supplied inputs.
  Verify: open `agent/skills/execute-plan/acceptance-criteria-verification.md` and confirm the `Inputs` section contains all of: `task spec`, `acceptance criteria`, `verifier-visible file set`, `diff context`, `working directory`.
- The file documents the dispatch resolution at `crossProvider.standard` for the `verifier` agent.
  Verify: `grep -n "crossProvider.standard" agent/skills/execute-plan/acceptance-criteria-verification.md` returns at least one match alongside a reference to `verifier`.
- The file documents the five out-of-scope items.
  Verify: open `agent/skills/execute-plan/acceptance-criteria-verification.md` and confirm the `Out of scope` section explicitly names: parallel/serial dispatch shape, retry loops, remediation menus, post-verification commits, and the `{MODIFIED_FILES}` union rule.
- The file references the existing helper scripts by path.
  Verify: `grep -n "assemble-verifier-prompt.py\|parse-verifier-report.py\|resolve-model-dispatch.py" agent/skills/execute-plan/acceptance-criteria-verification.md` returns at least three matches (one per script).

**Model recommendation:** capable

### Task 6: Create integration-regression-gate.md (subsumes integration-regression-model.md content)

**Files:**
- Create: `agent/skills/execute-plan/integration-regression-gate.md`

**Steps:**
- [ ] **Step 1: Read predecessor content** — Read `agent/skills/execute-plan/integration-regression-model.md` in full. The file's content (data model, identifier contract including the Go package-qualified-name exception, per-run inputs and reconciliation rules, pass/fail classification, user-facing summary format with three section headings, and worked examples for Go / pytest / cargo / Jest+Vitest / crash) MUST be preserved verbatim in the new file.
- [ ] **Step 2: Write the new file's header and identifier contract** — Open `agent/skills/execute-plan/integration-regression-gate.md` (no YAML frontmatter) with the heading `# Integration regression gate` and a brief "Why this exists" paragraph stating: this file is the single canonical definition of the baseline-only integration tracking model + reconciliation algorithm + canonical user-facing summary format AND the gate procedure that uses them. Then copy the predecessor file's `## Identifier contract` section verbatim, including the Go narrow-exception paragraph.
- [ ] **Step 3: Copy tracked-state and per-run-inputs sections verbatim** — Copy the predecessor file's `## Tracked state` and `## Per-run inputs and reconciliation` sections byte-for-byte.
- [ ] **Step 4: Copy pass/fail classification verbatim** — Copy the predecessor file's `## Pass/fail classification` section byte-for-byte.
- [ ] **Step 5: Copy the user-facing summary format verbatim** — Copy the predecessor file's `## User-facing summary format` section byte-for-byte. Header line variants (Pass-path, Fail-path Step 12, Fail-path Step 16) MUST be preserved exactly. Empty-section rendering rule (`(none)`) MUST be preserved exactly.
- [ ] **Step 6: Copy worked examples verbatim** — Copy the predecessor file's `## Worked examples` section byte-for-byte. Go / pytest / cargo test / Jest-Vitest / crash examples all preserved.
- [ ] **Step 7: Add a new "## Gate procedure" section** — Document two modes the file's callers use, in this order:
  - **Capture mode (Step 7's caller):** Inputs `(test_command, working_dir, artifact_path)`. Behavior: invoke the test-runner-dispatch protocol once (per `agent/skills/_shared/test-runner-dispatch.md`); on success, classify the baseline as one of `clean` / `stable-failures-only` / `contains-non-reconcilable-evidence` per the existing pass/fail classification; record `baseline_failures` from the artifact's `FAILING_IDENTIFIERS:` block. Output: `(classification, baseline_failures)`. Freeze contract: `baseline_failures` is never mutated for the rest of the run; this file is the source of truth for the freeze rule.
  - **Reconcile mode (Steps 12 / 12-debugger / 16 callers):** Inputs `(test_command, working_dir, artifact_path, baseline_failures)`. Behavior: invoke the test-runner-dispatch protocol; compute `current_failing_stable`, `current_non_reconcilable`, `current_non_baseline_stable := current_failing_stable \ baseline_failures`; classify pass/fail per the existing rules in `## Pass/fail classification`; render the canonical three-section user-facing summary string per the existing `## User-facing summary format` section. Output: `(classification, summary_string, current_non_baseline_stable, current_non_reconcilable)`.
- [ ] **Step 8: Add a "## Out of scope (caller's responsibility)" section** — Explicitly list: (1) menus (intermediate-wave `(d)/(c)/(x)`, final-wave `(d)/(x)`, final-gate `(d)/(x)`), (2) post-wave commit semantics, (3) debug-vs-continue-vs-stop UX, (4) retry-budget interactions. State that this file documents the data model + summary + capture/reconcile mechanics; UX sits in callers (typically `execute-plan/SKILL.md`).
- [ ] **Step 9: Add a "## Callers" section** — List the known callers and which mode they invoke: `execute-plan` Step 7 (capture mode), Step 12.2 post-wave (reconcile mode), Step 12 Debugger-first re-test (reconcile mode), Step 16 final-gate (reconcile mode). State that the integration-regression-debugging.md flow's success condition is "re-enter reconcile mode and assert both `current_non_baseline_stable` and `current_non_reconcilable` are empty."
- [ ] **Step 10: Sanity-check verbatim preservation** — Diff the relevant subsections (identifier contract, summary format, worked examples) against the predecessor; they must be byte-for-byte identical (no whitespace edits, no rewording).

**Acceptance criteria:**

- The file exists at the documented path.
  Verify: `ls agent/skills/execute-plan/integration-regression-gate.md` returns the file.
- The file has no YAML frontmatter.
  Verify: open `agent/skills/execute-plan/integration-regression-gate.md` and confirm its first non-empty line is `# Integration regression gate` and the second line is NOT `---`.
- The Go narrow-exception paragraph is preserved verbatim from the predecessor.
  Verify: `grep -n "package-qualified test name" agent/skills/execute-plan/integration-regression-gate.md` returns at least one match, AND open the file's `## Identifier contract` section and confirm the sentence beginning `Narrow exception — Go.` matches the predecessor's wording byte-for-byte.
- The user-facing summary format's three section headings are preserved verbatim.
  Verify: `grep -n "^### Baseline failures$\|^### Current non-baseline failures$\|^### Current non-reconcilable failures$" agent/skills/execute-plan/integration-regression-gate.md` returns three matches, one per heading.
- The file documents both capture-mode and reconcile-mode contracts and explicitly references `test-runner-dispatch`.
  Verify: open `agent/skills/execute-plan/integration-regression-gate.md` and confirm the `## Gate procedure` section contains the substrings `Capture mode`, `Reconcile mode`, and `test-runner-dispatch`.
- The "Out of scope" section explicitly states menus / commits / debug-UX / retry-budgets are caller-owned.
  Verify: open `agent/skills/execute-plan/integration-regression-gate.md` and confirm the `## Out of scope` section names all four items: menus, commits, debug-vs-continue-vs-stop UX, retry-budget interactions.
- The worked examples preserve all five runners (Go, pytest, cargo test, Jest/Vitest, crash).
  Verify: `grep -nE "^### (Go|pytest|cargo test|Jest \\/ Vitest|Crash)" agent/skills/execute-plan/integration-regression-gate.md` returns five lines (one per runner heading).

**Model recommendation:** capable

### Task 7: Create integration-regression-debugging.md (parameterized debugger-first flow)

**Files:**
- Create: `agent/skills/execute-plan/integration-regression-debugging.md`

**Steps:**
- [ ] **Step 1: Open file with no frontmatter** — Begin with `# Integration regression debugging`. No YAML frontmatter.
- [ ] **Step 2: Add "Why this exists"** — Brief paragraph stating that this file documents the parameterized debugger-first flow shared by execute-plan Step 12 (post-wave) and Step 16 (final-gate); the parameter row identifies the caller, and menus / retry-budget bookkeeping / undo execution stay in the caller.
- [ ] **Step 3: Add a "## Inputs (caller-supplied)" section** — Document six caller-supplied values: `current_failures` (set union of `current_non_baseline_stable ∪ current_non_reconcilable` from the latest artifact), `change_range` (commit SHA for Step 12 callers; `BASE_SHA..HEAD_SHA` form for Step 16 callers), `suspect_universe` (set of candidate tasks with their plan-declared `**Files:**` scope, derived per the caller's parameter row), `commit_template` (string for the remediation commit message; e.g. `fix(plan): wave <N> regression — <summary>` or `fix(plan): final-gate regression — <summary>`), `undo_policy` (`allowed` for Step 12 callers; `forbidden` for Step 16 callers), `re_test_callback` (callable that re-invokes the gate per `agent/skills/execute-plan/integration-regression-gate.md`'s reconcile mode and returns the new classification + sets).
- [ ] **Step 4: Add a "## Parameter rows" section with the table** — Reproduce the existing parameter table from execute-plan Step 12 verbatim (Scope / Range / Suspect-failure scope / Suspect task universe / Success condition / Commit template + undo behavior — for both Step 12 and Step 16 columns). The table is the load-bearing reference for callers; copy it byte-for-byte from the existing SKILL.md location.
- [ ] **Step 5: Add a "## Flow" section** — Document the five steps of the existing flow: (1) identify suspects from failing identifiers + diff range, (2) dispatch a single debugger-style `coder` pass following `systematic-debugging` skill — the prompt MUST include the failing test output (full, not truncated) with stable vs non-reconcilable breakdown, the change range, the suspect task list, the systematic-debugging instruction, and the required STATUS shape, (3) handle the debugging pass result with three branches: `Diagnosed and fixed (STATUS: DONE)` → commit per `commit_template` and re-invoke `re_test_callback`, `Diagnosis only (STATUS: DONE_WITH_CONCERNS with ## Diagnosis)` → dispatch a targeted remediation `coder` scoped to implicated tasks/files, then commit and re-invoke, `Failed debugging pass` → return `fail` with the optional undo hint, (4) DO NOT blanket re-dispatch tasks outside the diagnosis, (5) commit-undo fallback availability is governed by `undo_policy`.
- [ ] **Step 6: Add an "## Output" section** — Document: `success` when `re_test_callback` reports both `current_non_baseline_stable` and `current_non_reconcilable` empty; `fail` otherwise. When `undo_policy == allowed` and remediation has also failed, the output includes a non-binding "may undo wave commit" hint (the caller decides whether to act on it). The hint is suppressed when `undo_policy == forbidden`.
- [ ] **Step 7: Add an "## Out of scope (caller's responsibility)" section** — Explicitly list: menu rendering (the wave/gate-specific `(d)/(c)/(x)` or `(d)/(x)` choices); retry-budget bookkeeping (Step 13 of execute-plan); the actual undo execution (this file returns a hint, not an action); wave/gate state management.
- [ ] **Step 8: Add a "## Callers" section** — Name the two known callers (execute-plan Step 12 post-wave; execute-plan Step 16 final-gate) and indicate that each identifies its parameter row by name from `## Parameter rows`.

**Acceptance criteria:**

- The file exists at the documented path.
  Verify: `ls agent/skills/execute-plan/integration-regression-debugging.md` returns the file.
- The file has no YAML frontmatter.
  Verify: open `agent/skills/execute-plan/integration-regression-debugging.md` and confirm its first non-empty line is `# Integration regression debugging` and the second line is NOT `---`.
- The file documents all six caller-supplied inputs.
  Verify: open `agent/skills/execute-plan/integration-regression-debugging.md` and confirm the `## Inputs` section names all six: `current_failures`, `change_range`, `suspect_universe`, `commit_template`, `undo_policy`, `re_test_callback`.
- The parameter table includes both Step 12 (post-wave) and Step 16 (final-gate) rows.
  Verify: open `agent/skills/execute-plan/integration-regression-debugging.md` and confirm the `## Parameter rows` section's table headers include both `Step 12 (post-wave)` and `Step 16 (final-gate)`.
- The file documents the optional "may undo wave commit" hint behavior tied to `undo_policy = allowed`.
  Verify: `grep -n "may undo wave commit\|undo_policy" agent/skills/execute-plan/integration-regression-debugging.md` returns at least two matches; AND open the `## Output` section and confirm it states the hint is suppressed when `undo_policy == forbidden`.
- The file references the `systematic-debugging` skill and the `re_test_callback` re-test mechanism.
  Verify: `grep -n "systematic-debugging\|re_test_callback" agent/skills/execute-plan/integration-regression-debugging.md` returns at least two matches.

**Model recommendation:** capable

### Task 8: Create test-runner-dispatch.md in _shared/

**Files:**
- Create: `agent/skills/_shared/test-runner-dispatch.md`

**Steps:**
- [ ] **Step 1: Open file with no frontmatter** — Begin with `# Test-runner dispatch`. No YAML frontmatter; this is an internal protocol doc co-located with `coordinator-dispatch.md`.
- [ ] **Step 2: Add "Why this exists"** — Brief paragraph stating that this file documents the four-input test-runner dispatch contract, used by `execute-plan` Step 7 / Step 12.2 / Step 12 Debugger-first re-test / Step 16 today and plausibly by other future skills. Placement under `_shared/` (rather than `execute-plan/`) signals cross-skill reusability without committing to a public top-level Skill surface; promotion to a discoverable skill is deferred until a non-`execute-plan` caller exists.
- [ ] **Step 3: Add an "## Inputs" section** — Document the four caller-supplied inputs: `test_command` (string, required — the bash command to run; passed verbatim to test-runner; no flag injection, no expansion, no splitting); `working_dir` (absolute path, required — directory to run the command from); `artifact_path` (absolute path, required — where test-runner writes its single artifact; caller owns the naming scheme); `phase_label` (string, optional — when supplied and non-empty, filled into the artifact's `PHASE:` header line and into the dispatched prompt's phase section; when omitted or empty string, the dispatched prompt drops the phase section entirely and the artifact omits the `PHASE:` header line; empty string is treated identically to omitted).
- [ ] **Step 4: Add a "## Behavior" section** — Document the protocol the caller follows in this fixed order: (a) ensure the parent directory of `artifact_path` exists via `mkdir -p` before dispatch; (b) resolve `(model, cli)` for the dispatch by invoking `agent/skills/_shared/scripts/resolve-model-dispatch.py --tier crossProvider.cheap --agent test-runner` — tier is hardcoded; not caller-configurable; surface byte-equal canonical Templates (1)–(4) on resolution failure per `agent/skills/_shared/model-tier-resolution.md` and stop the call site; (c) fill `agent/skills/_shared/test-runner-prompt.md` from the four inputs, conditionally including the phase section based on `phase_label` presence/non-emptiness (caller fills `{PHASE_SECTION}` with the literal block `## Phase Label\n\n<phase_label>\n` when supplied, or the empty string when omitted); (d) dispatch via `subagent_run_serial { tasks: [{ name: "test-runner: <phase label or 'no-phase'>", agent: "test-runner", task: <filled prompt>, model: <resolved>, cli: <resolved> }] }`; (e) validate the artifact handoff marker and parse the artifact via `agent/skills/_shared/scripts/parse-test-runner-artifact.py --artifact <artifact_path> --final-message <path-to-finalMessage-or-stdin> --expected-path <artifact_path>`.
- [ ] **Step 5: Add an "## Output on success" section** — Document the structured return shape produced by the parser script: `exit_code` (int from the test command), `failing_identifiers` (list of stable suite-native identifiers parsed verbatim from the artifact), `non_reconcilable_failures` (list of evidence entries parsed verbatim from the artifact), `artifact_path` (echoed input), plus the parser script's other fields (`phase`, `command`, `working_directory`, `timestamp`, `failing_identifiers_count`, `non_reconcilable_count`). State explicitly that a non-zero `exit_code` from the test command is NOT a protocol failure — it flows through to the caller as a successful protocol output for caller-side classification (the protocol succeeded; the test suite reported failures).
- [ ] **Step 6: Add an "## Output on failure" section** — Enumerate at minimum these six structured failure reasons (each with a one-line description): (1) `dispatch_unavailable` — `subagent_run_serial` is not exposed in this environment; (2) `dispatch_failed` — test-runner dispatch returned an error (model unavailable, transport error, etc.); (3) `handoff_missing` — no anchored `TEST_RESULT_ARTIFACT:` line in the dispatched final message; (4) `handoff_path_mismatch` — marker path does not equal `artifact_path`; (5) `artifact_missing` — file does not exist or is empty; (6) `artifact_malformed` — the `parse-test-runner-artifact.py` checks fail (header order, integer-parse, count reconciliation, raw-output marker, etc.). Each reason is structured (label-style) rather than free-form prose.
- [ ] **Step 7: Add a "## Callers" section** — List the four current callers in `execute-plan/SKILL.md`: Step 7 (baseline capture), Step 12.2 (post-wave reconcile), Step 12 Debugger-first re-test, Step 16 (final-gate reconcile). State that each caller owns the `artifact_path` naming scheme.
- [ ] **Step 8: Confirm referenced helpers exist** — The file references `agent/skills/_shared/scripts/resolve-model-dispatch.py`, `agent/skills/_shared/test-runner-prompt.md`, and `agent/skills/_shared/scripts/parse-test-runner-artifact.py`. Note: at the time this file is created (Wave 1), the prompt template and parser still live under `execute-plan/`. Wave 2's moves (Tasks 9 and 10) bring them to `_shared/`. References in this file are written for the post-move state.

**Acceptance criteria:**

- The file exists at the documented path under `_shared/`.
  Verify: `ls agent/skills/_shared/test-runner-dispatch.md` returns the file.
- The file has no YAML frontmatter.
  Verify: open `agent/skills/_shared/test-runner-dispatch.md` and confirm its first non-empty line is `# Test-runner dispatch` and the second line is NOT `---`.
- The file documents the four caller-supplied inputs (including the optional, empty-string-equivalent-to-omitted `phase_label`).
  Verify: open `agent/skills/_shared/test-runner-dispatch.md` and confirm the `## Inputs` section names all four: `test_command`, `working_dir`, `artifact_path`, `phase_label`, and explicitly states empty `phase_label` is treated identically to omitted.
- The file specifies that `(model, cli)` resolves at the hardcoded `crossProvider.cheap` tier.
  Verify: `grep -n "crossProvider.cheap" agent/skills/_shared/test-runner-dispatch.md` returns at least one match.
- The file enumerates the six structured failure reasons.
  Verify: `grep -nE "dispatch_unavailable|dispatch_failed|handoff_missing|handoff_path_mismatch|artifact_missing|artifact_malformed" agent/skills/_shared/test-runner-dispatch.md` returns at least six matches (one per reason).
- The file states that a non-zero `exit_code` from the test command is NOT a protocol failure.
  Verify: open `agent/skills/_shared/test-runner-dispatch.md` and confirm the `## Output on success` section contains a sentence stating non-zero `exit_code` flows through to the caller as a successful protocol output.
- The file lists the four current callers.
  Verify: open `agent/skills/_shared/test-runner-dispatch.md` and confirm the `## Callers` section names: Step 7, Step 12.2, Step 12 Debugger-first re-test, Step 16.

**Model recommendation:** capable

### Task 9: Move parse-test-runner-artifact.py + tests + fixtures to _shared/scripts/

**Files:**
- Create: `agent/skills/_shared/scripts/parse-test-runner-artifact.py`
- Create: `agent/skills/_shared/scripts/tests/test_parse_test_runner_artifact.py`
- Create: `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-clean.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-stable-failures.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-non-reconcilable.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-out-of-order.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-missing-marker.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-count-mismatch.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-no-phase.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-malformed-phase.txt`
- Delete: `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py`
- Delete: `agent/skills/execute-plan/scripts/tests/test_parse_test_runner_artifact.py`
- Delete: `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-clean.txt`
- Delete: `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-stable-failures.txt`
- Delete: `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-non-reconcilable.txt`
- Delete: `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-out-of-order.txt`
- Delete: `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-missing-marker.txt`
- Delete: `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-count-mismatch.txt`
- Delete: `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-no-phase.txt`
- Delete: `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-malformed-phase.txt`

**Steps:**
- [ ] **Step 1: Read the parser source** — Read `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py` in full and capture the byte content, including the Task 1 changes (optional-PHASE handling).
- [ ] **Step 2: Update the parser's path resolution to parse-artifact-handoff.py** — In the captured content, locate the line `handoff_script = Path(__file__).resolve().parents[2] / "_shared" / "scripts" / "parse-artifact-handoff.py"` and replace it with `handoff_script = Path(__file__).resolve().parent / "parse-artifact-handoff.py"`. After the move, the parser is a sibling of `parse-artifact-handoff.py` under `_shared/scripts/`, so `parents[2]/"_shared"/"scripts"` no longer resolves correctly. The simpler `parent / "parse-artifact-handoff.py"` works post-move.
- [ ] **Step 3: Write the parser to its new location** — Create `agent/skills/_shared/scripts/parse-test-runner-artifact.py` with the updated content from Step 2 (byte-for-byte identical except for the path-resolution line).
- [ ] **Step 4: Move the test file** — Read `agent/skills/execute-plan/scripts/tests/test_parse_test_runner_artifact.py` and write its byte-for-byte content (including all Task 1 additions) to `agent/skills/_shared/scripts/tests/test_parse_test_runner_artifact.py`. The test file uses `os.path.join(os.path.dirname(__file__), "..", "parse-test-runner-artifact.py")` for `SCRIPT` and `os.path.join(os.path.dirname(__file__), "fixtures")` for `FIXTURES` — these are RELATIVE to the test file's location, so they continue to work without modification after the move.
- [ ] **Step 5: Move all fixtures** — Read each of the eight fixtures (six pre-existing + two new from Task 1) under `agent/skills/execute-plan/scripts/tests/fixtures/` and write byte-for-byte copies to `agent/skills/_shared/scripts/tests/fixtures/`. Names preserved.
- [ ] **Step 6: Delete the predecessor parser, test file, and fixtures** — Remove `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py`, `agent/skills/execute-plan/scripts/tests/test_parse_test_runner_artifact.py`, and all eight fixture files under `agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-*.txt`.
- [ ] **Step 7: Run the moved tests** — From `agent/`, run `python3 -m unittest discover -s skills/_shared/scripts/tests -p test_parse_test_runner_artifact.py`. All tests must pass.
- [ ] **Step 8: Run the full helper suite** — From `agent/`, run `npm run test:helpers`. All tests in all four discovery directories must continue to pass; in particular, the test discovery in `skills/_shared/scripts/tests` and `skills/execute-plan/scripts/tests` must each succeed independently (the latter no longer contains the test file but still discovers other tests).

**Acceptance criteria:**

- The parser script exists at the new path.
  Verify: `ls agent/skills/_shared/scripts/parse-test-runner-artifact.py` returns the file.
- The parser script no longer exists at the old path.
  Verify: `ls agent/skills/execute-plan/scripts/parse-test-runner-artifact.py 2>&1` returns "No such file" or non-zero exit.
- The test file exists at the new path.
  Verify: `ls agent/skills/_shared/scripts/tests/test_parse_test_runner_artifact.py` returns the file.
- All eight fixtures (six original + two new) exist at the new path.
  Verify: `ls agent/skills/_shared/scripts/tests/fixtures/test-runner-artifact-*.txt | wc -l` returns the integer `8`.
- The old fixtures directory no longer contains test-runner-artifact fixtures.
  Verify: `ls agent/skills/execute-plan/scripts/tests/fixtures/test-runner-artifact-*.txt 2>&1` returns "No such file" / non-zero (no matches).
- The parser's path-resolution line uses `Path(__file__).resolve().parent / "parse-artifact-handoff.py"`.
  Verify: `grep -n 'parse-artifact-handoff.py' agent/skills/_shared/scripts/parse-test-runner-artifact.py` returns the updated line and confirms it does NOT include `parents[2]` or `\"_shared\" / \"scripts\"` in the path computation.
- All test discovery directories continue to pass after the move.
  Verify: from `agent/`, run `npm run test:helpers` and confirm exit code 0 with no failures.

**Model recommendation:** standard

### Task 10: Move test-runner-prompt.md to _shared/

**Files:**
- Create: `agent/skills/_shared/test-runner-prompt.md`
- Delete: `agent/skills/execute-plan/test-runner-prompt.md`

**Steps:**
- [ ] **Step 1: Read the post-Task-2 prompt** — Read `agent/skills/execute-plan/test-runner-prompt.md` in full (including the Task 2 conditional `{PHASE_SECTION}` change).
- [ ] **Step 2: Write to the new location** — Create `agent/skills/_shared/test-runner-prompt.md` with byte-for-byte identical content. No content edits during the move.
- [ ] **Step 3: Delete the predecessor** — Remove `agent/skills/execute-plan/test-runner-prompt.md` from disk.

**Acceptance criteria:**

- The prompt template exists at the new path.
  Verify: `ls agent/skills/_shared/test-runner-prompt.md` returns the file.
- The prompt template no longer exists at the old path.
  Verify: `ls agent/skills/execute-plan/test-runner-prompt.md 2>&1` returns "No such file" / non-zero exit.
- The new file's content includes the post-Task-2 `{PHASE_SECTION}` placeholder.
  Verify: `grep -c "{PHASE_SECTION}" agent/skills/_shared/test-runner-prompt.md` returns `1`, AND `grep -c "{PHASE_LABEL}" agent/skills/_shared/test-runner-prompt.md` returns `0`.

**Model recommendation:** cheap

### Task 11: Add prompt-assembly tests for test-runner-prompt.md

**Files:**
- Create: `agent/skills/_shared/scripts/tests/test_test_runner_prompt_assembly.py`

**Steps:**
- [ ] **Step 1: Open the new test file** — Create `agent/skills/_shared/scripts/tests/test_test_runner_prompt_assembly.py` with a module docstring stating: "Tests for `test-runner-prompt.md` conditional `{PHASE_SECTION}` placeholder. Verifies prompt assembly with and without a phase section using `fill-template.py`."
- [ ] **Step 2: Add module-level constants** — Define `TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "..", "test-runner-prompt.md")` (resolves to `agent/skills/_shared/test-runner-prompt.md`); `FILL_SCRIPT = os.path.join(os.path.dirname(__file__), "..", "fill-template.py")` (resolves to `agent/skills/_shared/scripts/fill-template.py`). Add `import os, json, subprocess, sys, tempfile, unittest` at the top.
- [ ] **Step 3: Define a `run_fill(placeholders_dict)` helper AND a `phase_label_to_section(phase_label)` helper** — `run_fill` takes a Python dict, writes it to a tempfile as JSON, runs `fill-template.py --template <TEMPLATE> --placeholders-json <tempfile> --output -` via subprocess, and returns `(returncode, stdout)`. `phase_label_to_section(phase_label)` is the reference implementation of the caller-side mapping that converts the optional `phase_label` input into the `PHASE_SECTION` placeholder: it returns the empty string `""` when `phase_label is None` OR `phase_label == ""` (these two inputs map identically per spec Requirement 2), otherwise it returns the literal block `"## Phase Label\n\n" + phase_label + "\n"`. Define this helper inline in the test file (no new helper script under `_shared/scripts/` is created — the helper is test-local and documents the contract).
- [ ] **Step 4: Write `TestPhaseSectionPresent`** — A `unittest.TestCase` class with one test method `test_phase_section_included_when_supplied`. Body: assert `phase_label_to_section("baseline")` equals `"## Phase Label\n\nbaseline\n"`; then call `run_fill({"TEST_COMMAND": "npm test", "WORKING_DIR": "/tmp", "ARTIFACT_PATH": "/tmp/x.log", "PHASE_SECTION": phase_label_to_section("baseline")})`. Assert returncode 0 and that stdout contains the substring `## Phase Label` and the substring `baseline` (the phase label value).
- [ ] **Step 5: Write `TestPhaseSectionAbsent`** — A `unittest.TestCase` class with two test methods that exercise the empty-vs-omitted distinction at the `phase_label` layer by routing through `phase_label_to_section()`. (a) `test_phase_section_omitted_when_phase_label_is_empty_string`: assert `phase_label_to_section("")` equals `""`; then call `run_fill({"TEST_COMMAND": "npm test", "WORKING_DIR": "/tmp", "ARTIFACT_PATH": "/tmp/x.log", "PHASE_SECTION": phase_label_to_section("")})`. Assert returncode 0 and that stdout does NOT contain the substring `## Phase Label`. (b) `test_phase_section_omitted_when_phase_label_is_none`: assert `phase_label_to_section(None)` equals `""`; then call `run_fill({"TEST_COMMAND": "npm test", "WORKING_DIR": "/tmp", "ARTIFACT_PATH": "/tmp/x.log", "PHASE_SECTION": phase_label_to_section(None)})`. Assert returncode 0 and that stdout does NOT contain the substring `## Phase Label`. The two methods exercise distinct inputs (`""` vs `None`/omitted) flowing through the same mapping helper, satisfying spec Requirement 8's "empty or omitted" coverage explicitly.
- [ ] **Step 6: Add `if __name__ == "__main__": unittest.main()`** — Standard unittest entrypoint.
- [ ] **Step 7: Run the new test file in isolation** — From `agent/`, run `python3 -m unittest discover -s skills/_shared/scripts/tests -p test_test_runner_prompt_assembly.py`. All tests must pass.
- [ ] **Step 8: Run the full helper suite** — From `agent/`, run `npm run test:helpers`. All tests in all four discovery directories must continue to pass.

**Acceptance criteria:**

- The new test file exists.
  Verify: `ls agent/skills/_shared/scripts/tests/test_test_runner_prompt_assembly.py` returns the file.
- The new test file's tests pass in isolation, with distinct test methods covering the empty-string and `None`/omitted phase_label inputs at the mapping layer.
  Verify: from `agent/`, run `python3 -m unittest discover -s skills/_shared/scripts/tests -p test_test_runner_prompt_assembly.py` and confirm exit code 0 with at least three test cases run (one in `TestPhaseSectionPresent`; two in `TestPhaseSectionAbsent`, named `test_phase_section_omitted_when_phase_label_is_empty_string` and `test_phase_section_omitted_when_phase_label_is_none`) and zero failures.
- The full helper test suite continues to pass.
  Verify: from `agent/`, run `npm run test:helpers` and confirm exit code 0.
- The new test file references the post-move template and the fill-template helper.
  Verify: `grep -n "test-runner-prompt.md\|fill-template.py" agent/skills/_shared/scripts/tests/test_test_runner_prompt_assembly.py` returns at least two matches.
- The new test file defines a `phase_label_to_section` helper that maps both `None` and `""` to the empty string and any non-empty string to a `## Phase Label` block.
  Verify: `grep -n "def phase_label_to_section" agent/skills/_shared/scripts/tests/test_test_runner_prompt_assembly.py` returns at least one match, AND `grep -nE "phase_label_to_section\\(None\\)|phase_label_to_section\\(\"\"\\)" agent/skills/_shared/scripts/tests/test_test_runner_prompt_assembly.py` returns at least two matches (one per input shape).

**Model recommendation:** standard

### Task 12: Rewrite execute-plan/SKILL.md (extract test-runner dispatch, per-task verification, and debugger-first flow; replace integration-regression-model references with integration-regression-gate; trim to ≤ 600 lines)

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Replace Step 7's "Test-runner dispatch (shared)" subsection with a reference** — In SKILL.md, the subsection currently spanning approximately lines 283–313 (heading `#### Test-runner dispatch (shared)` plus the blockquote boundary, the per-plan runs directory paragraph, the filename scheme bullets, the dispatch paragraph, the resolve paragraph, and the dispatch-failure-reasons paragraph) MUST become a much shorter reference. Keep these caller-specific facts inline in Step 7: the per-plan runs directory creation (`mkdir -p docs/test-runs/<plan-name>` before first dispatch), and the filename scheme (which is execute-plan-specific naming). Replace the rest with: `Test-runner invocations follow the protocol in [\`agent/skills/_shared/test-runner-dispatch.md\`](../_shared/test-runner-dispatch.md). For each invocation, supply the four protocol inputs: \`test_command\` from Step 3 settings; \`working_dir\` = the absolute working directory; \`artifact_path\` = an absolute path under \`docs/test-runs/<plan-name>/\` per the filename scheme above; \`phase_label\` = the appropriate label for the call site (\`baseline\`, \`wave-<N>-attempt-<K>\`, or \`final-gate-<seq>\`).` Preserve the orchestrator-verification-boundary blockquote (the "## Boundary: orchestrator MUST NOT run the test command itself" subsection currently at lines 285–294) as-is, but update the path reference inside it from `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py` to `agent/skills/_shared/scripts/parse-test-runner-artifact.py` (two occurrences).
- [ ] **Step 2: Update Step 7 to reference integration-regression-gate.md** — The Step 7 subsection currently titled `#### Integration regression model` (around lines 279–281) MUST be retitled `#### Integration regression gate` and its reference link updated from `[\`integration-regression-model.md\`](integration-regression-model.md)` to `[\`integration-regression-gate.md\`](integration-regression-gate.md)`. Preserve the surrounding prose verbatim. Inside the user-rendered three-section summary directive (around line 268, currently `<render the three-section user-facing summary from integration-regression-model.md, ...>`), update the bare filename reference from `integration-regression-model.md` to `integration-regression-gate.md`.
- [ ] **Step 3: Replace Step 11's per-task verification protocol with a reference** — In Step 11 (Verify wave output), the protocol-error stop paragraph for missing `Verify:` recipes (currently lines 491) MAY remain inline OR be removed in favor of the same prose now living inside `acceptance-criteria-verification.md`; choose the inline retention to keep the user-visible "stop" gating wave execution explicit. The "### Step 11.2: Dispatch the verifier" subsection (currently lines 493–526) MUST shrink to retain only the wave-level orchestration: parallel dispatch shape (bounded by `MAX_PARALLEL_HARD_CAP`), the `{MODIFIED_FILES}` union rule (because file-set assembly is wave-shape-specific), and the routing of `VERDICT: FAIL` to Step 13 — and reference `acceptance-criteria-verification.md` for the per-task protocol (template placeholders, dispatch sequence, parser invocation). The "### Step 11.3: Parse verifier output and gate the wave" subsection (currently lines 528–540) similarly shrinks: keep the wave-gate-exit rule (every task `VERDICT: PASS` or back to Step 13) and reference `acceptance-criteria-verification.md` for the per-task parse semantics. Net shape: Step 11.2 + 11.3 contain wave-level orchestration prose plus a one-paragraph reference to `acceptance-criteria-verification.md` for per-task semantics.
- [ ] **Step 4: Replace Step 12's Debugger-first flow with a reference** — The "### Debugger-first flow" subsection currently spanning lines 608–642 (its preamble, the parameter table, the five-step Flow body, and the commit-undo fallback paragraph) MUST shrink. Keep one paragraph stating: `When \`(d) Debug failures now\` is selected, follow the parameterized flow in [\`integration-regression-debugging.md\`](integration-regression-debugging.md) using the **Step 12 (post-wave)** parameter row. Caller inputs: \`current_failures\` = \`current_non_baseline_stable ∪ current_non_reconcilable\` from this run's artifact; \`change_range\` = the wave commit SHA; \`suspect_universe\` = wave \`<N>\`'s tasks whose modified files appear in failing stack traces (or all wave tasks if ambiguous); \`commit_template\` = \`fix(plan): wave <N> regression — <short summary>\`; \`undo_policy\` = \`allowed\`; \`re_test_callback\` = re-invoke the test-runner-dispatch protocol with a fresh \`wave-<N>-attempt-<K>\` artifact path and recompute via integration-regression-gate.md.` Delete the parameter table and the Flow body — they live in the new file.
- [ ] **Step 5: Update Step 12 references to integration-regression-model.md → integration-regression-gate.md** — Every remaining occurrence of `integration-regression-model.md` in Step 12 must be replaced with `integration-regression-gate.md`. There are several call sites: Step 12.2 paragraph naming the per-run inputs; Pass paragraph naming the user-facing summary section; Fail paragraph; the menu's `(d)` description (already updated above); and any other line that mentions the old name. After this step, no remaining references to `integration-regression-model` should exist in Step 12.
- [ ] **Step 6: Update Step 16 final-gate references and replace the Step 12 indirection** — In Step 16's "Final integration regression gate (precondition)" body, replace every `integration-regression-model.md` reference with `integration-regression-gate.md` (in the prose at the section's top, in the `## 2. Compute the per-run inputs` paragraph, and in the user-rendered summary directive). Replace the `(d) Debug failures now` description's reference to "the shared `Debugger-first flow` (defined in Step 12)" with a direct reference to `integration-regression-debugging.md`, naming the **Step 16 (final-gate)** parameter row and the inputs: `current_failures`, `change_range = BASE_SHA..HEAD_SHA`, `suspect_universe` = every plan task whose declared `**Files:**` scope intersects `git diff --name-only BASE_SHA HEAD_SHA`, `commit_template = "fix(plan): final-gate regression — <short summary>"`, `undo_policy = forbidden`, `re_test_callback` = re-enter Step 16's gate at step 1.
- [ ] **Step 7: Update other references in SKILL.md** — Verify the "Allowed mechanical work (orchestrator)" table at Step 9 (around lines 379–391) lists `Test-runner artifact parsing | agent/skills/_shared/scripts/parse-test-runner-artifact.py` (NEW path). Verify the boundary blockquote inside Step 9 (around lines 369–373) does NOT reference the old `parse-test-runner-artifact.py` path inadvertently — but the blockquote currently references only `parse-verifier-report.py`, so no change is needed there. Verify Step 14 ("Most recent integration run failures") does NOT reference `integration-regression-model.md` — if it does, update.
- [ ] **Step 8: Trim cosmetically to hit ≤ 600 lines** — After the substantive replacements in Steps 1–7, run `wc -l agent/skills/execute-plan/SKILL.md`. If the result is > 600 lines, perform cosmetic reflows: collapse adjacent blank lines (≤ 1 between sections); remove duplicate cross-references that survived the extractions; tighten verbose menu-option blocks if their prose duplicates content now in the extracted files. Do NOT cut substantive content. If after cosmetic reflows the line count is still > 600, STOP and report to the user with a concrete diff of the gap and a recommendation; do not silently delete content.
- [ ] **Step 9: Confirm zero residual references to extracted files' OLD locations** — Run `grep -n "integration-regression-model\.md\|agent/skills/execute-plan/test-runner-prompt\.md\|agent/skills/execute-plan/scripts/parse-test-runner-artifact\.py" agent/skills/execute-plan/SKILL.md`. The expected result: zero matches.
- [ ] **Step 10: Re-read the file end-to-end** — Verify the structural ordering of Step 0 → Step 16 is preserved; sections within each Step retain their headings and ordering; the orchestrator-verification-boundary blockquotes remain in their positions.

**Acceptance criteria:**

- `agent/skills/execute-plan/SKILL.md` is at most 600 lines.
  Verify: from the repo root, run `wc -l agent/skills/execute-plan/SKILL.md` and confirm the line count is ≤ 600.
- The file no longer references `integration-regression-model.md`.
  Verify: `grep -n "integration-regression-model" agent/skills/execute-plan/SKILL.md` returns zero matches.
- The file references `integration-regression-gate.md` from at least three call sites.
  Verify: `grep -c "integration-regression-gate" agent/skills/execute-plan/SKILL.md` returns an integer ≥ 3.
- The file references `test-runner-dispatch.md` from at least one call site.
  Verify: `grep -n "test-runner-dispatch" agent/skills/execute-plan/SKILL.md` returns at least one match.
- The file references `acceptance-criteria-verification.md` from Step 11.
  Verify: `grep -n "acceptance-criteria-verification" agent/skills/execute-plan/SKILL.md` returns at least one match, AND open the file and confirm the match falls inside the Step 11 section.
- The file references `integration-regression-debugging.md` from Step 12 and Step 16.
  Verify: `grep -n "integration-regression-debugging" agent/skills/execute-plan/SKILL.md` returns at least two matches.
- Step 16's `(d) Debug failures now` no longer indirects through Step 12 — it references `integration-regression-debugging.md` directly.
  Verify: open `agent/skills/execute-plan/SKILL.md` and confirm the Step 16 final-gate menu's `(d)` description does NOT contain the substring "defined in Step 12" or "the shared `Debugger-first flow` (defined in Step 12)" and DOES contain a reference to `integration-regression-debugging.md`.
- The file does not reference the OLD `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py` or `agent/skills/execute-plan/test-runner-prompt.md` paths.
  Verify: `grep -nE "agent/skills/execute-plan/scripts/parse-test-runner-artifact\\.py|agent/skills/execute-plan/test-runner-prompt\\.md" agent/skills/execute-plan/SKILL.md` returns zero matches.
- The orchestrator-verification-boundary blockquote at Step 7 references the new `_shared/` path for `parse-test-runner-artifact.py`.
  Verify: open `agent/skills/execute-plan/SKILL.md` and confirm the Step 7 `## Boundary: orchestrator MUST NOT run the test command itself` blockquote contains the path `agent/skills/_shared/scripts/parse-test-runner-artifact.py` (or relative `../_shared/scripts/parse-test-runner-artifact.py`) and does NOT reference `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py`.

**Model recommendation:** capable

### Task 13: Update execute-plan/README.md to reference integration-regression-gate.md

**Files:**
- Modify: `agent/skills/execute-plan/README.md`

**Steps:**
- [ ] **Step 1: Update the "Integration regression model" section's reference** — In `agent/skills/execute-plan/README.md`, the paragraph near line 72 ending `... documented in \`integration-regression-model.md\`.` MUST be updated to `... documented in \`integration-regression-gate.md\`.`. Preserve all other prose verbatim.
- [ ] **Step 2: Update the "Files" section** — The bullet `- \`integration-regression-model.md\` — baseline-only identifier contract, reconciliation, and runner examples.` (around line 84) MUST be updated to `- \`integration-regression-gate.md\` — baseline-only identifier contract, reconciliation, runner examples, and gate procedure (capture/reconcile modes).` Preserve the other Files bullets unchanged.

**Acceptance criteria:**

- `agent/skills/execute-plan/README.md` no longer references `integration-regression-model.md`.
  Verify: `grep -n "integration-regression-model" agent/skills/execute-plan/README.md` returns zero matches.
- `agent/skills/execute-plan/README.md` references `integration-regression-gate.md`.
  Verify: `grep -c "integration-regression-gate" agent/skills/execute-plan/README.md` returns an integer ≥ 2.
- The Files-section bullet for the regression doc updates the description to mention the gate procedure (capture/reconcile modes).
  Verify: open `agent/skills/execute-plan/README.md` and confirm the Files-section bullet for `integration-regression-gate.md` contains the substring `capture/reconcile modes`.

**Model recommendation:** cheap

### Task 14: Update execute-plan/scripts/README.md to remove parse-test-runner-artifact.py reference

**Files:**
- Modify: `agent/skills/execute-plan/scripts/README.md`

**Steps:**
- [ ] **Step 1: Remove the bullet** — In `agent/skills/execute-plan/scripts/README.md`, the bullet `- **parse-test-runner-artifact.py** — Parses a \`test-runner\` artifact's structured header per \`agent/agents/test-runner.md\` \`## Artifact Format\`; returns ...` (currently around line 17) MUST be deleted. The script has moved to `_shared/scripts/`.
- [ ] **Step 2: Preserve other bullets** — The remaining helper-script bullets (`extract-plan-tasks.py`, `collect-diff-context.py`, `assemble-verifier-prompt.py`, `parse-verifier-report.py`, `assemble-coder-prompt.py`) MUST stay in their current order, unchanged.

**Acceptance criteria:**

- `agent/skills/execute-plan/scripts/README.md` no longer mentions `parse-test-runner-artifact.py`.
  Verify: `grep -n "parse-test-runner-artifact" agent/skills/execute-plan/scripts/README.md` returns zero matches.
- The other helper-script bullets are preserved.
  Verify: open `agent/skills/execute-plan/scripts/README.md` and confirm bullets for `extract-plan-tasks.py`, `collect-diff-context.py`, `assemble-verifier-prompt.py`, `parse-verifier-report.py`, and `assemble-coder-prompt.py` are all present.

**Model recommendation:** cheap

### Task 15: Update _shared/scripts/README.md to add parse-test-runner-artifact.py reference

**Files:**
- Modify: `agent/skills/_shared/scripts/README.md`

**Steps:**
- [ ] **Step 1: Insert the new bullet** — In `agent/skills/_shared/scripts/README.md`, add a bullet for `parse-test-runner-artifact.py` to the helpers list (after `parse-artifact-handoff.py`, since both are artifact parsers): `- **parse-test-runner-artifact.py** — Parses a \`test-runner\` artifact's structured header per \`agent/agents/test-runner.md\` \`## Artifact Format\`; returns \`EXIT_CODE\`, \`FAILING_IDENTIFIERS\`, \`NON_RECONCILABLE_FAILURES\`, and other header fields as JSON. Tolerates an absent \`PHASE:\` header line. Example: \`python3 parse-test-runner-artifact.py --artifact docs/test-runs/sample.log\`.`
- [ ] **Step 2: Preserve other bullets** — All other bullets in the helpers list MUST remain unchanged.

**Acceptance criteria:**

- `agent/skills/_shared/scripts/README.md` mentions `parse-test-runner-artifact.py`.
  Verify: `grep -n "parse-test-runner-artifact" agent/skills/_shared/scripts/README.md` returns at least one match.
- The new bullet documents the optional-`PHASE:` tolerance.
  Verify: open `agent/skills/_shared/scripts/README.md` and confirm the new bullet contains the substring `Tolerates an absent \`PHASE:\` header line` (or equivalent prose explicitly noting `PHASE:` is optional).
- The other helpers' bullets remain in place.
  Verify: `grep -nE "resolve-model-dispatch\\.py|parse-artifact-handoff\\.py|validate-review-provenance\\.py|fill-template\\.py|extract-provenance-preamble\\.py|cleanup-pycache\\.py|classify-workflow-drift\\.py|cleanup-test-runs\\.py" agent/skills/_shared/scripts/README.md` returns at least eight matches (one per script).

**Model recommendation:** cheap

### Task 16: Update orchestrator-verification-boundary.md path references

**Files:**
- Modify: `agent/skills/_shared/orchestrator-verification-boundary.md`

**Steps:**
- [ ] **Step 1: Locate the references** — In `agent/skills/_shared/orchestrator-verification-boundary.md`, lines 27 and 61 currently reference `parse-test-runner-artifact.py` as part of a list of validation/parser scripts. The current text mentions the script by filename without a path; verify whether updates are needed.
- [ ] **Step 2: Verify path references** — Read the file's `## The boundary` and `## Sanctioned mechanical surface` sections. The script references should be by name only (since the file describes the boundary across multiple skills). If a path-qualified reference exists (e.g. `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py`), update it to `agent/skills/_shared/scripts/parse-test-runner-artifact.py`. If only filename-style references exist, no change is needed for path-update purposes — but confirm the file's prose still works after the move (e.g., ensuring no sentence implies the script is execute-plan-owned).
- [ ] **Step 3: Make any required edits** — Apply the path or prose changes determined in Step 2 surgically; preserve all other content verbatim.

**Acceptance criteria:**

- `agent/skills/_shared/orchestrator-verification-boundary.md` does not reference the OLD `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py` path.
  Verify: `grep -n "agent/skills/execute-plan/scripts/parse-test-runner-artifact" agent/skills/_shared/orchestrator-verification-boundary.md` returns zero matches.
- The file still references `parse-test-runner-artifact.py` (by filename or by new `_shared/scripts/` path) in its sanctioned-mechanical-surface list.
  Verify: `grep -n "parse-test-runner-artifact" agent/skills/_shared/orchestrator-verification-boundary.md` returns at least one match.

**Model recommendation:** cheap

### Task 17: Delete integration-regression-model.md and verify all repo-wide grep checks pass

**Files:**
- Delete: `agent/skills/execute-plan/integration-regression-model.md`

**Steps:**
- [ ] **Step 1: Confirm prerequisites** — Before deleting `integration-regression-model.md`, run grep checks against the repo to find ANY remaining references. Run `grep -rn "integration-regression-model" .` from the repo root. The expected matches at this point: NONE in source files (Tasks 12, 13 update SKILL.md and README.md). If any source-file matches remain, STOP and report — do not delete the predecessor until every reference points at `integration-regression-gate.md`.
- [ ] **Step 2: Delete the predecessor file** — Remove `agent/skills/execute-plan/integration-regression-model.md`.
- [ ] **Step 3: Run the four repo-wide grep checks per spec Requirement 23 (filtered to non-historical files)** — From the repo root, run each of these filtered commands and confirm zero matches. The trailing `grep -v` filter intentionally drops matches inside `docs/specs/`, `docs/plans/`, and `docs/todos/` (these are historical spec/plan/todo artifacts that legitimately retain old names). Each command's pipeline succeeds (exits 0 with empty output) when there are no live references; if any line survives the filter, that line is a live reference that MUST be updated before this step passes. (a) `grep -rn "integration-regression-model" . --exclude-dir=node_modules --exclude-dir=.git --include='*.md' --include='*.py' | grep -v -E "^(\\./)?(docs/specs|docs/plans|docs/todos)/"`; (b) `grep -rn "define-spec/procedure.md" . --exclude-dir=node_modules --exclude-dir=.git --include='*.md' --include='*.py' | grep -v -E "^(\\./)?(docs/specs|docs/plans|docs/todos)/"`; (c) `grep -rn "agent/skills/execute-plan/test-runner-prompt.md" . --exclude-dir=node_modules --exclude-dir=.git --include='*.md' --include='*.py' | grep -v -E "^(\\./)?(docs/specs|docs/plans|docs/todos)/"`; (d) `grep -rn "agent/skills/execute-plan/scripts/parse-test-runner-artifact.py" . --exclude-dir=node_modules --exclude-dir=.git --include='*.md' --include='*.py' | grep -v -E "^(\\./)?(docs/specs|docs/plans|docs/todos)/"`. Each pipeline must produce zero output. These match the four acceptance-criteria recipes verbatim — Step 3 and the acceptance criteria are intentionally aligned.
- [ ] **Step 4: Run the full test suite once more** — From `agent/`, run `npm run test:helpers`. All tests must continue to pass.
- [ ] **Step 5: Final line-count verification** — Run `wc -l agent/skills/execute-plan/SKILL.md`. Confirm the result is ≤ 600. Record the post-change count in this task's commit message body alongside the pre-change baseline of 775.

**Acceptance criteria:**

- `agent/skills/execute-plan/integration-regression-model.md` no longer exists.
  Verify: `ls agent/skills/execute-plan/integration-regression-model.md 2>&1` returns "No such file" / non-zero exit.
- A repo-wide grep for `integration-regression-model` (excluding node_modules and .git) returns zero matches in non-historical files.
  Verify: from the repo root, run `grep -rn "integration-regression-model" . --exclude-dir=node_modules --exclude-dir=.git --include='*.md' --include='*.py' | grep -v -E "^(\\./)?(docs/specs|docs/plans|docs/todos)/"` and confirm zero matches (or non-zero exit). Allow matches inside `docs/specs/`, `docs/plans/`, `docs/todos/` since those are historical artifacts.
- A repo-wide grep for `define-spec/procedure.md` (excluding spec/plan/todo history) returns zero matches.
  Verify: from the repo root, run `grep -rn "define-spec/procedure.md" . --exclude-dir=node_modules --exclude-dir=.git --include='*.md' --include='*.py' | grep -v -E "^(\\./)?(docs/specs|docs/plans|docs/todos)/"` and confirm zero matches.
- A repo-wide grep for `agent/skills/execute-plan/test-runner-prompt.md` returns zero matches in non-historical files.
  Verify: from the repo root, run `grep -rn "agent/skills/execute-plan/test-runner-prompt.md" . --exclude-dir=node_modules --exclude-dir=.git --include='*.md' --include='*.py' | grep -v -E "^(\\./)?(docs/specs|docs/plans|docs/todos)/"` and confirm zero matches.
- A repo-wide grep for `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py` returns zero matches in non-historical files.
  Verify: from the repo root, run `grep -rn "agent/skills/execute-plan/scripts/parse-test-runner-artifact\\.py" . --exclude-dir=node_modules --exclude-dir=.git --include='*.md' --include='*.py' | grep -v -E "^(\\./)?(docs/specs|docs/plans|docs/todos)/"` and confirm zero matches.
- The `agent/skills/execute-plan/SKILL.md` line count is ≤ 600.
  Verify: from the repo root, run `wc -l agent/skills/execute-plan/SKILL.md` and confirm the count is ≤ 600.
- The full helper test suite passes.
  Verify: from `agent/`, run `npm run test:helpers` and confirm exit code 0 with no failures.

**Model recommendation:** standard

## Dependencies

- Task 1 depends on: (none — independent prep)
- Task 2 depends on: (none — independent prep)
- Task 3 depends on: (none — independent prep)
- Task 4 depends on: (none — independent prep)
- Task 5 depends on: (none — independent prep)
- Task 6 depends on: (none — independent prep)
- Task 7 depends on: (none — independent prep)
- Task 8 depends on: (none — independent prep; references Wave 2 paths in text but no runtime dependency)
- Task 9 depends on: Task 1
- Task 10 depends on: Task 2
- Task 11 depends on: Task 10
- Task 12 depends on: Task 5, Task 6, Task 7, Task 8, Task 9, Task 10
- Task 13 depends on: Task 6
- Task 14 depends on: Task 9
- Task 15 depends on: Task 9
- Task 16 depends on: Task 9
- Task 17 depends on: Task 4, Task 11, Task 12, Task 13, Task 14, Task 15, Task 16

Wave grouping (derived from dependencies):
- **Wave 1** (8 tasks, no inter-dependencies): Tasks 1, 2, 3, 4, 5, 6, 7, 8.
- **Wave 2** (3 tasks): Tasks 9, 10, 11.
- **Wave 3** (5 tasks): Tasks 12, 13, 14, 15, 16.
- **Wave 4** (1 task): Task 17.

## Risk Assessment

- **Line-budget infeasibility.** The four extractions deliver ~100–110 line savings against a 775-line starting point, leaving ~665 lines. To hit ≤ 600, Task 12 Step 8 calls for cosmetic reflow (collapsing duplicate cross-references, tightening menu-option prose that duplicates content now in extracted files). Spec Requirement 21 explicitly authorizes the worker to STOP and report rather than cut substantive content if the target is unreachable. Mitigation: Task 12 has an explicit step to surface this case rather than silent content loss.
- **`{PHASE_SECTION}` placeholder semantics.** Callers must compute `{PHASE_SECTION}` as either the full `## Phase Label\n\n<phase_label>\n` block or the empty string. A caller that mistakenly fills `{PHASE_SECTION}` with just the label value (e.g., `baseline`) would emit a broken prompt. Mitigation: Task 8's `test-runner-dispatch.md` documents the exact two-shape contract; Task 11's tests assert both shapes; SKILL.md callers reference the dispatch doc.
- **Path resolution for parse-artifact-handoff.py after the move.** The parser uses `Path(__file__).resolve().parents[2] / "_shared" / "scripts" / "parse-artifact-handoff.py"` today. After the move, `parents[2]` resolves differently and would point to a non-existent path. Task 9 Step 2 explicitly fixes this to `Path(__file__).resolve().parent / "parse-artifact-handoff.py"` (siblings post-move). Mitigation: Task 9's tests run after the move; if the path resolution is wrong, the handoff-check tests fail loudly.
- **Stale references in Wave 1's Task 8 (test-runner-dispatch.md).** test-runner-dispatch.md is created in Wave 1 with text references to `agent/skills/_shared/test-runner-prompt.md` and `agent/skills/_shared/scripts/parse-test-runner-artifact.py` — paths that don't exist until Wave 2 finishes. This is acceptable because markdown text references aren't checked at file-creation time and SKILL.md (the only reader) doesn't reference test-runner-dispatch.md until Wave 3. Mitigation: documented in the plan; verification of the cross-references happens in Wave 4.
- **Existing fixtures break after parser change.** Task 1 changes `parse-test-runner-artifact.py` to make `PHASE:` optional. All six existing fixtures begin with `PHASE: baseline` — the new behavior must continue to accept them. Mitigation: Task 1 Step 5 runs the full existing test set in isolation; Step 6 runs the full helper suite. Any regression surfaces immediately.
- **Test-runner agent definition update changes the artifact contract.** Task 3 modifies `agent/agents/test-runner.md` to mark `PHASE:` optional. Live `test-runner` dispatches that follow the updated docs would now omit `PHASE:` when the orchestrator omits the prompt's `## Phase Label` section. Today, every execute-plan dispatch supplies a label, so byte-for-byte artifact preservation holds (per spec Requirement 22). Mitigation: explicit acceptance criteria in Tasks 1, 9, and 11 confirm the parser tolerates absent `PHASE:` and that prompt assembly with a label still produces a `PHASE:` line.
- **`grep` recipe verification noise from spec/plan/todo history.** Spec/plan/todo files under `docs/specs/`, `docs/plans/`, and `docs/todos/` reference the OLD names (this is intentional — they're historical artifacts). Task 17's recipes filter these directories from the grep checks. If a future spec/plan needs to be searched comprehensively, those filters can be relaxed. Mitigation: documented in Task 17 step 3.
- **Behavior preservation under conditional `PHASE:`.** Spec Requirement 22 mandates byte-for-byte artifact preservation when `phase_label` is supplied (which `execute-plan` always does). The conditional path matters only for callers that omit the label — none exist today. Mitigation: Tasks 1, 2, 3 each explicitly preserve the supplied-label path and only ADD the optional/empty-label path. Acceptance criteria use existing fixtures (which all supply `PHASE:`) to confirm no regression.
- **define-spec/SKILL.md reference count drift.** Task 4 Step 4 replaces "every occurrence" of `procedure.md` rather than a hardcoded count, and the acceptance criterion checks the post-state invariant (no `[^-]procedure.md` matches remain; at least one `spec-design-procedure.md` reference exists). The plan does not pin a specific reference count, so drift in `define-spec/SKILL.md` between plan-writing and execution is absorbed automatically.

## Test Command

```bash
cd agent && npm run test:helpers
```
