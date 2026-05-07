# Scout reconnaissance brief for planning

Source: TODO-bbe89373

## Goal

Add an optional, non-interactive **scout** stage that runs before mandatory `define-spec`. The scout dispatches a fresh-context subagent that performs task-scoped codebase reconnaissance and writes a structured brief to `docs/briefs/TODO-<id>-brief.md`. Downstream consumers (`define-spec`, `generate-plan`, `planner`, `plan-reviewer`) read that brief from disk to skip broad exploratory reads. The reconnaissance recipe adapts the useful parts of `rpiv-pi`'s upstream `research` skill — scope tracing, anchor sweeps, grouped analysis, code references, integration points, precedents, open questions — but the contract is tighter for this pipeline: deterministic todo-keyed path, non-interactive dispatch with no Q&A loop of its own, mandatory broad-orientation and disconfirmation passes to fight task-framing bias, a consumer-shaped output (sections exist only when a downstream consumer reads them), and load-bearing handoff into planning via the existing `Scout brief:` provenance line.

## Context

This repo's workflow is encoded almost entirely in markdown skill and agent contracts. Today, the consumer side of scout briefs is already wired up; the producer side does not yet exist:

- `agent/skills/define-spec/procedure.md` Step 1 already auto-discovers `docs/briefs/TODO-<raw-id>-brief.md` on the todo branch, reads it as scout context, and writes a `Scout brief: docs/briefs/TODO-<id>-brief.md` provenance line under the spec's H1 title.
- `agent/skills/generate-plan/SKILL.md` Step 1b extracts that `Scout brief:` line from the spec preamble using a bounded preamble read, verifies the file exists on disk (warns and proceeds if not), and forwards the path through `{SCOUT_BRIEF}` without inlining the body.
- `agent/agents/planner.md` and `agent/agents/plan-reviewer.md` already have file-based artifact-reading contracts that explicitly handle a `Scout brief:` line — read the brief from disk, treat it as primary context, warn-and-continue if missing.
- `agent/skills/refine-plan/SKILL.md` auto-discovers `**Scout brief:** docs/briefs/<filename>` from a plan's preamble and forwards the path through the refiner contract; `agent/skills/refine-plan/refine-plan-prompt.md` carries it into reviewer dispatch.
- `docs/briefs/` is the documented artifact root after the recent migration off `.pi/`. The directory is empty today.
- The repo's subagent dispatch standard is `subagent_run_serial` (blocking sequential) and `subagent_run_parallel` (blocking parallel). Path-based handoff for durable artifacts is universal: provenance lines flow through prompts; bodies are read from disk by the worker.
- Skill structure follows a consistent pattern: orchestrator skill at `agent/skills/<name>/SKILL.md` + worker agent at `agent/agents/<name>.md` + per-dispatch filled prompt template (e.g., `generate-plan-prompt.md`).
- No skill or agent currently produces briefs. No skill exposes the scout-style reconnaissance in this repo today; the upstream reference is `rpiv-pi`'s `research` skill at `https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-pi/skills/research/SKILL.md`, which combines a `scope-tracer` (mentioned-artifact reads, anchor sweeps, 5–10 key-file reads, dense trace-quality questions) with a `research` synthesis stage (grouped analysis, code references, integration points, architecture insights, precedents/lessons, developer context, open questions). It includes a developer checkpoint that does not fit this repo's pipeline because mandatory `define-spec` already owns the user Q&A surface.

## Requirements

### Scout skill and agent

- New skill at `agent/skills/scout/`:
  - `SKILL.md` — orchestrator: input-shape detection, model-tier resolution, pre-existing-brief check, dispatch via `subagent_run_serial`, completion-marker validation, commit gate, continuation offer.
  - `scout-prompt.md` — per-dispatch prompt template with placeholders for working directory, todo body (when todo-backed) or freeform task text (when not), output path, today's ISO 8601 UTC timestamp, current git HEAD SHA, and resolved provider/model.
  - `README.md` — short description of role in workflow, input shapes, dispatch behavior, and brief format.
- New agent at `agent/agents/scout.md` with frontmatter:
  - `tools: read, write, grep, find, ls`
  - `thinking: high`
  - `session-mode: lineage-only`
  - `system-prompt: append`
  - `spawning: false`
  - `auto-exit: true`
  - Body: identity rules and reconnaissance instructions; read-only except for writing the single brief file at the path provided in its prompt.

