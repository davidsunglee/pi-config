---
name: generate-plan
description: "Generates a structured implementation plan from a todo or spec file. Dispatches the plan-generator subagent for deep codebase analysis. Use when the user wants to plan work before executing it."
---

Dispatch the `plan-generator` subagent to analyze the codebase and produce a structured plan file in `.pi/plans/`.

## Step 1: Determine the input source

The user will provide one of three input sources:

1. **Todo ID** (e.g., `TODO-7ef7d441`) — use the `todo` tool to read the todo and extract its full body. Do NOT pass just the ID; the subagent does not have the `todo` tool.
2. **File path** (e.g., a spec, RFC, or design doc) — use the `read` tool to load the file contents. Do NOT pass just the path; include the actual file contents in the prompt.
3. **Freeform description** — use the text as-is.

## Step 2: Assemble the task prompt for the subagent

Build a prompt string that includes:
- The full task description (todo body, file contents, or freeform text)
- The current working directory / repo name for context
- An instruction to write the plan to `.pi/plans/yyyy-MM-dd-<short-description>.md` (the subagent will create the directory if it doesn't exist)
- If the input source is a todo: include `Source todo: TODO-<id>` on its own line after the task description. This tells the plan-generator to add a `**Source:** TODO-<id>` field to the plan header.

Example prompt structure (when source is a todo):
```
Analyze the codebase at <cwd> and produce a structured implementation plan.

Task (from TODO-<id>):
<full todo body>

Source todo: TODO-<id>

Write the plan to .pi/plans/<yyyy-MM-dd-short-description>.md.
```

Example prompt structure (when source is a file or freeform):
```
Analyze the codebase at <cwd> and produce a structured implementation plan.

Task:
<full task description / file contents / freeform text>

Write the plan to .pi/plans/<yyyy-MM-dd-short-description>.md.
```

## Step 3: Dispatch the subagent

Run the `plan-generator` subagent synchronously:
```
subagent { agent: "plan-generator", task: "<assembled prompt>" }
```

**Async option:** If the analysis will be long-running and the user wants to continue other work, dispatch asynchronously:
```
subagent { agent: "plan-generator", task: "<assembled prompt>", async: true }
```
If run async, tell the user they can check progress with `subagent_status`.

**Note:** Async dispatch skips the review step (Step 3.5) since the plan isn't available yet. When the plan-generator completes, suggest the user run plan review by re-invoking this skill with the generated plan path. The user can opt out, but review is recommended.

## Step 3.5: Review the generated plan

After the plan-generator completes, dispatch a reviewer to check for structural issues before presenting the plan to the user.

### 1. Read the generated plan

Read the plan file that the plan-generator just wrote (the path from its output, e.g., `.pi/plans/2026-04-06-my-feature.md`).

### 2. Read the prompt template and fill placeholders

Read [plan-reviewer.md](plan-reviewer.md) in this directory.

Fill these placeholders:
- `{PLAN_CONTENTS}` — the full contents of the generated plan file
- `{ORIGINAL_SPEC}` — the original task description (todo body, file contents, or freeform text from Step 1)

### 3. Select the review model

Read `modelTiers` from `~/.pi/agent/settings.json` (use `cat` + `python3 -c` as in execute-plan Step 6).

Use `modelTiers.crossProvider.capable` for cross-provider review.

**Fallback:** If the dispatch fails (model unavailable, provider error), retry with `modelTiers.capable` (same provider) and notify the user:
```
⚠️ Cross-provider plan review failed (<modelTiers.crossProvider.capable>).
Falling back to same-provider review (<modelTiers.capable>).
```

### 4. Dispatch the reviewer

Determine the review output path from the plan filename. For a plan at `.pi/plans/2026-04-06-my-feature.md`, the review path is `.pi/plans/reviews/2026-04-06-my-feature-review.md`.

```
subagent {
  agent: "plan-executor",
  task: "<filled plan-reviewer.md template>",
  model: "<modelTiers.crossProvider.capable>",
  output: ".pi/plans/reviews/<plan-name>-review.md"
}
```

If the cross-provider model failed and fallback is in effect, use `modelTiers.capable` instead. The `output` path remains the same regardless of which model is used.

### 5. Handle reviewer findings

Read the full review from the output file:

```
Read .pi/plans/reviews/<plan-name>-review.md
```

Parse the review file contents for the Status line (`[Approved]` or `[Issues Found]`) and all issues (errors, warnings, suggestions with task numbers and descriptions).

**If errors found (`[Issues Found]` with any Error-severity issues):**
- Present all findings from the review file (full text of each error, warning, and suggestion) to the user.
- The user decides:
  - **Re-generate:** Re-run Step 3 with the reviewer findings appended to the plan-generator prompt (so the generator can address them). Then re-run Step 3.5. **Re-generate at most once.** If errors persist after one re-generation, present the plan to the user with all findings and let them manually fix or proceed as-is.
  - **Manually fix:** The user edits the plan file themselves. Skip to Step 4.

**If only warnings/suggestions (no errors):**
- Append the findings as a `## Review Notes` section at the end of the plan file, using the **full text** of each finding from the review file:

```markdown
## Review Notes

_Added by plan reviewer — informational, not blocking._

### Warnings
- **Task N**: <full warning text from review, including "What", "Why it matters", and "Recommendation">

### Suggestions
- **Task N**: <full suggestion text from review, including "What", "Why it matters", and "Recommendation">
```

The review file at `.pi/plans/reviews/<plan-name>-review.md` is kept for reference (do not delete it).

- Continue to Step 4.

**If clean (`[Approved]` with no issues):**
- Continue to Step 4 with no changes to the plan file.

## Step 4: Report the result

After the review step completes:
- Show the path to the generated plan file (e.g., `.pi/plans/2026-04-06-my-feature.md`)
- Report the review status:
  - **Approved:** "Plan reviewed — no issues found."
  - **Approved with notes:** "Plan reviewed — N warnings/suggestions appended as Review Notes."
  - **Errors found:** Already handled in Step 3.5 (user chose to re-generate or manually fix).
- Suggest running it with the `execute-plan` skill: `/skill:execute-plan`

## Edge cases

- **Todo ID provided:** Read the todo body first with the `todo` tool, include the full body text in the prompt — do not pass only the ID.
- **File path provided:** Read the file first with the `read` tool, include its full contents in the prompt — do not pass only the path.
- **`.pi/plans/` missing:** The subagent handles creating the directory; no action needed from the main agent.
