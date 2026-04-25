# Move define-spec Q&A to a subagent, normalize agent frontmatter, and expand define-spec to cover load-bearing architecture

Source: TODO-075cf515

## Goal

Refactor `define-spec` along three coupled axes:

1. **Move the interactive Q&A out of the orchestrator and into a dedicated `spec-designer` subagent** that runs in its own multiplexer pane (when one is available), so the orchestrator's context stays near-zero during long spec-design conversations and so this project can access Opus-tier judgment via the Claude CLI dispatch path.
2. **Normalize agent frontmatter** across all `agent/agents/*.md` definitions to match `pi-interactive-subagent`'s actual contract (remove silently-ignored fields, apply `session-mode: lineage-only` consistently, fix thinking levels we got wrong).
3. **Expand `define-spec`'s scope to cover load-bearing architectural decisions**, closing today's gap where architecture is decided autonomously by the planner with no interactive user input.

The single coherent landing is: `define-spec` becomes a thin orchestrator that dispatches a `spec-designer` subagent (or runs inline as a fallback or per user override), the procedure body is one canonical file inside `agent/skills/define-spec/`, and the procedure now optionally walks a brainstorming-style "approaches with trade-offs" round when architecture is load-bearing.

## Context

### Today's `define-spec` runs entirely in the orchestrator

`agent/skills/define-spec/SKILL.md` (~125 lines) walks the orchestrator through resolving a todo or freeform input, optionally consuming a scout brief, surveying the codebase, conducting one-question-at-a-time Q&A with the user, writing a structured spec to `.pi/specs/`, and committing it. Every read, every Q&A turn, every code exploration consumes orchestrator context — by the time the user is done answering questions, the orchestrator's window is partially filled before `generate-plan` even starts.

### `pi-interactive-subagent` makes interactive subagents viable

The `pi-interactive-subagent` extension's pane backend spawns each subagent in its own multiplexer pane (cmux, tmux, zellij, wezterm), where the user can type directly into the subagent's session. Completion is signaled via the bundled Stop hook on the Claude CLI path or `subagent_done` on the pi CLI path. The headless backend (no multiplexer) cannot host an interactive session.

### `model-tiers.json` routes Anthropic models to the Claude CLI

`~/.pi/agent/model-tiers.json` maps `capable` → `anthropic/claude-opus-4-7` and `dispatch.anthropic` → `claude`. In practice every Opus-tier dispatch in this project goes through the Claude CLI. The `pi-interactive-subagent` v1 limitation that "skills are not forwarded to the Claude CLI" therefore matters for any subagent that relies on a `skills:` frontmatter to load its procedure body.

### Architecture today is decided non-interactively

The current workflow has three stages: `define-spec` (interactive intent capture, no architecture), `generate-plan` (autonomous architecture + implementation design via the planner subagent and a bounded review-edit loop with `plan-reviewer`), `execute-plan` (mechanical execution with pacing menus). The user has no interactive surface for architectural choices. For non-trivial work, the user's only options are: tighten the spec to nudge the planner, or read the final plan and accept/reject. There is no "let's pick between approach A and B together" moment. The `superpowers:brainstorming` skill's "propose 2–3 approaches with trade-offs" pattern, which would close this gap, has no home in the current pipeline.

### `pi-interactive-subagent` frontmatter contract

Per the `pi-interactive-subagent` README's Frontmatter Reference: valid fields are `name`, `description`, `model`, `cli`, `thinking`, `tools`, `skills`, `session-mode`, `spawning`, `deny-tools`, `auto-exit`, `cwd`, and `disable-model-invocation`. **`maxSubagentDepth` is not in this list.** All six existing agents in `agent/agents/` (planner, plan-reviewer, coder, code-reviewer, code-refiner, verifier) currently set `maxSubagentDepth`, which is silently ignored by the runtime. None of the existing agents currently set `session-mode`, so they all default to `standalone` rather than `lineage-only`.

### Adjacent open work

- **TODO-945326a7** (Claude-backed subagent permission posture) is the in-flight work item on Claude `bypassPermissions` and tool-surface hardening. This spec **inherits** that backdrop and **does not** independently relitigate Claude-permission policy — `spec-designer`'s tool surface is set to be naturally narrow (read/write/grep/find/ls; no `bash`), and any broader Claude-permission posture changes belong to TODO-945326a7.
- `caller_ping` is not available on Claude-CLI initial runs in `pi-interactive-subagent` v1. This spec does not rely on `caller_ping`; mid-Q&A escalation back to the orchestrator is not a feature of `spec-designer`.

