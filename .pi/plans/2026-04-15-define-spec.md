# define-spec Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `define-spec` skill that interactively produces structured specs from todos or freeform descriptions, plus cross-suite updates to generate-plan and planner.

**Architecture:** One new skill (`agent/skills/define-spec/SKILL.md`) and targeted modifications to the existing generate-plan skill and planner agent. No new agents, subagents, or TypeScript code — define-spec runs inline in the host session.

**Tech Stack:** Markdown skill definitions (SKILL.md files)

**Source:** `TODO-ccbbedd6`

---

## File Structure

- `agent/skills/define-spec/SKILL.md` (Create) — The define-spec skill definition: input resolution, scout brief lookup, codebase exploration, interactive questioning, spec writing, and generate-plan handoff
- `agent/skills/generate-plan/SKILL.md` (Modify) — Step 1: provenance extraction + scout brief passthrough; Step 3: new placeholder fill instructions; Step 5: offer continuation to execute-plan
- `agent/skills/generate-plan/generate-plan-prompt.md` (Modify) — Add `{SOURCE_SPEC}` and `{SOURCE_BRIEF}` placeholders
- `agent/agents/planner.md` (Modify) — Update plan header to include Spec and Scout brief provenance fields

---

### Task 1: Create the define-spec skill

**Files:**
- Create: `agent/skills/define-spec/SKILL.md`

- [ ] **Step 1: Create the skill directory**

```bash
mkdir -p agent/skills/define-spec
```

- [ ] **Step 2: Write SKILL.md with frontmatter**

Create `agent/skills/define-spec/SKILL.md` with the following complete content:

```markdown
---
name: define-spec
description: "Interactive spec writing from a todo or freeform description. Explores the codebase, optionally consumes a scout brief, asks clarifying questions, and writes a structured spec to .pi/specs/ optimized for generate-plan. Use for complex or ambiguous work where the planner would otherwise guess at intent."
---

# Define Spec

Collaboratively produce a structured spec from a rough todo or freeform description. The spec captures intent, requirements, constraints, and acceptance criteria — not implementation details. The planner decides architecture and file structure based on deep codebase analysis.

## Step 1: Determine input source

The user will provide one of two input sources:

1. **Todo ID** (e.g., `TODO-ccbbedd6`) — use the `todo` tool to read the todo and extract its title and full body. Capture the ID for provenance tracking.
2. **Freeform description** — use the text as-is.

The resolved text becomes the seed for exploration and questions.

## Step 2: Check for scout brief

If the input is a todo, check whether `.pi/briefs/TODO-<id>-brief.md` exists.

- If it exists, read it — this provides the codebase context foundation for informed questions.
- If it does not exist, proceed without. define-spec handles both cases.

If the input is freeform (no todo ID), skip this step — scout briefs are keyed by todo ID.

## Step 3: Explore project context

**General survey** (always, regardless of scout):
- Project structure, key docs, recent commits
- Understand the lay of the land before asking questions

**Targeted exploration** (scope depends on scout):
- If scout brief exists: use it as the foundation for codebase understanding, read additional files only where the brief references something worth examining more closely
- If no scout brief: identify files and modules the input references, read key interfaces, understand relevant code structure

The goal is to ask codebase-informed questions — not naive questions about intent alone.

## Step 4: Ask clarifying questions

Open-ended exploration, one question at a time. Multiple choice preferred where possible. Ground questions in what you learned from the codebase and scout brief.

Read additional code during the conversation as new areas surface.

No fixed question count. Use judgment about when you have enough information to write a useful spec. The goal is to externalize the user's mental model on:

- **Intent** — what are we building and why?
- **Scope** — what's in and what's out?
- **Constraints** — what must the solution work with, avoid, or preserve?
- **Acceptance criteria** — how do we know it's done?
- **Anything the planner would otherwise have to guess**

Do NOT prescribe architecture, file structure, or implementation steps during this conversation. If the user makes design decisions (e.g., "use a separate agent for this"), capture them as requirements or constraints — not as architecture sections.

## Step 5: Write spec

Write the spec to `.pi/specs/<date>-<topic>.md` using this format:

~~~markdown
# <Title>

Source: TODO-<id>                    <- if input was a todo, omit otherwise
Scout brief: .pi/briefs/<name>      <- if scout was consumed, omit otherwise

## Goal

One-paragraph summary of what we're building and why.

## Context

What exists today that's relevant. Codebase reality — files, interfaces, patterns
that the implementation will interact with. Sourced from exploration and scout brief.

## Requirements

Concrete requirements derived from the conversation. Each should be verifiable.

- Requirement 1
- Requirement 2

## Constraints

Boundaries on the solution — things it must NOT do, compatibility requirements,
performance bounds, dependencies it must work with.

## Acceptance Criteria

How do we know it's done? Observable, testable outcomes.

- Criterion 1
- Criterion 2

## Non-Goals

What's explicitly out of scope. Prevents the planner from gold-plating.

## Open Questions (optional)

Anything surfaced during exploration that couldn't be resolved and the planner
should be aware of. These should be rare — most questions should be resolved
during the conversation.
~~~

Create the `.pi/specs/` directory if it does not exist.

Commit the spec to git using the `commit` skill.

## Step 6: Report and offer continuation

Report the spec path and offer to invoke generate-plan:

> Spec written to `.pi/specs/<date>-<topic>.md`. Want me to run generate-plan with this spec?

If yes, invoke generate-plan with the spec file path as input.

## Edge cases

- **Todo ID provided but todo not found:** Stop with: "Todo `TODO-<id>` not found."
- **Scout brief referenced but file missing:** Proceed without the brief. Do not fail.
- **`.pi/specs/` missing:** Create the directory before writing.
- **User wants to skip questions and go straight to writing:** Write the spec from available context. The spec may be thinner, but define-spec should not force interaction.
```

