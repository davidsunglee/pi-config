**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Approved

**Reasoning:** The diff implements the requested helpers, adopts them at the relevant skill call sites, preserves the verification boundary, and the full project check passes. I found only a minor prompt-fidelity issue that does not block production readiness.

### Strengths

- `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py:100-195` cleanly validates the ordered artifact header, parses counts, deduplicates failing identifiers, preserves non-reconcilable entries, and excludes raw output.
- `agent/skills/_shared/scripts/classify-workflow-drift.py:135-244` implements the bounded provenance extraction, git ancestry/diff pipeline, NUL-separated path parsing, and allowlist classification without running any verification commands itself.
- `agent/skills/define-spec/scripts/detect-mux-backend.py:68-106` centralizes mux detection and override precedence into a deterministic JSON-producing probe.
- `agent/package.json:9-10` wires all new helper test directories into the existing `npm run check` path; I verified `cd agent && npm run check` passes.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

_None._

#### Minor (Nice to Have)

- **agent/skills/execute-plan/scripts/assemble-coder-prompt.py:158-161: Prompt inputs lose trailing newlines**
  - **What:** The helper applies `rstrip("\n")` to `TASK_SPEC`, `CONTEXT`, and the enabled TDD block before substitution.
  - **Why it matters:** The helper is specified as a literal single-pass prompt assembler, and trimming means inputs are not quite carried through verbatim. This is unlikely to alter behavior, but it can make byte-level prompt comparisons/debugging less exact.
  - **Recommendation:** Substitute the read values unchanged unless there is a documented formatting reason to normalize final newlines.

### Recommendations

- Consider adding one regression test for trailing-newline preservation in prompt-fill helpers if exact prompt byte fidelity becomes important for future orchestration debugging.
