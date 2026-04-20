# Shorten execute-plan SKILL.md Without Changing Behavior

**Source:** TODO-bbe2c2ad
**Spec:** `.pi/specs/2026-04-19-execute-plan-skill-shortening-follow-up.md`

## Goal

Reduce `agent/skills/execute-plan/SKILL.md` from ~1000 lines to under 800 (targeting under 700) by (1) extracting the inline TDD block in Step 8 into a new sibling file, (2) extracting the canonical three-set integration regression model from Step 7 into a new sibling file, (3) unifying Step 11's and Step 15's near-duplicate debugger-first flows behind a single shared definition with an explicit parameter carve-out for the final-gate invocation, (4) removing self-referential meta-narration and repeated cross-reference boilerplate, (5) replacing Step 10.3's four-part enumerated verifier full-coverage check with a compact `S == {1..K}` + no-duplicate rule, and (6) replacing the precondition recitals at the top of Steps 10, 11, and 15 with short upstream-gate references. The change is a docs-structural refactor and must preserve the skill's observable protocol in effect — worker dispatch shape, gate ordering, retry-budget semantics, integration-test classification, and the user-facing report format.

## Architecture summary

`agent/skills/execute-plan/` contains the execute-plan orchestration skill:

- `SKILL.md` — the top-level orchestrator steps (Steps 0–15 plus 9.5 and 9.7 sub-gates).
- `execute-task-prompt.md` — the worker prompt template, with `{TASK_SPEC}`, `{CONTEXT}`, `{WORKING_DIR}`, and `{TDD_BLOCK}` placeholders. This file is NOT modified by this plan.
- `verify-task-prompt.md` — the verifier prompt template. Not modified.

After this plan, the same directory will also contain two new reference files:

- `tdd-block.md` — the TDD section that Step 8 inlines into `{TDD_BLOCK}` when TDD is enabled.
- `integration-regression-model.md` — the canonical definition of the three-set integration tracking model (`baseline_failures`, `deferred_integration_regressions`, `new_regressions_after_deferment`), the reconciliation algorithm, the pass/fail classification, and the user-facing three-section report format.

Both files are execute-plan-local — `generate-plan` and `refine-code` do NOT reference them.

## Tech stack

- Markdown (skill source). No runtime code is changed.
- Shell (bash) snippets embedded in the skill. Unchanged in content.
- Verification uses `grep`, `wc`, `diff`, and a small inline bash one-liner exercising the `{TDD_BLOCK}` substitution path.

## File Structure

- `agent/skills/execute-plan/SKILL.md` (Modify) — trim: replace inline TDD block with a two-sentence loader note; replace inline integration regression model with a reference; unify Step 11 and Step 15 debugger-first flows behind a single shared subsection with a parameter carve-out for the final-gate invocation; remove meta-narration ("single canonical definition", "Use it verbatim here; do not restate", "the control-flow path is always"); collapse Step 10.3's four-part list to `S == {1..K}` + no-duplicates; shorten precondition recitals at the top of Steps 10, 11, 15 to one-line upstream-gate references. Final size must be < 800 lines, targeting < 700.
- `agent/skills/execute-plan/tdd-block.md` (Create) — the exact TDD content currently inlined in Step 8, with no surrounding commentary or prefix. This file is substituted verbatim for `{TDD_BLOCK}` at dispatch time when TDD is enabled.
- `agent/skills/execute-plan/integration-regression-model.md` (Create) — the three tracked sets, disjointness/transition rules, reconciliation algorithm (steps 1–5), post-wave pass/fail classification, final-gate stricter pass condition note, and the user-facing summary format (fully-clean vs three-section block). The ONLY location in execute-plan where these definitions live after this plan.
- `agent/skills/execute-plan/execute-task-prompt.md` (Unchanged) — explicitly NOT modified. The worker template keeps its `{TDD_BLOCK}` placeholder; only the orchestrator-side source of the block moves.
- `agent/skills/generate-plan/SKILL.md`, `agent/skills/refine-code/SKILL.md` (Unchanged) — the extracted integration-regression-model file is execute-plan-local; sibling skills do not gain references to it.

## Tasks

### Task 1: Extract the Step 8 TDD block into `tdd-block.md`

