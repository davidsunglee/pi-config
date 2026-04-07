# Auto-Close Todos When Linked Plan Completes

## Goal

Add a one-way link from plans to their source todos so that when `execute-plan` completes a plan, it automatically closes the originating todo. The plan-generator adds a `**Source:** TODO-<id>` field to the plan header when the plan originates from a todo, and execute-plan reads this field in Step 13 to auto-close the todo and append a completion note.

## Architecture Summary

Three markdown instruction files form the pipeline:

1. **`generate-plan/SKILL.md`** — the orchestrator skill that reads a todo and dispatches the `plan-generator` subagent. It assembles the task prompt. Currently passes the todo body but not the todo ID. Needs to pass the ID so the plan-generator can embed it.

2. **`agents/plan-generator.md`** — the system prompt for the plan-generator subagent. Defines the plan output format including the header sections (Goal, Architecture summary, Tech stack). Needs a new optional `**Source:** TODO-<id>` field after Tech stack.

3. **`skills/execute-plan/SKILL.md`** — the orchestrator skill that executes plans. Step 13 moves the plan to `done/` and reports a summary. Needs to check for a `**Source:**` line, close the linked todo, and report it.

The orchestrating agent (which follows the execute-plan skill) has access to the `todo` tool, so it can directly update todo status and append to the body.

## Tech Stack

- Markdown skill/agent files (no code, no runtime dependencies)
- Pi `todo` tool (for reading/updating todos at execution time)
- Pi `subagent` dispatch (plan-generator is dispatched by generate-plan skill)

**Source:** TODO-5735f43b

## File Structure

- `~/.pi/agent/skills/generate-plan/SKILL.md` (Modify) — Add todo ID to the prompt assembly in Step 2 when input source is a todo
- `~/.pi/agent/agents/plan-generator.md` (Modify) — Add optional `**Source:** TODO-<id>` field to the plan header format, after Tech stack
- `~/.pi/agent/skills/execute-plan/SKILL.md` (Modify) — Add auto-close logic to Step 13, between moving the plan to `done/` and reporting the summary

---

## Tasks

### Task 1: Add source todo ID to plan-generator header format

**Files:**
- Modify: `~/.pi/agent/agents/plan-generator.md`

**Steps:**

- [ ] **Step 1: Read the current plan-generator.md** — Read `~/.pi/agent/agents/plan-generator.md` in full to understand the baseline content and locate the header section.

- [ ] **Step 2: Modify the Header section** — In the `#### 1. Header` section, add a new bullet after `**Tech stack**`:

  Change from:
  ```markdown
  #### 1. Header
  - **Goal**: One-paragraph summary
  - **Architecture summary**: How the pieces fit together
  - **Tech stack**: Languages, frameworks, key dependencies
  ```

  Change to:
  ```markdown
  #### 1. Header
  - **Goal**: One-paragraph summary
  - **Architecture summary**: How the pieces fit together
  - **Tech stack**: Languages, frameworks, key dependencies
  - **Source**: `TODO-<id>` — Only include this field when the plan originates from a todo. The todo ID will be provided in the task prompt as `Source todo: TODO-<id>`. If the input is a file path or freeform description (no source todo ID provided), omit this field entirely.
  ```

  **No other changes to the file.** The rest of the plan-generator.md remains identical.

- [ ] **Step 3: Verify the modification** — Read back `~/.pi/agent/agents/plan-generator.md` and verify:
  - The `#### 1. Header` section now has 4 bullet points (Goal, Architecture summary, Tech stack, Source)
  - The Source bullet clearly states it is conditional (only when originating from a todo)
  - The Source bullet specifies the format: `**Source:** TODO-<id>`
  - The Source bullet references the prompt format: `Source todo: TODO-<id>`
  - No other sections of the file were changed
  - The YAML frontmatter is preserved exactly (name, description, tools, model fields)

**Acceptance criteria:**
- The `#### 1. Header` section includes a `**Source**` bullet after `**Tech stack**`
- The Source field is documented as conditional (only when input is a todo)
- The format `**Source:** TODO-<id>` is specified
- The instruction references the prompt signal `Source todo: TODO-<id>`
- No other parts of plan-generator.md are changed
- YAML frontmatter is preserved exactly as before

**Model recommendation:** cheap

---

### Task 2: Pass todo ID in generate-plan prompt assembly

