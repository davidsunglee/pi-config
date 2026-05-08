# Decompose execute-plan: test-runner-dispatch and internal protocol docs

Source: TODO-b733a4af

## Goal

Extract four reusable pieces from the `execute-plan` monolith to slim the orchestrator and surface the most-useful pieces of its current responsibility on the right naming/discoverability tier. One piece — the test-runner dispatch path — becomes a shared internal protocol doc (`test-runner-dispatch`) co-located with `coordinator-dispatch` under `agent/skills/_shared/`; the other three — per-task acceptance verification, the integration-regression gate, and the debugger-first flow — become internal protocol docs co-located with `execute-plan`. Net effect: `execute-plan/SKILL.md` shrinks from 775 lines to ≤ 600, the test-runner dispatch becomes available to other workflows behind a clean four-input contract, and the per-task verification, integration-regression gate, and debugger-first flow each live in single-source-of-truth files instead of inline prose.

The "extract every piece into a top-level skill" framing in the source TODO is intentionally narrowed in this spec: only the test-runner dispatch passes a strict standalone-use bar today (clean contract, plausible non-`execute-plan` callers), and even that one is kept as internal markdown for now rather than promoted to a discoverable top-level skill — its placement in `_shared/` rather than `execute-plan/` signals cross-skill reusability without committing to a public skill surface area before a second caller actually exists. The other three are valuable as internal markdown but their inputs are sufficiently shaped by execute-plan's surrounding context that promoting them to discoverable skills (or even to `_shared/`) would produce thin-veneer abstractions; they live under `execute-plan/`. Items 5 (`subagent-wave-gate`) and 6 (`execution-workspace-preflight`) from the TODO are deliberately deferred to future work.

This spec also folds in one pre-existing naming-convention outlier — `agent/skills/define-spec/procedure.md` — to align with the "noun-phrase ending in a type word" pattern used by the rest of the suite's internal protocol docs.

## Context

`agent/skills/execute-plan/SKILL.md` is the largest skill in the suite at 775 lines (capped by the prior `2026-05-07-orchestrator-verification-boundary` spec). Several of its sub-procedures are already partly extracted as internal markdown, establishing a precedent this spec extends:

- `agent/skills/execute-plan/integration-regression-model.md` — the frozen-baseline reconciliation data model + canonical user-facing summary format. Referenced from Steps 7, 12, 12 (debugger-first flow), 14, and 16.
- `agent/skills/_shared/orchestrator-verification-boundary.md` — the boundary principle that applies to all orchestrator skills (`execute-plan`, `refine-code`, `refine-plan`).
- `agent/skills/_shared/coordinator-dispatch.md` — coordinator dispatch resolution chain.
- `agent/skills/_shared/model-tier-resolution.md` — tier-path / provider-prefix / dispatch-lookup primitives.

Static helper scripts under `agent/skills/_shared/scripts/` and `agent/skills/execute-plan/scripts/` (delivered by TODO-c6a7a5d0) already cover the mechanical parsing/prompt-assembly layer (`parse-test-runner-artifact.py`, `parse-verifier-report.py`, `assemble-verifier-prompt.py`, `extract-plan-tasks.py`, `collect-diff-context.py`, etc.). This spec extracts the procedural skeletons that compose those helpers — the orchestrator-side dispatch and reconciliation protocols, not the per-script logic.

### The four pieces this spec extracts

1. **Test-runner dispatch path** — currently in execute-plan Step 7 (the "Test-runner dispatch (shared)" subsection, ~30 lines), called also from Step 12.2, the Step 12 debugger-first flow's success re-test, and Step 16. Wraps `subagent_run_serial { test-runner }`, validates the artifact handoff marker, parses the artifact via `parse-test-runner-artifact.py`, and returns structured `(exit_code, failing_identifiers, non_reconcilable_failures, artifact_path)`. The dispatched agent (`test-runner`) follows a deterministic two-bucket extraction contract (per-runner stable identifiers + non-reconcilable evidence) defined in `agent/agents/test-runner.md`, so the only variable inputs from a caller are the test command, working directory, artifact path, and an optional phase label.

2. **Per-task acceptance verification** — currently in execute-plan Step 11 (~55 lines including assembly, dispatch, parse, and verdict routing). Caller supplies a task spec, list of acceptance criteria with attached `Verify:` recipes, a verifier-visible file set, diff context, and working directory; the protocol fills `agent/skills/execute-plan/verify-task-prompt.md`, dispatches one `verifier`, parses per-criterion verdicts plus overall `VERDICT:`, and returns structured per-criterion results. Wave-level parallelism, retry loops, remediation menus, and the `{MODIFIED_FILES}` union rule (which is wave-shape-specific) stay in `execute-plan` proper.

3. **Integration-regression gate** — currently the most diffuse piece in execute-plan: Step 7 (baseline capture + freeze), Step 12.2 (post-wave reconciliation), Step 16 (final-gate reconciliation), plus the user-facing summary format in `integration-regression-model.md`. The gate captures the baseline via the test-runner dispatch path, freezes `baseline_failures`, reconciles each later run as `current_failing_stable \ baseline_failures`, and renders the canonical three-section user-facing summary. Menus, post-wave commits, debug-vs-continue-vs-stop choices, and retry-budget interactions stay in execute-plan because their shapes are caller-specific.

