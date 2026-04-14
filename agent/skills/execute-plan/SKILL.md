---
name: execute-plan
description: "Executes a structured plan file from .pi/plans/. Decomposes tasks into dependency-ordered waves and dispatches plan-executor subagents in parallel. Use when the user wants to execute an existing plan."
---

# Execute Plan

## Step 0: Worktree pre-flight

Before starting execution, determine the workspace.

**Precondition:** Verify this is a git repository:
```bash
git rev-parse --git-dir 2>/dev/null || { echo "execute-plan requires a git repository."; exit 1; }
```

If the check fails, stop with: "execute-plan requires a git repository."

**Auto-detect:** Check if already on a feature branch or in a worktree:
```bash
# Check if in a worktree (git-common-dir differs from .git only in worktrees)
IS_WORKTREE=$(git rev-parse --git-common-dir 2>/dev/null)
# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
```

**If already on a feature branch** (not main/master/develop) **or in a worktree:** Use the existing workspace. This is reflected in the settings summary (Step 3) as:
```
    Workspace:          current workspace (on <branch-name>)
```
Do not ask — proceed to Step 1.

**If on main/master/develop and NOT in a worktree:** The settings summary (Step 3) will show `new worktree (branch: <suggested-branch>)` as the default.

If the user accepts the worktree default (or selects it during customization):
1. Suggest a branch name derived from the plan filename. For example, plan `2026-04-06-execute-plan-enhancements.md` → branch `plan/execute-plan-enhancements`.
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
- Already on a feature branch or in a worktree: `current workspace (on <branch-name>)`
- On main in a git repo (default): `new worktree (branch: <suggested-branch>)`

**Integration test value:** When enabled and a test command is available, include the command: `enabled (<command>)`. When no test command is available: `disabled (no test command)`.

**Defaults:**

| Setting | Default | Notes |
|---------|---------|-------|
| Workspace | new worktree | Auto-detected if already on branch/worktree — shows current state, not a choice |
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
1. Workspace — New worktree / Current workspace (only if not auto-detected)
2. TDD — Enabled / Disabled
3. Execution mode — Sequential / Parallel
4. Wave pacing (if parallel) — Pause between waves / Auto-continue / Auto-continue unless failures
5. Integration test — Enabled / Disabled. If enabling and no test command yet detected, ask: "Enter test command (e.g., `npm test`):"
6. Final review — Enabled / Disabled. If enabling, ask: "Max remediation iterations (default 3):"

After customization, show the final settings summary for confirmation.

**If `q`:** Cancel execution and stop with: `Plan execution cancelled.`

If workspace was auto-detected (already on feature branch or in worktree), that line shows the detected state and is not a customizable option.

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

If a wave has more than 7 tasks, split it into sequential sub-waves of ≤7 tasks each.

## Step 6: Resolve model tiers

Read the model matrix from `~/.pi/agent/models.json`:

```bash
cat ~/.pi/agent/models.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

Map each task's model recommendation to the tier map:

| Task recommendation | Model to use |
|---------------------|-------------|
| `capable` | `modelTiers.capable` |
| `standard` | `modelTiers.standard` |
| `cheap` | `modelTiers.cheap` |

If a task has no tier specified, apply this rubric:
- Touches 1–2 files with a complete spec → `cheap`
- Touches multiple files with integration concerns → `standard`
- Requires design judgment or broad codebase understanding → `capable`

Always pass an explicit `model` override per task in the subagent dispatch using the resolved value from the tier map. Do not parse, guess, or derive model name strings — use the exact strings from `modelTiers`.

## Step 6b: Baseline test capture

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

## Step 7: Execute waves

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
- **If `n`:** Disable commit-per-wave for this entire execution (proceed without checkpoints). Do not ask again.

This confirmation is asked once at the start, not per wave. If the user is on a feature branch or in a worktree, skip this check entirely — commits on feature branches are expected.

For each wave, dispatch all tasks in parallel:
```
subagent { tasks: [
  { agent: "plan-executor", task: "<self-contained prompt>", model: "<resolved>" },
  { agent: "plan-executor", task: "<self-contained prompt>", model: "<resolved>" },
  ...
]}
```

For sequential mode, dispatch one task at a time:
```
subagent { agent: "plan-executor", task: "<self-contained prompt>", model: "<resolved>" }
```

### Assembling worker prompts

Read [implementer-prompt.md](implementer-prompt.md) in this directory once (before the first wave). For each task, fill the placeholders:

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

  Follow test-driven development for all implementation work:
  1. Write a failing test first that describes the desired behavior
  2. Run the test — verify it fails for the expected reason (feature missing, not a typo)
  3. Write the minimal code to make the test pass
  4. Run the test — verify it passes and all other tests still pass
  5. Refactor if needed — keep tests green

  No production code without a failing test first. If you write code before a test, delete it and start over.
  If the task includes test files in its file list, follow this cycle for each step.
  ```

  If TDD is disabled, fill `{TDD_BLOCK}` with an empty string.

