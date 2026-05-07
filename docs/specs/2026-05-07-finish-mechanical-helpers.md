# Finish remaining static helper scripts for mechanical orchestration

Source: TODO-5007be5b

## Goal

Finish the second slice of deterministic, tested helper scripts for repeatable mechanical orchestration so future `execute-plan`, `generate-plan`, `refine-plan`, `refine-code`, and `define-spec` sessions stop generating ad hoc Python/bash snippets for routing, parsing, prompt assembly, mux probing, provenance extraction, and workflow-drift classification. Adopt each new helper at every matching call site without parallel prose, and shrink the modified consumer files so the helpers' `--help` output, tests, and READMEs own the detailed mechanical contract.

## Context

The first slice (TODO-c6a7a5d0 / spec `docs/specs/2026-05-07-execute-plan-mechanical-helpers.md`) extracted shared helpers (`resolve-model-dispatch`, `parse-artifact-handoff`, `validate-review-provenance`, `fill-template`) and execute-plan helpers (`extract-plan-tasks`, `collect-diff-context`, `assemble-verifier-prompt`, `parse-verifier-report`). Those eight helpers are checked-in CLIs under `agent/skills/_shared/scripts/` and `agent/skills/execute-plan/scripts/`, each with focused tests under `scripts/tests/` and a single `npm run test:helpers` runner registered in `agent/package.json`.

The remaining helper candidates from TODO-c6a7a5d0 were intentionally deferred to this todo. This spec finishes them off, plus picks up one additional helper noticed during a recent `define-spec` invocation: `agent/skills/define-spec/SKILL.md` Step 1's mux probe currently runs as a generated Python snippet on every dispatch. That probe meets the same "deterministic, mechanical, repeatedly hand-written" criterion as the original slice and is folded into this spec.

The substantive verification boundary from the predecessor spec stands unchanged: helpers may parse protocol output, assemble inputs, classify workflow-only drift, validate protocol shape, and emit verbatim user-facing message bodies for outcomes the helper itself classified, but they must not run planner-authored `Verify:` recipes, run integration test commands, write `test-runner` artifacts, judge implementation acceptance criteria, or judge production readiness.

## Requirements

### Helpers to implement

Implement nine new helpers in this slice. Helper names below are working titles; the planner may rename for fit so long as adoption sites and `--help` references stay consistent.

1. **`parse-test-runner-artifact`** — execute-plan helper at `agent/skills/execute-plan/scripts/parse-test-runner-artifact.py`. Parses an existing `test-runner` artifact's structured header per `agent/agents/test-runner.md` `## Artifact Format`. Validates that the required headers (`PHASE`, `COMMAND`, `WORKING_DIRECTORY`, `EXIT_CODE`, `TIMESTAMP`, `FAILING_IDENTIFIERS_COUNT`, `FAILING_IDENTIFIERS:`, `END_FAILING_IDENTIFIERS`, `NON_RECONCILABLE_COUNT`, `NON_RECONCILABLE_FAILURES:`, `END_NON_RECONCILABLE_FAILURES`) appear in exact order. Returns a single JSON blob: `EXIT_CODE` as int, `FAILING_IDENTIFIERS` as a deduplicated list with stable ordering, `NON_RECONCILABLE_FAILURES` as a list of evidence-entry strings (multi-line preserved verbatim per the artifact format), and the other header fields as strings. Stops parsing at `--- RAW RUN OUTPUT BELOW ---` — does not return raw output. May reuse `_shared/parse-artifact-handoff.py` for marker/path/existence validation when the caller has both a `finalMessage` and an artifact path; artifact-format validation stays in this helper.

2. **`assemble-coder-prompt`** — execute-plan helper at `agent/skills/execute-plan/scripts/assemble-coder-prompt.py`. Fills `agent/skills/execute-plan/execute-task-prompt.md` from structured inputs: verbatim task spec, pre-shaped wave/prior-output/dependency context, working directory, and a TDD-block toggle (include the `tdd-block.md` body when enabled, omit otherwise). Uses the same single-pass literal-substitution placeholder semantics as `_shared/fill-template.py` (no recursive expansion of values containing `{OTHER}`). Mirrors `assemble-verifier-prompt.py`'s pattern of doing its own substitution rather than shelling out to `fill-template.py` so the input contract is enforced at this helper's boundary.

3. **`fill-refine-code-prompt`** — refine-code helper at `agent/skills/refine-code/scripts/fill-refine-code-prompt.py` (new directory). Fills `agent/skills/refine-code/refine-code-prompt.md` from explicit inputs: plan goal, plan contents, base/head SHAs, working directory, review output base path, max iterations, and model matrix. Same literal-placeholder semantics as helper #2. Fails closed on missing required inputs or any unreplaced placeholder.

