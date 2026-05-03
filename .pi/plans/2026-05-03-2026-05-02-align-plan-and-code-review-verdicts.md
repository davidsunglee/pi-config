# Align plan-review and code-review verdicts — implementation plan

**Source:** TODO-01bb6a2b
**Spec:** `.pi/specs/2026-05-02-align-plan-and-code-review-verdicts.md`

## Goal

Unify the verdict vocabulary, output structure, and approval semantics produced by the plan-review and code-review pipelines. Replace the two divergent pairs of outputs with one shared severity vocabulary (Critical / Important / Minor), one shared three-way reviewer outcome (`Approved` / `Approved with concerns` / `Not approved`), one shared four-status refiner enum (`approved` / `approved_with_concerns` / `not_approved_within_budget` / `failed`), one shared reviewer body shape (`### Outcome` → `### Strengths` → `### Issues` (severity-grouped) → `### Recommendations`), one shared blocking rule (Critical always blocks; Important is the reviewer's judgment call), and one shared four-category failure-mode taxonomy. Preserve domain-specific adornments (Task N vs file:line locators; the plan-side `## Review Notes` append now gated on `approved_with_concerns` only).

## Architecture summary

The verdict surface lives entirely in markdown contracts. There is no TypeScript code or test path that parses verdict text — the executor confirmed this against `agent/extensions/`. The change is therefore a coordinated edit across roughly 17 markdown files clustered into three layers:

1. **Reviewer prompt templates** (`review-plan-prompt.md`, `review-code-prompt.md`) define what each reviewer emits — the canonical reviewer body shape lives here.
2. **Refiner prompt templates and orchestrator skills** (`refine-plan-prompt.md`, `refine-code-prompt.md`, `refine-plan/SKILL.md`, `refine-code/SKILL.md`) parse reviewer outputs, drive the iteration loop, emit the four-status refiner enum, and surface failure-mode reasons.
3. **Agent role definitions, READMEs, the cross-callers (`requesting-code-review`, `execute-plan`), and the re-review block** restate the contract and act on the refiner status enum.

Tasks are sequenced so the reviewer prompt edits land before the refiner prompts that parse them, and the orchestrator skill edits land before the cross-callers (READMEs, `execute-plan`) that consume the refiner status enum.

## Tech stack

- Markdown contracts under `agent/skills/**`, `agent/agents/**`, and the top-level `README.md`
- No code, build, or TypeScript test changes — verification is via grep/file inspection per task plus a final manual smoke-run task

## File Structure

- `agent/skills/generate-plan/review-plan-prompt.md` (Modify) — Rewrite the `## Output Format` section to emit `### Outcome` / `### Strengths` / `### Issues` (with H4 severity sub-headings) / `### Recommendations`. Add re-review-compatibility instruction (disregard pre-existing `## Review Notes`). Move the structural-only label from a Summary paragraph (which no longer exists) to inside the Outcome reasoning paragraph. Update severity guide to Critical / Important / Minor. Update Critical Rules to say "Outcome" not "Approved or Issues Found".
- `agent/skills/requesting-code-review/review-code-prompt.md` (Modify) — Rewrite the `## Output Format` section: replace the `### Assessment` block with a top-of-body `### Outcome` block; restructure `### Issues` into uniform per-finding template (bold lead `**file:line: <short description>**` + bulleted What / Why it matters / Recommendation); render empty severity sub-sections as `_None._`. Update the example to match. Update Critical Rules' verdict line. Update the Output Artifact Contract's Step 1 wording to "Strengths, Issues by severity, Recommendations" (drop "Assessment with the Ready to merge verdict").
- `agent/skills/refine-plan/refine-plan-prompt.md` (Modify) — Replace `**[Approved]** | **[Issues Found]**` parsing with `**Outcome:**` line parsing for the three new labels. Replace Error / Warning / Suggestion counting with Critical / Important / Minor counting. Update the iteration-step branching to act on outcome label, not Errors-count. Replace the `Review Notes Append Format` block with the new Important-only pointer-style format gated on `approved_with_concerns`. Update the planner edit-pass `{REVIEW_FINDINGS}` source to use Critical + Important findings (not "Error-severity" findings). Update the Output Format status enum to the four-value enum. Rewrite the `## Failure Modes` section to use the four-category taxonomy (consolidate dispatch-failure rows under `worker dispatch failed: <which worker>`; relabel reviewer-handoff rows under `reviewer artifact handoff failed: <specific check>`; relabel plan-file rows under `input artifact missing or empty: <which>`). Update every inline failure-emit site to match.
- `agent/skills/refine-code/refine-code-prompt.md` (Modify) — Replace `"Ready to merge: Yes" with no Critical/Important issues` verdict assessment with parsing of the `**Outcome:**` line. Update Final Verification "If clean" branching to act on outcome label. Update the Output Format status enum to the four-value enum. Add an `approved_with_concerns` exit path (treats it the same as `approved` — no further hybrid re-review iteration; the refiner exits on the success path). Rewrite the `## Failure Modes` section to use the four-category taxonomy with the same canonical reason templates as the plan side. Update every inline failure-emit site to match.
- `agent/skills/refine-plan/SKILL.md` (Modify) — Update Step 7.5 structural-only note text from "label its verdict … in its Summary section" to "label its verdict … inside its Outcome reasoning paragraph". Update Step 9 status enum from `approved | issues_remaining | failed` to `approved | approved_with_concerns | not_approved_within_budget | failed`. Update Step 9.5 to skip on `failed` only and validate on the three success-path statuses. Update Step 10 handlers: keep `STATUS: approved` (no behavior change to commit gate), add `STATUS: approved_with_concerns` (commit gate runs as on `approved`, summary surfaces the waived Important count), rename `STATUS: issues_remaining` heading and body to `STATUS: not_approved_within_budget` (budget-exhaustion menu unchanged). Update Step 11 output format to use the four-value enum.
- `agent/skills/refine-code/SKILL.md` (Modify) — Update Step 5 to recognize `approved | approved_with_concerns | not_approved_within_budget | failed`; rename "STATUS: clean" handler to "STATUS: approved", add an `approved_with_concerns` handler (same caller-facing report as `approved`, with a note about waived Importants), rename the `max_iterations_reached` handler to `not_approved_within_budget` (menu unchanged). Update Step 6 model-tier validation rules: `approved` and `approved_with_concerns` validate against `crossProvider.capable` only (final-verification pass); `not_approved_within_budget` validates against `crossProvider.capable` OR `standard` (existing two-tier acceptance). Update Step 6's "Do NOT silently report" sentence to list the three success-path statuses. Update the "When all paths pass validation" closing paragraph to describe the three success-path outcomes.
- `agent/agents/plan-reviewer.md` (Modify) — Update the Principles bullet "Give a clear verdict — always conclude with `[Approved]` or `[Issues Found]`" to reference the three new outcome labels and the `### Outcome` section. Update the Output Artifact Contract Step 2's body description from "Status verdict, Issues, Summary" to "Outcome, Strengths, Issues, Recommendations".
- `agent/agents/code-reviewer.md` (Modify) — Update the Principles bullet "Give a clear verdict — always include a 'Ready to merge: Yes/No/With fixes' line in the Assessment section" to reference the three new outcome labels and the `### Outcome` section. Update the Output Artifact Contract Step 2's body description from "Strengths, Issues, Recommendations, Assessment" to "Outcome, Strengths, Issues, Recommendations".
- `agent/agents/plan-refiner.md` (Modify) — No verdict-vocabulary references in current text, but the role bullet 5 says "Append warnings/suggestions to the plan as `## Review Notes` only on the approved path". Update to "Append the waived-Important pointer block to the plan as `## Review Notes` only on the `approved_with_concerns` path". Update bullet 3 reference to "Status line" to "Outcome line".
- `agent/agents/code-refiner.md` (Modify) — No standing verdict-vocabulary references requiring change beyond consistency. Audit the body to confirm no stale language; if any "Critical/Important issues" wording references the verdict (e.g. via "Do NOT ignore Critical or Important findings"), keep as-is — these are severity references, not outcome references.
- `agent/skills/refine-plan/README.md` (Modify) — Update the Final summary format block status enum from `approved | issues_remaining | failed` to `approved | approved_with_concerns | not_approved_within_budget | failed`. Update the Workflow step 7 phrasing to reflect the new outcomes ("when approved or approved with concerns").
- `agent/skills/refine-code/README.md` (Modify) — Update Status handling section to enumerate the new four statuses (`approved`, `approved_with_concerns`, `not_approved_within_budget`, `failed`) with their actions. Update the Coordinator responsibilities bullet "stop when clean or the budget is exhausted" to "stop when the reviewer outcome is `Approved`/`Approved with concerns` or the budget is exhausted with `Not approved` still standing".
- `agent/skills/requesting-code-review/README.md` (Modify) — Update the Workflow step 6 from "Parse the result for `[Approved]` or `[Issues Found]`" to "Parse the result for the `**Outcome:**` line (`Approved` / `Approved with concerns` / `Not approved`)".
- `agent/skills/requesting-code-review/SKILL.md` (Modify) — Update the dispatch documentation paragraph from "Parse it for `[Approved]` or `[Issues Found]`" to "Parse it for the `**Outcome:**` line in the `### Outcome` block (one of `Approved`, `Approved with concerns`, `Not approved`)". Update the Example block's reviewer-output sketch to match (replace `Assessment: Ready with fixes` with `Outcome: Approved with concerns`).
- `agent/skills/execute-plan/SKILL.md` (Modify) — Step 15 result handler: rename `clean` to `approved`, add `approved_with_concerns` (same as `approved` flow but report mentions waived Importants), rename `max_iterations_reached` to `not_approved_within_budget` (menu text unchanged).
- `agent/skills/refine-code/review-fix-block.md` (Modify) — Update the trailing instruction "report 'Ready to merge: Yes'" to "report `**Outcome:** Approved` in the `### Outcome` section".
- `README.md` (top-level) (Modify) — Update the `code-reviewer.md` description line "returns `[Approved]` or `[Issues Found]`" to "returns one of `Approved` / `Approved with concerns` / `Not approved` in its `### Outcome` block".

## Tasks

### Task 1: Rewrite plan-reviewer prompt output format

**Files:**
- Modify: `agent/skills/generate-plan/review-plan-prompt.md`

**Steps:**
- [ ] **Step 1: Replace the `## Output Format` section.** In `agent/skills/generate-plan/review-plan-prompt.md`, locate the existing `## Output Format` section (currently containing `### Status`, `### Issues`, and `### Summary` subsections) and replace it with the following structure:

  ~~~markdown
  ## Output Format

  ### Outcome

  **Outcome:** Approved | Approved with concerns | Not approved

  **Reasoning:** <1–2 sentence justification of the outcome.>

  The outcome line MUST be written exactly in the form `**Outcome:** <label>` (bold label, unbolded value, single space between) so downstream refiners can parse a line that begins with the literal token `**Outcome:**`.

  Use exactly one of the three outcome labels above. Critical findings always force `Not approved`; you may not downgrade them. `Approved with concerns` is appropriate ONLY when there are zero Critical findings AND there are one or more Important findings that you judge acceptable to ship without forced remediation (for example: the concern is out of scope for the current change, is a follow-up task, or is a low-impact deviation). When you choose `Approved with concerns`, the Reasoning paragraph MUST explicitly name each Important finding being waived and the rationale for waiving it. `Approved` requires zero Critical AND zero Important findings.

  If this is a structural-only review (per `## Structural-Only Mode`), include the literal phrase "Structural-only review — no spec/todo coverage check performed." inside this Reasoning paragraph.

  ### Strengths

  Bulleted list of what the plan does well. Be specific (cite task numbers when relevant). If there are no notable strengths to call out, write `_None._`.

  ### Issues

  Group findings under three H4 sub-headings, in this order:

  #### Critical (Must Fix)

  - **Task N: <short description>**
    - **What:** <Describe the issue>
    - **Why it matters:** <What goes wrong during execution if this isn't fixed>
    - **Recommendation:** <How to fix it>

  #### Important (Should Fix)

  - **Task N: <short description>**
    - **What:** ...
    - **Why it matters:** ...
    - **Recommendation:** ...

  #### Minor (Nice to Have)

  - **Task N: <short description>**
    - **What:** ...
    - **Why it matters:** ...
    - **Recommendation:** ...

  Render any empty severity sub-section as `_None._` rather than omitting the heading. Every sub-section appears in every review.

  **Severity guide:**
  - **Critical** — Missing tasks, wrong dependencies, references to non-existent outputs, missing or placeholder `Verify:` lines, tasks that cannot be executed as written. Critical findings always force `Not approved`.
  - **Important** — Vague acceptance criteria, sizing concerns, cross-task consistency risks, constraint-documentation gaps. The reviewer judges whether each Important finding needs real remediation (force `Not approved`) or is acceptable to waive (allow `Approved with concerns`).
  - **Minor** — Nit-level suggestions, low-value polish. Never block; never force a planner edit pass.

  ### Recommendations

  Bulleted list of process or content improvements that aren't tied to a specific finding above. If there are none, write `_None._`.
  ~~~

  Note: the `### Status`, `### Issues` (with old severity tag scheme), and `### Summary` headings from the prior structure are GONE — do not preserve them in any form.

- [ ] **Step 2: Update the `## Calibration` section.** Locate the `## Calibration` section (currently containing "Verify-recipe enforcement is not a stylistic preference. A missing or placeholder `Verify:` line is always an Error, even in an otherwise well-written plan."). Replace "is always an Error" with "is always Critical". Replace "Approve the plan unless there are serious structural gaps." with "Emit `Outcome: Approved` unless there are serious structural gaps. Use `Approved with concerns` when only Important findings remain that you judge acceptable to ship; reserve `Not approved` for Critical findings or Important findings that need real remediation."

- [ ] **Step 3: Update the `**Verify-Recipe Enforcement (blocking):**` block.** Locate the bullet "Any missing `Verify:` line is an **Error**. Any placeholder `Verify:` recipe is an **Error**. These are blocking — they are not warnings or suggestions. Report one Error per offending criterion with the task number and the exact criterion text." Replace "**Error**" (both occurrences) with "**Critical**" and update the parenthetical "they are not warnings or suggestions" to "they are not Important or Minor findings". Update "Report one Error" to "Report one Critical finding".

- [ ] **Step 4: Update Critical Rules verdict bullet.** Locate the `## Critical Rules` `DO:` bullet "Give a clear verdict (Approved or Issues Found)" and replace it with "Give a clear verdict in `### Outcome` (`Approved`, `Approved with concerns`, or `Not approved`)".

- [ ] **Step 5: Add re-review compatibility instruction.** Add a new bullet to the `## Review Checklist` section, between the `**Spec/Todo Coverage:**` block and the `**Dependency Accuracy:**` block:

  ~~~markdown
  **Re-review compatibility:**
  - If the plan contains a trailing `## Review Notes` section, disregard it during this review. That section is review meta-data appended by the refiner from a prior `Approved with concerns` outcome, not plan content. Do NOT factor it into Spec/Todo Coverage analysis or task-sizing assessments.
  ~~~

- [ ] **Step 6: Update the Output Artifact Contract Step 1 wording.** In the `## Output Artifact Contract` section, locate Step 1 ("Write the full review (Status verdict, Issues with severity tags, Summary) to `{REVIEW_OUTPUT_PATH}` (absolute path).") and replace "(Status verdict, Issues with severity tags, Summary)" with "(Outcome, Strengths, Issues by severity, Recommendations as defined in `## Output Format`)".

**Acceptance criteria:**

- The `## Output Format` section emits the new five-block structure: `### Outcome` (with `**Outcome:**` and `**Reasoning:**` lines), `### Strengths`, `### Issues` (with H4 sub-headings `#### Critical (Must Fix)`, `#### Important (Should Fix)`, `#### Minor (Nice to Have)` and the per-finding `**Task N: ...**` + What/Why it matters/Recommendation template), `### Recommendations`.
  Verify: open `agent/skills/generate-plan/review-plan-prompt.md` and confirm the `## Output Format` section contains the literal heading lines `### Outcome`, `### Strengths`, `### Issues`, `#### Critical (Must Fix)`, `#### Important (Should Fix)`, `#### Minor (Nice to Have)`, `### Recommendations` exactly once each, in that order, with no `### Status` or `### Summary` heading anywhere in the file.
- The new `### Outcome` block documents when `Approved with concerns` is appropriate and forbids it when any Critical finding is present.
  Verify: `grep -n "Approved with concerns" agent/skills/generate-plan/review-plan-prompt.md` returns at least one match inside the `### Outcome` description paragraph; the same paragraph contains the substring "Critical findings always force `Not approved`".
- Empty severity sub-sections render as `_None._` rather than being omitted.
  Verify: `grep -n "_None._" agent/skills/generate-plan/review-plan-prompt.md` returns at least one match inside the `## Output Format` section's severity-rendering instructions.
- The Severity guide uses Critical / Important / Minor working definitions matching the spec.
  Verify: open `agent/skills/generate-plan/review-plan-prompt.md`, locate the `**Severity guide:**` block in the `### Issues` section, and confirm three bullets headed `**Critical**`, `**Important**`, `**Minor**` exist with no `**Error**`, `**Warning**`, or `**Suggestion**` headings remaining anywhere in the file.
- The structural-only label is surfaced inside the Outcome's reasoning paragraph.
  Verify: open `agent/skills/generate-plan/review-plan-prompt.md`, locate the `### Outcome` description, and confirm the literal phrase `Structural-only review — no spec/todo coverage check performed.` appears in the same paragraph that names the Reasoning line — and does NOT appear inside any `### Summary` heading (which should not exist).
- The plan reviewer is instructed to disregard any pre-existing `## Review Notes` section.
  Verify: `grep -n "Re-review compatibility" agent/skills/generate-plan/review-plan-prompt.md` returns a match in the `## Review Checklist` section; the matched block contains the substring `disregard it during this review`.
- Critical Rules' verdict bullet references the new `### Outcome` block with the three labels.
  Verify: `grep -n "### Outcome" agent/skills/generate-plan/review-plan-prompt.md` returns at least one match in the `## Critical Rules` `DO:` list, and `grep -n "Approved or Issues Found" agent/skills/generate-plan/review-plan-prompt.md` returns zero matches.
- Output Artifact Contract Step 1 references the new body shape.
  Verify: `grep -n "Outcome, Strengths, Issues by severity, Recommendations" agent/skills/generate-plan/review-plan-prompt.md` returns a match in the `## Output Artifact Contract` section, and `grep -n "Status verdict, Issues with severity tags, Summary" agent/skills/generate-plan/review-plan-prompt.md` returns zero matches.

**Model recommendation:** standard

---

### Task 2: Rewrite code-reviewer prompt output format

**Files:**
- Modify: `agent/skills/requesting-code-review/review-code-prompt.md`

**Steps:**
- [ ] **Step 1: Replace the `## Output Format` section.** In `agent/skills/requesting-code-review/review-code-prompt.md`, locate the existing `## Output Format` section (currently containing `### Strengths`, `### Issues` with severity sub-headings, `### Recommendations`, and `### Assessment` with the Ready to merge verdict). Replace the entire section with:

  ~~~markdown
  ## Output Format

  ### Outcome

  **Outcome:** Approved | Approved with concerns | Not approved

  **Reasoning:** <1–2 sentence technical assessment justifying the outcome.>

  The outcome line MUST be written exactly in the form `**Outcome:** <label>` (bold label, unbolded value, single space between) so downstream refiners can parse a line that begins with the literal token `**Outcome:**`.

  Use exactly one of the three outcome labels above. Critical findings always force `Not approved`; you may not downgrade them. `Approved with concerns` is appropriate ONLY when there are zero Critical findings AND there are one or more Important findings that you judge acceptable to ship without forced remediation (for example: the concern is out of scope for the current diff, is a follow-up task, or is a low-impact deviation). When you choose `Approved with concerns`, the Reasoning paragraph MUST explicitly name each Important finding being waived and the rationale for waiving it. `Approved` requires zero Critical AND zero Important findings.

  ### Strengths

  Bulleted list of what's well done. Be specific (cite file:line ranges when relevant). If there are no notable strengths to call out, write `_None._`.

  ### Issues

  Group findings under three H4 sub-headings, in this order:

  #### Critical (Must Fix)

  - **path/to/file.ts:LINE: <short description>**
    - **What:** <Describe the issue>
    - **Why it matters:** <Why it matters>
    - **Recommendation:** <How to fix it (if not obvious)>

  #### Important (Should Fix)

  - **path/to/file.ts:LINE: <short description>**
    - **What:** ...
    - **Why it matters:** ...
    - **Recommendation:** ...

  #### Minor (Nice to Have)

  - **path/to/file.ts:LINE: <short description>**
    - **What:** ...
    - **Why it matters:** ...
    - **Recommendation:** ...

  Render any empty severity sub-section as `_None._` rather than omitting the heading. Every sub-section appears in every review.

  **Severity guide:**
  - **Critical** — Bugs, security issues, data loss risks, broken functionality. Critical findings always force `Not approved`.
  - **Important** — Architecture problems, missing features, poor error handling, test gaps. The reviewer judges whether each Important finding needs real remediation (force `Not approved`) or is acceptable to waive (allow `Approved with concerns`).
  - **Minor** — Code style, optimization opportunities, documentation improvements. Never block.

  ### Recommendations

  Bulleted list of broader improvements (architecture, process, follow-up work) that don't map to a specific finding above. If there are none, write `_None._`.
  ~~~

  Note: the `### Assessment` block (with `**Ready to merge:**` and `**Reasoning:**` lines) is GONE — its job is now done by `### Outcome` at the top. Do not preserve any `Ready to merge` line anywhere in the prompt.

- [ ] **Step 2: Replace the example output.** Locate the `## Example Output` section's fenced code block and replace it with an example that matches the new format:

  ~~~markdown
  ## Example Output

  ```
  ### Outcome

  **Outcome:** Approved with concerns

  **Reasoning:** Core implementation is solid with good architecture and tests. Two Important findings are waived: missing `--help` text in the CLI wrapper (follow-up task; users can read the source) and missing date validation in `search.ts` (low-impact — invalid dates silently return no results, which is recoverable).

  ### Strengths

  - Clean database schema with proper migrations (`db.ts:15-42`)
  - Comprehensive test coverage (18 tests, all edge cases)
  - Good error handling with fallbacks (`summarizer.ts:85-92`)

  ### Issues

  #### Critical (Must Fix)

  _None._

  #### Important (Should Fix)

  - **`index-conversations:1-31`: Missing help text in CLI wrapper**
    - **What:** No `--help` flag, users won't discover `--concurrency`.
    - **Why it matters:** Discoverability of optional flags depends on `--help`.
    - **Recommendation:** Add a `--help` case with usage examples.
  - **`search.ts:25-27`: Date validation missing**
    - **What:** Invalid dates silently return no results.
    - **Why it matters:** Hard to distinguish "no matches" from "bad input".
    - **Recommendation:** Validate ISO format and throw an error with an example.

  #### Minor (Nice to Have)

  - **`indexer.ts:130`: No progress indicators on long operations**
    - **What:** No "X of Y" counter for indexing runs that take minutes.
    - **Why it matters:** Users don't know how long to wait.
    - **Recommendation:** Add a periodic progress line.

  ### Recommendations

  - Add progress reporting for user experience.
  - Consider a config file for excluded projects (portability).
  ```
  ~~~

- [ ] **Step 3: Update Critical Rules verdict bullets.** In the `## Critical Rules` section, locate the `DO:` bullet "Give clear verdict" (it's adjacent to "Acknowledge strengths") and replace its surrounding context as needed so it reads "Give a clear verdict in `### Outcome` (`Approved`, `Approved with concerns`, or `Not approved`)". Locate the `DON'T:` bullet "Avoid giving a clear verdict" — leave it as-is (still applies). No other changes in this block.

- [ ] **Step 4: Update the Output Artifact Contract Step 1 wording.** In the `## Output Artifact Contract` section, locate Step 1 ("Write the full review (Strengths, Issues by severity, Recommendations, Assessment with the 'Ready to merge' verdict) to `{REVIEW_OUTPUT_PATH}` (absolute path).") and replace "(Strengths, Issues by severity, Recommendations, Assessment with the 'Ready to merge' verdict)" with "(Outcome, Strengths, Issues by severity, Recommendations as defined in `## Output Format`)".

**Acceptance criteria:**

- The `## Output Format` section emits the new five-block structure: `### Outcome` (with `**Outcome:**` and `**Reasoning:**` lines), `### Strengths`, `### Issues` (with H4 sub-headings `#### Critical (Must Fix)`, `#### Important (Should Fix)`, `#### Minor (Nice to Have)` and the per-finding `**file:line: ...**` + What/Why it matters/Recommendation template), `### Recommendations`.
  Verify: open `agent/skills/requesting-code-review/review-code-prompt.md` and confirm the `## Output Format` section contains the literal heading lines `### Outcome`, `### Strengths`, `### Issues`, `#### Critical (Must Fix)`, `#### Important (Should Fix)`, `#### Minor (Nice to Have)`, `### Recommendations` exactly once each, in that order, with no `### Assessment` heading anywhere in the file.
- The `### Outcome` block documents when `Approved with concerns` is appropriate and forbids it when any Critical finding is present.
  Verify: `grep -n "Approved with concerns" agent/skills/requesting-code-review/review-code-prompt.md` returns a match inside the `### Outcome` description paragraph; the same paragraph contains the substring "Critical findings always force `Not approved`".
- Empty severity sub-sections render as `_None._` rather than being omitted.
  Verify: `grep -n "_None._" agent/skills/requesting-code-review/review-code-prompt.md` returns at least one match inside the `## Output Format` instructions and at least one match inside the `## Example Output` block.
- All `Ready to merge` references are gone.
  Verify: `grep -n "Ready to merge" agent/skills/requesting-code-review/review-code-prompt.md` returns zero matches.
- The example output matches the new structure (Outcome at top, severity sub-headings present, no Assessment).
  Verify: open the `## Example Output` block in `agent/skills/requesting-code-review/review-code-prompt.md` and confirm it begins with `### Outcome` followed by `**Outcome:** Approved with concerns`, contains the three H4 severity sub-headings, ends with `### Recommendations`, and contains no `### Assessment` heading.
- Output Artifact Contract Step 1 references the new body shape.
  Verify: `grep -n "Outcome, Strengths, Issues by severity, Recommendations" agent/skills/requesting-code-review/review-code-prompt.md` returns a match in the `## Output Artifact Contract` section, and `grep -n "Assessment with the" agent/skills/requesting-code-review/review-code-prompt.md` returns zero matches.

**Model recommendation:** standard

---

### Task 3: Update plan-refiner prompt to parse new outcomes and emit four-status enum

**Files:**
- Modify: `agent/skills/refine-plan/refine-plan-prompt.md`

**Steps:**
- [ ] **Step 1: Replace the outcome-parsing step.** In `agent/skills/refine-plan/refine-plan-prompt.md`, locate Per-Iteration Full Review Step 6 ("**Parse the review file** for a line containing `**[Approved]**` or `**[Issues Found]**`."). Replace it with:

  ~~~markdown
  6. **Parse the review file for the reviewer outcome.** Find the line in the on-disk review file that begins with `**Outcome:**` (inside the `### Outcome` section). Extract the outcome label — it MUST be exactly one of `Approved`, `Approved with concerns`, or `Not approved`. If no `**Outcome:**` line is found, or the label does not match one of the three expected values, emit `STATUS: failed` with reason `reviewer artifact handoff failed: provenance malformed at <reviewer_path>: missing or unrecognized Outcome label` and exit.
  ~~~

- [ ] **Step 2: Replace the severity-counting step.** Locate Step 7 ("**Count findings by severity** — count Error, Warning, and Suggestion findings from the review (severity tags appear per the `review-plan-prompt.md` Output Format)."). Replace it with:

  ~~~markdown
  7. **Count findings by severity** — count Critical, Important, and Minor findings from the on-disk review. Findings appear under the H4 sub-headings `#### Critical (Must Fix)`, `#### Important (Should Fix)`, and `#### Minor (Nice to Have)` per `review-plan-prompt.md`'s Output Format. An empty sub-section renders as `_None._` and contributes zero to its count.
  ~~~

- [ ] **Step 3: Replace the iteration-branching block.** Locate Steps 8, 9, and 10 (the existing `If Errors == 0` / `If Errors > 0 and budget remaining` / `Otherwise` block, including the trailing paragraph about warnings/suggestions being informational). Replace the three steps with:

  ~~~markdown
  8. **If outcome is `Approved`** (zero Critical AND zero Important findings):
     - Do NOT append a `## Review Notes` section to the plan.
     - Emit `STATUS: approved` with the summary block and exit.

  9. **If outcome is `Approved with concerns`** (zero Critical AND one or more Important findings the reviewer waived):
     - Append a `## Review Notes` section to the plan using the format documented in [Review Notes Append Format](#review-notes-append-format) below. Source the per-bullet waiver rationale from the reviewer's Outcome `**Reasoning:**` paragraph — one bullet per waived Important finding, with the reviewer's rationale transcribed alongside.
     - Emit `STATUS: approved_with_concerns` with the summary block and exit.

  10. **If outcome is `Not approved`** (one or more Critical findings, OR one or more Important findings the reviewer judged as needing real remediation) AND the current iteration count is less than `{MAX_ITERATIONS}`: continue to the [Planner Edit Pass](#planner-edit-pass).

  11. **Otherwise** (outcome is `Not approved` AND budget exhausted): emit `STATUS: not_approved_within_budget` with the summary block and exit.

  Minor findings are never blocking. The reviewer's `Approved with concerns` decision is final for that review pass — the refiner does NOT iterate to remediate Important findings the reviewer has waived.
  ~~~

- [ ] **Step 4: Replace the Review Notes Append Format block.** Locate the entire `### Review Notes Append Format` section (from the heading through the closing fenced code block including the existing `### Warnings` / `### Suggestions` template). Replace it with the content below. Inside the outer `~~~markdown` quoting fence shown here, the literal triple-backtick fence is the actual fence that should appear in the rewritten `refine-plan-prompt.md` file (matching the existing prompt's triple-backtick convention for example blocks):

  ~~~markdown
  ### Review Notes Append Format

  When the `approved_with_concerns` path is taken (step 9), append the following markdown to the END of the plan file. The leading blank line is required to separate from any prior content. Append once — never insert elsewhere.

  Do NOT append a `## Review Notes` section on the `approved`, `not_approved_within_budget`, or `failed` paths. Do NOT include Minor findings in the append (they live in the review file only).

  Substitute `<path-to-review-file>` with the absolute review file path you supplied as `{REVIEW_OUTPUT_PATH}` for this iteration. One bullet per waived Important finding; the waiver rationale is sourced from the reviewer's Outcome `**Reasoning:**` paragraph.

  ```markdown

  ## Review Notes

  _Approved with concerns by plan reviewer. Full review: `<path-to-review-file>`._

  ### Important (waived)

  - **Task N**: <one-sentence summary> — _waived: <one-sentence rationale from reviewer>._
  ```
  ~~~

- [ ] **Step 5: Update the Planner Edit Pass `{REVIEW_FINDINGS}` source.** In the `### Planner Edit Pass` section, Step 2's bullet "`{REVIEW_FINDINGS}` — the full text of all Error-severity findings concatenated from the on-disk review artifact (read in Per-Iteration Full Review Step 5e)". Replace with:

  ~~~markdown
  - `{REVIEW_FINDINGS}` — the full text of all Critical findings AND all Important findings concatenated from the on-disk review artifact (read in Per-Iteration Full Review Step 5e). The planner edit pass addresses the findings the reviewer judged blocking under `Not approved`. Do NOT include Minor findings — they are non-blocking and do not feed the edit pass.
  ~~~

- [ ] **Step 6: Renumber subsequent Planner Edit Pass steps.** The Planner Edit Pass section had Steps 3, 4, 5 after Step 2. They keep the same numbering — Step 3 (Dispatch planner), Step 4 (Verify plan file), Step 5 (Increment iteration counter, loop back). No content changes here.

- [ ] **Step 7: Replace the Output Format status-enum line.** In the `## Output Format` section, locate the line `STATUS: approved | issues_remaining | failed` and replace it with `STATUS: approved | approved_with_concerns | not_approved_within_budget | failed`. Update the line `Errors found: <total across all iterations>` to read `Critical found: <total across all iterations>`. Update `Errors fixed: <total across all iterations>` to `Critical+Important fixed: <total across all iterations>` (since Important findings are also remediated under `Not approved`). Update `Warnings/suggestions appended: <count appended to plan on approved path; 0 otherwise>` to `Important waived (appended to plan): <count appended on approved_with_concerns path; 0 otherwise>`. Add an additional summary line `Important found: <total across all iterations>` between the Critical-found and Critical+Important-fixed lines. Add `Minor found: <total across all iterations>` after that.

- [ ] **Step 8: Update the explanatory paragraphs after the Output Format fenced block.** Locate the paragraphs starting "On `STATUS: approved` or `STATUS: issues_remaining`, the `## Review Files` list contains exactly one entry…" and "On `STATUS: failed`, the `## Review Files` list contains only review files…". Replace the first paragraph's status enumeration with `On STATUS: approved, STATUS: approved_with_concerns, or STATUS: not_approved_within_budget, the `## Review Files` list contains exactly one entry — the era review file successfully written during this invocation.` Update the second paragraph's failure-condition list to use the new failure-mode strings (`reviewer artifact handoff failed: missing REVIEW_ARTIFACT marker`, etc.) per Step 9 below.

- [ ] **Step 9: Rewrite the `## Failure Modes` section to use the four-category taxonomy.** Replace the entire `## Failure Modes` section with:

  ~~~markdown
  ## Failure Modes

  All failure conditions produce `STATUS: failed` with a one-line reason string drawn from the four-category taxonomy below. The reason string appears in the `## Failure Reason` block of the Output Format.

  | Category | Reason string template | Notes |
  |---|---|---|
  | Coordinator infra | `coordinator dispatch unavailable` | Emitted when `subagent_run_serial` is unavailable in this session. |
  | Worker dispatch | `worker dispatch failed: <which worker>` | `<which worker>` ∈ `plan-reviewer`, `planner-edit-pass`. Plan-reviewer primary→fallback retry logic is preserved internally; only retry exhaustion surfaces this string. |
  | Reviewer artifact handoff | `reviewer artifact handoff failed: <specific check>` | `<specific check>` ∈ `missing REVIEW_ARTIFACT marker`, `missing or empty at <path>`, `path mismatch: expected <X> got <Y>`, `provenance malformed at <path>: <sub-check>` (where `<sub-check>` ∈ `does not match supplied REVIEWER_PROVENANCE`, `format mismatch`, `inline-substring forbidden`, `missing or unrecognized Outcome label`). |
  | Input artifact | `input artifact missing or empty: <which>` | `<which>` ∈ `plan file at iteration start`, `plan file after planner edit pass`. |
  ~~~

- [ ] **Step 10: Update inline failure-emit sites to use the new reason strings.** Walk the entire prompt file and update every place that emits `STATUS: failed` with a reason string to use the new taxonomy. Specifically:

  - In `### Hard rules (read first)`:
    - Hard rule 2's parenthetical examples ("e.g., `plan-reviewer dispatch failed on primary and fallback`, `planner edit-pass dispatch failed`, or `coordinator orchestration tool unavailable`") become "(e.g., `worker dispatch failed: plan-reviewer`, `worker dispatch failed: planner-edit-pass`, or `coordinator dispatch unavailable`)".
    - Hard rule 3's parenthetical examples ("`reviewer response missing REVIEW_ARTIFACT marker`, `reviewer artifact missing or empty at <path>`, `reviewer artifact path mismatch: expected <X>, got <Y>`, or `reviewer artifact provenance malformed at <path>: <specific check>`") become "(`reviewer artifact handoff failed: missing REVIEW_ARTIFACT marker`, `reviewer artifact handoff failed: missing or empty at <path>`, `reviewer artifact handoff failed: path mismatch: expected <X> got <Y>`, or `reviewer artifact handoff failed: provenance malformed at <path>: <specific check>`)".

  - In `### Per-Iteration Full Review` Step 1: change "`plan file missing or empty at iteration start`" to "`input artifact missing or empty: plan file at iteration start`".

  - In Step 4's primary→fallback exhaustion: change "`plan-reviewer dispatch failed on primary and fallback`" to "`worker dispatch failed: plan-reviewer`".

  - In Step 5a: change "`reviewer response missing REVIEW_ARTIFACT marker`" to "`reviewer artifact handoff failed: missing REVIEW_ARTIFACT marker`".

  - In Step 5b: change "`reviewer artifact path mismatch: expected <expected>, got <reviewer_path>`" to "`reviewer artifact handoff failed: path mismatch: expected <expected> got <reviewer_path>`".

  - In Step 5c: change "`reviewer artifact missing or empty at <reviewer_path>`" to "`reviewer artifact handoff failed: missing or empty at <reviewer_path>`".

  - In Step 5d: change "`reviewer artifact provenance malformed at <reviewer_path>: <specific check>`" to "`reviewer artifact handoff failed: provenance malformed at <reviewer_path>: <specific check>`". The `<specific check>` enumeration (`does not match supplied REVIEWER_PROVENANCE`, `format mismatch`, `inline-substring forbidden`) is preserved unchanged.

  - In `### Planner Edit Pass` Step 3: change "`planner edit-pass dispatch failed`" to "`worker dispatch failed: planner-edit-pass`".

  - In Step 4 of Planner Edit Pass: change "`plan file missing or empty after planner edit pass returned`" to "`input artifact missing or empty: plan file after planner edit pass`".

  - In the `## Output Format` second-to-last paragraph (failure conditions list): replace each old reason string with its new equivalent per the mappings above.

**Acceptance criteria:**

- The refiner parses outcome by matching one of the three outcome labels (`Approved` / `Approved with concerns` / `Not approved`) on the `**Outcome:**` line.
  Verify: open `agent/skills/refine-plan/refine-plan-prompt.md` Step 6 of `### Per-Iteration Full Review` and confirm it instructs the refiner to find a line beginning with `**Outcome:**` and to match one of the three labels exactly; `grep -n "\\*\\*\\[Approved\\]\\*\\*" agent/skills/refine-plan/refine-plan-prompt.md` returns zero matches.
- Severity counts are derived from the H4 sub-section findings tagged Critical / Important / Minor.
  Verify: open Step 7 of `### Per-Iteration Full Review` in `agent/skills/refine-plan/refine-plan-prompt.md` and confirm it names `Critical`, `Important`, and `Minor` severity counts derived from `#### Critical (Must Fix)`, `#### Important (Should Fix)`, `#### Minor (Nice to Have)` sub-headings; `grep -n "Error, Warning, and Suggestion" agent/skills/refine-plan/refine-plan-prompt.md` returns zero matches.
- The refiner emits one of `approved` / `approved_with_concerns` / `not_approved_within_budget` / `failed`.
  Verify: `grep -n "STATUS: approved | approved_with_concerns | not_approved_within_budget | failed" agent/skills/refine-plan/refine-plan-prompt.md` returns at least one match in the `## Output Format` section, AND `grep -nE "STATUS: (approved|approved_with_concerns|not_approved_within_budget|failed)" agent/skills/refine-plan/refine-plan-prompt.md` returns matches at the inline emit sites in Steps 8, 9, 11, AND `grep -n "STATUS: issues_remaining" agent/skills/refine-plan/refine-plan-prompt.md` returns zero matches.
- The Review Notes append is gated on `approved_with_concerns` only and uses the new pointer-style format.
  Verify: open the `### Review Notes Append Format` section in `agent/skills/refine-plan/refine-plan-prompt.md` and confirm it states "Do NOT append a `## Review Notes` section on the `approved`, `not_approved_within_budget`, or `failed` paths" and contains the literal text `_Approved with concerns by plan reviewer. Full review:` and `### Important (waived)`; the legacy `### Warnings` and `### Suggestions` sub-headings do NOT appear inside the appended template (`grep -nE "^### (Warnings|Suggestions)" agent/skills/refine-plan/refine-plan-prompt.md` returns zero matches).
- The planner edit pass `{REVIEW_FINDINGS}` placeholder is sourced from Critical + Important findings, not "Error-severity".
  Verify: `grep -n "Critical findings AND all Important findings" agent/skills/refine-plan/refine-plan-prompt.md` returns a match in the `### Planner Edit Pass` Step 2 placeholder list, and `grep -n "Error-severity findings" agent/skills/refine-plan/refine-plan-prompt.md` returns zero matches.
- Failure-mode reason strings conform to the four-category taxonomy.
  Verify: open the `## Failure Modes` section in `agent/skills/refine-plan/refine-plan-prompt.md` and confirm it lists the four categories (`Coordinator infra`, `Worker dispatch`, `Reviewer artifact handoff`, `Input artifact`) with the exact template strings from the spec; `grep -n "plan-reviewer dispatch failed on primary and fallback" agent/skills/refine-plan/refine-plan-prompt.md` returns zero matches; `grep -n "planner edit-pass dispatch failed" agent/skills/refine-plan/refine-plan-prompt.md` returns zero matches (the consolidated `worker dispatch failed: planner-edit-pass` form appears instead).
- All inline emit sites use the new reason strings.
  Verify: `grep -nE "reviewer response missing REVIEW_ARTIFACT marker|reviewer artifact missing or empty at|reviewer artifact path mismatch|reviewer artifact provenance malformed at" agent/skills/refine-plan/refine-plan-prompt.md` returns zero matches outside the `## Failure Modes` table; the new prefixed forms (`reviewer artifact handoff failed: missing REVIEW_ARTIFACT marker`, etc.) appear at the inline emit sites in Steps 5a–5d and Hard rule 3.

**Model recommendation:** capable

---

### Task 4: Update code-refiner prompt to parse new outcomes and emit four-status enum

**Files:**
- Modify: `agent/skills/refine-code/refine-code-prompt.md`

**Steps:**
- [ ] **Step 1: Replace the verdict-assessment step in Iteration 1.** In `agent/skills/refine-code/refine-code-prompt.md`, locate Iteration 1 Step 4 ("**Assess verdict** (from the on-disk review file): - 'Ready to merge: Yes' with no Critical/Important issues → skip to **Final Verification** - Critical/Important issues exist → continue to step 5"). Replace it with:

  ~~~markdown
  4. **Assess outcome** (from the on-disk review file). Find the line in the on-disk review beginning with `**Outcome:**` (inside the `### Outcome` section) and extract the outcome label. The label MUST be exactly one of `Approved`, `Approved with concerns`, or `Not approved`. If no `**Outcome:**` line is found, or the label does not match one of the three expected values, emit `STATUS: failed` with reason `reviewer artifact handoff failed: provenance malformed at <reviewer_path>: missing or unrecognized Outcome label` and exit. Then branch:
     - `Approved` or `Approved with concerns` → skip to **Final Verification**.
     - `Not approved` → continue to step 5.

  When `Approved with concerns` triggers Final Verification, the reviewer's waived Important findings are final for this era — the refiner does NOT iterate to remediate them. The waived findings remain in the review file (no code-side `## Review Notes` analog exists; the diff plus the review file are the artifacts).
  ~~~

- [ ] **Step 2: Update the Final Verification "If clean" branching.** In the `### Final Verification` section, locate the existing Step 2 ("**If clean** (no Critical/Important issues in the on-disk review): - Record `Result: Clean after N iterations.` … - Report `STATUS: clean`. …") and the existing Step 3 ("**If issues found:** …"). Replace with:

  ~~~markdown
  2. **Parse the final-verification outcome** from the on-disk review file (the same `**Outcome:**` line check as Iteration 1 Step 4). Branch:

     - **`Approved`:** Record `Result: Approved after N iterations.` in your coordinator state. Do NOT write to the reviewer artifact (the iteration count surfaces via the Output Format's `Iterations: <N>` line). Report `STATUS: approved`. Return the era-versioned path as the `## Review File` in your output. Do NOT produce an unversioned copy at `<REVIEW_OUTPUT_PATH>.md` — that legacy copy is dropped under this contract.

     - **`Approved with concerns`:** Record `Result: Approved with concerns after N iterations.` in your coordinator state. Do NOT write to the reviewer artifact (the waived Important findings remain in the review file as the reviewer wrote them). Report `STATUS: approved_with_concerns`. Return the era-versioned path as the `## Review File` in your output.

     - **`Not approved`:** Reset the iteration budget — start a new era by incrementing `ERA = ERA + 1`. Compute the next versioned path `{WORKING_DIR}/{REVIEW_OUTPUT_PATH}-v<ERA>.md` (e.g. `-v2.md`, `-v3.md`). Do NOT create or write to this file yourself — the next reviewer dispatch (Iteration 1 of the new era) will create it by writing to the path you supply as `{REVIEW_OUTPUT_PATH}`. Re-enter the remediation loop from Iteration 1 step 5 (assess + remediate). The next `code-reviewer` dispatch in the new era is given the new `-v<ERA>.md` path as `{REVIEW_OUTPUT_PATH}`.
  ~~~

  Note: the existing Step 3 ("If issues found: Reset the iteration budget …") is folded into the `Not approved` branch above and removed as a separate step.

- [ ] **Step 3: Update the On Budget Exhaustion section.** Locate `### On Budget Exhaustion` and replace its content with:

  ~~~markdown
  ### On Budget Exhaustion

  When iterations reach MAX_ITERATIONS without convergence (i.e. the most-recent reviewer outcome is still `Not approved` and the budget is exhausted):

  1. Track the cumulative remediation log in your coordinator state. Do NOT write to the reviewer artifact (the remaining issues are already in the file from the most recent reviewer write; the coordinator surfaces unfixed findings via the Output Format's `## Remaining Issues` section and surfaces fix counts via `Issues fixed`/`Issues remaining`).
  2. Report `STATUS: not_approved_within_budget`.
  ~~~

- [ ] **Step 4: Update the On Clean First Review section.** Locate `### On Clean First Review` and update it to use the new vocabulary:

  ~~~markdown
  ### On Clean First Review

  If the very first review's outcome is `Approved` or `Approved with concerns` (i.e. zero Critical findings), still run Final Verification (full-diff review) before reporting the success-path status. This ensures a cross-provider check even when the first pass looks clean.
  ~~~

- [ ] **Step 5: Replace the Output Format status-enum line.** In the `## Output Format` section, locate the fenced block starting `STATUS: clean | max_iterations_reached`. Replace with:

  ~~~markdown
  ```
  STATUS: approved | approved_with_concerns | not_approved_within_budget | failed

  ## Summary
  Iterations: <N>
  Issues found: <X> (<N> Critical, <N> Important, <N> Minor)
  Issues fixed: <Y>
  Issues remaining: <Z>

  ## Remaining Issues (only if not_approved_within_budget)
  [Full text of unfixed Critical and Important findings with file:line references]

  ## Review File
  <path to latest versioned review file>

  ## Failure Reason
  <one-line reason; only present when STATUS: failed>
  ```
  ~~~

  Note: the `## Failure Reason` block is added to mirror the plan-side structure for consistent failure surfacing.

- [ ] **Step 6: Rewrite the `## Failure Modes` section to use the four-category taxonomy.** Replace the entire `## Failure Modes` section with:

  ~~~markdown
  ## Failure Modes

  All failure conditions produce `STATUS: failed` with a one-line reason string drawn from the four-category taxonomy below. The reason string appears in the `## Failure Reason` block of the Output Format.

  | Category | Reason string template | Notes |
  |---|---|---|
  | Coordinator infra | `coordinator dispatch unavailable` | Emitted when `subagent_run_serial` is unavailable in this session. |
  | Worker dispatch | `worker dispatch failed: <which worker>` | `<which worker>` ∈ `code-reviewer`, `coder`. Covers first-pass, hybrid re-review, final-verification reviewer dispatches and remediator (coder) dispatches. |
  | Reviewer artifact handoff | `reviewer artifact handoff failed: <specific check>` | `<specific check>` ∈ `missing REVIEW_ARTIFACT marker`, `missing or empty at <path>`, `path mismatch: expected <X> got <Y>`, `provenance malformed at <path>: <sub-check>` (where `<sub-check>` ∈ `does not match supplied REVIEWER_PROVENANCE`, `format mismatch`, `inline-substring forbidden`, `missing or unrecognized Outcome label`). |

  The Input artifact category from the plan side has no code-side analog — git tracks code state.
  ~~~

- [ ] **Step 7: Update inline failure-emit sites to use the new reason strings.** Walk the entire prompt file and update every place that emits `STATUS: failed` with a reason string to use the new taxonomy. Specifically:

  - In `### Hard rules (read first)`:
    - Hard rule 2 currently emits `worker dispatch failed: <which worker>` — already aligned with the new taxonomy. No change.
    - Hard rule 3's parenthetical examples ("`reviewer response missing REVIEW_ARTIFACT marker`, `reviewer artifact missing or empty at <path>`, `reviewer artifact path mismatch: expected <X>, got <Y>`, or `reviewer artifact provenance malformed at <path>: <specific check>`") become "(`reviewer artifact handoff failed: missing REVIEW_ARTIFACT marker`, `reviewer artifact handoff failed: missing or empty at <path>`, `reviewer artifact handoff failed: path mismatch: expected <X> got <Y>`, or `reviewer artifact handoff failed: provenance malformed at <path>: <specific check>`)".

  - In `### Iteration 1: Full Review` Step 3a: change "`reviewer response missing REVIEW_ARTIFACT marker`" to "`reviewer artifact handoff failed: missing REVIEW_ARTIFACT marker`".

  - In Step 3b: change "`reviewer artifact path mismatch: expected <expected>, got <reviewer_path>`" to "`reviewer artifact handoff failed: path mismatch: expected <expected> got <reviewer_path>`".

  - In Step 3c: change "`reviewer artifact missing or empty at <reviewer_path>`" to "`reviewer artifact handoff failed: missing or empty at <reviewer_path>`".

  - In Step 3d: change "`reviewer artifact provenance malformed at <reviewer_path>: <specific check>`" to "`reviewer artifact handoff failed: provenance malformed at <reviewer_path>: <specific check>`". The `<specific check>` enumeration (`does not match supplied REVIEWER_PROVENANCE`, `format mismatch`, `inline-substring forbidden`) is preserved unchanged.

  - In `### Iteration 2..N: Hybrid Re-Review` Step 5: same substitutions for the artifact-handoff failure reasons. Reference (`reviewer response missing REVIEW_ARTIFACT marker`, `reviewer artifact path mismatch: expected <X>, got <Y>`, `reviewer artifact missing or empty at <path>`, `reviewer artifact provenance malformed at <path>: <specific check>`) become the new `reviewer artifact handoff failed: …` forms.

**Acceptance criteria:**

- The refiner parses outcome by matching one of the three outcome labels.
  Verify: open Iteration 1 Step 4 in `agent/skills/refine-code/refine-code-prompt.md` and confirm it instructs the refiner to find a `**Outcome:**` line and match one of `Approved` / `Approved with concerns` / `Not approved`; `grep -n "Ready to merge: Yes" agent/skills/refine-code/refine-code-prompt.md` returns zero matches.
- Remediation triggers only on `Not approved` outcomes.
  Verify: open Iteration 1 Step 4 in `agent/skills/refine-code/refine-code-prompt.md` and confirm the branching explicitly routes `Approved` and `Approved with concerns` to Final Verification (skipping remediation) and `Not approved` to step 5 (remediation). `grep -n "Approved with concerns" agent/skills/refine-code/refine-code-prompt.md` returns at least one match inside the Iteration 1 Step 4 branching block.
- The refiner emits the four-status enum.
  Verify: `grep -n "STATUS: approved | approved_with_concerns | not_approved_within_budget | failed" agent/skills/refine-code/refine-code-prompt.md` returns at least one match in the `## Output Format` fenced block, AND `grep -nE "STATUS: (approved|approved_with_concerns|not_approved_within_budget|failed)" agent/skills/refine-code/refine-code-prompt.md` returns matches at the Final Verification Step 2 inline emit sites and the On Budget Exhaustion section, AND `grep -nE "STATUS: (clean|max_iterations_reached)" agent/skills/refine-code/refine-code-prompt.md` returns zero matches.
- Failure-mode reason strings conform to the four-category taxonomy.
  Verify: open the `## Failure Modes` section in `agent/skills/refine-code/refine-code-prompt.md` and confirm it lists three categories (`Coordinator infra`, `Worker dispatch`, `Reviewer artifact handoff`) with the exact template strings from the spec — and a closing sentence that the Input artifact category has no code-side analog.
- Inline emit sites use the new artifact-handoff reason strings.
  Verify: `grep -nE "reviewer response missing REVIEW_ARTIFACT marker|reviewer artifact missing or empty at|reviewer artifact path mismatch|reviewer artifact provenance malformed at" agent/skills/refine-code/refine-code-prompt.md` returns zero matches outside the `## Failure Modes` table; the new prefixed forms (`reviewer artifact handoff failed: missing REVIEW_ARTIFACT marker`, etc.) appear at the Iteration 1 Step 3a–3d emit sites and the Hybrid Re-Review Step 5.

**Model recommendation:** capable

---

### Task 5: Update refine-plan/SKILL.md to recognize the new four-status enum

**Files:**
- Modify: `agent/skills/refine-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Update Step 7.5 structural-only note.** In `agent/skills/refine-plan/SKILL.md`, locate Step 7.5's literal `{STRUCTURAL_ONLY_NOTE}` text and update the trailing phrase:

  - Old: `… and label its verdict as "Structural-only review — no spec/todo coverage check performed." in its Summary section.`
  - New: `… and include the literal phrase "Structural-only review — no spec/todo coverage check performed." inside its Outcome reasoning paragraph (the Summary section no longer exists in the new output format).`

- [ ] **Step 2: Update Step 9 STATUS parsing.** In Step 9's bullet list, locate "The `STATUS:` line (`approved`, `issues_remaining`, or `failed`)." and replace with "The `STATUS:` line (`approved`, `approved_with_concerns`, `not_approved_within_budget`, or `failed`).".

- [ ] **Step 3: Update Step 9.5 trigger condition.** Locate the opening sentence of Step 9.5 ("Run this validation only on `STATUS: approved` or `STATUS: issues_remaining`; skip on `STATUS: failed`…"). Replace with "Run this validation only on `STATUS: approved`, `STATUS: approved_with_concerns`, or `STATUS: not_approved_within_budget`; skip on `STATUS: failed` (no review file is guaranteed to exist on failure).".

- [ ] **Step 4: Update Step 10 status handlers.** Replace the `## Step 10: Handle STATUS` section (the three subsections `STATUS: approved`, `STATUS: issues_remaining`, `STATUS: failed`) with four subsections:

  ~~~markdown
  ## Step 10: Handle STATUS

  ### `STATUS: approved`

  If `AUTO_COMMIT_ON_APPROVAL` is true, jump directly to the commit invocation in Step 10a. Otherwise, prompt the user:

  ```
  refine-plan: plan approved. Commit plan + review artifacts? (y/n)
  ```

  On `Y` or empty, run Step 10a. On `n`, set `COMMIT = left_uncommitted` and skip to Step 11.

  ### `STATUS: approved_with_concerns`

  Same handling as `STATUS: approved`, with the prompt updated to surface the waiver:

  ```
  refine-plan: plan approved with concerns (Important findings waived — see Review Notes appended to the plan). Commit plan + review artifacts? (y/n)
  ```

  Behavior is identical to `STATUS: approved` from here: on `Y` or empty (or with `AUTO_COMMIT_ON_APPROVAL` true), run Step 10a; on `n`, set `COMMIT = left_uncommitted` and skip to Step 11. The plan file already has the `## Review Notes` section appended by the `plan-refiner` per `refine-plan-prompt.md` Step 9 — Step 10a's commit will include that edit.

  ### `STATUS: not_approved_within_budget`

  Present the budget-exhaustion menu exactly as:

  - **(a)** Commit current era's plan + review artifacts, then keep iterating into era v`<STARTING_ERA + 1>` with a fresh budget.
  - **(b)** Stop here and proceed with issues; commit gate runs based on `AUTO_COMMIT_ON_APPROVAL`.

  **On `(a)`:** Run Step 10a (commit current era). Step 10a MUST succeed (`COMMIT = committed`) before the next era is dispatched. If Step 10a sets `COMMIT = not_attempted` (commit failed for any reason — pre-commit hook failure, dirty index, underlying error), STOP refinement immediately: preserve `STATUS = not_approved_within_budget` and the `COMMIT = not_attempted [reason]` value from Step 10a, do **NOT** dispatch the next era, and skip directly to Step 11. Continuing into a fresh era after a failed commit would leave the prior era's edits uncommitted while a new era runs — the abandoned-state recovery hazard the spec's two-option menu was designed to prevent.

  Only when Step 10a sets `COMMIT = committed` may the skill re-run from Step 6 onward, with `STARTING_ERA` recomputed by re-scanning `.pi/plans/reviews/` (it will now reflect the just-committed file plus any uncommitted files; the rule remains `max(existing_N) + 1`). Loop until either `STATUS: approved` / `STATUS: approved_with_concerns` (proceed normally) or the user picks `(b)`.

  **On `(b)`:** In `AUTO_COMMIT_ON_APPROVAL = true` mode, run Step 10a (auto-commit). In standalone mode, prompt:

  ```
  Commit current plan + review artifacts? (y/n)
  ```

  Run Step 10a on `Y`/empty; set `COMMIT = left_uncommitted` on `n`.

  ### `STATUS: failed`

  Skip the commit gate entirely. Set `COMMIT = not_attempted`. Proceed to Step 11.
  ~~~

- [ ] **Step 5: Update Step 11 final report.** In Step 11's first fenced block, replace the line `STATUS: <approved | issues_remaining | failed>` with `STATUS: <approved | approved_with_concerns | not_approved_within_budget | failed>`.

**Acceptance criteria:**

- Step 7.5's structural-only note text references the Outcome reasoning paragraph, not the Summary section.
  Verify: open Step 7.5 in `agent/skills/refine-plan/SKILL.md` and confirm the `{STRUCTURAL_ONLY_NOTE}` body contains the substring "inside its Outcome reasoning paragraph"; `grep -n "in its Summary section" agent/skills/refine-plan/SKILL.md` returns zero matches.
- Step 9's STATUS parsing line names all four enum values.
  Verify: `grep -n "STATUS:.*approved.*approved_with_concerns.*not_approved_within_budget.*failed" agent/skills/refine-plan/SKILL.md` returns at least one match in Step 9.
- Step 9.5's trigger condition runs on the three success-path statuses and skips on `failed`.
  Verify: open Step 9.5 in `agent/skills/refine-plan/SKILL.md` and confirm the opening sentence enumerates `STATUS: approved`, `STATUS: approved_with_concerns`, `STATUS: not_approved_within_budget` and skips on `STATUS: failed`.
- Step 10 has four subsections — `approved`, `approved_with_concerns`, `not_approved_within_budget`, `failed`.
  Verify: `grep -nE "^### \\\`STATUS: (approved|approved_with_concerns|not_approved_within_budget|failed)\\\`" agent/skills/refine-plan/SKILL.md` returns four matches inside the `## Step 10: Handle STATUS` section, and `grep -n "### \\\`STATUS: issues_remaining\\\`" agent/skills/refine-plan/SKILL.md` returns zero matches.
- Step 11's final-report status line uses the four-value enum.
  Verify: `grep -n "STATUS: <approved | approved_with_concerns | not_approved_within_budget | failed>" agent/skills/refine-plan/SKILL.md` returns at least one match in Step 11; `grep -n "STATUS: <approved | issues_remaining | failed>" agent/skills/refine-plan/SKILL.md` returns zero matches.
- Provenance-validation rules in Step 9.5 are preserved unchanged.
  Verify: open Step 9.5 in `agent/skills/refine-plan/SKILL.md` and confirm the five numbered validation steps (regex match, extract, no `inline` substring, re-read model-tiers.json, model/cli equality against `crossProvider.capable` OR `capable`) are still present with the same wording.

**Model recommendation:** standard

---

### Task 6: Update refine-code/SKILL.md to recognize the new four-status enum

**Files:**
- Modify: `agent/skills/refine-code/SKILL.md`

**Steps:**
- [ ] **Step 1: Update Step 5 status branches.** Locate the `## Step 5: Handle code-refiner result` section. Replace its body (everything after the heading and the opening paragraph "Parse `results[0].finalMessage` from the code-refiner for the STATUS line and stash the parsed outcome locally. **Do not report success to the caller in this step**…") with the four-status branch set:

  ~~~markdown
  Parse `results[0].finalMessage` from the code-refiner for the STATUS line and stash the parsed outcome locally. **Do not report success to the caller in this step** — caller-facing success reporting is deferred until Step 6's provenance validation passes.

  Determine the stashed outcome:

  **`STATUS: approved`**
  - Stash: review passed, iteration count, and review file path — to be reported to the caller only after Step 6 succeeds.

  **`STATUS: approved_with_concerns`**
  - Stash: review passed with waived Important findings, iteration count, review file path, and a note that the review file contains the waiver rationale in its `### Outcome` reasoning — to be reported to the caller only after Step 6 succeeds. No menu (this is a success-path status).

  **`STATUS: not_approved_within_budget`**
  - Stash: remaining findings and the choice menu below — to be presented to the caller only after Step 6 succeeds.
  - Choices to offer (after Step 6 passes):
    - **(a) Keep iterating** — re-invoke this skill from Step 3 with the same inputs but `HEAD_SHA` updated to current HEAD (budget resets, new cycle)
    - **(b) Proceed with issues** — caller continues with known issues noted
    - **(c) Stop execution** — caller halts

  For any other outcome (`STATUS: failed`, dispatch failure, unexpected status), surface it directly to the caller per the Edge Cases section; Step 6 is skipped.

  The caller (execute-plan or user) makes the decision. This skill does not auto-continue. Proceed to Step 6 before reporting anything to the caller.
  ~~~

- [ ] **Step 2: Update Step 6 trigger condition.** Locate Step 6's opening sentence ("Run this validation only on `STATUS: clean` or `STATUS: max_iterations_reached`; skip on any other outcome."). Replace with "Run this validation only on `STATUS: approved`, `STATUS: approved_with_concerns`, or `STATUS: not_approved_within_budget`; skip on any other outcome (including `STATUS: failed`).".

- [ ] **Step 3: Update Step 6 model-tier validation rules.** Locate the two numbered rules at the bottom of Step 6 (currently rules 5 and 6 — "On `STATUS: clean`: …" and "On `STATUS: max_iterations_reached`: …"). Replace with:

  ~~~markdown
  5. On `STATUS: approved` or `STATUS: approved_with_concerns`: `<provider>/<model>` MUST equal the model string `crossProvider.capable` resolves to, and `<cli>` MUST equal `dispatch[<provider>]` for that model's provider prefix. The final-verification pass always runs at `crossProvider.capable` and is the last write to the file on the success path (whether the outcome is `Approved` or `Approved with concerns`).
  6. On `STATUS: not_approved_within_budget`: `<provider>/<model>` MUST equal either the model string `crossProvider.capable` resolves to OR the model string `standard` resolves to (the two documented reviewer tiers in `refine-code-prompt.md`). `<cli>` MUST equal `dispatch[<provider>]` for that model's provider prefix.
  ~~~

- [ ] **Step 4: Update Step 6's "Do NOT silently report" sentence.** Locate the sentence "Do NOT silently report `STATUS: clean` or `STATUS: max_iterations_reached` after a validation failure; the caller sees the validation error in place of the success status." Replace with "Do NOT silently report `STATUS: approved`, `STATUS: approved_with_concerns`, or `STATUS: not_approved_within_budget` after a validation failure; the caller sees the validation error in place of the success status.".

- [ ] **Step 5: Update Step 6's closing paragraph.** Locate the closing paragraph "When all paths pass validation, proceed to report the stashed outcome from Step 5 to the caller — `STATUS: clean` with iteration count and review file path, or `STATUS: max_iterations_reached` with remaining findings and the (a)/(b)/(c) choice menu. This is the only point at which Step 5's success outcome may reach the caller." Replace with:

  ~~~markdown
  When all paths pass validation, proceed to report the stashed outcome from Step 5 to the caller:
  - `STATUS: approved` — report with iteration count and review file path; no menu.
  - `STATUS: approved_with_concerns` — report with iteration count, review file path, and a note pointing the caller at the review file's `### Outcome` reasoning (which names the waived Important findings); no menu.
  - `STATUS: not_approved_within_budget` — report with remaining findings and the (a)/(b)/(c) choice menu.

  This is the only point at which Step 5's success outcome may reach the caller.
  ~~~

**Acceptance criteria:**

- Step 5 enumerates the four new statuses (three success-path + `failed`).
  Verify: `grep -nE "^\\*\\*\\\`STATUS: (approved|approved_with_concerns|not_approved_within_budget)\\\`\\*\\*$" agent/skills/refine-code/SKILL.md` returns three matches inside Step 5, and `grep -nE "^\\*\\*\\\`STATUS: (clean|max_iterations_reached)\\\`\\*\\*$" agent/skills/refine-code/SKILL.md` returns zero matches.
- The (a)/(b)/(c) menu only appears under `not_approved_within_budget`.
  Verify: open Step 5 in `agent/skills/refine-code/SKILL.md` and confirm the choice-menu bullets `(a) Keep iterating`, `(b) Proceed with issues`, `(c) Stop execution` appear under the `STATUS: not_approved_within_budget` block — and do NOT appear under `STATUS: approved` or `STATUS: approved_with_concerns`.
- Step 6 trigger condition gates on the three success-path statuses.
  Verify: open Step 6's opening sentence in `agent/skills/refine-code/SKILL.md` and confirm it enumerates `STATUS: approved`, `STATUS: approved_with_concerns`, `STATUS: not_approved_within_budget` and skips on `STATUS: failed`.
- Step 6 model-tier validation rule for the success path requires `crossProvider.capable`.
  Verify: open Step 6's numbered rule 5 in `agent/skills/refine-code/SKILL.md` and confirm it requires `<provider>/<model>` to equal `crossProvider.capable` for both `STATUS: approved` AND `STATUS: approved_with_concerns`.
- Step 6 model-tier validation rule for budget-exhausted accepts both `crossProvider.capable` and `standard`.
  Verify: open Step 6's numbered rule 6 in `agent/skills/refine-code/SKILL.md` and confirm the `STATUS: not_approved_within_budget` branch accepts either `crossProvider.capable` OR `standard`.
- Provenance-validation rules (regex match, no `inline` substring, model-tier resolution) are preserved unchanged.
  Verify: open Step 6 in `agent/skills/refine-code/SKILL.md` and confirm rules 1–4 (regex, extract, no `inline`, re-read model-tiers.json) are still present with the same wording.

**Model recommendation:** standard

---

### Task 7: Update reviewer and refiner agent role definitions

**Files:**
- Modify: `agent/agents/plan-reviewer.md`
- Modify: `agent/agents/code-reviewer.md`
- Modify: `agent/agents/plan-refiner.md`
- Modify: `agent/agents/code-refiner.md`

**Steps:**
- [ ] **Step 1: Update plan-reviewer Principles bullet.** In `agent/agents/plan-reviewer.md`, locate the Principles bullet "**Give a clear verdict** — always conclude with `[Approved]` or `[Issues Found]`". Replace with "**Give a clear verdict** — always emit one of `Approved`, `Approved with concerns`, or `Not approved` in the `### Outcome` block at the top of your review. Critical findings always force `Not approved`; `Approved with concerns` is allowed only when zero Critical findings exist and one or more Important findings are explicitly waived in the Reasoning paragraph."

- [ ] **Step 2: Update plan-reviewer Output Artifact Contract Step 2 wording.** Locate Step 2 of the Output Artifact Contract: "The provenance line is followed by a single blank line, then the review body (Status verdict, Issues, Summary as defined in your prompt template's Output Format)." Replace "(Status verdict, Issues, Summary as defined in your prompt template's Output Format)" with "(Outcome, Strengths, Issues by severity, Recommendations as defined in your prompt template's Output Format)".

- [ ] **Step 3: Update code-reviewer Principles bullet.** In `agent/agents/code-reviewer.md`, locate the Principles bullet "**Give a clear verdict** — always include a 'Ready to merge: Yes/No/With fixes' line in the Assessment section." Replace with "**Give a clear verdict** — always emit one of `Approved`, `Approved with concerns`, or `Not approved` in the `### Outcome` block at the top of your review. Critical findings always force `Not approved`; `Approved with concerns` is allowed only when zero Critical findings exist and one or more Important findings are explicitly waived in the Reasoning paragraph."

- [ ] **Step 4: Update code-reviewer Output Artifact Contract Step 2 wording.** Locate Step 2 of the Output Artifact Contract: "The provenance line is followed by a single blank line, then the review body (Strengths, Issues, Recommendations, Assessment as defined in your prompt template's Output Format)." Replace "(Strengths, Issues, Recommendations, Assessment as defined in your prompt template's Output Format)" with "(Outcome, Strengths, Issues by severity, Recommendations as defined in your prompt template's Output Format)".

- [ ] **Step 5: Update plan-refiner role bullets.** In `agent/agents/plan-refiner.md`, locate the `## Your Role` numbered list. Update bullet 3 from "**Parse** the Status line and findings from the on-disk review" to "**Parse** the Outcome line and findings from the on-disk review". Update bullet 5 from "**Append** warnings/suggestions to the plan as `## Review Notes` only on the approved path (this is an edit to the PLAN file, not to the reviewer artifact)" to "**Append** the waived-Important pointer block to the plan as `## Review Notes` only on the `approved_with_concerns` path (this is an edit to the PLAN file, not to the reviewer artifact)".

- [ ] **Step 6: Audit plan-refiner Rules and Boundary sections.** In `agent/agents/plan-refiner.md`, scan the `## Rules` and `## Boundary with refine-plan` sections for any lingering references to `Errors`, `Warnings`, `Suggestions`, `[Approved]`, `[Issues Found]`, `issues_remaining`, or `STATUS: approved` / `STATUS: issues_remaining` / `STATUS: failed` outcomes. The rules use phrases like "every error finding feeds the single planner edit pass for that iteration" — update to "every Critical and Important finding feeds the single planner edit pass for that iteration". Update "return `issues_remaining` when the budget for this era is exhausted" to "return `not_approved_within_budget` when the budget for this era is exhausted".

- [ ] **Step 7: Audit code-refiner Rules section.** In `agent/agents/code-refiner.md`, scan the `## Rules` section for any lingering verdict-vocabulary references requiring updates. The current text has "Do NOT ignore Critical or Important findings — they must be addressed or escalated" — this is a severity reference, not an outcome reference, and stays as-is. Confirm by reading the entire `## Rules` block and confirming no references to `[Approved]`, `[Issues Found]`, `Ready to merge`, `STATUS: clean`, `STATUS: max_iterations_reached`, `Errors`, `Warnings`, or `Suggestions` exist. If any do, update per the new vocabulary.

**Acceptance criteria:**

- plan-reviewer Principles bullet references the three new outcome labels and the `### Outcome` block.
  Verify: `grep -n "Approved with concerns" agent/agents/plan-reviewer.md` returns at least one match inside the `## Principles` section, and `grep -n "\\[Approved\\] or \\[Issues Found\\]" agent/agents/plan-reviewer.md` returns zero matches.
- plan-reviewer Output Artifact Contract Step 2 references the new body shape.
  Verify: `grep -n "Outcome, Strengths, Issues by severity, Recommendations" agent/agents/plan-reviewer.md` returns a match inside the `## Output Artifact Contract` section, and `grep -n "Status verdict, Issues, Summary" agent/agents/plan-reviewer.md` returns zero matches.
- code-reviewer Principles bullet references the three new outcome labels and the `### Outcome` block.
  Verify: `grep -n "Approved with concerns" agent/agents/code-reviewer.md` returns at least one match inside the `## Principles` section, and `grep -n "Ready to merge: Yes/No/With fixes" agent/agents/code-reviewer.md` returns zero matches.
- code-reviewer Output Artifact Contract Step 2 references the new body shape.
  Verify: `grep -n "Outcome, Strengths, Issues by severity, Recommendations" agent/agents/code-reviewer.md` returns a match inside the `## Output Artifact Contract` section, and `grep -n "Strengths, Issues, Recommendations, Assessment" agent/agents/code-reviewer.md` returns zero matches.
- plan-refiner role bullets reference the new vocabulary.
  Verify: open `agent/agents/plan-refiner.md` `## Your Role` and confirm bullet 3 references "Outcome line" and bullet 5 references the `approved_with_concerns` path; `grep -n "issues_remaining" agent/agents/plan-refiner.md` returns zero matches.
- plan-refiner Rules use the new severity vocabulary.
  Verify: `grep -nE "Critical and Important finding" agent/agents/plan-refiner.md` returns at least one match inside the `## Rules` section, and `grep -nE "every error finding feeds" agent/agents/plan-refiner.md` returns zero matches.
- code-refiner Rules contain no stale verdict-vocabulary references.
  Verify: `grep -nE "\\[Approved\\]|\\[Issues Found\\]|Ready to merge|STATUS: clean|STATUS: max_iterations_reached|Errors found|Warnings found|Suggestions found" agent/agents/code-refiner.md` returns zero matches.

**Model recommendation:** standard

---

### Task 8: Update README files, requesting-code-review SKILL.md, review-fix-block, and top-level README

**Files:**
- Modify: `agent/skills/refine-plan/README.md`
- Modify: `agent/skills/refine-code/README.md`
- Modify: `agent/skills/requesting-code-review/README.md`
- Modify: `agent/skills/requesting-code-review/SKILL.md`
- Modify: `agent/skills/refine-code/review-fix-block.md`
- Modify: `README.md` (top-level)

**Steps:**
- [ ] **Step 1: Update refine-plan/README.md status enum and workflow phrasing.** In `agent/skills/refine-plan/README.md`:
  - Workflow step 7: "Commit the plan and newly written review artifacts when approved, or report remaining issues/failure." → "Commit the plan and newly written review artifacts when the outcome is `approved` or `approved_with_concerns`, or report `not_approved_within_budget`/`failed` to the caller."
  - Coordinator behavior paragraph: "alternates between `plan-reviewer` and `planner` edit mode until the plan is approved or the iteration budget is exhausted" → "alternates between `plan-reviewer` and `planner` edit mode until the plan is `Approved`/`Approved with concerns`, or the iteration budget is exhausted with `Not approved` still standing".
  - Final summary format fenced block: replace `STATUS: <approved | issues_remaining | failed>` with `STATUS: <approved | approved_with_concerns | not_approved_within_budget | failed>`.

- [ ] **Step 2: Update refine-code/README.md status handling.** In `agent/skills/refine-code/README.md`:
  - Coordinator responsibilities last bullet: "stop when clean or the budget is exhausted" → "stop when the reviewer outcome is `Approved`/`Approved with concerns`, or the budget is exhausted with `Not approved` still standing".
  - Status handling section: replace the two existing bullets (`STATUS: clean` and `STATUS: max_iterations_reached`) with:

    ~~~markdown
    - `STATUS: approved` — report the passing review and review artifact path.
    - `STATUS: approved_with_concerns` — report the passing review with a note that the reviewer waived one or more Important findings. The waiver rationale lives in the review file's `### Outcome` reasoning paragraph; no remediation iteration runs.
    - `STATUS: not_approved_within_budget` — present remaining findings and let the caller choose whether to keep iterating, proceed with known issues, or stop execution.
    - `STATUS: failed` — surface the failure reason from the four-category taxonomy (`coordinator dispatch unavailable`, `worker dispatch failed: <which worker>`, `reviewer artifact handoff failed: <specific check>`).
    ~~~

- [ ] **Step 3: Update requesting-code-review/README.md outcome parsing.** In `agent/skills/requesting-code-review/README.md`:
  - Workflow step 6: "Parse the result for `[Approved]` or `[Issues Found]`." → "Parse the result for the `**Outcome:**` line in the `### Outcome` block (one of `Approved`, `Approved with concerns`, or `Not approved`)."

- [ ] **Step 4: Update requesting-code-review/SKILL.md outcome parsing and example.** In `agent/skills/requesting-code-review/SKILL.md`:
  - Step 3 paragraph "The reviewer's output is in `results[0].finalMessage`. Parse it for `[Approved]` or `[Issues Found]` to determine next steps." → "The reviewer's output is in `results[0].finalMessage`. Parse it for the `**Outcome:**` line in the `### Outcome` block (one of `Approved`, `Approved with concerns`, or `Not approved`) to determine next steps."
  - Example block (the fenced reviewer-output sketch): replace the lines:

    ~~~
      Strengths: Clean architecture, comprehensive tests
      Issues:
        Important: Cross-file links in wiki point to non-existent filenames
        Minor: Inconsistent heading levels across pages
      Assessment: Ready with fixes
    ~~~

    with:

    ~~~
      **Outcome:** Approved with concerns
      **Reasoning:** Solid implementation; cross-file link issue waived as a follow-up.
      Strengths: Clean architecture, comprehensive tests
      Issues:
        Critical: (none)
        Important: Cross-file links in wiki point to non-existent filenames
        Minor: Inconsistent heading levels across pages
      Recommendations: Address the link issue in a follow-up commit.
    ~~~

- [ ] **Step 5: Update review-fix-block.md trailing instruction.** In `agent/skills/refine-code/review-fix-block.md`:
  - Closing line "If all previous findings are addressed and no new issues exist, report 'Ready to merge: Yes'." → "If all previous findings are addressed and no new issues exist, emit `**Outcome:** Approved` in your `### Outcome` section."

- [ ] **Step 6: Update top-level README.md code-reviewer description.** In `README.md` (the top-level file at the repo root):
  - The `### code-reviewer.md` paragraph: "Independent code reviewer for production readiness. Two modes: full diff review or hybrid re-review of the remediation diff only. Calibrates severities (Critical through Minor) and returns `[Approved]` or `[Issues Found]`. Thinking: `high`." → "Independent code reviewer for production readiness. Two modes: full diff review or hybrid re-review of the remediation diff only. Calibrates severities (Critical / Important / Minor) and returns one of `Approved`, `Approved with concerns`, or `Not approved` in its `### Outcome` block. Thinking: `high`."

**Acceptance criteria:**

- refine-plan/README.md status enum is updated.
  Verify: `grep -n "STATUS: <approved | approved_with_concerns | not_approved_within_budget | failed>" agent/skills/refine-plan/README.md` returns at least one match, and `grep -n "STATUS: <approved | issues_remaining | failed>" agent/skills/refine-plan/README.md` returns zero matches.
- refine-code/README.md status handling section enumerates four statuses.
  Verify: open the Status handling section in `agent/skills/refine-code/README.md` and confirm bullets exist for `STATUS: approved`, `STATUS: approved_with_concerns`, `STATUS: not_approved_within_budget`, and `STATUS: failed`; `grep -nE "STATUS: (clean|max_iterations_reached)" agent/skills/refine-code/README.md` returns zero matches.
- requesting-code-review/README.md outcome parsing line uses the new vocabulary.
  Verify: `grep -n "Approved with concerns" agent/skills/requesting-code-review/README.md` returns at least one match in the Workflow section, and `grep -n "\\[Approved\\] or \\[Issues Found\\]" agent/skills/requesting-code-review/README.md` returns zero matches.
- requesting-code-review/SKILL.md uses the new outcome vocabulary in both the dispatch paragraph and the example block.
  Verify: `grep -n "\\*\\*Outcome:\\*\\*" agent/skills/requesting-code-review/SKILL.md` returns at least two matches (one in the dispatch paragraph, one in the example block), and `grep -n "\\[Approved\\] or \\[Issues Found\\]" agent/skills/requesting-code-review/SKILL.md` returns zero matches; the example block contains the literal `Outcome: Approved with concerns` line.
- review-fix-block.md trailing instruction references the new outcome vocabulary.
  Verify: `grep -n "Outcome: Approved" agent/skills/refine-code/review-fix-block.md` returns at least one match, and `grep -n "Ready to merge: Yes" agent/skills/refine-code/review-fix-block.md` returns zero matches.
- Top-level README.md code-reviewer description references the new vocabulary.
  Verify: `grep -n "Approved with concerns" README.md` returns at least one match in the `### code-reviewer.md` paragraph, and `grep -n "\\[Approved\\] or \\[Issues Found\\]" README.md` returns zero matches.

**Model recommendation:** cheap

---

### Task 9: Update execute-plan/SKILL.md Step 15 status handling

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Update Step 15's status handler block.** In `agent/skills/execute-plan/SKILL.md`, locate Step 15's "Handle the result" block (currently containing two cases: `clean` and `max_iterations_reached`). Replace it with:

  ~~~markdown
  3. **Handle the result:**

     **`approved`:** Include the review summary (iteration count, review file path) in the Step 16 completion report. Proceed to Step 16.

     **`approved_with_concerns`:** Include the review summary (iteration count, review file path, AND a note pointing the user at the review file's `### Outcome` reasoning — which names the waived Important findings and the rationale for waiving each) in the Step 16 completion report. Proceed to Step 16.

     **`not_approved_within_budget`:** Present remaining findings to the user; offer: **(a)** keep iterating (budget resets), **(b)** proceed with issues noted, or **(c)** stop execution. The per-plan .pi/test-runs/<plan-name>/ directory is preserved on this exit path so the user can inspect run artifacts after stop.

     **Review disabled** (user chose to disable in Step 3): Skip directly to Step 16.
  ~~~

  Note: the `STATUS: failed` case is implicit in the surrounding skill flow — `refine-code` SKILL.md Step 6's validation may surface a different error path. No separate Step 15 handler is required for `failed` since the surrounding language and Edge Cases handle it.

**Acceptance criteria:**

- Step 15's result handler enumerates the three new success-path statuses with appropriate actions.
  Verify: open Step 15 in `agent/skills/execute-plan/SKILL.md` and confirm bullets/cases exist for `**\`approved\`:**`, `**\`approved_with_concerns\`:**`, and `**\`not_approved_within_budget\`:**`; `grep -nE "\\*\\*\\\`(clean|max_iterations_reached)\\\`:\\*\\*" agent/skills/execute-plan/SKILL.md` returns zero matches.
- The `approved_with_concerns` handler instructs the executor to include a note about waived Important findings in the completion report.
  Verify: open Step 15's `approved_with_concerns` case in `agent/skills/execute-plan/SKILL.md` and confirm the body contains the substring "waived Important findings" or equivalent reference to the reviewer's `### Outcome` reasoning.
- The `not_approved_within_budget` handler retains the (a)/(b)/(c) menu.
  Verify: open Step 15's `not_approved_within_budget` case in `agent/skills/execute-plan/SKILL.md` and confirm the bullets `(a)`, `(b)`, `(c)` are present with the same semantics (keep iterating, proceed, stop execution).

**Model recommendation:** standard

---

### Task 10: Manual smoke runs of refine-plan and refine-code

**Files:**
- (No file edits — this task is the manual verification step.)

**Steps:**
- [ ] **Step 1: Smoke-run `refine-plan` against an existing plan.** Pick an existing plan file under `.pi/plans/` (e.g. `.pi/plans/done/2026-04-29-2026-04-29-refiner-coordinator-hardening.md` if available, or any other recent plan) — or generate a small plan via `generate-plan` for this purpose. Invoke `refine-plan <PLAN_PATH>` with `--max-iterations 1` to keep the run cheap. Expect the run to dispatch `plan-refiner`, which dispatches `plan-reviewer`, and the reviewer to write a review file under `.pi/plans/reviews/`.

- [ ] **Step 2: Inspect the produced plan review file.** Open the review file written by Step 1 (path will be in `refine-plan`'s final report). Confirm it has, in order: a `**Reviewer:** <provider>/<model> via <cli>` first line, a blank line, then `### Outcome` (with `**Outcome:**` and `**Reasoning:**` lines), `### Strengths`, `### Issues` (with `#### Critical (Must Fix)`, `#### Important (Should Fix)`, `#### Minor (Nice to Have)` sub-headings — empty ones rendered as `_None._`), `### Recommendations`. There should be no `### Status` or `### Summary` heading.

- [ ] **Step 3: Inspect the `refine-plan` final-report STATUS.** Confirm `refine-plan` reported one of `STATUS: approved | approved_with_concerns | not_approved_within_budget | failed`. If `approved_with_concerns`, confirm the plan file now ends with the new `## Review Notes` block containing `_Approved with concerns by plan reviewer. Full review: …_` and `### Important (waived)` bullets sourced from the reviewer's reasoning.

- [ ] **Step 4: Smoke-run `refine-code` against a real diff.** Pick a small recent diff range — e.g. a single recent commit on `main` (`BASE_SHA=$(git rev-parse HEAD~1)`, `HEAD_SHA=$(git rev-parse HEAD)`). Invoke `refine-code` with that range, a small description, and `--max-iterations 1` to keep the run cheap. Expect the run to dispatch `code-refiner`, which dispatches `code-reviewer` (and possibly `coder` if findings emerge), and the reviewer to write a review file under `.pi/reviews/`.

- [ ] **Step 5: Inspect the produced code review file.** Open the review file written by Step 4. Confirm it has, in order: the `**Reviewer:**` first line, a blank line, then `### Outcome`, `### Strengths`, `### Issues` (with the three H4 severity sub-headings, empty ones rendered as `_None._`), `### Recommendations`. There should be no `### Assessment` heading or `Ready to merge` line.

- [ ] **Step 6: Inspect the `refine-code` final-report STATUS.** Confirm `refine-code` reported one of `STATUS: approved | approved_with_concerns | not_approved_within_budget | failed`. If the smoke run produces a `STATUS: failed` due to model/availability issues, that is acceptable for this task as long as the failure reason follows the four-category taxonomy (`coordinator dispatch unavailable`, `worker dispatch failed: <which worker>`, or `reviewer artifact handoff failed: <specific check>`).

**Acceptance criteria:**

- A live `refine-plan` smoke run produces a review whose body matches the new structure and an outer status drawn from the new four-value enum.
  Verify: read the review file path produced by Step 1 (recorded in the `refine-plan` final report under `REVIEW_PATHS:`), open it, and confirm the on-disk file's body has, in order, `### Outcome`, `### Strengths`, `### Issues`, `#### Critical (Must Fix)`, `#### Important (Should Fix)`, `#### Minor (Nice to Have)`, `### Recommendations` headings — and that the `refine-plan` final report's `STATUS:` line names one of `approved`, `approved_with_concerns`, `not_approved_within_budget`, or `failed`.
- A live `refine-code` smoke run produces a review whose body matches the new structure and an outer status drawn from the new four-value enum.
  Verify: read the review file path produced by Step 4 (recorded in the `refine-code` coordinator's `## Review File` block, or surfaced by the SKILL's final report), open it, and confirm the on-disk file's body has, in order, `### Outcome`, `### Strengths`, `### Issues`, `#### Critical (Must Fix)`, `#### Important (Should Fix)`, `#### Minor (Nice to Have)`, `### Recommendations` headings — and that the `refine-code` SKILL's caller-facing report names one of `approved`, `approved_with_concerns`, `not_approved_within_budget`, or `failed`.

**Model recommendation:** standard

---

## Dependencies

- Task 3 depends on: Task 1 (plan-refiner parses plan reviewer output format).
- Task 4 depends on: Task 2 (code-refiner parses code reviewer output format).
- Task 5 depends on: Task 3 (refine-plan SKILL recognizes the four-status enum the refiner emits).
- Task 6 depends on: Task 4 (refine-code SKILL recognizes the four-status enum the refiner emits).
- Task 7 depends on: Task 1, Task 2, Task 3, Task 4 (agent rules cite the new contract from prompts).
- Task 8 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6 (READMEs and cross-callers reflect the contract).
- Task 9 depends on: Task 6 (execute-plan consumes the refine-code SKILL's status enum).
- Task 10 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9 (smoke runs verify the end-to-end contract after every file is updated).

## Risk Assessment

- **Risk: emit-site / failure-mode-table drift.** The plan-refiner and code-refiner prompts emit failure-reason strings inline at multiple sites (Hard rules, Per-Iteration Steps 1, 5a–5d, Planner Edit Pass Step 3/4, etc.) AND list the canonical templates in their `## Failure Modes` section. Mitigation: Tasks 3 and 4 each include explicit Step 9/10 "update inline emit sites" sub-steps that enumerate every existing site by step number, so an executor must update each one rather than only the table. The acceptance criteria use grep recipes that confirm the OLD reason strings are absent everywhere in each prompt file (not just inside the table).

- **Risk: re-review compatibility on second-pass plan reviews.** When `refine-plan` runs against a plan that already has a `## Review Notes` section appended by a prior `approved_with_concerns` outcome, the reviewer must disregard that section. Mitigation: Task 1 Step 5 adds an explicit "Re-review compatibility" instruction to the plan reviewer prompt's `## Review Checklist`. The acceptance criterion confirms the instruction's presence and wording.

- **Risk: per-finding template drift between plan and code reviewers.** The spec requires a uniform per-finding template — bold lead line + What/Why it matters/Recommendation bullets — across both reviewer prompts. Mitigation: Tasks 1 and 2 use identical template wording in their respective Output Format rewrites (only the locator differs: `Task N` vs `file:line`). The acceptance criteria for both tasks confirm the H4 sub-heading set and the `_None._` empty-rendering rule.

- **Risk: Outcome parser brittleness if a reviewer writes a slightly different label.** The refiners require an exact-match on one of three labels. A reviewer that writes `Approve` or `Approved (with concerns)` would fail. Mitigation: Task 3 Step 1 and Task 4 Step 1 specify "MUST be exactly one of" the three labels and require an explicit `STATUS: failed` with reason `reviewer artifact handoff failed: provenance malformed at <path>: missing or unrecognized Outcome label` if no match. This surfaces the bug fast rather than masking it.

- **Risk: TypeScript test infrastructure (`agent/extensions/`) breaks.** The codebase scan confirmed no TypeScript test parses verdict text or refiner status strings. Mitigation: no test changes required; the spec explicitly calls this out as out-of-scope. The smoke runs in Task 10 are the verification mechanism.

- **Risk: `### Outcome` Reasoning paragraph is too tight for multiple waived Importants.** Spec Open Question notes this. Mitigation: leave the constraint as a single 1–2 sentence paragraph per the spec's default; revisit only if smoke runs surface friction. The plan does not pre-empt the open question.

- **Risk: `approved_with_concerns` on the code side has no diff/file artifact analog.** Spec is explicit: no code-side `## Review Notes` append; the diff plus the review file are the artifacts. Mitigation: Task 4's `Approved with concerns` branch in Final Verification simply records the result and exits with the new status — no append logic. Task 6's SKILL.md handler stashes a "note about waived Importants pointing at the review file" but does not modify any artifact. The asymmetry is documented in Task 4 Step 1's note and Task 6 Step 5's closing paragraph.
