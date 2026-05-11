**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The implementation satisfies the specified parser leniency, freshness-baseline fallback, strict marker contracts, and exhausted-budget UX requirements. I found no Critical or Important production-readiness issues in the reviewed diff; the remaining note is a non-blocking documentation clarity issue.

### Strengths

- The artifact handoff fallback is bounded by structural inputs and freshness checks, preserves path-mismatch rejection, and reports `used_fallback` explicitly (`agent/skills/_shared/scripts/parse-artifact-handoff.py:168-217`, `agent/skills/_shared/scripts/parse-test-runner-artifact.py:242-272`).
- Plan parsing tolerance is limited to the required punctuation/case variants while keeping unrelated headings strict (`agent/skills/execute-plan/scripts/extract-plan-tasks.py:70-87`, `agent/skills/execute-plan/scripts/extract-plan-tasks.py:128-132`).
- Reviewer/test-runner handoffs keep downstream trust gates intact: review fallback still requires provenance/verdict validation, and test-result fallback still runs structural artifact parsing (`agent/skills/refine-code/refine-code-prompt.md:123-127`, `agent/skills/_shared/scripts/parse-test-runner-artifact.py:274-276`).
- Exhausted-budget flow now clearly separates continue/save/stop decisions for plan refinement and suppresses the execute-plan offer on unapproved plans (`agent/skills/refine-plan/SKILL.md:202-218`, `agent/skills/generate-plan/SKILL.md:114-126`).
- Regression coverage is broad across the changed helpers; `cd agent && npm run test:helpers` passed locally (584 helper tests total across the suite segments).

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

- **`agent/skills/define-spec/SKILL.md:104`: Ambiguous wording around transcript-backed recovery after helper failure**
  - **What:** The paragraph says “On any check failing… surface the failure verbatim and stop,” but later in the same sentence says `missing SPEC_ARTIFACT marker` should branch to case (2a) transcript-backed recovery.
  - **Why it matters:** The intended behavior is recoverable and described nearby, but the contradiction can cause future maintainers or agents to skip the preserved transcript recovery path.
  - **Recommendation:** Rephrase the failure handling as “On failure, branch by `failure`: `missing SPEC_ARTIFACT marker` → case (2a); all other failures are surfaced and stop.”

### Recommendations

- Consider a follow-up doc-only cleanup pass to remove residual old parser-behavior phrasing such as “anchors on the LAST” where the same paragraph now requires the marker to be the final non-empty line.