4. **`fill-refine-plan-prompt`** — refine-plan helper at `agent/skills/refine-plan/scripts/fill-refine-plan-prompt.py` (new directory). Fills `agent/skills/refine-plan/refine-plan-prompt.md` from explicit inputs: plan path, task artifact / source todo / source spec / scout brief fields, structural-only note, original spec inline, review output base path, working directory, max iterations, starting era, and model matrix. Same semantics as helper #3.

5. **`extract-provenance-preamble`** — shared helper at `agent/skills/_shared/scripts/extract-provenance-preamble.py`. Reads only a bounded preamble region from a markdown file and extracts exactly three supported line shapes: `Source: TODO-<8-char-hex>`, `Scout brief: docs/briefs/<filename>`, and `Git SHA: <40-char-lowercase-hex>`. Two bound modes selectable via flag: `spec` (read until first `## ` heading or first ~40 lines, whichever comes first) and `brief` (read first ~8 lines). Lines that don't match an exact supported shape are silently ignored. Matching lines that appear later in the document (outside the preamble, including inside fenced code blocks or examples) are ignored. Returns structured fields plus protocol-shape errors when applicable (e.g., a `Git SHA:` line whose value is not 40 lowercase hex characters).

6. **`classify-workflow-drift`** — shared helper at `agent/skills/_shared/scripts/classify-workflow-drift.py`. Owns the full git pipeline for the brief-staleness classifier in `agent/skills/generate-plan/SKILL.md` Step 1b: reads the brief preamble for `Git SHA:` (delegating to `extract-provenance-preamble` in `brief` mode), runs `git rev-parse HEAD`, runs `git merge-base --is-ancestor <brief-sha> HEAD`, and on success runs `git diff --name-only -z <brief-sha>..HEAD`. Classifies enumerated paths against the allowlist defined in `agent/skills/_shared/workflow-artifact-paths.md` using the documented prefix-as-directory-boundary semantics. Returns a JSON blob with one of six `outcome` tags (`silent_continue`, `workflow_only`, `mixed_changes`, `uninspectable_a`, `uninspectable_b`, `uninspectable_c`), structured fields (`brief_sha`, `head_sha`, `non_workflow_paths`, `error`), and the **verbatim message body** for whichever non-silent outcome fired (informational message for `workflow_only`; menu body matching the four variants currently inlined in Step 1b for `mixed_changes`, `uninspectable_a`, `uninspectable_b`, and `uninspectable_c`). The skill prints the returned message and routes on the `outcome` tag; the interactive `(c)`/`(x)` response handling stays in the skill.

7. **`parse-refine-plan-summary`** — refine-plan helper at `agent/skills/refine-plan/scripts/parse-refine-plan-summary.py`. Parses the compact `refine-plan` summary documented in `agent/skills/refine-plan/SKILL.md` Step 11 (the public outer summary consumed by `generate-plan/SKILL.md` Step 5 and other callers): `STATUS:`, `COMMIT:`, `PLAN_PATH:`, the `REVIEW_PATHS:` block, `STRUCTURAL_ONLY:`, and the optional `FAILURE_REASON:` line. Validates required-field presence per status (e.g., `FAILURE_REASON:` only appears with `STATUS: failed`). Returns structured JSON; protocol errors fail closed.

8. **`parse-refine-code-summary`** — refine-code helper at `agent/skills/refine-code/scripts/parse-refine-code-summary.py`. Parses the compact `refine-code` summary documented in `agent/skills/refine-code/refine-code-prompt.md` Output Format: `STATUS:`, the `## Summary` block (`Iterations:`, `Issues found/fixed/remaining`), the optional `## Remaining Issues` block, `## Review File`, and the optional `## Failure Reason` block. Validates required-field presence per status. Returns structured JSON; protocol errors fail closed.

9. **`detect-mux-backend`** — placement deferred to Open Questions; primary candidate is `agent/skills/define-spec/scripts/detect-mux-backend.py`. Owns `agent/skills/define-spec/SKILL.md` Step 1's mechanical work in full: Step 1a env-var + `command -v` probe (rules 1–8 byte-equal with the runtime's `pi-extension/subagents/cmux.ts` + `backends/select.ts` precedence, including rule 3's no-fallback-on-pinned-`PI_SUBAGENT_MUX` behavior), Step 1b user-input override scan (when `--user-input <text>` is supplied; matches the documented substring set), and Step 1c verbatim status-message construction. Returns a JSON blob: `branch` (`mux`|`inline`), `backend` (one of `cmux`/`tmux`/`zellij`/`wezterm` when mux, else `null`), `reason` (short tag identifying which rule fired), and `status_message` (the verbatim status line for the chosen branch). Probe-only — does not spawn or attempt to dispatch into any mux backend.

