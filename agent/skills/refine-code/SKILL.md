---
name: refine-code
description: "Iterative code review and remediation loop. Dispatches a code-refiner that alternates between reviewing and fixing until approved/approved_with_concerns or budget exhaustion. Usable standalone or from execute-plan."
---

# Refine Code

Automated review-remediate cycle. Dispatches a `code-refiner` subagent that drives the inner loop and reports back.

**Precondition:** Must be in a git repository. If `git rev-parse --git-dir` fails, stop with: "refine-code requires a git repository."

## Step 1: Gather inputs

Collect the following from the caller (coder, user, or another skill):

| Input | Required | Default | Source |
|-------|----------|---------|--------|
| `BASE_SHA` | yes | — | Caller provides (e.g., pre-refining SHA) |
| `HEAD_SHA` | yes | — | Caller provides or `git rev-parse HEAD` |
| Description | yes | — | What was implemented |
| Requirements/plan | no | empty | Plan file contents or spec |
| Max iterations | no | 3 | Caller or execution settings |
| Working directory | no | cwd | Worktree or project root |
| Review output path | no | `.pi/reviews/<name>-code-review` | Derived from plan name or caller-specified |

If `BASE_SHA` or `HEAD_SHA` is not provided, stop with an error — the skill cannot infer these.

## Step 2: Read model matrix

```bash
cat ~/.pi/agent/model-tiers.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

The model matrix provides tier mappings used by the coordinator:
- `crossProvider.capable` — first-pass and final verification reviews
- `crossProvider.standard` — coordinator model (pi-backed orchestration path)
- `standard` — hybrid re-reviews
- `capable` — remediator

### Dispatch resolution

Read [agent/skills/_shared/coordinator-dispatch.md](../_shared/coordinator-dispatch.md) and follow it to resolve the coordinator `(model, cli)` pair before Step 4. The shared file is the single authority for the four-tier chain, the skip-silently rule for non-`pi` tiers, and the two hard-stop conditions with their exact error messages. Do not duplicate that procedure here.

If the file doesn't exist or is unreadable, stop with: "refine-code requires ~/.pi/agent/model-tiers.json — see model matrix configuration."

## Step 3: Assemble coordinator prompt

Read [refine-code-prompt.md](refine-code-prompt.md) in this directory.

Fill placeholders:
- `{PLAN_GOAL}` — description of what was implemented
- `{PLAN_CONTENTS}` — full requirements/plan text (or empty string if none)
- `{BASE_SHA}` — from Step 1
- `{HEAD_SHA}` — from Step 1
- `{REVIEW_OUTPUT_PATH}` — review output base path (without version suffix or `.md` — the code-refiner adds those)
- `{MAX_ITERATIONS}` — from Step 1
- `{MODEL_MATRIX}` — full JSON output from Step 2
- `{WORKING_DIR}` — from Step 1

## Step 4: Dispatch code-refiner

Use the `(model, cli)` pair returned by the shared `coordinator-dispatch.md` procedure (Step 2). If the procedure hard-stopped, do not dispatch — surface the error from the shared file's `## Hard-stop conditions` section to the caller and exit.

```
subagent_run_serial { tasks: [
  { name: "code-refiner", agent: "code-refiner", task: "<filled refine-code-prompt.md>", model: "<resolved model from coordinator-dispatch.md>", cli: "<resolved cli from coordinator-dispatch.md — guaranteed pi>" }
]}
```

## Step 5: Handle code-refiner result

Parse `results[0].finalMessage` from the code-refiner for the STATUS line and stash the parsed outcome locally. **Do not report success to the caller in this step** — caller-facing success reporting is deferred until Step 6's provenance validation passes.

Determine the stashed outcome:

**`STATUS: approved`**
- Stash: review passed, iteration count, and review file path — to be reported to the caller only after Step 6 succeeds.

**`STATUS: approved_with_concerns`**
- Stash: review passed with waived Important findings, iteration count, review file path, and a note that the review file contains the waiver rationale in its `### Outcome` reasoning — to be reported to the caller only after Step 6 succeeds. No menu (this is a success-path status).

**`STATUS: not_approved_within_budget`**
- Stash: remaining findings and the choice menu below — to be presented to the caller only after Step 6 succeeds.
- Choices to offer (after Step 6 passes):
  - **(a) Keep iterating** — re-invoke this skill from Step 3 with the same inputs but `HEAD_SHA` updated to current HEAD (budget resets, new cycle)
  - **(b) Proceed with issues** — caller continues with known issues noted
  - **(c) Stop execution** — caller halts

