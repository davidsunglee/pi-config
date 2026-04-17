# Move generate-plan review/edit loop to file-based artifact handoff

**Source:** TODO-58b1648b

## Goal

Extend the path-based handoff contract from the initial `generate-plan -> planner` dispatch (completed in `TODO-d718bad4`) to the remaining two planning-stage dispatches: `generate-plan -> plan-reviewer` (Step 4.1) and the planner edit pass (Step 4.3). For these dispatches, the orchestrator must stop inlining large durable markdown artifacts (the generated plan, the source task artifact, the scout brief) into the subagent prompt, and must stop re-reading them into its own context just to stage the handoff. Instead, it should pass filesystem paths and require workers to read the artifacts directly. Small ephemeral control data — review findings and output paths — remains inline. Todo/freeform inputs keep their existing inline behavior; no temp artifact files are introduced to force path-based handoff for them.

## Architecture summary

`generate-plan` is a skill (prompt template in `agent/skills/generate-plan/SKILL.md`) that orchestrates three subagent dispatches:

1. **Plan generation** — `planner` agent (`agent/agents/planner.md`) filled from `generate-plan-prompt.md`. Already path-based for file inputs after `TODO-d718bad4`.
2. **Plan review** — `plan-reviewer` agent (`agent/agents/plan-reviewer.md`) filled from `review-plan-prompt.md`. Currently inlines `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}`. **This plan changes it.**
3. **Plan edit** — `planner` agent in edit mode, filled from `edit-plan-prompt.md`. Currently inlines `{PLAN_CONTENTS}`, `{ORIGINAL_SPEC}`, plus `{REVIEW_FINDINGS}` and `{OUTPUT_PATH}`. **This plan changes the first two; the latter two remain inline.**

The handoff change follows the same shape used for the planner-dispatch slice:

- A `## Provenance` block carrying path lines (`Plan artifact: <path>`, `Task artifact: <path>`, `Scout brief: <path>`, plus existing `Source todo:`, `Source spec:` metadata).
- An `## Artifact Reading Contract` section telling the worker which files to read from disk.
- An inline-fallback mode for todo/freeform inputs where the original spec is short, ephemeral, and has no durable on-disk location.

Failure behavior mirrors the planner slice:

- Missing required plan or task-artifact files → fail the workflow clearly.
- Missing scout brief → warn and continue.

## Tech stack

- Markdown prompt templates (skills in `agent/skills/`, agent definitions in `agent/agents/`).
- Skill is executed by the Claude Code harness; placeholders are filled by the orchestrator before dispatch.
- No source code is involved; no automated tests. Verification is smoke runs + prompt/transcript inspection.

## File Structure

- `agent/skills/generate-plan/review-plan-prompt.md` (Modify) — Replace `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}` inline sections with a `## Provenance` block (path lines) plus a `## Artifact Reading Contract` section. Add an optional `## Original Spec (inline)` fallback section used only for todo/freeform inputs.
- `agent/skills/generate-plan/edit-plan-prompt.md` (Modify) — Same change as the review prompt for plan + task artifact. Keep `{REVIEW_FINDINGS}` and `{OUTPUT_PATH}` inline. Add an explicit artifact-reading contract.
- `agent/agents/plan-reviewer.md` (Modify) — Add an Input contract section explaining the two prompt shapes (path-based vs. inline) and require reading the plan / task artifact / scout brief from disk when paths are provided. Ensure the agent has the filesystem read tools needed (verify `tools:` frontmatter, add if missing).
- `agent/agents/planner.md` (Modify) — Extend the existing "Edit mode" subsection so it describes the new path-based edit contract (plan artifact + task artifact by path, review findings inline, output path inline). Remove the current statement that edit-mode "continues to inline plan content" since that is no longer true.
- `agent/skills/generate-plan/SKILL.md` (Modify) — Rewrite Step 4.1 placeholder-filling rules, Step 4.3 placeholder-filling rules, and the "Scope note on path-based handoff" section. Update Edge cases.

No durable product files are created. No source files are deleted. Verification may create temporary throwaway fixtures and a scratch verification note under `.pi/` if needed; those are test artifacts, not part of the shipped contract, and should be cleaned up unless intentionally kept as evidence.

## Tasks

### Task 1: Rewrite `review-plan-prompt.md` as a path-based handoff template

**Files:**
- Modify: `agent/skills/generate-plan/review-plan-prompt.md`

**Steps:**

- [ ] **Step 1: Read the existing prompt** — Open `agent/skills/generate-plan/review-plan-prompt.md` and confirm current placeholders are `{ORIGINAL_SPEC}` (line 14) and `{PLAN_CONTENTS}` (line 18). Everything else (Review Checklist, Calibration, Output Format, Critical Rules) stays identical.

