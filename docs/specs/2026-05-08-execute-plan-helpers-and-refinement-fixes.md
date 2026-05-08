# Execute-plan helpers, menu standardization, and inter-era refinement fix

Source: TODO-f7b45924

## Goal

Three coordinated changes:

1. Extract mechanical, repeatable, or safety-sensitive procedures from `agent/skills/execute-plan/SKILL.md` into focused, tested Python helpers.
2. Normalize three user-facing menus inside `execute-plan/SKILL.md` so all "stop" options use a single verbatim line and all options use mnemonic letters.
3. Fix a workflow regression in `refine-plan` and `refine-code` where the user's `(a) Keep iterating` choice at budget exhaustion immediately re-reviews the unedited artifact instead of acting on the prior era's findings.

## Non-goals

- Extracting interactive menus, escalation choices, or high-level workflow ordering — those remain `SKILL.md` policy.
- Implementing the lower-priority extraction candidates listed in Part D.
- Changing the `integration-regression-gate.md` data model, the `test-runner` artifact format, the verifier's report shape, or the `code-refiner` / `plan-refiner` review/edit shape beyond the carry-over input added in Part C.
- Backwards-compatibility shims, deprecated stubs, or transitional aliases.

---

## Part A — Mechanical helpers (six)

Each helper is a deterministic Python script with structured stdout JSON, structured stderr JSON on protocol error (`{"failure": "<label>", ...}`), and unit tests under its skill's existing `scripts/tests/` layout. Each helper's `--help` documents its protocol-error labels. Helpers are listed in the priority order from the source TODO: correctness, safety criticality, robustness.

### A.1 — Plan validation + dependency wave grouping

Extends `agent/skills/execute-plan/scripts/extract-plan-tasks.py` in place. Single source of truth for plan parsing, validation, and wave assignment. One subprocess call covers Steps 2 and 5 of `execute-plan/SKILL.md`.

**New behavior** (additive on top of the existing per-task validation):

1. **Section-presence validation.** Reject plans missing any of the five required sections enumerated in `SKILL.md` Step 2: header (goal, architecture summary, tech stack), file structure, numbered tasks, Dependencies, Risk assessment.
2. **Dependency reference validation.** Every dependency in `## Dependencies` must reference an existing task number.
3. **Dependency cycle detection.**
4. **Wave grouping.** Topological layering: Wave 1 = tasks with no dependencies; Wave N = tasks whose latest dependency is in Wave N−1. Sub-wave splitting at `MAX_PARALLEL_HARD_CAP` (default `8`) so `SKILL.md` Step 5's pseudo-code becomes a JSON read.

`MAX_PARALLEL_HARD_CAP` matches the existing constant referenced by `pi-interactive-subagent`'s `MAX_PARALLEL_HARD_CAP = 8`. Exposed as `--max-parallel-hard-cap N` so the constant lives in one place.

**Internal seam.** Keep `parse_plan(text)` (parsing + per-task validation) and `compute_waves(tasks)` (graph analysis + sub-wave splitting) as separate functions so each has its own focused test surface.

**New stdout JSON fields:**

```json
{
  ...,
  "waves": [
    {"wave": 1, "subwave": 1, "tasks": [1, 2]},
    {"wave": 2, "subwave": 1, "tasks": [3, 4]},
    {"wave": 2, "subwave": 2, "tasks": [5, 6, 7, 8, 9, 10, 11, 12]},
    {"wave": 3, "subwave": 1, "tasks": [13]}
  ]
}
```

`waves` is omitted on validation-error exits (existing convention: stderr JSON, exit non-zero).

**New protocol-error kinds (stderr JSON):**

- `missing_required_section` — `{"kind": "missing_required_section", "section": "<name>"}`
- `dependency_unknown_target` — `{"kind": "dependency_unknown_target", "task_number": N, "unknown_dep": M}`
- `dependency_cycle` — `{"kind": "dependency_cycle", "cycle": [N1, N2, ...]}`

**SKILL.md changes:**

- Step 2's "Check the plan contains all of (1)–(5)" becomes "invoke `extract-plan-tasks.py`; surface `missing_required_section` errors verbatim and stop". The "suggest re-generating with `generate-plan`" prose stays.
- Step 5's wave-grouping pseudo-code is replaced by reading `waves` from the helper output. The example block can stay as a worked example but no longer documents the executable rule.