### Skill behavior

- Accepts two input shapes:
  - **Todo ID** matching `^TODO-([0-9a-f]{8})$` exactly. Skill reads `docs/todos/<raw-id>.md` to extract the title and full body, inlines the body into the dispatched prompt, and writes the brief to `docs/briefs/TODO-<id>-brief.md`.
  - **Freeform text** for non-todo inputs. Skill writes the brief to `docs/briefs/<YYYY-MM-DD>-<short-slug>-brief.md` using today's date and a kebab-case slug derived from the seed text. No `Source:` preamble line is written for freeform briefs, because they are not todo-keyed and `define-spec`'s auto-discovery does not look them up.
- Resolves the dispatch `(model, cli)` pair from `~/.pi/agent/model-tiers.json` per `agent/skills/_shared/model-tier-resolution.md`. Default tier is `standard`. The skill MAY accept an optional `--tier <name>` argument (anywhere in the slash-command input) that selects `cheap`, `standard`, or `capable`; on missing argument, default is `standard`. Strict-by-default failures (missing file, missing tier, missing dispatch map, missing dispatch.<provider>) emit the canonical templates from `agent/skills/_shared/model-tier-resolution.md` byte-equal with `<agent> = scout` and `<tier> = <selected tier>`.
- Dispatches the `scout` agent via `subagent_run_serial { wait: true }` with the filled `scout-prompt.md` body as the task.
- Validates the agent's `results[0]`: `exitCode == 0`; `finalMessage` ends with an anchored line `BRIEF_WRITTEN: <absolute path>` (no backticks, no trailing commentary on the same line); the file exists on disk and is non-empty. On validation success, proceed to the commit gate (see below). On validation failure, surface a clear error with `transcriptPath` and stop; the skill does NOT auto-retry.

### Pre-existing-brief detection

Before dispatch, the skill checks whether the target brief path already exists. The check applies to both input shapes — the freeform path can collide on the date+slug.

When an existing brief is found:

- Read the existing brief's `Git SHA: <sha>` preamble line via a bounded read (e.g., `head -n 8`). Compute the current repo HEAD SHA.
- Choose the prompt by branch and SHA:

  | Branch | Brief SHA == HEAD | Brief SHA != HEAD (or unreadable) |
  |---|---|---|
  | Todo | `A brief for TODO-<id> already exists at <path> at the current HEAD SHA. (o)verwrite or (k)eep?` | `A brief for TODO-<id> already exists at <path>, generated at SHA <brief-sha>. HEAD is now <head-sha>, so the brief may be stale. (o)verwrite or (k)eep?` |
  | Freeform | `A brief already exists at <path> at the current HEAD SHA. (o)verwrite or (k)eep?` | `A brief already exists at <path>, generated at SHA <brief-sha>. HEAD is now <head-sha>, so the brief may be stale. (o)verwrite or (k)eep?` |

- If the SHA line is missing or malformed, treat as stale and use the right-hand prompt with `<brief-sha>` rendered as `(unreadable)`.
- On `o`/`overwrite`: dispatch normally; the scout agent overwrites the file at the same path. Skip the commit gate's review-only `(r) Re-run` semantics — overwrite *is* the new dispatch.
- On `k`/`keep`:
  - **Todo branch:** report the existing path and offer the continuation `Run /define-spec TODO-<id> next? (y/n)`; do not dispatch.
  - **Freeform branch:** report the existing path and stop; do not offer continuation (no todo to hand off).

### Brief format

Each brief is a markdown file with a strict preamble and section ordering. The orchestrator and downstream consumers parse only the preamble and section headers; freeform body text within sections is the agent's own.

Required structure:

~~~markdown
# Scout Brief: <task title>

Source: TODO-<id>                            <- ONLY on the todo branch
Generated at: <ISO 8601 UTC timestamp>
Git SHA: <40-char SHA of HEAD at scout time>
Model: <provider/model>

## Relevant Files

## Key Interfaces and Types

## Dependency / Call Graph

## Patterns and Conventions

## Existing Tests and Test Patterns

## Risk Areas

## Possible Misses

## Open Questions / Ambiguities
~~~

Section ordering and shape rules:

