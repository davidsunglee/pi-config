{
  "id": "ff6bb7fd",
  "title": "Align execute-plan worker skill delivery on Claude path",
  "tags": [
    "workflow",
    "execute-plan",
    "skills",
    "claude"
  ],
  "status": "open",
  "created_at": "2026-04-25T18:42:20.750Z"
}

## Problem

`agent/skills/execute-plan/execute-task-prompt.md` says workers must consult `systematic-debugging` when diagnosing failures. `agent/skills/execute-plan/tdd-block.md` says workers must consult the full `test-driven-development` skill.

But normal `execute-plan` worker models are Anthropic models dispatched through the Claude CLI. The Claude path does not receive pi skills. The TDD block includes a summary, but it explicitly says it is not a substitute for the full skill.

This creates a workflow integrity gap: worker instructions refer to skills that may not actually be available in the worker environment.

## Recommended direction

Make the prompt honest and self-contained for Claude-dispatched workers.

Options to evaluate:

- Inline the full relevant skill text into the worker prompt when TDD or debugging discipline is required.
- Replace "consult the skill" wording with "follow the following rules" and include enough rules directly in the prompt.
- For systematic debugging, inline a debugging block when relevant, or provide an explicit readable path such as `~/.pi/agent/skills/systematic-debugging/SKILL.md` and ensure the worker can read it.

## Acceptance criteria

- Claude-dispatched workers receive all mandatory TDD/debugging instructions needed to comply.
- Prompts no longer claim that unavailable pi skills have been delivered to Claude workers.
- The pi and Claude dispatch paths have equivalent workflow-discipline expectations, or any remaining differences are explicitly documented.
