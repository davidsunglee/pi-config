# define-spec Skill

Source: TODO-ccbbedd6

## Goal

Create a `define-spec` skill that takes a rough todo or freeform description and produces a structured spec document through collaborative exploration with the user. The skill reads the codebase (and optionally a scout brief) to ask informed questions, then writes a spec to `.pi/specs/` optimized for generate-plan consumption. This completes a pipeline: **define-spec -> generate-plan -> execute-plan**, with optional scout reconnaissance upstream.

## Context

Today, generate-plan accepts three input types: a todo body, a file path, or freeform text. The quality of the plan depends heavily on the quality of the input. A vague todo produces a vague plan because the planner must guess at intent, scope, constraints, and acceptance criteria.

The superpowers brainstorming skill fills a similar role but is not integrated with the pi pipeline — it writes specs to a superpowers-specific path and transitions to writing-plans instead of generate-plan. It also produces heavier specs that prescribe architecture and file structure, which duplicates work our planner is designed to do.

define-spec fills the gap: an interactive spec-writing skill that is natively integrated with todos, scout (optional), and generate-plan. It captures *what* and *why* (intent, requirements, constraints, acceptance criteria); the planner decides *how* (architecture, file structure, task decomposition) based on deep codebase analysis.

### Pipeline position

```
todo -> [scout] -> [define-spec] -> generate-plan -> execute-plan
          |               |
          +---optional-----+
```

All stages between todo and generate-plan are optional. Lighter workflows skip straight from a refined todo to generate-plan. define-spec earns its place on complex or ambiguous work where the planner would otherwise have to guess at intent.

### Relationship to superpowers brainstorming

define-spec uses the same interaction model as brainstorming — open-ended exploration, one question at a time, multiple choice preferred, codebase-informed questions. The differences are all integration:

| | Brainstorming | define-spec |
|---|---|---|
| Input | Freeform idea | Todo ID or freeform description |
| Codebase input | General project survey | General survey + scout brief (if available) + targeted exploration |
| Output location | `docs/superpowers/specs/` | `.pi/specs/` |
| Output weight | Heavy — prescribes architecture, files, step-by-step | Light — requirements, constraints, acceptance criteria |
| Next stage | writing-plans (superpowers) | generate-plan (pi) |
| Where design thinking lives | Mostly in the spec | Split: intent in spec, implementation design in planner |

### Relationship to scout

The scout (TODO-bbe89373) performs task-scoped codebase reconnaissance and produces a structured brief at `.pi/briefs/TODO-<id>-brief.md`. When available, define-spec reads the brief as its foundation for codebase understanding, avoiding redundant exploration. When scout hasn't run, define-spec does its own lighter targeted exploration — enough to ask informed questions, not a full reconnaissance.

define-spec does NOT absorb scout's role. The scout produces a comprehensive, structured codebase brief (relevant files, interfaces, dependency graphs, patterns, risk areas) that also flows independently to the planner via generate-plan. define-spec does a general project survey plus targeted reads; the scout does deep task-scoped reconnaissance. They complement each other.

Note: the define-spec design implies the scout's model should be sonnet rather than haiku, since both define-spec and the planner consume the brief as trusted input and the brief includes judgment-heavy content (patterns, conventions, risk areas). See the note appended to the scout todo's design question 2.

## Requirements

- Accepts a todo ID or freeform text description as input
- Runs inline in the host session (not dispatched as a subagent) because it asks the user interactive questions
- Performs a general project survey (structure, docs, recent commits) before asking questions — same as brainstorming step 1
- Checks for a scout brief at `.pi/briefs/TODO-<id>-brief.md` and reads it if present
- When no scout brief exists, performs targeted codebase exploration scoped to what the input references
- Reads additional code during the conversation as new areas surface
- Asks open-ended clarifying questions, one at a time, multiple choice preferred where possible
- Uses judgment about when it has enough information to write a useful spec — no fixed question count
- Writes the spec to `.pi/specs/<date>-<topic>.md`
- Commits the spec to git
- References the source todo ID in the spec if the input was a todo
- References the scout brief path in the spec if one was consumed, so generate-plan can pass it to the planner
- After writing the spec, offers to invoke generate-plan with the spec file path as input
- Does NOT prescribe architecture, file structure, or implementation steps — those are the planner's responsibility

## Constraints