## Requirements

### R1 — Three new or substantially-revised artifacts

- **`agent/agents/spec-designer.md` (new).** Pi/Claude-compatible agent definition. Frontmatter: `name`, `description`, `tools: read, write, grep, find, ls`, `thinking: xhigh`, `session-mode: lineage-only`, `auto-exit: false`, `spawning: false`. **No `model:` field** — model is resolved at dispatch time from `model-tiers.json`. **No `maxSubagentDepth` field** — that field is not in the `pi-interactive-subagent` frontmatter contract. Body is short (~20 lines): role definition, plus a pointer that the procedure arrives via `systemPrompt:` and that the agent must end its turn with a `SPEC_WRITTEN: <path>` line.
- **`agent/skills/define-spec/procedure.md` (new).** Plain (non-skill) file inside the existing `define-spec/` skill directory. **This is the single canonical source of truth** for the spec-design procedure. It is **not** a discoverable skill — it has no `name`/`description` frontmatter and is not loaded by any `Skill` tool surface. It is consumed by being read from disk and inlined by the orchestrator.
- **`agent/skills/define-spec/SKILL.md` (revised).** The skill body shrinks substantially (target: orchestration + dispatch only, no Q&A prose, no spec template — those live in `procedure.md`). The skill becomes a thin orchestrator that probes mux availability, picks a dispatch branch, fires the dispatch (or runs the procedure inline), parses the completion line, gates a commit on user review, and offers `generate-plan`.

### R2 — One canonical procedure body, two dispatch branches

- The orchestrator's dispatch decision collapses to **`mux` | `inline`**. CLI choice (pi vs Claude) is resolved downstream by `pi-interactive-subagent`'s runtime via the `model-tiers.json` `dispatch` map; the orchestrator does not branch on CLI.
- For both branches, the procedure body lives in exactly one file (`agent/skills/define-spec/procedure.md`). Delivery differs per branch:
  - **`mux` branch:** orchestrator reads `procedure.md`, dispatches `spec-designer` via `subagent_run_serial` (blocking, `wait: true`) with `systemPrompt: <procedure body>`, `task: <raw input>`, `agent: spec-designer`. **No `skills:` parameter is passed** — the procedure is delivered via `systemPrompt:` on both pi and Claude CLI paths so the delivery mechanism is symmetric.
  - **`inline` branch:** orchestrator reads `procedure.md` and runs the procedure in its own session.
- The orchestrator must read `procedure.md` fresh at dispatch time. If the file is unreadable, fail cleanly with a clear error rather than dispatching with an empty/truncated procedure.

### R3 — Mux detection and user override

- The orchestrator probes mux availability before deciding the branch. The exact probe (env-var inspection — `PI_SUBAGENT_MODE`, `TMUX`, `WEZTERM_PANE`, `ZELLIJ`, `CMUX_*`) is an implementation choice for the planner, but it must not interactively prompt the user during probing.
- The orchestrator additionally scans the user's slash-command input for an explicit "no subagent" override. Recognized phrases and flags must be documented in the orchestrator skill (suggested set: `--no-subagent`, "without a subagent", "without subagent", "no subagent", "skip subagent", "inline").
- Either signal (no-mux probe **or** user override) → `inline` branch.
- The orchestrator emits a brief status line on entry indicating which branch was chosen and why, e.g. `Running spec design in this session (no multiplexer detected).` or `Running spec design in subagent pane (mux detected, no override).` This is a status announcement, not a question — no input expected.

### R4 — Three input shapes, type detection in the procedure

The procedure (not the orchestrator) detects the input shape:

| Input shape | Pattern | Procedure behavior |
|---|---|---|
| **Todo ID** | `^TODO-[0-9a-f]{8}$` | Resolve via `todo` tool. Read body. Check `.pi/briefs/TODO-<id>-brief.md`; load if present. Run full Q&A. Write new spec. |
| **Existing-spec path** | path under `.pi/specs/` ending in `.md`, file exists on disk | Read existing draft. Treat as starting context. Preamble lines (`Source: TODO-<id>`, `Scout brief: …`) preserved on rewrite. Q&A focuses on filling gaps and refining. **Overwrite the same path.** Spec self-review pass is mandatory. |
| **Freeform text** | anything else | Use as seed. No scout brief lookup. Run full Q&A. Write new spec. |

