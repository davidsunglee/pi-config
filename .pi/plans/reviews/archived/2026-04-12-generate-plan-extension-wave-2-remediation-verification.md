### Verification Summary
- Overall status: Fully remediated
- Verified commands:
  - `git rev-parse --abbrev-ref HEAD && git rev-parse --short HEAD` -> `plan/generate-plan-extension`, `cbbec1b`
  - `cd agent && node --experimental-strip-types --test lib/generate-plan/review-parser.test.ts lib/generate-plan/review-notes.test.ts lib/generate-plan/repair-loop.test.ts lib/generate-plan/review-template.test.ts` -> 47 tests passed, 0 failed
  - `cd agent && node --experimental-strip-types --input-type=module <<'EOF' ... EOF` (targeted runtime verification of parser, notes rendering, repair-loop escalation, and placeholder detection) -> malformed review produced a synthetic error issue, multiline notes rendered with indented continuation lines, repair strategy escalated to `partial_regen` after the second failed edit, and both `{Mixed_Case}` / `{plan_contents}` threw unfilled-placeholder errors

### Per-Finding Verification
1. malformed review output no longer degrades to issues_found with zero issues
   - Status: Fixed
   - Evidence: `parseReviewOutput()` now synthesizes an error issue when status is `issues_found` but no issue headers were parsed, by inspecting the raw `### Issues` section and pushing a `Failed to parse review issues` error (`agent/lib/generate-plan/review-parser.ts:39-55`). Regression coverage was added for that exact case (`agent/lib/generate-plan/review-parser.test.ts:235-261`). In the runtime verification snippet, malformed review text returned `{ status: "issues_found", issueCount: 1 }` with `shortDescription: "Failed to parse review issues"`, not an empty issues array.

2. review notes render multiline fullText correctly
   - Status: Fixed
   - Evidence: `formatItem()` now splits `issue.fullText` by line, keeps the first line on the task bullet, and indents continuation lines by two spaces (`agent/lib/generate-plan/review-notes.ts:64-76`). Regression coverage asserts the exact multiline block shape (`agent/lib/generate-plan/review-notes.test.ts:207-244`). The runtime verification snippet rendered:
     - `- **Task 2**: - **What:** ...`
     - `  - **Why it matters:** ...`
     - `  - **Recommendation:** ...`
     which preserves the multiline reviewer text under the task label instead of flattening or mis-associating it.

3. repair-loop escalation now matches the intended 2-edit budget behavior
   - Status: Fixed
   - Evidence: `selectStrategy()` escalates once a tracked issue reaches `consecutiveEditFailures >= 2` (`agent/lib/generate-plan/repair-loop.ts:70-93`), and `advanceCycle()` now initializes newly observed issues at `consecutiveEditFailures: 1`, treating their first persistence as one already-failed targeted edit (`agent/lib/generate-plan/repair-loop.ts:121-145`). The end-to-end regression test explicitly verifies `targeted_edit -> targeted_edit -> partial_regen` for an issue that persists across two failed edit cycles (`agent/lib/generate-plan/repair-loop.test.ts:261-299`). The runtime verification snippet matched that behavior: after the first `advanceCycle()` the tracker was `1`, after the second it was `2`, and `selectStrategy()` then returned `partial_regen`.

4. mixed/lower-case leftover placeholders are now detected
   - Status: Fixed
   - Evidence: `fillReviewTemplate()` now replaces the known placeholders with sentinels first, then checks the template skeleton with `/\{[A-Za-z][A-Za-z_]{1,}\}/g`, which catches uppercase, mixed-case, and lower-case leftover placeholders (`agent/lib/generate-plan/review-template.ts:36-56`). Regression tests cover both `{Mixed_Case}` and `{plan_contents}` (`agent/lib/generate-plan/review-template.test.ts:143-179`). The runtime verification snippet threw `Unfilled placeholder(s) in review template: {Mixed_Case}` and `... {plan_contents}` respectively.

### Verdict
- Yes. On the current branch state (`plan/generate-plan-extension` at `cbbec1b`), all four findings from the 2026-04-12 wave-2 review were remediated in code and backed by focused passing tests plus direct runtime verification of the relevant paths.