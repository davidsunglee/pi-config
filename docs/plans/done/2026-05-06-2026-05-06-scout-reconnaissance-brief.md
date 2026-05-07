# Scout reconnaissance stage — implementation plan

**Source:** `TODO-bbe89373`
**Spec:** `docs/specs/2026-05-06-scout-reconnaissance-brief.md`

## Goal

Add an optional, non-interactive **scout** stage that runs before mandatory `define-spec`. A new `scout` skill dispatches a fresh-context `scout` subagent which performs task-scoped codebase reconnaissance and writes a structured brief to `docs/briefs/TODO-<id>-brief.md` (or a dated slug for freeform input). Downstream consumers (`define-spec`, `generate-plan`, `planner`, `plan-reviewer`) read the brief from disk to skip broad exploratory reads. The producer side is entirely new; the consumer side already handles `Scout brief:` provenance — six existing files get surgical additions for SHA staleness signaling, brief-coverage review, brief-deviation recording, and Open-Questions feedforward into spec Q&A.

## Architecture summary

- **New skill** at `agent/skills/scout/` with three files:
  - `SKILL.md` — orchestrator: input-shape detection (todo ID vs freeform), `--tier` parsing, model-tier resolution per `agent/skills/_shared/model-tier-resolution.md`, pre-existing-brief check with `Git SHA:` comparison, `subagent_run_serial { wait: true }` dispatch, `BRIEF_WRITTEN:` validation, `(c)/(r)/(x)` commit gate, todo-branch continuation offer.
  - `scout-prompt.md` — per-dispatch template with placeholders for working directory, todo body or freeform task text, output path, ISO 8601 UTC timestamp, git HEAD SHA, and resolved provider/model. Carries the three-pass anti-bias instructions (broad orientation, task-focused deep dive, disconfirmation) and the consumer-shaped 8-section brief format.
  - `README.md` — role-in-workflow, input shapes, dispatch behavior, brief format, pre-existing-brief behavior, commit gate, continuation offer.
- **New agent** at `agent/agents/scout.md` — `tools: read, write, grep, find, ls`, `thinking: high`, `session-mode: lineage-only`, `system-prompt: append`, `spawning: false`, `auto-exit: true`. Read-only on the codebase; the only allowed write is the single brief file at the orchestrator-supplied path.
- **Six existing files updated surgically:**
  - `agent/skills/define-spec/procedure.md` — Step 2 addition: brief's `## Open Questions / Ambiguities` are candidate questions for Step 4 intent Q&A.
  - `agent/skills/generate-plan/SKILL.md` — Step 1b addition: bounded `Git SHA:` read on the brief; warn on SHA mismatch, soft-warn on unreadable preamble; never block.
  - `agent/agents/plan-reviewer.md` — new brief-coverage check (fires when `Scout brief:` is in plan provenance and the file exists).
  - `agent/skills/generate-plan/review-plan-prompt.md` — mirror of brief-coverage check in the dispatched reviewer prompt.
  - `agent/agents/planner.md` — brief-deviation rule mirroring the existing spec-Approach deviation rule (Risk Assessment entry: `Brief said X; plan does Y because <reason>`).
  - `README.md` (repo root) — `scout` row in the skill table, optional scout stage in the workflow diagram between "Refine todo" and "Define spec", "How it works in practice" subsection.

The scout slots into the established `planner` / `refine-plan` shape: orchestrator skill + worker agent + filled prompt template, dispatched synchronously via `subagent_run_serial { wait: true }`, with path-based handoff into downstream stages via the existing `Scout brief:` provenance line. The orchestrator never reads the brief body into its own context — the user reads it directly between dispatch and commit.

## Tech stack

- Markdown contracts only. No new TypeScript or extension code.
- Targets the existing `pi-interactive-subagent` runtime's `subagent_run_serial` dispatch tool.
- Reuses `agent/skills/_shared/model-tier-resolution.md` primitives (tier-path resolution, provider-prefix extraction, `dispatch[<prefix>]` lookup) and the canonical strict-by-default failure templates (1)–(4).
- Reuses the existing `commit` skill for the brief commit gate.

## File Structure

- `agent/agents/scout.md` (Create) — Scout agent definition: frontmatter (`tools: read, write, grep, find, ls`, `thinking: high`, `session-mode: lineage-only`, `system-prompt: append`, `spawning: false`, `auto-exit: true`) + identity rules forbidding code edits, shell commands, and user questions. Read-only on the codebase except for one brief write.
- `agent/skills/scout/scout-prompt.md` (Create) — Per-dispatch prompt template with `{WORKING_DIR}`, `{TODO_BODY_OR_FREEFORM_TEXT}`, `{OUTPUT_PATH}`, `{GENERATED_AT_ISO}`, `{GIT_HEAD_SHA}`, `{MODEL_PROVIDER_AND_NAME}`, `{SOURCE_PROVENANCE}`, `{TASK_TITLE}` placeholders. Encodes the three-pass anti-bias process (broad orientation, task-focused deep dive, disconfirmation) plus the consumer-shaped 8-section brief format and the `BRIEF_WRITTEN: <absolute path>` completion-marker contract.
- `agent/skills/scout/SKILL.md` (Create) — Skill orchestrator: input-shape detection, `--tier` parsing, model-tier resolution, pre-existing-brief check with overwrite/keep prompt, dispatch, validation, commit gate, continuation offer.
- `agent/skills/scout/README.md` (Create) — Skill documentation: role in workflow, input shapes, dispatch behavior, brief format, pre-existing-brief behavior, commit gate, continuation offer, token-cost rationale pointer.
- `agent/skills/define-spec/procedure.md` (Modify) — Step 2 addition: when a scout brief was loaded on the todo branch and contains `## Open Questions / Ambiguities` entries, treat each as a candidate Step 4 intent-Q&A question (under the existing Interaction conventions, one per turn, with a recommendation).
- `agent/skills/generate-plan/SKILL.md` (Modify) — Step 1b extraction: after a `Scout brief:` line is found and the brief exists, perform a bounded preamble read (`head -n 8`) and extract `Git SHA:`. On mismatch with HEAD, emit one informational warning. On unreadable SHA preamble, emit a softer warning. Never block planning.
- `agent/agents/plan-reviewer.md` (Modify) — Add a brief-coverage check that fires only when `Scout brief:` is in plan provenance AND the brief exists. The reviewer reads the brief and checks the plan against `## Risk Areas`, `## Existing Tests and Test Patterns`, and `## Patterns and Conventions`. Findings emit under the unified Critical / Important / Minor severities and the existing `### Issues` H4 sub-headings.
- `agent/skills/generate-plan/review-plan-prompt.md` (Modify) — Mirror the brief-coverage check in the dispatched plan-reviewer prompt body so a fresh reviewer reads the same instructions.
- `agent/agents/planner.md` (Modify) — Add a brief-deviation rule mirroring the existing spec-Approach deviation rule. When a brief is provided, the planner uses it as orientation; if codebase analysis surfaces a reason to deviate from `## Patterns and Conventions` or `## Risk Areas`, the deviation is recorded under `## Risk Assessment` as `Brief said X; plan does Y because <reason>`. Applies on both initial generation and surgical edit passes.
- `README.md` (Modify) — Skill table: add a `scout` row pointing at `agent/skills/scout/README.md` with a one-line summary. Workflow diagram: insert an optional scout stage between "Refine todo" and "Define spec". "How it works in practice": add a short subsection describing scout as the optional reconnaissance stage and its handoff via `Scout brief:` provenance.

## Tasks

### Task 1: Create the scout agent definition

**Files:**
- Create: `agent/agents/scout.md`

**Steps:**
- [ ] **Step 1: Read frontmatter conventions** — open `agent/agents/planner.md` and `agent/agents/spec-designer.md` to confirm the YAML frontmatter shape used by other agents (delimiters `---`, key order, descriptions written as a one-paragraph summary).
- [ ] **Step 2: Write frontmatter** — write the file beginning with `---` as the very first line (no comments, no blank lines, no BOM before it). Frontmatter keys, in order: `name: scout`, `description: Non-interactive task-scoped codebase reconnaissance. Reads broadly, deep-dives the task, runs a disconfirmation pass, and writes a single structured brief at the orchestrator-supplied path. Ends with BRIEF_WRITTEN: <absolute path> on its own line.`, `tools: read, write, grep, find, ls`, `thinking: high`, `session-mode: lineage-only`, `system-prompt: append`, `spawning: false`, `auto-exit: true`. Close frontmatter with `---`.
- [ ] **Step 3: Write identity body** — after a single blank line, write a level-1-free body that identifies the agent as "the scout" performing non-interactive codebase reconnaissance for a single task. State that the agent receives all task context inline in its prompt and has no parent-session context.
- [ ] **Step 4: Write hard rules** — under a `## Hard rules` heading, list (one bullet each): "The only file write allowed is the single brief at the orchestrator-supplied output path. Do not edit, create, or delete any other file — code, configuration, tests, todos, specs, plans, reviews, briefs, or otherwise.", "Do not run shell or build commands. The agent has no `bash` tool by design.", "Do not ask the user questions. Unanswered questions go into the brief's `## Open Questions / Ambiguities` section.", "Do not commit. The orchestrator owns review and commit gates.", "End your final assistant message with a single anchored line `BRIEF_WRITTEN: <absolute path>` matching the orchestrator-supplied output path exactly. No backticks, no trailing commentary on that line."
- [ ] **Step 5: Self-review** — re-read the file. Confirm the frontmatter is the very first content (no preceding blank line or BOM), all six required keys are present in the documented order, the body has no `# H1` heading (frontmatter `name:` covers that), and the hard rules list contains all five bullets above.