4. **Integration-regression debugger-first flow** — currently the "Debugger-first flow" subsection of execute-plan Step 12 (~35 lines), parameterized by a Step 12 vs Step 16 row. Identifies suspect tasks/files from failing identifiers + diff range, dispatches a single debugger-style `coder` pass following `systematic-debugging`, optionally dispatches a targeted remediation, commits via a caller-supplied template, and re-runs the gate via a caller-supplied callback. Menu rendering, retry-budget bookkeeping, and the actual undo execution stay in execute-plan.

### Naming convention

The internal-markdown naming convention currently in use across the suite is **noun-phrase ending in a type word**: `coordinator-dispatch`, `model-tier-resolution`, `orchestrator-verification-boundary`, `workflow-artifact-paths`, `integration-regression-model`. Top-level skills (`SKILL.md` with `name:` frontmatter) use **verb-noun**: `execute-plan`, `generate-plan`, `define-spec`, `refine-code`, `refine-plan`. Sub-skill technique docs and prompt fragments use noun-phrases / gerund-noun phrases (`defense-in-depth`, `root-cause-tracing`, `tdd-block`, `review-fix-block`). Prompt templates use `<verb-noun>-prompt.md` / `<skill-name>-prompt.md` / `<agent-name>-prompt.md`.

The new files in this spec follow the convention. The test-runner-dispatch doc (`test-runner-dispatch.md`) is a direct parallel to the existing `coordinator-dispatch.md` — same shape (noun + dispatch type word), same `_shared/` location, same internal-doc treatment. One pre-existing outlier — `agent/skills/define-spec/procedure.md` (bare `procedure`, no topic prefix) — is also renamed to align.

## Requirements

### `test-runner-dispatch` (new shared internal protocol doc)

1. **Doc location and shape.** A new file MUST exist at `agent/skills/_shared/test-runner-dispatch.md` documenting the test-runner dispatch protocol. It is not a discoverable Skill (no frontmatter, not loaded by the `Skill` tool, referenced by path only). It is co-located with `coordinator-dispatch.md`, `model-tier-resolution.md`, `orchestrator-verification-boundary.md`, and `workflow-artifact-paths.md` under `_shared/` because its four-input contract is clean of execute-plan-specific shape and the same protocol is plausibly callable by other future skills. No `README.md` is required (matching the precedent set by the other `_shared/` internal protocol docs).

2. **Contract — inputs.** The doc MUST specify the four inputs callers supply:
   - `test_command` (string, required) — the bash command to run, passed verbatim to `test-runner`. No flag injection, no expansion, no splitting.
   - `working_dir` (absolute path, required) — directory to run the command from.
   - `artifact_path` (absolute path, required) — where `test-runner` writes its single artifact; caller owns the naming scheme.
   - `phase_label` (string, optional) — when supplied and non-empty, filled into the artifact's `PHASE:` header line and into the dispatched prompt's phase section. When omitted or empty string, the dispatched prompt drops the phase section and the artifact omits the `PHASE:` header line entirely. Empty string is treated identically to omitted; there is no ambiguity between empty and absent.

3. **Contract — behavior.** The doc MUST specify that callers following the protocol:
   - Ensure the parent directory of `artifact_path` exists via `mkdir -p` before dispatch.
   - Resolve `(model, cli)` for the dispatch using `crossProvider.cheap` via `agent/skills/_shared/scripts/resolve-model-dispatch.py` — hardcoded; the tier is not caller-configurable. Surface byte-equal canonical Template (1)–(4) on resolution failure per `agent/skills/_shared/model-tier-resolution.md` and stop the call site.
   - Fill `agent/skills/_shared/test-runner-prompt.md` from inputs, conditionally including the phase section based on `phase_label` presence/non-emptiness.
   - Dispatch the test-runner via `subagent_run_serial { tasks: [{ agent: "test-runner", task: <filled prompt>, model: <resolved>, cli: <resolved> }] }`.
   - Validate the artifact handoff marker and parse the artifact via `agent/skills/_shared/scripts/parse-test-runner-artifact.py`.

4. **Contract — output on success.** The doc MUST specify that callers receive structured data with at least: `exit_code` (int from the test command), `failing_identifiers` (list of stable suite-native identifiers parsed verbatim from the artifact), `non_reconcilable_failures` (list of evidence entries parsed verbatim from the artifact), and `artifact_path` (echoed input). A non-zero `exit_code` from the test command is NOT a protocol failure; it flows through to the caller as a successful protocol output for caller-side classification.

5. **Contract — output on failure.** The doc MUST enumerate structured failure reasons rather than free-form errors, covering at minimum:
   - `dispatch_unavailable` — `subagent_run_serial` is not exposed in this environment.
   - `dispatch_failed` — test-runner dispatch returned an error (model unavailable, transport error, etc.).
   - `handoff_missing` — no anchored `TEST_RESULT_ARTIFACT:` line in the dispatched final message.
   - `handoff_path_mismatch` — marker path ≠ `artifact_path`.
   - `artifact_missing` — file does not exist or is empty.
   - `artifact_malformed` — the `parse-test-runner-artifact.py` checks fail (header order, integer-parse, count reconciliation, raw-output marker, etc.).

