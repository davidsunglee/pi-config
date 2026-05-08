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
| Review output path | no | `docs/reviews/<name>-code-review` | Derived from plan name or caller-specified |

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

Fill `refine-code-prompt.md` by invoking `agent/skills/refine-code/scripts/fill-refine-code-prompt.py --plan-goal <path-to-description-or--for-stdin> --plan-contents <path-to-plan-contents-or--for-stdin> --base-sha <BASE_SHA> --head-sha <HEAD_SHA> --review-output-path <REVIEW_OUTPUT_PATH> --max-iterations <MAX_ITERATIONS> --model-matrix <path-to-model-matrix-json> --working-dir <WORKING_DIR> --output <filled-prompt-path>`. The helper enforces single-pass literal substitution and fails closed on any unreplaced placeholder.

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

Use the path the coordinator reported in its `## Review File` block (the latest versioned `<REVIEW_OUTPUT_PATH>-v<ERA>.md`) as `<path>`.

- On `STATUS: approved` or `STATUS: approved_with_concerns`: invoke `agent/skills/_shared/scripts/validate-review-provenance.py --review-file <path> --allowed-tiers crossProvider.capable`.
- On `STATUS: not_approved_within_budget`: invoke `agent/skills/_shared/scripts/validate-review-provenance.py --review-file <path> --allowed-tiers crossProvider.capable,standard`.

On non-zero exit, surface `refine-code: review provenance validation failed at <path>: <specific check>` to the caller and do not report the stashed success.

When validation passes, proceed to report the stashed outcome from Step 5 to the caller.

**Caller-facing reporting format (contract).** This skill's caller — including `execute-plan` Step 15, which parses the report with `parse-refine-code-summary.py` — depends on a strict producer/consumer protocol. Forward the code-refiner's `finalMessage` to the caller verbatim, preserving the exact compact format defined in [refine-code-prompt.md](refine-code-prompt.md)'s `## Output Format` section: the leading `STATUS:` line, the `## Summary` block (with `Iterations:`, `Issues found: <X> (<N> Critical, <N> Important, <N> Minor)`, `Issues fixed:`, `Issues remaining:` lines), the `## Review File` block, and — only on the corresponding statuses — the `## Remaining Issues` and `## Failure Reason` blocks. Do NOT rewrite, paraphrase, summarize, or wrap this content in narrative prose; doing so will fail the parser even though the underlying review succeeded.

Per-status additions on top of the verbatim forwarded format:
- `STATUS: approved` — no additions; no menu.
- `STATUS: approved_with_concerns` — append a note pointing the caller at the review file's `### Outcome` reasoning (which names the waived Important findings); no menu.
- `STATUS: not_approved_within_budget` — append the (a)/(b)/(c) choice menu after the forwarded blocks.

This is the only point at which Step 5's success outcome may reach the caller.

## Edge Cases

- **No changes in range** (`BASE_SHA` equals `HEAD_SHA`): Stop with "No changes to review."
- **Code-refiner fails to dispatch** (model unavailable, transport error, no `pi` tier resolves): defer to the shared `coordinator-dispatch.md` procedure. The shared file's two hard-stop conditions ("no tier resolves to `pi`" and "all `pi`-eligible tiers failed") are the only sanctioned outcomes here; do NOT declare a separate two-tier or three-tier fallback chain in this skill. Surface the shared file's verbatim error message to the caller and exit without dispatch.
- **Empty requirements**: Review is purely quality-focused — no spec compliance check. The code-refiner handles this (it passes empty `{PLAN_CONTENTS}` through to the reviewer).
