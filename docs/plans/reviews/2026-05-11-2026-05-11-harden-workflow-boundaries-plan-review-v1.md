**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** Task 1's fallback design rejects the primary observed missing-terminal-marker case (a marker line followed by later prose), so the plan would not satisfy the fallback requirements. There are also Important spec-boundary concerns in Tasks 2 and 11 that should be addressed while fixing the Critical issue.

### Strengths

- The plan is highly detailed and decomposes the work into sensible parser, prompt-contract, fallback-wiring, and UX tasks.
- Dependencies are mostly accurate: the call-site wiring tasks depend on the shared fallback parser, and the test-runner dispatch waits for `parse-test-runner-artifact.py` support.
- Most acceptance criteria are paired with concrete `Verify:` recipes, including targeted unittest commands and grep checks.
- The plan explicitly preserves strict downstream validation for review provenance, test-result structure, and out-of-scope parsers.

### Issues

#### Critical (Must Fix)

- **Task 1: Fallback rejects marker-followed-by-summary cases**
  - **What:** Step 3's second malformed-marker scan treats any column-1 `<MARKER>: <path>` line that is not the terminal non-empty line as `malformed_marker_seen`, then fails before attempting the freshness fallback. The spec's context explicitly includes the observed failure where a subagent appends a summary after the marker; under the plan, that case is rejected even when the expected on-disk artifact is fresh and valid.
  - **Why it matters:** This leaves the main missing-terminal-marker failure mode unresolved across all five downstream handoffs, so agents executing the plan would build behavior that does not meet the original fallback requirement.
  - **Recommendation:** Narrow malformed-marker rejection to fenced/quoted/indented/backticked contexts, or explicitly handle a non-terminal column-1 marker followed by prose as a recoverable missing-terminal-marker case when the on-disk artifact is fresh and valid. Preserve path-mismatch safeguards, and add a test for `MARKER: <expected-path>` followed by summary text.

#### Important (Should Fix)

- **Task 2: Case-insensitive section matching exceeds the bounded tolerance in the spec**
  - **What:** Step 5 proposes compiling all `SECTION_RULES` with `re.IGNORECASE`, including `Goal`, `File Structure`, `Dependencies`, and task-heading detection. The spec only calls out title-case/sentence-case variants for `Architecture summary`, `Tech stack`, and `Risk assessment`, and lists generalized parser relaxation beyond the enumerated variants as a non-goal.
  - **Why it matters:** This widens a machine-trust parser beyond the bounded surface variants the spec authorized, making the implemented gate looser than intended.
  - **Recommendation:** Use explicit patterns for only the accepted section-heading variants, or document and test the broader case-insensitive behavior as an intentional spec change before execution.

- **Task 11: SPEC_ARTIFACT fallback is conditional despite the all-five-handoffs requirement**
  - **What:** Task 11 wires the new `--freshness-baseline` fallback only for define-spec's existing-spec branch and explicitly skips todo/freeform branches. The Risk Assessment acknowledges this deviation from the spec's “All five call sites adopt the fallback” requirement and gives a rationale, but the task acceptance criteria no longer cover uniform SPEC handoff fallback behavior.
  - **Why it matters:** Executing the plan will leave common define-spec flows outside the new deterministic fallback behavior and `used_fallback` reporting promised by the spec, unless the user accepts the documented exception.
  - **Recommendation:** Either add a deterministic, spec-compliant strategy for todo/freeform SPEC handoffs, or revise the plan/spec acceptance criteria to explicitly record the existing transcript-backed recovery as the approved exception for those branches.

#### Minor (Nice to Have)

- **Task 11: Existing-spec path wording is internally inconsistent**
  - **What:** Step 2 defines the existing-spec branch as requiring the file to exist, while Step 3 discusses a missing-file baseline of `0`; Step 3 also says to resolve the path to absolute while referencing an existing directive not to normalize relative/absolute paths. Step 4 then says to pass `<input-spec-path>` alongside an absolute `--require-path-prefix`.
  - **Why it matters:** This may confuse implementers handling relative `docs/specs/...` inputs and could produce a fallback path that fails the absolute prefix check.
  - **Recommendation:** Define a separate internal absolute expected-path variable for validation/fallback and state exactly which path form is passed to `--expected-path`, `--require-path-prefix`, and the subagent write target.

### Recommendations

- Add one end-to-end-style missing-marker test per parser family that models the real failure: marker line emitted, then extra prose after it, with a fresh on-disk artifact.
- After resolving the findings, keep the final `cd agent && npm run test:helpers` command as the broad regression gate.