6. **File migration into `_shared/`.** The following files MUST move from `agent/skills/execute-plan/` to `agent/skills/_shared/`, preserving content (with the conditional-phase-section update for the prompt template per Requirement 7 and the absent-`PHASE:`-tolerance update for the parser per Requirement 7):
   - `agent/skills/execute-plan/test-runner-prompt.md` → `agent/skills/_shared/test-runner-prompt.md`
   - `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py` → `agent/skills/_shared/scripts/parse-test-runner-artifact.py`
   - `agent/skills/execute-plan/scripts/tests/test_parse_test_runner_artifact.py` → `agent/skills/_shared/scripts/tests/test_parse_test_runner_artifact.py`
   - All test fixtures referenced by that test (`test-runner-artifact-clean.txt`, `test-runner-artifact-stable-failures.txt`, `test-runner-artifact-non-reconcilable.txt`, `test-runner-artifact-out-of-order.txt`, `test-runner-artifact-missing-marker.txt`, `test-runner-artifact-count-mismatch.txt`) → `agent/skills/_shared/scripts/tests/fixtures/`.

   The `agent/agents/test-runner.md` agent definition stays at its current path — agent definitions are global, not skill-owned.

7. **Conditional `PHASE:` header line.** The migrated `test-runner-prompt.md` MUST conditionally include the phase section based on whether `phase_label` is supplied and non-empty. The migrated `parse-test-runner-artifact.py` MUST tolerate the absence of the `PHASE:` header line — its absence is neither a malformed-artifact error nor a parse failure — while still rejecting an artifact with a present-but-malformed `PHASE:` line. The `agent/agents/test-runner.md` artifact-format documentation MUST be updated to make the `PHASE:` line optional. The optional-`phase_label` capability is preserved (rather than being trimmed because execute-plan always supplies a label today) so future callers reachable via the `_shared/` placement do not need to retrofit the parser.

8. **Test coverage for the optional-`phase_label` change.** New tests MUST cover:
   - Prompt assembly omits the phase section when `phase_label` is empty or omitted.
   - Prompt assembly includes the phase section when `phase_label` is supplied and non-empty.
   - The parser accepts an artifact missing the `PHASE:` header line and treats it as a successfully parsed artifact with phase unspecified.
   - The parser still rejects an artifact with a present-but-malformed `PHASE:` line.

### `acceptance-criteria-verification.md` (new internal protocol doc)

9. **Location and shape.** A new file MUST exist at `agent/skills/execute-plan/acceptance-criteria-verification.md` documenting the per-task acceptance-verification protocol. It is not a discoverable Skill (no frontmatter); it is read by `execute-plan` Step 11 and by any future caller that has explicit acceptance criteria with attached `Verify:` recipes.

