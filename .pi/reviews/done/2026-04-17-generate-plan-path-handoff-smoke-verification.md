# generate-plan review/edit path-handoff smoke verification

Date: 2026-04-17
Workspace: `/Users/david/Code/pi-config/.worktrees/plan/move-generate-plan-review-edit-loop-to-file-based-artifact-handoff`

## Fixtures used

- `FIXTURE_FILE_WITH_BRIEF`: `.pi/specs/2026-04-17-smoke-file-with-brief.md`
  - Preamble: `Source: TODO-58b1648b`
  - Preamble: `Scout brief: .pi/briefs/2026-04-17-smoke-brief.md`
  - Unique spec marker: `SPEC-WITH-BRIEF-ALPHA-17`
- `FIXTURE_FILE_MISSING_BRIEF`: `.pi/specs/2026-04-17-smoke-file-missing-brief.md`
  - Preamble: `Scout brief: .pi/briefs/2026-04-17-does-not-exist.md`
  - Unique spec marker: `SPEC-MISSING-BRIEF-BETA-42`
- `FIXTURE_TODO_OR_FREEFORM`: existing open todo `TODO-cc8bc2c8` (`Harmonize interactive prompt conventions across skills`)
  - Branch used: **existing open todo**
- `FIXTURE_FORCE_EDIT`: construction **(b)** from the plan
  - Pre-staged known-bad plan: `.pi/plans/2026-04-17-smoke-force-edit-bad-plan.md`
  - Paired with `FIXTURE_FILE_WITH_BRIEF`
  - Bad-plan placeholder content included literal `TODO: fill in later` / `TBD` to deterministically force `[Issues Found]`

## Run 1: file input with brief -> review prompt by path

Generated plan:
- `.pi/plans/2026-04-17-smoke-file-with-brief.md`

Review prompt capture:
- `/tmp/gp-smoke.pPkqST/file-with-brief-review-prompt.md`

Prompt provenance checks:
- Contains `Plan artifact: .pi/plans/2026-04-17-smoke-file-with-brief.md`
- Contains `Task artifact: .pi/specs/2026-04-17-smoke-file-with-brief.md`
- Contains `Scout brief: .pi/briefs/2026-04-17-smoke-brief.md`

No artifact-body inlining check:

```bash
grep -c 'SPEC-WITH-BRIEF-ALPHA-17\|BRIEF-GAMMA-27\|Spec marker observed:' /tmp/gp-smoke.pPkqST/file-with-brief-review-prompt.md
# => 0
```

Approved review output written to:
- `.pi/plans/reviews/2026-04-17-smoke-file-with-brief-plan-review-v1.md`