- [ ] **Step 3: Verify the skill is discoverable**

Run:
```bash
ls agent/skills/define-spec/SKILL.md
```
Expected: file exists at `agent/skills/define-spec/SKILL.md`

Verify the frontmatter parses correctly by checking the first 4 lines:
```bash
head -4 agent/skills/define-spec/SKILL.md
```
Expected:
```
---
name: define-spec
description: "Interactive spec writing from a todo or freeform description. Explores the codebase, optionally consumes a scout brief, asks clarifying questions, and writes a structured spec to .pi/specs/ optimized for generate-plan. Use for complex or ambiguous work where the planner would otherwise guess at intent."
---
```

- [ ] **Step 4: Commit**

```bash
git add agent/skills/define-spec/SKILL.md
git commit -m "feat: add define-spec skill for interactive spec writing"
```

**Acceptance criteria:**
- `agent/skills/define-spec/SKILL.md` exists with valid YAML frontmatter (`name: define-spec`, `description` present)
- Skill has 6 steps matching the spec: determine input, check scout brief, explore context, ask questions, write spec, report and offer continuation
- Spec output format includes all required sections: Goal, Context, Requirements, Constraints, Acceptance Criteria, Non-Goals, Open Questions (optional)
- Edge cases section handles: todo not found, scout brief missing, `.pi/specs/` missing, user skipping questions
- Todo input resolves both title and body from the todo file

**Model recommendation:** standard

---

### Task 2: Update generate-plan Step 5 to offer continuation

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md:137-144`

- [ ] **Step 1: Read the current Step 5**

Read `agent/skills/generate-plan/SKILL.md` lines 137-144 to confirm the current content:

```markdown
## Step 5: Report result

- Show the path to the generated plan file (e.g., `.pi/plans/2026-04-13-my-feature.md`)
- Report the review status:
  - **Clean:** "Plan reviewed — no issues found."
  - **Clean with notes:** "Plan reviewed — N warnings/suggestions appended as Review Notes."
  - **Proceeded with issues:** "Plan reviewed — N outstanding issues noted. Review: `<review-path>`"
- Suggest running it with the `execute-plan` skill.
```

- [ ] **Step 2: Replace the last line of Step 5**

Change the last line from:
```markdown
- Suggest running it with the `execute-plan` skill.
```

To:
```markdown
- Offer to continue:

  > Plan written to `.pi/plans/...`. Want me to run execute-plan with this plan?

  If yes, invoke execute-plan with the plan file path.
```

- [ ] **Step 3: Verify the edit**

Read the updated Step 5 and confirm it now offers continuation instead of just suggesting.

- [ ] **Step 4: Commit**

```bash
git add agent/skills/generate-plan/SKILL.md
git commit -m "feat(generate-plan): offer to invoke execute-plan after plan creation"
```

**Acceptance criteria:**
- generate-plan Step 5 asks the user whether to continue to execute-plan instead of just suggesting it
- The offer includes the plan file path
- If the user says yes, generate-plan invokes execute-plan with the plan path

**Model recommendation:** cheap

---

### Task 3: Add provenance extraction and scout brief passthrough to generate-plan Step 1

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md:8-16`

