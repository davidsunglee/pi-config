# Refine Code skill

Run an iterative code review and remediation loop over an implemented git range.

## Role in the workflow

`refine-code` is the quality pass after significant implementation work. It is used standalone or automatically by `execute-plan` after all planned waves pass. The skill dispatches a `code-refiner` coordinator, which in turn dispatches reviewers and coders.

## Required inputs

- `BASE_SHA` — start of the implemented range.
- `HEAD_SHA` — end of the implemented range.
- Description of what was implemented.

Optional inputs:

- requirements or plan text,
- max iteration budget, default 3,
- working directory,
- review output base path.

If `BASE_SHA` or `HEAD_SHA` is missing, the skill stops; it does not infer the range.

## Workflow

1. Validate the repository and input range.
2. Read `~/.pi/agent/model-tiers.json`.
3. Resolve the coordinator model from `crossProvider.standard` and its dispatch CLI.
4. Fill `refine-code-prompt.md` with the git range, requirements, output path, iteration budget, model matrix, and working directory.
5. Dispatch the `code-refiner` coordinator.
6. Parse the coordinator status.

## Coordinator responsibilities

The `code-refiner` performs the inner loop:

- dispatch cross-provider code review passes,
- triage findings by severity,
- batch related fixes by file proximity and logical coupling,
- dispatch `coder` subagents for remediation,
- commit remediation changes,
- write versioned review artifacts under `.pi/reviews/`,
- stop when the reviewer outcome is `Approved`/`Approved with concerns`, or the budget is exhausted with `Not approved` still standing.

## Status handling

- `STATUS: approved` — report the passing review and review artifact path.
- `STATUS: approved_with_concerns` — report the passing review with a note that the reviewer waived one or more Important findings. The waiver rationale lives in the review file's `### Outcome` section `**Reasoning:**` line; no remediation iteration runs.
- `STATUS: not_approved_within_budget` — present remaining findings and let the caller choose whether to keep iterating, proceed with known issues, or stop execution.
- `STATUS: failed` — surface the failure reason from the four-category taxonomy (`coordinator dispatch unavailable`, `worker dispatch failed: <which worker>`, `reviewer artifact handoff failed: <specific check>`).

## Model/CLI constraint

The coordinator needs pi orchestration tools, so it must run through a CLI that exposes `subagent_run_serial` / `subagent_run_parallel`. The skill resolves this from the `dispatch` map and does not blindly use the top-level capable tier for the coordinator.

## Files

- `SKILL.md` — outer orchestration and result handling.
- `refine-code-prompt.md` — coordinator prompt.
- `review-fix-block.md` — remediation instructions used by review/fix flows.
