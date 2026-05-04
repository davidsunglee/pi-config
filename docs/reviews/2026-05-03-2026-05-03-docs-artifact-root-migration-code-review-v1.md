**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The diff satisfies the requested markdown-only artifact-root migration: in-scope workflow paths now use `docs/` roots, runtime `~/.pi/agent/...` references remain intact, and no TypeScript or executable fixtures were touched.

### Strengths

- `README.md:113-137` consistently documents the workflow artifacts under `docs/todos/`, `docs/specs/`, `docs/plans/`, `docs/plans/reviews/`, and `docs/reviews/` while preserving the runtime sessions reference at `README.md:223`.
- `agent/skills/define-spec/procedure.md:20-21` and `agent/skills/define-spec/procedure.md:98-107` correctly migrate todo reads, brief lookups, existing-spec detection, spec output, and spec provenance examples to `docs/` paths.
- `agent/skills/execute-plan/SKILL.md:297-302` and `agent/skills/execute-plan/SKILL.md:745-757` cover the operational paths with the new roots for test-run artifacts, completed plans, cleanup, and todo completion pointers.
- `agent/skills/refine-plan/SKILL.md:43-45`, `agent/skills/refine-plan/SKILL.md:89-97`, and `agent/skills/refine-plan/SKILL.md:254-255` keep provenance discovery, review-era allocation, and coordinator path validation aligned on `docs/specs/`, `docs/briefs/`, and `docs/plans/reviews/`.
- `agent/agents/planner.md:31` and `agent/agents/planner.md:87-89` update both artifact-reading and generated plan provenance contracts, so downstream agents receive and emit the same `docs/` paths.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

_None._

### Recommendations

_None._