**Files:**
- Create: `agent/skills/execute-plan/tdd-block.md`
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Locate the inline TDD block** — Open `agent/skills/execute-plan/SKILL.md` and read Step 8's "Assembling worker prompts" section. The inline TDD content currently spans from the line beginning `## Test-Driven Development` (the opening heading of the quoted block, at roughly line 419) through the last line of the `### Bug fixes` subsection (the line `Reproduce the bug with a failing test first. Only then fix. The test proves the fix and prevents regression. Never fix a bug without a test.`, at roughly line 477). These lines are currently indented by two spaces because they sit inside a nested bullet under `{TDD_BLOCK}`.
- [ ] **Step 2: Create `tdd-block.md` with the block's content de-indented** — Write `agent/skills/execute-plan/tdd-block.md` containing exactly the TDD content identified in Step 1, with the two-space indentation stripped from every line so the file starts with the literal line `## Test-Driven Development` at column 0 and the first subsection heading `### Red-Green-Refactor cycle` likewise at column 0. Do not include any preamble, no frontmatter, no trailing commentary — the entire file is the substituted block. The file MUST contain both the literal string `Iron Law` (in the bolded sentence near the top) and the literal string `Red-Green-Refactor` (as the subsection heading), because Task 1 Step 5's verification substitutes this file into `execute-task-prompt.md` and greps for both phrases.
- [ ] **Step 3: Replace the inline block in Step 8 of `SKILL.md`** — In Step 8 under "Assembling worker prompts", the bullet for `{TDD_BLOCK}` currently reads `{TDD_BLOCK}` — if TDD is enabled (Step 3 settings), fill with:` followed by the long inline TDD content, then `If TDD is disabled, fill {TDD_BLOCK} with an empty string.`. Replace that entire bullet (from the `- {TDD_BLOCK}` line through `If TDD is disabled, fill {TDD_BLOCK} with an empty string.`) with a single compact bullet:

  ```
  - `{TDD_BLOCK}` — if TDD is enabled (Step 3 settings), read `agent/skills/execute-plan/tdd-block.md` and substitute its full contents verbatim. If TDD is disabled, substitute the empty string.
  ```

  The path `agent/skills/execute-plan/tdd-block.md` must appear exactly once in SKILL.md after this edit (Task 4 will later check that no other references to the file name have been introduced elsewhere).
- [ ] **Step 4: Confirm `execute-task-prompt.md` is untouched** — Do not edit `agent/skills/execute-plan/execute-task-prompt.md`. Its `{TDD_BLOCK}` placeholder remains where it is; only the orchestrator's source for the block has moved.
- [ ] **Step 5: Sanity-check the substitution path locally** — Run this one-liner from the repo root and confirm it exits 0 and prints both tokens:
  ```bash
  TDD=$(cat agent/skills/execute-plan/tdd-block.md); \
  TEMPLATE=$(cat agent/skills/execute-plan/execute-task-prompt.md); \
  OUT="${TEMPLATE//\{TDD_BLOCK\}/$TDD}"; \
  echo "$OUT" | grep -q "Iron Law" && echo "$OUT" | grep -q "Red-Green-Refactor" && echo OK
  ```
  It must print `OK`.

**Acceptance criteria:**

- `agent/skills/execute-plan/tdd-block.md` exists and is non-empty.
  Verify: run `test -s agent/skills/execute-plan/tdd-block.md && echo OK` from the repo root and confirm it prints `OK` (exits 0).
- `agent/skills/execute-plan/tdd-block.md` contains the literal strings `Iron Law` and `Red-Green-Refactor`.
  Verify: run `grep -c "Iron Law" agent/skills/execute-plan/tdd-block.md` and confirm the count is `>= 1`, then run `grep -c "Red-Green-Refactor" agent/skills/execute-plan/tdd-block.md` and confirm the count is `>= 1`.
- The literal strings `Iron Law` and `Red-Green-Refactor` no longer appear in `agent/skills/execute-plan/SKILL.md`.
  Verify: run `grep -c "Iron Law\|Red-Green-Refactor" agent/skills/execute-plan/SKILL.md` and confirm the count is `0`.
- `agent/skills/execute-plan/SKILL.md` references `tdd-block.md` exactly once.
  Verify: run `grep -c "tdd-block.md" agent/skills/execute-plan/SKILL.md` and confirm the count is exactly `1`.
- The Step 8 substitution path still yields a prompt containing both `Iron Law` and `Red-Green-Refactor`.
  Verify: run the exact bash one-liner from Task 1 Step 5 above (with `TDD=$(cat agent/skills/execute-plan/tdd-block.md)`, `TEMPLATE=$(cat agent/skills/execute-plan/execute-task-prompt.md)`, substitution of `{TDD_BLOCK}`, and grep for both tokens) and confirm it prints `OK`.
- `agent/skills/execute-plan/execute-task-prompt.md` is unchanged by this task.
  Verify: run `git diff -- agent/skills/execute-plan/execute-task-prompt.md` and confirm the output is empty (no diff).

**Model recommendation:** standard

### Task 2: Extract the integration regression model into `integration-regression-model.md`

**Files:**
- Create: `agent/skills/execute-plan/integration-regression-model.md`
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Identify the canonical block to extract from Step 7** — In `agent/skills/execute-plan/SKILL.md`, locate Step 7's subsection titled `#### Integration regression model` (currently beginning at roughly line 305 with the heading `#### Integration regression model`). The block to extract runs from that `#### Integration regression model` heading through the end of Step 7's "User-facing summary format" content (roughly line 367, the line ending with `… (i.e. on new_regressions_after_deferment).`), just before `## Step 8: Execute waves`. This block includes: the three tracked sets definitions, the disjointness/transition rules, the reconciliation algorithm (steps 1–5), the post-wave pass/fail classification (including the Step 15 stricter-condition sentence), and the user-facing summary format (fully-clean suite vs three-section block).
- [ ] **Step 2: Write `integration-regression-model.md`** — Create `agent/skills/execute-plan/integration-regression-model.md` containing:
  1. A top-level heading: `# Integration regression model`.
  2. A one-sentence preamble: `Shared reference used by Step 7 (baseline), Step 11 (post-wave classification), and Step 15 (final regression gate) of execute-plan/SKILL.md.`
  3. Subsection `## The three tracked sets` with the three numbered definitions from Step 7 (baseline_failures, deferred_integration_regressions, new_regressions_after_deferment), plus the `current_failing` clarification paragraph.
  4. Subsection `## Disjointness and transition rules` with the four bullets from Step 7.
  5. Subsection `## Reconciliation algorithm` with the five numbered reconciliation steps from Step 7. The literal token sequence `deferred_integration_regressions := still_failing_deferred` must appear exactly once in this file (in step 4 of the algorithm).
  6. Subsection `## Pass/fail classification` with the post-wave pass/fail bullets AND the final-gate stricter-condition paragraph from Step 7 ("Step 15's final gate uses a stricter condition — it gates on the union `still_failing_deferred ∪ new_regressions_after_deferment` — but uses the same reconciliation algorithm and the same three-section report format defined here.").
  7. Subsection `## User-facing summary format` with the fully-clean suite format and the three-section block format, including the sentence using the literal token `three-section block` exactly once. Also ensure the literal token `Reconciliation algorithm` appears exactly once in this file (as the subsection heading from item 5).

  Every substantive sentence from the source block must be preserved; the goal is extraction, not rewriting. Do NOT inject any new meta-narration such as "this is the single canonical definition" — Task 4 will explicitly check that phrase is gone from SKILL.md, and it must not resurface here either.
- [ ] **Step 3: Replace the Step 7 subsection with a short reference** — Delete the entire `#### Integration regression model` block identified in Step 1 from `SKILL.md`. Immediately after Step 7's `#### Baseline recording` subsection's closing line, insert a new compact paragraph:

  ```
  #### Integration regression model

  See `agent/skills/execute-plan/integration-regression-model.md` for the three tracked sets (`baseline_failures`, `deferred_integration_regressions`, `new_regressions_after_deferment`), the reconciliation algorithm, the post-wave and final-gate pass/fail rules, and the user-facing report format. Step 11 and Step 15 reference the same file.
  ```

  The subsection heading `#### Integration regression model` remains so that existing narrative flow in Step 7 stays intact.
- [ ] **Step 4: Collapse Step 11's Classification section to a reference** — In Step 11, locate the `#### Classification` subsection (starting with `Apply the Integration regression model defined in Step 7 …`). Replace the two paragraphs of cross-reference boilerplate currently introducing that subsection (the paragraph beginning `Apply the Integration regression model defined in Step 7 …` through the paragraph ending `… Use it verbatim here; do not restate.`) with a single sentence:

  ```
  Apply the reconciliation algorithm from `agent/skills/execute-plan/integration-regression-model.md` to the just-completed integration run, then classify the result:
  ```

  Keep the subsequent `Pass`/`Fail` bullet pair and the `#### Menu` section as-is (they are wave-specific behavior, not duplicated model content). Keep the `### Debugger-first flow` subsection in place — it is Task 3's responsibility, not this task's.
