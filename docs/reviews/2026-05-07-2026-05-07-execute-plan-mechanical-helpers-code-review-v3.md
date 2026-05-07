**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The helper implementations are broadly tested and `cd agent && npm run check` passes, but the new helper READMEs contain materially incorrect command examples and descriptions that violate the plan's documentation contract and would mislead operators adopting these scripts.

### Strengths

- The change adds the requested eight Python stdlib helper scripts with focused unittest coverage, and the integrated `agent/package.json` `check` script now runs the helper tests.
- Markdown adoption preserves the line-count constraints and the execute-plan verifier judgment boundary: helpers assemble/parse while the verifier remains responsible for executing command-style recipes and judging criteria.
- Tool-surface widening appears scoped correctly: only `agent/agents/plan-refiner.md` gains `bash`.
- Verification evidence: `cd agent && npm run check` completed successfully in this review.

### Issues

#### Critical (Must Fix)

_None._

#### Important (Should Fix)

- **agent/skills/_shared/scripts/README.md:9: Shared helper README documents nonexistent interfaces**
  - **What:** The README examples/descriptions do not match the actual helpers or the plan. For example, `resolve-model-dispatch.py` is documented with `--dispatch-output`/`--task-id`, `parse-artifact-handoff.py` with `--handoff --validate`, `validate-review-provenance.py` with `--provenance --strict`, and `fill-template.py` as a Jinja2 renderer with `--context`; none of those flags/behaviors exist.
  - **Why it matters:** The plan requires each helper README to list every helper with accurate purpose, example invocation, and failure shape. These commands will fail if copied, and the Jinja2 claim contradicts the stdlib literal-substitution contract.
  - **Recommendation:** Rewrite the four shared-helper bullets to use the real CLIs (`--tier/--agent`, `--marker/--final-message`, `--review-file/--allowed-tiers`, `--placeholders-json`) and include the documented canonical failure shapes.

- **agent/skills/execute-plan/scripts/README.md:9: Execute-plan helper README examples use invalid flags**
  - **What:** The execute-plan README examples likewise name unsupported arguments: `extract-plan-tasks.py --output`, `collect-diff-context.py --branch`, `assemble-verifier-prompt.py --task --diffs --state`, and `parse-verifier-report.py --criteria --output` are not valid interfaces.
  - **Why it matters:** This is a requirements miss for the new README and creates a sharp edge for the exact operator-facing scripts introduced by the change.
  - **Recommendation:** Replace the examples with valid invocations matching each helper's `--help`, and add the canonical failure/protocol-error shapes required by the plan.

#### Minor (Nice to Have)

- **agent/skills/_shared/scripts/parse-artifact-handoff.py:27: Failure JSON omits documented context fields**
  - **What:** All failures are emitted as `{"failure": ...}` only, while the plan specifies structured failures should include the marker and other relevant context.
  - **Why it matters:** Current call sites only need the failure label, but the helper contract promised richer diagnostics for automation and troubleshooting.
  - **Recommendation:** Include at least `marker` on all failures, plus `expected`/`got` or `path` when applicable.

- **agent/skills/_shared/scripts/validate-review-provenance.py:30: Provenance failure JSON omits `review_file` and `observed`**
  - **What:** The helper emits only `{"failure": ...}`, but the plan's contract calls for `failure`, `review_file`, and `observed` fields.
  - **Why it matters:** The narrowed shape is usable by the current prose, but it does not satisfy the documented CLI contract and makes multi-review diagnostics less precise.
  - **Recommendation:** Extend `fail()` to accept and emit `review_file` and `observed` values while preserving the existing `failure` labels.

### Recommendations

- After correcting the READMEs, add a small README smoke test or CI grep that invokes each documented example with `--help`/fixture-safe arguments so the docs do not drift from the CLIs again.
