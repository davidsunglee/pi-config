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

**If exit code 0 (all tests pass):**
Record a clean baseline. Any post-wave test failure is a regression introduced by the plan execution.

**If exit code non-zero (some tests fail):**
Warn the user:
```
⚠️ Baseline: N tests already failing before execution.
New failures only will be flagged after each wave.
```
Record the test output (failing test names/count). Proceed with execution — pre-existing failures will be excluded from the pass/fail decision after each wave.

**How to distinguish new failures from pre-existing ones:**
- After each wave, run the test command again and compare the output against the baseline.
- If the set of failing tests is the same as (or a subset of) the baseline, treat it as a pass — no regressions introduced.
- If new test names appear in the failures that were not in the baseline, treat it as a fail — regressions introduced.
- A simple heuristic: if the exit code is non-zero and the count of failing tests increased, or if any new test name appears in the output that wasn't in the baseline output, flag it as a regression.

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
- **DONE_WITH_CONCERNS** → read the concerns. Correctness/scope concerns must be addressed before verification; observations can be noted and execution continues.
- **NEEDS_CONTEXT** → provide the missing context and re-dispatch the task immediately.
- **BLOCKED** → assess the blocker:
  - Context problem → provide more context and re-dispatch
  - Reasoning problem → re-dispatch with a more capable model
  - Task too large → break into smaller sub-tasks and dispatch them
  - Plan is fundamentally wrong → escalate to the user

**Never ignore an escalation or re-dispatch the same task to the same model without changes.**

## Step 10: Verify wave output

After each wave, read each output file and verify its content against the plan's acceptance criteria point-by-point. Checking file existence or non-emptiness is **not sufficient** — review actual content. If content doesn't match the acceptance criteria, treat it as a failure and apply Step 12 retry logic.

### Task verification

After verifying outputs yourself (above), the orchestrator's own acceptance criteria check is the per-wave verification. No subagent is dispatched for this step — the orchestrator reads the code and checks criteria directly. If any acceptance criterion is not met, treat it as a failure and apply Step 12 retry logic.

## Step 11: Post-wave commit and integration tests

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

**Compare against baseline** (from Step 7):
- If the baseline was clean (exit 0) and the current run exits 0 → **pass**. Proceed to next wave.
- If the baseline was clean (exit 0) and the current run exits non-0 → **fail**. Regressions introduced.
- If the baseline had pre-existing failures: compare the current failing tests against the baseline failures. If only the same tests fail → **pass** (no regressions). If new failures appear → **fail** (regressions introduced).

**On pass:** Report briefly ("✅ Integration tests pass after wave N") and proceed to the next wave.

**On fail:** Present the user with the suite-standard choices:

```
❌ Integration tests failed after wave <N>.

New failures:
<list of new failing tests or diff from baseline>

Options:
(a) Debug failures — dispatch a systematic-debugging pass, then remediate
(b) Skip tests     — proceed to wave <N+1> despite failures
(c) Stop execution — halt plan execution; committed waves are preserved as checkpoints
```

- **(a) Debug failures:** Run the debugger-first flow described in "Debugger-first flow" below. Do NOT undo the wave commit up front; the debugging dispatch inspects the committed state. This path counts as a retry toward the 3-retry limit in Step 12.
- **(b) Skip tests:** Proceed to the next wave. The failing commit remains. Warn: "⚠️ Proceeding with known test regressions."
- **(c) Stop execution:** Halt execution. All prior wave commits are preserved as checkpoints. Report partial progress (Step 13). The user can resume or fix manually.

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
   - **Diagnosed and fixed (`STATUS: DONE`):** Re-run the test command. If it now matches the baseline (pass), add a follow-up commit (`git commit -m "fix(plan): wave <N> regression — <short summary>"`) and proceed to the next wave. If tests still fail, treat it as a failed debugging pass (below).
   - **Diagnosis only (`STATUS: DONE_WITH_CONCERNS` with `## Diagnosis`):** Use the diagnosis to dispatch a **targeted remediation** — a second `coder` dispatch scoped to only the implicated task(s)/files from the diagnosis. Include the diagnosis text, the failing test output, and the original task spec(s) for the implicated task(s). After that dispatch returns, re-run the test command. If it now passes, add a follow-up commit (`git commit -m "fix(plan): wave <N> regression — <short summary>"`) and proceed to the next wave. If tests still fail, treat it as a failed debugging pass.
   - **Failed debugging pass** (blocker, or fix did not resolve failures): re-present the `(a)/(b)/(c)` choices to the user. Count this attempt toward the Step 12 retry limit.

4. **Do NOT re-dispatch unaffected wave tasks** unless the diagnosis explicitly implicates them. Avoiding blanket re-runs is the point of this flow.

5. **Commit undo is only used as a fallback.** If the targeted remediation also fails and the user chooses to retry again, at that point — and only then — offer to undo the wave commit with `git reset HEAD~1` (working-tree changes from the wave are preserved unstaged for the retry) before a broader retry. Do not undo proactively.

## Step 12: Handle failures and retries

If a worker produces empty, missing, or incorrect output:
1. Retry automatically up to **3 times** (with improvements to the task prompt if possible).
2. If still failing after 3 retries, **notify the user at the end of the wave** and ask:
   - Retry again (optionally with a different model or more context)
   - Skip the failed task and continue to the next wave
   - Stop the entire plan

Apply wave pacing from Step 3:
- **(a)** Always pause and report before the next wave starts
- **(b)** Never pause; collect all failures and report at the very end
- **(c)** Pause only when a wave produced failures; otherwise auto-continue

## Step 13: Report partial progress

**Execution stopped early (user request or unrecoverable failure):**
- Leave the plan file in `.pi/plans/` so it can be resumed.
- Report which tasks completed, which failed, and which remain.

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
