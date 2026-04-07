# Execution Checkpoints: Wave Commits, Baseline Tests, and Integration Verification

## Goal

Add three execution-integrity features to `execute-plan`: (1) git commits after each wave as rollback checkpoints, (2) baseline test capture before execution begins, and (3) integration test runs between waves with retry/skip/stop on failure. Also add an optional `## Test Command` section to the plan format so the planner can specify test commands, and update the plan-generator to detect and include test commands.

## Architecture Summary

The `execute-plan` skill (`~/.pi/agent/skills/execute-plan/SKILL.md`) is a step-by-step markdown instruction set followed by an orchestrating agent. It dispatches `plan-executor` subagents as workers, organized into dependency-ordered waves. Changes here are purely to the orchestration instructions — no code, only markdown skill files and the plan-generator agent definition.

The plan-generator (`~/.pi/agent/agents/plan-generator.md`) produces plan files in `.pi/plans/`. Its system prompt defines the required plan sections. Adding the optional `## Test Command` section touches both the generator (to produce it) and the executor (to consume it).

**Integration points:**
- `execute-plan/SKILL.md` — consumes the `## Test Command` section from plans, adds commit/test steps
- `plan-generator.md` — produces the `## Test Command` section in generated plans
- `generate-plan/SKILL.md` — dispatches the plan-generator; its skill file is NOT modified (the plan-generator agent's system prompt is the thing that changes)
- `finishing-a-development-branch` — already invoked in Step 13; no changes needed
- `using-git-worktrees` — already invoked in Step 0; no changes needed

## Tech Stack

- Markdown skill files (no code, no dependencies)
- Pi subagent dispatch system (subagent tool)
- Git (commit, branch detection, SHA tracking)
- Shell commands (test execution, exit code checking)

## File Structure

- `~/.pi/agent/skills/execute-plan/SKILL.md` (Modify) — Add `## Test Command` recognition in Step 2 validation; add test command and commit-per-wave settings to Step 3; add new baseline test capture step after Step 6; add main-branch confirmation guard in Step 7; add post-wave commit + integration test step after Step 9; add clarifying note to Step 12 about git range.
- `~/.pi/agent/agents/plan-generator.md` (Modify) — Add `## Test Command` as an optional section in the plan output format; instruct the generator to detect and include test commands based on codebase analysis.

---

## Tasks

### Task 1: Update `plan-generator.md` to include `## Test Command` in generated plans

**Files:**
- Modify: `~/.pi/agent/agents/plan-generator.md`

**Steps:**

- [ ] **Step 1: Read the current plan-generator agent definition** — Read `~/.pi/agent/agents/plan-generator.md` in full to understand the current system prompt, required sections, and formatting conventions.

- [ ] **Step 2: Add the `## Test Command` section to the plan output format** — In the `## Plan Output` → `### Required Sections` area, add a new optional section after the existing section 5 (Risk Assessment). Insert the following content after the `#### 5. Risk Assessment` block and before the `### Scope Check` heading:

  ```markdown
  #### 6. Test Command (Optional)

  If the codebase has a test suite, include a `## Test Command` section specifying how to run tests:

  ~~~markdown
  ## Test Command

  ```bash
  npm test
  ```
  ~~~

  Detect the test command from the codebase:
  - `package.json` with a `test` script → `npm test`
  - `Cargo.toml` → `cargo test`
  - `Makefile` with a `test` target → `make test`
  - `pyproject.toml` or `setup.py` with pytest → `pytest`
  - `go.mod` → `go test ./...`

  If the project has no test infrastructure or tests are not relevant to the plan, omit the section entirely. Do not include a test command that would fail or is not meaningful.

  **Format constraint:** The test command must be in a fenced code block with `bash` language tag, inside the `## Test Command` section. The section heading must be exactly `## Test Command` (level 2, exact text) — the executor parses this heading to find the command.
  ```

  **Constraints that would break the file:**
  - The file must begin with YAML frontmatter between `---` delimiters. The frontmatter must be the very first content — no blank lines or comments before the opening `---`.
  - The YAML frontmatter fields (`name`, `description`, `tools`, `model`) must remain exactly as they are now.
  - The rest of the system prompt content must remain unchanged except for the addition described above.

- [ ] **Step 3: Verify the modification** — Read back `~/.pi/agent/agents/plan-generator.md` and verify:
  - YAML frontmatter is intact and unchanged (name, description, tools, model)
  - The new section 6 appears after Risk Assessment and before Scope Check
  - The section heading is documented as exactly `## Test Command`
  - Detection heuristics are listed (package.json, Cargo.toml, Makefile, pyproject.toml, go.mod)
  - The section is marked as optional
  - All other content is unchanged

**Acceptance criteria:**
- `~/.pi/agent/agents/plan-generator.md` YAML frontmatter unchanged (name: plan-generator, description, tools: read/grep/find/ls/bash, model: claude-opus-4-6)
- New section "6. Test Command (Optional)" appears between Risk Assessment and Scope Check
- Section documents that the heading must be exactly `## Test Command` (level 2)
- Lists at least 5 detection heuristics (package.json, Cargo.toml, Makefile, pyproject.toml/setup.py, go.mod)
- States the section is optional and should be omitted when not meaningful
- Format constraint about bash fenced code block is documented
- All pre-existing content (sections 1-5, Scope Check, Task Granularity, No Placeholders, Format Constraints, Model Selection, Self-Review, Output) is preserved verbatim

**Model recommendation:** standard

---

### Task 2: Add `## Test Command` recognition and test/commit settings to `execute-plan` SKILL.md

**Files:**
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current SKILL.md in full** — Read `~/.pi/agent/skills/execute-plan/SKILL.md` to understand all current steps, their exact wording, and the overall structure. Pay close attention to Step 2 and Step 3 — these are the sections you will replace.

- [ ] **Step 2: Replace Step 2 (Validate the plan) to recognize the optional `## Test Command` section** — Find the current `## Step 2: Validate the plan` section and replace its entire content (from the `## Step 2` heading up to but not including the `## Step 3` heading) with the following verbatim:

  ````markdown
  ## Step 2: Validate the plan

  Check the plan contains all of:
  1. A header (goal, architecture summary, tech stack)
  2. A file structure section (files with Create/Modify annotations)
  3. Numbered tasks — each with `**Files:**`, checkbox steps, acceptance criteria, and a model recommendation
  4. A Dependencies section
  5. A Risk assessment

  The plan may also contain an optional `## Test Command` section with a bash command for running the project's test suite. If present, extract the command (the content of the bash fenced code block inside `## Test Command`) for use in later steps (baseline capture and integration tests). If absent, test command detection falls back to auto-detect in Step 3.

  If any of the 5 required sections is missing: **stop and tell the user** what's missing, and suggest re-generating with the `generate-plan` skill. Do NOT guess or fill in missing sections.
  ````

  **Use a targeted, narrow oldText match for the edit — do not include surrounding step headings (Step 1 or Step 3) in your edit context.**

- [ ] **Step 3: Replace Step 3 (Confirm execution settings) to add commit and integration test settings** — Find the current `## Step 3: Confirm execution settings` section and replace its entire content (from the `## Step 3` heading up to but not including the `## Step 4` heading) with the following verbatim:

  ````markdown
  ## Step 3: Confirm execution settings

  Present a single settings confirmation showing recommended defaults:

  ```
  Execution settings:

    Workspace:          <auto-detected or "Worktree (recommended — creates feature branch)">
    Execution:          Parallel, auto-continue unless failures
    TDD:                Enabled
    Per-task review:    Enabled (spec compliance after each wave)
    Final review:       Enabled (code quality after all waves)
    Commit per wave:    <Enabled or N/A — see below>
    Integration tests:  <Enabled or N/A — see below>
    Test command:       <command or "not detected">

  Accept defaults? (y / customize)
  ```

  **Defaults:**

  | Setting | Default | Notes |
  |---------|---------|-------|
  | Workspace | Worktree (recommended) | Auto-detected if already on branch/worktree — shows current state, not a choice |
  | Execution | Parallel, auto-continue unless failures | Equivalent to former options (b) parallel + pacing (c) |
  | TDD | Enabled | Can disable for non-code plans (docs, config, content) |
  | Per-task review | Enabled | Spec compliance review after each wave — can disable for speed |
  | Final review | Enabled | Code quality review after all waves — can disable |
  | Commit per wave | Enabled | Only shown if inside a git repo. If not a git repo, show "N/A (no git repo)" and skip silently |
  | Integration tests | Enabled | Only shown if a test command is available (from plan or auto-detect). If no test command, show "N/A (no test command)" |
  | Test command | Auto-detected | Sourced from the resolution order below. Shows the resolved command or "not detected" |

  **Test command resolution order:**
  1. If the plan contains a `## Test Command` section (extracted in Step 2), use that command.
  2. Otherwise, auto-detect from project files:
     - `package.json` with a `test` script → `npm test`
     - `Cargo.toml` → `cargo test`
     - `Makefile` with a `test:` target → `make test`
     - `pyproject.toml` or `setup.py` → `pytest`
     - `go.mod` → `go test ./...`
  3. If neither yields a command, show "not detected" in the settings. During customize, allow the user to provide a command or confirm no tests.

  **If `y`:** Accept all defaults, proceed to Step 4. One interaction.

  **If `customize`:** Ask each setting individually:
  1. Workspace — Worktree / Current workspace (only if not auto-detected)
  2. Execution mode — Sequential / Parallel
  3. Wave pacing (if parallel) — Pause between waves / Auto-continue / Auto-continue unless failures
  4. TDD injection — Enabled / Disabled
  5. Per-task spec review — Enabled / Disabled
  6. Final code review — Enabled / Disabled
  7. Commit per wave — Enabled / Disabled (only if git repo detected)
  8. Integration tests — Enabled / Disabled. If enabling and no test command yet detected, ask: "Enter test command (e.g., `npm test`):"
  9. Test command — Show current (from plan or auto-detect). Allow override or confirmation.

  After customization, show the final settings summary for confirmation.

  If workspace was auto-detected (already on feature branch or in worktree), that line shows the detected state and is not a customizable option.

  After settings are confirmed, if Worktree was selected and Step 0 hasn't executed worktree setup yet, execute it now.
  ````

  **Use a targeted, narrow oldText match for the edit — do not include surrounding step headings (Step 2 or Step 4) in your edit context.**

- [ ] **Step 4: Verify Steps 2 and 3 modifications** — Read back `~/.pi/agent/skills/execute-plan/SKILL.md` and verify:
  - Step 2 mentions the optional `## Test Command` section and how to extract the command
  - Step 2 still requires the 5 original sections
  - Step 3 settings display includes "Commit per wave", "Integration tests", and "Test command" rows
  - Step 3 defaults table has 8 rows (5 original + Commit per wave + Integration tests + Test command)
  - Step 3 documents test command resolution order with all 5 auto-detect heuristics (package.json → `npm test`, Cargo.toml → `cargo test`, Makefile → `make test`, pyproject.toml/setup.py → `pytest`, go.mod → `go test ./...`)
  - Step 3 customize flow has 9 items
  - All other steps (0, 1, 4–13) are unchanged

**Acceptance criteria:**
- Step 2 recognizes optional `## Test Command` section without requiring it
- Step 2 instructs to extract the bash command from the section for later use
- Step 2 still requires the 5 original sections and stops if any missing
- Step 3 settings display includes "Commit per wave", "Integration tests", and "Test command" rows
- Step 3 defaults table documents: Commit per wave (Enabled, git-only), Integration tests (Enabled if test command), Test command (resolution order)
- Step 3 test command resolution order lists: (1) plan `## Test Command`, (2) auto-detect with 5 heuristics (package.json, Cargo.toml, Makefile, pyproject.toml/setup.py, go.mod), (3) ask during customize
- Step 3 customize flow lists all 9 items including commit, integration tests, and test command override
- Step 3 "Commit per wave" shows "N/A (no git repo)" when not in a git repo
- Step 3 "Integration tests" shows "N/A (no test command)" when no command is available
- All steps other than 2 and 3 are unchanged

**Model recommendation:** standard

---

### Task 3: Add baseline test capture step to `execute-plan` SKILL.md

**⚠️ Constraint: This task modifies SKILL.md in parallel with Task 4. Use targeted, narrow oldText matches for edits — do not include surrounding step headings in your edit context. Task 3 inserts between Steps 6 and 7. Task 4 inserts within Step 7 after the HEAD SHA block. These are non-overlapping regions.**

**Files:**
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current SKILL.md** — Read `~/.pi/agent/skills/execute-plan/SKILL.md` in full (as modified by Task 2) to understand the current state. Locate the boundary between Step 6 (Resolve model tiers) and Step 7 (Execute waves) — this is where you will insert the new section.

- [ ] **Step 2: Insert new Step 6b (Baseline test capture) between Step 6 and Step 7** — Immediately after the end of Step 6's content and before the `## Step 7: Execute waves` heading, insert the following new section verbatim:

  ````markdown
  ## Step 6b: Baseline test capture

  **Skip if:** Integration tests are disabled (Step 3 settings) or no test command is available.

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
  ````

  **Edit approach:** Use the `## Step 7: Execute waves` heading as an anchor. Insert the new section immediately before that heading. Your oldText should match a small region at the end of Step 6's content plus the `## Step 7` heading, and your newText should include the same Step 6 tail content, then the new Step 6b section, then the `## Step 7` heading.

- [ ] **Step 3: Verify the insertion** — Read back `~/.pi/agent/skills/execute-plan/SKILL.md` and verify:
  - Step 6b appears between Step 6 and Step 7
  - It has skip conditions (integration tests disabled or no test command)
  - It documents both passing and failing baseline scenarios
  - It describes how to compare post-wave results against baseline
  - Steps 6 and 7 content is unchanged

**Acceptance criteria:**
- New "Step 6b: Baseline test capture" section exists between Step 6 and Step 7
- Documents skip condition: integration tests disabled or no test command
- Documents clean baseline case (exit 0): any post-wave failure is a regression
- Documents pre-existing failures case (exit non-0): warn user, record baseline, proceed
- Describes comparison strategy: compare post-wave failing tests against baseline, only flag new failures
- Warning message format matches spec: "⚠️ Baseline: N tests already failing before execution."
- Steps 6 and 7 content is unchanged

**Model recommendation:** cheap

---

### Task 4: Add main-branch confirmation guard to Step 7 of `execute-plan` SKILL.md

**⚠️ Constraint: This task modifies SKILL.md in parallel with Task 3. Use targeted, narrow oldText matches for edits — do not include surrounding step headings in your edit context. Task 4 inserts within Step 7 after the HEAD SHA block. Task 3 inserts between Steps 6 and 7. These are non-overlapping regions.**

**Files:**
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read Step 7 of the current SKILL.md** — Read `~/.pi/agent/skills/execute-plan/SKILL.md` and locate Step 7 (Execute waves). Identify the HEAD SHA recording block (`PRE_EXECUTION_SHA=$(git rev-parse HEAD)`) — you will insert the new subsection immediately after this block.

- [ ] **Step 2: Add main-branch confirmation guard to Step 7, after the HEAD SHA recording block and before the first wave dispatch** — Immediately after the `PRE_EXECUTION_SHA=$(git rev-parse HEAD)` code block and its closing triple-backtick, and before the "For each wave, dispatch all tasks in parallel:" paragraph, insert the following subsection verbatim:

  ````markdown
  ### Main-branch confirmation

  **Skip if:** Commit per wave is disabled (Step 3 settings).

  If executing directly on main/master/develop (not on a feature branch, not in a worktree), prompt the user once before the first commit:

  ```
  ⚠️ You're on `<branch_name>`. Commits will be made directly to <branch_name> after each wave.
  Continue? (y/n)
  ```

  - **If `y`:** Proceed with commits after each wave as configured.
  - **If `n`:** Disable commit-per-wave for this entire execution (proceed without checkpoints). Do not ask again.

  This confirmation is asked once at the start, not per wave. If the user is on a feature branch or in a worktree, skip this check entirely — commits on feature branches are expected.
  ````

  **Edit approach:** Your oldText should match a small region: the end of the PRE_EXECUTION_SHA code block (the closing triple-backtick line) and the beginning of the next paragraph ("For each wave"). Your newText should include the same code block ending, then the new subsection, then the "For each wave" paragraph beginning.

- [ ] **Step 3: Verify the insertion** — Read back Step 7 and verify:
  - The main-branch confirmation appears after HEAD SHA recording and before wave dispatch
  - It has a skip condition (commits disabled)
  - It only triggers on main/master/develop
  - It asks once, not per wave
  - `y` proceeds, `n` disables commits entirely
  - Rest of Step 7 is unchanged (wave dispatch, prompt assembly, implementer prompt template)

**Acceptance criteria:**
- Main-branch confirmation subsection exists within Step 7, after HEAD SHA recording
- Skip condition: commit per wave disabled
- Only triggers on main/master/develop (not feature branch, not worktree)
- Asks once at the start, not per wave
- `y` → proceed with commits; `n` → disable commits for entire execution
- Warning format: "⚠️ You're on `<branch_name>`."
- Rest of Step 7 (wave dispatch, prompt assembly) unchanged

**Model recommendation:** cheap

---

### Task 5: Add post-wave commit and integration test step to `execute-plan` SKILL.md

**Files:**
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current SKILL.md** — Read `~/.pi/agent/skills/execute-plan/SKILL.md` in full (as modified by Tasks 2–4) to understand the state of Steps 9 and 10, and to find the right insertion point between them.

- [ ] **Step 2: Insert new Step 9b (Post-wave commit and integration tests) after Step 9 and before Step 10** — Immediately after Step 9 (Verify wave output, including spec compliance review) and before the `## Step 10: Handle failures and retries` heading, insert the following section verbatim:

  ````markdown
  ## Step 9b: Post-wave commit and integration tests

  After wave verification (Step 9) and spec review complete successfully for a wave, perform the following steps in order.

  ### 1. Commit wave changes

  **Skip if:** Commit per wave is disabled (Step 3 settings) or not in a git repo.

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

  **If not in a git repo:** Skip commits silently. Do not error or warn — working on files outside version control is anomalous but allowed.

  ### 2. Run integration tests

  **Skip if:** Integration tests are disabled (Step 3 settings) or no test command is available.

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
  ````

  **Edit approach:** Use the `## Step 10: Handle failures and retries` heading as an anchor. Insert the new section immediately before it.

- [ ] **Step 3: Verify Step 9b insertion** — Read back the SKILL.md and verify:
  - Step 9b appears after Step 9 and before Step 10
  - Commit subsection has skip conditions, full message format with example, and empty-staging handling
  - Integration test subsection has skip conditions, baseline comparison, pass/fail logic
  - Failure handling presents retry/skip/stop choices
  - Retry path includes `git reset --soft HEAD~1` and `git reset HEAD` to undo the wave commit before re-dispatch
  - Stop preserves committed checkpoints

- [ ] **Step 4: Add a clarifying note to Step 12 about the git range** — In Step 12 (Request code review), locate the "Determine git range" subsection with the code block containing `BASE_SHA` and `HEAD_SHA`. Immediately after that code block's closing triple-backtick, insert the following paragraph:

  ```markdown
  The git range `BASE_SHA..HEAD_SHA` covers all wave commits (one per wave when commit-per-wave is enabled) or all uncommitted changes (when commits are disabled). No change to the range logic is needed — `BASE_SHA..HEAD_SHA` already handles both cases.
  ```

- [ ] **Step 5: Verify Step 12 note** — Read Step 12 and verify the clarifying note exists after the git range code block, and that no other content in Step 12 was changed.

**Acceptance criteria:**
- New "Step 9b: Post-wave commit and integration tests" section exists between Step 9 and Step 10
- **Commit subsection:**
  - Skip conditions: commits disabled or not in git repo
  - Commit message subject: `feat(plan): wave <N> - <plan_goal_summary>`
  - Commit message body: `- Task <X>: <task_title>` per task, one per line
  - Blank line between subject and body
  - Goal truncation with `...` at ~72 chars documented
  - Concrete example commit message included
  - Handles empty staging (no changes) by skipping silently
  - No error/warning when not in git repo
- **Integration test subsection:**
  - Skip conditions: tests disabled or no test command
  - Compares against baseline from Step 6b
  - Pass = no new failures; Fail = new failures
  - Clean baseline + exit 0 → pass; clean baseline + exit non-0 → fail
  - Pre-existing failures: compare test names, only flag new ones
  - Pass: "✅ Integration tests pass after wave N" and proceed
  - Fail: presents retry/skip/stop choices with exact format shown
  - Retry: runs `git reset --soft HEAD~1` then `git reset HEAD` to undo commit, appends test output to prompts, counts toward Step 10 limit
  - Skip: proceed with "⚠️ Proceeding with known test regressions." warning
  - Stop: halt, preserve prior wave commits, report partial progress via Step 11
- **Step 12 note:** Clarifying comment about git range covering wave commits exists after the code block
- All other steps unchanged

**Model recommendation:** capable

---

## Dependencies

```
- Task 1 depends on: (none)
- Task 2 depends on: (none)
- Task 3 depends on: Task 2
- Task 4 depends on: Task 2
- Task 5 depends on: Task 3, Task 4
```

Task 1 (plan-generator.md) and Task 2 (SKILL.md Steps 2-3) are independent — they modify different files. Tasks 3 and 4 both modify SKILL.md and depend on Task 2's changes being in place (they need to read the file after Task 2's modifications to find the correct insertion points). Task 5 depends on Tasks 3 and 4 because it inserts Step 9b which must come after the Steps 6b and the Step 7 guard that those tasks add.

