---
name: generate-plan
description: "Generates a structured implementation plan from a todo or spec file. Dispatches the planner subagent for deep codebase analysis, then runs an iterative review-edit loop. Use when the user wants to plan work before executing it."
---

Dispatch the `planner` subagent to analyze the codebase and produce a structured plan file in `docs/plans/`, then review and refine the plan through an iterative review-edit loop.

## Step 1: Determine the input source

The user will provide one of three input sources. **Todo and freeform inputs are inlined into the planner prompt as before. File inputs are passed by path** — the orchestrator must not read and embed the full file body into the planner prompt, because that pollutes the orchestrator's own context window on large specs, RFCs, and design docs.

### 1a. Todo ID (e.g., `TODO-7ef7d441`)

Use the `todo` tool to read the todo and extract its full body. The planner subagent does not have the `todo` tool, so you must inline the body.

- Set `{TASK_DESCRIPTION}` to the todo body text.
- Set `{TASK_ARTIFACT}` to an empty string.
- Set `{SOURCE_TODO}` to `Source todo: TODO-<id>`.
- Leave `{SOURCE_SPEC}` and `{SCOUT_BRIEF}` empty.

### 1b. File path (spec, RFC, design doc, etc.)

Pass the file by path. **Do NOT load the full file contents into `{TASK_DESCRIPTION}`.** The planner will read the file from disk.

Do a **bounded preamble read** of the file for provenance extraction only — for example `head -n 40 <path>`, or the `read` tool with a small line limit. Do not read the entire file into the orchestrator context.

From that bounded preamble, extract provenance using strict exact-match rules:

- Inspect only the preamble area at the top of the file (everything above the first `## ` heading, or the bounded first ~40 lines, whichever comes first).
- Only exact supported lines count:
  - `Source: TODO-<id>` → set `{SOURCE_TODO}` to `Source todo: TODO-<id>`.
  - `Scout brief: docs/briefs/<filename>` → set `{SCOUT_BRIEF}` to `Scout brief: docs/briefs/<filename>`, **then verify the referenced file exists on disk**:
    - If the brief file does not exist, warn the user (`Scout brief referenced in spec not found at <path> — proceeding without it.`), leave `{SCOUT_BRIEF}` empty, and continue without failing.
    - **Do NOT read the brief contents into the orchestrator prompt.** The planner reads the brief from disk itself — this is the whole point of path-based handoff.
    - Staleness classifier (gates planning when source/config drift is detected):
      - Workflow-artifact path matching uses the allowlist defined in [`agent/skills/_shared/workflow-artifact-paths.md`](../_shared/workflow-artifact-paths.md) — that doc is the single source of truth. Do NOT inline the four allowlist entries here.
      - When the brief file exists, perform a bounded preamble read of its first ~8 lines (e.g., `head -n 8 <path>`) and extract its `Git SHA: <sha>` line. Compute the current repo HEAD SHA via `git rev-parse HEAD`. If `git rev-parse HEAD` fails, route to `Uninspectable sub-case C` below with `<head-sha>` rendered as `<unknown>` and `<error>` set to the failing command's stderr. If the brief SHA equals current HEAD SHA, continue silently and proceed to the next preamble rule (the `Source: TODO-<id>` line) — emit no message. This is the silent-continue path; today's SHA-equal behavior is preserved unchanged.
      - If the brief SHA differs from HEAD, enumerate the set of files changed in the range `<brief-sha>..HEAD` using NUL-separated git output: `git diff --name-only -z <brief-sha>..HEAD`. Parse the output by NUL-separated path bytes, NOT by whitespace tokens. NUL separation is load-bearing: paths may contain spaces, deletions are listed as their pre-deletion path (default), renames are listed as their post-rename path (default). Both behaviors are required by the spec's enumeration contract.
      - Classify each enumerated path against the workflow-artifact allowlist (loaded by reference from `agent/skills/_shared/workflow-artifact-paths.md`). Match by prefix-as-directory-boundary semantics: a path is 'under' a prefix when it begins with that prefix and the prefix ends with `/`. Apply the matching rule's directory-boundary semantics — `docs/specs/foo.md` matches `docs/specs/`; `docs/specs-archive/foo.md` does NOT match. Two outcomes follow: (a) all enumerated paths under the allowlist → workflow-drift outcome below; (b) at least one path outside the allowlist → mixed-changes menu below.
      - `Workflow-drift outcome (all paths under the allowlist):` Emit the following informational message to the user:

        > Scout brief at `<path>` was generated at SHA `<brief-sha>`; HEAD is now `<head-sha>`. Intervening commits modified only workflow artifacts (`docs/briefs/`, `docs/specs/`, `docs/todos/`, `docs/plans/`). Treating as expected workflow drift and continuing.

        Plan generation continues without prompting. The brief stays load-bearing for the planner dispatch (`{SCOUT_BRIEF}` is populated as before).

      - `Mixed-changes outcome (at least one path outside the allowlist):` Surface the following menu to the user. List ONLY the non-workflow paths (paths that failed the allowlist match), in the order returned by the enumeration (do not re-sort). Wait for user input. The orchestrator does NOT auto-default to `(c)` or `(x)`.

        > Scout brief at `<path>` was generated at SHA `<brief-sha>`; HEAD is now `<head-sha>`. Non-workflow files changed since the brief SHA:
        >
        >   - `<path1>`
        >   - `<path2>`
        >   - …
        >
        > The brief may be stale relative to source/config/agent changes.
        >
        > **(c) Continue with plan generation** — proceed despite the scout brief / HEAD difference.
        > **(x) Stop plan generation** — resolve manually before planning.

      - `Uninspectable sub-case A (missing or malformed brief SHA):` Fires when the `Git SHA:` line is missing from the brief preamble OR the captured SHA is not a 40-character lowercase hex string. No file list is rendered (no enumeration was attempted). Surface the following menu to the user:

        > Scout brief at `<path>` has no readable `Git SHA:` preamble line; cannot classify intervening changes against current HEAD `<head-sha>`. The brief may be stale.
        >
        > **(c) Continue with plan generation** — proceed despite the scout brief / HEAD difference.
        > **(x) Stop plan generation** — resolve manually before planning.

      - `Uninspectable sub-case B (brief SHA not reachable from HEAD):` Fires when the brief SHA is well-formed (40-char hex) but is not an ancestor of `HEAD` — for example because the SHA is unknown to this repo (rewritten out of local history, or generated against a different repo), OR because the SHA exists only on an unrelated branch and is therefore not reachable from `HEAD`. Before attempting enumeration, run `git merge-base --is-ancestor <brief-sha> HEAD`; a non-zero exit (including the unknown-revision error class, which also exits non-zero) means the SHA is not reachable from `HEAD` and this sub-case fires. Do NOT rely on `git rev-list --quiet <brief-sha>` or on `git diff <brief-sha>..HEAD` succeeding, because both can pass for SHAs that exist on other local branches but are not ancestors of `HEAD` — that would let unrelated changes be misclassified as workflow-only drift and bypass this checkpoint. No file list is rendered (the range is not enumerated). Surface the following menu to the user:

        > Scout brief at `<path>` was generated at SHA `<brief-sha>`; HEAD is now `<head-sha>`. Brief SHA is not reachable from HEAD; cannot classify intervening changes. The brief may be stale.
        >
        > **(c) Continue with plan generation** — proceed despite the scout brief / HEAD difference.
        > **(x) Stop plan generation** — resolve manually before planning.

      - `Uninspectable sub-case C (git command failure for any other reason):` Fires when any git failure not covered by sub-case B prevents HEAD computation or enumeration — e.g., `git rev-parse HEAD` fails, the ancestry check passed (sub-case B did not fire) but `git diff --name-only -z <brief-sha>..HEAD` still fails, `git` is not on PATH, repo corruption, or transient I/O error. For a HEAD-computation failure, render `<head-sha>` as `<unknown>` in the menu body. For an enumeration failure, use the current HEAD SHA. Capture the failing command's stderr verbatim (or trim leading/trailing whitespace WITHOUT paraphrasing — preserve the literal git error text) and include it as `<error>` in the menu body. No file list is rendered (enumeration failed or could not be attempted). Do NOT auto-retry the failing git command; a single failure surfaces the menu. Surface the following menu to the user:

        > Scout brief at `<path>` was generated at SHA `<brief-sha>`; HEAD is now `<head-sha>`. Could not enumerate intervening changes: `<error>`. The brief may be stale.
        >
        > **(c) Continue with plan generation** — proceed despite the scout brief / HEAD difference.
        > **(x) Stop plan generation** — resolve manually before planning.

      - `Menu response handling (applies to all four menu variants):` Recognize on letter shortcut and word alias. **(c) Continue / continue / yes** → continue Step 1b's remaining preamble work — populate `{SCOUT_BRIEF}` with `Scout brief: docs/briefs/<filename>` if not already populated, then proceed to the next preamble rule and on to Step 2 of the skill. The brief stays load-bearing for the planner dispatch. **(x) Stop / stop / no** → stop `generate-plan` immediately before Step 2. Do not dispatch the planner. Do not invoke `refine-plan`. Emit the verbatim terminal status message: `Plan generation stopped — scout brief / HEAD difference unresolved.` Then halt the skill — do not fall through to Step 2. Unrecognized responses re-prompt with the same menu body. Do not auto-default to either `(c)` or `(x)`.
