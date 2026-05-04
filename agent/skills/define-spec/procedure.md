# Spec Design Procedure

This is the canonical spec-design procedure. It is delivered to the `spec-designer` subagent inline via `systemPrompt:` at dispatch time, OR read directly by the `define-spec` orchestrator and followed in its own session on the inline branch. The same body runs both branches — there is no per-branch divergence.

This file is **not** a discoverable skill. It has no `name:`/`description:` frontmatter and is not loaded by any `Skill` tool surface. It is consumed only by being read from disk.

## Interaction conventions

These conventions govern the interactive spec-content steps in this procedure (Steps 3, 4, 5, and 6):

- **Recommend with every spec-content question.** Before asking about scope decomposition, intent, architecture need, or architecture approach, name the specific answer or direction you recommend and give a one-sentence rationale grounded in the codebase survey and user input. Procedural orchestrator choices such as committing the spec or running `generate-plan` are outside this procedure and do not require recommendations.
- **One question per turn.** Never bundle multiple questions into a single turn. A multi-option prompt such as a `(y/n)` question or `(a)/(b)/(c)` menu counts as one question.

## Step 1: Resolve input shape

The orchestrator passes the user's raw input as your task body. Detect the shape by pattern; do not ask the user which kind it is.

| Shape | Pattern | Behavior |
| --- | --- | --- |
| **Todo ID** | matches `^TODO-([0-9a-f]{8})$` exactly | Extract the captured 8-char hex as the **raw todo id** (`<raw-id>`) — the part *without* the `TODO-` prefix. Todo files are stored on disk by raw hex filename: read `docs/todos/<raw-id>.md` to get the title and full body (e.g. input `TODO-075cf515` → read `docs/todos/075cf515.md`). Do **not** read `docs/todos/TODO-<raw-id>.md` — that path does not exist. (When dispatched as the `spec-designer` subagent, the agent's tool surface intentionally omits `todo` — direct file read is the expected path. On the orchestrator's inline branch the `todo` tool may be available; either way, reading the file directly is correct.) Set provenance to `Source: TODO-<raw-id>` (the prefix is re-added in the provenance line). Check whether `docs/briefs/TODO-<raw-id>-brief.md` exists; if it does, read it as scout context and set the `Scout brief:` provenance line. If it does not exist, proceed without — do not fail. |
| **Existing-spec path** | string ends in `.md` and is **either** (a) a relative path that begins with `docs/specs/`, **or** (b) an absolute path that contains the segment `/docs/specs/` (e.g. `/Users/.../<repo>/docs/specs/foo.md` — this is the form the orchestrator's `SPEC_WRITTEN: <absolute path>` emits and the review prompt's Refine option replays back in), **and** the file exists on disk | Read the existing draft. Treat it as starting context. Preserve its preamble lines (`Source:`, `Scout brief:`) verbatim on rewrite. Q&A focuses on filling gaps and refining unclear sections. **Overwrite the same path** at the end (use the input path as-is — do not normalize between relative and absolute). The spec self-review pass (Step 7) is mandatory. |
| **Freeform text** | anything else | Use the text as a seed. Do not look up a scout brief. Do not emit a `Source:` or `Scout brief:` preamble. Run the full Q&A. |

## Step 2: Codebase survey

Always perform a general survey before asking questions: project structure and key skill / agent definitions in scope. Read `agent/AGENTS.md` and any obviously-relevant `SKILL.md` or `*.md` files near the input topic. (You do not have `bash`, so git history is out of reach — work from file contents only.)

Targeted survey:
- On the **todo** branch, use the scout brief (if loaded) as foundation. Read additional files only where the brief points at something worth examining more closely.
- On the **existing-spec** branch, follow references the existing draft makes (file paths, agent names, skill names) and read those.
- On the **freeform** branch, identify likely files and modules from the seed text and read enough to ground questions in code reality.

Goal: ask codebase-informed questions, not naive intent-only questions.

## Step 3: Scope-decomposition check

Before Q&A starts, assess whether the input describes multiple independent subsystems. Follow the Interaction conventions above. If multiple independent subsystems are detected, surface a recommendation in this form:

> I detected these likely subsystems: <subsystem 1>, <subsystem 2>[, <subsystem 3>]. I recommend splitting because <one-sentence reason tying the subsystem boundaries to the codebase survey and input>.
>
> Split into separate specs? (y/n)

If the user answers no and insists on a single spec for multi-subsystem work, comply but record an Open Question in the final spec noting the breadth — downstream `generate-plan` may produce a coarse plan as a result. If no multi-subsystem split is recommended, do not ask this question.

This check is non-blocking and runs once at the top.

## Step 4: Intent Q&A

Follow the Interaction conventions above. Ground each question and recommendation in what you learned from the codebase and (if loaded) the scout brief. Read additional code during the conversation as new areas surface.

No fixed question count — use judgment. Stop when you can write a useful spec covering Goal / Context / Requirements / Constraints / Acceptance / Non-Goals.

Do **not** prescribe file paths, function signatures, or types — those belong to the planner. The boundary is: "would two reasonable people building this make the same call?" If yes, the decision is mechanical and out of scope for this skill. If no, the decision is load-bearing and is a candidate for the architecture round in Step 6.

## Step 5: Architecture-need assessment

After intent Q&A is sufficient, follow the Interaction conventions above and present a recommendation to the user:

> My read: this work [does / does not] involve load-bearing architectural choices. [Reasoning — one or two sentences citing specific aspects of the input.] I recommend [running / skipping] an architecture round because <one-sentence rationale>.
>
> Run architecture round? (y/n)

