---
name: generate-plan
description: "Generates a structured implementation plan from a todo or spec file. Dispatches the planner subagent for deep codebase analysis, then runs an iterative review-edit loop. Use when the user wants to plan work before executing it."
---

Dispatch the `planner` subagent to analyze the codebase and produce a structured plan file in `.pi/plans/`, then review and refine the plan through an iterative review-edit loop.

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
  - `Scout brief: .pi/briefs/<filename>` → set `{SCOUT_BRIEF}` to `Scout brief: .pi/briefs/<filename>`, **then verify the referenced file exists on disk**:
    - If the brief file does not exist, warn the user (`Scout brief referenced in spec not found at <path> — proceeding without it.`), leave `{SCOUT_BRIEF}` empty, and continue without failing.
    - **Do NOT read the brief contents into the orchestrator prompt.** The planner reads the brief from disk itself — this is the whole point of path-based handoff.
- Lines that don't match one of the supported forms exactly are ignored.
- Matching lines that appear later in the document (outside the preamble, including inside fenced code blocks or examples) are ignored.

Then populate the remaining fields:

- Set `{TASK_ARTIFACT}` to `Task artifact: <input path>`.
- Set `{TASK_DESCRIPTION}` to an empty string (the artifact on disk IS the task description).
- If the input path is under `.pi/specs/`, set `{SOURCE_SPEC}` to `Source spec: .pi/specs/<filename>`. For other file inputs (RFCs, design docs at arbitrary paths), leave `{SOURCE_SPEC}` empty.

### 1c. Freeform description

Use the text as-is.

- Set `{TASK_DESCRIPTION}` to the freeform text.
- Set `{TASK_ARTIFACT}` to an empty string.
- Leave `{SOURCE_TODO}`, `{SOURCE_SPEC}`, and `{SCOUT_BRIEF}` empty.

## Step 2: Resolve model tiers

Read the model matrix from `~/.pi/agent/model-tiers.json`:

```bash
cat ~/.pi/agent/model-tiers.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

Model assignments:

| Role | Tier |
|------|------|
| Plan generation | `capable` from model-tiers.json |

Review and edit tier roles now live inside the `refine-plan` skill and the `plan-refiner` coordinator — `generate-plan` no longer dispatches the reviewer or editor itself.

### Dispatch resolution

Follow the canonical procedure in [`agent/skills/_shared/model-tier-resolution.md`](../_shared/model-tier-resolution.md) to resolve `(model, cli)` for the planner dispatch.

Parameters: `<agent> = planner`, `<tier> = capable`.

If a downstream consumer of this skill's resolution (such as a worker that re-resolves on `crossProvider.capable`) needs to fall back, the documented fallback target is `capable`; this skill's own planner dispatch uses `capable` directly and does not perform the re-resolution itself.

If `~/.pi/agent/model-tiers.json` is missing or unreadable, stop with the canonical Template (1) message from `_shared/model-tier-resolution.md` substituting `<agent> = planner`.

## Step 3: Generate the plan

1. Read [generate-plan-prompt.md](generate-plan-prompt.md) in this directory.
2. Fill placeholders:
   - `{TASK_DESCRIPTION}` — for todo and freeform inputs, the inlined text from Step 1. For file inputs, an empty string (the artifact on disk is the task description).
   - `{TASK_ARTIFACT}` — for file inputs, `Task artifact: <input path>`. For todo and freeform inputs, an empty string.
   - `{WORKING_DIR}` — absolute path to cwd
   - `{OUTPUT_PATH}` — `.pi/plans/yyyy-MM-dd-<short-description>.md`
     - For **file inputs**, derive `<short-description>` from the **input filename** (basename without extension, e.g., `.pi/specs/reduce-context.md` → `reduce-context`). Do NOT derive it from the document body — the body is not loaded into the orchestrator prompt.
     - For **todo inputs**, derive from the todo title.
     - For **freeform inputs**, derive from the task text.
   - `{SOURCE_TODO}` — `Source todo: TODO-<id>` when a source todo ID is available — either directly (input was a todo ID) or indirectly (extracted from a file's preamble `Source: TODO-<id>` line during provenance extraction in Step 1). Empty string otherwise.
   - `{SOURCE_SPEC}` — `Source spec: .pi/specs/<filename>` if the input file path is under `.pi/specs/`, empty string otherwise.
   - `{SCOUT_BRIEF}` — `Scout brief: .pi/briefs/<filename>` if a scout brief was extracted from the file preamble and the brief file exists on disk, empty string otherwise.
3. Dispatch `planner` agent synchronously:
   ```
   subagent_run_serial { tasks: [
     { name: "planner", agent: "planner", task: "<filled template>", model: "<capable from model-tiers.json>", cli: "<dispatch for capable>" }
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
- **`.pi/plans/` missing:** The subagent handles creating the directory; no action needed from the main agent.

## Scope note on path-based handoff

Path-based handoff in this skill applies to the initial `generate-plan -> planner` dispatch (Step 3); review/edit dispatches are now owned by `refine-plan` and follow `refine-plan`'s own handoff contract (which itself uses path-based handoff for the plan, task artifact, and scout brief). For the Step 3 dispatch, large durable artifacts — the original task artifact and any scout brief — are passed by filesystem path rather than inlined into the prompt. The planner reads them from disk per its input contract.

What remains inline:

- For todo and freeform runs, the original task description itself is inline in `{TASK_DESCRIPTION}` (Step 3). No temp artifact files are created just to force path-based handoff — todo/freeform inputs are not durable artifacts.
- Minimal provenance / safety metadata (`{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}`) stays inline.

`execute-plan` and `execute-plan -> coder` are out of scope for this handoff contract.
