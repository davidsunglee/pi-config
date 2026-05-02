---
name: execute-plan
description: "Executes a structured plan file from .pi/plans/. Decomposes tasks into dependency-ordered waves and dispatches coder subagents in parallel. Use when the user wants to execute an existing plan."
---

# Execute Plan

## Step 0: Worktree pre-flight

Before starting execution, determine the workspace.

**Precondition:** Verify this is a git repository:
```bash
git rev-parse --git-dir 2>/dev/null || { echo "execute-plan requires a git repository."; exit 1; }
```

If the check fails, stop with: "execute-plan requires a git repository."

**Auto-detect:** Determine whether the current workspace is a worktree and whether it is on a feature branch. Use these exact checks:

```bash
# Worktree detection: `git rev-parse --git-dir` returns the per-worktree git dir;
# `--git-common-dir` returns the shared repo dir. In the main working tree these
# resolve to the same absolute path; inside a linked worktree they differ.
GIT_DIR_ABS=$(cd "$(git rev-parse --git-dir)" && pwd)
GIT_COMMON_DIR_ABS=$(cd "$(git rev-parse --git-common-dir)" && pwd)
if [ "$GIT_DIR_ABS" != "$GIT_COMMON_DIR_ABS" ]; then
  IS_WORKTREE=1
else
  IS_WORKTREE=0
fi

# Current branch (empty string if detached HEAD)
CURRENT_BRANCH=$(git branch --show-current)

# Branch label: use branch name, or short SHA if detached HEAD.
if [ -n "$CURRENT_BRANCH" ]; then
  BRANCH_LABEL="$CURRENT_BRANCH"
else
  BRANCH_LABEL="detached HEAD at $(git rev-parse --short HEAD)"
fi

# Feature-branch detection: any non-empty branch that is not main/master/develop
case "$CURRENT_BRANCH" in
  ""|main|master|develop) IS_FEATURE_BRANCH=0 ;;
  *)                      IS_FEATURE_BRANCH=1 ;;
esac
```

**If `IS_WORKTREE=1` or `IS_FEATURE_BRANCH=1`:** Reuse the existing workspace, but log and safety-check it first.

1. **Log the reused workspace explicitly.** Print the concrete path and the reason reuse was selected:
   ```bash
   WORKSPACE_PATH=$(git rev-parse --show-toplevel)
   ```

   **Reuse-reason precedence (pick exactly one message):**
   - If `IS_WORKTREE=1` — emit the worktree message, regardless of whether `IS_FEATURE_BRANCH` is also 1. A linked worktree is the more specific condition and takes priority:
     `Reusing current workspace: <WORKSPACE_PATH> (reason: already inside worktree for branch '<BRANCH_LABEL>')`
   - Else (`IS_WORKTREE=0` and `IS_FEATURE_BRANCH=1`) — emit the feature-branch message:
     `Reusing current workspace: <WORKSPACE_PATH> (reason: already on feature branch '<BRANCH_LABEL>')`

   `<BRANCH_LABEL>` is the value computed in the auto-detect block above (branch name, or `detached HEAD at <short-sha>` for detached HEAD).

   This log is mandatory for every reuse, including both feature-branch reuse and worktree reuse.

2. **Check whether the reused workspace is dirty.** Treat the workspace as dirty if git reports any of the following:
   - Modified tracked files
   - Staged (index) changes
   - Untracked files

   A single `git status --porcelain` check covers all three:
   ```bash
   DIRTY_STATUS=$(git status --porcelain)
   ```
   If `DIRTY_STATUS` is empty, the workspace is clean. If it contains any lines, the workspace is dirty.

3. **If the reused workspace is clean:** auto-proceed to Step 1 after the reuse log. Do not add any extra confirmation prompt.

4. **If the reused workspace is dirty:** warn the user before continuing and offer three choices:
   ```
   ⚠️ Reused workspace <WORKSPACE_PATH> has uncommitted changes:
   <DIRTY_STATUS>

   Options:
   (c) Continue in this workspace — proceed as-is, mixing plan work with existing changes
   (q) Quit — cancel execution
   (n) Create a new worktree instead — abandon reuse and fall back to the normal new-worktree flow
   ```

   - **(c) Continue:** proceed to Step 1 in the current workspace.
   - **(q) Quit:** stop with `Plan execution cancelled.`
   - **(n) New worktree instead:** fall through to the new-worktree flow below (the same flow used when starting from main/master/develop), including the usual suggested branch name derived from the plan filename. The settings summary (Step 3) will then show `new worktree (branch: <suggested-branch>)`.

Once reuse is accepted (clean, or dirty with `(c) Continue`), the settings summary (Step 3) reflects it as:
```
    Workspace:          current workspace (on <BRANCH_LABEL>)
```
where `<BRANCH_LABEL>` is the value computed in the auto-detect block above (branch name, or `detached HEAD at <short-sha>`).

**If on main/master/develop and NOT in a worktree, or the user chose `(n) Create a new worktree instead` above:** The settings summary (Step 3) will show `new worktree (branch: <suggested-branch>)` as the default.

If the user accepts the worktree default (or selects it during customization):
1. Suggest a branch name derived from the plan filename — a slash-free slug produced by stripping the leading date and the `.md` extension. For example, plan `2026-04-06-execute-plan-enhancements.md` → branch `execute-plan-enhancements`. Prefer the bare slug; avoid prefixes that introduce a `/` (e.g. `plan/...`) since slashes produce nested worktree directories.
2. Follow the `using-git-worktrees` skill to create the isolated workspace:
   - Directory selection (existing `.worktrees/` > project config > ask)
   - Safety verification (git check-ignore for project-local directories)
   - Project setup (auto-detect package.json, Cargo.toml, etc.)
   - Baseline test verification
3. Continue all subsequent steps in the worktree.

If the user selects "current workspace" during customization, proceed without a worktree.

## Step 1: Locate the plan file

- If the user provides a path, use it directly.
- If the user says "run the plan" or similar without a path, list `.pi/plans/` (excluding `done/`) and let the user pick.
- If only one plan exists, confirm with the user before proceeding.
- Read the full contents of the plan file.

## Step 2: Validate the plan

Check the plan contains all of:
1. A header (goal, architecture summary, tech stack)
2. A file structure section (files with Create/Modify annotations)
3. Numbered tasks — each with `**Files:**`, checkbox steps, acceptance criteria, and a model recommendation
4. A Dependencies section
5. A Risk assessment

The plan may also contain an optional `## Test Command` section with a bash command for running the project's test suite. If present, extract the command (the content of the bash fenced code block inside `## Test Command`) for use in later steps (baseline capture and integration tests). If absent, test command detection falls back to auto-detect in Step 3.

If any of the 5 required sections is missing: **stop and tell the user** what's missing, and suggest re-generating with the `generate-plan` skill. Do NOT guess or fill in missing sections.

## Step 3: Confirm execution settings

Present a single settings confirmation showing the plan context and recommended defaults:

```
Plan:  <plan filename>
Goal:  <plan goal>
Tasks: <count> across <N> waves

    Workspace:          <see workspace values below>
    TDD:                enabled
    Execution:          parallel, pause on failure
    Integration test:   <see defaults below>
    Final review:       enabled (max 3 remediation iterations)

Ready to execute: (s)tart / (c)ustomize / (q)uit
```

**Workspace values:**
- Already on a feature branch or in a worktree, and reuse was accepted in Step 0 (clean workspace, or dirty with `(c) Continue`): `current workspace (on <BRANCH_LABEL>)`
- On main/master/develop and not in a worktree (default): `new worktree (branch: <suggested-branch>)`
- Already on a feature branch or in a worktree, but the user declined reuse in Step 0: treated identically to the main-branch new-worktree default above. See Step 0 for the reuse-decision rules.

**Integration test value:** When enabled and a test command is available, include the command: `enabled (<command>)`. When no test command is available: `disabled (no test command)`.

**Defaults:**

| Setting | Default | Notes |
|---------|---------|-------|
| Workspace | new worktree | See Step 0 for the reuse-vs-new-worktree decision rules. |
| TDD | enabled | Can disable for non-code plans (docs, config, content) |
| Execution | parallel, pause on failure | Can customize to sequential, or change pacing |
| Integration test | enabled | If a test command is available, show `enabled (<command>)`. If no test command, show `disabled (no test command)` |
| Final review | enabled (max 3 iterations) | Iterative review-remediate loop after all waves — can disable or adjust max iterations |