- The spec output must be consumable by generate-plan as a file path input (generate-plan's existing input type 2)
- The spec format must provide the planner with enough information to produce a plan without guessing at intent, scope, or acceptance criteria
- Design decisions that emerge during the conversation (e.g., "use a separate agent for this") are captured as requirements or constraints in the spec, not as architecture sections
- The skill must work gracefully whether or not a scout brief exists — scout is always optional

## Acceptance Criteria

- Invoking define-spec with a todo ID reads the todo body, explores the codebase, asks the user clarifying questions, and produces a spec file at `.pi/specs/`
- Invoking define-spec with a freeform description (no todo) follows the same flow
- When a scout brief exists at `.pi/briefs/TODO-<id>-brief.md`, define-spec reads it and uses it to inform questions and context
- When no scout brief exists, define-spec performs its own targeted codebase exploration and still produces a well-grounded spec
- The spec contains: Goal, Context, Requirements, Constraints, Acceptance Criteria, Non-Goals, and optionally Open Questions
- The spec references the source todo and scout brief (when applicable) so downstream stages can trace provenance
- After writing the spec, define-spec offers to invoke generate-plan
- generate-plan successfully consumes the spec file as input and produces a plan from it

## Non-Goals

- Prescribing implementation architecture or file structure (planner's job)
- Replacing brainstorming for superpowers workflows (separate tool, separate pipeline)
- Requiring scout to have run first (define-spec works standalone)
- Auto-invoking generate-plan without user confirmation
- Producing a plan (that's generate-plan's job)

---

## Skill Step Design

### Step 1: Determine input source

Two input types:
1. **Todo ID** — read the todo body via the `todo` tool
2. **Freeform description** — use the text as-is

The resolved text becomes the seed for exploration and questions. If the input is a todo, capture the ID for provenance tracking.

### Step 2: Check for scout brief

If the input is a todo, check whether `.pi/briefs/TODO-<id>-brief.md` exists. If it does, read it — this provides the codebase context foundation. If not, proceed without.

If the input is freeform (no todo ID), skip this step — scout briefs are keyed by todo ID.

### Step 3: Explore project context

**General survey** (always, regardless of scout):
- Project structure, docs, recent commits
- Understand the lay of the land

**Targeted exploration** (scope depends on scout):
- If scout brief exists: use it as the foundation for codebase understanding, read additional files only if needed
- If no scout brief: identify files/modules the input references, read key interfaces, understand relevant code structure

### Step 4: Ask clarifying questions

Open-ended exploration, one question at a time. Multiple choice preferred where possible. Grounded in what the skill learned from the codebase and scout brief.

Read additional code during the conversation as new areas surface.

No fixed question count. Use judgment about when there is enough information to write a useful spec. The goal is to externalize the user's mental model on: intent, scope, constraints, acceptance criteria, and anything the planner would otherwise have to guess.

### Step 5: Write spec

Write the spec to `.pi/specs/<date>-<topic>.md` using the format defined in the Spec Output Format section below. Commit to git using the `commit` skill.

### Step 6: Report and offer continuation

Report the spec path and offer to invoke generate-plan:

> Spec written to `.pi/specs/<date>-<topic>.md`. Want me to run generate-plan with this spec?

If yes, invoke generate-plan with the spec file path as input.

---

## Spec Output Format

```markdown
# <Title>

Source: TODO-<id>                    <- if input was a todo, omit otherwise
Scout brief: .pi/briefs/<name>      <- if scout was consumed, omit otherwise

## Goal

One-paragraph summary of what we're building and why.

## Context

What exists today that's relevant. Codebase reality -- files, interfaces, patterns
that the implementation will interact with. Sourced from exploration and scout brief.

## Requirements

Concrete requirements derived from the conversation. Each should be verifiable.

- Requirement 1
- Requirement 2
- ...

## Constraints

Boundaries on the solution -- things it must NOT do, compatibility requirements,
performance bounds, dependencies it must work with.

## Acceptance Criteria

How do we know it's done? Observable, testable outcomes.

- Criterion 1
- Criterion 2
- ...

## Non-Goals

What's explicitly out of scope. Prevents the planner from gold-plating.

## Open Questions (optional)

Anything surfaced during exploration that couldn't be resolved and the planner
should be aware of. These should be rare -- most questions should be resolved
during the conversation.
```

Design principles for this format:
- **What and why, not how.** No file lists, no task decomposition, no architecture decisions. Those are the planner's job.
- **Verifiable requirements.** Each requirement should be something the planner can translate into acceptance criteria on tasks.
- **Explicit non-goals.** Prevents scope creep during planning and execution.
- **Provenance links.** Source todo and scout brief references let downstream stages trace where the spec came from and what codebase context is available.

---

## Cross-Suite Updates

### generate-plan Step 5: offer continuation to execute-plan

Current behavior: "Suggest: 'Run with the `execute-plan` skill.'"

New behavior: ask the user whether to continue:

> Plan written to `.pi/plans/...`. Want me to run execute-plan with this plan?

If yes, invoke execute-plan with the plan path. This makes stage transitions consistent across the pipeline — each stage writes its artifact, then offers to continue.

### generate-plan Step 1: scout brief passthrough

When generate-plan receives a spec file as input that contains a `Scout brief:` reference, it should include the brief contents in the planner's `{TASK_DESCRIPTION}` alongside the spec. This way the planner gets both the spec (what to build) and the scout brief (codebase context) without re-doing reconnaissance.

Addition to generate-plan Step 1 input resolution: if the input is a file and it references a scout brief path, read both files and include both in the prompt.

---

## File Inventory

| File | Action | Purpose |
|------|--------|---------|
| `agent/skills/define-spec/SKILL.md` | Create | Skill definition — steps 1-6 |
| `.pi/specs/` | Create directory | Spec output location |
| `agent/skills/generate-plan/SKILL.md` | Modify | Step 5: offer continuation; Step 1: scout brief passthrough |
| `.pi/todos/bbe89373.md` | Modify | Brief naming convention + model note (already done) |