- [ ] **Step 5: Collapse Step 15's gate-protocol references to the model** — In Step 15's `### Final integration regression gate (precondition)` subsection, locate the "Gate protocol" numbered list (currently steps 1–4, starting near line 893). In step 2 of the gate protocol, replace the paragraph beginning `Apply the Step 7 reconciliation algorithm …` through `… Step 11 classification would have surfaced. On this gate, …` with:

  ```
  **Apply the reconciliation algorithm** from `agent/skills/execute-plan/integration-regression-model.md` to the run output, computing `current_failing`, reconciling `deferred_integration_regressions`, and deriving `new_regressions_after_deferment` exactly as defined there. At this gate, a non-empty `new_regressions_after_deferment` typically means Step 14 review/remediation (or another post-final-wave change) introduced a fresh regression that no wave's integration menu had a chance to surface.
  ```

  Leave gate-protocol steps 1, 3, 4 intact for now (Task 6 handles the opening paragraph). Step 6 below handles the remaining report-format restatement.
- [ ] **Step 6: Replace Step 15's inline report-format restatement with a reference** — In Step 15's `### Final integration regression gate (precondition)` subsection, locate the report-format block that currently restates (in-line) the user-facing three-section summary format — the block that enumerates the `Fully-clean suite` formatting and the three-section block with headings `Baseline failures`, `Deferred integration regressions`, and `New regressions in this wave`. This may appear inside gate-protocol step 3 (or wherever Step 15 currently tells the orchestrator how to render the final-gate report) and is a direct near-duplicate of the `## User-facing summary format` section now living in `integration-regression-model.md`. Replace the entire inline restatement (from the sentence that introduces the report format through the last line of the three-section example) with a single sentence:

  ```
  Render the result using the `## User-facing summary format` defined in `agent/skills/execute-plan/integration-regression-model.md` (the fully-clean suite format when all three tracked sets are empty, or the three-section block with `Baseline failures`, `Deferred integration regressions`, and `New regressions in this wave` otherwise).
  ```

  After this edit, the literal section heading string `## User-facing summary format` must not appear inside `SKILL.md`, and the three section-label strings `Baseline failures`, `Deferred integration regressions`, and `New regressions in this wave` must not appear anywhere in `SKILL.md` except inside the single reference sentence above (where they survive as inline label mentions, not as rendered sub-section headings). If the reference sentence is structured as above, those three labels each appear at most once in `SKILL.md`. Do not delete gate-protocol steps 1, 3, or 4's non-report-format content (the re-run instruction, the pass-advance instruction, and the fail/remediation branch); only the report-format restatement is replaced.
- [ ] **Step 7: Verify all three references point at the new file** — After edits, confirm via `grep -n "integration-regression-model.md" agent/skills/execute-plan/SKILL.md` that the file is referenced in the Step 7 body, the Step 11 body, and the Step 15 body — i.e. at least three distinct line-number matches, and that those matches fall after the `## Step 7`, `## Step 11`, and `## Step 15` headings respectively.

**Acceptance criteria:**

- `agent/skills/execute-plan/integration-regression-model.md` exists and is non-empty.
  Verify: run `test -s agent/skills/execute-plan/integration-regression-model.md && echo OK` and confirm it prints `OK`.
- `agent/skills/execute-plan/SKILL.md` references `integration-regression-model.md` from within each of Steps 7, 11, and 15.
  Verify: run `grep -n "integration-regression-model.md" agent/skills/execute-plan/SKILL.md`, confirm at least three matches, and inspect the line numbers to confirm one match falls after the `## Step 7` heading but before `## Step 8`, one falls after `## Step 11` but before `## Step 12`, and one falls after `## Step 15` (there is no later numbered step header).
- The literal string `three-section block` appears exactly once in `integration-regression-model.md` and does not appear elsewhere in `agent/skills/execute-plan/SKILL.md`.
  Verify: run `grep -c "three-section block" agent/skills/execute-plan/integration-regression-model.md` and confirm the count is exactly `1`; run `grep -c "three-section block" agent/skills/execute-plan/SKILL.md` and confirm the count is exactly `0`.
- The literal string `Reconciliation algorithm` appears exactly once in `integration-regression-model.md` and does not appear elsewhere in `agent/skills/execute-plan/SKILL.md`.
  Verify: run `grep -c "Reconciliation algorithm" agent/skills/execute-plan/integration-regression-model.md` and confirm the count is exactly `1`; run `grep -c "Reconciliation algorithm" agent/skills/execute-plan/SKILL.md` and confirm the count is exactly `0`.
- The literal token sequence `deferred_integration_regressions := still_failing_deferred` appears exactly once in `integration-regression-model.md` and does not appear elsewhere in `agent/skills/execute-plan/SKILL.md`.
  Verify: run `grep -c "deferred_integration_regressions := still_failing_deferred" agent/skills/execute-plan/integration-regression-model.md` and confirm the count is exactly `1`; run `grep -c "deferred_integration_regressions := still_failing_deferred" agent/skills/execute-plan/SKILL.md` and confirm the count is exactly `0`.
- Sibling skills are not retrofitted to reference the new file.
  Verify: run `grep -l "integration-regression-model.md" agent/skills/generate-plan/SKILL.md agent/skills/refine-code/SKILL.md 2>&1` and confirm the command prints only "No such file" grep-style misses or empty output (no file path is listed as matching). Equivalently, `grep -c "integration-regression-model.md" agent/skills/generate-plan/SKILL.md` and `grep -c "integration-regression-model.md" agent/skills/refine-code/SKILL.md` must each return `0`.
- The user-facing three-section report format is defined only in `integration-regression-model.md` and no longer restated in `SKILL.md`.
  Verify: run `grep -c "## User-facing summary format" agent/skills/execute-plan/SKILL.md` and confirm the count is exactly `0`; run `grep -c "## User-facing summary format" agent/skills/execute-plan/integration-regression-model.md` and confirm the count is exactly `1`.
- The three section-label strings `Baseline failures`, `Deferred integration regressions`, and `New regressions in this wave` appear as rendered headings only in `integration-regression-model.md`, never as rendered sub-section headings in `SKILL.md`.
  Verify: run `grep -cE "^(#+)\s+Baseline failures$" agent/skills/execute-plan/SKILL.md`, `grep -cE "^(#+)\s+Deferred integration regressions$" agent/skills/execute-plan/SKILL.md`, and `grep -cE "^(#+)\s+New regressions in this wave$" agent/skills/execute-plan/SKILL.md` and confirm each count is `0`; run the same three regex counts against `agent/skills/execute-plan/integration-regression-model.md` and confirm each is `>= 1`.
