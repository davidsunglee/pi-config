# Define-spec and artifact-handoff consistency

Source: TODO-2e1105f6

## Goal

Make every Claude-pane subagent in the repo hand its written artifact back to the parent skill through one consistent, robust completion contract, using one consistent marker-naming convention. Close the gaps that today let `define-spec` and similar workflows lose their handoff payload (the agent's marker line gets stripped by the watcher's sentinel-vs-transcript precedence, validation is too lax to catch the failure, and orphaned drift in input-detection rules makes the failure noisier than it should be). Fold in the small `define-spec`-specific cleanups that motivated the original todo so the workflow is fully consistent end-to-end.

## Context

The repo's interactive workflows dispatch a small set of marker-emitting subagents into Claude panes. Each subagent writes a structured artifact to disk and returns a single anchored line that names the artifact path; the parent skill reads that line out of the subagent's `finalMessage` and uses it to drive validation, review prompts, and commit gates.

Today there are five such marker-emit points and one missing one. They live in:

- `agent/skills/scout/scout-prompt.md` — emits `BRIEF_WRITTEN: <absolute path>` to a brief under `docs/briefs/`.
- `agent/skills/define-spec/spec-design-procedure.md` Step 9 (delivered to the `spec-designer` subagent at `agent/agents/spec-designer.md`) — emits `SPEC_WRITTEN: <absolute path>` to a spec under `docs/specs/`.
- `agent/skills/requesting-code-review/review-code-prompt.md` — emits `REVIEW_ARTIFACT: <absolute path>` from the `code-reviewer` agent. The same prompt is used by `refine-code`'s coordinator dispatches.
- `agent/skills/generate-plan/review-plan-prompt.md` — emits `REVIEW_ARTIFACT: <absolute path>` from the `plan-reviewer` agent. The same prompt is used by `refine-plan`'s coordinator dispatches.
- `agent/skills/_shared/test-runner-prompt.md` — emits `TEST_RESULT_ARTIFACT: <absolute path>` from the `test-runner` agent. Used by `execute-plan` and `refine-code`.
- **Missing**: `agent/agents/planner.md` and `agent/skills/generate-plan/generate-plan-prompt.md` — the `planner` writes a plan to `docs/plans/<file>.md` but does **not** emit a structured marker. `generate-plan/SKILL.md` Step 3 trusts the free-form `Plan saved to ...` summary text. There is no `PLAN_*` entry in `parse-artifact-handoff.py`'s `VALID_MARKERS` list.

All five existing markers tell the agent to put the marker line on the **last line of the final assistant message**. The watcher in `pi-interactive-subagent/pi-extension/subagents/index.ts:1611-1632` then constructs `finalMessage` from, in order: (1) the sentinel file written by the `subagent_done` MCP tool, (2) the transcript JSONL's last assistant message, (3) a screen scrape. The sentinel is whatever string the agent passed as the optional `message` arg to `subagent_done()`. If the agent calls `subagent_done(message="<courtesy summary>")` instead of either omitting the message arg or passing the marker line as the message, the marker is silently stripped from `finalMessage` and the parent's `parse-artifact-handoff.py` call fails — even though the artifact was written correctly. The integration test at `pi-interactive-subagent/test/integration/orchestration-claude-pane-spec-designer-e2e.test.ts` already pins the safer pattern (`subagent_done(message="SPEC_WRITTEN: <abs path>")`) end-to-end, but no skill prompt currently instructs the agent to do that.

The repo's existing **provenance vocabulary** for inline references is already noun-form: `Plan artifact: <path>`, `Task artifact: <path>`, `Source spec: docs/specs/<filename>`, `Source todo: TODO-<id>`, `Scout brief: docs/briefs/<filename>`. These appear in subagent prompt placeholders (`{PLAN_ARTIFACT}`, `{TASK_ARTIFACT}`, etc.), in `## Provenance` blocks of dispatched prompts, in plan-file headers (`**Spec:**`, `**Source:**`, `**Scout brief:**` per `agent/agents/planner.md:95-97`), and in spec-file preambles (per `agent/skills/define-spec/spec-design-procedure.md:114,166`). The handoff markers diverge from this family today: two are `_WRITTEN` (`BRIEF_WRITTEN`, `SPEC_WRITTEN`) and two are `_ARTIFACT` (`REVIEW_ARTIFACT`, `TEST_RESULT_ARTIFACT`).