The filled template becomes the task prompt for the `plan-executor` subagent. The template already includes self-review instructions, escalation guidance, code organization guidance, and the report format — do not add these separately.

## Step 8: Handle worker status codes

After each wave completes, process each worker response:

- **DONE** → proceed to verification (Step 9).
- **DONE_WITH_CONCERNS** → read the concerns. Correctness/scope concerns must be addressed before verification; observations can be noted and execution continues.
- **NEEDS_CONTEXT** → provide the missing context and re-dispatch the task immediately.
- **BLOCKED** → assess the blocker:
  - Context problem → provide more context and re-dispatch
  - Reasoning problem → re-dispatch with a more capable model
  - Task too large → break into smaller sub-tasks and dispatch them
  - Plan is fundamentally wrong → escalate to the user

**Never ignore an escalation or re-dispatch the same task to the same model without changes.**

## Step 9: Verify wave output

After each wave, read each output file and verify its content against the plan's acceptance criteria point-by-point. Checking file existence or non-emptiness is **not sufficient** — review actual content. If content doesn't match the acceptance criteria, treat it as a failure and apply Step 10 retry logic.

### Task verification

After verifying outputs yourself (above), the orchestrator's own acceptance criteria check is the per-wave verification. No subagent is dispatched for this step — the orchestrator reads the code and checks criteria directly. If any acceptance criterion is not met, treat it as a failure and apply Step 10 retry logic.

## Step 9b: Post-wave commit and integration tests

After wave verification (Step 9) and spec review complete successfully for a wave, perform the following steps in order.

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
- Task 4: Add main-branch confirmation guard to Step 7 of execute-plan SKILL.md
```

**If `git add -A` stages nothing** (wave produced no file changes): skip the commit silently. This can happen if a wave's tasks were verification-only.

### 2. Run integration tests

**Skip if:** Integration test is disabled (Step 3 settings) or no test command is available.

Run the test command:

```bash
TEST_OUTPUT=$(<test_command> 2>&1)
TEST_EXIT=$?
```

**Compare against baseline** (from Step 6b):
- If the baseline was clean (exit 0) and the current run exits 0 → **pass**. Proceed to next wave.
- If the baseline was clean (exit 0) and the current run exits non-0 → **fail**. Regressions introduced.
- If the baseline had pre-existing failures: compare the current failing tests against the baseline failures. If only the same tests fail → **pass** (no regressions). If new failures appear → **fail** (regressions introduced).

**On pass:** Report briefly ("✅ Integration tests pass after wave N") and proceed to the next wave.

**On fail:** Present the user with choices, following the same interaction pattern as Step 10's retry/skip/stop:

```
❌ Integration tests failed after wave <N>.

New failures:
<list of new failing tests or diff from baseline>

Options:
(r) Retry — re-dispatch this wave's tasks with test failures appended to prompts
(s) Skip — proceed to wave <N+1> despite test failures
(x) Stop — halt plan execution (committed waves are preserved as checkpoints)
```

- **Retry:** First, undo the wave's commit if one was made: `git reset --soft HEAD~1` to undo the commit while keeping changes staged, then `git reset HEAD` to unstage so workers start from a clean state. Re-dispatch all tasks from the current wave, appending the test output to each task's prompt so the workers know what broke. This counts as a retry toward the 3-retry limit in Step 10.
- **Skip:** Proceed to the next wave. The failing commit remains (if committed). Warn: "⚠️ Proceeding with known test regressions."
- **Stop:** Halt execution. All prior wave commits are preserved as checkpoints. Report partial progress (Step 11). The user can resume or fix manually.

## Step 10: Handle failures and retries

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

## Step 11: Report partial progress

**Execution stopped early (user request or unrecoverable failure):**
- Leave the plan file in `.pi/plans/` so it can be resumed.
- Report which tasks completed, which failed, and which remain.

## Step 12: Request code review

After all waves complete successfully (and if the user chose review in Step 3):

1. **Gather inputs:**
   - `BASE_SHA` = `PRE_EXECUTION_SHA` (recorded in Step 7)
   - `HEAD_SHA` = `git rev-parse HEAD`
   - Description = the plan's Goal section
   - Requirements = full plan file contents
   - Max iterations = from Step 3 settings (default 3)
   - Working directory = current workspace path
   - Review output path = `.pi/reviews/<plan-name>-code-review` (derived from plan filename, e.g., plan `2026-04-06-my-feature.md` → `.pi/reviews/2026-04-06-my-feature-code-review`)

2. **Invoke the `review-loop` skill** with the gathered inputs.

3. **Handle the result:**

   **`clean`:** Include the review summary (iteration count, review file path) in the Step 13 completion report. Proceed to Step 13.

   **`max_iterations_reached`:** Present remaining findings to the user. Offer:
   - **(a) Continue iterating** — re-invoke `review-loop` (budget resets, new era)
   - **(b) Proceed** — move to Step 13 with known issues noted in the summary
   - **(c) Stop** — halt execution, report partial progress (Step 11)

   **Review disabled** (user chose to disable in Step 3): Skip directly to Step 13.

## Step 13: Complete

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
