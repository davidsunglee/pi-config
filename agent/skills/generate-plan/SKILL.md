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

**Provenance extraction (file-path inputs only):** When the input is a file, parse provenance references from the file preamble — the lines between the `# Title` and the first `## ` heading. Ignore any matching lines later in the document (including inside fenced code blocks or examples). Require exact prefix matches:

- `Source: TODO-<id>` — capture the todo ID for `{SOURCE_TODO}`. This allows provenance to flow through from define-spec: the spec references the original todo, and generate-plan passes it to the planner.
- `Scout brief: .pi/briefs/<filename>` — read the referenced brief file and append its contents to `{TASK_DESCRIPTION}` under a `## Codebase Brief` heading. Also capture the brief file path for `{SOURCE_BRIEF}`. If the referenced file does not exist, warn the user ("Scout brief referenced in spec not found at `<path>` — proceeding without it."), leave `{SOURCE_BRIEF}` as an empty string, and continue without appending brief content.

Set `{SOURCE_SPEC}` only when the input file path is under `.pi/specs/`. For other file inputs (RFCs, design docs at arbitrary paths), leave `{SOURCE_SPEC}` as an empty string.

## Step 2: Resolve model tiers

Read the model matrix from `~/.pi/agent/model-tiers.json`:

```bash
cat ~/.pi/agent/model-tiers.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

Model assignments:

| Role | Tier |
|------|------|
| Plan generation | `capable` from model-tiers.json |
| Plan review (primary) | `crossProvider.capable` from model-tiers.json |
| Plan review (fallback) | `capable` from model-tiers.json |
| Plan editing | `capable` from model-tiers.json |

Fallback is triggered by dispatch failure, not preemptively checked. On fallback, notify the user:
```
⚠️ Cross-provider plan review failed (<crossProvider.capable model>).
Falling back to same-provider review (<capable model>).
```

### Dispatch resolution

After resolving the model for each role, also resolve its dispatch target using the `dispatch` map from `model-tiers.json`. See execute-plan Step 6 for the full resolution algorithm. In brief: extract the provider prefix (substring before the first `/`), look it up in `dispatch`, default to `"pi"` if absent.

When falling back from `crossProvider.capable` to `capable`, re-resolve the dispatch target — it will change if the providers differ (e.g., `openai-codex` dispatches to `"pi"`, `anthropic` dispatches to `"claude"`).

If `model-tiers.json` doesn't exist or is unreadable, stop with: "generate-plan requires `~/.pi/agent/model-tiers.json` — see model matrix configuration."

## Step 3: Generate the plan

1. Read [generate-plan-prompt.md](generate-plan-prompt.md) in this directory.
2. Fill placeholders:
   - `{TASK_DESCRIPTION}` — resolved text from Step 1
   - `{WORKING_DIR}` — absolute path to cwd
   - `{OUTPUT_PATH}` — `.pi/plans/yyyy-MM-dd-<short-description>.md` (derive short description from task)
   - `{SOURCE_TODO}` — `Source todo: TODO-<id>` when a source todo ID is available — either directly (input was a todo ID) or indirectly (extracted from a spec file's preamble `Source: TODO-<id>` line during provenance extraction in Step 1). Empty string otherwise.
   - `{SOURCE_SPEC}` — `Source spec: .pi/specs/<filename>` if the input file path is under `.pi/specs/`, empty string otherwise
   - `{SOURCE_BRIEF}` — `Scout brief: .pi/briefs/<filename>` if a scout brief was consumed, empty string otherwise
3. Dispatch `planner` agent synchronously:
   ```
   subagent { agent: "planner", task: "<filled template>", model: "<capable from model-tiers.json>", dispatch: "<dispatch for capable>" }
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
     model: "<crossProvider.capable from model-tiers.json>",
     dispatch: "<dispatch for crossProvider.capable>"
   }
   ```
   If the cross-provider dispatch fails, retry with `capable` from model-tiers.json (re-resolving dispatch for the fallback model) and notify the user (see Step 2 fallback message).
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
   subagent { agent: "planner", task: "<filled edit-plan-prompt.md>", model: "<capable from model-tiers.json>", dispatch: "<dispatch for capable>" }
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
- Offer to continue:

  > Plan written to `.pi/plans/...`. Want me to run execute-plan with this plan?

  If yes, invoke execute-plan with the plan file path.

## Edge cases

- **Todo ID provided:** Read the todo body first with the `todo` tool, include the full body text in the prompt — do not pass only the ID.
- **File path provided:** Read the file first with the `read` tool, include its full contents in the prompt — do not pass only the path.
- **`.pi/plans/` missing:** The subagent handles creating the directory; no action needed from the main agent.
- **`.pi/plans/reviews/` missing:** Create it before writing the review file.