**Files:**
- Modify: `~/.pi/agent/skills/generate-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current generate-plan SKILL.md** — Read `~/.pi/agent/skills/generate-plan/SKILL.md` in full to understand the baseline.

- [ ] **Step 2: Modify Step 2 (prompt assembly)** — Update the prompt assembly instructions and example to include the todo ID when the input source is a todo.

  In the `## Step 2: Assemble the task prompt for the subagent` section, update the bullet list to include:
  ```markdown
  - If the input source is a todo: include `Source todo: TODO-<id>` on its own line after the task description. This tells the plan-generator to add a `**Source:** TODO-<id>` field to the plan header.
  ```

  Update the example prompt structure to show the todo case:
  ```markdown
  Example prompt structure (when source is a todo):
  ```
  Analyze the codebase at <cwd> and produce a structured implementation plan.

  Task (from TODO-<id>):
  <full todo body>

  Source todo: TODO-<id>

  Write the plan to .pi/plans/<yyyy-MM-dd-short-description>.md.
  ```

  Example prompt structure (when source is a file or freeform):
  ```
  Analyze the codebase at <cwd> and produce a structured implementation plan.

  Task:
  <full task description / file contents / freeform text>

  Write the plan to .pi/plans/<yyyy-MM-dd-short-description>.md.
  ```
  ```

  **No other changes to the file.** Steps 1, 3, 3.5, 4, and Edge cases remain identical.

- [ ] **Step 3: Verify the modification** — Read back `~/.pi/agent/skills/generate-plan/SKILL.md` and verify:
  - Step 2 includes the `Source todo: TODO-<id>` instruction
  - The example prompt for the todo case includes `Source todo: TODO-<id>` on its own line
  - The example prompt for non-todo cases does NOT include the source line
  - The YAML frontmatter is preserved exactly
  - Steps 1, 3, 3.5, 4, and Edge cases are unchanged

**Acceptance criteria:**
- Step 2 instructs the orchestrator to include `Source todo: TODO-<id>` in the prompt when source is a todo
- Two example prompts shown: one for todo source (with `Source todo:` line), one for file/freeform (without)
- No other parts of the SKILL.md are changed
- YAML frontmatter is preserved exactly

**Model recommendation:** cheap

---

### Task 3: Add auto-close logic to execute-plan Step 13

**Files:**
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current execute-plan SKILL.md** — Read `~/.pi/agent/skills/execute-plan/SKILL.md` in full to understand the current Step 13 structure.

- [ ] **Step 2: Modify Step 13** — Insert a new subsection `### 2. Close linked todo` between the existing `### 1. Move plan to done` and `### 2. Report summary` (which becomes `### 3. Report summary`). The existing `### 3. Branch completion` becomes `### 4. Branch completion`.

  The new Step 13 structure becomes:

  ```markdown
  ## Step 13: Complete

  ### 1. Move plan to done

  **Unconditional** — the plan was executed regardless of what happens to the branch:
  - Create `.pi/plans/done/` if it doesn't exist
  - Move the plan file to `.pi/plans/done/`

  ### 2. Close linked todo

  Scan the plan file for a line matching `**Source:** TODO-<id>`. This line appears after the Tech stack section, near the top of the plan. If found:

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
  ```

  **Important constraints:**
  - The `**Source:**` line uses bold markdown formatting: two asterisks around "Source", then a colon, space, and the todo ID. Match this exactly: `**Source:** TODO-` followed by a hex string.
  - The `**Source:**` line appears after the Tech stack section, near the top of the plan. Scan the full plan content for it — do not restrict the search to content before the first `## ` heading.
  - The subsection numbers in Step 13 must be renumbered: 1 (Move plan), 2 (Close linked todo), 3 (Report summary), 4 (Branch completion).
  - The "Branch completion" subsection now references "step 3" instead of "step 2" for the summary fallback.
  - **No other steps in the file should be changed.** Steps 0–12 remain identical.

