# Test-Driven Development skill

Enforce red-green-refactor for feature work, bug fixes, refactors, and behavior changes — testing observable behavior through public interfaces.

## Core principle

If you did not watch the test fail for the expected reason, you do not know whether it tests the intended behavior. Tests should verify what callers/users observe, not private methods or internal call sequences.

## Red-green-refactor loop

1. **Red** — write one minimal test for one observable behavior through a public interface.
2. **Verify red** — run the test and confirm it fails for the expected reason, not because of a typo or setup error.
3. **Green** — write the smallest production change that passes the test.
4. **Verify green** — run the test and relevant surrounding tests.
5. **Refactor** — clean up only while green, keeping behavior unchanged.
6. Repeat for the next behavior.

Work in vertical tracer bullets — one behavior, RED, minimal GREEN, optional refactor — rather than writing all tests up front and all implementation later.

## Coverage rule

Each behavior change needs a test through a public interface. This does not mean every private helper, function, or method gets its own implementation-coupled test.

## Good test qualities

- Tests one behavior with a clear behavior-oriented name.
- Exercises real code through a public API, UI, CLI, service boundary, or persistence-facing interface.
- Verifies observable outcomes (returned values, emitted events, retrievable state, rendered UI, API responses, user-visible errors).
- Uses real internal collaborators; mocks only true external boundaries (external APIs, payments/email, time/randomness, unavailable services, sometimes filesystem/database when a controlled real dependency is impractical).

## Exploration recovery

If exploratory production code already exists for the task, revert it or set it aside before final implementation, write the intended failing test, verify red, then implement from the test. Do not convert already-written implementation into "tests after."

## Exceptions

Exceptions require human approval or an explicit note: throwaway prototypes, generated code, pure configuration changes, and docs-only changes. For docs/config/comment-only work, mark "TDD not applicable" with a one-line reason.

## Integration with execute-plan

When TDD is enabled in `execute-plan`, the executor injects `tdd-block.md` into each `coder` prompt so subagents receive the same test-first contract aligned with this skill.

## Completion checklist

Before claiming implementation is done, verify that each behavior change has a public-interface test, each new or changed test was observed failing for the expected reason, production changes were minimal, refactors happened only while green, targeted and surrounding tests pass, mocks are limited to true external boundaries, and any skipped exception is approved or documented.

## Files

- `SKILL.md` — TDD rules, workflow, stop conditions/recovery, and completion checklist.
