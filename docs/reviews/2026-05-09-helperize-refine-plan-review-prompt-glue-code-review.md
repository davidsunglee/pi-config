**Reviewer:** anthropic/claude-opus-4-7 via claude

### Outcome

**Verdict:** Approved with concerns

**Reasoning:** All 38 helper tests pass deterministically; the three new helpers cleanly reuse the existing shared contracts (`parse-artifact-handoff.py`, `validate-review-provenance.py`, `fence_aware.py`) and the prompt rewiring is consistent. One Important finding is waived: the new step-5 prompt's failure-taxonomy mapping is less explicit than the prior `provenance malformed at <path>: <specific check>` recipe, but the existing taxonomy is still documented and the helper failure strings are byte-equal to what the previous prompt used as `<specific check>` sub-labels — practical drift risk is low.

### Strengths

- Helper interfaces are narrow and well-typed via `argparse`; each script returns a single, structured JSON object that the coordinator consumes by named field (`agent/skills/refine-plan/scripts/prepare-plan-review-prompt.py:140-144`, `validate-and-parse-plan-review.py:194-201`, `prepare-plan-edit-prompt.py:118-123`).
- Defense-in-depth on provenance: the validator first checks byte-equal first-line equality against the supplied `REVIEWER_PROVENANCE`, then re-runs `validate-review-provenance.py` against the same file (`validate-and-parse-plan-review.py:170-185`). Both paths are exercised by `test_exact_provenance_mismatch_fails_closed` and `test_defense_in_depth_provenance_validation_failure`.
- Fence-aware section parsing reuses `_shared/scripts/fence_aware.py` instead of forking the logic (`validate-and-parse-plan-review.py:14-16`, `:51-72`), so headings inside code fences will not be miscounted as severity sections.
- Fixtures cover all four reviewer verdict shapes (`Approved`, `Approved with concerns`, `Not approved`, `_None._` severity sections) plus five distinct failure modes for the validator — together that's strong coverage for the parser surface.
- Prompt rewiring renumbers correctly: the `Review Notes Append Format` cross-reference moves from step 9 → step 7 alongside the new numbering (`agent/skills/refine-plan/refine-plan-prompt.md:140`, `:178`), and the `approved_with_concerns` branch still appends only on that path.
- Temp files are created via Python `tempfile.NamedTemporaryFile` rather than shell `mktemp`, satisfying the plan's explicit acceptance criterion (`prepare-plan-review-prompt.py:67-75`, `prepare-plan-edit-prompt.py:51-59`).

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

- **`agent/skills/refine-plan/refine-plan-prompt.md:120-121`: Failure-taxonomy mapping is now implicit in prose rather than explicit per-case**
  - **What:** The new step 5 says "On non-zero exit, map the helper's stderr JSON `failure` field into the existing `reviewer artifact handoff failed: <specific check>` taxonomy and exit." The previous prompt explicitly distinguished `reviewer artifact handoff failed: <handoff-failure>` (for marker/path/existence failures from `parse-artifact-handoff.py`) from `reviewer artifact handoff failed: provenance malformed at <reviewer_path>: <specific check>` (for first-line and `validate-review-provenance.py` failures). The new prompt collapses both into one line and leaves the coordinator to infer the `provenance malformed at <path>:` prefix on its own. The same loss applies to the carry-over edit pass at `:89`.
  - **Why it matters:** The risk-assessment in the plan called out "accidentally changing `plan-refiner`'s outward failure taxonomy" as a primary risk. Downstream parsers (or eyes-on-glass operators) that grep for `provenance malformed at` may stop seeing those substrings, since whether the coordinator reproduces them depends on its interpretation of "existing taxonomy." The helper's `failure` strings include `"does not match supplied REVIEWER_PROVENANCE"`, `"format mismatch"`, `"inline-substring forbidden"`, `"missing or unrecognized Verdict label"` — these need the `provenance malformed at <reviewer_path>:` prefix to be byte-equal to the prior taxonomy, but nothing in the helper or prompt enforces that wrapping.
  - **Recommendation:** Either (a) have the helper emit a structured `category` field (e.g., `"handoff"` vs. `"provenance"`) alongside `failure` and document the explicit mapping in the prompt, or (b) restore the explicit case-by-case mapping table to the prompt (handoff failures from parse-artifact-handoff vs. provenance failures), so the coordinator does not have to remember which failures get the `provenance malformed at <path>:` prefix.

