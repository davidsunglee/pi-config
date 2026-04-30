# Reviewer-Authored Review Artifacts

**Source:** TODO-0d3fd11b
**Spec:** `.pi/specs/2026-04-30-reviewer-writes-review-artifact.md`

## Goal

Replace the reviewer→refiner handoff that currently transports full review text through `results[0].finalMessage` with an artifact-based contract: the reviewer writes the full review to a designated path supplied in its task prompt, and returns a single anchored marker line `REVIEW_ARTIFACT: <absolute path>` carrying that path. The refiner reads the artifact from disk and treats its contents as the authoritative review. This applies to both the `plan-reviewer` → `plan-refiner` and `code-reviewer` → `code-refiner` paths. The change protects against truncation of large reviews mid-handoff, makes the on-disk file the sole source of truth, and makes the boundary explicit. The unversioned final copy at `<REVIEW_OUTPUT_PATH>.md` produced by `code-refiner` on `STATUS: clean` is also dropped, aligning code with the existing `plan-refiner` decision (no `latest`-style copy without an identified consumer).

## Architecture summary

This change is markdown-only. Two reviewer agent identities (`plan-reviewer.md`, `code-reviewer.md`), two refiner agent identities (`plan-refiner.md`, `code-refiner.md`), two reviewer prompt templates (`review-plan-prompt.md`, `review-code-prompt.md`), two refiner prompt templates (`refine-plan-prompt.md`, `refine-code-prompt.md`), one calling skill (`requesting-code-review/SKILL.md`), and one refining skill (`refine-code/SKILL.md`) are touched. No code (TypeScript) changes; no changes to `pi-interactive-subagent`; no changes to `model-tiers.json`; no changes to the `coder` / `planner` worker agents; no changes to refine-plan/SKILL.md (its Step 9.5 first-line regex and reason labels are unchanged because the on-disk format is byte-for-byte identical).

The two reviewer agent bodies gain a new `## Output Artifact Contract` section describing the prompt-driven write-to-path discipline, the prompt-supplied first-line provenance discipline, and the `REVIEW_ARTIFACT:` marker as the last line of the reviewer's response. The contract is conditional: when the prompt's `{REVIEW_OUTPUT_PATH}` placeholder is non-empty (the refiner-driven path), the reviewer writes the file and emits the marker; when it is empty (standalone `requesting-code-review` flow today), the reviewer emits its review free-form in its final message and writes nothing.

The two reviewer prompt templates gain two new placeholders — `{REVIEW_OUTPUT_PATH}` (the absolute path the reviewer must write to) and `{REVIEWER_PROVENANCE}` (the literal `**Reviewer:** <provider>/<model> via <cli>` first line) — plus an `## Output Artifact Contract` section that operationalizes the agent's standing rule with the per-invocation values. `requesting-code-review/SKILL.md` is updated to fill both new placeholders with empty strings, keeping the standalone flow's existing behavior.

The two refiner prompt templates are rewritten so the refiner pre-computes both the era-versioned absolute path and the verbatim `**Reviewer:**` provenance line at dispatch time, embeds both in the reviewer's task prompt, dispatches via `subagent_run_serial`, extracts the marker path from `finalMessage` with an anchored regex on the last `^REVIEW_ARTIFACT: (.+)$` line, performs three fail-fast validations (path-equality, file-existence-and-non-empty, on-disk first-line provenance with `inline` substring forbidden), and reads the on-disk file as the authoritative review. The refiner no longer writes the review file. Their `Reviewer provenance stamping` sections are rewritten to describe construction-and-validation instead of write-and-stamp; their Hard rules add a parallel artifact-handoff failure rule; their Failure Modes lists are updated to remove `review file write failed`, replace `returned empty result` with `reviewer response missing REVIEW_ARTIFACT marker`, and add three new entries (`reviewer artifact missing or empty at <path>`, `reviewer artifact path mismatch: expected <X>, got <Y>`, `reviewer artifact provenance malformed at <path>: <specific check>`).

`refine-code-prompt.md` additionally drops the Final Verification copy step that produces the unversioned `<REVIEW_OUTPUT_PATH>.md` final review file. `refine-code/SKILL.md` Step 6 drops the matching unversioned-path validation entry; its first-line regex, the `inline` forbidden rule, and the model/cli match rules for `STATUS: clean` and `STATUS: max_iterations_reached` are unchanged.

The `Reviewer provenance stamping` section in both refiner prompts retains the exact format `**Reviewer:** <provider>/<model> via <cli>`, the forbidden-`inline`-substring rule, the byte-for-byte file format on disk (first line, single blank, then body), and the SKILL-level downstream validations in `refine-plan/SKILL.md` Step 9.5 and `refine-code/SKILL.md` Step 6 (regex + reason labels unchanged). The pass-through behavior for downstream subagent prompts (`{REVIEW_FINDINGS}` for the planner edit pass, `{PREVIOUS_FINDINGS}` for hybrid re-reviews, the remediator's per-batch prompt, and the plan's `## Review Notes` append section) is preserved — the refiner just sources the text from the on-disk artifact instead of `finalMessage`.

## Tech stack

- Markdown skill files (`agent/skills/**/*.md`) — LLM instructions read at dispatch time
- Markdown agent definitions (`agent/agents/*.md`) — LLM identity files
- JSON config at `~/.pi/agent/model-tiers.json` — read at runtime by the SKILL and the refiner
- Subagent orchestration via `subagent_run_serial` from `pi-interactive-subagent` (out-of-scope dependency)
- `ripgrep` / `grep` and `sh` for post-edit verification

## File Structure