**Acceptance criteria:**

- The file exists and begins with YAML frontmatter as the very first content (the opening `---` is line 1).
  Verify: `head -1 agent/agents/scout.md` outputs exactly `---` and `head -n 12 agent/agents/scout.md` shows the documented frontmatter keys in order: `name: scout`, `description:`, `tools: read, write, grep, find, ls`, `thinking: high`, `session-mode: lineage-only`, `system-prompt: append`, `spawning: false`, `auto-exit: true`.
- The body forbids edits to any file other than the brief, forbids shell/build commands, forbids user questions, forbids commits, and mandates the `BRIEF_WRITTEN:` completion marker.
  Verify: `grep -n` on `agent/agents/scout.md` for each of the five literal substrings — `BRIEF_WRITTEN`, `bash`, `commit`, `ask the user`, `single brief at the orchestrator-supplied output path` — returns at least one match for each (case-insensitive where appropriate).

**Model recommendation:** cheap

### Task 2: Create the scout-prompt template

**Files:**
- Create: `agent/skills/scout/scout-prompt.md`

**Steps:**
- [ ] **Step 1: Read sibling templates for shape** — open `agent/skills/generate-plan/generate-plan-prompt.md` and `agent/skills/refine-plan/refine-plan-prompt.md` to confirm the placeholder convention (`{NAME}`), the use of `## Provenance` / `## Working Directory` / `## Output` blocks, and that template files start with a `# Title` heading rather than frontmatter.
- [ ] **Step 2: Write title and intro** — start the file with `# Scout Reconnaissance Task` as the H1. Add a short paragraph explaining the agent receives a task description inline and produces a single brief at the supplied output path; the brief's body sections must match the consumer-shaped format below.
- [ ] **Step 3: Write task and provenance blocks** — add a `## Task` section containing the placeholder `{TODO_BODY_OR_FREEFORM_TEXT}` (the orchestrator inlines the todo body or the freeform seed text here), and a `## Provenance` section with one `{SOURCE_PROVENANCE}` placeholder line (the orchestrator fills it with `Source: TODO-<id>` on the todo branch and leaves it empty on the freeform branch).
- [ ] **Step 4: Write working-directory and output blocks** — add `## Working Directory` containing the placeholder `{WORKING_DIR}` on its own line, and `## Output` containing four labeled lines: `Output path: {OUTPUT_PATH}`, `Generated at: {GENERATED_AT_ISO}`, `Git SHA: {GIT_HEAD_SHA}`, `Model: {MODEL_PROVIDER_AND_NAME}`. Add a paragraph below telling the agent these values must appear verbatim in the brief preamble (preamble keys in the order documented in `## Brief format` below).
- [ ] **Step 5: Write the three-pass procedure** — add `## Procedure` with three numbered subsections in this exact order: (1) `### Broad orientation pass` — one paragraph instructing the agent to map repo layout, package/module boundaries, likely entry points, test structure, and adjacent areas before any task-focused reads, so framing bias from the task wording does not anchor the deep dive; (2) `### Task-focused deep dive` — one paragraph instructing the agent to read files implicated by the task body, trace imports and call paths, and identify interfaces, types, registrations, dispatch sites, and tests; (3) `### Disconfirmation step` — one paragraph instructing the agent to explicitly check whether files named in the task body are incomplete or misleading, search for adjacent implementations and alternate call paths (registrations, generated artifacts, configured entry points), record contradictions between task framing and code reality, and surface plausible misses and confidence limits.
- [ ] **Step 6: State the process-vs-output contract** — immediately after the three-pass procedure, add a paragraph stating these three passes are agent process steps whose findings flow into the consumer-shaped output sections; the brief MUST NOT contain a per-pass section (no `## Summary`, `## Broad Orientation`, `## Precedents and Lessons`, or `## Confidence Notes`). Map each pass to the destination sections: broad orientation feeds Relevant Files / Patterns and Conventions / Risk Areas; task-focused deep dive feeds every code-map section; disconfirmation feeds Possible Misses (and Risk Areas when a flagged contradiction is itself a hazard).
- [ ] **Step 7: Write the brief format spec** — add `## Brief format`. State the brief is a markdown file at `{OUTPUT_PATH}`. Show the required preamble shape in a fenced block: H1 line `# Scout Brief: {TASK_TITLE}`, blank line, then preamble lines `Source: TODO-<id>` (only on the todo branch — omit entirely when `{SOURCE_PROVENANCE}` is empty), `Generated at: {GENERATED_AT_ISO}`, `Git SHA: {GIT_HEAD_SHA}`, `Model: {MODEL_PROVIDER_AND_NAME}` in that order. Enumerate the eight required level-2 sections in this exact order: `## Relevant Files`, `## Key Interfaces and Types`, `## Dependency / Call Graph`, `## Patterns and Conventions`, `## Existing Tests and Test Patterns`, `## Risk Areas`, `## Possible Misses`, `## Open Questions / Ambiguities`. State that empty sections are written as `_None._` rather than omitted, paths are relative to repo root unless absolute is genuinely required, full file contents are NOT inlined by default (use paths, line ranges, and short summaries; embed concrete snippets only for non-obvious conventions), and no per-pass audit sections are added (Summary, Broad Orientation, Precedents and Lessons, Confidence Notes are explicitly forbidden in the output).
- [ ] **Step 8: Write the completion-marker contract** — add a final `## Completion contract` heading. State that after the brief write succeeds, the agent's final assistant message MUST end with a single anchored line `BRIEF_WRITTEN: {OUTPUT_PATH}` on its own line as the very last line of output, with no surrounding backticks, no trailing commentary, and the path character-for-character identical to the supplied `{OUTPUT_PATH}`. The orchestrator parses this line to drive its review-and-commit gate; the file write tool result alone is insufficient.
- [ ] **Step 9: Self-review** — re-read the file. Confirm: (a) all eight placeholders (`{WORKING_DIR}`, `{TODO_BODY_OR_FREEFORM_TEXT}`, `{OUTPUT_PATH}`, `{GENERATED_AT_ISO}`, `{GIT_HEAD_SHA}`, `{MODEL_PROVIDER_AND_NAME}`, `{SOURCE_PROVENANCE}`, `{TASK_TITLE}`) appear at least once; (b) the three-pass procedure appears in the documented order; (c) all eight brief sections are listed in the documented order; (d) the four forbidden process-audit section names (Summary, Broad Orientation, Precedents and Lessons, Confidence Notes) are explicitly named as forbidden.

**Acceptance criteria:**

- The template contains all eight required placeholders.
  Verify: each of the literal strings `{WORKING_DIR}`, `{TODO_BODY_OR_FREEFORM_TEXT}`, `{OUTPUT_PATH}`, `{GENERATED_AT_ISO}`, `{GIT_HEAD_SHA}`, `{MODEL_PROVIDER_AND_NAME}`, `{SOURCE_PROVENANCE}`, `{TASK_TITLE}` returns at least one match when grepped against `agent/skills/scout/scout-prompt.md`.
- The three anti-bias passes appear in the documented order with their findings explicitly mapped to consumer-shaped sections.
  Verify: open `agent/skills/scout/scout-prompt.md` and confirm `### Broad orientation pass` appears before `### Task-focused deep dive`, which appears before `### Disconfirmation step`, all under a single `## Procedure` heading; and confirm a paragraph immediately after the three subsections names Relevant Files / Patterns and Conventions / Risk Areas (broad orientation), every code-map section (deep dive), and Possible Misses + Risk Areas (disconfirmation).
- The brief-format section enumerates the eight required output sections in order and explicitly forbids the four process-audit sections.
  Verify: `grep -n "^## " agent/skills/scout/scout-prompt.md` shows that within the `## Brief format` section the eight section names appear in this exact order: `## Relevant Files`, `## Key Interfaces and Types`, `## Dependency / Call Graph`, `## Patterns and Conventions`, `## Existing Tests and Test Patterns`, `## Risk Areas`, `## Possible Misses`, `## Open Questions / Ambiguities`; and `grep -n` for each of `Summary`, `Broad Orientation`, `Precedents and Lessons`, `Confidence Notes` finds them named as forbidden output sections (not as procedural step labels).
- The completion-contract section names the `BRIEF_WRITTEN:` marker with the exact format requirements.
  Verify: open `agent/skills/scout/scout-prompt.md` and confirm the `## Completion contract` section requires a final assistant message ending with `BRIEF_WRITTEN: {OUTPUT_PATH}` on its own line as the very last line, with no surrounding backticks and no trailing commentary on the same line.

**Model recommendation:** standard

### Task 3: Create the scout SKILL.md orchestrator