### CLI and I/O conventions

- Each helper has a deterministic CLI with `--help` documenting inputs, outputs, and failure shapes.
- Each helper emits structured JSON to stdout on success and structured JSON to stderr on protocol failures with a `failure` field, matching the existing helpers' contract.
- Exit codes follow the existing convention: `0` on success, `1` on protocol/parse errors, `2` on usage / unexpected I/O errors.
- Each helper has behavior-focused tests under the relevant `scripts/tests/` directory covering success paths, malformed inputs, and boundary cases.

### Test integration

- New script test directories (e.g., `agent/skills/refine-code/scripts/tests/`, `agent/skills/refine-plan/scripts/tests/`, and a directory for the mux helper resolved per Open Questions) are wired into `agent/package.json`'s `test:helpers` script via an extension of the existing `python3 -m unittest discover` chain. The `test:helpers` script remains a single command that runs every helper test directory in sequence.
- Each new script directory carries a `README.md` following the existing `agent/skills/_shared/scripts/README.md` pattern: per-helper one-line description, example invocation, and the shared "Running tests" footer.

### Adoption sites

Each helper is adopted at every existing call site where its mechanical work currently lives:

- `parse-test-runner-artifact` is invoked at every `test-runner` artifact handoff in `agent/skills/execute-plan/SKILL.md`: baseline, post-wave, debugger re-test, and final-gate paths. Surfaces the helper's failure label verbatim where the skill currently surfaces script failure messages.
- `assemble-coder-prompt` is invoked at every coder dispatch in `agent/skills/execute-plan/SKILL.md` that fills `execute-task-prompt.md`.
- `fill-refine-code-prompt` is invoked at `agent/skills/refine-code/SKILL.md`'s coordinator-prompt fill step. (Indirect callers like `execute-plan` invoke the `refine-code` skill rather than filling the prompt themselves and are not direct adoption sites.)
- `fill-refine-plan-prompt` is invoked at `agent/skills/refine-plan/SKILL.md` Step 7's coordinator-prompt fill step. (Indirect callers like `generate-plan` invoke the `refine-plan` skill rather than filling the prompt themselves and are not direct adoption sites.)
- `extract-provenance-preamble` is invoked at `agent/skills/generate-plan/SKILL.md` Step 1b's spec/file preamble extraction (`Source:` and `Scout brief:` lines) and at the brief preamble read for `Git SHA:` (used internally by `classify-workflow-drift`). Adopt at any other site that currently parses the same line shapes by hand under the same bounded-preamble rule.
- `classify-workflow-drift` is invoked at `agent/skills/generate-plan/SKILL.md` Step 1b's staleness classifier; the skill's prose for the SHA classification, file enumeration, and four message variants collapses to "run helper; render returned message body; route on returned `outcome` tag."
- `parse-refine-plan-summary` is invoked at `agent/skills/generate-plan/SKILL.md` Step 5 and at any other site that consumes the `refine-plan` outer summary.
- `parse-refine-code-summary` is invoked at `agent/skills/execute-plan/SKILL.md`'s final-review handoff and at any other site that consumes the `refine-code` outer summary.
- `detect-mux-backend` is invoked at `agent/skills/define-spec/SKILL.md` Step 1 — the entire current 1a/1b/1c prose collapses to "run helper; print returned `status_message`; route on returned `branch`/`backend`."

### Verification-boundary preservation

Helpers may emit:

- Extracted metadata (e.g., provenance fields, parsed test-runner header, coordinator-summary fields).
- Filled prompt text or files.
- Structured parse results from protocol-shaped inputs.
- Protocol-shape errors with mechanical labels.
- Workflow-drift classifications based on the explicit allowlist in `agent/skills/_shared/workflow-artifact-paths.md` and git metadata.
- Verbatim user-facing message or menu bodies when the message is data the helper already computed (e.g., `classify-workflow-drift` outcomes, `detect-mux-backend` status string).

Helpers must NOT emit:

- Implementation acceptance PASS/FAIL judgments derived from local inspection.
- `Criterion N passed because grep found X`-style judgments.
- Synthesized `test-runner` artifacts.
- Locally-run planner-authored `Verify:` recipe results or test-command results.
- Production-readiness judgments that bypass `refine-code` / reviewer artifacts.

