**Reviewer:** openai-codex/gpt-5.5 via pi

### Strengths
- `agent/skills/_shared/model-tier-resolution.md` centralizes the required primitive operations, strict policy, canonical failure templates, coordinator-dispatch boundary, and approved skill-specific fallback chain in one readable document.
- Consumer updates consistently replace duplicated dispatch-resolution prose with relative links to the canonical document while preserving role-to-tier mappings, retry/escalation behavior, and provenance-validation rules.
- `agent/skills/_shared/coordinator-dispatch.md` preserves the coordinator-only four-tier chain and hard-stop messages while making worker re-resolution strict.
- Manual audit checks found no stale default-to-pi rule outside the allowed negation context, and `npm test --prefix agent` passed: 118 tests passed.

### Issues

#### Critical (Must Fix)
None found.

#### Important (Should Fix)
None found.

#### Minor (Nice to Have)
None found.

### Recommendations
- Keep the documented grep audit in the plan as the recurring guardrail for future skill edits, since this change intentionally centralizes policy in prose rather than adding automated lint enforcement.

### Assessment

**Ready to merge: Yes**

**Reasoning:** The diff satisfies the canonicalization requirements, preserves the coordinator and fallback semantics called out in the plan, and passes the specified test command. No production-readiness issues were found.
