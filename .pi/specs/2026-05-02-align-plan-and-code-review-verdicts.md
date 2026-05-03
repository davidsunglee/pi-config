# Align plan-review and code-review verdicts

Source: TODO-01bb6a2b

## Goal

Unify the verdict vocabulary, output structure, and approval semantics produced by the plan-review and code-review pipelines so the two surfaces read consistently and downstream callers (refiners, executors, humans) can interpret them with the same mental model. Eliminate the current disjoint terminology — `[Approved]` / `[Issues Found]` vs `Ready to merge: Yes / No / With fixes`, Error / Warning / Suggestion vs Critical / Important / Minor, `approved` / `issues_remaining` vs `clean` / `max_iterations_reached` — by adopting one shared severity vocabulary, one shared outcome trio, one shared output shape, one shared blocking rule, and one shared refiner status enum. Domain-specific adornments (Task N vs file:line locators; the plan-side `## Review Notes` append) are preserved where they reflect genuine domain difference.

## Context

The verdict surface is governed entirely by markdown contracts; there is no TypeScript test coverage of verdict text. Touchpoints:

- **Reviewer prompt templates** (define what each reviewer emits):
  - `agent/skills/generate-plan/review-plan-prompt.md` — plan reviewer's output format.
  - `agent/skills/requesting-code-review/review-code-prompt.md` — code reviewer's output format.
- **Refiner prompts** (parse reviewer output, drive iteration loop):
  - `agent/skills/refine-plan/refine-plan-prompt.md`.
  - `agent/skills/refine-code/refine-code-prompt.md`.
- **Skill orchestrators** (handle refiner result, commit gate, status reporting):
  - `agent/skills/refine-plan/SKILL.md`.
  - `agent/skills/refine-code/SKILL.md`.
- **Agent role definitions** (standing identity rules for reviewers and refiners):
  - `agent/agents/plan-reviewer.md`, `agent/agents/code-reviewer.md`, `agent/agents/plan-refiner.md`, `agent/agents/code-refiner.md`.
- **README files** that quote status enums or verdict labels:
  - `agent/skills/refine-plan/README.md`, `agent/skills/refine-code/README.md`, `agent/skills/requesting-code-review/README.md`.

Existing review files under `.pi/plans/reviews/` and `.pi/reviews/` (active and archived) use the legacy vocabulary; they are historical artifacts and stay as-is. Only newly produced reviews adopt the unified vocabulary.

Discrepancies as of today:

| Dimension | Plan side | Code side |
|---|---|---|
| Reviewer verdict | `**[Approved]**` / `**[Issues Found]**` (binary) | `**Ready to merge: Yes / No / With fixes**` (ternary) |
| Severity vocabulary | Error / Warning / Suggestion | Critical / Important / Minor |
| Blocking threshold | Error only | Critical + Important |
| Refiner status enum | `approved` / `issues_remaining` / `failed` | `clean` / `max_iterations_reached` / `failed` |
| Reviewer sections | Status / Issues / Summary | Strengths / Issues / Recommendations / Assessment |
| Severity grouping | Inline tag per finding | H4 sub-sections by severity |
| Approved-side effect | Append `## Review Notes` to plan | None |

## Requirements

### Outcome vocabulary

- Reviewers (both plan and code) emit one of three outcome labels:
  - `Approved` — no Critical findings AND no Important findings present.
  - `Approved with concerns` — no Critical findings; one or more Important findings present that the reviewer judges acceptable to ship/proceed without forced remediation.
  - `Not approved` — one or more Critical findings, OR one or more Important findings the reviewer judges as needing real remediation.
- Critical findings always force `Not approved`. Reviewers cannot downgrade them.
- Reviewer prompts explicitly document when `Approved with concerns` is appropriate (e.g., the concern is out of scope for the current change, is a follow-up task, or is a low-impact deviation) and forbid it when any Critical finding is present.

### Severity vocabulary

- Both pipelines adopt the trio: **Critical / Important / Minor**.
- Working definitions (preserved across both prompts):
  - **Critical** — code: bugs, security issues, data loss risks, broken functionality. Plan: missing tasks, wrong dependencies, references to non-existent outputs, missing or placeholder `Verify:` lines, tasks that cannot be executed as written.
  - **Important** — code: architecture problems, missing features, poor error handling, test gaps. Plan: vague acceptance criteria, sizing concerns, cross-task consistency risks, constraint-documentation gaps.
  - **Minor** — code: code style, optimization opportunities, doc improvements. Plan: nit-level suggestions, low-value polish.

### Reviewer output structure

- Top-of-body section: `### Outcome` immediately under the `**Reviewer:**` provenance line. Contents:
  - `**Outcome: Approved | Approved with concerns | Not approved**`
  - `**Reasoning:** <1–2 sentences justifying the outcome>`. On `Approved with concerns`, the reasoning explicitly names the Important findings being waived and the rationale for waiving each.