`parse-artifact-handoff.py` (under `agent/skills/_shared/scripts/`) supports `--check-existence`, `--check-non-empty`, and `--expected-path`. Most consumers use all three (scout: `--expected-path --check-existence --check-non-empty`; refine-plan/refine-code reviewer dispatches: same; test-runner-dispatch: same). Only `define-spec/SKILL.md` Step 4 currently runs with `--check-existence` alone — no `--check-non-empty`, and no path constraint, because the `spec-designer` chooses its own filename (`<YYYY-MM-DD>-<topic>.md`) so `--expected-path` does not apply.

Two `define-spec`-specific behaviors are also surfaced:

- **`spec-design-procedure.md` Step 1 todo regex** is `^TODO-([0-9a-f]{8})$`, exact-match, case-sensitive. Variants like `TODO-bd750b75 ` (trailing space) or `TODO-BD750B75` (uppercase) fall through to the freeform branch and the spec-designer treats them as raw text instead of a todo pointer.
- **`agent/skills/define-spec/scripts/detect-mux-backend.py`'s `OVERRIDE_SUBSTRINGS` list** contains the bare word `"inline"` along with five precise multi-word entries. A user prompt mentioning inline editing of cells, inline images, etc. is misclassified as an inline-branch override.

`spec-design-procedure.md` Step 1's existing-spec branch instructs the spec-designer to "use the input path as-is — do not normalize between relative and absolute." That language is correct for the **file-write target** but bleeds into the **emitted marker line** today, leaving the only relative-path-emitting marker in the repo when the user invokes `/define-spec docs/specs/foo.md` from the repo root.

The original launch-spec composition bug (TODO-dd074bb7) is already fixed in `pi-interactive-subagent/pi-extension/subagents/launch-spec.ts:619-627` and covered by tests in `test/orchestration/launch-spec.test.ts`. Procedure-file naming is consistent (`spec-design-procedure.md` in both repo and global). Those items are out of scope for this spec.

## Requirements

1. **Standardize completion-marker names on `_ARTIFACT`.** Rename `BRIEF_WRITTEN` → `BRIEF_ARTIFACT`, `SPEC_WRITTEN` → `SPEC_ARTIFACT`. Add a new `PLAN_ARTIFACT` for the planner. `REVIEW_ARTIFACT` and `TEST_RESULT_ARTIFACT` keep their names. After the change, `parse-artifact-handoff.py`'s `VALID_MARKERS` list contains exactly: `BRIEF_ARTIFACT`, `SPEC_ARTIFACT`, `PLAN_ARTIFACT`, `REVIEW_ARTIFACT`, `TEST_RESULT_ARTIFACT`. The old names are removed entirely (no aliases, no deprecation shims).

2. **Adopt belt-and-suspenders completion contract for every marker-emit prompt.** Every prompt that today instructs an agent to emit a `*_ARTIFACT` line must instruct the agent to do **both** of the following at terminal time:
   - End the final assistant message with the marker line `<MARKER>: <absolute path>` as the last anchored line of the message.
   - Call `subagent_done(message="<MARKER>: <absolute path>")` as the terminal action.
   Both channels carry the same byte-equal marker line. The contract applies to: scout, spec-designer, code-reviewer (`review-code-prompt.md`), plan-reviewer (`review-plan-prompt.md`), test-runner, and the new planner marker.

3. **Add `PLAN_ARTIFACT` to the planner.** The `planner` agent (and `generate-plan/generate-plan-prompt.md`) must emit `PLAN_ARTIFACT: <absolute path>` via the belt-and-suspenders contract from requirement (2). `generate-plan/SKILL.md` Step 3 must validate the marker via `parse-artifact-handoff.py --marker PLAN_ARTIFACT --expected-path <absolute output path> --check-existence --check-non-empty` before treating the plan as written.

