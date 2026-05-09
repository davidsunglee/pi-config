**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The implementation satisfies the marker rename, dual-channel handoff, planner validation, define-spec path-shape validation, and mux/todo cleanups with focused helper changes and regression coverage. I found no Critical or Important production-readiness issues; targeted helper tests pass via direct unittest discovery.

### Strengths

- `parse-artifact-handoff.py` centralizes the new marker family and rejects old names through argparse `choices`, while adding reusable suffix/prefix validation without duplicating orchestrator logic (`agent/skills/_shared/scripts/parse-artifact-handoff.py:25-84`, `agent/skills/_shared/scripts/parse-artifact-handoff.py:123-133`).
- Define-spec now validates `SPEC_ARTIFACT` with existence, non-empty, `.md` suffix, and `docs/specs/` prefix checks before proceeding to the review/commit gate (`agent/skills/define-spec/SKILL.md:67-71`).
- Generate-plan now requires and validates a `PLAN_ARTIFACT` marker before handing off to refine-plan, closing the previously unvalidated initial planner handoff (`agent/skills/generate-plan/SKILL.md:69-77`, `agent/skills/generate-plan/generate-plan-prompt.md:32-45`).
- The regression suite covers prompt/agent dual-channel instructions and old marker absence across all marker-emitting surfaces (`agent/skills/_shared/scripts/tests/test_marker_emit_contract.py:32-57`, `agent/skills/_shared/scripts/tests/test_marker_emit_contract.py:72-95`).
- The define-spec cleanups are reflected in code/prose and tests: todo input normalization is documented (`agent/skills/define-spec/spec-design-procedure.md:28`) and the mux override list no longer treats the bare word `inline` as an override (`agent/skills/define-spec/scripts/detect-mux-backend.py:40-45`).

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

_None._

### Recommendations

- Consider documenting the correct helper-test command in the project docs; `npm run test:helpers` is referenced in the plan but this repo has no `package.json`, while direct unittest discovery for the changed helper tests passes.
