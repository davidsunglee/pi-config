**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The plan covers the requested helper set and adoption sites broadly, but it contains contradictory instructions that would cause implementation workers to build incompatible behavior or fail their own verification steps.

### Strengths

- The plan maps all nine requested helpers to concrete file paths, tests, READMEs, package wiring, and adoption tasks.
- Dependencies and wave assignment are mostly coherent: Task 6 correctly waits for Task 5, and adoption tasks wait for helper/test wiring.
- Most acceptance criteria include objective `Verify:` recipes with concrete commands or file checks.
- The plan explicitly preserves the predecessor verification boundary and keeps interactive policy in the relevant skills rather than moving it into helpers.

### Issues

#### Critical (Must Fix)

- **Task 1: Contradictory count-validation behavior for duplicate failing identifiers**
  - **What:** Task 1 gives mutually incompatible instructions for `FAILING_IDENTIFIERS_COUNT`. The File Structure section says the deduplicated result count must equal `FAILING_IDENTIFIERS_COUNT`; Task 1 Step 2 says a block `id1, id2, id1` with `count=3` should fail because the post-dedup count is 2, then immediately says the clarified rule is to validate COUNT against the raw line count before deduplication, which would make that same fixture pass.
  - **Why it matters:** A coder cannot know whether to validate against raw lines or deduplicated output, and tests written from one interpretation will fail an implementation written from the other.
  - **Recommendation:** Choose one rule and make the File Structure, Risk Assessment, Task 1 test descriptions, implementation steps, and acceptance criteria all state that same rule.

- **Task 12: Replacement instructions conflict with the required preserved `workflow-artifact-paths.md` spot-check**
  - **What:** Task 12 Step 3 instructs the worker to replace the entire staleness-classifier subsection, including the `workflow-artifact-paths.md` reference, with a paragraph that does not mention `workflow-artifact-paths.md`. Task 12 Step 6 then requires `grep -c "workflow-artifact-paths.md" agent/skills/generate-plan/SKILL.md` to return at least 1.
  - **Why it matters:** Following the edit instructions as written causes the verification step to fail; preserving the reference requires guessing where to add prose that the replacement paragraph does not specify.
  - **Recommendation:** Either include the `workflow-artifact-paths.md` cross-reference in the replacement paragraph or remove the spot-check if the reference is intentionally moved into the helper/README/help text.

#### Important (Should Fix)

- **Task 1: Acceptance criterion says seven failure conditions but verifies six named methods**
  - **What:** The criterion “All seven failure conditions fail closed with their documented labels” lists six test methods in its `Verify:` line and omits `count_field_malformed`, even though the helper’s failure-label contract includes it.
  - **Why it matters:** This weakens coverage for a documented parse-error case and can let a helper ship without testing one advertised failure label.
  - **Recommendation:** Add a `count_field_malformed` test method to Task 1 and include it in the criterion’s `Verify:` recipe, or change the wording if that label is intentionally covered elsewhere.

#### Minor (Nice to Have)

- **Task 8: Failure-condition count wording is inconsistent**
  - **What:** The final acceptance criterion says “All ten fail-closed conditions” but the `Verify:` line names nine test methods.
  - **Why it matters:** This is unlikely to block implementation, but it can confuse the worker about whether a missing tenth test is expected.
  - **Recommendation:** Align the count with the listed methods or add the missing test name.

### Recommendations

- Re-run a consistency pass specifically on helper protocol details that appear in multiple sections (Architecture summary, File Structure, task steps, Risk Assessment, and acceptance criteria) before dispatching implementation.