The orchestrator forwards the raw input string to the procedure via the `task` field; type detection lives entirely in the procedure.

### R5 — Procedure step sequence

The procedure executes the following sequence (regardless of branch):

1. **Resolve input** by pattern → todo / refine-existing / freeform branch within the procedure.
2. **Codebase survey** — general + targeted. Scout brief loaded if path-resolved on todo branch.
3. **Scope-decomposition check** (lifted from `superpowers:brainstorming`). If the input describes multiple independent subsystems, surface and offer to split. If user insists on a single spec for multi-subsystem work, comply but record an Open Question noting the breadth.
4. **Intent Q&A** — one question at a time, multi-choice preferred, codebase-grounded. Captures Goal / Context / Requirements / Constraints / Acceptance / Non-Goals. Implementation detail (file paths, function signatures, types) remains out of scope; the boundary is "would two reasonable people building this make the same call?" — if yes, mechanical and out of scope; if no, load-bearing and a candidate for the next step.
5. **Architecture-need assessment.** Agent presents recommendation: *"My read: this work [does / does not] involve load-bearing architectural choices. [Reasoning]. I recommend [running / skipping] an architecture round. You can confirm, force on, or force off."* User confirms / forces on / forces off. The recommendation and reasoning are surfaced to the user but **not** recorded in the spec — only the user's effective choice matters for the artifact.
6. **Architecture Q&A (conditional, when round runs).** Propose 2–3 approaches with trade-offs and the agent's recommendation. User picks one (or proposes their own). Capture chosen approach + rationale + considered-and-rejected alternatives.
7. **Spec self-review pass** (lifted from `superpowers:brainstorming`). Placeholder scan, internal consistency check, scope check, ambiguity check. Fix inline.
8. **Write spec** to `.pi/specs/<date>-<topic>.md` (or overwrite the existing-spec path on the refine branch).
9. **Print** `SPEC_WRITTEN: <absolute path>` as the final agent message, anchored on its own line. Exit.

### R6 — Spec template gains an optional `## Approach` section

The spec template adds one new section between `## Constraints` and `## Acceptance Criteria`:

```markdown
## Approach              <- OPTIONAL — present iff architecture round ran
**Chosen approach:** …
**Why this over alternatives:** …
**Considered and rejected:**
- Alternative A — why not
- Alternative B — why not
```

The section is **omitted entirely** when the architecture round did not run. Downstream consumers detect by section presence. No metadata about the agent's recommendation or the user's override is recorded — only the chosen approach and its rationale are captured.

All other template sections (`Goal`, `Context`, `Requirements`, `Constraints`, `Acceptance Criteria`, `Non-Goals`, `Open Questions`) and provenance preamble (`Source: TODO-<id>`, `Scout brief: .pi/briefs/TODO-<id>-brief.md`) are unchanged.

### R7 — Orchestrator does the minimum possible

- The orchestrator reads no files other than `procedure.md` (the procedure body it dispatches).
- The orchestrator does **not** resolve todo IDs, read scout briefs, or survey the codebase before dispatch. All of that lives in the procedure.
- The orchestrator does **not** read the resulting spec content — only an `ls`-style existence check on the path returned in `SPEC_WRITTEN: <path>`.
- The orchestrator surfaces a status line on entry (which branch, why) and a pause prompt after dispatch (review the spec, OK to commit?).

### R8 — Orchestrator owns the commit gate

- `spec-designer` writes the spec but does **not** commit. Its tool surface omits `bash`.
- After parsing and validating `SPEC_WRITTEN: <path>`, the orchestrator pauses with: *"Spec written to `<path>`. Review it and let me know when you'd like me to commit it (or that you don't want to)."*
- On user OK, orchestrator invokes the `commit` skill on that exact path. On user reject, orchestrator surfaces the recovery menu (R9, case 4).

### R9 — Failure handling policy

- **Cases 1–3 (subagent dispatch failures): strict.**
  - `finalMessage` lacks `SPEC_WRITTEN: <path>` line → report no spec written, surface transcript path, no retry, no menu.
  - Path reported but file missing on disk → report mismatch, surface transcript path, no retry.
  - `exitCode != 0` → report exit code + error + transcript path.