- [ ] **Step 1: Read the current Step 1**

Read `agent/skills/generate-plan/SKILL.md` lines 8-16 to confirm the current content:

```markdown
## Step 1: Determine the input source

The user will provide one of three input sources:

1. **Todo ID** (e.g., `TODO-7ef7d441`) — use the `todo` tool to read the todo and extract its full body. Do NOT pass just the ID; the subagent does not have the `todo` tool.
2. **File path** (e.g., a spec, RFC, or design doc) — use the `read` tool to load the file contents. Do NOT pass just the path; include the actual file contents in the prompt.
3. **Freeform description** — use the text as-is.

The resolved text becomes `{TASK_DESCRIPTION}`. If the input is a todo, also capture the ID for `{SOURCE_TODO}`.
```

- [ ] **Step 2: Add provenance extraction and scout brief passthrough**

After the line "The resolved text becomes `{TASK_DESCRIPTION}`..." add:

```markdown

**Provenance extraction (file-path inputs only):** When the input is a file, parse provenance references from the file preamble — the lines between the `# Title` and the first `## ` heading. Ignore any matching lines later in the document (including inside fenced code blocks or examples). Require exact prefix matches:

- `Source: TODO-<id>` — capture the todo ID for `{SOURCE_TODO}`. This allows provenance to flow through from define-spec: the spec references the original todo, and generate-plan passes it to the planner.
- `Scout brief: .pi/briefs/<filename>` — read the referenced brief file and append its contents to `{TASK_DESCRIPTION}` under a `## Codebase Brief` heading. Also capture the brief file path for `{SOURCE_BRIEF}`. If the referenced file does not exist, warn the user ("Scout brief referenced in spec not found at `<path>` — proceeding without it."), leave `{SOURCE_BRIEF}` as an empty string, and continue without appending brief content.

Set `{SOURCE_SPEC}` only when the input file path is under `.pi/specs/`. For other file inputs (RFCs, design docs at arbitrary paths), leave `{SOURCE_SPEC}` as an empty string.
```

- [ ] **Step 3: Verify the edit**

Read the updated Step 1 and confirm the provenance extraction paragraph is present and follows the input resolution paragraph.

- [ ] **Step 4: Commit**

```bash
git add agent/skills/generate-plan/SKILL.md
git commit -m "feat(generate-plan): extract provenance and pass scout brief from spec inputs"
```

**Acceptance criteria:**
- generate-plan Step 1 parses provenance only from the file preamble (before the first `## ` heading), ignoring matches in later content or code blocks
- generate-plan Step 1 extracts `Source: TODO-<id>` from spec file inputs and captures it for `{SOURCE_TODO}`
- generate-plan Step 1 extracts `Scout brief:` references, reads the brief, appends to `{TASK_DESCRIPTION}`, and captures the brief path for `{SOURCE_BRIEF}`
- `{SOURCE_SPEC}` is set only when the input path is under `.pi/specs/`; empty string otherwise
- If a referenced scout brief file does not exist, generate-plan warns the user and proceeds without appending brief content or setting `{SOURCE_BRIEF}`
- When no provenance references are found, behavior is unchanged

**Model recommendation:** cheap

---

### Task 4: Add provenance placeholders to generate-plan-prompt.md

**Files:**
- Modify: `agent/skills/generate-plan/generate-plan-prompt.md`

- [ ] **Step 1: Read the current template**

Read `agent/skills/generate-plan/generate-plan-prompt.md` to confirm the current content:

```markdown
# Plan Generation Task

Analyze the codebase at `{WORKING_DIR}` and produce a structured implementation plan.

## Task Description

{TASK_DESCRIPTION}

{SOURCE_TODO}

## Output

Write the plan to `{OUTPUT_PATH}`.

Create the directory if it doesn't exist.
```

- [ ] **Step 2: Add the new provenance placeholders**

Change the section after `{TASK_DESCRIPTION}` from:

```markdown
{SOURCE_TODO}
```

To:

```markdown
{SOURCE_TODO}

{SOURCE_SPEC}

{SOURCE_BRIEF}
```