- [ ] **Step 2: Replace the "Original Spec / Task Description" and "Generated Plan" sections** — Replace lines 12–18 (the two `{...}` placeholder sections) with the following exact content:

  ```
  ## Provenance

  {PLAN_ARTIFACT}

  {TASK_ARTIFACT}

  {SOURCE_TODO}

  {SOURCE_SPEC}

  {SCOUT_BRIEF}

  ## Original Spec (inline)

  {ORIGINAL_SPEC_INLINE}

  ## Artifact Reading Contract

  - A `Plan artifact: <path>` line in `## Provenance` is always present. Read that plan file in full from disk before reviewing. It is the authoritative plan under review — the orchestrator has NOT inlined plan contents in this prompt.
  - If a `Task artifact: <path>` line appears in `## Provenance`, the original task specification lives on disk at that path. Read it in full before reviewing. Do not assume its body is quoted anywhere in this prompt.
  - If a `Scout brief: .pi/briefs/<filename>` line appears in `## Provenance`, read that brief file from disk as well and treat it as primary context alongside the task artifact.
  - If a referenced scout brief file is missing on disk, note it in your review and continue — do not abort.
  - If no `Task artifact:` line is present, the original task description is contained inline in the `## Original Spec (inline)` section above and is self-contained (this is the todo/freeform case).
  - If both `Task artifact:` is present and `## Original Spec (inline)` is non-empty, prefer the on-disk artifact as authoritative. The inline section must be empty in that case; if it is not, report an inconsistency in your review but continue using the on-disk artifact.
  ```

- [ ] **Step 3: Verify no other placeholders exist** — Grep the file for `{` to confirm the only remaining placeholders are: `{PLAN_ARTIFACT}`, `{TASK_ARTIFACT}`, `{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}`, `{ORIGINAL_SPEC_INLINE}`. Remove the old `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}` placeholders completely.

- [ ] **Step 4: Keep the rest of the file byte-identical** — Do not change the Review Checklist, Calibration, Output Format, or Critical Rules sections. The reviewer's job and severity rubric are unchanged.

**Acceptance criteria:**

- File contains exactly the placeholders `{PLAN_ARTIFACT}`, `{TASK_ARTIFACT}`, `{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}`, `{ORIGINAL_SPEC_INLINE}` and no `{PLAN_CONTENTS}` or `{ORIGINAL_SPEC}`.
- File includes a `## Provenance` section, an `## Original Spec (inline)` section, and an `## Artifact Reading Contract` section with the exact policy language above.
- Review Checklist, Calibration, Output Format, and Critical Rules sections are unchanged.
- `grep -n "{" agent/skills/generate-plan/review-plan-prompt.md` returns only the six placeholder names listed above.

**Model recommendation:** standard

---

### Task 2: Update `plan-reviewer.md` agent contract

**Files:**
- Modify: `agent/agents/plan-reviewer.md`

**Steps:**

- [ ] **Step 1: Verify filesystem read tools are available** — Read the current `plan-reviewer.md` frontmatter (lines 1–6). Ensure the frontmatter grants filesystem read capability via `tools: read, grep, find, ls, bash` or a clear superset. If there is no `tools:` field, add that exact field. If a `tools:` field already exists but is narrower, expand it to include `read, grep, find, ls, bash` without removing any other required tools already present. Do not change `thinking` or `maxSubagentDepth` values. This is required because the reviewer now must read artifacts from disk.

