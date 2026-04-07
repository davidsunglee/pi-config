# Capture Full Review Output via `output` Parameter

## Goal

When the cross-provider plan reviewer or final code reviewer is dispatched as a subagent, the full review text (warnings, suggestions, task-specific citations) is lost because the orchestrator only receives a truncated inline response. Fix this by passing an `output` parameter to both review dispatches so the full review is written to a known file path, then reading that file back for complete findings. This affects two files: `generate-plan/SKILL.md` (plan review in Step 3.5) and `execute-plan/SKILL.md` (code review in Step 12).

## Architecture Summary

The pi agent skill system uses markdown SKILL.md files as behavioral instructions for the orchestrating agent. Two skills are involved:

- **`generate-plan/SKILL.md`** — Orchestrates plan generation and review. Step 3.5 dispatches a `plan-executor` subagent with a filled `plan-reviewer.md` template to review the generated plan. The reviewer's output is then parsed for status/findings and used to annotate the plan with `## Review Notes`.
- **`execute-plan/SKILL.md`** — Orchestrates plan execution across waves. Step 12 dispatches a `plan-executor` subagent with a filled `code-reviewer.md` template for a final code quality review after all waves complete.

Both dispatches currently rely on the subagent's inline response text, which gets truncated. The fix is to add an `output` parameter to each dispatch so the full response is persisted to a file, then read that file back.

## Tech Stack

- Markdown (skill definition files)
- pi subagent system (`output` parameter for persisting subagent responses)

## File Structure

- `~/.pi/agent/skills/generate-plan/SKILL.md` (Modify) — Add `output` parameter to plan review dispatch in Step 3.5 subsection 4; update subsection 5 to read review file and use full findings
- `~/.pi/agent/skills/execute-plan/SKILL.md` (Modify) — Add `output` parameter to code review dispatch in Step 12 item 4; update item 5 to read review file and use full findings

## Tasks

### Task 1: Add `output` parameter to plan review dispatch in generate-plan

**Files:**
- Modify: `~/.pi/agent/skills/generate-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current file** — Read `~/.pi/agent/skills/generate-plan/SKILL.md` in full to identify the exact content of Step 3.5 subsections 4 and 5.

- [ ] **Step 2: Update subsection 4 (Dispatch the reviewer)** — In the `### 4. Dispatch the reviewer` subsection, add an `output` parameter to the subagent dispatch block. The updated dispatch should be:

  ````markdown
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
  ````

  Key constraints:
  - The `output` value uses the plan's filename stem (without `.md`) plus `-review.md` suffix
  - The directory is `.pi/plans/reviews/` (sibling to `.pi/plans/done/`)
  - The `output` parameter is inside the subagent dispatch block, at the same level as `agent`, `task`, and `model`

- [ ] **Step 3: Update subsection 5 (Handle reviewer findings)** — Replace the opening of `### 5. Handle reviewer findings` to read the review file first, then parse it. The updated subsection should begin with:

  ````markdown
  ### 5. Handle reviewer findings

  Read the full review from the output file:

  ```
  Read .pi/plans/reviews/<plan-name>-review.md
  ```

  Parse the review file contents for the Status line (`[Approved]` or `[Issues Found]`) and all issues (errors, warnings, suggestions with task numbers and descriptions).
  ````

  Then keep the existing three conditional branches (`If errors found`, `If only warnings/suggestions`, `If clean`) but update the `If only warnings/suggestions` branch to make clear that the **actual warning and suggestion text** from the review file should be included in the `## Review Notes` section — not just counts. Specifically, update the example block to emphasize that `Description of warning` and `Description of suggestion` are the actual text from the reviewer's findings:

  ````markdown
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
  ````

  The `If errors found` branch should also note that the full findings from the review file (not just truncated inline text) should be presented to the user.

- [ ] **Step 4: Verify the edit** — Read the modified file and verify:
  1. Subsection 4 contains `output: ".pi/plans/reviews/<plan-name>-review.md"` in the dispatch block
  2. Subsection 5 begins with reading the review file from `.pi/plans/reviews/`
  3. The `## Review Notes` example makes clear that full finding text is included
  4. The review file is described as archived (not deleted)
  5. No other sections of the file are changed
  6. The fallback dispatch block also includes the `output` parameter (or the text makes clear the output path is the same regardless of model)

**Acceptance criteria:**
- The subagent dispatch in Step 3.5 subsection 4 includes `output: ".pi/plans/reviews/<plan-name>-review.md"`
- Subsection 5 instructs reading the review file from `.pi/plans/reviews/<plan-name>-review.md` before parsing findings
- The `## Review Notes` template shows full finding text (not just counts or summary lines)
- The `If errors found` branch references full findings from the review file
- The review file is kept in `.pi/plans/reviews/` (not deleted)
- No other sections of generate-plan/SKILL.md are modified