If the user answers yes, run Step 6. If the user answers no, skip Step 6. The recommendation and reasoning are surfaced to the user but are **not** recorded in the final spec — only the user's effective choice (run or skip) matters, and that is reflected by the presence or absence of the `## Approach` section in the spec.

## Step 6: Architecture Q&A (conditional, only when the round runs)

Propose 2–3 distinct approaches with trade-offs, following the Interaction conventions above. Use this format:

> **(a) <approach A>** — <one-line trade-off>.
> **(b) <approach B>** — <one-line trade-off>.
> **(c) <approach C>** — <one-line trade-off>.  <- optional; omit when only two approaches are presented
>
> I recommend (<letter>) because <reason>.
>
> Pick one (a/b/c), or describe your own.

When only two approaches are presented, omit `(c)` and use `Pick one (a/b), or describe your own.` Do not fabricate alternatives that are not meaningfully different — if you genuinely cannot identify 2–3 distinct approaches, surface that to the user, recommend skipping the round, and do not invent fake alternatives.

Capture, for the spec:
- The chosen approach in concrete terms (paradigm-level: subagent vs inline, monolith vs split, sync vs async, single-skill vs multi-skill).
- The reasoning for choosing it over the alternatives.
- The considered-and-rejected alternatives, each with a one-line "why not".

Components, data flow, file structure, types, error-handling shape, and test design remain `planner` territory — do not capture those here.

## Step 7: Spec self-review pass

Before writing, re-read the assembled answers and check for:
- **Placeholders** — "TBD", "TODO", "implement later", "fill in details". Resolve inline.
- **Internal consistency** — do constraints contradict requirements? Are non-goals mutually exclusive with acceptance criteria?
- **Scope** — has the conversation drifted into implementation detail? Trim it to intent + (optional) approach.
- **Ambiguity** — any criterion that two reasonable readers would interpret differently?

Fix issues by re-asking targeted questions if needed.

## Step 8: Write the spec

Write to `docs/specs/<YYYY-MM-DD>-<short-topic>.md` using today's date and a kebab-case topic derived from the conversation. **On the existing-spec branch, overwrite the existing path verbatim instead** — do not generate a new filename.

Spec template (omit any section labeled OPTIONAL whose round did not run):

~~~markdown
# <Title>

Source: TODO-<id>                            <- ONLY on the todo branch
Scout brief: docs/briefs/TODO-<id>-brief.md   <- ONLY when a scout brief was loaded

## Goal

One-paragraph summary of what we're building and why.

## Context

What exists today that's relevant. Codebase reality — files, interfaces, patterns
the implementation will interact with. Sourced from your survey and scout brief.

## Requirements

Concrete requirements derived from the conversation. Each verifiable.

- Requirement 1
- Requirement 2

## Constraints

Boundaries on the solution — must-not-do, compatibility, performance bounds, dependencies.

## Approach              <- OPTIONAL: present iff the architecture round ran in Step 6

**Chosen approach:** ...

**Why this over alternatives:** ...

**Considered and rejected:**

- Alternative A — why not
- Alternative B — why not

## Acceptance Criteria

How do we know it's done? Observable, testable outcomes.

- Criterion 1
- Criterion 2

## Non-Goals

What's explicitly out of scope. Prevents the planner from gold-plating.

## Open Questions (optional)

Anything surfaced during exploration that couldn't be resolved.
~~~

Section ordering rules:
- The `## Approach` section, when present, sits **between** `## Constraints` and `## Acceptance Criteria`.
- When the architecture round did not run, omit the `## Approach` section entirely (header included). Downstream consumers detect by section presence.
- Provenance preamble (`Source:`, `Scout brief:`) lines, when present, sit immediately under the H1 title and above `## Goal`. They are exact-match — copy the literal `Source: TODO-<id>` and `Scout brief: docs/briefs/TODO-<id>-brief.md` strings, with no abbreviation.
- Existing template sections (`Goal`, `Context`, `Requirements`, `Constraints`, `Acceptance Criteria`, `Non-Goals`, `Open Questions`) are unchanged from prior specs.

Create the `docs/specs/` directory if it does not exist.

Do **not** commit. The orchestrator owns the commit gate.

## Step 9: Signal completion

How this step terminates depends on which branch is running this procedure.

### Subagent / mux branch (you are the `spec-designer` subagent)

After Step 8's file write/edit tool returns successfully, you must send one final assistant message. Do **not** make the file write/edit tool call your final action — the orchestrator parses your final text message, not the tool-result side effect.

That final assistant message must contain exactly this line, anchored on its own line, as your last output:

```
SPEC_WRITTEN: <absolute path>
```

Where `<absolute path>` is the full filesystem path of the spec file you just wrote. No backticks, no trailing commentary on the same line, no abbreviation. Then exit. The orchestrator parses this line to drive its review-and-commit gate.

If you cannot complete the procedure (user terminates Q&A early, ambiguous input the user refuses to clarify, file write fails, etc.), exit without emitting `SPEC_WRITTEN:`. The orchestrator will detect the missing line and surface the failure.

### Inline branch (you are the orchestrator running this procedure in your own session)

Do **not** emit `SPEC_WRITTEN: <path>` and do **not** exit. There is no subagent boundary on this branch — the completion line is unnecessary, and exiting would skip the orchestrator's review-and-commit gate. Capture the absolute path of the spec you just wrote and return to the orchestrator skill's Step 5 (pause for user review).

If you cannot complete the procedure inline (user aborts mid-Q&A, etc.), stop without writing the spec and report the failure to the user directly — there is nothing for an outer parser to detect.
