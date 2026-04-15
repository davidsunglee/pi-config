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