- Lines that don't match one of the supported forms exactly are ignored.
- Matching lines that appear later in the document (outside the preamble, including inside fenced code blocks or examples) are ignored.

Then populate the remaining fields:

- Set `{TASK_ARTIFACT}` to `Task artifact: <input path>`.
- Set `{TASK_DESCRIPTION}` to an empty string (the artifact on disk IS the task description).
- If the input path is under `docs/specs/`, set `{SOURCE_SPEC}` to `Source spec: docs/specs/<filename>`. For other file inputs (RFCs, design docs at arbitrary paths), leave `{SOURCE_SPEC}` empty.

### 1c. Freeform description

Use the text as-is.

- Set `{TASK_DESCRIPTION}` to the freeform text.
- Set `{TASK_ARTIFACT}` to an empty string.
- Leave `{SOURCE_TODO}`, `{SOURCE_SPEC}`, and `{SCOUT_BRIEF}` empty.

## Step 2: Resolve model tiers

Tier-role assignment: plan generation uses `capable`. Run the model-dispatch helper:

```bash
python3 agent/skills/_shared/scripts/resolve-model-dispatch.py --tier capable --agent planner
```

On non-zero exit, surface its stderr output byte-equal (canonical Templates (1)–(4) from `_shared/model-tier-resolution.md`) and stop.

## Step 3: Generate the plan

