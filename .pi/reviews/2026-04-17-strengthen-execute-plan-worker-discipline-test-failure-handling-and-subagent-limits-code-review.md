# Code Review — v1

**Date:** 2026-04-17
**Base:** 387883a6cc956970ffc308c4117cd8e4e4839a82
**Head:** 539cf0109e41536ef1fb757d81bf6a6c839acf16

---

### Strengths

- All three tasks' acceptance criteria are met cleanly with minimal, targeted changes to only two files (`SKILL.md`, `execute-task-prompt.md`), matching the plan's scope.
- Task 1: Step 8's `{TDD_BLOCK}` (SKILL.md:266-329) includes the Iron Law, mandatory RED/GREEN verify steps, rationalization list, red-flags list, verification checklist, and when-stuck guidance — all as specified. The "Consult the full skill" paragraph is correctly embedded inside `{TDD_BLOCK}` so it's automatically conditional on TDD being enabled. The `## Required Skills` section in `execute-task-prompt.md:77-79` correctly references `systematic-debugging` only.
- Task 1: Report Format (`execute-task-prompt.md:93-100`) includes concise RED/GREEN evidence requirement and explicit out for non-code/docs changes.
- Task 2: The `(a)/(b)/(c)` prompt block is present (SKILL.md:416-419) and matches suite convention. The "Debugger-first flow" subsection (SKILL.md:427-445) covers all five required elements. Retry counting toward Step 12's 3-retry limit is explicit.
- Task 2: No new agent type introduced — the debugging pass uses the existing `coder` agent.
- Task 3: Step 5 cap at 8 (SKILL.md:154) with explicit anchor reference to `/Users/david/Code/pi-subagent/index.ts` and a drift-update note.
- Verified via grep: no `≤7`, `<=7`, `more than 7 tasks`, `(r) Retry`, `(s) Skip`, `(x) Stop`, or `re-dispatch this wave's tasks` remain.
- Step 12 pacing bullets still use `(a)/(b)/(c)` — untouched correctly.

---

### Issues

#### Important (Should Fix)

1. **`agent/skills/execute-plan/SKILL.md:439` — "amend or" conflicts with checkpoint guarantee and git safety protocol.**
   - The Debugger-first flow says: "amend or add a follow-up commit". Amending the wave commit silently rewrites history that was already committed as a checkpoint, contradicting the "(c) Stop execution — committed waves are preserved as checkpoints" promise (SKILL.md:423) and the repo-wide preference for new commits over amends.
   - **Fix:** Drop the "amend or" wording — always add a follow-up `fix(plan): wave <N> regression — <short summary>` commit.

2. **`agent/skills/execute-plan/SKILL.md:440` — targeted-remediation path missing explicit commit step.**
   - When `DONE_WITH_CONCERNS` diagnosis leads to a targeted remediation and tests pass, the text says "handle pass/fail the same way," but "the same way" now references the (now-fixed) DONE branch. The targeted-remediation path leaves uncommitted changes after a successful test re-run — there needs to be an explicit commit step.
   - **Fix:** Extract the commit step as a shared sub-step applied after either the in-dispatch fix or the targeted remediation succeeds.

#### Minor (Nice to Have)

3. **`agent/skills/execute-plan/SKILL.md:445` — fallback commit-undo command is unnecessarily verbose.**
   - `git reset --soft HEAD~1 && git reset HEAD` is equivalent to `git reset HEAD~1` (default `--mixed`). The two-step form is confusing; it doesn't clarify the intent.
   - **Fix:** Replace with `git reset HEAD~1` and add a clarifying parenthetical: "working-tree changes from the wave are preserved unstaged for the retry."

4. **`agent/skills/execute-plan/execute-task-prompt.md:79` — skill path is filesystem-absolute, not portable.**
   - The text says `at \`agent/skills/systematic-debugging/SKILL.md\`` — a repo-relative path that won't resolve inside a worktree with a different working directory. Other skill references use bare skill names (`test-driven-development` inside `{TDD_BLOCK}`).
   - **Fix:** Reference the skill by name only: "consult the `systematic-debugging` skill before proposing a fix."