10. **Per-task protocol contract.** The file MUST document, per task:
    - **Inputs:** task spec (verbatim), list of `(criterion, Verify recipe)` pairs, verifier-visible file set (deduplicated path list), diff context (text block), working directory.
    - **Behavior:** validate every criterion has an attached `Verify:` recipe (else surface the protocol-error stop currently documented in execute-plan Step 11 — a plan without complete `Verify:` recipes is a protocol error from `generate-plan` and must be regenerated); classify each recipe as command-style or inspection-style; fill `agent/skills/execute-plan/verify-task-prompt.md` via the existing `agent/skills/execute-plan/scripts/assemble-verifier-prompt.py` helper; resolve `(model, cli)` for `crossProvider.standard` via `agent/skills/_shared/scripts/resolve-model-dispatch.py`; dispatch one `verifier` subagent; parse the dispatched final message via `agent/skills/execute-plan/scripts/parse-verifier-report.py`.
    - **Output:** structured per-criterion verdicts (`[Criterion N] PASS|FAIL` plus the verifier's reason text), overall `VERDICT: PASS|FAIL`, OR a structured protocol-error reason that the caller treats as `VERDICT: FAIL`.
    - **Out of scope (caller's responsibility):** wave-level parallel/serial dispatch shape, retry loops, remediation menus, post-verification commits, the `{MODIFIED_FILES}` union rule (which is wave-shape-specific).

11. **Execute-plan reference and inline content removed.** `agent/skills/execute-plan/SKILL.md` Step 11 MUST reference `acceptance-criteria-verification.md` and MUST NOT restate its protocol inline. Step 11 retains only the wave-level orchestration: parallel dispatch shape (bounded by `MAX_PARALLEL_HARD_CAP`), routing of `VERDICT: FAIL` to Step 13's retry loop, and the `{MODIFIED_FILES}` union rule (because file-set assembly is wave-shape-specific, not per-task).

### `integration-regression-gate.md` (new internal protocol doc; replaces `integration-regression-model.md`)

12. **Location, shape, and merge.** A new file MUST exist at `agent/skills/execute-plan/integration-regression-gate.md` that subsumes the content of `agent/skills/execute-plan/integration-regression-model.md` (which MUST be deleted in the same change). The new file documents both the data model (frozen `baseline_failures`, per-run `current_failing_stable` / `current_non_reconcilable` / `current_non_baseline_stable`, identifier contract including the Go package-qualified-name exception) and the procedural layer (capture baseline via `test-runner-dispatch`, freeze, reconcile each later run, render the canonical three-section summary).

13. **Layer scope.** The file documents the data + summary layer: data model, per-run reconciliation algorithm, and the canonical three-section user-facing summary format. It MUST NOT prescribe menus, post-wave commit semantics, debug-vs-continue-vs-stop options, or retry-budget interactions — those stay in the caller (`execute-plan`).

14. **Gate procedure documented in-file.** The file MUST document the full lifecycle for callers:
    - **Capture mode:** caller invokes the gate with `(test_command, working_dir, artifact_path)`; the gate dispatches via `test-runner-dispatch` once, classifies the baseline (clean / stable-failures-only / contains-non-reconcilable-evidence), records `baseline_failures` from the artifact's stable bucket, and returns the baseline classification + the frozen `baseline_failures` set. The freeze contract — that `baseline_failures` is never mutated for the rest of the run — is documented in this file.
    - **Reconcile mode:** caller invokes the gate with `(test_command, working_dir, artifact_path, baseline_failures)`; the gate dispatches via `test-runner-dispatch`, computes the per-run inputs (`current_failing_stable`, `current_non_reconcilable`, `current_non_baseline_stable`), classifies pass/fail, and returns both the structured classification and the canonical formatted three-section summary string ready for the caller to display.
    - **Out of scope (caller's responsibility):** the caller's UX (menus, prompts, debug dispatch, commits, stop), retry-budget bookkeeping.

15. **Reference updates.** All existing references to `integration-regression-model.md` in the suite MUST update to `integration-regression-gate.md`. This affects at least `agent/skills/execute-plan/SKILL.md` (Steps 7, 12, 12 debugger-first flow, 14, 16). A repo-wide grep for `integration-regression-model` MUST return zero matches after this change.

### `integration-regression-debugging.md` (new internal protocol doc)

16. **Location and shape.** A new file MUST exist at `agent/skills/execute-plan/integration-regression-debugging.md` documenting the parameterized debugger-first flow currently inline in execute-plan Step 12. It is not a discoverable Skill.

17. **Parameterized flow contract.** The file MUST document:
    - **Inputs (caller-supplied):** `current_failures` (set union of `current_non_baseline_stable ∪ current_non_reconcilable` from the latest artifact); `change_range` (commit SHA for Step 12 callers; `BASE_SHA..HEAD_SHA` form for Step 16 callers); `suspect_universe` (set of candidate tasks with their `**Files:**` scope, derived per the caller's parameter row); `commit_template` (string for the remediation commit message, e.g., `fix(plan): wave <N> regression — <summary>` or `fix(plan): final-gate regression — <summary>`); `undo_policy` (`allowed` for Step 12 post-wave callers; `forbidden` for Step 16 final-gate callers); `re_test_callback` (the caller's success condition — typically a re-invocation of the gate).
    - **Flow:** identify suspects from failing identifiers + diff range; dispatch a single debugger-style `coder` pass following the `systematic-debugging` skill (Phase 1 root cause before any fix; may apply localized fix in same dispatch with TDD evidence; otherwise return diagnosis-only); on diagnosis, dispatch one targeted remediation `coder` scoped to implicated tasks/files; commit any fix using `commit_template`; re-test via `re_test_callback`.
    - **Output:** `success` (regression cleared per the callback) or `fail` (still failing — caller re-presents its menu, this attempt counts toward caller's retry budget). When `undo_policy = allowed` and remediation also failed, the output includes a "may undo wave commit" hint; the caller decides whether to act on it.
    - **Out of scope (caller's responsibility):** menu rendering, retry-budget bookkeeping, the actual undo execution (the file returns a hint, not an action), wave/gate state management.
    - **Both parameter rows in-file.** The file documents both the Step 12 (post-wave) and Step 16 (final-gate) parameter rows so callers identify their row by name rather than inheriting it from another file.

18. **Execute-plan reference and inline content removed.** `agent/skills/execute-plan/SKILL.md` MUST reference `integration-regression-debugging.md` from Step 12's "Debugger-first flow" position and from Step 16's final-gate `(d)` Debug-failures-now path. The inline parameter table and flow body MUST be deleted from Step 12; the same content lives in the new file. Step 16 stops referencing Step 12 indirectly and references the new file directly.

### `define-spec/procedure.md` rename (outlier cleanup)

19. **File rename.** `agent/skills/define-spec/procedure.md` MUST move to `agent/skills/define-spec/spec-design-procedure.md`. The content is preserved verbatim — this is a rename, not a content edit.

20. **Reference updates.** All references in the repo to the old path MUST update to the new path. This includes `agent/skills/define-spec/SKILL.md` and any other file that names the path. A repo-wide grep for `define-spec/procedure.md` MUST return zero matches after this change.

### Cross-cutting requirements

21. **Execute-plan SKILL.md size budget.** `wc -l agent/skills/execute-plan/SKILL.md` after these changes MUST be ≤ 600 (down from 775 baseline). The planner records both the pre-change line count (775) and the post-change count in the implementation plan or commit messages. Cosmetic reflows that reduce the count further are encouraged. Substantive content MUST NOT be cut to chase the number; if the four extractions plus required references cannot fit under 600 without content loss, the planner stops and reports rather than cutting content.

22. **Behavior preservation.** Every `execute-plan`-observable behavior MUST be preserved exactly, with one explicit exception: the artifact's `PHASE:` header line is conditional on `phase_label` presence (Requirement 7). Because `execute-plan` always supplies a phase label today (`baseline`, `wave-<N>-attempt-<K>`, or `final-gate-<seq>`), `execute-plan`-produced artifacts are unchanged byte-for-byte from the pre-change behavior; the conditional path matters only for future callers that omit the label. No procedural changes to wave dispatching, retry budgets, commit gates, integration-test reconciliation, provenance validation, model-tier resolution, or any other documented step beyond what the file extractions and reference updates require.

23. **No backwards-compatibility shims.** Old paths (`integration-regression-model.md`, `agent/skills/execute-plan/test-runner-prompt.md`, `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py`, `agent/skills/define-spec/procedure.md`) MUST be removed without aliases, redirects, or symlinks. Every reference in the repo updates to the new path. Repo-wide greps for each old path MUST return zero matches after this change.

24. **Tests preserved.** Existing tests under `agent/skills/_shared/scripts/tests/` (other than the newly-moved `test_parse_test_runner_artifact.py`), `agent/skills/define-spec/scripts/tests/`, `agent/skills/refine-code/scripts/tests/`, `agent/skills/refine-plan/scripts/tests/`, and the unmoved-portion of `agent/skills/execute-plan/scripts/tests/` MUST continue to pass without modification. Tests for the moved `parse-test-runner-artifact.py` move with it (now under `_shared/scripts/tests/`), and gain the new optional-`PHASE:` cases (Requirement 8).

## Constraints

- The four extractions enumerated above are the entire scope of this spec. Items 5 (`subagent-wave-gate`) and 6 (`execution-workspace-preflight`) from TODO-b733a4af are out of scope and recorded in Open Questions. Item 5 was deferred at the source-TODO author's recommendation ("more coupled, do after smaller seams are proven"); item 6 was deferred as "lower line savings and less central to the monolith problem."
- Promoting `test-runner-dispatch` to a discoverable top-level skill (the original `run-test-suite` framing) is also out of scope. Decision recorded in Approach / Considered and rejected; revisit when a non-`execute-plan` caller exists.
- Ad hoc mode for `acceptance-criteria-verification` (criterion inference from a one-line description, the `INSUFFICIENT_SPEC` outcome, no-Verify-recipe inputs) is out of scope. The TODO proposes it; this spec does not design it. The strict-mode-only extraction matches the existing execute-plan behavior; ad hoc mode is *new* functionality that warrants its own design pass.
- The dispatched subagents (`test-runner`, `verifier`, `coder`, `code-reviewer`, etc.) and their definitions under `agent/agents/` are unchanged. The agents stay where they are; only the orchestrator-side dispatch protocols move. The one exception is `agent/agents/test-runner.md`'s artifact-format documentation, which gains the optional-`PHASE:` clause (Requirement 7).
- Helper scripts under `agent/skills/_shared/scripts/` are unchanged in CLI / JSON-output shape. The only script that moves is `parse-test-runner-artifact.py` (`execute-plan/scripts/` → `_shared/scripts/`), with one behavior change: tolerating absent `PHASE:` lines.
- The orchestrator-verification-boundary principle applies to callers of these protocols. The principle is stated once in `agent/skills/_shared/orchestrator-verification-boundary.md` and is referenced by the orchestrator skills (`execute-plan`, `refine-code`, `refine-plan`). The four new internal protocol docs (`test-runner-dispatch.md`, `acceptance-criteria-verification.md`, `integration-regression-gate.md`, `integration-regression-debugging.md`) do NOT need their own boundary references — their callers already reference the boundary, and the docs themselves are protocol mechanics rather than orchestrator entry points.
- Internal protocol docs are placed by ownership: `test-runner-dispatch.md` lives in `agent/skills/_shared/` because its contract is clean of execute-plan-specific shape and the same protocol is plausibly callable by other future skills. The other three (`acceptance-criteria-verification.md`, `integration-regression-gate.md`, `integration-regression-debugging.md`) live in `agent/skills/execute-plan/` because their inputs are plan-specific (acceptance criteria + `Verify:` recipes are plan-shaped; the suspect-task universe for debugging is plan-shaped; commit templates and undo policy are wave-execution-shaped). If a future skill emerges with a distinct standalone use case for any of the three, that future skill's spec can re-locate the doc to `_shared/`.
- This spec changes file paths and contents. It does NOT change tool surfaces, model-tier resolution rules, provenance validation rules, the dangerous-command guardrail, or any existing helper script's CLI.
- No new helper scripts are introduced by this spec. The only new files are four internal protocol markdown documents (`test-runner-dispatch.md` under `_shared/`; `acceptance-criteria-verification.md`, `integration-regression-gate.md`, and `integration-regression-debugging.md` under `execute-plan/`) plus the renamed `spec-design-procedure.md` under `define-spec/`. Existing files that move: `test-runner-prompt.md`, `parse-test-runner-artifact.py`, and that script's tests + fixtures (all `execute-plan/` → `_shared/`).
- None of the four new internal protocol docs have frontmatter, are loaded by the `Skill` tool, or have a `README.md`. They are referenced by path only. This matches the pattern of `agent/skills/_shared/coordinator-dispatch.md`, `agent/skills/_shared/orchestrator-verification-boundary.md`, and `agent/skills/execute-plan/integration-regression-model.md` (the file being replaced).

## Approach

**Chosen approach.** One shared internal protocol doc (`test-runner-dispatch.md` under `agent/skills/_shared/`) plus three execute-plan-co-located internal protocol docs (`acceptance-criteria-verification.md`, `integration-regression-gate.md`, `integration-regression-debugging.md` under `agent/skills/execute-plan/`) plus one outlier rename (`define-spec/procedure.md` → `spec-design-procedure.md`). Execute-plan SKILL.md is rewritten to reference the new files instead of restating their content; line budget ≤ 600. The `integration-regression-model.md` file is subsumed by `integration-regression-gate.md` (one file, not two). No new top-level skills.

**Why this over alternatives.** Each candidate extraction was evaluated against a "useful in standalone context with a clean contract" bar: would a non-`execute-plan` caller realistically use this with the contract designed here? Only the test-runner dispatch path passes the bar today — its inputs are four well-typed values, its output is structured data, no execute-plan policy leaks into either side of the contract. That clean-contract status earns it a `_shared/` placement (alongside `coordinator-dispatch.md`, `model-tier-resolution.md`, etc.) so future callers can reach it by path; promotion to a discoverable top-level skill is deferred until a non-`execute-plan` caller actually exists, to avoid committing to a public surface area before a second caller's needs are known. The other three pieces have plausible-sounding standalone framings in the source TODO ("any workflow that wants subagent-isolated test runs," "any caller with acceptance criteria," "any integration regression after a change range") but on inspection their inputs are sufficiently shaped by execute-plan's surrounding context that even a `_shared/` placement would falsely suggest broad reusability: acceptance criteria + `Verify:` recipes are plan-shaped; the suspect-task universe for debugging is plan-shaped; commit templates and undo policy are wave-execution-shaped. Internal markdown under `execute-plan/` gives the same line-savings benefit and the same single-source-of-truth benefit, honestly scoped.

The rationalized naming framework — top-level skills use verb-noun, internal protocol docs use noun-phrase ending in a type word — is preserved by every name in this spec (`test-runner-dispatch`, `acceptance-criteria-verification`, `integration-regression-gate`, `integration-regression-debugging`, `spec-design-procedure`).

**Considered and rejected.**

- **Promote `test-runner-dispatch` to a top-level skill (the original `run-test-suite` framing).** Rejected for now in favor of internal markdown under `_shared/`. The contract is clean and the placement signals reusability, but committing to a discoverable skill surface before any non-`execute-plan` caller exists risks designing for hypothetical needs. Internal markdown under `_shared/` lets a future caller invoke the protocol by path today and converts cheaply to a top-level skill once a real second caller's contract requirements are visible. Recorded as a future-todo follow-up.
- **Items 5 (`subagent-wave-gate`) and 6 (`execution-workspace-preflight`) in scope.** TODO-b733a4af explicitly flags item 5 as "more coupled, do after the smaller extractions" and item 6 as "lower line savings and less central." Both warrant their own design pass once the smaller seams are proven; deferring keeps this spec focused on the highest-value, lowest-coupling cluster.
- **`acceptance-criteria-verification` + ad hoc mode in scope.** TODO-b733a4af proposes a two-mode `verify-implementation` skill where ad hoc mode infers criteria from a one-line description and may return `PASS` / `FAIL` / `INSUFFICIENT_SPEC`. Rejected from this spec because ad hoc mode is *new functionality* (criterion inference, the `INSUFFICIENT_SPEC` outcome, no-Verify-recipe handling), not an extraction. Bundling it would convert this from a refactor into a refactor + new-skill-design, doubling the surface area and the risk. Recorded as a future-todo follow-up.
- **`acceptance-criteria-verification`, `integration-regression-gate`, or `integration-regression-debugging` placed in `_shared/`.** Rejected because each carries plan-specific input shape (Verify recipes, suspect-task universe, commit templates / undo policy). Placing them in `_shared/` would falsely advertise plug-and-play reuse the contracts cannot honor today.
- **`integration-regression-gate` Layer 1 — pure data, no summary.** Rejected because every caller would have to re-derive the canonical three-section summary format, which is a drift risk; the format is canonical in the existing `integration-regression-model.md` and stays canonical in `integration-regression-gate.md`.
- **`integration-regression-gate` Layer 3 — full UX including menus.** Rejected because the menu shapes (intermediate-wave: debug/continue/stop; final-wave: debug/stop; final-gate: debug/stop) are execute-plan-specific. A different caller (a CI hook, a pre-merge gate, an ad hoc developer-invoked regression check) would want different menus. Layer 2 (data + summary, no menus) lets each caller compose its own UX from the gate's structured output.
- **`integration-regression-debugging` as a top-level skill or in `_shared/`.** Rejected because every realistic caller has to supply the suspect-task universe (only meaningful in plan-execution shape), a commit template (plan-specific phrasing), and an undo policy (only meaningful when there are wave commits to potentially undo). The "for any integration regression discovered after a change range" framing in the source TODO is aspirational; in practice the flow is execute-plan-shaped.
- **Keep the test-runner prompt and parser in `execute-plan/scripts/` and have `test-runner-dispatch.md` cross-reference them.** Rejected because the protocol doc owns the prompt template and the parser (the doc tells callers to fill the prompt and parse via the script); leaving them under `execute-plan/` while the doc lives under `_shared/` would split ownership across directories and misrepresent which skill the artifacts belong to.
- **Keep `integration-regression-model.md` and add a separate `integration-regression-gate.md`.** Rejected as over-engineering. The model and the procedure that uses it are inseparable in practice — you can't reconcile without the model; the model exists to feed reconciliation. One file, one source of truth.
- **`test-runner-dispatch` model tier caller-supplied rather than hardcoded `crossProvider.cheap`.** Rejected because the test-runner is mechanical (runs a command, applies a deterministic two-bucket extraction contract from `agent/agents/test-runner.md`); a "smarter" model adds no value, and exposing the tier as an input pollutes the contract. If a future caller has a real need, an optional `--tier` parameter can be added without breaking this contract.

## Acceptance Criteria

### `test-runner-dispatch`

- `agent/skills/_shared/test-runner-dispatch.md` exists, has no frontmatter (not a discoverable Skill), and documents the dispatch protocol per Requirements 1–5 (location/shape, inputs, behavior, success output, failure-reason enumeration).
- `agent/skills/_shared/test-runner-prompt.md` exists; the phase section is conditionally included based on whether `phase_label` is supplied.
- `agent/skills/_shared/scripts/parse-test-runner-artifact.py` exists; it tolerates an absent `PHASE:` header line in the artifact and still rejects malformed artifacts (including a present-but-malformed `PHASE:`); its CLI shape and JSON output shape are unchanged from the pre-move version for fields other than `PHASE:`.
- `agent/skills/_shared/scripts/tests/test_parse_test_runner_artifact.py` exists and the new tests covering Requirement 8's four cases pass.
- `agent/skills/_shared/scripts/tests/fixtures/` contains the migrated test-runner-artifact fixtures plus at least one new fixture demonstrating the absent-`PHASE:` case.
- The protocol doc specifies that callers resolve `(model, cli)` via `crossProvider.cheap` using `agent/skills/_shared/scripts/resolve-model-dispatch.py`; tier is hardcoded; canonical Templates (1)–(4) surface byte-equal on resolution failure.
- The protocol doc specifies that callers ensure the parent directory of `artifact_path` exists via `mkdir -p` before dispatch.
- The protocol doc enumerates at minimum the six structured failure reasons from Requirement 5.
- The protocol doc has no `name:` frontmatter, no `README.md`, and is referenced from callers by path only — matching the precedent set by `coordinator-dispatch.md`.
- `agent/skills/execute-plan/test-runner-prompt.md` no longer exists.
- `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py`, `agent/skills/execute-plan/scripts/tests/test_parse_test_runner_artifact.py`, and the test-runner-artifact fixtures under `agent/skills/execute-plan/scripts/tests/fixtures/` no longer exist (moved to `_shared/scripts/`).
- `agent/skills/execute-plan/SKILL.md` references `agent/skills/_shared/test-runner-dispatch.md` everywhere it previously documented the test-runner dispatch path inline (Step 7 baseline capture and the four downstream call sites).

### `acceptance-criteria-verification.md`

- `agent/skills/execute-plan/acceptance-criteria-verification.md` exists, has no frontmatter (not a discoverable Skill), and documents the per-task verification protocol per Requirement 10 (inputs, behavior, output, out-of-scope).
- `agent/skills/execute-plan/SKILL.md` Step 11 references `acceptance-criteria-verification.md` and does not restate the per-task protocol inline.
- The wave-level orchestration (parallel dispatch up to `MAX_PARALLEL_HARD_CAP`, `VERDICT: FAIL` → Step 13 retry loop, `{MODIFIED_FILES}` union rule) remains in `agent/skills/execute-plan/SKILL.md` Step 11.
- The protocol-error stop for missing `Verify:` recipes is preserved (either inline in Step 11 or documented in the new file with a Step 11 reference).

### `integration-regression-gate.md`

- `agent/skills/execute-plan/integration-regression-gate.md` exists and contains both the data model and the gate procedure per Requirements 12–14.
- `agent/skills/execute-plan/integration-regression-model.md` no longer exists.
- A repo-wide grep for `integration-regression-model` returns zero matches.
- All references in the repo (at minimum `agent/skills/execute-plan/SKILL.md` Steps 7, 12, 12 debugger-first flow, 14, 16) point at `integration-regression-gate.md`.
- The file documents capture mode and reconcile mode contracts (both invoking `test-runner-dispatch`) and explicitly states that menus / debug dispatch / commits / stop UX are caller-owned.
- The canonical three-section user-facing summary format is preserved verbatim from the predecessor file.
- The Go package-qualified-name identifier exception is preserved verbatim.

### `integration-regression-debugging.md`

- `agent/skills/execute-plan/integration-regression-debugging.md` exists and contains the parameterized debugger-first flow per Requirement 17.
- `agent/skills/execute-plan/SKILL.md` Step 12 references `integration-regression-debugging.md` and does not restate the parameter table or flow body inline.
- `agent/skills/execute-plan/SKILL.md` Step 16's final-gate `(d)` path references `integration-regression-debugging.md` directly rather than indirecting through Step 12.
- The file documents both the Step 12 (post-wave) and Step 16 (final-gate) parameter rows.
- The "may undo wave commit" hint behavior is preserved when `undo_policy = allowed` and remediation has also failed.

### `define-spec/procedure.md` rename

- `agent/skills/define-spec/spec-design-procedure.md` exists with the same content as the predecessor file.
- `agent/skills/define-spec/procedure.md` no longer exists.
- A repo-wide grep for `define-spec/procedure.md` returns zero matches.
- `agent/skills/define-spec/SKILL.md` (and any other reference) names the new path.

### Cross-cutting

- `wc -l agent/skills/execute-plan/SKILL.md` ≤ 600.
- The planner records the pre-change line count (775) and post-change count in the implementation plan or commit messages.
- All previously-passing tests continue to pass without modification, except those that move with `parse-test-runner-artifact.py` (which gain new cases per Requirement 8).
- `execute-plan` runs with integration tests enabled produce byte-for-byte identical artifacts (including the `PHASE:` line) compared to pre-change behavior, since `execute-plan` always supplies a non-empty phase label.
- No file in `agent/skills/_shared/`, `agent/skills/execute-plan/`, or `agent/skills/define-spec/` retains a backward-compatibility alias or symlink to a pre-rename path.

## Non-Goals

- This spec does NOT promote `test-runner-dispatch` to a discoverable top-level skill. The original TODO framing (`run-test-suite` as a top-level skill) is deferred until a non-`execute-plan` caller exists. Recorded as a future-todo follow-up.
- This spec does NOT design or implement an ad hoc mode for acceptance-criteria verification (no-explicit-criteria input shape, criterion inference, the `INSUFFICIENT_SPEC` outcome). Recorded as a future-todo follow-up.
- This spec does NOT extract `subagent-wave-gate` (worker status code routing, BLOCKED / DONE_WITH_CONCERNS handling, the canonical four-intervention menu, retry-budget bookkeeping). Recorded as a future-todo follow-up.
- This spec does NOT extract `execution-workspace-preflight` (worktree detection, dirty-workspace prompt, `using-git-worktrees` invocation). Recorded as a future-todo follow-up.
- This spec does NOT modify the dispatched agent definitions under `agent/agents/` (`test-runner.md`, `verifier.md`, `coder.md`, `code-reviewer.md`, etc.) beyond the optional-`PHASE:` clause in `agent/agents/test-runner.md`'s artifact-format documentation. Agents are global; orchestrator-side protocols move.
- This spec does NOT introduce new helper scripts under `agent/skills/_shared/scripts/` or anywhere else. The only script that changes location is `parse-test-runner-artifact.py` (move + behavior tweak for optional `PHASE:`).
- This spec does NOT change the dangerous-command guardrail, the model-tier resolution rules, the orchestrator-verification-boundary principle, the coordinator-dispatch chain, or any existing helper script's CLI / JSON output shape.
- This spec does NOT introduce automated linting or runtime checks that detect undocumented inline content, line-budget creep, or stale references. Discipline is held by SKILL.md content and acceptance-criteria checks, not runtime enforcement.
- This spec does NOT promote any of the four new internal protocol docs (`test-runner-dispatch.md`, `acceptance-criteria-verification.md`, `integration-regression-gate.md`, `integration-regression-debugging.md`) to top-level skills, nor design their cross-skill reuse story. Future promotion is a future-spec decision.
- This spec does NOT modify `agent/skills/refine-code/SKILL.md` or `agent/skills/refine-plan/SKILL.md` beyond any incidental reference updates required by file renames or moves (e.g., if either references `integration-regression-model.md`, `define-spec/procedure.md`, or any moved file — the planner greps to confirm).
- This spec does NOT change the public command shape, prompt template placeholders (other than the conditional phase section), or `(model, cli)` resolution outputs of any existing skill beyond what these extractions explicitly require.
- This spec does NOT alter the `MAX_PARALLEL_HARD_CAP` semantics, retry budget rules, sub-task split bypass rule, or any other wave-coordination policy in `execute-plan` Step 9 / Step 10 / Step 13 — those are item-5 territory.

## Open Questions

- **Promotion of `test-runner-dispatch` to a top-level skill.** Kept as internal markdown under `_shared/` for now (the original `run-test-suite` framing is deferred). Once a non-`execute-plan` caller actually emerges, a follow-up spec can promote it: introduce `agent/skills/run-test-suite/SKILL.md` with `name: run-test-suite` frontmatter, a README, and a skill-specific orchestrator-verification-boundary forbidden-behavior list, while preserving the contract documented in `test-runner-dispatch.md`. The promotion is cheap precisely because the contract is already clean and the artifacts already live in `_shared/`.
- **Items 5 (`subagent-wave-gate`) and 6 (`execution-workspace-preflight`) extraction.** Deferred from this spec per the source TODO's own ordering (item 5 "more coupled, do after smaller seams are proven"; item 6 "optional, lower line savings"). A follow-up todo should revisit once this spec's wave 1 lands and the contracts have settled. The wave-gate extraction is the higher-value of the two given its line count (`subagent-wave-gate` interacts with worker status codes, BLOCKED/DONE_WITH_CONCERNS handling, canonical interventions, the shared retry budget) and shared dispatch surface; the workspace-preflight extraction is closer to optional cleanup.
- **Ad hoc mode for acceptance-criteria verification.** TODO-b733a4af proposes a two-mode `verify-implementation` skill where ad hoc mode infers criteria from a one-line description and may return `PASS` / `FAIL` / `INSUFFICIENT_SPEC`. This spec scopes to strict mode only, as internal markdown. A follow-up todo can design ad hoc mode as a top-level skill that wraps `acceptance-criteria-verification.md` with an inferred-criteria layer; that would also be the natural moment to reconsider promoting `acceptance-criteria-verification` itself to a discoverable top-level skill.
- **Future relocation of `acceptance-criteria-verification`, `integration-regression-gate`, or `integration-regression-debugging` to `_shared/`.** All three live under `execute-plan/` because their inputs are plan-specific today. If a future skill emerges with a distinct standalone use case, the relevant doc could be re-located to `agent/skills/_shared/` as part of that future skill's own spec. No relocation is decided here.
- **Reference grep coverage.** The acceptance criteria require zero matches for `integration-regression-model`, `define-spec/procedure.md`, and the moved test-runner files in repo-wide greps. The planner should also grep for less-direct references (e.g., comments in helper scripts, README mentions, fixture file paths) and update or remove them as part of the same change. The planner may surface any remaining stale references it finds during execution.
