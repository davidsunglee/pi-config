**Reviewer:** anthropic/claude-sonnet-4-6 via claude

### Strengths

- **Finding 1 fix is substantive and well-reasoned.** The replacement text in `agent/agents/test-runner.md:29-33` doesn't just remove the broken form — it explains *why* single-quote wrapping is dangerous (with a concrete example), specifies two concrete safe alternatives (temp script file, heredoc), and adds an invariant that the bytes of `## Test Command` MUST reach `bash` unchanged. This is exactly the right level of precision for a specification document that AI agents will interpret literally.
- **The fix is self-contained.** The change is minimal (5 lines out, 5 lines in), touches nothing outside the one broken rule, and introduces no unrelated changes.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

- **File:** `.pi/test-runs/smoke-run-static-report.md:172`
  - **What's wrong:** The manual operator smoke-run gate is still entirely unexecuted. `OVERALL_MANUAL: <PASS|FAIL>` remains a literal placeholder, and all operator sub-criteria fields (`Operator`, `Date`, `Plan tested`, `Working directory`, `Branch / commit`, `Manual gate verdict`) still contain angle-bracket template text. The remediation diff (`9ca82e0..e6742e7`) does not touch this file at all — `git diff --stat` confirms only `agent/agents/test-runner.md` changed.
  - **Why it matters:** The smoke-run report's own merge-eligibility condition (`The plan branch is merge-eligible only when both OVERALL_STATIC: PASS and OVERALL_MANUAL: PASS are present`) is still unmet. The subagent dispatch/readback/parser/cleanup behavior that constitutes the core of this feature has not been exercised end-to-end since the quoting fix that made commands with single quotes safe was itself introduced in this remediation. The first round of "manual testing" (if any existed) pre-dated the fix, so a new smoke run after the fix is needed to confirm the repaired execution path.
  - **How to fix:** Run the operator smoke test against an existing plan after the quoting fix lands. Fill in sub-criteria (a) through (d) with observed evidence, set `OVERALL_MANUAL: PASS` (or `FAIL` with specifics), and complete the operator gate metadata block. Only then is the branch merge-eligible per its own stated standard.

#### Minor (Nice to Have)

_None._

### Recommendations

The remediation is technically correct for Finding 1. The single remaining blocker is procedural: the manual gate exists specifically to catch runtime dispatch/readback issues that static analysis cannot, and the quoting fix changes the runtime behavior of the test-runner dispatch path. Running the smoke test after this fix (rather than before) gives the manual gate its intended value.

### Assessment

**Ready to merge: No**

**Reasoning:** Finding 1 (quoting bug in test-runner) is fully and correctly resolved — the fix is safe, well-specified, and introduces no regressions. Finding 2 (manual smoke-run gate incomplete) remains entirely unaddressed; the remediation diff does not touch the report file, and the branch's own merge-eligibility condition is still unmet. Merge after the operator smoke run is completed and `OVERALL_MANUAL: PASS` is recorded.