**Wave plan:**
- Wave 1: Task 1, Task 2 (parallel — different files)
- Wave 2: Task 3, Task 4 (parallel — both modify SKILL.md but at non-overlapping insertion points: Task 3 inserts between Steps 6 and 7, Task 4 inserts within Step 7 after the HEAD SHA block; these are far apart in the file. Both tasks carry a constraint note about using narrow oldText matches.)
- Wave 3: Task 5 (modifies SKILL.md — inserts after Step 9, adds note to Step 12)

---

## Risk Assessment

### Risk 1: Parallel SKILL.md modifications in Wave 2 cause conflicts
**Likelihood:** Medium
**Impact:** High — one task's changes overwrite the other's
**Mitigation:** Tasks 3 and 4 insert content at well-separated points in the file (Task 3: between Steps 6 and 7; Task 4: within Step 7 near the top). Both tasks carry an explicit constraint note: "Use targeted, narrow oldText matches for edits — do not include surrounding step headings in your edit context." This prevents one agent from accidentally capturing the other's insertion region. If using `sed` or similar tools, insertions at different line numbers should not conflict. If a worker rewrites the entire file, only one writer can succeed. The implementer prompt instructs workers to modify, not rewrite. If conflicts occur, Step 10 retry logic handles it.

### Risk 2: Baseline test output comparison is fragile
**Likelihood:** Medium
**Impact:** Medium — false positives (flagging pre-existing failures as regressions) or false negatives (missing regressions)
**Mitigation:** The step documents a heuristic approach (compare failing test names/count) rather than exact string matching. The retry/skip/stop choices give the user control when the heuristic is wrong. This is a pragmatic "good enough" approach — exact test-name parsing varies by test framework and is out of scope.