4. **Validation parity across all marker consumers.** Every orchestrator call site that runs `parse-artifact-handoff.py` must use `--check-existence --check-non-empty`. For consumers where the orchestrator pre-computes the output path (scout, generate-plan, refine-plan reviewer dispatches, refine-code reviewer dispatches, test-runner dispatches), `--expected-path` must also be supplied. For `define-spec` (where the spec-designer chooses its own filename), the orchestrator must validate that the returned path (a) ends in `.md` and (b) normalizes to a path under `<working-dir>/docs/specs/`. The validation surface must reject paths that fail either check before the user-review gate.

5. **`spec-designer` emits absolute paths in the marker, regardless of input path shape.** When the existing-spec branch is fired with a relative `docs/specs/foo.md` input, the file-write target stays as supplied (per the existing Step 1 directive), but the `SPEC_ARTIFACT` line in both channels (final assistant message and `subagent_done` message) is the absolute path of the written file.

6. **Trim and lowercase before matching the todo regex.** `spec-design-procedure.md` Step 1's input-shape detection must trim leading/trailing whitespace and lowercase the captured hex segment of the input before matching against `^TODO-[0-9a-f]{8}$`. After this normalization, `TODO-BD750B75` and `TODO-bd750b75 ` both match the todo branch. Inputs without a `TODO-` prefix and inputs containing other extraneous tokens (e.g., a leaked slash command) still fall through to the freeform branch.

7. **Remove `"inline"` from the mux-backend override list.** `agent/skills/define-spec/scripts/detect-mux-backend.py`'s `OVERRIDE_SUBSTRINGS` no longer contains the bare word `"inline"`. The other five entries (`--no-subagent`, `without a subagent`, `without subagent`, `no subagent`, `skip subagent`) are unchanged. The helper's docstring and the helper's README in `agent/skills/define-spec/scripts/README.md` are updated to match.

8. **Test coverage parity.** The repo's existing tests must be updated for the rename and extended with regression coverage for the new behaviors:
   - `parse-artifact-handoff.py` tests cover all five `_ARTIFACT` markers (including the new `PLAN_ARTIFACT`) and the absence of the old `_WRITTEN` names.
   - The marker-emit contract is regression-tested end-to-end for each marker-emit prompt or covered by a parameterized shared test, mirroring the existing spec-designer e2e test that already pins `subagent_done(message=...)`.
   - `define-spec`'s validation tightening is regression-tested: a path outside `<working-dir>/docs/specs/`, a path not ending in `.md`, and an empty file each fail the gate before the user-review prompt is rendered.
   - `spec-designer` regression tests cover absolute-path emit on relative input.
   - `spec-design-procedure.md` Step 1 todo-detection tests include trim and lowercase variants.
   - `detect-mux-backend.py` tests no longer assert `"inline"` as an override and no longer false-positive on prompts like `"build a spec for inline editing"`.

