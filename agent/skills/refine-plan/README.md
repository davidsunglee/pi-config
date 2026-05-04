# Refine Plan skill

Run an iterative review-edit loop over a written plan and manage the plan artifact commit gate.

## Role in the workflow

`refine-plan` is used by `generate-plan` and can also be run standalone. It checks that a plan is structurally sound, covers its source requirements, and is executable before work begins.

## Inputs

Required:

- `PLAN_PATH` — path to the plan file.

Optional:

- `--task-artifact <path>` — source requirements artifact, usually a spec.
- `--task-description <text>` — inline todo or freeform requirements body.
- `--source-todo TODO-<id>` — supplementary provenance.
- `--scout-brief <path>` — supplementary context.
- `--structural-only` — opt in to review without a coverage source.
- `--max-iterations <n>` — review/edit budget, default 3.
- `--auto-commit-on-approval` — used by `generate-plan`.

## Coverage source rule

Unless `--structural-only` is set, the skill requires either an existing task artifact or a non-empty task description. Provenance pointers alone are not enough; the reviewer needs actual requirements text to judge coverage.

## Workflow

1. Validate that the repository and plan file exist.
2. Read the plan preamble and auto-discover provenance from supported `**Spec:**`, `**Source:**`, and `**Scout brief:**` lines.
3. Resolve model tiers from `~/.pi/agent/model-tiers.json`.
4. Allocate the next review era under `docs/plans/reviews/`.
5. Fill `refine-plan-prompt.md` and dispatch `plan-refiner`.
6. Parse the coordinator's compact result.
7. Commit the plan and newly written review artifacts when the outcome is `approved` or `approved_with_concerns`, or report `not_approved_within_budget`/`failed` to the caller.

## Era-versioned reviews

Review artifacts are written under `docs/plans/reviews/` using the plan basename and an incrementing era number, for example:

```text
docs/plans/reviews/my-plan-plan-review-v1.md
docs/plans/reviews/my-plan-plan-review-v2.md
```

The skill scans existing review files before each era so standalone and continued runs do not overwrite prior artifacts.

## Coordinator behavior

The dispatched `plan-refiner` alternates between `plan-reviewer` and `planner` edit mode until the plan is `Approved`/`Approved with concerns`, or the iteration budget is exhausted with `Not approved` still standing. The coordinator writes review files and edits the plan, but does not commit; this skill owns the commit gate.

## Final summary format

The skill reports a compact machine-readable summary:

```text
STATUS: <approved | approved_with_concerns | not_approved_within_budget | failed>
COMMIT: <committed [sha] | left_uncommitted | not_attempted [reason]>
PLAN_PATH: <path>
REVIEW_PATHS:
- <path1>
STRUCTURAL_ONLY: <yes | no>
```

## Files

- `SKILL.md` — orchestrator and commit gate.
- `refine-plan-prompt.md` — coordinator prompt used by the `plan-refiner` subagent.
