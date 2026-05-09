# Define-spec and artifact-handoff consistency

**Source:** TODO-2e1105f6
**Spec:** `docs/specs/2026-05-08-define-spec-and-artifact-handoff-fixes.md`

## Goal

Standardize every Claude-pane subagent's artifact-handoff completion contract on a single `_ARTIFACT`-suffixed marker family with a belt-and-suspenders dual-channel emission (final assistant message line + `subagent_done(message=...)` sentinel). Rename `BRIEF_WRITTEN` → `BRIEF_ARTIFACT`, rename `SPEC_WRITTEN` → `SPEC_ARTIFACT`, add a new `PLAN_ARTIFACT` for the planner's initial-generation pass, and tighten orchestrator-side validation to use `--check-existence --check-non-empty` everywhere (plus a path-shape check for `define-spec`). Fold in the small `define-spec`-specific cleanups (existing-spec branch absolute-path emission, todo regex trim/lowercase, mux probe `"inline"` removal). The rename is atomic with no aliases or shims.

## Architecture summary

The work touches four layers in one coordinated wave:

1. **Helper layer** — `parse-artifact-handoff.py` is the single arbiter of marker validity. Its `VALID_MARKERS` list changes from `[BRIEF_WRITTEN, SPEC_WRITTEN, REVIEW_ARTIFACT, TEST_RESULT_ARTIFACT]` to `[BRIEF_ARTIFACT, SPEC_ARTIFACT, PLAN_ARTIFACT, REVIEW_ARTIFACT, TEST_RESULT_ARTIFACT]`. Argparse's `choices=` rejection becomes the canonical "old name removed" signal.
2. **Prompt layer** — six marker-emit prompts (scout-prompt, spec-design-procedure Step 9, review-code-prompt, review-plan-prompt, test-runner-prompt, generate-plan-prompt) each instruct the agent to emit the marker through both channels: `<MARKER>: <abs path>` as the last anchored line of the final assistant message AND `subagent_done(message="<MARKER>: <abs path>")` as the terminal action.
3. **Agent identity layer** — six agent definitions (`scout.md`, `spec-designer.md`, `planner.md`, `code-reviewer.md`, `plan-reviewer.md`, `test-runner.md`) are updated to reference the new marker names (where renamed) and the dual-channel terminal action.
4. **Consumer / orchestrator layer** — call sites that run `parse-artifact-handoff.py` (scout/SKILL.md, define-spec/SKILL.md, generate-plan/SKILL.md, refine-plan-prompt.md, refine-code-prompt.md, test-runner-dispatch.md) update marker arguments where renamed, ensure `--check-existence --check-non-empty` is passed everywhere, and define-spec/SKILL.md adds a path-shape gate (path ends in `.md` and normalizes under `<working-dir>/docs/specs/`).

Two `define-spec`-specific subsystems also change in the same wave:

- **`spec-design-procedure.md` Step 1** trims and lowercases the captured hex segment of the input before matching `^TODO-[0-9a-f]{8}$`, so `TODO-BD750B75` and `TODO-bd750b75 ` (trailing space) reach the todo branch instead of falling through to freeform.
- **`detect-mux-backend.py`** drops the bare-word `"inline"` from `OVERRIDE_SUBSTRINGS`, eliminating false-positive routing on user input that mentions inline behavior unrelated to subagent-mode override.

The pi-interactive-subagent integration test that already pins the safer pattern (`subagent_done(message="SPEC_WRITTEN: ...")`) is updated to assert `SPEC_ARTIFACT`. No runtime changes to `pi-interactive-subagent` (watcher precedence, MCP tool semantics) are made — the fix lives entirely in agent prompts and orchestrator validation.

## Tech stack

- Python 3 (helper scripts in `agent/skills/_shared/scripts/` and `agent/skills/define-spec/scripts/`).
- Python `unittest` framework for helper tests (run via `python3 -m unittest discover` from `agent/`).
- Markdown for prompts, agent definitions, skill orchestration files, and READMEs.
- TypeScript + Node test runner (`node --experimental-strip-types --test`) for the pi-interactive-subagent e2e test (lives in a sibling repo at `~/Code/pi-interactive-subagent/`).
- No build/transpile required for the markdown changes; helper-test pass via `npm run test:helpers` from `agent/`.

## File Structure

### Helper + helper tests

