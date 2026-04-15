# define-spec Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `define-spec` skill that interactively produces structured specs from todos or freeform descriptions, plus two cross-suite updates to generate-plan.

**Architecture:** One new skill (`agent/skills/define-spec/SKILL.md`) and two targeted modifications to the existing generate-plan skill. No new agents, subagents, or TypeScript code — define-spec runs inline in the host session.

**Tech Stack:** Markdown skill definitions (SKILL.md files)

**Source:** `TODO-ccbbedd6`

---

## File Structure

- `agent/skills/define-spec/SKILL.md` (Create) — The define-spec skill definition: input resolution, scout brief lookup, codebase exploration, interactive questioning, spec writing, and generate-plan handoff
- `agent/skills/generate-plan/SKILL.md` (Modify) — Two changes: Step 1 adds scout brief passthrough for spec file inputs; Step 5 changes from suggesting execute-plan to offering to invoke it

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

1. **Todo ID** (e.g., `TODO-ccbbedd6`) — use the `todo` tool to read the todo and extract its full body. Capture the ID for provenance tracking.
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

### Task 3: Add scout brief passthrough to generate-plan Step 1

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

- [ ] **Step 2: Add scout brief passthrough after the input resolution paragraph**

After the line "The resolved text becomes `{TASK_DESCRIPTION}`..." add:

```markdown

**Scout brief passthrough:** After resolving the input, check whether the input file (if it is a file) contains a `Scout brief:` reference line (e.g., `Scout brief: .pi/briefs/TODO-ccbbedd6-brief.md`). If it does, read the referenced brief file and append its contents to `{TASK_DESCRIPTION}` under a `## Codebase Brief` heading. This gives the planner scout reconnaissance context alongside the spec, so it can skip redundant exploratory reads.
```

- [ ] **Step 3: Verify the edit**

Read the updated Step 1 and confirm the scout brief passthrough is present and follows the input resolution paragraph.

- [ ] **Step 4: Commit**

```bash
git add agent/skills/generate-plan/SKILL.md
git commit -m "feat(generate-plan): pass scout brief to planner when spec references one"
```

**Acceptance criteria:**
- generate-plan Step 1 checks for a `Scout brief:` reference in file-path inputs
- When found, the brief contents are appended to `{TASK_DESCRIPTION}` under a `## Codebase Brief` heading
- When no reference is found, behavior is unchanged
- The planner receives both the spec and the brief in a single prompt

**Model recommendation:** cheap

---

## Dependencies

- Task 2 and Task 3 are independent of each other
- Task 2 and Task 3 are independent of Task 1
- All three tasks can be executed in parallel

## Risk Assessment

**Low risk overall.** This plan creates one new file and makes two small edits to an existing file.

- **Risk:** define-spec SKILL.md is large — the model might truncate or lose fidelity when writing it. **Mitigation:** Task 1 Step 2 contains the complete file content; verify by reading back after creation.
- **Risk:** generate-plan edits could conflict if applied to different versions of the file. **Mitigation:** Tasks 2 and 3 modify different sections (Step 5 and Step 1 respectively) — no overlap.
