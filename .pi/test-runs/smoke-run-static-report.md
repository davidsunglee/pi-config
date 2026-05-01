# Smoke-Run Static Substitute + Manual Operator Gate — 2026-04-30-execute-plan-caller-side-subagents

This report records two artefacts that together satisfy the spec's runtime smoke-run acceptance criterion: (1) static cross-file consistency checks performed automatically as part of plan execution (the runtime smoke run is infeasible inside `execute-plan`'s own task-execution context — the plan would have to dispatch itself), and (2) a manual operator smoke-run gate that an operator MUST complete before this plan is merged. Each of the four spec acceptance points (a), (b), (c), and (d) appears in BOTH the automated section AND the manual operator gate, so the static report establishes structural wiring while the operator gate confirms runtime behavior. The manual operator gate is a formal merge-blocking requirement, not a recommendation; static cross-file consistency checks alone are not sufficient to merge.

## (a) Step 7 baseline capture

**Check 1:** `grep -n -F 'baseline.log' agent/skills/execute-plan/SKILL.md`

```
262:Before executing the first wave, run the integration suite via the `test-runner` subagent (see the shared test-runner dispatch subsection below) with `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/baseline.log` (an absolute path under the plan's working directory) and `{PHASE_LABEL} = baseline`. The agent applies the same Step 7 identifier-extraction contract documented in `agent/agents/test-runner.md` so the failing-identifier set the orchestrator reads back is byte-equal to the legacy in-orchestrator extraction.
290:- Step 7 baseline capture: `.pi/test-runs/<plan-name>/baseline.log` → `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/baseline.log` (single file; written exactly once).
```

**Check 2:** `grep -n -F 'TEST_RESULT_ARTIFACT' agent/agents/test-runner.md`