- **Case 4 (user-review rejection): graceful menu.**
  - **(i) Re-dispatch with draft as starting point.** Orchestrator re-runs `define-spec` with the existing-spec path as input; procedure overwrites in place.
  - **(ii) Leave for manual edit and commit.** Orchestrator emits status: *"Leaving `<path>` uncommitted. Edit and commit yourself."*
  - **(iii) Delete it.** Orchestrator deletes the file.
- **Commit-skill failure:** report the error, leave file on disk uncommitted, do not auto-retry. User addresses the underlying issue (pre-commit hook, git config, etc.) and re-runs `define-spec` or commits manually.
- **Architecture-round failure modes** (no meaningfully different alternatives, user forces round off when architecture is later load-bearing, etc.) follow the procedure-internal handling described in the design (do not fake alternatives; honor user override without second-guessing; planner records disagreement in `Risk Assessment`).
- **Multi-subsystem detected, user insists on single spec:** procedure complies and adds an explicit Open Question about plan coarseness; downstream caveat is surfaced but not blocking.
- **Mux probe / override false positives:** if the probe is wrong (e.g., reports no-mux when in mux, or vice versa), procedure either runs inline (functionally correct, extra orchestrator context) or hard-fails on dispatch (orchestrator surfaces error and user retries). User-override false positives (input contains "subagent" without meaning override) are mitigated by matching specific phrases; residual risk is documented.
- **Inline-branch session termination:** the inline branch has no equivalent of the `SPEC_WRITTEN: <path>` completion line because the orchestrator *is* the procedure — there is no subagent boundary to fail across. If the user terminates the orchestrator session mid-procedure, no spec is written, no commit happens, and there is nothing to recover. The user re-runs `/define-spec` to start over. The spec self-review pass and the user-review pause still apply on the inline branch; a partially-written spec on disk (e.g., the procedure crashed mid-write) is left in place and the user can delete or edit it manually.

### R10 — Frontmatter normalization across all 7 agents

Apply the following changes across `agent/agents/`:

- **Remove `maxSubagentDepth` from all six existing agents** (`planner.md`, `plan-reviewer.md`, `coder.md`, `code-reviewer.md`, `code-refiner.md`, `verifier.md`). The field is not in the `pi-interactive-subagent` frontmatter contract and is silently ignored.
- **For every agent that previously had `maxSubagentDepth: 0`** (planner, plan-reviewer, coder, code-reviewer, verifier), add `spawning: false`. The intent is equivalent: deny all subagent-spawning tools.
- **For `code-refiner.md`** (which had `maxSubagentDepth: 1`): remove `maxSubagentDepth` and **do not** add `spawning: false`. Code-refiner intentionally dispatches nested workers; default `spawning: true` behavior is preserved. The depth-limit cap does not survive the migration; the prompt-level constraint in `code-refiner.md`'s body remains the only depth control.
- **Add `session-mode: lineage-only` to all 7 agents** (planner, plan-reviewer, coder, code-reviewer, code-refiner, verifier, spec-designer). All seven are dispatched-as-subagent and benefit from clean child context with parent-session linkage for discovery. None require `fork` or `standalone` modes today.
- **Set `thinking: xhigh`** on `planner.md` and `spec-designer.md`. Other agents' `thinking` levels are unchanged.
- **Update the verification-recipe example in `planner.md`'s body** that currently references `maxSubagentDepth: 0` on `verifier.md`. The example needs to point at a field that still exists post-migration — either rephrase the recipe to check `spawning: false` on `verifier.md`, or pick a different example entirely.

### R11 — Downstream contract changes

Two existing agent definitions need updates so the optional `Approach` section is honored end-to-end:

- **`agent/agents/planner.md` body.** When the planner reads a spec artifact, it must check for a `## Approach` section. If present, the chosen approach is treated as a constraint on `Architecture summary` and `File Structure` — the planner expands the user-chosen approach into file-level structure rather than picking from scratch. If the planner needs to deviate from the chosen approach, the deviation must be surfaced as a `Risk Assessment` entry. If the section is absent, current behavior is preserved (planner picks freely).
- **`agent/agents/plan-reviewer.md` body.** When the plan-reviewer reads both spec and plan, if the spec has a `## Approach` section, the review must check the plan honors it. **Deviations are flagged as Errors, not Warnings.** If the section is absent, current behavior is preserved.
- The planner edit-pass (`generate-plan` Step 4.3) inherits the same constraint: the edited plan must continue to honor `Approach` if present.

