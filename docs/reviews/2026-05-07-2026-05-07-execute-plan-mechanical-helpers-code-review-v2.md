**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The helper suite is broadly implemented and `cd agent && npm run check` passes, but a core verifier parser can return PASS while a per-criterion verdict is FAIL, which breaks the execute-plan verification gate.

### Strengths

- Exactly eight Python helper scripts were added under the expected shared and execute-plan script directories.
- Helper tests are integrated into `agent/package.json`, and the full `cd agent && npm run check` command passes.
- Markdown adoption kept all reviewed line-count constraints under their documented baselines, and the only tool-surface widening observed is `bash` on `plan-refiner`.

### Issues

#### Critical (Must Fix)

- **agent/skills/execute-plan/scripts/parse-verifier-report.py:370: Per-criterion FAIL can be reported as overall PASS**
  - **What:** The final verdict is taken directly from the report's `VERDICT:` line whenever there are no protocol errors, without checking whether any parsed `[Criterion N]` entry has `FAIL`. A report containing `[Criterion 2] FAIL` and `VERDICT: PASS` exits 0 with `{"verdict": "PASS"}`.
  - **Why it matters:** The plan explicitly requires FAIL routing on a single per-criterion failure. This helper is used to gate execute-plan verification, so a malformed or inconsistent verifier report can incorrectly let a failed acceptance criterion pass.
  - **Recommendation:** Treat any per-criterion `FAIL` as final `FAIL` regardless of the overall line, and add a regression test where a criterion fails but the overall line says `VERDICT: PASS`.

#### Important (Should Fix)

- **agent/skills/_shared/scripts/fill-template.py:113: Placeholder replacement is recursive/order-dependent**
  - **What:** The implementation repeatedly calls `str.replace` over the evolving output. If one replacement value contains another placeholder key that appears later in the JSON object, that inserted literal is replaced too, despite the documented no-recursive-expansion contract.
  - **Why it matters:** The helper is intended to fill exact prompt templates from explicit inputs. Replacing placeholder-looking text inside values can corrupt prompts/artifacts and violates the plan's `value containing {OTHER} stays as-is` requirement.
  - **Recommendation:** Replace placeholders in one pass over the original template (for example with a regex callback that only substitutes placeholders found in the template) and add a test where the inserted value contains a key that is also present in the JSON map.

- **agent/skills/execute-plan/scripts/assemble-verifier-prompt.py:45: Verifier prompt assembly has the same recursive replacement bug**
  - **What:** `fill_template()` performs sequential replacement over the evolving prompt, so placeholders inside `{TASK_SPEC}`, criteria text, recipes, modified-file text, or diff context can be replaced by later entries such as `{WORKING_DIR}`.
  - **Why it matters:** The verifier prompt must preserve raw task specs, Verify recipes, and diff context exactly; accidental substitution inside those values can change what the verifier sees and undermine the verification boundary.
  - **Recommendation:** Use the same one-pass literal placeholder algorithm as the fixed shared helper and add a regression test with `{WORKING_DIR}` or another known key embedded in task/diff content.

#### Minor (Nice to Have)

- **agent/skills/_shared/scripts/README.md:9: Helper README examples document nonexistent CLIs**
  - **What:** Several README examples use options the helpers do not support, such as `--dispatch-output`, `--handoff`, `--provenance`, `--context`, and describe `fill-template.py` as Jinja2-based.
  - **Why it matters:** The plan required the READMEs to list each helper with example invocations and failure shapes. Inaccurate examples will mislead future users even though the scripts themselves exist.
  - **Recommendation:** Replace the examples in both helper READMEs with real `python3 <script>.py ...` invocations matching each script's `--help`, and include the documented failure-shape summary.

### Recommendations

- Add regression tests for inconsistent verifier reports and for placeholder-looking text embedded in replacement values across both template helpers.
- Consider adding a small README verification test or doc-generation step from each script's `--help` to prevent README examples from drifting.