- [ ] **Step 3: Update the placeholder list in generate-plan SKILL.md Step 3**

Read `agent/skills/generate-plan/SKILL.md` Step 3 and add the new placeholders to the fill list:

```markdown
   - `{SOURCE_SPEC}` — `Source spec: .pi/specs/<filename>` if the input was a spec file, empty string otherwise
   - `{SOURCE_BRIEF}` — `Scout brief: .pi/briefs/<filename>` if a scout brief was consumed, empty string otherwise
```

These go after the existing `{SOURCE_TODO}` placeholder entry.

- [ ] **Step 4: Verify the edits**

Read both files back and confirm the new placeholders are present in the template and in the Step 3 fill list.

- [ ] **Step 5: Commit**

```bash
git add agent/skills/generate-plan/generate-plan-prompt.md agent/skills/generate-plan/SKILL.md
git commit -m "feat(generate-plan): add source spec and scout brief provenance placeholders"
```

**Acceptance criteria:**
- `generate-plan-prompt.md` has `{SOURCE_TODO}`, `{SOURCE_SPEC}`, and `{SOURCE_BRIEF}` placeholders
- `generate-plan/SKILL.md` Step 3 lists all three provenance placeholders with fill instructions
- Empty strings are used when a provenance value is not applicable

**Model recommendation:** cheap

---

### Task 5: Update planner.md plan header to include full provenance

**Files:**
- Modify: `agent/agents/planner.md:55`

- [ ] **Step 1: Read the current Source field instruction**

Read `agent/agents/planner.md` line 55 to confirm the current content:

```markdown
**Source:** `TODO-<id>` — Only include this field when the plan originates from a todo. The todo ID will be provided in the task prompt as `Source todo: TODO-<id>`. If the input is a file path or freeform description (no source todo ID provided), omit this field entirely.
```

- [ ] **Step 2: Replace with full provenance fields**

Replace the single Source field instruction with:

```markdown
**Source:** `TODO-<id>` — Include when a `Source todo: TODO-<id>` line is provided in the task prompt. Omit otherwise.
**Spec:** `.pi/specs/<filename>` — Include when a `Source spec: .pi/specs/<filename>` line is provided in the task prompt. Omit otherwise.
**Scout brief:** `.pi/briefs/<filename>` — Include when a `Scout brief: .pi/briefs/<filename>` line is provided in the task prompt. Omit otherwise.
```

All three fields are optional. Include each only when the corresponding value appears in the task prompt.

- [ ] **Step 3: Verify the edit**

Read the updated planner.md and confirm all three provenance fields are documented.

- [ ] **Step 4: Commit**

```bash
git add agent/agents/planner.md
git commit -m "feat(planner): add spec and scout brief provenance fields to plan header"
```

**Acceptance criteria:**
- planner.md documents three optional provenance fields: Source (todo), Spec, Scout brief
- Each field is included only when the corresponding value is provided in the task prompt
- The plan header carries the full lineage from todo through spec and scout brief

**Model recommendation:** cheap

---

## Dependencies

- Task 1 is independent of all other tasks
- Tasks 2, 3, and 4 all modify `generate-plan/SKILL.md` (Steps 5, 1, and 3 respectively) — execute them sequentially to avoid conflicts: Task 2 → Task 3 → Task 4
- Task 5 is independent of all other tasks, but should logically follow Task 4 (the planner needs to know about placeholders that generate-plan fills)

```
Task 1 ─────────────────────────────────────── (independent)
Task 2 → Task 3 → Task 4 ─────────────────── (sequential, all touch generate-plan/SKILL.md)
Task 5 ─────────────────────────────────────── (independent, but logically after Task 4)
```

## Risk Assessment

**Low risk overall.** This plan creates one new file and makes small edits to four existing files.

- **Risk:** define-spec SKILL.md is large — the model might truncate or lose fidelity when writing it. **Mitigation:** Task 1 Step 2 contains the complete file content; verify by reading back after creation.
- **Risk:** Tasks 3 and 4 both modify `generate-plan/SKILL.md`. **Mitigation:** They modify different sections (Step 1 and Step 3) — execute sequentially to avoid conflicts.
- **Risk:** Planner might not emit the new provenance fields if it doesn't see the placeholder values. **Mitigation:** The instruction says "include only when provided" — absence is the correct default.
