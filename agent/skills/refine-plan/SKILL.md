---
name: refine-plan
description: "Iterative plan review and edit loop. Dispatches a plan-refiner that alternates between reviewing and editing until approved or budget exhausted. Owns the plan-artifact commit gate. Usable standalone or from generate-plan."
---

# Refine Plan

Automated review-edit cycle for a written plan. Dispatches a `plan-refiner` subagent that drives the inner loop, reports back, and lets this skill own the commit gate.

**Precondition:** Must be in a git repository. If `git rev-parse --git-dir` fails, stop with: "refine-plan requires a git repository."

## Step 1: Gather inputs

Collect the following from the caller (user, `generate-plan`, or another skill):

| Input | Required | Default | Source |
|-------|----------|---------|--------|
| `PLAN_PATH` | yes | — | Caller positional argument (path to the plan file) |
| `TASK_ARTIFACT` | no | derived from plan preamble | Auto-discovered from the plan's `**Spec:**` line; override with `--task-artifact <path>` |
| `TASK_DESCRIPTION` | no | empty | Set via `--task-description <text>` — the inline body of the original spec/todo. Used as the coverage source when no on-disk task artifact is available; callers like `generate-plan` pass this through for todo/freeform inputs |
| `SOURCE_SPEC` | no | derived from plan preamble | Auto-discovered from the plan's `**Spec:**` line; supplementary metadata and, when the file exists, the default source for `TASK_ARTIFACT` |
| `SOURCE_TODO` | no | derived from plan preamble | Auto-discovered from the plan's `**Source:**` line; override with `--source-todo TODO-<id>`. Supplementary metadata only — not a coverage source on its own |
| `SCOUT_BRIEF` | no | derived from plan preamble | Auto-discovered from the plan's `**Scout brief:**` line; override with `--scout-brief <path>`. Supplementary reference context, not a coverage source on its own |
| `STRUCTURAL_ONLY` | no | `false` | Set true via `--structural-only` to opt in to a coverage-blind review |
| `MAX_ITERATIONS` | no | 3 | Caller flag |
| `AUTO_COMMIT_ON_APPROVAL` | no | `false` | Set true by callers like `generate-plan` so the commit gate runs without prompting |
| `WORKING_DIR` | no | cwd | Caller flag |

If `PLAN_PATH` is missing, stop with: "refine-plan: PLAN_PATH is required."

## Step 2: Validate plan path

Run `test -s <PLAN_PATH>` (file exists and is non-empty regular file). On failure, stop with:

```
refine-plan: plan file <PLAN_PATH> missing or empty.
```

## Step 3: Auto-discover provenance from plan preamble

Read a bounded preamble from the plan file (e.g., `head -n 40 <PLAN_PATH>`) and apply strict exact-match rules. Lines that count:

- `**Spec:** ` followed by `` `docs/specs/<filename>` `` (with surrounding backticks; also accept the same path written without backticks) → set `SOURCE_SPEC = "Source spec: docs/specs/<filename>"`, and (if not already set) set `TASK_ARTIFACT = "docs/specs/<filename>"`.
- `**Source:** TODO-<id>` → set `SOURCE_TODO = "Source todo: TODO-<id>"`.
- `**Scout brief:** ` followed by `` `docs/briefs/<filename>` `` → set `SCOUT_BRIEF = "Scout brief: docs/briefs/<filename>"`.

Apply CLI overrides (`--task-artifact`, `--source-todo`, `--scout-brief`) on top of any auto-discovered values — overrides win.

After resolution, verify each referenced on-disk path exists (`TASK_ARTIFACT`, `SCOUT_BRIEF`). If a referenced file does not exist, drop that field with a warning:

```
Provenance file <path> referenced in plan preamble not found — proceeding without it.
```

Continue without that field.

## Step 4: Gate on coverage source availability

After Step 3, the skill must have a usable coverage source for the plan reviewer unless `STRUCTURAL_ONLY` is `true`. A coverage source is one of:

- (a) a non-empty `TASK_ARTIFACT` resolved to an existing on-disk file, or
- (b) a non-empty `TASK_DESCRIPTION` (inline body of the original spec/todo).