**Model recommendation:** cheap

---

### Task 2: Add `output` parameter to code review dispatch in execute-plan

**Files:**
- Modify: `~/.pi/agent/skills/execute-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Read the current file** — Read `~/.pi/agent/skills/execute-plan/SKILL.md` in full to identify the exact content of Step 12 items 4 and 5. Step 12 is titled `## Step 12: Request code review` and starts around line 408.

- [ ] **Step 2: Update item 4 (Dispatch review subagent)** — In item `4. **Dispatch review subagent:**`, add an `output` parameter to both the primary and fallback dispatch blocks. The updated item should be:

  ````markdown
  4. **Dispatch review subagent:**

     Determine the review output path from the plan filename. For a plan named `2026-04-06-my-feature.md`, the review path is `.pi/reviews/2026-04-06-my-feature-code-review.md`.

     Use `modelTiers.crossProvider.capable` from `~/.pi/agent/settings.json` (already read in Step 6) for an independent cross-provider perspective:
     ```
     subagent {
       agent: "plan-executor",
       task: "<filled template>",
       model: "<modelTiers.crossProvider.capable>",
       output: ".pi/reviews/<plan-name>-code-review.md"
     }
     ```

     **Fallback:** If the dispatch fails (model unavailable, provider error), retry with `modelTiers.capable` (same provider) and notify the user:
     ```
     ⚠️ Cross-provider review failed (<modelTiers.crossProvider.capable>).
     Falling back to same-provider review (<modelTiers.capable>).
     ```

     The fallback dispatch (same `output` path):
     ```
     subagent {
       agent: "plan-executor",
       task: "<filled template>",
       model: "<modelTiers.capable>",
       output: ".pi/reviews/<plan-name>-code-review.md"
     }
     ```
  ````

  Key constraints:
  - The `output` value uses the plan's filename stem (without `.md`) plus `-code-review.md` suffix
  - The directory is `.pi/reviews/` (top-level, not inside `.pi/plans/`)
  - Both the primary and fallback dispatch blocks include the `output` parameter
  - The `output` parameter is inside the subagent dispatch block, at the same level as `agent`, `task`, and `model`

- [ ] **Step 3: Update item 5 (Handle review results)** — Replace item `5. **Handle review results:**` to read the review file first, then process findings. The updated item should be:

  ````markdown
  5. **Handle review results:**

     Read the full review from the output file:
     ```
     Read .pi/reviews/<plan-name>-code-review.md
     ```

     Use the full review contents (strengths, issues by severity, recommendations, assessment) when reporting to the user:

     - **Critical/Important issues found:** Present the full findings from the review file to the user. Offer to dispatch fix-up tasks or proceed to completion.
     - **Minor issues only or clean:** Include the full review summary in the completion summary. Proceed to Step 13.
     - **Review skipped** (user chose to disable in Step 3): Proceed directly to Step 13.

     The review file at `.pi/reviews/<plan-name>-code-review.md` is kept for reference (do not delete it).
  ````

- [ ] **Step 4: Verify the edit** — Read the modified file and verify:
  1. Item 4 contains `output: ".pi/reviews/<plan-name>-code-review.md"` in the primary dispatch block
  2. The fallback dispatch block also contains the same `output` parameter
  3. Item 5 begins with reading the review file from `.pi/reviews/`
  4. Item 5 references using the "full review contents" (not truncated inline response)
  5. The review file is described as kept for reference (not deleted)
  6. No other sections of the file are changed (verify the rest of Step 12 and Steps 11/13 are untouched)

**Acceptance criteria:**
- Both primary and fallback dispatch blocks in Step 12 item 4 include `output: ".pi/reviews/<plan-name>-code-review.md"`
- Item 5 instructs reading the review file from `.pi/reviews/<plan-name>-code-review.md` before processing findings
- Item 5 references full review contents for both critical/important and minor/clean paths
- The review file is kept in `.pi/reviews/` (not deleted)
- No other sections of execute-plan/SKILL.md are modified

**Model recommendation:** cheap

## Dependencies

- Task 1 depends on: (none)
- Task 2 depends on: (none)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Worker modifies wrong section of SKILL.md | Low | Medium | Each task includes explicit verification step; acceptance criteria check that no other sections are changed |
| `output` parameter syntax wrong in markdown code block | Low | Medium | The parameter format is well-documented in the pi subagent system; the existing dispatch blocks provide a clear pattern to follow |
| Review file path convention inconsistent between tasks | Low | Low | Task descriptions use explicit paths: `.pi/plans/reviews/` for plan reviews, `.pi/reviews/` for code reviews — deliberately different directories |
| Worker adds output parameter but forgets to update the "read file" step | Low | High | Each task has a separate step for updating the dispatch (Step 2) and the handler (Step 3), plus a verification step (Step 4) that checks both |