**Test command resolution order:**
1. If the plan contains a `## Test Command` section (extracted in Step 2), use that command.
2. Otherwise, auto-detect from project files:
   - `package.json` with a `test` script → `npm test`
   - `Cargo.toml` → `cargo test`
   - `Makefile` with a `test:` target → `make test`
   - `pyproject.toml` or `setup.py` → `pytest`
   - `go.mod` → `go test ./...`
3. If neither yields a command, show "not detected" in the settings. During customize, allow the user to provide a command or confirm no tests.

**If `s`:** Accept all defaults and proceed to Step 4.

**If `c`:** Ask each setting individually:
1. Workspace — New worktree / Current workspace. Skip only when Step 0 auto-detected reuse and the user accepted it (reused workspace is then fixed); ask normally in all other cases.
2. TDD — Enabled / Disabled
3. Execution mode — Sequential / Parallel
4. Wave pacing (if parallel) — Pause between waves / Auto-continue / Auto-continue unless failures
5. Integration test — Enabled / Disabled. If enabling and no test command yet detected, ask: "Enter test command (e.g., `npm test`):"
6. Final review — Enabled / Disabled. If enabling, ask: "Max remediation iterations (default 3):"

After customization, show the final settings summary for confirmation.

**If `q`:** Cancel execution and stop with: `Plan execution cancelled.`

After settings are confirmed, if Worktree was selected and Step 0 hasn't executed worktree setup yet, execute it now.

## Step 4: Check for existing output files

Before execution, scan the plan's task list for output file paths. If any already exist (from a prior partial run), ask the user:
- **Skip** those tasks (and their dependents if outputs appear valid)
- **Re-run** them (overwrite existing files)

## Step 5: Build dependency graph and group into waves

1. Parse every task number and its dependencies from the Dependencies section.
2. Assign each task to the earliest wave where all its dependencies are in prior waves.
   - Wave 1 = tasks with no dependencies
   - Wave 2 = tasks depending only on Wave 1 tasks
   - Wave N = tasks whose latest dependency is in Wave N−1

Example:
```
Dependencies:
- Task 3 depends on: Task 1, Task 2
- Task 4 depends on: Task 1
- Task 5 depends on: Task 3, Task 4

Wave 1: [Task 1, Task 2]
Wave 2: [Task 3, Task 4]
Wave 3: [Task 5]
```

If a wave has more than 8 tasks, split it into sequential sub-waves of ≤8 tasks each. This is a pi-config wave-planning convention that keeps one wave at or below the pi-interactive-subagent extension's in-flight hard cap (`MAX_PARALLEL_HARD_CAP = 8`, see `~/Code/pi-interactive-subagent/pi-extension/orchestration/types.ts`) — do not exceed it, because the extension rejects dispatches above this limit. If that constant changes, update this cap to match.

## Step 6: Resolve model tiers

Read the model matrix from `~/.pi/agent/model-tiers.json`:

```bash
cat ~/.pi/agent/model-tiers.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

Map each task's model recommendation to the tier map:

| Task recommendation | Model to use |
|---------------------|-------------|
| `capable` | `capable` from model-tiers.json |
| `standard` | `standard` from model-tiers.json |
| `cheap` | `cheap` from model-tiers.json |

If a task has no tier specified, apply this rubric:
- Touches 1–2 files with a complete spec → `cheap`
- Touches multiple files with integration concerns → `standard`
- Requires design judgment or broad codebase understanding → `capable`

Always pass an explicit `model` override per task in the subagent dispatch using the resolved value from the tier map. Do not parse, guess, or derive model name strings — use the exact strings from `model-tiers.json`.

### Dispatch resolution

Follow the canonical procedure in [`agent/skills/_shared/model-tier-resolution.md`](../_shared/model-tier-resolution.md) to resolve the dispatch `cli` for each task's model. `<agent> = coder`; `<tier>` is the per-task tier resolved from the table above (`capable`, `standard`, or `cheap`).

Always pass `cli` explicitly on every orchestration call, even when it resolves to `"pi"`.

## Step 7: Baseline test capture

**Skip if:** Integration test is disabled (Step 3 settings) or no test command is available.

Before executing the first wave, run the integration suite via the `test-runner` subagent (see the shared test-runner dispatch subsection below) with `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/baseline.log` (an absolute path under the plan's working directory) and `{PHASE_LABEL} = baseline`. The agent applies the two-bucket extraction contract documented in `agent/agents/test-runner.md`: stable suite-native identifiers in `FAILING_IDENTIFIERS:` and non-reconcilable failure evidence (panics, build errors, collection errors with no per-test identifier) in `NON_RECONCILABLE_FAILURES:`. The orchestrator reads both buckets back from the artifact.

#### Baseline recording

After artifact readback succeeds, classify the baseline by both `EXIT_CODE` and the two artifact buckets (`FAILING_IDENTIFIERS:` and `NON_RECONCILABLE_FAILURES:`):

**If `EXIT_CODE == 0`** (and both `FAILING_IDENTIFIERS_COUNT == 0` and `NON_RECONCILABLE_COUNT == 0` by the test-runner contract):
Record `baseline_failures := ∅` (the empty set) and proceed. `baseline_failures` is frozen at this point and never mutated for the rest of the plan run.

**If `EXIT_CODE != 0` AND `NON_RECONCILABLE_COUNT == 0`** (only stable failures at baseline):
Read the failing-identifier set from the artifact's `FAILING_IDENTIFIERS:` block and record `baseline_failures` as that set (frozen). Warn the user:
```
⚠️ Baseline: N tests already failing before execution. Only failures with stable identifiers not in this baseline will be flagged after each wave.
```
`baseline_failures` is frozen at this point and never mutated for the rest of the plan run. Proceed with execution.

**If `EXIT_CODE != 0` AND `NON_RECONCILABLE_COUNT != 0`** (baseline contains non-reconcilable evidence):
Record `baseline_failures` from the artifact's `FAILING_IDENTIFIERS:` block (which may be empty). Do NOT add any non-reconcilable evidence to `baseline_failures` — non-reconcilable entries are never set members. Present the user with an explicit decision:
```
⚠️ Baseline contains <M> non-reconcilable failure(s) (failures with no stable suite-native identifier).
These cannot be safely exempted by stable-identifier comparison: each later integration run will treat any non-reconcilable failure as a current gate-blocking failure, including ones that may already exist before this plan runs.

<render the three-section user-facing summary from integration-regression-model.md, with current_failing_stable from FAILING_IDENTIFIERS and current_non_reconcilable from NON_RECONCILABLE_FAILURES>