**Tests (focused unit):**

- Linear-deps plan → expected waves.
- Parallel-only plan → all in Wave 1.
- Plan with a dependency cycle → `dependency_cycle` with participating numbers.
- Plan referencing a nonexistent dep → `dependency_unknown_target`.
- Plan missing each required section → `missing_required_section` for that section.
- Wave with > 8 tasks → splits into sub-waves of ≤8, deterministic order.
- `--max-parallel-hard-cap 4` overrides default.
- Existing tests continue to pass.

---

### A.2 — Integration regression reconciliation

New helper `agent/skills/_shared/scripts/reconcile-test-run.py`. Set arithmetic that Steps 7, 12.2, 14, and 16 of `execute-plan/SKILL.md` currently restate inline. Helper does data only — no user-facing summary rendering.

**Inputs (CLI):**

- `--artifact <path>` — test-runner artifact (consumed via `parse-test-runner-artifact.py`).
- `--baseline-failures <path>` — JSON `{"failing_identifiers": [...]}`. Empty list = clean baseline. Required in `reconcile` mode, ignored in `capture` mode.
- `--mode <capture|reconcile>` —
  - `capture` (Step 7): emit baseline data from the artifact.
  - `reconcile` (Steps 12.2, 14, 16): compare against the frozen baseline.

**Output (stdout JSON):**

`capture`:

```json
{
  "mode": "capture",
  "baseline_failures": ["..."],
  "non_reconcilable_at_baseline": ["..."],
  "classification": "clean|stable-failures-only|contains-non-reconcilable-evidence"
}
```

`reconcile`:

```json
{
  "mode": "reconcile",
  "current_failing_stable": ["..."],
  "current_non_reconcilable": ["..."],
  "current_non_baseline_stable": ["..."],
  "classification": "pass|fail"
}
```

`current_non_baseline_stable` is the byte-for-byte set difference `current_failing_stable \ baseline_failures` per `integration-regression-gate.md`. `current_non_reconcilable` is never compared, intersected, or subtracted against any other set; it only contributes to pass/fail classification.

**Errors (stderr JSON, non-zero exit):** delegated to `parse-test-runner-artifact.py` with the same labels (`artifact_missing_or_empty`, `header_missing`, etc.). One new label: `baseline_failures_invalid` if `--baseline-failures` JSON is malformed.

**Why data only.** The user-facing three-section summary differs across Steps 7 / 12 / 14 / 16 (different headers, wave numbers, "final-gate" wording). Parameterizing summary rendering across all four call sites would balloon the helper's API for negligible deduplication. `integration-regression-gate.md` remains the canonical specification of the summary format; the orchestrator renders it from the helper's data fields.

**SKILL.md changes:**

- Step 7 invokes the helper in `capture` mode and writes the result into the frozen `baseline_failures`.
- Step 12.2, Step 14 (most-recent-artifact recompute), and Step 16 invoke `reconcile` mode and read the data fields. Inline `current_failing_stable := FAILING_IDENTIFIERS:` lines reference the helper's `--mode reconcile` output rather than restating the arithmetic.

**Tests:**

- Clean baseline → `clean` classification, empty sets.
- Stable-failures-only baseline → `stable-failures-only`, baseline populated.
- Baseline with non-reconcilable evidence → `contains-non-reconcilable-evidence`.
- Reconcile against an empty baseline with passing run → `pass`.
- Reconcile with one new stable failure → `fail`, failure appears in `current_non_baseline_stable`.
- Reconcile with one non-reconcilable failure but no stable failures → `fail` (non-reconcilable alone fails the gate).
- Reconcile against a baseline that includes a stable identifier still failing → that identifier in baseline ∩ current is NOT in `current_non_baseline_stable`.
- Malformed `--baseline-failures` JSON → `baseline_failures_invalid`.
- Artifact-level errors propagated from the parser.

---

### A.3 — Git workspace probe

New helper `agent/skills/_shared/scripts/git-workspace-status.py`. Read-only, JSON output. Replaces the inline bash block at the top of `SKILL.md` Step 0 and is reusable by `using-git-worktrees` and `finishing-a-development-branch`.

