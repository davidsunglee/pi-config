# Receiving Code Review skill

Handle review feedback with technical rigor instead of reflexive agreement.

## Core principle

Verify before implementing. Ask before assuming. Correctness for this codebase matters more than social comfort.

## Response pattern

1. Read the complete feedback.
2. Understand or restate the requirement.
3. Verify the suggestion against the actual codebase.
4. Evaluate whether it is technically sound here.
5. Respond with a technical acknowledgment or reasoned pushback.
6. Implement one item at a time and test each change.

## User feedback vs external reviewer feedback

User feedback is trusted once understood, but unclear scope still needs clarification. External reviewer feedback is treated as a suggestion to evaluate: check whether it breaks existing behavior, conflicts with platform constraints, misunderstands context, or violates prior user decisions.

## Clarification rule

If any item in a multi-item review is unclear, stop and clarify before implementing any of the set. Items may be related; partial implementation based on partial understanding creates rework.

## Pushback criteria

Push back when a suggestion:

- breaks existing functionality,
- ignores compatibility or legacy constraints,
- violates YAGNI for unused code paths,
- is technically incorrect for the stack,
- conflicts with user-directed architecture,
- cannot be verified without more information.

Pushback should cite code, tests, or concrete constraints.

## Prohibited behavior

Avoid performative agreement such as “Great point!” or “You’re absolutely right!” before verification. Prefer action, clarification, or a concise technical statement.

## GitHub review note

When replying to inline GitHub PR review comments, reply in the comment thread through the review-comment replies API rather than adding a top-level PR comment.

## Files

- `SKILL.md` — review reception process, examples, and anti-patterns.
