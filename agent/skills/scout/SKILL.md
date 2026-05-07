---
name: scout
description: "Non-interactive task-scoped codebase reconnaissance. Dispatches the scout subagent to write a structured brief to docs/briefs/, then gates the resulting file on user review and commit."
---

# Scout

This skill orchestrates a fresh-context scout subagent that writes a structured brief to `docs/briefs/`. The brief slots into the existing `Scout brief:` provenance contract that `define-spec`, `generate-plan`, `planner`, and `plan-reviewer` already consume.

## Step 1: Detect input shape and parse --tier

### Input shape detection

Examine the user's slash-command input (excluding any `--tier` argument) and classify it as one of two shapes:

**Todo branch** — the input matches the regex `^TODO-([0-9a-f]{8})$` exactly (case-sensitive, 8 lowercase hex digits only).

- Extract `<raw-id>` from the captured group (e.g., `TODO-bbe89373` → `bbe89373`).
- Set the brief output path to `docs/briefs/TODO-<raw-id>-brief.md`.
- Read `docs/todos/<raw-id>.md` to extract the todo title (first `# ` heading) and full body.

**Freeform branch** — any input that does not match the todo regex.

- Derive a kebab-case slug from the seed text (lowercase, spaces and punctuation replaced by hyphens, leading/trailing hyphens removed, max ~40 characters).
- Set the brief output path to `docs/briefs/<YYYY-MM-DD>-<slug>-brief.md` using today's date in UTC (e.g., `2026-05-06`).
- Use the seed text as the task body.

### `--tier` parsing

Scan the slash-command input for an optional `--tier <name>` argument at any position. Recognized values: `cheap`, `standard`, `capable`. Default tier is `standard` when the argument is absent or the input is empty.

If `--tier` is present with a value not in the recognized set, the resolution step will fail with Template (2) when the tier is looked up, so no special handling is needed here.

## Step 2: Resolve model and CLI

Follow the canonical procedure in [`agent/skills/_shared/model-tier-resolution.md`](../_shared/model-tier-resolution.md) with:

- `<agent>` = `scout`
- `<tier>` = the tier selected in Step 1 (default `standard`)

Apply all three primitive operations in order: tier-path resolution, provider-prefix extraction, and dispatch lookup.

On any of the four documented failure conditions, emit the corresponding canonical template byte-equal after parameter substitution and stop:

- **Template (1)** — `~/.pi/agent/model-tiers.json` missing or unreadable.
- **Template (2)** — the selected tier key is missing or empty in the JSON.
- **Template (3)** — the `dispatch` map is missing from the JSON.
- **Template (4)** — `dispatch.<provider>` is missing or empty for the resolved model.

Do **not** silently fall back to `pi` or any other CLI default. The strict-by-default policy from `_shared/model-tier-resolution.md` applies without exception.

## Step 3: Pre-existing-brief check

Before dispatch, check whether the target brief path already exists on disk.

**If the file does not exist:** proceed directly to Step 4.

**If the file exists:** perform a bounded preamble read (e.g., `head -n 8 <path>`) and extract the `Git SHA: <sha>` line. Compute the current repo HEAD SHA via `git rev-parse HEAD`. If the `Git SHA:` line is missing or malformed, treat the brief as stale and render `<brief-sha>` as `(unreadable)`.

Prompt the user using the variant from the table below:

| Branch | SHA equals HEAD | Prompt |
|--------|-----------------|--------|
| Todo | Yes | `A brief for TODO-<id> already exists at <path> at the current HEAD SHA. (o)verwrite or (k)eep?` |
| Todo | No (or unreadable) | `A brief for TODO-<id> already exists at <path> (generated at SHA <brief-sha>; HEAD is now <head-sha>). (o)verwrite or (k)eep?` |
| Freeform | Yes | `A brief already exists at <path> at the current HEAD SHA. (o)verwrite or (k)eep?` |
| Freeform | No (or unreadable) | `A brief already exists at <path> (generated at SHA <brief-sha>; HEAD is now <head-sha>). (o)verwrite or (k)eep?` |

**On `o` / `overwrite`:** dispatch normally (proceed to Step 4). The agent overwrites the file at the same path. The commit gate's `(r) Re-run` semantics still apply on the next gate.

**On `k` / `keep`:**
- **Todo branch:** report the existing path and offer the continuation prompt `Run /define-spec TODO-<id> next? (y/n)`. Do NOT dispatch the scout agent.
- **Freeform branch:** report the existing path and stop with no continuation offer.

If the user types neither `o` nor `k`, re-prompt once. On a second unrecognized response, stop.

## Step 4: Fill the prompt template

Read `agent/skills/scout/scout-prompt.md` from disk and substitute every placeholder:

