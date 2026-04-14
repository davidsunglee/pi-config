---
name: review-loop
description: "Iterative code review and remediation loop. Dispatches a remediation-coordinator that alternates between reviewing and fixing until clean or budget exhausted. Usable standalone or from execute-plan."
---

# Review Loop

Automated review-remediate cycle. Dispatches a `remediation-coordinator` subagent that drives the inner loop and reports back.

**Precondition:** Must be in a git repository. If `git rev-parse --git-dir` fails, stop with: "review-loop requires a git repository."

## Step 1: Gather inputs

Collect the following from the caller (execute-plan, user, or another skill):

| Input | Required | Default | Source |
|-------|----------|---------|--------|
| `BASE_SHA` | yes | — | Caller provides (e.g., pre-execution SHA) |
| `HEAD_SHA` | yes | — | Caller provides or `git rev-parse HEAD` |
| Description | yes | — | What was implemented |
| Requirements/plan | no | empty | Plan file contents or spec |
| Max iterations | no | 3 | Caller or execution settings |
| Working directory | no | cwd | Worktree or project root |
| Review output path | no | `.pi/reviews/<name>-code-review` | Derived from plan name or caller-specified |

If `BASE_SHA` or `HEAD_SHA` is not provided, stop with an error — the skill cannot infer these.

## Step 2: Read model matrix

```bash
cat ~/.pi/agent/models.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

The model matrix provides tier mappings used by the coordinator:
- `crossProvider.capable` — first-pass and final verification reviews
- `standard` — hybrid re-reviews, coordinator model
- `capable` — remediator

If the file doesn't exist or is unreadable, stop with: "review-loop requires ~/.pi/agent/models.json — see model matrix configuration."

## Step 3: Assemble coordinator prompt

Read [remediation-prompt.md](remediation-prompt.md) in this directory.

Fill placeholders:
- `{PLAN_GOAL}` — description of what was implemented
- `{PLAN_CONTENTS}` — full requirements/plan text (or empty string if none)
- `{BASE_SHA}` — from Step 1
- `{HEAD_SHA}` — from Step 1
- `{REVIEW_OUTPUT_PATH}` — review output base path (without version suffix or `.md` — the coordinator adds those)
- `{MAX_ITERATIONS}` — from Step 1
- `{MODEL_MATRIX}` — full JSON output from Step 2
- `{WORKING_DIR}` — from Step 1

## Step 4: Dispatch remediation-coordinator

```
subagent {
  agent: "remediation-coordinator",
  task: "<filled remediation-prompt.md>",
  model: "<standard from model matrix>"
}
```

## Step 5: Handle coordinator result

Parse the coordinator's response for the STATUS line:

**`STATUS: clean`**
- Report to caller: review passed, include iteration count and review file path
- No action needed

**`STATUS: max_iterations_reached`**
- Present remaining findings to caller
- Offer choices:
  - **(a) Continue iterating** — re-invoke this skill from Step 3 with the same inputs but `HEAD_SHA` updated to current HEAD (budget resets, new era)
  - **(b) Proceed** — caller continues with known issues noted
  - **(c) Stop** — caller halts

The caller (execute-plan or user) makes the decision. This skill does not auto-continue.

## Edge Cases

- **No changes in range** (`BASE_SHA` equals `HEAD_SHA`): Stop with "No changes to review."
- **Coordinator fails to dispatch** (model unavailable): Retry with `capable` from the model matrix (same provider fallback). If that also fails, stop with error.
- **Empty requirements**: Review is purely quality-focused — no spec compliance check. The coordinator handles this (it passes empty `{PLAN_CONTENTS}` through to the reviewer).
