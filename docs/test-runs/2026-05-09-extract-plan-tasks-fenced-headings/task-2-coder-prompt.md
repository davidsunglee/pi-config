# Execute Task Prompt

Prompt template dispatched to worker agents for a single plan task. Fill placeholders before sending.

## Task Description

### Task 2: Make structural scans fence-aware in `extract-plan-tasks.py`

**Files:**
- Modify: `agent/skills/execute-plan/scripts/extract-plan-tasks.py`
- Modify: `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py`

**Steps:**
- [ ] **Step 1:** Add a small fence-state helper that tracks whether each scanned line is inside a fenced code block using the required opener/closer rules, without introducing a full markdown parser.
- [ ] **Step 2:** Reuse that helper in task-start detection so `### Task N: ...` lines inside fences are ignored.
- [ ] **Step 3:** Reuse that helper in task block end detection so fake `## ...` and `### Task N: ...` lines inside fences do not truncate the enclosing real task block.
- [ ] **Step 4:** Reuse that helper in required-section validation/body scanning so fenced headings do not satisfy or terminate real top-level sections.
- [ ] **Step 5:** Run the focused parser test suite and fix any regressions without broadening scope beyond fenced-heading handling.

**Acceptance criteria:**
- All three affected structure-detection paths are fence-aware.
  Verify: the new regression tests pass for task discovery, task block boundaries, and required-section validation.
- Post-fence task content is still parsed normally.
  Verify: assert the parser still captures `model_recommendation == "standard"` when that line appears after a fenced block.
- Existing parser behavior outside fenced blocks remains intact.
  Verify: run the existing `test_extract_plan_tasks.py` suite and confirm it stays green.

**Model recommendation:** standard

## Context



## Working Directory

Operate from: `/Users/david/Code/pi-config`

All paths in this task are relative to that directory unless otherwise stated.

## Code Organization

You reason best about code you can hold in context at once, and your edits are more
reliable when files are focused. Keep this in mind:

- Follow the file structure defined in the plan
- Each file should have one clear responsibility with a well-defined interface
- If a file you're creating is growing beyond the plan's intent, stop and report
  it as DONE_WITH_CONCERNS — don't split files on your own without plan guidance
- If an existing file you're modifying is already large or tangled, work carefully
  and note it as a concern in your report
- In existing codebases, follow established patterns. Improve code you're touching
  the way a good developer would, but don't restructure things outside your task.

## When You're in Over Your Head

It is always OK to stop and say this is too hard. Bad work is worse than no work.
You will not be penalized for escalating.

**STOP and escalate when:**
- The task requires architectural decisions with multiple valid approaches
- You need to understand code beyond what was provided and can't find clarity
- You feel uncertain about whether your approach is correct
- The task involves restructuring existing code in ways the plan didn't anticipate
- You've been reading file after file trying to understand the system without progress

**How to escalate:** Report back with status BLOCKED or NEEDS_CONTEXT. Describe
specifically what you're stuck on, what you've tried, and what kind of help you need.
The orchestrator can provide more context, re-dispatch with a more capable model,
or break the task into smaller pieces.

Do NOT guess. Do NOT produce work you're unsure about and mark it DONE. Escalate.

## Self-Review

Before reporting, review your work with fresh eyes:

**Completeness:**
- Did I fully implement everything in the spec?
- Did I miss any requirements or acceptance criteria?
- Are there edge cases I didn't handle?

**Quality:**
- Is the code clean and maintainable?
- Are names clear and accurate — do they match what things do, not how they work?

**Discipline:**
- Did I avoid overbuilding (YAGNI)?
- Did I only build what was requested?
- Did I follow existing patterns in the codebase?

**Testing:**
- Do tests actually verify behavior (not just mock behavior)?
- Did I follow TDD if required?
- Are tests comprehensive?

If you find issues during self-review, fix them now before reporting.

## Required Skills

If this task involves diagnosing a failing test, regression, or unexpected behavior, you MUST consult the `systematic-debugging` skill before proposing a fix. Find the root cause before changing code.

## Test-Driven Development

**Test first.** No production behavior change without a failing test that exercises the desired behavior through a public interface. If exploratory production code already exists for this task, revert it or set it aside, write the intended failing test, verify RED, then implement from the test. Document or ask before making an exception.

**Consult the full skill.** For any implementation or bug-fix work in this task, consult the `test-driven-development` skill before writing code. This block is a summary, not a substitute — see the full skill for the workflow, good-test qualities, stop conditions/recovery, and completion checklist.

