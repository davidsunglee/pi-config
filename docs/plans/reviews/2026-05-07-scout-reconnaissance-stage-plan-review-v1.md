**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The plan covers the spec and scout brief requirements, honors the chosen fresh-context `subagent_run_serial` approach, has complete dependency declarations, and every acceptance criterion has an adjacent concrete `Verify:` recipe. Only low-impact documentation/verification polish issues remain.

### Strengths

- Tasks 1–4 fully specify the new scout agent, prompt, skill, and README with concrete file paths, exact frontmatter/placeholder requirements, and format-sensitive footguns.
- Tasks 5–9 cover the downstream integration points from the spec, including `define-spec` open-question feedforward, `generate-plan` staleness warnings, planner brief-deviation recording, and plan-reviewer brief coverage.
- Task 11 correctly separates the interactive smoke run from coder-dispatched work and provides mechanical artifact checks for the produced brief and spec.
- The dependency section accurately allows Tasks 1–10 to run independently while gating the smoke run on all integration work.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

- **Task 4: README stale-brief prompt wording drifts from the skill/spec wording**
  - **What:** Task 4 Step 8 tells the README to render stale prompts as `at SHA <brief-sha>, but HEAD is now <head-sha>`, while Task 3 and the spec use `(generated at SHA <brief-sha>; HEAD is now <head-sha>)`.
  - **Why it matters:** Execution is unaffected because Task 3 uses the canonical prompt text, but the README could document a slightly different user-facing prompt than the skill implements.
  - **Recommendation:** Align the README prompt examples with Task 3/spec wording during implementation.

- **Task 5: Diff verification timing is slightly misleading**
  - **What:** The second acceptance criterion says `git diff -- agent/skills/define-spec/procedure.md` should be checked “after the modification commit,” but after a commit the diff will normally be empty.
  - **Why it matters:** This does not block implementation, but it weakens the intended check that edits were confined to Step 2 if interpreted literally after committing.
  - **Recommendation:** Run that diff before committing, or compare against the commit with `git show` if verifying after commit.

### Recommendations

- During execution, pay particular attention to Task 3’s `--tier` parsing so the tier argument is stripped before todo/freeform input classification when it appears after a todo ID.