Options:
(c) Continue anyway — proceed with the baseline as-is; later non-reconcilable failures will block their gates and require Debug or Stop.
(x) Stop plan execution — fix the suite first.
```
- **(c) Continue anyway:** freeze `baseline_failures` (which may be empty) and proceed. `baseline_failures` is never mutated for the rest of the plan run.
- **(x) Stop plan execution:** stop with `Plan execution cancelled — fix baseline non-reconcilable failures first.` The per-plan `.pi/test-runs/<plan-name>/` directory is preserved on this exit path so the user can inspect the baseline artifact.

In all three branches, `baseline_failures` is frozen once recorded and never mutated by any later wave, post-wave continue, debugging pass, or final-gate run.

#### Integration regression model

See [`integration-regression-model.md`](integration-regression-model.md) for the baseline-only reconciliation model: the frozen `baseline_failures` set, per-run inputs (`current_failing_stable`, `current_non_reconcilable`, `current_non_baseline_stable`), the byte-for-byte set-comparison rules, the pass/fail classification, and the user-facing summary format. Step 12, the Step 12 Debugger-first flow, and Step 16 all consume this same model.

#### Test-runner dispatch (shared)

Step 7, Step 12.2, the Step 12 Debugger-first flow's success re-test, and Step 16's final-gate gate use the same `test-runner` subagent to execute the integration suite. The orchestrator never runs the test command itself.

**Per-plan runs directory.** Compute `<plan-name>` as the plan filename without the `.md` extension; before the first `test-runner` dispatch in the plan, create it with `mkdir -p .pi/test-runs/<plan-name>`.

**Filename scheme (relative to the plan's working directory).** Join each relative path with `<working-dir>` to produce the absolute `{ARTIFACT_PATH}` supplied to `test-runner`:
- Step 7 baseline capture: `.pi/test-runs/<plan-name>/baseline.log` → `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/baseline.log` (single file; written exactly once).
- Step 12.2 post-wave + Step 12 Debugger-first re-test: `.pi/test-runs/<plan-name>/wave-<N>-attempt-<K>.log` → `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/wave-<N>-attempt-<K>.log`, where `<K>` increments on every re-entry within wave `<N>`.
- Step 16 final-gate runs: `.pi/test-runs/<plan-name>/final-gate-<seq>.log` → `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/final-gate-<seq>.log`, where `<seq>` increments on every gate entry.

**Dispatch.** Read `agent/skills/execute-plan/test-runner-prompt.md` once and fill `{TEST_COMMAND}` from Step 3 settings, `{WORKING_DIR}` with the absolute working directory, `{ARTIFACT_PATH}` with the absolute path above, and `{PHASE_LABEL}` with `baseline`, `wave-<N>-attempt-<K>`, or `final-gate-<seq>`.

Resolve `(model, cli)` for this dispatch per the canonical procedure in [`agent/skills/_shared/model-tier-resolution.md`](../_shared/model-tier-resolution.md): `<agent> = test-runner`, `<tier> = crossProvider.cheap`. On any of the four documented failure conditions, emit the corresponding canonical template byte-equal with the parameter values above and stop the call site that triggered the dispatch — do NOT silently fall back to `cheap`, `standard`, or a CLI default.

Dispatch via `subagent_run_serial { tasks: [{ name: "test-runner: <phase label>", agent: "test-runner", task: "<filled test-runner-prompt.md>", model: "<resolved crossProvider.cheap model>", cli: "<dispatch[<provider>] for that model>" }] }`.

**Artifact readback.** After dispatch, read `results[0].finalMessage`; on any failure below, stop the call site that triggered dispatch (do NOT fall back to running the test command in-orchestrator):
1. **Marker extraction.** Find the LAST line in `finalMessage` matching `^TEST_RESULT_ARTIFACT: (.+)$`; if absent, stop with reason `test-runner response missing TEST_RESULT_ARTIFACT marker`.
2. **Path-equality check.** Compare the marker path to `{ARTIFACT_PATH}`; if they differ, stop with reason `test-runner artifact path mismatch: expected <X>, got <Y>`.
3. **Existence-and-non-empty check.** Read the marker path from disk; if missing or empty (zero bytes, or only whitespace), stop with reason `test-runner artifact missing or empty at <path>`.
4. **Header-parse check.** Confirm the structured header has `PHASE`, `COMMAND`, `WORKING_DIRECTORY`, `EXIT_CODE`, `TIMESTAMP`, `FAILING_IDENTIFIERS_COUNT`, `FAILING_IDENTIFIERS:`, `END_FAILING_IDENTIFIERS`, `NON_RECONCILABLE_COUNT`, `NON_RECONCILABLE_FAILURES:`, and `END_NON_RECONCILABLE_FAILURES` in this exact order, followed by `--- RAW RUN OUTPUT BELOW ---`; if not, stop with reason `test-runner artifact header malformed at <path>: <specific check>`.

**Dispatch-failure reasons.** If `subagent_run_serial` is unavailable, stop with reason `test-runner dispatch unavailable`. If dispatch returns an error result, stop with reason `test-runner dispatch failed`.

**Reading run results.** On all checks passing, parse the lines between `FAILING_IDENTIFIERS:` and `END_FAILING_IDENTIFIERS` as the run's stable failing-identifier set; parse the entries between `NON_RECONCILABLE_FAILURES:` and `END_NON_RECONCILABLE_FAILURES` (separated by single blank lines, multi-line entries permitted) as the run's non-reconcilable failure list; and read `EXIT_CODE`. These are the inputs Step 7 baseline classification, Step 12 post-wave reconciliation, the Debugger-first re-test, and Step 16 final-gate reconciliation consume. The integration regression model in `integration-regression-model.md` defines how each consumer applies them.

## Step 8: Execute waves

Before dispatching the first wave, record the current HEAD SHA for the post-completion review:
```bash
PRE_EXECUTION_SHA=$(git rev-parse HEAD)
```

### Main-branch confirmation

If executing directly on main/master/develop (not on a feature branch, not in a worktree), prompt the user once before the first commit:

```
⚠️ You're on `<branch_name>`. Commits will be made directly to <branch_name> after each wave.
Continue? (y/n)
```

- **If `y`:** Proceed with commits after each wave as configured.
- **If `n`:** Cancel execution. The user should create a feature branch or worktree first.

This confirmation is asked once at the start, not per wave. If the user is on a feature branch or in a worktree, skip this check entirely — commits on feature branches are expected.

For each wave, dispatch all tasks in parallel:
```
subagent_run_parallel { tasks: [
  { name: "<task-N>: <task-title>", agent: "coder", task: "<self-contained prompt>", model: "<resolved>", cli: "<resolved>" },
  { name: "<task-N>: <task-title>", agent: "coder", task: "<self-contained prompt>", model: "<resolved>", cli: "<resolved>" },
  ...
]}
```

For sequential mode, dispatch one task at a time:
```
subagent_run_serial { tasks: [
  { name: "<task-N>: <task-title>", agent: "coder", task: "<self-contained prompt>", model: "<resolved>", cli: "<resolved>" }
]}
```

Read `results[0].finalMessage` from the orchestration result to get the worker's report; `subagent_run_parallel` returns results in input-task order so `results[i].finalMessage` corresponds to `tasks[i]`.

### Assembling worker prompts

Read [execute-task-prompt.md](execute-task-prompt.md) in this directory once (before the first wave). For each task, fill the placeholders:

- `{TASK_SPEC}` — the full text of the task from the plan: task name, Files section, all checkbox steps, and acceptance criteria. Paste the complete text, do not summarize.
- `{CONTEXT}` — where this task fits in the plan. Include:
  - The plan's Goal (one line)
  - Which wave this task is in and what other tasks are in the same wave
  - What was completed in prior waves (task names and key outputs, not full details)
  - Any dependencies this task has and what those tasks produced
- `{WORKING_DIR}` — the absolute path to the working directory (the worktree path if using a worktree, otherwise the project root)
- `{TDD_BLOCK}` — if TDD is enabled (Step 3 settings), read `agent/skills/execute-plan/tdd-block.md` and substitute its full contents verbatim. If TDD is disabled, substitute the empty string.

The filled template becomes the task prompt for the `coder` subagent. The template already includes self-review instructions, escalation guidance, code organization guidance, and the report format — do not add these separately.

## Step 9: Handle worker status codes

After each wave completes, process each worker response:

- **DONE** → proceed to verification (Step 11).
- **DONE_WITH_CONCERNS** → record the worker's freeform concerns with the task. Do NOT resolve the checkpoint inline. Let the wave drain, then Step 10 (wave gate) presents a single combined wave-level concerns checkpoint for every `DONE_WITH_CONCERNS` task in the wave before Step 11 runs. Concerns do not need type labels and are not preclassified by severity.
- **NEEDS_CONTEXT** → provide the missing context and re-dispatch the task immediately.
- **BLOCKED** → do NOT recover inline. Record the worker's blocker details with the task, leave the task marked `BLOCKED`, and let the wave drain. The combined escalation is handled in Step 10 (wave gate), which surfaces every blocked task in the wave to the user before Step 11, Step 12, or any subsequent wave runs. The four canonical interventions (more context, better model, split into sub-tasks, stop execution) live in Step 10.

After the wave drains (i.e., every dispatched worker in the wave has returned and been classified), Step 10 runs to handle any `BLOCKED` tasks first and then any `DONE_WITH_CONCERNS` tasks. Only after the wave gate exits does Step 11 (verification) run.

**Never ignore an escalation or re-dispatch the same task to the same model without changes.**

## Step 10: Wave gate: blocked and concerns handling

Run this gate once per wave after every dispatched worker has been classified by Step 9. It handles both `STATUS: BLOCKED` and `STATUS: DONE_WITH_CONCERNS` in a fixed order: blocked handling runs first, then concerns handling, then the wave exits to verification (Step 11). Any wave with at least one `BLOCKED` response pauses here before any later wave, before Step 11, and before Step 12. A wave with no `BLOCKED` and no `DONE_WITH_CONCERNS` passes through this gate without user interaction and proceeds directly to Step 11.

### 1. Drain the current wave

Wait for every dispatched worker to return and Step 9 to classify each response before proceeding; the wave is then "drained." Do not start the next wave or run Step 11/Step 12 yet. Build `BLOCKED_TASKS` = every task whose most recent Step 9 status is `BLOCKED` and `CONCERNED_TASKS` = every task whose most recent Step 9 status is `DONE_WITH_CONCERNS`.

### 2. Blocked handling (runs first)

If `BLOCKED_TASKS` is empty, skip to §3 (concerns handling).

If `BLOCKED_TASKS` is non-empty, present a single combined escalation view for all `BLOCKED_TASKS` — do NOT present blocked tasks one at a time. The view MUST include:

1. A header line naming the wave, e.g., `🚫 Wave <N>: <count> task(s) BLOCKED. Execution paused before any later wave.`
2. A "Wave outcomes" summary block listing every task in the wave and its Step 9 status: `DONE`, `DONE_WITH_CONCERNS`, or `BLOCKED`. Include task number and task title for each. Successful same-wave tasks MUST appear here so the user can see what completed alongside the blockers.
3. A "Blocked tasks" block, one entry per task in `BLOCKED_TASKS`, each containing:
   - Task number and task title (the heading from the plan)
   - The blocker text from the worker's `## Concerns / Needs / Blocker` section (full text, not truncated)
   - Files the task was scoped to (the task's `**Files:**` section from the plan)

Example layout:

~~~
🚫 Wave 2: 1 task(s) BLOCKED. Execution paused before any later wave.

Wave outcomes:
  - Task 3: Add baseline test capture           DONE
  - Task 4: Add main-branch confirmation guard  BLOCKED

Blocked tasks:

[Task 4] Add main-branch confirmation guard
  Files: agent/skills/execute-plan/SKILL.md
  Blocker:
    <full blocker text from the worker report>
~~~

For each task in `BLOCKED_TASKS`, ask the user for an intervention choice independently. Do not force a single action across all blocked tasks. Present choices one task at a time after the combined view has been shown, using this form per task:

~~~
Task <N>: <task_title> (current tier: <tier>) — choose an intervention:
  (c) More context      — re-dispatch this task with additional context you supply
  (m) Better model      — re-dispatch this task with a more capable model tier
                            [omit this line if current tier is already `capable`]
  (s) Split into sub-tasks — break this task into smaller sub-tasks and dispatch them
  (x) Stop execution    — halt the plan; prior wave commits remain in git history
~~~

These are the canonical intervention options for blocked tasks. Do not invent new options. The `(m) Better model` option is suppressed (not offered, and not selectable) whenever the task's current model tier is already `capable`, because there is no higher tier to escalate to and re-dispatching to the same model would violate the Step 9 rule "Never ignore an escalation or re-dispatch the same task to the same model without changes." When `(m)` is suppressed, the user must pick `(c)`, `(s)`, or `(x)` for that task.

- **(c) More context:** prompt the user for the additional context (free-form text). Re-dispatch this single task to a `coder` worker with the original task spec plus the supplied context appended under a `## Additional Context` section in the worker prompt. Keep the task's existing model tier unless the user also picks (m) for the same task on a subsequent pass.
- **(m) Better model:** only offered when the task's current tier is `cheap` or `standard`. Re-dispatch this single task to a `coder` worker using the next tier up (`cheap` → `standard`, `standard` → `capable`). Resolve the concrete model string via `~/.pi/agent/model-tiers.json` as described in Step 6.
- **(s) Split into sub-tasks:** decompose the task into smaller sub-tasks in-session. Each sub-task must keep the same output file(s) and acceptance criteria coverage between them (no criterion may be dropped). Dispatch the sub-tasks as a mini-wave bounded by the pi-interactive-subagent `MAX_PARALLEL_HARD_CAP` cap (see Step 5). If there is a natural ordering between sub-tasks, run them sequentially instead. The parent task's slot is replaced by the sub-tasks for all subsequent tracking; each sub-task is treated as an independent task in this wave for Step 9 classification and gate re-entry. ⚠ Sub-task dispatches run pre-commit: their changes must remain in the working tree (uncommitted) at the point Step 11 dispatches the verifier. See Step 11.2 for the fallback diff range if this is violated. Retry budget: see Step 13.
- **(x) Stop execution:** halt execution immediately. Do NOT perform Step 11 or Step 12 for this wave. Report partial progress via Step 14. All prior wave commits remain in git history. The per-plan .pi/test-runs/<plan-name>/ directory is preserved on this exit path so the user can inspect run artifacts after stop.

If the user picks `(x) Stop execution` for any blocked task, stop the whole plan regardless of outstanding choices for other blocked tasks. Do not continue asking about the remaining blocked tasks.

After collecting a non-stop intervention for every task in `BLOCKED_TASKS`, re-dispatch all of them together (in parallel, subject to `MAX_PARALLEL_HARD_CAP`). Use the same dispatch shape as Step 8. Wait for all re-dispatched workers to return. Apply Step 9 to the new responses. Rebuild `BLOCKED_TASKS` and `CONCERNED_TASKS` from the updated wave state, then re-enter §2 with the new `BLOCKED_TASKS`. The blocked phase repeats until `BLOCKED_TASKS` is empty or the user picks `(x) Stop execution`. For tasks where `(s) Split into sub-tasks` was chosen, the sub-tasks' responses replace the original task's slot; if any sub-task returns `BLOCKED`, it appears in `BLOCKED_TASKS` on the next pass. Each re-dispatch counts toward the per-task retry budget (see Step 13).

### 3. Concerns handling (runs second)

**Precondition:** §2 has exited (i.e., `BLOCKED_TASKS` is empty); every task in the wave is `DONE` or `DONE_WITH_CONCERNS`.

If `CONCERNED_TASKS` is empty, skip to §4 (gate exit) and proceed directly to Step 11.

Otherwise, present every concerned task together in a single combined message — do not prompt one-task-at-a-time:

```
⚠️ Wave <N>: <M> task(s) returned DONE_WITH_CONCERNS. Review before verification.

── Task 3: <short title> ──────────────────────────────────
  Files: <path/one>, <path/two>
  Concerns:
    - <worker concern, verbatim>
    - <worker concern, verbatim>
───────────────────────────────────────────────────────────

Options:
  (c) Continue to verification            — proceed to Step 11 with all tasks as-is
  (r) Remediate selected task(s)          — specify task number(s) and guidance; re-dispatch those tasks
  (x) Stop execution                      — halt the plan; prior wave commits remain in git history
```

- **(c) Continue to verification.** Exit §3. Leave every concerned task's Step 9 status as `DONE_WITH_CONCERNS` and proceed to §4; the verifier is the next gate and will judge the work on its own terms.
- **(r) Remediate selected task(s).** Prompt the user for (a) the task numbers to remediate (one or more from `CONCERNED_TASKS`) and (b) a single freeform guidance block that applies to those tasks. Re-dispatch each selected task to a fresh `coder` worker using the same task spec, with the worker's original concerns block and the user's guidance appended under a `## Concerns To Address` section in the worker prompt. Each re-dispatch counts against that task's retry budget; see Step 13. When the re-dispatches return, apply Step 9 again. If any re-dispatched task comes back `BLOCKED`, return to §2 with that task. Otherwise rebuild `CONCERNED_TASKS` from the new wave state and re-enter §3 from its top; a task that returns `DONE` after remediation is removed from `CONCERNED_TASKS`, and a task that returns `DONE_WITH_CONCERNS` again re-appears in the next combined view. Tasks that were not selected for remediation keep their prior Step 9 status and re-appear unchanged in the next view.
- **(x) Stop execution.** Halt immediately. Do NOT run Step 11 or Step 12 for this wave. Report partial progress via Step 14. All prior wave commits remain in git history. The per-plan .pi/test-runs/<plan-name>/ directory is preserved on this exit path so the user can inspect run artifacts after stop.

Repeat §3 until `CONCERNED_TASKS` is empty (either because the user picked `(c)` or because every concerned task has been remediated to `DONE`) or the user picks `(x)`.

### 4. Gate exit

This gate exits when `BLOCKED_TASKS` is empty and `CONCERNED_TASKS` is either empty or the user picked `(c) Continue to verification`. Every task in the wave is then `DONE` or `DONE_WITH_CONCERNS` and the wave proceeds to Step 11. Tasks still `DONE_WITH_CONCERNS` flow into Step 11 as-is; the verifier's verdict is authoritative. Selecting `(x) Stop execution` from either the blocked-handling phase (§2) or the concerns-handling phase (§3) halts the entire plan via Step 14 and does NOT run Step 11 or Step 12 for this wave.

## Step 11: Verify wave output

**Precondition:** Step 10 (wave gate) must have exited. Verification for each task runs in a fresh-context `verifier` subagent via `agent/skills/execute-plan/verify-task-prompt.md`. The verifier collects command evidence in Phase 1 (executing each command-style `Verify:` recipe byte-equal verbatim) and judges each criterion in Phase 2; the orchestrator dispatches and routes the verdict.

**Protocol-error stop — missing `Verify:` recipes:** Before dispatching the verifier, check that every acceptance criterion for the task has an attached `Verify:` recipe in the plan. If any acceptance criterion is missing a `Verify:` recipe at execute time, STOP execution for this wave. Report the offending task number and criterion text to the user, recommend re-running `generate-plan` to regenerate the plan, and do not dispatch the verifier, do not treat the task as passing, and do not silently skip verification. A plan without complete `Verify:` recipes is a protocol error from generate-plan and must be regenerated before execution can continue.

### Step 11.2: Dispatch the verifier

For each task in the wave (regardless of its Step 9 status, except `BLOCKED` which is already handled in Step 10), dispatch a fresh `verifier` subagent using the template at `agent/skills/execute-plan/verify-task-prompt.md`. The verifier executes command-style `Verify:` recipes in Phase 1 and judges every criterion in Phase 2, then returns per-criterion verdicts under `## Per-Criterion Verdicts` and an overall `VERDICT:` line under `## Overall Verdict`. The orchestrator does not pre-collect command evidence — that work moved into the verifier itself per `agent/agents/verifier.md`.

Verifier dispatches for the wave run in parallel, bounded by the pi-interactive-subagent `MAX_PARALLEL_HARD_CAP` cap (see Step 5). Issue all verifier subagents concurrently up to the cap and wait for all of them to return before parsing in Step 11.3.

Fill the template's placeholders as follows:

- `{TASK_SPEC}` — the task block from the plan, verbatim.
- `{ACCEPTANCE_CRITERIA_WITH_VERIFY}` — the acceptance criteria list for the task, each paired with its `Verify:` recipe, numbered starting at 1.
- `{PHASE_1_RECIPES}` — the orchestrator-extracted, command-style `Verify:` recipes for this task, numbered to match the criterion index in `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`. Format each entry as `[Recipe for Criterion N] <recipe text>` on its own line. A criterion whose `Verify:` recipe is file-inspection or prose-inspection produces no entry — gaps in numbering are expected and correct. If the task has no command-style recipes, leave this section empty.
- `{MODIFIED_FILES}` — the orchestrator-assembled verifier-visible file set, as a newline-separated, deduplicated list of paths. The orchestrator MUST compute this set as the union of three inputs so that the worker being judged cannot narrow its own verification surface:
  1. **Task-declared scope.** Every path listed in the plan task's `**Files:**` section, verbatim. A task that declares a file is on the hook for that file regardless of whether the worker reported touching it.
  2. **Worker-reported changes.** The paths listed in the worker's `## Files Changed` section. These are informative but NOT authoritative on their own — a worker that omits a file it actually modified cannot hide that file from the verifier.
  3. **Orchestrator-observed diff state.** The paths surfaced by `git status --porcelain` (working tree and index, relative to the last commit) for the wave, plus any files present in the wave's `git diff HEAD` output. In parallel-wave dispatch where multiple tasks share the working tree, scope this to files that plausibly belong to this task — at minimum include every path from inputs 1 and 2 that also appears in the orchestrator-observed set, and include any additional orchestrator-observed paths that fall under the task's declared `**Files:**` directories. Include all orchestrator-observed paths when the wave contains only this task.
  Deduplicate the union and present it as the verifier-visible file set. Explicitly record in the prompt that this set is orchestrator-assembled so the verifier knows it is not simply the worker's self-report.
- `{DIFF_CONTEXT}` — the uncommitted wave diff against `HEAD`, produced as follows. For tracked files modified in this wave, use `git diff HEAD -- <modified files>`. For newly created (untracked) files, `git diff HEAD` does not produce output; instead, generate a diff for each new file via `git diff --no-index /dev/null -- <file>` (which produces a unified diff showing the entire file as added). Concatenate both outputs into a single diff block. To identify which files are new vs. modified, check `git status --porcelain -- <modified files>`: entries prefixed with `??` are untracked/new; all others are tracked modifications. This reflects the working tree vs. the last commit, which is where wave changes live before Step 12's commit. Do NOT substitute a committed-range diff (e.g. a diff between `HEAD` and a prior commit) or a `--staged` diff; wave changes have not been committed yet. **Diff truncation rule.** If the combined diff output exceeds 500 lines or 40 KB, truncate it by keeping the first 300 lines and the last 100 lines, separated by a single marker line that records the pre-truncation line count and byte count (e.g., `[diff truncated — <N> lines, <B> bytes total; verifier should note this and fall back to reading the named files for file-inspection criteria whose relevant code may lie in the truncated window]`). Never silently drop diff output. If a file-inspection criterion cannot be judged because the relevant hunk is inside the truncated window, the verifier should read the named file(s) directly from `## Verifier-Visible Files` rather than guessing. **Sub-task dispatch carve-out:** Sub-task dispatches from the Blocked handling phase of Step 10 (split-into-sub-tasks) MUST occur pre-commit — their changes must remain in the working tree at Step 11 time so `git diff HEAD` captures them alongside the rest of the wave. Step 12's commit is the only sanctioned transition from working tree to committed state for wave changes, and it runs after Step 11. If for any reason a sub-task's changes were committed before Step 11 runs for this wave (a protocol violation that should not normally occur), substitute `git diff <pre-subtask-commit>..HEAD -- <modified files>` for those criteria so the verifier still sees the sub-task's changes; otherwise file-inspection criteria will fail for insufficient evidence even though the work was done.
- `{WORKING_DIR}` — the plan's working directory.

**Verifier model tier:** Every verifier dispatch in execute-plan uses the model resolved from `crossProvider.standard` per the canonical procedure in [`agent/skills/_shared/model-tier-resolution.md`](../_shared/model-tier-resolution.md): `<agent> = verifier`, `<tier> = crossProvider.standard`. Verifier model selection is no longer based on the model tier used by the task under review (the prior `standard` default plus `capable` upgrade rule is removed). On any of the four documented failure conditions, emit the corresponding canonical template byte-equal and stop — do not silently fall back to a non-cross-provider tier.

Dispatch the verifier wave as `subagent_run_parallel { tasks: [{ name: "<task-N>: <task-title>", agent: "verifier", task: "<filled verify-task-prompt.md>", model: "<resolved crossProvider.standard model>", cli: "<dispatch[<provider>] for that model>" }, ...] }`.

### Step 11.3: Parse verifier output and gate the wave

The verifier returns a report with two sections: `## Per-Criterion Verdicts` and `## Overall Verdict`. Parse as follows:

- Each per-criterion header MUST match the exact shape `[Criterion N] <PASS | FAIL>` where `N` is the criterion number and the verdict token is either the literal `PASS` or the literal `FAIL`. There is no `verdict:` prefix, no lowercase form, and no additional tokens on that line.
- The overall verdict line MUST match `VERDICT: <PASS | FAIL>`.

Acceptance criteria are binary: each criterion is either `PASS` or `FAIL`. No "partial pass", no "pass with concerns", no soft verdicts. A single `[Criterion N] FAIL` causes `VERDICT: FAIL` for the task.

**Full-coverage requirement.** Let `K` be the total number of acceptance criteria for the task (numbered `1..K` in plan order, the same numbering passed in via `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`). The verifier output MUST contain exactly one `[Criterion N]` header for every `N ∈ {1..K}` — no more, no less. Parse the set of criterion numbers `S := { N : the output contains a header "[Criterion N] <PASS|FAIL>" }` (S is a deduplicated set — duplicate headers for the same N do not expand it) and check:

The verifier output MUST satisfy `S == {1..K}` — exactly one header per criterion number, no gaps and no out-of-range numbers. In addition, no criterion number may appear in two or more `[Criterion N]` headers; duplicates are a protocol error even when both duplicates agree on `PASS`/`FAIL`.

Route the parsed result:

- `VERDICT: PASS` — the task passes wave verification.
- `VERDICT: FAIL` — route the task into Step 13's retry loop, including the per-criterion `FAIL` entries and their `reason:` text so the retry has concrete remediation targets.

**Protocol-error routing.** Any malformed verifier output — missing or extra criterion blocks, duplicate criterion numbers, out-of-range numbers, a `verdict:` prefix, lowercase verdict tokens, or an unparseable overall verdict line — is treated exactly as `VERDICT: FAIL` for the task. Three additional protocol errors apply specifically to the two-phase verifier introduced for the Phase 1 evidence-collection path:

- **`verifier phase-1 evidence block malformed at criterion N: <specific check>`** — a `[Evidence for Criterion N]` block is present in the verifier's `## Phase 1 Evidence` section but does not contain all four labelled fields (`command:`, `exit_code:`, `stdout:`, `stderr:`) in that order, or a labelled field is unparseable. `<specific check>` names the missing or malformed field.
- **`verifier missing evidence block for command-style criterion N`** — the orchestrator supplied a recipe for criterion N in `{PHASE_1_RECIPES}` but the verifier's `## Phase 1 Evidence` section contains no `[Evidence for Criterion N]` block.
- **`verifier ran command not matching any phase-1 recipe: <command>`** — a `[Evidence for Criterion N]` block's `command:` line is not BYTE-EQUAL to any recipe text supplied in `{PHASE_1_RECIPES}` (recipe-verbatim discipline violation).

All protocol errors — including these three — route into Step 13's retry loop with a concrete description so the re-dispatched verifier has a concrete target to fix. Protocol errors never pass the wave gate and are never silently interpreted as `PASS`.

**Wave gate exit:** The wave exits Step 11 successfully only when every task in the wave has `VERDICT: PASS`. If any task has `VERDICT: FAIL`, the wave is not verified and Step 12 MUST NOT run until Step 13's retry loop produces a `VERDICT: PASS` for every failed task.

## Step 12: Post-wave commit and integration tests

**Precondition:** Step 10 (wave gate) must have exited and Step 11 must report `VERDICT: PASS` for every task in the wave. If any precondition is unmet, return to the responsible gate (Step 10 for BLOCKED or unresolved concerns, Step 13's retry loop for `VERDICT: FAIL`). Both the post-wave commit and the integration-test run are withheld until the wave completes successfully.

### 1. Commit wave changes

Stage and commit all changes from the completed wave:

```bash
git add -A
git commit -m "feat(plan): wave <N> - <plan_goal_summary>

- Task <X>: <task_title>
- Task <Y>: <task_title>"
```

**Commit message format:**
- **Subject line:** `feat(plan): wave <N> - <plan_goal_summary>` — where `<N>` is the wave number and `<plan_goal_summary>` is the plan's Goal section truncated to fit the ~72 character subject line limit. Truncate the goal with `...` if needed.
- **Blank line** after the subject (standard git convention).
- **Body:** One line per task completed in the wave, formatted as `- Task <X>: <task_title>` where `<X>` is the task number and `<task_title>` is the task's heading from the plan. List all tasks in the wave, one per line.

**If `git add -A` stages nothing** (wave produced no file changes): skip the commit silently. This can happen if a wave's tasks were verification-only.

### 2. Run integration tests

**Skip if:** Integration test is disabled (Step 3 settings) or no test command is available.

Run the integration suite via the `test-runner` subagent (see Step 7's shared test-runner dispatch subsection) with `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/wave-<N>-attempt-<K>.log` (an absolute path under the plan's working directory, where `<N>` is the current wave number and `<K>` is a 1-based attempt counter for this wave, starting at 1 and incremented on each Step 12 Debugger-first re-test) and `{PHASE_LABEL} = wave-<N>-attempt-<K>`. After artifact readback, read both the stable failing-identifier set and the non-reconcilable failure list from the artifact and compute the per-run inputs from [`integration-regression-model.md`](integration-regression-model.md):

- `current_failing_stable` := contents of `FAILING_IDENTIFIERS:` in the artifact.
- `current_non_reconcilable` := contents of `NON_RECONCILABLE_FAILURES:` in the artifact.
- `current_non_baseline_stable` := `current_failing_stable \ baseline_failures` (byte-for-byte set difference).

**Pass:** both `current_non_baseline_stable` and `current_non_reconcilable` are empty. Render the user-facing summary per the [User-facing summary format](integration-regression-model.md#user-facing-summary-format) section of `integration-regression-model.md` and proceed to wave `<N+1>` (or to Step 15 / Step 16 if this was the final wave).

**Fail:** `current_non_baseline_stable` is non-empty OR `current_non_reconcilable` is non-empty. Render the three-section user-facing summary per `integration-regression-model.md` with the appropriate Step 12 fail-path header, then present the menu below.

#### Menu

The menu differs between intermediate waves (any wave before the final wave of the plan) and the final wave.

**Intermediate-wave menu** (wave `<N>` where `<N> < total_waves`):

```
Options:
(d) Debug failures now       — dispatch the Debugger-first flow against current_non_baseline_stable ∪ current_non_reconcilable, then re-test
(c) Continue despite failures — proceed to wave <N+1> without modifying baseline_failures
(x) Stop plan execution      — halt plan execution; prior wave commits remain in git history
```

- **(d) Debug failures now:** Run the `Debugger-first flow` (below) with the **Step 12 (post-wave)** parameter row, scoped to `current_non_baseline_stable ∪ current_non_reconcilable`. Do NOT undo the wave commit up front; the debugging dispatch inspects the committed state. This path counts as a retry toward the 3-retry limit in Step 13.
- **(c) Continue despite failures:** Proceed to wave `<N+1>`. **`baseline_failures` is NOT mutated.** No deferred state is persisted across waves. The next wave's integration run is reconciled solely against the frozen `baseline_failures` set, so any failure surfaced this wave that persists into the next wave will be flagged again under `current_non_baseline_stable` (or `current_non_reconcilable`) until it is fixed or the user stops execution. Warn: "⚠️ Continuing past wave `<N>` integration failures. These failures are NOT being recorded as baseline; the next wave will reconcile against the original frozen baseline, so unresolved failures will be flagged again."
- **(x) Stop plan execution:** Halt execution. All prior wave commits remain in git history. Report partial progress (Step 14). The per-plan `.pi/test-runs/<plan-name>/` directory is preserved on this exit path so the user can inspect run artifacts after stop.

**Final-wave menu** (wave `<N>` where `<N> == total_waves`):

```
Options:
(d) Debug failures now   — dispatch the Debugger-first flow against current_non_baseline_stable ∪ current_non_reconcilable, then re-test
(x) Stop plan execution  — halt plan execution; prior wave commits remain in git history
```

The continue option is intentionally absent on the final wave by design: there is no subsequent wave to absorb unresolved failures, and the precondition that final completion is blocked until current non-baseline stable failures and non-reconcilable failures are both empty forbids silently shipping them. On the final wave, the user MUST either debug or stop.

- **(d) Debug failures now:** Same as the intermediate-wave `(d)` — run the `Debugger-first flow` (below) with the **Step 12 (post-wave)** parameter row, scoped to `current_non_baseline_stable ∪ current_non_reconcilable`, counting toward the Step 13 retry limit. Step 16's "Final integration regression gate (precondition)" applies the same baseline-only reconciliation against the most recent integration run before the plan can report success.
- **(x) Stop plan execution:** Halt execution. Prior wave commits remain in git history. Report partial progress (Step 14). The per-plan `.pi/test-runs/<plan-name>/` directory is preserved on this exit path so the user can inspect run artifacts after stop.

### Debugger-first flow

Shared by Step 12 (post-wave integration failures) and Step 16 (final integration regression gate). When the caller's `(d) Debug failures now` option is chosen, do NOT re-dispatch every task in scope. Instead, follow the parameterized flow below with the caller's parameter row.

**Parameter values by caller**

| Parameter | Step 12 (post-wave) | Step 16 (final-gate) |
|---|---|---|
| Scope | Triggered by Step 12's post-wave integration-test menu, while a current wave `<N>` exists. | Triggered by Step 16's "Final integration regression gate (precondition)" after all waves and any Step 15 remediation. No current wave exists; `HEAD` may be a Step 15 commit. |
| Range / changed-file universe | The wave commit: use `git show HEAD --stat` and `git show HEAD` to enumerate the files introduced by the wave. | The plan execution range: `BASE_SHA` = `PRE_EXECUTION_SHA` (recorded in Step 8, immediately before the first wave dispatched); `HEAD_SHA` = `git rev-parse HEAD` at this moment. Use `git diff --name-only BASE_SHA HEAD_SHA` — NOT `git show HEAD`, since HEAD at final-gate time is not guaranteed to be a wave commit. |
| Suspect / failure scope | The current run's `current_non_baseline_stable ∪ current_non_reconcilable` — the stable failures not in `baseline_failures` plus any non-reconcilable evidence from the same artifact. | Same: the final-gate run's `current_non_baseline_stable ∪ current_non_reconcilable`. |
| Suspect task universe | Wave `<N>`'s tasks whose modified files appear in the failing stack traces or whose behavior the failing tests cover. If the mapping is ambiguous, include every wave task. | Every plan task whose declared `**Files:**` scope (from the plan file) intersects the failing stack traces or whose behavior the failing tests cover. If the mapping is ambiguous, include every plan task whose `**Files:**` scope intersects `git diff --name-only BASE_SHA HEAD_SHA` — i.e., every task whose output was touched by plan execution. Do NOT constrain to a single wave. |
| Success condition | On re-dispatching `test-runner` per Step 7's shared test-runner dispatch subsection (with a fresh `wave-<N>-attempt-<K>` filename — increment `<K>`) and recomputing per `integration-regression-model.md`, **both** `current_non_baseline_stable` and `current_non_reconcilable` are empty. Pre-existing baseline failures (members of `baseline_failures ∩ current_failing_stable`) may remain. On success, proceed to the next wave. | On re-entering the Step 16 gate at its step 1 (re-run the suite, recompute the per-run inputs), **both** `current_non_baseline_stable` and `current_non_reconcilable` are empty. Pre-existing baseline failures may remain. On success, the gate passes and normal completion proceeds. |
| Commit template / undo behavior | Remediation commit message: `fix(plan): wave <N> regression — <short summary>`. **Commit-undo fallback is available**: if targeted remediation also fails and the user chooses to retry again, offer to undo the wave commit with `git reset HEAD~1` (working-tree changes preserved unstaged) before a broader retry. Do not undo proactively. | Remediation commit message: `fix(plan): final-gate regression — <short summary>`. **Commit-undo fallback is NOT available**: `HEAD` is not guaranteed to be a wave commit, and prior wave commits must be kept intact for the `(x) Stop plan execution` exit path. On repeated failure, the only exits are another debugging attempt (costing a Step 13 retry) or `(x) Stop plan execution`. |

**Flow** (applies to both callers; substitute the parameter values from the row above):

1. **Identify suspects from the failure output.** Inspect the failing test identifiers in `current_non_baseline_stable`, the non-reconcilable evidence entries in `current_non_reconcilable`, file paths in stack traces, and the diff of the caller's **range / changed-file universe**. Build a short suspect list drawn from the caller's **suspect task universe**, including each candidate task's title (and, for Step 16, its declared `**Files:**` scope). If the mapping is ambiguous, fall back to the "include every …" rule spelled out for the caller.

2. **Dispatch a single debugging pass** using the `coder` agent with a prompt that follows the `systematic-debugging` skill (using `subagent_run_serial` per Step 8). The prompt MUST include:
   - The failing test output (full, not truncated) for the union `current_non_baseline_stable ∪ current_non_reconcilable`, with a labeled breakdown distinguishing stable identifiers (from `current_non_baseline_stable`) from non-reconcilable evidence entries (from `current_non_reconcilable`, copied verbatim from the artifact's `NON_RECONCILABLE_FAILURES:` block) so the diagnosis can reason about cause (e.g., test-level assertion failure vs. crash or collection error).
   - The range identifier from the caller's parameter row (Step 12: the wave commit SHA; Step 16: `BASE_SHA..HEAD_SHA`) and the list of files changed across it.
   - The suspect task list from step 1, with each task's title.
   - An explicit instruction: "Follow the `systematic-debugging` skill. Complete Phase 1 (root cause investigation) before proposing any fix. If the root cause is a clear, localized defect in one or two files, you MAY apply the fix in this same dispatch — follow TDD (write a failing test reproducing the regression, then fix). If the root cause spans multiple tasks or requires design judgment, return a diagnosis only and do NOT modify code."
   - The required report shape: either `STATUS: DONE` with the fix applied and RED/GREEN evidence for the regression test, or `STATUS: DONE_WITH_CONCERNS` containing a `## Diagnosis` section naming the implicated task(s), the root cause, and the minimal change needed.

3. **Handle the debugging pass result.** Judge success by the caller's **success condition** (both `current_non_baseline_stable` and `current_non_reconcilable` empty on the re-test).

   - **Diagnosed and fixed (`STATUS: DONE`):** Commit any applied fix using the caller's **commit template** (skip the commit if the dispatch returned `DONE` without file changes). Then evaluate the success condition: for Step 12, re-dispatch `test-runner` per Step 7's shared test-runner dispatch subsection (incrementing the wave attempt counter) and recompute the per-run inputs from `integration-regression-model.md`; for Step 16, re-enter the gate at step 1 (re-run the suite and recompute `current_failing_stable`, `current_non_reconcilable`, and `current_non_baseline_stable` per `integration-regression-model.md`). If both sets are empty on the re-test, the remediation succeeded — proceed per the caller's "on success" behavior. If either set is still non-empty, treat this as a failed debugging pass (below).
   - **Diagnosis only (`STATUS: DONE_WITH_CONCERNS` with `## Diagnosis`):** Use the diagnosis to dispatch a **targeted remediation** — a second `coder` dispatch scoped to only the implicated task(s)/files from the diagnosis. Include the diagnosis text, the failing test output, and the original task spec(s) for the implicated task(s) from the plan file. After that dispatch returns, commit its changes using the caller's **commit template** (skip if no files changed) and evaluate the caller's success condition as above. If it holds, the remediation succeeded. If it does not, treat this as a failed debugging pass.
   - **Failed debugging pass** (blocker, or the success condition still does not hold): re-present the caller's menu — Step 12's wave-appropriate menu (intermediate-wave `(d)`/`(c)`/`(x)` or final-wave `(d)`/`(x)`) or Step 16's `(d)`/`(x)` menu. Count this attempt toward the Step 13 retry limit for the implicated tasks.

4. **Do NOT blanket re-dispatch tasks outside the diagnosis.** Avoiding re-runs of unaffected tasks is the point of this flow — only the tasks explicitly implicated by the diagnosis are re-dispatched.

5. **Commit-undo fallback** availability is governed by the caller's **commit template / undo behavior** parameter. When available (Step 12), it is used only after targeted remediation has also failed and the user chooses to retry again — never proactively. When not available (Step 16), the only exits on repeated failure are another debugging attempt (costing a Step 13 retry) or `(x) Stop plan execution`.

## Step 13: Handle failures and retries

If a worker produces empty, missing, or incorrect output:
1. Retry automatically up to **3 times** (with improvements to the task prompt if possible). **Shared counter:** All re-dispatches from the Blocked handling phase (Step 10), the Concerns handling phase `(r)` remediation (Step 10), and Step 11 failure routing (verifier `VERDICT: FAIL`) share a single per-task retry counter. Exhaustion in one path exhausts it for all paths — a task that has been re-dispatched twice through the Blocked handling phase and once through the Concerns handling phase has used all 3 retries, and any subsequent Step 11 `VERDICT: FAIL` for that task goes directly to the user-prompt in step 2 below rather than triggering another automatic retry. **Sub-task split budget rule:** Choosing `(s) Split into sub-tasks` in the Blocked handling phase (Step 10) consumes 1 retry against the parent task's budget, and each resulting sub-task inherits the parent's remaining retry count rather than a fresh 3-retry budget. This closes the bypass where an exhausted parent could be split to obtain additional effective retries.
2. If still failing after 3 retries, **notify the user at the end of the wave** and ask:
   - Retry again (optionally with a different model or more context). Choosing `Retry again` **resets the per-task 3-retry budget for that task** — the user has explicitly authorized a fresh remediation window, so the shared counter described in step 1 (Blocked handling phase re-dispatch + Concerns handling phase `(r)` re-dispatch + Step 11 `VERDICT: FAIL` retries) is cleared back to 3 for this task only. A subsequent failure on that task re-enters the automatic-retry loop at the top of step 1 with a full budget.
   - Stop the entire plan. The per-plan .pi/test-runs/<plan-name>/ directory is preserved on this exit path so the user can inspect run artifacts after stop.

   There is no option to skip a failed task. A wave with any unresolved failure — including a verifier `VERDICT: FAIL` from Step 11 treated as a task failure — must either be retried to resolution or stopped. `VERDICT: FAIL` from Step 11 is routed through this same failure-handling path with no skip option.

Apply wave pacing from Step 3. These options only govern the cadence of waves where Step 10 (wave gate) has already exited and every task in the wave has `VERDICT: PASS`. If the wave contains any `BLOCKED` results or unresolved concerns, Step 10 has already paused execution; if any task has `VERDICT: FAIL` from Step 11, Step 13's retry loop has already paused execution. Pacing (including option (b) auto-collect) does not apply to any of these pauses — `VERDICT: FAIL` waves are never eligible for option (b) deferral.

- **(a)** Always pause and report before the next wave starts
- **(b)** Never pause; collect all failures and report at the very end
- **(c)** Pause only when a wave produced failures; otherwise auto-continue

## Step 14: Report partial progress

**Execution stopped early (user request or unrecoverable failure):**
- Leave the plan file in `.pi/plans/` for reference and any manual follow-up.
- Report which tasks completed, which failed, and which remain.

**Most recent integration run failures:** If a `test-runner` artifact exists for this plan (any of the post-wave `wave-<N>-attempt-<K>.log` or final-gate `final-gate-<seq>.log` files), use the most recent artifact and recompute `current_non_baseline_stable` and `current_non_reconcilable` against the frozen `baseline_failures` set. Include the unresolved failures under dedicated headings in the partial-progress report:

```
### Most recent integration run failures (unresolved)
<list of stable identifiers in current_non_baseline_stable from the most recent artifact, or `(none)` if empty>

### Non-reconcilable failures from the most recent integration run
<list of evidence entries from current_non_reconcilable from the most recent artifact, or `(none)` if empty>

These failures were observed in the most recent integration run on this branch and remain unresolved.
They must be debugged before this branch is considered shippable.
```

The most recent artifact path itself is preserved on every `(x) Stop plan execution` exit path (the per-plan `.pi/test-runs/<plan-name>/` directory is kept on stop) so the user can inspect the raw run output alongside this report.

## Step 15: Request code review

After all waves complete successfully (and if the user chose review in Step 3):

1. **Gather inputs:**
   - `BASE_SHA` = `PRE_EXECUTION_SHA` (recorded in Step 8)
   - `HEAD_SHA` = `git rev-parse HEAD`
   - Description = the plan's Goal section
   - Requirements = full plan file contents
   - Max iterations = from Step 3 settings (default 3)
   - Working directory = current workspace path
   - Review output path = `.pi/reviews/<plan-name>-code-review` (derived from plan filename, e.g., plan `2026-04-06-my-feature.md` → `.pi/reviews/2026-04-06-my-feature-code-review`)

2. **Invoke the `refine-code` skill** with the gathered inputs.

3. **Handle the result:**

   **`clean`:** Include the review summary (iteration count, review file path) in the Step 16 completion report. Proceed to Step 16.

   **`max_iterations_reached`:** Present remaining findings to the user; offer: **(a)** keep iterating (budget resets), **(b)** proceed with issues noted, or **(c)** stop execution. The per-plan .pi/test-runs/<plan-name>/ directory is preserved on this exit path so the user can inspect run artifacts after stop.

   **Review disabled** (user chose to disable in Step 3): Skip directly to Step 16.

## Step 16: Complete

### Final integration regression gate (precondition)

**Skip if:** Integration tests are disabled (Step 3 settings) or no test command is available.

Otherwise, always run this gate: re-run the full integration suite and confirm no plan-introduced regression remains before moving the plan to done. The gate uses the same baseline-only reconciliation defined in [`integration-regression-model.md`](integration-regression-model.md) — comparing the final-gate run's stable failures against the frozen `baseline_failures` and treating any non-reconcilable failure as a blocker.

**Gate protocol:**

1. **Re-dispatch the integration suite via `test-runner`** per Step 7's shared test-runner dispatch subsection with `{ARTIFACT_PATH} = <working-dir>/.pi/test-runs/<plan-name>/final-gate-<seq>.log` (an absolute path under the plan's working directory, where `<seq>` is a 1-based counter incremented for every gate entry — initial entry is `1`, each subsequent re-entry from `(d) Debug failures now` is `2`, `3`, …) and `{PHASE_LABEL} = final-gate-<seq>`. Read back the artifact per Step 7's "Reading run results" rule.

2. **Compute the per-run inputs** from [`integration-regression-model.md`](integration-regression-model.md):
   - `current_failing_stable` := contents of `FAILING_IDENTIFIERS:` in the final-gate artifact.
   - `current_non_reconcilable` := contents of `NON_RECONCILABLE_FAILURES:` in the final-gate artifact.
   - `current_non_baseline_stable` := `current_failing_stable \ baseline_failures` (byte-for-byte set difference).

3. **Gate on the union `current_non_baseline_stable ∪ current_non_reconcilable`:**
   - If **both** `current_non_baseline_stable` and `current_non_reconcilable` are empty: the gate passes. Proceed to `### 1. Move plan to done`.
   - If **either** `current_non_baseline_stable` or `current_non_reconcilable` is non-empty: the plan cannot be marked complete. Present the report and menu below.

   Use the three-section format defined in the [User-facing summary format](integration-regression-model.md#user-facing-summary-format) section of `integration-regression-model.md` with the header `⚠️ Final completion blocked: current integration failures remain.` and a trailing note `These current failures must be resolved before the plan can be marked complete (current_non_baseline_stable and current_non_reconcilable must both be empty).` followed by this menu:

   ```
   Options:
   (d) Debug failures now — run the `Debugger-first flow` (defined in Step 12) with the Step 16 (final-gate) parameter row, against current_non_baseline_stable ∪ current_non_reconcilable; on success, re-enter this gate.
   (x) Stop execution     — halt plan execution; prior wave commits remain in git history.
   ```

   Empty sections render as `(none)`. The menu mirrors the Step 12 **final-wave menu** — there is no continue option here by design, matching the rule that plan-introduced regressions cannot be silently shipped past the point where the plan reports success.

4. **Menu actions:**
   - **(d) Debug failures now:** Run the shared `Debugger-first flow` (defined under Step 12) with the **Step 16 (final-gate)** parameter row, scoped to `current_non_baseline_stable ∪ current_non_reconcilable`. That flow judges success by re-entering this gate at step 1 (re-run the suite, recompute `current_failing_stable`, `current_non_reconcilable`, and `current_non_baseline_stable`), so a remediation attempt succeeds when both gate-blocking sets are empty on the re-run. Repeat until both gate-blocking sets are empty or the user picks `(x)`. Each debugging attempt counts toward the Step 13 retry budget for the implicated tasks.
   - **(x) Stop execution:** Halt execution. Report partial progress via Step 14 so the user has a complete picture of failures left on the branch: list the unresolved `current_non_baseline_stable` and `current_non_reconcilable` from the most recent final-gate artifact under the Step 14 most-recent-run headings. Do NOT move the plan file, close the todo, or run branch completion. The per-plan `.pi/test-runs/<plan-name>/` directory is preserved on this exit path so the user can inspect run artifacts after stop.

**Blocking guarantee:** Steps `### 1. Move plan to done`, `### 2. Close linked todo`, and `### 4. Branch completion` MUST NOT execute while `current_non_baseline_stable ∪ current_non_reconcilable` is non-empty. The only exits from this gate are: (a) both sets become empty (gate passes), or (b) the user selects `(x) Stop execution`.

### 1. Move plan to done

**Unconditional** — the plan was executed regardless of what happens to the branch:
- Create `.pi/plans/done/` if it doesn't exist
- Move the plan file to `.pi/plans/done/`
- Delete the per-plan `.pi/test-runs/<plan-name>/` directory now that the final integration regression gate has passed: `rm -rf .pi/test-runs/<plan-name>`. This cleanup runs ONLY on successful gate exit (i.e. when this `### 1. Move plan to done` sub-step executes). Every stop exit path — Step 10's wave gate, Step 12's intermediate-wave or final-wave menu, Step 13's failure-handling prompt, Step 15's review max-iterations menu, and Step 16's final-gate menu — leaves `.pi/test-runs/<plan-name>/` in place so the user can inspect run artifacts after stop.

### 2. Close linked todo

Scan the plan file for a line matching `**Source:** TODO-<id>`. This line appears after the File Structure section, near the top of the plan. If found:

1. Extract the todo ID (e.g., `TODO-5735f43b`)
2. Read the todo using the `todo` tool to check if it exists and its current status
3. If the todo exists and is not already "done":
   - Update the todo status to "done"
   - Append to the todo body: `\nCompleted via plan: .pi/plans/done/<plan-filename>.md`
   - Record the closed todo ID for the summary report
4. If the todo does not exist, is already "done", or reading it fails: skip silently (no error, no warning)

**Skip entirely** if no `**Source:** TODO-<id>` line is found in the plan.

### 3. Report summary

Report: number of tasks completed, concerns noted, review status/notes (if performed), total time taken, and any closed todo (e.g., "Closed TODO-5735f43b").

### 4. Branch completion (if applicable)

**Only when running in a worktree or on a feature branch** (i.e., not on main/master/develop):

Invoke the `finishing-a-development-branch` skill, which verifies tests, determines base branch, presents merge/PR/keep/discard options, executes the chosen option, and cleans up worktree if applicable.

Branch completion is offered even if review issues are pending — the user may want to keep the branch and fix later, or create a PR with known issues noted.

**When on main/master (no branch):** Skip branch completion. Just report the summary from step 3.
