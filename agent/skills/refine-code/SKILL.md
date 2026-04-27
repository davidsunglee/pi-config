---
name: refine-code
description: "Iterative code review and remediation loop. Dispatches a code-refiner that alternates between reviewing and fixing until clean or budget exhausted. Usable standalone or from execute-plan."
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

After reading the model matrix, resolve the dispatch target for the `code-refiner` call from `crossProvider.standard` using the `dispatch` map from `model-tiers.json`. See execute-plan Step 6 for the full resolution algorithm.

The coordinator must run through a CLI that exposes pi orchestration tools (currently `openai-codex` → `pi` in `model-tiers.json`), so do not use top-level `standard` for this dispatch.

The `code-refiner` receives the full model matrix (including the `dispatch` map) as `{MODEL_MATRIX}` and resolves dispatch for its own subagent calls internally — see `refine-code-prompt.md`.

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

```
subagent_run_serial { tasks: [
  { name: "code-refiner", agent: "code-refiner", task: "<filled refine-code-prompt.md>", model: "<crossProvider.standard from model-tiers.json>", cli: "<dispatch for crossProvider.standard>" }
]}
```

## Step 5: Handle code-refiner result

Parse `results[0].finalMessage` from the code-refiner for the STATUS line:

**`STATUS: clean`**
- Report to caller: review passed, include iteration count and review file path
- No action needed

**`STATUS: max_iterations_reached`**
- Present remaining findings to caller
- Offer choices:
  - **(a) Keep iterating** — re-invoke this skill from Step 3 with the same inputs but `HEAD_SHA` updated to current HEAD (budget resets, new cycle)
  - **(b) Proceed with issues** — caller continues with known issues noted
  - **(c) Stop execution** — caller halts

The caller (execute-plan or user) makes the decision. This skill does not auto-continue.

## Edge Cases

- **No changes in range** (`BASE_SHA` equals `HEAD_SHA`): Stop with "No changes to review."
- **Code-refiner fails to dispatch** (model unavailable): Retry with `crossProvider.capable` from the model matrix (re-resolving dispatch for the fallback model). If that also fails, stop with error. Do not fall back to top-level `capable` for the coordinator dispatch; it may route to a CLI without pi orchestration tools.
- **Empty requirements**: Review is purely quality-focused — no spec compliance check. The code-refiner handles this (it passes empty `{PLAN_CONTENTS}` through to the reviewer).