Reviewer filesystem-read evidence (captured from the agent's verification appendix):
- `.pi/plans/2026-04-17-smoke-file-with-brief.md` — `read`
- `.pi/specs/2026-04-17-smoke-file-with-brief.md` — `read`
- `.pi/briefs/2026-04-17-smoke-brief.md` — `read`
- `agent/skills/generate-plan/review-plan-prompt.md` — `bash (rg)`
- `agent/skills/generate-plan/edit-plan-prompt.md` — `bash (rg)`
- `agent/skills/generate-plan/SKILL.md` — `bash (rg)`
- `agent/skills/generate-plan/generate-plan-prompt.md` — `bash (rg)`
- `agent/agents/plan-reviewer.md` — `bash (rg)`
- `agent/agents/planner.md` — `bash (rg)`

## Run 2: forced edit pass -> planner edit prompt by path

Forced review output:
- `.pi/plans/reviews/2026-04-17-smoke-force-edit-bad-plan-plan-review-v1.md`

Edit prompt capture:
- `/tmp/gp-smoke.pPkqST/force-edit-edit-prompt.md`

### (a) Plan/task/brief passed by path; no artifact bodies inlined

Prompt provenance checks:
- Contains `Plan artifact: .pi/plans/2026-04-17-smoke-force-edit-bad-plan.md`
- Contains `Task artifact: .pi/specs/2026-04-17-smoke-file-with-brief.md`
- Contains `Scout brief: .pi/briefs/2026-04-17-smoke-brief.md`

No artifact-body inlining checks:

```bash
grep -c 'Bad Smoke Plan' /tmp/gp-smoke.pPkqST/force-edit-edit-prompt.md
# => 0

grep -c 'SPEC-WITH-BRIEF-ALPHA-17' /tmp/gp-smoke.pPkqST/force-edit-edit-prompt.md
# => 0

grep -c 'BRIEF-GAMMA-27' /tmp/gp-smoke.pPkqST/force-edit-edit-prompt.md
# => 0
```

### (b) Review findings remain inline

```bash
grep -n 'Missing core spec coverage\|Review findings artifact:' /tmp/gp-smoke.pPkqST/force-edit-edit-prompt.md
```

Observed:
- The prompt contains the inline finding `Missing core spec coverage for the edit pass and handoff contract`
- `Review findings artifact:` count is `0`

### (c) Edit worker reads files from disk

Planner filesystem-read evidence (captured from the planner's verification appendix during the evidence replay on `.pi/plans/2026-04-17-smoke-force-edit-bad-plan-evidence.md`):
- `.pi/plans/2026-04-17-smoke-force-edit-bad-plan-evidence.md` — `read`
- `.pi/specs/2026-04-17-smoke-file-with-brief.md` — `read`
- `.pi/briefs/2026-04-17-smoke-brief.md` — `read`
- `agent/skills/generate-plan/review-plan-prompt.md` — `read`
- `agent/skills/generate-plan/edit-plan-prompt.md` — `read`
- `agent/skills/generate-plan/SKILL.md` — `read`
- Directory listing of `agent/skills/generate-plan/` and `agent/agents/` — `bash ls`

## Run 3: file input with missing brief

Expected warning text observed/validated:

```text
Scout brief referenced in spec not found at .pi/briefs/2026-04-17-does-not-exist.md — proceeding without it.
```

Generated plan:
- `.pi/plans/2026-04-17-smoke-file-missing-brief.md`

Review prompt capture:
- `/tmp/gp-smoke.pPkqST/file-missing-brief-review-prompt.md`

Downstream prompt checks:
- `Task artifact:` line present
- No downstream `Scout brief: .pi/briefs/2026-04-17-does-not-exist.md` provenance line emitted
- Workflow reached a review result (`[Issues Found]`) rather than failing

Verification grep:

```bash
grep -n 'Scout brief: \|Task artifact: \|SPEC-MISSING-BRIEF-BETA-42' /tmp/gp-smoke.pPkqST/file-missing-brief-review-prompt.md
```

Observed:
- Only the `Task artifact:` provenance line appears
- No missing-brief provenance line appears
- No missing-brief artifact body marker appears

## Run 4: todo input inline fallback

Generated plan:
- `.pi/plans/2026-04-17-harmonize-interactive-prompt-conventions-across-skills.md`

Review prompt capture:
- `/tmp/gp-smoke.pPkqST/todo-review-prompt.md`

Prompt checks:
- Contains `Plan artifact: .pi/plans/2026-04-17-harmonize-interactive-prompt-conventions-across-skills.md`
- Contains **no** `Task artifact:` line
- Contains **no** `Scout brief:` line
- `## Original Spec (inline)` contains the todo body inline (`Interactive prompts use three different conventions across skills` appears in the prompt)

Verification grep:

```bash
grep -c '^Task artifact:' /tmp/gp-smoke.pPkqST/todo-review-prompt.md
# => 0

grep -c '^Scout brief:' /tmp/gp-smoke.pPkqST/todo-review-prompt.md
# => 0

find .pi/specs -maxdepth 1 -type f | grep -c 'interactive-prompt'
# => 0
```

Interpretation:
- No temp artifact file was created under `.pi/specs/` for the todo body itself
- The todo/freeform path remained inline as intended

## Targeted missing-file failure strings

Review-pass missing plan:

```text
Plan file .pi/plans/2026-04-17-review-missing-plan.md missing — cannot dispatch plan review.
```

Review-pass missing task artifact:

```text
Task artifact .pi/specs/2026-04-17-review-missing-artifact.md missing — cannot dispatch plan review.
```

Edit-pass missing plan:

```text
Plan file .pi/plans/2026-04-17-edit-missing-plan.md missing — cannot dispatch plan edit.
```

Edit-pass missing task artifact:

```text
Task artifact .pi/specs/2026-04-17-edit-missing-artifact.md missing — cannot dispatch plan edit.
```

## Review approval semantics unchanged

Dynamic checks:
- Approved review was written to `.pi/plans/reviews/2026-04-17-smoke-file-with-brief-plan-review-v1.md` during the smoke run (before cleanup), confirming the `...-plan-review-v1.md` output path logic still works.

Static checks against `agent/skills/generate-plan/SKILL.md`:
- `## Review Notes` append logic still present (heading lines at 146 and 148 in the updated file)
- `Max 3 iterations per era` still present (line 198)
- Cross-provider review dispatch and fallback still present:
  - `crossProvider.capable` review model references on lines 65, 134, 135
  - fallback notice / retry preserved on lines 71, 79, 138

## Outcome

All required handoff behaviors were observed:
- review prompt passes plan/task/brief by path for file-based input
- edit prompt passes plan/task/brief by path and keeps review findings inline
- missing brief warns and continues without downstream `Scout brief:` provenance
- todo input remains inline and does not create a temp task-artifact file
- missing required plan/task artifacts fail with the exact required strings
- review output path, Review Notes behavior, iteration cap, and cross-provider fallback remain intact
