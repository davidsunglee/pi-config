# Implementation Plan

## Goal

Create a `generate-plan` skill at `~/.pi/agent/skills/generate-plan/SKILL.md` that instructs the main agent how to dispatch the existing `plan-generator` subagent to analyze a codebase and produce a structured plan file in `.pi/plans/`.

## Context

- The `plan-generator` agent already exists at `~/.pi/agent/agents/plan-generator.md` — it handles deep codebase analysis and writes plan files. The skill does NOT define plan format; the agent's system prompt does.
- The `plan-executor` agent already exists at `~/.pi/agent/agents/plan-executor.md`.
- The companion `execute-plan` skill (TODO-d38bb0c5) is a separate future task.
- The only existing skill is `commit` at `~/.pi/agent/skills/commit/SKILL.md`, which serves as the structural reference.

## Tasks

### 1. Create the skill directory and `SKILL.md`

**Files:**
- Create: `~/.pi/agent/skills/generate-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Create the directory** `~/.pi/agent/skills/generate-plan/`
- [ ] **Step 2: Write `SKILL.md`** with the content specified below

**SKILL.md content requirements:**

#### Frontmatter
```yaml
---
name: generate-plan
description: "Generates a structured implementation plan from a todo, spec file, or freeform description. Dispatches the plan-generator subagent for deep codebase analysis. Use when the user wants to plan work before executing it."
---
```

#### Body — Instructions for the main agent

The skill body should instruct the main agent to:

1. **Accept input** — one of three sources:
   - A todo ID (e.g., `TODO-7ef7d441`) → read the todo body via the `todo` tool
   - A file path to a spec, RFC, or design doc → read the file contents
   - A freeform task description → use as-is

2. **Prepare the task prompt** for the subagent, which must include:
   - The full todo body, file contents, or freeform description
   - The current working directory / repo name for context
   - Instruction to write the plan to `.pi/plans/yyyy-MM-dd-<short-description>.md`

3. **Dispatch the `plan-generator` subagent** via the `subagent` tool:
   ```
   subagent { agent: "plan-generator", task: "<assembled prompt>" }
   ```
   - Mention that async dispatch is available: `subagent { agent: "plan-generator", task: "...", async: true }` — useful for long-running analysis while the user continues other work.

4. **Report the result** to the user:
   - Show the path to the generated plan file
   - Suggest using the `execute-plan` skill to run it (e.g., `/skill:execute-plan`)
   - If run async, tell the user they can check status with `subagent_status`

5. **Edge cases:**
   - If the user provides a todo ID, read the todo first and include its full body in the prompt (don't just pass the ID — the subagent may not have the `todo` tool)
   - If the user provides a file path, read the file first and include its contents
   - If `.pi/plans/` doesn't exist, the subagent will create it (no action needed from the main agent)

**Acceptance criteria:**
- File exists at `~/.pi/agent/skills/generate-plan/SKILL.md`
- Frontmatter has valid `name` (`generate-plan`) matching directory name and a descriptive `description`
- Body covers all three input sources (todo ID, file path, freeform)
- Body shows the `subagent` dispatch call with `agent: "plan-generator"`
- Body mentions async option
- Body instructs reporting the output path and suggesting `execute-plan`
- Body instructs pre-reading todos/files before passing to the subagent

**Model recommendation:** cheap — single file creation with complete spec provided above.

## Files to Modify

None.

## New Files

- `~/.pi/agent/skills/generate-plan/SKILL.md` — Skill instructions for the main agent on how to dispatch the `plan-generator` subagent to produce structured plans.

## Dependencies

Only one task — no dependencies.

## Risks

1. **Subagent tool availability** — The skill assumes the `subagent` tool is available to the main agent. This is standard in pi but worth noting. No mitigation needed.
2. **Todo tool availability in subagent** — The `plan-generator` agent definition lists tools as `read, grep, find, ls, bash` — it does NOT have the `todo` tool. The skill must instruct the main agent to read the todo body itself and pass it as text to the subagent. This is already accounted for in the plan above.
3. **Naming collision** — If a skill named `generate-plan` already exists elsewhere (project `.pi/skills/`, packages, etc.), pi will warn about name collision and keep the first found. Low risk since this is a new custom skill.
