{
  "id": "ccbbedd6",
  "title": "Create define-spec skill",
  "tags": [
    "todo",
    "skill",
    "define-spec",
    "pi"
  ],
  "status": "closed",
  "created_at": "2026-04-14T20:40:01.388Z"
}

Create a new pi skill called `define-spec` that bridges the gap between a rough todo and a structured plan.

## Intent

Inspired by the superpowers brainstorming skill but leaner — no open-ended exploration. Takes a todo as input, asks targeted clarifying questions, and outputs a spec optimized for consumption by `generate-plan`. Completes a three-stage pipeline: **define-spec → generate-plan → execute-plan**.

## Acceptance Criteria

- Accepts a todo (title + body) as input
- Produces a spec document shaped for `generate-plan` to consume directly
- Lighter-weight than brainstorming: scoped questions, no divergent ideation
- Spec output captures intent, constraints, and acceptance criteria — not implementation steps
- Works as the standard entry point for the define-spec → generate-plan → execute-plan suite