**Files:**
- Create: `agent/skills/scout/SKILL.md`

**Steps:**
- [ ] **Step 1: Read sibling skills for shape** — open `agent/skills/generate-plan/SKILL.md` and `agent/skills/define-spec/SKILL.md` to confirm conventions: YAML frontmatter with `name:` and `description:`, level-2 step headings, model-tier-resolution citation pattern, dispatch block format.
- [ ] **Step 2: Write frontmatter** — file begins with `---` as line 1 (no preceding content, no BOM). Frontmatter: `name: scout`, `description: "Non-interactive task-scoped codebase reconnaissance. Dispatches the scout subagent to write a structured brief to docs/briefs/, then gates the resulting file on user review and commit."` Close with `---`.
- [ ] **Step 3: Write the introduction** — after frontmatter, add `# Scout` and a short paragraph: this skill orchestrates a fresh-context scout subagent that writes a structured brief to `docs/briefs/`. The brief slots into the existing `Scout brief:` provenance contract that `define-spec`, `generate-plan`, `planner`, and `plan-reviewer` already consume.
- [ ] **Step 4: Write Step 1 — Detect input shape and parse `--tier`** — under a `## Step 1: Detect input shape and parse --tier` heading, document: input shape detection by pattern (todo ID matching `^TODO-([0-9a-f]{8})$` exactly, freeform otherwise); on the todo branch, derive `<raw-id>` from the captured group, set the brief output path to `docs/briefs/TODO-<raw-id>-brief.md`, and read `docs/todos/<raw-id>.md` to extract title and full body; on the freeform branch, derive a kebab-case slug from the seed text, set the output path to `docs/briefs/<YYYY-MM-DD>-<slug>-brief.md` using today's date in UTC, and use the seed text as the task body. Document the optional `--tier <name>` argument (recognized at any position in the slash-command input, value ∈ `cheap`, `standard`, `capable`); default tier is `standard` when the argument is missing or empty.
- [ ] **Step 5: Write Step 2 — Resolve model and CLI** — under `## Step 2: Resolve model and CLI`, instruct the orchestrator to follow the canonical procedure in `agent/skills/_shared/model-tier-resolution.md` with `<agent> = scout` and `<tier> = <selected tier from Step 1>`. State that on any of the four documented failure conditions (missing/unreadable file, missing/empty selected tier, missing dispatch map, missing/empty `dispatch.<provider>`) the skill emits the corresponding canonical Template (1)–(4) byte-equal with the supplied parameters and stops. Forbid silent fallback to `pi` or any other CLI default.
- [ ] **Step 6: Write Step 3 — Pre-existing-brief check** — under `## Step 3: Pre-existing-brief check`, document that before dispatch the skill checks whether the target brief path exists. When it does: read the existing brief's `Git SHA: <sha>` preamble line via a bounded read (e.g., `head -n 8 <path>`), compute the current repo HEAD SHA, and choose the prompt by branch (todo vs freeform) and SHA equality vs HEAD. Write the four exact prompt variants in a four-row table — one per (branch, SHA-equal-or-not) cell — using the literal text from the spec ("A brief for TODO-<id> already exists at <path> at the current HEAD SHA. (o)verwrite or (k)eep?", and the three corresponding variants). State that on a missing/malformed SHA line the skill treats the brief as stale and renders `<brief-sha>` as `(unreadable)`. On `o`/`overwrite`: dispatch normally; the agent overwrites the file at the same path; the commit gate's review-only `(r) Re-run` semantics still apply on the next gate. On `k`/`keep`: on the todo branch report the existing path and offer the continuation `Run /define-spec TODO-<id> next? (y/n)`, do NOT dispatch; on the freeform branch report the existing path and stop with no continuation offer.
- [ ] **Step 7: Write Step 4 — Fill the prompt template** — under `## Step 4: Fill the prompt template`, instruct: read `agent/skills/scout/scout-prompt.md` and substitute every placeholder. `{WORKING_DIR}` ← absolute cwd; `{TODO_BODY_OR_FREEFORM_TEXT}` ← inlined todo body on the todo branch or the freeform seed text on the freeform branch; `{OUTPUT_PATH}` ← absolute path of the target brief file; `{GENERATED_AT_ISO}` ← current UTC time formatted as ISO 8601 (e.g., `2026-05-06T12:34:56Z`); `{GIT_HEAD_SHA}` ← `git rev-parse HEAD` (40-char SHA); `{MODEL_PROVIDER_AND_NAME}` ← the `<provider>/<model>` string resolved in Step 2; `{SOURCE_PROVENANCE}` ← the literal line `Source: TODO-<raw-id>` on the todo branch, empty string on the freeform branch; `{TASK_TITLE}` ← the todo title on the todo branch, a short title derived from the seed text on the freeform branch.
- [ ] **Step 8: Write Step 5 — Dispatch via `subagent_run_serial`** — under `## Step 5: Dispatch via subagent_run_serial`, document the dispatch shape with `wait: true` as a top-level orchestration option (not a per-task field): `subagent_run_serial { tasks: [ { name: "scout", agent: "scout", task: "<filled scout-prompt.md body>", model: "<resolved model from Step 2>", cli: "<resolved cli from Step 2>" } ], wait: true }`. State the orchestrator does NOT pass a `skills:` parameter and does NOT inline the brief body into its own context after dispatch.
- [ ] **Step 9: Write Step 6 — Validate completion** — under `## Step 6: Validate completion`, document the strict three-part validation on `results[0]`: (a) `exitCode == 0`; (b) `finalMessage` ends with an anchored line `BRIEF_WRITTEN: <absolute path>` (no backticks, no trailing commentary on that line) where `<absolute path>` is character-for-character identical to the supplied output path; (c) the file at that path exists on disk and is non-empty. On any validation failure, surface the failure verbatim with `transcriptPath` (when available) and stop; the skill does NOT auto-retry. State that on `subagent_run_serial` being unavailable in the session, the skill stops with an explicit error and does NOT fall back to inline reconnaissance.
- [ ] **Step 10: Write Step 7 — Commit gate** — under `## Step 7: Commit gate`, document the user-review pause. Surface to the user verbatim: `Brief written to <path>. Review it, then choose:` followed by the three options `(c) Commit — commit the brief to git.`, `(r) Re-run — dispatch scout again with the same input; the agent overwrites the same path.`, `(x) Stop — leave <path> uncommitted on disk for manual editing and committing later.` Behaviors: on `c`/`commit`/`yes`, invoke the `commit` skill with the exact brief path explicitly so only the brief file is committed; on commit-skill failure, report the error verbatim and stop without auto-retry. On `r`/`re-run`, re-run from Step 5 (skipping the Step 3 pre-existing-brief check — `r` is an explicit overwrite). On `x`/`stop`, emit `Leaving <path> uncommitted.` and stop. State that the orchestrator does NOT read the brief into its own context — the user reads it directly.
- [ ] **Step 11: Write Step 8 — Continuation offer** — under `## Step 8: Continuation offer`, state that after a successful commit on the todo branch only, offer `Run /define-spec TODO-<id> next? (y/n)`. On `y`, invoke `/define-spec TODO-<id>`. On `n`, stop. The freeform branch does NOT offer continuation (no todo to hand off).
- [ ] **Step 12: Write the Edge cases section** — under `## Edge cases`, document: missing `model-tiers.json` or any of the four resolution failures emit Template (1)–(4) byte-equal and stop; `subagent_run_serial` unavailable stops with an explicit error and no inline fallback; `commit` skill failure surfaces the error verbatim and stops without auto-retry; agent dispatch returns a path different from the supplied `{OUTPUT_PATH}` is treated as validation failure (no path normalization); brief file exists but is empty after dispatch is a validation failure; user types neither `o` nor `k` at the pre-existing-brief prompt or neither `c`, `r`, nor `x` at the commit gate is an unrecognized response — re-prompt once, then stop on a second unrecognized response.
- [ ] **Step 13: Self-review** — re-read the file. Confirm step headings appear in order Step 1 → Step 8 plus `## Edge cases`; the four canonical model-tier failure templates are referenced (not inlined); the three-part validation in Step 6 names exit code, anchored marker, and on-disk existence/non-emptiness in that order; the commit-gate options use the literal `(c) Commit / (r) Re-run / (x) Stop` text; the continuation offer is gated on `successful commit AND todo branch`.

**Acceptance criteria:**

- The skill begins with the YAML frontmatter `name: scout` and includes a description that mentions reconnaissance and brief output.
  Verify: `head -1 agent/skills/scout/SKILL.md` outputs exactly `---`, and `head -n 5 agent/skills/scout/SKILL.md` shows `name: scout` and a `description:` line whose value contains the substring `reconnaissance` (case-insensitive).
- Eight numbered step headings appear in order, plus the Edge cases section.
  Verify: `grep -n "^## " agent/skills/scout/SKILL.md` lists, in this exact order, headings beginning `## Step 1: Detect input shape`, `## Step 2: Resolve model and CLI`, `## Step 3: Pre-existing-brief check`, `## Step 4: Fill the prompt template`, `## Step 5: Dispatch via subagent_run_serial`, `## Step 6: Validate completion`, `## Step 7: Commit gate`, `## Step 8: Continuation offer`, `## Edge cases`.
