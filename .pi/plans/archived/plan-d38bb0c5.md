# Implementation Plan

## Goal
Create an `execute-plan` skill at `~/.pi/agent/skills/execute-plan/SKILL.md` that reads structured plan files from `.pi/plans/`, decomposes tasks into dependency-ordered waves, dispatches `plan-executor` subagents in parallel, and handles status codes, retries, verification, and failure recovery.

## Context

### What already exists
- **`plan-executor` agent** at `~/.pi/agent/agents/plan-executor.md` — executes individual tasks, reports structured status codes (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, BLOCKED)
- **`plan-generator` agent** at `~/.pi/agent/agents/plan-generator.md` — generates plans (used by companion skill)
- **`generate-plan` skill** at `~/.pi/agent/skills/generate-plan/SKILL.md` — dispatches `plan-generator` to create plans
- **`commit` skill** at `~/.pi/agent/skills/commit/SKILL.md` — reference for skill format conventions

### What needs to be created
- A single file: `~/.pi/agent/skills/execute-plan/SKILL.md`

### Key insight
This is a **prompt-based skill**, not code. The SKILL.md file contains instructions that the main agent follows to orchestrate execution using the `subagent` tool. All logic (dependency resolution, wave grouping, model selection, retry handling) is expressed as instructions the agent interprets and executes.

## Tasks

### 1. **Create the skill directory and SKILL.md file**
   - File: `~/.pi/agent/skills/execute-plan/SKILL.md`
   - Changes: Create the file with all sections below
   - Acceptance: File exists, has valid frontmatter, skill name matches directory name

### 2. **Write frontmatter**
   - Content:
     ```yaml
     ---
     name: execute-plan
     description: "Executes a structured plan file from .pi/plans/. Decomposes tasks into dependency-ordered waves and dispatches plan-executor subagents in parallel. Use when the user wants to execute an existing plan."
     ---
     ```
   - Acceptance: `name` is lowercase with hyphens, matches directory name `execute-plan`. Description is specific and under 1024 chars.

### 3. **Write Step 1: Locate the plan file**
   - Instructions for the agent to:
     - If user provides a plan file path, use it directly
     - If user says "run the plan" or similar without a path, list `.pi/plans/` (excluding `done/` subdirectory) and let user pick
     - If only one plan exists, confirm with the user before proceeding
     - Read the plan file contents fully

### 4. **Write Step 2: Validate the plan**
   - Instructions to check the plan contains all required sections:
     1. Header (goal, architecture summary, tech stack)
     2. File structure (list of files with Create/Modify annotations)
     3. Numbered tasks with: `**Files:**`, checkbox steps, acceptance criteria, model recommendation
     4. Dependencies section
     5. Risk assessment
   - If anything is missing: **stop and tell the user** what's missing, suggest re-generating with `generate-plan` skill
   - Do NOT guess or fill in missing sections

### 5. **Write Step 3: Ask execution preferences**
   - Two questions before starting:
   
   **Question 1 — Execution mode:**
   - Sequential (one task at a time)
   - Parallel (dependency-ordered waves, up to 7 workers per wave)
   
   **Question 2 — Wave pacing (if parallel):**
   - (a) Pause between waves — user reviews before next wave
   - (b) Auto-continue, report failures at end — all waves run, failures collected
   - (c) Auto-continue unless failures — pause only when a wave has failures
   
   - Default: parallel with pacing (c) unless user specifies otherwise

### 6. **Write Step 4: Check for existing output files**
   - Before execution, scan the plan's task list for output file paths
   - If any output files already exist (from a prior run), ask the user:
     - Skip those tasks (and their dependents if outputs are valid)
     - Re-run them (overwrite existing files)

### 7. **Write Step 5: Build dependency graph and group into waves**
   - Instructions to:
     1. Parse all task numbers and their dependencies from the Dependencies section
     2. Build a dependency graph
     3. Group tasks into waves where all tasks in a wave have dependencies satisfied by prior waves
     4. Wave 1 = tasks with no dependencies; Wave 2 = tasks depending only on Wave 1 tasks; etc.
   - Include an example for clarity:
     ```
     Dependencies:
     - Task 3 depends on: Task 1, Task 2
     - Task 4 depends on: Task 1
     - Task 5 depends on: Task 3, Task 4
     
     Wave 1: [Task 1, Task 2] (no dependencies)
     Wave 2: [Task 3, Task 4] (depend on Wave 1)
     Wave 3: [Task 5] (depends on Wave 2)
     ```

### 8. **Write Step 6: Model selection**
   - Instructions for resolving abstract tiers to actual models:
   - **Never hardcode model names or versions in the skill.**
   - Auto-detect model family with priority: Claude → GPT → Gemini (use whichever family is available)
   - Resolve tiers to the **latest available version** of that family:
     - `capable` → latest flagship/opus-class model
     - `standard` → latest mid-tier/sonnet-class model
     - `cheap` → latest fast/haiku-class model
   - User can override the family if desired
   - Always pass explicit `model` override per task in the subagent dispatch
   - Fallback rubric when plan omits tier for a task:
     - Touches 1-2 files with complete spec → cheap
     - Touches multiple files with integration concerns → standard
     - Requires design judgment or broad codebase understanding → capable