- Remaining sections in order, both sides: `### Strengths`, `### Issues`, `### Recommendations`. No separate Summary section — the Outcome's reasoning carries that role; the refiner's status block carries the counts.
- `### Issues` is grouped under three H4 sub-headings: `#### Critical (Must Fix)`, `#### Important (Should Fix)`, `#### Minor (Nice to Have)`. Each finding inside follows a uniform template:
  - Bold lead line: `**<Task N | file:line>: <short description>**` — `Task N` for plan reviewers, `file:line` for code reviewers.
  - Bullet list: `- **What:** ...`, `- **Why it matters:** ...`, `- **Recommendation:** ...`.
- Empty severity sub-sections render as `_None._` rather than being omitted, so the structure is uniform across all reviews.

### Refiner status enum

- Refiners (`plan-refiner` and `code-refiner`) report exactly one of: `approved` / `approved_with_concerns` / `not_approved_within_budget` / `failed`. Ordered most-positive to most-negative.
- Mapping from review pass to refiner status:
  - Most recent reviewer outcome `Approved` → `approved`.
  - Most recent reviewer outcome `Approved with concerns` → `approved_with_concerns`.
  - Most recent reviewer outcome `Not approved` AND iteration budget exhausted → `not_approved_within_budget`.
  - Infrastructure or protocol failure (any case in the failure-mode taxonomy below) → `failed`.
- The current `clean` and `max_iterations_reached` values on the code side are renamed (`clean` → `approved`, `max_iterations_reached` → `not_approved_within_budget`). The plan-side `issues_remaining` is renamed to `not_approved_within_budget`. Downstream consumers (`execute-plan`, `refine-plan` SKILL.md result-parsing step, `refine-code` SKILL.md result-parsing step) consume the new names.

### Refiner iteration semantics

- `Approved` and `Approved with concerns` exit the refiner immediately on the success path.
- `Not approved` triggers a remediation/edit pass within the iteration budget — planner edit pass on the plan side, coder remediation on the code side. When the budget is exhausted with `Not approved` still standing, the refiner exits with `not_approved_within_budget`.
- The reviewer's `Approved with concerns` decision is final for that review pass; refiners do not iterate to "fix Importants" when the reviewer has waived them. This is the convergence-bottleneck escape hatch: the reviewer's judgment short-circuits forced remediation when Important findings are deemed tolerable.

### Failure-mode taxonomy

- Standardize a four-category taxonomy across both refiners. Reason strings drawn from this schema:

| Category | Reason string template | Notes |
|---|---|---|
| Coordinator infra | `coordinator dispatch unavailable` | Shared. Emitted when `subagent_run_serial` is unavailable. |
| Worker dispatch | `worker dispatch failed: <which worker>` | Replaces plan-side's two separate dispatch-failure strings. `<which worker>` ∈ `plan-reviewer`, `planner-edit-pass`, `code-reviewer`, `coder`. Plan-side primary/fallback retry logic is preserved internally; only retry exhaustion surfaces this string. |
| Reviewer artifact handoff | `reviewer artifact handoff failed: <specific check>` | `<specific check>` ∈ `missing REVIEW_ARTIFACT marker`, `missing or empty at <path>`, `path mismatch: expected <X> got <Y>`, `provenance malformed at <path>: <sub-check>`. |
| Input artifact (plan-only) | `input artifact missing or empty: <which>` | `<which>` ∈ `plan file at iteration start`, `plan file after planner edit pass`. No code-side analog needed because git tracks code state. |

- All four categories produce `STATUS: failed` with the appropriate `## Failure Reason` block populated by the matching reason string.

### Plan-side `## Review Notes` append

- Append only on `approved_with_concerns` outcomes. No append on `approved`, `not_approved_within_budget`, or `failed`.
- Format — appended at end of plan file with a leading blank line for separation:

  ~~~markdown
  
  ## Review Notes
  
  _Approved with concerns by plan reviewer. Full review: `<path-to-review-file>`._
  
  ### Important (waived)
  
  - **Task N**: <one-sentence summary> — _waived: <one-sentence rationale from reviewer>._
  ~~~

- One bullet per waived Important finding. The waiver rationale is sourced from the reviewer's Outcome reasoning paragraph; the refiner is responsible for transcribing one bullet per waived Important.
- Minor findings are not appended. They live in the review file only.
- No code-side analog. The diff is the artifact and the review file is its companion. This is the legitimate domain asymmetry from the goal statement.

### Re-review compatibility

- The plan reviewer prompt explicitly instructs reviewers to disregard any pre-existing `## Review Notes` section when reviewing a plan. That section is review meta-data, not plan content, and must not factor into coverage analysis or sizing assessments on subsequent review passes.

## Acceptance Criteria

