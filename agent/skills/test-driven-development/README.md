# Test-Driven Development skill

Enforce red-green-refactor for feature work, bug fixes, refactors, and behavior changes.

## Core principle

If you did not watch the test fail for the expected reason, you do not know whether it tests the intended behavior.

## Red-green-refactor loop

1. **Red** — write one minimal test for the desired behavior.
2. **Verify red** — run the test and confirm it fails for the expected reason, not because of a typo or setup error.
3. **Green** — write the smallest production change that passes the test.
4. **Verify green** — run the test and relevant surrounding tests.
5. **Refactor** — clean up only after green, keeping behavior unchanged.
6. Repeat for the next behavior.

## Iron law

No production code without a failing test first. If production code was written ahead of the test, delete it and restart from the test.

## Good test qualities

- Tests one behavior.
- Has a clear behavior-oriented name.
- Exercises real code and public behavior.
- Uses mocks only for true external boundaries.
- Shows the intended API or user-visible outcome.

## Exceptions

Exceptions require the human partner's permission. Typical candidates are throwaway prototypes, generated code, and pure configuration changes.

## Integration with execute-plan

When TDD is enabled in `execute-plan`, the executor injects `tdd-block.md` into each `coder` prompt so subagents receive the same test-first contract.

## Completion checklist

Before claiming implementation is done, verify that tests were observed failing first, minimal code was written to pass, the relevant suite now passes, and output is free of unexpected errors or warnings.

## Files

- `SKILL.md` — TDD rules, examples, rationalization checks, and checklist.