- Step 1 documents both input shapes and the optional `--tier` argument with the documented default.
  Verify: open `agent/skills/scout/SKILL.md` and confirm Step 1 names the regex `^TODO-([0-9a-f]{8})$` for todo detection, the `docs/briefs/TODO-<raw-id>-brief.md` and `docs/briefs/<YYYY-MM-DD>-<slug>-brief.md` output paths for the two branches respectively, and an optional `--tier <name>` argument with values `cheap` / `standard` / `capable` and a default of `standard` when the argument is missing.
- Step 2 cites the canonical model-tier resolution procedure and forbids silent fallback.
  Verify: open `agent/skills/scout/SKILL.md` and confirm Step 2 references `agent/skills/_shared/model-tier-resolution.md` with `<agent> = scout` and the selected tier as `<tier>`, names Templates (1)–(4) by number or by the canonical wording, and includes a sentence forbidding silent fallback to `pi` or any other CLI default.
- Step 3 specifies the four prompt variants and the keep/overwrite behaviors per branch.
  Verify: open `agent/skills/scout/SKILL.md` and confirm Step 3 contains the literal substring `(o)verwrite or (k)eep?` and includes both the todo-branch and freeform-branch wording, with the SHA-mismatch variant rendering `<brief-sha>` as `(unreadable)` when the brief's SHA preamble is missing/malformed; and confirm the `keep` behavior offers a continuation prompt only on the todo branch.
- Step 5 dispatches via `subagent_run_serial { wait: true }` with a documented task shape.
  Verify: open `agent/skills/scout/SKILL.md` and confirm Step 5 contains a fenced or inline block showing `subagent_run_serial { tasks: [ { name: "scout", agent: "scout", ...` with `wait: true` as a top-level orchestration option.
- Step 6 validates `exitCode == 0`, the anchored `BRIEF_WRITTEN:` marker, and on-disk existence/non-emptiness, and forbids inline-fallback when `subagent_run_serial` is unavailable.
  Verify: open `agent/skills/scout/SKILL.md` and confirm Step 6 names all three checks in order and contains a sentence stating the skill stops with an explicit error and does NOT fall back to inline reconnaissance when `subagent_run_serial` is unavailable.
- Step 7 documents the `(c) Commit / (r) Re-run / (x) Stop` review gate with the documented behaviors.
  Verify: `grep -n "(c) Commit\|(r) Re-run\|(x) Stop" agent/skills/scout/SKILL.md` returns matches for all three option labels inside the Step 7 block.
- Step 8 gates the `/define-spec TODO-<id>` continuation on `successful commit AND todo branch`.
  Verify: open `agent/skills/scout/SKILL.md` and confirm Step 8 contains the literal substring `Run /define-spec TODO-<id> next? (y/n)` and explicitly states the freeform branch does not offer continuation.

**Model recommendation:** standard

### Task 4: Create the scout README

**Files:**
- Create: `agent/skills/scout/README.md`