### R12 — Spec versioning is not adopted

Specs overwrite in place across redispatches (matching the plan-file pattern, not the plan-review-file pattern). Git history is the audit trail when a spec gets committed. Users who want to preserve a rejected draft alongside a refinement may `cp` the file manually before triggering a redispatch — this is the documented affordance, not a built-in case-4 option.

## Constraints

- The procedure file `agent/skills/define-spec/procedure.md` is the single canonical source. All dispatch branches (`mux`, `inline`) load the same file. No branch may carry a divergent copy of the procedure body.
- The procedure file is **not** a discoverable skill. It has no `name`/`description` frontmatter and must not appear in any `Skill` tool surface. It is consumed only by being read from disk by the orchestrator.
- `spec-designer` runs without a `model:` frontmatter field; model resolution happens at dispatch time via `model-tiers.json`.
- Spec output path format (`.pi/specs/<date>-<topic>.md`), provenance preamble (`Source: TODO-<id>`, `Scout brief: .pi/briefs/TODO-<id>-brief.md`), and existing template sections are unchanged. The new `## Approach` section is additive and optional.
- `generate-plan`'s provenance extraction in `generate-plan/SKILL.md` Step 1b must continue to match without modification. The new `## Approach` section appears below the preamble and outside the strict-exact-match preamble lookup, so existing extraction logic is unaffected.
- `spec-designer` must work end-to-end on **both** pi CLI and Claude CLI. CLI selection happens via per-call dispatch resolution from `model-tiers.json`; the orchestrator's dispatch shape is identical regardless of CLI.
- The Claude-CLI permission posture (`bypassPermissions` default, tool-surface hardening) is **out of scope** for this spec — it belongs to TODO-945326a7. `spec-designer`'s narrow tool surface (no `bash`) is chosen for naturally minimal blast radius, but no broader Claude-permissions changes are made here.
- `caller_ping` is not used. `spec-designer` cannot escalate mid-Q&A back to the orchestrator. Acceptable since the user is present in the pane.
- Mux detection must not interactively prompt the user during probing. The orchestrator's only mid-flow user prompt is the post-dispatch review-and-commit pause.
- Frontmatter normalization (R10) applies to all 7 agents in this single spec — it is not deferred to a follow-up. The cleanup is small and mostly mechanical, and bundling it with the `spec-designer` introduction avoids landing the new agent against a still-broken frontmatter baseline.

## Approach

**Chosen approach:** Three coordinated workstreams in one spec — (1) introduce `spec-designer` agent + procedure file + revised orchestrator skill, (2) normalize agent frontmatter across all seven agents, (3) expand the procedure to optionally walk a brainstorming-style architecture round, with the spec template gaining an optional `## Approach` section and `planner` / `plan-reviewer` updated to honor it. Procedure body is delivered via `systemPrompt:` on **both** pi and Claude CLI dispatch paths (no `skills:` mechanism used at all), giving a symmetric single-delivery-mechanism story. Procedure file lives **inside** the `define-spec/` skill directory as a non-skill plain file, so there is no top-level skill ambiguity between `define-spec` and a procedure-skill sibling.

**Why this over alternatives:**

- **Single coherent landing.** All three workstreams modify overlapping files (`agent/skills/define-spec/`, `agent/agents/*.md`). Splitting them produces a messy ordering — landing `spec-designer` against silently-broken frontmatter, or doing the architecture expansion against a not-yet-extracted procedure file. Bundling avoids reordering churn.
- **Procedure rewrite happens once.** The architecture-round expansion is the most substantive procedure change; doing it after a separate "lift to subagent" pass would require rewriting the procedure twice.
- **Symmetric delivery via `systemPrompt:`** sidesteps `pi-interactive-subagent`'s v1 limitation that skills aren't forwarded to the Claude CLI. A two-mechanism design (pi `skills:` + Claude `systemPrompt:`) was viable but introduced asymmetry for no functional gain — both branches can use `systemPrompt:` cleanly.
- **Procedure file inside `define-spec/`** (not a sibling skill) avoids the top-level `Skill` tool ambiguity between `define-spec` (orchestrator) and a `define-spec-procedure` skill. The model can't accidentally invoke the procedure as a top-level skill because it isn't one. Nesting also matches the natural ownership boundary.

