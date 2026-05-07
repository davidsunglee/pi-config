**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The plan broadly covers the requested helper slice, but Task 5 has a significant parsing-contract gap for the plan dependency format it must consume, and Task 1 references a required empty-tier fixture that is not declared or constructed. These should be tightened before execution.

### Strengths

- The plan decomposes the work cleanly into helper implementation tasks (Tasks 1–8), test-runner/README integration (Task 9), and call-site adoption tasks (Tasks 10–18).
- The acceptance criteria are consistently paired with concrete `Verify:` lines, including line-count checks for the “no modified skill grows” constraint.
- The plan preserves key boundaries from the spec: helpers assemble/parse mechanical data, while Task 18 explicitly keeps verifier judgment and test-runner responsibilities outside local helper logic.
- Dependencies are mostly accurate; Task 3 correctly waits for Task 1’s shared model-tier fixtures, and adoption tasks wait until helper scripts are available.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

- **Task 5: Dependency parsing omits the common `(none)` dependency form**
  - **What:** `extract-plan-tasks.py` is required to emit task dependencies/wave inputs, but Task 5 only specifies parsing lines like `- Task N depends on: Task X, Task Y`. The plan artifact itself, and typical generated plans, use lines such as `- Task 1 depends on: (none)`, yet Task 5 has no implementation step, fixture, or acceptance criterion requiring `(none)` to parse as an empty dependency list.
  - **Why it matters:** A worker can implement tests that pass against `plan-clean.md` while producing a helper that mishandles real plan files, which would break execute-plan’s downstream wave computation/adoption.
  - **Recommendation:** Add `(none)` handling explicitly to Task 5’s parser contract and fixture coverage, with an acceptance criterion verifying `dependencies == []` for a task whose dependency line is `- Task N depends on: (none)`.

- **Task 1: Empty crossProvider tier fixture is referenced but not declared**
  - **What:** Task 1 Step 2 requires a test for `--tier crossProvider.cheap` “with a fixture where that key is empty `""`,” but the Files list and Step 1 only create three fixtures: complete, no-dispatch, and missing-provider. None contains an empty `crossProvider.cheap` value.
  - **Why it matters:** The task’s test instructions reference input data that the task never creates, so an executor may either get stuck, create an undeclared fixture, or silently skip the intended missing/empty nested-tier case.
  - **Recommendation:** Either add a declared fixture such as `model-tiers-empty-cross-provider-cheap.json`, or state that the test constructs the empty-tier JSON in a temporary file.

#### Minor (Nice to Have)

- **Task 14: Title/dependency overstates parse-artifact-handoff adoption**
  - **What:** Task 14 is titled “Adopt `validate-review-provenance` + `parse-artifact-handoff`” and depends on Task 2, but its steps and acceptance criteria only adopt `validate-review-provenance.py` in `agent/skills/refine-plan/SKILL.md`.
  - **Why it matters:** This is unlikely to break execution, but it creates avoidable confusion about whether Task 14 is supposed to modify artifact-handoff behavior in that file.
  - **Recommendation:** Align the title/dependency with the actual scope, or add explicit parse-artifact-handoff instructions if there is a real refine-plan top-level handoff to adopt.

### Recommendations

- Add a small “shared plan fixture shape” note for `extract-plan-tasks.py` covering the current generated-plan dependency-section conventions, since this helper becomes foundational for execute-plan orchestration.
