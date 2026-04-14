---
name: generate-plan
description: "Generates a structured implementation plan from a todo or spec file. Dispatches the planner subagent for deep codebase analysis, then runs an iterative review-edit loop. Use when the user wants to plan work before executing it."
---

Dispatch the `planner` subagent to analyze the codebase and produce a structured plan file in `.pi/plans/`, then review and refine the plan through an iterative review-edit loop.

## Step 1: Determine the input source

The user will provide one of three input sources:

1. **Todo ID** (e.g., `TODO-7ef7d441`) — use the `todo` tool to read the todo and extract its full body. Do NOT pass just the ID; the subagent does not have the `todo` tool.
2. **File path** (e.g., a spec, RFC, or design doc) — use the `read` tool to load the file contents. Do NOT pass just the path; include the actual file contents in the prompt.
3. **Freeform description** — use the text as-is.

The resolved text becomes `{TASK_DESCRIPTION}`. If the input is a todo, also capture the ID for `{SOURCE_TODO}`.

## Step 2: Resolve model tiers

Read the model matrix from `~/.pi/agent/models.json`:

```bash
cat ~/.pi/agent/models.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

Model assignments:

| Role | Tier |
|------|------|
| Plan generation | `capable` from models.json |
| Plan review (primary) | `crossProvider.capable` from models.json |
| Plan review (fallback) | `capable` from models.json |
| Plan editing | `capable` from models.json |

Fallback is triggered by dispatch failure, not preemptively checked. On fallback, notify the user:
```
⚠️ Cross-provider plan review failed (<crossProvider.capable model>).
Falling back to same-provider review (<capable model>).
```

If `models.json` doesn't exist or is unreadable, stop with: "generate-plan requires `~/.pi/agent/models.json` — see model matrix configuration."

## Step 3: Generate the plan

1. Read [generate-plan-prompt.md](generate-plan-prompt.md) in this directory.
2. Fill placeholders:
   - `{TASK_DESCRIPTION}` — resolved text from Step 1
   - `{WORKING_DIR}` — absolute path to cwd
   - `{OUTPUT_PATH}` — `.pi/plans/yyyy-MM-dd-<short-description>.md` (derive short description from task)
   - `{SOURCE_TODO}` — `Source todo: TODO-<id>` if input was a todo, empty string otherwise
3. Dispatch `planner` agent synchronously:
   ```
   subagent { agent: "planner", task: "<filled template>", model: "<capable from models.json>" }
   ```

## Step 4: Review-edit loop

### 4.1: Review the plan

1. Read the generated plan file (path from planner's output).
2. Read [review-plan-prompt.md](review-plan-prompt.md) in this directory.
3. Fill placeholders:
   - `{PLAN_CONTENTS}` — full plan file contents
   - `{ORIGINAL_SPEC}` — original task description from Step 1
4. Determine review output path from the plan filename. For a plan at `.pi/plans/2026-04-13-my-feature.md`, the review path is `.pi/plans/reviews/2026-04-13-my-feature-plan-review-v1.md`.
5. Dispatch `plan-reviewer`:
   ```
   subagent {
     agent: "plan-reviewer",
     task: "<filled review-plan-prompt.md>",
     model: "<crossProvider.capable from models.json>"
   }
   ```
   If the cross-provider dispatch fails, retry with `capable` from models.json and notify the user (see Step 2 fallback message).
6. Write review output to the versioned path. Create `.pi/plans/reviews/` if it doesn't exist.

### 4.2: Assess review

Read the review output file. Parse for the Status line (`**[Approved]**` or `**[Issues Found]**`) and all issues (Error / Warning / Suggestion severity).

**If Approved (no errors):**
- If warnings or suggestions exist, append them as a `## Review Notes` section at the end of the plan file:
  ```markdown
  ## Review Notes

  _Added by plan reviewer — informational, not blocking._

  ### Warnings
  - **Task N**: <full warning text from review, including "What", "Why it matters", and "Recommendation">

  ### Suggestions
  - **Task N**: <full suggestion text from review, including "What", "Why it matters", and "Recommendation">
  ```
  The review file at `.pi/plans/reviews/` is kept for reference (do not delete it).
- Proceed to Step 5.

**If Issues Found (errors):**
- Continue to Step 4.3.

### 4.3: Edit the plan

1. Read [edit-plan-prompt.md](edit-plan-prompt.md) in this directory.
2. Fill placeholders:
   - `{PLAN_CONTENTS}` — current plan file contents
   - `{REVIEW_FINDINGS}` — full text of all error-severity findings from the review
   - `{ORIGINAL_SPEC}` — original task description from Step 1
   - `{OUTPUT_PATH}` — path to the current plan file (same path used in Step 3)
3. Dispatch `planner` with the filled template:
   ```
   subagent { agent: "planner", task: "<filled edit-plan-prompt.md>", model: "<capable from models.json>" }
   ```
4. The planner writes the edited plan back to the same path (overwriting the previous version).

### 4.4: Iterate or escalate

Loop back to Step 4.1 (re-review the edited plan). Max 3 iterations per era. Each iteration overwrites the current versioned review file.

**On convergence (Approved within budget):** proceed to Step 5.

**On budget exhaustion (3 iterations, errors persist):**

Present all remaining findings to the user and offer:
- **(a) Keep iterating** — reset budget, update plan version
- **(b) Proceed with issues** — report plan with findings noted

If **(a):** increment era (v1 → v2), create a new versioned review file (e.g., `-plan-review-v2.md`), loop back to Step 4.1 with fresh budget.

If **(b):** proceed to Step 5 with outstanding findings noted.

## Step 5: Report result

- Show the path to the generated plan file (e.g., `.pi/plans/2026-04-13-my-feature.md`)
- Report the review status:
  - **Clean:** "Plan reviewed — no issues found."
  - **Clean with notes:** "Plan reviewed — N warnings/suggestions appended as Review Notes."
  - **Proceeded with issues:** "Plan reviewed — N outstanding issues noted. Review: `<review-path>`"
- Suggest running it with the `execute-plan` skill.

## Edge cases

- **Todo ID provided:** Read the todo body first with the `todo` tool, include the full body text in the prompt — do not pass only the ID.
- **File path provided:** Read the file first with the `read` tool, include its full contents in the prompt — do not pass only the path.
- **`.pi/plans/` missing:** The subagent handles creating the directory; no action needed from the main agent.
- **`.pi/plans/reviews/` missing:** Create it before writing the review file.