- [ ] **Step 2: Replace the second paragraph** — Replace line 10 (the single-paragraph "You have no context from the generation session..." sentence) with the following two-paragraph block so the reviewer knows the handoff shape:

  ```
  You have no context from the generation session. Your review must be based entirely on the plan document and the original spec/task description provided in your task prompt.

  ## Input Contract

  Your task prompt has a `## Provenance` block followed by an optional `## Original Spec (inline)` section and an `## Artifact Reading Contract` section. Depending on how the orchestrator dispatched you, inputs arrive in one of two shapes:

  ### File-based input

  - A `Plan artifact: <path>` line in `## Provenance` — always present. You MUST read that plan file in full from disk before reviewing. The plan body is NOT inlined into this prompt.
  - A `Task artifact: <path>` line in `## Provenance` — present when the planning run was driven from a file-based spec/RFC/design doc. You MUST read that artifact file in full from disk. The orchestrator has NOT inlined its contents.
  - A `Scout brief: .pi/briefs/<filename>` line in `## Provenance` — optional. When present, read the brief file from disk and treat it as primary context alongside the task artifact. If the brief file is missing on disk, note that in your review and continue without it — do not abort.
  - The `## Original Spec (inline)` section will be empty in this shape.

  ### Inline input (todo or freeform)

  - A `Plan artifact: <path>` line is still present — read the plan from disk.
  - No `Task artifact:` line will appear in `## Provenance`.
  - The `## Original Spec (inline)` section contains the full original task description inline. Treat it as the authoritative original spec for coverage review.

  Read the `## Artifact Reading Contract` section of your task prompt for the exact policy, including what to do if on-disk and inline sources are both present (prefer on-disk, flag inconsistency).
  ```

- [ ] **Step 3: Keep Principles and Rules sections unchanged** — Do not modify the Principles or Rules sections.

- [ ] **Step 4: Verify with grep** — Run `grep -c "Input Contract" agent/agents/plan-reviewer.md` and confirm the section was added exactly once.

**Acceptance criteria:**

- Frontmatter includes a `tools:` field that grants filesystem read access (`read, grep, find, ls, bash` or a superset).
- File contains an `## Input Contract` section describing both file-based and inline input shapes, including the `Plan artifact:`, `Task artifact:`, and `Scout brief:` path lines.
- File explicitly instructs the reviewer to read the plan file, task artifact, and scout brief from disk when their path lines appear.
- Missing-scout-brief handling language matches the planner slice: "note it in your review and continue without it — do not abort."

**Model recommendation:** standard

---

### Task 3: Rewrite `edit-plan-prompt.md` as a path-based handoff template

**Files:**
- Modify: `agent/skills/generate-plan/edit-plan-prompt.md`

**Steps:**

- [ ] **Step 1: Read the existing prompt** — Confirm current placeholders are `{REVIEW_FINDINGS}` (line 9), `{PLAN_CONTENTS}` (line 13), `{ORIGINAL_SPEC}` (line 19), `{OUTPUT_PATH}` (line 23). `{REVIEW_FINDINGS}` and `{OUTPUT_PATH}` will remain inline; `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}` will be replaced with path-based references.

- [ ] **Step 2: Replace the "Current Plan" and "Original Spec" sections** — Replace lines 11–19 (the `## Current Plan` block through the `## Original Spec` block, inclusive of the two `{...}` placeholder sections) with:

  ```
  ## Provenance

  {PLAN_ARTIFACT}

  {TASK_ARTIFACT}

  {SOURCE_TODO}

  {SOURCE_SPEC}

  {SCOUT_BRIEF}

  ## Original Spec (inline)

  {ORIGINAL_SPEC_INLINE}

  ## Artifact Reading Contract

  - A `Plan artifact: <path>` line in `## Provenance` is always present. Read the existing plan file in full from disk before editing — this is the plan you are editing in place. The plan body is NOT inlined here.
  - If a `Task artifact: <path>` line appears in `## Provenance`, that file on disk is the authoritative original task specification. Read it in full from disk for reference. Do not assume its body is quoted anywhere in this prompt.
  - If a `Scout brief: .pi/briefs/<filename>` line appears in `## Provenance`, read that brief from disk as well and treat it as primary reference context. If the brief file is missing on disk, note it and continue — do not abort.
  - If no `Task artifact:` line appears, the original task description is contained inline in `## Original Spec (inline)` above (todo/freeform case).
  - If both `Task artifact:` is present and `## Original Spec (inline)` is non-empty, prefer the on-disk artifact as authoritative and ignore the inline section.
  ```

  Keep the `## Review Findings` section (with `{REVIEW_FINDINGS}`) and the `## Output` section (with `{OUTPUT_PATH}`) exactly as they are — review findings and output path remain inline control data.

- [ ] **Step 3: Keep the Instructions section unchanged** — Do not modify the five-point Instructions list at the end of the file.

- [ ] **Step 4: Verify placeholders** — Grep the file for `{` and confirm the remaining placeholders are exactly: `{REVIEW_FINDINGS}`, `{PLAN_ARTIFACT}`, `{TASK_ARTIFACT}`, `{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}`, `{ORIGINAL_SPEC_INLINE}`, `{OUTPUT_PATH}`. `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}` must not appear.

**Acceptance criteria:**

- File contains `{REVIEW_FINDINGS}` and `{OUTPUT_PATH}` inline (unchanged in position and meaning).
- File no longer contains `{PLAN_CONTENTS}` or `{ORIGINAL_SPEC}` placeholders.
- File contains `## Provenance`, `## Original Spec (inline)`, and `## Artifact Reading Contract` sections with the exact text specified above.
- The original Instructions section at the end of the file is unchanged.

**Model recommendation:** standard

---

### Task 4: Update `planner.md` edit-mode contract