```
3:description: Thin runner subagent that executes a test command from a supplied working directory, captures stdout/stderr/exit code, extracts failing-test identifiers per the Step 7 identifier-extraction contract, writes a structured artifact, and emits a TEST_RESULT_ARTIFACT marker. Stateless across calls; performs no reconciliation and no pass/fail classification.
12:You have no context from the parent session. You are responsible for: (1) running the supplied test command in the supplied working directory, (2) extracting failing-test identifiers per the identifier-extraction contract below, (3) writing the artifact to the supplied output path, and (4) emitting the `TEST_RESULT_ARTIFACT` marker as the last line of your final message. You are NOT responsible for: (a) reconciling results against any prior run, (b) classifying the run as pass or fail, (c) consulting `baseline_failures`, `deferred_integration_regressions`, or any other cross-wave state, or (d) debugging failures or editing source files.
39:5. Emit `TEST_RESULT_ARTIFACT: <absolute path>` as the LAST line of your final assistant message, where `<absolute path>` is character-for-character identical to `## Artifact Output Path`. This marker MUST appear on its own line as the final line. No other structured markers anywhere in the response.
93:- Your final assistant message MUST end with `TEST_RESULT_ARTIFACT: <absolute path>` and MUST contain no other structured markers (no `STATUS:`, no other anchored lines).
100:TEST_RESULT_ARTIFACT: <absolute path>
103:where `<absolute path>` is character-for-character identical to `## Artifact Output Path`. Conversational text before the marker is permitted. The orchestrator anchors on the LAST `^TEST_RESULT_ARTIFACT: (.+)$` line of `finalMessage`. No other structured markers may appear anywhere in the response.
```

**Check 3:** `grep -n -F '--- RAW RUN OUTPUT BELOW ---' agent/agents/test-runner.md`

```
73:--- RAW RUN OUTPUT BELOW ---
82:- The marker line `--- RAW RUN OUTPUT BELOW ---` separates the structured header from the raw run output, which is appended verbatim with no truncation.
```

**Check 4:** `grep -n -F 'identifier-extraction' agent/agents/test-runner.md`

```
3:description: Thin runner subagent that executes a test command from a supplied working directory, captures stdout/stderr/exit code, extracts failing-test identifiers per the Step 7 identifier-extraction contract, writes a structured artifact, and emits a TEST_RESULT_ARTIFACT marker. Stateless across calls; performs no reconciliation and no pass/fail classification.
12:You have no context from the parent session. You are responsible for: (1) running the supplied test command in the supplied working directory, (2) extracting failing-test identifiers per the identifier-extraction contract below, (3) writing the artifact to the supplied output path, and (4) emitting the `TEST_RESULT_ARTIFACT` marker as the last line of your final message. You are NOT responsible for: (a) reconciling results against any prior run, (b) classifying the run as pass or fail, (c) consulting `baseline_failures`, `deferred_integration_regressions`, or any other cross-wave state, or (d) debugging failures or editing source files.
35:3. Apply the identifier-extraction contract (inlined verbatim below) to the run-output stream to derive the set of failing-test identifiers.
43:The following rules are the same as the Step 7 identifier-extraction contract in the execute-plan skill. They are inlined here so this agent does not need to read the SKILL file at runtime.
```

Verdict: PASS

## (b) Step 11 verifier evidence blocks

**Check 1:** `grep -n -F '[Evidence for Criterion N]' agent/agents/verifier.md`

```
3:description: Two-phase per-task verification for execute-plan. Phase 1: executes command-style Verify: recipes byte-equal verbatim and emits [Evidence for Criterion N] blocks. Phase 2: judges PASS/FAIL per criterion using only Phase 1 evidence (for command recipes) or Verifier-Visible Files (for file/prose recipes). Recipe-verbatim discipline is prompt-encoded.
35:   [Evidence for Criterion N]
82:[Evidence for Criterion N]
```

**Check 2:** `grep -n -F '[Evidence for Criterion N]' agent/skills/execute-plan/verify-task-prompt.md`

```
15:The orchestrator has extracted every command-style `Verify:` recipe from the `## Acceptance Criteria` section above and listed them below, numbered to match the criterion index in that section. In Phase 1 of your dispatch you MUST execute each recipe BYTE-EQUAL VERBATIM from `## Working Directory` via `bash`, capture stdout + stderr + exit code (per the per-stream 200-line / 20 KB truncation rule documented in your agent definition), and emit one `[Evidence for Criterion N]` block per recipe under a top-level `## Phase 1 Evidence` heading in your response.
65:[Evidence for Criterion N]
```

**Check 3:** `grep -c -F '{PHASE_1_RECIPES}' agent/skills/execute-plan/verify-task-prompt.md`

```
1
```
(Count is exactly 1 — PASS)

**Check 4:** `grep -n -F '{PHASE_1_RECIPES}' agent/skills/execute-plan/SKILL.md`

```
487:- `{PHASE_1_RECIPES}` — the orchestrator-extracted, command-style `Verify:` recipes for this task, numbered to match the criterion index in `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`. Format each entry as `[Recipe for Criterion N] <recipe text>` on its own line. A criterion whose `Verify:` recipe is file-inspection or prose-inspection produces no entry — gaps in numbering are expected and correct. If the task has no command-style recipes, leave this section empty.
```
(Line 487 falls within `### Step 11.2: Dispatch the verifier` which begins at line 477 — PASS)

**Check 5:** `grep -n -F '[Criterion 1] <PASS | FAIL>' agent/skills/execute-plan/verify-task-prompt.md`

```
79:[Criterion 1] <PASS | FAIL>
```

Verdict: PASS

## (c) Step 12.2 post-wave integration

**Check 1:** `grep -n -F 'wave-<N>-attempt-<K>.log' agent/skills/execute-plan/SKILL.md`

```
291:- Step 12.2 post-wave + Step 12 Debugger-first re-test: `.pi/test-runs/<plan-name>/wave-<N>-attempt-<K>.log` → `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/wave-<N>-attempt-<K>.log`, where `<K>` increments on every re-entry within wave `<N>`.
555:Run the integration suite via the `test-runner` subagent (see Step 7's shared test-runner dispatch subsection) with `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/wave-<N>-attempt-<K>.log` (an absolute path under the plan's working directory, where `<N>` is the current wave number and `<K>` is a 1-based attempt counter for this wave, starting at 1 and incremented on each Step 12 Debugger-first re-test) and `{PHASE_LABEL} = wave-<N>-attempt-<K>`. After artifact readback, read the failing-identifier set and `EXIT_CODE` from the artifact and pass them as `current_failing` into the integration regression model from `integration-regression-model.md`. Apply the reconciliation algorithm; pass if `new_regressions_after_deferment` is empty, fail if non-empty.
```