**Inputs (CLI):**

- `--working-dir <path>` (default `.`).
- `--main-branches <comma-sep>` (default `main,master,develop`).

**Output (stdout JSON):**

```json
{
  "is_git_repo": true,
  "workspace_path": "/abs/path",
  "is_worktree": false,
  "current_branch": "feature/foo",
  "branch_label": "feature/foo",
  "is_feature_branch": true,
  "dirty_status": " M file.txt\n?? other.txt\n"
}
```

When `is_git_repo: false`, all other fields are `null` and the helper exits 0 (the caller decides policy — Step 0 currently stops with a fixed message).

`branch_label` follows `SKILL.md` Step 0's existing rule: empty branch → `detached HEAD at <short-sha>`.

`dirty_status` is the raw `git status --porcelain` output. Empty string when clean.

**Errors (stderr JSON, non-zero exit):**

- `working_dir_not_found` — `--working-dir` does not exist.
- `git_command_failed` — underlying git invocation failed unexpectedly (carries `stderr` text).

**SKILL.md changes (Step 0):** the `GIT_DIR_ABS=...; CURRENT_BRANCH=...; case "$CURRENT_BRANCH"` block is replaced by a single helper invocation. The dirty-workspace `(c)/(q)/(n)` menu, the reuse log message, the new-worktree fall-through — all stay in `SKILL.md` as policy.

**Tests:**

- Non-git directory → `is_git_repo: false`.
- Plain repo on `main` → `is_worktree: false`, `is_feature_branch: false`.
- Plain repo on a feature branch → `is_feature_branch: true`.
- Detached HEAD → `branch_label: "detached HEAD at <sha>"`.
- Linked worktree → `is_worktree: true`.
- Dirty status → non-empty `dirty_status`.
- `--main-branches trunk` → custom main name respected.
- Nonexistent `--working-dir` → `working_dir_not_found`.

---

### A.4 — Verifier file-set computation

New helper `agent/skills/execute-plan/scripts/compute-verifier-file-set.py`. Mechanizes Step 11.2's union rule so the worker being judged cannot narrow the verifier's view of changed files.

**Inputs (CLI):**

- `--task-files <json-path>` — list of paths from the task's `**Files:**` block.
- `--worker-files <json-path>` — list of paths from the worker's `## Files Changed` section.
- `--observed-status <path-or--for-stdin>` — verbatim `git status --porcelain` output.
- `--observed-diff-paths <json-path>` — paths from `git diff HEAD --name-only`.
- `--wave-shape <single-task|parallel-multi-task>` — selects scoping rule.

**Output (stdout JSON):**

```json
{
  "verifier_visible_files": ["a", "b", "c"],
  "task_files_resolved": ["a", "b"],
  "worker_files_resolved": ["b", "c"],
  "observed_paths": ["a", "b", "c", "d"],
  "scoping_rule": "single-task|parallel-multi-task"
}
```

`verifier_visible_files` is the deduplicated union per Step 11.2:

- **single-task wave:** union of all paths from task-declared, worker-reported, and observed inputs.
- **parallel-multi-task wave:** task-declared ∪ worker-reported ∪ any observed path that (a) appears in task-declared or worker-reported, OR (b) is a descendant of any directory in the task-declared set.

Order is stable: input order preserved, dedup keeps first occurrence.

**Errors (stderr JSON, non-zero exit):**

- `input_json_invalid` — any of the JSON inputs is malformed.
- `wave_shape_invalid` — `--wave-shape` value is not one of the two allowed strings.

**SKILL.md changes (Step 11.2):** the union-rule prose is replaced by a per-task helper call. The sub-task carve-out (which uses `git diff <pre-subtask-commit>..HEAD -- <files>` for committed sub-task changes — a protocol-violation recovery path) remains an orchestrator concern; the helper consumes whichever observed paths the orchestrator provides.

**Tests:**

