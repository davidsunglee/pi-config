### Status

**[Approved]**

### Issues

**[Warning] — Task 3: Acceptance checks don’t verify all five preserved debugger-flow parameters**
- **What:** Task 3 Step 1 identifies five caller-specific differences that must survive unification: `scope`, `range`, `suspect_universe`, `success_condition`, and `commit_template_and_undo`. But the acceptance criteria only explicitly verify differences for scope, commit message template, and commit-undo availability. They do not verify that the shared table preserves the different `range`, `suspect_universe`, or `success_condition`.
- **Why it matters:** The main behavioral risk in this refactor is flattening Step 15 into Step 11 semantics. A worker could satisfy the current checks while still accidentally using a wave-scoped range, the wrong suspect-task universe, or the wrong final-gate success condition.
- **Recommendation:** Strengthen the existing Task 3 verification to also confirm distinct Step 11 vs Step 15 values for `range`, `suspect_universe`, and `success_condition` in the shared parameter table.

**[Warning] — Task 6: “Rendered lines” makes verification environment-dependent**
- **What:** Task 6’s acceptance criteria for Steps 10 and 11 require the first paragraph to be “at most three rendered lines,” and Step 15’s recital replacement is checked partly by paragraph/sentence compactness. “Rendered lines” depends on editor width and renderer behavior, not just source text.
- **Why it matters:** This makes pass/fail less objective and harder for an agent to re-check consistently. Two reviewers could reach different results from the same markdown.
- **Recommendation:** Replace “rendered lines” with source-stable checks: exact replacement paragraph text, max physical line count in source, and/or required/disallowed phrases.

**[Warning] — Task 7: The under-700 target is framed as acceptance despite being non-blocking**
- **What:** Task 7 includes “The plan strongly targets below 700 lines” as an acceptance criterion, but its `Verify:` text explicitly says not to fail if the file lands between 700 and 799.
- **Why it matters:** That makes the criterion non-binary and weakens the final completion signal for the task.
- **Recommendation:** Keep `< 800` as the hard acceptance criterion, and move `< 700` to a note, stretch goal, or reporting requirement rather than an acceptance criterion.

### Summary

This is a strong, execution-ready plan: it covers all six scoped shortening requirements from the spec, keeps file/path references consistent, sequences the risky edits sensibly, and is generally buildable for an agent to follow. I found **0 errors, 3 warnings, 0 suggestions**. The warnings are about verification precision rather than structural gaps, so the plan is **ready for execution**, but tightening those acceptance checks would make review and enforcement more reliable.
