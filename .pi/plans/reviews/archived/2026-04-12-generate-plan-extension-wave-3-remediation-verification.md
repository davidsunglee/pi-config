### Verification Summary
- Overall status: Fully remediated
- Verified commands:
  - `cd /Users/david/Code/pi-config-generate-plan-extension && git branch --show-current && git rev-parse HEAD && git status --short`
    - Observed branch `plan/generate-plan-extension`
    - Observed HEAD `2190fdf11e556ef41e70cbbdf71bf02a8fd202ea`
  - `cd /Users/david/Code/pi-config-generate-plan-extension/agent && node --experimental-strip-types --test lib/generate-plan/*.test.ts extensions/generate-plan/*.test.ts`
    - Passed: `120/120`

### Per-Finding Verification
1. validation-only `partial_regen` prompts no longer become self-contradictory / sectionless
   - Status: Fixed
   - Evidence: `buildEditPrompt()` now computes `affectedSections` for `partial_regen` via `getAffectedSections(findings, validationErrors)` and always emits a `## Sections to regenerate` list before instructing regeneration (`agent/lib/generate-plan/prompt-builder.ts:80-123`). `getAffectedSections()` now derives sections from validation errors when review findings are empty, and falls back to `All structurally invalid sections` if no specific section can be parsed (`agent/lib/generate-plan/prompt-builder.ts:129-185`). Regression tests explicitly cover both the validation-only case and the generic fallback case (`agent/lib/generate-plan/prompt-builder.test.ts:193-245`). The verified test run reported both `buildEditPrompt` cases passing within the overall `120/120` pass result.

2. stale review findings are no longer reused across cycles when no review was run after a plan became invalid
   - Status: Fixed
   - Evidence: After each repair edit, when validation still fails, the engine now clears `reviewResult` instead of retaining the previous cycle's review findings (`agent/lib/generate-plan/engine.ts:132-147`). Both subsequent consumers use `reviewResult?.issues ?? []` — for prompt construction (`agent/lib/generate-plan/engine.ts:112-118`) and for persistence tracking in `advanceCycle()` (`agent/lib/generate-plan/engine.ts:149-153`) — so stale review issues are no longer reused to drive prompts or escalation. A focused regression test verifies this exact scenario and asserts that the second repair prompt does not contain the stale `Missing test coverage` finding (`agent/lib/generate-plan/engine.test.ts:1083-1135`). The verified test run passed this test as part of the `120/120` passing suite.

3. `plan-reviewer.md` agent definition is now minimal and no longer conflicts with the template-owned output contract
   - Status: Fixed
   - Evidence: The agent definition is now reduced to frontmatter plus a single instruction to follow the task prompt exactly; it no longer embeds a second output-format contract (`agent/agents/plan-reviewer.md:1-7`). The review flow still loads the review template from the skills path and passes the filled template as the reviewer's task prompt (`agent/lib/generate-plan/review-template.ts:7-19`, `agent/lib/generate-plan/engine.ts:236-241`). Based on direct file inspection, the output contract is now owned by the template/task prompt rather than duplicated in the agent definition.

4. `fillReviewTemplate()` now detects broader leftover placeholder shapes, including hyphenated/digit placeholders
   - Status: Fixed
   - Evidence: Placeholder detection now uses `/\{[A-Za-z][A-Za-z0-9_-]{1,}\}/g`, which explicitly accepts letters followed by letters, digits, underscores, or hyphens (`agent/lib/generate-plan/review-template.ts:46-58`). The implementation comments also document that this is intended to catch shapes like `{VAR2}` and `{PLACEHOLDER-1}` (`agent/lib/generate-plan/review-template.ts:22-31`, `46-51`). Regression tests explicitly assert throws for both a hyphenated placeholder and a digit-suffixed placeholder (`agent/lib/generate-plan/review-template.test.ts:183-220`). The verified test run passed both cases within the overall `120/120` result.

### Residual Issues
- None found in the verified scope.

### Verdict
- Yes — the wave-3 review can be closed. All four prior findings are remediated on the current branch state, and the in-scope test suite passed (`120/120`) with targeted regression coverage for findings 1, 2, and 4. Finding 3 was verified by direct inspection of the now-minimal `agent/agents/plan-reviewer.md` plus the existing engine/template wiring.