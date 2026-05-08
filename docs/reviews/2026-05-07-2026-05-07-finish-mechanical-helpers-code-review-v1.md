**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The helper suite is broadly well-tested and the full `cd agent && npm run check` command passes, but `parse-refine-code-summary.py` fails to parse the exact `## Remaining Issues (only if not_approved_within_budget)` heading required by `refine-code-prompt.md`, dropping budget-exhaustion findings from downstream execute-plan handling.

### Strengths

- `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py:100-186` implements the important artifact protocol mechanics: ordered header parsing, integer/count validation, stable identifier de-duplication, non-reconcilable entry extraction, and raw-output exclusion.
- `agent/skills/_shared/scripts/classify-workflow-drift.py:128-222` cleanly centralizes the scout-brief drift pipeline and returns structured outcome tags plus canonical message bodies.
- `agent/skills/define-spec/scripts/detect-mux-backend.py:68-127` keeps mux probing deterministic and JSON-only, including pinned-backend no-fallback behavior and user-input override handling.
- `agent/package.json:9-10` wires the new helper tests into the normal `npm run check` path; I verified `cd agent && npm run check` passes.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

- **agent/skills/refine-code/scripts/parse-refine-code-summary.py:204: Prompt-compliant remaining-issues sections are ignored**
  - **What:** The parser only recognizes a section keyed exactly as `"Remaining Issues"`, but the coordinator prompt's required output format uses `## Remaining Issues (only if not_approved_within_budget)` (`agent/skills/refine-code/refine-code-prompt.md:246`). A valid `not_approved_within_budget` summary with that heading parses successfully but returns `remaining_issues: null`; the same mismatch also prevents `unexpected_remaining_issues` validation for non-budget statuses that use the documented heading.
  - **Why it matters:** `execute-plan` Step 15 relies on this helper to present the remaining Critical/Important findings before the user chooses whether to continue, proceed with issues, or stop. Dropping those findings removes the evidence needed for that decision and violates the helper's stated contract to parse the compact refine-code output format.
  - **Recommendation:** Normalize or explicitly accept the documented heading, e.g. treat both `Remaining Issues` and `Remaining Issues (only if not_approved_within_budget)` as the remaining-issues block, and update the fixtures/tests to use the exact heading from `refine-code-prompt.md`.

#### Minor (Nice to Have)

- **agent/skills/refine-plan/scripts/tests/test_fill_refine_plan_prompt.py:67: Temporary output files are created through unclosed wrappers**
  - **What:** Several tests call `tempfile.NamedTemporaryFile(...).name` without closing the returned file object, which emitted `ResourceWarning: Implicitly cleaning up <_TemporaryFileWrapper ...>` during `npm run check`.
  - **Why it matters:** The tests still pass, but noisy resource warnings make future CI output harder to scan and can mask more meaningful warnings.
  - **Recommendation:** Use a helper that closes the `NamedTemporaryFile` before returning its path, or use `tempfile.mkstemp()`/`Path` creation with explicit close/cleanup.

### Recommendations

- Add at least one parser fixture generated from the literal `refine-code-prompt.md` Output Format block so tests stay aligned with the coordinator contract.