**Considered and rejected:**

- **Build a reusable `dispatch-with-skill` utility now** — premature generalization. We have no confirmed second caller; pulling the inlining out before the second use forces guesses about its shape. A follow-up todo will extract if a second caller appears.
- **Use `pi-interactive-subagent`'s `skills:` mechanism on pi and inline only on Claude** — asymmetric, requires the orchestrator to know which CLI will run, complicates testing. Rejected in favor of single delivery via `systemPrompt:` on both paths.
- **Adopt `superpowers:brainstorming` directly as the procedure** — rejected because brainstorming prescribes architecture/components/data-flow as required design coverage and terminates by invoking `writing-plans` writing to `docs/superpowers/specs/`. `define-spec`'s contract differs (intent-only with optional architecture round, terminates by offering `generate-plan`, writes to `.pi/specs/`). The brainstorming skill's *techniques* (scope-decomposition check, spec self-review, user-review gate, propose-2–3-approaches round) are lifted into the procedure; the *whole skill* is not.
- **Subagent owns the commit step** — rejected in favor of orchestrator-owns-commit, gated on user review. The user reads the spec file directly (orchestrator never loads it into context) and approves before commit. Catches malformed-spec / partial-write failures before they reach git history.
- **Spec versioning per redispatch (`-v1.md`, `-v2.md`)** — rejected as inconsistent with the plan-file pattern (overwrite-in-place; git is the audit trail). The plan-review versioning is for a different artifact shape (per-era output of an automated bounded gate), which doesn't apply to user-driven spec iteration.
- **Defer the architecture-round expansion to a follow-up todo** — rejected because the procedure rewrite is the central artifact in both workstreams; doing it twice is wasteful, and the architecture expansion is what gives `spec-designer` real reason to exist beyond a refactor.

## Acceptance Criteria

The work is done when **all** of the following hold:

1. **Files exist with the expected shape:**
   - `agent/agents/spec-designer.md` exists with the frontmatter described in R1 (no `model:`, no `maxSubagentDepth`, `thinking: xhigh`, `session-mode: lineage-only`, `auto-exit: false`, `spawning: false`).
   - `agent/skills/define-spec/procedure.md` exists, contains the procedure body, has no skill frontmatter (no `name:`/`description:` block), and is not discoverable as a top-level skill.
   - `agent/skills/define-spec/SKILL.md` is substantially smaller than today and contains only orchestration / dispatch / pause / commit-gate logic.
2. **Frontmatter normalization is complete:**
   - `grep -r "maxSubagentDepth" agent/agents/` returns zero matches.
   - `grep -l "session-mode: lineage-only" agent/agents/*.md` returns all 7 agent files.
   - `grep "thinking:" agent/agents/planner.md agent/agents/spec-designer.md` shows `xhigh` for both.
   - `planner.md`'s body no longer references `maxSubagentDepth` in any verification recipe.
3. **Smoke test 1 (happy path, todo input, mux env):** running `/define-spec TODO-<id>` against a todo with a scout brief on disk causes a pane to spawn, the user can answer Q&A interactively in the pane, the agent emits `SPEC_WRITTEN: <path>` with `<path>` under `.pi/specs/`, the orchestrator pauses for review, and on user OK the file is committed via the `commit` skill. The committed spec contains `Source: TODO-<id>` and `Scout brief: …` preamble lines.
4. **Smoke test 2 (happy path, freeform input, inline branch via override):** running `/define-spec write a brief description here, no subagent` causes the orchestrator to detect the override, run the procedure inline, write a spec without `Source:` / `Scout brief:` preamble, pause for review, and commit on OK. No subagent pane is spawned.
5. **Smoke test 3 (refine-existing-spec branch):** running smoke test 1 to completion, rejecting commit, picking case-4 option (i) re-dispatch with draft, and confirming that a new pane spawns with the existing-spec path as input, that the subagent reads it and Q&A focuses on gaps, and that the spec at the same path is overwritten with preamble preserved.
6. **Smoke test 4 (architecture round, both directions):**
   - **(a)** Mechanical input — agent recommends skip, user accepts, written spec has no `## Approach` section.
   - **(b)** Ambiguous-architecture input — agent recommends run, user accepts, written spec gains a `## Approach` section with chosen-approach + rationale + considered-and-rejected alternatives.
