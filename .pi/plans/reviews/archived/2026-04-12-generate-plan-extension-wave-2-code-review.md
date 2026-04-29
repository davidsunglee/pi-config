### Strengths
- The wave is organized the right way: pure orchestration helpers live under `agent/lib/generate-plan/`, and the extension-side `PiGenerationIO` stays a thin adapter (`agent/lib/generate-plan/types.ts:1-84`, `agent/extensions/generate-plan/io-adapter.ts:1-60`). That matches the plan's intended layering and keeps the deterministic pieces independently testable.
- Prompt/template/path coverage is strong overall. `buildGenerationPrompt()` mirrors the current skill structure closely, `derivePlanPath()` / `deriveReviewPath()` are straightforward, and the review-template loader uses injected I/O rather than direct fs access (`agent/lib/generate-plan/prompt-builder.ts:3-28`, `agent/lib/generate-plan/path-utils.ts:6-56`, `agent/lib/generate-plan/review-template.ts:7-20`).
- The test suite is already broad for this stage: 84 focused tests passed in this worktree via `cd agent && node --experimental-strip-types --test lib/generate-plan/*.test.ts extensions/generate-plan/*.test.ts`. The happy paths and several edge cases are covered well.

### Issues

#### Critical (Must Fix)
- `parseReviewOutput()` only degrades gracefully when the **status** is missing; it does not degrade when the status is present but the **issue blocks are malformed**. In `agent/lib/generate-plan/review-parser.ts:22-45`, the fallback parse-error issue is created only when `parseStatus()` returns `null`. If `### Status` contains `**[Issues Found]**` but `### Issues` has no parsable headers, `parseIssues()` returns `[]` (`agent/lib/generate-plan/review-parser.ts:66-103`) and the function returns `{ status: "issues_found", issues: [] }`. I verified that with a runtime snippet: malformed review text produced exactly that result instead of a synthetic parse error. That breaks the plan contract in `.pi/plans/2026-04-12-generate-plan-extension.md:312-318,761`, and it is dangerous because `shouldRepair()` only looks for error-severity issues (`agent/lib/generate-plan/repair-loop.ts:44-58`), so a malformed reviewer response can be silently treated as non-blocking.

#### Important (Should Fix)
- `appendReviewNotes()` does not correctly render the **real multiline `fullText`** produced by the review parser. `formatItem()` simply inlines `issue.fullText` after the list prefix (`agent/lib/generate-plan/review-notes.ts:64-65`). But parsed findings preserve multi-line `What / Why it matters / Recommendation` blocks, so the resulting markdown becomes:
  `- **Task 2**: - **What:** ...`
  `- **Why it matters:** ...`
  `- **Recommendation:** ...`
  I verified that with a runtime snippet using a realistic multiline issue body. That does not match the canonical format required by `.pi/plans/2026-04-12-generate-plan-extension.md:346-364`, and it weakens the association between the task label and the rest of the note.
- The repair-loop counter semantics currently give an issue **three** failed targeted edits before `partial_regen`, not the intended two. New issues are initialized with `consecutiveEditFailures: 0` in `agent/lib/generate-plan/repair-loop.ts:130-135`, and escalation only occurs once the tracker reaches `>= 2` in `agent/lib/generate-plan/repair-loop.ts:70-93`. I verified the current behavior with a runtime snippet: strategy remained `targeted_edit` after failed edit #1 and failed edit #2, and switched to `partial_regen` only after failed edit #3. That conflicts with the repeated 2-attempt budget stated in `.pi/plans/2026-04-12-generate-plan-extension.md:29,391-405,413-415,545`.

#### Minor (Nice to Have)
- `fillReviewTemplate()` only flags leftover placeholders that match an all-caps pattern (`agent/lib/generate-plan/review-template.ts:44-57`). A typo such as `{Mixed_Case}` or `{plan_contents}` is left in the final prompt silently. I verified this with a runtime snippet: a template containing `{Mixed_Case}` returned successfully and preserved the placeholder. That falls short of the plan's "prevent silent template errors" goal in `.pi/plans/2026-04-12-generate-plan-extension.md:276-282,290`.

### Plan vs Implementation Assessment
- **Malformed review graceful degradation:** Implementation is at fault. The plan explicitly requires malformed review output to be converted into an error-severity parse issue (`.pi/plans/2026-04-12-generate-plan-extension.md:312-318,761`), and the current parser only does that for missing status, not malformed issue sections.
- **Review-notes canonical formatting:** Implementation is at fault. The plan requires review notes to preserve full reviewer text in a canonical `## Review Notes` section (`.pi/plans/2026-04-12-generate-plan-extension.md:37,346-364`), and the current formatting breaks for realistic multiline issue bodies.
- **Repair escalation after two failed edits:** Mixed. The plan is internally inconsistent: Task 8's detailed counter update says new issues start at `0` (`.pi/plans/2026-04-12-generate-plan-extension.md:405`), but the architecture summary, test intent, and acceptance criteria repeatedly say issues get a **2-edit** budget before escalation (`.pi/plans/2026-04-12-generate-plan-extension.md:29,391-398,413-415,545`). The implementation follows the `0` initialization literally, but the higher-level contract is clearer, so I would treat the current implementation as the thing to fix.
- **Placeholder detection breadth:** Implementation is at fault. The plan called for checking for remaining `{...}` placeholders generally, specifically to avoid silent template failures (`.pi/plans/2026-04-12-generate-plan-extension.md:276-282,290`). The current regex only partially enforces that.

### Recommendations
- Harden `parseReviewOutput()` so that any non-empty `### Issues` section that yields zero valid parsed issues becomes a synthetic parse-error issue, and add a regression test for the exact `**[Issues Found]**` + malformed-issue-body case.
- Change `appendReviewNotes()` to render multiline reviewer text as properly indented continuation lines or nested bullets, and add an end-to-end test that feeds `appendReviewNotes()` with `parseReviewOutput()` output from a realistic review.
- Rework the repair counter semantics so a newly observed unresolved issue consumes failure budget in a way that actually escalates after two failed targeted edits, then update the tests to reflect the corrected policy.
- Strengthen template placeholder validation using tokenization/sentinels (or a pre-parse of template-only placeholders) so mixed-case leftovers are caught without treating braces inside plan/spec content as false positives.

### Assessment
**Ready to merge?** No

**Reasoning:** The module boundaries and baseline tests are good, but the current review safety path still has a false-negative parser case, review-note rendering breaks realistic multiline findings, and the repair-loop budget does not currently match the intended two-attempt escalation behavior. Those are contract-level issues for the next wave, not polish items.