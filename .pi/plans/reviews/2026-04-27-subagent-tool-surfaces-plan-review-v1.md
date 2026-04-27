# Plan Review: 2026-04-27-subagent-tool-surfaces (iteration 2)

Reviewing edited plan at `.pi/plans/2026-04-27-subagent-tool-surfaces.md` against spec at `.pi/specs/2026-04-26-subagent-tool-surfaces.md`.

---

### Status

**[Approved]**

---

### Issues

**[Warning] — Tasks 2 and 3, Verify recipes: runtime path placeholders reduce specificity**

- **What:** Task 2's Verify recipes reference `<plan-file>` and `<review-file>` as unresolved placeholders in grep commands (`rg -l "BLOCKED|NEEDS_CONTEXT" <plan-file>`). These are values the executor has at runtime from earlier steps, not literal unknowns, but they reduce mechanical verifiability. Task 2's third criterion also describes what to observe in "the orchestrator's final output" without naming a persisted artifact the verifier can grep.
- **Why it matters:** A verifier agent running strictly won't know whether `<plan-file>` refers to a literal string or an instruction to substitute the actual runtime path. In practice, the coder doing the smoke test has the path from Step 1 and can substitute it, so this is unlikely to block execution.
- **Recommendation:** Annotate the placeholder inline: `rg -l "BLOCKED|NEEDS_CONTEXT" "$PLAN_FILE"` (path from Step 1). For the third criterion, name where to check: "inspect the orchestrator's final printed message for absence of `[Error]` or `dispatch failed`."

---

### Summary

Both blocking errors from the first review pass have been resolved: Task 3's cleanup now correctly runs `git reset HEAD~1 --soft` before removing the smoke-test file, and Task 4's cleanup uses `git reset HEAD~1 --soft` with a concrete guide for the non-clean case. The two warnings from v1 (filename inconsistency in Task 3's Files section, bad `find` pattern in Task 4 Verify) were also fixed. One Warning remains: Task 2 Verify recipes use runtime path placeholders. This does not block execution. The plan is ready for execution. 0 errors, 1 warning, 0 suggestions.
