**Reviewer:** openai-codex/gpt-5.5 via pi

### Strengths
- The reviewer-side contract is added consistently to both agent identities and prompt templates, including the conditional standalone path behavior and final `REVIEW_ARTIFACT:` marker discipline.
- Both refiner prompts now source the authoritative review from disk, validate marker/path/non-empty/provenance before parsing, and explicitly forbid inline or improvised fallback on artifact-handoff failures.
- The plan-reviewer fallback path correctly reconstructs the provenance line before retrying with the fallback model, avoiding a primary-model stamp on a fallback-authored artifact.
- The legacy code-refiner unversioned final copy is removed from both the coordinator prompt and the outer skill validation path, matching the requirement.
- `git diff --check` reported no whitespace errors for the reviewed range.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)
None.

### Recommendations
- Run the manual smoke scenarios from the spec before merging: at minimum one refine-plan and one refine-code path showing that the reviewer writes the on-disk artifact and returns only the marker, plus an oversized review to validate the truncation fix in practice.

### Assessment

**Ready to merge: Yes**

**Reasoning:** The markdown-only implementation matches the artifact handoff requirements across the plan and code review/refiner paths, with clear failure handling and no remaining unversioned final-copy behavior.