**Check 2:** `grep -n -F 'integration-regression-model.md' agent/skills/execute-plan/SKILL.md`

```
281:See [`integration-regression-model.md`](integration-regression-model.md) for the definition of the three tracked sets (`baseline_failures`, `deferred_integration_regressions`, `new_regressions_after_deferment`), the disjointness and transition rules, the reconciliation algorithm, the pass/fail classification, and the user-facing summary format.
555:Run the integration suite via the `test-runner` subagent (see Step 7's shared test-runner dispatch subsection) with `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/wave-<N>-attempt-<K>.log` (an absolute path under the plan's working directory, where `<N>` is the current wave number and `<K>` is a 1-based attempt counter for this wave, starting at 1 and incremented on each Step 12 Debugger-first re-test) and `{PHASE_LABEL} = wave-<N>-attempt-<K>`. After artifact readback, read the failing-identifier set and `EXIT_CODE` from the artifact and pass them as `current_failing` into the integration regression model from `integration-regression-model.md`. Apply the reconciliation algorithm; pass if `new_regressions_after_deferment` is empty, fail if non-empty.
689:2. **Apply the reconciliation algorithm** from [`integration-regression-model.md`](integration-regression-model.md) to compute `current_failing`, reconcile `deferred_integration_regressions`, and derive `new_regressions_after_deferment`.
695:   Use the three-section format defined in the [User-facing summary format](integration-regression-model.md#user-facing-summary-format) section of `integration-regression-model.md` with the header `⚠️ Final completion blocked: plan-introduced integration regressions remain.` and a trailing note `These regressions were introduced by this plan. They must be resolved before the plan can be marked complete.` followed by this menu:
```
(Line 555 falls within `## Step 12: Post-wave commit and integration tests` which begins at line 528 — PASS)

**Check 3:** `grep -c -F 'TEST_OUTPUT=$(<test_command>' agent/skills/execute-plan/SKILL.md`

```
0
```
(Count is 0 — PASS: legacy in-caller test execution pattern is absent)

Verdict: PASS

## (d) Step 16 cleanup-vs-preservation

**Check 1:** `grep -n -F 'rm -rf .pi/test-runs/<plan-name>' agent/skills/execute-plan/SKILL.md`

```
716:- Delete the per-plan `.pi/test-runs/<plan-name>/` directory now that the final integration regression gate has passed: `rm -rf .pi/test-runs/<plan-name>`. This cleanup runs ONLY on successful gate exit (i.e. when this `### 1. Move plan to done` sub-step executes). Every `(c) Stop execution` exit path — Step 10's wave gate, Step 12's intermediate-wave or final-wave menu, Step 13's failure-handling prompt, Step 15's review max-iterations menu, and Step 16's final-gate menu — leaves `.pi/test-runs/<plan-name>/` in place so the user can inspect run artifacts after stop.
```
(Line 716 falls within `### 1. Move plan to done` which begins at line 711 — PASS)

**Check 2:** `grep -c -F '.pi/test-runs/<plan-name>/ directory is preserved' agent/skills/execute-plan/SKILL.md`

```
7
```
(Count is 7 — at least seven matches — PASS)

Verdict: PASS

## Overall Verdict (Automated Static Section)

OVERALL_STATIC: PASS

This static-section verdict is necessary but NOT sufficient — the manual operator smoke-run gate below must also report PASS before this plan is merged.

## Manual Operator Smoke-Run Gate

**Status: REQUIRED before merging this plan.** The automated static section above confirms structural wiring across files but cannot validate runtime subagent dispatch, artifact readback, reconciliation arithmetic, menu flow, or cleanup behavior during `execute-plan` execution. An operator MUST perform a runtime smoke run of `execute-plan` against an unrelated existing plan and record the four sub-criterion results plus the overall gate verdict in this section before the changes from this plan branch are merged.

### Operator instructions