- [ ] **Step 3: Verify the modification** — Read back `~/.pi/agent/skills/execute-plan/SKILL.md` and verify:
  - Step 13 now has 4 subsections: "1. Move plan to done", "2. Close linked todo", "3. Report summary", "4. Branch completion"
  - Subsection 2 describes scanning the plan for a `**Source:** TODO-<id>` line
  - Subsection 2 specifies using the `todo` tool to update status to "done" and append completion note
  - Subsection 2 specifies silent skip conditions (no source line, already done, doesn't exist)
  - Subsection 3 includes reporting the closed todo in the summary
  - Subsection 4 references "step 3" (not "step 2") for the summary fallback
  - Steps 0–12 are completely unchanged
  - YAML frontmatter is preserved exactly

**Acceptance criteria:**
- Step 13 has a new `### 2. Close linked todo` subsection
- The subsection scans the plan for a `**Source:** TODO-<id>` line
- Uses the `todo` tool to set status to "done" and append `Completed via plan: .pi/plans/done/<plan-filename>.md`
- Silently skips when: no Source line, todo already done, todo doesn't exist
- The report summary includes the closed todo ID
- Subsection numbering is correct (1, 2, 3, 4)
- The "Branch completion" fallback references "step 3"
- No other steps (0–12) are changed
- YAML frontmatter is preserved exactly

**Model recommendation:** cheap

---

## Dependencies

```
- Task 1 depends on: (none)
- Task 2 depends on: (none)
- Task 3 depends on: (none)
```

All three tasks are independent — they modify different files and share only the agreed-upon format (`**Source:** TODO-<id>`), which is fully specified in each task's steps. They can all execute in parallel as Wave 1.

**Wave plan:**
- Wave 1: Task 1, Task 2, Task 3 (parallel)

---

## Risk Assessment

### Risk 1: Format mismatch between producer and consumer
**Likelihood:** Low
**Impact:** High — execute-plan wouldn't find the Source line
**Mitigation:** All three tasks specify the exact same format: `**Source:** TODO-<id>`. Task 1 tells the plan-generator to write it. Task 2 tells generate-plan to signal it. Task 3 tells execute-plan to parse it. The plan spells out the exact string in each task.

### Risk 2: plan-generator ignores the Source todo instruction
**Likelihood:** Low-Medium — LLMs sometimes skip optional instructions
**Impact:** Medium — the link just won't be added, so auto-close won't fire (graceful degradation)
**Mitigation:** The instruction is explicit in the header section with a clear conditional ("only when..."). The generate-plan prompt includes `Source todo: TODO-<id>` on its own line, making it hard to miss. Even if it fails, execute-plan silently skips when no Source line is found.

### Risk 3: Todo tool not available to the orchestrating agent
**Likelihood:** Very low — the main agent has the todo tool
**Impact:** High — Step 13 would error when trying to close the todo
**Mitigation:** The execute-plan skill is followed by the main orchestrating agent, which has access to the todo tool (it's a core pi tool, not a subagent tool). The instruction explicitly says to use the `todo` tool, matching how todos are managed elsewhere.

### Risk 4: Subsection renumbering in Step 13 causes confusion
**Likelihood:** Low
**Impact:** Low — only affects human readability, not execution
**Mitigation:** Task 3 explicitly specifies the new numbering (1-4) and updates the internal reference from "step 2" to "step 3" for the branch completion fallback.

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| plan-generator: add `**Source:** TODO-<id>` after Tech stack when source is a todo | Task 1 |
| execute-plan Step 13: check for `**Source:** TODO-<id>` line | Task 3 |
| execute-plan Step 13: set todo status to "done" | Task 3 |
| execute-plan Step 13: append `Completed via plan: .pi/plans/done/<plan-filename>.md` to todo body | Task 3 |
| execute-plan Step 13: report closed todo in completion summary | Task 3 |
| Skip silently: no Source line | Task 3 |
| Skip silently: todo already closed | Task 3 |
| Skip silently: todo ID doesn't exist | Task 3 |
| File: `~/.pi/agent/agents/plan-generator.md` | Task 1 |
| File: `~/.pi/agent/skills/execute-plan/SKILL.md` | Task 3 |

**Gap identified:** The spec lists only 2 files, but `~/.pi/agent/skills/generate-plan/SKILL.md` also needs modification — the generate-plan skill assembles the prompt for the plan-generator subagent, and currently does not pass the todo ID. Without Task 2, the plan-generator would never receive the todo ID and could not embed it. Task 2 addresses this gap.

### Placeholder scan

No instances of "TBD", "TODO" (as placeholder), "implement later", or "similar to Task N".

### Type/name consistency

- Format string `**Source:** TODO-<id>` — used identically in Tasks 1, 2, and 3
- Prompt signal `Source todo: TODO-<id>` — used identically in Tasks 1 and 2
- Todo tool operations (status "done", append body) — consistent with pi todo tool API
- Plan filename in append text: `.pi/plans/done/<plan-filename>.md` — consistent with Step 13's existing move-to-done logic
