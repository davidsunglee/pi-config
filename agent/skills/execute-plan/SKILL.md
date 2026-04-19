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

# Branch label used in reuse logs and Step 3 summary. When CURRENT_BRANCH is
# empty (detached HEAD), substitute the short SHA so `<branch-name>` is always
# a concrete, printable identifier.
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

   `<BRANCH_LABEL>` is the value computed above: the branch name when on a branch, or `detached HEAD at <short-sha>` when `CURRENT_BRANCH` is empty. Note that `IS_FEATURE_BRANCH=0` when detached, so the feature-branch message only fires with a real branch name; the worktree message may fire with either form.

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

This reuse logging and dirty-check behavior is identical for feature-branch reuse and worktree reuse.

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
- Already on a feature branch or in a worktree, but the user declined reuse in Step 0 by choosing `(n) Create a new worktree instead`: `new worktree (branch: <suggested-branch>)` — identical to the main-branch default. Step 0's detected reuse state is discarded for the remainder of execution; for Step 3 and everything that follows, treat this case exactly like the main-branch new-worktree path, including customization rules (see below).

**Integration test value:** When enabled and a test command is available, include the command: `enabled (<command>)`. When no test command is available: `disabled (no test command)`.

**Defaults:**

| Setting | Default | Notes |
|---------|---------|-------|
| Workspace | new worktree | If Step 0 auto-detected reuse and the user accepted it (clean, or dirty with `(c) Continue`), the line shows the reused workspace and is not a customizable option. If the user chose `(n) Create a new worktree instead` in Step 0, or reuse never applied, the line shows `new worktree (branch: <suggested-branch>)` and IS customizable just like the main-branch default. |
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
1. Workspace — New worktree / Current workspace. Skip this question only when Step 0 auto-detected reuse AND the user accepted it (clean, or dirty with `(c) Continue`); in that case the reused workspace is fixed. In all other cases — including when the user chose `(n) Create a new worktree instead` in Step 0 — ask this question normally.
2. TDD — Enabled / Disabled
3. Execution mode — Sequential / Parallel
4. Wave pacing (if parallel) — Pause between waves / Auto-continue / Auto-continue unless failures
5. Integration test — Enabled / Disabled. If enabling and no test command yet detected, ask: "Enter test command (e.g., `npm test`):"
6. Final review — Enabled / Disabled. If enabling, ask: "Max remediation iterations (default 3):"

After customization, show the final settings summary for confirmation.

**If `q`:** Cancel execution and stop with: `Plan execution cancelled.`

If Step 0 auto-detected reuse AND the user accepted it (clean workspace, or dirty with `(c) Continue`), the workspace line shows the reused state and is not a customizable option. If the user chose `(n) Create a new worktree instead` in Step 0, the auto-detected reuse state is discarded and the workspace line behaves like the main-branch default — shown as `new worktree (branch: <suggested-branch>)` and fully customizable.

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

If a wave has more than 8 tasks, split it into sequential sub-waves of ≤8 tasks each. The cap of 8 is the pi-subagent extension's `MAX_PARALLEL_TASKS` (see `/Users/david/Code/pi-subagent/index.ts`) — do not exceed it, because the extension rejects dispatches above this limit. If that constant changes, update this cap to match.

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

After resolving each task's model, also resolve its dispatch target:

1. Extract the provider prefix — the substring before the first `/` in the resolved model string (e.g., `anthropic/claude-opus-4-6` → `anthropic`)
2. Look up the prefix in the `dispatch` object from `model-tiers.json` (e.g., `dispatch["anthropic"]` → `"claude"`)
3. Use the mapped value as the `dispatch` property in the subagent call

If `model-tiers.json` has no `dispatch` key, or the provider prefix has no entry in the dispatch map, default to `"pi"`.

Always pass `dispatch` explicitly on every subagent call, even when it resolves to `"pi"`.

## Step 7: Baseline test capture

**Skip if:** Integration test is disabled (Step 3 settings) or no test command is available.

Before executing the first wave, run the test command to establish a baseline:

```bash
# Run the test command from Step 3 settings
TEST_OUTPUT=$(<test_command> 2>&1)
TEST_EXIT=$?
```

#### Identifier-extraction contract

Baseline capture and every post-wave integration classification (Step 11) use the SAME rule for turning test-runner output into a set of failing-test identifiers. Do not use failure counts, exit-code deltas, or any other heuristic — the three-set model in Step 11 requires exact identifier equality, so Step 7 and Step 11 must extract identifiers identically.

A "test identifier" is the suite-native unique name for a single failing test, taken verbatim from the test runner's failure output. Examples by runner:

- `go test ./...` — `<package>.<TestName>` or `<package>/<TestName>` exactly as printed on `--- FAIL:` lines
- `pytest` — the `nodeid`, e.g. `tests/test_foo.py::test_bar` or `tests/test_foo.py::TestX::test_bar`
- `cargo test` — the fully qualified test path printed on `test <path> ... FAILED`
- `npm test` / Jest / Vitest — the file path plus test name, e.g. `src/foo.test.ts > describe > it`
- Other runners — use the runner's own unique per-test identifier verbatim; never synthesize or normalize

Extract one identifier per failing test. Strip surrounding whitespace but do NOT lowercase, reorder, or otherwise transform the identifier. The resulting collection is a set (deduplicated). This set — not a count — is what gets stored and compared. If the runner's output does not yield a stable per-test identifier for a particular failure (e.g. a crash before test names are printed), record that failure's raw line as the identifier so it still participates in set equality; do NOT silently drop it.

#### Baseline recording

**If exit code 0 (all tests pass):**
Record `baseline_failures := ∅` (the empty set). Any post-wave failing-test identifier that is not later classified as a deferred integration regression is a regression introduced by the plan execution.

**If exit code non-zero (some tests fail):**
Apply the identifier-extraction contract above to the baseline test output and record `baseline_failures` as the resulting set of identifiers. Warn the user:
```
⚠️ Baseline: N tests already failing before execution.
New failures only will be flagged after each wave.
```
`baseline_failures` is frozen at this point and never mutated for the rest of the plan run — subsequent waves only compare against it, never modify it. Proceed with execution; pre-existing failures are excluded from the pass/fail decision after each wave via the Step 11 three-set classification.

**How new failures are distinguished from pre-existing ones:** Step 11's reconciliation uses exact set operations on identifiers extracted via the same contract above (`baseline_failures`, `deferred_integration_regressions`, `current_failing`). There is no count-based or heuristic fallback — a test is a new regression if and only if its identifier appears in the current run and is not in either tracked set. Step 7 and Step 11 MUST use the same extraction logic so the sets are comparable.

#### Integration regression model

This subsection is the single canonical definition of the three-set integration tracking model, the reconciliation algorithm, and the user-facing summary format. Step 11 (post-wave integration tests) and Step 15 (final integration regression gate) both reference this subsection rather than restating it.

**The three tracked sets.** The post-wave integration run is classified against three explicitly tracked sets of test identifiers. A "test identifier" is the suite-native unique name for a failing test (e.g. file path plus test name, or fully qualified symbol), taken verbatim from the test runner's failure output per the identifier-extraction contract above.

1. **`baseline_failures`** — the set of tests that failed in the Step 7 baseline run. Captured once, before any wave executes, and never mutated after baseline capture. A test in this set represents a pre-existing failure the plan did not introduce.
2. **`deferred_integration_regressions`** — the set of tests the user has chosen to debug later via `(b) Defer integration debugging` in a prior wave's intermediate-wave menu. Starts empty at plan start. Grows only when the user selects `(b)` on an intermediate wave, and is reconciled on every subsequent integration run (see reconciliation algorithm below). These are regressions caused by this plan that the user has explicitly deferred — not pre-existing failures.
3. **`new_regressions_after_deferment`** — the set of tests that are failing in the just-completed integration run AND are not in `baseline_failures` AND are not in the post-reconciliation `deferred_integration_regressions`. Recomputed from scratch on every post-wave integration run (it does not persist across waves). This set names the plan-introduced regressions that first surface in the current run — i.e. the ones the user has not already chosen to defer and that were not pre-existing. It is the authoritative driver of the pass/fail classification below and the target scope of the `(a) Debug failures` and `(b) Defer integration debugging` menu actions.

`current_failing` is NOT one of the three tracked sets. It is a transient per-run value: the set of tests failing in the just-completed integration run, recomputed from scratch on every run, and used solely as input to the reconciliation step that derives the post-reconciliation `deferred_integration_regressions` and the fresh `new_regressions_after_deferment`. Once reconciliation computes those two tracked sets, `current_failing` is not referenced further and is not persisted across waves.

