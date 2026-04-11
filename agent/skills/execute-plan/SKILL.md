---
name: execute-plan
description: "Executes a structured plan file from .pi/plans/ using the execute-plan extension."
---

# Execute Plan

Use `/execute-plan` or the `execute_plan` tool to execute an implementation plan.

The extension handles all orchestration: plan parsing, wave computation, subagent dispatch, state management, git operations, and TUI. You do not need to manage any of this manually.

## Judgment Calls

When the extension encounters a situation requiring judgment, it will ask you to respond via the `execute_plan_judgment` tool with an action and optional context/model override.

### Judgment Types

**BLOCKED** — A subagent cannot complete its task.
Evaluate the blocker: `retry` with a different approach, `provide_context` if info is missing, `skip` if non-critical, or `escalate` if you need human input.

**DONE_WITH_CONCERNS** — Task completed but the subagent flagged doubts.
Evaluate severity: `accept` if concerns are minor observations, `retry` if they indicate correctness issues.

**NEEDS_CONTEXT** — Subagent needs information not provided.
Use `provide_context` with the missing info, or `escalate` if the info is unknowable.

**Spec review failed** — Implementation doesn't match the task spec.
`retry` with the findings so the implementer can fix gaps, or `accept` if the finding is a false positive.

**Code review findings** — Final code review found issues.
`accept` if findings are minor/stylistic, `retry` for critical or important fixes.

**Retry exhausted** — Maximum retry attempts reached.
`escalate` to the user for a decision, or `skip` if the task is non-critical.

### Available Actions

| Action | Effect |
|--------|--------|
| `retry` | Re-dispatch with optional `model`/`context` override |
| `skip` | Mark task done, proceed |
| `stop` | Halt execution, preserve state for resume |
| `provide_context` | Re-dispatch with `context` appended to prompt |
| `accept` | Accept current state, proceed |
| `escalate` | Present to user for decision |
