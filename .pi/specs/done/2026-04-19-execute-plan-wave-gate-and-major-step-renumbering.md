# Consolidate execute-plan Wave Gates and Renumber Major Steps

Source: TODO-86666846

## Goal

Further simplify `agent/skills/execute-plan/SKILL.md` without changing execute-plan's behavior in effect by consolidating the two wave-level post-dispatch gates into one shared structure, removing repeated Step 0 / Step 3 worktree-reuse prose, centralizing the per-task retry-budget rule in one canonical location, and cleaning up the top-level section numbering so major steps use simple integers rather than inserted decimal-style labels.

## Context

`agent/skills/execute-plan/SKILL.md` is currently 799 lines long and remains the largest workflow skill in the repository. Its top-level `## Step ...` headings currently run through `Step 9`, then introduce inserted major sections `Step 9.5` and `Step 9.7` before continuing with `Step 10` through `Step 15`. Those decimal-numbered major sections are used for two related wave-level gates: `## Step 9.5: Blocked-task escalation gate` and `## Step 9.7: Wave-level concerns checkpoint`. Step 9 already defines their ordering (`BLOCKED` handling first, then `DONE_WITH_CONCERNS`, then verification), and later sections such as Steps 10, 11, 12, and 15 refer back to those gates directly.

The current file also repeats the worktree-reuse decision logic across Step 0 and Step 3. Step 0 contains the canonical workspace auto-detection, reuse logging, dirty-workspace prompt, and `(n) Create a new worktree instead` fallback, while Step 3's workspace values and defaults table restate parts of the same policy. Separately, the retry-budget rule is described in more than one place: the blocked-task gate, the concerns-remediation gate, and Step 12 all describe the same shared per-task retry counter and the split-into-sub-tasks budget behavior. The repository README describes execute-plan at a higher level, but the protocol details that need consolidation live in `agent/skills/execute-plan/SKILL.md` itself.

## Requirements

- The work must stay scoped to `agent/skills/execute-plan/SKILL.md`; this is a docs-structural refactor of the execute-plan skill, not a broader workflow redesign.
- Replace the separate top-level sections `## Step 9.5: Blocked-task escalation gate` and `## Step 9.7: Wave-level concerns checkpoint` with a single combined wave-gate major step that defines the shared drain → collect → combined view → user choice → re-dispatch / re-entry structure once.
- The combined wave-gate step must still cover both trigger conditions: `STATUS: BLOCKED` and `STATUS: DONE_WITH_CONCERNS`.
- The combined wave-gate step must preserve the current ordering: blocked handling runs before concerns handling, and both complete before wave verification.
- The blocked-task case in the combined gate must preserve all four current interventions: `(c) more context`, `(m) better model`, `(s) split into sub-tasks`, and `(x) stop execution`.
- The concerned-task case in the combined gate must preserve all three current interventions: `(c) continue to verification`, `(r) remediate selected task(s)`, and `(x) stop execution`.
- The blocked-task case must preserve the current gate-exit rule that the wave cannot leave the blocked portion while any task still has `BLOCKED` status; there is no skip path for blocked tasks.
- The concerned-task case must preserve the current gate-exit rule that the user may choose continue-to-verification and allow tasks to remain `DONE_WITH_CONCERNS` for Step 10.
- Keep the full worktree-reuse decision logic in Step 0 as the canonical source of truth, including reuse logging, dirty-workspace behavior, the `(n) Create a new worktree instead` fallback, and the rules governing when reuse is fixed vs. customizable.
- Reduce Step 3 so it presents the execution settings UI and only briefly points back to Step 0 for the underlying workspace-reuse rules instead of restating them in detail.
- Keep the canonical retry-budget rule in Step 12, including the single per-task shared retry counter across all re-dispatch paths and the rule that split sub-tasks inherit the parent's remaining budget rather than receiving a fresh one.
- Replace duplicate retry-budget restatements in the merged wave-gate section with a short pointer to Step 12 rather than re-explaining the rule inline.
- Renumber all top-level `## Step ...` major sections in `agent/skills/execute-plan/SKILL.md` so they use integers only.
- Update internal cross-references so they remain correct after the major-step renumbering.
- Lower-level subsections may keep decimal numbering where useful for internal procedure structure; the integer-only rule applies to top-level major sections.
- The merged-gate and renumbering work must preserve the current user-facing settings prompt shape, worker/verifier flow, and control-flow semantics in effect.
- Planning and implementation order must reflect the dependency that gate-merging happens before retry-budget deduplication, because the old Step 9.5 / Step 9.7 anchors disappear once the merged gate is introduced.