**Disjointness and transition rules:**

- `baseline_failures` and `deferred_integration_regressions` MUST remain disjoint. When adding a test to `deferred_integration_regressions`, first subtract `baseline_failures` from the candidate set; a test cannot simultaneously be a pre-existing baseline failure and a deferred regression.
- `new_regressions_after_deferment` is disjoint from both `baseline_failures` and `deferred_integration_regressions` by construction (see reconciliation step 4). A test can be in at most one of the three tracked sets at any moment.
- A test transitions out of `deferred_integration_regressions` only via the reconciliation rule below (when it is no longer failing). It never transitions into `baseline_failures` — the baseline is frozen at Step 7.
- Only `baseline_failures` and `deferred_integration_regressions` are carried across waves. `new_regressions_after_deferment` is recomputed fresh each run (via reconciliation), and `current_failing` is purely ephemeral input to that computation.

**Reconciliation algorithm.** After every integration test run (post-wave in Step 11, and the final gate in Step 15), and before classifying pass/fail, compute the transient `current_failing` from the run output and reconcile `deferred_integration_regressions` against it, then derive `new_regressions_after_deferment`:

1. Compute `current_failing` := the set of failing-test identifiers reported by the just-completed integration run, extracted via the Step 7 identifier-extraction contract so the identifiers are directly comparable with `baseline_failures` and `deferred_integration_regressions`. This value is transient — used only as input to steps 2–4 below and discarded after this reconciliation.
2. Compute `still_failing_deferred := deferred_integration_regressions ∩ current_failing` — deferred regressions that are still failing.
3. Compute `cleared_deferred := deferred_integration_regressions \ current_failing` — deferred regressions that are no longer failing (either the wave's changes fixed them, or the suite's output no longer includes them). Report these briefly in the pass/fail output as "Cleared deferred regressions: <list>".
4. Set `deferred_integration_regressions := still_failing_deferred`. Any deferred regression not in the current failing set is removed from the tracked set — the orchestrator does NOT carry stale identifiers forward.
5. Assign `new_regressions_after_deferment := current_failing \ (baseline_failures ∪ deferred_integration_regressions)`. This set is empty when every currently failing test is either a pre-existing baseline failure or a previously deferred regression; it is populated when the just-completed run includes at least one failure that was neither in the baseline nor previously deferred. `new_regressions_after_deferment` is the authoritative source for:
   - the user-facing "New regressions in this wave" section,
   - the pass/fail classification below, and
   - the `(a) Debug failures` and `(b) Defer integration debugging` menu actions (which operate only on the tests in this set).

**Pass/fail classification (post-wave, Step 11):**

- **Pass:** `new_regressions_after_deferment` is empty. Proceed to the next wave. The user-facing summary is formatted per the rules below (brief on a fully-clean suite; three-section block otherwise).
- **Fail:** `new_regressions_after_deferment` is non-empty. Present the three-section report followed by the Step 11 failure menu.

Step 15's final gate uses a stricter condition — it gates on the union `still_failing_deferred ∪ new_regressions_after_deferment` — but uses the same reconciliation algorithm and the same three-section report format defined here.

**User-facing summary format.** The user-facing summary uses one of two formats, depending on whether the suite is clean:

- **Fully-clean suite** — `baseline_failures ∩ current_failing`, post-reconciliation `deferred_integration_regressions`, and `new_regressions_after_deferment` are ALL empty. Report briefly, without the three-section block:

  ```
  ✅ Integration tests pass after wave <N> (no failures).
  ```

