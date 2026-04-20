## Test-Driven Development

**Iron Law:** NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST. If you write production code before a test, delete it and start over. "Delete means delete" — do not keep it as reference, do not adapt it while writing tests.

**Consult the full skill.** For any implementation or bug-fix work in this task, consult the `test-driven-development` skill before writing code. This block is a summary, not a substitute — the full skill has the rationalization-prevention table, red-flags list, verification checklist, and when-stuck troubleshooting you will need if you get tempted to skip a step.

### Red-Green-Refactor cycle

For every new behavior, bug fix, or change in this task:

1. **RED — Write one failing test** that describes the desired behavior. One behavior per test, clear name, real code (no mocks unless unavoidable).
2. **Verify RED — run the test and watch it fail.** MANDATORY. Confirm: test fails (does not error on a typo), and the failure message matches the expected "feature missing" reason. If the test passes, you are testing existing behavior — fix the test. If it errors, fix the error and re-run until it fails correctly.
3. **GREEN — write the minimal code to pass.** Just enough to make this test pass. No extra options, no speculative features, no "while I'm here" refactors.
4. **Verify GREEN — run the test and watch it pass.** MANDATORY. Confirm: the new test passes, all other tests still pass, output is pristine (no errors or warnings).
5. **Refactor — clean up while green.** Remove duplication, improve names, extract helpers. Keep tests green. Do not add behavior.

Repeat for the next behavior. If the task lists test files, follow this cycle for each behavior those tests cover.

### Rationalizations to reject

If you catch yourself thinking any of these, STOP and follow TDD — these are the excuses the full skill explicitly calls out:

- "Too simple to test" / "I'll test after" / "Already manually tested"
- "Keep the code as reference while I write tests" (you will adapt it — delete it)
- "Deleting X hours of work is wasteful" (sunk cost — unverified code is technical debt)
- "TDD will slow me down" / "Manual test is faster"
- "Tests-after achieves the same goals" (no — tests-after asks "what does this do?"; tests-first asks "what should this do?")
- "It's about spirit, not ritual" / "I'm being pragmatic" / "This is different because…"

### Red flags — if any of these are true, stop and start over

- You wrote production code before the test
- The test passed on the first run (you are testing existing behavior)
- You cannot explain why the test failed in the RED step
- You plan to add tests "later"
- You kept pre-existing unverified code as "reference" and adapted it

### Verification checklist (before reporting DONE)

- [ ] Every new function or method has a test
- [ ] You watched each test fail before implementing
- [ ] Each test failed for the expected reason (feature missing, not a typo)
- [ ] You wrote minimal code to pass each test
- [ ] All tests pass, not just the new ones
- [ ] Output is pristine — no errors, no warnings
- [ ] Tests exercise real code (mocks only when unavoidable)
- [ ] Edge cases and error paths are covered

If you cannot check every box, you skipped TDD — start over before reporting.

### When stuck

- "I do not know how to test this" → write the wished-for API in the test first, then implement to match. If still stuck, report NEEDS_CONTEXT.
- "The test is too complicated" → the design is too complicated. Simplify the interface.
- "I have to mock everything" → the code is too coupled. Use dependency injection.
- "The setup is huge" → extract helpers; if still complex, simplify the design.

### Bug fixes

Reproduce the bug with a failing test first. Only then fix. The test proves the fix and prevents regression. Never fix a bug without a test.