1. Pick an existing plan in `.pi/plans/` that is unrelated to this branch's changes — ideally one that has at least one wave, at least one command-style `Verify:` recipe, and an integration test command.
2. From a clean checkout that has this branch applied (or merged), run `execute-plan` against the chosen plan and let it run end-to-end. Do NOT halt early on the first invocation.
3. While it runs, observe and record evidence of behaviors (a)–(d) below.
4. Run a SECOND invocation against the same plan (or a different one) and stop it via `(c) Stop execution` from any of the seven stop-exit paths so behavior (d)'s preservation half can be observed.
5. Fill in each operator verdict and evidence line below, then fill in the gate metadata block at the end.

### Operator-recorded sub-criteria

- **(a) Step 7 baseline capture artifact + byte-equal identifier readback.** Confirm the baseline artifact exists at `<absolute working-dir>/.pi/test-runs/<chosen-plan>/baseline.log`, the artifact has the structured header documented in `agent/agents/test-runner.md` (PHASE/COMMAND/WORKING_DIRECTORY/EXIT_CODE/TIMESTAMP/FAILING_IDENTIFIERS_COUNT/FAILING_IDENTIFIERS:/END_FAILING_IDENTIFIERS, then `--- RAW RUN OUTPUT BELOW ---`), and the failing-identifier set the orchestrator reads back from `FAILING_IDENTIFIERS:` is byte-equal to what the legacy in-caller extraction would have produced for the same run output (sample-spot-check at minimum 2 identifiers).
  Operator verdict: <PASS|FAIL>
  Evidence: <observed artifact path; identifier-set summary or sample; any deltas from legacy extraction>
- **(b) Step 11 verifier `[Evidence for Criterion N]` blocks parse cleanly.** Confirm at least one wave's verifier dispatches return `## Phase 1 Evidence` blocks containing `[Evidence for Criterion N]` entries with `command:`, `exit_code:`, `stdout:`, `stderr:` fields in that order; the per-stream 200-line / 20 KB truncation rule is honored where streams are large; SKILL.md Step 11.3's parser accepts the verdict output without raising any of the three protocol-error reasons (`verifier phase-1 evidence block malformed at criterion N`, `verifier missing evidence block for command-style criterion N`, `verifier ran command not matching any phase-1 recipe`).
  Operator verdict: <PASS|FAIL>
  Evidence: <wave/task observed; evidence-block excerpt or summary; any parser errors or protocol-error reasons surfaced>
- **(c) Step 12.2 post-wave artifact + three-section summary + menus.** Confirm each wave produces a `wave-<N>-attempt-<K>.log` artifact under `.pi/test-runs/<chosen-plan>/`; the orchestrator reads back the failing-identifier set; the integration regression model's three-section user-facing summary renders unchanged from the legacy format; the intermediate-wave menu and final-wave menu (Step 12.2) appear at the right times.
  Operator verdict: <PASS|FAIL>
  Evidence: <artifact paths observed; summary rendering excerpt; menu prompts shown; any deviations>
- **(d) Step 16 cleanup on success / preservation on `(c) Stop execution`.** From the FIRST invocation that ran end-to-end, confirm `.pi/test-runs/<chosen-plan>/` was removed by the Step 16 `### 1. Move plan to done` cleanup. From the SECOND invocation that was halted via `(c)/(x) Stop execution`, confirm `.pi/test-runs/<chosen-plan>/` remains on disk after stop. Both halves MUST be confirmed.
  Operator verdict: <PASS|FAIL>
  Evidence: <directory state observed before/after each invocation; which stop-exit path was used>

### Operator gate metadata

- Operator: <name>
- Date: <YYYY-MM-DD>
- Plan tested: <chosen plan filename>
- Working directory: <absolute path>
- Branch / commit: <branch name + short SHA>
- Manual gate verdict: <PASS|FAIL>

Write `OVERALL_MANUAL: PASS` on its own line if all four operator sub-criterion verdicts are PASS; otherwise write `OVERALL_MANUAL: FAIL` followed by a one-line list naming the failing operator sub-criteria (e.g., `Failed operator sub-criteria: (b), (d)`). The plan branch is merge-eligible only when both `OVERALL_STATIC: PASS` and `OVERALL_MANUAL: PASS` are present in this report.

OVERALL_MANUAL: <PASS|FAIL>
