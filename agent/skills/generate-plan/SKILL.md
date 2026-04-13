---
name: generate-plan
description: "Generates a structured implementation plan from a todo or spec file. Dispatches the plan-generator subagent for deep codebase analysis. Use when the user wants to plan work before executing it."
---

When the user wants to generate a plan, invoke the `/generate-plan` command or call the `generate_plan` tool.

## What the extension handles

The `generate-plan` extension manages the full pipeline automatically:

- Input resolution (reads todo body or file contents as needed)
- Prompt assembly for the plan-generator subagent
- Plan generation and writing to `.pi/plans/`
- Structural validation of the generated plan
- Cross-provider review and repair loop
- Appending review notes to the plan file

## Input formats

Provide one of:

- **Todo ID** — `TODO-<hex>` (e.g., `TODO-7ef7d441`)
- **File path** — path to a spec, RFC, or design doc
- **Freeform description** — plain text describing the work

## Async option (command only)

`/generate-plan --async` runs the full pipeline in the background and notifies on completion. If the repair loop does not converge, it escalates to the user. The `generate_plan` tool is always synchronous.

## Next step

After a plan is generated, suggest running it with the `execute-plan` skill: `/skill:execute-plan`
