**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The implementation covers the requested helper surface and the integrated test suite passes, but there are correctness issues in core helper contracts that should be fixed before relying on these scripts in orchestration flows.

### Strengths

- `agent/package.json:9` wires all five helper test directories into `npm run test:helpers`, so `npm run check` now exercises the new Python helpers alongside the extension tests.
- `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py:100-180` performs closed validation of artifact presence, ordered headers, integer fields, count checks, deduplication, and raw-output exclusion in one deterministic parser.
- `agent/skills/define-spec/scripts/detect-mux-backend.py:54-106` cleanly centralizes the mux environment/PATH precedence and user override scan without spawning a backend.
- Verification run completed successfully: `cd agent && npm run check` passed, including 124 extension tests and all helper unittest suites.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

- **agent/skills/refine-plan/scripts/fill-refine-plan-prompt.py:171: placeholder replacement is not single-pass**
  - **What:** The helper applies replacements by looping over `content.replace(...)`. If an earlier replacement value contains a later owned placeholder token, that token is replaced on a later loop iteration. For example, a literal task-artifact value of `{SOURCE_TODO}` is rewritten to the `--source-todo` value.
  - **Why it matters:** The plan requires single-pass literal substitution with no recursive expansion. This can corrupt user/spec text that happens to contain one of the helper-owned placeholder names, making the generated coordinator prompt differ from the source material.
  - **Recommendation:** Use the same regex callback approach as the other prompt-fill helpers: substitute only tokens found in the original template, and return replacement values verbatim. Add a regression test where a replacement value contains another owned placeholder such as `{SOURCE_TODO}`.

- **agent/skills/_shared/scripts/extract-provenance-preamble.py:47: required file I/O failures are not returned as structured JSON**
  - **What:** `extract-provenance-preamble.py` opens `--file` without catching `OSError`, so a missing/unreadable path produces a Python traceback instead of stderr JSON with a `failure` field. The same pattern also appears in summary readers such as `agent/skills/refine-code/scripts/parse-refine-code-summary.py:163` and `agent/skills/refine-plan/scripts/parse-refine-plan-summary.py:131`.
  - **Why it matters:** The helper contract requires structured JSON on failure and exit code 2 for unexpected I/O errors. These helpers are called from markdown skill procedures that are supposed to surface structured helper failures; traceback text breaks that contract and degrades user-facing orchestration failure handling.
  - **Recommendation:** Catch `OSError` around required input reads and emit documented JSON failures with `failure` and relevant path/input fields, exiting 2. Add missing/unreadable input tests for these CLIs.

- **agent/skills/_shared/scripts/classify-workflow-drift.py:186: git HEAD failures can be misclassified when the brief SHA is missing or malformed**
  - **What:** When `git rev-parse HEAD` fails and the brief preamble is also missing/malformed, the helper emits `uninspectable_a` with `error: null` instead of the required `uninspectable_c` git-failure outcome.
  - **Why it matters:** The classifier's six outcome tags are the routing API consumed by `generate-plan`. A repository/probe failure should surface the git error verbatim so the user knows the repo state could not be inspected, rather than reporting only a missing brief SHA.
  - **Recommendation:** Treat `git rev-parse HEAD` failure as `uninspectable_c` regardless of preamble validity, preserving the failing stderr in `error`, and add a test for missing/malformed brief SHA outside a git repository.

#### Minor (Nice to Have)

_None._

### Recommendations

- Add a small shared Python utility for JSON failure emission and single-pass placeholder substitution so future helper scripts do not drift in exit-code or error-shape behavior.