- Step 15's final-gate subsection references the extracted report format rather than restating it inline.
  Verify: open `agent/skills/execute-plan/SKILL.md`, locate the `### Final integration regression gate (precondition)` subsection inside Step 15, and confirm it contains the literal string `integration-regression-model.md` and the literal string `User-facing summary format` on the same paragraph (the reference sentence inserted by Task 2 Step 6), and that the inline enumeration of the three-section block's sub-section headings has been removed.

**Model recommendation:** standard

### Task 3: Unify Step 11 and Step 15 debugger-first flows behind a single shared definition

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Re-read both current flows to identify the variant parameters** — Re-read Step 11's `### Debugger-first flow` subsection (currently at roughly lines 794–817 in the pre-Task-1/-2 file; line numbers will have shifted) and Step 15's `### Final-gate debugger-first flow` subsection (currently at roughly lines 928–957). The two flows differ on exactly five parameters:
  1. **Scope of failing tests** — Step 11: `new_regressions_after_deferment`. Step 15: `still_failing_deferred ∪ new_regressions_after_deferment`.
  2. **Range / changed-file universe** — Step 11: the single wave commit (`git show HEAD` for the just-committed wave). Step 15: the full plan range `BASE_SHA..HEAD_SHA` where `BASE_SHA = PRE_EXECUTION_SHA` and `HEAD_SHA = git rev-parse HEAD` at gate time (via `git diff --name-only BASE_SHA HEAD_SHA`).
  3. **Suspect task universe** — Step 11: tasks in the current wave whose modified files intersect the failing stack traces (fallback: every wave task). Step 15: any plan task whose declared `**Files:**` scope intersects `git diff --name-only BASE_SHA HEAD_SHA` (fallback: every plan task so intersecting).
  4. **Success condition (judged after re-run)** — Step 11: `new_regressions_after_deferment` is empty post-reconciliation. Step 15: BOTH `still_failing_deferred` and `new_regressions_after_deferment` are empty post-reconciliation (and the full Step 15 gate is re-entered from its own step 1).
  5. **Follow-up commit message template and undo fallback** — Step 11: `fix(plan): wave <N> regression — <short summary>`; `git reset HEAD~1` is offered as a last-resort fallback if targeted remediation also fails. Step 15: `fix(plan): final-gate regression — <short summary>`; commit-undo is NOT a tool of this flow (prior wave commits must remain as checkpoints).

  Record these five parameters explicitly — they are the carve-out the shared definition must preserve.
- [ ] **Step 2: Rewrite Step 11's `### Debugger-first flow` as the shared definition** — Replace Step 11's existing `### Debugger-first flow` subsection (and its 5 numbered sub-points) with a shared, parameterized version titled exactly `### Debugger-first flow` that:
  1. Opens with a one-sentence purpose: `Shared flow invoked from Step 11 (post-wave integration failure, menu option (a)) and from Step 15's final integration regression gate (menu option (a)). Callers supply the five parameters below.`
  2. Contains a `**Caller parameters**` labeled list naming the five variant parameters: `scope`, `range`, `suspect_universe`, `success_condition`, `commit_template_and_undo`. Do NOT inline the Step 11 or Step 15 specific values here — those live at each call site.
  3. Contains the generalized five numbered steps (Identify suspects, Dispatch a debugging pass, Handle the result, Do NOT blanket re-dispatch, Commit-undo fallback availability) phrased in terms of the caller parameters rather than wave-specific values. For step 3's "Handle the debugging pass result", preserve both the `STATUS: DONE` branch (commit using the caller's `commit_template`, re-run tests, re-check `success_condition`) and the `STATUS: DONE_WITH_CONCERNS` branch (targeted remediation, same re-check). For step 5 (commit-undo fallback), state that the fallback is available only when the caller's `commit_template_and_undo` parameter authorizes it, and that the fallback reverses the most recent wave commit via `git reset HEAD~1`.
  4. Contains a `**Parameter values by caller**` table or equivalent two-column block with one row per caller (Step 11 post-wave, Step 15 final-gate) listing the concrete values from Task 3 Step 1 for each of the five parameters. This is the explicit carve-out that preserves the Step 11 vs Step 15 distinctions rather than flattening them.
- [ ] **Step 3: Replace the Step 11 menu option (a) body with a call-through** — In Step 11's intermediate-wave menu and final-wave menu, the `(a) Debug failures` bullets currently each expand into a one-paragraph description ending with "Run the debugger-first flow described in …". Keep the one-line bullets, and ensure each one now reads (using the same name): `Run the Debugger-first flow (below) with the Step 11 post-wave parameter row.` Do not duplicate the parameter values inline; the shared parameter table from Step 2 is authoritative.
- [ ] **Step 4: Replace the Step 15 `### Final-gate debugger-first flow` subsection with a call-through** — Delete Step 15's entire `### Final-gate debugger-first flow` subsection (its heading, intro paragraph, and all 5 numbered sub-points). Replace it with a compact subsection titled `### Final-gate debugger-first flow — parameters` (or a similar heading that clearly names the caller-specific row) containing ONLY the two paragraphs necessary to bind the call site:
  1. A one-line pointer: `This invocation uses the shared Debugger-first flow defined in Step 11. See the **Parameter values by caller** table there for the Step 15 final-gate row.`
  2. A short note preserving the final-gate-specific reminders that are not captured by the five parameters: `The gate is re-entered from its own step 1 after a remediation attempt (re-run the suite, re-reconcile, recompute both tracked sets) so the success condition is checked against the full Step 15 gate rather than a single reconciliation pass. Commit-undo is not authorized at this caller.`

  After this edit, the literal heading `Final-gate debugger-first flow` must still appear exactly once in SKILL.md (as the replacement subsection heading above), but the pre-existing block it used to introduce must be gone.
- [ ] **Step 5: Confirm Step 15's menu still names the flow the same way** — Step 15's menu option (a) currently reads `Debug failures now — run the final-gate debugger-first flow (below) …`. Change it to `Debug failures now — run the Debugger-first flow (Step 11) against the plan-introduced regressions (deferred ∪ new); see the Step 15 final-gate parameter row.` so that Step 11 and Step 15 both refer to the flow by the identical name `Debugger-first flow`.
- [ ] **Step 6: Confirm the acceptance condition about duplicate section headers** — After the edits, `### Debugger-first flow` must appear as an H3 section heading in SKILL.md exactly once (the shared definition in Step 11). The H3 heading `### Final-gate debugger-first flow` must no longer exist (the replacement subsection from Step 4 is instead titled `### Final-gate debugger-first flow — parameters`, which is a distinct heading string).