### Risk 3: Commit message truncation loses important context
**Likelihood:** Low
**Impact:** Low — commit messages are informational, not functional
**Mitigation:** The spec defines truncation with `...` at ~72 chars. The task list in the body provides the detailed breakdown. This follows standard git conventions.

### Risk 4: Wave 2 workers insert at wrong line positions after Task 2 modified the file
**Likelihood:** Low-Medium
**Impact:** High — content inserted in wrong place breaks the skill flow
**Mitigation:** Each task's first step reads the current file state. Tasks 3 and 4 explicitly depend on Task 2, so they'll read the file after Task 2's changes. The steps specify semantic insertion points ("after Step 6", "within Step 7 after HEAD SHA") rather than line numbers, so workers should locate the right position by searching for the step headings.

### Risk 5: `git reset --soft HEAD~1` in retry path could lose non-wave changes
**Likelihood:** Low
**Impact:** Medium — unexpected changes lost
**Mitigation:** During plan execution, only plan tasks modify the working directory. The `git add -A` + commit captures everything. The `git reset --soft HEAD~1` only undoes one commit (the wave's commit), and the subsequent `git reset HEAD` unstages for a clean re-dispatch. If external changes were made between waves, they'd already be included in a prior wave commit. The retry path is also user-initiated (they chose "retry"), so they have awareness of what's happening.

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| Commit after each wave with structured message | Task 5 — Step 9b commit subsection |
| Subject line: `feat(plan): wave N - <goal>` | Task 5 — commit message format (inlined with example) |
| Body: `- Task N: <title>` list | Task 5 — commit message format (inlined with example) |
| No git repo: skip silently | Task 5 — commit skip condition |
| On main branch: ask once before first commit | Task 4 — Step 7 main-branch confirmation |
| If declined: skip commits for entire execution | Task 4 — `n` disables commits entirely |
| `## Test Command` plan format section (optional) | Task 1 — plan-generator addition |
| Plan validation recognizes but doesn't require `## Test Command` | Task 2 — Step 2 modification (full content inlined) |
| Plan-generator detects and includes test command | Task 1 — detection heuristics |
| Auto-detect fallback (package.json, Cargo.toml, etc.) | Task 2 — Step 3 test command resolution (5 heuristics inlined) |
| Ask user during Step 3 if no command detected | Task 2 — Step 3 customize flow item 8-9 |
| Baseline test capture before first wave | Task 3 — Step 6b |
| Clean baseline: any failure is regression | Task 3 — exit 0 case |
| Pre-existing failures: warn, record, proceed | Task 3 — exit non-0 case |
| Only flag new failures (compare against baseline) | Task 3 + Task 5 — comparison strategy |
| Integration tests after each wave commit | Task 5 — Step 9b integration test subsection |
| Pass/fail: exit code 0 is pass | Task 5 — comparison logic |
| Pre-existing failures excluded from decision | Task 5 — baseline comparison |
| On failure: retry/skip/stop choices | Task 5 — failure handling |
| Retry: re-dispatch with test output | Task 5 — retry path (includes commit undo) |
| Retry: undo wave commit first | Task 5 — `git reset --soft HEAD~1` + `git reset HEAD` |
| Skip: proceed despite failures | Task 5 — skip path |
| Stop: halt, preserve checkpoints | Task 5 — stop path |
| Step 12 git range covers multiple commits | Task 5 — Step 12 clarifying note |
| Backward compat: missing `## Test Command` falls back to auto-detect | Task 2 — Step 3 test command resolution order |

No gaps found.

### Review findings addressed

| Finding | Status | Fix |
|---------|--------|-----|
| ERROR — Task 2: Placeholder text | ✅ Fixed | Steps 2 and 3 now contain full verbatim replacement content |
| WARNING — Auto-detect heuristics in Task 2 | ✅ Fixed | 5 heuristics listed in Task 2 Step 3 replacement content |
| WARNING — Commit format in Task 5 | ✅ Fixed | Full template + concrete example inlined in Task 5 Step 2 |
| WARNING — Retry commit undo in Task 5 | ✅ Fixed | `git reset --soft HEAD~1` + `git reset HEAD` in retry path |
| WARNING — Parallel SKILL.md edits | ✅ Fixed | Constraint notes added to both Tasks 3 and 4 |
| SUGGESTION — Task 3 model → cheap | ✅ Fixed | Changed to `cheap` |
| SUGGESTION — Task 4 "after HEAD SHA recording" | ✅ Fixed | Step 2 says "after the HEAD SHA recording block" |

### Placeholder scan

No instances of "TBD", "TODO", "implement later", "similar to Task N", "(exact replacement content provided)", or any other placeholder text.

### Type/name consistency

- Section heading `## Test Command` — consistent between Task 1 (generator produces it) and Task 2 (executor recognizes it)
- Test command resolution order — consistent between Task 2 (Step 3 documents it) and Task 3 (Step 6b uses it)
- Auto-detect heuristics — identical list in Task 1 (plan-generator) and Task 2 (execute-plan Step 3)
- Baseline reference — Task 3 creates "Step 6b" baseline, Task 5 references "Step 6b" for comparison
- Step numbering — Tasks 3/4/5 use "Step 6b", "Step 7 subsection", "Step 9b" to avoid renumbering; consistent across all tasks
- Retry/skip/stop choices — Task 5 follows "the same interaction pattern as Step 10's retry/skip/stop", consistent with existing Step 10
- Commit message format — specified once in Task 5 with exact template and example