**Steps:**
- [ ] **Step 1: Read sibling READMEs for shape** — open `agent/skills/define-spec/README.md` and `agent/skills/generate-plan/README.md` to confirm structure (H1 title, "Role in the workflow" section, "Inputs" or similar, "Workflow" steps, "Files" footer).
- [ ] **Step 2: Write title and role** — start with `# Scout skill`. Add a short paragraph: optional non-interactive task-scoped codebase reconnaissance that runs before mandatory `define-spec` and writes a structured brief to `docs/briefs/`.
- [ ] **Step 3: Write Role in the workflow** — under `## Role in the workflow`, describe how scout sits between "Refine todo" and "Define spec" in the workflow diagram, runs only when the user invokes `/scout` explicitly, and produces a brief that downstream consumers (`define-spec`, `generate-plan`, `planner`, `plan-reviewer`) read from disk via the existing `Scout brief: docs/briefs/<filename>` provenance line.
- [ ] **Step 4: Write Input shapes** — under `## Input shapes`, list the two shapes: todo ID (`TODO-<8-hex>`) — output path `docs/briefs/TODO-<id>-brief.md`, brief preamble carries `Source: TODO-<id>`; freeform text — output path `docs/briefs/<YYYY-MM-DD>-<slug>-brief.md`, no `Source:` preamble (because `define-spec` does not auto-discover freeform briefs).
- [ ] **Step 5: Write Dispatch behavior** — under `## Dispatch behavior`, describe synchronous dispatch via `subagent_run_serial { wait: true }`, model-tier default `standard`, optional `--tier <cheap|standard|capable>` argument, the three-pass agent process (broad orientation, task-focused deep dive, disconfirmation) whose findings flow into the consumer-shaped brief sections, and the `BRIEF_WRITTEN: <absolute path>` completion marker the orchestrator validates.
- [ ] **Step 6: Write Brief format** — under `## Brief format`, list the preamble fields (`Source: TODO-<id>` only on the todo branch, then `Generated at:`, `Git SHA:`, `Model:` always) and the eight required level-2 sections in the documented order. State that empty sections render as `_None._` and that no per-pass audit sections (Summary, Broad Orientation, Precedents and Lessons, Confidence Notes) appear in the output.
- [ ] **Step 7: Write Pre-existing-brief behavior** — under `## Pre-existing-brief behavior`, describe the SHA-aware overwrite-or-keep prompt, the four prompt variants (todo vs freeform × SHA-equal vs SHA-mismatch), and the keep-branch outcomes (todo branch reports the path and offers the continuation prompt; freeform branch reports and stops).
- [ ] **Step 8: Write Commit gate and continuation** — under `## Commit gate and continuation`, describe the `(c) Commit / (r) Re-run / (x) Stop` review gate (mirrors `define-spec`'s gate); the orchestrator does not read the brief into its own context — the user reads it directly. After a successful commit on the todo branch, offer `Run /define-spec TODO-<id> next? (y/n)`. The freeform branch does not offer continuation.
- [ ] **Step 9: Write Token-cost rationale pointer** — under `## Why this exists`, add a short paragraph noting that fresh-context isolation is the load-bearing rationale: the orchestrator never absorbs reconnaissance reads, so the planner that ultimately consumes the brief through path-based handoff is genuinely shorter on input tokens than a planner that does broad discovery itself. Reference `docs/todos/bbe89373.md` for the token-cost comparison table.
- [ ] **Step 10: Write Files footer** — under `## Files`, list the three files in the skill: `SKILL.md` — orchestrator: input-shape detection, dispatch, validation, commit gate, continuation offer; `scout-prompt.md` — per-dispatch prompt template with placeholders for working dir, task body, output path, timestamp, git SHA, model, source provenance, and task title; `README.md` — this file.
- [ ] **Step 11: Self-review** — re-read the file. Confirm all eight required brief sections are listed in the documented order; the pre-existing-brief, commit-gate, and continuation behaviors are described per branch; and the token-cost rationale points at `docs/todos/bbe89373.md`.

**Acceptance criteria:**

- The README documents the two input shapes with their respective output paths and preamble rules.
  Verify: open `agent/skills/scout/README.md` and confirm `## Input shapes` names `docs/briefs/TODO-<id>-brief.md` for the todo branch and `docs/briefs/<YYYY-MM-DD>-<slug>-brief.md` for the freeform branch, and explicitly states the freeform branch omits `Source:` from the preamble.
- The README lists all eight required brief sections in the documented order.
  Verify: open `agent/skills/scout/README.md` and confirm the `## Brief format` section enumerates `## Relevant Files`, `## Key Interfaces and Types`, `## Dependency / Call Graph`, `## Patterns and Conventions`, `## Existing Tests and Test Patterns`, `## Risk Areas`, `## Possible Misses`, `## Open Questions / Ambiguities` in that order, and explicitly states empty sections render as `_None._`.
- The README describes the `(c) Commit / (r) Re-run / (x) Stop` gate and the todo-branch-only continuation offer.
  Verify: `grep -n "(c) Commit\|(r) Re-run\|(x) Stop\|Run /define-spec" agent/skills/scout/README.md` returns matches for all four anchor strings.

**Model recommendation:** cheap

### Task 5: Update define-spec procedure to consume Open Questions

**Files:**
- Modify: `agent/skills/define-spec/procedure.md`

**Steps:**
- [ ] **Step 1: Read the existing procedure** — open `agent/skills/define-spec/procedure.md` and locate Step 2 (`## Step 2: Codebase survey`) and Step 4 (`## Step 4: Intent Q&A`). Note the existing instructions: Step 2 already says "On the **todo** branch, use the scout brief (if loaded) as foundation. Read additional files only where the brief points at something worth examining more closely."; Step 4 says "Ground each question and recommendation in what you learned from the codebase and (if loaded) the scout brief."
- [ ] **Step 2: Add the Open-Questions instruction at the end of Step 2** — directly under the existing "On the **todo** branch..." bullet inside Step 2, append a new sentence (or short paragraph) reading: "When the loaded scout brief contains entries under `## Open Questions / Ambiguities`, treat each entry as a candidate question to resolve with the user during the Step 4 intent Q&A. The spec-designer judges which questions remain load-bearing and asks them under the existing Interaction conventions (recommend with each, one question per turn). Questions the brief surfaces but the spec-designer judges off-scope or already-resolved by the codebase survey may be dropped without asking."
- [ ] **Step 3: Self-review** — re-read Step 2. Confirm the addition cites `## Open Questions / Ambiguities` by exact section name, points at Step 4's intent Q&A, names the existing Interaction conventions (recommend-with-each, one-question-per-turn), and gives the spec-designer explicit license to drop questions the codebase survey already answers. Confirm no other steps were changed.

**Acceptance criteria:**

- Step 2 instructs the spec-designer to treat the brief's `## Open Questions / Ambiguities` entries as candidate Step 4 Q&A questions under the existing Interaction conventions.
  Verify: open `agent/skills/define-spec/procedure.md` and confirm the body of `## Step 2: Codebase survey` contains a sentence naming `## Open Questions / Ambiguities` and pointing at `Step 4` (or `Step 4 intent Q&A`) with a reference to the existing Interaction conventions.
- No other procedure step was modified.
  Verify: `git diff agent/skills/define-spec/procedure.md` shows changes only inside the `## Step 2: Codebase survey` section (no edits to Steps 1, 3, 4, 5, 6, 7, 8, or 9).

**Model recommendation:** cheap

### Task 6: Add brief staleness check to generate-plan Step 1b

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`

**Steps:**
- [ ] **Step 1: Read the existing Step 1b** — open `agent/skills/generate-plan/SKILL.md` and locate the `### 1b. File path (spec, RFC, design doc, etc.)` section. Note the existing scout-brief extraction logic: "`Scout brief: docs/briefs/<filename>` → set `{SCOUT_BRIEF}` to `Scout brief: docs/briefs/<filename>`, **then verify the referenced file exists on disk**: ...".
- [ ] **Step 2: Locate the on-disk verification bullet** — find the bullet beginning "If the brief file does not exist, warn the user (`Scout brief referenced in spec not found at <path> — proceeding without it.`), leave `{SCOUT_BRIEF}` empty, and continue without failing." and the **Do NOT read the brief contents into the orchestrator prompt.** sentence after it.
- [ ] **Step 3: Insert the staleness-check sub-bullets** — after the "Do NOT read the brief contents..." sentence and before the next top-level `Source:` rule, add a new sub-bullet block titled `Staleness check (informational only):` containing three sub-sub-bullets: (a) "When the brief file exists, perform a bounded preamble read of its first ~8 lines (e.g., `head -n 8 <path>`) and extract its `Git SHA: <sha>` line."; (b) "If the brief SHA differs from the current repo HEAD SHA (`git rev-parse HEAD`), emit one warning to the user verbatim: `Scout brief at <path> was generated at SHA <brief-sha>; HEAD is now <head-sha>. Treating as potentially stale; planning will continue. Re-run /scout TODO-<id> if you want a fresh brief.` Continue planning with the brief — do NOT block."; (c) "If the SHA line is missing, malformed, or unreadable, emit a softer warning verbatim: `Scout brief at <path> has unreadable Git SHA preamble — continuing without staleness signal.` Continue planning."
- [ ] **Step 4: Verify staleness check does NOT change the existing on-disk-existence semantics** — re-read Step 1b end-to-end and confirm the existing "missing brief" behavior (warn, leave `{SCOUT_BRIEF}` empty, continue) is unchanged, the "brief contents not inlined into orchestrator" rule is unchanged, and the new staleness check fires only when the file exists. Confirm planning is never blocked on staleness.
- [ ] **Step 5: Self-review** — re-read Step 1b. Confirm the new sub-bullets sit under the existing on-disk verification block, both warning strings are written verbatim (no abbreviation), the staleness check is informational-only, and no other step was modified.

**Acceptance criteria:**

- Step 1b adds an informational SHA staleness check that fires only when the brief exists on disk.
  Verify: open `agent/skills/generate-plan/SKILL.md` and confirm Step 1b contains a sub-block describing a bounded `head -n 8 <path>` preamble read of the brief's `Git SHA:` line, conditioned on the brief existing on disk.
- The mismatch warning text is the literal spec wording.
  Verify: `grep -n "Scout brief at .* was generated at SHA .*; HEAD is now .* Treating as potentially stale; planning will continue. Re-run /scout TODO-<id> if you want a fresh brief." agent/skills/generate-plan/SKILL.md` returns at least one match (with backticks/code-fence formatting allowed around the literal placeholders `<path>`, `<brief-sha>`, `<head-sha>`).
- The unreadable-preamble soft warning is also the literal spec wording.
  Verify: `grep -n "Scout brief at .* has unreadable Git SHA preamble — continuing without staleness signal." agent/skills/generate-plan/SKILL.md` returns at least one match.
- Planning is not blocked on staleness.
  Verify: open `agent/skills/generate-plan/SKILL.md` and confirm the staleness sub-block contains the explicit phrase `do NOT block` (case-insensitive) or equivalent prose stating planning continues regardless of SHA mismatch or unreadable preamble.

**Model recommendation:** cheap

### Task 7: Add brief-coverage check to plan-reviewer agent

**Files:**
- Modify: `agent/agents/plan-reviewer.md`

**Steps:**
- [ ] **Step 1: Read the existing plan-reviewer body** — open `agent/agents/plan-reviewer.md`. Note the existing structure: frontmatter, identity intro, Input Contract (with `Scout brief: docs/briefs/<filename>` already named as optional), Principles, Rules, Approach honoring, Output Artifact Contract.
- [ ] **Step 2: Add a Brief coverage section** — between `## Approach honoring` and `## Output Artifact Contract`, insert a new `## Brief coverage` section. State the rule: when a `Scout brief: docs/briefs/<filename>` line is in the plan provenance AND the brief file exists on disk, the reviewer reads the brief in full and checks the plan against three brief sections: `## Risk Areas`, `## Existing Tests and Test Patterns`, and `## Patterns and Conventions`. When a `Scout brief:` line is absent OR the brief file is missing on disk, the brief-coverage check is skipped — preserve all existing review behavior.
- [ ] **Step 3: Document severity calibration for brief findings** — under the same `## Brief coverage` section, add a bulleted severity guide: **Critical** — the plan ignores a brief-surfaced constraint that would cause execution to break (e.g., the brief flags a registration site the plan does not touch but must); **Important** — the plan does not acknowledge or mitigate a significant brief-surfaced risk area; the plan's testing approach contradicts patterns observed in the brief; the plan's structural choices contradict naming or organization conventions surfaced by the brief; **Minor** — low-impact polish gaps relative to brief findings.
- [ ] **Step 4: State integration with existing finding format** — add a final paragraph stating brief-coverage findings are reported in the same Critical / Important / Minor finding format under the existing `### Issues` H4 sub-headings, using the unchanged verdict semantics (`Approved` / `Approved with concerns` / `Not approved`) and the unchanged `### Outcome` / `### Strengths` / `### Issues` / `### Recommendations` body shape. Cite the task number and the brief section that surfaced the gap (e.g., "Task 4 ignores Risk Areas bullet 2").
- [ ] **Step 5: Self-review** — re-read the new section. Confirm the firing condition is correctly gated on `Scout brief:` provenance AND on-disk existence; the three brief sections are named exactly (`## Risk Areas`, `## Existing Tests and Test Patterns`, `## Patterns and Conventions`); severity definitions are in place; integration with the existing severity vocabulary and body shape is preserved. Confirm no other section was modified.

**Acceptance criteria:**

- A new `## Brief coverage` section sits between `## Approach honoring` and `## Output Artifact Contract`.
  Verify: `grep -n "^## " agent/agents/plan-reviewer.md` shows `## Brief coverage` appearing in the heading sequence between `## Approach honoring` and `## Output Artifact Contract`.
- The check fires only when both conditions hold (brief provenance present AND file exists on disk).
  Verify: open `agent/agents/plan-reviewer.md` and confirm `## Brief coverage` contains explicit prose stating the check fires only when a `Scout brief:` line is in plan provenance AND the brief file exists on disk; otherwise it is skipped.
- The reviewer is told to read the brief and check the plan against the three named brief sections.
  Verify: `grep -n "## Risk Areas\|## Existing Tests and Test Patterns\|## Patterns and Conventions" agent/agents/plan-reviewer.md` shows each of the three section names appears at least once inside the `## Brief coverage` block.
- Findings integrate with the existing severity vocabulary and `### Issues` H4 sub-headings.
  Verify: open `agent/agents/plan-reviewer.md` and confirm the `## Brief coverage` block names Critical / Important / Minor severities and explicitly references the existing `### Issues` H4 sub-headings (or the equivalent unchanged verdict-and-body-shape contract).

**Model recommendation:** standard

### Task 8: Mirror brief-coverage check in review-plan-prompt

**Files:**
- Modify: `agent/skills/generate-plan/review-plan-prompt.md`

**Steps:**
- [ ] **Step 1: Read the existing review prompt** — open `agent/skills/generate-plan/review-plan-prompt.md`. Note the structure: header / Provenance / Original Spec / Structural-Only Mode / Artifact Reading Contract / Review Checklist / Calibration / Output Format / Output Artifact Contract / Critical Rules.
- [ ] **Step 2: Locate the Review Checklist sub-section to extend** — find the `## Review Checklist` heading. Note the existing sub-sections: **Spec/Todo Coverage**, **Re-review compatibility**, **Dependency Accuracy**, **Task Sizing**, **Cross-Task Consistency**, **Acceptance Criteria Quality**, **Verify-Recipe Enforcement (blocking)**, **Buildability**, **Constraint Documentation**, **Placeholder Content**.
- [ ] **Step 3: Insert a new Brief Coverage sub-section** — between **Constraint Documentation** and **Placeholder Content**, add a new bolded sub-section header `**Brief Coverage:**`. Body bullets: "If a `Scout brief: docs/briefs/<filename>` line is in `## Provenance` AND the brief file exists on disk, read the brief in full and check the plan against the brief's `## Risk Areas`, `## Existing Tests and Test Patterns`, and `## Patterns and Conventions` sections."; "If neither condition holds (no `Scout brief:` line, or the file is missing on disk), skip this check entirely. Do NOT report a finding for the absence of a brief — preserve current review behavior when no brief is present."; "Cite the task number and the brief section when flagging a gap (e.g., `Task 4 ignores Risk Areas bullet 2`)."
- [ ] **Step 4: Add severity calibration sub-bullets** — under the same `**Brief Coverage:**` block, add three calibration bullets: "**Critical** — the plan ignores a brief-surfaced constraint that would cause execution to break (e.g., a registration site the brief flags but the plan does not touch).", "**Important** — the plan does not acknowledge or mitigate a significant brief-surfaced risk area; the plan's testing approach contradicts patterns observed in the brief; the plan's structural choices contradict naming or organization conventions surfaced by the brief.", "**Minor** — low-impact polish gaps relative to brief findings."
- [ ] **Step 5: Confirm severity-vocabulary consistency** — re-read the existing `## Calibration` section and the `### Issues` block in the `## Output Format` section. Confirm the new bullets do NOT introduce a new severity name, do NOT change the verdict semantics (`Approved` / `Approved with concerns` / `Not approved`), and do NOT alter the `### Issues` H4 sub-headings. The new bullets use the same Critical / Important / Minor labels and the existing finding shape.
- [ ] **Step 6: Self-review** — re-read the file. Confirm the new sub-section sits between `**Constraint Documentation:**` and `**Placeholder Content:**`, the firing condition is correctly gated, all three brief sections are named, and the severity guide aligns with the unified vocabulary.

**Acceptance criteria:**

- A new `**Brief Coverage:**` sub-section sits inside the `## Review Checklist`, between `**Constraint Documentation:**` and `**Placeholder Content:**`.
  Verify: open `agent/skills/generate-plan/review-plan-prompt.md` and confirm the `## Review Checklist` section contains a `**Brief Coverage:**` bolded sub-section header positioned between `**Constraint Documentation:**` and `**Placeholder Content:**`.
- The sub-section names the three brief sections to check and gates the check on provenance + file existence.
  Verify: `grep -n "## Risk Areas\|## Existing Tests and Test Patterns\|## Patterns and Conventions\|Scout brief:" agent/skills/generate-plan/review-plan-prompt.md` shows each of the three brief section names at least once inside the `**Brief Coverage:**` block, and the firing-condition prose explicitly conditions on both `Scout brief:` provenance presence and on-disk file existence.
- The severity calibration uses the unified Critical / Important / Minor vocabulary with the documented Critical reservation.
  Verify: open `agent/skills/generate-plan/review-plan-prompt.md` and confirm the `**Brief Coverage:**` block contains three severity bullets labelled Critical / Important / Minor, with Critical described as "ignoring this would break execution" or equivalent wording matching the spec.

**Model recommendation:** standard

### Task 9: Add brief-deviation rule to planner agent

**Files:**
- Modify: `agent/agents/planner.md`

**Steps:**
- [ ] **Step 1: Read the existing Approach handling section** — open `agent/agents/planner.md`. Locate the `## Approach handling` section. Note the existing rule for spec-Approach deviation: "if your codebase analysis surfaces a reason the chosen approach will not work (e.g. it conflicts with an interface the spec did not surface), record the deviation as an entry under `## Risk Assessment` with a clear "spec said X; plan does Y because <reason>" justification." Note also the closing sentence: "This rule applies on **both** the initial generation pass and the edit pass (`generate-plan` Step 4.3). The edit pass dispatches the same planner agent, so the rule is inherited automatically."
- [ ] **Step 2: Add a Brief handling section after Approach handling** — insert a new `## Brief handling` section immediately after the `## Approach handling` section. Open with: "When a `Scout brief: docs/briefs/<filename>` line is present in your task prompt's `## Provenance` block and the brief file exists on disk, you MUST read the brief in full from disk before planning (this rule is already documented in the file-based input contract). Use the brief as orientation: it surfaces relevant files, key interfaces, dependency / call graph, patterns and conventions, existing tests, and risk areas. Still verify task-critical files yourself by reading them directly — the brief is a starting point, not a replacement for your own analysis."
- [ ] **Step 3: Document the deviation rule** — add a paragraph: "If your codebase analysis surfaces a reason to deviate from a brief recommendation under `## Patterns and Conventions` or `## Risk Areas` (for example, the brief identifies a pattern that has since been refactored, or a risk area that no longer applies), record the deviation as an entry under the plan's `## Risk Assessment` section using the format `Brief said X; plan does Y because <reason>`. Do not silently override the brief's findings."
- [ ] **Step 4: Document the edit-pass inheritance** — add a final sentence: "This rule applies on **both** the initial generation pass and the surgical edit pass. The edit pass dispatches the same planner agent, so the rule is inherited automatically."
- [ ] **Step 5: Self-review** — re-read the new section. Confirm: (a) it mirrors the structure of the existing `## Approach handling` deviation rule (orientation paragraph, deviation rule with `Brief said X; plan does Y because <reason>` format, edit-pass-inheritance closing); (b) the two named brief sections are exactly `## Patterns and Conventions` and `## Risk Areas`; (c) the deviation goes into the plan's `## Risk Assessment` section; (d) no other section of `planner.md` was changed.

**Acceptance criteria:**

- A new `## Brief handling` section sits immediately after `## Approach handling` in `agent/agents/planner.md`.
  Verify: `grep -n "^## " agent/agents/planner.md` shows `## Brief handling` appearing in the heading sequence directly after `## Approach handling` and before the next existing top-level heading.
- The section names exactly the two brief sections under which deviation is regulated and uses the literal deviation-record format.
  Verify: `grep -n "## Patterns and Conventions\|## Risk Areas\|Brief said X; plan does Y because" agent/agents/planner.md` returns matches for all three substrings inside the `## Brief handling` block.
- The deviation is recorded in the plan's `## Risk Assessment`.
  Verify: open `agent/agents/planner.md` and confirm the `## Brief handling` block explicitly says deviations are recorded under the plan's `## Risk Assessment` section.
- The rule is documented as applying on both initial generation and edit passes.
  Verify: open `agent/agents/planner.md` and confirm the `## Brief handling` block contains a sentence stating the rule applies on both the initial generation pass and the surgical edit pass, mirroring the existing `## Approach handling` closing sentence.

**Model recommendation:** standard

### Task 10: Add scout to top-level README

**Files:**
- Modify: `README.md`

**Steps:**
- [ ] **Step 1: Read the existing README** — open `README.md`. Locate three sections: the workflow diagram (the ASCII pipeline starting `┌─────────────┐   ┌──────────────┐` around the "Typical workflow" block), the "How it works in practice" subsection (numbered list 1–8 starting at "Create & refine a todo"), and the Skills table (`| Skill | Summary |` rows).
- [ ] **Step 2: Insert scout into the workflow diagram** — modify the diagram between `Refine todo` and `Define spec`. Add an arrow-and-box pair for `Scout` annotated `(optional)`, matching the styling convention already used by the existing `(optional)` annotation under `Define spec`. The resulting top row should read, in order: `Create todo → Refine todo → Scout (optional) → Define spec → Generate plan → Refine plan`. Scout is the only stage being added or relabeled by this change; **leave the existing `(optional)` annotation under `Define spec` exactly as it currently appears in the diagram**. That existing annotation covers the no-scout path (todo → generate-plan without an intermediate spec). When scout has produced a brief, define-spec is the mandatory next stage because there is no direct brief→plan dispatch path — but encoding that nuance is the job of the "How it works in practice" prose in Step 3, not the diagram. Do not add new `(optional)` annotations to any other stage. Make sure the diagram still renders as a valid pre-formatted code block (use the same characters and box widths as adjacent boxes; do not introduce non-ASCII Unicode beyond what the file already contains).
- [ ] **Step 3: Add a "Scout (optional)" subsection in "How it works in practice"** — insert a new numbered item between the existing item 1 ("Create & refine a todo.") and the existing item titled "Define a spec (optional).", making it the new item 2 and renumbering subsequent items. Body: "**Run scout (optional).** The `scout` skill takes a todo or freeform task and dispatches a non-interactive `scout` subagent into a fresh context. The agent performs a broad orientation pass, a task-focused deep dive, and a disconfirmation pass, then writes a structured brief to `docs/briefs/TODO-<id>-brief.md` (todo branch) or `docs/briefs/<YYYY-MM-DD>-<slug>-brief.md` (freeform branch). The orchestrator never reads the brief into its own context — the user reviews it directly between dispatch and commit. Downstream consumers (`define-spec`, `generate-plan`, `planner`, `plan-reviewer`) read the brief from disk through the existing `Scout brief: docs/briefs/<filename>` provenance line, skipping broad exploratory reads. **When scout has produced a brief, the next stage in the pipeline is `define-spec` — it is mandatory in this scout-to-planning path because there is no direct brief→plan dispatch.** The existing `(optional)` label on the next item (`Define a spec`) covers only the no-scout path, where you may go directly from todo to `generate-plan`; the brief never reaches the planner without flowing through `define-spec`'s auto-discovery and the resulting `Scout brief:` provenance line on the spec."
- [ ] **Step 4: Renumber subsequent how-it-works items** — items 2–8 in the existing list become items 3–9. Confirm internal references (if any) still match. Do not edit body text other than the leading number.
- [ ] **Step 5: Add the scout row to the Skills table** — in the `## Skills` table, insert a new row between the existing rows for `define-spec` and `generate-plan` (keep alphabetical-by-position-in-workflow ordering — scout precedes define-spec because it runs first; place the new row immediately above `define-spec`). Row content: `| [\`scout\`](agent/skills/scout/README.md) | Optional non-interactive task-scoped reconnaissance. Dispatches the \`scout\` subagent and writes a structured brief to \`docs/briefs/\` that downstream stages read via the \`Scout brief:\` provenance line. |`
- [ ] **Step 6: Add scout to the artifacts list (if present)** — locate the bullet list under "Information flows through **file artifacts**" inside the "Subagent architecture" subsection. Add a new bullet directly after the existing **Specs** bullet (or wherever logically fits with todos/specs/plans/reviews): `**Briefs** (\`docs/briefs/\`) carry task-scoped scout reconnaissance from the optional \`scout\` skill into \`define-spec\`, \`generate-plan\`, \`planner\`, and \`plan-reviewer\` via the \`Scout brief:\` provenance line.`
- [ ] **Step 7: Self-review** — re-read the three modifications. Confirm: (a) the workflow diagram still renders as a valid pre-formatted block (count box widths against adjacent boxes); (b) the new "Run scout" item is item 2 and "Define a spec" is now item 3, with subsequent items renumbered; (c) the Skills table row is positioned above `define-spec` and links to `agent/skills/scout/README.md`; (d) the new `Briefs` artifacts bullet appears directly after the existing `Specs` bullet.

**Acceptance criteria:**

- The Skills table contains a `scout` row pointing at `agent/skills/scout/README.md`, positioned above the `define-spec` row.
  Verify: open `README.md` and confirm the Skills table contains a row whose first cell is `[\`scout\`](agent/skills/scout/README.md)` and whose row index immediately precedes the `[\`define-spec\`](agent/skills/define-spec/README.md)` row.
- The workflow diagram includes an optional Scout stage between `Refine todo` and `Define spec`.
  Verify: open `README.md` and confirm the workflow diagram pre-formatted block contains a stage labeled `Scout` (with `(optional)` annotation matching the existing `Define spec (optional)` convention) positioned between the `Refine todo` and `Define spec` boxes.
- "How it works in practice" includes a numbered "Run scout (optional)" item between "Create & refine a todo" and "Define a spec".
  Verify: open `README.md` and confirm item 2 in the numbered list under "How it works in practice" begins with the bolded label `**Run scout (optional).**` (or equivalent variant) and describes the scout's three-pass agent behavior plus the `Scout brief:` provenance handoff; subsequent items 3–9 correspond to the previously-numbered items 2–8.
- The artifacts list under "Subagent architecture" mentions `docs/briefs/` and the `Scout brief:` provenance line.
  Verify: `grep -n "docs/briefs/\|Scout brief:" README.md` returns at least one match inside the "Subagent architecture" bullet list (the **Briefs** bullet).

**Model recommendation:** standard

### Task 11: Manual end-to-end smoke run (user-executed)

This task validates the integrated `/scout` + `/define-spec` pipeline against the existing `TODO-bbe89373` todo, mechanizing the spec's manual-smoke-run acceptance criterion. **It is user-executed, not coder-dispatched** — running slash commands and walking through interactive review gates is outside the coder agent's tool surface. The user runs the steps below at the end of plan execution (after Tasks 1–10 are complete and committed) and confirms each acceptance criterion against the on-disk artifacts the smoke run produces.

**Files:**
- Inspect (created by the smoke run): `docs/briefs/TODO-bbe89373-brief.md`
- Inspect (created by the smoke run): `docs/specs/<spec-filename>.md` (filename written by `/define-spec`; resolve at smoke-run time via `ls -1t docs/specs/*.md | head -1` or by observing the spec-designer's output path)

**Steps:**
- [ ] **Step 1: Confirm preconditions** — verify Tasks 1–10 are committed: `agent/agents/scout.md`, `agent/skills/scout/SKILL.md`, `agent/skills/scout/scout-prompt.md`, `agent/skills/scout/README.md` all exist on disk; the surgical updates to `agent/skills/define-spec/procedure.md`, `agent/skills/generate-plan/SKILL.md`, `agent/agents/plan-reviewer.md`, `agent/skills/generate-plan/review-plan-prompt.md`, `agent/agents/planner.md`, and `README.md` are committed; and `docs/todos/bbe89373.md` exists and is the smoke-test todo.
- [ ] **Step 2: Run `/scout TODO-bbe89373`** — invoke the slash command from the repo root. Observe that the orchestrator parses `TODO-bbe89373` as the todo input shape, resolves the model and CLI from `agent/model-tiers.json` per the canonical procedure, runs the pre-existing-brief check (which finds no existing brief on the first run), fills the prompt template, and dispatches the scout agent via `subagent_run_serial { wait: true }`.
- [ ] **Step 3: Wait for completion-marker validation** — confirm the orchestrator validates the agent's `BRIEF_WRITTEN: <absolute path>` marker as the last line of the agent's final assistant message, that the file exists at that path, and that the file is non-empty. On any validation failure, stop the smoke run and report the failure (the smoke-run task fails).
- [ ] **Step 4: Inspect the brief at the commit gate** — at the `(c) Commit / (r) Re-run / (x) Stop` review gate, open `docs/briefs/TODO-bbe89373-brief.md` directly and confirm: H1 reads `# Scout Brief: <todo-title>`; preamble lines `Source: TODO-bbe89373`, `Generated at: <ISO 8601 UTC>`, `Git SHA: <40-char SHA>`, `Model: <provider/model>` appear in that exact order under the H1; the body has exactly the eight required level-2 sections — `## Relevant Files`, `## Key Interfaces and Types`, `## Dependency / Call Graph`, `## Patterns and Conventions`, `## Existing Tests and Test Patterns`, `## Risk Areas`, `## Possible Misses`, `## Open Questions / Ambiguities` — in that order; empty sections render as `_None._`; no `## Summary`, `## Broad Orientation`, `## Precedents and Lessons`, or `## Confidence Notes` heading appears anywhere in the file.
- [ ] **Step 5: Choose `(c) Commit`** — at the review gate, type `c`. Confirm the orchestrator invokes the `commit` skill with the explicit brief path and that the resulting commit is limited to `docs/briefs/TODO-bbe89373-brief.md` (no other files). Note the commit SHA for the next steps.
- [ ] **Step 6: Accept the continuation offer** — at the post-commit `Run /define-spec TODO-bbe89373 next? (y/n)` prompt, type `y`. The orchestrator must invoke `/define-spec TODO-bbe89373`.
- [ ] **Step 7: Confirm `/define-spec` reads the brief** — observe that `/define-spec TODO-bbe89373` auto-discovers `docs/briefs/TODO-bbe89373-brief.md` as scout context per `agent/skills/define-spec/procedure.md` Step 1 (e.g., the spec-designer reports loading the brief at startup, or the procedure's brief-loaded log line appears in the transcript).
- [ ] **Step 8: Confirm Open-Questions feedforward during Q&A** — observe that during Step 4 intent Q&A, the spec-designer asks at least one question that traces back to an entry under the brief's `## Open Questions / Ambiguities` section, surfaced under the existing Interaction conventions (recommend with each, one question per turn) — this is the Step 2 procedure addition made by Task 5 of this plan.
- [ ] **Step 9: Confirm the spec carries the `Scout brief:` provenance line** — after the spec is written and the spec commit gate has been resolved, open the resulting `docs/specs/<spec-filename>.md` and confirm a `Scout brief: docs/briefs/TODO-bbe89373-brief.md` line appears in the spec preamble (under the H1 title, above the first `## ` heading).

**Acceptance criteria:**

- The brief exists at the deterministic todo-keyed path with the documented preamble (in order) and the eight-section body (in order), and contains no process-audit sections.
  Verify: `[ -s docs/briefs/TODO-bbe89373-brief.md ]` returns success; `head -1 docs/briefs/TODO-bbe89373-brief.md` outputs a line beginning `# Scout Brief: `; running `awk '/^## /{exit} {print}' docs/briefs/TODO-bbe89373-brief.md` (preamble lines until the first `## ` heading) shows `Source: TODO-bbe89373` first, then `Generated at: ` (ISO 8601 UTC), `Git SHA: ` (40-char hex), and `Model: ` (with a `<provider>/<model>` value) in that exact order; `grep -n "^## " docs/briefs/TODO-bbe89373-brief.md` lists exactly these eight headings in this order — `## Relevant Files`, `## Key Interfaces and Types`, `## Dependency / Call Graph`, `## Patterns and Conventions`, `## Existing Tests and Test Patterns`, `## Risk Areas`, `## Possible Misses`, `## Open Questions / Ambiguities`; and `grep -n "^## \(Summary\|Broad Orientation\|Precedents and Lessons\|Confidence Notes\)$" docs/briefs/TODO-bbe89373-brief.md` returns zero matches.
- The orchestrator validates the `BRIEF_WRITTEN:` completion marker, surfaces the `(c)/(r)/(x)` review gate, commits the brief on `(c)` via the `commit` skill (commit limited to the brief file), and offers the todo-branch continuation prompt.
  Verify: in the orchestrator transcript for `/scout TODO-bbe89373`, confirm a final agent-message line beginning `BRIEF_WRITTEN: ` whose absolute path matches the orchestrator-supplied output path character-for-character; confirm the orchestrator surfaces the literal review-gate options `(c) Commit`, `(r) Re-run`, and `(x) Stop`; confirm the literal continuation prompt `Run /define-spec TODO-bbe89373 next? (y/n)` is offered after the commit. After typing `c`, run `git show --stat HEAD` and confirm the diff lists exactly one file: `docs/briefs/TODO-bbe89373-brief.md` (no other files in the commit).
- `/define-spec TODO-bbe89373` reads the brief, surfaces brief Open-Questions during Q&A, and writes the `Scout brief:` provenance line into the resulting spec.
  Verify: in the `/define-spec TODO-bbe89373` transcript, confirm the spec-designer (or the inline procedure) reports that `docs/briefs/TODO-bbe89373-brief.md` was loaded as scout context (per Step 1 of `agent/skills/define-spec/procedure.md`) and asks at least one question that traces to an entry under the brief's `## Open Questions / Ambiguities` section under the existing recommend-with-each / one-question-per-turn Interaction conventions. After spec write, locate the produced spec file (the most recent `docs/specs/*.md` not previously present, e.g. via `ls -1t docs/specs/*.md | head -1`) and confirm `grep -n "^Scout brief: docs/briefs/TODO-bbe89373-brief\.md$" <spec-path>` returns exactly one match positioned above the first `## ` heading in the spec (i.e., inside the spec preamble under the H1 title).

**Model recommendation:** capable (informational only — this task is user-executed, not dispatched to a coder subagent; the recommendation reflects that interpreting Q&A interactions and judging brief-feedforward correctness is a capable-tier judgment task if it were ever automated)

## Dependencies

- Task 1 depends on: (none)
- Task 2 depends on: (none)
- Task 3 depends on: (none — references `agent/agents/scout.md` and `scout-prompt.md` by path/name only; the SKILL.md text does not require those files to exist on disk to be authored, and the verifier checks only SKILL.md's own content)
- Task 4 depends on: (none — the README describes the skill at a documentation level and references the other two scout files by name without requiring them to exist on disk)
- Task 5 depends on: (none)
- Task 6 depends on: (none)
- Task 7 depends on: (none)
- Task 8 depends on: (none)
- Task 9 depends on: (none)
- Task 10 depends on: (none — references `agent/skills/scout/README.md` by path; the verifier checks only README.md's own content for the new row, diagram stage, "Run scout" item, and Briefs bullet)
- Task 11 depends on: Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 (the smoke run requires the new `scout` skill, agent, prompt, and README to be on disk and the surgical edits to `define-spec`, `generate-plan`, `plan-reviewer`, `review-plan-prompt`, `planner`, and the top-level README to be committed; without all ten the integrated end-to-end pipeline cannot exhibit the validated behavior)

Tasks 1–10 edit independent files and can run in parallel. Task 11 runs after all of Tasks 1–10 are complete and committed — it is the integration-validation gate. Task 11 is user-executed (not coder-dispatched) because it requires running interactive slash commands and stepping through review gates; its acceptance criteria are mechanical inspections of the on-disk artifacts the smoke run produces.

## Risk Assessment

- **Frontmatter footgun on agent/skill creation.** YAML frontmatter must be the very first content in `agent/agents/scout.md` and `agent/skills/scout/SKILL.md` — no preceding blank lines, no comments, no BOM. Tasks 1 and 3 explicitly call this out in their first creation step and the Verify: recipe checks `head -1 <file>` outputs exactly `---`. Mitigation: the explicit "first content, line 1" instruction plus the line-1 check.

- **Diagram corruption in top-level README.** The ASCII workflow diagram in `README.md` uses box-drawing characters with specific widths and arrow alignments. Inserting a new box between "Refine todo" and "Define spec" risks misaligning later stages or breaking the rendering. Mitigation: Task 10 instructs the worker to count box widths against adjacent boxes and preserve the existing optional-stage convention; the Verify: recipe checks the new stage is present and labeled with `(optional)`. Residual risk: the diagram is visual and the worker may pick a slightly different stylistic choice — acceptable as long as the new stage is identifiable and the diagram renders.

- **Unintended modifications outside scope.** Tasks 5–9 each modify a single existing file with surgical additions; the risk is editing other unrelated sections. Mitigation: each task's Verify: recipe constrains the diff to a specific section or sub-block. Task 5 explicitly checks `git diff` is confined to Step 2.

- **Brief format drift between scout-prompt and README.** The 8-section brief format and 4-line preamble appear in three places (the agent's hard rules, the prompt's brief-format section, and the README's brief-format section). If they drift, downstream consumers may mis-parse. Mitigation: Tasks 2 and 4 enumerate the eight sections in the same documented order; the Verify: recipes check each section name in order. Single source of truth is the spec at `docs/specs/2026-05-06-scout-reconnaissance-brief.md`.

- **Staleness check could become noisy.** Task 6 adds a SHA-mismatch warning to `generate-plan` Step 1b that fires on any HEAD inequality, including for unrelated commits. The spec acknowledges this in `## Open Questions` and accepts the noise for now. Mitigation: the warning is informational and never blocks planning; the open question is left open for future revision if the warning gets ignored.

- **Scout agent's `auto-exit: true` + final assistant message ordering.** The `BRIEF_WRITTEN:` marker MUST be the last line of the agent's final assistant message, AND the agent must complete the file write tool call before that final message (file-write tool result alone is insufficient). Task 1 documents this as a hard rule on the agent; Task 2 documents it in the prompt template's completion-contract section. Both layers reinforce the contract so the orchestrator's parser does not silently miss the marker.

- **`--tier` parsing edge cases.** The optional `--tier <name>` argument can appear at any position in the slash-command input. Task 3's Step 4 documents acceptance behavior; the spec's acceptance criteria say "An optional `--tier <name>` argument is accepted in either position." Residual risk: malformed values (e.g., `--tier=standard` with `=`, `--tier` with no value, `--tier xyz` with an unrecognized tier name) are not explicitly handled. Mitigation: the underlying model-tier-resolution procedure already emits Template (2) byte-equal on a missing/empty selected tier, so an unrecognized tier name fails the same way as a malformed JSON; the orchestrator does not need to validate the value itself.

- **Scout dispatch on `subagent_run_serial`-unavailable sessions.** The hard rule in Task 3 Step 9 stops with an explicit error; no inline fallback. Mitigation: this is the documented contract. Residual risk: a user who genuinely cannot dispatch subagents will be unable to use scout — acceptable, since the entire token-cost rationale rests on fresh-context isolation.

- **Pre-existing-brief check race condition.** A user could create or modify the brief between the orchestrator's `head -n 8` read and the scout's overwrite on `o`. Mitigation: low-impact (the user-initiated overwrite is the explicit answer); the read-then-overwrite window is brief and the user just confirmed they want overwrite. No mitigation needed.

- **Smoke-run task is user-executed, not coder-dispatched.** Task 11 mechanizes the spec's manual smoke-run acceptance criterion by walking the user through `/scout TODO-bbe89373` and `/define-spec TODO-bbe89373` with concrete pass/fail checks against the on-disk artifacts. However, slash-command invocation, interactive review gates, and Q&A turn-taking are outside the coder agent's tool surface — the user runs these steps manually. Mitigation: Task 11's `Verify:` recipes are mechanical inspections of the produced files (preamble shape, section ordering, commit scope, `Scout brief:` provenance line) so the pass/fail outcome is unambiguous regardless of who executes the steps. Residual risk: a user who runs Tasks 1–10 but skips Task 11 will not catch integration regressions until later workflow runs surface them — Task 11 is documented as the integration-validation gate to discourage that.