- Preamble lines (`Source:`, `Generated at:`, `Git SHA:`, `Model:`) sit immediately under the H1 title and above `## Relevant Files`. They are exact-match — copy the literal `Source: TODO-<id>` and `Git SHA: <sha>` strings, no abbreviation.
- The freeform branch omits `Source:` (no todo). It still includes `Generated at:`, `Git SHA:`, and `Model:`.
- All eight sections appear in the order above. Empty sections are written as `_None._` rather than omitted, so consumer parsers can rely on uniform structure.
- Each section earns its place by feeding a downstream consumer:
  - `Relevant Files`, `Key Interfaces and Types`, `Dependency / Call Graph`, `Patterns and Conventions`, `Existing Tests and Test Patterns`, `Risk Areas` — the planner's code-map.
  - `Patterns and Conventions`, `Existing Tests and Test Patterns`, `Risk Areas` — additionally feed the plan-reviewer's brief-coverage check.
  - `Possible Misses` — anti-bias output: places the scout could not verify, contradictions between task framing and code reality, and adjacent surfaces the brief may have missed. Tells the planner where to verify directly rather than trust the brief.
  - `Open Questions / Ambiguities` — feeds `define-spec`'s Q&A loop.
- Paths inside the brief are relative to repo root unless an absolute path is genuinely required.
- The brief does NOT inline full file contents by default. Concrete snippets are allowed only when needed to illustrate a non-obvious convention; otherwise the brief uses paths, line ranges, and short summaries so downstream consumers still read current files for task-critical implementation.
- Process-shaped sections (Summary, Broad Orientation, Precedents and Lessons, Confidence Notes) are intentionally NOT in the output — see Anti-bias prompt requirements for how the broad-orientation and disconfirmation passes still happen during scouting and where their findings flow.

### Anti-bias prompt requirements

The dispatched `scout-prompt.md` must direct the agent to perform, in order:

1. **Broad orientation pass** — repo layout, package/module boundaries, likely entry points, test structure, and adjacent areas that may be relevant. Performed before the task-focused deep dive so the agent does not anchor on the todo's wording.
2. **Task-focused deep dive** — read files implicated by the todo body; trace imports and call paths; identify interfaces, types, registrations, dispatch sites, and tests.
3. **Disconfirmation step** — explicitly check whether files named in the todo are incomplete or misleading; search for adjacent implementations and alternate call paths, including registrations, generated artifacts, and configured entry points; record contradictions between the task framing and code reality; surface plausible misses and confidence limits.

These three passes are encoded as discrete prompt sections so every brief has the same anti-bias behavior regardless of input wording. They are agent process steps, not brief output sections — their findings flow into the consumer-shaped sections of the brief:

- Broad orientation findings feed `Relevant Files`, `Patterns and Conventions`, and `Risk Areas` (e.g., adjacent areas that turn out to matter).
- Task-focused deep-dive findings feed every code-map section.
- Disconfirmation findings feed `Possible Misses` (plus `Risk Areas` when a flagged contradiction is itself a hazard).

The agent does NOT write a section per process pass; collapsing process-shaped audit sections is intentional, not an oversight.

### Non-interactive policy

