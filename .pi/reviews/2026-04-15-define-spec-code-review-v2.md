# define-spec Feature Code Review

**Range:** `60f9b7a..6341e3`
**Date:** 2026-04-15
**Reviewer:** `openai-codex/gpt-5.4`

### Strengths

- `agent/skills/define-spec/SKILL.md` closely follows the approved spec: it resolves todo vs. freeform input, optionally consumes scout briefs, does project/context exploration, asks clarifying questions, writes a structured spec, and offers the `generate-plan` handoff.
- `agent/skills/generate-plan/SKILL.md`, `generate-plan-prompt.md`, and `agent/agents/planner.md` are aligned on the new provenance chain. The additions for `Source todo`, `Source spec`, and `Scout brief` are coherent and the missing-brief warning path is explicitly documented.
- README discoverability improved: `define-spec` is documented in the Skills section and `.pi/specs/` is now surfaced in the repo overview.

### Issues

#### Critical (Must Fix)

- None.

#### Important (Should Fix)

1. **Unscoped auto-commit can capture unrelated working-tree changes**
   - **File:** `agent/skills/define-spec/SKILL.md:105-107`; `agent/skills/commit/SKILL.md:22-25,30-35`
   - **What's wrong:** `define-spec` says to “Commit the spec to git using the `commit` skill,” but it never tells the commit skill which file to commit. The commit skill explicitly stages **all changes if no files are specified**.
   - **Why it matters:** In a dirty worktree, running `define-spec` can either bundle unrelated edits into the spec commit or interrupt the flow by asking the user to disambiguate files. That breaks the intended “write spec artifact, commit it, continue” workflow.
   - **How to fix:** Update `define-spec` to invoke the commit skill with the exact generated spec path (and optionally commit guidance), e.g. “commit only `.pi/specs/<date>-<topic>.md`”.

2. **The scout-brief provenance line is too ambiguous for the downstream parser**
   - **File:** `agent/skills/define-spec/SKILL.md:63-64`; `agent/skills/generate-plan/SKILL.md:18-23`
   - **What's wrong:** The new spec template says `Scout brief: .pi/briefs/<name>`, while `generate-plan` expects that line to contain a concrete file path it can read and pass through. `<name>` is looser than `<filename>` and does not communicate that the literal consumed path must be emitted.
   - **Why it matters:** This feature’s cross-suite integration depends on `generate-plan` being able to re-open the referenced scout brief. If `define-spec` emits a human label or a path without the actual filename/extension, the brief content and `{SOURCE_BRIEF}` provenance will be dropped.
   - **How to fix:** Change the template to require the exact file path that was consumed, e.g. `Scout brief: .pi/briefs/TODO-<id>-brief.md` or at minimum `.pi/briefs/<filename>.md`, and state explicitly that the literal path read in Step 2 must be copied into the spec preamble.

#### Minor (Nice to Have)

1. **README still describes the old generate-plan handoff**
   - **File:** `README.md:183-190`
   - **What's wrong:** The Skills section says `generate-plan` “Reports the plan path and suggests execution,” but `agent/skills/generate-plan/SKILL.md:146-157` now instructs it to actively offer to invoke `execute-plan`.
   - **Why it matters:** The docs no longer match the actual user-facing workflow, and this feature explicitly aims to make stage-to-stage continuation consistent.
   - **How to fix:** Update the README bullet to say that `generate-plan` offers to continue into `execute-plan` with the generated plan.

### Recommendations

- Add a small smoke-test/fixture workflow for the new provenance chain:
  - `define-spec` from a todo
  - optional brief present / missing
  - `generate-plan` consuming the spec
  - planner prompt/header containing `Source`, `Spec`, and `Scout brief` when applicable
- Consider refreshing the README’s broader workflow overview to show where optional `define-spec`/scout steps fit and where scout briefs live.

### Assessment

**Ready to merge: With fixes**

**Reasoning:** The core design is solid and the cross-skill provenance flow is mostly well aligned, but there are still two workflow-level issues: the new spec auto-commit is not safely scoped, and the scout-brief preamble format is not precise enough for the downstream parser that depends on it.
