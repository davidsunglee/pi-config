# Harden Planning/Refinement Workflow Boundaries and Failure Handling

Source: TODO-40e342b9

## Goal

Reduce integration-boundary failures in the planning and refinement pipeline by applying targeted tolerance at human/LLM-authored Markdown boundaries, adding a deterministic on-disk fallback for missing subagent transport markers uniformly across all five artifact handoffs, and replacing the exhausted-budget user menu with explicit choices that do not silently default to execution-oriented next steps. The failures these changes address were transport/format drift, not substantive plan or code defects, and the unifying principle is to make machine-trust gates strict while accepting harmless surface variation at points where humans and LLMs author content.

## Context

The pipeline currently fails in several boundary scenarios:

- `agent/skills/execute-plan/scripts/extract-plan-tasks.py` strictly requires `### Task N: Title` task headings and exact sentence-case section headings (`## Architecture summary`, `## Tech stack`, `## Risk assessment`). Plans written with em-dash separators (`### Task 1 — Title`) or title-case section headings trigger a misleading `missing_required_section: numbered_tasks` error with no targeted diagnostic.
- `agent/skills/_shared/scripts/extract-provenance-preamble.py` only accepts plain-label preamble lines (`Source:`, `Scout brief:`, `Git SHA:`). The bold-label variants (`**Source:**`, `**Scout brief:**`, `**Git SHA:**`) that appear elsewhere in this repo are silently ignored.
- `agent/skills/execute-plan/scripts/parse-coder-report.py` requires an unfenced `^STATUS:\s*(\S+)` line; coder reports written with a Markdown heading prefix (`## STATUS: DONE`) fail with `status_line_missing` and trigger pointless retries that do not change the implementation.
- The five artifact handoffs in the pipeline — `BRIEF_ARTIFACT` (scout), `SPEC_ARTIFACT` (define-spec), `PLAN_ARTIFACT` (generate-plan/planner), `REVIEW_ARTIFACT` (refine-code/code-reviewer), and `TEST_RESULT_ARTIFACT` (execute-plan/test-runner) — all rely on a strict subagent terminal-message marker line. When the marker is dropped (e.g., the subagent appends a summary after the marker), validation fails even when the expected on-disk artifact exists, is well-formed, and was freshly written by the dispatched subagent. There is no deterministic fallback that treats the on-disk artifact as authoritative.
- `agent/skills/refine-plan/SKILL.md` Step 10 presents an (a)/(b) menu on `STATUS: not_approved_within_budget` whose (b) branch's commit behavior depends on `AUTO_COMMIT_ON_APPROVAL`. `agent/skills/generate-plan/SKILL.md` Step 5 then unconditionally offers `execute-plan` after `refine-plan` returns, including for unapproved-budget-exhausted outcomes — sidestepping the user's explicit accept-or-revise decision when the plan was never approved.
- `agent/skills/refine-code/SKILL.md` Step 5 has an analogous three-option menu on `not_approved_within_budget` with different keyboard letters and wording from `refine-plan`'s.

Surveyed files: `agent/skills/execute-plan/scripts/extract-plan-tasks.py`, `agent/skills/execute-plan/scripts/parse-coder-report.py`, `agent/skills/_shared/scripts/extract-provenance-preamble.py`, `agent/skills/_shared/scripts/parse-artifact-handoff.py`, `agent/skills/_shared/scripts/parse-test-runner-artifact.py`, `agent/skills/_shared/scripts/validate-review-provenance.py`, `agent/skills/execute-plan/execute-task-prompt.md`, `agent/skills/refine-code/SKILL.md`, `agent/skills/refine-code/refine-code-prompt.md`, `agent/agents/code-refiner.md`, `agent/skills/requesting-code-review/review-code-prompt.md`, `agent/agents/code-reviewer.md`, `agent/skills/generate-plan/SKILL.md`, `agent/skills/refine-plan/SKILL.md`, `agent/skills/scout/SKILL.md`, `agent/skills/define-spec/SKILL.md`, `agent/agents/scout.md`, `agent/agents/spec-designer.md`, `agent/agents/planner.md`, `agent/agents/test-runner.md`.

## Requirements

### Parser leniency at human/LLM-authored boundaries