9. **Documentation and provenance vocabulary alignment.** READMEs and prose in the affected skills (`scout/README.md`, `define-spec/README.md`, `spec-design-procedure.md`, top-level `README.md`'s skill-overview tables, and helper-script READMEs under `_shared/scripts/` and `define-spec/scripts/`) reflect the new marker names and the belt-and-suspenders contract. The `_ARTIFACT` family aligns with the existing noun-form provenance vocabulary (`Plan artifact:`, `Task artifact:`, `Source spec:`, `Source todo:`, `Scout brief:`).

## Constraints

- **Do not modify the `pi-interactive-subagent` runtime.** The watcher precedence (sentinel → transcript → screen-scrape) and the `subagent_done` MCP tool semantics stay as they are. The fix lives in agent prompts and orchestrator validation, not in the watcher.
- **Do not modify `coordinator-dispatch.md` or the coordinator agents (`plan-refiner`, `code-refiner`).** Coordinators are pi-backed and return STATUS-shaped structured summaries, not `*_ARTIFACT` markers. Their internal reviewer/test-runner dispatches inherit the new contract automatically through the shared prompts (`review-plan-prompt.md`, `review-code-prompt.md`, `test-runner-prompt.md`).
- **No backwards-compatibility shims for old marker names.** The rename is a single atomic switch. Agent prompts, validators, tests, and docs are all updated together. `parse-artifact-handoff.py --marker BRIEF_WRITTEN` is rejected after the change.
- **No new completion markers for non-artifact subagents.** The `coder` agent (which returns a structured `parse-coder-report.py` payload), the `planner` in edit mode (which overwrites the plan in place — the `PLAN_ARTIFACT` from initial generation already names the file and edit mode reuses it), and the coordinator agents stay as they are.
- **Both channels of the belt-and-suspenders contract carry the same byte-equal marker line.** No abbreviated form, no per-channel variation. This keeps `parse-artifact-handoff.py` the single arbiter regardless of which channel the watcher picked.
- **The `define-spec` existing-spec branch's "use the input path as-is" rule applies only to the file-write target.** It does not apply to the marker-line emit. The marker is always absolute.

## Approach

**Chosen approach:** A single bundled spec covering every marker-emit prompt across the repo, applied in one wave: rename to `_ARTIFACT`, add `PLAN_ARTIFACT`, update every prompt to the belt-and-suspenders contract, tighten validation in every consumer, and fold in the `define-spec`-specific cleanups (existing-spec absolute-path emit, todo regex trim/lowercase, mux probe `"inline"` removal). The repo treats the family of marker-emit prompts as one consistent contract, with `parse-artifact-handoff.py` as the single arbiter on the consumer side.

**Why this over alternatives:** The architectural choice (belt-and-suspenders + `_ARTIFACT` naming) is the same across all skills. Splitting per-skill would force the same architectural choice to be re-litigated in each smaller spec and would leave the repo in a partially-renamed state during the migration window. The rename is mechanical once the convention is fixed, and the validation tightening is mechanical once the consumer pattern is fixed — the specs/plans on the implementation side can be split downstream by the planner, but the spec-level contract is one decision.

**Considered and rejected:**

- **Sentinel-only contract** (agent passes the marker as `subagent_done(message=...)`, free-form text on the final assistant message). Rejected: a single failure mode silently strips the marker if the model omits the `message` arg or hallucinates a different message, and the transcript fallback can't catch it because the sentinel is non-empty in those cases.
- **Transcript-only contract** (agent calls `subagent_done()` with no `message`, marker on the last line of the final assistant message). Rejected: relies on a negative instruction ("don't pass a message") that models trained to summarize routinely violate, leaving the contract fragile and requiring per-incident debugging.
- **Standardize on `_WRITTEN` instead of `_ARTIFACT`.** Rejected: the existing provenance vocabulary in the repo (`Plan artifact:`, `Task artifact:`, `Source spec:`, `Source todo:`, `Scout brief:`) is already noun-form and lives in subagent prompt placeholders, plan-file headers, and spec preambles. The `_ARTIFACT` form aligns with that family; `_WRITTEN` would introduce a parallel verb-form vocabulary just for the protocol-marker layer. Rename cardinality is the same either way (two markers change), so the choice rests on naming alignment, not migration cost.
- **Split per-skill specs (one spec per marker-emit prompt).** Rejected: forces the architectural choice to be re-litigated repeatedly, multiplies review work, and creates a long migration window where some prompts use the new contract and others use the old one.

## Acceptance Criteria

- `python3 agent/skills/_shared/scripts/parse-artifact-handoff.py --marker BRIEF_ARTIFACT --final-message <msg>` accepts a `BRIEF_ARTIFACT: <path>` line; the same call with `--marker BRIEF_WRITTEN` exits non-zero with `failure: invalid marker` (or equivalent argparse-level rejection). Same for `SPEC_ARTIFACT` ↔ `SPEC_WRITTEN`. `--marker PLAN_ARTIFACT` is accepted.
- Every marker-emit prompt (`scout-prompt.md`, `spec-design-procedure.md` Step 9 / `spec-designer.md`, `review-code-prompt.md`, `review-plan-prompt.md`, `test-runner-prompt.md`, plus the new planner prompt section) explicitly instructs the agent to (a) end the final assistant message with `<MARKER>: <absolute path>` AND (b) call `subagent_done(message="<MARKER>: <absolute path>")`. The two strings are byte-equal.
- The `planner` agent emits `PLAN_ARTIFACT: <absolute path>` and `generate-plan/SKILL.md` Step 3 validates it via `parse-artifact-handoff.py --marker PLAN_ARTIFACT --expected-path <abs OUTPUT_PATH> --check-existence --check-non-empty`. A failed validation surfaces a verbatim error and stops the skill before the refine-plan handoff.
- Every orchestrator call site that runs `parse-artifact-handoff.py` passes `--check-existence --check-non-empty` (and `--expected-path` where the orchestrator pre-computes the path). `define-spec/SKILL.md` Step 4 additionally rejects paths that don't end in `.md` or don't normalize under `<working-dir>/docs/specs/`.
- `spec-designer` regression test: when the user invokes the existing-spec branch with a relative input path (e.g., `docs/specs/foo.md`), the emitted `SPEC_ARTIFACT` line in both channels contains the absolute path of the written file.
- `spec-design-procedure.md` Step 1 trim+lowercase test: inputs `TODO-bd750b75`, `TODO-BD750B75`, and `TODO-bd750b75 ` all match the todo branch and read `docs/todos/bd750b75.md`. Inputs `bd750b75` (no prefix) and `/define-spec TODO-bd750b75` (slash-command leak) fall through to the freeform branch.
- `detect-mux-backend.py` no longer emits the inline-override status for an input like `"build a spec for inline editing of cells"`. The other five override phrases still trigger the inline branch as before.
- The existing spec-designer e2e test (`pi-interactive-subagent/test/integration/orchestration-claude-pane-spec-designer-e2e.test.ts`) is updated to assert `SPEC_ARTIFACT` rather than `SPEC_WRITTEN` and continues to pass. Equivalent end-to-end coverage exists for the other marker-emit prompts (existing test plus extension for the rename, or a parameterized shared test).
- README files and prose in the affected skills reference the new marker names; no occurrences of `BRIEF_WRITTEN` or `SPEC_WRITTEN` remain in `agent/`, `docs/`, or `README.md`.

## Non-Goals

- Modifying the `pi-interactive-subagent` runtime (watcher precedence, sentinel mechanism, MCP tool surface, `buildClaudeCompletionAddendum` text). The contract change lives entirely in this repo's agent prompts and orchestrator validation.
- Adding completion markers to subagents that don't already emit one (`coder`, planner edit-mode, `plan-refiner`, `code-refiner`). The coordinator pattern with its STATUS-shaped summary stays as is.
- Refactoring `define-spec/SKILL.md` Step 4's transcript-backed recovery into a deterministic helper. The recovery prose stays as is for now; this spec only ensures the direct-marker validation is tight enough that recovery is rarely needed.
- Backwards-compatibility shims for the old marker names. The rename is atomic.
- Re-litigating the `launch-spec.ts` identity-composition fix (TODO-dd074bb7) or the procedure-file naming alignment. Both are already resolved.

## Open Questions

- **Path-constraint validation for `define-spec`: new `parse-artifact-handoff.py` flag, or orchestrator-side prose check?** A new `--require-prefix <abs-dir>` (or `--require-spec-path`) flag would centralize the check in the helper and let other consumers reuse it; orchestrator-side prose keeps the helper minimal but duplicates the check at every call site that wants it. This is a mechanical decision the planner can make based on how many other consumers might want the same constraint in the near term.
- **Shared parameterized test vs per-prompt test extension for the marker-emit contract.** A new shared test fixture that drives each marker-emit prompt against the belt-and-suspenders contract would catch regressions across all skills uniformly; extending each existing per-skill test would minimize cross-skill churn but risks divergent assertions over time. Planner can decide based on existing test infrastructure conventions.