**Files:**
- Modify: `agent/agents/planner.md`

**Steps:**

- [ ] **Step 1: Locate the Edit mode block** — Open `agent/agents/planner.md` and locate the "### Edit mode" subsection (currently lines 32–34). Current wording: "When dispatched with an edit prompt, you will receive an existing plan plus review findings and must edit the plan surgically. Edit-mode prompts continue to inline plan content; they are not affected by the file-based handoff contract above."

- [ ] **Step 2: Replace the Edit mode block** — Replace lines 32–34 with:

  ```
  ### Edit mode

  When dispatched with an edit prompt, your task prompt has the same `## Provenance` + `## Artifact Reading Contract` shape as file-based input above, plus inline `## Review Findings` and `## Output` sections.

  - A `Plan artifact: <path>` line is always present in `## Provenance`. You MUST read the existing plan file in full from disk before editing — this is the plan you are editing in place, at that same path. The plan body is NOT inlined in edit-mode prompts.
  - If a `Task artifact: <path>` line appears in `## Provenance`, read the original task artifact from disk for reference. If it does not appear, the original task description is contained inline in `## Original Spec (inline)` (todo/freeform case).
  - Scout brief handling is the same as file-based input: read it from disk if referenced, warn and continue if it is missing.
  - The `## Review Findings` and `## Output` sections remain inline — they carry the specific errors to address and the path to write the edited plan to. Edit surgically against those findings; do not rewrite unflagged sections.
  ```

- [ ] **Step 3: Verify the file-based input contract above is still intact** — Do not modify the "### Inline input" or "### File-based input" subsections above the Edit mode block.

**Acceptance criteria:**

- Edit mode subsection no longer states that edit-mode prompts "continue to inline plan content."
- Edit mode subsection explicitly instructs the planner to read the plan artifact from disk and the task artifact from disk (when present).
- Edit mode subsection explicitly calls out that `## Review Findings` and `## Output` sections remain inline.
- Inline input and File-based input subsections are unchanged.

**Model recommendation:** standard

---

### Task 5: Update `SKILL.md` Step 4.1 (review) placeholder-filling rules

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Locate Step 4.1** — Step 4.1 currently spans roughly lines 104–135 in `agent/skills/generate-plan/SKILL.md` ("### 4.1: Review the plan"). The current body reads the full plan into `{PLAN_CONTENTS}` and reconstructs `{ORIGINAL_SPEC}` by reading the artifact (and brief) from disk into the prompt. This is the inlining we are removing.

- [ ] **Step 2: Replace Step 4.1's body** — Replace the contents of Step 4.1 (everything under the `### 4.1: Review the plan` heading up to but not including `### 4.2: Assess review`) with:

  ~~~
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
  ~~~

- [ ] **Step 3: Verify no `{PLAN_CONTENTS}` or `{ORIGINAL_SPEC}` placeholder references remain in Step 4.1** — Grep the Step 4.1 region of the file for `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}`; both should be absent. The new placeholders referenced should be `{PLAN_ARTIFACT}`, `{TASK_ARTIFACT}`, `{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}`, `{ORIGINAL_SPEC_INLINE}`.

**Acceptance criteria:**

- Step 4.1 no longer instructs the orchestrator to read the artifact, scout brief, or plan file into `{ORIGINAL_SPEC}` or `{PLAN_CONTENTS}`.
- Step 4.1 contains the placeholder table listing file-based vs. todo/freeform values for all six new placeholders.
- Step 4.1 specifies: plan-file and task-artifact missing → fail; scout brief missing at review time → warn and continue.
- Step 4.1 explicitly states "Do NOT read the plan, task artifact, or scout brief contents into the orchestrator prompt."
- Dispatch call, review output path logic, and cross-provider fallback behavior are preserved.

**Model recommendation:** standard

---

### Task 6: Update `SKILL.md` Step 4.3 (edit) placeholder-filling rules

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Locate Step 4.3** — Step 4.3 currently spans roughly lines 159–171 ("### 4.3: Edit the plan"). Its current body reads `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}` into the prompt.

- [ ] **Step 2: Replace Step 4.3's body** — Replace the contents under `### 4.3: Edit the plan` up to but not including `### 4.4: Iterate or escalate` with:

  ~~~
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
  ~~~

- [ ] **Step 3: Verify `{REVIEW_FINDINGS}` and `{OUTPUT_PATH}` are still inline** — Grep Step 4.3 for `{REVIEW_FINDINGS}` and `{OUTPUT_PATH}`; both should still be referenced. `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}` should be absent.

**Acceptance criteria:**