1. **Plan task heading separators**: `extract-plan-tasks.py` accepts `### Task N: Title`, `### Task N — Title`, `### Task N – Title`, and `### Task N - Title` (colon, em dash, en dash, hyphen) as equivalent task headings with identical downstream semantics. The H3 level is required, the literal token `Task N` is required, ordered numeric tasks (no gaps, no duplicates) are still enforced, a separator is still required (`### Task 1` with no separator and no title is still malformed), and fence-aware behavior is preserved.

2. **Targeted diagnostic for malformed task headings**: When `extract-plan-tasks.py` sees a line matching `^### Task \d+\b` that does not match an accepted heading shape, it emits a targeted error citing the line number and the observed heading text (rather than the misleading `missing_required_section: numbered_tasks` error the user currently sees).

3. **Plan section heading and label case variants**: `extract-plan-tasks.py` accepts both title-case and sentence-case forms of the canonical required section headings (`## Architecture Summary` / `## Architecture summary`; `## Tech Stack` / `## Tech stack`; `## Risk Assessment` / `## Risk assessment`) and the canonical bold labels (`**Acceptance Criteria:**` / `**Acceptance criteria:**`; `**Model Recommendation:**` / `**Model recommendation:**`). The file-scope prefixes (`Create:` / `Modify:` / `Test:`) and the `Verify:` recipe-line marker are accepted case-insensitively (e.g., lowercase `verify:` parses successfully); `Verify:` still requires exactly one immediately following recipe line per criterion. Fence-aware behavior is preserved — variants inside fenced code blocks are ignored.

4. **No vague-alias acceptance**: Aliases that change the semantic identity of a section (e.g., `## Implementation` for `## Tasks`) are NOT accepted. Tolerance is limited to capitalization and Markdown-punctuation variants of canonical names.

5. **Provenance preamble bold labels**: `extract-provenance-preamble.py` accepts the bold-label forms `**Source:** TODO-<id>`, `**Scout brief:** docs/briefs/<file>`, and `**Git SHA:** <40-char hex>` in addition to the existing plain-label forms. Bounded preamble scanning, fence-awareness, the `TODO-<8 lowercase hex>` shape requirement, the `docs/briefs/<file>` shape requirement, and the existing `git_sha_malformed` failure for invalid SHA values are all preserved across both label forms.

6. **Coder report STATUS heading prefix**: `parse-coder-report.py` accepts an unfenced `STATUS:` line with an optional leading Markdown heading marker (any of `#` through `######`), so reports written with `## STATUS: DONE` or `### STATUS: BLOCKED` parse successfully. The status token set stays strict (only `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT`); STATUS lines inside fenced code blocks still do not count; prose variants like `Status is done` are still rejected.

### Prompt hardening (canonical generation stays strict)

7. **Coder STATUS terminal-line contract**: `agent/skills/execute-plan/execute-task-prompt.md` (and any derived coder prompts) replaces permissive wording such as "Use this exact structure:" with an explicit terminal-line contract: the first non-fenced line of the report MUST be exactly `STATUS: <token>` with no Markdown heading marker, bullet, bolding, or preamble; no summary text precedes the STATUS line.

8. **Marker-emitting subagent terminal-message contract**: Every subagent that emits an artifact-handoff marker (scout/`BRIEF_ARTIFACT`, spec-designer/`SPEC_ARTIFACT`, planner/`PLAN_ARTIFACT`, code-reviewer/`REVIEW_ARTIFACT`, test-runner/`TEST_RESULT_ARTIFACT`) follows the same strict terminal-message contract uniformly: the marker line is the final non-empty assistant-message line, anchored at column 1, with no prose/markdown/additional lines after it; the same exact string is emitted via `subagent_done(message=…)`. Permissive language such as "Conversational text before the marker line is permitted" is removed from these prompts.

### Missing-marker on-disk fallback (uniform across all five artifact handoffs)

9. **Structural-input fallback design (no flag)**: `parse-artifact-handoff.py` is extended so that when the caller supplies BOTH `--expected-path` AND a pre-dispatch freshness baseline (e.g., the mtime of the expected path captured before dispatch, or a "did not exist" sentinel), a missing marker is acceptable if the expected file exists at the expected path, is non-empty, and is fresh (mtime newer than the baseline). When either of these inputs is absent, missing-marker behavior remains strict — no semantic change for any caller that does not pass the new structural inputs. The fallback is NOT gated by an opt-in flag; the structural inputs themselves bound the behavior.

