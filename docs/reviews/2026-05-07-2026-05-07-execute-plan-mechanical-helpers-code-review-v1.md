**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The helper set is broadly implemented and the integrated test suite passes, but `parse-verifier-report.py` fails to reject Phase 1 evidence for commands that were not supplied as allowed recipes. That violates the verifier protocol/acceptance boundary called out in the plan and can allow unauthorized verifier command output to be treated as a passing verification.

### Strengths

- Exactly eight stdlib Python helper scripts were added in the requested shared and execute-plan script directories, with README coverage and npm test integration.
- The markdown adoption work satisfies the line-count non-growth constraints, and the only agent tool-surface change is adding `bash` to `plan-refiner`.
- `cd agent && npm run check` passes, including the newly added helper tests.
- The execute-plan prose keeps the verifier as the recipe-running/judgment agent and the orchestrator as a parser/router.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

- **agent/skills/execute-plan/scripts/parse-verifier-report.py:237: Extra verifier commands are not rejected**
  - **What:** `validate_phase1_recipes()` only iterates over the supplied recipe map and checks that each expected recipe has matching evidence. It never checks whether every emitted `[Evidence for Criterion N]` command is present in the supplied recipe set, so an evidence block for an inspection-only criterion (or any extra criterion) with `command: echo unexpected` is accepted with `protocol_errors: []` when the overall report says `VERDICT: PASS`.
  - **Why it matters:** The plan requires detection of `verifier ran command not matching any phase-1 recipe: <command>` and preservation of the verifier recipe boundary. Accepting extra command evidence can let a verifier run/use commands the orchestrator did not authorize and still pass the task gate.
  - **Recommendation:** After checking required recipe evidence, iterate over all parsed evidence blocks and fail with `verifier ran command not matching any phase-1 recipe: <command>` for any evidence command that is not byte-equal to one of the supplied recipe commands (and/or whose criterion is not command-style). Add a regression test where `--phase1-recipes-json` is `[]` but the report contains a Phase 1 evidence command.

- **agent/skills/_shared/scripts/parse-artifact-handoff.py:84: Captured artifact paths are stripped before exact comparison**
  - **What:** The helper extracts the anchored marker value and then calls `.strip()` before applying `--expected-path` equality. A marker like `REVIEW_ARTIFACT: /expected/path ` will be normalized to `/expected/path` and accepted.
  - **Why it matters:** The spec calls for exact anchored-marker extraction and exact path equality. Normalizing whitespace weakens the fail-fast handoff contract and can hide malformed subagent final messages that should fail validation.
  - **Recommendation:** Preserve the captured regex group byte-for-byte except for the line terminator already excluded by the regex. Compare that raw value to `--expected-path`, and add a test asserting that trailing or leading whitespace causes `path mismatch`.

#### Minor (Nice to Have)

- **agent/skills/execute-plan/scripts/assemble-verifier-prompt.py:115: Missing input files can produce traceback stderr instead of structured JSON**
  - **What:** Template and text inputs are opened without `OSError` handling, and malformed JSON shapes can raise uncaught `KeyError`/`TypeError` while formatting.
  - **Why it matters:** The plan asks helpers to fail closed with structured JSON errors for missing or malformed inputs; traceback stderr is harder for coordinator prose to surface consistently.
  - **Recommendation:** Wrap all input reads and shape validation in explicit structured-error paths, and validate the criteria/recipe arrays before formatting.

- **agent/skills/_shared/scripts/parse-artifact-handoff.py:27: Failure JSON omits contextual fields promised by the helper contract**
  - **What:** `fail()` emits only `{"failure": ...}`; the plan specified stderr should include at least the marker and related context on failures.
  - **Why it matters:** The current call sites mostly need the failure label, but richer context improves diagnosability and keeps the helper contract consistent.
  - **Recommendation:** Include `marker` and relevant path fields in failure JSON while preserving the canonical `failure` labels.

- **agent/skills/_shared/scripts/validate-review-provenance.py:30: Provenance failures omit `review_file` and `observed` fields**
  - **What:** The helper returns only `{"failure": ...}` on every validation failure, while the spec calls for `review_file` and `observed` fields as well.
  - **Why it matters:** This is a contract/documentation mismatch that makes debugging provenance failures less precise.
  - **Recommendation:** Extend `fail()` to accept and include `review_file` and `observed` values for all failure paths.

### Recommendations

- Add negative tests that are not just “some stderr exists”; assert exact structured failure shapes for malformed/missing helper inputs.
- Add parser regression tests for verifier reports containing extra evidence blocks and mismatched commands outside the recipe map.