7. **Smoke test 5 (failure surface):** user closes the pane mid-Q&A. Orchestrator reports `finalMessage`-lacks-`SPEC_WRITTEN` failure with transcript path, no spec written, no commit attempted.
8. **Downstream contract verification:**
   - **(a)** `generate-plan` consumes a spec produced by smoke test 1: provenance extraction succeeds (`Source: TODO-<id>` and `Scout brief: …` parse), planner produces a plan, plan-reviewer runs.
   - **(b)** `generate-plan` honors `## Approach`: a spec produced by smoke test 4(b) drives a plan whose `Architecture summary` aligns with the chosen approach. A subsequent plan-edit that introduces a deviation is flagged by `plan-reviewer` as an Error (not Warning).
9. **`spec-designer` works on both CLIs:** smoke test 1 runs cleanly when the resolved CLI is `claude` (default per current `model-tiers.json`) and continues to run cleanly if the dispatch resolution were forced to `pi` (manual override or model-tier change). The procedure body delivered via `systemPrompt:` is identical in both cases.
10. **No regression in existing workflows:** existing `.pi/specs/` files (e.g. `2026-04-24-pi-interactive-subagent-cutover.md`) continue to feed `generate-plan` correctly post-migration. Existing plan-review and execute-plan flows are unaffected.

## Non-Goals

- Building a reusable `dispatch-with-skill` utility for other skills. If `generate-plan`, a future interactive `code-reviewer`, or another skill needs the same single-source-of-truth procedure-delivery pattern later, that's a separate todo. This spec keeps the inlining `define-spec`-local.
- Changing the `commit` skill, the spec template's existing sections, the spec output path format, the scout brief lookup convention, or the `generate-plan` provenance-extraction rules.
- Solving the Claude-backend permission-posture / guardrails gap. That is TODO-945326a7. This spec aligns with whatever posture that todo lands on; it does not independently weaken or strengthen Claude permissions.
- Solving Claude-CLI `caller_ping` parity. If `spec-designer` ever needs to escalate mid-Q&A back to the orchestrator, that is a `pi-interactive-subagent` upstream feature request, not part of this work.
- Building user-input plumbing for the headless backend. The `inline` fallback runs the procedure in the orchestrator session; that is the acceptable degraded mode.
- Adopting `superpowers:brainstorming` wholesale. We lift specific techniques (scope-decomposition check, spec self-review pass, user-review gate, propose-2–3-approaches round). We do not adopt brainstorming's required design-coverage sections (architecture / components / data flow / error handling / testing as enforced spec sections), its `docs/superpowers/specs/` output path, or its terminal `writing-plans` invocation.
- Spec versioning (`-v1.md`, `-v2.md`). Specs overwrite in place; git history is the audit trail.
- Visual-companion / browser-based mockup tooling. Not relevant to spec-design Q&A.
- Per-section design-walk approval inside the procedure (presenting architecture, components, data flow, etc., for sign-off section by section). The procedure captures intent + optional architecture; deeper design decisions remain `generate-plan`'s territory.
- Recording the architecture-need recommendation and the user's accept/override decision in the spec. Only the user's effective choice (run or skip) is reflected by the presence/absence of the `## Approach` section.

## Open Questions

- **Exact mux-availability probe.** Env-var inspection is the likely answer (`PI_SUBAGENT_MODE` plus mux-specific vars: `TMUX`, `WEZTERM_PANE`, `ZELLIJ`, `CMUX_*`), but the precise probe and the order of fallback checks is left to the planner. A small helper function in the orchestrator skill would centralize this.
- **Recognized "no subagent" override phrase set.** Suggested set is `--no-subagent`, "without a subagent", "without subagent", "no subagent", "skip subagent", "inline". The planner should pick a final list and ensure the orchestrator skill documents it explicitly so users have a stable interface.
- **`code-refiner.md` post-migration depth control.** With `maxSubagentDepth: 1` removed and no replacement field in the contract, the only depth control is the prompt-level instruction in the agent body. If a real depth-runaway problem appears post-migration, that's a follow-up — not in scope here.
- **Whether the planner edit-pass (in `generate-plan` Step 4.3) needs additional explicit prose** about respecting `## Approach`, beyond the planner agent body change in R11. The R11 change applies to the planner's spec-reading behavior generally; the edit pass invokes the same planner agent, so it should inherit. Verify during implementation.