- Single-task wave with disjoint task / worker / observed sets → union of all three.
- Parallel-multi-task wave with observed path outside task-declared scope → excluded.
- Parallel-multi-task wave with observed path under a task-declared directory → included.
- Empty inputs → empty output, no error.
- Malformed JSON input → `input_json_invalid`.
- Bad `--wave-shape` value → `wave_shape_invalid`.
- Same path in all three inputs → one occurrence in `verifier_visible_files`.

---

### A.5 — Test command detection

New helper `agent/skills/_shared/scripts/detect-test-command.py`. Replaces the inline shell heuristics at Step 3's "Test command resolution order" auto-detect step, and is reused by `using-git-worktrees` (baseline test verification) and `finishing-a-development-branch` (test verification).

**Inputs (CLI):**

- `--working-dir <path>` (default `.`).

**Output (stdout JSON):**

Detected:

```json
{
  "detected": true,
  "command": "npm test",
  "source": "package.json"
}
```

Not detected:

```json
{
  "detected": false,
  "command": null,
  "source": null
}
```

**Detection rules (resolution order):**

1. `package.json` exists AND its parsed JSON has a `.scripts.test` string → `("npm test", "package.json")`.
2. `Cargo.toml` exists → `("cargo test", "Cargo.toml")`.
3. `Makefile` exists AND contains a line matching `^test:` → `("make test", "Makefile")`.
4. `pyproject.toml` OR `setup.py` exists → `("pytest", "pyproject.toml" | "setup.py")`.
5. `go.mod` exists → `("go test ./...", "go.mod")`.

If none match, `detected: false`. The current `SKILL.md` Step 3 phrasing — `package.json with a test script` — is now actually enforced because rule 1 parses the JSON; today's bash check only verifies file presence.

**Errors (stderr JSON, non-zero exit):**

- `working_dir_not_found` — `--working-dir` does not exist.

Non-fatal: a malformed `package.json` emits a stderr warning and falls through to rule 2. Detection of other build systems must not be blocked by a corrupt JS marker.

**Consumers:** `execute-plan` Step 3 fallback; `using-git-worktrees`; `finishing-a-development-branch`. Three reasonable consumers justify `_shared` placement.

**Tests:**

- `package.json` with `scripts.test` → `npm test`.
- `package.json` without `scripts.test` → falls through.
- `package.json` malformed → falls through with stderr warning.
- `Cargo.toml` only → `cargo test`.
- `Makefile` with `test:` target → `make test`.
- `Makefile` without `test:` target → falls through.
- `pyproject.toml` only → `pytest`.
- `setup.py` only → `pytest`.
- `go.mod` only → `go test ./...`.
- Multiple markers — rule 1 wins.
- No markers → `detected: false`.

---

### A.6 — Coder report parser

New helper `agent/skills/execute-plan/scripts/parse-coder-report.py`. Mechanizes the prose-defined parsing of `results[i].finalMessage` that Steps 9, 10, and 11 of `SKILL.md` consume.

**Input format:** the coder report shape from `execute-plan/execute-task-prompt.md` `## Report Format`.

**Inputs (CLI):**

- `--report <path-or--for-stdin>`.

**Output (stdout JSON):**

```json
{
  "status": "DONE|DONE_WITH_CONCERNS|BLOCKED|NEEDS_CONTEXT",
  "files_changed": ["path/one", "path/two"],
  "concerns_block": "<verbatim text of ## Concerns / Needs / Blocker, or empty>",
  "blocker_text": "<concerns_block when status==BLOCKED, else null>",
  "needs_text": "<concerns_block when status==NEEDS_CONTEXT, else null>",
  "tests_block": "<verbatim text of ## Tests>",
  "completed_block": "<verbatim text of ## Completed>",
  "self_review_block": "<verbatim text of ## Self-Review Findings>",
  "protocol_warnings": ["concerns_block_missing"]
}
```

`files_changed` extracts the path portion of each `- \`path\` — description` bullet under `## Files Changed`. The first backtick-delimited token is the path; bullets without backticks are skipped silently (workers may report shape variants — not a protocol error).

`protocol_warnings` is non-fatal. `DONE_WITH_CONCERNS` without a `## Concerns / Needs / Blocker` block emits `concerns_block_missing`; the orchestrator may surface this as a worker-shape issue without aborting the wave.

**Errors (stderr JSON, non-zero exit):**

