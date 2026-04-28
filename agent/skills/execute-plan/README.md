# Execute Plan skill

Execute a structured plan file from `.pi/plans/` through dependency-ordered waves of coder subagents, independent verification, integration checks, commits, and optional final review.

## Role in the workflow

`execute-plan` is the implementation engine for plans produced by `generate-plan` and approved by `refine-plan`. It turns a static plan into committed code changes while keeping task execution isolated, verifiable, and recoverable.

## Plan requirements

A plan must contain:

1. A header with goal, architecture summary, and tech stack.
2. A file structure section showing create/modify intent.
3. Numbered tasks, each with `**Files:**`, checklist steps, acceptance criteria, and model recommendation.
4. A dependencies section.
5. A risk assessment.

An optional `## Test Command` fenced bash block provides the integration test command. If absent, the skill tries common project-file autodetection.

## Workspace handling

Before execution, the skill determines whether the current checkout is already a worktree or feature branch. Existing isolated workspaces are reused after a dirty-state safety check. Work started from `main`, `master`, or `develop` defaults to a new git worktree via the `using-git-worktrees` skill.

Direct commits to main-like branches require an explicit confirmation before the first checkpoint commit.

## Execution settings

The user confirms or customizes:

- workspace: current checkout or new worktree,
- TDD enabled/disabled,
- sequential vs parallel execution,
- wave pacing,
- integration test command,
- final review and remediation iteration budget.

## Wave execution

The skill parses task dependencies and groups tasks into waves. Tasks with all dependencies satisfied can run together. Waves larger than the orchestration hard cap are split into sub-waves of at most 8 tasks.

For each task, the skill fills `execute-task-prompt.md` with:

- the full task spec from the plan,
- wave and dependency context,
- working directory,
- optional TDD instructions from `tdd-block.md`.

It dispatches `coder` subagents using explicit model and CLI values resolved from `~/.pi/agent/model-tiers.json`.

## Worker status handling

Coder subagents report one of:

- `DONE` — proceed to verification.
- `DONE_WITH_CONCERNS` — record concerns and present them at the wave gate.
- `NEEDS_CONTEXT` — provide missing context and re-dispatch.
- `BLOCKED` — pause the wave and present all blockers together.

Blocked tasks and concerns are handled after the whole wave drains, so the user sees a combined wave-level picture rather than piecemeal prompts.

## Verification

After a wave passes the blocker/concern gate, fresh-context `verifier` subagents judge each task against its acceptance criteria. The orchestrator supplies command evidence and a verifier-visible file set assembled from the task's declared `**Files:**`, worker reports, and observed diff state. A worker cannot narrow its own verification surface.

Tasks that fail verification cannot be skipped.

## Integration regression model

When integration tests are enabled, the skill captures a baseline before the first wave and classifies post-wave failures into three sets:

- baseline failures — pre-existing and ignored,
- deferred integration regressions — plan-introduced but user-deferred on intermediate waves,
- new regressions in the current wave — blocking.

The final wave removes the defer option. Completion remains blocked until plan-introduced regressions are resolved. The formal set model is documented in `integration-regression-model.md`.

## Commits and finalization

Each verified wave is checkpoint-committed. After all waves pass, the skill can invoke `refine-code` for iterative review/remediation, move the plan to `.pi/plans/done/`, close the linked todo, and invoke `finishing-a-development-branch`.

## Files

- `SKILL.md` — full execution procedure.
- `execute-task-prompt.md` — coder prompt template.
- `verify-task-prompt.md` — verifier prompt template.
- `tdd-block.md` — TDD instructions injected when enabled.
- `integration-regression-model.md` — formal classification rules for integration failures.
