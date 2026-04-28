# Verification Before Completion skill

Require fresh evidence before claiming work is complete, fixed, passing, or safe to proceed.

## Core principle

Evidence before claims, always. The agent must run the relevant verification command, read the output, and ensure the output supports the claim before saying the work is complete.

## Gate function

Before making any positive status claim:

1. Identify the command or check that proves it.
2. Run it freshly and completely.
3. Read the full output and exit code.
4. Decide whether the evidence supports the claim.
5. State the actual status with the evidence.

Skipping any step is treated as an invalid claim.

## Applies to

- Tests passing.
- Lint clean.
- Builds succeeding.
- Bugs fixed.
- Regression tests proving behavior.
- Requirements satisfied.
- Agent delegation results.
- Commits, PRs, and task completion.

## Important distinction

A related check does not prove a stronger claim. For example, lint passing does not prove the build succeeds, and an agent report does not prove its changes are correct. The verification must match the claim.

## Agent delegation rule

When a subagent reports success, independently inspect VCS diff and run appropriate verification before reporting completion to the user.

## Files

- `SKILL.md` — evidence gate, examples, and rationalization-prevention table.
