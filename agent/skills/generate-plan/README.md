# Generate Plan skill

Generate a structured implementation plan in `.pi/plans/` from a todo, spec/design document, or freeform request.

## Role in the workflow

`generate-plan` turns a requirements artifact into an execution-ready plan. It dispatches a fresh-context `planner` subagent for deep codebase analysis, then hands the resulting plan to `refine-plan` for review, surgical edits, and the commit gate.

## Supported inputs

- **Todo ID** — the orchestrator reads the todo body with the `todo` tool and inlines it, because planner subagents do not have the todo tool.
- **File path** — specs, RFCs, design docs, and similar artifacts are passed by path. The orchestrator performs only a bounded preamble read for provenance.
- **Freeform text** — inlined directly as the task description.

## Path-based handoff

Large durable artifacts are passed by filesystem path instead of embedded into the orchestrator prompt. For file inputs, the planner reads the artifact from disk. The orchestrator only extracts supported preamble metadata such as:

- `Source: TODO-<id>`
- `Scout brief: .pi/briefs/<filename>`

This preserves orchestrator context and keeps the artifact itself as the source of truth.

## Planning flow

1. Determine the input shape and provenance.
2. Read `~/.pi/agent/model-tiers.json` and resolve the capable planning model plus dispatch CLI.
3. Read `generate-plan-prompt.md` and fill placeholders for task description or artifact path, working directory, output path, and provenance.
4. Dispatch the `planner` subagent synchronously.
5. Invoke `refine-plan` with the generated plan and the correct coverage source.
6. Report the compact `refine-plan` summary and offer to run `execute-plan`.

## Output plan expectations

The planner writes a plan file under `.pi/plans/` with the structure expected by `execute-plan`: goal, architecture summary, tech stack, file structure, numbered tasks, dependencies, risk assessment, and optional test command.

## Relationship to refine-plan

`generate-plan` no longer performs plan review directly. Review and edit responsibilities live in `refine-plan` and the `plan-refiner` coordinator. `generate-plan` always passes `--auto-commit-on-approval` when invoking `refine-plan`.

## Files

- `SKILL.md` — orchestrates input resolution, planner dispatch, and refine-plan handoff.
- `generate-plan-prompt.md` — prompt template for first-pass plan generation.
- `review-plan-prompt.md` — plan reviewer prompt used by the refine-plan coordinator.
- `edit-plan-prompt.md` — surgical edit prompt used when plan review finds blocking errors.