10. **Test-runner parser parity**: `parse-test-runner-artifact.py` adopts the same structural-input fallback for the marker-handoff portion of its parse. The structural-format validation it performs (required-header presence and order, EXIT_CODE / FAILING_IDENTIFIERS_COUNT / NON_RECONCILABLE_COUNT integer parse and reconciliation, raw-output marker presence) remains strict and is independent of the missing-marker fallback path.

11. **All five call sites adopt the fallback**: scout (`BRIEF_ARTIFACT`), define-spec (`SPEC_ARTIFACT`), generate-plan (`PLAN_ARTIFACT`), refine-code via code-refiner (`REVIEW_ARTIFACT`), and execute-plan via test-runner (`TEST_RESULT_ARTIFACT`) each capture a pre-dispatch freshness baseline of the expected artifact path immediately before dispatching the subagent and pass both `--expected-path` and the baseline to their respective parser invocations. Each call site keeps its existing artifact-specific validation in addition to the fallback: REVIEW_ARTIFACT continues to run `validate-review-provenance.py` against the on-disk file and continues to verify `**Verdict:**` is present and parses as one of the accepted labels; TEST_RESULT_ARTIFACT continues to run its full structural-format validation; the rest keep their existing existence + non-empty + path-match checks.

12. **Fallback rejection cases preserved**: Missing-marker is still rejected (no fallback acceptance) when any of the following holds: the expected file is missing or empty; the marker is present but its path mismatches `--expected-path`; the on-disk file is stale (mtime not newer than the baseline); a marker-shaped line appears only inside a fenced or quoted block; for `REVIEW_ARTIFACT`, the on-disk reviewer-provenance line is missing or malformed, or `**Verdict:**` is absent or unrecognized.

### Exhausted-budget UX and menu alignment

13. **`refine-plan` three-option menu**: On `STATUS: not_approved_within_budget`, `refine-plan` Step 10 presents exactly these three options (replacing the current (a)/(b) menu):
    - **(c) Continue refining plan** — commit the current era's plan + review artifacts, reset budget, re-enter Step 6 to dispatch era N+1 with `CARRY_OVER_REVIEW` set to the just-committed era's review file.
    - **(r) Save plan for manual review** — commit the current era's plan + review artifacts, exit `refine-plan` with `STATUS: not_approved_within_budget` and `COMMIT: committed`.
    - **(x) Stop execution** — leave the plan and all current-era review artifacts uncommitted, exit `refine-plan` with `STATUS: not_approved_within_budget` and `COMMIT: left_uncommitted`. No files are deleted; on-disk plan and reviews are preserved for the user to inspect or remove manually.

14. **Menu overrides `AUTO_COMMIT_ON_APPROVAL` on the not-approved path**: The three-option menu is always presented on `not_approved_within_budget` regardless of `AUTO_COMMIT_ON_APPROVAL`; the user's choice itself encodes the commit decision. `AUTO_COMMIT_ON_APPROVAL` continues to govern the `approved` and `approved_with_concerns` paths unchanged.

15. **`generate-plan` suppresses execute-plan offer on not-approved**: After `refine-plan` returns, `generate-plan` Step 5 offers the `execute-plan` prompt only when `STATUS` is `approved` or `approved_with_concerns`. On `STATUS: not_approved_within_budget` (whether `COMMIT: committed` from (r) or `COMMIT: left_uncommitted` from (x)), `generate-plan` reports the parsed summary and does not offer `execute-plan`.

16. **`refine-code` menu language alignment (semantics unchanged)**: `refine-code`'s existing three-option menu is relabeled to: **(c) Continue refining code** — commit and iterate; **(p) Proceed with issues** — continue workflow despite findings; **(x) Stop execution** — stop workflow. The semantic mapping is (c) ← current (a) Keep iterating, (p) ← current (b) Proceed with issues, (x) ← current (c) Stop execution. No behavior change beyond keyboard-letter and wording alignment with `refine-plan`'s menu.