## Constraints

- Helpers are plain Python 3 stdlib CLIs unless a dependency is already clearly available and justified by the existing helper set. The predecessor spec's stdlib-first constraint applies byte-equal.
- Adoption is mandatory at every matching call site listed under Adoption sites. Parallel prose alongside helper invocations is forbidden — modified consumers must invoke (or explicitly direct the orchestrator/coordinator to invoke) the helper, never restate the helper's mechanical logic in prose.
- No modified existing skill or coordinator prompt file may grow in size after adoption. Specifically, after this slice lands, `agent/skills/define-spec/SKILL.md`, `agent/skills/execute-plan/SKILL.md`, `agent/skills/generate-plan/SKILL.md`, `agent/skills/refine-plan/SKILL.md`, and `agent/skills/refine-code/SKILL.md` must be no larger on net than they were before. Net additions are allowed only for new helper scripts, helper tests, fixtures, helper READMEs, and `agent/package.json` test wiring; the helper's `--help`, tests, and README own the detailed mechanical contract.
- Helpers must not increase the orchestrator's tool surface beyond what existing helpers already require. The predecessor spec's narrow `bash` addition for `plan-refiner` stands; no further coordinator tool-surface changes are permitted unless an adopted helper genuinely cannot be invoked otherwise.
- `parse-test-runner-artifact` does NOT reconcile failures against `baseline_failures`. Reconciliation stays in `agent/skills/execute-plan/SKILL.md`'s integration-regression-model code path. The helper returns parsed sets; the skill performs set arithmetic.
- `parse-test-runner-artifact` does NOT return raw run output below `--- RAW RUN OUTPUT BELOW ---`. Callers that need raw output (e.g., debugger evidence) read the artifact directly via the `Read` tool, not via this helper.
- `classify-workflow-drift` owns the full git pipeline (`rev-parse HEAD`, `merge-base --is-ancestor`, `diff --name-only -z`) and the verbatim message bodies, but NOT the interactive `(c)`/`(x)` response handling. Menu response routing stays in `agent/skills/generate-plan/SKILL.md` Step 1b.
- `detect-mux-backend` consults env vars (`PI_SUBAGENT_MODE`, `PI_SUBAGENT_MUX`, `CMUX_SOCKET_PATH`, `TMUX`, `ZELLIJ`, `ZELLIJ_SESSION_NAME`, `WEZTERM_UNIX_SOCKET`) directly and runs `command -v <backend-cli>` checks. It is probe-only — it MUST NOT spawn or attempt to dispatch into any mux backend, and MUST NOT emit text to stdout/stderr beyond the documented JSON contract.
- `extract-provenance-preamble` recognizes exactly the three line shapes (`Source: TODO-<8-char-hex>`, `Scout brief: docs/briefs/<filename>`, `Git SHA: <40-char-lowercase-hex>`) and exactly the two bound modes (`spec`, `brief`) listed under Helpers to implement. Adding more shapes or modes is out of scope; future consumers requesting new shapes are deferred to a follow-up todo.
- Helpers fail closed on malformed protocol inputs and must not reinterpret malformed output as success.
- Helpers must not run planner-authored `Verify:` recipes, run integration test commands, write `test-runner` artifacts, or independently judge implementation acceptance criteria.
- Do not extend or rewrite skills, coordinator prompts, agent definitions, or tool surfaces beyond what helper adoption requires.

## Acceptance Criteria