For any other outcome (`STATUS: failed`, dispatch failure, unexpected status), surface it directly to the caller per the Edge Cases section; Step 6 is skipped.

The caller (execute-plan or user) makes the decision. This skill does not auto-continue. Proceed to Step 6 before reporting anything to the caller.

## Step 6: Validate review provenance

Run this validation only on `STATUS: approved`, `STATUS: approved_with_concerns`, or `STATUS: not_approved_within_budget`; skip on any other outcome (including `STATUS: failed`).

Build the list of review file paths to validate:

- The path the coordinator reported in its `## Review File` block (the latest versioned `<REVIEW_OUTPUT_PATH>-v<ERA>.md`). This is the only path validated under the reviewer-authored-artifact contract — the unversioned final copy at `<REVIEW_OUTPUT_PATH>.md` is no longer produced (per `refine-code-prompt.md`'s Final Verification Step 2 and `### On Budget Exhaustion`).

For each path, read the file and validate the first non-empty line:

1. The line MUST match the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$` — i.e. the literal markdown `**Reviewer:**`, a single space, a `<provider>/<model>` token (provider has no `/`, model has no whitespace), the literal ` via `, then a `<cli>` token (alphanumerics / `_` / `-`).
2. Extract `<provider>/<model>` and `<cli>` from the matched line.
3. The extracted value MUST NOT contain the substring `inline` (case-insensitive).
4. Read `~/.pi/agent/model-tiers.json` (re-read; do not assume Step 2's snapshot is still current). Resolve `crossProvider.capable` and `standard` to their concrete model strings, and resolve `dispatch[<provider>]` for each, using the primitive operations defined in [`agent/skills/_shared/model-tier-resolution.md`](../_shared/model-tier-resolution.md) (tier-path resolution, provider-prefix extraction, dispatch lookup).
5. On `STATUS: approved` or `STATUS: approved_with_concerns`: `<provider>/<model>` MUST equal the model string `crossProvider.capable` resolves to, and `<cli>` MUST equal `dispatch[<provider>]` for that model's provider prefix. The final-verification pass always runs at `crossProvider.capable` and is the last write to the file on the success path (whether the outcome is `Approved` or `Approved with concerns`).
6. On `STATUS: not_approved_within_budget`: `<provider>/<model>` MUST equal either the model string `crossProvider.capable` resolves to OR the model string `standard` resolves to (the two documented reviewer tiers in `refine-code-prompt.md`). `<cli>` MUST equal `dispatch[<provider>]` for that model's provider prefix.

On any validation failure (missing first line, malformed format, `inline` value, or model/cli mismatch), surface to the caller a single error of the form:

```
refine-code: review provenance validation failed at <path>: <specific check> — <observed value or "missing">.
```

Do NOT silently report `STATUS: approved`, `STATUS: approved_with_concerns`, or `STATUS: not_approved_within_budget` after a validation failure; the caller sees the validation error in place of the success status. Use a precise `<specific check>` label such as `first non-empty line missing`, `format mismatch`, `inline-substring forbidden`, `model/cli mismatch (expected <X> got <Y>)`.

When all paths pass validation, proceed to report the stashed outcome from Step 5 to the caller:
- `STATUS: approved` — report with iteration count and review file path; no menu.
- `STATUS: approved_with_concerns` — report with iteration count, review file path, and a note pointing the caller at the review file's `### Outcome` reasoning (which names the waived Important findings); no menu.
- `STATUS: not_approved_within_budget` — report with remaining findings and the (a)/(b)/(c) choice menu.

This is the only point at which Step 5's success outcome may reach the caller.

## Edge Cases

- **No changes in range** (`BASE_SHA` equals `HEAD_SHA`): Stop with "No changes to review."
- **Code-refiner fails to dispatch** (model unavailable, transport error, no `pi` tier resolves): defer to the shared `coordinator-dispatch.md` procedure. The shared file's two hard-stop conditions ("no tier resolves to `pi`" and "all `pi`-eligible tiers failed") are the only sanctioned outcomes here; do NOT declare a separate two-tier or three-tier fallback chain in this skill. Surface the shared file's verbatim error message to the caller and exit without dispatch.
- **Empty requirements**: Review is purely quality-focused — no spec compliance check. The code-refiner handles this (it passes empty `{PLAN_CONTENTS}` through to the reviewer).