- `status_line_missing` — no `STATUS:` line found.
- `status_token_invalid` — `STATUS:` line present but token is not one of the four allowed values.
- `report_unreadable` — `--report` cannot be read.

**SKILL.md changes:**

- Step 9 routes on `status` from the helper output.
- Step 10 builds `BLOCKED_TASKS` and `CONCERNED_TASKS` from helper outputs across the wave.
- Step 11 consumes `files_changed` as one input to the Step 11.2 union rule (helper A.4).

**Tests:**

- DONE with files-changed list → `status: DONE`, files extracted.
- DONE_WITH_CONCERNS with concerns block → `concerns_block` populated.
- BLOCKED with full blocker text → `blocker_text` populated.
- NEEDS_CONTEXT with needs text → `needs_text` populated.
- Missing `STATUS:` line → `status_line_missing`.
- Unknown status token → `status_token_invalid`.
- DONE_WITH_CONCERNS without concerns block → `concerns_block_missing` warning.
- Files-changed bullet without backticks → skipped, no error.

---

## Part B — Menu standardization in `execute-plan/SKILL.md`

The verbatim "stop" line, used byte-equal at Steps 10, 12, 13, 15, 16:

```
(x) Stop execution — halt the plan; prior wave commits remain in git history
```

### B.1 — Step 13 budget-exhaustion menu

Currently rendered as bullet list without mnemonic letters. New form:

```
Options:
(r) Retry again — optionally with a different model or more context. Resets the per-task budget back to 3 for that task only.
(x) Stop execution — halt the plan; prior wave commits remain in git history
```