- Step 4.3 no longer instructs the orchestrator to read the plan file or the artifact/brief into the prompt.
- Step 4.3 retains `{REVIEW_FINDINGS}` inline and `{OUTPUT_PATH}` inline.
- Step 4.3 contains the placeholder table and freshness-check language specified above.
- Dispatch call and overwrite-in-place semantics are preserved.

**Model recommendation:** standard

---

### Task 7: Update `SKILL.md` scope note and Edge cases

**Files:**
- Modify: `agent/skills/generate-plan/SKILL.md`

**Steps:**

- [ ] **Step 1: Update the scope note at the end** — The current file ends with a "## Scope note on path-based handoff" section (around lines 210–212) stating: "Path-based handoff in this skill applies **only to the initial `generate-plan -> planner` dispatch** (Step 3). The review/edit loop (Step 4) continues to inline plan contents and review findings as before. That loop is out of scope for this change and tracked separately (see `TODO-58b1648b`)."

  Replace that section with:

  ```
  ## Scope note on path-based handoff

  Path-based handoff in this skill applies to the initial `generate-plan -> planner` dispatch (Step 3), the `generate-plan -> plan-reviewer` dispatch (Step 4.1), and the planner edit-pass dispatch (Step 4.3). For these three dispatches, large durable artifacts — the generated plan file, the original task artifact, and any scout brief — are passed by filesystem path rather than inlined into the prompt. The worker agents read them from disk per their input contracts.

  What remains inline:

  - For todo and freeform runs, the original task description itself is inline in `{TASK_DESCRIPTION}` (Step 3) and `{ORIGINAL_SPEC_INLINE}` (Steps 4.1 and 4.3). No temp artifact files are created just to force path-based handoff — todo/freeform inputs are not durable artifacts.
  - For the edit pass, review findings (`{REVIEW_FINDINGS}`) and the output path (`{OUTPUT_PATH}`) are small, ephemeral control data and remain inline.
  - Minimal provenance / safety metadata (`{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}`) stays inline.

  `execute-plan` and `execute-plan -> coder` are out of scope for this handoff contract.
  ```

- [ ] **Step 2: Update the "Edge cases" section** — Locate the "## Edge cases" section (around lines 202–208). Add two additional bullets after the existing "Scout brief referenced but missing on disk" bullet:

  ```
  - **Plan file missing between generation and review/edit:** Fail with a clear error (`Plan file <path> missing — cannot dispatch plan review.` or `... plan edit.`). This should not normally happen — the planner writes the plan in Step 3 at a known path — but a clear failure is preferable to dispatching with no plan.
  - **Task artifact moved or deleted during the review/edit loop:** Fail with `Task artifact <path> missing — cannot dispatch plan review.` (or `... plan edit.`). File-based planning runs require the artifact to remain on disk throughout the loop.
  - **Scout brief deleted between generation and review/edit:** Warn (`Scout brief <path> no longer exists at review time — proceeding without it.`) and continue. Consistent with the planner-slice warn-and-continue policy.
  ```

  Leave the existing bullets ("Todo ID provided", "File path provided", "Scout brief referenced but missing on disk", "`.pi/plans/` missing", "`.pi/plans/reviews/` missing") unchanged.

- [ ] **Step 3: Cross-check for stale references** — Grep the full SKILL.md for the strings `{PLAN_CONTENTS}` and `{ORIGINAL_SPEC}`. Both should be absent. `{ORIGINAL_SPEC_INLINE}` is the only spec-style placeholder remaining in review/edit steps.

**Acceptance criteria:**

- Scope note explicitly lists all three path-based dispatches (generation, review, edit).
- Scope note explicitly calls out what stays inline (original-spec inline fallback for todo/freeform, review findings, output path, provenance metadata).
- Edge cases section includes plan-missing and task-artifact-missing failure modes plus scout-brief-disappeared warn-and-continue mode.
- `grep -n "{PLAN_CONTENTS}\|{ORIGINAL_SPEC}" agent/skills/generate-plan/SKILL.md` returns zero hits.

**Model recommendation:** standard

---

### Task 8: Smoke verification (three runs + transcript inspection)

**Files:**
- Modify: none (verification only — no code changes in this task).

**Steps:**