1. Read [generate-plan-prompt.md](generate-plan-prompt.md) in this directory.
2. Fill placeholders:
   - `{TASK_DESCRIPTION}` — for todo and freeform inputs, the inlined text from Step 1. For file inputs, an empty string (the artifact on disk is the task description).
   - `{TASK_ARTIFACT}` — for file inputs, `Task artifact: <input path>`. For todo and freeform inputs, an empty string.
   - `{WORKING_DIR}` — absolute path to cwd
   - `{OUTPUT_PATH}` — `docs/plans/yyyy-MM-dd-<short-description>.md`
     - For **file inputs**, derive `<short-description>` from the **input filename** (basename without extension, e.g., `docs/specs/reduce-context.md` → `reduce-context`). Do NOT derive it from the document body — the body is not loaded into the orchestrator prompt.
     - For **todo inputs**, derive from the todo title.
     - For **freeform inputs**, derive from the task text.
   - `{SOURCE_TODO}` — `Source todo: TODO-<id>` when a source todo ID is available — either directly (input was a todo ID) or indirectly (extracted from a file's preamble `Source: TODO-<id>` line during provenance extraction in Step 1). Empty string otherwise.
   - `{SOURCE_SPEC}` — `Source spec: docs/specs/<filename>` if the input file path is under `docs/specs/`, empty string otherwise.
   - `{SCOUT_BRIEF}` — `Scout brief: docs/briefs/<filename>` if a scout brief was extracted from the file preamble and the brief file exists on disk, empty string otherwise.
3. Dispatch `planner` agent synchronously:
   ```
   subagent_run_serial { tasks: [
     { name: "planner", agent: "planner", task: "<filled template>", model: "<model from Step 2>", cli: "<cli from Step 2>" }
   ]}
   ```
   Read the planner's output from results[0].finalMessage — the planner writes the plan to disk; this result is the return message.

## Step 4: Refine the plan

After Step 3 produces the initial plan, invoke the `refine-plan` skill to run the review-edit loop and commit gate. `refine-plan` owns reviewer/editor dispatch, on-disk review artifacts, finding extraction, and version tracking — `generate-plan` does none of that itself.

Invoke `refine-plan` with these arguments:

- `PLAN_PATH = <plan path from Step 3>` — pass the plan file produced by the planner as the positional `PLAN_PATH` argument (e.g., `<plan path from Step 3>`), not as a flag.
- **Coverage source** (exactly one of):
  - **File-based inputs (Step 1b):** pass `--task-artifact <input path>`. The on-disk artifact is the coverage source.
  - **Todo inputs (Step 1a):** pass `--task-description "<todo body from {TASK_DESCRIPTION} in Step 3>"` AND `--source-todo TODO-<id>`. The inline body is the coverage source; the source-todo line is supplementary metadata.
  - **Freeform inputs (Step 1c):** pass `--task-description "<freeform text from {TASK_DESCRIPTION} in Step 3>"`. The inline body is the coverage source.
- `--scout-brief <path>` — only if a valid scout brief was extracted in Step 1 AND still exists on disk at refinement time. Omit otherwise.
- `--max-iterations 3`.
- `--auto-commit-on-approval` — always set when invoked from `generate-plan`.

`--structural-only` is NEVER passed by `generate-plan`. Every generate-plan input source has a coverage source: the file artifact for 1b, the inline body for 1a/1c.

`refine-plan` returns a compact summary (with `STATUS`, `COMMIT`, `PLAN_PATH`, `REVIEW_PATHS`, and optionally `STRUCTURAL_ONLY` and `FAILURE_REASON`). Step 5 consumes that summary.

## Step 5: Report result

Read the compact summary returned by `refine-plan` in Step 4. Show the user:

- `STATUS`
- `COMMIT`
- `PLAN_PATH`
- `REVIEW_PATHS`
- `STRUCTURAL_ONLY: yes` (only when present in the summary)

Then offer execute-plan:

> Plan written to `<PLAN_PATH>`. Want me to run execute-plan with this plan?

If `COMMIT: left_uncommitted` (which can happen only in standalone-style runs; auto-commit mode always commits on the approved path), prepend this note to the offer:

> Note: plan was left uncommitted. Proceeding with an uncommitted plan means edits made by execute-plan will land on top of an unstaged plan file.

Require explicit user confirmation before invoking execute-plan in that case. Do not auto-invoke execute-plan.

## Edge cases

- **Todo ID provided:** Read the todo body first with the `todo` tool and inline the full body in `{TASK_DESCRIPTION}`. The planner subagent does not have the `todo` tool, so the ID alone is not enough.
- **File path provided:** Pass by path via `{TASK_ARTIFACT}`. Do NOT inline the file body into `{TASK_DESCRIPTION}`. Only do a bounded preamble read (e.g., `head -n 40`) for provenance extraction. The planner reads the full artifact from disk.
- **Scout brief referenced but missing on disk:** Warn the user and continue planning without it. Do not block.
- **Refine-plan failures:** when refine-plan returns `STATUS: failed` (e.g. plan file missing, dispatch failure, review write failure), surface the `FAILURE_REASON` line to the user and skip the execute-plan offer until the underlying issue is resolved. Do not retry refine-plan automatically.
- **`docs/plans/` missing:** The subagent handles creating the directory; no action needed from the main agent.

## Scope note on path-based handoff

Path-based handoff in this skill applies to the initial `generate-plan -> planner` dispatch (Step 3); review/edit dispatches are now owned by `refine-plan` and follow `refine-plan`'s own handoff contract (which itself uses path-based handoff for the plan, task artifact, and scout brief). For the Step 3 dispatch, large durable artifacts — the original task artifact and any scout brief — are passed by filesystem path rather than inlined into the prompt. The planner reads them from disk per its input contract.

What remains inline:

- For todo and freeform runs, the original task description itself is inline in `{TASK_DESCRIPTION}` (Step 3). No temp artifact files are created just to force path-based handoff — todo/freeform inputs are not durable artifacts.
- Minimal provenance / safety metadata (`{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}`) stays inline.

`execute-plan` and `execute-plan -> coder` are out of scope for this handoff contract.