The "There is no skip option" prose remains adjacent (it's policy, not menu text), retargeted to reference `(r)` and `(x)`.

### B.2 — Step 13 wave-pacing menu

Currently three options `(a)/(b)/(c)`. Reduce to two — option `(b)` "Never pause" and option `(c)` "Pause only on failures" had nearly identical effective behavior because BLOCKED / unresolved-concerns / VERDICT: FAIL already pause via the gates regardless of pacing.

```
Options:
(f) Pause only on failure   [default]
(w) Pause every wave
```

Both render the wave-completion summary (the data Step 9 already classifies — no extra computation cost). Pacing only decides whether the summary is followed by an interactive confirmation.

The Step 13 prose clarifying that BLOCKED / unresolved concerns / VERDICT: FAIL always pause via gates remains, updated to reference `(f)` instead of `(b)` deferral.

### B.3 — Step 15 `not_approved_within_budget` menu

Currently `(a)/(b)/(c)`. New form:

```
Options:
(c) Continue iterating — fresh budget; new era starts with a remediation pass on the prior era's findings before the next review.
(p) Proceed with issues noted
(x) Stop execution — halt the plan; prior wave commits remain in git history
```

The `(c)` description previews the Part C behavior change.

### B.4 — Step 12 wording trim

Both the intermediate-wave and final-wave Step 12 menus currently render `(x) Stop plan execution — halt plan execution; prior wave commits remain in git history`. Replace with the verbatim Part B stop line so all five sites are byte-equal.

### B.5 — Step 0 `(q) Quit`

Out of scope. Step 0 is pre-flight, before any wave commit exists, so "prior wave commits remain in git history" doesn't apply. Step 0's `(q) Quit — cancel execution` stays as today.

---

## Part C — Inter-era refinement handoff

### Problem (verified)

After `not_approved_within_budget`:

- `plan-refiner`'s last action was iteration `MAX`'s review. Its Critical+Important findings are persisted to `<REVIEW_OUTPUT_PATH>-vN.md`.
- `plan-refiner` did NOT do a planner edit pass on those findings — the loop in `refine-plan-prompt.md` `### Per-Iteration Full Review` step 11 exits before the Planner Edit Pass when the budget is exhausted.
- `refine-plan/SKILL.md` Step 10 § `not_approved_within_budget` `(a) Keep iterating` commits the era and re-runs from Step 6, dispatching a new `plan-refiner` for era N+1.
- The new `plan-refiner` enters Per-Iteration Full Review at step 1, then step 4 dispatches `plan-reviewer` against the same plan content era N ended on.

The previous era's findings are never directly addressed by an edit. Reviewer randomness can produce a different finding set on era N+1's first pass, effectively dropping era N's investigation. The user's `(a) Keep iterating` intent ("act on what you just told me") doesn't match the orchestrator's behavior ("re-review the unedited plan").

The same structural issue exists in `refine-code`: Step 5 `(a) Keep iterating` re-invokes from Step 3 and re-dispatches `code-refiner`; `code-refiner`'s internal loop ends on a review and the next era starts with another review.

### Fix (refine-plan)

Add a new optional input `{CARRY_OVER_REVIEW}` to `plan-refiner`'s prompt, threaded through the helper and skill.

**`refine-plan-prompt.md` changes:**

Add a new section before `### Per-Iteration Full Review`:

> ### Carry-over edit pass (era handoff)
>
> When `{CARRY_OVER_REVIEW}` is non-empty, perform a planner edit pass against that review file's findings BEFORE entering the Per-Iteration Full Review loop:
>
> 1. Read the carry-over review file at `{CARRY_OVER_REVIEW}`.
> 2. Extract Critical + Important findings (skip Minor — non-blocking, same rule as the in-loop Planner Edit Pass).
> 3. Dispatch `planner` (edit mode) per the existing Planner Edit Pass procedure with `{REVIEW_FINDINGS}` populated from the extracted findings and `{OUTPUT_PATH} = {PLAN_PATH}`.
> 4. After the planner returns, verify the plan file still exists and is non-empty (same check as the in-loop Planner Edit Pass step 4). If missing or empty, emit `STATUS: failed` with reason `input artifact missing or empty: plan file after carry-over edit pass`.
> 5. Begin Per-Iteration Full Review at iteration 1. The carry-over edit pass does NOT consume an iteration of the new era's `{MAX_ITERATIONS}` budget.
>
> When `{CARRY_OVER_REVIEW}` is empty (first-era runs, etc.), skip the carry-over edit pass entirely and begin Per-Iteration Full Review at iteration 1 as today.

A new failure mode `input artifact missing or empty: plan file after carry-over edit pass` joins the `## Failure Modes` table under the existing `Input artifact` row (`<which>` extended to `plan file at iteration start | plan file after planner edit pass | plan file after carry-over edit pass`).

**`refine-plan/SKILL.md` changes:**

- Step 1 inputs table gains an optional `CARRY_OVER_REVIEW` input (default empty; not user-supplied directly — set by Step 10 § `(a)` re-entry).
- Step 7 (Assemble coordinator prompt) calls `fill-refine-plan-prompt.py --carry-over-review <path-or-empty>`.
- Step 10 § `not_approved_within_budget` `(a) Keep iterating`: set `CARRY_OVER_REVIEW` to the era-N review file path (the path Step 10a just committed) before re-running from Step 6.

**`fill-refine-plan-prompt.py` changes:**

- New flag `--carry-over-review <path-or-empty>` substitutes `{CARRY_OVER_REVIEW}`. Empty string is a valid value.
- Tests cover empty and populated cases.

### Fix (refine-code)

Mirror the above. Concrete touchpoints depend on whether `code-refiner` has its own prompt template separate from `refine-code-prompt.md`; the spec applies to whichever artifact governs the `code-refiner` agent's first action per invocation.

- New optional input `{CARRY_OVER_REVIEW}` in the `code-refiner`-facing prompt.
- A new "Carry-over remediation pass" section: when set, the inner agent runs one targeted code-edit pass with `{REVIEW_FINDINGS}` populated from the carry-over review file's Critical+Important findings before entering the standard review-fix-review loop.
- The carry-over pass does NOT consume an iteration of the new budget.
- `refine-code/SKILL.md` Step 5 `(a) Keep iterating`: pass the prior era's review file path into the new `code-refiner` dispatch.
- `fill-refine-code-prompt.py` accepts a new `--carry-over-review <path-or-empty>` flag.

### Standalone-use bonus

A user invoking `refine-plan` or `refine-code` directly with a hand-crafted review file via `--carry-over-review <path>` gets an "edit-then-review" loop entry — useful as a one-off "fix this set of findings, then verify" mode that doesn't require running a full prior era first.

---

## Part D — Lower-priority candidates (deferred)

The source TODO lists three further extraction candidates, framed as "if agents continue to mishandle it." None is in scope for this spec; each becomes a follow-up TODO if the rationale materializes.

- **Existing-output-file scan from Step 4.** Today's prose-driven existence check; defer until duplicated.
- **Wave commit-message formatting from Step 12.1.** Subject + body assembly is currently inline; defer until reused.
- **Retry-budget bookkeeping from Step 13.** Shared-counter rules are currently prose; defer until budget mishandling is observed.

---

## Acceptance criteria

This spec is satisfied when, in addition to the per-helper test sets above:

1. `extract-plan-tasks.py` validates required top-level sections, dependency reference targets, and dependency cycles, and emits a `waves` array with sub-wave splitting at `MAX_PARALLEL_HARD_CAP`. `SKILL.md` Steps 2 and 5 delegate to the helper; Step 5's wave-grouping pseudo-code is no longer the executable definition.
2. `reconcile-test-run.py` exists with `capture` and `reconcile` modes. `SKILL.md` Steps 7, 12.2, 14, and 16 invoke the helper for set arithmetic and read its data fields. `integration-regression-gate.md` remains the canonical user-facing summary spec; the orchestrator continues to render summary text from data.
3. `git-workspace-status.py` exists. `SKILL.md` Step 0's inline bash workspace detection is replaced by a helper call; the dirty-workspace menu, reuse log, and new-worktree fall-through remain in `SKILL.md`.
4. `compute-verifier-file-set.py` exists. `SKILL.md` Step 11.2's union rule is delegated to the helper for every task in the wave.
5. `detect-test-command.py` exists and is consumed by `execute-plan/SKILL.md` Step 3, `using-git-worktrees`, and `finishing-a-development-branch`. The `package.json` rule actually parses JSON and checks for a `.scripts.test` string.
6. `parse-coder-report.py` exists. `SKILL.md` Steps 9, 10, and 11 delegate worker-report parsing (status routing, `BLOCKED`/`CONCERNED` task building, files-changed extraction) to the helper.
7. The three Part B menus (Step 13 budget-exhaustion, Step 13 wave-pacing reduced to two options, Step 15 `not_approved_within_budget`) are updated. Step 12's wording is trimmed to the verbatim stop line. The verbatim line `(x) Stop execution — halt the plan; prior wave commits remain in git history` appears byte-equal at Steps 10, 12, 13, 15, and 16. Step 0's `(q) Quit — cancel execution` is unchanged.
8. `refine-plan-prompt.md`, `refine-plan/SKILL.md`, `fill-refine-plan-prompt.py`, the analogous `refine-code` artifacts, and `fill-refine-code-prompt.py` accept and propagate `{CARRY_OVER_REVIEW}` per Part C. Both inner agents (`plan-refiner`, `code-refiner`) execute the carry-over edit/remediation pass before the first review of a new era when `{CARRY_OVER_REVIEW}` is non-empty. The carry-over pass does not consume an iteration of the new budget.
9. Helper docs:
   - Each helper's `--help` documents its protocol-error labels.
   - `agent/skills/execute-plan/scripts/README.md` documents the new helpers (`compute-verifier-file-set.py`, `parse-coder-report.py`) and the extended `extract-plan-tasks.py`.
   - `agent/skills/_shared/scripts/README.md` documents `reconcile-test-run.py`, `git-workspace-status.py`, and `detect-test-command.py`.
10. Tests: every new or extended helper has unit tests under its skill's `scripts/tests/` directory. The existing `npm run test:helpers` invocation runs them. No regression in existing helper tests.
11. No backwards-compatibility shims, dead aliases, deprecation comments, or transitional stubs are introduced. Inline procedures are replaced in place by helper calls.
12. **`agent/skills/execute-plan/SKILL.md` is at most 600 lines** after all changes are applied (today's file is approximately 601 lines). Acts as a forcing function: helper extractions in Part A must reduce inline procedural surface enough to absorb the menu rewrites in Part B and the prose updates that reference the new helpers. If the cap would be violated, the implementer surfaces the gap and adjusts the rewrite (tightens prose, drops redundant cross-references) rather than raising the cap.