**Acceptance criteria:**

- `agent/skills/execute-plan/SKILL.md` no longer contains both `### Debugger-first flow` and `### Final-gate debugger-first flow` as separate H3 section headers.
  Verify: run `grep -n "^### Debugger-first flow$" agent/skills/execute-plan/SKILL.md` and confirm the count is exactly `1`; run `grep -n "^### Final-gate debugger-first flow$" agent/skills/execute-plan/SKILL.md` and confirm the count is exactly `0` (the old H3 heading is fully gone; the replacement heading contains the trailing ` — parameters` text).
- Step 11 and Step 15 both name the shared flow with the same token `Debugger-first flow`.
  Verify: open `agent/skills/execute-plan/SKILL.md`, locate the `## Step 11` section body, and confirm its `(a) Debug failures` menu bullet contains the literal string `Debugger-first flow`; locate the `## Step 15` section body, and confirm its `(a) Debug failures now` menu bullet also contains the literal string `Debugger-first flow` pointing at the same shared definition in Step 11.
- The shared flow preserves the Step 11 vs Step 15 distinctions in scope, success condition, and commit-message/undo behavior rather than flattening them.
  Verify: open the `### Debugger-first flow` subsection in Step 11 and confirm it contains a **Parameter values by caller** block (or equivalent table) with at least two distinct rows — one for "Step 11 post-wave" and one for "Step 15 final-gate" — and that the two rows carry different values for (i) scope (`new_regressions_after_deferment` vs `still_failing_deferred ∪ new_regressions_after_deferment`), (ii) commit-message template (`wave <N> regression` vs `final-gate regression`), and (iii) commit-undo fallback availability (available vs not available).