| Placeholder | Value |
|-------------|-------|
| `{WORKING_DIR}` | Absolute path of the current working directory |
| `{TODO_BODY_OR_FREEFORM_TEXT}` | Full todo body on the todo branch; seed text on the freeform branch |
| `{OUTPUT_PATH}` | Absolute path of the target brief file |
| `{GENERATED_AT_ISO}` | Current UTC time in ISO 8601 format (e.g., `2026-05-06T12:34:56Z`) |
| `{GIT_HEAD_SHA}` | Output of `git rev-parse HEAD` (40-character SHA) |
| `{MODEL_PROVIDER_AND_NAME}` | The `<provider>/<model>` string resolved in Step 2 |
| `{SOURCE_PROVENANCE}` | `Source: TODO-<raw-id>` on the todo branch; empty string on the freeform branch |
| `{TASK_TITLE}` | The todo title (first `# ` heading) on the todo branch; a short title derived from the seed text on the freeform branch |

## Step 5: Dispatch via subagent_run_serial

Dispatch the scout subagent synchronously. `wait: true` is a top-level orchestration option, not a per-task field:

```
subagent_run_serial {
  tasks: [
    {
      name: "scout",
      agent: "scout",
      task: "<filled scout-prompt.md body>",
      model: "<resolved model from Step 2>",
      cli: "<resolved cli from Step 2>"
    }
  ],
  wait: true
}
```

Do **not** pass a `skills:` parameter. Do **not** inline the brief body into the orchestrator's own context after dispatch — the user reads it directly at the commit gate.

## Step 6: Validate completion

Evaluate `results[0]` from the dispatch in this exact order. The first matching case wins.

**(a) `exitCode != 0`:** surface the failure verbatim, include `transcriptPath` when available, and stop. Do not retry.

**(b) `finalMessage` does not end with an anchored `BRIEF_WRITTEN:` line:** the final assistant message must end with a line of the exact form `BRIEF_WRITTEN: <absolute path>` — no surrounding backticks, no trailing commentary on that line — where `<absolute path>` is character-for-character identical to the `{OUTPUT_PATH}` supplied in Step 4. If this line is absent or the path does not match exactly, surface the failure verbatim with `transcriptPath` and stop. Do not retry. Path normalization is not performed — any divergence is a validation failure.

**(c) The file at that path does not exist on disk or is empty:** report this as a validation failure, include `transcriptPath` when available, and stop. Do not retry.

**(success):** all three checks pass — proceed to Step 7.

If `subagent_run_serial` is unavailable in the current session, stop with an explicit error message and do **not** fall back to inline reconnaissance. The fresh-context isolation is the load-bearing rationale for this skill; an inline fallback would defeat it.

## Step 7: Commit gate

The orchestrator does **not** read the brief into its own context. Surface to the user verbatim:

```
Brief written to <path>. Review it, then choose:

(c) Commit — commit the brief to git.
(r) Re-run — dispatch scout again with the same input; the agent overwrites the same path.
(x) Stop — leave <path> uncommitted on disk for manual editing and committing later.
```

Wait for the user's reply.

**On `c` / `commit` / `yes`:** invoke the `commit` skill with the exact brief path explicitly so only the brief file is committed. If the `commit` skill fails, report the error verbatim and stop without auto-retry.

**On `r` / `re-run`:** re-run from Step 5 (skip the Step 3 pre-existing-brief check — `r` is an explicit overwrite).

**On `x` / `stop`:** emit `Leaving <path> uncommitted.` and stop.

If the user types none of `c`, `r`, or `x`, re-prompt once. On a second unrecognized response, stop.

## Step 8: Continuation offer

After a successful commit on the **todo branch only**, offer:

```
Run /define-spec TODO-<id> next? (y/n)
```

On `y`: invoke `/define-spec TODO-<id>`.
On `n`: stop.

The freeform branch does **not** offer continuation — there is no todo ID to hand off.

## Edge cases

- **Missing `model-tiers.json` or any of the four resolution failures:** emit Template (1)–(4) byte-equal with the supplied parameters and stop. No dispatch occurs.
- **`subagent_run_serial` unavailable in the session:** stop with an explicit error message. No inline reconnaissance fallback.
- **`commit` skill failure:** surface the error verbatim and stop. No auto-retry. The user resolves the underlying issue (e.g., pre-commit hook failure) and commits manually or re-runs `/scout`.
- **Agent dispatch returns a path different from `{OUTPUT_PATH}`:** treat as validation failure. No path normalization is applied.
- **Brief file exists but is empty after dispatch:** treat as validation failure (Step 6 check (c)).
- **Unrecognized response at the pre-existing-brief prompt (`o`/`k`):** re-prompt once. Stop on a second unrecognized response.
- **Unrecognized response at the commit gate (`c`/`r`/`x`):** re-prompt once. Stop on a second unrecognized response.