#### Minor (Nice to Have)

- **`agent/skills/refine-plan/scripts/prepare-plan-review-prompt.py:38-50`: Placeholder fill logic is duplicated rather than delegating to `_shared/scripts/fill-template.py`**
  - **What:** Both `prepare-plan-review-prompt.py` and `prepare-plan-edit-prompt.py` reimplement `fill_template` and `find_unreplaced_placeholders` with the same regex `r"\{([A-Z_][A-Z0-9_]*)\}"` that already exists in `_shared/scripts/fill-template.py`.
  - **Why it matters:** The plan's risk assessment explicitly called out "writing helpers that duplicate shared logic inconsistently." If the placeholder grammar ever changes in `fill-template.py`, these two helpers will drift silently.
  - **Recommendation:** Either subprocess into `fill-template.py` (passing placeholders as a JSON file/stdin) or extract the shared regex/substitution logic into an importable module under `_shared/scripts/`.

- **`agent/skills/refine-plan/scripts/prepare-plan-review-prompt.py:55-59`: `Path.resolve()` resolves symlinks rather than literally concatenating `{WORKING_DIR}` and the relative path**
  - **What:** `compute_review_path` calls `base.resolve()` on the working-dir-joined path, which expands symlinks for any existing path components. The previous prompt described the path as plain string concatenation `{WORKING_DIR}/{REVIEW_OUTPUT_PATH}-v<CURRENT_ERA>.md`.
  - **Why it matters:** If `{WORKING_DIR}` is a symlink (e.g., `/tmp` on macOS resolves to `/private/tmp`), the `REVIEW_ARTIFACT:` line emitted by the reviewer must match the resolved form byte-for-byte against `expected-path`. This works because the same helper produces both, but it is a behavior change vs. the documented contract and could surprise callers who construct review paths some other way.
  - **Recommendation:** Either document the realpath behavior in the helper docstring and the prompt, or skip `.resolve()` and use plain string joining (still absolute-ifying via `Path.is_absolute`).

- **`agent/skills/refine-plan/scripts/tests/test_prepare_plan_review_prompt.py`: No test for the unreplaced-placeholder protocol error**
  - **What:** Both prep helpers have an `emit_protocol_error("unreplaced placeholders remain", ...)` branch (`prepare-plan-review-prompt.py:131`, `prepare-plan-edit-prompt.py:107`) that has no test fixture.
  - **Why it matters:** This is the helper's main guard against template drift; if the actual templates change shape and break the helper, it should fail closed — but that path is not tested.
  - **Recommendation:** Add a small test that uses an `--template` pointing at a temp file containing an unknown placeholder and asserts the helper exits non-zero with `unreplaced placeholders remain`.

- **`agent/skills/refine-plan/scripts/validate-and-parse-plan-review.py:31-36`: `run_helper` swallows the helper's exit code but writes its stderr verbatim**
  - **What:** When `parse-artifact-handoff.py` or `validate-review-provenance.py` fails, the wrapper relays their stderr (already JSON `{"failure": "..."}`) and exits with the same code. That works, but the wrapper's own `fail()` adds an `extra` payload (e.g., `review_path`); the relayed failures don't get that augmentation.
  - **Why it matters:** Callers parsing stderr JSON will see different shapes depending on which check failed (helper-direct vs. relayed). Not incorrect, but inconsistent.
  - **Recommendation:** Optionally re-parse the relayed JSON and re-emit it with the wrapper's standard envelope so all failures share a uniform shape.

### Recommendations

- Consider adding a one-paragraph README cross-reference inside `agent/skills/refine-plan/scripts/README.md` that documents the explicit taxonomy mapping between helper failure strings and the `STATUS: failed` reason taxonomy — that gives both the coordinator and human reviewers a single source of truth, even if the prompt itself stays terse.
- A small follow-up to factor `fill_template` / `find_unreplaced_placeholders` into a shared module would pay dividends — there are now three places (`fill-template.py`, `prepare-plan-review-prompt.py`, `prepare-plan-edit-prompt.py`) implementing the same regex.
- The carry-over edit pass at `refine-plan-prompt.md:89` requires the coordinator to construct a synthetic final-message file just to satisfy the validator's `--marker REVIEW_ARTIFACT` contract. A `--skip-handoff-validation` flag (or a separate parse-only mode) on `validate-and-parse-plan-review.py` would let the carry-over flow skip that synthetic-file construction without losing any safety properties.