### Red-Green-Refactor cycle

For every behavior change in this task, work in vertical tracer bullets — one behavior at a time:

1. **RED — write one failing test** for one observable behavior, named after the behavior, exercised through a public interface (API, UI, CLI, service boundary, or persistence-facing interface). Use real internal collaborators.
2. **Verify RED — run the test and watch it fail** for the expected reason (feature absent, bug present, or behavior not yet implemented). If it errors on a typo or setup issue, fix that first; if it passes immediately, the test is wrong — fix it before continuing.
3. **GREEN — write the smallest production change that passes the test.** No speculative features, broad refactors, or "while I'm here" work.
4. **Verify GREEN — run the targeted test and the relevant surrounding tests.** Output should be pristine. If they fail, fix production code; do not weaken the test unless RED proved the test was wrong.
5. **Refactor — only while green.** Improve names, remove duplication, deepen modules. Run tests after each step.

Repeat from RED for the next behavior. Each behavior change needs a test through a public interface — this does not mean every private helper or method needs its own implementation-coupled test.

### Mocking

Mock only true external boundaries: external APIs, payments/email, time/randomness, unavailable services, and sometimes filesystem/database when a controlled real dependency is impractical. Use real internal collaborators. Do not mock internal modules/classes just to observe interactions, and do not assert internal call counts/order for code you own.

### Stop conditions and recovery

Stop and correct course if:

- Production code was written before a failing test in this task.
- The test passed immediately.
- You cannot explain why RED failed.
- You are adding many tests before any implementation.
- Tests mostly mock internal code.
- You are rationalizing "too simple," "manual test is enough," "I'll add tests later," or "tests-after is the same."

**Recovery:** revert or set aside the premature implementation, write the intended failing test, verify RED, then implement from the test. Ask before making an exception.

### When stuck

- "I do not know how to test this" → write the wished-for public API in the test first, then implement to match. If still stuck, report NEEDS_CONTEXT.
- "The test is too complicated" → the design is too complicated. Simplify the public interface.
- "I have to mock everything internal" → the code is too coupled. Use dependency injection at the boundary, not for every internal collaborator.
- "The setup is huge" → extract helpers; if still complex, simplify the design.

### Bug fixes

For a non-trivial bug, reproduce the failure with the smallest test that follows the real failure path through a public interface. Confirm RED reflects the observed bug (not a synthetic substitute), then fix minimally. Keep the regression test. Never fix a non-trivial bug without a regression test unless explicitly permitted.

### Completion checklist (before reporting DONE)

- [ ] Each behavior change has a test through a public interface.
- [ ] You watched each new or changed test fail for the expected reason before implementing.
- [ ] Production changes were minimal for the tests.
- [ ] Refactors happened only while green.
- [ ] Targeted and relevant surrounding tests pass with no unexpected errors or warnings.
- [ ] Mocks are limited to true external boundaries.
- [ ] Any skipped TDD exception was explicitly approved or documented.

If you cannot check every box, you skipped TDD — recover before reporting.

## Report Format

Use this exact structure:

```
STATUS: <DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT>

## Completed
What was implemented.

## Tests
What was tested and results.

When TDD was enabled for this task AND you changed production code, include brief RED/GREEN evidence:
- **RED:** the failing test you added or ran first, and the expected failure reason (what error or assertion).
- **GREEN:** what passed after implementation (the specific test(s) now passing, and confirmation the rest of the suite still passes).

Keep each line to one or two sentences. If TDD was disabled, or you only modified docs/config/comments, write "TDD not applicable — <one-line reason>" and skip RED/GREEN.

## Files Changed
- `path/to/file` — what changed

## Self-Review Findings
Any issues found and fixed during self-review, or "None."

## Concerns / Needs / Blocker
(only for DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED)

For DONE_WITH_CONCERNS, list concerns as a freeform bullet list — one concern per line, written as a plain sentence. Do not prefix concerns with type labels.
```

**Status code guidance:**
- `DONE` — all acceptance criteria met, self-review clean
- `DONE_WITH_CONCERNS` — work complete but you have doubts worth surfacing. List concerns as freeform bullets — do not use `Type:` labels. The orchestrator will surface your concerns at a combined wave-level checkpoint before verification; the user decides whether to remediate or continue.
- `NEEDS_CONTEXT` — cannot proceed without specific information that wasn't provided; list exactly what
- `BLOCKED` — cannot complete the task; explain why, what you tried, and what would unblock you

Never silently produce work you're unsure about. Use DONE_WITH_CONCERNS or BLOCKED instead.