- [ ] **Step 1: Prepare fixtures** — Identify (or create) four input fixtures sufficient to exercise the updated paths:
  - `FIXTURE_FILE_WITH_BRIEF`: a spec file under `.pi/specs/` whose preamble references an existing scout brief under `.pi/briefs/`. If an existing fixture like `.pi/specs/2026-04-15-define-spec.md` already references a valid brief, use it; otherwise author a minimal throwaway spec + brief pair for the smoke test and keep them under `.pi/specs/` and `.pi/briefs/` respectively.
  - `FIXTURE_FILE_MISSING_BRIEF`: a spec file whose preamble contains `Scout brief: .pi/briefs/<does-not-exist>.md`. Author a small throwaway spec for this case.
  - `FIXTURE_TODO_OR_FREEFORM`: an inline (non-file-based) input to exercise the todo/freeform path. Resolve in this order, and record which branch was used in the Step 9 verification note:
    1. **Existing open todo** — if the repo has an open todo with a substantive body (e.g. one already in `.pi/todos/`), use it.
    2. **Temporary todo fixture** — if no suitable open todo exists, create a minimal throwaway open todo (e.g. via the same mechanism used to author real todos, or by adding a disposable entry under `.pi/todos/`) with a substantive body, and delete it after Step 9. This is explicitly permitted for smoke-test purposes only — it is not a durable artifact and no path-based handoff is introduced for it.
    3. **Freeform fallback** — if neither of the above is available (e.g. in an environment where creating a todo is not practical), invoke `generate-plan` with a freeform inline task description of substantive length. A freeform run exercises the same inline `{ORIGINAL_SPEC_INLINE}` code path and satisfies the todo/freeform verification.
  - `FIXTURE_FORCE_EDIT`: a fixture specifically designed to guarantee an `[Issues Found]` review so Step 4.3 is exercised. Two acceptable constructions: (a) a file-based spec + scout brief pair authored so the first generated plan predictably violates a reviewer structural requirement (for example, a spec that causes the planner to emit a placeholder like "TBD" or omit acceptance criteria, which the plan-reviewer's Critical Rules will flag as an error); or (b) a harness invocation of Step 4.1 with a pre-staged known-bad plan on disk (plan containing literal `TODO: fill in` text) paired with `FIXTURE_FILE_WITH_BRIEF`'s spec, forcing `[Issues Found]` deterministically. Record which construction you used in the verification note (Step 8).

- [ ] **Step 2: Run `generate-plan` on FIXTURE_FILE_WITH_BRIEF and inspect the review-dispatch transcript** — Invoke `generate-plan` with the file path. Capture the exact prompt sent to `plan-reviewer` in Step 4.1. Confirm:
  - The `## Provenance` section of the `plan-reviewer` prompt contains `Plan artifact: <path>`, `Task artifact: <path>`, and `Scout brief: .pi/briefs/<filename>` lines.
  - The prompt does not contain the full body of the plan file, the spec file, or the brief file.
  - The `plan-reviewer` transcript/tool-call log shows explicit filesystem-read evidence against the plan artifact path, the task artifact path, and the scout brief path. Accept either `read` tool calls or equivalent path-specific file reads via another allowed tool (for example, `bash` invoking `cat`, `head`, or similar with the exact path argument). This is verified at the harness level by inspecting the reviewer's tool-call record — the plan does NOT require the reviewer to narrate its reads in its review body, and the review body text is not used as evidence for this sub-check.
  - If this run happens to produce `[Issues Found]` naturally, also capture the Step 4.3 edit-mode prompt for cross-reference — but do not rely on this; Step 3 below forces the edit pass deterministically regardless of this run's outcome.

- [ ] **Step 3: Force an edit pass via FIXTURE_FORCE_EDIT and inspect the planner edit-mode transcript** — Run the fixture constructed in Step 1 to deterministically drive the workflow into Step 4.3. Capture the exact prompt sent to `planner` in edit mode. This step is mandatory and its three sub-verifications map directly to the task's acceptance criteria for the planner edit-pass handoff — the plan cannot be marked complete unless all three pass:
  - **(a) Plan artifact and any task artifact/brief are passed by path.** The `## Provenance` section of the `planner` edit-mode prompt contains a `Plan artifact: <path>` line, a `Task artifact: <path>` line (when the forcing fixture is file-based), and a `Scout brief: .pi/briefs/<filename>` line (when the fixture includes a brief). The prompt does NOT contain the full body of the plan file, the spec file, or the brief file — verify by `grep -c` for known unique substrings from each artifact body in the captured prompt; expect zero matches for each.
  - **(b) Review findings remain inline.** The edit-mode prompt contains a `## Review Findings` section populated with the full finding text from Step 4.2. The findings are NOT externalized to a separate file on disk; no `Review findings artifact:` path line or equivalent appears in `## Provenance`.
  - **(c) Edit worker reads files from disk.** The planner's edit-mode transcript shows explicit filesystem-read evidence against the plan artifact path, the task artifact path (when present), and the scout brief path (when present). Accept either `read` tool calls or equivalent path-specific file reads via another allowed tool (for example, `bash` invoking `cat`, `head`, or similar with the exact path argument). Record the tool-call evidence (tool name, path argument) in the Step 10 verification note.

  If any of (a), (b), or (c) fails, Task 8 fails and the plan must be re-opened.

- [ ] **Step 4: Run `generate-plan` on FIXTURE_FILE_MISSING_BRIEF and inspect transcripts** — Confirm:
  - The orchestrator emits a warning: `Scout brief referenced in spec not found at <path> — proceeding without it.` in Step 1 (unchanged from the planner slice).
  - The `plan-reviewer` and (if the run reaches Step 4.3) `planner` edit prompts contain a `Task artifact:` line but no `Scout brief:` line.
  - The workflow does not fail.

- [ ] **Step 5: Run `generate-plan` on FIXTURE_TODO_OR_FREEFORM and inspect transcripts** — Using whichever branch was resolved in Step 1 (existing todo, temporary todo fixture, or freeform), confirm:
  - The `plan-reviewer` and (if the run reaches Step 4.3) `planner` edit prompts contain a `Plan artifact:` line but no `Task artifact:` or `Scout brief:` line.
  - The `## Original Spec (inline)` section in both prompts contains the todo/freeform body inline.
  - No temporary artifact file is created on disk for the original spec itself (grep `.pi/` for any newly-created unexpected files around the run). If the temporary-todo branch was used, the single throwaway todo entry is the only expected new file; delete it at the end of this step.

- [ ] **Step 6: Run a targeted missing-plan failure test for the review pass** — Simulate a missing plan file between Step 3 and Step 4.1 (e.g., by manually deleting the plan file and then re-invoking the review step, or by running the skill with a deliberately wrong plan path). Confirm the orchestrator fails with exactly: `Plan file <path> missing — cannot dispatch plan review.` Do not attempt to recover.

- [ ] **Step 7: Run a targeted missing-artifact failure test for the review pass** — Run `generate-plan` on a file input, then delete the input artifact after the plan is generated but before review. Confirm the orchestrator fails with: `Task artifact <path> missing — cannot dispatch plan review.`

- [ ] **Step 8: Run targeted missing-file failure tests for the edit pass** — Using the same fixture/harness that drives Step 4.3, verify the edit-pass fail-fast behavior introduced by Task 6:
  - Delete or invalidate the plan artifact immediately before dispatching the edit pass and confirm the orchestrator fails with exactly: `Plan file <path> missing — cannot dispatch plan edit.`
  - Restore the plan, then delete or invalidate the task artifact immediately before dispatching the edit pass and confirm the orchestrator fails with exactly: `Task artifact <path> missing — cannot dispatch plan edit.`
  These are separate from the Step 6/7 review-pass checks; both updated handoffs must be covered.

- [ ] **Step 9: Verify review quality and approval semantics are preserved** — In each smoke run that produces an `[Approved]` review, confirm: the review still writes to `.pi/plans/reviews/...-plan-review-v1.md`; warnings/suggestions are still appended as a `## Review Notes` section on approved plans (Step 4.2 behavior unchanged); the iteration cap (3 per era) is still respected in runs that produce `[Issues Found]`.

- [ ] **Step 10: Record verification results** — Write a short verification note (can be in the PR description or a scratch file) listing: the four fixtures used (including which construction was used for `FIXTURE_FORCE_EDIT` and which branch was used for `FIXTURE_TODO_OR_FREEFORM` — existing todo, temporary todo, or freeform), the grep commands showing no plan/artifact/brief contents were inlined in either the review or edit prompts, the captured evidence for Step 2's review-dispatch tool calls (tool name + path argument for each of the reviewer's reads against the plan artifact, task artifact, and scout brief paths), the captured evidence for Step 3 sub-verifications (a)/(b)/(c) including the filesystem-read tool invocations the planner made in edit mode, the warning text for the missing-brief run, and the four failure error strings for the review-pass and edit-pass missing-plan / missing-artifact runs.

