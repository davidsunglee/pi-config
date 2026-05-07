# Extract mechanical helper scripts for execute-plan orchestration

Source: TODO-c6a7a5d0

## Goal

Add tested, static helper scripts for repeatable mechanical orchestration work so `execute-plan` and related workflow skills stop generating ad hoc Python/bash snippets for parsing plans, resolving dispatch models, filling prompts, validating artifact handoffs, and assembling verifier context. The helpers should become the canonical path at adopted call sites, reduce the size of existing skill/procedure prose, and preserve the boundary that substantive implementation verification belongs to `verifier` and `test-runner` subagents rather than the main orchestrator.

## Context

The current workflow is mostly encoded as markdown procedures under `agent/skills/`. Shared contracts already exist in `agent/skills/_shared/` for model-tier resolution, coordinator dispatch, and workflow-artifact path classification, but they are prose contracts rather than callable helpers. `execute-plan/SKILL.md` is large and contains detailed mechanical instructions for plan parsing, model dispatch, verifier prompt assembly, diff collection, test-runner artifact handoff, and verifier report parsing. `refine-code` and `refine-plan` also duplicate review artifact handoff and provenance validation logic in both their top-level skills and coordinator prompts.

The codebase already has script precedents under skill-local `scripts/` directories (for example `xcode-build` shell scripts and `web-browser` JavaScript helpers). `code-refiner` already has `bash` available and can invoke helper scripts from its coordinator prompt. `plan-refiner` currently lacks `bash`, so adopting script helpers inside that coordinator requires a narrow tool-surface change. The `agent/package.json` test suite currently focuses on TypeScript extension tests; helper script tests need an explicit documented path and ideally an integrated check command.

Related todo `TODO-5a12e2ea` draws the verification boundary: the orchestrator may perform mechanical routing/parsing, but must not run spot checks or judge task acceptance locally. This spec complements that guardrail by making the allowed mechanical path easy and repeatable.

## Requirements

- Implement the first helper slice only:
  - shared helpers: `resolve-model-dispatch`, `parse-artifact-handoff`, `validate-review-provenance`, and `fill-template`;
  - execute-plan helpers: `extract-plan-tasks`, `collect-diff-context`, `assemble-verifier-prompt`, and `parse-verifier-report`.
- Implement helpers as plain Python 3 CLI scripts with deterministic JSON and/or plain-text I/O. Use checked-in scripts, not per-session heredocs in `/tmp`.
- Locate shared helpers under `agent/skills/_shared/scripts/` and execute-plan-specific helpers under `agent/skills/execute-plan/scripts/` unless the planner finds an existing repo convention that is more consistent.
- Each helper must have a concise `--help` contract and focused tests/fixtures covering success paths and malformed-input failures.
- Helper failures must fail closed with structured, caller-readable errors. Helpers must not reinterpret malformed protocol output as success.
- `resolve-model-dispatch` must implement the current canonical model/CLI resolution semantics, including top-level and `crossProvider.*` tiers, provider-prefix extraction, `dispatch[provider]` lookup, and the documented byte-equal failure message templates from `_shared/model-tier-resolution.md`.
- `parse-artifact-handoff` must centralize anchored marker extraction and path validation for markers such as `BRIEF_WRITTEN:`, `SPEC_WRITTEN:`, `REVIEW_ARTIFACT:`, and `TEST_RESULT_ARTIFACT:`. It must support expected-path equality and existence/non-empty checks. It must not replace `define-spec`'s transcript-backed recovery, which remains a skill-specific fallback.
- `validate-review-provenance` must validate the first non-empty `**Reviewer:** <provider>/<model> via <cli>` line, reject `inline` values, compare against allowed resolved reviewer tiers, and return precise failure labels suitable for existing `refine-plan` / `refine-code` error messages.
- `fill-template` must perform exact placeholder replacement from explicit inputs and fail when required placeholders are missing or unreplaced placeholders remain.
- `extract-plan-tasks` must mechanically parse structured plan markdown into task metadata: task number/title, `**Files:**`, acceptance criteria, attached `Verify:` recipes, model recommendation, and dependencies/wave inputs. It may report protocol-shape errors such as duplicate tasks or missing `Verify:` recipes, but it must not invent criteria or judge whether work satisfies them.
- `collect-diff-context` must mechanically assemble verifier-visible git diff context from a working directory and file set, including tracked diffs, untracked-file no-index diffs, observed file lists, and the existing truncation marker behavior. It must not inspect diff content to decide implementation quality.
- `assemble-verifier-prompt` must fill the existing verifier prompt from structured task data, acceptance criteria plus recipes, command-style Phase 1 recipes, verifier-visible file set, diff context, and working directory. It must not run verification recipes or return pass/fail judgments.
- `parse-verifier-report` must parse verifier protocol output: per-criterion `[Criterion N] PASS|FAIL` lines, duplicate/missing/out-of-range criteria, overall `VERDICT: PASS|FAIL`, and Phase 1 evidence-block protocol shape. Protocol errors may route as failures, but the helper must label them as protocol errors rather than local implementation judgments.
- Adopt helpers at existing call sites where they replace the same mechanical logic. This includes relevant top-level skills (`scout`, `define-spec`, `generate-plan`, `requesting-code-review`, `refine-plan`, `refine-code`, and `execute-plan`) and coordinator prompts (`refine-plan-prompt.md`, `refine-code-prompt.md`) where those prompts currently duplicate model resolution, template filling, artifact handoff, review provenance, or verifier parsing.
- For adopted call sites, remove redundant step-by-step prose. Existing skills and coordinator prompts should retain at most a one-line description such as "Invoke `<script>` for <purpose>; surface its structured error/canonical message on failure." The script name, `--help`, tests, and helper README own the detailed mechanical contract.
- Do not increase the size of any modified existing skill or coordinator prompt file. Net additions for new helper scripts, helper tests, fixtures, or helper README files are allowed.
- Narrowly update coordinator tool surfaces only where helper invocation requires it. In particular, `plan-refiner` may gain `bash` so it can call shared helper scripts; avoid broad tool additions unrelated to helper adoption.
- Preserve user-facing policy and menu behavior in skills. Helpers replace mechanical parsing/assembly, not interactive decisions, commit gates, or continuation offers.
- Preserve the substantive verification boundary: helpers may parse protocol output, assemble inputs, and validate protocol shape, but they must not run planner-authored `Verify:` recipes, run integration test commands, write `test-runner` artifacts, or independently declare acceptance criteria satisfied.

