# Scout skill

Optional non-interactive task-scoped codebase reconnaissance that runs before mandatory `define-spec` and writes a structured brief to `docs/briefs/`.

## Role in the workflow

`scout` sits between "Refine todo" and "Define spec" in the workflow diagram. It runs only when the user invokes `/scout` explicitly. The scout skill dispatches a fresh-context `scout` subagent that performs a broad orientation pass, a task-focused deep dive, and a disconfirmation pass. The resulting brief is written to `docs/briefs/` and passed to downstream consumers (`define-spec`, `generate-plan`, `planner`, `plan-reviewer`) via the existing `Scout brief: docs/briefs/<filename>` provenance line in the spec.

## Input shapes

**Todo ID** — `TODO-<8-hex>` pattern (e.g., `TODO-bbe89373`):
- Output path: `docs/briefs/TODO-<id>-brief.md`
- Brief preamble includes `Source: TODO-<id>`

**Freeform text** — any other input:
- Output path: `docs/briefs/<YYYY-MM-DD>-<slug>-brief.md` (dated slug derived from task text)
- Brief preamble does NOT include `Source:` (because `define-spec` does not auto-discover freeform briefs)

## Dispatch behavior

Scout dispatches the `scout` subagent synchronously via `subagent_run_serial { wait: true }`. The orchestrator never reads the brief into its own context — the user reviews it directly between dispatch and commit.

The model tier defaults to `standard`. An optional `--tier <cheap|standard|capable>` argument (recognized at any position in the slash-command input) overrides the default.

The agent executes three passes:
1. **Broad orientation** — map repo layout, package/module boundaries, likely entry points, test structure, and adjacent areas before any task-focused reads.
2. **Task-focused deep dive** — read files implicated by the task body, trace imports and call paths, identify interfaces, types, registrations, dispatch sites, and tests.
3. **Disconfirmation** — explicitly check whether files named in the task body are incomplete or misleading; search for adjacent implementations and alternate call paths; record contradictions between task framing and code reality.

The findings from these three passes flow into the consumer-shaped output sections. The orchestrator validates the agent's `BRIEF_WRITTEN: <absolute path>` completion marker as the last line of the agent's final assistant message.

## Brief format

The brief is a markdown file at the determined output path.

**Preamble (required lines in order):**
- `# Scout Brief: <task-title>` (H1)
- Blank line
- `Source: TODO-<id>` (only on the todo branch; omitted entirely on the freeform branch)
- `Generated at: <ISO 8601 UTC>` (always)
- `Git SHA: <40-char-hex>` (always)
- `Model: <provider>/<model>` (always)

**Body (eight required level-2 sections in order):**
1. `## Relevant Files`
2. `## Key Interfaces and Types`
3. `## Dependency / Call Graph`
4. `## Patterns and Conventions`
5. `## Existing Tests and Test Patterns`
6. `## Risk Areas`
7. `## Possible Misses`
8. `## Open Questions / Ambiguities`

Empty sections render as `_None._` rather than omitted. No per-pass audit sections (Summary, Broad Orientation, Precedents and Lessons, Confidence Notes) appear in the output. Paths are relative to repo root unless absolute is genuinely required. Full file contents are NOT inlined by default — use paths, line ranges, and short summaries; embed concrete snippets only for non-obvious conventions.

## Pre-existing-brief behavior

Before dispatch, the orchestrator checks whether the target brief path exists. When it does, the orchestrator reads the existing brief's `Git SHA: <sha>` preamble line (via `head -n 8` or similar bounded read) and compares it to the current repo HEAD SHA.

The orchestrator renders the user one of four prompts, depending on branch (todo vs freeform) and SHA equality:

| Branch    | SHA Match          | Prompt                                                                                                   |
|-----------|--------------------|----------------------------------------------------------------------------------------------------------|
| Todo      | Yes (at HEAD)      | `A brief for TODO-<id> already exists at <path> at the current HEAD SHA. (o)verwrite or (k)eep?`       |
| Todo      | No (stale/changed) | `A brief for TODO-<id> already exists at <path> at SHA <brief-sha>, but HEAD is now <head-sha>. (o)verwrite or (k)eep?` |
| Freeform  | Yes (at HEAD)      | `A brief already exists at <path> at the current HEAD SHA. (o)verwrite or (k)eep?`                      |
| Freeform  | No (stale/changed) | `A brief already exists at <path> at SHA <brief-sha>, but HEAD is now <head-sha>. (o)verwrite or (k)eep?` |

When the SHA preamble is missing or malformed, the orchestrator treats the brief as stale and renders `<brief-sha>` as `(unreadable)`.

**On `o` (overwrite):** dispatch normally; the agent overwrites the file at the same path.

**On `k` (keep):**
- Todo branch: report the existing path and offer the continuation prompt `Run /define-spec TODO-<id> next? (y/n)`. Do NOT dispatch.
- Freeform branch: report the existing path and stop. No continuation offer.

## Commit gate and continuation

After successful scout dispatch, the orchestrator surfaces a review pause:

```
Brief written to <path>. Review it, then choose:
(c) Commit — commit the brief to git.
(r) Re-run — dispatch scout again with the same input; the agent overwrites the same path.
(x) Stop — leave <path> uncommitted on disk for manual editing and committing later.
```

**On `c` (commit):** invoke the `commit` skill with the brief path explicitly, committing only that file.

**On `r` (re-run):** re-dispatch the scout agent from the prompt-fill step (skip the pre-existing-brief check entirely — `r` is an explicit overwrite).

**On `x` (stop):** emit `Leaving <path> uncommitted.` and stop.

After a successful commit on the **todo branch only**, offer:
```
Run /define-spec TODO-<id> next? (y/n)
```

The **freeform branch does not offer continuation** (no todo to hand off to define-spec).

## Why this exists

Fresh-context isolation is the load-bearing rationale: the orchestrator never absorbs reconnaissance reads, so the planner that ultimately consumes the brief through path-based handoff is genuinely shorter on input tokens than a planner that does broad discovery itself. See `docs/todos/bbe89373.md` for the token-cost comparison table.

## Files

- `SKILL.md` — orchestrator: input-shape detection, dispatch, validation, commit gate, continuation offer.
- `scout-prompt.md` — per-dispatch prompt template with placeholders for working directory, task body, output path, timestamp, git SHA, model, source provenance, and task title.
- `README.md` — this file.
