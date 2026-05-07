# Extract mechanical helper scripts for execute-plan orchestration — implementation plan

**Source:** `TODO-c6a7a5d0`
**Spec:** `docs/specs/2026-05-07-execute-plan-mechanical-helpers.md`

## Goal

Add eight tested, deterministic Python 3 helper scripts that own the mechanical work currently embedded in `execute-plan`, `refine-plan`, `refine-code`, `scout`, `define-spec`, `generate-plan`, and `requesting-code-review` markdown procedures: model/CLI dispatch resolution, anchored marker artifact handoff, review-provenance validation, exact template fill, plan-task extraction, verifier diff-context assembly, verifier prompt assembly, and verifier report parsing. Adopt the helpers at every existing call site that currently hand-rolls the same logic, slimming the affected skill and coordinator-prompt files (no file grows). Preserve the substantive verification boundary: helpers parse and assemble, but never run planner-authored `Verify:` recipes, run integration commands, write `test-runner` artifacts, or independently judge acceptance criteria.

## Architecture summary

- **Two new script directories.** Shared helpers live under `agent/skills/_shared/scripts/`; execute-plan-specific helpers live under `agent/skills/execute-plan/scripts/`. Each directory has its own `tests/` subdirectory with `unittest`-based tests and a `tests/fixtures/` subdirectory with input-shape fixtures (sample `model-tiers.json`, sample plans, sample reviewer outputs, sample verifier reports). A short `README.md` in each scripts directory lists every helper, its `--help` summary, and the test-run command. The script-directory pattern matches the existing precedent under `agent/skills/xcode-build/scripts/` (shell scripts) and `agent/skills/web-browser/scripts/` (JS scripts) — Python is the new language but the shape is identical.
- **Eight helpers, one CLI each.** All helpers are Python 3 stdlib-only programs invoked as `python3 <path> [args]`. Each emits structured JSON to stdout on success and emits a structured JSON error or canonical byte-equal failure message to stderr on failure, with non-zero exit codes for failures. Helpers fail closed: a malformed input never returns a success-shaped result.
- **`resolve-model-dispatch`** owns the canonical algorithm in `_shared/model-tier-resolution.md`: tier-path lookup (top-level + `crossProvider.*`), provider-prefix extraction, `dispatch[<provider>]` lookup, and byte-equal Templates (1)–(4) on the four documented failure conditions.
- **`parse-artifact-handoff`** owns anchored-marker extraction (`BRIEF_WRITTEN:`, `SPEC_WRITTEN:`, `REVIEW_ARTIFACT:`, `TEST_RESULT_ARTIFACT:`), expected-path equality, and existence + non-empty checks. It does NOT own header-format checks (e.g. test-runner artifact header) or skill-specific recovery (e.g. `define-spec`'s transcript-backed recovery) — those stay in skill prose.
- **`validate-review-provenance`** owns the regex on `**Reviewer:** <provider>/<model> via <cli>`, the `inline`-substring rejection, and the comparison against allowed reviewer tiers resolved via `resolve-model-dispatch` primitives. It returns precise failure labels matching today's `refine-plan` Step 9.5 / `refine-code` Step 6 strings.
- **`fill-template`** owns exact placeholder replacement from explicit inputs and the strict-fill check (no unreplaced `{PLACEHOLDER}` tokens remain when `--require-all-replaced` is set, plus required-key enforcement).
- **`extract-plan-tasks`** owns mechanical plan-markdown parsing into structured task data: number, title, `**Files:**` (Create/Modify/Test), checkbox steps, acceptance criteria with attached `Verify:` recipes, model recommendation, dependencies, and the optional `## Test Command` block. It reports protocol-shape errors (duplicate task numbers, missing `Verify:` lines, etc.) and fails closed on them.
- **`collect-diff-context`** owns the verifier diff-context assembly: `git diff HEAD -- <files>` for tracked, `git diff --no-index /dev/null -- <file>` for untracked (identified via `git status --porcelain`), concatenation, and the 500-line / 40 KB truncation marker. It does not interpret diff content.
- **`assemble-verifier-prompt`** fills the `verify-task-prompt.md` template with `{TASK_SPEC}`, `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`, `{PHASE_1_RECIPES}`, `{MODIFIED_FILES}`, `{DIFF_CONTEXT}`, and `{WORKING_DIR}` from explicit inputs. It does not run recipes or judge anything.
- **`parse-verifier-report`** owns parsing of `## Phase 1 Evidence` blocks (four-field shape), `## Per-Criterion Verdicts` headers (`[Criterion N] PASS|FAIL`), the `VERDICT: PASS|FAIL` overall line, and the documented protocol-error shapes (duplicate criteria, missing/out-of-range, malformed evidence, command-not-matching-recipe). Protocol errors are labelled but not interpreted as PASS — verdict routes FAIL.
- **Adoption sites slim, never grow.** Every modified existing skill or coordinator-prompt file MUST have line count strictly ≤ its current line count after edits. The detailed mechanical contract moves into the helper's `--help` text, tests, and helper-directory README. Skills retain at most one-line "Invoke `<script>` for `<purpose>`; surface its structured error/canonical message on failure" pointers.
- **Tool-surface change scoped to `plan-refiner`.** The `plan-refiner` agent gains `bash` (it currently lacks it; `code-refiner` already has it). No other tool surfaces change. No other agent definitions are touched.
- **Helper test runner.** `agent/package.json` gains a `test:helpers` npm script that invokes `python3 -m unittest discover` against both helper-test directories, and `check` is extended to chain `test:helpers` after the existing `npm test`. The plan's `## Test Command` is `cd agent && npm run check`, which exercises both extension tests and helper tests post-Wave-2.

## Tech stack

- Python 3 stdlib only (`argparse`, `json`, `re`, `pathlib`, `subprocess`, `sys`, `os`, `unittest`). No third-party deps.
- Existing infrastructure: `~/.pi/agent/model-tiers.json` (read by `resolve-model-dispatch` and `validate-review-provenance`); git CLI (called by `collect-diff-context` for diffs and untracked detection); existing markdown templates `agent/skills/execute-plan/verify-task-prompt.md` and `agent/skills/execute-plan/test-runner-prompt.md`.
- Shell glue: each adopted call site invokes the helper via `python3 <repo>/<script>.py [args]`, captures stdout/JSON, and surfaces stderr on failure. No new bash sub-runtime; calls go through the same `bash` tool already available to all SKILL.md-driven orchestrators (and now to `plan-refiner` after the tool-surface widening).
- Test harness: `unittest` (stdlib). Tests run via `python3 -m unittest discover -s <dir> -p "test_*.py"` from the repo root.

## File Structure

### New files

- `agent/skills/_shared/scripts/resolve-model-dispatch.py` (Create) — Python 3 CLI. Reads `~/.pi/agent/model-tiers.json` (overridable via `--model-tiers <path>`), accepts `--tier <key>` and `--agent <name>`, applies the three primitive operations from `_shared/model-tier-resolution.md` (tier-path resolution including `crossProvider.*`, provider-prefix extraction before first `/`, `dispatch[<prefix>]` lookup), and emits `{"model": "<provider/model>", "cli": "<cli>", "provider": "<prefix>", "tier": "<tier>"}` on stdout on success. On any of the four documented failure conditions, prints the corresponding canonical Template (1)–(4) string byte-equal to stderr (substituting `<agent>`, `<tier>`, `<provider>`, `<model>` verbatim) and exits non-zero. `--help` describes inputs, outputs, the four failure templates, and the byte-equal contract.
- `agent/skills/_shared/scripts/parse-artifact-handoff.py` (Create) — Python 3 CLI. Accepts `--marker <BRIEF_WRITTEN|SPEC_WRITTEN|REVIEW_ARTIFACT|TEST_RESULT_ARTIFACT>`, `--final-message <path|->`, optional `--expected-path <path>`, `--check-existence`, `--check-non-empty`. Extracts the LAST anchored line `^<MARKER>: (.+)$` from `--final-message`, optionally compares to `--expected-path`, optionally checks the captured path exists / is non-empty (zero bytes or whitespace-only counts as empty). On success emits `{"path": "<extracted>", "marker": "<MARKER>", "checks": ["marker", ...optional flags...]}`. On failure emits `{"failure": "<canonical reason>", "marker": "<MARKER>", ...}` to stderr and exits non-zero, where `<canonical reason>` matches today's labels: `missing <MARKER> marker`, `path mismatch: expected <X> got <Y>`, `missing or empty at <path>`. `--help` lists supported markers and the canonical reasons.
- `agent/skills/_shared/scripts/validate-review-provenance.py` (Create) — Python 3 CLI. Accepts `--review-file <path>`, `--allowed-tiers <tier1,tier2,...>` (e.g. `crossProvider.capable,capable` or `crossProvider.capable,standard`), optional `--model-tiers <path>` (default `~/.pi/agent/model-tiers.json`). Reads the first non-empty line of the review file, validates it matches the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`, extracts `<provider>/<model>` and `<cli>`, rejects when the value contains `inline` (case-insensitive), resolves each allowed tier via the `resolve-model-dispatch` primitives, and asserts the line's `<provider>/<model>` matches at least one allowed tier's resolved model AND `<cli>` matches `dispatch[<provider>]` for that model. On success emits `{"provider_model": "...", "cli": "...", "matched_tier": "..."}`. On failure emits `{"failure": "<specific check>", "review_file": "<path>", "observed": "<value or null>"}` to stderr and exits non-zero, where `<specific check>` is one of: `first non-empty line missing`, `format mismatch`, `inline-substring forbidden`, `model/cli mismatch (expected <X> got <Y>)`, `model-tiers.json missing or unreadable`. `--help` enumerates the failure labels.
- `agent/skills/_shared/scripts/fill-template.py` (Create) — Python 3 CLI. Accepts `--template <path>`, `--placeholders-json <path|->` (a JSON object mapping placeholder names like `TASK_SPEC` to string values; placeholders are referenced in the template as `{TASK_SPEC}`), `--output <path|->`, `--require-all-replaced` flag. Reads the template, replaces each `{KEY}` for keys in the JSON map by the JSON value (literal substring replace; only the bracketed form is treated as a placeholder), writes to output. With `--require-all-replaced`, fails if any `{IDENTIFIER}` token where `IDENTIFIER` matches `[A-Z_][A-Z0-9_]*` remains in the output. On success exits 0. On failure emits `{"failure": "<reason>", "unreplaced": [...optional list...], "missing_keys": [...optional list...]}` to stderr and exits non-zero. `--help` describes the placeholder grammar (uppercase identifier inside curly braces) and `--require-all-replaced` semantics.
- `agent/skills/_shared/scripts/README.md` (Create) — One-page index of the four shared helpers. For each helper: name, one-line purpose, one example invocation, the canonical failure shape it emits. Includes a "Running tests" section pointing at `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_*.py"` and at `cd agent && npm run test:helpers`. No frontmatter.
- `agent/skills/_shared/scripts/tests/test_resolve_model_dispatch.py` (Create) — Tests covering: (a) successful resolution of `capable` → top-level model + dispatch CLI; (b) successful resolution of `crossProvider.capable` → nested model + dispatch CLI; (c) Template (1) on missing file (substituting `<agent>` verbatim); (d) Template (2) on missing/empty top-level tier; (e) Template (2) on missing/empty `crossProvider.<tier>` with `<tier>` rendered as `crossProvider.cheap`; (f) Template (3) on missing `dispatch` map; (g) Template (4) on missing `dispatch.<provider>`. Each failure test asserts byte-equal stderr.
- `agent/skills/_shared/scripts/tests/test_parse_artifact_handoff.py` (Create) — Tests covering: (a) successful BRIEF_WRITTEN extraction with the LAST matching line; (b) successful SPEC_WRITTEN extraction; (c) REVIEW_ARTIFACT extraction; (d) TEST_RESULT_ARTIFACT extraction; (e) missing marker → canonical `missing <MARKER> marker` failure; (f) path-equality mismatch; (g) existence check failure on nonexistent path; (h) non-empty check failure on a whitespace-only file; (i) non-empty check passes on a file with content.
- `agent/skills/_shared/scripts/tests/test_validate_review_provenance.py` (Create) — Tests covering: (a) success with `crossProvider.capable` provenance; (b) success with `capable` fallback provenance (when both tiers allowed); (c) failure with missing first line; (d) failure with malformed format (no `via`, missing space, etc.); (e) failure with `inline` substring (case-insensitive `INLINE`, `Inline`, etc.); (f) failure with model/cli mismatch (provenance names a different model); (g) failure when model-tiers.json is missing.
- `agent/skills/_shared/scripts/tests/test_fill_template.py` (Create) — Tests covering: (a) success replacing single placeholder; (b) success replacing multiple placeholders; (c) success when value contains literal `{NOT_A_PLACEHOLDER}` text (only the JSON-keyed placeholders get replaced); (d) failure with `--require-all-replaced` when an unreplaced `{KEY}` remains; (e) extra JSON keys not referenced by the template are silently ignored — the literal-substring replace finds no `{KEY}` in the template for those extras and leaves the output unchanged for them, with no error and exit 0 (even under `--require-all-replaced`, since the check only fires on remaining `{IDENTIFIER}` tokens in the OUTPUT, not on unused JSON keys); (f) success writing to stdout (`-`).
- `agent/skills/_shared/scripts/tests/fixtures/model-tiers-complete.json` (Create) — Mirrors the current repo's `agent/model-tiers.json` shape: `capable`, `standard`, `cheap` top-level; `crossProvider.{capable,standard,cheap}`; `dispatch.{anthropic,openai-codex}`.
- `agent/skills/_shared/scripts/tests/fixtures/model-tiers-no-dispatch.json` (Create) — Same as complete but with `dispatch` removed (drives Template (3)).
- `agent/skills/_shared/scripts/tests/fixtures/model-tiers-missing-provider.json` (Create) — Same as complete but `dispatch.openai-codex` removed (drives Template (4) for cross-provider tiers).
- `agent/skills/_shared/scripts/tests/fixtures/review-good.md` (Create) — Sample review file with valid `**Reviewer:**` first non-empty line at `crossProvider.capable` (`openai-codex/gpt-5.5 via pi`).
- `agent/skills/_shared/scripts/tests/fixtures/review-malformed-line.md` (Create) — Sample with malformed first line (missing `via`).
- `agent/skills/_shared/scripts/tests/fixtures/review-inline-forbidden.md` (Create) — Sample with `inline` substring in the first line.
- `agent/skills/_shared/scripts/tests/fixtures/final-message-with-marker.txt` (Create) — Sample subagent finalMessage ending with `BRIEF_WRITTEN: /abs/path/to/brief.md`.
- `agent/skills/_shared/scripts/tests/fixtures/final-message-no-marker.txt` (Create) — Sample subagent finalMessage with no anchored marker line.
- `agent/skills/_shared/scripts/tests/fixtures/final-message-multiple-markers.txt` (Create) — Sample with two anchored marker lines (helper takes the LAST one).
- `agent/skills/_shared/scripts/tests/fixtures/template-simple.md` (Create) — Template with one `{PLACEHOLDER}`.
- `agent/skills/_shared/scripts/tests/fixtures/template-multi.md` (Create) — Template with multiple placeholders.
- `agent/skills/execute-plan/scripts/extract-plan-tasks.py` (Create) — Python 3 CLI. Accepts `--plan <path>`, optional `--task-number <N>` (extract only one task). Parses the plan markdown into structured JSON: `{"goal": "<text>", "test_command": "<bash text or null>", "tasks": [{"number": 1, "title": "...", "task_spec": "<raw markdown block>", "files": {"create": [...], "modify": [...], "test": [...]}, "steps": ["...", "..."], "criteria": [{"text": "...", "verify": "..."}], "model_recommendation": "cheap|standard|capable", "dependencies": [...task numbers...]}, ...], "errors": []}` on stdout. The `task_spec` field contains the raw markdown of the task block — from the line containing `### Task N:` through the line immediately before the next `### Task ` heading or the next `## ` heading (whichever comes first), preserving original line breaks. This is the verbatim source text execute-plan's adoption (Task 18) feeds to `assemble-verifier-prompt.py` as `{TASK_SPEC}`. The `dependencies` field IS the complete wave input — `execute-plan`'s orchestrator computes wave assignment downstream as topological levels of the per-task dependency graph, so this helper does not emit a separate `wave` (or `wave_inputs`) field. The spec's "dependencies/wave inputs" wording refers to this same data; the slash is "i.e.", not "and". On protocol-shape errors emits `{"errors": [{"task": <N or null>, "kind": "<error kind>", "detail": "<text>"}, ...]}` and exits non-zero. The complete enumeration of `kind` values is: `missing_verify_recipe` (a criterion has no immediately-following `Verify:` line); `duplicate_task_number` (two `### Task N:` headers share the same N); `out_of_order_task_number` (task numbers are not strictly ascending starting from 1 — e.g. Task 1 then Task 3 skipping 2, or Task 2 appearing before Task 1); `missing_files_block` (a task has no `**Files:**` block before its `**Steps:**` or `**Acceptance criteria:**` block); and `missing_model_recommendation` (a task has no `**Model recommendation:**` line, or its value is not exactly one of `cheap`, `standard`, or `capable`). `--help` lists the JSON shape and every error `kind` value.
- `agent/skills/execute-plan/scripts/collect-diff-context.py` (Create) — Python 3 CLI. Accepts `--working-dir <path>`, `--files <comma-separated paths>` (or `--files-json <path>`), `--limit-lines <N>` (default 500), `--limit-bytes <N>` (default 40960). For each file, runs `git status --porcelain -- <file>` from `--working-dir`; ONLY entries prefixed `??` go to the untracked branch (`git diff --no-index /dev/null -- <file>`); every other case (any non-`??` porcelain entry AND the no-porcelain-entry case for clean tracked files) goes to the tracked branch (`git diff HEAD -- <file>`). The no-entry case is first verified as tracked via `git ls-files --error-unmatch -- <file>`; if that errors (file is neither tracked nor untracked-listed), the helper surfaces a structured error and exits non-zero. Concatenates outputs, applies the truncation rule (keep first 300 lines + last 100 lines + a marker line `[diff truncated — <N> lines, <B> bytes total; verifier should note this and fall back to reading the named files for file-inspection criteria whose relevant code may lie in the truncated window]` when total exceeds either limit). Writes the combined diff to `--output <path|->`. Emits a one-line trailing summary `{"truncated": <bool>, "total_lines": <N>, "total_bytes": <B>, "files_observed": [...]}` to stderr. Always exits 0 unless git itself fails or arguments are invalid; git failure emits a structured error JSON to stderr and exits non-zero. `--help` documents the truncation marker text byte-equal.
- `agent/skills/execute-plan/scripts/assemble-verifier-prompt.py` (Create) — Python 3 CLI. Accepts `--template <path>` (default `agent/skills/execute-plan/verify-task-prompt.md`), `--task-spec <path|->`, `--criteria-json <path|->` (a JSON array `[{"text": "...", "verify": "..."}, ...]`), `--phase1-recipes-json <path|->` (a JSON array `[{"criterion_n": 1, "recipe": "..."}, ...]` listing only command-style recipes), `--modified-files <path|->` (newline-separated path list), `--diff-context <path|->`, `--working-dir <path>`, `--output <path|->`. Internally formats `{ACCEPTANCE_CRITERIA_WITH_VERIFY}` as a numbered list (criterion text, then `Verify: <verify>`), formats `{PHASE_1_RECIPES}` as `[Recipe for Criterion N] <recipe>` lines (one per JSON entry, in input order), formats `{MODIFIED_FILES}` as a newline-separated deduplicated list, then performs the substitution in-script using the same literal-substring replacement algorithm `fill-template.py` documents (no shell-out to `fill-template.py`; the algorithm is small and duplicated in-script so this helper has no runtime dependency on the `fill-template.py` path) plus the same `\{[A-Z_][A-Z0-9_]*\}` unreplaced-token check. Writes the filled prompt to `--output`. Fails closed on missing or malformed inputs with structured JSON error on stderr. `--help` documents every input shape.
- `agent/skills/execute-plan/scripts/parse-verifier-report.py` (Create) — Python 3 CLI. Accepts `--report <path|->`, `--criteria-count <K>` (the number of acceptance criteria expected, `K`), optional `--phase1-recipes-json <path>` (the same JSON array shape as `assemble-verifier-prompt`'s `--phase1-recipes-json`, used to byte-equal-compare each `[Evidence for Criterion N]` block's `command:` line against the recipe text supplied for that criterion). Parses the verifier output for: (1) `## Phase 1 Evidence` blocks of shape `[Evidence for Criterion N]` containing all four labelled fields (`command:`, `exit_code:`, `stdout:`, `stderr:`) in that order; (2) `## Per-Criterion Verdicts` headers `[Criterion N] PASS|FAIL` (case-sensitive, no `verdict:` prefix) and the per-entry `recipe:`/`evidence:`/`reason:` body; (3) the `VERDICT: PASS|FAIL` overall line. Validates: every `N ∈ {1..K}` has exactly one `[Criterion N]` header (no duplicates, no out-of-range, no missing); every command-style criterion (those with a recipe in `--phase1-recipes-json`) has a matching `[Evidence for Criterion N]` block with byte-equal `command:` line. Emits `{"verdict": "PASS|FAIL", "per_criterion": [{"n": N, "verdict": "...", "reason": "..."}, ...], "phase1_evidence": [...], "protocol_errors": ["<reason>", ...]}` on stdout. Protocol errors route as FAIL-equivalent: when `protocol_errors` is non-empty, the output's `verdict` is `FAIL` and the helper exits non-zero. `--help` lists every protocol error label byte-equal: `verifier phase-1 evidence block malformed at criterion N: <specific check>`, `verifier missing evidence block for command-style criterion N`, `verifier ran command not matching any phase-1 recipe: <command>`, plus the malformed-header / duplicate / out-of-range labels.
- `agent/skills/execute-plan/scripts/README.md` (Create) — One-page index of the four execute-plan helpers. Same shape as the shared README. Points at `python3 -m unittest discover -s agent/skills/execute-plan/scripts/tests -p "test_*.py"` and at `cd agent && npm run test:helpers`. No frontmatter.
- `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py` (Create) — Tests covering: (a) successful extraction of a plan with one task, two tasks, and dependency-link parsing; (b) extraction surfaces `## Test Command` bash block; (c) protocol-error: criterion missing `Verify:` line (`missing_verify_recipe`); (d) protocol-error: duplicate task number (`duplicate_task_number`); (e) protocol-error: out-of-order task numbers — `Task 1` then `Task 3` skipping 2 (`out_of_order_task_number`); (f) protocol-error: missing `**Files:**` block (`missing_files_block`); (g) protocol-error: missing `**Model recommendation:**` line (`missing_model_recommendation` absent-line sub-case); (h) protocol-error: invalid `**Model recommendation:**` value such as `premium` (`missing_model_recommendation` invalid-value sub-case); (i) success when `--task-number` filters output to a single task.
- `agent/skills/execute-plan/scripts/tests/test_collect_diff_context.py` (Create) — Tests covering: (a) tracked-file diff included from a temp git repo; (b) untracked-file diff included via `--no-index`; (c) mix of tracked + untracked passes through both branches; (d) truncation triggers at >500 lines (verify the marker text byte-equal and that first 300 + last 100 lines remain); (e) truncation triggers at >40KB; (f) `files_observed` summary includes all input files; (g) git unavailable → structured error; (h) clean tracked file (no porcelain entry) takes the tracked branch and emits an empty diff, NOT a `--no-index` added-content diff.
- `agent/skills/execute-plan/scripts/tests/test_assemble_verifier_prompt.py` (Create) — Tests covering: (a) full success: every placeholder replaced with the numbered formats; (b) `{PHASE_1_RECIPES}` empty section when input recipes JSON is empty; (c) `{MODIFIED_FILES}` deduplicated when input has duplicates; (d) failure when a required input file is missing; (e) failure when the template contains an unknown `{PLACEHOLDER}` after fill (via `--require-all-replaced` semantics).
- `agent/skills/execute-plan/scripts/tests/test_parse_verifier_report.py` (Create) — Tests covering: (a) clean PASS report with K criteria; (b) FAIL routing on a single `[Criterion N] FAIL`; (c) protocol-error: malformed criterion header (`[Criterion 1] verdict: PASS`); (d) protocol-error: lowercase verdict (`pass`); (e) protocol-error: duplicate `[Criterion 1]`; (f) protocol-error: missing criterion (K=3, only `[Criterion 1]` and `[Criterion 3]` present); (g) protocol-error: out-of-range (`[Criterion 4]` when K=3); (h) protocol-error: phase-1 evidence block missing one of the four labelled fields; (i) protocol-error: command-style criterion has no evidence block; (j) protocol-error: evidence `command:` not byte-equal to any supplied recipe.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-clean.md` (Create) — Sample plan with two tasks, complete `Verify:` recipes, valid dependency line.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-verify.md` (Create) — Sample plan with one criterion lacking its `Verify:` line.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-duplicate-task.md` (Create) — Sample plan with duplicated task numbers.
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-files.md` (Create) — Sample plan whose Task 1 has no `**Files:**` block (drives `missing_files_block`).
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-model.md` (Create) — Sample plan whose Task 1 omits the `**Model recommendation:**` line entirely (drives `missing_model_recommendation` for the absent-line sub-case).
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-invalid-model.md` (Create) — Sample plan whose Task 1 has a `**Model recommendation:**` line with an invalid value (e.g. `premium` or `expensive`) instead of `cheap|standard|capable` (drives `missing_model_recommendation` for the invalid-value sub-case).
- `agent/skills/execute-plan/scripts/tests/fixtures/plan-out-of-order.md` (Create) — Sample plan whose tasks appear as Task 1, Task 3 (skipping 2) (drives `out_of_order_task_number`).
- `agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-pass.md` (Create) — Clean verifier report.
- `agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-fail.md` (Create) — Verifier report with one FAIL criterion.
- `agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-malformed.md` (Create) — Verifier report with malformed header.
- `agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-evidence-malformed.md` (Create) — Phase 1 evidence block missing `stderr:` field.

### Modified files

- `agent/package.json` (Modify) — Add `"test:helpers": "python3 -m unittest discover -s skills/_shared/scripts/tests -p \"test_*.py\" && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p \"test_*.py\""` script. Modify `"check": "npm run build && npm test"` to `"check": "npm run build && npm test && npm run test:helpers"`. No new dependencies (Python is system-level).
- `agent/agents/plan-refiner.md` (Modify) — Add `bash` to the `tools:` frontmatter list. Currently: `tools: read, write, edit, grep, find, ls, subagent_run_serial`. After: `tools: read, write, edit, grep, find, ls, bash, subagent_run_serial`. No other change. This is the narrowest possible widening to let the coordinator invoke shared helper scripts; `code-refiner` already has `bash`.
- `agent/skills/scout/SKILL.md` (Modify) — Slim Step 2 ("Resolve model and CLI") and Step 6 ("Validate completion") subsections that hand-roll resolution + marker checks. Replace the verbose template-list + primitive-operations prose in Step 2 with a one-line invocation of `agent/skills/_shared/scripts/resolve-model-dispatch.py --tier <tier> --agent scout` and surface its byte-equal failure on non-zero. Replace Step 6's `BRIEF_WRITTEN:` extraction + path-equality + existence-and-non-empty prose with one line invoking `agent/skills/_shared/scripts/parse-artifact-handoff.py --marker BRIEF_WRITTEN --final-message <path> --expected-path <path> --check-existence --check-non-empty`. Net line count must shrink (today 170 lines).
- `agent/skills/define-spec/SKILL.md` (Modify) — Slim Step 3a ("Mux branch — dispatch `spec-designer`") to invoke `resolve-model-dispatch.py --tier capable --agent spec-designer` once and surface its canonical failure. Slim Step 4 ("Validate `SPEC_WRITTEN:` (mux branch only)") cases (1)/(3)/(success) marker + existence checks to invoke `parse-artifact-handoff.py --marker SPEC_WRITTEN --final-message <path> --check-existence` for the success path. **Preserve case (2) (transcript-backed recovery) verbatim** — recovery is skill-specific and does NOT route through the helper; only the marker-extraction primitive is delegated. Net line count must shrink (today 201 lines).
- `agent/skills/generate-plan/SKILL.md` (Modify) — Slim Step 2 ("Resolve model tiers") to invoke `resolve-model-dispatch.py --tier capable --agent planner` once. Replace the `cat ~/.pi/agent/model-tiers.json | python3 -c ...` block + the four-template prose with the single helper invocation and a one-line "surface canonical Template (1)–(4) on failure" pointer. The Step 1b workflow-artifact-paths classifier and the Scout brief preamble logic stay untouched (those are not mechanical-helper targets in this slice). Net line count must shrink (today 202 lines).
- `agent/skills/requesting-code-review/SKILL.md` (Modify) — Slim Step 2b ("Resolve model and dispatch") to invoke `resolve-model-dispatch.py --tier capable --agent code-reviewer`. Net line count must shrink (today 114 lines).
- `agent/skills/refine-plan/SKILL.md` (Modify) — Slim Step 5 ("Read model matrix") and Step 9.5 ("Validate review provenance"). Step 5 keeps the model-matrix read for downstream use but delegates the dispatch resolution to `resolve-model-dispatch.py`. Step 9.5 collapses the six-numbered checks into one line invoking `agent/skills/_shared/scripts/validate-review-provenance.py --review-file <path> --allowed-tiers crossProvider.capable,capable` and surfacing its `<specific check>` reason on failure. Net line count must shrink (today 255 lines).
- `agent/skills/refine-plan/refine-plan-prompt.md` (Modify) — Slim Per-Iteration Full Review Step 4 (4a/4b/4c reconstruction with re-fill is replaced by helper invocations: `resolve-model-dispatch` for primary + fallback resolution, `fill-template --require-all-replaced` for re-filling) and Step 5 (5a-5d marker/path-equality/existence/provenance) to one-line helper invocations using `parse-artifact-handoff.py --marker REVIEW_ARTIFACT --final-message <path> --expected-path <path> --check-existence --check-non-empty` followed by `validate-review-provenance.py --review-file <path> --allowed-tiers crossProvider.capable,capable`. The exact-equality vs supplied-`{REVIEWER_PROVENANCE}` extra check stays in prose (it's a coordinator-state pin, not a generic regex check); the failure-mode taxonomy in `## Failure Modes` is preserved verbatim. Net line count must shrink (today 234 lines).
- `agent/skills/refine-code/SKILL.md` (Modify) — Slim Step 6 ("Validate review provenance") to one-line `validate-review-provenance.py --review-file <path> --allowed-tiers crossProvider.capable,standard` (the success path uses `crossProvider.capable` only — the helper is invoked twice with different `--allowed-tiers` based on STATUS, both pointers stay in prose as one line each). Net line count must shrink (today 129 lines).
- `agent/skills/refine-code/refine-code-prompt.md` (Modify) — Slim Iteration 1 Step 3 (3a-3e) and the Hybrid Re-Review / Final Verification handoff-validation paragraphs to invoke `parse-artifact-handoff.py --marker REVIEW_ARTIFACT ...` and `validate-review-provenance.py ...` for each pass. The fail-fast exact-equality-vs-supplied-`{REVIEWER_PROVENANCE}` check stays in prose. Slim the model-tier dispatch prose to invoke `resolve-model-dispatch.py` for each role assignment. Net line count must shrink (today 256 lines).
- `agent/skills/execute-plan/SKILL.md` (Modify) — The largest slimming. Replace Step 6's "Resolve model tiers" + "Dispatch resolution" paragraphs with one helper invocation per task. Replace Step 7's Test-runner dispatch artifact-readback (the four numbered checks: marker / path-equality / existence-and-non-empty / header-parse) — keep the header-parse prose (still a SKILL-specific concern) but delegate marker + path-equality + existence-and-non-empty to `parse-artifact-handoff.py --marker TEST_RESULT_ARTIFACT ...`. Replace Step 11.2's `{MODIFIED_FILES}` orchestrator-assembled-set construction, `{DIFF_CONTEXT}` assembly + truncation rule, and `{PHASE_1_RECIPES}` filter with one invocation each: `extract-plan-tasks.py --plan <path> --task-number <N>` (for criteria + recipes + files-declared), `collect-diff-context.py --working-dir <path> --files <list>` (for diff + truncation), and `assemble-verifier-prompt.py ...` (for prompt assembly). Step 11.2's verifier dispatch model resolution uses `resolve-model-dispatch.py --tier crossProvider.standard --agent verifier`. Replace Step 11.3's verifier-output parsing (the `[Criterion N] PASS|FAIL` rules, the K-coverage requirement, the duplicate / out-of-range / phase-1 evidence-block rules) with one invocation of `parse-verifier-report.py --report <path> --criteria-count <K> --phase1-recipes-json <path>` and a routing line. Step 12.2 and Step 16 reuse Step 7's slimmed test-runner artifact handoff. Net line count must shrink (today 771 lines). Final integration regression model is unchanged.

## Tasks

### Task 1: Implement `resolve-model-dispatch` helper script and tests

**Files:**
- Create: `agent/skills/_shared/scripts/resolve-model-dispatch.py`
- Create: `agent/skills/_shared/scripts/tests/test_resolve_model_dispatch.py`
- Create: `agent/skills/_shared/scripts/tests/fixtures/model-tiers-complete.json`
- Create: `agent/skills/_shared/scripts/tests/fixtures/model-tiers-no-dispatch.json`
- Create: `agent/skills/_shared/scripts/tests/fixtures/model-tiers-missing-provider.json`

**Steps:**
- [ ] **Step 1: Write the test fixtures** — Create three JSON fixture files. `model-tiers-complete.json` mirrors `agent/model-tiers.json` byte-for-byte (top-level `capable`, `standard`, `cheap`; `crossProvider.{capable,standard,cheap}`; `dispatch.{anthropic,openai-codex}`). `model-tiers-no-dispatch.json` is `model-tiers-complete.json` with the `dispatch` key removed entirely. `model-tiers-missing-provider.json` is `model-tiers-complete.json` with `dispatch.openai-codex` removed.
- [ ] **Step 2: Write the failing tests** — In `test_resolve_model_dispatch.py`, write `unittest.TestCase` test methods covering: (a) `--tier capable --agent coder --model-tiers <complete>` → exit 0, stdout JSON has `model: anthropic/claude-opus-4-7`, `cli: claude`, `provider: anthropic`, `tier: capable`; (b) `--tier crossProvider.capable --agent verifier --model-tiers <complete>` → stdout JSON has `model: openai-codex/gpt-5.5`, `cli: pi`; (c) `--model-tiers /nonexistent` → exit non-zero, stderr is byte-equal `~/.pi/agent/model-tiers.json missing or unreadable — cannot dispatch coder.`; (d) `--tier nosuchtier` → stderr byte-equal `model-tiers.json has no usable "nosuchtier" model — cannot dispatch coder.`; (e) `--tier crossProvider.cheap` with a fixture where that key is empty `""` → stderr byte-equal `model-tiers.json has no usable "crossProvider.cheap" model — cannot dispatch coder.`; (f) `--tier capable --model-tiers <no-dispatch>` → stderr byte-equal `model-tiers.json has no dispatch map — cannot dispatch coder.`; (g) `--tier crossProvider.capable --model-tiers <missing-provider>` → stderr byte-equal `model-tiers.json has no dispatch.openai-codex mapping for crossProvider.capable model openai-codex/gpt-5.5 — cannot dispatch coder.`. Run the tests and confirm RED for the expected reason (script does not yet exist).
- [ ] **Step 3: Implement the script** — Write `resolve-model-dispatch.py`. Shebang `#!/usr/bin/env python3`. Use `argparse` for `--tier`, `--agent`, `--model-tiers` (default `~/.pi/agent/model-tiers.json` expanded via `os.path.expanduser`). Read and JSON-parse the file; on any IOError emit Template (1) and exit 1. Walk the tier path: if the tier contains a dot (e.g. `crossProvider.capable`), split and traverse nested dict; otherwise top-level key. Empty/missing string emits Template (2) byte-equal with `<tier>` substituted as-is (so `crossProvider.cheap` is rendered exactly that way). Look up `dispatch` key; missing emits Template (3). Extract provider prefix as substring before first `/`; look up `dispatch[provider]`; missing/empty emits Template (4) with `<provider>` and `<model>` substituted. On success print JSON `{"model": ..., "cli": ..., "provider": ..., "tier": ...}` to stdout and exit 0. Add `--help` describing inputs, outputs, and the four canonical failure templates by name.
- [ ] **Step 4: Verify GREEN** — Run `python3 -m unittest agent.skills._shared.scripts.tests.test_resolve_model_dispatch` (or use the discover form `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_resolve_model_dispatch.py"`) and confirm all tests pass with exit 0. Run `python3 agent/skills/_shared/scripts/resolve-model-dispatch.py --help` and confirm it prints input/output/failure-template documentation.

**Acceptance criteria:**

- The script exists at `agent/skills/_shared/scripts/resolve-model-dispatch.py` with a shebang line and is invokable via `python3`.
  Verify: `head -1 agent/skills/_shared/scripts/resolve-model-dispatch.py` prints `#!/usr/bin/env python3`, and `python3 agent/skills/_shared/scripts/resolve-model-dispatch.py --help` exits 0.
- The script's `--help` output describes inputs, outputs, and references all four canonical failure templates.
  Verify: `python3 agent/skills/_shared/scripts/resolve-model-dispatch.py --help` stdout contains the substrings `--tier`, `--agent`, `--model-tiers`, `Template`, and at least one of `cannot dispatch`.
- Successful resolution of `capable` from the complete fixture emits the expected JSON.
  Verify: `python3 agent/skills/_shared/scripts/resolve-model-dispatch.py --tier capable --agent coder --model-tiers agent/skills/_shared/scripts/tests/fixtures/model-tiers-complete.json` exits 0 and stdout parses as JSON with `.model == "anthropic/claude-opus-4-7"`, `.cli == "claude"`, `.provider == "anthropic"`.
- Successful resolution of `crossProvider.capable` from the complete fixture emits the expected JSON.
  Verify: `python3 agent/skills/_shared/scripts/resolve-model-dispatch.py --tier crossProvider.capable --agent verifier --model-tiers agent/skills/_shared/scripts/tests/fixtures/model-tiers-complete.json` exits 0 and stdout parses as JSON with `.model == "openai-codex/gpt-5.5"`, `.cli == "pi"`.
- Templates (1)–(4) emit byte-equal canonical messages on the four failure conditions.
  Verify: run `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_resolve_model_dispatch.py" -v` and confirm the test methods named `test_template_1_missing_file`, `test_template_2_missing_tier`, `test_template_3_missing_dispatch`, `test_template_4_missing_provider` all pass.

**Model recommendation:** standard

### Task 2: Implement `parse-artifact-handoff` helper script and tests

**Files:**
- Create: `agent/skills/_shared/scripts/parse-artifact-handoff.py`
- Create: `agent/skills/_shared/scripts/tests/test_parse_artifact_handoff.py`
- Create: `agent/skills/_shared/scripts/tests/fixtures/final-message-with-marker.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/final-message-no-marker.txt`
- Create: `agent/skills/_shared/scripts/tests/fixtures/final-message-multiple-markers.txt`

**Steps:**
- [ ] **Step 1: Write the test fixtures** — `final-message-with-marker.txt` ends with a single line `BRIEF_WRITTEN: /tmp/sample-brief.md` (newline-terminated). `final-message-no-marker.txt` contains arbitrary subagent prose with no `^<MARKER>: ` line. `final-message-multiple-markers.txt` contains two anchored `BRIEF_WRITTEN: <path>` lines on different lines (intermediate text between them); the helper must take the LAST one.
- [ ] **Step 2: Write the failing tests** — In `test_parse_artifact_handoff.py`, write tests covering: (a) test method `test_marker_brief_written`: `--marker BRIEF_WRITTEN --final-message fixtures/final-message-with-marker.txt` → exit 0, stdout JSON `.path == "/tmp/sample-brief.md"`, `.marker == "BRIEF_WRITTEN"`; (b) test method `test_marker_spec_written`: construct a temp final-message file containing the line `SPEC_WRITTEN: /tmp/sample-spec.md` and assert `--marker SPEC_WRITTEN --final-message <temp>` exits 0 with stdout JSON `.marker == "SPEC_WRITTEN"` and `.path == "/tmp/sample-spec.md"`; (b2) test method `test_marker_review_artifact`: same shape with marker `REVIEW_ARTIFACT` and a temp file containing `REVIEW_ARTIFACT: /tmp/sample-review.md`; (b3) test method `test_marker_test_result_artifact`: same shape with marker `TEST_RESULT_ARTIFACT` and a temp file containing `TEST_RESULT_ARTIFACT: /tmp/sample-test-result.md`; (b4) test method `test_marker_invalid_choice_rejected`: invoke with `--marker FOO --final-message /dev/null` and assert exit non-zero with argparse error mentioning all four valid choices; (c) `--marker BRIEF_WRITTEN --final-message fixtures/final-message-no-marker.txt` → exit non-zero, stderr JSON `.failure == "missing BRIEF_WRITTEN marker"`; (d) `--marker BRIEF_WRITTEN --final-message <fixture> --expected-path /different/path` → stderr JSON `.failure == "path mismatch: expected /different/path got /tmp/sample-brief.md"`; (e) test method `test_existence_check_failure`: `--check-existence` against a path that doesn't exist → stderr JSON `.failure == "missing or empty at <path>"`; (f) test method `test_non_empty_check_failure`: `--check-non-empty` against a whitespace-only file (created in test setup) → same `.failure == "missing or empty at <path>"`; (g) multiple-markers fixture takes the LAST line (verify `.path` is the second one). Run tests and confirm RED.
- [ ] **Step 3: Implement the script** — Write `parse-artifact-handoff.py`. Use `argparse` for `--marker` (choices: BRIEF_WRITTEN, SPEC_WRITTEN, REVIEW_ARTIFACT, TEST_RESULT_ARTIFACT), `--final-message` (path or `-` for stdin), `--expected-path`, `--check-existence` flag, `--check-non-empty` flag. Read the final-message content; iterate lines and find the LAST line matching `^<MARKER>: (.+)$` (anchored regex). On no match, emit JSON failure `missing <MARKER> marker` to stderr and exit 1. On `--expected-path`, compare exact string equality; on mismatch, emit `path mismatch: expected <X> got <Y>`. On `--check-existence`, `os.path.exists(path)`; on miss, emit `missing or empty at <path>`. On `--check-non-empty`, open the file and confirm `read().strip() != ""`; otherwise emit `missing or empty at <path>` (same label — empty and missing collapse). On all checks passing, emit `{"path": ..., "marker": ..., "checks": ["marker", ...]}` to stdout and exit 0. Add `--help` listing supported markers and the canonical failure labels.
- [ ] **Step 4: Verify GREEN** — Run `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_parse_artifact_handoff.py" -v` and confirm all tests pass.

**Acceptance criteria:**

- The script exists with `--help` describing the four supported markers and canonical failure labels.
  Verify: `python3 agent/skills/_shared/scripts/parse-artifact-handoff.py --help` exits 0 and stdout contains all four marker names (`BRIEF_WRITTEN`, `SPEC_WRITTEN`, `REVIEW_ARTIFACT`, `TEST_RESULT_ARTIFACT`) and the substring `path mismatch`.
- LAST-marker semantics: when multiple anchored marker lines appear, the helper extracts the last one.
  Verify: `python3 agent/skills/_shared/scripts/parse-artifact-handoff.py --marker BRIEF_WRITTEN --final-message agent/skills/_shared/scripts/tests/fixtures/final-message-multiple-markers.txt` exits 0 and the stdout JSON's `.path` matches the path on the second/later marker line in that fixture.
- Path-equality mismatch produces the canonical `path mismatch` failure shape.
  Verify: invoking the helper with `--expected-path /nope` against the with-marker fixture exits non-zero and stderr JSON's `.failure` starts with `path mismatch: expected /nope got `.
- Existence + non-empty checks fail with the canonical `missing or empty at <path>` shape.
  Verify: `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_parse_artifact_handoff.py" -v` passes the test methods named `test_existence_check_failure` and `test_non_empty_check_failure`.
- All four marker types are accepted by the `--marker` argument and an unknown marker is rejected.
  Verify: `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_parse_artifact_handoff.py" -v` passes the test methods named `test_marker_brief_written`, `test_marker_spec_written`, `test_marker_review_artifact`, `test_marker_test_result_artifact`, and `test_marker_invalid_choice_rejected`.

**Model recommendation:** standard

### Task 3: Implement `validate-review-provenance` helper script and tests

**Files:**
- Create: `agent/skills/_shared/scripts/validate-review-provenance.py`
- Create: `agent/skills/_shared/scripts/tests/test_validate_review_provenance.py`
- Create: `agent/skills/_shared/scripts/tests/fixtures/review-good.md`
- Create: `agent/skills/_shared/scripts/tests/fixtures/review-malformed-line.md`
- Create: `agent/skills/_shared/scripts/tests/fixtures/review-inline-forbidden.md`

**Steps:**
- [ ] **Step 1: Write the test fixtures** — `review-good.md`: first non-empty line is `**Reviewer:** openai-codex/gpt-5.5 via pi`, blank line, then `## Outcome` body. `review-malformed-line.md`: first non-empty line is `**Reviewer:** openai-codex/gpt-5.5` (no `via <cli>`). `review-inline-forbidden.md`: first non-empty line is `**Reviewer:** anthropic/claude-INLINE-fallback via claude` (contains case-insensitive `inline`).
- [ ] **Step 2: Write the failing tests** — In `test_validate_review_provenance.py`, write tests covering: (a) `--review-file fixtures/review-good.md --allowed-tiers crossProvider.capable,capable --model-tiers fixtures/model-tiers-complete.json` → exit 0, stdout JSON `.matched_tier == "crossProvider.capable"`, `.provider_model == "openai-codex/gpt-5.5"`, `.cli == "pi"`; (b) reviewer line at fallback `capable` (`anthropic/claude-opus-4-7 via claude`) → exit 0, `.matched_tier == "capable"`; (c) malformed line → stderr `.failure == "format mismatch"`; (d) `inline` substring (any case) → stderr `.failure == "inline-substring forbidden"`; (e) wrong model in line (e.g. `anthropic/claude-sonnet-4-6 via claude` when allowed tiers are only `crossProvider.capable,capable`) → stderr `.failure == "model/cli mismatch (expected ... got ...)"` with both expected (one of the resolved tier models) and observed values listed; (f) missing first non-empty line (file empty or whitespace-only) → stderr `.failure == "first non-empty line missing"`; (g) missing model-tiers file → stderr `.failure == "model-tiers.json missing or unreadable"`. Run and confirm RED.
- [ ] **Step 3: Implement the script** — Write `validate-review-provenance.py`. Use `argparse` for `--review-file`, `--allowed-tiers` (comma-separated), `--model-tiers` (default `~/.pi/agent/model-tiers.json`). Read review file; find first non-empty (stripped) line; if none emit `first non-empty line missing`. Apply the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`; on no match emit `format mismatch`. If the line contains `inline` case-insensitive, emit `inline-substring forbidden`. Extract `<provider>/<model>` (the token between `**Reviewer:** ` and ` via `) and `<cli>` (the token after ` via `). Read model-tiers JSON (emit `model-tiers.json missing or unreadable` on error). For each allowed tier, resolve `<resolved-model>` via the same tier-walk algorithm as `resolve-model-dispatch`; resolve `<expected-cli>` via `dispatch[provider-prefix-of-resolved-model]`. If the line's `<provider>/<model>` matches `<resolved-model>` exactly AND `<cli>` matches `<expected-cli>`, mark this tier as the matched tier. If no allowed tier matches, emit `model/cli mismatch (expected <list of resolved (model, cli) pairs> got <observed>)`. On success emit `{"provider_model": ..., "cli": ..., "matched_tier": ...}` and exit 0. Add `--help`.
- [ ] **Step 4: Verify GREEN** — Run `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_validate_review_provenance.py" -v`.

**Acceptance criteria:**

- The script exists with `--help` listing the canonical failure labels.
  Verify: `python3 agent/skills/_shared/scripts/validate-review-provenance.py --help` exits 0 and stdout contains the labels `first non-empty line missing`, `format mismatch`, `inline-substring forbidden`, `model/cli mismatch`.
- Successful provenance match returns the resolved tier name in JSON.
  Verify: `python3 agent/skills/_shared/scripts/validate-review-provenance.py --review-file agent/skills/_shared/scripts/tests/fixtures/review-good.md --allowed-tiers crossProvider.capable,capable --model-tiers agent/skills/_shared/scripts/tests/fixtures/model-tiers-complete.json` exits 0 and stdout JSON has `.matched_tier == "crossProvider.capable"`.
- The `inline` substring rejection is case-insensitive and emits the canonical label.
  Verify: `python3 agent/skills/_shared/scripts/validate-review-provenance.py --review-file agent/skills/_shared/scripts/tests/fixtures/review-inline-forbidden.md --allowed-tiers crossProvider.capable,capable --model-tiers agent/skills/_shared/scripts/tests/fixtures/model-tiers-complete.json` exits non-zero and stderr JSON's `.failure == "inline-substring forbidden"`.
- Format mismatch and model/cli mismatch emit distinct, canonical failure labels.
  Verify: `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_validate_review_provenance.py" -v` passes the test methods `test_malformed_format`, `test_model_cli_mismatch`, and `test_first_line_missing`.

**Model recommendation:** standard

### Task 4: Implement `fill-template` helper script and tests

**Files:**
- Create: `agent/skills/_shared/scripts/fill-template.py`
- Create: `agent/skills/_shared/scripts/tests/test_fill_template.py`
- Create: `agent/skills/_shared/scripts/tests/fixtures/template-simple.md`
- Create: `agent/skills/_shared/scripts/tests/fixtures/template-multi.md`

**Steps:**
- [ ] **Step 1: Write the test fixtures** — `template-simple.md`: contains a single placeholder, e.g. `Hello, {NAME}!`. `template-multi.md`: contains multiple placeholders, e.g. `Plan: {PLAN_PATH}\nTask: {TASK_NUMBER}\nGoal: {GOAL}\n`.
- [ ] **Step 2: Write the failing tests** — In `test_fill_template.py`, write tests covering: (a) success replacing single placeholder via `--placeholders-json` containing `{"NAME": "world"}` → output `Hello, world!`; (b) success replacing multiple placeholders → output reflects every replacement; (c) literal `{NOT_A_PLACEHOLDER}` text in the value passed for `{KEY}` (e.g. JSON value is `"see {OTHER}"`) — no recursive expansion; the literal stays as-is in the output; (d) `--require-all-replaced` with the simple template and an empty JSON map → exit non-zero, stderr JSON `.failure == "unreplaced placeholders remain"` and `.unreplaced == ["NAME"]`; (e) test method `test_extra_json_keys_ignored`: simple template with placeholder `{NAME}` plus a JSON map `{"NAME": "world", "EXTRA": "ignored"}` → exit 0 and output is exactly `Hello, world!`; same input plus `--require-all-replaced` also exits 0 (extra unused JSON keys never trigger the unreplaced-token check); (f) writing to stdout via `--output -` works the same as a file; (g) missing `--template` file → exit non-zero with structured error. Run and confirm RED.
- [ ] **Step 3: Implement the script** — Write `fill-template.py`. Use `argparse` for `--template`, `--placeholders-json` (path or `-` for stdin), `--output` (path or `-` for stdout), `--require-all-replaced` flag. Read template; read JSON map. For each `(key, value)` in the map, replace `{<key>}` (literal substring, no regex) with `value` in the template content. Extra JSON keys whose `{KEY}` does not appear in the template are silently ignored — the literal-substring replace simply has no match and the template is unchanged for those keys; this is intentional behavior, not an error. If `--require-all-replaced`, scan the result for any remaining tokens matching the regex `\{[A-Z_][A-Z0-9_]*\}` and, if any match, emit `{"failure": "unreplaced placeholders remain", "unreplaced": [...sorted unique names...]}` to stderr and exit non-zero (the check fires only on tokens still present in the output, never on unused JSON keys). Otherwise write to `--output` and exit 0. Add `--help` describing the placeholder grammar, `--require-all-replaced` semantics, and the silently-ignored-extra-keys behavior.
- [ ] **Step 4: Verify GREEN** — Run `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_fill_template.py" -v`.

**Acceptance criteria:**

- The script exists with `--help` describing the placeholder grammar (`{IDENTIFIER}` form with an uppercase identifier).
  Verify: `python3 agent/skills/_shared/scripts/fill-template.py --help` exits 0 and stdout mentions both `--require-all-replaced` and the placeholder pattern (uppercase identifier in curly braces).
- Single-placeholder substitution works via `--placeholders-json`.
  Verify: `echo '{"NAME": "world"}' | python3 agent/skills/_shared/scripts/fill-template.py --template agent/skills/_shared/scripts/tests/fixtures/template-simple.md --placeholders-json - --output -` prints `Hello, world!` exactly (followed by template's trailing newline if present).
- `--require-all-replaced` flags unreplaced placeholders with a canonical failure shape.
  Verify: running the helper against `template-simple.md` with an empty JSON map (`{}`) and `--require-all-replaced` exits non-zero and stderr JSON has `.failure == "unreplaced placeholders remain"` and `.unreplaced` contains `"NAME"`.
- No recursive placeholder expansion: a value containing `{OTHER}` is not re-expanded.
  Verify: `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_fill_template.py" -v` passes the test method `test_no_recursive_expansion`.
- Extra JSON keys whose `{KEY}` does not appear in the template are silently ignored, even under `--require-all-replaced`.
  Verify: `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_fill_template.py" -v` passes the test method `test_extra_json_keys_ignored`.

**Model recommendation:** cheap

### Task 5: Implement `extract-plan-tasks` helper script and tests

**Files:**
- Create: `agent/skills/execute-plan/scripts/extract-plan-tasks.py`
- Create: `agent/skills/execute-plan/scripts/tests/test_extract_plan_tasks.py`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-clean.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-verify.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-duplicate-task.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-files.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-model.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-invalid-model.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/plan-out-of-order.md`

**Steps:**
- [ ] **Step 1: Write the fixtures** — `plan-clean.md`: minimal plan with `## Goal`, `## Tech stack`, `## File Structure`, two `### Task N:` sections each with `**Files:**` (Create/Modify/Test), Steps (numbered checkbox bullets), `**Acceptance criteria:**` (each criterion bullet immediately followed by an indented `Verify:` line on its own), `**Model recommendation:** cheap|standard|capable`, a `## Dependencies` section (`- Task 2 depends on: Task 1`), a `## Risk Assessment`, and a `## Test Command` section with a fenced ```bash``` block. `plan-missing-verify.md`: same shape but Task 1's first criterion lacks its trailing `Verify:` line. `plan-duplicate-task.md`: contains two `### Task 1:` headers. `plan-missing-files.md`: same shape as `plan-clean.md` but Task 1's `**Files:**` block is removed entirely (Steps appear directly under the task heading). `plan-missing-model.md`: same shape as `plan-clean.md` but Task 1's `**Model recommendation:**` line is removed entirely. `plan-invalid-model.md`: same shape as `plan-clean.md` but Task 1's `**Model recommendation:**` value is set to an invalid token (e.g. `**Model recommendation:** premium`). `plan-out-of-order.md`: contains `### Task 1:` followed by `### Task 3:` (skipping Task 2), each task fully formed otherwise.
- [ ] **Step 2: Write the failing tests** — In `test_extract_plan_tasks.py`, tests covering: (a) `--plan plan-clean.md` exits 0 with stdout JSON `.tasks[0].number == 1`, `.tasks[0].title` matches the heading text after the colon, `.tasks[0].task_spec` is a non-empty string starting with `### Task 1:` and ending at the boundary before the next `### Task ` or `## ` heading, `.tasks[0].files.create == [...]`, `.tasks[0].criteria[*]` each have non-empty `text` and `verify`, `.tasks[0].model_recommendation == "cheap"`, `.tasks[0].dependencies == []`, `.tasks[1].dependencies == [1]`; (b) `--plan plan-clean.md` extracts `.test_command` as the bash block content; (c) `--plan plan-clean.md --task-number 2` returns just task 2; (d) `--plan plan-missing-verify.md` exits non-zero with stderr JSON containing `.errors[*]` of kind `missing_verify_recipe` referencing task 1 and the criterion text; (e) `--plan plan-duplicate-task.md` exits non-zero with stderr JSON containing `.errors[*]` of kind `duplicate_task_number` referencing the duplicated number; (f) `--plan plan-missing-files.md` exits non-zero with stderr JSON containing `.errors[*]` of kind `missing_files_block` referencing task 1; (g) `--plan plan-missing-model.md` exits non-zero with stderr JSON containing `.errors[*]` of kind `missing_model_recommendation` referencing task 1 (absent-line sub-case); (h) `--plan plan-invalid-model.md` exits non-zero with stderr JSON containing `.errors[*]` of kind `missing_model_recommendation` referencing task 1 (invalid-value sub-case — the test asserts `.errors[*].detail` mentions the offending token); (i) `--plan plan-out-of-order.md` exits non-zero with stderr JSON containing `.errors[*]` of kind `out_of_order_task_number` referencing the gap (e.g. that Task 2 is missing or that Task 3 followed Task 1). Run and confirm RED.
- [ ] **Step 3: Implement the script** — Write `extract-plan-tasks.py`. Use `argparse` for `--plan`, optional `--task-number`. Read plan; parse with a stateful line scanner: find `## Goal` (extract first paragraph as `.goal`); find `## Test Command` and capture the next ```bash``` block contents into `.test_command` (or null); find each `### Task N:` heading (capture `N` as integer, capture the title as the rest of the line stripped of the `### Task N:` prefix). For each task, capture `task_spec` as the raw markdown block from the `### Task N:` line through the line immediately before the next `### Task ` heading or the next `## ` heading (whichever comes first), preserving original line breaks. After collecting all tasks, validate the task-number sequence: numbers must be strictly ascending starting from 1 with no gaps; otherwise append an `out_of_order_task_number` error referencing the first violating N. Within each task block, require a `**Files:**` block before `**Steps:**`/`**Acceptance criteria:**` — if absent, append a `missing_files_block` error for that task. Capture `**Files:**` items (categorize by leading word `Create:`/`Modify:`/`Test:`), capture `**Steps:**` (each `- [ ] **Step K:** ...` bullet), capture `**Acceptance criteria:**` items (each top-level bullet text followed by a child line beginning with `Verify:` — append a `missing_verify_recipe` error if the `Verify:` continuation is absent), capture `**Model recommendation:**` value — if the line is absent, or its value is not exactly one of `cheap`, `standard`, or `capable`, append a `missing_model_recommendation` error (the `detail` field should include the observed value when invalid, or `"line absent"` when missing). Detect duplicate task numbers across all `### Task N:` headers and append a `duplicate_task_number` error per duplicate N. Find `## Dependencies` and parse each `- Task N depends on: Task X, Task Y` line into a dependency list. After scanning, emit JSON. If `errors` is non-empty, emit them on stderr and exit non-zero. If `--task-number` was passed, return only that task in `.tasks` (still as a single-element array). Add `--help` enumerating the five `kind` values.
- [ ] **Step 4: Verify GREEN** — Run `python3 -m unittest discover -s agent/skills/execute-plan/scripts/tests -p "test_extract_plan_tasks.py" -v`.

**Acceptance criteria:**

- The script exists with `--help` listing the JSON output shape and protocol-error `kind` values.
  Verify: `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --help` exits 0 and stdout mentions `tasks`, `criteria`, `dependencies`, and at least one of `missing_verify_recipe` or `duplicate_task_number`.
- Clean plan extraction yields the documented JSON shape with criteria + Verify pairs.
  Verify: `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-clean.md` exits 0; stdout parsed as JSON has `len(.tasks) == 2`, `.tasks[0].criteria[0].verify` is a non-empty string, and `.test_command` is a non-empty bash command string.
- Each task's raw markdown block is exposed as `task_spec` so it can be passed verbatim to `assemble-verifier-prompt.py` as `{TASK_SPEC}`.
  Verify: `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-clean.md` exits 0 and stdout parsed as JSON has `.tasks[0].task_spec` starting with `### Task 1:` and `.tasks[1].task_spec` starting with `### Task 2:`, with neither value containing a subsequent `### Task ` or `## ` heading line.
- Missing `Verify:` recipes are reported as protocol-shape errors and the helper exits non-zero.
  Verify: `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-verify.md` exits non-zero and stderr JSON has at least one `.errors[*]` with `.kind == "missing_verify_recipe"`.
- Duplicate task numbers are reported as protocol-shape errors and the helper exits non-zero.
  Verify: `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-duplicate-task.md` exits non-zero and stderr JSON has at least one `.errors[*]` with `.kind == "duplicate_task_number"`.
- Missing `**Files:**` blocks are reported as protocol-shape errors and the helper exits non-zero.
  Verify: `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-files.md` exits non-zero and stderr JSON has at least one `.errors[*]` with `.kind == "missing_files_block"` referencing task 1.
- Missing or invalid `**Model recommendation:**` values are reported as protocol-shape errors and the helper exits non-zero (both sub-cases).
  Verify: `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-missing-model.md` exits non-zero with at least one `.errors[*].kind == "missing_model_recommendation"`, AND `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-invalid-model.md` exits non-zero with at least one `.errors[*].kind == "missing_model_recommendation"`.
- Out-of-order or skipped task numbers are reported as protocol-shape errors and the helper exits non-zero.
  Verify: `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-out-of-order.md` exits non-zero and stderr JSON has at least one `.errors[*]` with `.kind == "out_of_order_task_number"`.
- The `--task-number N` filter narrows output to a single task.
  Verify: `python3 agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan agent/skills/execute-plan/scripts/tests/fixtures/plan-clean.md --task-number 2` exits 0 with `len(.tasks) == 1` and `.tasks[0].number == 2`.

**Model recommendation:** standard

### Task 6: Implement `collect-diff-context` helper script and tests

**Files:**
- Create: `agent/skills/execute-plan/scripts/collect-diff-context.py`
- Create: `agent/skills/execute-plan/scripts/tests/test_collect_diff_context.py`

**Steps:**
- [ ] **Step 1: Set up test infrastructure** — In `test_collect_diff_context.py`, create a helper function `make_temp_repo()` that uses `tempfile.TemporaryDirectory` + `subprocess.run(["git", "init", ...])` + `subprocess.run(["git", "config", "user.email", "test@example.com"])` + `subprocess.run(["git", "config", "user.name", "test"])` and returns the temp dir path. Each test creates fresh files inside the temp repo, makes commits, modifies files, etc.
- [ ] **Step 2: Write the failing tests** — Tests covering: (a) tracked file modified after baseline commit → `git diff HEAD -- <file>` output appears in stdout; (b) untracked file added → `git diff --no-index /dev/null -- <file>` output appears (file content shows as added in unified diff format); (c) mix of tracked + untracked produces both segments; (d) >500 lines triggers truncation: stdout starts with first 300 lines, then the literal marker line `[diff truncated — <N> lines, <B> bytes total; verifier should note this and fall back to reading the named files for file-inspection criteria whose relevant code may lie in the truncated window]` (substituting actual N/B), then last 100 lines; (e) >40KB triggers truncation by byte size on the same marker rule; (f) `files_observed` summary on stderr lists every input file regardless of git status; (g) running outside a git repo → structured error on stderr, exit non-zero; (h) **clean tracked file regression** — file is committed with no working-tree modifications (so `git status --porcelain -- <file>` emits nothing) → tracked branch emits an empty diff, NOT a `--no-index` added-content diff; assert the helper output for that file contains no `+++ b/<file>` line and no `+` content lines (regression-protecting against routing no-porcelain-entry tracked files through the untracked branch). Run and confirm RED.
- [ ] **Step 3: Implement the script** — Write `collect-diff-context.py`. Use `argparse` for `--working-dir`, `--files` (comma-separated), `--files-json` (alternative), `--limit-lines` (default 500), `--limit-bytes` (default 40960), `--output` (default `-`). For each file, run `git status --porcelain -- <file>` from `--working-dir`. Treat ONLY entries beginning with `??` as untracked (run `git diff --no-index /dev/null -- <abs path>`); every other case takes the tracked branch (run `git diff HEAD -- <file>`), including the no-porcelain-entry case (clean tracked file with no modifications, which emits an empty diff). Before taking the tracked branch in the no-entry case, run `git ls-files --error-unmatch -- <file>` from `--working-dir` to confirm the file is actually tracked; on non-zero exit (the file is neither tracked nor `??`-listed — e.g., the path was passed by mistake), surface a structured error to stderr and exit non-zero. Do NOT route no-entry files into the untracked branch — that would emit a full added-content diff for clean tracked files and mislead the verifier. Concatenate outputs in input-file order. Compute total line count and byte count; if either exceeds limits, truncate to first 300 lines + marker + last 100 lines (use the byte-equal marker text from Step 2 above; substitute pre-truncation N and B). Write the result to `--output`. Always emit a single-line JSON summary to stderr: `{"truncated": <bool>, "total_lines": <pre-trunc N>, "total_bytes": <pre-trunc B>, "files_observed": [...]}`. On any subprocess failure return a structured error to stderr and exit non-zero. Add `--help`.
- [ ] **Step 4: Verify GREEN** — Run `python3 -m unittest discover -s agent/skills/execute-plan/scripts/tests -p "test_collect_diff_context.py" -v`.

**Acceptance criteria:**

- The script exists with `--help` documenting the truncation marker text byte-equal.
  Verify: `python3 agent/skills/execute-plan/scripts/collect-diff-context.py --help` exits 0 and stdout contains the substring `[diff truncated — `.
- Tracked-file modifications appear via `git diff HEAD`.
  Verify: `python3 -m unittest discover -s agent/skills/execute-plan/scripts/tests -p "test_collect_diff_context.py" -v` passes the test method `test_tracked_file_modified`.
- Untracked files appear via `git diff --no-index /dev/null`.
  Verify: the same unittest run passes the test method `test_untracked_file_added`.
- Truncation with the byte-equal marker line fires above 500 lines OR 40KB.
  Verify: the same unittest run passes the test methods `test_truncation_by_lines` and `test_truncation_by_bytes`, both of which assert that the marker substring `[diff truncated — ` appears in stdout exactly once.
- The stderr summary JSON lists every input file under `files_observed`.
  Verify: the same unittest run passes the test method `test_files_observed_summary`, which asserts `set(stderr_json["files_observed"]) == set(input_files)`.
- Clean tracked files (no porcelain entry) take the tracked branch and emit an empty diff, not a `--no-index` added-content diff.
  Verify: the same unittest run passes the test method `test_clean_tracked_file_takes_tracked_branch`, which asserts the helper output contains no `+++ b/<file>` line and no `+` content lines for a clean committed file.

**Model recommendation:** standard

### Task 7: Implement `assemble-verifier-prompt` helper script and tests

**Files:**
- Create: `agent/skills/execute-plan/scripts/assemble-verifier-prompt.py`
- Create: `agent/skills/execute-plan/scripts/tests/test_assemble_verifier_prompt.py`

**Steps:**
- [ ] **Step 1: Write the failing tests** — In `test_assemble_verifier_prompt.py`, tests covering: (a) full success: provide `--task-spec` (sample text), `--criteria-json` (a 2-element JSON array `[{"text": "Crit 1", "verify": "ls -la"}, {"text": "Crit 2", "verify": "grep ..."}]`), `--phase1-recipes-json` (a 1-element JSON array `[{"criterion_n": 1, "recipe": "ls -la"}]` since only criterion 1 is command-style here), `--modified-files` (file with two paths, one duplicated), `--diff-context` (sample diff text), `--working-dir /tmp/work`, against the real repo template `agent/skills/execute-plan/verify-task-prompt.md` → exit 0; output contains `## Task Spec` block with the supplied text, `## Acceptance Criteria` block with two numbered entries each followed by `Verify: <recipe>`, `## Phase 1 Verification Recipes` block with `[Recipe for Criterion 1] ls -la`, `## Verifier-Visible Files` block with the deduplicated list, `## Diff Context` block with the supplied diff, and `Operate from: /tmp/work`; (b) when `--phase1-recipes-json` is `[]`, the `{PHASE_1_RECIPES}` placeholder is replaced with empty content (no recipe lines); (c) when `--modified-files` has duplicates, the output deduplicates them; (d) failure when `--criteria-json` does not parse as JSON; (e) failure when the template (after fill) still has unreplaced placeholders matching `\{[A-Z_]+\}`. Run and confirm RED.
- [ ] **Step 2: Implement the script** — Write `assemble-verifier-prompt.py`. Use `argparse` for `--template` (default `agent/skills/execute-plan/verify-task-prompt.md`), `--task-spec`, `--criteria-json`, `--phase1-recipes-json`, `--modified-files`, `--diff-context`, `--working-dir`, `--output`. All `*-json` and text inputs accept either a path or `-` for stdin. Read each input. Format `{ACCEPTANCE_CRITERIA_WITH_VERIFY}` as numbered list: each entry on a new line as `N. <criterion text>\n   Verify: <verify text>`. Format `{PHASE_1_RECIPES}` as one line per JSON entry: `[Recipe for Criterion <criterion_n>] <recipe>`. Format `{MODIFIED_FILES}` as a deduplicated newline-separated list (preserve input order; first occurrence wins). Build the placeholder JSON map with all six keys (`TASK_SPEC`, `ACCEPTANCE_CRITERIA_WITH_VERIFY`, `PHASE_1_RECIPES`, `MODIFIED_FILES`, `DIFF_CONTEXT`, `WORKING_DIR`). Substitute into the template with the same algorithm as `fill-template.py` (literal-substring replace), then check for any remaining `\{[A-Z_][A-Z0-9_]*\}` tokens; on any remaining, fail closed with structured error. Write to `--output`. Add `--help`.
- [ ] **Step 3: Verify GREEN** — Run `python3 -m unittest discover -s agent/skills/execute-plan/scripts/tests -p "test_assemble_verifier_prompt.py" -v`.

**Acceptance criteria:**

- The script exists with `--help` listing every required input.
  Verify: `python3 agent/skills/execute-plan/scripts/assemble-verifier-prompt.py --help` exits 0 and stdout contains all six placeholder names: `TASK_SPEC`, `ACCEPTANCE_CRITERIA_WITH_VERIFY`, `PHASE_1_RECIPES`, `MODIFIED_FILES`, `DIFF_CONTEXT`, `WORKING_DIR`.
- Full success against the real `verify-task-prompt.md` template produces a fully-substituted prompt.
  Verify: `python3 -m unittest discover -s agent/skills/execute-plan/scripts/tests -p "test_assemble_verifier_prompt.py" -v` passes the test method `test_full_success_against_real_template`, which asserts the output contains the six section headers and no remaining `{PLACEHOLDER}` tokens.
- Empty `--phase1-recipes-json` substitutes the placeholder with empty content.
  Verify: the same unittest run passes the test method `test_empty_phase1_recipes`.
- Duplicate paths in `--modified-files` are deduplicated.
  Verify: the same unittest run passes the test method `test_modified_files_deduplicated`.
- Failure shape: malformed `--criteria-json` exits non-zero with structured error.
  Verify: the same unittest run passes the test method `test_malformed_criteria_json_fails_closed`.

**Model recommendation:** standard

### Task 8: Implement `parse-verifier-report` helper script and tests

**Files:**
- Create: `agent/skills/execute-plan/scripts/parse-verifier-report.py`
- Create: `agent/skills/execute-plan/scripts/tests/test_parse_verifier_report.py`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-pass.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-fail.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-malformed.md`
- Create: `agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-evidence-malformed.md`

**Steps:**
- [ ] **Step 1: Write the fixtures** — `verifier-report-pass.md`: full PASS report with `## Phase 1 Evidence`, `## Per-Criterion Verdicts` with two `[Criterion N] PASS` headers, `## Overall Verdict` with `VERDICT: PASS`. `verifier-report-fail.md`: same shape with `[Criterion 2] FAIL` and overall `VERDICT: FAIL`. `verifier-report-malformed.md`: includes `[Criterion 1] verdict: PASS` (forbidden `verdict:` prefix) — protocol error. `verifier-report-evidence-malformed.md`: a `[Evidence for Criterion 1]` block missing the `stderr:` field.
- [ ] **Step 2: Write the failing tests** — Tests covering: (a) PASS report with K=2 → exit 0, stdout JSON `.verdict == "PASS"`, `len(.per_criterion) == 2`; (b) FAIL report → exit non-zero, JSON `.verdict == "FAIL"`, `.per_criterion[1].verdict == "FAIL"`; (c) malformed header → exit non-zero, `.verdict == "FAIL"`, `.protocol_errors` contains a label about the malformed header; (d) lowercase `pass` token → protocol error; (e) duplicate `[Criterion 1]` → `.protocol_errors` contains a label about duplicates; (f) missing criterion (K=3, only 1 and 3 present) → `.protocol_errors` mentions criterion 2 missing; (g) out-of-range `[Criterion 4]` when K=3 → `.protocol_errors` mentions out-of-range; (h) phase-1 evidence block missing `stderr:` field → `.protocol_errors` contains the byte-equal label `verifier phase-1 evidence block malformed at criterion 1: stderr field missing` (or the script's chosen specific check name); (i) command-style criterion has no evidence block → `.protocol_errors` contains `verifier missing evidence block for command-style criterion N`; (j) evidence `command:` not byte-equal to any supplied recipe → `.protocol_errors` contains `verifier ran command not matching any phase-1 recipe: <command>`. Run and confirm RED.
- [ ] **Step 3: Implement the script** — Write `parse-verifier-report.py`. Use `argparse` for `--report`, `--criteria-count`, `--phase1-recipes-json` (optional). Parse three sections: `## Phase 1 Evidence` (zero or more `[Evidence for Criterion N]` blocks, each with the four labelled fields in order — emit a protocol error if any field missing or out-of-order); `## Per-Criterion Verdicts` (`[Criterion N] PASS|FAIL` headers, case-sensitive — emit protocol error on `verdict:` prefix or lowercase verdict); `## Overall Verdict` (`VERDICT: PASS|FAIL` line). Validate full coverage `S == {1..K}` (no duplicates, no missing, no out-of-range). When `--phase1-recipes-json` is provided, for each criterion N in that map: ensure the verifier output has an `[Evidence for Criterion N]` block (else emit `verifier missing evidence block for command-style criterion N`); compare its `command:` line byte-equal to the supplied recipe (else emit `verifier ran command not matching any phase-1 recipe: <command>`). Emit JSON to stdout with `.verdict`, `.per_criterion`, `.phase1_evidence`, `.protocol_errors`. When `protocol_errors` is non-empty, force `verdict: FAIL` and exit non-zero. Add `--help`.
- [ ] **Step 4: Verify GREEN** — Run `python3 -m unittest discover -s agent/skills/execute-plan/scripts/tests -p "test_parse_verifier_report.py" -v`.

**Acceptance criteria:**

- The script exists with `--help` listing the documented protocol-error labels.
  Verify: `python3 agent/skills/execute-plan/scripts/parse-verifier-report.py --help` exits 0 and stdout contains the substring `verifier phase-1 evidence block malformed`, `verifier missing evidence block for command-style criterion`, and `verifier ran command not matching any phase-1 recipe`.
- Clean PASS report parses with `verdict: PASS` and full per-criterion coverage.
  Verify: `python3 agent/skills/execute-plan/scripts/parse-verifier-report.py --report agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-pass.md --criteria-count 2` exits 0 and stdout JSON has `.verdict == "PASS"` with `len(.per_criterion) == 2`.
- FAIL report routes verdict FAIL.
  Verify: `python3 agent/skills/execute-plan/scripts/parse-verifier-report.py --report agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-fail.md --criteria-count 2` exits non-zero and stdout JSON has `.verdict == "FAIL"`.
- Malformed criterion header is treated as a protocol error and routes verdict FAIL.
  Verify: `python3 agent/skills/execute-plan/scripts/parse-verifier-report.py --report agent/skills/execute-plan/scripts/tests/fixtures/verifier-report-malformed.md --criteria-count 1` exits non-zero, JSON `.verdict == "FAIL"`, and `.protocol_errors` is non-empty.
- All ten protocol-error tests pass under `unittest`.
  Verify: `python3 -m unittest discover -s agent/skills/execute-plan/scripts/tests -p "test_parse_verifier_report.py" -v` reports all tests passing with no failures.

**Model recommendation:** standard

### Task 9: Wire helper test runner into `agent/package.json`, write helper-directory READMEs

**Files:**
- Modify: `agent/package.json`
- Create: `agent/skills/_shared/scripts/README.md`
- Create: `agent/skills/execute-plan/scripts/README.md`

**Steps:**
- [ ] **Step 1: Add the `test:helpers` npm script** — Edit `agent/package.json`'s `"scripts"` block to add a new key `"test:helpers": "python3 -m unittest discover -s skills/_shared/scripts/tests -p \"test_*.py\" && python3 -m unittest discover -s skills/execute-plan/scripts/tests -p \"test_*.py\""`. The two `discover` invocations chained with `&&` ensure both helper-test directories run sequentially and any failure short-circuits the chain. Paths are relative to `agent/` (the `package.json`'s directory), so the runner is invoked as `cd agent && npm run test:helpers`.
- [ ] **Step 2: Extend the existing `check` script to chain `test:helpers`** — Change `"check": "npm run build && npm test"` to `"check": "npm run build && npm test && npm run test:helpers"`. This makes the integration-test command in this plan (`cd agent && npm run check`) cover both extension tests and helper tests.
- [ ] **Step 3: Write `agent/skills/_shared/scripts/README.md`** — One-page index. Sections: `# Shared workflow helpers` (H1); `## Why this exists` (one short paragraph describing the directory's role as the home of mechanical helpers shared across multiple skills/coordinator prompts); `## Helpers` with one bullet per script — `resolve-model-dispatch.py`, `parse-artifact-handoff.py`, `validate-review-provenance.py`, `fill-template.py` — each with a one-line purpose statement and a one-line example invocation; `## Running tests` documenting both `python3 -m unittest discover -s agent/skills/_shared/scripts/tests -p "test_*.py"` (direct) and `cd agent && npm run test:helpers` (integrated). No YAML frontmatter (matches sibling shared-doc convention in `agent/skills/_shared/`).
- [ ] **Step 4: Write `agent/skills/execute-plan/scripts/README.md`** — Same structure: `# Execute-plan helpers`, `## Why this exists` (helpers specific to the plan-execution hotspot — plan parsing, diff assembly, verifier prompt assembly, verifier report parsing), `## Helpers` with one bullet per script — `extract-plan-tasks.py`, `collect-diff-context.py`, `assemble-verifier-prompt.py`, `parse-verifier-report.py` — each with a one-line purpose and example, `## Running tests` matching the shared README's text. No frontmatter.
- [ ] **Step 5: Manually verify the chained test run** — Run `cd agent && npm run test:helpers` from the repo root and confirm exit 0 (all 8 helpers' tests pass).

**Acceptance criteria:**

- `agent/package.json` defines a `test:helpers` script invoking `python3 -m unittest discover` against both helper-test directories.
  Verify: `python3 -c "import json; print(json.load(open('agent/package.json'))['scripts']['test:helpers'])"` exits 0 and prints a string containing both substrings `skills/_shared/scripts/tests` and `skills/execute-plan/scripts/tests`.
- The existing `check` script is extended to chain `test:helpers` after `npm test`.
  Verify: `python3 -c "import json; print(json.load(open('agent/package.json'))['scripts']['check'])"` prints exactly the string `npm run build && npm test && npm run test:helpers`.
- `agent/skills/_shared/scripts/README.md` exists with the four shared-helper bullets and the test-run command.
  Verify: `grep -c "resolve-model-dispatch\.py\|parse-artifact-handoff\.py\|validate-review-provenance\.py\|fill-template\.py" agent/skills/_shared/scripts/README.md` returns at least `4`, and `grep -c "npm run test:helpers" agent/skills/_shared/scripts/README.md` returns at least `1`.
- `agent/skills/execute-plan/scripts/README.md` exists with the four execute-plan-helper bullets and the test-run command.
  Verify: `grep -c "extract-plan-tasks\.py\|collect-diff-context\.py\|assemble-verifier-prompt\.py\|parse-verifier-report\.py" agent/skills/execute-plan/scripts/README.md` returns at least `4`, and `grep -c "npm run test:helpers" agent/skills/execute-plan/scripts/README.md` returns at least `1`.
- The chained helper test run passes.
  Verify: `cd agent && npm run test:helpers` exits 0.

**Model recommendation:** cheap

### Task 10: Adopt `resolve-model-dispatch` + `parse-artifact-handoff` in `agent/skills/scout/SKILL.md`

**Files:**
- Modify: `agent/skills/scout/SKILL.md`

**Steps:**
- [ ] **Step 1: Capture the current line count** — Record the present line count (170 lines) by running `wc -l agent/skills/scout/SKILL.md`. The acceptance gate is that the post-edit file is ≤ 170 lines.
- [ ] **Step 2: Replace Step 2's resolution prose with a one-line helper invocation** — In Step 2 ("Resolve model and CLI"), the current prose lists the four canonical templates and the three primitive operations. Replace the entire `## Step 2` body (after the heading) with: `Invoke \`agent/skills/_shared/scripts/resolve-model-dispatch.py --tier <tier> --agent scout\` where \`<tier>\` is the tier selected in Step 1 (default \`standard\`). On non-zero exit, surface the helper's stderr (a byte-equal canonical Template (1)–(4) message per \`agent/skills/_shared/model-tier-resolution.md\`) and stop without dispatching.` (one paragraph).
- [ ] **Step 3: Replace Step 6's `BRIEF_WRITTEN:` cases (b)–(c) with a one-line helper invocation** — In Step 6 ("Validate completion"), case (b) currently describes anchored-line extraction and path-equality, and case (c) describes existence-and-non-empty checks. Collapse cases (b) and (c) into a single bullet: `(b) Marker + path-equality + existence checks: Invoke \`agent/skills/_shared/scripts/parse-artifact-handoff.py --marker BRIEF_WRITTEN --final-message <path-to-finalMessage> --expected-path <{OUTPUT_PATH}> --check-existence --check-non-empty\`. On non-zero exit, surface the helper's stderr (a structured JSON failure with one of \`missing BRIEF_WRITTEN marker\`, \`path mismatch: expected <X> got <Y>\`, or \`missing or empty at <path>\`) verbatim; include \`transcriptPath\` when available; and stop. Do not retry.` Case (a) (`exitCode != 0`) is preserved verbatim — it's a dispatch-result check, not a marker check.
- [ ] **Step 4: Verify file size constraint** — Run `wc -l agent/skills/scout/SKILL.md` and confirm the post-edit count is ≤ 170 lines. If the result exceeds 170, remove additional redundant prose (e.g., the four-template enumeration in Step 2) until the constraint holds.
- [ ] **Step 5: Verify that adopted invocations point at the correct helpers** — `grep -n "resolve-model-dispatch.py\|parse-artifact-handoff.py" agent/skills/scout/SKILL.md` returns at least one match for each helper.

**Acceptance criteria:**

- File line count does not exceed the pre-edit baseline of 170 lines.
  Verify: `awk 'END {exit ($1 > 170)}' <(wc -l agent/skills/scout/SKILL.md)` exits 0; equivalently, `wc -l agent/skills/scout/SKILL.md` outputs `<= 170`.
- Step 2 invokes `resolve-model-dispatch.py` and points at the canonical failure-template doc.
  Verify: `grep -n "resolve-model-dispatch.py" agent/skills/scout/SKILL.md` returns at least one match inside the `## Step 2` block (between `## Step 2` and `## Step 3` headings); and `grep -n "model-tier-resolution.md" agent/skills/scout/SKILL.md` still returns at least one match (the canonical-doc pointer is preserved).
- Step 6 invokes `parse-artifact-handoff.py` for the marker + path + existence checks.
  Verify: `grep -n "parse-artifact-handoff.py" agent/skills/scout/SKILL.md` returns at least one match inside the `## Step 6` block, and the helper invocation includes the `--marker BRIEF_WRITTEN` argument.
- The four canonical Template (1)–(4) descriptions are no longer enumerated inline.
  Verify: `grep -c "Template (1)\|Template (2)\|Template (3)\|Template (4)" agent/skills/scout/SKILL.md` returns 0 inside the `## Step 2` block (use `awk '/^## Step 2/{flag=1} /^## Step 3/{flag=0} flag' agent/skills/scout/SKILL.md | grep -c "Template ([1234])"` to scope the count).
- Pre-existing-brief check (Step 3) and commit gate (Step 7) prose are preserved unchanged in shape — they were not adopted.
  Verify: `grep -c "(o)verwrite or (k)eep" agent/skills/scout/SKILL.md` returns at least 1 (Step 3 pre-existing prompts), and `grep -c "(c) Commit" agent/skills/scout/SKILL.md` returns at least 1 (Step 7 commit gate menu) — both preserved.

**Model recommendation:** standard

### Task 11: Adopt `resolve-model-dispatch` + `parse-artifact-handoff` in `agent/skills/define-spec/SKILL.md`

**Files:**
- Modify: `agent/skills/define-spec/SKILL.md`

**Steps:**
- [ ] **Step 1: Capture pre-edit line count** — Run `wc -l agent/skills/define-spec/SKILL.md`; baseline is 201 lines.
- [ ] **Step 2: Slim Step 3a's resolution prose** — In Step 3a ("Mux branch — dispatch `spec-designer`"), replace the four-template enumeration paragraph with a one-line invocation: `Invoke \`agent/skills/_shared/scripts/resolve-model-dispatch.py --tier capable --agent spec-designer\`. On non-zero exit, surface the helper's stderr (byte-equal canonical Template (1)–(4) per \`agent/skills/_shared/model-tier-resolution.md\`) and stop without dispatching.` Preserve the dispatch invocation block (the `subagent_run_serial { tasks: [...] }` example) and the surrounding notes verbatim.
- [ ] **Step 3: Slim Step 4 cases (1)/(3)/(success) marker + existence checks** — In Step 4 ("Validate `SPEC_WRITTEN:` (mux branch only)"), cases (1) and (3) describe the `SPEC_WRITTEN:` line check and existence check respectively. Replace those two cases' shared marker/existence logic with `Invoke \`agent/skills/_shared/scripts/parse-artifact-handoff.py --marker SPEC_WRITTEN --final-message <path> --check-existence\`. On non-zero exit with reason \`missing SPEC_WRITTEN marker\`, route to case (2). On non-zero exit with reason \`missing or empty at <path>\`, surface the canonical case (3) message verbatim and stop.` Case (1) (`exitCode != 0`) is preserved verbatim — it's a dispatch-result check. **Preserve case (2) (transcript-backed recovery) verbatim** — recovery is skill-specific and remains in prose; only the marker-extraction primitive is delegated.
- [ ] **Step 4: Verify size constraint** — `wc -l agent/skills/define-spec/SKILL.md` ≤ 201.
- [ ] **Step 5: Spot-check transcript-backed recovery preservation** — `grep -c "Transcript-backed recovery" agent/skills/define-spec/SKILL.md` returns at least 1.

**Acceptance criteria:**

- File line count does not exceed the pre-edit baseline of 201 lines.
  Verify: `wc -l agent/skills/define-spec/SKILL.md` outputs a count ≤ 201.
- Step 3a invokes `resolve-model-dispatch.py` for `--tier capable --agent spec-designer`.
  Verify: `awk '/^### 3a/,/^### 3b/' agent/skills/define-spec/SKILL.md | grep -c "resolve-model-dispatch.py"` returns at least 1.
- Step 4's marker + existence handling delegates to `parse-artifact-handoff.py`.
  Verify: `awk '/^## Step 4/,/^## Step 5/' agent/skills/define-spec/SKILL.md | grep -c "parse-artifact-handoff.py"` returns at least 1.
- Transcript-backed recovery (case (2)) is preserved verbatim in skill prose.
  Verify: `grep -c "Transcript-backed recovery" agent/skills/define-spec/SKILL.md` returns at least 1; `grep -c "successful tool-result records only" agent/skills/define-spec/SKILL.md` returns at least 1 (the load-bearing recovery sub-bullet language is preserved).
- The four canonical Template (1)–(4) names are not enumerated inline in Step 3a.
  Verify: `awk '/^### 3a/,/^### 3b/' agent/skills/define-spec/SKILL.md | grep -c "Template ([1234])"` returns 0.

**Model recommendation:** standard

### Task 12: Adopt `resolve-model-dispatch` in `agent/skills/generate-plan/SKILL.md`

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Capture pre-edit line count** — `wc -l agent/skills/generate-plan/SKILL.md` baseline is 202.
- [ ] **Step 2: Slim Step 2's resolution prose** — In Step 2 ("Resolve model tiers"), replace the `cat ~/.pi/agent/model-tiers.json | python3 ...` snippet, the model-assignments table, and the "Dispatch resolution" paragraph collectively with: a brief one-paragraph statement of the tier-role assignment (`<agent> = planner`, `<tier> = capable`) followed by `Invoke \`agent/skills/_shared/scripts/resolve-model-dispatch.py --tier capable --agent planner\`. On non-zero exit, surface the helper's stderr (byte-equal canonical Template (1)–(4)) and stop.` Keep the model-assignment table only if it provides reader context that the helper output does not capture; otherwise drop it.
- [ ] **Step 3: Verify size constraint** — `wc -l agent/skills/generate-plan/SKILL.md` ≤ 202.
- [ ] **Step 4: Spot-check the Step 1b workflow-artifact-paths classifier is not modified** — `grep -c "workflow-artifact-paths.md" agent/skills/generate-plan/SKILL.md` returns at least 1 (load-bearing reference preserved).

**Acceptance criteria:**

- File line count does not exceed the pre-edit baseline of 202 lines.
  Verify: `wc -l agent/skills/generate-plan/SKILL.md` outputs a count ≤ 202.
- Step 2 invokes `resolve-model-dispatch.py` for the planner dispatch.
  Verify: `awk '/^## Step 2/,/^## Step 3/' agent/skills/generate-plan/SKILL.md | grep -c "resolve-model-dispatch.py"` returns at least 1, and the matched line includes both `--tier capable` and `--agent planner`.
- The `cat ~/.pi/agent/model-tiers.json | python3 ...` snippet is removed from Step 2.
  Verify: `awk '/^## Step 2/,/^## Step 3/' agent/skills/generate-plan/SKILL.md | grep -c "cat ~/.pi/agent/model-tiers.json"` returns 0.
- The Step 1b workflow-artifact-paths reference is preserved.
  Verify: `grep -c "agent/skills/_shared/workflow-artifact-paths.md" agent/skills/generate-plan/SKILL.md` returns at least 1.

**Model recommendation:** standard

### Task 13: Adopt `resolve-model-dispatch` in `agent/skills/requesting-code-review/SKILL.md`

**Files:**
- Modify: `agent/skills/requesting-code-review/SKILL.md`

**Steps:**
- [ ] **Step 1: Capture pre-edit line count** — Baseline is 114.
- [ ] **Step 2: Slim Step 2b's resolution prose** — In Step 2b ("Resolve model and dispatch"), replace the four-template paragraph with: `Invoke \`agent/skills/_shared/scripts/resolve-model-dispatch.py --tier capable --agent code-reviewer\`. On non-zero exit, surface the helper's stderr (byte-equal canonical Template (1)–(4)) and stop.` Preserve the dispatch block (`subagent_run_serial { tasks: [...] }` example).
- [ ] **Step 3: Verify size constraint** — `wc -l agent/skills/requesting-code-review/SKILL.md` ≤ 114.

**Acceptance criteria:**

- File line count does not exceed the pre-edit baseline of 114 lines.
  Verify: `wc -l agent/skills/requesting-code-review/SKILL.md` outputs a count ≤ 114.
- Step 2b invokes `resolve-model-dispatch.py`.
  Verify: `awk '/^### 2b/,/^### 3/' agent/skills/requesting-code-review/SKILL.md | grep -c "resolve-model-dispatch.py"` returns at least 1.
- The four canonical Template (1)–(4) descriptions are no longer enumerated inline.
  Verify: `awk '/^### 2b/,/^### 3/' agent/skills/requesting-code-review/SKILL.md | grep -c "Template ([1234])"` returns 0.

**Model recommendation:** cheap

### Task 14: Adopt `validate-review-provenance` + `parse-artifact-handoff` in `agent/skills/refine-plan/SKILL.md`

**Files:**
- Modify: `agent/skills/refine-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Capture pre-edit line count** — Baseline is 255.
- [ ] **Step 2: Slim Step 5's dispatch resolution prose** — In Step 5 ("Read model matrix"), the four-tier coordinator chain is delegated to `coordinator-dispatch.md` (preserve that); also replace any inline four-template enumeration with a one-line "see `agent/skills/_shared/model-tier-resolution.md`" pointer.
- [ ] **Step 3: Slim Step 9.5's six-numbered-checks block** — Replace the entire numbered list (1. line regex, 2. extract, 3. inline check, 4. read model-tiers, 5. tier match, 6. cli match) with: `Invoke \`agent/skills/_shared/scripts/validate-review-provenance.py --review-file <path> --allowed-tiers crossProvider.capable,capable\` against each review file path returned in the \`## Review Files\` block. On non-zero exit, set \`STATUS = failed\` with reason \`review provenance validation failed at <path>: <specific check>\` (substituting the helper's stderr-JSON \`failure\` field as \`<specific check>\`) and skip to Step 11. On success for every path, proceed to Step 10.` This collapses ~10 lines into ~3 lines.
- [ ] **Step 4: Verify size constraint** — `wc -l agent/skills/refine-plan/SKILL.md` ≤ 255.
- [ ] **Step 5: Spot-check the commit gate (Step 10/10a) and budget-exhaustion menu (Step 10) are preserved** — `grep -c "AUTO_COMMIT_ON_APPROVAL" agent/skills/refine-plan/SKILL.md` returns at least 1.

**Acceptance criteria:**

- File line count does not exceed the pre-edit baseline of 255 lines.
  Verify: `wc -l agent/skills/refine-plan/SKILL.md` outputs a count ≤ 255.
- Step 9.5 invokes `validate-review-provenance.py` with `--allowed-tiers crossProvider.capable,capable`.
  Verify: `awk '/^## Step 9.5/,/^## Step 10/' agent/skills/refine-plan/SKILL.md | grep -c "validate-review-provenance.py"` returns at least 1, and the matched invocation contains the substring `crossProvider.capable,capable`.
- The original six-numbered checks (regex / extract / inline / read model-tiers / model match / cli match) are no longer enumerated inline.
  Verify: `awk '/^## Step 9.5/,/^## Step 10/' agent/skills/refine-plan/SKILL.md | grep -E "^[0-9]\.|^   [0-9]\." | wc -l` returns 0 (no numbered sub-bullets remain in Step 9.5 — the helper invocation is a single paragraph).
- Commit-gate behavior in Step 10 is preserved.
  Verify: `awk '/^## Step 10$/,/^## Step 10a/' agent/skills/refine-plan/SKILL.md | grep -c "AUTO_COMMIT_ON_APPROVAL"` returns at least 1.

**Model recommendation:** standard

### Task 15: Adopt `validate-review-provenance` in `agent/skills/refine-code/SKILL.md`

**Files:**
- Modify: `agent/skills/refine-code/SKILL.md`

**Steps:**
- [ ] **Step 1: Capture pre-edit line count** — Baseline is 129.
- [ ] **Step 2: Slim Step 6's six-numbered-checks** — Replace the numbered checks with helper invocations. Two distinct allowed-tier sets are required (success path uses `crossProvider.capable` only; budget-exhaustion path allows `crossProvider.capable,standard`). Encode this as a brief two-bullet block: `On STATUS approved or approved_with_concerns: invoke \`agent/skills/_shared/scripts/validate-review-provenance.py --review-file <path> --allowed-tiers crossProvider.capable\`. On STATUS not_approved_within_budget: invoke ... \`--allowed-tiers crossProvider.capable,standard\`. On non-zero exit, surface to the caller \`refine-code: review provenance validation failed at <path>: <specific check>\` (substituting the helper's stderr-JSON \`failure\` field). Do NOT report the stashed success outcome from Step 5 to the caller after a validation failure.`
- [ ] **Step 3: Verify size constraint** — `wc -l agent/skills/refine-code/SKILL.md` ≤ 129.
- [ ] **Step 4: Spot-check coordinator-dispatch reference is preserved** — `grep -c "coordinator-dispatch.md" agent/skills/refine-code/SKILL.md` returns at least 1.

**Acceptance criteria:**

- File line count does not exceed the pre-edit baseline of 129 lines.
  Verify: `wc -l agent/skills/refine-code/SKILL.md` outputs a count ≤ 129.
- Step 6 invokes `validate-review-provenance.py` with both tier-set flavors documented.
  Verify: `awk '/^## Step 6/,/^## Edge Cases/' agent/skills/refine-code/SKILL.md | grep -c "validate-review-provenance.py"` returns at least 2 (one for each tier-set bullet), and the resulting block contains both substrings `--allowed-tiers crossProvider.capable` (success path) and `--allowed-tiers crossProvider.capable,standard` (budget-exhaustion path).
- The original six numbered checks are no longer enumerated inline.
  Verify: `awk '/^## Step 6/,/^## Edge Cases/' agent/skills/refine-code/SKILL.md | grep -cE "^[0-9]\.|^[ ]{2,}[0-9]\."` returns 0.
- The Step 5 → Step 6 stash-then-validate ordering language is preserved.
  Verify: `grep -c "stashed" agent/skills/refine-code/SKILL.md` returns at least 1 (Step 5's stash language is load-bearing for caller-facing reporting).

**Model recommendation:** standard

### Task 16: Adopt helpers in `agent/skills/refine-plan/refine-plan-prompt.md` + add `bash` to `plan-refiner.md` tools

**Files:**
- Modify: `agent/skills/refine-plan/refine-plan-prompt.md`
- Modify: `agent/agents/plan-refiner.md`

**Steps:**
- [ ] **Step 1: Capture pre-edit line counts** — `agent/skills/refine-plan/refine-plan-prompt.md` baseline 234. `agent/agents/plan-refiner.md` baseline 48 (an unchanged-line-count edit; widening tools list is a single-line modification).
- [ ] **Step 2: Add `bash` to `plan-refiner` agent tools** — Open `agent/agents/plan-refiner.md` and modify the `tools:` line in the YAML frontmatter from `tools: read, write, edit, grep, find, ls, subagent_run_serial` to `tools: read, write, edit, grep, find, ls, bash, subagent_run_serial`. No other change. The line count remains 48.
- [ ] **Step 3: Slim Step 4's primary + fallback dispatch resolution** — In Per-Iteration Full Review Step 4, replace the four-template enumeration in `### Dispatch resolution` with a one-line pointer: `Resolve \`(model, cli)\` for each subagent dispatch via \`agent/skills/_shared/scripts/resolve-model-dispatch.py --tier <tier> --agent <agent>\`. Surface the byte-equal canonical Template (1)–(4) on non-zero exit. The primary→fallback chain (\`crossProvider.capable\` → \`capable\`) is governed by Step 4a–4c below; a strict failure on the primary dispatch path triggers the fallback retry, not a silent CLI default.` Preserve Step 4a–4c (the fallback retry steps) and the substep ordering verbatim.
- [ ] **Step 4: Slim Step 4b's "Re-fill the review template"** — Replace the manual placeholder-list re-fill prose with: `Re-fill the review template by invoking \`agent/skills/_shared/scripts/fill-template.py --template <path-to-review-plan-prompt.md> --placeholders-json <inline-JSON> --output <path> --require-all-replaced\`. The placeholder mapping is identical to Step 3's Step-3 list except \`{REVIEWER_PROVENANCE}\` is the freshly reconstructed fallback line. Surface the helper's stderr (\`unreplaced placeholders remain\` + \`unreplaced: [...]\`) on non-zero exit and emit \`STATUS: failed\` with reason \`worker dispatch failed: plan-reviewer\`.`
- [ ] **Step 5: Slim Step 5's substeps 5a–5c (marker, path, existence checks)** — Replace the three substeps with one paragraph: `Invoke \`agent/skills/_shared/scripts/parse-artifact-handoff.py --marker REVIEW_ARTIFACT --final-message <path> --expected-path <{REVIEW_OUTPUT_PATH}> --check-existence --check-non-empty\`. On non-zero exit, emit \`STATUS: failed\` with reason \`reviewer artifact handoff failed: <helper failure label>\` (substituting the helper's stderr-JSON \`failure\` field — one of \`missing REVIEW_ARTIFACT marker\`, \`path mismatch: expected <X> got <Y>\`, \`missing or empty at <path>\`).` Preserve Step 5d (the byte-equal-to-supplied-`{REVIEWER_PROVENANCE}` check) verbatim — this exact-equality pin is coordinator-state-specific and stays in prose. Step 5e (read the file as authoritative) is preserved verbatim.
- [ ] **Step 6: Slim Step 5d's defense-in-depth regex check** — In Step 5d, replace the defense-in-depth (regex + `inline` substring) sub-bullets with: `As defense-in-depth, also invoke \`agent/skills/_shared/scripts/validate-review-provenance.py --review-file <reviewer_path> --allowed-tiers <iteration's-tier-list>\`. On non-zero exit, emit \`STATUS: failed\` with reason \`reviewer artifact handoff failed: provenance malformed at <reviewer_path>: <specific check>\`. The PRIMARY check (byte-equal to supplied \`{REVIEWER_PROVENANCE}\`) is performed BEFORE the helper invocation and remains in prose above.`
- [ ] **Step 7: Verify size constraints** — `wc -l agent/skills/refine-plan/refine-plan-prompt.md` ≤ 234, and `wc -l agent/agents/plan-refiner.md` ≤ 48.
- [ ] **Step 8: Spot-check the Hard Rules / Failure Modes preservation** — `grep -c "## Failure Modes" agent/skills/refine-plan/refine-plan-prompt.md` returns at least 1 (table preserved).

**Acceptance criteria:**

- `plan-refiner.md` tools list now includes `bash`.
  Verify: `grep -E "^tools:" agent/agents/plan-refiner.md` returns a line containing `bash` (e.g. `tools: read, write, edit, grep, find, ls, bash, subagent_run_serial`).
- `plan-refiner.md` line count is unchanged at 48.
  Verify: `wc -l agent/agents/plan-refiner.md` outputs a count ≤ 48.
- `refine-plan-prompt.md` line count does not exceed the pre-edit baseline of 234.
  Verify: `wc -l agent/skills/refine-plan/refine-plan-prompt.md` outputs a count ≤ 234.
- The dispatch-resolution section delegates to `resolve-model-dispatch.py`.
  Verify: `grep -c "resolve-model-dispatch.py" agent/skills/refine-plan/refine-plan-prompt.md` returns at least 1.
- The artifact-handoff substeps 5a–5c are collapsed into a single helper invocation, and 5d's exact-equality check is preserved.
  Verify: `grep -c "parse-artifact-handoff.py" agent/skills/refine-plan/refine-plan-prompt.md` returns at least 1; `grep -c "BYTE-EQUAL to the EXACT" agent/skills/refine-plan/refine-plan-prompt.md` returns at least 1 (Step 5d's primary check is preserved verbatim).
- The defense-in-depth provenance regex/inline check is delegated to the helper.
  Verify: `grep -c "validate-review-provenance.py" agent/skills/refine-plan/refine-plan-prompt.md` returns at least 1.
- The `## Failure Modes` taxonomy is preserved.
  Verify: `grep -c "Reviewer artifact handoff" agent/skills/refine-plan/refine-plan-prompt.md` returns at least 1, and the table still names each canonical reason string template.

**Model recommendation:** standard

### Task 17: Adopt helpers in `agent/skills/refine-code/refine-code-prompt.md`

**Files:**
- Modify: `agent/skills/refine-code/refine-code-prompt.md`

**Steps:**
- [ ] **Step 1: Capture pre-edit line count** — Baseline is 256.
- [ ] **Step 2: Slim the `### Dispatch resolution` paragraph** — Replace the four-template enumeration with a one-line pointer: `Resolve \`(model, cli)\` for each subagent dispatch via \`agent/skills/_shared/scripts/resolve-model-dispatch.py --tier <tier> --agent <agent>\` (with \`<agent>\` set to \`code-reviewer\` for review dispatches and \`coder\` for the remediator). Surface the byte-equal canonical Template (1)–(4) on non-zero exit and emit \`STATUS: failed\` with the appropriate reason from \`## Failure Modes\`.`
- [ ] **Step 3: Slim Iteration 1 Step 3 substeps 3a–3c** — Replace the three artifact-handoff substeps with: `Invoke \`agent/skills/_shared/scripts/parse-artifact-handoff.py --marker REVIEW_ARTIFACT --final-message <path> --expected-path <{REVIEW_OUTPUT_PATH}> --check-existence --check-non-empty\`. On non-zero exit, emit \`STATUS: failed\` with reason \`reviewer artifact handoff failed: <helper failure label>\` and exit.` Preserve Step 3d (byte-equal to supplied `{REVIEWER_PROVENANCE}`) and 3e (read on-disk as authoritative) verbatim.
- [ ] **Step 4: Slim Step 3d's defense-in-depth regex/inline check** — Replace with: `As defense-in-depth, also invoke \`agent/skills/_shared/scripts/validate-review-provenance.py --review-file <reviewer_path> --allowed-tiers <pass-specific tier-list>\`. On non-zero exit, emit \`STATUS: failed\` with reason \`reviewer artifact handoff failed: provenance malformed at <reviewer_path>: <specific check>\`. The PRIMARY byte-equal-to-supplied-\`{REVIEWER_PROVENANCE}\` check stays in prose above.`
- [ ] **Step 5: Apply the same slim to Hybrid Re-Review (Iteration 2..N) Step 5 and Final Verification Step 1** — Both sections currently say "use the SAME substeps 3a–3e procedure". With the slimming, this reference still holds: substeps 3a–3c are now one helper line + 3d/3e remain in prose. Update the cross-references if needed (e.g. "3a-3c via the helper invocation; 3d/3e in prose") to keep them concise.
- [ ] **Step 6: Verify size constraint** — `wc -l agent/skills/refine-code/refine-code-prompt.md` ≤ 256.
- [ ] **Step 7: Spot-check `## Failure Modes` table preservation** — `grep -c "Reviewer artifact handoff" agent/skills/refine-code/refine-code-prompt.md` returns at least 1.

**Acceptance criteria:**

- File line count does not exceed the pre-edit baseline of 256 lines.
  Verify: `wc -l agent/skills/refine-code/refine-code-prompt.md` outputs a count ≤ 256.
- Dispatch resolution invokes `resolve-model-dispatch.py`.
  Verify: `grep -c "resolve-model-dispatch.py" agent/skills/refine-code/refine-code-prompt.md` returns at least 1.
- Iteration 1 Step 3 invokes `parse-artifact-handoff.py` and `validate-review-provenance.py` for the artifact handoff.
  Verify: `awk '/^### Iteration 1: Full Review/,/^### Iteration 2/' agent/skills/refine-code/refine-code-prompt.md | grep -c "parse-artifact-handoff.py"` returns at least 1; `awk '/^### Iteration 1: Full Review/,/^### Iteration 2/' agent/skills/refine-code/refine-code-prompt.md | grep -c "validate-review-provenance.py"` returns at least 1.
- Step 3d's primary byte-equal check is preserved verbatim.
  Verify: `grep -c "BYTE-EQUAL to the EXACT" agent/skills/refine-code/refine-code-prompt.md` returns at least 1.
- The `## Failure Modes` taxonomy is preserved.
  Verify: `grep -c "Reviewer artifact handoff" agent/skills/refine-code/refine-code-prompt.md` returns at least 1.

**Model recommendation:** standard

### Task 18: Adopt all four execute-plan helpers in `agent/skills/execute-plan/SKILL.md`

**Files:**
- Modify: `agent/skills/execute-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Capture pre-edit line count** — Baseline is 771.
- [ ] **Step 2: Slim Step 6's resolution prose** — In Step 6 ("Resolve model tiers"), the model-recommendation table and the canonical-procedure pointer are preserved (they're reader-facing context). Replace the `cat ~/.pi/agent/model-tiers.json | python3 ...` snippet and the four-template enumeration with: `Resolve \`(model, cli)\` per task by invoking \`agent/skills/_shared/scripts/resolve-model-dispatch.py --tier <task-tier> --agent coder\`. Surface byte-equal canonical Template (1)–(4) on non-zero exit and stop the call site.`
- [ ] **Step 3: Slim Step 7's test-runner artifact readback** — In Step 7 ("Test-runner dispatch (shared)") under "Artifact readback", replace numbered checks 1 (marker extraction), 2 (path-equality), and 3 (existence-and-non-empty) with: `Invoke \`agent/skills/_shared/scripts/parse-artifact-handoff.py --marker TEST_RESULT_ARTIFACT --final-message <path> --expected-path <{ARTIFACT_PATH}> --check-existence --check-non-empty\`. On non-zero exit, stop the call site with the helper's structured failure reason verbatim. Header-parse (check 4) remains in prose below — it is artifact-format-specific and not delegated.` Preserve check 4 (the `PHASE`/`COMMAND`/`WORKING_DIRECTORY`/...header-parse) verbatim.
- [ ] **Step 4: Slim Step 7's verifier-tier resolution** — Replace the verifier-tier four-template enumeration with: `Invoke \`agent/skills/_shared/scripts/resolve-model-dispatch.py --tier crossProvider.standard --agent test-runner\`. Surface the canonical Template (1)–(4) on non-zero exit.`
- [ ] **Step 5: Slim Step 11.2's mechanical assembly prose** — Three Step 11.2 paragraphs contain mechanical prose that helpers now own: the `{PHASE_1_RECIPES}` per-line format spec (subsumed by `assemble-verifier-prompt`'s formatting), the `{DIFF_CONTEXT}` git-diff + truncation-rule paragraph (subsumed by `collect-diff-context`), and the `{MODIFIED_FILES}` paragraph's deduplication/format detail (subsumed by `assemble-verifier-prompt`'s formatting; the union rule itself stays). Replace those three pieces with a numbered orchestration sequence: `1. Invoke \`agent/skills/execute-plan/scripts/extract-plan-tasks.py --plan <plan> --task-number <N>\` to obtain task metadata: the task block (\`{TASK_SPEC}\`), the criteria array (each with raw text and raw \`Verify:\` recipe text), the task's declared \`**Files:**\` set, and the model recommendation. 2. The orchestrator classifies each criterion's \`Verify:\` recipe as command-style or file/prose-inspection (judgment, same as today's prose) and constructs the \`--phase1-recipes-json\` array containing only the command-style entries with their criterion numbers. The classification logic is not delegated — the helper emits raw recipe text and the orchestrator filters. 3. Compute the verifier-visible file set as the union of (a)/(b)/(c) per the union rule preserved below. 4. Invoke \`agent/skills/execute-plan/scripts/collect-diff-context.py --working-dir <path> --files <union list>\` to obtain \`{DIFF_CONTEXT}\` (the helper applies the 500-line / 40 KB truncation rule with the byte-equal marker). 5. Invoke \`agent/skills/execute-plan/scripts/assemble-verifier-prompt.py --task-spec <path> --criteria-json <path> --phase1-recipes-json <path> --modified-files <path> --diff-context <path> --working-dir <path> --output <path>\` to fill \`verify-task-prompt.md\`. 6. Resolve the verifier dispatch via \`agent/skills/_shared/scripts/resolve-model-dispatch.py --tier crossProvider.standard --agent verifier\`. 7. Dispatch via \`subagent_run_parallel\` per the existing dispatch-shape line.` Preserve the placeholder list itself (the `{TASK_SPEC}` / `{ACCEPTANCE_CRITERIA_WITH_VERIFY}` / `{PHASE_1_RECIPES}` / `{MODIFIED_FILES}` / `{DIFF_CONTEXT}` / `{WORKING_DIR}` keys) — it is the contract between coordinator and helper. Preserve the union-rule prose ((a)/(b)/(c) inputs and the parallel-wave scoping rule) — the helper consumes the union but the orchestrator computes it. Preserve the sub-task carve-out paragraph verbatim — it's a workflow rule, not a mechanical step.
- [ ] **Step 6: Slim Step 11.3's verifier-output parsing** — Replace the multi-paragraph parsing rules (the per-criterion header shape rules, K-coverage check, three additional protocol errors) with: `Invoke \`agent/skills/execute-plan/scripts/parse-verifier-report.py --report <path> --criteria-count <K> --phase1-recipes-json <path>\`. The helper emits \`{verdict, per_criterion, phase1_evidence, protocol_errors}\` JSON. Route the parsed result: \`verdict: PASS\` → wave verification passes for this task. \`verdict: FAIL\` (including any non-empty \`protocol_errors\`) → route into Step 13's retry loop with the helper's per-criterion FAIL entries and any \`protocol_errors\` items as concrete remediation targets.` Preserve the wave-gate-exit rule (a wave only exits on every task PASS) verbatim.
- [ ] **Step 7: Slim Step 12.2's wave-integration test-runner readback and Step 16's final-gate readback** — Both call sites currently reference Step 7's "Reading run results" rule (which itself refers to checks 1–4). Update both to point at Step 7's slimmed checks 1–3 (helper-delegated) + check 4 (preserved). No new prose; just update the cross-references to be consistent with Step 7's slimming.
- [ ] **Step 8: Verify size constraint** — `wc -l agent/skills/execute-plan/SKILL.md` ≤ 771. This is the most aggressive slim — confirm the count is meaningfully below baseline.
- [ ] **Step 9: Spot-check core workflow preservation** — `grep -c "baseline_failures" agent/skills/execute-plan/SKILL.md` returns at least 5 (the integration regression model is preserved). `grep -c "BLOCKED_TASKS" agent/skills/execute-plan/SKILL.md` returns at least 1 (Step 10 wave gate preserved). `grep -c "Debugger-first flow" agent/skills/execute-plan/SKILL.md` returns at least 2 (Step 12 + Step 16 cross-references preserved). `grep -c "PRE_EXECUTION_SHA" agent/skills/execute-plan/SKILL.md` returns at least 1 (Step 8 baseline SHA capture preserved).

**Acceptance criteria:**

- File line count does not exceed the pre-edit baseline of 771 lines.
  Verify: `wc -l agent/skills/execute-plan/SKILL.md` outputs a count ≤ 771.
- Step 6 invokes `resolve-model-dispatch.py` for per-task model resolution.
  Verify: `awk '/^## Step 6/,/^## Step 7/' agent/skills/execute-plan/SKILL.md | grep -c "resolve-model-dispatch.py"` returns at least 1.
- Step 7 invokes `parse-artifact-handoff.py` for the test-runner artifact readback's marker + path + existence checks.
  Verify: `awk '/^## Step 7/,/^## Step 8/' agent/skills/execute-plan/SKILL.md | grep -c "parse-artifact-handoff.py"` returns at least 1.
- Step 7's header-parse (check 4) is preserved.
  Verify: `awk '/^## Step 7/,/^## Step 8/' agent/skills/execute-plan/SKILL.md | grep -c "FAILING_IDENTIFIERS_COUNT"` returns at least 1, AND `awk '/^## Step 7/,/^## Step 8/' agent/skills/execute-plan/SKILL.md | grep -c "header-parse check\|header malformed"` returns at least 1.
- Step 11.2 invokes all four execute-plan helpers and the shared model-dispatch helper.
  Verify: `awk '/^### Step 11.2/,/^### Step 11.3/' agent/skills/execute-plan/SKILL.md | grep -c "extract-plan-tasks.py"` returns at least 1; `awk '/^### Step 11.2/,/^### Step 11.3/' agent/skills/execute-plan/SKILL.md | grep -c "collect-diff-context.py"` returns at least 1; `awk '/^### Step 11.2/,/^### Step 11.3/' agent/skills/execute-plan/SKILL.md | grep -c "assemble-verifier-prompt.py"` returns at least 1; `awk '/^### Step 11.2/,/^### Step 11.3/' agent/skills/execute-plan/SKILL.md | grep -c "resolve-model-dispatch.py"` returns at least 1.
- Step 11.3 invokes `parse-verifier-report.py`.
  Verify: `awk '/^### Step 11.3/,/^## Step 12/' agent/skills/execute-plan/SKILL.md | grep -c "parse-verifier-report.py"` returns at least 1.
- Step 11.2's union-rule prose for the verifier-visible file set is preserved.
  Verify: `awk '/^### Step 11.2/,/^### Step 11.3/' agent/skills/execute-plan/SKILL.md | grep -c "Task-declared scope\|Worker-reported changes\|Orchestrator-observed diff state"` returns at least 3 (all three input categories named).
- Step 11.2's sub-task carve-out paragraph is preserved.
  Verify: `grep -c "Sub-task dispatch carve-out" agent/skills/execute-plan/SKILL.md` returns at least 1.
- Wave-gate exit, integration regression model, retry loop, and Debugger-first flow are preserved.
  Verify: `grep -c "Wave gate exit" agent/skills/execute-plan/SKILL.md` returns at least 1; `grep -c "baseline_failures" agent/skills/execute-plan/SKILL.md` returns at least 5; `grep -c "Debugger-first flow" agent/skills/execute-plan/SKILL.md` returns at least 2; `grep -c "MAX_PARALLEL_HARD_CAP" agent/skills/execute-plan/SKILL.md` returns at least 1.
- The verifier judgment boundary is preserved: helpers do not run recipes or judge acceptance.
  Verify: open `agent/skills/execute-plan/SKILL.md` and confirm Step 11.2's text still names the verifier as the agent that "executes command-style `Verify:` recipes in Phase 1 and judges every criterion in Phase 2"; the orchestrator's role remains "dispatch and route the verdict".

**Model recommendation:** capable

## Dependencies

- Task 1 depends on: (none)
- Task 2 depends on: (none)
- Task 3 depends on: Task 1
- Task 4 depends on: (none)
- Task 5 depends on: (none)
- Task 6 depends on: (none)
- Task 7 depends on: (none)
- Task 8 depends on: (none)
- Task 9 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8
- Task 10 depends on: Task 1, Task 2, Task 9
- Task 11 depends on: Task 1, Task 2, Task 9
- Task 12 depends on: Task 1, Task 9
- Task 13 depends on: Task 1, Task 9
- Task 14 depends on: Task 2, Task 3, Task 9
- Task 15 depends on: Task 3, Task 9
- Task 16 depends on: Task 1, Task 2, Task 3, Task 4, Task 9
- Task 17 depends on: Task 1, Task 2, Task 3, Task 9
- Task 18 depends on: Task 1, Task 2, Task 5, Task 6, Task 7, Task 8, Task 9

Wave assignment (computed from the dependency graph above):

- **Wave 1** (no dependencies, 7 tasks): Task 1, Task 2, Task 4, Task 5, Task 6, Task 7, Task 8
- **Wave 2** (depends on Task 1's `model-tiers-*.json` fixtures, 1 task): Task 3
- **Wave 3** (depends on Wave 1 + Wave 2, 1 task): Task 9
- **Wave 4** (depends on Wave 3, 8 tasks at the orchestration parallelism cap): Task 10, Task 11, Task 12, Task 13, Task 14, Task 15, Task 16, Task 17
- **Wave 5** (depends on Wave 3, 1 task — execute-plan adoption isolated for size-delta verification): Task 18

## Risk Assessment

- **`assemble-verifier-prompt` and `extract-plan-tasks` JSON shape coupling.** Task 7 (`assemble-verifier-prompt`) consumes structured criteria + recipe JSON shapes. Task 5 (`extract-plan-tasks`) emits compatible shapes. Both are in Wave 1 and could implement divergent shapes. Mitigation: this plan specifies the JSON shapes byte-exact in each helper's File Structure entry; the orchestrator wires them together via documented `--criteria-json` / `--phase1-recipes-json` flags. Adoption Task 18 explicitly tests the wiring against the real `verify-task-prompt.md` template.
- **Adoption-task size-delta failure.** Each adoption task asserts that the modified file's line count does not exceed its pre-edit baseline. If a `coder` worker rewrites prose without removing enough redundant content first, the size constraint may fail. Mitigation: each adoption task's first checkbox step is "Capture pre-edit line count"; subsequent steps are explicit about what to remove (e.g., "the four-template enumeration paragraph", "the cat ~/.pi/agent/model-tiers.json snippet"); the verification recipe is `wc -l <file>` against the documented baseline.
- **Test-runner integration of Python tests.** Task 9's `test:helpers` script (added in Wave 3) chains into `npm run check`. If `python3` is unavailable on a developer's machine, `npm run check` would fail — even though it works in CI and on the typical developer machine. Mitigation: helpers are stdlib-only Python 3, which has been a hard requirement for this repo (existing scripts in `agent/skills/xcode-build/` invoke `python3` and the codebase assumes its availability). Adding the script does not change that baseline.
- **`plan-refiner` `bash` widening.** Adding `bash` to `plan-refiner.md`'s tools list is a small but real privilege expansion. Mitigation: the spec explicitly authorizes this narrow widening as the only sanctioned tool-surface change, and `code-refiner` already has `bash`. The helpers `plan-refiner` invokes are read-only (`resolve-model-dispatch`, `parse-artifact-handoff`, `validate-review-provenance`, `fill-template`) — they do not modify the workspace.
- **Verifier judgment boundary slip.** Spec constraint: helpers must not run recipes or judge acceptance. `parse-verifier-report` validates protocol shape but emits `protocol_errors` rather than re-running the verifier or interpreting recipe outcomes. Adoption Task 18 explicitly verifies in its acceptance recipes that the SKILL prose still names the verifier as the recipe-running agent and the orchestrator as a routing-only consumer.
- **`define-spec` transcript-backed recovery preservation.** Spec explicitly forbids replacing `define-spec`'s transcript-backed recovery (case (2) of Step 4) with the helper. Mitigation: Task 11's acceptance recipes verify that the recovery prose is preserved verbatim by `grep`-checking specific load-bearing strings.
- **Long-running Wave 1 (7 helper tasks in parallel).** With 7 tasks dispatched in Wave 1, all 7 share the working tree. Risk: file-write conflicts in the shared `agent/skills/_shared/scripts/tests/fixtures/` directory if two tasks write the same fixture name. Mitigation: each task's File Structure lists distinct file paths — Task 1 owns the `model-tiers-*.json` fixtures (consumed by Task 3 in Wave 2), Task 2 owns the `final-message-*.txt` fixtures, Task 4 owns `template-*.md` fixtures, etc. No fixture path appears in two tasks. Task 3 is intentionally moved to Wave 2 so its tests can rely on Task 1's `model-tiers-complete.json` fixture being present in the shared fixtures directory.

## Test Command

```bash
cd agent && npm run check
```