- The five-step debugging body (identify suspects → dispatch → handle result → no blanket re-dispatch → commit-undo fallback) appears exactly once in SKILL.md.
  Verify: run `grep -c "Follow the \`systematic-debugging\` skill. Complete Phase 1" agent/skills/execute-plan/SKILL.md` and confirm the count is exactly `1` (the instruction sentence inside the shared flow's dispatch step — previously present in both Step 11 and Step 15).

**Model recommendation:** capable

### Task 4: Remove self-referential meta-narration and cross-reference boilerplate

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Inventory meta-narration occurrences** — Run `grep -n "single canonical definition" agent/skills/execute-plan/SKILL.md`, `grep -n "verbatim here; do not restate" agent/skills/execute-plan/SKILL.md`, and `grep -n "the control-flow path is always" agent/skills/execute-plan/SKILL.md`. Record every occurrence line by line. These phrases are all boilerplate introduced to re-establish that a subsection is authoritative — now redundant with the extracted `integration-regression-model.md` and the shared Debugger-first flow.
- [ ] **Step 2: Remove `single canonical definition` occurrences beyond the first** — For each occurrence, either delete the containing clause entirely if the surrounding sentence still reads correctly (preferred), or collapse the sentence to a short reference (e.g. replace "This subsection is the single canonical definition of the three-set integration tracking model, the reconciliation algorithm, and the user-facing summary format." with nothing, since the sibling reference to `integration-regression-model.md` already conveys the intent). Leave at most one occurrence of the literal phrase `single canonical definition` in SKILL.md — zero is preferred.
- [ ] **Step 3: Remove `verbatim here; do not restate` occurrences beyond the first** — Each occurrence currently follows a "reference the Step 7 canonical definition" sentence. Delete the trailing "Use it verbatim here; do not restate." clause entirely; the adjacent sentence already establishes that the extracted file is authoritative. Leave at most one occurrence of the literal phrase `verbatim here; do not restate` in SKILL.md.
- [ ] **Step 4: Remove `the control-flow path is always` occurrences beyond the first** — The current text in Step 9.5 §6 says "The control-flow path out of this gate is always `Step 9.5 -> Step 9.7 -> Step 10`; never advance directly from Step 9.5 to Step 10." Shorten the sentence to only the normative "never advance" half, or delete the redundant "is always" clause entirely and leave only the path assertion once. Leave at most one occurrence of the literal phrase `the control-flow path is always` in SKILL.md.
- [ ] **Step 5: Sweep for near-duplicates** — Also sweep for the sibling phrases "that subsection is the single canonical definition" and "reuse it verbatim here" that commonly travel with the above tokens; if you find them in a paragraph adjacent to a now-removed phrase, delete them too. Do not rewrite legitimate prose that happens to say "verbatim" once in a different context — only remove the canonical-definition/cross-reference boilerplate.
- [ ] **Step 6: Verify no spec content was accidentally dropped** — After the edits, re-read Steps 7, 11, 15, and the Step 9.5/9.7 gate sections for continuity. Each should still clearly state WHERE to find the canonical definitions (`integration-regression-model.md` for the integration model; Step 11 for the shared Debugger-first flow) — just without the self-referential meta-narration wrapper.

**Acceptance criteria:**

- The phrase `single canonical definition` appears at most once in `agent/skills/execute-plan/SKILL.md`.
  Verify: run `grep -c "single canonical definition" agent/skills/execute-plan/SKILL.md` and confirm the count is `<= 1`.
- The phrase `verbatim here; do not restate` appears at most once in `agent/skills/execute-plan/SKILL.md`.
  Verify: run `grep -c "verbatim here; do not restate" agent/skills/execute-plan/SKILL.md` and confirm the count is `<= 1`.
- The phrase `the control-flow path is always` appears at most once in `agent/skills/execute-plan/SKILL.md`.
  Verify: run `grep -c "the control-flow path is always" agent/skills/execute-plan/SKILL.md` and confirm the count is `<= 1`.
- No functional content was deleted — Steps 7, 11, and 15 still route cleanly to `integration-regression-model.md`.
  Verify: run `grep -c "integration-regression-model.md" agent/skills/execute-plan/SKILL.md` and confirm the count is `>= 3` (at least three references survive: one in Step 7, one in Step 11, one in Step 15). Additionally open the Step 9.5 §6 gate-exit paragraph and confirm the "never advance directly from Step 9.5 to Step 10" assertion is still present in some form.

**Model recommendation:** standard

### Task 5: Simplify Step 10.3's full-coverage verifier check

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Locate the enumerated list** — In `agent/skills/execute-plan/SKILL.md`, find Step 10.3's `**Full-coverage requirement.**` paragraph. It currently reads: `Parse the set of criterion numbers S := { N : the output contains a header "[Criterion N] <PASS|FAIL>" } and check all four conditions:` followed by an enumerated list of `1. **Count.** |S| == K — every criterion has a verdict block.`, `2. **Coverage.** S == {1..K} — no criterion number in 1..K is missing.`, `3. **Uniqueness.** No criterion number appears in two or more [Criterion N] headers (duplicates are a protocol error even if both duplicates agree on PASS/FAIL).`, `4. **Range.** No [Criterion N] header appears with N < 1 or N > K (out-of-range criterion numbers are a protocol error).`
- [ ] **Step 2: Replace the list with a compact assertion** — Replace the four enumerated items with two sentences:

  ```
  The verifier output MUST satisfy `S == {1..K}` — exactly one header per criterion number, no gaps and no out-of-range numbers. In addition, no criterion number may appear in two or more `[Criterion N]` headers; duplicates are a protocol error even when both duplicates agree on `PASS`/`FAIL`.
  ```

  Keep the surrounding sentences (the definition of `K`, the definition of `S`, and the following "Route the parsed result" paragraph) unchanged.
- [ ] **Step 3: Confirm the protocol-error routing paragraph is untouched** — The "**Protocol-error routing.**" paragraph immediately after the "Wave gate exit" block continues to enumerate the categories of malformed output (missing, extra, duplicate, out-of-range, `verdict:` prefix, lowercase verdict tokens, unparseable overall verdict line) and to route them as `VERDICT: FAIL` with concrete descriptions (including examples like "missing [Criterion 3]", "duplicate [Criterion 2]", "out-of-range [Criterion 5] when K=4"). Do NOT modify that paragraph; the simplified assertion above feeds into it unchanged.

**Acceptance criteria:**

- Step 10.3 no longer contains the four-part enumerated list with the labels `Count.`, `Coverage.`, `Uniqueness.`, and `Range.`.
  Verify: run `grep -cE "\\*\\*(Count|Coverage|Uniqueness|Range)\\.\\*\\*" agent/skills/execute-plan/SKILL.md` and confirm the count is `0`.
- Step 10.3 asserts `S == {1..K}` and a no-duplicate-criterion-numbers rule.
  Verify: run `grep -c "S == {1..K}" agent/skills/execute-plan/SKILL.md` and confirm the count is `>= 1`; then open Step 10.3 and confirm the paragraph that used to enumerate Count/Coverage/Uniqueness/Range now states, in prose, both `S == {1..K}` and a prohibition on duplicate `[Criterion N]` headers.
- The protocol-error routing behavior is preserved.
  Verify: open Step 10.3's "**Protocol-error routing.**" paragraph in `agent/skills/execute-plan/SKILL.md` and confirm it still enumerates the malformed-output categories (missing/extra/duplicate/out-of-range/`verdict:` prefix/lowercase tokens/unparseable overall line) and still states that malformed output is routed as `VERDICT: FAIL` with a concrete description for the retry.

**Model recommendation:** cheap

### Task 6: Replace the precondition recitals at the top of Steps 10, 11, and 15

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Trim Step 10's opening paragraph** — Step 10 currently opens with a long `**Precondition:**` paragraph restating the Step 9.5 BLOCKED rule, the Step 9.7 checkpoint rule, and the handling of `DONE_WITH_CONCERNS` tasks flowing in (roughly lines 642–642 post-Tasks-1/-2). Replace the entire first paragraph of Step 10 with a single short pointer:

  ```
  **Precondition:** Step 9.5 (BLOCKED) and Step 9.7 (DONE_WITH_CONCERNS) must have exited before Step 10 runs. If either gate is unresolved, return to that gate first; Step 10 is the next gate only after both have exited. Tasks exiting Step 9.7 with status `DONE_WITH_CONCERNS` flow into verification as-is — the verifier's per-criterion verdict is authoritative.
  ```

  This replaces the old ~5-line recital. Leave the subsequent `Verification for each task in the wave …` paragraph and the `**Protocol-error stop — missing Verify: recipes:**` paragraph in place unchanged.
- [ ] **Step 2: Trim Step 11's opening precondition paragraph** — Step 11 currently opens with a long `**Precondition:**` paragraph restating Step 9.5, Step 9.7, Step 10 `VERDICT: FAIL`, and the commit/integration-test withholding rule. Replace that paragraph with:

  ```
  **Precondition:** Step 9.5 and Step 9.7 must have exited and Step 10 must report `VERDICT: PASS` for every task in the wave. If any precondition is unmet, return to the responsible gate (Step 9.5 for BLOCKED, Step 9.7 for unresolved concerns, Step 12's retry loop for `VERDICT: FAIL`). Both the post-wave commit and the integration-test run are withheld until the wave completes successfully.
  ```

  Leave the following paragraph (`After wave verification (Step 10) completes successfully for a wave, perform the following steps in order.`) and the `### 1. Commit wave changes` subsection unchanged.
- [ ] **Step 3: Trim Step 15's opening precondition paragraphs in the final gate** — Step 15's `### Final integration regression gate (precondition)` subsection currently opens with a `**Skip if:**` paragraph followed by a multi-paragraph recital explaining why the gate runs and that the check is cheap. Keep the `**Skip if:**` paragraph intact (Integration tests disabled / no test command → skip). Replace the two recital paragraphs that follow it (beginning `**Always run otherwise.** …` and `Before moving the plan file, …`) with a single compact sentence:

  ```
  Otherwise, always run this gate: re-run the full integration suite and confirm no plan-introduced regression (deferred or freshly surfaced by Step 14 remediation) remains before moving the plan to done.
  ```

  Leave the `**Gate protocol:**` header and its numbered steps (1–4) untouched at this task — Task 2 Step 5 already trimmed step 2 of the gate protocol.
- [ ] **Step 4: Visual scan for collateral preconditions** — After Steps 1–3, re-read the new opening paragraphs of Steps 10, 11, 15 end-to-end and confirm each is at most three lines of rendered markdown. None should re-enumerate the full BLOCKED / Step 9.7 / verifier-fail rules; each should be a short pointer into the upstream gates. Do not touch Step 10.1/10.2/10.3, Step 11's `### 1. Commit wave changes`, Step 15's `### 1. Move plan to done`, or any later subsection — the scope is strictly the opening precondition paragraph of each step.

**Acceptance criteria:**

- Step 10's opening paragraph is a short upstream-gate pointer, not a full BLOCKED / Step 9.7 / verifier-fail recital.
  Verify: open `agent/skills/execute-plan/SKILL.md`, locate the `## Step 10: Verify wave output` heading, and confirm the first paragraph after the heading (up to the next blank line) is at most three rendered lines and does not restate both "If any task in the current wave still has a Step 9 status of BLOCKED" and the full "If the Step 9.7 checkpoint has not yet been presented and resolved" clause on that same paragraph; instead it references Step 9.5 and Step 9.7 by name only as the upstream gates.
- Step 11's opening paragraph is a short upstream-gate pointer, not a full BLOCKED / Step 9.7 / verifier-fail recital.
  Verify: open `agent/skills/execute-plan/SKILL.md`, locate the `## Step 11: Post-wave commit and integration tests` heading, and confirm the first paragraph after the heading is at most three rendered lines; it must still reference Step 9.5, Step 9.7, and Step 10 as preconditions, but must not restate the full "If any task in the current wave still has a Step 9 status of BLOCKED, do not commit and do not run integration tests" + "If Step 9.7 has not yet been resolved" + "If any task in the wave still carries VERDICT: FAIL" block.
- Step 15's opening paragraphs in the final gate subsection are compact.
  Verify: open `agent/skills/execute-plan/SKILL.md`, locate the `### Final integration regression gate (precondition)` heading inside Step 15, and confirm the `**Skip if:**` paragraph is intact and the paragraph(s) that follow it amount to at most two sentences (not the original three-paragraph recital about "Always run otherwise", "A final integration check is cheap", and "Before moving the plan file, closing the linked todo…"). The `**Gate protocol:**` header and its numbered steps 1–4 still follow.

**Model recommendation:** cheap

### Task 7: Final length + behavior-preservation check

**Files:**
- Modify: none (read-only verification; make small follow-up trims to SKILL.md only if it still exceeds 800 lines)
- Test: none (docs-structural — verification is structural grep/wc, not a live execute-plan run)

**Steps:**
- [ ] **Step 1: Measure the final SKILL.md length** — Run `wc -l agent/skills/execute-plan/SKILL.md` and record the line count. The count must be strictly less than 800. The target is strictly less than 700.
- [ ] **Step 2: If over 800, trim aggressively within the committed scope** — If `wc -l` reports 800 or more, do NOT expand scope beyond the six committed items. Instead, revisit Tasks 4, 5, and 6 for additional prose that can be shortened without changing protocol: (a) collapse any remaining multi-sentence "reminder" paragraphs that re-state rules already covered by the extracted files; (b) shrink any bullet-list items that restate a sibling section's rule; (c) unify phrasing where Steps 11 and 15 independently describe the "re-run the suite, reconcile, decide pass/fail" sequence. Do NOT alter any step's observable protocol. Re-run `wc -l` after each pass. Stop once the count is below 800 — ideally below 700.
- [ ] **Step 3: Re-run all prior tasks' grep-based acceptance checks in a single sweep** — For quick confirmation that no earlier guarantee regressed, run the following block and verify the reported counts. If any fails, diagnose and fix:
  ```bash
  echo "=== Task 1 ==="; grep -c "tdd-block.md" agent/skills/execute-plan/SKILL.md; grep -c "Iron Law\|Red-Green-Refactor" agent/skills/execute-plan/SKILL.md
  echo "=== Task 2 ==="; grep -c "integration-regression-model.md" agent/skills/execute-plan/SKILL.md; grep -c "three-section block" agent/skills/execute-plan/SKILL.md; grep -c "Reconciliation algorithm" agent/skills/execute-plan/SKILL.md; grep -c "deferred_integration_regressions := still_failing_deferred" agent/skills/execute-plan/SKILL.md
  echo "=== Task 3 ==="; grep -c "^### Debugger-first flow$" agent/skills/execute-plan/SKILL.md; grep -c "^### Final-gate debugger-first flow$" agent/skills/execute-plan/SKILL.md
  echo "=== Task 4 ==="; grep -c "single canonical definition" agent/skills/execute-plan/SKILL.md; grep -c "verbatim here; do not restate" agent/skills/execute-plan/SKILL.md; grep -c "the control-flow path is always" agent/skills/execute-plan/SKILL.md
  echo "=== Task 5 ==="; grep -cE "\\*\\*(Count|Coverage|Uniqueness|Range)\\.\\*\\*" agent/skills/execute-plan/SKILL.md; grep -c "S == {1..K}" agent/skills/execute-plan/SKILL.md
  ```
  Expected: Task 1 → `1` then `0`; Task 2 → `>=3` then `0` `0` `0`; Task 3 → `1` then `0`; Task 4 → each `<= 1`; Task 5 → `0` then `>=1`.
- [ ] **Step 4: Re-run the TDD substitution dry-read** — Run the Task 1 Step 5 bash one-liner end to end and confirm it prints `OK`. This is the formal behavior-preservation test for the TDD extraction.
- [ ] **Step 5: Read the three-section report format in the new file** — Open `agent/skills/execute-plan/integration-regression-model.md` and confirm the `## User-facing summary format` section contains both the `Fully-clean suite` and `Not fully clean` (three-section block) formats, with the exact heading strings `Baseline failures`, `Deferred integration regressions`, and `New regressions in this wave` present as sub-section headings in the three-section example. This protects the user-facing integration report format invariant called out in the spec's requirements.
- [ ] **Step 6: Confirm `execute-task-prompt.md` and sibling skills are untouched** — Run `git diff -- agent/skills/execute-plan/execute-task-prompt.md agent/skills/generate-plan/SKILL.md agent/skills/refine-code/SKILL.md` and confirm the output is empty.

**Acceptance criteria:**

- `agent/skills/execute-plan/SKILL.md` ends below 800 lines.
  Verify: run `wc -l agent/skills/execute-plan/SKILL.md` and confirm the reported line count is strictly less than `800`.
- The plan strongly targets below 700 lines for `agent/skills/execute-plan/SKILL.md`.
  Verify: run `wc -l agent/skills/execute-plan/SKILL.md` and confirm the reported line count is strictly less than `700`. If it is `>= 700` but `< 800`, record the actual count in the task output and note that the hard constraint (`< 800`) is met while the soft target (`< 700`) was not; do not fail verification for missing the soft target alone.
- The Step 8 `{TDD_BLOCK}` substitution still produces a prompt containing both `Iron Law` and `Red-Green-Refactor`.
  Verify: run the exact one-liner from Task 1 Step 5 (concatenates `TDD_BLOCK` from `tdd-block.md` into `execute-task-prompt.md` and greps for both tokens) and confirm it prints `OK`.
- The user-facing three-section report headings are preserved in `integration-regression-model.md`.
  Verify: run `grep -c "Baseline failures" agent/skills/execute-plan/integration-regression-model.md`, `grep -c "Deferred integration regressions" agent/skills/execute-plan/integration-regression-model.md`, and `grep -c "New regressions in this wave" agent/skills/execute-plan/integration-regression-model.md` and confirm each is `>= 1`.
- `execute-task-prompt.md`, `generate-plan/SKILL.md`, and `refine-code/SKILL.md` are unchanged by this plan.
  Verify: run `git diff -- agent/skills/execute-plan/execute-task-prompt.md agent/skills/generate-plan/SKILL.md agent/skills/refine-code/SKILL.md` and confirm the output is empty.

**Model recommendation:** standard

## Dependencies

- Task 1 depends on: (none — Wave 1)
- Task 2 depends on: (none — Wave 1)
- Task 3 depends on: Task 1, Task 2
- Task 4 depends on: Task 3
- Task 5 depends on: Task 4
- Task 6 depends on: Task 5
- Task 7 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6

Rationale: Tasks 1 and 2 operate on disjoint regions of `SKILL.md` (Step 8's `{TDD_BLOCK}` bullet vs Step 7's `Integration regression model` subsection, plus the Step 11 and Step 15 reference edits that Task 2 makes are in different step blocks) and each creates a distinct new file, so they are safely parallel in Wave 1. Task 3 rewrites Step 11 and Step 15 structurally and must come after Task 2's reference edits have landed so the debugger-flow edits don't collide. Task 4's meta-narration sweep must run after Task 3 because several of the target phrases sit in the same paragraphs Task 3 rewrites. Tasks 5 and 6 are local edits to non-overlapping regions and could theoretically run in parallel, but are serialized for merge-conflict safety since they both touch `SKILL.md`. Task 7 is the final length check and structural re-verification and must run last.

## Risk Assessment

- **Observable-protocol drift during extraction.** The Step 7 → `integration-regression-model.md` extraction is the highest-risk edit: Steps 11 and 15 rely on exact language like "new_regressions_after_deferment empty ⇒ pass" and on the three-section report headings. Mitigation: Task 2 copies content rather than rewrites it, and Task 7 re-reads the three-section format in the new file and re-confirms the Step 11/Step 15 menus still describe the same (a)/(b)/(c) paths. Plus, the `three-section block`, `Reconciliation algorithm`, and `deferred_integration_regressions := still_failing_deferred` exactness checks from the spec are explicit Task 2 acceptance criteria.
- **TDD block substitution producing a subtly different prompt.** If the extracted `tdd-block.md` drops leading whitespace differently from the original inlining (the original block was indented two spaces under a bullet), the assembled prompt could differ in leading indentation from before. Mitigation: Task 1 Step 2 strips the two-space indentation so the file is column-0 markdown, and Task 1 Step 5's dry-read substitutes the raw file contents and greps for both `Iron Law` and `Red-Green-Refactor`, which are the two spec-mandated invariant tokens. Any layout-only drift that preserves those tokens does not affect worker behavior because the worker reads the TDD block as a rendered prompt, not as a nested-bullet literal.
- **Debugger-flow unification flattening the final-gate distinctions.** Unifying Step 11 and Step 15 could accidentally erase the final-gate's stricter success condition (both sets must be empty) and its disallowed commit-undo. Mitigation: Task 3 Step 1 explicitly enumerates the five variant parameters before writing; Task 3 Step 2 requires an explicit per-caller parameter table; Task 3's acceptance criterion about "two distinct rows with different values" forces the table to preserve the distinction.
- **Soft target (<700 lines) being missed.** The hard constraint (<800) is the spec's must-have; <700 is a preferred outcome. Mitigation: Task 7 Step 2 authorizes additional trimming within the six committed items (no scope expansion) if the first-pass total lands at 780–799, and explicitly allows reporting the actual count when <800 but >=700 without failing the task.
- **Accidental modification of sibling skills.** The spec is explicit that `generate-plan` and `refine-code` must not gain references to the new file. Mitigation: Task 2 acceptance criteria and Task 7 Step 6 both check via `git diff` that these files are byte-identical to their pre-plan state.
- **Meta-narration cleanup removing a phrase still needed elsewhere.** The phrase "single canonical definition" appears in a few places, and removing them all could lose the signal that one subsection is authoritative. Mitigation: Task 4 allows at most one occurrence of each phrase (per spec acceptance criteria), not zero — so the phrase may remain in the single place where it still has informational value (e.g. Step 11's reference to the extracted integration model).

## Review Notes

_Added by plan reviewer — informational, not blocking._

### Warnings
- **Task 3**: Acceptance checks don’t verify all five preserved debugger-flow parameters
  - **What:** Task 3 Step 1 identifies five caller-specific differences that must survive unification: `scope`, `range`, `suspect_universe`, `success_condition`, and `commit_template_and_undo`. But the acceptance criteria only explicitly verify differences for scope, commit message template, and commit-undo availability. They do not verify that the shared table preserves the different `range`, `suspect_universe`, or `success_condition`.
  - **Why it matters:** The main behavioral risk in this refactor is flattening Step 15 into Step 11 semantics. A worker could satisfy the current checks while still accidentally using a wave-scoped range, the wrong suspect-task universe, or the wrong final-gate success condition.
  - **Recommendation:** Strengthen the existing Task 3 verification to also confirm distinct Step 11 vs Step 15 values for `range`, `suspect_universe`, and `success_condition` in the shared parameter table.

- **Task 6**: “Rendered lines” makes verification environment-dependent
  - **What:** Task 6’s acceptance criteria for Steps 10 and 11 require the first paragraph to be “at most three rendered lines,” and Step 15’s recital replacement is checked partly by paragraph/sentence compactness. “Rendered lines” depends on editor width and renderer behavior, not just source text.
  - **Why it matters:** This makes pass/fail less objective and harder for an agent to re-check consistently. Two reviewers could reach different results from the same markdown.
  - **Recommendation:** Replace “rendered lines” with source-stable checks: exact replacement paragraph text, max physical line count in source, and/or required/disallowed phrases.

- **Task 7**: The under-700 target is framed as acceptance despite being non-blocking
  - **What:** Task 7 includes “The plan strongly targets below 700 lines” as an acceptance criterion, but its `Verify:` text explicitly says not to fail if the file lands between 700 and 799.
  - **Why it matters:** That makes the criterion non-binary and weakens the final completion signal for the task.
  - **Recommendation:** Keep `< 800` as the hard acceptance criterion, and move `< 700` to a note, stretch goal, or reporting requirement rather than an acceptance criterion.