## Constraints

- Keep helpers small, deterministic, and stdlib-oriented unless a dependency is already clearly available and justified.
- Do not implement optional later helpers in this slice, including `parse-test-runner-artifact`, `assemble-coder-prompt`, `fill-refine-code-prompt`, `fill-refine-plan-prompt`, `parse-refine-plan-summary`, or `parse-refine-code-summary`, unless the planner determines one is strictly necessary to adopt the first slice without growing skills.
- Do not change the high-level execute-plan workflow, wave gates, retry semantics, integration regression model, final review policy, or branch-completion behavior except to route existing mechanical work through helpers.
- Do not move substantive command execution into helpers. `collect-diff-context` may call `git` for diff assembly. `resolve-model-dispatch` may read `model-tiers.json`. Parser and template helpers should not run tests, verifier recipes, or arbitrary plan-provided commands.
- Do not make helper adoption optional at updated call sites; parallel prose implementations would reintroduce drift.
- Avoid duplicating detailed helper contracts in markdown consumers. If a detail must be retained for user-facing clarity, keep it outside the helper's mechanical internals and keep the modified skill smaller than before.

## Acceptance Criteria

- The first-slice helper scripts exist in shared and execute-plan script locations, are executable or clearly invokable with `python3`, and expose `--help` output describing their inputs, outputs, and failure shape.
- Focused tests/fixtures exist for every helper, including malformed inputs and boundary cases. A single documented command runs all helper tests, and the repo's normal verification path either invokes that command or clearly names it next to the existing `npm` checks.
- Adopted call sites invoke or explicitly direct the orchestrator/coordinator to invoke the helper scripts instead of hand-rolling equivalent Python/bash snippets.
- Modified existing skill and coordinator prompt files do not grow in size; redundant mechanical prose is removed and replaced with one-line helper invocations where helpers apply.
- Model/CLI resolution call sites use `resolve-model-dispatch` and still surface the canonical `_shared/model-tier-resolution.md` failure messages byte-equal.
- Artifact handoff call sites use `parse-artifact-handoff` for anchored marker extraction, expected-path checks, and existence/non-empty checks where applicable, without removing skill-specific recovery behavior such as `define-spec` transcript-backed recovery.
- Review provenance validation in `refine-plan`, `refine-code`, and their coordinators uses `validate-review-provenance`; success/failure semantics and user-facing error labels remain compatible with the current contract.
- `execute-plan` uses `extract-plan-tasks`, `collect-diff-context`, `assemble-verifier-prompt`, and `parse-verifier-report` for the verifier setup/routing hotspot. The orchestrator still dispatches `verifier` for substantive judgment and does not run local acceptance spot checks.
- `plan-refiner` has only the minimum tool-surface change required to call helpers, and no unrelated tools are added.
- Existing behavior is preserved except for reduced ad hoc glue and reduced duplicated prose: same dispatch tiers, same marker/path validation outcomes, same verifier pass/fail routing, same commit gates, and same integration-test subagent boundary.

## Non-Goals

- Building a general workflow framework or replacing `execute-plan` wholesale.
- Extracting the larger standalone skills from TODO-b733a4af (`run-test-artifact`, `verify-implementation`, `integration-regression-gate`, `debug-integration-regression`, `subagent-wave-gate`, or workspace preflight).
- Parsing or validating full `test-runner` artifacts in this slice beyond generic marker/path handoff checks.
- Adding local orchestrator verification, local final-acceptance scripts, or helper-produced implementation PASS/FAIL judgments.
- Changing the planner, verifier, test-runner, code-reviewer, or scout agent responsibilities except for the narrow `plan-refiner` helper-invocation tool addition.
- Preserving long-form duplicated mechanical prose in consumers after a helper owns that contract.
