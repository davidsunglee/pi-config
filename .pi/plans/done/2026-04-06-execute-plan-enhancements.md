# Execute-Plan Enhancements: Worktree, TDD, Spec Review, Implementer Prompt, Branch Completion

## Goal

Enhance the `execute-plan` skill with five quality mechanisms adapted from superpowers' `subagent-driven-development`: (1) git worktree isolation as a pre-flight step, (2) branch completion via `finishing-a-development-branch`, (3) TDD injection into worker prompts, (4) per-task spec compliance review after each wave, and (5) a standardized implementer prompt template. Additionally, consolidate the current 3-question Step 3 into a single settings confirmation with sensible defaults.

## Architecture Summary

The `execute-plan` skill (`~/.pi/agent/skills/execute-plan/SKILL.md`) is a step-by-step instruction set that an orchestrating agent follows when a user invokes the skill. It dispatches `plan-executor` subagents as workers. Two new prompt template files (`implementer-prompt.md`, `spec-reviewer.md`) will be added alongside `SKILL.md` in the same directory, following the established pattern used by `requesting-code-review/code-reviewer.md`, `generate-plan/plan-reviewer.md`, and superpowers' template files. The SKILL.md references these templates by relative path and instructs the orchestrator to read and fill them at dispatch time.

**Integration points with other skills:**
- `using-git-worktrees` — delegated to for worktree setup (Step 0)
- `finishing-a-development-branch` — delegated to for branch completion (Step 13)
- `test-driven-development` — condensed version injected into implementer prompts (Step 7)
- `requesting-code-review` — unchanged, already integrated at Step 12
- `generate-plan` + `plan-reviewer` — upstream, unchanged

## Tech Stack

- Markdown skill files (no code, no dependencies)
- Pi subagent dispatch system (subagent tool)
- Git (worktree detection, branch detection, SHA tracking)

## File Structure

- `~/.pi/agent/skills/execute-plan/implementer-prompt.md` (Create) — Standardized worker prompt template with placeholders (`{TASK_SPEC}`, `{CONTEXT}`, `{WORKING_DIR}`, `{TDD_BLOCK}`), self-review checklist, full escalation guidance, code organization guidance, and structured status reporting format.
- `~/.pi/agent/skills/execute-plan/spec-reviewer.md` (Create) — Per-task spec compliance reviewer prompt template with placeholders (`{TASK_SPEC}`, `{IMPLEMENTER_REPORT}`), "do not trust the report" instructions, and file:line reference requirements.
- `~/.pi/agent/skills/execute-plan/SKILL.md` (Modify) — Add Step 0 (worktree pre-flight), replace Step 3 (single confirmation UX), update Step 7 (use implementer template + conditional TDD), update Step 9 (add spec compliance review dispatch), replace Step 13 (plan → done/ + finishing-a-development-branch).

---

## Tasks

### Task 1: Create `implementer-prompt.md`

**Files:**
- Create: `~/.pi/agent/skills/execute-plan/implementer-prompt.md`

**Steps:**

- [ ] **Step 1: Read the superpowers implementer template for reference** — Read `/tmp/pi-github-repos/obra/superpowers@main/skills/subagent-driven-development/implementer-prompt.md` to understand the source material being adapted.

- [ ] **Step 2: Read the existing plan-executor agent definition** — Read `~/.pi/agent/agents/plan-executor.md` to understand the current worker agent's status codes and output format, which the implementer template must align with.

- [ ] **Step 3: Read the existing plan-reviewer.md for template pattern reference** — Read `~/.pi/agent/skills/generate-plan/plan-reviewer.md` to observe the established placeholder/template pattern (how placeholders are named, how the file is structured with a heading, purpose statement, placeholders in context, and instructions).