- The nine helper scripts exist at the locations listed under Helpers to implement (with `detect-mux-backend`'s home resolved per Open Questions), are executable or invokable with `python3`, and expose `--help` output describing inputs, outputs, and failure shape.
- Focused tests exist under each helper's `scripts/tests/` directory covering success paths, malformed inputs, and boundary cases. `agent/package.json`'s `test:helpers` script discovers and runs every new test directory in addition to the two existing ones, as a single command.
- Each new script directory carries a `README.md` documenting its helpers in the same per-helper-one-line + example-invocation pattern as the existing `agent/skills/_shared/scripts/README.md`. Existing READMEs at `agent/skills/_shared/scripts/README.md` and `agent/skills/execute-plan/scripts/README.md` are updated to list any new helpers added to those directories.
- Every adoption site listed under Adoption sites invokes (or explicitly directs the orchestrator/coordinator to invoke) the relevant helper. No call site retains parallel prose alongside the helper invocation.
- No modified existing skill or coordinator prompt file is larger after adoption than before. Specifically, `agent/skills/define-spec/SKILL.md`, `agent/skills/execute-plan/SKILL.md`, `agent/skills/generate-plan/SKILL.md`, `agent/skills/refine-plan/SKILL.md`, and `agent/skills/refine-code/SKILL.md` shrink (or stay byte-equal where helper invocation already lives) on net.
- `parse-test-runner-artifact` returns a single JSON blob with `EXIT_CODE` as int, `FAILING_IDENTIFIERS` deduplicated with stable ordering, `NON_RECONCILABLE_FAILURES` preserved verbatim per the artifact format, and protocol-shape errors fail closed. Header order is validated; missing/empty/malformed artifacts surface mechanical error labels.
- `assemble-coder-prompt`, `fill-refine-code-prompt`, and `fill-refine-plan-prompt` use the same single-pass literal-substitution placeholder semantics as `_shared/fill-template.py`. Each fails closed on missing required inputs or any unreplaced placeholder.
- `extract-provenance-preamble` recognizes only the three supported line shapes within the chosen bound mode, ignores later document content and fenced examples, and returns structured fields with protocol-shape errors when applicable.
- `classify-workflow-drift` returns one of `silent_continue`, `workflow_only`, `mixed_changes`, `uninspectable_a`, `uninspectable_b`, or `uninspectable_c` plus structured fields, and returns the verbatim message body for whichever non-silent outcome fired. The four menu variants currently in `agent/skills/generate-plan/SKILL.md` Step 1b match the helper's returned bodies byte-equal. The interactive `(c)`/`(x)` response handling stays in the skill.
- `parse-refine-plan-summary` and `parse-refine-code-summary` return structured JSON, validate required fields per `STATUS`, and fail closed on malformed summaries.
- `detect-mux-backend` returns `branch`, `backend`, `reason`, and the verbatim `status_message` for whichever branch fired. The eight precedence rules currently in `agent/skills/define-spec/SKILL.md` Step 1a (and the user-input override substrings in Step 1b) are encoded byte-equal in the helper. `agent/skills/define-spec/SKILL.md` Step 1's prose collapses to "run helper; print returned `status_message`; route on returned `branch`/`backend`."
- The substantive verification boundary is preserved: no new helper runs planner-authored `Verify:` recipes, runs integration test commands, writes `test-runner` artifacts, judges acceptance criteria, or judges production readiness.

## Non-Goals

- Building a general workflow framework, replacing `execute-plan`, `define-spec`, `generate-plan`, `refine-plan`, or `refine-code` wholesale, or extracting larger standalone skills.
- Reconciling test-runner failures against `baseline_failures` inside the helper. Reconciliation stays in `agent/skills/execute-plan/SKILL.md`'s integration-regression-model.
- Returning raw test-runner output below `--- RAW RUN OUTPUT BELOW ---` from `parse-test-runner-artifact`.
- Adding line shapes or bound modes to `extract-provenance-preamble` beyond the three shapes / two modes specified. Future consumers requesting new shapes are an Open Question handled by a follow-up todo.
- Owning interactive `(c)`/`(x)` menu response handling inside `classify-workflow-drift`. Returning the menu body text is in scope; routing the user's response is not.
- Spawning or dispatching into any mux backend from `detect-mux-backend`. Probe-only.
- Adding orchestrator or coordinator tool-surface changes beyond what is strictly required for helper invocation.
- Adopting helpers at sites that do not currently host equivalent mechanical logic. Adoption is for replacement, not for new mechanical work.
- Re-litigating the predecessor spec's paradigm choices (Python 3 stdlib + argparse, JSON I/O, skill-local vs `_shared/` placement, single `npm run test:helpers` integration).

## Open Questions

- `detect-mux-backend`'s home directory: `agent/skills/define-spec/scripts/` is the consistent single-consumer placement (mirroring "execute-plan-specific" → "define-spec-specific" from the predecessor spec's location convention), but the helper has no skill-specific knowledge — it's a pure env-and-PATH probe. If the planner judges the pure-infrastructure character decisive, `agent/skills/_shared/scripts/` is also acceptable. Either placement is consistent with the existing precedent so long as every adoption site references the chosen path consistently and the helper's `README.md` documents the choice.
- If a future consumer (e.g., a hypothetical `define-brief` or `define-doc` interactive skill) needs a fourth provenance line shape or fifth mux backend, this spec's three-shape / four-backend lock-in becomes the trigger for a follow-up todo. The spec does not pre-empt that work; it constrains the current slice.