## Constraints

- **Fence-aware parsing preserved across all leniency changes**: Structure inside fenced code blocks must not count. Fenced fake STATUS lines, fenced task headings, fenced provenance lines, fenced marker-shaped lines, etc. remain ignored.
- **Canonical generation stays strict**: Plan, spec, brief, and report templates and generation prompts continue to produce canonical formats (colon-separated task headings, sentence-case section headings, unprefixed STATUS lines, plain-label provenance, anchored terminal markers). Parser tolerance is a one-way accept; generators do not start emitting variants.
- **Out-of-scope parsers stay strict**: The following parsers are NOT relaxed by this work: `agent/skills/execute-plan/scripts/parse-verifier-report.py`; `agent/skills/_shared/scripts/validate-review-provenance.py`; `agent/skills/refine-code/scripts/parse-refine-code-summary.py`; `agent/skills/refine-plan/scripts/parse-refine-plan-summary.py`; `agent/skills/refine-plan/scripts/validate-and-parse-plan-review.py`. These guard machine-trust decisions and have no observed failures justifying tolerance.
- **Out-of-scope wording in the todo is superseded for `parse-artifact-handoff.py`**: The todo's "Out of scope" section says `parse-artifact-handoff.py` should remain strict by default and that "Any missing-marker acceptance must be explicit and bounded to the expected-path fallback described above." The structural-input fallback design satisfies the "explicit and bounded" intent through required structural inputs (expected path + freshness baseline), not via an opt-in flag. The flag the todo originally suggested is dropped.
- **No new STATUS or COMMIT field values**: The refine-plan menu rework reuses the existing `STATUS: not_approved_within_budget` and existing `COMMIT: committed | left_uncommitted | not_attempted` values. No new field values are introduced in the `refine-plan` summary.
- **No file deletion in any menu option**: The (x) Stop execution option leaves on-disk files alone; it does not `rm` plan or review files. No other menu option deletes files either.
- **Coder STATUS token set stays strict**: Section 6's heading-prefix tolerance does NOT relax the accepted token set — only `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT` are accepted.
- **Freshness baseline is per-dispatch**: Each call site captures the freshness baseline immediately before dispatching the subagent for that invocation; baselines from prior runs are not reused, and a global "any recent file passes" interpretation is not acceptable.
- **No new marker types or marker-emitting code paths**: The fallback is applied to the five existing handoffs only. No new artifact-handoff markers or callers are introduced by this work.

## Acceptance Criteria

### Parser leniency

- A plan with `### Task N — Title` (em dash) headings parses successfully with the same task list, wave assignment, and downstream JSON shape as the canonical `### Task N: Title` form. The same holds for `### Task N – Title` (en dash) and `### Task N - Title` (hyphen).
- A plan with a malformed task-like heading (e.g., `### Task 1` with no separator or title, or `### Task 1Title` with no separator) produces a targeted `malformed_task_heading`-style diagnostic citing line and observed heading, rather than `missing_required_section: numbered_tasks`.
- A plan with `## Architecture Summary` / `## Tech Stack` / `## Risk Assessment` (title case) parses successfully alongside the existing sentence-case forms.
- A plan with `**Acceptance Criteria:**` and `**Model Recommendation:**` (title case) parses successfully.
- A plan using lowercase `verify:` recipe lines parses successfully.
- A vague alias like `## Implementation` continues to fail with the appropriate missing-section error (no acceptance as an alias for `## Tasks`).
- Variants inside fenced code blocks (e.g., a fenced `### Task 1 — Foo`) continue to be ignored by the parser.
- A preamble with `**Source:** TODO-<id>` / `**Scout brief:** docs/briefs/<file>` / `**Git SHA:** <sha>` parses successfully with the same fields populated as the plain-label form.
- A malformed Git SHA still produces the existing `git_sha_malformed` failure regardless of whether the line is in plain or bold form.
- A coder report whose first non-fenced status-like line is `## STATUS: DONE` or `### STATUS: BLOCKED` parses successfully with `status` equal to the token.
- A coder report whose only STATUS-shaped lines are inside fenced blocks still fails with `status_line_missing`.
- A coder report with an unknown status token (e.g., `STATUS: NOT_REAL`) still fails with `status_token_invalid`.
- All existing parser tests continue to pass without modification.

