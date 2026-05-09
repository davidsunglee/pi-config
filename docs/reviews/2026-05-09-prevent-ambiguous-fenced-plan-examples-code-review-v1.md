**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The implementation covers the tested ` ```json`-style nested-fence case and the requested workflow wiring, but the shared detector still misses same-marker inner fence runs without info strings, leaving the misleading `missing_required_section` failure path in place for malformed plans that meet the stated problem class.

### Strengths

- The new `ambiguous_nested_fence` integration runs before section validation and preserves the existing stderr wrapper shape (`agent/skills/execute-plan/scripts/extract-plan-tasks.py:222-235`).
- The regression fixtures cover the main triple-backtick-with-info-string failure and both safe outer-fence alternatives (`agent/skills/execute-plan/scripts/tests/fixtures/plan-ambiguous-nested-fence.md:22-35`, `agent/skills/execute-plan/scripts/tests/fixtures/plan-safe-tilde-outer-fence.md:22-35`, `agent/skills/execute-plan/scripts/tests/fixtures/plan-safe-long-backtick-outer-fence.md:22-35`).
- The helper keeps pure detection/rewrite functions separate from the CLI, and the rewrite tests assert inner payload preservation (`agent/skills/_shared/scripts/tests/test_plan_fence_hardening.py:288-326`).
- Verification command passed locally: `cd agent && python3 -m unittest discover -s skills/_shared/scripts/tests -p "test_plan_fence_hardening.py" -v && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p "test_extract_plan_tasks.py" -v`.

### Issues

#### Critical (Must Fix)

- **agent/skills/_shared/scripts/plan_fence_hardening.py:61: Detector ignores ambiguous same-marker inner fence runs unless the inner opener has an info string**
  - **What:** `_has_unclosed_inner_fence` only treats fence lines with `i_info` as possible inner openers. A malformed outer triple-backtick example containing an unlabeled same-marker inner fence, especially a longer run such as ```` ... ````, is therefore not reported or rewritten. I verified a minimal plan with ` ``` ` outer, an inner ```` block, and later required sections still returns `missing_required_section` from `extract-plan-tasks.py` instead of `ambiguous_nested_fence`.
  - **Why it matters:** The requirement is to identify same-marker inner runs that prematurely terminate the outer fence and to replace misleading missing-section failures with the dedicated protocol error when malformed plans still appear. This missed case is still a same-marker premature-termination pattern and can hide the real later sections, so the core production failure remains possible.
  - **Recommendation:** Extend detection/rewrite to reason about no-info same-marker runs as potential inner fence openers when pairing them with a later same-marker closer reveals an intended outer closer, and add regression tests for an outer ``` block containing an unlabeled longer same-marker inner fence that currently hides `## Dependencies` / `## Risk Assessment`.

#### Important (Should Fix)

- **agent/skills/refine-plan/refine-plan-prompt.md:90: Carry-over planner edit passes are not explicitly hardened**
  - **What:** The in-loop Planner Edit Pass now runs `plan_fence_hardening.py`, but the carry-over edit pass dispatches the planner, verifies only file existence/non-emptiness, and then enters review without the new hardening step.
  - **Why it matters:** The requirement says the plan-refiner should run the helper after each planner edit pass. Carry-over remediation is also a planner edit pass, so it can introduce the same ambiguous examples before the next review era starts.
  - **Recommendation:** Add the same helper invocation after carry-over Step 4 and before Step 5, or rewrite the carry-over instructions so “per the existing Planner Edit Pass procedure” unambiguously includes the hardening step and its failure handling.

#### Minor (Nice to Have)

- **agent/skills/_shared/scripts/plan_fence_hardening.py:172: Rewriting drops the outer opener info string**
  - **What:** `_build_replacement_line` replaces the full fence line with only indentation plus the new marker, so an ambiguous outer fence like ` ```markdown` becomes `~~~` instead of `~~~markdown`.
  - **Why it matters:** This does not change the inner literal payload, but it unnecessarily removes useful syntax-labeling/readability from the outer example fence.
  - **Recommendation:** Preserve the opener’s original trailing info string when rewriting opener lines, while continuing to emit bare closer lines.

### Recommendations

- Add table-driven helper tests for both backtick and tilde ambiguous cases, including no-info inner openers and longer same-marker runs, so the implementation matches the broader “same-marker inner runs” requirement rather than only the info-string fixture.
