**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The plan honors the spec’s chosen bundled approach, covers the marker rename, dual-channel handoff, planner marker, define-spec validation/path-shape cleanup, mux override cleanup, and regression testing. Dependencies and verify recipes are structurally sound, with only a small wording ambiguity noted below.

### Strengths

- Tasks 1–4 cover the core protocol change end-to-end: helper marker vocabulary, renamed consumers, `PLAN_ARTIFACT`, and define-spec path-shape validation.
- Tasks 5–7 consistently extend the belt-and-suspenders contract to review-code, review-plan, and test-runner prompts plus agent definitions.
- Task 10 adds a shared regression test over all marker-emitting prompt/agent files, reducing drift risk across the new contract.
- Task 12 provides repo-wide stale-marker checks and helper-suite verification after all implementation tasks complete.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

- **Task 1: Old-marker rejection test wording is slightly ambiguous**
  - **What:** Step 9 says to assert stderr does not list `BRIEF_WRITTEN` or `SPEC_WRITTEN` as valid choices, but argparse stderr will still include the invalid value itself (for example, `invalid choice: 'BRIEF_WRITTEN'`). The parenthetical clarifies the intent, but an implementer could accidentally write an over-broad `assertNotIn` against all stderr.
  - **Why it matters:** A too-broad assertion would make the new test fail even though the helper behaves correctly.
  - **Recommendation:** If editing the plan later, phrase the assertion as checking only the choices portion of stderr or checking that the supported marker list excludes old names.

### Recommendations

- Keep Tasks 1–4 in the same implementation branch/commit window, as the risk assessment notes, to avoid transient breakage from the atomic marker rename.
