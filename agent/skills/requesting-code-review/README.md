# Requesting Code Review skill

Dispatch an independent `code-reviewer` subagent to review a git diff in fresh context.

## When to use

Use after major feature work outside `execute-plan`, before merging to main, or when a fresh perspective could catch issues. The reviewer receives explicit context and the diff range, not the current session history.

## Workflow

1. Determine the review range, typically from the merge base with `main` to `HEAD`.
2. Read `review-code-prompt.md`.
3. Fill placeholders describing what was implemented, the plan or requirements, the base SHA, the head SHA, and a brief description.
4. Read `~/.pi/agent/model-tiers.json` and resolve the capable reviewer model plus CLI from the dispatch map.
5. Dispatch `code-reviewer` with `subagent_run_serial`.
6. Parse the result for `[Approved]` or `[Issues Found]`.
7. Act on findings by severity.

## Severity handling

| Severity | Expected action |
| --- | --- |
| Critical | Fix immediately; covers bugs, security issues, and data loss. |
| Important | Fix before proceeding; covers architecture, missing features, and test gaps. |
| Minor | Note or fix opportunistically; covers style, small optimizations, or documentation. |

## Review discipline

Reviewer output is input to evaluate, not an order to blindly implement. If a suggestion is wrong for the codebase, push back with technical reasoning and evidence from code or tests.

## Files

- `SKILL.md` — dispatch procedure and severity policy.
- `review-code-prompt.md` — full review prompt template used for standalone reviews.