- `agent/skills/generate-plan/review-plan-prompt.md` and `agent/skills/requesting-code-review/review-code-prompt.md` both define output formats matching the structure described in Requirements: `### Outcome` (with `**Outcome:**` and `**Reasoning:**` lines) at top, then `### Strengths`, `### Issues` (with severity-grouped H4 sub-sections and the What / Why / Recommendation per-finding template), `### Recommendations`. No `Summary`, `Status`, or `Assessment` sections remain.
- Both reviewer prompts include explicit guidance on when `Approved with concerns` is appropriate and forbid it when any Critical finding is present.
- `agent/skills/refine-plan/refine-plan-prompt.md` parses reviewer outcome by matching one of the three outcome labels in the `**Outcome:**` line; severity counts are derived from the H4 sub-section findings tagged Critical / Important / Minor; the refiner emits one of `approved` / `approved_with_concerns` / `not_approved_within_budget` / `failed`.
- `agent/skills/refine-code/refine-code-prompt.md` parses reviewer outcome by matching one of the three outcome labels; remediation triggers only on `Not approved` outcomes; the refiner emits the same four-status enum.
- `agent/skills/refine-plan/SKILL.md` and `agent/skills/refine-code/SKILL.md` recognize the new four-status enum in their result-parsing logic; provenance-validation steps stay intact and are not regressed.
- The plan-side `## Review Notes` append is gated on `approved_with_concerns` outcomes only and follows the compact pointer-style format specified in Requirements (Important-only, one line per waived finding plus a pointer to the full review file).
- The plan reviewer prompt instructs reviewers to disregard any pre-existing `## Review Notes` section when reviewing a plan.
- Failure-mode reason strings emitted by both refiners conform to the four-category taxonomy in Requirements; the previously-distinct plan-side dispatch-failure strings are consolidated under `worker dispatch failed: <which worker>`.
- `agent/agents/plan-reviewer.md`, `agent/agents/code-reviewer.md`, `agent/agents/plan-refiner.md`, `agent/agents/code-refiner.md` reflect the new vocabulary in their standing rules and any verdict-related guidance.
- `agent/skills/refine-plan/README.md`, `agent/skills/refine-code/README.md`, `agent/skills/requesting-code-review/README.md` reflect the new status enum and outcome vocabulary.
- A manual smoke run of `refine-plan` against a real plan produces a review whose body matches the new structure and an outer status drawn from the new enum.
- A manual smoke run of `refine-code` against a real diff produces a review whose body matches the new structure and an outer status drawn from the new enum.

## Constraints

- Existing review files under `.pi/plans/reviews/` and `.pi/reviews/` (active and archived) are historical artifacts and are not migrated. Only newly produced reviews adopt the unified vocabulary.
- The reviewer-authored-artifact contract is preserved unchanged: `**Reviewer:**` provenance line as the first non-empty line of the review file; reviewer-written file at the refiner-supplied `{REVIEW_OUTPUT_PATH}`; `REVIEW_ARTIFACT:` marker in the reviewer's final assistant message. Verdict alignment changes the file body, not the handoff protocol.
- Refiner provenance-validation rules (first-line regex match; provider/model/CLI cross-check against `~/.pi/agent/model-tiers.json`; `inline`-substring rejection) are preserved unchanged.
- Per-issue locators stay domain-specific: Task N for plan reviewers, file:line for code reviewers. Aligning these would lose information.
- The structural-only mode for plan reviews (`--structural-only` flag and `{STRUCTURAL_ONLY_NOTE}` block) continues to function. The "Structural-only review — no spec/todo coverage check performed." label is surfaced inside the Outcome's reasoning paragraph rather than prepended to a Summary paragraph (which no longer exists).
- No new TypeScript tests are required — the verdict contract lives entirely in markdown prompt files. Manual smoke runs of `refine-plan` and `refine-code` are the verification mechanism.

## Non-Goals

- Migrating existing review files (active or archived) to the new vocabulary.
- Adding TypeScript test coverage for verdict text or refiner status parsing.
- Aligning per-issue locators (Task N vs file:line) — the asymmetry is information-preserving, not friction.
- Inventing a code-side analog to the plan-side `## Review Notes` append. The diff itself plus the review file are the code-side artifacts.
- Scoping planner/coder dispatch context to current-task artifacts — filtering out unrelated specs, plans, and reviews from what planners and coders see at dispatch time. Tracked separately in TODO-c4f7b2e9.
- Adding a separate refiner exit path for `Not approved` before the iteration budget is exhausted (e.g., user-driven early abort, heuristic "no more iterations would help"). The four-status enum reflects only currently-supported exit paths.

## Open Questions

- Whether the `### Outcome` reasoning paragraph should remain a single 1–2 sentence paragraph or allow brief bulleted breakdowns when multiple Importants are waived on `Approved with concerns` outcomes. Default in this spec: single 1–2 sentence paragraph; revisitable if reviewers find it too constraining for cases with several waived findings.
