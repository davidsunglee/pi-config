**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The parser now accepts the required colon-inside-bold labels while preserving strict missing-content validation, and the generate/refine workflow adds the requested executable-plan guardrail before approved plans are offered or reported as ready.

### Strengths

- `agent/skills/execute-plan/scripts/extract-plan-tasks.py:110-184` centralizes accepted required-section patterns and updates body-boundary detection so adjacent inline labels no longer mask empty required sections.
- `agent/skills/execute-plan/scripts/extract-plan-tasks.py:436-447` updates inline goal extraction to return the expected `goal` field for both `**Goal**:` and `**Goal:**` forms.
- `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py:368-464` adds regression coverage for colon-outside-bold, colon-inside-bold, mixed forms, and the strict empty-body failure case.
- `agent/skills/refine-plan/SKILL.md:149-163` and `agent/skills/generate-plan/SKILL.md:117-127` run the same `extract-plan-tasks.py` validator at review/readiness and execute-plan-offer boundaries.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

_None._

### Recommendations

- Keep future plan-format tolerance in `SECTION_RULES` and matching focused tests so parser behavior remains explicit and regression-resistant.
- Verification run: `python3 -m unittest agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` (129 tests passed).