If `STRUCTURAL_ONLY` is `false` AND both `TASK_ARTIFACT` and `TASK_DESCRIPTION` are empty, stop with:

```
refine-plan: no coverage source available and --structural-only not set. Provide --task-artifact <path>, --task-description <text>, or pass --structural-only to opt in to a coverage-blind review.
```

`SOURCE_TODO`, `SOURCE_SPEC`, and `SCOUT_BRIEF` are pointer/metadata fields and do **not** satisfy this gate on their own — the reviewer needs an actual body (`TASK_DESCRIPTION`) or an on-disk artifact (`TASK_ARTIFACT`) to perform Spec/Todo Coverage. Otherwise proceed.

## Step 5: Read model matrix

```bash
cat ~/.pi/agent/model-tiers.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

If the file is missing or unreadable, stop with: "refine-plan requires ~/.pi/agent/model-tiers.json — see model matrix configuration."

### Dispatch resolution

Read [agent/skills/_shared/coordinator-dispatch.md](../_shared/coordinator-dispatch.md) and follow it to resolve the coordinator `(model, cli)` pair before Step 8. The shared file is the single authority for the four-tier chain, the skip-silently rule for non-`pi` tiers, and the two hard-stop conditions with their exact error messages. Do not duplicate that procedure here.

## Step 6: Allocate starting era

Compute:

- `PLAN_BASENAME` = basename of `PLAN_PATH` with the `.md` extension stripped.
- `REVIEW_OUTPUT_PATH` = `docs/plans/reviews/<PLAN_BASENAME>-plan-review` (no version suffix or `.md` — `plan-refiner` adds those).

Create `docs/plans/reviews/` if it does not exist.

Scan the reviews directory for the highest existing era number for this plan:

```bash
ls docs/plans/reviews/ 2>/dev/null \
  | grep -E "^${PLAN_BASENAME}-plan-review-v[0-9]+\.md$" \
  | sed -E 's/.*-v([0-9]+)\.md$/\1/' \
  | sort -n \
  | tail -1
```

Set `STARTING_ERA = max_existing + 1`. If no matches found, `STARTING_ERA = 1`.

## Step 7: Assemble coordinator prompt

Read [refine-plan-prompt.md](refine-plan-prompt.md) in this directory.

Fill placeholders:

- `{PLAN_PATH}` — from Step 1.
- `{TASK_ARTIFACT}` — `Task artifact: <path>` if set, else empty string.
- `{SOURCE_TODO}` — `Source todo: TODO-<id>` if set, else empty string.
- `{SOURCE_SPEC}` — `Source spec: docs/specs/<filename>` if set, else empty string.
- `{SCOUT_BRIEF}` — `Scout brief: docs/briefs/<filename>` if set, else empty string.
- `{ORIGINAL_SPEC_INLINE}` — the `TASK_DESCRIPTION` from Step 1. Populated for todo/freeform inputs forwarded by `generate-plan` via `--task-description`, populated when a standalone caller passes `--task-description <text>`, and empty for file-based inputs that supply `TASK_ARTIFACT` instead.
- `{STRUCTURAL_ONLY_NOTE}` — non-empty paragraph if `STRUCTURAL_ONLY` is true; empty string otherwise (see Step 7.5).
- `{MAX_ITERATIONS}` — from Step 1.
- `{STARTING_ERA}` — from Step 6.
- `{REVIEW_OUTPUT_PATH}` — from Step 6.
- `{WORKING_DIR}` — from Step 1.
- `{MODEL_MATRIX}` — full JSON output from Step 5.

### Step 7.5: Compose structural-only note

When `STRUCTURAL_ONLY` is `true`, replace `{STRUCTURAL_ONLY_NOTE}` with exactly:

```
This is a structural-only review run. No original spec or todo is available. The plan-reviewer must skip the Spec/Todo Coverage check and include the literal phrase "Structural-only review — no spec/todo coverage check performed." inside the `### Outcome` section's `**Reasoning:**` line (the Summary section no longer exists in the new output format).
```

When `STRUCTURAL_ONLY` is `false`, replace `{STRUCTURAL_ONLY_NOTE}` with the empty string.

## Step 8: Dispatch plan-refiner

Use the `(model, cli)` pair returned by the shared `coordinator-dispatch.md` procedure (Step 5). If the procedure hard-stopped, do not dispatch — surface the error from the shared file's `## Hard-stop conditions` section to the caller, set `STATUS = failed` with reason `coordinator-dispatch: <verbatim error message>`, and skip to Step 11.

