**Reviewer:** openai-codex/gpt-5.5 via pi

### Outcome

**Verdict:** Not approved

**Reasoning:** The helper extraction is broad and well-tested, but the integration-test reconciliation path is currently broken because baseline capture produces a shape that reconcile mode rejects and the skill never defines a compatible baseline snapshot file.

### Strengths

- `agent/skills/execute-plan/SKILL.md` is reduced to 555 lines, satisfying the ≤600-line cap.
- The new helpers are covered by substantial unit tests, and `cd agent && npm run test:helpers` passes (141 shared, 148 execute-plan, 51 refine-code, 22 refine-plan, 19 define-spec tests).
- Carry-over remediation is clearly threaded into both refinement prompts and skill entry points (`agent/skills/refine-code/refine-code-prompt.md:84-99`, `agent/skills/refine-plan/refine-plan-prompt.md:84-97`).

### Issues

#### Critical (Must Fix)

- **agent/skills/_shared/scripts/reconcile-test-run.py:113: Baseline capture output is incompatible with reconcile input**
  - **What:** Capture mode emits `baseline_failures`, but reconcile mode's `_load_baseline()` requires a JSON file with `failing_identifiers` (`agent/skills/_shared/scripts/reconcile-test-run.py:62-69`). `execute-plan` Step 7 only says to record `.baseline_failures` in memory (`agent/skills/execute-plan/SKILL.md:159-169`), while later gates call reconcile with an undefined `<baseline-json-path>` (`agent/skills/execute-plan/SKILL.md:411`, `agent/skills/execute-plan/SKILL.md:515`). Redirecting capture output and feeding it to reconcile fails with `baseline_failures_invalid`.
  - **Why it matters:** With integration tests enabled, post-wave and final-gate reconciliation cannot reliably run from the documented workflow, so execute-plan either stops on a helper protocol error or requires the orchestrator to improvise undocumented JSON transformation.
  - **Recommendation:** Define and write a baseline snapshot path in Step 7 using the schema reconcile consumes (for example `{"failing_identifiers": [...]}`), or change reconcile mode to accept the capture output shape. Add a regression test that capture output can be persisted and used by reconcile mode.

#### Important (Should Fix)

- **agent/skills/execute-plan/scripts/extract-plan-tasks.py:287: Accepted inline `**Goal**:` plans emit a null goal**
  - **What:** Section validation explicitly accepts `**Goal**:` as satisfying the required goal section (`agent/skills/execute-plan/scripts/extract-plan-tasks.py:66-68`), but the goal extraction logic only handles an exact `## Goal` heading (`agent/skills/execute-plan/scripts/extract-plan-tasks.py:287-297`). A plan that passes validation via the inline form produces `goal: null` in the manifest.
  - **Why it matters:** `execute-plan` uses the manifest goal in the settings summary and later review inputs; valid plans using the documented inline form lose their goal and produce degraded or incorrect orchestration prompts.
  - **Recommendation:** Parse `**Goal**:` with the same rules used by validation, or stop accepting the inline form if it is not meant to be supported.

- **agent/skills/execute-plan/scripts/compute-verifier-file-set.py:202: Missing observed-status files produce a Python traceback instead of structured stderr JSON**
  - **What:** The helper catches malformed JSON inputs, but it opens `--observed-status` without an `OSError` handler. A missing or unreadable status file exits with a traceback rather than a documented JSON failure (`agent/skills/execute-plan/scripts/compute-verifier-file-set.py:198-203`).
  - **Why it matters:** These helpers are intended to be deterministic protocol boundaries. Unstructured tracebacks make orchestrator failures harder to route and violate the plan requirement that helper protocol errors use structured stderr JSON.
  - **Recommendation:** Add a documented protocol-error label for unreadable status input (or fold it under `input_json_invalid` only if the contract is renamed), emit JSON to stderr, and test the missing-file path.

#### Minor (Nice to Have)

_None._

### Recommendations

- Add an end-to-end helper test for the integration gate lifecycle: capture baseline, persist the baseline file, then reconcile a later artifact against it.