- **Not fully clean** — any of the three sets above is non-empty (including the pass path where `new_regressions_after_deferment` is empty but baseline failures or deferred regressions remain). Present exactly these three separately-headed sections, in this order, regardless of whether the overall classification is pass or fail:

  ```
  <header line — see below>

  ### Baseline failures
  <list of tests in baseline_failures ∩ current_failing — pre-existing, not plan-introduced>

  ### Deferred integration regressions
  <list of tests in deferred_integration_regressions (post-reconciliation) — plan-introduced regressions the user chose to defer>

  ### New regressions in this wave
  <list of tests in new_regressions_after_deferment — plan-introduced regressions first observed in this run>
  ```

  The header line is `✅ Integration tests pass after wave <N> (no new regressions; baseline and/or deferred failures remain — see below).` on the pass path, and `❌ Integration tests failed after wave <N>.` on the fail path.

  Each of the three sections MUST be present even if its list is empty (render an empty list as `(none)`), and the section headings MUST be the exact strings `Baseline failures`, `Deferred integration regressions`, and `New regressions in this wave`. On the pass path, the "New regressions in this wave" section is rendered as `(none)` by construction. The `(a)` and `(b)` menu actions — which only appear on the fail path — operate only on the "New regressions in this wave" list (i.e. on `new_regressions_after_deferment`).

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
subagent { tasks: [
  { agent: "coder", task: "<self-contained prompt>", model: "<resolved>", dispatch: "<resolved>" },
  { agent: "coder", task: "<self-contained prompt>", model: "<resolved>", dispatch: "<resolved>" },
  ...
]}
```

For sequential mode, dispatch one task at a time:
```
subagent { agent: "coder", task: "<self-contained prompt>", model: "<resolved>", dispatch: "<resolved>" }
```

### Assembling worker prompts

Read [execute-task-prompt.md](execute-task-prompt.md) in this directory once (before the first wave). For each task, fill the placeholders:

- `{TASK_SPEC}` — the full text of the task from the plan: task name, Files section, all checkbox steps, and acceptance criteria. Paste the complete text, do not summarize.
- `{CONTEXT}` — where this task fits in the plan. Include:
  - The plan's Goal (one line)
  - Which wave this task is in and what other tasks are in the same wave
  - What was completed in prior waves (task names and key outputs, not full details)
  - Any dependencies this task has and what those tasks produced
- `{WORKING_DIR}` — the absolute path to the working directory (the worktree path if using a worktree, otherwise the project root)
- `{TDD_BLOCK}` — if TDD is enabled (Step 3 settings), fill with:

  ```
  ## Test-Driven Development

  **Iron Law:** NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST. If you write production code before a test, delete it and start over. "Delete means delete" — do not keep it as reference, do not adapt it while writing tests.

  **Consult the full skill.** For any implementation or bug-fix work in this task, consult the `test-driven-development` skill before writing code. This block is a summary, not a substitute — the full skill has the rationalization-prevention table, red-flags list, verification checklist, and when-stuck troubleshooting you will need if you get tempted to skip a step.

  ### Red-Green-Refactor cycle

  For every new behavior, bug fix, or change in this task:

  1. **RED — Write one failing test** that describes the desired behavior. One behavior per test, clear name, real code (no mocks unless unavoidable).
  2. **Verify RED — run the test and watch it fail.** MANDATORY. Confirm: test fails (does not error on a typo), and the failure message matches the expected "feature missing" reason. If the test passes, you are testing existing behavior — fix the test. If it errors, fix the error and re-run until it fails correctly.
  3. **GREEN — write the minimal code to pass.** Just enough to make this test pass. No extra options, no speculative features, no "while I'm here" refactors.
  4. **Verify GREEN — run the test and watch it pass.** MANDATORY. Confirm: the new test passes, all other tests still pass, output is pristine (no errors or warnings).
  5. **Refactor — clean up while green.** Remove duplication, improve names, extract helpers. Keep tests green. Do not add behavior.

  Repeat for the next behavior. If the task lists test files, follow this cycle for each behavior those tests cover.

  ### Rationalizations to reject

  If you catch yourself thinking any of these, STOP and follow TDD — these are the excuses the full skill explicitly calls out:

  - "Too simple to test" / "I'll test after" / "Already manually tested"
  - "Keep the code as reference while I write tests" (you will adapt it — delete it)
  - "Deleting X hours of work is wasteful" (sunk cost — unverified code is technical debt)
  - "TDD will slow me down" / "Manual test is faster"
  - "Tests-after achieves the same goals" (no — tests-after asks "what does this do?"; tests-first asks "what should this do?")
  - "It's about spirit, not ritual" / "I'm being pragmatic" / "This is different because…"

  ### Red flags — if any of these are true, stop and start over

  - You wrote production code before the test
  - The test passed on the first run (you are testing existing behavior)
  - You cannot explain why the test failed in the RED step
  - You plan to add tests "later"
  - You kept pre-existing unverified code as "reference" and adapted it

  ### Verification checklist (before reporting DONE)

  - [ ] Every new function or method has a test
  - [ ] You watched each test fail before implementing
  - [ ] Each test failed for the expected reason (feature missing, not a typo)
  - [ ] You wrote minimal code to pass each test
  - [ ] All tests pass, not just the new ones
  - [ ] Output is pristine — no errors, no warnings
  - [ ] Tests exercise real code (mocks only when unavoidable)
  - [ ] Edge cases and error paths are covered

  If you cannot check every box, you skipped TDD — start over before reporting.

  ### When stuck

  - "I do not know how to test this" → write the wished-for API in the test first, then implement to match. If still stuck, report NEEDS_CONTEXT.
  - "The test is too complicated" → the design is too complicated. Simplify the interface.
  - "I have to mock everything" → the code is too coupled. Use dependency injection.
  - "The setup is huge" → extract helpers; if still complex, simplify the design.

  ### Bug fixes

  Reproduce the bug with a failing test first. Only then fix. The test proves the fix and prevents regression. Never fix a bug without a test.
  ```

  If TDD is disabled, fill `{TDD_BLOCK}` with an empty string.

The filled template becomes the task prompt for the `coder` subagent. The template already includes self-review instructions, escalation guidance, code organization guidance, and the report format — do not add these separately.

## Step 9: Handle worker status codes

After each wave completes, process each worker response:

- **DONE** → proceed to verification (Step 10).
- **DONE_WITH_CONCERNS** → record the worker's freeform concerns with the task. Do NOT resolve the checkpoint inline. Let the wave drain, then Step 9.7 presents a single combined wave-level concerns checkpoint for every `DONE_WITH_CONCERNS` task in the wave before Step 10 runs. Concerns do not need type labels and are not preclassified by severity.
- **NEEDS_CONTEXT** → provide the missing context and re-dispatch the task immediately.
- **BLOCKED** → do NOT recover inline. Record the worker's blocker details with the task, leave the task marked `BLOCKED`, and let the wave drain. The combined escalation is handled in Step 9.5, which surfaces every blocked task in the wave to the user before Step 10, Step 11, or any subsequent wave runs. The four canonical interventions (more context, better model, split into sub-tasks, stop execution) live in Step 9.5.

After the wave drains (i.e., every dispatched worker in the wave has returned and been classified), Step 9.5 runs first to handle any `BLOCKED` tasks. Step 9.7 then runs to handle any `DONE_WITH_CONCERNS` tasks. Only after both gates exit does Step 10 (verification) run.

**Never ignore an escalation or re-dispatch the same task to the same model without changes.**

## Step 9.5: Blocked-task escalation gate

Run this gate once per wave after every dispatched worker in the wave has returned and Step 9 has classified each response. It sits between worker handling and wave verification.

**Purpose:** Treat `STATUS: BLOCKED` as an immediate escalation — independent of the wave pacing choice from Step 3. Any wave that contains at least one `BLOCKED` worker response pauses here before any later wave is started, before wave verification (Step 10), and before the post-wave commit or integration-test (Step 11).

### 1. Drain the current wave

Do not cancel or interrupt any worker that is still running in the current wave. Wait for every dispatched worker in the wave to return and for Step 9 to classify each response before proceeding. Do not advance until all workers have returned. Once every worker response has been received and Step 9 has been applied, the wave is "drained."

Do not start the next wave. Do not run Step 10 or Step 11 for this wave yet.

### 2. Collect blocked tasks

After draining, collect the set `BLOCKED_TASKS` = every task in the wave whose most recent worker response is `STATUS: BLOCKED`.

- If `BLOCKED_TASKS` is empty, skip this entire step and proceed to Step 9.7 (which then gates entry to Step 10). Never advance directly from Step 9.5 to Step 10.
- If `BLOCKED_TASKS` is non-empty, proceed to step 3 below.

Tasks already re-dispatched and resolved in Step 9 via `NEEDS_CONTEXT` do not appear here — this gate only triggers on terminal `BLOCKED` outcomes for the wave.

### 3. Present the combined escalation view

Present a single combined escalation view covering every task in `BLOCKED_TASKS`. Do NOT present blocked tasks one at a time. The user must see the full list before choosing which to address first.

The view MUST include:

1. A header line naming the wave, e.g., `🚫 Wave <N>: <count> task(s) BLOCKED. Execution paused before any later wave.`
2. A "Wave outcomes" summary block listing every task in the wave and its Step 9 status: `DONE`, `DONE_WITH_CONCERNS`, or `BLOCKED`. Include task number and task title for each. Successful same-wave tasks MUST appear here so the user can see what completed alongside the blockers.
3. A "Blocked tasks" block, one entry per task in `BLOCKED_TASKS`, each containing:
   - Task number and task title (the heading from the plan)
   - The blocker text from the worker's `## Concerns / Needs / Blocker` section (full text, not truncated)
   - Files the task was scoped to (the task's `**Files:**` section from the plan)

Example layout:

~~~
🚫 Wave 2: 2 task(s) BLOCKED. Execution paused before any later wave.

Wave outcomes:
  - Task 3: Add baseline test capture           DONE
  - Task 4: Add main-branch confirmation guard  BLOCKED
  - Task 5: Wire final-review invocation        DONE_WITH_CONCERNS
  - Task 6: Add commit-after-wave step          BLOCKED

Blocked tasks:

[Task 4] Add main-branch confirmation guard
  Files: agent/skills/execute-plan/SKILL.md
  Blocker:
    <full blocker text from the worker report>

[Task 6] Add commit-after-wave step
  Files: agent/skills/execute-plan/SKILL.md
  Blocker:
    <full blocker text from the worker report>
~~~

### 4. Per-task intervention choice

For each task in `BLOCKED_TASKS`, ask the user for an intervention choice independently. Do not force a single action across all blocked tasks. Present choices one task at a time after the combined view has been shown, using this form per task:

~~~
Task <N>: <task_title> (current tier: <tier>) — choose an intervention:
  (c) More context      — re-dispatch this task with additional context you supply
  (m) Better model      — re-dispatch this task with a more capable model tier
                            [omit this line if current tier is already `capable`]
  (s) Split into sub-tasks — break this task into smaller sub-tasks and dispatch them
  (x) Stop execution    — halt the plan; committed waves are preserved as checkpoints
~~~

These options mirror the recovery paths previously inlined in Step 9's `BLOCKED` bullet and are the canonical intervention set for this gate. Do not invent new options. The `(m) Better model` option is suppressed (not offered, and not selectable) whenever the task's current model tier is already `capable`, because there is no higher tier to escalate to and re-dispatching to the same model would violate the Step 9 rule "Never ignore an escalation or re-dispatch the same task to the same model without changes." When `(m)` is suppressed, the user must pick `(c)`, `(s)`, or `(x)` for that task; a tier upgrade is not a valid same-tier "meaningful change" for `capable`-tier tasks.

- **(c) More context:** prompt the user for the additional context (free-form text). Re-dispatch this single task to a `coder` worker with the original task spec plus the supplied context appended under a `## Additional Context` section in the worker prompt. Keep the task's existing model tier unless the user also picks (m) for the same task on a subsequent pass.
- **(m) Better model:** only offered when the task's current tier is `cheap` or `standard`. Re-dispatch this single task to a `coder` worker using the next tier up from the task's current tier (`cheap` → `standard`, `standard` → `capable`). Resolve the concrete model string via `~/.pi/agent/model-tiers.json` as described in Step 6. If the task's current tier is `capable`, do NOT offer this option and do NOT re-dispatch to `capable` again under the guise of a "better model" — that would re-dispatch the same task to the same model with no change, which the Step 9 rule forbids. The user must instead pick `(c)` (which adds new context, satisfying the "with changes" requirement) or `(s)` (which restructures the task itself), or `(x)`.
- **(s) Split into sub-tasks:** decompose the task into smaller sub-tasks in-session. Each sub-task must keep the same output file(s) and acceptance criteria coverage between them (no criterion may be dropped). Dispatch the sub-tasks as a mini-wave bounded by the pi-subagent `MAX_PARALLEL_TASKS` cap (see Step 5). If there is a natural ordering between sub-tasks, run them sequentially instead. The parent task's slot is replaced by the sub-tasks for all subsequent tracking; each sub-task is treated as an independent task in this wave for Step 9 classification and gate re-entry. **Retry budget:** Splitting a task counts as 1 retry against the parent task's Step 12 budget. Each sub-task inherits the parent task's remaining retry count (not a fresh 3-retry budget) — e.g., if the parent had 2 retries remaining at the point of split, each sub-task starts with 2 retries remaining. This prevents retry-budget bypass via repeated splits. ⚠ Sub-task dispatches run pre-commit: their changes must remain in the working tree (uncommitted) at the point Step 10 dispatches the verifier. See Step 10.2 for the fallback diff range if this is violated.
- **(x) Stop execution:** halt execution immediately. Do NOT perform Step 10 or Step 11 for this wave. Report partial progress via Step 13. All prior wave commits are preserved as checkpoints.

If the user picks `(x) Stop execution` for any blocked task, stop the whole plan regardless of outstanding choices for other blocked tasks. Do not continue asking about the remaining blocked tasks.

### 5. Re-dispatch and wait for resolution

After collecting a non-stop intervention for every task in `BLOCKED_TASKS`, re-dispatch all of them together (in parallel, subject to `MAX_PARALLEL_TASKS`). Use the same dispatch shape as Step 8. Wait for all re-dispatched workers to return.

Apply Step 9 to the new responses. Then re-enter this gate (Step 9.5) with the new set of responses. The gate repeats until `BLOCKED_TASKS` is empty or the user picks `(x) Stop execution`. For tasks where `(s) Split into sub-tasks` was chosen, the sub-tasks' responses replace the original task's slot; if any sub-task returns `BLOCKED`, it appears in `BLOCKED_TASKS` on the next gate pass.

Each pass through the gate counts toward the per-task retry budget defined in Step 12 (3 retries per task). This cap is shared across both `BLOCKED` re-dispatch passes through this gate and `DONE`-verification retries through Step 12's verification loop for the same task — e.g., if a task has been re-dispatched twice through this gate and once via Step 12's verification retry, the combined count of 3 exhausts the budget. When a task exhausts its retry budget while still reporting `BLOCKED`, skip is not a valid exit — skipping would leave the wave with a permanently-unresolved blocker, and the spec forbids treating such a wave as successfully completed. The only ways out of this gate for a `BLOCKED` task are: (a) the user selects a non-stop intervention and re-dispatch eventually yields `DONE` or `DONE_WITH_CONCERNS` for that task, or (b) the user selects `(x) Stop execution`, which halts the entire plan via Step 13. When a budget-exhausted `BLOCKED` task surfaces to the user, present only the §4 intervention choices — retry with different model/context, or stop the entire plan — never a skip option. The gate does not exit successfully to Step 10/11 until every `BLOCKED` task is actually resolved.

### 6. Gate exit

Exit this gate only when every task in the wave has a non-`BLOCKED` Step 9 status achieved by actual worker completion — i.e., the worker returned `DONE` or `DONE_WITH_CONCERNS`. A task is never transitioned out of `BLOCKED` by being skipped. At that point the wave is eligible to proceed to Step 9.7 (the wave-level concerns checkpoint), which then gates entry into Step 10. The control-flow path out of this gate is always `Step 9.5 -> Step 9.7 -> Step 10`; never advance directly from Step 9.5 to Step 10. Do not run Step 10 or Step 11 before both this gate and Step 9.7 have exited. The only alternative exit from the gate is `(x) Stop execution`, which halts the plan entirely (Step 13) and does NOT run Step 9.7, Step 10, or Step 11 for this wave.

## Step 9.7: Wave-level concerns checkpoint

Run this gate once per wave after Step 9.5 has exited and before Step 10, whenever at least one task in the drained wave has Step 9 status `DONE_WITH_CONCERNS`. Its job is to surface every concerned task to the user in a single combined view and let the user decide how to proceed for the wave as a whole.

**Precondition:** Step 9.5 has exited. Every task in the wave has a Step 9 status of `DONE` or `DONE_WITH_CONCERNS`.

### 1. Collect concerned tasks

Build `CONCERNED_TASKS` = the ordered list of every task in the wave whose Step 9 status was `DONE_WITH_CONCERNS`. For each entry, carry along the task id, the task title, the worker's `## Concerns / Needs / Blocker` bullet lines verbatim (freeform — no `Type:` prefixes), and the list of files the task modified (`## Files Changed`). If `CONCERNED_TASKS` is empty, skip this gate entirely and proceed to Step 10.

### 2. Present one combined view

Do not prompt one-task-at-a-time. Wait until the wave is fully drained and Step 9.5 has exited, then present every concerned task together in a single combined message:

```
⚠️ Wave <N>: <M> task(s) returned DONE_WITH_CONCERNS. Review before verification.

── Task 3: <short title> ──────────────────────────────────
  Files: <path/one>, <path/two>
  Concerns:
    - <worker concern, verbatim>
    - <worker concern, verbatim>

── Task 5: <short title> ──────────────────────────────────
  Files: <path/one>
  Concerns:
    - <worker concern, verbatim>
───────────────────────────────────────────────────────────

Options:
  (c) Continue to verification            — proceed to Step 10 with all tasks as-is
  (r) Remediate selected task(s)          — specify task number(s) and guidance; re-dispatch those tasks
  (x) Stop execution                      — halt the plan; committed waves are preserved as checkpoints
```

This is the whole user interaction for the gate. There is no per-concern menu, no severity routing, and no "acknowledge" step. The user decides for the wave as a whole, with per-task granularity available only inside the `(r)` path.

### 3. Apply the user's choice

- **(c) Continue to verification.** Exit the gate. Leave every concerned task's Step 9 status as `DONE_WITH_CONCERNS` and proceed to Step 10; the verifier is the next gate and will judge the work on its own terms.
- **(r) Remediate selected task(s).** Prompt the user for (a) the task numbers to remediate (one or more from `CONCERNED_TASKS`) and (b) a single freeform guidance block that applies to those tasks. Re-dispatch each selected task to a fresh `coder` worker using the same task spec, with the worker's original concerns block and the user's guidance appended under a `## Concerns To Address` section in the worker prompt. Each re-dispatch counts against that task's Step 12 retry budget (shared counter described in Step 12). When the re-dispatches return, apply Step 9 again. If any re-dispatched task comes back `BLOCKED`, return to Step 9.5 with that task. Otherwise rebuild `CONCERNED_TASKS` from the new wave state and re-enter this gate from §1; a task that returns `DONE` after remediation is removed from `CONCERNED_TASKS`, and a task that returns `DONE_WITH_CONCERNS` again re-appears in the next combined view. Tasks that were not selected for remediation keep their prior Step 9 status and re-appear unchanged in the next view.
- **(x) Stop execution.** Halt immediately via Step 13. Do NOT run Step 10 or Step 11 for this wave. All prior wave commits remain as checkpoints.

Repeat §2–§3 until `CONCERNED_TASKS` is empty (either because the user picked `(c)` or because every concerned task has been remediated to `DONE`) or the user picks `(x)`.

### 4. Gate exit

Exit this gate when either (a) the user picked `(c) Continue to verification` on the most recent view, or (b) every task in the wave has Step 9 status `DONE` after remediation. The wave is then eligible for Step 10. The only other exit is `(x) Stop execution`, which halts the plan via Step 13.

When `(c)` is the exit, tasks whose status is still `DONE_WITH_CONCERNS` flow into Step 10 unchanged — the verifier judges them against acceptance criteria the same way it judges `DONE` tasks. The orchestrator does not treat `DONE_WITH_CONCERNS` as an automatic fail into Step 10; the verifier's verdict is authoritative.

## Step 10: Verify wave output

**Precondition:** Only run this step after both the Step 9.5 blocked-task escalation gate and the Step 9.7 wave-level concerns checkpoint have exited. If any task in the current wave still has a Step 9 status of `BLOCKED`, do not run wave verification — return to Step 9.5. If the Step 9.7 checkpoint has not yet been presented and resolved for this wave, do not run wave verification — return to Step 9.7. A wave with any unresolved `BLOCKED` task or a Step 9.7 checkpoint that has not yet been resolved is NOT considered successfully completed. Tasks that exit Step 9.7 with status `DONE_WITH_CONCERNS` proceed to verification as-is; the verifier's per-criterion verdict is authoritative.

Verification for each task in the wave runs in a fresh-context `verifier` subagent dispatched via `agent/skills/execute-plan/verify-task-prompt.md`. The orchestrator does NOT read code and judge acceptance criteria directly; it only collects command evidence and routes the verifier's verdict.

**Protocol-error stop — missing `Verify:` recipes:** Before dispatching the verifier, check that every acceptance criterion for the task has an attached `Verify:` recipe in the plan. If any acceptance criterion is missing a `Verify:` recipe at execute time, STOP execution for this wave. Report the offending task number and criterion text to the user, recommend re-running `generate-plan` to regenerate the plan, and do not dispatch the verifier, do not treat the task as passing, and do not silently skip verification. A plan without complete `Verify:` recipes is a protocol error from generate-plan and must be regenerated before execution can continue.

### Step 10.1: Orchestrator collects command evidence

For every acceptance criterion whose `Verify:` recipe is a shell command (e.g. `grep ...`, `cat ...`, `test -f ...`, `go vet ./...`), the orchestrator — NOT the verifier — runs the command and captures:

- the exact command string,
- the exit status,
- the relevant portion of stdout,
- the relevant portion of stderr.

**Truncation rule (command evidence).** Apply this rule independently to each stream (stdout and stderr) of a recipe. If a single stream exceeds 200 lines or 20 KB, truncate it by keeping the first 100 lines and the last 50 lines, separated by a single marker line that records the pre-truncation line count and byte count (e.g., `[<N> lines, <B> bytes; truncated to first 100 + last 50]`). Apply the rule to each stream independently; never combine streams for the threshold calculation, and never silently drop output. If the relevant evidence for a criterion falls inside the truncated window, the verifier MUST return `FAIL` with `reason: insufficient evidence` for that criterion rather than guessing.

Emit one evidence block per command-style recipe, with the header `[Evidence for Criterion N]` where `N` is the 1-based criterion number in plan order. Each block contains `command: <exact command>`, `exit_code: <status>`, `stdout:` (fenced), and `stderr:` (fenced), in that order, after the truncation rule. If a criterion has no command-style recipe, no evidence block is emitted for it (gaps in numbering are expected and correct). These blocks are what the orchestrator passes as `{ORCHESTRATOR_COMMAND_EVIDENCE}` in the verifier prompt; the verifier cites them by criterion number (e.g. `evidence: Evidence for Criterion 2`).

File-inspection and prose-inspection recipes (e.g. "read Step 10.2 and confirm …", "confirm the file contains section X") are NOT executed by the orchestrator. The verifier evaluates them directly against the named files.

### Step 10.2: Dispatch the verifier

For each task in the wave (regardless of its Step 9 status, except `BLOCKED` which is already handled in Step 9.5), dispatch a fresh `verifier` subagent using the template at `agent/skills/execute-plan/verify-task-prompt.md`. The verifier does NOT run commands. It reads the command-evidence blocks produced in Step 10.1, reads only the files listed under `## Verifier-Visible Files` (plus any files explicitly named by a recipe), and returns per-criterion verdicts.

Verifier dispatches for the wave run in parallel, bounded by the pi-subagent `MAX_PARALLEL_TASKS` cap (see Step 5). Do not verify sequentially — issue all verifier subagents concurrently up to the cap and wait for all of them to return before parsing in Step 10.3.

Fill the template's placeholders as follows:

- `{TASK_SPEC}` — the task block from the plan, verbatim.
- `{ACCEPTANCE_CRITERIA_WITH_VERIFY}` — the acceptance criteria list for the task, each paired with its `Verify:` recipe, numbered starting at 1.
- `{ORCHESTRATOR_COMMAND_EVIDENCE}` — the evidence blocks collected in Step 10.1, in criterion order. If the task has no command-style recipes, leave this section empty.
- `{MODIFIED_FILES}` — the orchestrator-assembled verifier-visible file set, as a newline-separated, deduplicated list of paths. The orchestrator MUST compute this set as the union of three inputs so that the worker being judged cannot narrow its own verification surface:
  1. **Task-declared scope.** Every path listed in the plan task's `**Files:**` section, verbatim. A task that declares a file is on the hook for that file regardless of whether the worker reported touching it.
  2. **Worker-reported changes.** The paths listed in the worker's `## Files Changed` section. These are informative but NOT authoritative on their own — a worker that omits a file it actually modified cannot hide that file from the verifier.
  3. **Orchestrator-observed diff state.** The paths surfaced by `git status --porcelain` (working tree and index, relative to the last commit) for the wave, plus any files present in the wave's `git diff HEAD` output. In parallel-wave dispatch where multiple tasks share the working tree, scope this to files that plausibly belong to this task — at minimum include every path from inputs 1 and 2 that also appears in the orchestrator-observed set, and include any additional orchestrator-observed paths that fall under the task's declared `**Files:**` directories. Include all orchestrator-observed paths when the wave contains only this task.
  Deduplicate the union and present it as the verifier-visible file set. Explicitly record in the prompt that this set is orchestrator-assembled so the verifier knows it is not simply the worker's self-report.
- `{DIFF_CONTEXT}` — the uncommitted wave diff against `HEAD`, produced as follows. For tracked files modified in this wave, use `git diff HEAD -- <modified files>`. For newly created (untracked) files, `git diff HEAD` does not produce output; instead, generate a diff for each new file via `git diff --no-index /dev/null -- <file>` (which produces a unified diff showing the entire file as added). Concatenate both outputs into a single diff block. To identify which files are new vs. modified, check `git status --porcelain -- <modified files>`: entries prefixed with `??` are untracked/new; all others are tracked modifications. This reflects the working tree vs. the last commit, which is where wave changes live before Step 11's commit. Do NOT substitute a committed-range diff (e.g. a diff between `HEAD` and a prior commit) or a `--staged` diff; wave changes have not been committed yet. **Diff truncation rule.** If the combined diff output exceeds 500 lines or 40 KB, truncate it by keeping the first 300 lines and the last 100 lines, separated by a single marker line that records the pre-truncation line count and byte count (e.g., `[diff truncated — <N> lines, <B> bytes total; verifier should note this and fall back to reading the named files for file-inspection criteria whose relevant code may lie in the truncated window]`). Never silently drop diff output. If a file-inspection criterion cannot be judged because the relevant hunk is inside the truncated window, the verifier should read the named file(s) directly from `## Verifier-Visible Files` rather than guessing. **Sub-task dispatch carve-out:** Sub-task dispatches from Step 9.5 §5 (split-into-sub-tasks) MUST occur pre-commit — their changes must remain in the working tree at Step 10 time so `git diff HEAD` captures them alongside the rest of the wave. Step 11's commit is the only sanctioned transition from working tree to committed state for wave changes, and it runs after Step 10. If for any reason a sub-task's changes were committed before Step 10 runs for this wave (a protocol violation that should not normally occur), substitute `git diff <pre-subtask-commit>..HEAD -- <modified files>` for those criteria so the verifier still sees the sub-task's changes; otherwise file-inspection criteria will fail for insufficient evidence even though the work was done.
- `{WORKING_DIR}` — the plan's working directory.

**Verifier model tier:** Default the verifier's model to `standard`. If the verified task itself ran at `capable`, upgrade the verifier to `capable` so its judgment matches the task's complexity. Never downgrade below `standard`.

Dispatch the subagent with `agent: "verifier"`, using the Step 6 model-tier resolution to map `standard`/`capable` to the concrete model and dispatch strings.

### Step 10.3: Parse verifier output and gate the wave

The verifier returns a report with two sections: `## Per-Criterion Verdicts` and `## Overall Verdict`. Parse as follows:

- Each per-criterion header MUST match the exact shape `[Criterion N] <PASS | FAIL>` where `N` is the criterion number and the verdict token is either the literal `PASS` or the literal `FAIL`. There is no `verdict:` prefix, no lowercase form, and no additional tokens on that line.
- The overall verdict line MUST match `VERDICT: <PASS | FAIL>`.

Acceptance criteria are binary: each criterion is either `PASS` or `FAIL`. No "partial pass", no "pass with concerns", no soft verdicts. A single `[Criterion N] FAIL` causes `VERDICT: FAIL` for the task.

**Full-coverage requirement.** Let `K` be the total number of acceptance criteria for the task (numbered `1..K` in plan order, the same numbering passed in via `{ACCEPTANCE_CRITERIA_WITH_VERIFY}`). The verifier output MUST contain exactly one `[Criterion N]` header for every `N ∈ {1..K}` — no more, no less. Parse the set of criterion numbers `S := { N : the output contains a header "[Criterion N] <PASS|FAIL>" }` and check all four conditions:

1. **Count.** `|S| == K` — every criterion has a verdict block.
2. **Coverage.** `S == {1..K}` — no criterion number in `1..K` is missing.
3. **Uniqueness.** No criterion number appears in two or more `[Criterion N]` headers (duplicates are a protocol error even if both duplicates agree on `PASS`/`FAIL`).
4. **Range.** No `[Criterion N]` header appears with `N < 1` or `N > K` (out-of-range criterion numbers are a protocol error).

Route the parsed result:

- `VERDICT: PASS` — the task passes wave verification.
- `VERDICT: FAIL` — route the task into Step 12's retry loop, including the per-criterion `FAIL` entries and their `reason:` text so the retry has concrete remediation targets.

**Protocol-error routing.** Any malformed verifier output — missing or extra criterion blocks, duplicate criterion numbers, out-of-range numbers, a `verdict:` prefix, lowercase verdict tokens, or an unparseable overall verdict line — is treated exactly as `VERDICT: FAIL` for the task. The orchestrator routes it into Step 12's retry loop with a concrete description of the protocol violation (e.g. "missing [Criterion 3]", "duplicate [Criterion 2]", "out-of-range [Criterion 5] when K=4") so the re-dispatched verifier has a concrete target to fix. Protocol errors never pass the wave gate and are never silently interpreted as `PASS`.

**Wave gate exit:** The wave exits Step 10 successfully only when every task in the wave has `VERDICT: PASS`. If any task has `VERDICT: FAIL`, the wave is not verified and Step 11 MUST NOT run until Step 12's retry loop produces a `VERDICT: PASS` for every failed task.

## Step 11: Post-wave commit and integration tests

**Precondition:** Only run this step after Step 9.5 (blocked-task escalation gate) has exited, Step 9.7 (combined concerns checkpoint) has exited, and Step 10 (wave verification) has passed. If any task in the current wave still has a Step 9 status of `BLOCKED`, do not commit and do not run integration tests — return to Step 9.5. If Step 9.7 has not yet been resolved for this wave, return to Step 9.7. If any task in the wave still carries `VERDICT: FAIL` from Step 10 (including malformed verifier output treated as `FAIL`), do not commit and do not run integration tests — return to Step 12's retry loop until every task has `VERDICT: PASS`. Both the post-wave commit and the post-wave integration-test run are withheld until the wave completes successfully (every wave task non-`BLOCKED`, Step 9.7 exited via `(c)` or remediation, and `VERDICT: PASS` from Step 10).

After wave verification (Step 10) completes successfully for a wave, perform the following steps in order.

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

**Example:** For wave 2 of a plan with goal "Add execution checkpoints to execute-plan" containing Tasks 3 and 4:
```
feat(plan): wave 2 - Add execution checkpoints to execute-plan

- Task 3: Add baseline test capture step to execute-plan SKILL.md
- Task 4: Add main-branch confirmation guard to Step 8 of execute-plan SKILL.md
```

**If `git add -A` stages nothing** (wave produced no file changes): skip the commit silently. This can happen if a wave's tasks were verification-only.

### 2. Run integration tests

**Skip if:** Integration test is disabled (Step 3 settings) or no test command is available.

Run the test command:

```bash
TEST_OUTPUT=$(<test_command> 2>&1)
TEST_EXIT=$?
```

#### Classification

Apply the **Integration regression model** defined in Step 7 — specifically the Step 7 reconciliation algorithm — to the just-completed integration run. That subsection is the single canonical definition of the three tracked sets (`baseline_failures`, `deferred_integration_regressions`, `new_regressions_after_deferment`), the disjointness and transition rules, the reconciliation algorithm, and the user-facing summary format. Use it verbatim here; do not restate.

After reconciliation:

- **Pass** if `new_regressions_after_deferment` is empty. Render the user-facing summary per Step 7's format (brief on a fully-clean suite; three-section block otherwise) and proceed to the next wave.
- **Fail** if `new_regressions_after_deferment` is non-empty. Render Step 7's three-section report and present the menu below.

#### Menu

The menu differs between intermediate waves (any wave before the final wave of the plan) and the final wave.

**Intermediate-wave menu** (wave `<N>` where `<N> < total_waves`):

```
Options:
(a) Debug failures                  — dispatch a systematic-debugging pass against new_regressions_after_deferment, then remediate
(b) Defer integration debugging     — add new_regressions_after_deferment to deferred_integration_regressions and proceed to wave <N+1>
(c) Stop execution                  — halt plan execution; committed waves are preserved as checkpoints
```

- **(a) Debug failures:** Run the debugger-first flow described in "Debugger-first flow" below, scoped to the tests in `new_regressions_after_deferment`. Do NOT undo the wave commit up front; the debugging dispatch inspects the committed state. This path counts as a retry toward the 3-retry limit in Step 12.
- **(b) Defer integration debugging:** Compute `additions := new_regressions_after_deferment \ baseline_failures` (preserving disjointness with `baseline_failures`) and set `deferred_integration_regressions := deferred_integration_regressions ∪ additions`. The wave commit remains. Warn: "⚠️ Proceeding with deferred integration regressions. Final plan completion is BLOCKED until every deferred regression is resolved — the final wave's menu will not offer a defer option, so these failures must be debugged (or explicitly accepted via `Stop execution`) before the plan can report success." Then proceed to wave `<N+1>`.
- **(c) Stop execution:** Halt execution. All prior wave commits are preserved as checkpoints. Report partial progress (Step 13). The user can resume or fix manually.

**Final-wave menu** (wave `<N>` where `<N> == total_waves`):

```
Options:
(a) Debug failures  — dispatch a systematic-debugging pass against new_regressions_after_deferment, then remediate
(c) Stop execution  — halt plan execution; committed waves are preserved as checkpoints
```

The defer option is intentionally removed on the final wave: there is no subsequent wave to carry deferred regressions into, and the precondition that final completion is blocked until all plan-introduced regressions are resolved forbids silently shipping them. On the final wave, the user MUST either debug or stop.

- **(a) Debug failures:** Same as the intermediate-wave `(a)` — run the debugger-first flow scoped to `new_regressions_after_deferment`, counting toward the Step 12 retry limit. Deferred regressions from prior waves are NOT handled here; they are cleared by Step 15's "Final integration regression gate (precondition)" before the plan can report success. The same final gate also catches any regression introduced after this final wave (e.g. by Step 14 review/remediation) via the same three-set classification used here.
- **(c) Stop execution:** Halt execution. Prior wave commits are preserved as checkpoints. Report partial progress (Step 13).

### Debugger-first flow

When the user chooses **(a) Debug failures**, do NOT re-dispatch every task in the wave. Instead:

1. **Identify suspect tasks from the failure output.** Inspect the new failing test names, file paths in stack traces, and the diff introduced by the wave (`git show HEAD --stat` and `git show HEAD` for the wave commit). Build a short list of wave tasks whose modified files appear in the failing stack traces or whose behavior the failing tests cover. If the mapping is ambiguous, include every wave task in the suspect list.

2. **Dispatch a single debugging pass** using the `coder` agent with a prompt that follows the `systematic-debugging` skill. The prompt MUST include:
   - The failing test output (full, not truncated).
   - The wave commit SHA and the list of files it changed.
   - The suspect task list from step 1, with each task's title.
   - An explicit instruction: "Follow the `systematic-debugging` skill. Complete Phase 1 (root cause investigation) before proposing any fix. If the root cause is a clear, localized defect in one or two files, you MAY apply the fix in this same dispatch — follow TDD (write a failing test reproducing the regression, then fix). If the root cause spans multiple tasks or requires design judgment, return a diagnosis only and do NOT modify code."
   - The required report shape: either `STATUS: DONE` with the fix applied and RED/GREEN evidence for the regression test, or `STATUS: DONE_WITH_CONCERNS` containing a `## Diagnosis` section naming the implicated task(s), the root cause, and the minimal change needed.

3. **Handle the debugging pass result:**

   In both sub-cases below, success after a remediation attempt is judged by re-running the Step 7 reconciliation algorithm — NOT by requiring the suite to fully pass or match the baseline. The attempt succeeds when, after re-running the test command and feeding the output through reconciliation, `new_regressions_after_deferment` is empty. Any pre-existing baseline failures and previously-deferred regressions are allowed to remain; the remediation only has to clear the new regressions that triggered this debugging pass. Rerunning reconciliation also updates `deferred_integration_regressions` via the normal rule (clearing any deferred identifier no longer in `current_failing`), so an incidentally-fixed deferred regression is reported under "Cleared deferred regressions" just like any other reconciliation pass.

   - **Diagnosed and fixed (`STATUS: DONE`):** Re-run the test command, then apply the Step 7 reconciliation algorithm to the output. If `new_regressions_after_deferment` is empty after reconciliation, the remediation succeeded: add a follow-up commit (`git commit -m "fix(plan): wave <N> regression — <short summary>"`) and proceed to the next wave. If `new_regressions_after_deferment` is non-empty, treat it as a failed debugging pass (below).
   - **Diagnosis only (`STATUS: DONE_WITH_CONCERNS` with `## Diagnosis`):** Use the diagnosis to dispatch a **targeted remediation** — a second `coder` dispatch scoped to only the implicated task(s)/files from the diagnosis. Include the diagnosis text, the failing test output, and the original task spec(s) for the implicated task(s). After that dispatch returns, re-run the test command and apply the Step 7 reconciliation algorithm. If `new_regressions_after_deferment` is empty after reconciliation, the remediation succeeded: add a follow-up commit (`git commit -m "fix(plan): wave <N> regression — <short summary>"`) and proceed to the next wave. If `new_regressions_after_deferment` is non-empty, treat it as a failed debugging pass.
   - **Failed debugging pass** (blocker, or post-reconciliation `new_regressions_after_deferment` is still non-empty): re-present the integration-failure menu to the user in its wave-appropriate form — the intermediate-wave menu (`(a) Debug failures`, `(b) Defer integration debugging`, `(c) Stop execution`) when the current wave is not the final wave, or the final-wave menu (`(a) Debug failures`, `(c) Stop execution`, with no defer option) when it is. Count this attempt toward the Step 12 retry limit.

4. **Do NOT re-dispatch unaffected wave tasks** unless the diagnosis explicitly implicates them. Avoiding blanket re-runs is the point of this flow.

5. **Commit undo is only used as a fallback.** If the targeted remediation also fails and the user chooses to retry again, at that point — and only then — offer to undo the wave commit with `git reset HEAD~1` (working-tree changes from the wave are preserved unstaged for the retry) before a broader retry. Do not undo proactively.

## Step 12: Handle failures and retries

If a worker produces empty, missing, or incorrect output:
1. Retry automatically up to **3 times** (with improvements to the task prompt if possible). Note: re-dispatch passes through the Step 9.5 blocked-task gate also count toward this per-task budget (see Step 9.5 §5). **Shared counter:** All re-dispatches from Step 9.5 §5 (blocked-task re-dispatch), Step 9.7 `(r)` remediation (concerned-task re-dispatch), and Step 10 failure routing (verifier `VERDICT: FAIL`) share a single per-task retry counter. Exhaustion in one path exhausts it for all paths — a task that has been re-dispatched twice through Step 9.5 and once through Step 9.7 has used all 3 retries, and any subsequent Step 10 `VERDICT: FAIL` for that task goes directly to the user-prompt in step 2 below rather than triggering another automatic retry. **Sub-task split budget rule:** Choosing `(s) Split into sub-tasks` in Step 9.5 §5 consumes 1 retry against the parent task's budget, and each resulting sub-task inherits the parent's remaining retry count rather than a fresh 3-retry budget. This closes the bypass where an exhausted parent could be split to obtain additional effective retries.
2. If still failing after 3 retries, **notify the user at the end of the wave** and ask:
   - Retry again (optionally with a different model or more context). Choosing `Retry again` **resets the per-task 3-retry budget for that task** — the user has explicitly authorized a fresh remediation window, so the shared counter described in step 1 (blocked-task re-dispatch + Step 9.7 `(r)` re-dispatch + Step 10 `VERDICT: FAIL` retries) is cleared back to 3 for this task only. A subsequent failure on that task re-enters the automatic-retry loop at the top of step 1 with a full budget.
   - Stop the entire plan

   There is no option to skip a failed task. A wave with any unresolved failure — including a verifier `VERDICT: FAIL` from Step 10 treated as a task failure — must either be retried to resolution or stopped. `VERDICT: FAIL` from Step 10 is routed through this same failure-handling path with no skip option.

Apply wave pacing from Step 3. These options only govern the cadence of waves that contain no `BLOCKED` results and where Step 9.7 has already exited via `(c) Continue` or remediation. If the wave contains any `BLOCKED` results, Step 9.5 has already paused execution; if Step 9.7 has not yet exited via `(c) Continue` or remediation, Step 9.7 has paused execution. Pacing does not apply to either of these pauses.

- **(a)** Always pause and report before the next wave starts
- **(b)** Never pause; collect all failures and report at the very end
- **(c)** Pause only when a wave produced failures; otherwise auto-continue

Under any of (a), (b), or (c), a wave that contains at least one `BLOCKED` task, has a Step 9.7 checkpoint that has not yet exited via `(c) Continue` or remediation, or has any task with Step 10 `VERDICT: FAIL` is not eligible to be "collected and reported at the end" — such waves are surfaced via Step 9.5, Step 9.7, or Step 12's retry loop respectively before the next wave starts.

## Step 13: Report partial progress

**Execution stopped early (user request or unrecoverable failure):**
- Leave the plan file in `.pi/plans/` so it can be resumed.
- Report which tasks completed, which failed, and which remain.

**Deferred integration regressions:** If `deferred_integration_regressions` is non-empty at the time execution stops, include them under a dedicated heading in the partial-progress report:

```
### Deferred integration regressions (unresolved)
<list of tests in deferred_integration_regressions>

These regressions were introduced by this plan and deferred during intermediate waves.
They remain unresolved and must be addressed before this branch is considered shippable.
```

**Persistence note:** Persisting `deferred_integration_regressions` across sessions (e.g., to a file on disk) is out of scope. If execution resumes in a new session, do NOT attempt to reconstruct the deferred set from the prior partial-progress report — those identifiers may be stale. Instead, re-run the full integration suite on resume and re-derive the current failing/deferred state fresh from that run before integration test classification can resume correctly.

## Step 14: Request code review

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

   **`clean`:** Include the review summary (iteration count, review file path) in the Step 15 completion report. Proceed to Step 15.

   **`max_iterations_reached`:** Present remaining findings to the user. Offer:
   - **(a) Keep iterating** — re-invoke refine-code, budget resets
   - **(b) Proceed with issues** — continue to completion with findings noted
   - **(c) Stop execution** — skip completion, report partial progress

   **Review disabled** (user chose to disable in Step 3): Skip directly to Step 15.

## Step 15: Complete

### Final integration regression gate (precondition)

**Skip if:** Integration tests are disabled (Step 3 settings) or no test command is available.

**Always run otherwise.** Whenever integration tests are enabled and a test command exists, this gate runs regardless of whether deferment occurred during execution and regardless of whether Step 14 review/remediation produced follow-up commits. A final integration check is cheap and confirms that no plan-introduced regression — whether previously deferred by the user or freshly introduced by Step 14 remediation — slipped through to completion.

Before moving the plan file, closing the linked todo, or running branch completion, verify that **no plan-introduced integration regression remains**. This includes (a) regressions the user deferred during intermediate waves and (b) any regressions that surfaced for the first time in the final integration run — for example, regressions introduced by the Step 14 review/remediation commits after the final wave's own integration check.

**Gate protocol:**

1. **Re-run the full integration suite** using the same test command from Step 3. Apply the Step 7 identifier-extraction contract to the runner's failure output so identifiers are directly comparable with `baseline_failures` and `deferred_integration_regressions`.

2. **Apply the Step 7 reconciliation algorithm** to the run output. That algorithm is the single canonical definition of how to compute `current_failing`, reconcile `deferred_integration_regressions` (reporting any `cleared_deferred`), and derive `new_regressions_after_deferment`. Reuse it verbatim here so the final gate cannot silently miss a regression that a post-wave Step 11 classification would have surfaced. On this gate, a non-empty `new_regressions_after_deferment` typically means Step 14 review/remediation (or another post-final-wave change) introduced a fresh regression that no wave's integration menu had a chance to surface.

3. **Gate on the union `still_failing_deferred ∪ new_regressions_after_deferment`:**
   - If **both** sets are empty: the gate passes. Proceed to `### 1. Move plan to done`.
   - If **either** `still_failing_deferred` or `new_regressions_after_deferment` is non-empty: the plan cannot be marked complete while either set is non-empty. Present the report and menu below.

   Report format (always use the Step 7 three-section block — do NOT collapse it, even if one section is empty, so the user sees the full final-state picture):

   ```
   ⚠️ Final completion blocked: plan-introduced integration regressions remain.

   ### Baseline failures
   <list of tests in baseline_failures ∩ current_failing — pre-existing, not plan-introduced>

   ### Deferred integration regressions
   <list of tests in deferred_integration_regressions (post-reconciliation) — plan-introduced regressions the user chose to defer>

   ### New regressions in this wave
   <list of tests in new_regressions_after_deferment — on Step 15 this section represents plan-introduced regressions first observed at this final check (typically introduced by Step 14 remediation), reported under the same Step 11 heading so the three-section contract is identical>

   These regressions were introduced by this plan. They must be resolved before the plan can be marked complete.

   Options:
   (a) Debug failures now — run the final-gate debugger-first flow (below) against the plan-introduced regressions (deferred ∪ new); on success, re-enter this gate.
   (c) Stop execution     — halt plan execution; all committed wave commits are preserved as checkpoints.
   ```

   Empty lists render as `(none)`. The menu mirrors the Step 11 **final-wave menu** — there is no `(b) Defer` option here by design, matching the final-wave rule that plan-introduced regressions cannot be silently deferred past the point where the plan reports success.

4. **Menu actions:**
   - **(a) Debug failures now:** Run the **final-gate debugger-first flow** defined below, scoped to `still_failing_deferred ∪ new_regressions_after_deferment`. That flow re-runs the Step 7 reconciliation algorithm to judge success, so a remediation attempt succeeds when both `still_failing_deferred` and `new_regressions_after_deferment` are empty on the re-run. After debugging and remediation, re-run this entire gate from step 1 (which re-runs the suite, re-reconciles, and recomputes both sets). Repeat until both sets are empty or the user picks `(c)`. Each debugging attempt counts toward the Step 12 retry budget for the implicated tasks.
   - **(c) Stop execution:** Halt execution. Report partial progress via Step 13 so the user has a complete picture of plan-introduced failures left on the branch: list any non-empty `deferred_integration_regressions` under the deferred-regressions heading, and list the still-unresolved `new_regressions_after_deferment` separately as newly discovered final-gate regressions — do NOT fold them under the deferred-regressions heading, since they were never deferred by the user. Do NOT move the plan file, close the todo, or run branch completion.

### Final-gate debugger-first flow

This flow is specific to Step 15's final integration regression gate. Do NOT reuse the Step 11 "Debugger-first flow" verbatim here: Step 11's flow assumes a current wave exists and reads `git show HEAD` as "the wave commit" and "wave tasks" as the suspect universe. At Step 15 time, there is no current wave — `HEAD` may be a Step 14 review/remediation commit, the regressions being debugged may have been deferred across multiple earlier waves, and the implicated tasks may span the whole plan. Using plan-execution range rather than a single wave commit ensures this flow works regardless of which commit last touched the tree.

The Step 11 flow remains unchanged and continues to govern actual wave-time integration failures.

1. **Identify the plan execution range and implicated tasks from the failure output.**
   - Range: `BASE_SHA` = `PRE_EXECUTION_SHA` (recorded in Step 8, immediately before the first wave dispatched); `HEAD_SHA` = `git rev-parse HEAD` at this moment. The range `BASE_SHA..HEAD_SHA` captures every commit made by plan execution plus any Step 14 remediation commits, and nothing from before the plan started.
   - Changed-file universe: `git diff --name-only BASE_SHA HEAD_SHA`. Use this — NOT `git show HEAD` — because HEAD at final-gate time is not guaranteed to be a wave commit.
   - Suspect task list: inspect the failing test names, file paths in stack traces, and the changed-file universe above. Build a short list of plan tasks whose declared `**Files:**` scope (from the plan file) intersects the failing stack traces or whose behavior the failing tests cover. If the mapping is ambiguous, include every plan task whose `**Files:**` scope intersects `git diff --name-only BASE_SHA HEAD_SHA` — i.e., every task whose output was touched by plan execution. Do NOT constrain to a single wave.

2. **Dispatch a single debugging pass** using the `coder` agent with a prompt that follows the `systematic-debugging` skill. The prompt MUST include:
   - The failing test output (full, not truncated) for the union `still_failing_deferred ∪ new_regressions_after_deferment`.
   - The plan execution range `BASE_SHA..HEAD_SHA` and the list of files changed across it (`git diff --name-only BASE_SHA HEAD_SHA`).
   - A labeled breakdown of the two input sets: which failing identifiers were previously deferred (`still_failing_deferred`) and which first surfaced at the final gate (`new_regressions_after_deferment`). The diagnosis should use this split to reason about cause — e.g., long-deferred regressions vs. regressions newly introduced by Step 14 remediation.
   - The suspect task list from step 1, with each task's title and declared files.
   - An explicit instruction: "Follow the `systematic-debugging` skill. Complete Phase 1 (root cause investigation) before proposing any fix. If the root cause is a clear, localized defect in one or two files, you MAY apply the fix in this same dispatch — follow TDD (write a failing test reproducing the regression, then fix). If the root cause spans multiple tasks or requires design judgment, return a diagnosis only and do NOT modify code."
   - The required report shape: either `STATUS: DONE` with the fix applied and RED/GREEN evidence for the regression test, or `STATUS: DONE_WITH_CONCERNS` containing a `## Diagnosis` section naming the implicated task(s), the root cause, and the minimal change needed.

3. **Handle the debugging pass result:**

   In both sub-cases below, success after a remediation attempt is judged by re-running the full Step 15 gate (go back to gate step 1: re-run the suite, re-reconcile, recompute both `still_failing_deferred` and `new_regressions_after_deferment`). The attempt succeeds when **both** sets are empty on the re-run. Any pre-existing baseline failures are allowed to remain. Note that unlike Step 11's wave-scoped flow (which only has to clear `new_regressions_after_deferment` before moving to the next wave), the final gate must also clear any `still_failing_deferred` carried from prior waves — the plan cannot complete while either set remains non-empty.

   - **Diagnosed and fixed (`STATUS: DONE`):** Commit the fix with `git commit -m "fix(plan): final-gate regression — <short summary>"` (only if the debugging pass actually modified files; if it returned `STATUS: DONE` without changes, skip the commit). Re-enter the Step 15 gate at step 1 (re-run the suite, re-reconcile, recompute both sets). If both are empty, the gate passes and normal completion proceeds. If either is non-empty, treat it as a failed debugging pass (below) and re-present the Step 15 menu.
   - **Diagnosis only (`STATUS: DONE_WITH_CONCERNS` with `## Diagnosis`):** Use the diagnosis to dispatch a **targeted remediation** — a second `coder` dispatch scoped to only the implicated task(s)/files from the diagnosis. Include the diagnosis text, the failing test output, and the original task spec(s) for the implicated task(s) from the plan file. After that dispatch returns, commit its changes with `git commit -m "fix(plan): final-gate regression — <short summary>"` (only if the remediation actually modified files), then re-enter the Step 15 gate at step 1. If both sets are empty, the gate passes. If either is non-empty, treat it as a failed debugging pass.
   - **Failed debugging pass** (blocker, or post-re-run `still_failing_deferred ∪ new_regressions_after_deferment` is still non-empty): re-present the Step 15 menu (`(a) Debug failures now`, `(c) Stop execution` — there is no defer option at the final gate). Count this attempt toward the Step 12 retry limit for the implicated tasks.

4. **Do NOT re-dispatch every plan task** unless the diagnosis explicitly implicates all of them. Targeted remediation against the diagnosed tasks is the point of this flow.

5. **Commit undo is NOT a tool of the final-gate flow.** Step 11's fallback of `git reset HEAD~1` to undo a wave commit does not apply here: `HEAD` at Step 15 is not guaranteed to be a wave commit, and prior wave commits must remain as checkpoints for the `(c) Stop execution` exit path. If targeted remediation fails repeatedly, the only exits are (a) another debugging attempt (which costs a retry against Step 12's budget) or (c) stop execution.