```
subagent_run_serial { tasks: [
  { name: "plan-refiner", agent: "plan-refiner", task: "<filled refine-plan-prompt.md>", model: "<resolved model from coordinator-dispatch.md>", cli: "<resolved cli from coordinator-dispatch.md — guaranteed pi>" }
]}
```

## Step 9: Parse and validate coordinator result

Read `results[0].finalMessage`. Parse:

- The `STATUS:` line (`approved`, `approved_with_concerns`, `not_approved_within_budget`, or `failed`).
- The `## Plan File` block — exactly one path.
- The `## Review Files` block — a list of one path per `plan-refiner` invocation (one invocation = one era).
- The optional `## Structural-Only Label` block — used to record whether the run was structural-only.

Validate every parsed path with `test -s <path>` (non-empty regular file). On any path validation failure, set `STATUS = failed` with reason `coordinator returned <path> but file is missing or empty` and skip to Step 11.

## Step 9.5: Validate review provenance

Run this validation only on `STATUS: approved`, `STATUS: approved_with_concerns`, or `STATUS: not_approved_within_budget`; skip on `STATUS: failed` (no review file is guaranteed to exist on failure).

For each review file path in the `## Review Files` list parsed in Step 9, read the file and validate the first non-empty line:

1. The line MUST match the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$` — i.e. the literal markdown `**Reviewer:**`, a single space, a `<provider>/<model>` token (provider has no `/`, model has no whitespace), the literal ` via `, then a `<cli>` token (alphanumerics / `_` / `-`).
2. Extract `<provider>/<model>` and `<cli>` from the matched line.
3. The extracted value MUST NOT contain the substring `inline` (case-insensitive).
4. Read `~/.pi/agent/model-tiers.json` (re-read; do not assume Step 5's snapshot is still current). Resolve `crossProvider.capable` and `capable` to their concrete model strings, and resolve `dispatch[<provider>]` for each, using the primitive operations defined in [`agent/skills/_shared/model-tier-resolution.md`](../_shared/model-tier-resolution.md) (tier-path resolution, provider-prefix extraction, dispatch lookup).
5. `<provider>/<model>` MUST equal either the model string `crossProvider.capable` resolves to OR the model string `capable` resolves to (the two documented reviewer tiers in `refine-plan-prompt.md`'s `plan-reviewer` primary + fallback chain). `<cli>` MUST equal `dispatch[<provider>]` for that model's provider prefix.

On any validation failure (missing first line, malformed format, `inline` value, or model/cli mismatch), set `STATUS = failed` with reason `review provenance validation failed at <path>: <specific check>` and skip to Step 11. Do NOT proceed to Step 10's commit gate after a validation failure.

When all paths pass validation, proceed to Step 10.

## Step 10: Handle STATUS

### `STATUS: approved`

If `AUTO_COMMIT_ON_APPROVAL` is true, jump directly to the commit invocation in Step 10a. Otherwise, prompt the user:

```
refine-plan: plan approved. Commit plan + review artifacts? (y/n)
```

On `Y` or empty, run Step 10a. On `n`, set `COMMIT = left_uncommitted` and skip to Step 11.

### `STATUS: approved_with_concerns`

Same handling as `STATUS: approved`, with the prompt updated to surface the waiver:

```
refine-plan: plan approved with concerns (Important findings waived — see Review Notes appended to the plan). Commit plan + review artifacts? (y/n)
```

Behavior is identical to `STATUS: approved` from here: on `Y` or empty (or with `AUTO_COMMIT_ON_APPROVAL` true), run Step 10a; on `n`, set `COMMIT = left_uncommitted` and skip to Step 11. The plan file already has the `## Review Notes` section appended by the `plan-refiner` per `refine-plan-prompt.md` Step 9 — Step 10a's commit will include that edit.

### `STATUS: not_approved_within_budget`

Present the budget-exhaustion menu exactly as:

- **(a)** Commit current era's plan + review artifacts, then keep iterating into era v`<STARTING_ERA + 1>` with a fresh budget.
- **(b)** Stop here and proceed with issues; commit gate runs based on `AUTO_COMMIT_ON_APPROVAL`.

**On `(a)`:** Run Step 10a (commit current era). Step 10a MUST succeed (`COMMIT = committed`) before the next era is dispatched. If Step 10a sets `COMMIT = not_attempted` (commit failed for any reason — pre-commit hook failure, dirty index, underlying error), STOP refinement immediately: preserve `STATUS = not_approved_within_budget` and the `COMMIT = not_attempted [reason]` value from Step 10a, do **NOT** dispatch the next era, and skip directly to Step 11. Continuing into a fresh era after a failed commit would leave the prior era's edits uncommitted while a new era runs — the abandoned-state recovery hazard the spec's two-option menu was designed to prevent.

Only when Step 10a sets `COMMIT = committed` may the skill re-run from Step 6 onward, with `STARTING_ERA` recomputed by re-scanning `docs/plans/reviews/` (it will now reflect the just-committed file plus any uncommitted files; the rule remains `max(existing_N) + 1`). Loop until either `STATUS: approved` / `STATUS: approved_with_concerns` (proceed normally) or the user picks `(b)`.

**On `(b)`:** In `AUTO_COMMIT_ON_APPROVAL = true` mode, run Step 10a (auto-commit). In standalone mode, prompt:

```
Commit current plan + review artifacts? (y/n)
```

Run Step 10a on `Y`/empty; set `COMMIT = left_uncommitted` on `n`.

### `STATUS: failed`

Skip the commit gate entirely. Set `COMMIT = not_attempted`. Proceed to Step 11.

## Step 10a: Invoke commit skill

Invoke the `commit` skill with **concrete file paths only**: the plan path and the list of concrete review paths written during the current `refine-plan` run (collected across any iteration loops in Step 10). No globs, no wildcards, no older-version review files from prior standalone runs.

Pass the file paths as arguments along with a commit message of the form `chore(plan): refine <PLAN_BASENAME>` (or `feat(plan): ...` if appropriate — defer to the `commit` skill's conventional-commits inference).

On `commit` skill failure (non-zero exit, pre-commit hook failure, dirty index), capture the error message and set `COMMIT = not_attempted` with the underlying error stored for Step 11.

On success, set `COMMIT = committed`. The actual SHA is reported by the `commit` skill itself; the refine-plan summary surfaces `committed` plus the SHA when available.

## Step 11: Report result

Output exactly:

```
STATUS: <approved | approved_with_concerns | not_approved_within_budget | failed>
COMMIT: <committed [sha] | left_uncommitted | not_attempted [reason]>
PLAN_PATH: <path>
REVIEW_PATHS:
- <path1>
- <path2>
STRUCTURAL_ONLY: <yes | no>
```

Do **NOT** include full review text. Do **NOT** include per-iteration findings inline.

If `STATUS: failed`, include an additional line:

```
FAILURE_REASON: <one-line reason>
```

The `REVIEW_PATHS` list contains every review file written during the entire `refine-plan` run (one per era that ran, including any era-(b) decisions and option-(a) commit-and-continue eras).

## Edge Cases

- **`commit` skill not present**: stop with a clear error pointing at `agent/skills/commit/SKILL.md`.
- **Coordinator dispatch CLI is not `pi`**: defer to the shared `coordinator-dispatch.md` procedure. The shared file's two hard-stop conditions ("no tier resolves to `pi`" and "all `pi`-eligible tiers failed") are the only sanctioned outcomes here; the prior cross-reference to `refine-code` is removed because the shared file is the single authority for both skills. Surface the shared file's verbatim error message to the caller, set `STATUS = failed` with the verbatim error as the reason, and exit.
- **Plan path is in `docs/plans/done/` or another archived location**: proceed normally; era allocation still scans `docs/plans/reviews/` keyed by `PLAN_BASENAME`.
- **Coordinator returns paths outside `docs/plans/reviews/`**: treat as `STATUS: failed` with reason `coordinator returned review path outside docs/plans/reviews/`.
