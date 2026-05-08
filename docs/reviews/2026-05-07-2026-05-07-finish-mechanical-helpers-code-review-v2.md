**Reviewer:** anthropic/claude-sonnet-4-6 via claude

### Outcome

**Verdict:** Approved

**Reasoning:** All four Important findings from the prior review are correctly addressed by the remediation. No new Critical or Important issues were introduced; two new Minor issues (a misleading test name and a minor coverage gap in the `preamble_helper_failure` code path) and the one pre-existing Minor finding (temp file handles in `test_fill_refine_plan_prompt.py`) remain, none of which block production readiness.

### Strengths

- `agent/skills/_shared/scripts/classify-workflow-drift.py:128-133` — The upfront `is_file()` guard is a clean fail-fast that prevents the helper from ever invoking the preamble subprocess against a non-existent path, giving callers an unambiguous exit 2 with a structured `brief_path_not_found` payload.
- `agent/skills/_shared/scripts/classify-workflow-drift.py:144-172` — The distinction between `git_sha_malformed` (normal workflow outcome → `uninspectable_a`) and all other non-zero preamble-helper exits (infrastructure failure → `preamble_helper_failure`, exit 2) precisely matches the plan's fail-closed contract. The additional guard for invalid JSON from a zero-exit preamble helper is a good defensive touch.
- `agent/skills/generate-plan/SKILL.md:27` — The gate condition is phrased in terms of the action the orchestrator just took ("i.e., `{SCOUT_BRIEF}` was set in the previous paragraph") rather than an abstract boolean, which is clear and leaves no ambiguity for implementers. The added guidance to surface non-zero classifier exits as structured failures closes the final loop.
- `agent/skills/refine-code/SKILL.md:96` — The "Caller-facing reporting format (contract)" paragraph explicitly names the consumer (`execute-plan` Step 15 / `parse-refine-code-summary.py`), quotes the exact sections required, and prohibits narrative rewriting with a concrete failure consequence. This is the minimal change needed to establish the protocol without over-specifying the skill's internal logic.
- `agent/skills/refine-plan/SKILL.md:113-123` — Step 7.5 now draws a clean boundary: the note text is skill-owned source material, the helper performs substitution, and manual post-helper replacement is explicitly forbidden. The "Before invoking the Step 7 helper:" preamble removes the ordering ambiguity from the prior version.
- `agent/skills/_shared/scripts/tests/test_classify_workflow_drift.py:267-293` — Two new regression tests cover the primary new error paths (missing brief file and unexpected preamble-helper failure), both confirming exit 2 with structured JSON on stderr.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

- **`agent/skills/_shared/scripts/tests/test_classify_workflow_drift.py:280-293`: Test name and comment are misleading after the `is_file()` guard was added**
  - **What:** `test_preamble_helper_unexpected_failure_exits_2` passes a directory as `--brief-path`. With the new `is_file()` check at `classify-workflow-drift.py:128`, the directory is caught as `brief_path_not_found` (exit 2) before the preamble helper is ever invoked. The test comment ("which is an unexpected helper failure rather than git_sha_malformed") no longer matches the actual code path exercised.
  - **Why it matters:** Misleading test names can cause maintainers to trust coverage that does not exist and miss regressions in the `preamble_helper_failure` branch.
  - **Recommendation:** Rename the test to `test_directory_as_brief_path_exits_2` and correct the comment. To actually cover the `preamble_helper_failure` branch (lines 165–172), add a separate test using a PATH-stub or a brief file whose content causes the preamble helper to exit non-zero with a non-`git_sha_malformed` payload.

- **`agent/skills/_shared/scripts/classify-workflow-drift.py:156-172`: `preamble_helper_failure` branch has no direct test coverage**
  - **What:** The else-branch that fires when the preamble helper exits non-zero with something other than `git_sha_malformed` emits `{"failure": "preamble_helper_failure", ...}` and exits 2. No test exercises this path; `test_preamble_helper_unexpected_failure_exits_2` hits `brief_path_not_found` instead (see above).
  - **Why it matters:** A future regression in this branch (e.g., accidentally routing unexpected failures back to `uninspectable_a`) would not be caught by the test suite.
  - **Recommendation:** Add a test that stubs the preamble helper to exit non-zero with a non-JSON stderr (or a payload whose `.failure` is not `git_sha_malformed`) and asserts that the classifier exits 2 with `{"failure": "preamble_helper_failure"}`. The PATH-stub pattern from `test_detect_mux_backend.py` applies here.

- **`agent/skills/refine-plan/scripts/tests/test_fill_refine_plan_prompt.py:67` (pre-existing): Temporary output files are created without closing their handles**
  - **What:** This Minor finding from the prior review was not addressed by the remediation (the file is not in the remediation diff). `NamedTemporaryFile` objects are created, `.name` is extracted, and the handle is left unclosed.
  - **Why it matters:** Produces `ResourceWarning` noise in test output and can become a failure under stricter warning modes.
  - **Recommendation:** Replace with `os.close(fd); path = tmp_path` from `tempfile.mkstemp()`, or use a `with NamedTemporaryFile(delete=False) as f:` block.

### Recommendations

- The `preamble_helper_failure` test gap (Minor above) is a natural extension of the `make_temp_repo` / stub-PATH pattern already used in `test_detect_mux_backend.py`; reusing that pattern would keep test infrastructure consistent across the helper suite.
- Consider documenting in `classify-workflow-drift.py`'s `--help` that a missing brief file produces exit 2 (not a workflow drift outcome), so command-line users understand the failure contract without reading the source.
