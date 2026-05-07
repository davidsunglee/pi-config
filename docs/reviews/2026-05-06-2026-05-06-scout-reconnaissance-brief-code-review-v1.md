**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The markdown contracts add the requested scout skill, worker agent, prompt template, downstream brief handoff updates, validation/commit gates, and staleness/review guidance. Remaining findings are documentation/prompt wording inconsistencies that should be cleaned up but do not block production use.

### Strengths

- The new `scout` skill covers the main orchestration contract: todo/freeform pathing, strict model-tier resolution, synchronous `subagent_run_serial { wait: true }`, `BRIEF_WRITTEN:` validation, commit gate, and todo-only `/define-spec` continuation.
- The scout prompt encodes the required broad-orientation, task-focused deep dive, and disconfirmation passes while preserving the eight-section consumer-shaped brief format.
- Downstream updates are appropriately surgical: define-spec gets Open Questions feedforward, generate-plan gets SHA staleness warnings, planner records brief deviations, and plan-reviewer gets a brief-coverage check.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

- `agent/skills/scout/SKILL.md:65` and `agent/skills/scout/SKILL.md:67` do not use the exact stale-existing-brief prompt wording from the requirement (`..., generated at SHA <brief-sha>. HEAD is now <head-sha>, so the brief may be stale...`). The current parenthesized/semi-colon wording is understandable, but this is a contract prompt and should be aligned if downstream acceptance checks or user docs expect the literal text.
- `README.md:24` still says there are 15 workflow skills after adding `scout`, and `README.md:33-38` omits `docs/briefs/` from the repository layout even though later sections document briefs as a first-class artifact. This makes the top-level inventory stale.
- `README.md:75-77` labels `Define spec` as optional in the same diagram path that now includes scout, while `README.md:115` explains that define-spec is mandatory after scout. The prose mitigates the issue, but the diagram can still mislead users about the scout-to-planning path.

### Recommendations

- Align the stale-brief prompt strings byte-for-byte with the spec/plan to avoid contract drift.
- Update the README layout/counts and make the workflow diagram match the mandatory define-spec handoff after scout.
- If not already retained elsewhere, keep a lightweight smoke transcript for `/scout TODO-bbe89373` and the follow-on `/define-spec TODO-bbe89373` handoff so future reviewers can verify the markdown contract against an actual run.
