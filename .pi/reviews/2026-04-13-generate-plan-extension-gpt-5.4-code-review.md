# Generate-Plan Extension Code Review

- **Date:** 2026-04-13
- **Reviewer:** `reviewer` subagent
- **Model:** `gpt-5.4`
- **Worktree:** `/Users/david/Code/pi-config-generate-plan-extension`
- **Branch:** `plan/generate-plan-extension`
- **Base SHA:** `bc5a742b855f6dfac07aeff37158004eac3eb177`
- **Head SHA:** `HEAD` (`ccf6a29036aa16b12189e20b22ac92f6300038fe`)
- **Reviewed against:**
  - `.pi/plans/2026-04-12-generate-plan-extension.md`
  - `.pi/todos/d68082f8.md`

## Summary

Assessment: **With fixes**

The implementation is well-structured and broadly matches the planned architecture, but there are a few production-relevant correctness gaps that should be fixed before merge.

## Strengths

- Strong architectural split: `agent/lib/generate-plan/` stays mostly pure and testable, while `agent/extensions/generate-plan/index.ts` is a relatively thin adapter. That matches the plan well.
- Good reuse of existing shared pieces instead of duplicating logic:
  - shared plan contract via `agent/lib/plan-contract/*`
  - model-tier loading via `agent/lib/execute-plan/settings-loader.ts`
- The review flow is well-factored:
  - template loading/filling
  - review output parsing
  - canonical review-note appending
  - dedicated `plan-reviewer` agent
- Test coverage is broad for the new core modules. In particular, `engine.test.ts` exercises many lifecycle paths, including validation gating, review fallback, and repair-loop behavior.
- The thin replacement `agent/skills/generate-plan/SKILL.md` is appropriately minimal and no longer tries to be the control-plane source of truth.

## Issues

### Critical (Must Fix)

- None found.

### Important (Should Fix)

1. **Path-like freeform input is rejected instead of falling back to freeform, and the resulting parse error escapes the handler.**
   - **References:**
     - `agent/extensions/generate-plan/index.ts:53-60`
     - `agent/extensions/generate-plan/index.ts:406-435`
     - `agent/extensions/generate-plan/index.test.ts:79-106`
   - **Why it matters:**
     - Task 12 says input should be treated as a file only if it exists; otherwise it should fall back to freeform.
     - Current behavior throws for any non-existent input containing `/`, starting with `.`, or ending in an extension.
     - That breaks legitimate freeform requests like `support iOS/macOS auth` or `use config.yaml semantics`.
     - Because `parseInput()` runs before the main `try/catch`, these failures can escape as raw errors instead of user-facing error handling.
   - **Fix:**
     - Only classify input as `{ type: "file" }` if the resolved path exists (and ideally is a regular file).
     - Otherwise fall back to `{ type: "freeform" }`.
     - Move `parseInput()` inside the existing `try/catch` in `handleGeneratePlan()` or wrap it separately.

2. **Case-insensitive TODO parsing is not normalized, so todo lookup can fail on case-sensitive filesystems.**
   - **References:**
     - `agent/extensions/generate-plan/index.ts:47-49`
     - `agent/extensions/generate-plan/index.ts:279-280`
     - `agent/extensions/generate-plan/index.test.ts:54-56`
   - **Why it matters:**
     - `parseInput()` accepts `todo-DEF456` and returns `todoId: "DEF456"`.
     - `createTodoReadFn()` then reads `.pi/todos/DEF456.md`.
     - Repo todo filenames are lowercase hex. This will fail on Linux / case-sensitive volumes, even though the parser advertises case-insensitive support.
     - macOS may mask the bug because the default filesystem is often case-insensitive.
   - **Fix:**
     - Normalize the captured todo ID to lowercase at the input boundary.
     - Also lowercase defensively in `createTodoReadFn()`.
     - Update tests to assert lowercase normalization rather than preserving mixed case.

3. **The repair loop gives newly introduced issues the wrong failure count, so they escalate to `partial_regen` too early.**
   - **References:**
     - `agent/lib/generate-plan/repair-loop.ts:121-135`
     - `agent/lib/generate-plan/repair-loop.ts:144-147`
     - `agent/lib/generate-plan/engine.ts:101-103`
     - `agent/lib/generate-plan/repair-loop.test.ts:170-172`
     - `agent/lib/generate-plan/repair-loop.test.ts:262-290`
   - **Why it matters:**
     - The spec says newly introduced issues get their own 2-edit budget.
     - `advanceCycle()` currently compares only against `state.issueTracker`, not against the previous cycle’s findings/errors.
     - Any unseen issue is initialized with `consecutiveEditFailures: 1`, which is correct for pre-existing issues that survived an edit, but incorrect for issues newly introduced by the last edit.
     - Result: genuinely new issues can hit `partial_regen` one cycle too early, undermining the targeted-edit-first convergence strategy.
   - **Fix:**
     - Distinguish:
       - issues already present before the last edit
       - issues newly introduced by the last edit
     - Use `state.findings` / `state.validationErrors` to determine whether a key existed in the previous cycle.
     - Persisting issues should increment or initialize at 1 after a failed edit.
     - Truly new issues should initialize at 0.
     - Update the tests that currently codify the premature escalation behavior.

### Minor (Nice to Have)

1. **`reviewPath` is dropped from the final result if a later repair cycle ends in validation failure, even when a review file was already written earlier.**
   - **References:**
     - `agent/lib/generate-plan/engine.ts:146`
     - `agent/lib/generate-plan/engine.ts:206`
     - `agent/lib/generate-plan/engine.ts:275`
   - **Why it matters:**
     - `runReview()` persists the review file.
     - But `GenerationResult.reviewPath` is set to `null` unless the final in-memory `reviewResult` is non-null.
     - If review ran earlier, then a later edit made the plan invalid, callers lose the path to the last useful review artifact.
   - **Fix:**
     - Track whether a review file has ever been written during the run.
     - Return that `reviewPath` whenever it exists, regardless of the final `reviewResult` variable state.

## Recommendations

- Add extension-level tests that cover the full input-resolution boundary, not just `parseInput()` in isolation:
  - slash/dotted freeform text
  - mixed-case TODO ids
  - real todo file lookup via `createTodoReadFn()`
- Add a repair-loop test that explicitly differentiates:
  - original issues surviving edits
  - new issues introduced by a later edit
- Add a failure-path test for missing agent config in `createDispatchFn()` so the extension fails fast instead of potentially dispatching without the intended agent prompt.
- Once the important issues are fixed, this is a good candidate for a quick integration pass because the architecture itself is solid.

## Assessment

- **Ready to merge?** With fixes
- **Reasoning:** The implementation is well-structured and largely matches the planned architecture, but there are a few production-relevant correctness gaps: input classification deviates from the spec, mixed-case TODO handling is not portable, and the repair-loop accounting does not honor the intended per-issue edit budget for newly introduced findings. Those should be fixed before merge.