### Missing-marker fallback

- For each of the five handoffs (BRIEF, SPEC, PLAN, REVIEW, TEST_RESULT): marker present and valid → pass with marker validation.
- For each of the five handoffs: marker missing + expected file exists + non-empty + fresh + per-artifact validation passes → pass, with the fallback path clearly indicated (e.g., a warning or fallback-flag in the success output) so the caller can log that the on-disk file was used.
- For each handoff: marker missing + expected file missing or empty → fail with the existing strict-failure label.
- For each handoff: marker missing + expected file present but stale (mtime not newer than baseline) → fail.
- For each handoff: marker missing + caller did not supply both `--expected-path` AND the freshness baseline → fail (strict behavior unchanged for callers that do not opt into the fallback inputs).
- For `REVIEW_ARTIFACT` specifically: marker missing + on-disk reviewer-provenance line absent or malformed → fail; marker missing + `**Verdict:**` line absent or unrecognized → fail.
- For each handoff: marker present but path mismatches `--expected-path` → fail with the existing path-mismatch label (the fallback never bypasses path-mismatch errors).
- A marker-shaped line inside a fenced or quoted block is never accepted as a valid terminal marker, regardless of fallback inputs.

### Exhausted-budget UX

- `refine-plan` on `STATUS: not_approved_within_budget` displays exactly the three options (c) Continue refining plan, (r) Save plan for manual review, (x) Stop execution with their agreed labels.
- (c) commits the current era, then re-enters Step 6 with `STARTING_ERA` recomputed by re-scanning `docs/plans/reviews/` and with `CARRY_OVER_REVIEW` set to the just-committed era's review file; era N+1 dispatches with a fresh iteration budget.
- (r) commits the current era, exits `refine-plan` with `STATUS: not_approved_within_budget`, `COMMIT: committed`, and the existing `PLAN_PATH` / `REVIEW_PATHS` / `STRUCTURAL_ONLY` summary fields.
- (x) leaves all files uncommitted, exits `refine-plan` with `STATUS: not_approved_within_budget`, `COMMIT: left_uncommitted`, and the same summary fields. No files are deleted from disk.
- The three-option menu is presented regardless of `AUTO_COMMIT_ON_APPROVAL`; the `approved` and `approved_with_concerns` paths retain existing `AUTO_COMMIT_ON_APPROVAL` semantics unchanged.
- `generate-plan` Step 5 offers `execute-plan` only on `STATUS: approved` or `approved_with_concerns`. On `not_approved_within_budget`, the offer is suppressed; the user sees the parsed `refine-plan` summary without a next-step prompt.
- `refine-code`'s exhausted-budget menu uses (c) Continue refining code, (p) Proceed with issues, (x) Stop execution labels; each option's downstream behavior is unchanged from the current (a)/(b)/(c) semantics.

## Non-Goals

- Generalized parser relaxation beyond the listed punctuation and capitalization variants. Vague aliases (e.g., `## Implementation` for `## Tasks`) are NOT accepted.
- Relaxing any parser listed in the todo's "Out of scope / keep strict by default" section other than `parse-artifact-handoff.py` (and the analogous marker portion of `parse-test-runner-artifact.py`), whose out-of-scope wording is explicitly superseded by the structural-input fallback design.
- Changing the canonical generation format used by plan/spec/report templates and generators. Tolerance applies to the input side of parsers only.
- Adding new `STATUS` or `COMMIT` field values to the `refine-plan` summary or to any other inter-skill protocol surface.
- Deleting files in the (x) Stop execution option, or in any other refine-plan or refine-code menu choice.
- Changing the semantics of `refine-code`'s exhausted-budget menu options. Only their keyboard letters and wording are aligned with `refine-plan`'s.
- Adding the structural-input fallback to parsers other than `parse-artifact-handoff.py` and `parse-test-runner-artifact.py`. No new marker types or marker-emitting code paths are introduced.
- Adding a "proceed with unapproved plan to execute-plan" option to `refine-plan`'s menu. Users who want to execute an unapproved plan use (r) Save plan for manual review, inspect it, and then manually invoke `execute-plan`.
