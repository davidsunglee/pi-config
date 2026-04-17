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
- Leave `{SOURCE_SPEC}` and `{SOURCE_BRIEF}` empty.

### 1b. File path (spec, RFC, design doc, etc.)

Pass the file by path. **Do NOT load the full file contents into `{TASK_DESCRIPTION}`.** The planner will read the file from disk.

Do a **bounded preamble read** of the file for provenance extraction only — for example `head -n 40 <path>`, or the `read` tool with a small line limit. Do not read the entire file into the orchestrator context.

From that bounded preamble, extract provenance using strict exact-match rules:

- Inspect only the preamble area at the top of the file (everything above the first `## ` heading, or the bounded first ~40 lines, whichever comes first).
- Only exact supported lines count:
  - `Source: TODO-<id>` → set `{SOURCE_TODO}` to `Source todo: TODO-<id>`.
  - `Scout brief: .pi/briefs/<filename>` → set `{SOURCE_BRIEF}` to `Scout brief: .pi/briefs/<filename>`, **then verify the referenced file exists on disk**:
    - If the brief file does not exist, warn the user (`Scout brief referenced in spec not found at <path> — proceeding without it.`), leave `{SOURCE_BRIEF}` empty, and continue without failing.
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
- Leave `{SOURCE_TODO}`, `{SOURCE_SPEC}`, and `{SOURCE_BRIEF}` empty.

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
   - `{TASK_DESCRIPTION}` — for todo and freeform inputs, the inlined text from Step 1. For file inputs, an empty string (the artifact on disk is the task description).
   - `{TASK_ARTIFACT}` — for file inputs, `Task artifact: <input path>`. For todo and freeform inputs, an empty string.
   - `{WORKING_DIR}` — absolute path to cwd
   - `{OUTPUT_PATH}` — `.pi/plans/yyyy-MM-dd-<short-description>.md`
     - For **file inputs**, derive `<short-description>` from the **input filename** (basename without extension, e.g., `.pi/specs/reduce-context.md` → `reduce-context`). Do NOT derive it from the document body — the body is not loaded into the orchestrator prompt.
     - For **todo inputs**, derive from the todo title.
     - For **freeform inputs**, derive from the task text.
   - `{SOURCE_TODO}` — `Source todo: TODO-<id>` when a source todo ID is available — either directly (input was a todo ID) or indirectly (extracted from a file's preamble `Source: TODO-<id>` line during provenance extraction in Step 1). Empty string otherwise.
   - `{SOURCE_SPEC}` — `Source spec: .pi/specs/<filename>` if the input file path is under `.pi/specs/`, empty string otherwise.
   - `{SOURCE_BRIEF}` — `Scout brief: .pi/briefs/<filename>` if a scout brief was extracted from the file preamble and the brief file exists on disk, empty string otherwise.
3. Dispatch `planner` agent synchronously:
   ```
   subagent { agent: "planner", task: "<filled template>", model: "<capable from model-tiers.json>", dispatch: "<dispatch for capable>" }
   ```

## Step 4: Review-edit loop

### 4.1: Review the plan

The reviewer reads the generated plan, the task artifact, and the scout brief (if any) directly from disk. The orchestrator does NOT load those files into its own context here.

1. Read [review-plan-prompt.md](review-plan-prompt.md) in this directory.
2. Fill placeholders as follows:

   | Placeholder | File-based input | Todo / freeform input |
   |---|---|---|
   | `{PLAN_ARTIFACT}` | `Plan artifact: <plan path from Step 3>` | `Plan artifact: <plan path from Step 3>` |
   | `{TASK_ARTIFACT}` | `Task artifact: <input path>` (same path used in Step 3) | empty string |
   | `{SOURCE_TODO}` | same value used in Step 3 | same value used in Step 3 |
   | `{SOURCE_SPEC}` | same value used in Step 3 | empty string |
   | `{SCOUT_BRIEF}` | `Scout brief: .pi/briefs/<filename>` if a valid scout brief was extracted in Step 1 **and the brief file still exists on disk** at review time; empty string otherwise | empty string |
   | `{ORIGINAL_SPEC_INLINE}` | empty string | the inline text from Step 1 |

   Freshness / existence checks before filling:

   - Verify the plan file produced by Step 3 exists and is non-empty. If it does not exist, fail with: `Plan file <path> missing — cannot dispatch plan review.` This is consistent with the planner slice: missing required artifacts fail the workflow.
   - For file-based inputs, verify the task artifact path still exists. If not, fail with: `Task artifact <path> missing — cannot dispatch plan review.`
   - For scout briefs, re-check existence at review time. If the brief file was present in Step 1 but is gone now, warn (`Scout brief <path> no longer exists at review time — proceeding without it.`), set `{SCOUT_BRIEF}` to empty, and continue. Do not fail.

   **Do NOT read the plan, task artifact, or scout brief contents into the orchestrator prompt.** The `plan-reviewer` agent reads them from disk per its Input Contract.

3. Determine review output path from the plan filename. For a plan at `.pi/plans/2026-04-13-my-feature.md`, the review path is `.pi/plans/reviews/2026-04-13-my-feature-plan-review-v1.md`.
4. Dispatch `plan-reviewer`:
   ```
   subagent {
     agent: "plan-reviewer",
     task: "<filled review-plan-prompt.md>",
     model: "<crossProvider.capable from model-tiers.json>",
     dispatch: "<dispatch for crossProvider.capable>"
   }
   ```
   If the cross-provider dispatch fails, retry with `capable` from model-tiers.json (re-resolving dispatch for the fallback model) and notify the user (see Step 2 fallback message).
5. Write review output to the versioned path. Create `.pi/plans/reviews/` if it doesn't exist.

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

The planner edit pass reads the existing plan from disk (it will overwrite it at the same path), plus the task artifact and scout brief from disk for reference. Review findings and the output path remain inline control data.

1. Read [edit-plan-prompt.md](edit-plan-prompt.md) in this directory.
2. Fill placeholders as follows:

   | Placeholder | File-based input | Todo / freeform input |
   |---|---|---|
   | `{REVIEW_FINDINGS}` | full text of all error-severity findings from the review (inline) | same |
   | `{PLAN_ARTIFACT}` | `Plan artifact: <plan path from Step 3>` | same |
   | `{TASK_ARTIFACT}` | `Task artifact: <input path>` (same path used in Step 3) | empty string |
   | `{SOURCE_TODO}` | same value used in Step 3 | same value used in Step 3 |
   | `{SOURCE_SPEC}` | same value used in Step 3 | empty string |
   | `{SCOUT_BRIEF}` | `Scout brief: .pi/briefs/<filename>` if a valid scout brief was extracted in Step 1 **and the brief file still exists on disk** at edit time; empty string otherwise | empty string |
   | `{ORIGINAL_SPEC_INLINE}` | empty string | the inline text from Step 1 |
   | `{OUTPUT_PATH}` | plan path from Step 3 (same path — the planner overwrites in place) | same |

   Freshness / existence checks before filling:

   - Verify the plan file exists and is non-empty. If not, fail with: `Plan file <path> missing — cannot dispatch plan edit.`
   - For file-based inputs, verify the task artifact path still exists. If not, fail with: `Task artifact <path> missing — cannot dispatch plan edit.`
   - For scout briefs, re-check existence at edit time. If missing, warn (`Scout brief <path> no longer exists at edit time — proceeding without it.`), set `{SCOUT_BRIEF}` to empty, and continue.

   **Do NOT read the plan, task artifact, or scout brief contents into the orchestrator prompt.** The planner reads them from disk per its Edit mode contract.

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

- **Todo ID provided:** Read the todo body first with the `todo` tool and inline the full body in `{TASK_DESCRIPTION}`. The planner subagent does not have the `todo` tool, so the ID alone is not enough.
- **File path provided:** Pass by path via `{TASK_ARTIFACT}`. Do NOT inline the file body into `{TASK_DESCRIPTION}`. Only do a bounded preamble read (e.g., `head -n 40`) for provenance extraction. The planner reads the full artifact from disk.
- **Scout brief referenced but missing on disk:** Warn the user and continue planning without it. Do not block.
- **Plan file missing between generation and review/edit:** Fail with a clear error (`Plan file <path> missing — cannot dispatch plan review.` or `... plan edit.`). This should not normally happen — the planner writes the plan in Step 3 at a known path — but a clear failure is preferable to dispatching with no plan.
- **Task artifact moved or deleted during the review/edit loop:** Fail with `Task artifact <path> missing — cannot dispatch plan review.` (or `... plan edit.`). File-based planning runs require the artifact to remain on disk throughout the loop.
- **Scout brief deleted between generation and review/edit:** Warn (`Scout brief <path> no longer exists at review time — proceeding without it.`) and continue. Consistent with the planner-slice warn-and-continue policy.
- **`.pi/plans/` missing:** The subagent handles creating the directory; no action needed from the main agent.
- **`.pi/plans/reviews/` missing:** Create it before writing the review file.

## Scope note on path-based handoff

Path-based handoff in this skill applies to the initial `generate-plan -> planner` dispatch (Step 3), the `generate-plan -> plan-reviewer` dispatch (Step 4.1), and the planner edit-pass dispatch (Step 4.3). For these three dispatches, large durable artifacts — the generated plan file, the original task artifact, and any scout brief — are passed by filesystem path rather than inlined into the prompt. The worker agents read them from disk per their input contracts.

What remains inline:

- For todo and freeform runs, the original task description itself is inline in `{TASK_DESCRIPTION}` (Step 3) and `{ORIGINAL_SPEC_INLINE}` (Steps 4.1 and 4.3). No temp artifact files are created just to force path-based handoff — todo/freeform inputs are not durable artifacts.
- For the edit pass, review findings (`{REVIEW_FINDINGS}`) and the output path (`{OUTPUT_PATH}`) are small, ephemeral control data and remain inline.
- Minimal provenance / safety metadata (`{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}`) stays inline.

`execute-plan` and `execute-plan -> coder` are out of scope for this handoff contract.