## Constraints

- No observable behavior change is allowed. Menu options, gate semantics, retry-budget values, control-flow ordering, and verification entry conditions must remain the same in effect.
- The per-task retry budget remains 3 retries; this work may only centralize and de-duplicate the rule, not alter it.
- The user-visible Step 3 settings UI must remain unchanged in shape and content; only redundant explanatory prose may be reduced.
- After implementation is complete, `agent/skills/execute-plan/SKILL.md` must be no longer than 750 lines.
- Major-step numbering must become simpler, not more elaborate: top-level inserted labels such as `9.5` and `9.7` should be eliminated in favor of a single integer sequence.
- Lower-level decimal subsection numbering may remain where it improves local clarity and cross-reference precision.
- This spec should not be treated as permission to revise sibling docs, extracted reference files, or the broader execute-plan architecture unless such changes are strictly required by the `SKILL.md` restructuring.
- Verification may rely on structural assertions and dry-read control-flow checks rather than a live execute-plan run, because the intended changes are documentation-structural.

## Acceptance Criteria

- `agent/skills/execute-plan/SKILL.md` no longer contains both top-level headers `## Step 9.5: Blocked-task escalation gate` and `## Step 9.7: Wave-level concerns checkpoint`.
- A single top-level combined wave-gate section exists in their place and explicitly covers both `STATUS: BLOCKED` and `STATUS: DONE_WITH_CONCERNS` handling.
- The combined wave-gate section still includes all four blocked-task menu options: `(c) more context`, `(m) better model`, `(s) split into sub-tasks`, and `(x) stop execution`.
- The combined wave-gate section still includes all three concerned-task menu options: `(c) continue to verification`, `(r) remediate selected task(s)`, and `(x) stop execution`.
- A dry-read of the documented control flow still yields these outcomes:
  - a wave with all `DONE` proceeds directly from Step 9 handling into Step 10,
  - a wave with both `BLOCKED` and `DONE_WITH_CONCERNS` handles blocked tasks first, then concerned tasks, then Step 10,
  - a wave with only `DONE_WITH_CONCERNS` skips blocked handling, runs concerned handling, then Step 10.
- The phrases `Reusing current workspace` and `Create a new worktree instead` each appear in `agent/skills/execute-plan/SKILL.md` no more than twice.
- Step 3's defaults table no longer contains a multi-sentence Notes entry that re-explains Step 0's reuse-vs-new-worktree decision logic; a short pointer back to Step 0 is acceptable.
- The Step 3 settings summary block and customize prompts remain unchanged in shape and content.
- The canonical description of the shared per-task retry counter appears exactly once in `agent/skills/execute-plan/SKILL.md`, in Step 12.
- The merged wave-gate section and any other non-Step-12 reference sites use only a brief pointer to Step 12 for retry-budget semantics rather than restating the rule.
- The Step 12 canonical retry-budget text still states that the budget is 3 retries per task and that splitting into sub-tasks does not bypass the budget because children inherit the parent's remaining retries.
- `agent/skills/execute-plan/SKILL.md` is no longer than 750 lines in the final committed state after all planned edits are complete.
- Every top-level `## Step ...` heading in `agent/skills/execute-plan/SKILL.md` uses an integer step number only; no top-level major section uses `x.y` numbering.
- Internal references to major steps are updated so there are no stale references to obsolete decimal-numbered top-level major sections.
- Lower-level procedural subsections such as `### Step 10.1` may remain if still useful; their continued presence does not violate the renumbering requirement.

## Non-Goals

- Changing the Step 3 settings prompt wording or adding new settings.
- Changing the retry-budget value, adding skip paths for blocked tasks, or otherwise altering recovery semantics.
- Removing lower-level decimal subsection numbering everywhere in the file.
- Rewriting execute-plan into a new architecture or redistributing protocol details across other skills.
- Performing a live execute-plan smoke run solely for this documentation refactor.