- `agent/skills/_shared/scripts/parse-artifact-handoff.py` (Modify) — Replace `VALID_MARKERS` list with `[BRIEF_ARTIFACT, SPEC_ARTIFACT, PLAN_ARTIFACT, REVIEW_ARTIFACT, TEST_RESULT_ARTIFACT]`. Update module docstring's "Supported markers" line. Add two new optional flags `--require-path-suffix <suffix>` (the extracted path must end with this string) and `--require-path-prefix <abs-dir>` (the absolute, normalized form of the extracted path must start with the absolute, normalized form of `<abs-dir>` followed by `/`). Both flags fail with a JSON `{"failure": "..."}` on stderr and a non-zero exit code when violated. Used by `define-spec/SKILL.md` Step 4 to gate on the spec-shape (`.md` suffix + `<working-dir>/docs/specs/` prefix); unused for now by other consumers (which use `--expected-path` for stricter exact-match).
- `agent/skills/_shared/scripts/tests/test_parse_artifact_handoff.py` (Modify) — Rename test methods that exercise `BRIEF_WRITTEN` / `SPEC_WRITTEN` to use `BRIEF_ARTIFACT` / `SPEC_ARTIFACT`. Add a new test method covering `PLAN_ARTIFACT`. Update `test_marker_invalid_choice_rejected` so its expected-valid-marker list reflects the new five names. Add explicit reject tests for `BRIEF_WRITTEN` and `SPEC_WRITTEN` (both must exit non-zero with argparse's "invalid choice" message). Add three new test methods covering the new flags: `--require-path-suffix` success and failure, `--require-path-prefix` success and failure, and the combined-flag use that mirrors define-spec's call.
- `agent/skills/_shared/scripts/tests/fixtures/final-message-with-marker.txt` (Modify) — Replace the `BRIEF_WRITTEN: /tmp/sample-brief.md` line with `BRIEF_ARTIFACT: /tmp/sample-brief.md`.
- `agent/skills/_shared/scripts/tests/fixtures/final-message-multiple-markers.txt` (Modify) — Replace both `BRIEF_WRITTEN: ...` lines with `BRIEF_ARTIFACT: ...` (preserving "first" / "last" path values verbatim so the multiple-markers-last-wins test keeps its semantics).
- `agent/skills/_shared/scripts/README.md` (Modify) — Update the `parse-artifact-handoff.py` bullet to document the new five-marker family (`BRIEF_ARTIFACT`, `SPEC_ARTIFACT`, `PLAN_ARTIFACT`, `REVIEW_ARTIFACT`, `TEST_RESULT_ARTIFACT`), explicit rejection of the old `BRIEF_WRITTEN` / `SPEC_WRITTEN` names, and the new `--require-path-suffix` and `--require-path-prefix` flags. The example invocation is updated to mirror the define-spec call site (the most flag-rich consumer). No other bullets change.

### Scout

- `agent/skills/scout/scout-prompt.md` (Modify) — Rename the marker (`BRIEF_WRITTEN` → `BRIEF_ARTIFACT`) in the `## Completion contract` section. Add the dual-channel instruction: the final assistant message ends with `BRIEF_ARTIFACT: <output path>` AND the agent calls `subagent_done(message="BRIEF_ARTIFACT: <output path>")` as the terminal tool call. Both strings byte-equal.
- `agent/skills/scout/SKILL.md` (Modify) — Step 6 changes its `parse-artifact-handoff.py` invocation from `--marker BRIEF_WRITTEN` to `--marker BRIEF_ARTIFACT`. The flags `--expected-path --check-existence --check-non-empty` already match the new contract; no other change.
- `agent/agents/scout.md` (Modify) — Update the `description:` frontmatter line to say "Ends with `BRIEF_ARTIFACT: <absolute path>` on its own line" (replacing `BRIEF_WRITTEN`). Update the bullet under `## Hard rules` that names the marker. Add the dual-channel terminal-action sentence so the agent knows to call `subagent_done(message="BRIEF_ARTIFACT: <path>")` after sending the final assistant message.
- `agent/skills/scout/README.md` (Modify) — Replace the single occurrence of `BRIEF_WRITTEN` in the "Dispatch behavior" paragraph with `BRIEF_ARTIFACT`.

### Define-spec

- `agent/skills/define-spec/spec-design-procedure.md` (Modify) — Three changes:
  1. **Step 1 todo regex normalization** — change the row's pattern from `matches ^TODO-([0-9a-f]{8})$ exactly` to `after trimming surrounding whitespace and lowercasing the segment after the TODO- prefix, the result matches ^TODO-[0-9a-f]{8}$`. Spell out concretely: `TODO-BD750B75` and `TODO-bd750b75 ` (trailing space) both match; `bd750b75` (no prefix) and `/define-spec TODO-bd750b75` (slash-command leak) still fall through to freeform.
  2. **Step 9 marker rename + dual-channel + absolute-path-on-relative-input** — change the marker name to `SPEC_ARTIFACT`. The "Subagent / mux branch" subsection must instruct the agent to (a) end the final assistant message with `SPEC_ARTIFACT: <absolute path>` AND (b) call `subagent_done(message="SPEC_ARTIFACT: <absolute path>")` as the terminal tool action. Both strings byte-equal. Add explicit text: "When the existing-spec branch was fired with a relative input path, the file write target stays at the supplied path per Step 1, but the absolute path of the written file is emitted in both channels of the marker."
  3. **Step 1 existing-spec branch reference** — update the parenthetical example "this is the form the orchestrator's `SPEC_WRITTEN: <absolute path>` emits" to use `SPEC_ARTIFACT`.
- `agent/skills/define-spec/SKILL.md` (Modify) — Step 4 changes:
  1. Replace `--marker SPEC_WRITTEN` with `--marker SPEC_ARTIFACT`.
  2. Add `--check-non-empty` to the helper invocation (previously it ran with `--check-existence` only).
  3. Update all prose mentions of `SPEC_WRITTEN` to `SPEC_ARTIFACT` (case (1) report text, case (2) recovery prose, case (2) bullet 1, case (2) bullet 4, case (2) bullet 5; the recovery section's "exited without emitting `SPEC_ARTIFACT: <path>`" wording).
  4. The helper invocation gains two new flags `--require-path-suffix .md` and `--require-path-prefix <working-dir>/docs/specs/` (using the orchestrator's actual current working directory). The helper now performs the path-shape gate atomically with the marker/existence/non-empty checks. On either flag's failure, the helper exits non-zero with stderr JSON `{"failure": "path suffix mismatch: ..."}` or `{"failure": "path prefix mismatch: ..."}`; the orchestrator surfaces those failures as `Spec design reported SPEC_ARTIFACT: <path> but the path is not a valid docs/specs/*.md path under <working-dir>. Transcript: <transcriptPath>. No commit attempted.` and stops. (Choice rationale: helper flag rather than orchestrator-side prose — the spec's acceptance criteria require regression coverage of the validation tightening (path-not-md, path-outside-docs/specs/, empty-file), and a deterministic helper flag is unit-testable in `test_parse_artifact_handoff.py`. Adds two flags to the helper, but they are general-purpose and reusable; the surface stays small.)
  5. Update Step 7's Refine prose: replace `SPEC_WRITTEN: <absolute path>` reference with `SPEC_ARTIFACT: <absolute path>`.
  6. Update Step 4's transcript-recovery-success message: "exited without emitting `SPEC_ARTIFACT: <path>`" (was `SPEC_WRITTEN`).
- `agent/agents/spec-designer.md` (Modify) — Replace `SPEC_WRITTEN: <absolute path>` in the `description:` frontmatter line with `SPEC_ARTIFACT: <absolute path>`. The body's hard rules don't mention the marker; no other change.
- `agent/skills/define-spec/README.md` (Modify) — Replace the `SPEC_WRITTEN: <absolute path>` text block in the "Completion and validation" section with `SPEC_ARTIFACT: <absolute path>`. No other change.

### Generate-plan / planner

- `agent/skills/generate-plan/generate-plan-prompt.md` (Modify) — Add a new `## Completion contract` section after the existing `## Output` section. The section instructs the agent to: (a) end the final assistant message with `PLAN_ARTIFACT: <output path>` as the last anchored line, (b) call `subagent_done(message="PLAN_ARTIFACT: <output path>")` as the terminal tool action. Both strings byte-equal. The path is character-for-character identical to `{OUTPUT_PATH}`. The section is **conditional on initial-generation mode only** — when the planner is dispatched in edit mode (with the edit-plan-prompt), this section's instructions do not appear. Since `generate-plan-prompt.md` is the initial-generation template, the section appears unconditionally here; `edit-plan-prompt.md` is unchanged.
- `agent/skills/generate-plan/SKILL.md` (Modify) — Step 3 changes: after the synchronous `subagent_run_serial` dispatch returns, add a new validation block that writes `results[0].finalMessage` to a temp file and runs `agent/skills/_shared/scripts/parse-artifact-handoff.py --marker PLAN_ARTIFACT --expected-path <abs OUTPUT_PATH> --final-message <temp-file> --check-existence --check-non-empty`. On non-zero exit, surface the script's stderr verbatim and stop the skill before the Step 4 refine-plan handoff. On exit 0, read `.path` from stdout JSON; this is the validated plan path passed to `refine-plan` in Step 4.
- `agent/agents/planner.md` (Modify) — Update the `## Output` section. Replace the current free-form "After saving the plan, report `Plan saved to docs/plans/<filename>.md`. Use the execute-plan skill to run it." block with a marker-emit contract that applies to the **initial-generation pass only** (when dispatched with `generate-plan-prompt.md`): 'End your final assistant message with `PLAN_ARTIFACT: <absolute path>` as the last anchored line. Call `subagent_done(message="PLAN_ARTIFACT: <absolute path>")` as your terminal tool action. Both strings byte-equal.' Add an explicit note: 'Edit mode (when dispatched with `edit-plan-prompt.md`) does not emit a marker — the `PLAN_ARTIFACT` from initial generation already names the file and edit mode reuses it.' Inserted markdown text uses unescaped double quotes around the `subagent_done` `message` argument so the file ends up containing literal `subagent_done(message="PLAN_ARTIFACT: ...")` (no backslashes).
- `agent/skills/generate-plan/README.md` (Modify) — Add a one-line note in the "Planning flow" section step 4 mentioning that the planner emits `PLAN_ARTIFACT: <absolute path>` and the orchestrator validates it before handing off to refine-plan.

### Review-code (no marker rename, contract update)

- `agent/skills/requesting-code-review/review-code-prompt.md` (Modify) — Update the `## Output Artifact Contract` section's bullet 5: in addition to ending the final assistant message with `REVIEW_ARTIFACT: <absolute path>`, the agent must also call `subagent_done(message="REVIEW_ARTIFACT: <absolute path>")` as the terminal tool action. Both strings byte-equal. Update the standalone-mode note (when `{REVIEW_OUTPUT_PATH}` is empty): no marker emission, no `subagent_done(message=...)` — the standalone path is unchanged.
- `agent/agents/code-reviewer.md` (Modify) — Update the `## Output Artifact Contract` section bullet 4: agent ends final assistant message with `REVIEW_ARTIFACT: <absolute path>` AND calls `subagent_done(message="REVIEW_ARTIFACT: <absolute path>")` as terminal action. Both strings byte-equal. The standalone-mode block (when `{REVIEW_OUTPUT_PATH}` is empty) explicitly says no marker emission.

### Review-plan (no marker rename, contract update)

- `agent/skills/generate-plan/review-plan-prompt.md` (Modify) — Update the `## Output Artifact Contract` section's bullet 5 the same way as `review-code-prompt.md`: agent emits the marker on the final assistant message AND calls `subagent_done(message="REVIEW_ARTIFACT: <absolute path>")`. Both strings byte-equal. Standalone-mode note unchanged in semantics (no marker, no message).
- `agent/agents/plan-reviewer.md` (Modify) — Update the `## Output Artifact Contract` section bullet 4 the same way as `code-reviewer.md`.

### Test-runner (no marker rename, contract update)

- `agent/skills/_shared/test-runner-prompt.md` (Modify) — Update the `## Output` section to instruct the agent to (a) end the final assistant message with `TEST_RESULT_ARTIFACT: <absolute path>` AND (b) call `subagent_done(message="TEST_RESULT_ARTIFACT: <absolute path>")` as the terminal tool action. Both strings byte-equal.
- `agent/agents/test-runner.md` (Modify) — Update the `## Output Contract` section to require the dual-channel emission, mirroring the prompt update. Update Step 5 of `## Execution` (the existing "Emit `TEST_RESULT_ARTIFACT: <absolute path>` as the LAST line of your final assistant message" instruction) to add the parallel `subagent_done(message=...)` instruction.

### Mux probe (define-spec)

- `agent/skills/define-spec/scripts/detect-mux-backend.py` (Modify) — Remove the bare string `"inline"` from `OVERRIDE_SUBSTRINGS` (the existing list at lines 40-47). The remaining five entries (`--no-subagent`, `without a subagent`, `without subagent`, `no subagent`, `skip subagent`) are unchanged. Update the module docstring's `--user-input override substrings` section (lines 23-24 area) and the argparse `--user-input` `help=` text (lines 117-122 area) to remove the trailing `, 'inline'` mention.
- `agent/skills/define-spec/scripts/README.md` (Modify) — Update the `detect-mux-backend.py` bullet (lines 7-9 area) so its example doesn't include `inline` as an override phrase. The example string `--no-subagent` is fine.
- `agent/skills/define-spec/scripts/tests/test_detect_mux_backend.py` (Modify) — Remove `test_user_input_override_inline` (currently lines 213-214). Add a new `test_user_input_no_false_positive_for_inline_word` that asserts `--user-input "build a spec for inline editing of cells"` returns the no-mux-detected status (NOT inline-override) when the env is empty. Keep all other `_assert_override` cases unchanged.

### Top-level docs

- `README.md` (Modify) — Two changes:
  1. Line ~255 in the `### scout.md` agent section: replace `BRIEF_WRITTEN: <absolute path>` with `BRIEF_ARTIFACT: <absolute path>`.
  2. Line ~271 in the `### spec-designer.md` agent section: replace `SPEC_WRITTEN: <absolute path>` with `SPEC_ARTIFACT: <absolute path>`.

### Todo-input-shape regression test (new)

- `agent/skills/define-spec/scripts/tests/test_todo_input_shape.py` (Create) — A new unittest that pins the trim+lowercase+regex behavior documented in `spec-design-procedure.md` Step 1. The test does not import any helper (there is no helper for input-shape detection — the procedure is prose); instead, it inlines the regex `^TODO-[0-9a-f]{8}$` and the normalization `input.strip().lower()` as Python literals and runs them against the spec's six test inputs: `TODO-bd750b75`, `TODO-BD750B75`, `TODO-bd750b75 ` (trailing space), `bd750b75` (no prefix), `/define-spec TODO-bd750b75` (slash-command leak), and ` TODO-bd750b75 ` (leading + trailing whitespace). The test asserts the first three match (after normalization) with the captured hex `bd750b75`, and the no-prefix and slash-command-leak inputs do NOT match. This is a documentation-pin: if the procedure's regex or normalization rules change in a future PR, the test must change in lockstep — catching drift between the procedure prose and any consumer's interpretation.

### Marker-emit contract regression test (new)

- `agent/skills/_shared/scripts/tests/test_marker_emit_contract.py` (Create) — A new parameterized unittest that opens each marker-emit prompt file from disk and asserts:
  - The file contains the expected marker name (`BRIEF_ARTIFACT`, `SPEC_ARTIFACT`, `PLAN_ARTIFACT`, `REVIEW_ARTIFACT`, or `TEST_RESULT_ARTIFACT`).
  - The file contains an instruction to call `subagent_done(message="<MARKER>: <abs path>")` (or equivalent regex `subagent_done\(.*message=.*<MARKER>`).
  - The file does NOT contain the old marker names (`BRIEF_WRITTEN`, `SPEC_WRITTEN`) anywhere.
  - The prompts under test are: `agent/skills/scout/scout-prompt.md`, `agent/skills/define-spec/spec-design-procedure.md`, `agent/skills/requesting-code-review/review-code-prompt.md`, `agent/skills/generate-plan/review-plan-prompt.md`, `agent/skills/_shared/test-runner-prompt.md`, `agent/skills/generate-plan/generate-plan-prompt.md`. The agent definition files are also asserted: `agent/agents/scout.md`, `agent/agents/spec-designer.md`, `agent/agents/code-reviewer.md`, `agent/agents/plan-reviewer.md`, `agent/agents/test-runner.md`, `agent/agents/planner.md`.

### E2E test (sibling repo)

- `~/Code/pi-interactive-subagent/test/integration/orchestration-claude-pane-spec-designer-e2e.test.ts` (Modify) — Replace `SPEC_WRITTEN` with `SPEC_ARTIFACT` in three places:
  1. Line ~83 task prompt: `subagent_done with message="SPEC_ARTIFACT: ${SPEC_PATH}"`.
  2. Line ~111 assertion: `assert.match(r.finalMessage, /SPEC_ARTIFACT:/)`.
  3. The line ~83 task prompt also says `write SPEC.md to ${SPEC_PATH}, then call subagent_done with message="SPEC_ARTIFACT: ${SPEC_PATH}"`. Verify both occurrences are replaced.

## Tasks

### Task 1: Update `parse-artifact-handoff.py` and helper tests

**Files:**
- Modify: `agent/skills/_shared/scripts/parse-artifact-handoff.py`
- Modify: `agent/skills/_shared/scripts/tests/test_parse_artifact_handoff.py`
- Modify: `agent/skills/_shared/scripts/tests/fixtures/final-message-with-marker.txt`
- Modify: `agent/skills/_shared/scripts/tests/fixtures/final-message-multiple-markers.txt`
- Modify: `agent/skills/_shared/scripts/README.md`

**Steps:**
- [ ] **Step 1: Update `VALID_MARKERS` list** — In `parse-artifact-handoff.py`, replace the four-entry list `["BRIEF_WRITTEN", "SPEC_WRITTEN", "REVIEW_ARTIFACT", "TEST_RESULT_ARTIFACT"]` (lines 19-24) with the five-entry list `["BRIEF_ARTIFACT", "SPEC_ARTIFACT", "PLAN_ARTIFACT", "REVIEW_ARTIFACT", "TEST_RESULT_ARTIFACT"]` in that exact order.
- [ ] **Step 2: Update module docstring** — In `parse-artifact-handoff.py`, change the docstring line that reads `Supported markers: BRIEF_WRITTEN, SPEC_WRITTEN, REVIEW_ARTIFACT, TEST_RESULT_ARTIFACT` to `Supported markers: BRIEF_ARTIFACT, SPEC_ARTIFACT, PLAN_ARTIFACT, REVIEW_ARTIFACT, TEST_RESULT_ARTIFACT`.
- [ ] **Step 3: Update fixture file 1** — In `final-message-with-marker.txt`, change line 2 from `BRIEF_WRITTEN: /tmp/sample-brief.md` to `BRIEF_ARTIFACT: /tmp/sample-brief.md`. Preserve the line above and the trailing newline exactly.
- [ ] **Step 4: Update fixture file 2** — In `final-message-multiple-markers.txt`, replace `BRIEF_WRITTEN: /tmp/first-brief.md` with `BRIEF_ARTIFACT: /tmp/first-brief.md` and `BRIEF_WRITTEN: /tmp/last-brief.md` with `BRIEF_ARTIFACT: /tmp/last-brief.md`. Both line positions stay the same.
- [ ] **Step 5: Rename test method `test_marker_brief_written` → `test_marker_brief_artifact`** — Update the method name and its body to use `BRIEF_ARTIFACT` everywhere (including the assertion `data["marker"] == "BRIEF_ARTIFACT"`). The fixture path stays `final-message-with-marker.txt` — that file's contents now use the new marker.
- [ ] **Step 6: Rename test method `test_marker_spec_written` → `test_marker_spec_artifact`** — Update method name; in the body change `f.write("SPEC_WRITTEN: /tmp/sample-spec.md\n")` to `f.write("SPEC_ARTIFACT: /tmp/sample-spec.md\n")`, change `--marker SPEC_WRITTEN` to `--marker SPEC_ARTIFACT`, and change the assertion to `data["marker"] == "SPEC_ARTIFACT"`.
- [ ] **Step 7: Add a new test method `test_marker_plan_artifact`** — Mirror the structure of `test_marker_spec_artifact`: write a temp file containing `PLAN_ARTIFACT: /tmp/sample-plan.md\n`, run the script with `--marker PLAN_ARTIFACT --final-message <tmp_path>`, assert exit code 0, assert `data["marker"] == "PLAN_ARTIFACT"` and `data["path"] == "/tmp/sample-plan.md"`. Insert immediately after `test_marker_spec_artifact`.
- [ ] **Step 8: Update `test_marker_invalid_choice_rejected`** — Change the iteration list `["BRIEF_WRITTEN", "SPEC_WRITTEN", "REVIEW_ARTIFACT", "TEST_RESULT_ARTIFACT"]` (currently line 82) to `["BRIEF_ARTIFACT", "SPEC_ARTIFACT", "PLAN_ARTIFACT", "REVIEW_ARTIFACT", "TEST_RESULT_ARTIFACT"]`. The test body's assertion that argparse mentions every valid marker in stderr stays unchanged.
- [ ] **Step 9: Add explicit reject test for old marker names** — Add a new test method `test_old_marker_names_rejected` that runs the script twice with `--marker BRIEF_WRITTEN` and `--marker SPEC_WRITTEN` (each against `/dev/null`). Both invocations must exit non-zero, and stderr must contain the substring `invalid choice` (argparse's standard wording for `choices=` rejection). Assert that stderr does NOT list `BRIEF_WRITTEN` or `SPEC_WRITTEN` as valid choices (i.e., they are absent from the list of valid markers shown in the error message).
- [ ] **Step 10: Update `test_missing_marker`** — Change `--marker BRIEF_WRITTEN` to `--marker BRIEF_ARTIFACT` (currently line 88) and the expected `data["failure"]` value from `"missing BRIEF_WRITTEN marker"` to `"missing BRIEF_ARTIFACT marker"`.
- [ ] **Step 11: Update `test_expected_path_mismatch`** — Change `--marker BRIEF_WRITTEN` to `--marker BRIEF_ARTIFACT` (currently line 97). Test body's path-mismatch assertion stays unchanged.
- [ ] **Step 12: Update `test_existence_check_failure`** — Change `f.write("BRIEF_WRITTEN: /nonexistent/path/that/does/not/exist.md\n")` to `f.write("BRIEF_ARTIFACT: /nonexistent/path/that/does/not/exist.md\n")` (currently line 112). Change `--marker BRIEF_WRITTEN` to `--marker BRIEF_ARTIFACT` (currently line 116).
- [ ] **Step 13: Update `test_non_empty_check_failure`** — Change `msg.write(f"BRIEF_WRITTEN: {artifact_path}\n")` to `msg.write(f"BRIEF_ARTIFACT: {artifact_path}\n")` (currently line 136). Change `--marker BRIEF_WRITTEN` to `--marker BRIEF_ARTIFACT` (currently line 141).
- [ ] **Step 14: Update `test_multiple_markers_last_wins`** — Change `--marker BRIEF_WRITTEN` to `--marker BRIEF_ARTIFACT` (currently line 195). The fixture's contents are already updated in Step 4.
- [ ] **Step 15: Add `--require-path-suffix` argparse argument to the helper** — In `parse-artifact-handoff.py`, after the existing `--check-non-empty` argparse argument (currently lines 64-68), add a new optional argument: `parser.add_argument("--require-path-suffix", metavar="SUFFIX", help="Verify the extracted path ends with this string (e.g., '.md').")`. After the existing `--check-non-empty` block in the validation section (currently after line 104), add a new validation block: `if args.require_path_suffix and not path.endswith(args.require_path_suffix): fail(f"path suffix mismatch: expected suffix {args.require_path_suffix} for path {path}")`. Add `"path-suffix"` to the `checks` list when the validation passes, mirroring the existing `checks.append(...)` pattern.
- [ ] **Step 16: Add `--require-path-prefix` argparse argument to the helper** — In the same file, after the new `--require-path-suffix` argument added in Step 15, add another optional argument: `parser.add_argument("--require-path-prefix", metavar="ABS_DIR", help="Verify the extracted path's realpath starts with the realpath of this absolute directory followed by '/'.")`. After the path-suffix validation block, add a new validation block that uses `os.path.realpath` on both `path` and `args.require_path_prefix`, then checks that `realpath(path)` starts with `realpath(prefix).rstrip("/") + "/"`. On mismatch, call `fail(f"path prefix mismatch: expected prefix {args.require_path_prefix} for path {path}")`. Add `"path-prefix"` to the `checks` list on success.
- [ ] **Step 17: Update module docstring for new flags** — In the docstring's failure-labels block (currently lines 7-10 area), add two new entries: `path suffix mismatch: expected suffix <X> for path <Y>` and `path prefix mismatch: expected prefix <X> for path <Y>`. Update the module docstring's overall description to mention the path-shape flags.
- [ ] **Step 18: Add test method `test_require_path_suffix_success`** — In `test_parse_artifact_handoff.py`, add a new test method to the `TestParseArtifactHandoff` class. The test creates a temp file containing `SPEC_ARTIFACT: /tmp/sample.md\n` (or similar), runs the script with `--marker SPEC_ARTIFACT --final-message <tmp> --require-path-suffix .md`, and asserts exit code 0. The temp file's path itself does not need to exist for this test (no `--check-existence`).
- [ ] **Step 19: Add test method `test_require_path_suffix_failure`** — Same scaffold but the marker line writes a path NOT ending in `.md` (e.g., `SPEC_ARTIFACT: /tmp/sample.txt`). Assert exit code non-zero and stderr JSON's `failure` field starts with `path suffix mismatch:`.
- [ ] **Step 20: Add test method `test_require_path_prefix_success`** — Use a real temp directory created via `tempfile.TemporaryDirectory()`. Inside, create a `docs/specs/` subdirectory, write a real spec file at `<tmpdir>/docs/specs/foo.md`. Build the marker file: `SPEC_ARTIFACT: <tmpdir>/docs/specs/foo.md\n`. Run the script with `--marker SPEC_ARTIFACT --final-message <msg> --require-path-prefix <tmpdir>/docs/specs/ --check-existence`. Assert exit code 0.
- [ ] **Step 21: Add test method `test_require_path_prefix_failure`** — Same scaffold but the spec file is written at `<tmpdir>/docs/other/foo.md` (outside the required prefix). The marker line names that out-of-prefix path. The helper invocation passes `--require-path-prefix <tmpdir>/docs/specs/`. Assert exit code non-zero and stderr JSON's `failure` field starts with `path prefix mismatch:`.
- [ ] **Step 22: Add test method `test_combined_flags_define_spec_pattern`** — A test that exercises the exact flag combination define-spec/SKILL.md uses: `--marker SPEC_ARTIFACT --final-message <msg> --check-existence --check-non-empty --require-path-suffix .md --require-path-prefix <tmpdir>/docs/specs/`. Three sub-cases: (a) all checks pass (assert exit 0); (b) the spec file is empty whitespace (assert exit non-zero with `missing or empty at <path>`); (c) the path doesn't end in `.md` (assert exit non-zero with `path suffix mismatch:`).
- [ ] **Step 23: Run helper tests and confirm all pass** — From `agent/`, run `python3 -m unittest skills/_shared/scripts/tests/test_parse_artifact_handoff.py -v`. Confirm exit code 0 and every test method passes (including the new path-shape tests added in Steps 18-22).
- [ ] **Step 24: Update the `parse-artifact-handoff.py` bullet in `_shared/scripts/README.md`** — In `agent/skills/_shared/scripts/README.md`, replace the existing bullet for `parse-artifact-handoff.py` (currently line 23, which reads: `- **parse-artifact-handoff.py** — Extracts artifact metadata from a handoff payload, resolving references and validating that all required files exist. Example: python3 parse-artifact-handoff.py --handoff handoff.json --validate.`) with this exact bullet body verbatim (preserve the leading `- ` for the markdown list item, and use unescaped backticks around inline code spans):

  ```
  - **parse-artifact-handoff.py** — Extracts the last `<MARKER>: <path>` line from a subagent's final assistant message and validates the marker family, file existence, non-empty content, and (optionally) path shape. Supported markers: `BRIEF_ARTIFACT`, `SPEC_ARTIFACT`, `PLAN_ARTIFACT`, `REVIEW_ARTIFACT`, `TEST_RESULT_ARTIFACT`. Flags: `--marker <NAME>` (choose from supported markers; old names like `BRIEF_WRITTEN` and `SPEC_WRITTEN` are rejected with argparse "invalid choice"); `--final-message <path>`; `--expected-path <abs>` (byte-equal match); `--check-existence`; `--check-non-empty`; `--require-path-suffix <SUFFIX>` (e.g., `.md`); `--require-path-prefix <ABS_DIR>` (resolved via `os.path.realpath` on both sides). Example: `python3 parse-artifact-handoff.py --marker SPEC_ARTIFACT --final-message msg.txt --check-existence --check-non-empty --require-path-suffix .md --require-path-prefix /workdir/docs/specs/`.
  ```

**Acceptance criteria:**

- `parse-artifact-handoff.py`'s `VALID_MARKERS` list contains exactly five entries in this order: `BRIEF_ARTIFACT`, `SPEC_ARTIFACT`, `PLAN_ARTIFACT`, `REVIEW_ARTIFACT`, `TEST_RESULT_ARTIFACT`.
  Verify: run `grep -A 6 "^VALID_MARKERS = \[" agent/skills/_shared/scripts/parse-artifact-handoff.py` and confirm the printed list is exactly `BRIEF_ARTIFACT`, `SPEC_ARTIFACT`, `PLAN_ARTIFACT`, `REVIEW_ARTIFACT`, `TEST_RESULT_ARTIFACT` in that order, with no `BRIEF_WRITTEN` or `SPEC_WRITTEN` present.
- The helper rejects `--marker BRIEF_WRITTEN` and `--marker SPEC_WRITTEN` with non-zero exit and an `invalid choice` argparse error.
  Verify: run `python3 agent/skills/_shared/scripts/parse-artifact-handoff.py --marker BRIEF_WRITTEN --final-message /dev/null` and confirm exit code is non-zero and stderr contains `invalid choice`. Repeat with `--marker SPEC_WRITTEN` and confirm same.
- The helper accepts `--marker PLAN_ARTIFACT` against an empty fixture and reports the missing-marker JSON failure.
  Verify: run `printf "" | python3 agent/skills/_shared/scripts/parse-artifact-handoff.py --marker PLAN_ARTIFACT --final-message -` and confirm exit code is non-zero with stderr JSON `{"failure": "missing PLAN_ARTIFACT marker"}` (or equivalent), confirming the marker is in the choices list.
- All `parse-artifact-handoff` tests pass.
  Verify: run `cd agent && python3 -m unittest skills/_shared/scripts/tests/test_parse_artifact_handoff.py -v` and confirm exit code 0 with no `FAIL`/`ERROR` lines.
- The fixture files contain the new marker name and no occurrence of the old name.
  Verify: run `grep -c "BRIEF_ARTIFACT" agent/skills/_shared/scripts/tests/fixtures/final-message-with-marker.txt` and confirm output `1`. Run `grep -c "BRIEF_WRITTEN" agent/skills/_shared/scripts/tests/fixtures/final-message-with-marker.txt` and confirm output `0`. Run the same two commands against `final-message-multiple-markers.txt` and confirm `2` and `0` respectively.
- The helper supports `--require-path-suffix` and rejects paths that don't end with the supplied suffix.
  Verify: run `printf "SPEC_ARTIFACT: /tmp/sample.txt\n" | python3 agent/skills/_shared/scripts/parse-artifact-handoff.py --marker SPEC_ARTIFACT --final-message - --require-path-suffix .md` and confirm exit code is non-zero with stderr JSON `.failure` starting with `path suffix mismatch:`.
- The helper supports `--require-path-prefix` and rejects paths whose realpath does not start with the supplied directory's realpath.
  Verify: run `printf "SPEC_ARTIFACT: /tmp/somewhere-else/foo.md\n" | python3 agent/skills/_shared/scripts/parse-artifact-handoff.py --marker SPEC_ARTIFACT --final-message - --require-path-prefix /tmp/expected-prefix/` and confirm exit code is non-zero with stderr JSON `.failure` starting with `path prefix mismatch:`.
- The helper accepts both flags together when the path matches both constraints.
  Verify: create a temp directory `/tmp/test-spec-shape/docs/specs/` and a file `foo.md` inside it with non-empty content; build a marker file containing `SPEC_ARTIFACT: /tmp/test-spec-shape/docs/specs/foo.md`; run `python3 agent/skills/_shared/scripts/parse-artifact-handoff.py --marker SPEC_ARTIFACT --final-message <marker-file> --check-existence --check-non-empty --require-path-suffix .md --require-path-prefix /tmp/test-spec-shape/docs/specs/`; confirm exit code 0 with stdout JSON containing `"checks": [...]` listing `marker`, `existence`, `non-empty`, `path-suffix`, `path-prefix` (in any order).
- `_shared/scripts/README.md`'s `parse-artifact-handoff.py` bullet documents the new marker family and path-shape flags.
  Verify: open `agent/skills/_shared/scripts/README.md`, locate the `parse-artifact-handoff.py` bullet, and confirm its body contains all of the literal substrings `BRIEF_ARTIFACT`, `SPEC_ARTIFACT`, `PLAN_ARTIFACT`, `REVIEW_ARTIFACT`, `TEST_RESULT_ARTIFACT`, `--require-path-suffix`, AND `--require-path-prefix`. Also run `grep -n "BRIEF_WRITTEN\|SPEC_WRITTEN" agent/skills/_shared/scripts/README.md` and confirm at most one match (the bullet's reference to old-name rejection is permitted; any other match is a stale reference and must be removed).

**Model recommendation:** standard

---

### Task 2: Update scout prompt, agent, consumer, and README

**Files:**
- Modify: `agent/skills/scout/scout-prompt.md`
- Modify: `agent/skills/scout/SKILL.md`
- Modify: `agent/agents/scout.md`
- Modify: `agent/skills/scout/README.md`

**Steps:**
- [ ] **Step 1: Rename marker in scout-prompt.md `## Completion contract`** — In `agent/skills/scout/scout-prompt.md`, in the "Completion contract" section (currently lines 83-96), change the code block contents from `BRIEF_WRITTEN: {OUTPUT_PATH}` to `BRIEF_ARTIFACT: {OUTPUT_PATH}`. Keep the surrounding "Requirements for this line" bullets identical.
- [ ] **Step 2: Add dual-channel instruction to scout-prompt.md** — In the same "Completion contract" section, after the existing requirements bullets and before the closing paragraph "The orchestrator parses this line to drive its review-and-commit gate. The file write tool result alone is insufficient — the marker line in your final assistant message is required.", append the following paragraph verbatim (insert the literal characters as shown — use unescaped double quotes around the `subagent_done` `message` argument, no backslashes anywhere in the inserted text):

  ```
  In addition to the final-assistant-message marker line above, call `subagent_done(message="BRIEF_ARTIFACT: {OUTPUT_PATH}")` as your terminal tool action. The two strings — the final-assistant-message marker line and the `subagent_done` message — must be byte-equal. The orchestrator's watcher prefers the `subagent_done` sentinel when present, then falls back to the transcript's last assistant message; emitting both ensures the marker reaches the parent regardless of which channel the watcher reads.
  ```
- [ ] **Step 3: Update scout/SKILL.md helper invocation** — In `agent/skills/scout/SKILL.md` Step 6 paragraph **(b)–(c)** (currently line 105), change `--marker BRIEF_WRITTEN` to `--marker BRIEF_ARTIFACT`. The other flags `--final-message <path-to-finalMessage> --expected-path <{OUTPUT_PATH}> --check-existence --check-non-empty` are already correct — no further change.
- [ ] **Step 4: Update scout.md agent description** — In `agent/agents/scout.md`, in the `description:` frontmatter line (currently line 3), change `Ends with BRIEF_WRITTEN: <absolute path> on its own line.` to `Ends with BRIEF_ARTIFACT: <absolute path> on its own line.`.
- [ ] **Step 5: Update scout.md hard-rules bullet** — In `agent/agents/scout.md`'s `## Hard rules` section, replace the bullet `End your final assistant message with a single anchored line BRIEF_WRITTEN: <absolute path> matching the orchestrator-supplied output path exactly. No backticks, no trailing commentary on that line.` (currently line 20) with two bullets: (1) `End your final assistant message with a single anchored line BRIEF_ARTIFACT: <absolute path> matching the orchestrator-supplied output path exactly. No backticks, no trailing commentary on that line.` and (2) `Call subagent_done(message="BRIEF_ARTIFACT: <absolute path>") as your terminal tool action — the message argument must be byte-equal to the final-assistant-message marker line. This is in addition to (not instead of) the final-assistant-message marker.`
- [ ] **Step 6: Update scout/README.md marker reference** — In `agent/skills/scout/README.md`, in the "Dispatch behavior" paragraph (currently line 30), change `BRIEF_WRITTEN: <absolute path>` to `BRIEF_ARTIFACT: <absolute path>`.
- [ ] **Step 7: Verify no remaining `BRIEF_WRITTEN` references in scout files** — Run `grep -rn BRIEF_WRITTEN agent/skills/scout agent/agents/scout.md` and confirm zero matches.

**Acceptance criteria:**

- `scout-prompt.md` instructs the agent to emit the marker on the final assistant message AND via `subagent_done(message=...)`.
  Verify: open `agent/skills/scout/scout-prompt.md`, locate the `## Completion contract` section, and confirm (1) the code block contains exactly `BRIEF_ARTIFACT: {OUTPUT_PATH}` and (2) the section text contains the literal substring `subagent_done(message="BRIEF_ARTIFACT:` (the dual-channel instruction).
- `scout/SKILL.md` Step 6 invokes the helper with the new marker.
  Verify: run `grep -n "parse-artifact-handoff.py --marker" agent/skills/scout/SKILL.md` and confirm the matching line contains `--marker BRIEF_ARTIFACT` and `--check-existence --check-non-empty --expected-path` (or the same flags in any order including the three).
- The `scout` agent definition references the new marker in both its description and rules.
  Verify: open `agent/agents/scout.md` and confirm (1) the `description:` frontmatter line contains `BRIEF_ARTIFACT` and not `BRIEF_WRITTEN`, and (2) the `## Hard rules` section contains both a "final assistant message ends with BRIEF_ARTIFACT" rule and a `subagent_done(message="BRIEF_ARTIFACT:` rule.
- No file under `agent/skills/scout/` or `agent/agents/scout.md` mentions the old marker name.
  Verify: run `grep -rn BRIEF_WRITTEN agent/skills/scout agent/agents/scout.md` and confirm zero matches (no output, exit code non-zero is acceptable for grep with no matches; the absence of output is the success signal).

**Model recommendation:** cheap

---

### Task 3: Update define-spec procedure, skill orchestrator, agent, README, and add todo-input-shape test

**Files:**
- Modify: `agent/skills/define-spec/spec-design-procedure.md`
- Modify: `agent/skills/define-spec/SKILL.md`
- Modify: `agent/agents/spec-designer.md`
- Modify: `agent/skills/define-spec/README.md`
- Create: `agent/skills/define-spec/scripts/tests/test_todo_input_shape.py`

**Steps:**
- [ ] **Step 1: Update spec-design-procedure.md Step 1 todo regex prose** — In `agent/skills/define-spec/spec-design-procedure.md` Step 1 table (currently line 28), change the **Todo ID** row's "Pattern" cell from `matches ^TODO-([0-9a-f]{8})$ exactly` to `after trimming surrounding whitespace and lowercasing the input, the result matches ^TODO-[0-9a-f]{8}$ case-insensitively — so TODO-BD750B75 and TODO-bd750b75  (trailing space) both match (resolving to canonical lowercase bd750b75), while bd750b75 (no prefix) and /define-spec TODO-bd750b75 (slash-command leak) still fall through to freeform`. Preserve the rest of the row (the "Behavior" cell remains unchanged) and the Existing-spec-path and Freeform-text rows verbatim.
- [ ] **Step 2: Update spec-design-procedure.md Step 1 existing-spec-branch parenthetical** — In the Existing-spec-path row (currently line 29), change the parenthetical example `this is the form the orchestrator's SPEC_WRITTEN: <absolute path> emits` to `this is the form the orchestrator's SPEC_ARTIFACT: <absolute path> emits`. The rest of the row's text is unchanged.
- [ ] **Step 3: Rename marker in spec-design-procedure.md Step 9 subagent branch** — In Step 9's "Subagent / mux branch" subsection (currently lines 177-189), change the marker code block contents from `SPEC_WRITTEN: <absolute path>` to `SPEC_ARTIFACT: <absolute path>`. Update the surrounding prose: every occurrence of `SPEC_WRITTEN` in this subsection becomes `SPEC_ARTIFACT` (including the failure-mode sentence "exit without emitting `SPEC_WRITTEN:`" → "exit without emitting `SPEC_ARTIFACT:`").
- [ ] **Step 4: Add dual-channel instruction to spec-design-procedure.md Step 9 subagent branch** — After the existing prose paragraph ending with "Then exit. The orchestrator parses this line to drive its review-and-commit gate.", insert the following paragraph verbatim (insert the literal characters as shown — use unescaped double quotes around the `subagent_done` `message` argument, no backslashes anywhere in the inserted text):

  ```
  In addition to the final-assistant-message marker line above, call `subagent_done(message="SPEC_ARTIFACT: <absolute path>")` as your terminal tool action. The two strings — the final-assistant-message marker line and the `subagent_done` message — must be byte-equal. The orchestrator's watcher prefers the `subagent_done` sentinel when present, then falls back to the transcript's last assistant message; emitting both ensures the marker reaches the parent regardless of which channel the watcher reads.
  ```
- [ ] **Step 5: Add absolute-path-on-relative-input rule to spec-design-procedure.md Step 9** — In the same Step 9 subagent-branch subsection, after the dual-channel instruction added in Step 4 and before the failure-mode sentence ("If you cannot complete the procedure..."), insert a new paragraph: "When the existing-spec branch was fired with a relative input path (e.g. `docs/specs/foo.md`), the file write target stays at the supplied path per Step 1's directive ('use the input path as-is — do not normalize between relative and absolute'). However, the marker line emitted in both channels of `SPEC_ARTIFACT:` MUST be the absolute path of the written file (resolved against the current working directory). The 'use the input path as-is' rule applies to the file-write target only — never to the marker emission."
- [ ] **Step 6: Update spec-design-procedure.md Step 9 inline branch reference** — In the inline-branch subsection (currently lines 191-195), change every occurrence of `SPEC_WRITTEN` to `SPEC_ARTIFACT` (including the bullet "Do not emit `SPEC_WRITTEN: <path>`" → "Do not emit `SPEC_ARTIFACT: <path>`").
- [ ] **Step 7: Update define-spec/SKILL.md Step 4 helper invocation** — In `agent/skills/define-spec/SKILL.md` Step 4 (currently line 69), change `parse-artifact-handoff.py --marker SPEC_WRITTEN --final-message <temp-file> --check-existence` to `parse-artifact-handoff.py --marker SPEC_ARTIFACT --final-message <temp-file> --check-existence --check-non-empty --require-path-suffix .md --require-path-prefix <working-dir>/docs/specs/`. (Marker rename + add `--check-non-empty` + add the path-shape gates.) Update the surrounding prose so the orchestrator knows: "The helper now performs four checks atomically — marker presence, file existence, non-empty content, path-shape (`.md` suffix + `<working-dir>/docs/specs/` prefix). On any check failing, the helper exits non-zero with a JSON `failure` field on stderr; surface the failure verbatim and stop."
- [ ] **Step 8: Update define-spec/SKILL.md Step 4 prose around the helper** — In the same Step 4 paragraph, change every prose occurrence of `SPEC_WRITTEN` to `SPEC_ARTIFACT`: the `missing SPEC_WRITTEN marker` → case-(2) trigger phrase, the report sentence "Spec design reported SPEC_WRITTEN: <path> but <path> does not exist on disk", and the case-(2) recovery prose ("exited without emitting `SPEC_WRITTEN: <path>`" appears multiple times — all become `SPEC_ARTIFACT`). Also the `## Step 4: Validate SPEC_WRITTEN: (mux branch only)` heading itself becomes `## Step 4: Validate SPEC_ARTIFACT: (mux branch only)`.
- [ ] **Step 9: Update define-spec/SKILL.md Step 4 case-routing for the new failure modes** — In Step 4's failure-mode mapping prose, add explicit handling for the new helper failures: `path suffix mismatch: ...` and `path prefix mismatch: ...` both surface as `Spec design reported SPEC_ARTIFACT: <path> but the path is not a valid docs/specs/*.md path under <working-dir>. Transcript: <transcriptPath>. No commit attempted.` and stop. Do not perform transcript-backed recovery on these failures — the marker emission was malformed (wrong path shape), not missing. Recovery is only for case (2) `missing SPEC_ARTIFACT marker`.
- [ ] **Step 10: Update define-spec/SKILL.md Step 7 Refine prose** — In Step 7's "(r) Refine" bullet (currently line 134), change `the original SPEC_WRITTEN: <absolute path> line` to `the original SPEC_ARTIFACT: <absolute path> line`.
- [ ] **Step 11: Update define-spec/SKILL.md edge-case prose** — In the "Edge cases" section, change the bullet "Subagent wrote a spec but missed `SPEC_WRITTEN:`" (currently line 152) to "Subagent wrote a spec but missed `SPEC_ARTIFACT:`". The bullet body is unchanged otherwise.
- [ ] **Step 12: Update spec-designer.md description** — In `agent/agents/spec-designer.md` line 3 (the `description:` frontmatter line), change `ends its turn with a SPEC_WRITTEN: <absolute path> line.` to `ends its turn with a SPEC_ARTIFACT: <absolute path> line and a matching subagent_done(message="SPEC_ARTIFACT: <absolute path>") call.`.
- [ ] **Step 13: Update define-spec/README.md "Completion and validation" block** — In `agent/skills/define-spec/README.md` (currently line 38-42 area), change the `text` code block contents from `SPEC_WRITTEN: <absolute path>` to `SPEC_ARTIFACT: <absolute path>`. Update the prose immediately after to mention the dual-channel emission. Insert the following sentence verbatim (use unescaped double quotes around the `subagent_done` `message` argument, no backslashes anywhere in the inserted text):

  ```
  The subagent emits this line on both the final assistant message and via `subagent_done(message="SPEC_ARTIFACT: <absolute path>")` for robust handoff.
  ```
- [ ] **Step 14: Verify no remaining `SPEC_WRITTEN` references in define-spec files** — Run `grep -rn SPEC_WRITTEN agent/skills/define-spec agent/agents/spec-designer.md` and confirm zero matches.
- [ ] **Step 15: Create `test_todo_input_shape.py`** — Create `agent/skills/define-spec/scripts/tests/test_todo_input_shape.py` with this exact body:

```python
"""Tests that pin the todo-input-shape detection rule documented in
spec-design-procedure.md Step 1.

The procedure says: trim leading/trailing whitespace and lowercase the
captured hex segment of the input before matching against
^TODO-([0-9a-f]{8})$ exactly. This test pins that behavior — if a future
PR changes the procedure's normalization rules, the test must change in
lockstep, catching drift between the prose and any consumer's
interpretation."""
import re
import unittest


# Pinned regex pattern from spec-design-procedure.md Step 1.
# Surrounding whitespace must be trimmed and the input lowercased before
# applying this regex. The IGNORECASE flag tolerates uppercase prefix
# variants — `TODO-`, `todo-`, and case-mixed `Todo-` all match — so the
# `.lower()` on the normalized input only affects the captured hex
# segment, yielding the canonical lowercase form used downstream as
# `docs/todos/<hex>.md`.
TODO_PATTERN = re.compile(r"^TODO-([0-9a-f]{8})$", re.IGNORECASE)


def normalize(user_input: str) -> str:
    """Strip surrounding whitespace and lowercase, per the procedure.

    The TODO_PATTERN regex is compiled with `re.IGNORECASE` so the
    `TODO-` prefix matches case-insensitively. Lowercasing the entire
    normalized input here also lowercases the captured hex segment to
    the canonical form (lowercase) used downstream as
    `docs/todos/<hex>.md`."""
    return user_input.strip().lower()


def detect_todo(user_input: str):
    """Returns the captured hex if the input matches the todo branch
    after normalization, else None."""
    normalized = normalize(user_input)
    m = TODO_PATTERN.match(normalized)
    return m.group(1) if m else None


class TestTodoInputShape(unittest.TestCase):

    def test_lowercase_hex_matches(self):
        self.assertEqual(detect_todo("TODO-bd750b75"), "bd750b75")

    def test_uppercase_hex_matches_after_lowercasing(self):
        self.assertEqual(detect_todo("TODO-BD750B75"), "bd750b75")

    def test_trailing_whitespace_matches_after_trim(self):
        self.assertEqual(detect_todo("TODO-bd750b75 "), "bd750b75")

    def test_leading_whitespace_matches_after_trim(self):
        self.assertEqual(detect_todo(" TODO-bd750b75"), "bd750b75")

    def test_leading_and_trailing_whitespace_matches_after_trim(self):
        self.assertEqual(detect_todo("  TODO-bd750b75  "), "bd750b75")

    def test_no_prefix_does_not_match(self):
        # Bare hex with no TODO- prefix → freeform branch
        self.assertIsNone(detect_todo("bd750b75"))

    def test_slash_command_leak_does_not_match(self):
        # Slash command leakage (extraneous prefix) → freeform branch
        self.assertIsNone(detect_todo("/define-spec TODO-bd750b75"))

    def test_too_few_hex_chars_does_not_match(self):
        self.assertIsNone(detect_todo("TODO-bd750b7"))  # 7 chars

    def test_too_many_hex_chars_does_not_match(self):
        self.assertIsNone(detect_todo("TODO-bd750b75a"))  # 9 chars

    def test_non_hex_chars_do_not_match(self):
        self.assertIsNone(detect_todo("TODO-bd750bgg"))  # 'gg' not hex


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 16: Run the new test file** — From `agent/`, run `python3 -m unittest skills/define-spec/scripts/tests/test_todo_input_shape.py -v`. Confirm exit code 0 and every test method passes.

**Acceptance criteria:**

- `spec-design-procedure.md` Step 1 specifies trim+lowercase normalization for the todo regex.
  Verify: open `agent/skills/define-spec/spec-design-procedure.md`, locate the Step 1 table's `**Todo ID**` row, and confirm the Pattern cell contains the literal substrings `trimming surrounding whitespace`, `lowercasing`, and at least one of the example variants (`TODO-BD750B75` or `TODO-bd750b75 ` with trailing space).
- `spec-design-procedure.md` Step 9 subagent branch uses the new marker, instructs dual-channel emission, and explicitly says the marker is absolute even when the input path was relative.
  Verify: open `agent/skills/define-spec/spec-design-procedure.md` Step 9 "Subagent / mux branch" subsection and confirm: (1) the marker code block reads `SPEC_ARTIFACT: <absolute path>` (not `SPEC_WRITTEN`); (2) the section text contains the literal substring `subagent_done(message="SPEC_ARTIFACT:`; (3) the section text contains the literal substring `marker line emitted in both channels of \`SPEC_ARTIFACT:\` MUST be the absolute path` (or equivalent prose explicitly mandating absolute-path emission for relative inputs).
- `define-spec/SKILL.md` Step 4 invokes the helper with the new marker, `--check-non-empty`, and the path-shape gates `--require-path-suffix .md` and `--require-path-prefix <working-dir>/docs/specs/`.
  Verify: open `agent/skills/define-spec/SKILL.md` and confirm Step 4's `parse-artifact-handoff.py` invocation contains all five tokens: `--marker SPEC_ARTIFACT`, `--check-existence`, `--check-non-empty`, `--require-path-suffix .md`, AND `--require-path-prefix <working-dir>/docs/specs/` (or equivalent placeholder for the working directory).
- `define-spec/SKILL.md` Step 4 maps `path suffix mismatch:` and `path prefix mismatch:` failures to the path-shape failure message and stops without transcript-backed recovery.
  Verify: open `agent/skills/define-spec/SKILL.md` Step 4 and confirm the failure-mode mapping prose contains the literal substring `is not a valid docs/specs/*.md path under` AND explicitly says recovery is NOT attempted on these path-shape failures (e.g., the prose contains `Do not perform transcript-backed recovery` or equivalent).
- `spec-designer.md` agent description references the new marker and the dual-channel call.
  Verify: open `agent/agents/spec-designer.md` and confirm the `description:` frontmatter line contains `SPEC_ARTIFACT` and `subagent_done(message="SPEC_ARTIFACT:` (and does not contain `SPEC_WRITTEN`).
- No file under `agent/skills/define-spec/` or `agent/agents/spec-designer.md` mentions the old marker name.
  Verify: run `grep -rn SPEC_WRITTEN agent/skills/define-spec agent/agents/spec-designer.md` and confirm zero matches.
- A new `test_todo_input_shape.py` exists and pins the trim+lowercase regex behavior with the spec-mandated test inputs.
  Verify: open `agent/skills/define-spec/scripts/tests/test_todo_input_shape.py` and confirm: (1) the file defines a `TODO_PATTERN` regex that matches `^TODO-[0-9a-f]{8}$`; (2) the file defines a `normalize` function that calls `.strip().lower()` on the input; (3) the test class contains test methods named (or covering) `test_uppercase_hex_matches_after_lowercasing`, `test_trailing_whitespace_matches_after_trim`, `test_no_prefix_does_not_match`, AND `test_slash_command_leak_does_not_match`.
- All `test_todo_input_shape.py` tests pass.
  Verify: from `agent/`, run `python3 -m unittest skills/define-spec/scripts/tests/test_todo_input_shape.py -v` and confirm exit code 0 with no `FAIL`/`ERROR` lines.

**Model recommendation:** standard

---

### Task 4: Add `PLAN_ARTIFACT` to planner agent, generate-plan prompt, generate-plan SKILL, and README

**Files:**
- Modify: `agent/skills/generate-plan/generate-plan-prompt.md`
- Modify: `agent/skills/generate-plan/SKILL.md`
- Modify: `agent/agents/planner.md`
- Modify: `agent/skills/generate-plan/README.md`

**Model recommendation:** standard

**Steps:**
- [ ] **Step 1: Add `## Completion contract` section to generate-plan-prompt.md** — In `agent/skills/generate-plan/generate-plan-prompt.md`, after the existing `## Output` section (currently lines 26-30), append a new level-2 section. The new section reads exactly:

```
## Completion contract

After the plan write succeeds, your final assistant message MUST end with a single anchored line on its own line as the very last line of output:

```
PLAN_ARTIFACT: {OUTPUT_PATH}
```

Requirements for this line:
- No surrounding backticks on the line itself.
- No trailing commentary on the same line.
- The path is character-for-character identical to the supplied `{OUTPUT_PATH}` above.

In addition to the final-assistant-message marker line above, call `subagent_done(message="PLAN_ARTIFACT: {OUTPUT_PATH}")` as your terminal tool action. The two strings — the final-assistant-message marker line and the `subagent_done` message — must be byte-equal. The orchestrator's watcher prefers the `subagent_done` sentinel when present, then falls back to the transcript's last assistant message; emitting both ensures the marker reaches the parent regardless of which channel the watcher reads.

The orchestrator parses this line to validate the plan write before handing off to refine-plan. The file write tool result alone is insufficient — the marker line must reach the parent through at least one of the two channels.
```

- [ ] **Step 2: Update planner.md `## Output` section** — In `agent/agents/planner.md`, replace the existing `## Output` section (currently lines 228-236) with this exact text:

```
## Output

This output contract applies to the **initial-generation pass only** — when you are dispatched with the `generate-plan-prompt.md` task body. Edit-mode dispatches (driven by `edit-plan-prompt.md`) do NOT emit a marker; the `PLAN_ARTIFACT` from initial generation already names the file and edit mode reuses it.

After saving the plan in initial-generation mode:

1. End your final assistant message with a single anchored line on its own line, as the very last line of your output:

   ```
   PLAN_ARTIFACT: <absolute path>
   ```

   Where `<absolute path>` is character-for-character identical to the `{OUTPUT_PATH}` supplied in your task prompt. No surrounding backticks, no trailing commentary on the same line.

2. Call `subagent_done(message="PLAN_ARTIFACT: <absolute path>")` as your terminal tool action. The `message` argument must be byte-equal to the final-assistant-message marker line.

The orchestrator validates the marker via `parse-artifact-handoff.py --marker PLAN_ARTIFACT --expected-path <absolute output path> --check-existence --check-non-empty` before handing off to refine-plan. Do NOT ask about execution mode, pacing, or wave configuration — that is `execute-plan`'s responsibility.
```

- [ ] **Step 3: Add `parse-artifact-handoff.py` validation in generate-plan/SKILL.md Step 3** — In `agent/skills/generate-plan/SKILL.md`, in Step 3 (currently lines 55-76), after the existing dispatch block "Read the planner's output from results[0].finalMessage — the planner writes the plan to disk; this result is the return message." insert a new paragraph immediately before Step 4:

```
4. Validate the planner's marker handoff. Write `results[0].finalMessage` to a temp file and run `python3 agent/skills/_shared/scripts/parse-artifact-handoff.py --marker PLAN_ARTIFACT --final-message <temp-file> --expected-path <{OUTPUT_PATH} from Step 3 (absolute path)> --check-existence --check-non-empty`. On non-zero exit, surface the script's stderr (a JSON blob with a `failure` field) verbatim to the user, prefix it with `generate-plan: planner artifact handoff failed —`, and stop the skill. Do NOT proceed to Step 4 (refine-plan handoff). On exit 0, read `.path` from stdout JSON; this is the validated plan path used by Step 4.
```

(Note: this is added as the new fourth numbered item in Step 3's procedure — keep the existing items 1, 2, 3 intact, and renumber `Step 4: Refine the plan` to come immediately after the new validation paragraph. The `Step 4` heading does not change number — it remains `## Step 4: Refine the plan`. The validation paragraph is integrated into Step 3's body, not promoted to its own top-level step.)

- [ ] **Step 4: Update generate-plan/README.md "Planning flow" entry** — In `agent/skills/generate-plan/README.md` (currently line 28-29), change the "Planning flow" item 4 from `Dispatch the planner subagent synchronously.` to `Dispatch the planner subagent synchronously and validate its PLAN_ARTIFACT marker handoff via parse-artifact-handoff.py before treating the plan as written.` The other items in the list are unchanged.
- [ ] **Step 5: Verify generate-plan-prompt.md template renders correctly** — Run `grep -n "PLAN_ARTIFACT: {OUTPUT_PATH}" agent/skills/generate-plan/generate-plan-prompt.md` and confirm at least one match. Run `grep -n "subagent_done(message=" agent/skills/generate-plan/generate-plan-prompt.md` and confirm at least one match.

**Acceptance criteria:**

- `generate-plan-prompt.md` includes a `## Completion contract` section that names `PLAN_ARTIFACT` and the `subagent_done` dual-channel instruction.
  Verify: open `agent/skills/generate-plan/generate-plan-prompt.md`, locate the new `## Completion contract` section after the `## Output` section, and confirm: (1) the section contains the marker code block `PLAN_ARTIFACT: {OUTPUT_PATH}`; (2) the section contains the literal substring `subagent_done(message="PLAN_ARTIFACT:`.
- `planner.md` agent definition's `## Output` section instructs both initial-generation marker emission via the dual channel AND explicitly notes edit-mode skips the marker.
  Verify: open `agent/agents/planner.md`, locate the `## Output` section, and confirm: (1) the section contains the literal substring `PLAN_ARTIFACT: <absolute path>`; (2) the section contains the literal substring `subagent_done(message="PLAN_ARTIFACT:`; (3) the section contains the literal substring `Edit-mode dispatches` followed by language explaining edit mode does not emit a marker.
- `generate-plan/SKILL.md` Step 3 validates the planner's marker via `parse-artifact-handoff.py --marker PLAN_ARTIFACT --expected-path ... --check-existence --check-non-empty` before Step 4.
  Verify: open `agent/skills/generate-plan/SKILL.md`, locate Step 3, and confirm a paragraph between the dispatch block and Step 4's heading containing the literal substrings `parse-artifact-handoff.py`, `--marker PLAN_ARTIFACT`, `--expected-path`, `--check-existence`, AND `--check-non-empty` (all five tokens present in the same paragraph).
- The `generate-plan/README.md` "Planning flow" entry mentions PLAN_ARTIFACT validation.
  Verify: run `grep -n "PLAN_ARTIFACT" agent/skills/generate-plan/README.md` and confirm at least one match in the "Planning flow" section.

**Model recommendation:** standard

---

### Task 5: Add belt-and-suspenders contract to review-code-prompt and code-reviewer

**Files:**
- Modify: `agent/skills/requesting-code-review/review-code-prompt.md`
- Modify: `agent/agents/code-reviewer.md`

**Steps:**
- [ ] **Step 1: Update review-code-prompt.md Output Artifact Contract bullet 5** — In `agent/skills/requesting-code-review/review-code-prompt.md`, in the `## Output Artifact Contract` section's "When `{REVIEW_OUTPUT_PATH}` is non-empty" subsection (currently lines 141-148), replace bullet 5 (`End your final assistant message with exactly one anchored line on its own line, as the very last line of your output: REVIEW_ARTIFACT: <absolute path> where <absolute path> is character-for-character identical to {REVIEW_OUTPUT_PATH}.`) with two bullets:
  - **5a.** End your final assistant message with exactly one anchored line on its own line, as the very last line of your output: `REVIEW_ARTIFACT: <absolute path>` where `<absolute path>` is character-for-character identical to `{REVIEW_OUTPUT_PATH}`.
  - **5b.** Call `subagent_done(message="REVIEW_ARTIFACT: <absolute path>")` as your terminal tool action. The `message` argument MUST be byte-equal to the final-assistant-message marker line in 5a. Emitting both channels ensures the marker reaches the refiner regardless of which channel the watcher reads.

  Renumber the existing bullet 6 ("Do not emit any other structured markers...") to remain after 5b. Update the bullet count if the section uses an explicit count.

- [ ] **Step 2: Verify standalone-mode block in review-code-prompt.md is unchanged** — Confirm the "When `{REVIEW_OUTPUT_PATH}` is empty (standalone use)" block (currently lines 150-152) still says "Do not write to disk. Do not emit a `REVIEW_ARTIFACT:` marker." — extend this to also say "Do not call `subagent_done` with a structured marker message; the standalone path returns the review verbatim as the final assistant message." (The standalone path stays markerless on both channels.)
- [ ] **Step 3: Update code-reviewer.md Output Artifact Contract bullet 4** — In `agent/agents/code-reviewer.md`, in the `## Output Artifact Contract` section's "When `{REVIEW_OUTPUT_PATH}` is non-empty" subsection (currently lines 49-56), replace bullet 4 with two bullets mirroring the prompt update:
  - **4a.** End your final assistant message with exactly one anchored line on its own line, as the very last line of your output: `REVIEW_ARTIFACT: <absolute path>` where `<absolute path>` is character-for-character identical to `{REVIEW_OUTPUT_PATH}`.
  - **4b.** Call `subagent_done(message="REVIEW_ARTIFACT: <absolute path>")` as your terminal tool action. The `message` argument MUST be byte-equal to the final-assistant-message marker line in 4a.
- [ ] **Step 4: Update code-reviewer.md standalone-mode block** — Update the "When `{REVIEW_OUTPUT_PATH}` is empty (standalone or non-refiner dispatch)" subsection (currently lines 58-60) to add: "Do not call `subagent_done` with a structured marker message; the standalone path returns the review verbatim as the final assistant message."

**Acceptance criteria:**

- `review-code-prompt.md` Output Artifact Contract instructs both the final-assistant-message marker AND the `subagent_done(message=...)` call when `{REVIEW_OUTPUT_PATH}` is non-empty.
  Verify: open `agent/skills/requesting-code-review/review-code-prompt.md`, locate the `## Output Artifact Contract` section, and confirm the "When `{REVIEW_OUTPUT_PATH}` is non-empty" subsection contains both the literal substring `REVIEW_ARTIFACT: <absolute path>` (the marker line) and the literal substring `subagent_done(message="REVIEW_ARTIFACT:` (the dual-channel call).
- `code-reviewer.md` agent definition's Output Artifact Contract similarly instructs both channels.
  Verify: open `agent/agents/code-reviewer.md` and confirm the `## Output Artifact Contract` section's non-empty subsection contains `subagent_done(message="REVIEW_ARTIFACT:` (and the marker text was already there).
- The standalone-mode block explicitly forbids `subagent_done(message=...)` with a structured marker.
  Verify: open `agent/skills/requesting-code-review/review-code-prompt.md` and confirm the "When `{REVIEW_OUTPUT_PATH}` is empty (standalone use)" block contains the literal substring `Do not call \`subagent_done\` with a structured marker message` (or equivalent — `subagent_done` named, structured marker forbidden in standalone mode).

**Model recommendation:** cheap

---

### Task 6: Add belt-and-suspenders contract to review-plan-prompt and plan-reviewer

**Files:**
- Modify: `agent/skills/generate-plan/review-plan-prompt.md`
- Modify: `agent/agents/plan-reviewer.md`

**Steps:**
- [ ] **Step 1: Update review-plan-prompt.md Output Artifact Contract bullet 5** — In `agent/skills/generate-plan/review-plan-prompt.md`, in the `## Output Artifact Contract` section's "When `{REVIEW_OUTPUT_PATH}` is non-empty" subsection (currently lines 167-174), replace bullet 5 (the existing `REVIEW_ARTIFACT:` final-line instruction) with two bullets:
  - **5a.** End your final assistant message with exactly one anchored line on its own line, as the very last line of your output: `REVIEW_ARTIFACT: <absolute path>` where `<absolute path>` is character-for-character identical to `{REVIEW_OUTPUT_PATH}`.
  - **5b.** Call `subagent_done(message="REVIEW_ARTIFACT: <absolute path>")` as your terminal tool action. The `message` argument MUST be byte-equal to the final-assistant-message marker line in 5a. Emitting both channels ensures the marker reaches the refiner regardless of which channel the watcher reads.

  Renumber the existing bullet 6 to remain after 5b.

- [ ] **Step 2: Update review-plan-prompt.md standalone-mode block** — Update the "When `{REVIEW_OUTPUT_PATH}` is empty (standalone use)" block (currently lines 176-178) to add: "Do not call `subagent_done` with a structured marker message; the standalone path returns the review verbatim as the final assistant message."
- [ ] **Step 3: Update plan-reviewer.md Output Artifact Contract bullet 4** — In `agent/agents/plan-reviewer.md`, in the `## Output Artifact Contract` section's non-empty subsection (currently lines 79-86), replace bullet 4 with two bullets mirroring Task 5 Step 3's pattern (substituting `plan-reviewer` context where relevant). The standalone block (currently lines 88-92) gets the same `subagent_done`-forbidden update as Task 5 Step 4.

**Acceptance criteria:**

- `review-plan-prompt.md` Output Artifact Contract instructs both channels for non-empty `{REVIEW_OUTPUT_PATH}`.
  Verify: open `agent/skills/generate-plan/review-plan-prompt.md` and confirm the `## Output Artifact Contract` section's non-empty subsection contains `subagent_done(message="REVIEW_ARTIFACT:` (the dual-channel instruction).
- `plan-reviewer.md` agent definition's Output Artifact Contract similarly instructs both channels.
  Verify: open `agent/agents/plan-reviewer.md` and confirm the `## Output Artifact Contract` section's non-empty subsection contains `subagent_done(message="REVIEW_ARTIFACT:`.
- The standalone-mode blocks in both files forbid `subagent_done` with a structured marker.
  Verify: run `grep -A 3 "Do not call .subagent_done. with a structured marker message" agent/skills/generate-plan/review-plan-prompt.md agent/agents/plan-reviewer.md` and confirm at least one match in each file.

**Model recommendation:** cheap

---

### Task 7: Add belt-and-suspenders contract to test-runner-prompt and test-runner

**Files:**
- Modify: `agent/skills/_shared/test-runner-prompt.md`
- Modify: `agent/agents/test-runner.md`

**Steps:**
- [ ] **Step 1: Update test-runner-prompt.md `## Output` section** — In `agent/skills/_shared/test-runner-prompt.md`, in the `## Output` section (currently lines 27-29), replace the single instruction "End your final assistant message with exactly one anchored line on its own line, as the very last line of your output: `TEST_RESULT_ARTIFACT: <absolute path>` where `<absolute path>` is character-for-character identical to the path in `## Artifact Output Path`. Do not emit any other structured markers in your response." with a two-part instruction:

```
End your final assistant message with exactly one anchored line on its own line, as the very last line of your output: `TEST_RESULT_ARTIFACT: <absolute path>` where `<absolute path>` is character-for-character identical to the path in `## Artifact Output Path`.

Then, as your terminal tool action, call `subagent_done(message="TEST_RESULT_ARTIFACT: <absolute path>")`. The `message` argument MUST be byte-equal to the final-assistant-message marker line above. Emitting both channels ensures the marker reaches the orchestrator regardless of which channel the watcher reads.

Do not emit any other structured markers in your response (no `STATUS:`, no other anchored lines).
```

- [ ] **Step 2: Update test-runner-prompt.md `## Rules` last bullet** — In the `## Rules` section (currently lines 31-40), update the bullet "Final assistant message ends with `TEST_RESULT_ARTIFACT: <absolute path>` and contains no other structured markers." (currently line 40) to the following bullet body verbatim (use unescaped double quotes around the `subagent_done` `message` argument, no backslashes anywhere in the inserted text):

  ```
  Final assistant message ends with `TEST_RESULT_ARTIFACT: <absolute path>`, AND `subagent_done(message="TEST_RESULT_ARTIFACT: <absolute path>")` is the terminal tool call. Both strings byte-equal. No other structured markers anywhere in the response.
  ```
- [ ] **Step 3: Update test-runner.md `## Execution` Step 5** — In `agent/agents/test-runner.md` `## Execution` section, replace Step 5 (currently line 41) "Emit `TEST_RESULT_ARTIFACT: <absolute path>` as the LAST line of your final assistant message, where `<absolute path>` is character-for-character identical to `## Artifact Output Path`. This marker MUST appear on its own line as the final line. No other structured markers anywhere in the response." with a two-part instruction:

```
5. Emit `TEST_RESULT_ARTIFACT: <absolute path>` as the LAST line of your final assistant message, where `<absolute path>` is character-for-character identical to `## Artifact Output Path`. This marker MUST appear on its own line as the final line.

6. As your terminal tool action, call `subagent_done(message="TEST_RESULT_ARTIFACT: <absolute path>")`. The `message` argument MUST be byte-equal to the final-assistant-message marker line in step 5. No other structured markers anywhere in the response (no `STATUS:`, no other anchored lines).
```

(This adds a new step 6 — the previous numbered list ends at 5, so the additional step is appended.)

- [ ] **Step 4: Update test-runner.md `## Rules` and `## Output Contract`** — In `agent/agents/test-runner.md`:
  - In `## Rules` (currently lines 127-136), update the bullet "Your final assistant message MUST end with `TEST_RESULT_ARTIFACT: <absolute path>` and MUST contain no other structured markers (no `STATUS:`, no other anchored lines)." (currently line 136) to the following bullet body verbatim (use unescaped double quotes around the `subagent_done` `message` argument, no backslashes anywhere in the inserted text):

    ```
    Your final assistant message MUST end with `TEST_RESULT_ARTIFACT: <absolute path>`, AND your terminal tool action MUST be `subagent_done(message="TEST_RESULT_ARTIFACT: <absolute path>")` with a `message` argument byte-equal to the final-assistant-message marker line. No other structured markers anywhere in the response (no `STATUS:`, no other anchored lines).
    ```
  - In `## Output Contract` (currently lines 138-146), replace the section body so it instructs both channels — the final-assistant-message marker AND the `subagent_done(message=...)` terminal call, both byte-equal. Inserted markdown text uses unescaped double quotes around `subagent_done(message="TEST_RESULT_ARTIFACT: <absolute path>")` (no backslashes).

**Acceptance criteria:**

- `test-runner-prompt.md` `## Output` section instructs both channels.
  Verify: open `agent/skills/_shared/test-runner-prompt.md` and confirm the `## Output` section contains both the literal substring `TEST_RESULT_ARTIFACT: <absolute path>` (the final-message instruction) and the literal substring `subagent_done(message="TEST_RESULT_ARTIFACT:` (the dual-channel call).
- `test-runner.md` agent definition's `## Execution`, `## Rules`, and `## Output Contract` sections all reference the dual channel.
  Verify: open `agent/agents/test-runner.md` and confirm: (1) `## Execution` contains a step that mentions `subagent_done(message="TEST_RESULT_ARTIFACT:`; (2) `## Rules` contains a bullet mentioning the byte-equal `subagent_done(message=...)` requirement; (3) `## Output Contract` contains both `TEST_RESULT_ARTIFACT: <absolute path>` and `subagent_done(message="TEST_RESULT_ARTIFACT:` substrings.

**Model recommendation:** cheap

---

### Task 8: Remove `"inline"` from mux-probe override list and update tests

**Files:**
- Modify: `agent/skills/define-spec/scripts/detect-mux-backend.py`
- Modify: `agent/skills/define-spec/scripts/README.md`
- Modify: `agent/skills/define-spec/scripts/tests/test_detect_mux_backend.py`

**Steps:**
- [ ] **Step 1: Remove `"inline"` from `OVERRIDE_SUBSTRINGS`** — In `agent/skills/define-spec/scripts/detect-mux-backend.py`, in the `OVERRIDE_SUBSTRINGS` list (currently lines 40-47), delete the entry `"inline",` (currently line 46). The remaining five entries `"--no-subagent"`, `"without a subagent"`, `"without subagent"`, `"no subagent"`, `"skip subagent"` stay in the same order. The trailing comma on the last remaining entry is preserved (Python list literal tolerates either; keep current style of one entry per line with trailing commas).
- [ ] **Step 2: Update module docstring** — In the same file, the docstring's `--user-input override substrings` block (currently line 23-24) reads `--no-subagent, without a subagent, without subagent, no subagent, skip subagent, inline`. Change it to `--no-subagent, without a subagent, without subagent, no subagent, skip subagent` (drop the trailing `, inline`).
- [ ] **Step 3: Update argparse `--user-input` help text** — In the same file, the argparse `--user-input` argument's `help=` string (currently lines 117-122) ends with `, 'inline' (case-insensitive).`. Change it to `(case-insensitive).` (drop the trailing `, 'inline'`).
- [ ] **Step 4: Update detect-mux-backend.py docstring header** — Verify the top-of-file docstring (lines 1-25 area) lists the override substrings somewhere (it does, on line 23-24). The change from Step 2 covers this. No additional change.
- [ ] **Step 5: Update define-spec/scripts/README.md** — In `agent/skills/define-spec/scripts/README.md`, the `detect-mux-backend.py` bullet (currently line 9) shows an example slash command. Verify the example string is `python3 detect-mux-backend.py --user-input "/define-spec foo --no-subagent"` (using `--no-subagent`, NOT `inline`). If the example uses `inline` anywhere, change it to use `--no-subagent` or `no subagent`. (If the existing example already uses `--no-subagent`, no change is needed for this step — but verify and confirm.)
- [ ] **Step 6: Remove `test_user_input_override_inline` from tests** — In `agent/skills/define-spec/scripts/tests/test_detect_mux_backend.py`, delete the `test_user_input_override_inline` test method (currently lines 213-214). Preserve the surrounding methods (`test_user_input_override_skip_subagent`, `test_user_input_override_case_insensitive`).
- [ ] **Step 7: Add a no-false-positive test for `inline` word in user input** — Add a new test method to the `TestUserInputOverrides` class:

```python
def test_inline_word_does_not_false_positive(self):
    # Bare 'inline' in user-facing prompt text must NOT trigger the inline-override branch
    # when no actual override substring (--no-subagent / 'no subagent' / etc.) is present.
    result = run_script("--user-input=build a spec for inline editing of cells", env=clean_env())
    self.assertEqual(result.returncode, 0, result.stderr)
    self.assertEqual(result.stderr, "")
    data = json.loads(result.stdout)
    # With clean_env() (no mux env vars), Rule 8 fires → branch=inline, reason=no_mux_detected.
    # The key assertion is the REASON: no_mux_detected (NOT user_input_override_inline).
    self.assertEqual(data["branch"], "inline")
    self.assertIsNone(data["backend"])
    self.assertEqual(data["reason"], "no_mux_detected")
    self.assertEqual(data["status_message"], MSG_INLINE_NO_MUX)
```

Insert this test method inside the `TestUserInputOverrides` class, immediately after `test_user_input_override_case_insensitive`.

- [ ] **Step 8: Run mux-probe tests and confirm all pass** — From `agent/`, run `python3 -m unittest skills/define-spec/scripts/tests/test_detect_mux_backend.py -v`. Confirm exit code 0 and the new no-false-positive test passes.

**Acceptance criteria:**

- `detect-mux-backend.py` `OVERRIDE_SUBSTRINGS` no longer contains `"inline"`.
  Verify: run `grep -n "inline" agent/skills/define-spec/scripts/detect-mux-backend.py` and confirm the string `"inline"` does not appear inside the `OVERRIDE_SUBSTRINGS` list (the list literal between lines 40-47 area). Other occurrences elsewhere in the file (e.g., in argparse help describing the prior list) must also be cleaned up.
- The module docstring and argparse help text no longer list `inline` as an override.
  Verify: run `grep -n "'inline'" agent/skills/define-spec/scripts/detect-mux-backend.py` and confirm zero matches. Run `grep -n "', inline'" agent/skills/define-spec/scripts/detect-mux-backend.py` and confirm zero matches.
- An input like `"build a spec for inline editing of cells"` is no longer classified as an inline-override.
  Verify: from `agent/`, run `python3 skills/define-spec/scripts/detect-mux-backend.py --user-input "build a spec for inline editing of cells"` with a minimal env (e.g., `env -i PATH=/usr/bin:/bin python3 skills/define-spec/scripts/detect-mux-backend.py --user-input "build a spec for inline editing of cells"`); confirm the JSON output's `reason` field is `no_mux_detected` (not `user_input_override_inline`).
- The five remaining override substrings still trigger the inline-override branch.
  Verify: run `python3 -m unittest skills/define-spec/scripts/tests/test_detect_mux_backend.py.TestUserInputOverrides.test_user_input_override_no_subagent_dash_dash skills/define-spec/scripts/tests/test_detect_mux_backend.py.TestUserInputOverrides.test_user_input_override_without_a_subagent skills/define-spec/scripts/tests/test_detect_mux_backend.py.TestUserInputOverrides.test_user_input_override_without_subagent skills/define-spec/scripts/tests/test_detect_mux_backend.py.TestUserInputOverrides.test_user_input_override_no_subagent skills/define-spec/scripts/tests/test_detect_mux_backend.py.TestUserInputOverrides.test_user_input_override_skip_subagent` from `agent/` and confirm exit code 0.
- The full `test_detect_mux_backend.py` test suite passes.
  Verify: from `agent/`, run `python3 -m unittest skills/define-spec/scripts/tests/test_detect_mux_backend.py -v` and confirm exit code 0 with no `FAIL`/`ERROR` lines.

**Model recommendation:** cheap

---

### Task 9: Update top-level README.md marker references

**Files:**
- Modify: `README.md`

**Steps:**
- [ ] **Step 1: Update scout.md agent description in README** — In the top-level `README.md`, in the `### scout.md` agent description paragraph (currently line 255), replace the substring `Ends its turn with an anchored BRIEF_WRITTEN: <absolute path> line that the orchestrator validates byte-equal against the requested output path.` with `Ends its turn with an anchored BRIEF_ARTIFACT: <absolute path> line (and a matching subagent_done(message="BRIEF_ARTIFACT: <absolute path>") call) that the orchestrator validates byte-equal against the requested output path.`.
- [ ] **Step 2: Update spec-designer.md agent description in README** — In the same `README.md`, in the `### spec-designer.md` agent description paragraph (currently line 271), replace the substring `ends its turn with a SPEC_WRITTEN: <absolute path> line.` with `ends its turn with a SPEC_ARTIFACT: <absolute path> line and a matching subagent_done(message="SPEC_ARTIFACT: <absolute path>") call.`.
- [ ] **Step 3: Verify no remaining old-marker references in top-level README** — Run `grep -n "BRIEF_WRITTEN\|SPEC_WRITTEN" README.md` and confirm zero matches.

**Acceptance criteria:**

- `README.md` references the new marker names in the scout and spec-designer agent descriptions.
  Verify: run `grep -n "BRIEF_ARTIFACT" README.md` and `grep -n "SPEC_ARTIFACT" README.md` and confirm at least one match each in the `## Local subagents` / agent-description section.
- `README.md` no longer references the old marker names anywhere.
  Verify: run `grep -n "BRIEF_WRITTEN\|SPEC_WRITTEN" README.md` and confirm zero matches (no output).

**Model recommendation:** cheap

---

### Task 10: Add marker-emit contract regression test

**Files:**
- Create: `agent/skills/_shared/scripts/tests/test_marker_emit_contract.py`

**Steps:**
- [ ] **Step 1: Create the test file** — Create `agent/skills/_shared/scripts/tests/test_marker_emit_contract.py` with this exact body:

```python
"""Tests that every marker-emit prompt and agent definition references the new
_ARTIFACT marker family and instructs the dual-channel completion contract
(final assistant message line + subagent_done(message=...) terminal call).

These tests guard against regression of the rename + belt-and-suspenders
contract. Each prompt under test is read fresh from disk and asserted against
three rules:
  - contains the expected marker name (e.g., BRIEF_ARTIFACT)
  - contains a subagent_done(message="<MARKER>: ...") instruction
  - does NOT contain the old marker names (BRIEF_WRITTEN, SPEC_WRITTEN)

Tests assert string presence rather than dispatching real subagents — the
e2e contract is exercised by pi-interactive-subagent's integration tests."""
import os
import re
import unittest


REPO_ROOT = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..")
)


def read(rel_path):
    abs_path = os.path.join(REPO_ROOT, rel_path)
    with open(abs_path, "r", encoding="utf-8") as fh:
        return fh.read()


# Marker name → list of (relative_path, kind) tuples to assert against.
# kind is informational; it surfaces in failure messages when an assertion fails.
PROMPTS_BY_MARKER = {
    "BRIEF_ARTIFACT": [
        ("agent/skills/scout/scout-prompt.md", "prompt"),
        ("agent/agents/scout.md", "agent"),
    ],
    "SPEC_ARTIFACT": [
        ("agent/skills/define-spec/spec-design-procedure.md", "prompt"),
        ("agent/agents/spec-designer.md", "agent"),
    ],
    "PLAN_ARTIFACT": [
        ("agent/skills/generate-plan/generate-plan-prompt.md", "prompt"),
        ("agent/agents/planner.md", "agent"),
    ],
    "REVIEW_ARTIFACT": [
        ("agent/skills/requesting-code-review/review-code-prompt.md", "prompt"),
        ("agent/skills/generate-plan/review-plan-prompt.md", "prompt"),
        ("agent/agents/code-reviewer.md", "agent"),
        ("agent/agents/plan-reviewer.md", "agent"),
    ],
    "TEST_RESULT_ARTIFACT": [
        ("agent/skills/_shared/test-runner-prompt.md", "prompt"),
        ("agent/agents/test-runner.md", "agent"),
    ],
}

OLD_NAMES = ["BRIEF_WRITTEN", "SPEC_WRITTEN"]


class TestMarkerNameInPrompt(unittest.TestCase):
    def test_each_prompt_contains_its_marker_name(self):
        for marker, files in PROMPTS_BY_MARKER.items():
            for rel_path, kind in files:
                with self.subTest(marker=marker, file=rel_path, kind=kind):
                    body = read(rel_path)
                    self.assertIn(
                        marker, body,
                        msg=f"{rel_path} ({kind}) does not contain marker {marker}",
                    )


class TestSubagentDoneInstructionInPrompt(unittest.TestCase):
    def test_each_prompt_instructs_subagent_done_with_marker_message(self):
        # Match `subagent_done(message="<MARKER>: ...")` with optional surrounding
        # quotes/backticks/whitespace. Tolerate the marker being a literal value or
        # a placeholder (e.g., in the planner edit-mode note that mentions the
        # initial-generation marker name).
        for marker, files in PROMPTS_BY_MARKER.items():
            for rel_path, kind in files:
                with self.subTest(marker=marker, file=rel_path, kind=kind):
                    body = read(rel_path)
                    pattern = re.compile(
                        r"subagent_done\s*\(\s*message\s*=\s*[\"`]" + re.escape(marker) + r":",
                        re.MULTILINE,
                    )
                    self.assertRegex(
                        body, pattern,
                        msg=(
                            f"{rel_path} ({kind}) does not instruct "
                            f"subagent_done(message=\"{marker}: ...\")"
                        ),
                    )


class TestOldMarkerNamesAbsent(unittest.TestCase):
    def test_no_prompt_contains_old_marker_names(self):
        # Every file in the PROMPTS_BY_MARKER table must NOT mention the old names.
        all_files = []
        for files in PROMPTS_BY_MARKER.values():
            all_files.extend(files)
        for rel_path, kind in all_files:
            with self.subTest(file=rel_path, kind=kind):
                body = read(rel_path)
                for old in OLD_NAMES:
                    self.assertNotIn(
                        old, body,
                        msg=f"{rel_path} ({kind}) still contains old marker name {old}",
                    )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the new test file from `agent/`** — Run `python3 -m unittest skills/_shared/scripts/tests/test_marker_emit_contract.py -v`. Confirm exit code 0 and every assertion passes (this implicitly verifies that Tasks 2-7 completed correctly).

**Acceptance criteria:**

- The new test file exists and contains assertions for all five markers and all twelve prompt/agent files.
  Verify: open `agent/skills/_shared/scripts/tests/test_marker_emit_contract.py` and confirm: (1) the `PROMPTS_BY_MARKER` dictionary contains exactly five keys (`BRIEF_ARTIFACT`, `SPEC_ARTIFACT`, `PLAN_ARTIFACT`, `REVIEW_ARTIFACT`, `TEST_RESULT_ARTIFACT`); (2) the dictionary's values list at least one prompt and one agent file per marker; (3) the file defines exactly three `Test*` classes (`TestMarkerNameInPrompt`, `TestSubagentDoneInstructionInPrompt`, `TestOldMarkerNamesAbsent`).
- All tests in the new file pass against the post-Task-7 state of the repo.
  Verify: from `agent/`, run `python3 -m unittest skills/_shared/scripts/tests/test_marker_emit_contract.py -v` and confirm exit code 0 with no `FAIL`/`ERROR` lines.

**Model recommendation:** standard

---

### Task 11: Update spec-designer e2e test in pi-interactive-subagent

**Files:**
- Modify: `/Users/david/Code/pi-interactive-subagent/test/integration/orchestration-claude-pane-spec-designer-e2e.test.ts`

**Steps:**
- [ ] **Step 1: Replace `SPEC_WRITTEN` in the task prompt's `subagent_done` call** — In the e2e test file, in the `taskPrompt` template literal (currently line 83), replace `subagent_done with message="SPEC_WRITTEN: ${SPEC_PATH}"` with `subagent_done with message="SPEC_ARTIFACT: ${SPEC_PATH}"`. The surrounding text is unchanged.
- [ ] **Step 2: Replace `SPEC_WRITTEN:` regex assertion** — In the same file (currently line 111), replace `assert.match(r.finalMessage, /SPEC_WRITTEN:/);` with `assert.match(r.finalMessage, /SPEC_ARTIFACT:/);`.
- [ ] **Step 3: Replace `SPEC_WRITTEN` mentions in the assertion comment** — In the same file (currently line 106-108 area), the comment block reads `Parent-facing payload assertions (acceptance criteria). The parent workflow contract is SPEC_WRITTEN: <abs path> — assert both the prefix and the actual path are present in finalMessage so the test fails if the model omits the path or returns the placeholder.`. Update `SPEC_WRITTEN: <abs path>` to `SPEC_ARTIFACT: <abs path>` so the comment matches the assertion.
- [ ] **Step 4: Verify no remaining `SPEC_WRITTEN` references in the test file** — Run `grep -n "SPEC_WRITTEN" /Users/david/Code/pi-interactive-subagent/test/integration/orchestration-claude-pane-spec-designer-e2e.test.ts` and confirm zero matches.
- [ ] **Step 5: Add a new e2e test case for the relative-input absolute-marker rule** — In the same test file, immediately after the existing `test()` block (the one whose assertions were updated in Steps 1–3), append a second `test()` block named exactly `'spec-designer existing-spec-branch emits absolute SPEC_ARTIFACT marker for relative input path'`. The new test reuses the existing fixture-setup helpers (the same per-test working directory and Claude-pane dispatch scaffolding the first test uses) and:
  1. Computes the working directory the same way the existing test does (the constant or helper that produces `SPEC_PATH` for the existing test is the source — call it `WORKING_DIR`; if the existing test names it differently, reuse that name verbatim).
  2. Declares `const RELATIVE_SPEC_PATH = 'docs/specs/test-relative-input-fixture.md';`.
  3. Declares `const EXPECTED_ABS_PATH = path.resolve(WORKING_DIR, RELATIVE_SPEC_PATH);` (importing `path` at the top of the file if it is not already imported).
  4. Pre-creates the spec file at `EXPECTED_ABS_PATH` using `fs.mkdirSync(path.dirname(EXPECTED_ABS_PATH), { recursive: true })` followed by `fs.writeFileSync(EXPECTED_ABS_PATH, '# Test Spec\n\nFixture for relative-input absolute-marker e2e test.\n')`. Wrap the test body in a `try { ... } finally { fs.rmSync(EXPECTED_ABS_PATH, { force: true }); }` block so the fixture is cleaned up regardless of pass/fail.
  5. Builds a `taskPrompt` constant with this exact body (using a JS template literal so `${RELATIVE_SPEC_PATH}` interpolates):
     ```
     Open the existing spec at the relative path "${RELATIVE_SPEC_PATH}" (relative to your current working directory). Add a "## Notes" section to its end containing a single line "Updated by relative-input e2e test." Then emit your SPEC_ARTIFACT marker per the spec-design procedure (Step 9 / subagent branch), which mandates the marker line carries the absolute path of the written file even when the input path was relative. As your terminal tool action, call subagent_done with the SPEC_ARTIFACT marker line as the message argument.
     ```
  6. Dispatches the spec-designer subagent with this `taskPrompt` and `WORKING_DIR` as the working directory, using the same dispatch helper the first test uses.
  7. Asserts on the dispatch result `r`:
     - `assert.match(r.finalMessage, /SPEC_ARTIFACT: \/[^\n]*\/docs\/specs\/test-relative-input-fixture\.md\b/);` (anchored absolute-path marker matching the fixture filename).
     - `assert.ok(r.finalMessage.includes(\`SPEC_ARTIFACT: ${EXPECTED_ABS_PATH}\`), 'final message must contain marker with the absolute fixture path');`.
     - `assert.ok(!/SPEC_ARTIFACT: docs\/specs\//.test(r.finalMessage), 'final message must not contain a relative-path SPEC_ARTIFACT marker');`.

   Verify: from the sibling repo, run `cd /Users/david/Code/pi-interactive-subagent && npm test -- spec-designer-e2e` and confirm exit code 0 with both `test()` blocks reported as passing in the output.
- [ ] **Step 6: Add the new test case's identifier to the file's exported test list (if applicable)** — If the existing test file uses Node's built-in `node:test` `test(name, fn)` signature (it does, per the existing assertion-style imports), no additional registration step is required — the new `test()` block is auto-discovered by the test runner. Confirm by running the full suite `cd /Users/david/Code/pi-interactive-subagent && npm test` and verifying exit code 0 with the new test name appearing in the output.

**Acceptance criteria:**

- The e2e test's `taskPrompt` instructs the model to call `subagent_done(message="SPEC_ARTIFACT: ${SPEC_PATH}")`.
  Verify: open `/Users/david/Code/pi-interactive-subagent/test/integration/orchestration-claude-pane-spec-designer-e2e.test.ts` and confirm the (first) `taskPrompt` constant contains the literal substring `subagent_done with message="SPEC_ARTIFACT:`.
- The assertion against `r.finalMessage` checks for `SPEC_ARTIFACT:`.
  Verify: run `grep -n 'assert.match(r.finalMessage' /Users/david/Code/pi-interactive-subagent/test/integration/orchestration-claude-pane-spec-designer-e2e.test.ts` and confirm at least one matching line contains `SPEC_ARTIFACT` (not `SPEC_WRITTEN`).
- The test file no longer mentions the old marker name.
  Verify: run `grep -n "SPEC_WRITTEN" /Users/david/Code/pi-interactive-subagent/test/integration/orchestration-claude-pane-spec-designer-e2e.test.ts` and confirm zero matches.
- The test file contains a second `test()` block exercising the relative-input absolute-marker rule.
  Verify: run `grep -n "spec-designer existing-spec-branch emits absolute SPEC_ARTIFACT marker for relative input path" /Users/david/Code/pi-interactive-subagent/test/integration/orchestration-claude-pane-spec-designer-e2e.test.ts` and confirm at least one match. Open the file and confirm the new test body declares `RELATIVE_SPEC_PATH = 'docs/specs/test-relative-input-fixture.md'` and uses `path.resolve(...)` to compute `EXPECTED_ABS_PATH`.
- The new e2e test asserts both an absolute-path regex match and a relative-path negative match against `r.finalMessage`.
  Verify: open the test file and confirm the new `test()` body contains both `assert.match(r.finalMessage, /SPEC_ARTIFACT: \/[^\n]*\/docs\/specs\/test-relative-input-fixture\.md\b/)` (positive absolute-path assertion) and `assert.ok(!/SPEC_ARTIFACT: docs\/specs\//.test(r.finalMessage)` (negative relative-path assertion).
- Both `test()` blocks pass when the e2e suite runs.
  Verify: from the sibling repo, run `cd /Users/david/Code/pi-interactive-subagent && npm test -- spec-designer-e2e` and confirm exit code 0 with both test names in the runner output.

**Model recommendation:** standard

---

### Task 12: Final repo-wide grep verification + run all helper tests

**Files:**
- Test: (read-only) all files under `agent/`, `docs/` (excluding `docs/specs/`/`docs/todos/` history), `README.md`

**Steps:**
- [ ] **Step 1: Repo-wide grep for `BRIEF_WRITTEN`** — Run `grep -rn BRIEF_WRITTEN agent/ docs/plans/ docs/briefs/ README.md --exclude='*define-spec-and-artifact-handoff*' 2>/dev/null` and confirm zero matches. (Permitted: `docs/specs/2026-05-08-define-spec-and-artifact-handoff-fixes.md` and `docs/todos/2e1105f6.md` are spec/todo history that documents the rename; these may retain references and are NOT in scope for this verification. The `--exclude='*define-spec-and-artifact-handoff*'` flag also drops the current plan file under `docs/plans/` and the review artifact under `docs/plans/reviews/` from the search — both of those intentionally retain old-marker references for planning history.)
- [ ] **Step 2: Repo-wide grep for `SPEC_WRITTEN`** — Run `grep -rn SPEC_WRITTEN agent/ docs/plans/ docs/briefs/ README.md --exclude='*define-spec-and-artifact-handoff*' 2>/dev/null` and confirm zero matches. Same exclusion as Step 1.
- [ ] **Step 3: Repo-wide grep for the new marker family** — Run `grep -rn "BRIEF_ARTIFACT\|SPEC_ARTIFACT\|PLAN_ARTIFACT" agent/ README.md 2>/dev/null | wc -l` and confirm a non-zero count (the new names should appear in the renamed files and the new planner output instructions).
- [ ] **Step 4: Run all helper tests via `npm run test:helpers`** — From `agent/`, run `npm run test:helpers`. Confirm exit code 0 across all five helper-test directories: `_shared/scripts/tests`, `execute-plan/scripts/tests`, `refine-code/scripts/tests`, `refine-plan/scripts/tests`, `define-spec/scripts/tests`. The new `test_marker_emit_contract.py` test runs as part of `_shared/scripts/tests` discovery.
- [ ] **Step 5: Confirm no test output contains "FAIL" or "ERROR"** — Capture the full output of `npm run test:helpers` and confirm no occurrence of "FAIL" or "ERROR" lines (other than test-name strings that legitimately contain those substrings as method names).

**Acceptance criteria:**

- No `BRIEF_WRITTEN` reference remains in `agent/`, `docs/plans/` (excluding the current plan/review artifacts), `docs/briefs/`, or top-level `README.md`.
  Verify: run `grep -rn BRIEF_WRITTEN agent/ docs/plans/ docs/briefs/ README.md --exclude='*define-spec-and-artifact-handoff*' 2>/dev/null` and confirm zero output lines.
- No `SPEC_WRITTEN` reference remains in `agent/`, `docs/plans/` (excluding the current plan/review artifacts), `docs/briefs/`, or top-level `README.md`.
  Verify: run `grep -rn SPEC_WRITTEN agent/ docs/plans/ docs/briefs/ README.md --exclude='*define-spec-and-artifact-handoff*' 2>/dev/null` and confirm zero output lines.
- The new marker family (`BRIEF_ARTIFACT`, `SPEC_ARTIFACT`, `PLAN_ARTIFACT`) appears in the expected files.
  Verify: run `grep -rn "BRIEF_ARTIFACT" agent/skills/scout/ agent/agents/scout.md` and confirm at least one match per file. Run `grep -rn "SPEC_ARTIFACT" agent/skills/define-spec/ agent/agents/spec-designer.md` and confirm at least one match per file. Run `grep -rn "PLAN_ARTIFACT" agent/skills/generate-plan/ agent/agents/planner.md` and confirm at least one match per file.
- All helper test suites pass.
  Verify: from `agent/`, run `npm run test:helpers` and confirm exit code 0 (last line of output is the result of the last test command in the chain — exit 0 means every Python test directory under `&&` succeeded).

**Model recommendation:** standard

---

## Dependencies

- Task 1 has no dependencies (foundation: helper script + tests).
- Task 2 depends on: Task 1 (consumer call site in `scout/SKILL.md` references `--marker BRIEF_ARTIFACT`, which the helper must accept first).
- Task 3 depends on: Task 1 (consumer call site in `define-spec/SKILL.md` references `--marker SPEC_ARTIFACT`).
- Task 4 depends on: Task 1 (consumer call site in `generate-plan/SKILL.md` Step 3 references `--marker PLAN_ARTIFACT`).
- Task 5 depends on: nothing (no marker rename — only contract update).
- Task 6 depends on: nothing (no marker rename — only contract update).
- Task 7 depends on: nothing (no marker rename — only contract update).
- Task 8 depends on: nothing (independent mux-probe change).
- Task 9 depends on: Tasks 2 and 3 (README references must reflect the rename done in those tasks).
- Task 10 depends on: Tasks 2, 3, 4, 5, 6, 7 (the contract-regression test reads each updated prompt/agent file and asserts the new marker + dual-channel instruction; all six rename/contract-update tasks must complete first).
- Task 11 depends on: Task 3 (the new e2e test added in Task 11 Step 5 asserts the absolute-path-on-relative-input rule introduced in Task 3 Step 5; the test code can be written in parallel with Task 3, but Task 11's verify step only passes after Task 3's procedure-file changes are committed and the spec-designer subagent reads the updated procedure at runtime). The original marker rename in Task 11 Steps 1–4 also depends on the spec-designer prompt using `SPEC_ARTIFACT`, which Task 3 delivers.
- Task 12 depends on: Tasks 1-11 (final verification runs all tests and asserts the absence of old marker names everywhere).

Explicit dependency list:

- Task 2 depends on: Task 1
- Task 3 depends on: Task 1
- Task 4 depends on: Task 1
- Task 5 depends on: (none)
- Task 6 depends on: (none)
- Task 7 depends on: (none)
- Task 8 depends on: (none)
- Task 9 depends on: Task 2, Task 3
- Task 10 depends on: Task 2, Task 3, Task 4, Task 5, Task 6, Task 7
- Task 11 depends on: Task 3
- Task 12 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11

## Risk Assessment

- **Risk: Atomicity gap during the rename.** If a wave commits the helper rename (Task 1) without committing all marker-emit prompts and consumer call sites in the same wave, agent dispatches between commits could fail with "missing or invalid marker" errors. **Mitigation:** the dependency graph schedules Task 1 and all its dependent tasks (2, 3, 4) in a single wave (or sequenced commits in one branch) so the rename is committed atomically across helper, prompts, and consumers. Task 12's repo-wide grep verification catches any residual old-marker reference before merge.
- **Risk: pi-backed `subagent_done` extension does not accept a `message` argument.** The local pi-extension `subagent-done.ts` registers `subagent_done` with `parameters: Type.Object({})` (no params). When a pi-backed subagent calls `subagent_done(message="...")`, the message arg is dropped by the runtime. The transcript-fallback path then picks up the marker from the final assistant message — the contract is still robust. **Mitigation:** the transcript fallback in the watcher is the second channel of the belt-and-suspenders contract; the marker reaches the parent through whichever channel is populated. The integration test in pi-interactive-subagent already pins the safer pattern for Claude-backed subagents (the path that benefits most from the dual channel).
- **Risk: macOS path normalization edge cases in `--require-path-prefix`.** The new helper flag uses `os.path.realpath` on both the extracted path and the supplied prefix, then string-prefix-compares the results with a trailing-slash anchor. Edge cases include: macOS file-system case-insensitivity (`/Users/david/Code/pi-config/docs/Specs/foo.md` vs `/Users/david/Code/pi-config/docs/specs/foo.md` would not be equal byte-for-byte even though the FS resolves both to the same inode), symlinks under `<working-dir>/docs/specs/` that point outside the directory, and trailing slashes on the supplied prefix. **Mitigation:** the helper normalizes via `realpath` (resolves symlinks), strips trailing `/` from the prefix before re-adding exactly one for anchoring, and does NOT case-normalize (since macOS file paths preserve case even when the FS is case-insensitive — case-mismatched paths represent a real divergence the user should notice). The unit tests in Task 1 Steps 18-22 cover the supported cases; a future bug report against a missed edge case can extend the helper without touching consumers.
- **Risk: The `PROMPTS_BY_MARKER` table in `test_marker_emit_contract.py` could go stale if a new marker-emit prompt is added.** A future contributor adding a sixth marker-emit prompt would need to add it to the table. **Mitigation:** documented in the new test file's docstring — the table is the source of truth for which prompts/agents are guarded; any new marker-emit prompt MUST be added to the table. The test class names are obvious (`TestMarkerNameInPrompt`, etc.) so a contributor reading their failing assertion would naturally find the table.
- **Risk: The trim+lowercase normalization in `spec-design-procedure.md` Step 1 could over-match.** Trimming and lowercasing too aggressively could classify `bd750b75` (no `TODO-` prefix, just hex) or `/define-spec TODO-bd750b75` (slash-command leak with non-hex content) as todo branches. **Mitigation:** the spec is explicit that the regex still requires the `TODO-` prefix and rejects extraneous tokens. The procedure's Step 1 prose explicitly says "Inputs without a TODO- prefix and inputs containing other extraneous tokens (e.g., a leaked slash command) still fall through to the freeform branch." The trim/lowercase only normalizes the captured hex segment — the prefix and surrounding structure are unchanged.

## Test Command

```bash
cd agent && npm run test:helpers
```