**Acceptance criteria:**

- For the file-with-brief run: the `plan-reviewer` prompt contains only paths (no plan/spec/brief body), and the `plan-reviewer` transcript/tool-call log shows filesystem-read evidence against the plan artifact, task artifact, and scout brief paths. Evidence is taken from the harness-level tool-call record, not from the reviewer's review body text.
- For the forced edit-pass run (Step 3): all three sub-verifications pass — (a) plan artifact, task artifact, and (if applicable) scout brief are passed by path with zero artifact-body substring matches in the prompt; (b) `## Review Findings` remains inline in the edit-mode prompt and is not externalized to a file; (c) the planner's edit-mode transcript shows filesystem-read evidence against each path. This run is mandatory; an `[Approved]` outcome on Step 2 does not waive it.
- For the file-with-missing-brief run: missing brief produces a warning and does not fail; no `Scout brief:` line is emitted in downstream prompts.
- For the todo/freeform run: whichever branch of `FIXTURE_TODO_OR_FREEFORM` was resolved (existing todo, temporary todo fixture, or freeform), `## Original Spec (inline)` carries the inline body; no temp artifact files are created for the original spec itself; review (and edit, if reached) still succeed. The todo/freeform verification must not block on the absence of a pre-existing open todo — the temporary-todo and freeform branches are explicitly permitted fallbacks.
- Missing plan and missing task-artifact cases fail with exactly the error strings specified in Tasks 5 and 6 for the review pass, and with the corresponding `... cannot dispatch plan edit.` strings for the edit pass.
- Review approval semantics (Status parsing, `## Review Notes` append on approved, iteration cap, cross-provider fallback) are unchanged.
- Verification note is written and includes the grep evidence, the Step 2 review-dispatch tool-call evidence (reviewer's filesystem-read evidence against plan, task artifact, and scout brief paths), the Step 3 (a)/(b)/(c) evidence (including the planner's filesystem-read evidence), and all four failure strings.