**Blocking guarantee:** Steps `### 1. Move plan to done`, `### 2. Close linked todo`, and `### 4. Branch completion` MUST NOT execute while `still_failing_deferred ∪ new_regressions_after_deferment` is non-empty. The only exits from this gate are: (a) both sets become empty (gate passes), or (b) the user selects `(c) Stop execution`. Silent success on the final gate is NOT an option when Step 14 remediation has introduced a regression — the same classification model used after every wave is reused here, so any plan-introduced regression still present at Step 15 blocks normal completion regardless of whether it was previously deferred.

### 1. Move plan to done

**Unconditional** — the plan was executed regardless of what happens to the branch:
- Create `.pi/plans/done/` if it doesn't exist
- Move the plan file to `.pi/plans/done/`

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

Report: number of tasks completed, any concerns noted, review status/notes (if review was performed), and total time taken.

If a linked todo was closed in step 2, include it in the summary (e.g., "Closed TODO-5735f43b").

### 4. Branch completion (if applicable)

**Only when running in a worktree or on a feature branch** (i.e., not on main/master/develop):

Invoke the `finishing-a-development-branch` skill, which:
1. Verifies tests pass
2. Determines base branch
3. Presents 4 options: merge locally, create PR, keep as-is, discard
4. Executes the chosen option
5. Cleans up worktree if applicable

Branch completion is offered even if review issues are pending — the user may want to keep the branch and fix later, or create a PR with known issues noted.

**When on main/master (no branch):** Skip branch completion. Just report the summary from step 3.