- [ ] **Step 4: Create the implementer-prompt.md file** — Write `~/.pi/agent/skills/execute-plan/implementer-prompt.md` with the following structure and content:

  **Required structure:**
  1. A markdown heading `# Implementer Prompt` followed by a one-line purpose statement
  2. A "Placeholders" section listing all placeholders the orchestrator must fill
  3. The actual template content (what the worker receives), clearly delineated

  **Required placeholders (use `{PLACEHOLDER_NAME}` syntax, ALL_CAPS with underscores):**
  - `{TASK_SPEC}` — the full text of the task from the plan (steps + acceptance criteria + files)
  - `{CONTEXT}` — scene-setting: where this task fits, what was done in prior waves, dependencies, architectural context
  - `{WORKING_DIR}` — the directory the worker should operate in
  - `{TDD_BLOCK}` — conditional: either the condensed TDD instructions or empty string

  **Required template sections (within the template body the worker sees):**

  a. **Task Description** — contains `{TASK_SPEC}` placeholder

  b. **Context** — contains `{CONTEXT}` placeholder

  c. **Working Directory** — contains `{WORKING_DIR}`

  d. **Code Organization** — adapted from superpowers implementer-prompt.md:
     - Follow the file structure defined in the plan
     - Each file should have one clear responsibility with a well-defined interface
     - If a file is growing beyond the plan's intent, stop and report DONE_WITH_CONCERNS
     - In existing codebases, follow established patterns

  e. **When You're in Over Your Head** — full escalation guidance (~15 lines), adapted from superpowers:
     - Opening line: "It is always OK to stop and say this is too hard. Bad work is worse than no work."
     - When to escalate list: architectural decisions with multiple valid approaches, can't find clarity in provided code, uncertain about approach, task involves unanticipated restructuring, reading file after file without progress
     - How to escalate: report BLOCKED or NEEDS_CONTEXT with specifics on what's needed and what was tried

  f. **Self-Review** — checklist before reporting back:
     - Completeness: all spec requirements implemented, no missed edge cases
     - Quality: clean, maintainable, good names
     - Discipline: no overbuilding (YAGNI), only built what was requested, followed existing patterns
     - Testing: tests verify behavior (not mocks), TDD if required, comprehensive

  g. **TDD Instructions** — contains `{TDD_BLOCK}` placeholder. When TDD is enabled, the orchestrator fills this with the condensed ~10-line TDD block:
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
     When TDD is disabled, the orchestrator fills `{TDD_BLOCK}` with an empty string (the section heading and content are both inside the placeholder, so nothing appears).

  h. **Report Format** — structured status report matching plan-executor.md conventions:
     ```
     STATUS: <DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT>

     ## Completed
     What was implemented.

     ## Tests
     What was tested and results.

     ## Files Changed
     - `path/to/file` — what changed

     ## Self-Review Findings
     Any issues found and fixed during self-review, or "None."

     ## Concerns / Needs / Blocker
     (only for DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED)
     ```

  **Constraints that would break the template:**
  - Placeholder names must match exactly: `{TASK_SPEC}`, `{CONTEXT}`, `{WORKING_DIR}`, `{TDD_BLOCK}` — the orchestrator does string replacement on these
  - The `{TDD_BLOCK}` placeholder must include the section heading inside it (so that when TDD is disabled and the placeholder is replaced with empty string, no orphan heading remains)
  - Status codes must match exactly: `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT` — the orchestrator parses these from the first line
  - Do NOT include YAML frontmatter — this is a prompt template, not a skill file
  - The template should NOT instruct the worker to ask questions (our workers are non-interactive, unlike superpowers' interactive Q&A model)
  - Remove superpowers' "Before You Begin — ask questions" and "While you work — ask questions" sections — replace with the escalation section which teaches workers to report BLOCKED/NEEDS_CONTEXT instead

- [ ] **Step 5: Verify the file was written** — Read back `~/.pi/agent/skills/execute-plan/implementer-prompt.md` and verify:
  - All four placeholders are present exactly once each
  - All required sections (a–h) are present
  - Status codes match plan-executor.md (DONE, DONE_WITH_CONCERNS, BLOCKED, NEEDS_CONTEXT)
  - No "ask questions" / interactive instructions remain
  - Escalation guidance is ~15 lines (not a 1-liner, not a full page)

**Acceptance criteria:**
- File exists at `~/.pi/agent/skills/execute-plan/implementer-prompt.md`
- Contains exactly four placeholders: `{TASK_SPEC}`, `{CONTEXT}`, `{WORKING_DIR}`, `{TDD_BLOCK}`
- Each placeholder appears exactly once
- Includes self-review checklist with Completeness, Quality, Discipline, Testing subsections
- Includes full escalation guidance (~15 lines) with "It is always OK to stop and say this is too hard" opening
- Includes code organization section (follow plan structure, one responsibility per file, follow existing patterns)
- Report format section specifies the four status codes matching plan-executor.md
- No YAML frontmatter
- No interactive Q&A instructions (workers are non-interactive)
- The `{TDD_BLOCK}` is structured so that when replaced with empty string, no orphan heading or whitespace artifact remains

**Model recommendation:** standard

---

### Task 2: Create `spec-reviewer.md`

**Files:**
- Create: `~/.pi/agent/skills/execute-plan/spec-reviewer.md`

**Steps:**

- [ ] **Step 1: Read the superpowers spec-reviewer template for reference** — Read `/tmp/pi-github-repos/obra/superpowers@main/skills/subagent-driven-development/spec-reviewer-prompt.md` to understand the source material.

- [ ] **Step 2: Read the plan-reviewer.md for the established template pattern** — Read `~/.pi/agent/skills/generate-plan/plan-reviewer.md` to follow the same structural conventions (heading, purpose, placeholders, calibration section, output format).

- [ ] **Step 3: Read the code-reviewer.md for the dispatch template pattern** — Read `~/.pi/agent/skills/requesting-code-review/code-reviewer.md` to see how another reviewer template structures its content (placeholders, checklist, output format, critical rules).

- [ ] **Step 4: Create the spec-reviewer.md file** — Write `~/.pi/agent/skills/execute-plan/spec-reviewer.md` with the following structure:

  **Required structure:**
  1. A markdown heading `# Spec Compliance Reviewer` followed by a one-line purpose statement
  2. The template content with placeholders, review instructions, calibration, and output format

  **Required placeholders:**
  - `{TASK_SPEC}` — the full text of the task from the plan (steps + acceptance criteria + files)
  - `{IMPLEMENTER_REPORT}` — the implementer's status report (what they claim they built)

  **Required template sections:**

  a. **What Was Requested** — contains `{TASK_SPEC}` placeholder

  b. **What the Implementer Claims** — contains `{IMPLEMENTER_REPORT}` placeholder

  c. **Critical: Do Not Trust the Report** — adapted from superpowers' spec-reviewer:
     - "The implementer's report may be incomplete, inaccurate, or optimistic."
     - DO NOT: take their word, trust completeness claims, accept their interpretation
     - DO: read actual code, compare to requirements line by line, check for missing pieces, look for extras
     - "Verify by reading code, not by trusting the report."

  d. **Review Checklist:**
     - Missing requirements: did they implement everything requested? Requirements skipped or missed?
     - Extra/unneeded work: did they build things not requested? Over-engineer?
     - Misunderstandings: did they interpret requirements differently? Solve the wrong problem?
     - Acceptance criteria: check each criterion from the task spec individually

  e. **Calibration** — following the pattern from plan-reviewer.md:
     - "Only flag issues that would cause real problems. An implementer missing a requirement or building the wrong thing is an issue. Minor stylistic preferences are not."
     - "Approve unless there are genuine spec compliance gaps."

  f. **Output Format:**
     ```
     ### Status

     ✅ Spec compliant — all requirements met, nothing extra, nothing missing.

     OR

     ❌ Issues found

     ### Issues (only if ❌)

     For each issue:
     - **What:** Description
     - **File:line:** Reference to actual code
     - **Spec requirement:** Which requirement is violated or missing
     - **Severity:** Missing requirement | Extra feature | Misunderstanding

     ### Summary

     One paragraph: compliant or not, number of issues, overall assessment.
     ```

  g. **Critical Rules:**
     - DO: read actual code, check each acceptance criterion, cite file:line, give clear verdict
     - DON'T: trust the report, say "looks good" without checking code, be vague, skip acceptance criteria

  **Constraints that would break the template:**
  - Placeholder names must match exactly: `{TASK_SPEC}`, `{IMPLEMENTER_REPORT}`
  - Output must use exactly `✅ Spec compliant` or `❌ Issues found` on the Status line — the orchestrator parses this to decide whether to retry
  - Do NOT include YAML frontmatter — this is a prompt template
  - The reviewer must be instructed to READ actual files (using read/grep/bash tools) — not just analyze the report text

- [ ] **Step 5: Verify the file was written** — Read back `~/.pi/agent/skills/execute-plan/spec-reviewer.md` and verify:
  - Both placeholders present exactly once
  - "Do Not Trust the Report" section is present
  - Output format specifies `✅ Spec compliant` / `❌ Issues found` status line
  - Calibration section is present
  - File:line reference requirement is stated

**Acceptance criteria:**
- File exists at `~/.pi/agent/skills/execute-plan/spec-reviewer.md`
- Contains exactly two placeholders: `{TASK_SPEC}`, `{IMPLEMENTER_REPORT}`
- Includes "Do Not Trust the Report" section with explicit DO/DON'T lists
- Includes calibration section (only flag real problems, approve unless genuine gaps)
- Output format has parseable status: `✅ Spec compliant` or `❌ Issues found`
- Requires file:line references for issues
- Includes review checklist (missing requirements, extras, misunderstandings, acceptance criteria)
- No YAML frontmatter
- Instructs the reviewer to read actual files, not just analyze the report

**Model recommendation:** standard

---

### Task 3: Modify `SKILL.md` — All five enhancements + single confirmation UX

**Files:**
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current SKILL.md** — Read `~/.pi/agent/skills/execute-plan/SKILL.md` in full to understand the baseline.

- [ ] **Step 2: Read all integration-point skills** — Read these files to understand what's being delegated to:
  - `~/.pi/agent/skills/using-git-worktrees/SKILL.md` (for Step 0)
  - `~/.pi/agent/skills/finishing-a-development-branch/SKILL.md` (for Step 13)
  - `~/.pi/agent/skills/requesting-code-review/SKILL.md` and `code-reviewer.md` (for Step 12, already integrated — verify no conflicts with new changes)

- [ ] **Step 3: Read the two new template files** — Read both files created by Tasks 1 and 2:
  - `~/.pi/agent/skills/execute-plan/implementer-prompt.md`
  - `~/.pi/agent/skills/execute-plan/spec-reviewer.md`
  These must be referenced correctly in the updated SKILL.md.

- [ ] **Step 4: Write the updated SKILL.md** — Rewrite `~/.pi/agent/skills/execute-plan/SKILL.md` incorporating ALL of the following changes. The file must be written as a complete replacement (not a patch), because the changes affect multiple interleaved sections.

  **YAML frontmatter** — keep identical to current:
  ```yaml
  ---
  name: execute-plan
  description: "Executes a structured plan file from .pi/plans/. Decomposes tasks into dependency-ordered waves and dispatches plan-executor subagents in parallel. Use when the user wants to execute an existing plan."
  ---
  ```
  Frontmatter must be the very first content in the file — no blank lines or comments before the opening `---`.

  **Step numbering:** The new file will have steps numbered 0–13 (Step 0 is new, former Steps 1–13 shift but some are modified). To minimize confusion, keep the original step numbers where possible and insert Step 0 before Step 1. The new numbering:

  | New Step | Content | Change type |
  |----------|---------|-------------|
  | Step 0 | Worktree pre-flight | **NEW** (Enhancement 1) |
  | Step 1 | Locate the plan file | Unchanged |
  | Step 2 | Validate the plan | Unchanged |
  | Step 3 | Confirm execution settings | **REPLACED** (single confirmation UX) |
  | Step 4 | Check for existing output files | Unchanged |
  | Step 5 | Build dependency graph | Unchanged |
  | Step 6 | Resolve model tiers | Unchanged |
  | Step 7 | Execute waves | **MODIFIED** (use implementer template + TDD) |
  | Step 8 | Handle worker status codes | Unchanged |
  | Step 9 | Verify wave output | **MODIFIED** (add spec compliance review) |
  | Step 10 | Handle failures and retries | Unchanged |
  | Step 11 | Report partial progress | Unchanged |
  | Step 12 | Request code review | Unchanged |
  | Step 13 | Complete | **REPLACED** (plan → done/ + finishing-a-development-branch) |

  **Detailed content for each changed step:**

  **Step 0: Worktree pre-flight (NEW — Enhancement 1)**

  Content to write:

  ```markdown
  ## Step 0: Worktree pre-flight

  Before starting execution, determine the workspace:

  **Auto-detect and skip:** Check if already on a feature branch or in a worktree:
  ```bash
  # Check if in a worktree
  git rev-parse --git-common-dir 2>/dev/null | grep -qv "^\.git$"
  # Check if on a feature branch (not main/master/develop)
  CURRENT_BRANCH=$(git branch --show-current)
  ```

  If already on a feature branch or in a worktree, use the existing workspace. This is reflected in the settings summary (Step 3) as "Workspace: Current workspace (on feature branch `<name>`)". **Do not ask.**

  If on main/master/develop and NOT in a worktree, the settings summary (Step 3) will include:
  - **Workspace: Worktree (recommended)** as the default

  If the user accepts the worktree default (or selects it during customization):
  1. Suggest a branch name derived from the plan filename. For example, plan `2026-04-06-execute-plan-enhancements.md` → branch `plan/execute-plan-enhancements`.
  2. Follow the `using-git-worktrees` skill to create the isolated workspace:
     - Directory selection (existing `.worktrees/` > project config > ask)
     - Safety verification (git check-ignore for project-local directories)
     - Project setup (auto-detect package.json, Cargo.toml, etc.)
     - Baseline test verification
  3. Continue all subsequent steps in the worktree.

  If the user selects "current workspace" during customization, proceed as today (no worktree).
  ```

  **Step 3: Confirm execution settings (REPLACED — single confirmation UX)**

  Replace the current three individual questions with a single settings confirmation. Content to write:

  ```markdown
  ## Step 3: Confirm execution settings

  Present a single settings confirmation showing recommended defaults:

  ```
  Execution settings:

    Workspace:        <auto-detected or "Worktree (recommended — creates feature branch)">
    Execution:        Parallel, auto-continue unless failures
    TDD:              Enabled
    Per-task review:  Enabled (spec compliance after each wave)
    Final review:     Enabled (code quality after all waves)

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

  **If `y`:** Accept all defaults, proceed to Step 4. One interaction.

  **If `customize`:** Ask each setting individually:
  1. Workspace — Worktree / Current workspace (only if not auto-detected)
  2. Execution mode — Sequential / Parallel
  3. Wave pacing (if parallel) — Pause between waves / Auto-continue / Auto-continue unless failures
  4. TDD injection — Enabled / Disabled
  5. Per-task spec review — Enabled / Disabled
  6. Final code review — Enabled / Disabled

  After customization, show the final settings summary for confirmation.

  If workspace was auto-detected (already on feature branch or in worktree), that line shows the detected state and is not a customizable option:
  ```
  Execution settings:

    Workspace:        Current workspace (on feature branch `plan/my-feature`)
    Execution:        Parallel, auto-continue unless failures
    ...
  ```

  After settings are confirmed, if Worktree was selected and Step 0 hasn't executed worktree setup yet, execute it now.
  ```

  **Step 7: Execute waves (MODIFIED — Enhancement 5 implementer template + Enhancement 3 TDD)**

  The current Step 7 instructs the orchestrator to construct self-contained worker prompts ad-hoc. Replace the prompt construction instructions with template-based assembly. Keep everything else in Step 7 (HEAD SHA recording, wave dispatch, sequential vs parallel mode) unchanged.

  Replace the paragraph starting "Each worker prompt must be **self-contained**" and everything after it in Step 7 with:

  ```markdown
  ### Assembling worker prompts

  Read [implementer-prompt.md](implementer-prompt.md) in this directory once (before the first wave). For each task, fill the placeholders:

  - `{TASK_SPEC}` — the full text of the task from the plan: task name, Files section, all checkbox steps, and acceptance criteria. Paste the complete text, do not summarize.
  - `{CONTEXT}` — where this task fits in the plan. Include:
    - The plan's Goal (one line)
    - Which wave this task is in and what other tasks are in the same wave
    - What was completed in prior waves (task names and key outputs, not full details)
    - Any dependencies this task has and what those tasks produced
  - `{WORKING_DIR}` — the absolute path to the working directory (the worktree path if using a worktree, otherwise the project root)
  - `{TDD_BLOCK}` — if TDD is enabled (Step 3 settings), fill with the condensed TDD block:

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
  ```

  **Step 9: Verify wave output (MODIFIED — Enhancement 4 spec compliance review)**

  Keep the existing Step 9 content (read output files, verify against acceptance criteria), then add spec compliance review. Append to Step 9:

  ```markdown
  ### Spec compliance review (if enabled in Step 3 settings)

  After verifying outputs yourself, dispatch an independent spec compliance reviewer for each completed task in the wave.

  1. **Read the template** — read [spec-reviewer.md](spec-reviewer.md) in this directory.

  2. **Fill placeholders** for each task:
     - `{TASK_SPEC}` — the full text of the task from the plan (same as what the implementer received)
     - `{IMPLEMENTER_REPORT}` — the implementer's full status report (from Step 8)

  3. **Select a standard-tier cross-provider model:**
     - Detect which provider the implementer used (from the model override in Step 6)
     - Pick the standard tier from the next provider in rotation: Anthropic → OpenAI → Google → Anthropic
     - Resolve using the tier table in Step 6 — do not hardcode model version strings
     - Fallback: if the alternate provider's model is unavailable, use the same provider's standard tier

  4. **Dispatch:**
     - If parallel execution mode → dispatch all spec reviews for the wave in parallel:
       ```
       subagent { tasks: [
         { agent: "plan-executor", task: "<filled spec-reviewer.md for task A>", model: "<standard cross-provider>" },
         { agent: "plan-executor", task: "<filled spec-reviewer.md for task B>", model: "<standard cross-provider>" },
         ...
       ]}
       ```
     - If sequential execution mode → dispatch each review sequentially

  5. **Handle results:**
     - **✅ Spec compliant** — task passes. Proceed.
     - **❌ Issues found** — treat as a task failure. Re-dispatch the implementer (Step 10 retry logic) with the reviewer's findings appended to the task prompt so the worker knows exactly what to fix. The retry counts toward the 3-retry limit in Step 10.
  ```

  **Step 13: Complete (REPLACED — Enhancement 2 branch completion)**

  Replace the current Step 13 entirely with:

  ```markdown
  ## Step 13: Complete

  ### 1. Move plan to done

  **Unconditional** — the plan was executed regardless of what happens to the branch:
  - Create `.pi/plans/done/` if it doesn't exist
  - Move the plan file to `.pi/plans/done/`

  ### 2. Report summary

  Report: number of tasks completed, any concerns noted, review status/notes (if review was performed), and total time taken.

  ### 3. Branch completion (if applicable)

  **Only when running in a worktree or on a feature branch** (i.e., not on main/master/develop):

  Invoke the `finishing-a-development-branch` skill, which:
  1. Verifies tests pass
  2. Determines base branch
  3. Presents 4 options: merge locally, create PR, keep as-is, discard
  4. Executes the chosen option
  5. Cleans up worktree if applicable

  Branch completion is offered even if review issues are pending — the user may want to keep the branch and fix later, or create a PR with known issues noted.

  **When on main/master (no branch):** Skip branch completion. Just report the summary from step 2.
  ```

  **All other steps (0, 1, 2, 4, 5, 6, 8, 10, 11, 12):** Copy unchanged from the current SKILL.md, preserving exact wording, formatting, code blocks, and tables. Step 12 in particular must remain exactly as-is (the code review dispatch is already correct).

- [ ] **Step 5: Verify the updated SKILL.md** — Read back `~/.pi/agent/skills/execute-plan/SKILL.md` and verify:
  - YAML frontmatter is present and identical to original (name, description)
  - Frontmatter is the very first content (no blank lines before `---`)
  - Step 0 exists with worktree auto-detection and `using-git-worktrees` delegation
  - Step 3 has the single confirmation UX table with all 5 settings
  - Step 7 references `implementer-prompt.md` and describes placeholder filling including `{TDD_BLOCK}`
  - Step 9 references `spec-reviewer.md` and describes cross-provider model selection and parallel/sequential dispatch
  - Step 13 has unconditional plan move, summary report, and conditional `finishing-a-development-branch` invocation
  - Steps 1, 2, 4, 5, 6, 8, 10, 11, 12 are unchanged from original
  - Step numbering is continuous 0–13 with no gaps or duplicates
  - All relative links (`[implementer-prompt.md](implementer-prompt.md)`, `[spec-reviewer.md](spec-reviewer.md)`) are correct

- [ ] **Step 6: Cross-check template references** — Verify that:
  - The placeholder names in Step 7 (`{TASK_SPEC}`, `{CONTEXT}`, `{WORKING_DIR}`, `{TDD_BLOCK}`) match exactly what's in `implementer-prompt.md`
  - The placeholder names in Step 9 (`{TASK_SPEC}`, `{IMPLEMENTER_REPORT}`) match exactly what's in `spec-reviewer.md`
  - The status outputs referenced in Step 9 (`✅ Spec compliant`, `❌ Issues found`) match what `spec-reviewer.md` specifies
  - The condensed TDD block text in Step 7 is identical to what's described in the implementer-prompt.md for the `{TDD_BLOCK}` placeholder

**Acceptance criteria:**
- YAML frontmatter is present and unchanged from original
- Step 0 exists: auto-detects branch/worktree, delegates to `using-git-worktrees`, suggests branch name from plan filename
- Step 3 replaced: shows single settings confirmation with 5 settings table, `y`/`customize` flow, auto-detected workspace line
- Step 7 modified: reads `implementer-prompt.md`, fills 4 placeholders, includes condensed TDD block text, references template by relative link
- Step 9 modified: reads `spec-reviewer.md`, fills 2 placeholders, uses standard-tier cross-provider model, dispatches parallel or sequential matching execution mode, `✅`/`❌` status parsing, failures feed into Step 10 retry logic
- Step 13 replaced: unconditional plan move to `done/`, summary report, conditional `finishing-a-development-branch` invocation (only on feature branch/worktree), offered even with pending review issues
- Steps 1, 2, 4, 5, 6, 8, 10, 11, 12 are unchanged
- Placeholder names are consistent between SKILL.md and the template files
- No step number gaps or duplicates (0–13 continuous)

**Model recommendation:** capable

---

## Dependencies

```
- Task 3 depends on: Task 1, Task 2
```

Task 1 and Task 2 are independent (no shared files or interfaces). Task 3 must read the template files created by Tasks 1 and 2 to reference them correctly and ensure placeholder names are consistent.

**Wave plan:**
- Wave 1: Task 1, Task 2 (parallel — create both templates)
- Wave 2: Task 3 (modify SKILL.md — references both templates)

---

## Risk Assessment

### Risk 1: SKILL.md rewrite introduces regressions in unchanged steps
**Likelihood:** Medium
**Impact:** High — broken orchestration logic
**Mitigation:** Task 3 Step 5 explicitly verifies each unchanged step is preserved. The acceptance criteria require Steps 1, 2, 4, 5, 6, 8, 10, 11, 12 to be unchanged. The capable-tier model should be able to do a faithful copy of unchanged sections.

### Risk 2: Placeholder name mismatch between templates and SKILL.md
**Likelihood:** Low (explicit cross-check step in Task 3)
**Impact:** High — workers receive unfilled `{PLACEHOLDER}` text
**Mitigation:** Task 3 Step 6 is an explicit cross-check of all placeholder names between the three files. Task dependency ensures templates are written first.

### Risk 3: Condensed TDD block is too short to be effective
**Likelihood:** Low
**Impact:** Medium — workers don't follow TDD discipline
**Mitigation:** The ~10-line condensed version captures the essential cycle (write failing test, verify failure, implement, verify pass, refactor). If workers struggle, the full TDD skill can be injected later as a follow-up enhancement. The spec explicitly chose condensed over full injection for context budget reasons.

### Risk 4: Spec reviewer cross-provider model resolution is too complex for the orchestrator
**Likelihood:** Low-Medium
**Impact:** Low — falls back to same provider, still works
**Mitigation:** The fallback is explicitly specified (same provider standard tier). The cross-provider rotation follows the same pattern already working in `generate-plan` Step 3.5 for the plan reviewer.

### Risk 5: Single confirmation UX may be confusing if users expect the old 3-question flow
**Likelihood:** Low
**Impact:** Low — the "customize" option preserves the old behavior
**Mitigation:** The `customize` path asks each question individually, similar to the old flow but expanded. The default path (`y`) is faster. Users who prefer granular control can always choose `customize`.

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| Enhancement 1: Git worktree integration (Step 0) | Task 3 — Step 0 content |
| Enhancement 2: Finishing-a-development-branch (Step 13) | Task 3 — Step 13 content |
| Enhancement 3: TDD injection into worker prompts | Task 1 (TDD_BLOCK placeholder) + Task 3 (Step 7 TDD block text + Step 3 TDD setting) |
| Enhancement 4: Per-task spec compliance review | Task 2 (spec-reviewer.md) + Task 3 (Step 9 dispatch + Step 3 setting) |
| Enhancement 5: Standardized implementer prompt template | Task 1 (implementer-prompt.md) + Task 3 (Step 7 template reference) |
| Single confirmation UX | Task 3 — Step 3 content |
| Deliverable: implementer-prompt.md | Task 1 |
| Deliverable: spec-reviewer.md | Task 2 |
| Deliverable: SKILL.md modifications | Task 3 |
| Worktree auto-detect and skip | Task 3 — Step 0 auto-detection logic |
| Branch completion even with pending issues | Task 3 — Step 13 explicitly states this |
| Plan moves to done unconditionally | Task 3 — Step 13 step 1 is unconditional |
| Spec reviewer standard-tier cross-provider | Task 3 — Step 9 model selection |
| Spec review parallelism matches execution mode | Task 3 — Step 9 dispatch section |
| TDD opt-out via settings | Task 3 — Step 3 settings table |
| Condensed TDD (~10 lines, not full skill) | Task 1 (TDD_BLOCK description) + Task 3 (Step 7 TDD block text) |
| Full escalation guidance (~15 lines) in implementer template | Task 1 — escalation section |

No gaps found.

### Placeholder scan

No instances of "TBD", "TODO", "implement later", or "similar to Task N" in the plan.

### Type/name consistency

- Placeholder names: `{TASK_SPEC}`, `{CONTEXT}`, `{WORKING_DIR}`, `{TDD_BLOCK}` — used consistently in Task 1 and Task 3
- Placeholder names: `{TASK_SPEC}`, `{IMPLEMENTER_REPORT}` — used consistently in Task 2 and Task 3
- Status codes: `DONE`, `DONE_WITH_CONCERNS`, `BLOCKED`, `NEEDS_CONTEXT` — consistent across Task 1 and existing plan-executor.md
- Spec reviewer status: `✅ Spec compliant`, `❌ Issues found` — consistent between Task 2 and Task 3
- Template file paths: `implementer-prompt.md`, `spec-reviewer.md` — consistent between Tasks 1/2 (creation) and Task 3 (references)