- The scout never asks the user questions in its own loop. Unanswered questions go into `## Open Questions / Ambiguities`.
- The scout writes exactly one file: the brief at the orchestrator-supplied path. It does not edit code, configuration, tests, todos, specs, plans, or any other file.
- It does not commit. The orchestrator owns review and commit gates (the scout skill's commit gate is described under "Commit gate" below).
- If `subagent_run_serial` is unavailable or the dispatch attempt fails, the skill stops with an explicit error. It does NOT fall back to inline reconnaissance — that would defeat the token-cost rationale by polluting orchestrator context with the very reads the brief is supposed to absorb.

### Commit gate

After successful validation, the scout skill pauses for user review:

> Brief written to `<path>`. Review it, then choose:
>
> **(c) Commit** — commit the brief to git.
> **(r) Re-run** — dispatch scout again with the same input; the agent overwrites the same path.
> **(x) Stop** — leave `<path>` uncommitted on disk for manual editing and committing later.

Behavior mirrors `define-spec`'s review gate: the orchestrator does not read the brief into its own context — the user reads it directly. On `c`, the skill invokes the `commit` skill with the exact brief path. On `r`, the skill re-runs from the dispatch step (skipping the pre-existing-brief check; an `r` is an explicit overwrite). On `x`, leave on disk and stop. The continuation offer is presented only after a successful commit, and only on the todo branch:

- **Todo branch, post-commit:** offer `Run /define-spec TODO-<id> next? (y/n)`. On `y`, invoke `/define-spec TODO-<id>`. On `n`, stop.
- **Freeform branch, post-commit:** stop without offering continuation (no todo to hand off).

### Define-spec procedure addition

Update `agent/skills/define-spec/procedure.md` Step 2 (codebase survey):

- When a scout brief was loaded on the todo branch, the procedure already uses it as foundation for the survey. Add an explicit instruction: when the brief contains entries under `## Open Questions / Ambiguities`, treat each as a candidate question to resolve with the user during Step 4 intent Q&A. The spec-designer judges which questions remain load-bearing and asks them under the existing Interaction conventions (recommend with each, one question per turn).

This is a procedure-text addition only. No new orchestrator gate, no new dispatch path, no auto-suggest of scout from `define-spec`.

### Generate-plan staleness check

Update `agent/skills/generate-plan/SKILL.md` Step 1b's preamble extraction:

- When a `Scout brief: docs/briefs/<filename>` line is found in the spec preamble and the brief file exists, perform a bounded read of the brief preamble (e.g., `head -n 8`) and extract its `Git SHA: <sha>` line.
- If the brief SHA differs from the current repo HEAD SHA, emit one warning to the user:

  > Scout brief at `<path>` was generated at SHA `<brief-sha>`; HEAD is now `<head-sha>`. Treating as potentially stale; planning will continue. Re-run `/scout TODO-<id>` if you want a fresh brief.

  Continue planning with the brief.
- If the SHA line is missing, malformed, or unreadable, emit a softer warning (`Scout brief at <path> has unreadable Git SHA preamble — continuing without staleness signal.`) and continue.
- Do NOT block planning on staleness. The brief stays load-bearing exactly as it does today; the warning is informational.

### Plan-reviewer brief-coverage check

Update `agent/agents/plan-reviewer.md` and `agent/skills/generate-plan/review-plan-prompt.md` to add a brief-coverage check:

- Fires only when a `Scout brief:` line is in the plan provenance AND the brief file exists on disk. Otherwise the check is skipped (preserves existing behavior when no brief is present).
- The reviewer reads the brief in full and checks the plan against three brief sections: `## Risk Areas`, `## Existing Tests and Test Patterns`, and `## Patterns and Conventions`.
- Findings:
  - **Critical** — the plan ignores a brief-surfaced constraint that would cause execution to break (e.g., the brief flags a registration site that the plan does not touch but must).
  - **Important** — the plan does not acknowledge or mitigate a significant brief-surfaced risk area; the plan's testing approach contradicts patterns observed in the brief; the plan's structural choices contradict naming or organization conventions surfaced by the brief.
  - **Minor** — low-impact polish gaps relative to brief findings.
- Severity vocabulary, verdict semantics (`Approved` / `Approved with concerns` / `Not approved`), and the `### Outcome` / `### Strengths` / `### Issues` / `### Recommendations` body shape are unchanged from the unified plan-and-code-review verdict spec. The brief-coverage check produces findings in the same format under `### Issues`, severity-grouped under the existing H4 sub-headings.

### Planner deviation rule

Update `agent/agents/planner.md` to mirror the existing spec-Approach deviation rule for briefs:

- When a brief is provided, the planner uses it as orientation. If codebase analysis surfaces a reason the planner must deviate from a brief recommendation under `## Patterns and Conventions` or `## Risk Areas`, the deviation is recorded under the plan's `## Risk Assessment` section as: `Brief said X; plan does Y because <reason>`.
- This rule applies on both the initial generation pass and the surgical edit pass (consistent with the existing approach-deviation rule), and is inherited automatically by the edit-mode planner dispatch.

### Documentation

- Add `agent/skills/scout/README.md` with role-in-workflow, input shapes, dispatch behavior, brief format, pre-existing-brief behavior, commit gate, and continuation offer.
- Update top-level `README.md`:
  - Skill table — add a `scout` row pointing at `agent/skills/scout/README.md` with a one-line summary.
  - Workflow diagram — show optional scout stage between "Refine todo" and "Define spec" (matching the TODO's pipeline diagram).
  - "How it works in practice" — add a short subsection describing scout as the optional reconnaissance stage and its handoff via `Scout brief:` provenance lines.
- Note the token-cost comparison from the TODO under the README scout subsection or skill README so the rationale is discoverable.

## Constraints

- Do NOT gate `define-spec` on the existence of a brief. The scout is optional; mandatory `define-spec` Q&A still runs whether or not a brief was produced.
- Do NOT auto-suggest scout from `define-spec` (per the chosen integration level — only the existing brief-discovery and the new Open-Questions consumption land in `define-spec`).
- Do NOT add a direct todo→plan or brief→plan dispatch path in `generate-plan`. The spec is the only handoff after mandatory user Q&A.
- Do NOT introduce a Q&A loop inside the scout. Open questions go into the brief; `define-spec` owns the user Q&A surface.
- Do NOT probe a multiplexer (cmux/tmux/zellij/wezterm) or use pane-based dispatch. Scout is non-interactive; the mux machinery is wasted.
- Do NOT fall back to an inline procedure if `subagent_run_serial` is unavailable. Stop with an explicit error. Inline reconnaissance pollutes orchestrator context and defeats the entire token-cost rationale.
- Do NOT change the existing brief-discovery contract in `define-spec` or the `Scout brief:` extraction in `generate-plan` / `refine-plan` beyond the additions specified above. The deterministic path `docs/briefs/TODO-<id>-brief.md` and the literal `Scout brief: docs/briefs/<filename>` provenance form remain authoritative.
- Do NOT inline the brief body into orchestrator prompts. All downstream consumption goes through path-based handoff; the brief is read from disk by the worker that needs it.
- Do NOT modify the `coder` or `verifier` contracts. Coders read current files at task time and do not consume the brief; verifiers operate on per-task `Verify:` recipes and the verifier-visible file set.
- Do NOT include full file contents in the brief by default. Use paths, line ranges, and short summaries; embed concrete snippets only for non-obvious conventions.
- Do NOT block planning, reviewing, or refinement on staleness. The git-SHA mismatch surfaces as a warning at consumption time; the user judges whether to re-run scout.
- Do NOT add backwards-compatibility shims for prior brief formats — no prior format exists.
- Do NOT couple scout behavior to specific TypeScript extensions. The entire feature is markdown contracts plus one new agent definition.
- Do NOT add per-process audit sections (Summary, Broad Orientation, Precedents and Lessons, Confidence Notes) to the brief output. The brief is consumer-shaped; process discipline lives in the agent's prompt, not in mirrored output sections.

## Approach

**Chosen approach:** Non-interactive fresh-context subagent dispatched synchronously via `subagent_run_serial { wait: true }`. New `scout` skill (orchestrator) + new `scout` agent (worker) + filled `scout-prompt.md` template, mirroring the established `planner` / `refine-plan` shape. The skill detects input shape (todo vs freeform), resolves the dispatch model and CLI, runs the pre-existing-brief check, dispatches the scout agent with the filled prompt, validates the `BRIEF_WRITTEN: <absolute path>` completion marker plus on-disk existence and non-emptiness, runs the user-review commit gate, and offers the `/define-spec TODO-<id>` continuation on the todo branch only. The agent reads the codebase, performs broad orientation, task-focused deep dive, and disconfirmation as internal process steps, and writes a brief whose output sections are shaped by what downstream consumers actually read.

**Why this over alternatives:** Mirroring `planner`'s shape slots scout cleanly into the existing workflow with no new dispatch tool, no new artifact-handoff style, and no new contract surface for downstream consumers (which already handle `Scout brief:` provenance). Fresh-context isolation preserves the entire token-cost rationale: the orchestrator never absorbs the reconnaissance reads, so the planner that ultimately consumes the brief through path-based handoff is genuinely shorter on input tokens than a planner that does broad discovery itself. Synchronous blocking is functionally equivalent to async-then-wait when the brief is the immediate input to the next stage, and uniform `subagent_run_serial` dispatch keeps the workflow's contract surface small. Non-interactive default keeps `define-spec` as the single user-facing Q&A owner. A consumer-shaped output (8 sections, no process audit) keeps the brief dense — every section costs the planner tokens to ingest, so each section must pay for itself by reducing planner search work or feeding a named reviewer check.

**Considered and rejected:**

- Inline procedure (no subagent dispatch) — pollutes orchestrator context with reconnaissance reads. Path-based handoff to a downstream planner subagent does not recover the loss because the orchestrator's context window is what we are trying to spare. Defeats the stated token-cost rationale.
- Mux-pane-aware dispatch like `spec-designer` — adds Q&A-pane probing and dispatch machinery for an interactive surface scout does not have, and contradicts the non-interactive default.
- Asynchronous dispatch via the `subagent` tool — async-then-wait is functionally identical when the brief is the next stage's input, and adds a second dispatch tool to the workflow without payoff. Reserve async for a future use case (e.g., backgrounded multi-todo prefetch).
- Process-shaped 12-section output mirroring `rpiv-pi`'s `research` artifact (Summary / Broad Orientation / Disconfirmation / Precedents / Confidence Notes alongside the code-map sections) — the wider format is research-deliverable-shaped, not planning-aid-shaped. The added sections audit the scout's process rather than reduce planner search effort, and the planner pays for them in input tokens on every consumption. The 8-section consumer-shaped format keeps the anti-bias passes in the agent's prompt while letting their findings flow into the sections that actually feed the planner and plan-reviewer.

## Acceptance Criteria

- A new skill exists at `agent/skills/scout/SKILL.md` with `name: scout` frontmatter and a description noting non-interactive reconnaissance and brief output. It is invocable as `/scout TODO-<id>` for todo-backed input and `/scout <freeform text>` for non-todo input. An optional `--tier <name>` argument is accepted in either position.
- A new agent exists at `agent/agents/scout.md` with frontmatter `tools: read, write, grep, find, ls`, `thinking: high`, `session-mode: lineage-only`, `system-prompt: append`, `spawning: false`, `auto-exit: true`. The body forbids edits to any file other than the single brief at the orchestrator-supplied path, forbids running shell or build commands, and forbids asking the user questions.
- A new prompt template exists at `agent/skills/scout/scout-prompt.md` containing placeholders for working directory, task body / freeform task text, output path, today's ISO 8601 UTC timestamp, current git HEAD SHA, and resolved provider/model. The template includes three explicitly-labeled passes — broad orientation, task-focused deep dive, disconfirmation — in that order, each with a one-paragraph instruction in the prompt body. The prompt makes clear these are process steps whose findings flow into the brief's consumer-shaped sections, not output sections of their own.
- Running `/scout TODO-bbe89373` produces a non-empty `docs/briefs/TODO-bbe89373-brief.md`. The H1 line reads `# Scout Brief: <title>`. The preamble contains `Source: TODO-bbe89373`, `Generated at: <ISO 8601 UTC>`, `Git SHA: <40-char sha>`, and `Model: <provider/model>` lines in that order. The body contains exactly the eight required level-2 sections — `## Relevant Files`, `## Key Interfaces and Types`, `## Dependency / Call Graph`, `## Patterns and Conventions`, `## Existing Tests and Test Patterns`, `## Risk Areas`, `## Possible Misses`, `## Open Questions / Ambiguities` — in that order. Empty sections render as `_None._`. No process-audit sections (Summary, Broad Orientation, Precedents and Lessons, Confidence Notes) appear in the output.
- The skill validates the agent's output by checking `exitCode == 0`, an anchored `BRIEF_WRITTEN: <absolute path>` line at the end of `finalMessage`, and the file existing and non-empty on disk before any review-or-commit step.
- When a brief already exists on entry, the skill prompts `(o)verwrite / (k)eep` with a staleness note constructed from the brief's `Git SHA:` preamble vs current HEAD. The check applies on both branches; the prompt text differs only in the `TODO-<id>` framing on the todo branch. On `keep` for the todo branch, the skill emits the existing path and offers the continuation prompt; on `keep` for the freeform branch, the skill emits the existing path and stops.
- The skill stops with a clear error if `subagent_run_serial` is unavailable. It does NOT inline-fallback.
- The skill resolves model and CLI from `~/.pi/agent/model-tiers.json` per `agent/skills/_shared/model-tier-resolution.md`, defaulting to the `standard` tier and accepting an optional `--tier <name>` argument. Strict-by-default failures emit the canonical templates byte-equal with `<agent> = scout`.
- After successful validation, the skill presents a `(c) Commit / (r) Re-run / (x) Stop` review gate. On `c`, it invokes the `commit` skill with the exact brief path. On `r`, it re-dispatches with the same input over the existing path. On `x`, it leaves the file on disk uncommitted.
- On the todo branch only, after a successful commit, the skill offers `Run /define-spec TODO-<id> next? (y/n)` and invokes `/define-spec TODO-<id>` on `y`. The freeform branch never offers continuation.
- `agent/skills/define-spec/procedure.md` Step 2 explicitly tells the spec-designer that the brief's `## Open Questions / Ambiguities` items are candidate questions for the Step 4 intent Q&A, to be asked under the existing Interaction conventions.
- `agent/skills/generate-plan/SKILL.md` Step 1b reads the brief's `Git SHA:` preamble line via a bounded read and emits one warning when it differs from the current HEAD SHA. Planning continues either way. The warning text identifies the brief path, the brief SHA, and HEAD.
- `agent/agents/plan-reviewer.md` and `agent/skills/generate-plan/review-plan-prompt.md` describe the brief-coverage check that fires only when a `Scout brief:` line is in the plan provenance and the brief exists on disk. The check inspects the plan against the brief's `## Risk Areas`, `## Existing Tests and Test Patterns`, and `## Patterns and Conventions`. Gaps are flagged under the unified Critical / Important / Minor severity vocabulary, with Critical reserved for "ignoring this would break execution."
- `agent/agents/planner.md` documents that intentional deviations from a brief's `## Patterns and Conventions` or `## Risk Areas` MUST be recorded under the plan's `## Risk Assessment` as `Brief said X; plan does Y because <reason>`. The rule applies on both initial generation and surgical edit passes.
- `agent/skills/scout/README.md` describes role-in-workflow, input shapes, dispatch behavior, brief format, pre-existing-brief behavior, commit gate, and continuation offer.
- The top-level `README.md` lists `scout` in the skill table, shows it as an optional stage in the workflow diagram between "Refine todo" and "Define spec," and references the brief artifact in `docs/briefs/`.
- Manual smoke run: `/scout TODO-bbe89373` writes a valid brief whose body matches the format above; `/define-spec TODO-bbe89373` then reads that brief, writes the existing `Scout brief:` provenance line into the spec, and surfaces brief Open Questions during Q&A.

## Non-Goals

- Whole-codebase indexing or a generic, task-agnostic repo map.
- Direct todo→plan or brief→plan dispatch — `define-spec` Q&A remains mandatory.
- Coder consumption of the brief during execution waves. Coders read current files from their per-task prompts and operate after the plan has concrete file scope.
- Re-running scout between execution waves. Wave 2 may operate on code that wave 1 changed; the brief is by design a one-shot pre-planning artifact.
- An interactive Q&A round inside the scout itself.
- Auto-suggest of scout from `define-spec` (per the chosen integration level — define-spec changes are limited to reading the brief if present and consuming its Open Questions).
- Hard-fail on missing brief at consumption time. The existing warn-and-continue contract in `generate-plan`, `planner`, `plan-reviewer`, and `refine-plan` is preserved.
- Stale-brief enforcement beyond the warning. No auto-rescout, no block.
- Asynchronous dispatch via the `subagent` tool. The default and only dispatch shape is `subagent_run_serial { wait: true }`.
- Mux- or pane-aware dispatch. Scout never probes multiplexers.
- New TypeScript or extension code. The entire feature is markdown contracts plus one new agent definition and one new prompt template file.
- Backwards compatibility for any prior brief format — no prior format exists.
- Process-audit sections in the brief output (Summary, Broad Orientation, Precedents and Lessons, Confidence Notes). The anti-bias process passes still happen in the agent prompt; their findings land in the consumer-shaped sections.

## Open Questions

- Token cost figures in the TODO's comparison table are estimates. After the first real run, compare actual planner-plus-brief tokens against the no-scout baseline; revise the README scout subsection if the estimates are materially off.
- The git-SHA staleness check treats any non-equal SHA as stale. In practice, briefs survive low-impact unrelated commits. The current decision is to surface a warning and let the user judge — revisitable if the warning fires too often and gets ignored, in which case a more sophisticated freshness signal (file-touched-since-brief, narrowed to brief-cited paths) could replace the SHA equality check.
- The 8-section format is a bet that consumer-shaped output beats process-shaped output for this pipeline. If real briefs surface findings that genuinely don't fit any of the eight sections (e.g., load-bearing precedents or cross-cutting "this whole subsystem is fragile" notes that don't belong under any single Risk Areas bullet), revisit whether to add a narrow `## Synthesis` or `## Cross-Cutting Notes` section rather than stretch the existing eight.
