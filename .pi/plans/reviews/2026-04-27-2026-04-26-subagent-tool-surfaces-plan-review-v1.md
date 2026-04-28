### Status

**[Issues Found]**

### Issues

**[Warning] — Task 2: `generate-plan` smoke acceptance under-verifies approval/commit**
- **What:** Task 2’s narrative says the smoke should “drive the plan to approval and commit,” and Step 3 says the final message should report `STATUS: approved` and `COMMIT: committed [<sha>]`. However, the acceptance criterion accepts `ORCH_STATUS=(approved|issues_remaining)` and does not verify any `COMMIT` field or that the smoke commit actually happened.
- **Why it matters:** A run that ends with `issues_remaining` or no committed plan/review pair could still pass the written acceptance checks, even though it would not prove the full `generate-plan` → `refine-plan` approval/commit path required by the task narrative and original spec intent.
- **Recommendation:** Tighten Task 2 evidence/acceptance to require the intended terminal condition, or explicitly justify why `issues_remaining` is acceptable for this smoke. If approval/commit is required, record and verify `ORCH_STATUS=approved` plus a committed SHA/commit subject or `COMMIT=committed`.

**[Warning] — Task 4: Review file discovery can select and delete a stale `.pi/reviews/*.md` file**
- **What:** Task 4 Step 6 locates the review file using `REVIEW_FILE=$(ls -t .pi/reviews/*.md 2>/dev/null | head -1)`. The repository already may contain unrelated review files under `.pi/reviews/`, and the smoke review path has no unique sentinel or pre-run baseline check. If `code-refiner` fails to write a new review file, the evidence can still record `REVIEW_FILE_EXISTS=yes` and `REVIEW_FILE_PATH_OK=yes` for a stale review. Cleanup then runs `rm -f "$REVIEW_FILE"`, potentially deleting an unrelated pre-existing review artifact.
- **Why it matters:** This can create a false-positive smoke result and can destructively remove unrelated review files during cleanup if the produced review is not deterministically identified.
- **Recommendation:** Make Task 4 identify the produced review deterministically: capture the code-refiner-reported review path from the transcript, use a unique smoke-specific filename/sentinel if the skill supports it, or snapshot the pre-existing `.pi/reviews/*.md` set before the run and select only a newly created file. Cleanup should only remove a confirmed smoke-produced review file.

### Summary

The plan covers the original spec’s required tool-surface matrix, preserves the no-body/no-other-frontmatter constraints, includes the three requested smoke runs, and correctly serializes the smoke tasks around the Task-1 commit/reset workflow. I found **0 errors, 2 warnings, and 0 suggestions**. The main structural concerns are under-verification of the `generate-plan` approval/commit outcome and non-deterministic `refine-code` review-file discovery/cleanup.