---

### Recommendations

- Consider extracting the `fix(plan): wave <N> regression — <short summary>` commit message format into a short sub-heading within the Debugger-first flow, since it now applies to multiple branches.
- The pi-subagent anchor in Step 5 is a hard-coded absolute machine path. Consider "the `@mariozechner/pi-subagent` extension's `MAX_PARALLEL_TASKS` constant" as a more portable anchor, with the path as a parenthetical aid.

---

### Assessment

**Ready to merge: With fixes**

**Reasoning:** All plan acceptance criteria are met and the core hardening is sound, but the "amend or add a follow-up commit" instruction contradicts the documented checkpoint guarantee and repo git-safety norms, and the targeted-remediation branch is missing an explicit commit step. These are small text edits.

---

---

## Final Verification (Full Diff — crossProvider.capable)

**Base:** 387883a6cc956970ffc308c4117cd8e4e4839a82 (pre-implementation)
**Head:** d219bf54a9f0a18e8eb2e9ffd3bfa2d6b0807ea0 (post all remediations)

### Strengths

- All three wave changes landed cleanly in two files only, per the plan's "no code changes" scope.
- TDD block (`SKILL.md:268-328`) includes every required piece: Iron Law, mandatory Verify-RED/Verify-GREEN, rationalizations list, red flags, verification checklist, when-stuck guidance, and bug-fix note.
- `test-driven-development` reference correctly scoped inside `{TDD_BLOCK}` (SKILL.md:273), not in `execute-task-prompt.md`.
- `systematic-debugging` reference placed immediately before `{TDD_BLOCK}` in `execute-task-prompt.md:77-79`.
- Step 11 debugger-first flow (`SKILL.md:421-446`) is substantive: suspect-task identification via stack traces and wave-commit diff, single debugging dispatch, explicit Phase 1 gate, structured status contract, and targeted remediation as a second dispatch.
- Targeted-remediation success path has explicit follow-up commit (`SKILL.md:440`) — no amend wording.
- Fallback `git reset HEAD~1` with clarifying note about unstaged working tree (`SKILL.md:446`).
- Wave cap at `SKILL.md:154` cites `MAX_PARALLEL_TASKS` with exact file path, with instruction to re-sync.
- Step 12 pacing bullets still `(a)/(b)/(c)`; failed debugging pass explicitly feeds the 3-retry limit.

### Issues

#### Critical: None
#### Important: None
#### Minor (Nice to Have)

1. `SKILL.md:440` (and :438) — No explicit `git add -A` before the follow-up commit instruction. Could cause empty/partial commit if the coder's changes are unstaged.
2. `SKILL.md:446` — "preserved unstaged" phrasing could be clearer as "kept in the working tree (unstaged)".
3. `execute-task-prompt.md:77-79` — No comment explaining why `test-driven-development` is intentionally absent from `## Required Skills` (it's inside `{TDD_BLOCK}` to remain conditional).
4. Debugger-first flow Step 1 handles "ambiguous" suspect list but not "empty" suspect list — could default to same "include every wave task" fallback.

### Assessment

**Ready to merge: Yes**

**Reasoning:** All acceptance criteria satisfied. Forbidden strings absent, required structural elements present and correctly scoped. The debugger-first flow is well-structured with clear status contracts and sensible fallback.

---

## Remediation Log

**Iteration 1:**
- Batch 1 (all 4 findings): Fixed "amend or" removal, added explicit commit to targeted-remediation path, simplified fallback git command, removed filesystem path from skill reference.
- Commit: `d219bf54a9f0a18e8eb2e9ffd3bfa2d6b0807ea0`

**Iteration 2 (hybrid re-review):** Clean — all findings verified fixed, no regressions.

**Final Verification:** Clean — no Critical/Important issues. 4 minor notes (not blockers).

**Result:** Clean after 2 iterations.