**Model recommendation:** capable

---

## Dependencies

- Task 2 depends on: Task 1 (prompt placeholder names must exist before agent contract references them).
- Task 4 depends on: Task 3 (prompt placeholder shape must exist before agent contract references it).
- Task 5 depends on: Task 1, Task 2 (SKILL.md Step 4.1 fills placeholders defined in the prompt and dispatches the reviewer agent).
- Task 6 depends on: Task 3, Task 4 (SKILL.md Step 4.3 fills placeholders defined in the prompt and dispatches the planner agent in edit mode).
- Task 7 depends on: Task 5, Task 6 (scope note and edge cases reference the new Step 4.1 and 4.3 behavior).
- Task 8 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7 (smoke tests exercise the full updated flow).

Tasks 1 and 3 are independent and can run in parallel. Tasks 2 and 4 are independent (after their respective prompt tasks) and can run in parallel. Tasks 5 and 6 can run in parallel (after Tasks 1–4). Task 7 is serial after Tasks 5 and 6. Task 8 is serial last.

## Risk Assessment

- **Risk: `plan-reviewer` agent lacks filesystem read tools.** The agent's frontmatter may have no `tools:` field or may already have a narrower one. If the effective tool set does not grant read/grep/ls/bash (or a clear superset), the reviewer will fail to read the plan/artifact/brief from disk. Mitigation: Task 2 Step 1 verifies the tools field and adds or expands it as needed, matching the planner's tool set.
- **Risk: Stale plan file between review and edit iterations.** The edit pass overwrites the plan in place, then Step 4.4 loops back to Step 4.1 which reads the same path. No freshness risk here because the path does not change. Mitigation: the freshness check in Step 4.1 ("plan file exists and is non-empty") catches accidental deletion, and the planner's Edit mode contract makes the overwrite-in-place semantics explicit.
- **Risk: `Task artifact` path becomes stale if the user moves the spec file mid-run.** Mitigation: explicit fail-fast language with the exact error string. This matches the planner-slice failure policy (fail on missing required artifacts).
- **Risk: Reviewer reads the plan but diverges from the orchestrator's view of it.** Because the planner edit pass and the next review iteration both read the same on-disk file, their views are naturally consistent. No snapshot-hashing machinery is needed. This is the same live-file-read policy the planner slice adopted.
- **Risk: Inline-vs-disk ambiguity when both `Task artifact:` and `## Original Spec (inline)` are non-empty.** The orchestrator should only fill one or the other; the worker contracts (Tasks 1, 3) explicitly say "prefer on-disk, flag inconsistency." Mitigation: placeholder-filling tables in Tasks 5 and 6 make this mutually exclusive by construction (file-based input → inline empty; todo/freeform → task-artifact empty).
- **Risk: Behavior change accidentally leaks into `execute-plan`.** Mitigation: this plan only touches files under `agent/skills/generate-plan/` and `agent/agents/plan-reviewer.md` and `agent/agents/planner.md`. The planner agent is shared with `execute-plan` (via edit mode? no — `execute-plan` uses `coder`, not `planner`), but the changes to `planner.md` only touch the "Edit mode" subsection, which is specific to generate-plan's edit pass. `coder.md` is not touched.
- **Risk: Todo/freeform runs inflate orchestrator context because `{ORIGINAL_SPEC_INLINE}` is still inline across three dispatches.** This is the intentional locked-decision trade-off (locked decision #4 in the task): do not create temp files. For large todos this is still a real context cost, but it is explicitly accepted scope.