### 9. **Write Step 7: Execute waves**
   - For each wave, dispatch all tasks in parallel via:
     ```
     subagent { tasks: [
       { agent: "plan-executor", task: "<self-contained prompt>", model: "<resolved>" },
       { agent: "plan-executor", task: "<self-contained prompt>", model: "<resolved>" },
       ...
     ]}
     ```
   - Max 7 parallel workers per wave (subagent parallel task limit)
   - Each worker's task prompt must be **self-contained**:
     - Exact source files to read (full paths)
     - Exact output file path(s)
     - Content spec / acceptance criteria from the plan
     - All checkbox steps to execute
     - Cross-linking and formatting conventions
   - For sequential mode: dispatch one task at a time via `subagent { agent: "plan-executor", task: "..." }`

### 10. **Write Step 8: Handle status codes**
   - After each wave completes, process each worker's response:
   
   - **DONE**: Proceed to verification (Step 9)
   - **DONE_WITH_CONCERNS**: Read the concerns. Correctness/scope concerns → address before verification. Observations → note and proceed.
   - **NEEDS_CONTEXT**: Provide the missing context and re-dispatch the task
   - **BLOCKED**: Assess the blocker:
     - Context problem → provide more context, re-dispatch
     - Reasoning problem → re-dispatch with a more capable model
     - Task too large → break into smaller pieces
     - Plan is wrong → escalate to the human
   - **Never ignore an escalation or force the same model to retry without changes**

### 11. **Write Step 9: Verification after each wave**
   - **Full content validation** — read each output file and verify it matches the plan spec
   - Not just existence/non-empty checks: actually review the content against acceptance criteria
   - If content doesn't match: treat as a failure (goes to retry logic)

### 12. **Write Step 10: Failure handling and retries**
   - If a worker produces empty, missing, or wrong output: **retry automatically up to 3 times**
   - If still failed after 3 retries: **notify the user at end of wave** and ask:
     - Retry again
     - Skip the failed task and continue to next wave
     - Stop the entire plan
   - Apply wave pacing behavior from Step 3:
     - (a) Always pause between waves
     - (b) Never pause, collect all failures for end
     - (c) Pause only when a wave has failures

### 13. **Write Step 11: Plan lifecycle on completion**
   - When all waves complete successfully:
     - Move the plan file to `.pi/plans/done/` (create directory if needed)
     - Report summary: tasks completed, any concerns noted, total time
   - When execution is stopped early:
     - Leave the plan in `.pi/plans/`
     - Report which tasks completed and which remain

## Files to Modify
- None (no existing files are modified)

## New Files
- `~/.pi/agent/skills/execute-plan/SKILL.md` — The complete skill file containing all orchestration instructions

## File Structure of SKILL.md

```markdown
---
name: execute-plan
description: "Executes a structured plan file from .pi/plans/. ..."
---

# Execute Plan

## Step 1: Locate the plan file
...

## Step 2: Validate the plan
...

## Step 3: Ask execution preferences
...

## Step 4: Check for existing output files
...

## Step 5: Build dependency graph and group into waves
...

## Step 6: Resolve model tiers
...

## Step 7: Execute waves
...

## Step 8: Handle worker status codes
...

## Step 9: Verify wave output
...

## Step 10: Handle failures and retries
...

## Step 11: Complete or report partial progress
...
```

## Dependencies
- Task 1 (create directory/file) must come first
- Task 2 (frontmatter) must be written before content
- Tasks 3-13 are the content sections, written sequentially into the same file
- All tasks are part of a single file write, so effectively this is one atomic task

## Implementation Notes

Since this is a single SKILL.md file, the actual implementation is one task: write the complete file. The tasks above decompose the **content** of that file into logical sections for clarity.

The worker should write the entire file in one pass, incorporating all sections.

## Risks

1. **Skill too long / context window pressure**: The SKILL.md will be lengthy. Mitigate by keeping instructions concise and using examples sparingly (only where ambiguity exists). The `generate-plan` skill is only ~60 lines and works well — this one will be longer due to more complex orchestration, but should stay under ~250 lines.

2. **Model name hardcoding**: The todo explicitly says never hardcode model names. The skill must instruct the agent to dynamically detect available models and resolve tiers. This is the trickiest part — the agent must use its knowledge of current model names at execution time rather than relying on static strings.

3. **Subagent parallel limit**: Max 7 parallel tasks per `subagent` call. If a wave has more than 7 tasks, the skill should instruct the agent to batch them into sub-waves of 7.

4. **Self-contained worker prompts**: Each `plan-executor` gets a fresh context with no memory. The skill must stress that every task prompt includes ALL needed information — file paths, content specs, acceptance criteria, conventions.

5. **Verification depth**: "Full content validation" is subjective. The skill should instruct the agent to read the output file and compare against the plan's acceptance criteria point-by-point, not just check file existence.

6. **Wave pacing modes**: Three different flow-control modes add complexity. The skill should present the default (c) as the recommended option and keep the instructions for each mode distinct and unambiguous.