- `agent/agents/plan-reviewer.md` (Modify) — Append a new `## Output Artifact Contract` section after the existing `## Approach honoring` section. The section describes the conditional contract: when `{REVIEW_OUTPUT_PATH}` is provided in the task prompt, write the full review to that path with the prompt-supplied `{REVIEWER_PROVENANCE}` line as the first non-empty line followed by a blank line and the review body, single write per iteration, and end the final assistant message with `REVIEW_ARTIFACT: <absolute path>` on its own line. When `{REVIEW_OUTPUT_PATH}` is empty, emit the review free-form in the final message and write nothing. The existing `tools:` line (which already includes `write`) is unchanged.
- `agent/agents/code-reviewer.md` (Modify) — Append a new `## Output Artifact Contract` section after the existing `## Rules` section. The section content mirrors the plan-reviewer addition: same conditional contract, same write-discipline, same marker discipline. The existing `tools:` line is unchanged.
- `agent/skills/generate-plan/review-plan-prompt.md` (Modify) — Add a new `## Output Artifact Contract` section between the existing `## Output Format` and `## Critical Rules` sections. The new section introduces two placeholders — `{REVIEW_OUTPUT_PATH}` and `{REVIEWER_PROVENANCE}` — and describes the conditional write-and-marker contract that operationalizes the agent's standing rule with the per-invocation values supplied by the refiner.
- `agent/skills/requesting-code-review/review-code-prompt.md` (Modify) — Add the same `## Output Artifact Contract` section between `## Critical Rules` and `## Example Output` (or wherever fits before the example), with the same two new placeholders and the same conditional contract prose. Keep the existing structure otherwise.
- `agent/skills/requesting-code-review/SKILL.md` (Modify) — Update Step 2's "Fill these placeholders" list to also fill `{REVIEW_OUTPUT_PATH}` and `{REVIEWER_PROVENANCE}` with empty strings, with a one-sentence explanation that standalone reviews keep both empty so the conditional contract is dormant and the reviewer emits free-form output.
- `agent/skills/refine-plan/refine-plan-prompt.md` (Modify) — Add an artifact-handoff Hard rule above the existing rules. Rewrite the `### Reviewer provenance stamping` section so the refiner constructs the exact `**Reviewer:**` line at dispatch time, embeds it in the reviewer's prompt, and validates the on-disk first line on read-back instead of writing the file itself. In `### Per-Iteration Full Review`: extend Step 3's placeholder list to include `{REVIEW_OUTPUT_PATH}` (the absolute era-versioned path) and `{REVIEWER_PROVENANCE}` (the verbatim `**Reviewer:** <provider>/<model> via <cli>` line for THIS iteration's reviewer dispatch); replace existing Steps 5 and 6 with a new Step 5 that extracts the `REVIEW_ARTIFACT:` marker via anchored regex on the last `^REVIEW_ARTIFACT: (.+)$` line of `finalMessage`, validates path-equality + file-existence-and-non-empty + on-disk-first-line provenance (each with its own failure reason), and reads the on-disk file as the authoritative review; renumber subsequent steps. Update `## Failure Modes`: remove `review file write failed: <error>`, replace `plan-reviewer returned empty result` with `reviewer response missing REVIEW_ARTIFACT marker`, add `reviewer artifact missing or empty at <path>`, `reviewer artifact path mismatch: expected <X>, got <Y>`, and `reviewer artifact provenance malformed at <path>: <specific check>`.
- `agent/agents/plan-refiner.md` (Modify) — Add the standing identity rule that forbids improvised review-file creation or inline-review fallback when the reviewer artifact handoff fails. This mirrors the new prompt-side Hard rule so the coordinator's baseline identity and per-invocation protocol stay aligned.
- `agent/skills/refine-code/refine-code-prompt.md` (Modify) — Add an artifact-handoff Hard rule above the existing rules. Rewrite the `### Reviewer provenance stamping` section so the refiner constructs and validates the line instead of writing it; remove the unversioned-final-copy mention from this section. In `### Iteration 1: Full Review`: extend Step 2's placeholder list with `{REVIEW_OUTPUT_PATH}` (the absolute era-versioned path) and `{REVIEWER_PROVENANCE}`; replace Steps 3 and 4 with a new Step 3 that dispatches the reviewer with the augmented prompt, extracts the marker via anchored regex, validates path-equality + non-empty + on-disk provenance, and reads the file from disk; renumber subsequent steps. In `### Iteration 2..N: Hybrid Re-Review`: add `{REVIEW_OUTPUT_PATH}` and `{REVIEWER_PROVENANCE}` to Step 4's placeholder fills with the SAME absolute era-versioned path (the file is overwritten in place by the reviewer, with a fresh provenance line per iteration); replace Steps 5 and 6 with a new Step 5 that dispatches, extracts, validates, and reads. In `### Final Verification`: extend Step 1's placeholder fills with the same two new placeholders pointing at the same era-versioned path with the final-verification iteration's provenance line; rewrite Step 2 to perform marker extraction + validation + read instead of writing; remove the line that copies the versioned file to the unversioned path. Add a new `## Failure Modes` section listing the artifact-handoff failure reasons (no `review file write failed` entry, replaces `worker dispatch returned empty` with `reviewer response missing REVIEW_ARTIFACT marker`, plus the three artifact-validation entries). The existing reviewer-dispatch failure entries (`worker dispatch failed: <which worker>`, `coordinator dispatch unavailable`) remain.
- `agent/agents/code-refiner.md` (Modify) — Add the standing identity rule that forbids improvised review-file creation or inline-review fallback when the reviewer artifact handoff fails. This mirrors the new prompt-side Hard rule so the coordinator's baseline identity and per-invocation protocol stay aligned.
- `agent/skills/refine-code/SKILL.md` (Modify) — In Step 6, drop the bullet that adds the unversioned final copy at `<REVIEW_OUTPUT_PATH>.md` to the validation list on `STATUS: clean`. The list is now exactly one entry: the path the coordinator reported in `## Review File`. Rules 1–4 (regex, extraction, `inline` forbidden, model-tier resolution) are unchanged. Rules 5 (`STATUS: clean` requires `crossProvider.capable`) and 6 (`STATUS: max_iterations_reached` allows `crossProvider.capable` or `standard`) are unchanged. Surrounding prose is updated to remove any mention of the unversioned final copy and the parenthetical about it preserving the just-stamped first line.

## Tasks

### Task 1: Add Output Artifact Contract to reviewer agent definitions

**Files:**
- Modify: `agent/agents/plan-reviewer.md`
- Modify: `agent/agents/code-reviewer.md`

**Steps:**

- [ ] **Step 1: Read `agent/agents/plan-reviewer.md` in full** — Open the file with the read tool. Note the existing structure: frontmatter (lines 1–8 with `tools: read, write, grep, find, ls`), introductory paragraphs, `## Input Contract`, `## Principles`, `## Rules`, `## Approach honoring`. Confirm `write` is already in `tools:`.

- [ ] **Step 2: Append `## Output Artifact Contract` section to `agent/agents/plan-reviewer.md`** — After the existing `## Approach honoring` section (the last section in the file), append exactly this new section with a leading blank line for separation:

  ```markdown

  ## Output Artifact Contract

  Your task prompt may include a designated output artifact path and a verbatim provenance first line. The contract is conditional on those values:

  **When `{REVIEW_OUTPUT_PATH}` is non-empty** (the refiner-driven path):

  1. Write the full review to the absolute path supplied as `{REVIEW_OUTPUT_PATH}`. The first non-empty line of the file MUST be exactly the line supplied as `{REVIEWER_PROVENANCE}` — no edits, no normalization, no additional prefix or suffix on that line.
  2. The provenance line is followed by a single blank line, then the review body (Status verdict, Issues, Summary as defined in your prompt template's Output Format).
  3. Perform a single write per iteration. Do not re-write the file later in the same dispatch.
  4. End your final assistant message with exactly one anchored line on its own line, as the very last line of your output: `REVIEW_ARTIFACT: <absolute path>` where `<absolute path>` is character-for-character identical to `{REVIEW_OUTPUT_PATH}`.
  5. Do not emit any other structured markers in your response. The on-disk file is the sole source of truth for verdict, severity counts, and findings — the refiner reads the file from disk; the marker exists only to convey the path.
  6. Conversational text before the marker line is permitted; the refiner anchors on the last `^REVIEW_ARTIFACT: (.+)$` line.

  **When `{REVIEW_OUTPUT_PATH}` is empty** (standalone or non-refiner dispatch):

  Output the full review as your final assistant message in the format defined by your prompt template's Output Format. Do not write to any path. Do not emit a `REVIEW_ARTIFACT:` marker.

  Failure to follow this contract when `{REVIEW_OUTPUT_PATH}` is non-empty will be caught by the refiner's fail-fast validation (path-equality, file-existence-and-non-empty, on-disk first-line provenance) and surface as a `STATUS: failed` outcome with a specific reason naming the failed check.
  ```

  Use the Edit tool with the existing last paragraph of `## Approach honoring` (currently ending with the line about preserving current review behavior when the spec lacks an `## Approach` section) as the unique anchor. After the edit, the file ends with the new `## Output Artifact Contract` section.

- [ ] **Step 3: Read `agent/agents/code-reviewer.md` in full** — Open the file with the read tool. Note the existing structure: frontmatter (lines 1–8 with `tools: read, write, grep, find, ls, bash`), introductory paragraphs, `## Modes`, `## Principles`, `## Rules`. Confirm `write` is already in `tools:`.

- [ ] **Step 4: Append `## Output Artifact Contract` section to `agent/agents/code-reviewer.md`** — After the existing `## Rules` section (the last section in the file), append exactly the same `## Output Artifact Contract` section content as in Step 2, with one wording adjustment in the body-format description: replace "(Status verdict, Issues, Summary as defined in your prompt template's Output Format)" with "(Strengths, Issues, Recommendations, Assessment as defined in your prompt template's Output Format)". Everything else in the section is verbatim identical to the plan-reviewer version. Use the Edit tool with the existing last `## Rules` bullet (`Do NOT say "looks good" without actually reading the changed files`) as the anchor.

- [ ] **Step 5: Confirm `tools:` lines are unchanged in both files** — Read the first 10 lines of each file and confirm: `agent/agents/plan-reviewer.md` line 4 still reads `tools: read, write, grep, find, ls`; `agent/agents/code-reviewer.md` line 4 still reads `tools: read, write, grep, find, ls, bash`. The contract change reuses existing tool capability — no frontmatter edits.

**Acceptance criteria:**

- `agent/agents/plan-reviewer.md` ends with a `## Output Artifact Contract` H2 section whose body describes the conditional write-to-path-with-provenance behavior, the single-write rule, and the trailing `REVIEW_ARTIFACT: <absolute path>` marker line.
  Verify: `grep -n "^## Output Artifact Contract" agent/agents/plan-reviewer.md` returns exactly one match, and the section body (read from that line to end of file) contains all of the literal substrings `{REVIEW_OUTPUT_PATH}`, `{REVIEWER_PROVENANCE}`, `REVIEW_ARTIFACT:`, and `single write per iteration`.
- `agent/agents/code-reviewer.md` ends with the same `## Output Artifact Contract` H2 section, with the body-format note adapted to the code-review Output Format (Strengths/Issues/Recommendations/Assessment).
  Verify: `grep -n "^## Output Artifact Contract" agent/agents/code-reviewer.md` returns exactly one match, and the section body contains the literal substrings `{REVIEW_OUTPUT_PATH}`, `{REVIEWER_PROVENANCE}`, `REVIEW_ARTIFACT:`, `single write per iteration`, and `Strengths, Issues, Recommendations, Assessment`.
- The `tools:` frontmatter line is unchanged in both files (no new tools added; `write` already present).
  Verify: `grep -n "^tools:" agent/agents/plan-reviewer.md` returns the line `tools: read, write, grep, find, ls`; `grep -n "^tools:" agent/agents/code-reviewer.md` returns the line `tools: read, write, grep, find, ls, bash`.

**Model recommendation:** standard

### Task 2: Add new placeholders and Output Artifact Contract to reviewer prompt templates

**Files:**
- Modify: `agent/skills/generate-plan/review-plan-prompt.md`
- Modify: `agent/skills/requesting-code-review/review-code-prompt.md`

**Steps:**

- [ ] **Step 1: Read `agent/skills/generate-plan/review-plan-prompt.md` in full** — Note the structure: top heading, task description, `## Provenance` (with placeholder block), `## Original Spec (inline)`, `## Structural-Only Mode`, `## Artifact Reading Contract`, `## Review Checklist`, `## Calibration`, `## Output Format`, `## Critical Rules`. Identify the exact end-of-section anchor for inserting the new Output Artifact Contract section between `## Output Format` and `## Critical Rules`.

- [ ] **Step 2: Insert `## Output Artifact Contract` section into `review-plan-prompt.md`** — Use the Edit tool with the line `## Critical Rules` as the unique anchor and prepend the new section before it, separated by a leading blank line. Section body:

  ```markdown
  ## Output Artifact Contract

  This section operationalizes your standing `## Output Artifact Contract` rule with the per-invocation values supplied by the refiner.

  - **Designated output path:** `{REVIEW_OUTPUT_PATH}`
  - **Verbatim provenance first line:** `{REVIEWER_PROVENANCE}`

  When `{REVIEW_OUTPUT_PATH}` is non-empty:

  1. Write the full review (Status verdict, Issues with severity tags, Summary) to `{REVIEW_OUTPUT_PATH}` (absolute path).
  2. The first non-empty line of the file MUST be exactly `{REVIEWER_PROVENANCE}` — copy it verbatim. Do not normalize whitespace, do not add backticks, do not insert any other content above it.
  3. Follow the provenance line with a single blank line, then the review body in the format defined by `## Output Format` above.
  4. Perform exactly one write per dispatch.
  5. End your final assistant message with exactly one anchored line on its own line, as the very last line of your output: `REVIEW_ARTIFACT: <absolute path>` where `<absolute path>` is character-for-character identical to `{REVIEW_OUTPUT_PATH}`.
  6. Do not emit any other structured markers; the on-disk file is the sole source of truth for the refiner.

  When `{REVIEW_OUTPUT_PATH}` is empty (standalone use):

  Output your review as your final assistant message in the format defined by `## Output Format` above. Do not write to disk. Do not emit a `REVIEW_ARTIFACT:` marker.
  ```

- [ ] **Step 3: Read `agent/skills/requesting-code-review/review-code-prompt.md` in full** — Note the structure: opening adapted-from comment, top heading, task description, `## What Was Implemented`, `## Requirements/Plan`, `## Git Range to Review`, `{RE_REVIEW_BLOCK}` placeholder, `## Review Checklist`, `## Output Format`, `## Critical Rules`, `## Example Output`. Identify the exact end-of-section anchor for inserting the new Output Artifact Contract section between `## Critical Rules` and `## Example Output`.

- [ ] **Step 4: Insert `## Output Artifact Contract` section into `review-code-prompt.md`** — Use the Edit tool with the line `## Example Output` as the unique anchor and prepend the new section before it, separated by a leading blank line. Section body is identical to Step 2's body except:
   - In bullet 1, replace `(Status verdict, Issues with severity tags, Summary)` with `(Strengths, Issues by severity, Recommendations, Assessment with the "Ready to merge" verdict)` to match this template's Output Format.
   - In the standalone branch's "Output your review..." sentence, replace `## Output Format above` with `## Output Format above` (no change — both templates use the same heading text, but verify the link).

- [ ] **Step 5: Confirm both new sections render correctly** — Read each file from the `## Output Artifact Contract` heading to the next H2 heading and confirm: (a) the two placeholders appear in the section body, (b) the conditional language ("When `{REVIEW_OUTPUT_PATH}` is non-empty" / "When `{REVIEW_OUTPUT_PATH}` is empty") is present, (c) the marker line `REVIEW_ARTIFACT: <absolute path>` is described as the last line of the response.

**Acceptance criteria:**

- `agent/skills/generate-plan/review-plan-prompt.md` contains a new `## Output Artifact Contract` H2 section between `## Output Format` and `## Critical Rules`, with both `{REVIEW_OUTPUT_PATH}` and `{REVIEWER_PROVENANCE}` placeholders in the section body and the conditional contract prose.
  Verify: `grep -n "^## Output Artifact Contract" agent/skills/generate-plan/review-plan-prompt.md` returns exactly one match positioned after the `## Output Format` heading and before `## Critical Rules` (compare line numbers from `grep -n "^## " agent/skills/generate-plan/review-plan-prompt.md`).
- The placeholders `{REVIEW_OUTPUT_PATH}` and `{REVIEWER_PROVENANCE}` are present in `review-plan-prompt.md`.
  Verify: `grep -F '{REVIEW_OUTPUT_PATH}' agent/skills/generate-plan/review-plan-prompt.md` returns at least one match, and `grep -F '{REVIEWER_PROVENANCE}' agent/skills/generate-plan/review-plan-prompt.md` returns at least one match.
- `agent/skills/requesting-code-review/review-code-prompt.md` contains a new `## Output Artifact Contract` H2 section between `## Critical Rules` and `## Example Output`, with both new placeholders in the section body, the conditional contract prose, and the body-format note referencing Strengths / Issues / Recommendations / Assessment.
  Verify: `grep -n "^## Output Artifact Contract" agent/skills/requesting-code-review/review-code-prompt.md` returns exactly one match positioned after `## Critical Rules` and before `## Example Output`.
- The placeholders `{REVIEW_OUTPUT_PATH}` and `{REVIEWER_PROVENANCE}` are present in `review-code-prompt.md`.
  Verify: `grep -F '{REVIEW_OUTPUT_PATH}' agent/skills/requesting-code-review/review-code-prompt.md` returns at least one match, and `grep -F '{REVIEWER_PROVENANCE}' agent/skills/requesting-code-review/review-code-prompt.md` returns at least one match.
- Both templates describe the conditional contract: write-to-path discipline when `{REVIEW_OUTPUT_PATH}` is non-empty, free-form output when it is empty.
  Verify: open `agent/skills/generate-plan/review-plan-prompt.md` and `agent/skills/requesting-code-review/review-code-prompt.md`; in each file confirm the `## Output Artifact Contract` section body contains both the literal phrase `When \`{REVIEW_OUTPUT_PATH}\` is non-empty` and `When \`{REVIEW_OUTPUT_PATH}\` is empty` (or syntactically equivalent variants — both clauses must be present).

**Model recommendation:** standard

### Task 3: Update requesting-code-review/SKILL.md to fill new placeholders with empty strings

**Files:**
- Modify: `agent/skills/requesting-code-review/SKILL.md`

**Steps:**

- [ ] **Step 1: Read `agent/skills/requesting-code-review/SKILL.md` in full** — Locate Step 2 ("Read the prompt template and fill placeholders"). The current bullet list of placeholders to fill is:
  - `{WHAT_WAS_IMPLEMENTED}`
  - `{PLAN_OR_REQUIREMENTS}`
  - `{BASE_SHA}`
  - `{HEAD_SHA}`
  - `{DESCRIPTION}`
  - `{RE_REVIEW_BLOCK}`

- [ ] **Step 2: Extend the placeholder fill list with two new entries** — Use the Edit tool with the existing line `- \`{RE_REVIEW_BLOCK}\` — empty string (standalone reviews are always full reviews, not re-reviews)` as the unique anchor. Replace it with the same line followed by two new bullets:

  ```markdown
  - `{RE_REVIEW_BLOCK}` — empty string (standalone reviews are always full reviews, not re-reviews)
  - `{REVIEW_OUTPUT_PATH}` — empty string (standalone reviews do not persist to a designated artifact path; the conditional Output Artifact Contract in the prompt template is dormant when this placeholder is empty)
  - `{REVIEWER_PROVENANCE}` — empty string (no provenance first line is required when the contract is dormant)
  ```

  After the edit, the bullet list reads in order: `{WHAT_WAS_IMPLEMENTED}`, `{PLAN_OR_REQUIREMENTS}`, `{BASE_SHA}`, `{HEAD_SHA}`, `{DESCRIPTION}`, `{RE_REVIEW_BLOCK}`, `{REVIEW_OUTPUT_PATH}`, `{REVIEWER_PROVENANCE}`.

- [ ] **Step 3: Verify the dispatch flow is otherwise unchanged** — Read Step 3 ("Dispatch the subagent") and Step 4 ("Act on feedback"). Confirm no other change is needed: requesting-code-review still reads `results[0].finalMessage` for the review text (since the contract is dormant and the reviewer outputs free-form), and the rest of the flow is intact.

**Acceptance criteria:**

- `agent/skills/requesting-code-review/SKILL.md` Step 2 placeholder list includes both `{REVIEW_OUTPUT_PATH}` (empty string) and `{REVIEWER_PROVENANCE}` (empty string), each with a one-sentence rationale that the conditional contract is dormant for standalone use.
  Verify: `grep -n -F '{REVIEW_OUTPUT_PATH}' agent/skills/requesting-code-review/SKILL.md` returns at least one match, and `grep -n -F '{REVIEWER_PROVENANCE}' agent/skills/requesting-code-review/SKILL.md` returns at least one match.
- The two new bullets sit immediately after the existing `{RE_REVIEW_BLOCK}` bullet, preserving the placeholder-list order.
  Verify: open `agent/skills/requesting-code-review/SKILL.md`, navigate to Step 2's placeholder list, and confirm the order reads `{WHAT_WAS_IMPLEMENTED}`, `{PLAN_OR_REQUIREMENTS}`, `{BASE_SHA}`, `{HEAD_SHA}`, `{DESCRIPTION}`, `{RE_REVIEW_BLOCK}`, `{REVIEW_OUTPUT_PATH}`, `{REVIEWER_PROVENANCE}`.

**Model recommendation:** cheap

### Task 4: Rewrite refine-plan-prompt.md to use the new artifact-handoff contract

**Files:**
- Modify: `agent/skills/refine-plan/refine-plan-prompt.md`
- Modify: `agent/agents/plan-refiner.md`

**Steps:**

- [ ] **Step 1: Read `agent/skills/refine-plan/refine-plan-prompt.md` in full** — Map the current structure: header, Provenance, Structural-Only Mode, Original Spec, Configuration (incl. Model Matrix and Dispatch resolution), Protocol → Hard rules → Reviewer provenance stamping → Per-Iteration Full Review (steps 1–11) → Review Notes Append Format → Planner Edit Pass (steps 1–5), Output Format, Failure Modes.

- [ ] **Step 2: Add an artifact-handoff Hard rule** — Use the Edit tool with the existing two-rule numbered list under `### Hard rules (read first)` as the anchor. Add a new rule 3 after the existing rule 2:

  ```markdown
  3. **No improvised review file or inline review on artifact-handoff failure.** If the `plan-reviewer`'s response is missing the `REVIEW_ARTIFACT:` marker, OR the artifact file is missing/empty/path-mismatched, OR the on-disk first-line provenance is malformed, you MUST emit `STATUS: failed` with the specific reason from the `## Failure Modes` list (`reviewer response missing REVIEW_ARTIFACT marker`, `reviewer artifact missing or empty at <path>`, `reviewer artifact path mismatch: expected <X>, got <Y>`, or `reviewer artifact provenance malformed at <path>: <specific check>`) and exit. You MUST NOT improvise the review file or fall back to inline review. This mirrors the existing "no inline review on dispatch failure" rules above.
  ```

  Update the trailing "Both rules are duplicated as standing identity rules in `agent/agents/plan-refiner.md` `## Rules`" sentence to read "All three rules are duplicated as standing identity rules..." (the duplication of rule 3 in `plan-refiner.md` `## Rules` is added in Task 4 Step 9 — note that Step 9 below adds the corresponding agent-body rule).

- [ ] **Step 3: Rewrite the `### Reviewer provenance stamping` section** — Use the Edit tool with the entire existing section body (from the `### Reviewer provenance stamping` heading through the paragraph that ends "missing, malformed, or `inline`-valued stamps will surface as a validation error to the caller.") as the anchor. Replace it with:

  ```markdown
  ### Reviewer provenance stamping

  Every review file persisted in this loop MUST begin with a `**Reviewer:**` provenance line as its first non-empty line. The format is exact:

  ```
  **Reviewer:** <provider>/<model> via <cli>
  ```

  - `<provider>/<model>` MUST be the EXACT model string you passed to `subagent_run_serial` for that iteration's `plan-reviewer` dispatch (e.g., `openai-codex/gpt-5.5`).
  - `<cli>` MUST be the EXACT cli string you passed to `subagent_run_serial` for that same dispatch (e.g., `pi`).
  - The line is followed by a single blank line, then the review body.
  - The value MUST NOT contain `inline` or any synonym (`improvised`, `local`, `fallback`).

  **You no longer write the review file.** The reviewer writes it, using the verbatim provenance line you supply in its task prompt as `{REVIEWER_PROVENANCE}` and the absolute output path you supply as `{REVIEW_OUTPUT_PATH}`. Your role is to:

  1. **Construct** the verbatim `**Reviewer:** <provider>/<model> via <cli>` line at dispatch time, using the exact `model` and `cli` values you are passing to THIS iteration's `subagent_run_serial` task. Re-construct the line per iteration — if iteration 1 used `crossProvider.capable` and iteration 2 fell back to `capable`, iteration 2's line uses iteration 2's pair.
  2. **Embed** that line as `{REVIEWER_PROVENANCE}` in the filled review-plan-prompt.md, and embed the absolute era-versioned path as `{REVIEW_OUTPUT_PATH}` (see Per-Iteration Full Review Step 3 below for the path-construction rule).
  3. **Validate** the on-disk first non-empty line on read-back (Per-Iteration Full Review Step 5 below), as a fail-fast check. The check is: line matches the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`, and the value does NOT contain the substring `inline` (case-insensitive). The downstream `refine-plan/SKILL.md` Step 9.5 validation runs again on the returned path with the same regex and reason labels — your fail-fast check is additive, not a replacement.

  When the file is overwritten in place across iterations within one era, the reviewer's fresh write replaces the prior first line with iteration N's provenance; you supply iteration N's `{REVIEWER_PROVENANCE}` afresh per iteration.
  ```

- [ ] **Step 4: Extend Per-Iteration Full Review Step 3 placeholder fills** — Use the Edit tool with the existing Step 3 bullet list (`{PLAN_ARTIFACT}`, `{TASK_ARTIFACT}`, `{SOURCE_TODO}`, `{SOURCE_SPEC}`, `{SCOUT_BRIEF}`, `{ORIGINAL_SPEC_INLINE}`, `{STRUCTURAL_ONLY_NOTE}`) as the anchor. Add two new bullets at the end of the list:

  ```markdown
  - `{REVIEW_OUTPUT_PATH}` — the absolute path `{WORKING_DIR}/{REVIEW_OUTPUT_PATH}-v<CURRENT_ERA>.md` (concatenate `{WORKING_DIR}` and the relative review-output base path supplied above, then append `-v<CURRENT_ERA>.md`). Use the SAME path each iteration in this era — the file is overwritten in place by the reviewer.
  - `{REVIEWER_PROVENANCE}` — the verbatim line `**Reviewer:** <provider>/<model> via <cli>` constructed from the EXACT `model` and `cli` you will pass to THIS iteration's `subagent_run_serial` task in Step 4. Reconstruct per iteration if the model or cli changes (e.g., primary → fallback).
  ```

  Note: the bullet says "concatenate `{WORKING_DIR}` and the relative review-output base path"; `{REVIEW_OUTPUT_PATH}` in the configuration section above this prompt is the relative base path (e.g., `.pi/plans/reviews/<plan-basename>-plan-review`) supplied by the SKILL. Trust `{WORKING_DIR}` to be absolute (the SKILL produces it via `pwd` in its caller's session). The dual use of `{REVIEW_OUTPUT_PATH}` — as the configuration-level relative base and as the filled-into-reviewer-prompt absolute path — is acceptable here because the configuration section's value is a base prefix, and the reviewer-prompt placeholder is the fully constructed era-versioned absolute path.

- [ ] **Step 5: Replace Per-Iteration Full Review Steps 5 and 6** — Use the Edit tool with the existing Step 5 ("Read the reviewer's output from `results[0].finalMessage`...") and Step 6 ("Write the full reviewer output to `{REVIEW_OUTPUT_PATH}-v<CURRENT_ERA>.md`...") as the anchor block. Replace both steps with a single new Step 5:

  ```markdown
  5. **Extract and validate the reviewer's artifact handoff.** Read `results[0].finalMessage`. Perform these steps in order, each producing its own `STATUS: failed` reason on failure:

     - **5a. Marker extraction.** Find the LAST line in `finalMessage` matching the anchored regex `^REVIEW_ARTIFACT: (.+)$`. If no such line exists, emit `STATUS: failed` with reason `reviewer response missing REVIEW_ARTIFACT marker` and exit. Capture the captured group as `<reviewer_path>`.
     - **5b. Path-equality check.** Compare `<reviewer_path>` (string-equal) to the absolute path you supplied as `{REVIEW_OUTPUT_PATH}` in Step 3. If they differ, emit `STATUS: failed` with reason `reviewer artifact path mismatch: expected <expected>, got <reviewer_path>` (substituting the supplied path for `<expected>`) and exit.
     - **5c. File-existence check.** Read `<reviewer_path>` from disk. If the file does not exist, OR the file is empty (zero bytes, or only whitespace), emit `STATUS: failed` with reason `reviewer artifact missing or empty at <reviewer_path>` and exit.
     - **5d. On-disk first-line provenance check.** Find the first non-empty line of `<reviewer_path>`. Validate two things: (i) the line matches the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`; (ii) the matched value does NOT contain the substring `inline` (case-insensitive). On either failure, emit `STATUS: failed` with reason `reviewer artifact provenance malformed at <reviewer_path>: <specific check>` (substituting `format mismatch` or `inline-substring forbidden` for `<specific check>`) and exit.
     - **5e. Read the file as the authoritative review.** On all checks passing, treat the on-disk file content as the authoritative review for verdict parsing, severity counting, planner-edit-pass `{REVIEW_FINDINGS}` construction, and the `## Review Notes` append. Do NOT use `finalMessage` content beyond the marker line.

     Do NOT improvise the review file or perform an inline review on any failure above (Hard rule 3).
  ```

  Renumber the subsequent Steps 7–11 to 6–10 (parsing the review file, counting findings, the `Errors == 0` branch, the `Errors > 0` branch, and the `Errors > 0` budget-exhausted branch). Update any cross-references to step numbers in the body and in the `### Planner Edit Pass` section's "loop back to Per-Iteration Full Review step 1" sentence (the loopback step number is unchanged at 1).

- [ ] **Step 6: Update `### Planner Edit Pass` Step 2 to clarify finding source** — Use the Edit tool with the existing line `- \`{REVIEW_FINDINGS}\` — the full text of all Error-severity findings concatenated from the review file` as the anchor. Replace `the review file` with `the on-disk review artifact (read in Per-Iteration Full Review Step 5e)`. The substantive content is unchanged — the finding text still flows inline into the planner edit prompt.

- [ ] **Step 7: Update `## Failure Modes` list** — Use the Edit tool with the existing `## Failure Modes` section's bullet list (the seven entries from "Plan file missing or empty at iteration start" through "Coordinator orchestration tool unavailable") as the anchor. Replace the list with the new list below, preserving the introductory paragraph above it:

  ```markdown
  - **Plan file missing or empty at iteration start** — reason: `plan file missing or empty at iteration start`
  - **Plan-reviewer dispatch failed on both primary and fallback** — reason: `plan-reviewer dispatch failed on primary and fallback`
  - **Reviewer response missing the REVIEW_ARTIFACT marker** — reason: `reviewer response missing REVIEW_ARTIFACT marker`
  - **Reviewer artifact missing or empty on disk** — reason: `reviewer artifact missing or empty at <path>`
  - **Reviewer artifact path mismatch (the marker path does not equal the path supplied to the reviewer)** — reason: `reviewer artifact path mismatch: expected <X>, got <Y>`
  - **Reviewer artifact provenance malformed (first-line regex fails or contains `inline`)** — reason: `reviewer artifact provenance malformed at <path>: <specific check>`
  - **Planner edit-pass dispatch failed** — reason: `planner edit-pass dispatch failed`
  - **Plan file missing or empty after the planner edit pass returned** — reason: `plan file missing or empty after planner edit pass returned`
  - **Coordinator orchestration tool unavailable** — reason: `coordinator dispatch unavailable`
  ```

  This list (a) removes the `Plan-reviewer returned an empty result` entry (replaced by the marker-missing entry), (b) removes the `Review file write failed` entry (the refiner no longer writes the file), and (c) adds the three artifact-validation entries. The existing `Plan-reviewer dispatch failed on both primary and fallback` entry is retained — the new entries cover artifact-handoff failures that are distinct from dispatch failures.

- [ ] **Step 8: Update `## Output Format` failure-path text** — Use the Edit tool with the existing block "On `STATUS: failed`, the `## Review Files` list contains only review files that were successfully written before the failure: ... Leave the `## Review Files` list empty when the failure occurred before any review file was written (e.g. plan file missing or empty at iteration start, plan-reviewer dispatch failed on both primary and fallback, plan-reviewer returned an empty `results[0].finalMessage`, or the review file write itself failed)." as the anchor. Replace with:

  ```markdown
  On `STATUS: failed`, the `## Review Files` list contains only review files that the reviewer successfully wrote and you successfully validated before the failure occurred:

  - Include the era file path if the reviewer's artifact was successfully written and passed all of Step 5's validations (5a–5d) for the most recent iteration before the failure.
  - Leave the `## Review Files` list empty when the failure occurred before any reviewer artifact passed validation (e.g. plan file missing or empty at iteration start, plan-reviewer dispatch failed on both primary and fallback, the reviewer's response was missing the `REVIEW_ARTIFACT` marker, the artifact was missing/empty/path-mismatched, or its on-disk provenance was malformed).
  ```

- [ ] **Step 9: Add a parallel artifact-handoff Rule to `agent/agents/plan-refiner.md`** — Read `agent/agents/plan-refiner.md`. Use the Edit tool with the existing last bullet under `## Rules` (`do NOT perform an inline review if subagent_run_serial is unavailable or every plan-reviewer / planner edit-pass dispatch attempt fails — emit STATUS: failed and exit without writing a review file.`) as the anchor. Append a new bullet immediately after it:

  ```markdown
  - do NOT improvise a review file or fall back to inline review when the reviewer's artifact handoff fails (missing `REVIEW_ARTIFACT:` marker, missing/empty artifact, path mismatch, malformed on-disk provenance) — emit `STATUS: failed` with the specific reason from the `## Failure Modes` list and exit. The reviewer is the sole writer of the review file under this contract; you construct, embed, and validate the provenance line but you never write the file yourself.
  ```

  This duplicates rule 3 (added in Step 2) at the agent-body layer for standing identity, mirroring the duplication pattern already established for the existing rules.

**Acceptance criteria:**

- The `### Hard rules (read first)` section in `refine-plan-prompt.md` contains exactly three numbered rules; rule 3 forbids improvised review file or inline review on artifact-handoff failure and references the new failure reasons.
  Verify: `grep -n "^### Hard rules" agent/skills/refine-plan/refine-plan-prompt.md` and `grep -n "^3. \*\*No improvised review file" agent/skills/refine-plan/refine-plan-prompt.md` each return one match; open the section and confirm three rules are present and rule 3 names all four artifact-handoff failure reasons.
- The `### Reviewer provenance stamping` section now describes refiner-side construction-and-validation; the literal phrase "You no longer write the review file" appears in the body.
  Verify: `grep -n "You no longer write the review file" agent/skills/refine-plan/refine-plan-prompt.md` returns at least one match inside the `### Reviewer provenance stamping` section.
- Per-Iteration Full Review Step 3 placeholder list includes both `{REVIEW_OUTPUT_PATH}` (constructed from `{WORKING_DIR}` + relative base + `-v<CURRENT_ERA>.md`) and `{REVIEWER_PROVENANCE}`.
  Verify: open `agent/skills/refine-plan/refine-plan-prompt.md` and read `### Per-Iteration Full Review` Step 3; confirm the bullet list ends with two new entries naming `{REVIEW_OUTPUT_PATH}` and `{REVIEWER_PROVENANCE}` and that the `{REVIEW_OUTPUT_PATH}` bullet describes the absolute-path construction rule (concatenate `{WORKING_DIR}` and the relative review-output base path, append `-v<CURRENT_ERA>.md`).
- The old `### Per-Iteration Full Review` Steps 5 (read finalMessage) and 6 (write the file) are replaced by a new Step 5 with substeps 5a–5e (marker extraction, path-equality, file-existence, on-disk provenance, read-as-authoritative).
  Verify: open `agent/skills/refine-plan/refine-plan-prompt.md` and read `### Per-Iteration Full Review` Step 5; confirm substeps 5a, 5b, 5c, 5d, 5e are present, each with its own failure reason string, and that no separate Step 6 about writing the review file remains in the section.
- The `## Failure Modes` list does NOT contain `review file write failed` or `plan-reviewer returned empty result`; it DOES contain `reviewer response missing REVIEW_ARTIFACT marker`, `reviewer artifact missing or empty at <path>`, `reviewer artifact path mismatch: expected <X>, got <Y>`, and `reviewer artifact provenance malformed at <path>: <specific check>`.
  Verify: `grep -n "review file write failed" agent/skills/refine-plan/refine-plan-prompt.md` returns no matches; `grep -n "returned an empty result\|returned empty result" agent/skills/refine-plan/refine-plan-prompt.md` returns no matches; `grep -n "reviewer response missing REVIEW_ARTIFACT marker\|reviewer artifact missing or empty\|reviewer artifact path mismatch\|reviewer artifact provenance malformed" agent/skills/refine-plan/refine-plan-prompt.md` returns at least four matches inside the `## Failure Modes` section.
- `agent/agents/plan-refiner.md` `## Rules` section gains a new bullet forbidding improvised review file or inline review on artifact-handoff failure, mirroring the prompt-side rule 3.
  Verify: `grep -n "do NOT improvise a review file or fall back to inline review" agent/agents/plan-refiner.md` returns at least one match inside the `## Rules` section.

**Model recommendation:** standard

### Task 5: Rewrite refine-code-prompt.md to use the new artifact-handoff contract and drop the unversioned final copy

**Files:**
- Modify: `agent/skills/refine-code/refine-code-prompt.md`
- Modify: `agent/agents/code-refiner.md`

**Steps:**

- [ ] **Step 1: Read `agent/skills/refine-code/refine-code-prompt.md` in full** — Map the current structure: header, What Was Implemented, Requirements/Plan, Git Range, Configuration (incl. Model Matrix and Dispatch resolution), Protocol → Hard rules → Reviewer provenance stamping → Iteration 1: Full Review (steps 1–10) → Iteration 2..N: Hybrid Re-Review (steps 1–7) → Final Verification (steps 1–3) → On Budget Exhaustion → On Clean First Review, Output Format. Note that `refine-code-prompt.md` does NOT have a top-level `## Failure Modes` section today; failure reasons are embedded in the protocol prose and Hard rules.

- [ ] **Step 2: Add an artifact-handoff Hard rule** — Use the Edit tool with the existing two-rule numbered list under `### Hard rules (read first)` as the anchor. Add a new rule 3 after the existing rule 2:

  ```markdown
  3. **No improvised review file or inline review on artifact-handoff failure.** If a `code-reviewer`'s response (full review, hybrid re-review, or final verification) is missing the `REVIEW_ARTIFACT:` marker, OR the artifact file is missing/empty/path-mismatched, OR the on-disk first-line provenance is malformed, you MUST emit `STATUS: failed` with the specific reason from the `## Failure Modes` list (`reviewer response missing REVIEW_ARTIFACT marker`, `reviewer artifact missing or empty at <path>`, `reviewer artifact path mismatch: expected <X>, got <Y>`, or `reviewer artifact provenance malformed at <path>: <specific check>`) and exit. You MUST NOT improvise the review file or fall back to inline review. This mirrors the existing "no inline review on dispatch failure" rules above.
  ```

  Update the trailing "Both rules are duplicated as standing identity rules in `agent/agents/code-refiner.md` `## Rules`" sentence to read "All three rules are duplicated as standing identity rules..." (the duplication of rule 3 in `code-refiner.md` `## Rules` is added in this task's Step 9).

- [ ] **Step 3: Rewrite the `### Reviewer provenance stamping` section** — Use the Edit tool with the entire existing section body (from `### Reviewer provenance stamping` heading through the paragraph that ends "missing, malformed, or `inline`-valued stamps will surface as a validation error to the caller.") as the anchor. Replace it with:

  ```markdown
  ### Reviewer provenance stamping

  Every persisted review file MUST begin with a `**Reviewer:**` provenance line as its first non-empty line. The format is exact:

  ```
  **Reviewer:** <provider>/<model> via <cli>
  ```

  - `<provider>/<model>` MUST be the EXACT model string you passed to `subagent_run_serial` for that pass's `code-reviewer` dispatch (e.g., `openai-codex/gpt-5.5`).
  - `<cli>` MUST be the EXACT cli string you passed to `subagent_run_serial` for that same dispatch (e.g., `pi`).
  - The line is followed by a single blank line, then the review body.
  - The value MUST NOT contain `inline` or any synonym (`improvised`, `local`, `fallback`).

  **You no longer write the review file.** The reviewer writes it, using the verbatim provenance line you supply in its task prompt as `{REVIEWER_PROVENANCE}` and the absolute output path you supply as `{REVIEW_OUTPUT_PATH}`. Your role is to:

  1. **Construct** the verbatim `**Reviewer:** <provider>/<model> via <cli>` line at dispatch time, using the exact `model` and `cli` values you are passing to THIS pass's `subagent_run_serial` task. Re-construct per pass — first-pass uses `crossProvider.capable`, hybrid re-review uses `standard`, final-verification uses `crossProvider.capable`. Each constructed line uses that pass's specific pair.
  2. **Embed** that line as `{REVIEWER_PROVENANCE}` in the filled review-code-prompt.md, and embed the absolute era-versioned path as `{REVIEW_OUTPUT_PATH}`. Use the SAME absolute path across first-pass, hybrid re-reviews, and final-verification within one era — the file is overwritten in place by each successive reviewer.
  3. **Validate** the on-disk first non-empty line on read-back as a fail-fast check (see Iteration 1 Step 3 below). The check is: line matches the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`, and the value does NOT contain the substring `inline` (case-insensitive). The downstream `refine-code/SKILL.md` Step 6 validation runs again on the returned path with the same regex and reason labels — your fail-fast check is additive, not a replacement.

  Apply this contract to first-pass full reviews, hybrid re-reviews, and final-verification reviews — every reviewer dispatch in this protocol uses it.
  ```

  Note: the section deliberately removes any mention of an unversioned final copy, in alignment with Step 7 below.

- [ ] **Step 4: Extend Iteration 1 Step 2 placeholder fills** — Use the Edit tool with the existing Step 2 bullet list (`{WHAT_WAS_IMPLEMENTED}`, `{PLAN_OR_REQUIREMENTS}`, `{BASE_SHA}`, `{HEAD_SHA}`, `{DESCRIPTION}`, `{RE_REVIEW_BLOCK}`) as the anchor. Add two new bullets at the end:

  ```markdown
  - `{REVIEW_OUTPUT_PATH}` — the absolute path `{WORKING_DIR}/{REVIEW_OUTPUT_PATH}-v<ERA>.md` (concatenate `{WORKING_DIR}` and the relative review-output base path supplied above, then append `-v<ERA>.md`). Use the SAME path across iteration 1, hybrid re-reviews, and final-verification within one era — the file is overwritten in place.
  - `{REVIEWER_PROVENANCE}` — the verbatim line `**Reviewer:** <provider>/<model> via <cli>` constructed from the EXACT `model` and `cli` you will pass to THIS pass's `subagent_run_serial` task in Step 3. For first-pass full reviews, this is `crossProvider.capable` and its dispatch CLI.
  ```

- [ ] **Step 5: Replace Iteration 1 Steps 3 and 4** — Use the Edit tool with the existing Step 3 ("Dispatch `code-reviewer` with model `crossProvider.capable`...") and Step 4 ("Write review to versioned path: `<REVIEW_OUTPUT_PATH>-v<ERA>.md` ... First era starts at v1...") as the anchor block. Replace both with a single new Step 3 plus a renumbered Step 4 for verdict assessment:

  ```markdown
  3. **Dispatch `code-reviewer`** with model `crossProvider.capable` and corresponding `cli` from the model matrix:
     ```
     subagent_run_serial { tasks: [
       { name: "code-reviewer", agent: "code-reviewer", task: "<filled review-code-prompt.md>", model: "<crossProvider.capable from model-tiers.json>", cli: "<dispatch for crossProvider.capable>" }
     ]}
     ```
     Then extract and validate the reviewer's artifact handoff. Read `results[0].finalMessage` and perform these substeps in order, each producing its own `STATUS: failed` reason on failure:

     - **3a. Marker extraction.** Find the LAST line in `finalMessage` matching the anchored regex `^REVIEW_ARTIFACT: (.+)$`. If no such line exists, emit `STATUS: failed` with reason `reviewer response missing REVIEW_ARTIFACT marker` and exit. Capture the captured group as `<reviewer_path>`.
     - **3b. Path-equality check.** Compare `<reviewer_path>` (string-equal) to the absolute path you supplied as `{REVIEW_OUTPUT_PATH}` in Step 2. If they differ, emit `STATUS: failed` with reason `reviewer artifact path mismatch: expected <expected>, got <reviewer_path>` and exit.
     - **3c. File-existence check.** Read `<reviewer_path>` from disk. If the file does not exist, OR the file is empty (zero bytes, or only whitespace), emit `STATUS: failed` with reason `reviewer artifact missing or empty at <reviewer_path>` and exit.
     - **3d. On-disk first-line provenance check.** Find the first non-empty line of `<reviewer_path>`. Validate two things: (i) the line matches the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`; (ii) the matched value does NOT contain the substring `inline` (case-insensitive). On either failure, emit `STATUS: failed` with reason `reviewer artifact provenance malformed at <reviewer_path>: <specific check>` and exit.
     - **3e. Read the file as the authoritative review.** On all checks passing, treat the on-disk file content as the authoritative review for verdict assessment, batching, remediator dispatch, and (downstream) hybrid re-review `{PREVIOUS_FINDINGS}` construction. Do NOT use `finalMessage` content beyond the marker line.

     Do NOT improvise the review file or perform an inline review on any failure above (Hard rule 3).

  4. **Assess verdict** (from the on-disk review file):
     - "Ready to merge: Yes" with no Critical/Important issues → skip to **Final Verification**
     - Critical/Important issues exist → continue to step 5
  ```

  Renumber the remaining Steps 5–10 of Iteration 1 to 5–10. The substantive content of the renumbered steps (batch findings, dispatch remediator, commit remediation, record in remediation log, repeat) is unchanged. Update any cross-reference inside Iteration 2..N's "Assess and remediate — same as iteration 1 steps 5-10" sentence to read "Assess and remediate — same as iteration 1 steps 4-10" (the renumbering shifts assess from step 5 to step 4, batching from step 6 to step 5, etc., or — more simply — update the cross-reference to "same as iteration 1 steps 4-10").

  Wait — the renumbering: original Iteration 1 had assess at 5, batching at 6, remediator at 7, commit at 8, record at 9, repeat at 10. After renumbering: assess is now at 4, batching at 5, remediator at 6, commit at 7, record at 8, repeat at 9. Update Iteration 2..N's cross-reference accordingly to "Assess and remediate — same as iteration 1 steps 4-9".

- [ ] **Step 6: Replace Iteration 2..N: Hybrid Re-Review Steps 5 and 6** — Use the Edit tool with the existing Step 4 placeholder list (the bullets that fill the review template) plus Steps 5 ("Dispatch `code-reviewer` with model `standard`...") and 6 ("Overwrite review sections in the current versioned file; append to remediation log. Re-stamp the first non-empty line...") as the anchor block. Replace this block with:

  Step 4 placeholder list extension — add to the existing bullets of Step 4 (without renumbering):

  ```markdown
  - `{REVIEW_OUTPUT_PATH}` — the SAME absolute path used in Iteration 1 (no era change within the era — hybrid re-reviews overwrite the same file).
  - `{REVIEWER_PROVENANCE}` — the verbatim line `**Reviewer:** <provider>/<model> via <cli>` constructed from `standard` and its corresponding `cli`, freshly constructed for THIS hybrid re-review iteration.
  ```

  Replace Steps 5 and 6 with a new Step 5:

  ```markdown
  5. **Dispatch `code-reviewer`** with model `standard` and corresponding `cli` from the model matrix (hybrid re-reviews are scoped and cheaper). Then extract and validate the reviewer's artifact handoff using the SAME substeps 3a–3e procedure as Iteration 1 Step 3 (anchored regex on the last `^REVIEW_ARTIFACT: (.+)$` line, path-equality, file-existence-and-non-empty, on-disk first-line provenance, then read the file from disk as authoritative). The reviewer overwrites the era-versioned file in place — the new first non-empty line reflects this iteration's `standard`-tier provenance. Use the same failure reasons (`reviewer response missing REVIEW_ARTIFACT marker`, `reviewer artifact path mismatch: expected <X>, got <Y>`, `reviewer artifact missing or empty at <path>`, `reviewer artifact provenance malformed at <path>: <specific check>`) on validation failure.

  6. **Track the iteration's remediation log entry in your coordinator state.** The reviewer is the sole writer of the review file under this contract; you do NOT write to the reviewer artifact. The remediation log is tracked in your coordinator state across iterations and surfaces in the final Output Format via `Issues fixed`/`Issues remaining` counts and (on `STATUS: max_iterations_reached`) the `## Remaining Issues` section.
  ```

  This honors the spec's "code-refiner does not write the review file" requirement strictly — the coordinator does not write to the reviewer artifact at all. The remediation log was previously persisted alongside the review (one combined file write per iteration); under the new contract it is tracked in coordinator state only and surfaces via the Output Format's `Issues fixed`/`Issues remaining` counts and the `## Remaining Issues` section on `STATUS: max_iterations_reached`. The reviewer's write replaces the file's content with the review-section text plus the provenance first line; the coordinator does not append to or otherwise modify it.

  Renumber subsequent Step 7 (Assess and remediate) to Step 7 (preserve number) and update its cross-reference text from "same as iteration 1 steps 5-10" to "same as iteration 1 steps 4-9".

- [ ] **Step 7: Replace Final Verification Steps 1, 2 (with unversioned-copy drop)** — Use the Edit tool with the existing Final Verification Step 1 ("Dispatch `code-reviewer` with model `crossProvider.capable`...") and Step 2 ("If clean (no Critical/Important issues): Re-stamp..., Write final review to the versioned file, Append final entry to remediation log: 'Result: Clean after N iterations.', Copy the versioned file to the unversioned path: `<REVIEW_OUTPUT_PATH>.md`...") as the anchor block. Replace with:

  ```markdown
  1. **Dispatch `code-reviewer`** with model `crossProvider.capable` and corresponding `cli` for a **full-diff** verification. Fill EVERY placeholder used by `review-code-prompt.md`:
     - `{WHAT_WAS_IMPLEMENTED}` — the same value used in Iteration 1 Step 2 (the implementation summary supplied to this protocol). Final Verification re-uses this content unchanged so the reviewer sees the original implementation context.
     - `{PLAN_OR_REQUIREMENTS}` — the same value used in Iteration 1 Step 2 (the plan or requirements text supplied to this protocol). Final Verification re-uses this content unchanged so the reviewer evaluates the post-remediation diff against the original plan/requirements.
     - `{BASE_SHA}` — original BASE_SHA from this prompt (pre-implementation)
     - `{HEAD_SHA}` — current HEAD (includes all remediations)
     - `{RE_REVIEW_BLOCK}` — empty string (full review, not re-review)
     - `{DESCRIPTION}` — the Plan Goal above
     - `{REVIEW_OUTPUT_PATH}` — the SAME absolute era-versioned path used by Iteration 1 and the hybrid re-reviews — the file is overwritten in place.
     - `{REVIEWER_PROVENANCE}` — the verbatim `**Reviewer:** <provider>/<model> via <cli>` constructed from `crossProvider.capable` and its corresponding `cli` for this final-verification dispatch.

     Every placeholder above MUST be filled before dispatch — leaving `{WHAT_WAS_IMPLEMENTED}` or `{PLAN_OR_REQUIREMENTS}` unfilled would dispatch the reviewer with literal `{WHAT_WAS_IMPLEMENTED}` / `{PLAN_OR_REQUIREMENTS}` strings in its task prompt and produce an unreliable final-verification verdict.

     Then extract and validate the reviewer's artifact handoff using the SAME substeps 3a–3e procedure as Iteration 1 Step 3. On validation success, treat the on-disk file content as the authoritative final-verification review.

  2. **If clean** (no Critical/Important issues in the on-disk review):
     - Record `Result: Clean after N iterations.` in your coordinator state. Do NOT write to the reviewer artifact (the iteration count surfaces via the Output Format's `Iterations: <N>` line; the on-disk review file content remains exactly as the final-verification reviewer wrote it).
     - Report `STATUS: clean`. Return the era-versioned path as the `## Review File` in your output. Do NOT produce an unversioned copy at `<REVIEW_OUTPUT_PATH>.md` — that legacy copy is dropped under this contract.
  ```

  The Step 3 ("If issues found: Reset the iteration budget — start a new era ...") is unchanged in semantics, but renumbered if needed (it stays at Step 3).

- [ ] **Step 8: Update `### On Budget Exhaustion` to drop unversioned-copy mention and remove the coordinator-side write** — Use the Edit tool with the entire numbered list under `### On Budget Exhaustion` (the three-line block ending with the line that copies to the unversioned path) as the anchor. Replace the list with:

  ```markdown
  1. Track the cumulative remediation log in your coordinator state. Do NOT write to the reviewer artifact (the remaining issues are already in the file from the most recent reviewer write; the coordinator surfaces unfixed findings via the Output Format's `## Remaining Issues` section and surfaces fix counts via `Issues fixed`/`Issues remaining`).
  2. Report `STATUS: max_iterations_reached`.
  ```

  This drops the legacy "Copy to unversioned path" line and removes the coordinator-side append: the reviewer's write supplies the remaining-issues content on disk, and the coordinator tracks the remediation log in state and surfaces it via the Output Format.

- [ ] **Step 9: Add a new `## Failure Modes` section near the end of the prompt** — Use the Edit tool with the existing `## Output Format` section heading as the anchor and prepend the new `## Failure Modes` section before it, separated by a leading blank line. Section body:

  ```markdown
  ## Failure Modes

  The following conditions produce `STATUS: failed`. Each condition maps to a one-line reason string used in your final output:

  - **Coordinator orchestration tool unavailable** — reason: `coordinator dispatch unavailable`
  - **Worker dispatch failed (code-reviewer or coder)** — reason: `worker dispatch failed: <which worker>`
  - **Reviewer response missing the REVIEW_ARTIFACT marker** — reason: `reviewer response missing REVIEW_ARTIFACT marker`
  - **Reviewer artifact missing or empty on disk** — reason: `reviewer artifact missing or empty at <path>`
  - **Reviewer artifact path mismatch** — reason: `reviewer artifact path mismatch: expected <X>, got <Y>`
  - **Reviewer artifact provenance malformed** — reason: `reviewer artifact provenance malformed at <path>: <specific check>`
  ```

- [ ] **Step 10: Update `## Output Format` to drop the unversioned-path note** — Read the existing `## Output Format` section. The current `## Review File` block in the format reads `<path to latest versioned review file>` — this is correct as-is. No change needed here unless prior wording referenced the unversioned copy; if so, remove that reference. (Inspect the current text and confirm no unversioned mention remains.)

- [ ] **Step 11: Add a parallel artifact-handoff Rule to `agent/agents/code-refiner.md`** — Read `agent/agents/code-refiner.md`. Use the Edit tool with the existing last bullet under `## Rules` (`Do NOT perform an inline review if subagent_run_serial is unavailable or every reviewer dispatch attempt fails. Emit STATUS: failed and exit without writing a review file.`) as the anchor. Append a new bullet immediately after it:

  ```markdown
  - Do NOT improvise a review file or fall back to inline review when the reviewer's artifact handoff fails (missing `REVIEW_ARTIFACT:` marker, missing/empty artifact, path mismatch, malformed on-disk provenance). Emit `STATUS: failed` with the specific reason from the `## Failure Modes` list and exit. The reviewer is the sole writer of the review file under this contract; you construct, embed, and validate the provenance line but you never write the file yourself.
  ```

  This duplicates rule 3 (added in Step 2) at the agent-body layer for standing identity.

**Acceptance criteria:**

- The `### Hard rules (read first)` section in `refine-code-prompt.md` contains exactly three numbered rules; rule 3 forbids improvised review file or inline review on artifact-handoff failure and references all four artifact-handoff failure reasons.
  Verify: open `agent/skills/refine-code/refine-code-prompt.md` and locate `### Hard rules (read first)`; confirm three numbered rules are present and rule 3 names `reviewer response missing REVIEW_ARTIFACT marker`, `reviewer artifact missing or empty at <path>`, `reviewer artifact path mismatch: expected <X>, got <Y>`, and `reviewer artifact provenance malformed at <path>: <specific check>`.
- The `### Reviewer provenance stamping` section says "You no longer write the review file" and instructs construction-and-validation; it makes NO mention of an unversioned final copy.
  Verify: `grep -n "You no longer write the review file" agent/skills/refine-code/refine-code-prompt.md` returns at least one match inside the `### Reviewer provenance stamping` section; open `agent/skills/refine-code/refine-code-prompt.md` and read only the body of the `### Reviewer provenance stamping` section (from that heading down to the next `### ` or `## ` heading) and confirm the literal substring `unversioned` does not appear within that section's body. The substring MAY appear elsewhere in the file: Final Verification Step 2 explicitly references the dropped unversioned copy by name, and that mention is intentional.
- Iteration 1 Step 2 placeholder list includes `{REVIEW_OUTPUT_PATH}` (absolute, era-versioned) and `{REVIEWER_PROVENANCE}` (constructed from `crossProvider.capable`).
  Verify: open `agent/skills/refine-code/refine-code-prompt.md`; in `### Iteration 1: Full Review` Step 2's bullet list, confirm `{REVIEW_OUTPUT_PATH}` and `{REVIEWER_PROVENANCE}` appear with descriptions of absolute-path construction and `crossProvider.capable`-tier provenance respectively.
- Iteration 1 Step 3 contains substeps 3a–3e (marker extraction, path-equality, file-existence, on-disk provenance, read-as-authoritative); no separate Step 4 about writing the review file remains.
  Verify: open `agent/skills/refine-code/refine-code-prompt.md`; in `### Iteration 1: Full Review` Step 3, confirm substeps 3a, 3b, 3c, 3d, 3e are present with their failure reasons; confirm the renumbered Step 4 is "Assess verdict" (not "Write review to versioned path").
- Hybrid re-review Step 5 dispatches with `standard` and performs the same artifact-handoff validation; the reviewer overwrites the same era-versioned file. The remediation log is tracked in coordinator state — the coordinator does not write to the reviewer artifact.
  Verify: open `agent/skills/refine-code/refine-code-prompt.md`; in `### Iteration 2..N: Hybrid Re-Review` Step 5, confirm the dispatch uses `standard` and the validation procedure references substeps 5a–5e (or names the same five checks); read Step 6 and confirm it instructs coordinator-state tracking of the remediation log only — no append or other write to the versioned reviewer artifact appears.
- Final Verification Step 1 fills every placeholder used by `review-code-prompt.md` — including `{WHAT_WAS_IMPLEMENTED}` and `{PLAN_OR_REQUIREMENTS}` alongside `{BASE_SHA}`, `{HEAD_SHA}`, `{RE_REVIEW_BLOCK}`, `{DESCRIPTION}`, `{REVIEW_OUTPUT_PATH}`, and `{REVIEWER_PROVENANCE}` — so the final-verification reviewer dispatch never receives literal unfilled placeholders.
  Verify: open `agent/skills/refine-code/refine-code-prompt.md`; in `### Final Verification` Step 1, confirm the bullet list of placeholders to fill contains all eight entries `{WHAT_WAS_IMPLEMENTED}`, `{PLAN_OR_REQUIREMENTS}`, `{BASE_SHA}`, `{HEAD_SHA}`, `{RE_REVIEW_BLOCK}`, `{DESCRIPTION}`, `{REVIEW_OUTPUT_PATH}`, and `{REVIEWER_PROVENANCE}`, each with a one-line description of the value to use.
- Final Verification Step 2 reports `STATUS: clean` and explicitly states no unversioned copy is produced.
  Verify: open `agent/skills/refine-code/refine-code-prompt.md`; in `### Final Verification` Step 2, confirm the literal phrase "Do NOT produce an unversioned copy at `<REVIEW_OUTPUT_PATH>.md`" (or syntactically equivalent — the unversioned copy is explicitly dropped) appears in the body, and there is no instruction to copy the versioned file to an unversioned path.
- The `### On Budget Exhaustion` numbered list does NOT contain a "Copy to unversioned path" step and does NOT instruct the coordinator to write to the reviewer artifact.
  Verify: open `agent/skills/refine-code/refine-code-prompt.md`; in `### On Budget Exhaustion`, confirm the numbered list contains exactly two items — Item 1 tracks the remediation log in coordinator state with no write to any file, Item 2 reports `STATUS: max_iterations_reached`. Confirm no instruction to copy to an unversioned path or to append to the versioned reviewer artifact appears.
- A new `## Failure Modes` section exists between the protocol body and `## Output Format`, listing the six failure conditions (coordinator dispatch unavailable, worker dispatch failed, reviewer response missing marker, artifact missing/empty, path mismatch, provenance malformed).
  Verify: `grep -n "^## Failure Modes" agent/skills/refine-code/refine-code-prompt.md` returns exactly one match; open the section and confirm all six bullet entries are present with their reason strings.
- `agent/agents/code-refiner.md` `## Rules` section gains a new bullet forbidding improvised review file or inline review on artifact-handoff failure, mirroring the prompt-side rule 3.
  Verify: `grep -n "Do NOT improvise a review file or fall back to inline review" agent/agents/code-refiner.md` returns at least one match inside the `## Rules` section.

**Model recommendation:** standard

### Task 6: Drop the unversioned-path validation in refine-code/SKILL.md Step 6

**Files:**
- Modify: `agent/skills/refine-code/SKILL.md`

**Steps:**

- [ ] **Step 1: Read `agent/skills/refine-code/SKILL.md` Step 6 in full** — Lines 90–116 currently contain the validation. Note the structure: introductory paragraph ("Run this validation only on `STATUS: clean` or `STATUS: max_iterations_reached`..."); the bullet list of paths to validate (currently two bullets — versioned + unversioned); the numbered checks 1–6 (regex, extraction, `inline` forbidden, model-tier resolution, `STATUS: clean` rule, `STATUS: max_iterations_reached` rule); the failure-handling paragraph; the success-handling paragraph.

- [ ] **Step 2: Replace the path-list bullets with a single-entry list** — Use the Edit tool with the existing two-bullet block as the anchor:

  ```markdown
  Build the list of review file paths to validate:

  - The path the coordinator reported in its `## Review File` block (the latest versioned `<REVIEW_OUTPUT_PATH>-v<ERA>.md`).
  - On `STATUS: clean` only: also include the unversioned final copy at `<REVIEW_OUTPUT_PATH>.md` (Step 1's `REVIEW_OUTPUT_PATH` plus `.md`).
  ```

  Replace with a single-entry list:

  ```markdown
  Build the list of review file paths to validate:

  - The path the coordinator reported in its `## Review File` block (the latest versioned `<REVIEW_OUTPUT_PATH>-v<ERA>.md`). This is the only path validated under the reviewer-authored-artifact contract — the unversioned final copy at `<REVIEW_OUTPUT_PATH>.md` is no longer produced (per `refine-code-prompt.md`'s Final Verification Step 2 and `### On Budget Exhaustion`).
  ```

- [ ] **Step 3: Confirm checks 1–6 remain unchanged** — Read the numbered list of validation checks (regex, extraction, inline forbidden, model-tier resolution, STATUS: clean model match, STATUS: max_iterations_reached model match). Confirm no edits are needed: the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`, the inline forbidden rule, the model-tier resolution, and the two STATUS-specific model match rules are all unchanged. Their text mentions only `crossProvider.capable` and `standard` — no mention of an unversioned copy was in the checks themselves; the unversioned copy was only in the path-list above.

- [ ] **Step 4: Confirm the success-handling paragraph does not mention the unversioned copy** — Read the paragraph beginning "When all paths pass validation, proceed to report the stashed outcome from Step 5 to the caller...". This paragraph does not currently mention the unversioned copy explicitly; confirm no edit is needed. The "stashed outcome" remains the coordinator's reported versioned path on `STATUS: clean` and `STATUS: max_iterations_reached`.

- [ ] **Step 5: Confirm Edge Cases do not mention the unversioned copy** — Read the `## Edge Cases` section. The current edge cases (no changes in range, code-refiner fails to dispatch, empty requirements) do not mention the unversioned copy. Confirm no edit is needed.

**Acceptance criteria:**

- `agent/skills/refine-code/SKILL.md` Step 6's path-list contains exactly one bullet: the versioned `<REVIEW_OUTPUT_PATH>-v<ERA>.md` path. The unversioned-copy bullet is removed.
  Verify: open `agent/skills/refine-code/SKILL.md` and read Step 6's path-list (the bullet block under "Build the list of review file paths to validate:"); confirm exactly one bullet is present and it names only the versioned path.
- The phrase "unversioned final copy" no longer appears in the path-list bullets.
  Verify: `grep -n "unversioned final copy" agent/skills/refine-code/SKILL.md` returns at most one match, located inside an explanatory parenthetical that says the unversioned copy is no longer produced (the new prose in Step 2 above). It does NOT appear as an instruction to validate that path.
- The validation checks 1–6 (regex, extraction, inline forbidden, tier resolution, STATUS: clean rule, STATUS: max_iterations_reached rule) are unchanged.
  Verify: open `agent/skills/refine-code/SKILL.md` Step 6's numbered checks; confirm checks 1–6 are present with the same regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`, the same `inline` forbidden rule, and the same tier resolution and STATUS-specific match rules referencing `crossProvider.capable` (clean) and `crossProvider.capable` or `standard` (max_iterations_reached).

**Model recommendation:** cheap

### Task 7: Manual smoke tests for both refine pipelines including oversized review

**Files:**
- Test: smoke-test logs and produced review artifacts (no source files modified)

**Steps:**

- [ ] **Step 1: Confirm baseline state** — Confirm Tasks 1–6 are landed: read `agent/agents/plan-reviewer.md`, `agent/agents/code-reviewer.md`, `agent/skills/generate-plan/review-plan-prompt.md`, `agent/skills/requesting-code-review/review-code-prompt.md`, `agent/skills/refine-plan/refine-plan-prompt.md`, `agent/skills/refine-code/refine-code-prompt.md`, `agent/skills/refine-code/SKILL.md`, `agent/skills/requesting-code-review/SKILL.md`, `agent/agents/plan-refiner.md`, `agent/agents/code-refiner.md`. Confirm the contract changes are present (per Tasks 1–6 acceptance criteria). If any change is missing, return to that task and complete it.

- [ ] **Step 2: Pick a small existing plan to refine** — Select an existing plan from `.pi/plans/done/` (e.g., `2026-04-29-2026-04-29-refiner-coordinator-hardening.md`) and copy it to a working location: `cp .pi/plans/done/2026-04-29-2026-04-29-refiner-coordinator-hardening.md /tmp/smoke-plan.md`. The plan should reference an existing spec (e.g., `.pi/specs/done/2026-04-29-refiner-coordinator-hardening.md`) so refine-plan can run with full coverage.

- [ ] **Step 3: Run refine-plan against the smoke plan** — From the repo root, invoke the refine-plan skill against the copied plan with structural-only mode to bypass external coverage requirements:
  ```
  /refine-plan /tmp/smoke-plan.md --structural-only
  ```
  Observe the output and confirm:
  - The refine-plan SKILL produces a coordinator dispatch that returns `STATUS: approved` or `STATUS: issues_remaining`.
  - The coordinator's `## Review Files` lists at least one file under `.pi/plans/reviews/`.
  - The reviewer-authored review file on disk has the `**Reviewer:**` first line followed by a blank line and the review body.

- [ ] **Step 4: Inspect the smoke-test review artifact** — Read the latest `.pi/plans/reviews/smoke-plan-plan-review-vN.md` file (whichever N was allocated). Confirm:
  - The first non-empty line matches the regex `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`.
  - The line does NOT contain `inline`.
  - A blank line separates the first line from the review body.
  - The review body contains the verdict (`[Approved]` or `[Issues Found]`) and findings.

- [ ] **Step 5: Inspect the refiner's response chain for marker-only handoff** — Re-run the refine-plan invocation with an explicit transcript capture around the subagent run. Preferred command from the repo root:
  ```bash
  script -q /tmp/reviewer-artifact-refine-plan.typescript -- pi
  ```
  Inside that captured `pi` session, run `/refine-plan /tmp/smoke-plan.md --structural-only` and keep the spawned `plan-refiner` / `plan-reviewer` panes open long enough to save their visible transcript. If the local terminal does not support `script`, use the multiplexer pane capture for the `plan-refiner` pane (for tmux: `tmux capture-pane -p -S - -t <plan-refiner-pane> > /tmp/reviewer-artifact-refine-plan-pane.txt`). Inspect the captured transcript for the reviewer dispatch result and confirm:
  - `finalMessage` ends with a line matching `^REVIEW_ARTIFACT: (.+)$` (the marker line).
  - The captured path equals the absolute era-versioned path the refiner constructed and embedded.
  - Body text of the review (verdict, findings, etc.) is NOT contained in `finalMessage` — only conversational chatter and the marker line. The full review text is present only in the on-disk artifact.

- [ ] **Step 6: Pick a small code change for refine-code smoke test** — On a feature branch with a few small commits (e.g., a typo fix and a small docstring tweak), capture `BASE_SHA` and `HEAD_SHA`:
  ```bash
  BASE_SHA=$(git rev-parse HEAD~1)  # adjust to suit
  HEAD_SHA=$(git rev-parse HEAD)
  ```
  Run refine-code:
  ```
  /refine-code BASE_SHA=<sha> HEAD_SHA=<sha> "Smoke-test code refinement"
  ```
  Observe the output and confirm:
  - The refine-code SKILL produces a coordinator dispatch that returns `STATUS: clean` or `STATUS: max_iterations_reached`.
  - The coordinator's `## Review File` lists exactly one path under `.pi/reviews/` or wherever the configured base path resolves to.
  - The on-disk review file has the `**Reviewer:**` first line, blank line, then body.
  - There is NO unversioned final copy at `<REVIEW_OUTPUT_PATH>.md`.

- [ ] **Step 7: Confirm refine-code/SKILL.md Step 6 validates only the versioned path** — Verify the SKILL's STATUS reporting did not fail with "review provenance validation failed at `<REVIEW_OUTPUT_PATH>.md`" (which would indicate the SKILL still tries to validate the dropped unversioned copy). On `STATUS: clean`, only the versioned path should be validated.

- [ ] **Step 8: Run an oversized-review smoke test** — Construct a synthetic plan or code change deliberately sized to produce an oversized review (tens of KB or larger — the goal is to exceed any plausible `finalMessage` truncation threshold; ~50 KB should suffice). For example:
  - Create a plan file with 100 tasks, each with 20-line acceptance criteria and 50-line steps. Run refine-plan against it.
  - OR seed a synthetic code review by pointing refine-code at a deliberately rich diff (large refactor, many files).
  Confirm:
  - The reviewer-authored on-disk artifact contains the full review body, intact, regardless of size.
  - The refiner reads the file from disk and parses verdict, severity counts, and findings without truncation.
  - The refiner's response (and the SKILL's reporting) flows normally; no truncation-related failure surfaces.

- [ ] **Step 9: Confirm SKILL-level provenance validation still passes** — In Step 4 and Step 6 above, the refine-plan/SKILL.md Step 9.5 and refine-code/SKILL.md Step 6 validations should run on the reviewer-authored review file and pass. Verify:
  - `refine-plan/SKILL.md` Step 9.5: `<provider>/<model>` matches `crossProvider.capable` or `capable`; `<cli>` matches the dispatch map for that provider; no `inline` substring.
  - `refine-code/SKILL.md` Step 6: on `STATUS: clean`, `<provider>/<model>` matches `crossProvider.capable`; on `STATUS: max_iterations_reached`, `<provider>/<model>` matches `crossProvider.capable` or `standard`; `<cli>` matches the dispatch map; no `inline` substring.
  These SKILL-level checks operate on the reviewer-authored file and pass identically to how they passed when the refiner wrote the file (because the file format is byte-for-byte unchanged).

- [ ] **Step 10: Document the smoke-test results** — Write a brief smoke-test note (informal, in your scratch state — not a committed file) summarizing: (a) the reviewer-authored artifact appeared on disk with correct provenance and body; (b) the refiner's `finalMessage` carried only the marker line; (c) the oversized-review case produced an intact on-disk artifact; (d) the refine-code unversioned-copy drop is observed (no `<REVIEW_OUTPUT_PATH>.md` produced). If any smoke-test step fails, identify the specific contract layer that broke (reviewer agent, reviewer prompt, refiner prompt, refiner agent, SKILL) and fix that layer; then re-run.

**Acceptance criteria:**

- A live `refine-plan` smoke run produces a reviewer-authored versioned review file under `.pi/plans/reviews/` with the expected `**Reviewer:**` first line and review body, and the refiner's `finalMessage` carries only conversational text plus the `REVIEW_ARTIFACT:` marker line.
  Verify: after Step 3 completes, run `head -1 .pi/plans/reviews/smoke-plan-plan-review-v1.md` (substitute the actual basename and N from your smoke run) and confirm output matches `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$`; then inspect the smoke-run dispatch transcript (Step 5) and confirm the reviewer's `finalMessage` last line matches `^REVIEW_ARTIFACT: (.+)$` and the file body text does NOT appear in that `finalMessage`.
- A live `refine-code` smoke run produces a reviewer-authored versioned review file with correct provenance, and NO unversioned final copy is created on `STATUS: clean`.
  Verify: after Step 6 completes, run `ls .pi/reviews/<base>-code-review*.md` (substitute the actual base) and confirm only versioned files (`*-v1.md`, `*-v2.md`, etc.) are present; confirm no `<base>-code-review.md` (without a version suffix) exists.
- An oversized-review smoke test produces an intact on-disk artifact with full body text preserved, and the refiner reads it and parses findings successfully.
  Verify: after Step 8 completes, `wc -l .pi/plans/reviews/<oversized>-plan-review-v1.md` (substitute the actual file) reports the expected number of lines (matching the synthetic review's size); the refine-plan/refine-code SKILL's STATUS output indicates successful parsing (i.e., not `STATUS: failed` for marker missing or content malformed); and `head -1 .pi/plans/reviews/<oversized>-plan-review-v1.md` returns the expected provenance line.
- Both SKILL-level provenance validations (`refine-plan/SKILL.md` Step 9.5 and `refine-code/SKILL.md` Step 6 with the dropped unversioned bullet) pass on the reviewer-authored files.
  Verify: after Steps 3 and 6 complete, the refine-plan/refine-code SKILL output reports `STATUS: approved`/`STATUS: clean` (or `issues_remaining`/`max_iterations_reached`) and does NOT report a provenance validation error of the form `review provenance validation failed at <path>: <specific check>`; if it does, the smoke test has surfaced a contract issue and Tasks 1–6 must be revisited.

**Model recommendation:** capable

## Dependencies

- Task 2 depends on: Task 1 (the prompt template's `## Output Artifact Contract` section operationalizes the agent's standing rule, which is added in Task 1; Task 2 references the agent's rule in its conditional language).
- Task 3 depends on: Task 2 (the placeholders being added to `review-code-prompt.md` in Task 2 are what `requesting-code-review/SKILL.md` must fill; without Task 2, the placeholders don't exist).
- Task 4 depends on: Task 1, Task 2 (the refiner relies on the agent and template contract to interpret the new placeholders correctly).
- Task 5 depends on: Task 1, Task 2 (same reason as Task 4).
- Task 6 depends on: Task 5 (the unversioned-copy drop in `refine-code-prompt.md` is the upstream change that justifies dropping the unversioned-path validation in `refine-code/SKILL.md`).
- Task 7 depends on: Task 1, Task 2, Task 3, Task 4, Task 5, Task 6 (smoke tests exercise the full system end-to-end and require all source changes landed).

## Risk Assessment

- **Risk: requesting-code-review breakage if `{REVIEW_OUTPUT_PATH}` is left unfilled** — adding the new placeholders to `review-code-prompt.md` (Task 2) without updating `requesting-code-review/SKILL.md` (Task 3) would leave the literal `{REVIEW_OUTPUT_PATH}` and `{REVIEWER_PROVENANCE}` strings in the dispatched prompt, producing nonsense conditional behavior. Mitigation: Task 3 fills both placeholders with empty strings, activating the agent's "free-form output" branch. Task ordering enforces this: Task 3 lands with Task 2.
- **Risk: WORKING_DIR is relative, so `{WORKING_DIR}/{REVIEW_OUTPUT_PATH}-v<ERA>.md` is a relative path** — the spec requires `REVIEW_ARTIFACT: <absolute path>`, but `{WORKING_DIR}` from the SKILL is whatever the caller passes (typically cwd, typically absolute). If a caller passes a relative WORKING_DIR, the constructed path is relative, and the marker contract is violated. Mitigation: trust `{WORKING_DIR}` to be absolute in practice (the SKILL fills from cwd, which is absolute when set via `pwd`). The plan-refiner does not have `bash` and cannot self-correct; the code-refiner has `bash` and could `realpath` the path, but for symmetry and simplicity both refiners use string concatenation. If smoke tests surface a relative-WORKING_DIR issue, the mitigation is to update the SKILLs to canonicalize WORKING_DIR before passing it (out of scope for this plan).
- **Risk: remediation log loses on-disk durability** — under the old contract, the refiner composed reviewer text + remediation log into one file write so the remediation log was persisted alongside the review on disk. Under the new contract, the reviewer is the sole writer of the review file; the coordinator does not write to it at all. Task 5 Steps 6, 7, and 8 track the remediation log in coordinator state for the dispatch's duration only and surface progress via the Output Format (`Issues fixed`/`Issues remaining` counts; on `STATUS: max_iterations_reached`, the `## Remaining Issues` section with full unfixed-finding text). If a future need surfaces for an on-disk remediation-log artifact, that should be a separate file (e.g., `<REVIEW_OUTPUT_PATH>-v<ERA>-remediation.md`) so the reviewer artifact remains the sole source of truth — a follow-up spec/plan would be required.
- **Risk: refiner-side fail-fast validation duplicates SKILL-side validation** — the refiner now validates the on-disk first-line provenance (regex + inline-forbidden) at Iteration N, and the SKILL re-validates with the same regex + inline-forbidden plus a model/cli match check after the refiner returns. This duplication is intentional (fail-fast at coordinator vs. final-check at SKILL), but if the regex ever drifts between the two layers, false negatives or false positives could surface. Mitigation: both regexes are documented as `^\*\*Reviewer:\*\* [^/]+/[^ ]+ via [a-zA-Z0-9_-]+$` literally in both files; smoke tests confirm both layers pass on the same artifact.
- **Risk: spec-deviation flag — the spec's `Approach` chose reviewer-owned write with prompt-driven provenance and a single anchored marker; this plan honors that approach exactly. No deviation flagged.** — the file structure, the placeholder names, the marker format, and the validation order all follow the spec. The unversioned-copy drop in code-refiner is also spec-mandated.
- **Risk: oversized-review smoke test infrastructure** — Task 7 Step 8 calls for a deliberately oversized review (tens of KB or larger), which requires either constructing a large synthetic plan or pointing refine-code at a large diff. If neither is readily available, the plan as a whole still lands correctly (the contract is robust by construction); the oversized smoke test is an empirical check, not a structural requirement. Smoke tests are manual (per the project convention noted in the previous spec `2026-04-29-refiner-coordinator-hardening.md`), so partial smoke-test coverage is acceptable as long as the size-relevant case is exercised.

## Review Notes

_(this section is populated by the plan-reviewer if warnings/suggestions surface during review; left empty here)_
